/**
 * Synchronisation Grist ↔ Atlas v7 (tables source qgis2grist).
 */
import {
  fetchTableToRows,
  rowsToGeoJSON,
  flattenCoords2D,
  configLayerMeta,
  resolveSceneGeometryType,
} from './grist-rows.js?v=1.6.3';
import {
  layerPrefsPayload,
  applyLayerPrefsBinding,
} from './manifest-binding.js?v=1.6.3';
import { parseGristBool } from './grist-bool.js';
import { isModelLayer } from './model-layer.js?v=1.6.3';
import {
  manifestGeometryType,
  atlasGeomToBridge,
  primaryColorFromDeclarative,
  colorFnFromDeclarative,
  syncFeatureColorsFromSymbolization,
} from './declarative-style.js?v=1.6.3';

export const ATLAS_PREFS_TABLE = 'Atlas_LayerPrefs';

const ATLAS_PREFS_SCHEMA = [
  { id: 'source_table', fields: { label: 'Table source', type: 'Text' } },
  { id: 'StyleJSON', fields: { label: 'Style Atlas (JSON)', type: 'Text' } },
  { id: 'Visible', fields: { label: 'Visible', type: 'Bool' } },
  { id: 'UpdatedAt', fields: { label: 'Mis à jour', type: 'DateTime' } },
];

const SKIP_PROPS = new Set([
  '_row_id', '_fill_color', '_visible', '_fill_opacity', '_line_opacity', '_idx',
  '_scale', '_rotationX', '_rotationY', '_rotationZ', '_offsetX', '_offsetY', '_offsetZ', '_modelId',
]);

const ATLAS_3D_COL = 'atlas_3d_json';

/** Couche fond carto (buildings, lines…) — masquée par défaut. */
export function isBasemapLayer(ml, featureCount) {
  const profile = ml?.profile || 'A';
  if (profile === 'B' || profile === 'C') return true;
  const name = String(ml?.name || ml?.id || '').toLowerCase();
  if (/^(buildings|landscape|lines|batiments|bati|osm_|fond_)/.test(name)) return true;
  if (/building|landscape|landcover/.test(name) && featureCount > 200) return true;
  if (featureCount > 2500) return true;
  return false;
}

export function defaultLayerVisible(ml, featureCount) {
  if (ml?.visibility?.defaultVisible === true) return true;
  if (ml?.visibility?.defaultVisible === false) return false;
  return !isBasemapLayer(ml, featureCount);
}

export { parseGristBool } from './grist-bool.js';

export async function ensureAtlasPrefsTable(docApi, opts = {}) {
  if (opts.viewMode) return;
  const tables = await docApi.listTables();
  if (tables.includes(ATLAS_PREFS_TABLE)) return;
  await docApi.applyUserActions([['AddTable', ATLAS_PREFS_TABLE, ATLAS_PREFS_SCHEMA]]);
}

/** Map source_table → { style, visible, prefRowId } */
export async function loadLayerPrefs(docApi) {
  const out = new Map();
  try {
    const tables = await docApi.listTables();
    if (!tables.includes(ATLAS_PREFS_TABLE)) return out;
    const rec = await docApi.fetchTable(ATLAS_PREFS_TABLE);
    const ids = rec.id || [];
    for (let i = 0; i < ids.length; i++) {
      const key = rec.source_table?.[i];
      if (!key) continue;
      let style = null;
      try { style = JSON.parse(rec.StyleJSON?.[i] || 'null'); } catch (_) { style = null; }
      out.set(key, {
        prefRowId: ids[i],
        style,
        visible: parseGristBool(rec.Visible?.[i], true),
      });
    }
  } catch (e) {
    console.warn('[Atlas sync] loadLayerPrefs', e.message);
  }
  return out;
}

export function applyLayerPrefs(layer, prefsMap) {
  const p = prefsMap?.get(layer.sourceTable);
  if (!p) return;
  applyLayerPrefsBinding(layer, p);
}

export async function saveLayerPref(docApi, layer, opts = {}) {
  if (opts.viewMode) return;
  if (layer.source !== 'qgis2grist' || !layer.sourceTable) return;
  await ensureAtlasPrefsTable(docApi, opts);
  const data = {
    source_table: layer.sourceTable,
    StyleJSON: JSON.stringify(layerPrefsPayload(layer)),
    Visible: layer.visible !== false,
    UpdatedAt: Math.floor(Date.now() / 1000),
  };
  if (layer._prefRowId) {
    await docApi.applyUserActions([['UpdateRecord', ATLAS_PREFS_TABLE, layer._prefRowId, data]]);
  } else {
    const r = await docApi.applyUserActions([['AddRecord', ATLAS_PREFS_TABLE, null, data]]);
    layer._prefRowId = r.retValues?.[0];
  }
}

