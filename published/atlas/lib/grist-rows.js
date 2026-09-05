/**
 * Reconstruction GeoJSON depuis tables Grist (contrat qgis2grist / Scene Manifest).
 */
import { manifestGeometryType } from './declarative-style.js?v=1.6.4';

/** Colonne Grist → lignes objet. */
export function fetchTableToRows(colData) {
  if (!colData?.id?.length) return [];
  const n = colData.id.length;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const row = {};
    for (const k of Object.keys(colData)) row[k] = colData[k][i];
    rows.push(row);
  }
  return rows;
}

function parseCoord(row, keys) {
  for (let i = 0; i < keys.length; i++) {
    const v = parseFloat(row[keys[i]]);
    if (Number.isFinite(v)) return v;
  }
  return NaN;
}

const LAT_KEYS = ['latitude', 'Latitude', 'lat', 'centroid_lat'];
const LON_KEYS = ['longitude', 'Longitude', 'lon', 'lng', 'centroid_lon'];

/** (0, 0) = « null island » : sentinelle de coordonnée absente, pas un point réel. */
function isUsableLonLat(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0);
}

/**
 * Repli pour les imports antérieurs à `source.geometry_fields` : quand la
 * source portait déjà un champ `latitude`, Grist a suffixé celui de
 * qgis2grist (`latitude2`). On cherche les variantes numérotées.
 */
function suffixedCoords(row) {
  const suffixed = (bases) => Object.keys(row)
    .filter((k) => bases.some((b) => new RegExp(`^${b}\\d+$`, 'i').test(k)))
    .sort();
  const lat = parseCoord(row, suffixed(['latitude', 'lat', 'centroid_lat']));
  const lon = parseCoord(row, suffixed(['longitude', 'lon', 'centroid_lon']));
  return isUsableLonLat(lat, lon) ? { lat, lon } : null;
}

/** MapLibre GeoJSON : conserver lon/lat uniquement (QGIS exporte souvent Z/M). */
export function flattenCoords2D(geom) {
  if (!geom?.coordinates) return geom;
  function walk(c) {
    if (typeof c[0] === 'number') return [c[0], c[1]];
    return c.map(walk);
  }
  return { type: geom.type, coordinates: walk(geom.coordinates) };
}

/**
 * Convertit une ligne Grist en Feature GeoJSON WGS84.
 * @param {object} row
 * @param {{ geomType?: string, fields?: object[] }} layerMeta
 */
export function rowToFeature(row, layerMeta, fillColor, visible) {
  const geomType = layerMeta?.geomType || 'Polygon';
  // Colonnes géométriques déclarées par le manifest (source.geometry_fields) —
  // sinon convention qgis2grist.
  const geomCols = layerMeta?.geometryFields || null;
  const geojsonKey = geomCols?.geojson || 'geometry_json';
  let geometry = null;

  // geometry_json prioritaire — polygones/lignes QGIS (même si cfg widget dit Point)
  if (row[geojsonKey]) {
    try {
      geometry = typeof row[geojsonKey] === 'string'
        ? JSON.parse(row[geojsonKey])
        : row[geojsonKey];
    } catch (_) {
      geometry = null;
    }
  }

  if (!geometry && geomType === 'Point') {
    let lat;
    let lon;
    if (geomCols?.lat && geomCols?.lon) {
      lat = parseCoord(row, [geomCols.lat]);
      lon = parseCoord(row, [geomCols.lon]);
    } else {
      lat = parseCoord(row, LAT_KEYS);
      lon = parseCoord(row, LON_KEYS);
      if (!isUsableLonLat(lat, lon)) {
        const alt = suffixedCoords(row);
        if (alt) ({ lat, lon } = alt);
      }
    }
    if (!isUsableLonLat(lat, lon)) return null;
    geometry = { type: 'Point', coordinates: [lon, lat] };
  }

  if (!geometry) return null;
  geometry = flattenCoords2D(geometry);

  const props = {
    _row_id: row.id,
    _fill_color: fillColor || '#808080',
    _visible: visible === false ? 0 : 1,
  };
  // Opacité par entité : valeur portée par la ligne, sinon celle du style
  // déclaratif. Laissée absente si rien ne la définit, pour que le rendu
  // retombe sur l'opacité de couche plutôt que sur une constante figée.
  const declaredOpacity = row._fill_opacity != null
    ? row._fill_opacity
    : (typeof layerMeta?.opacityFn === 'function' ? layerMeta.opacityFn(row) : null);
  if (Number.isFinite(declaredOpacity)) props._fill_opacity = declaredOpacity;
  if (row._line_opacity != null) props._line_opacity = row._line_opacity;
  const skip = new Set(['geometry_json', 'centroid_lat', 'centroid_lon', 'latitude', 'longitude', 'id']);
  // Colonnes géométriques suffixées (latitude2…) : données techniques, pas des attributs.
  for (const k of Object.values(geomCols || {})) skip.add(k);

  /** Lit une valeur ligne Grist en essayant name / _rawKey / label (casse insensible). */
  function rowValueForField(rowObj, fieldMeta) {
    const candidates = [fieldMeta.name, fieldMeta._rawKey, fieldMeta.rawKey, fieldMeta.label]
      .filter(Boolean);
    for (const k of candidates) {
      const v = rowObj[k];
      if (v != null && v !== '') return v;
    }
    const rowKeys = Object.keys(rowObj);
    for (const c of candidates) {
      const hit = rowKeys.find((k) => k.toLowerCase() === String(c).toLowerCase());
      if (hit != null) {
        const v = rowObj[hit];
        if (v != null && v !== '') return v;
      }
    }
    return undefined;
  }

  for (const f of (layerMeta?.fields || [])) {
    if (skip.has(f.name)) continue;
    const v = rowValueForField(row, f);
    if (v != null && v !== '') props[f.name] = v;
  }
  for (const k of Object.keys(row)) {
    if (skip.has(k) || k.startsWith('_') || props[k] !== undefined) continue;
    const v = row[k];
    if (v != null && v !== '') props[k] = v;
  }
  return { type: 'Feature', geometry, properties: props };
}

