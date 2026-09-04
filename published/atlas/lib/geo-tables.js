/**
 * Détection et lecture de tables géo Grist (scan document).
 */
import { normalizePropertyValue } from './declarative-style.js?v=1.6.1';

export const GEO_SKIP_TABLES = new Set([
  'Maquette_Layers',
  'SceneManifest',
  'QgisWidgets',
  'Atlas_LayerPrefs',
  'Atlas_ScenePrefs',
  'Atlas_Story',
]);

const GEOM_COL_ALIASES = ['geometry_json', 'geometry', 'geom', 'wkt'];
const LATLNG_ALIASES = { lat: ['latitude', 'lat', 'y'], lng: ['longitude', 'lng', 'lon', 'x'] };

/** Repère colonne géométrie : nom de colonne GeoJSON ou { lat, lng }. */
export function detectGeometryColumn(columnar) {
  const keys = Object.keys(columnar || {});
  const find = (n) => keys.find((k) => k.toLowerCase() === n);
  for (const alias of GEOM_COL_ALIASES) {
    const k = find(alias);
    if (k) return k;
  }
  const latK = LATLNG_ALIASES.lat.map(find).find(Boolean);
  const lngK = LATLNG_ALIASES.lng.map(find).find(Boolean);
  if (latK && lngK) return { lat: latK, lng: lngK };
  return null;
}

export function parseGeometryValue(columnar, geomCol, i) {
  if (geomCol && geomCol.lat) {
    const la = +columnar[geomCol.lat][i];
    const lo = +columnar[geomCol.lng][i];
    return (Number.isFinite(la) && Number.isFinite(lo))
      ? { type: 'Point', coordinates: [lo, la] }
      : null;
  }
  const v = columnar[geomCol][i];
  if (v == null || v === '') return null;
  if (typeof v === 'object') return v.type ? v : null;
  const s = String(v).trim();
  if (s[0] === '{') {
    try {
      const g = JSON.parse(s);
      return g.type === 'Feature' ? g.geometry : g;
    } catch (_) {
      return null;
    }
  }
  return null;
}

/** Table colonnaire Grist → FeatureCollection (_row_id = id Grist). */
export function tableToGeoJSON(columnar, geomCol) {
  const ids = columnar.id || [];
  const isLatLng = !!(geomCol && geomCol.lat);
  const skip = new Set([
    'id', 'manualSort',
    isLatLng ? geomCol.lat : geomCol,
    isLatLng ? geomCol.lng : null,
  ].filter(Boolean));
  const propKeys = Object.keys(columnar).filter((k) => !skip.has(k));
  const features = [];
  for (let i = 0; i < ids.length; i++) {
    const geometry = parseGeometryValue(columnar, geomCol, i);
    if (!geometry) continue;
    const properties = { _row_id: ids[i] };
    for (const k of propKeys) {
      const raw = columnar[k][i];
      properties[k] = (raw != null && typeof raw === 'object')
        ? normalizePropertyValue(raw)
        : raw;
    }
    if (properties.fill_color) properties._fill_color = properties.fill_color;
    features.push({ type: 'Feature', id: ids[i], geometry, properties });
  }
  return { type: 'FeatureCollection', features };
}

/**
 * Scanne le document : tables portant une colonne géométrie.
 *
 * La détection se fait sur les **métadonnées de colonnes**, jamais sur les
 * données. Télécharger chaque table pour y chercher un nom de colonne revenait
 * à rapatrier le document entier à chaque ouverture — mesuré à une centaine de
 * mégaoctets sur une scène de production, dont 68 Mo pour une seule table
 * déclarée masquée. Ici, deux lectures de tables système suffisent, quel que
 * soit le volume du document.
 *
 * En contrepartie, le nombre d'entités et le type de géométrie ne sont pas
 * connus : ils demandent les données. L'appelant les affiche donc comme
 * inconnus, et `linkTableFromGrist` charge la table au moment où l'utilisateur
 * la choisit — c'est le seul instant où elle est réellement nécessaire.
 */
export async function scanGeoTables(docApi, skipTables = GEO_SKIP_TABLES) {
  const out = [];
  if (!docApi) return out;
  let tables;
  let cols;
  try {
    [tables, cols] = await Promise.all([
      docApi.fetchTable('_grist_Tables'),
      docApi.fetchTable('_grist_Tables_column'),
    ]);
  } catch (_) {
    return out;
  }

  const nomParRef = {};
  (tables?.id || []).forEach((rowId, i) => { nomParRef[rowId] = tables.tableId[i]; });

  const colonnesParTable = {};
  (cols?.id || []).forEach((_, i) => {
    const table = nomParRef[cols.parentId[i]];
    const col = cols.colId[i];
    if (!table || !col) return;
    (colonnesParTable[table] = colonnesParTable[table] || {})[col] = true;
  });

  for (const [table, colonnes] of Object.entries(colonnesParTable)) {
    // Les tables système ne sont pas des couches candidates.
    if (skipTables.has(table) || table.startsWith('_grist_') || table.startsWith('GristHidden_')) continue;
    const gc = detectGeometryColumn(colonnes);
    if (!gc) continue;
    out.push({ table, geometryColumn: gc, geomType: null, count: null });
  }
  return out;
}

export function isLinkedTableLayer(layer) {
  return !!(layer?.sourceTable && (layer.kind === 'table' || layer.source === 'qgis2grist'));
}