/** Préserve overrides 3D / édition locale lors d'un refresh. */
export function mergeFeatureOverrides(oldGeojson, newGeojson) {
  const byRow = new Map();
  for (const f of (oldGeojson?.features || [])) {
    const id = f.properties?._row_id;
    if (id != null) byRow.set(id, f.properties);
  }
  for (const f of (newGeojson?.features || [])) {
    const id = f.properties?._row_id;
    const old = id != null ? byRow.get(id) : null;
    if (!old) continue;
    for (const k of Object.keys(old)) {
      if (k.startsWith('_') && k !== '_row_id' && k !== '_fill_color') {
        f.properties[k] = old[k];
      }
    }
    for (const [k, v] of Object.entries(old)) {
      if (!SKIP_PROPS.has(k) && !k.startsWith('_') && f.properties[k] === undefined) {
        f.properties[k] = v;
      }
    }
  }
  return newGeojson;
}

function geometryKindFromType(geomType) {
  if (!geomType) return null;
  if (geomType === 'Point' || geomType === 'MultiPoint') return 'Point';
  if (geomType === 'LineString' || geomType === 'MultiLineString') return 'LineString';
  return 'Polygon';
}

function declaredLayerGeometryKind(layer) {
  return geometryKindFromType(layer.geometryType) || 'Polygon';
}

export function featureToRowUpdate(feature, layer) {
  const props = feature?.properties || {};
  const rowId = props._row_id;
  if (!rowId) return null;

  const update = {};
  const gristCols = layer._gristColumns || [];
  const colSet = new Set(gristCols);

  const fieldNames = (layer._fields || []).map((f) => f.name).filter(Boolean);
  const editable = fieldNames.length
    ? fieldNames.filter((n) => !SKIP_PROPS.has(n) && !['geometry_json', 'latitude', 'longitude'].includes(n))
    : Object.keys(props).filter((k) => !k.startsWith('_') && !SKIP_PROPS.has(k));

  for (const name of editable) {
    if (props[name] === undefined) continue;
    if (gristCols.length && !colSet.has(name)) continue;
    update[name] = props[name];
  }

  const geom = feature.geometry;
  const featKind = geometryKindFromType(geom?.type);
  const layerKind = declaredLayerGeometryKind(layer);

  // Garde-fou : ne jamais écraser geometry_json d'une couche polygone/ligne
  // avec un Point issu d'une mauvaise lecture (cfg QgisWidgets Point + lat/lon).
  if (featKind && layerKind !== 'Point' && featKind === 'Point') {
    /* attributs seulement */
  } else if (featKind === 'Point') {
    if (!gristCols.length || colSet.has('longitude')) update.longitude = geom.coordinates[0];
    if (!gristCols.length || colSet.has('latitude')) update.latitude = geom.coordinates[1];
  } else if (geom && layerKind !== 'Point') {
    if (!gristCols.length || colSet.has('geometry_json')) {
      update.geometry_json = JSON.stringify(flattenCoords2D(geom));
    }
  }

  if (props._fill_color && (!gristCols.length || colSet.has('fill_color'))) {
    update.fill_color = props._fill_color;
  }

  // Placement 3D : n'a de sens que pour une couche rendue en modèles. Sans cette
  // garde, des surcharges héritées — ou une couche ayant changé de mode —
  // écriraient des transformations 3D sur des objets qui ne seront jamais rendus
  // ainsi, salissant la table de l'utilisateur.
  if (isModelLayer(layer)) {
    const atlas3d = {};
    for (const k of ['scale', 'rotationX', 'rotationY', 'rotationZ', 'offsetX', 'offsetY', 'offsetZ', 'modelId']) {
      const v = props['_' + k];
      if (v != null && v !== '') atlas3d[k] = v;
    }
    if (Object.keys(atlas3d).length && (!gristCols.length || colSet.has(ATLAS_3D_COL))) {
      update[ATLAS_3D_COL] = JSON.stringify(atlas3d);
    }
  }

  if (!Object.keys(update).length) return null;
  return { rowId, update };
}