export function rowsToGeoJSON(rows, layerMeta, colorFn) {
  const fallback = layerMeta?._color || layerMeta?.color || '#808080';
  const features = [];
  for (const row of rows) {
    const color = colorFn ? colorFn(row) : (row.fill_color || fallback);
    const visible = row._map_visible !== false;
    const f = rowToFeature(row, layerMeta, color, visible);
    if (f) features.push(f);
  }
  return { type: 'FeatureCollection', features };
}

/**
 * Type couche Atlas : geometry_type manifest (ou cfg widget) prioritaire sur vote GeoJSON.
 * Évite de figer Point quand des géométries corrompues coexistent avec un manifest polygon.
 */
export function resolveSceneGeometryType(manifestGeom, cfgGeom, geojson, fallback = 'Polygon') {
  const declared = manifestGeom || cfgGeom;
  if (declared) return manifestGeometryType(declared);
  const base = manifestGeometryType(cfgGeom) || fallback;
  return inferGeometryTypeFromGeoJSON(geojson, base);
}

/** Infère le type géométrique MapLibre depuis le GeoJSON réel (vote majoritaire). */
export function inferGeometryTypeFromGeoJSON(geojson, fallback = 'Polygon') {
  const counts = { Point: 0, LineString: 0, Polygon: 0 };
  for (const f of (geojson?.features || [])) {
    const t = f.geometry?.type;
    if (!t) continue;
    if (t === 'Point' || t === 'MultiPoint') counts.Point++;
    else if (t === 'LineString' || t === 'MultiLineString') counts.LineString++;
    else counts.Polygon++;
  }
  const total = counts.Point + counts.LineString + counts.Polygon;
  if (!total) return fallback;
  if (counts.Polygon >= counts.LineString && counts.Polygon >= counts.Point) return 'Polygon';
  if (counts.LineString >= counts.Point) return 'LineString';
  return 'Point';
}

/** Métadonnées couche depuis config QgisWidgets. */
export function configLayerMeta(config, tableName) {
  const layers = config?.layers || [];
  return layers.find((l) => l.tableName === tableName) || null;
}

/** Bounds [[west,south],[east,north]] depuis FeatureCollection. */
export function boundsFromGeoJSON(geojson) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  function walkCoords(c) {
    if (typeof c[0] === 'number') {
      minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]);
      minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]);
      return;
    }
    for (const p of c) walkCoords(p);
  }
  for (const f of (geojson?.features || [])) {
    if (f.geometry?.coordinates) walkCoords(f.geometry.coordinates);
  }
  if (!Number.isFinite(minX)) return null;
  return [[minX, minY], [maxX, maxY]];
}
