/**
 * Détection et lecture de tables géo Grist (scan document).
 */
import { normalizePropertyValue } from './declarative-style.js?v=1.12.2';
import { COLONNES_INTERNES_GRIST } from './grist-rows.js?v=1.12.2';
import { chargerSchema, estTableSysteme } from './schema-grist.js?v=1.12.2';
import { lireCoordonnee, coordonneesUtilisables } from './geometrie-saisie.js?v=1.12.2';
import { lireWkt, estWkt } from './wkt.js';
import { TABLES_ATLAS, estTableAtlas } from './atlas-tables.js?v=1.12.2';

/** Les tables d'Atlas ne sont jamais des couches (liste : `lib/atlas-tables.js`). */
export const GEO_SKIP_TABLES = new Set(TABLES_ATLAS);

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
    // `+null` et `+''` valent 0 : une ligne sans coordonnées devenait un point
    // en (0, 0). Même règle que les couches de manifeste : (0, 0) = absent.
    const la = lireCoordonnee(columnar[geomCol.lat]?.[i]);
    const lo = lireCoordonnee(columnar[geomCol.lng]?.[i]);
    return coordonneesUtilisables(lo, la)
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
  // Une colonne WKT était repérée (alias `wkt`) puis ignorée cellule par
  // cellule : la table apparaissait, sans un objet. Voir `lib/wkt.js`.
  return lireWkt(s);
}

/**
 * La forme dans laquelle une colonne porte ses géométries : `'wkt'`,
 * `'geojson'`, ou `null` (couple lat/lon, ou colonne vide). Lue sur la
 * première cellule renseignée : c'est elle qui dit comment réécrire, pour
 * qu'une table WKT reste en WKT.
 */
export function formatGeometrie(columnar, geomCol) {
  if (!geomCol || typeof geomCol !== 'string') return null;
  for (const v of columnar?.[geomCol] || []) {
    if (v == null || v === '') continue;
    if (typeof v === 'object') return 'geojson';
    const s = String(v).trim();
    if (s[0] === '{') return 'geojson';
    if (estWkt(s)) return 'wkt';
    return null;
  }
  return null;
}

/** Table colonnaire Grist → FeatureCollection (_row_id = id Grist). */
export function tableToGeoJSON(columnar, geomCol) {
  const ids = columnar.id || [];
  const isLatLng = !!(geomCol && geomCol.lat);
  const skip = new Set([
    ...COLONNES_INTERNES_GRIST,
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
      // Une liste Grist (ChoiceList, RefList) arrive codée `['L', a, b]`.
      // `normalizePropertyValue` n'en gardait que le premier élément — le
      // marqueur « L » —, si bien que chaque objet affichait « L », qu'un filtre
      // n'y trouvait rien et que la fiche ne cochait aucun choix. La liste est
      // gardée telle quelle sous `_l_<champ>` (lue par les filtres, la fiche et
      // l'écriture), et lisible « a, b » sous le nom du champ.
      if (Array.isArray(raw) && raw[0] === 'L') {
        const liste = raw.slice(1);
        properties[`_l_${k}`] = liste;
        properties[k] = liste.map((x) => normalizePropertyValue(x)).filter((x) => x !== '').join(', ');
      } else {
        properties[k] = (raw != null && typeof raw === 'object')
          ? normalizePropertyValue(raw)
          : raw;
      }
    }
    if (properties.fill_color) properties._fill_color = properties.fill_color;
    // Le placement et les réglages de l'objet (colonne technique d'Atlas) : `{ scale, modelId, params… }`
    // devient `_scale`, `_modelId`, `_params`. Seules les couches de manifeste les relisaient — pour une
    // table détectée dans le document, ils étaient écrits puis jamais revus.
    const atlas3d = columnar.atlas_3d_json && columnar.atlas_3d_json[i];
    if (typeof atlas3d === 'string' && atlas3d.trim()) {
      try {
        const o = JSON.parse(atlas3d);
        if (o && typeof o === 'object' && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) properties['_' + k] = v;
      } catch (_) { /* une cellule abîmée ne casse pas la couche */ }
    }
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
  if (!docApi) return [];
  return geoTablesDepuisSchema(await chargerSchema(docApi), skipTables);
}

/**
 * Les couches candidates d'un schéma déjà lu.
 *
 * Séparée de `scanGeoTables` pour une raison de coût : l'appelant qui a déjà le
 * schéma — parce qu'il cherche aussi les tables qui référencent une couche —
 * ne doit pas redemander les mêmes métadonnées. Deux lectures par ouverture,
 * pas quatre.
 */
export function geoTablesDepuisSchema(schema, skipTables = GEO_SKIP_TABLES) {
  const out = [];
  for (const [table, colonnes] of Object.entries(schema || {})) {
    if (skipTables.has(table) || estTableAtlas(table) || estTableSysteme(table)) continue;
    // `detectGeometryColumn` raisonne sur des noms de colonnes : le schéma en
    // porte davantage, on ne lui donne que ce qu'il lit.
    const noms = {};
    for (const c of colonnes) noms[c.colId] = true;
    let gc = detectGeometryColumn(noms);
    // Un point : le couple qu'on peut écrire, si la table en a un.
    if (!gc || typeof gc === 'object') gc = colonnesPointDepuisSchema(colonnes) || gc;
    if (!gc) continue;
    out.push({ table, geometryColumn: gc, geomType: null, count: null });
  }
  return out;
}

const LAT_EXACT = /^(lat|latitude|y)$/i;
const LNG_EXACT = /^(lon|lng|long|longitude|x)$/i;
const LAT_PROCHE = /(^|_)lat(itude)?(_|$)|latitude/i;
const LNG_PROCHE = /(^|_)(lon|lng|long|longitude)(_|$)|longitude/i;

/**
 * Les colonnes d'un point, d'après le schéma : celles qu'Atlas pourra
 * **écrire**.
 *
 * Constaté le 01/10/2026 : une table tient ses coordonnées dans
 * `Latitude_WGS84`/`Longitude_WGS84` (des colonnes de données) et expose
 * `latitude`/`longitude` en formules qui les recopient. La convention de noms
 * choisissait les formules : on lisait bien, mais créer ou déplacer un objet
 * écrivait dans une formule. On préfère donc un couple de colonnes de données,
 * aux noms exacts d'abord, puis approchants (`Latitude_WGS84`, `lat_gps`) ; les
 * formules ne servent qu'en dernier recours, pour lire.
 *
 * @param {Array<{colId: string, isFormula?: boolean}>} colonnes
 * @returns {{lat: string, lng: string}|null}
 */
export function colonnesPointDepuisSchema(colonnes) {
  const cs = (colonnes || []).filter((c) => c && c.colId);
  const choisir = (liste) => {
    const lat = liste.find((c) => LAT_EXACT.test(c.colId)) || liste.find((c) => LAT_PROCHE.test(c.colId));
    const lng = liste.find((c) => LNG_EXACT.test(c.colId)) || liste.find((c) => LNG_PROCHE.test(c.colId));
    return lat && lng && lat !== lng ? { lat: lat.colId, lng: lng.colId } : null;
  };
  return choisir(cs.filter((c) => !c.isFormula)) || choisir(cs);
}

export function isLinkedTableLayer(layer) {
  return !!(layer?.sourceTable && (layer.kind === 'table' || layer.source === 'qgis2grist'));
}