export async function saveFeatureToSource(docApi, layer, featureIndex) {
  const f = layer.geojson?.features?.[featureIndex];
  const payload = featureToRowUpdate(f, layer);
  if (!payload) return false;
  await docApi.applyUserActions([
    ['UpdateRecord', layer.sourceTable, payload.rowId, payload.update],
  ]);
  return true;
}

export async function saveFeaturesToSource(docApi, layer, featureIndices) {
  let n = 0;
  for (const idx of featureIndices) {
    if (await saveFeatureToSource(docApi, layer, idx)) n++;
  }
  return n;
}

/** Recharge une couche depuis sa table Grist source. */
export async function refreshLayerFromTable(docApi, layer, widgetConfig, manifestLayer) {
  if (!layer.sourceTable) return false;
  const tableName = layer.sourceTable;
  const colData = await docApi.fetchTable(tableName);
  layer._gristColumns = Object.keys(colData).filter((k) => k !== 'id');

  const cfgLayer = configLayerMeta(widgetConfig, tableName);
  const ml = manifestLayer || { geometry_type: layer.geometryType, style: { declarative: layer._declarative } };
  let geometryType = manifestGeometryType(ml.geometry_type || cfgLayer?.geomType);
  const declarative = layer._declarative || ml.style?.declarative || cfgLayer?.style?.declarative;
  const fallbackColor = layer.color || primaryColorFromDeclarative(declarative, '#808080');

  const layerMeta = {
    geomType: atlasGeomToBridge(geometryType),
    fields: layer._fields || cfgLayer?.fields || [],
    _color: fallbackColor,
    color: fallbackColor,
  };

  const rows = fetchTableToRows(colData);
  const colorFn = colorFnFromDeclarative(declarative, fallbackColor, layer._fields || cfgLayer?.fields || []);
  const newGeojson = rowsToGeoJSON(rows, layerMeta, colorFn);

  applyAtlas3dFromRows(rows, newGeojson);
  geometryType = resolveSceneGeometryType(
    ml.geometry_type,
    cfgLayer?.geomType,
    newGeojson,
    geometryType
  );
  layer.geometryType = geometryType;
  layer.geojson = mergeFeatureOverrides(layer.geojson, newGeojson);
  syncFeatureColorsFromSymbolization(layer);
  return true;
}

export function applyAtlas3dFromRows(rows, geojson) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const f of (geojson?.features || [])) {
    const row = byId.get(f.properties?._row_id);
    if (!row?.[ATLAS_3D_COL]) continue;
    try {
      const o = JSON.parse(row[ATLAS_3D_COL]);
      for (const [k, v] of Object.entries(o)) f.properties['_' + k] = v;
    } catch (_) { /* ignore */ }
  }
}

/**
 * Couches qu'il vaut la peine de rafraîchir périodiquement.
 *
 * Un cycle recharge la table entière, la reconvertit en GeoJSON et repeint la
 * couche. Le faire pour une couche qu'on ne voit pas coûte le volume complet
 * sans rien apporter : sur une scène d'analyse, les couches lourdes sont
 * justement celles qui sont masquées par défaut.
 */
export function layersToRefresh(layers) {
  return (layers || []).filter((l) => l?.source === 'qgis2grist'
    // Différée : pas encore convertie en GeoJSON. Elle sera chargée à jour au
    // moment où on l'allumera (materializeDeferredLayer).
    && !l._deferredLoad
    // Masquée : rien n'est peint, et l'affichage déclenche déjà un rafraîchissement.
    && l.visible !== false);
}

export function startScenePolling(opts) {
  const {
    docApi,
    getLayers,
    getWidgetConfig,
    getManifest,
    onLayerUpdated,
    intervalMs = 30000,
    isPaused = () => false,
  } = opts;

  return setInterval(async () => {
    if (isPaused()) return;
    const layers = layersToRefresh(getLayers());
    if (!layers.length) return;
    const widgetConfig = getWidgetConfig();
    const manifest = getManifest();
    const manifestByTable = new Map((manifest?.layers || []).map((ml) => [ml.source?.table || ml.id, ml]));

    for (const layer of layers) {
      try {
        const ml = manifestByTable.get(layer.sourceTable);
        await refreshLayerFromTable(docApi, layer, widgetConfig, ml);
        onLayerUpdated(layer);
      } catch (e) {
        console.warn('[Atlas sync] refresh', layer.sourceTable, e.message);
      }
    }
  }, intervalMs);
}
