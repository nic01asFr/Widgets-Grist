/**
 * Géométrie saisie : une seule règle pour lire, normaliser, valider et écrire.
 *
 * Avant ce module, trois endroits décidaient chacun à sa façon :
 * `tableToGeoJSON` (couches liées ou entablées), `rowToFeature` (couches de
 * manifeste) et `featureToRowUpdate` (l'écriture, en noms de colonnes figés).
 * Ils divergeaient : une ligne vide d'une table lat/lon devenait un point en
 * (0, 0) d'un côté et pas de l'autre ; un point rangé en `geometry_json` se
 * lisait, mais s'écrivait dans des colonnes `latitude`/`longitude` absentes.
 *
 * Rien ici ne touche la carte, Grist ni le DOM. Cadrage :
 * `docs/CADRAGE-EDITION-GEOMETRIES.md`, lot 0.
 */
import { distanceMetres } from './releve.js?v=1.12.1';
import { lireWkt, ecrireWkt } from './wkt.js';

export const VERSION = '1.0.0';

/** ≈ 1 cm : au-delà, du volume sans information (un GPS de terrain fait 3 à 5 m). */
export const DECIMALES = 7;
/** Deux sommets consécutifs plus proches sont un seul sommet (double-clic de fin). */
export const SEUIL_DOUBLON_M = 0.05;
/** Au-delà, la cellule devient lourde pour Grist et le tracé illisible. */
export const PLAFOND_SOMMETS = 5000;

/** Surface ou longueur en dessous desquelles une forme est dégénérée. */
const AIRE_MIN_M2 = 0.01;
const LONGUEUR_MIN_M = 0.01;

/**
 * La famille d'un type GeoJSON : `Point`, `LineString` ou `Polygon`.
 * Une couche déclarée `MultiPolygon` est de la famille `Polygon`.
 * @returns {'Point'|'LineString'|'Polygon'|null}
 */
export function familleGeometrie(type) {
  if (type === 'Point' || type === 'MultiPoint') return 'Point';
  if (type === 'LineString' || type === 'MultiLineString') return 'LineString';
  if (type === 'Polygon' || type === 'MultiPolygon') return 'Polygon';
  return null;
}

/**
 * Une coordonnée lue dans une cellule.
 *
 * `+null`, `+''`, `+' '` et `+false` valent tous 0 en JavaScript : une ligne
 * vide d'une table lat/lon devenait ainsi un point en (0, 0), au large du golfe
 * de Guinée. Une cellule vide est une absence, pas un zéro.
 * @returns {number} `NaN` si la cellule ne porte pas de nombre
 */
export function lireCoordonnee(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v !== 'string') return NaN;
  const s = v.trim();
  if (!s || !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return NaN;
  return Number(s);
}

/** Longitude et latitude finies, dans leurs bornes, et pas l'origine (sentinelle « absent »). */
export function coordonneesUtilisables(lon, lat) {
  return Number.isFinite(lon) && Number.isFinite(lat)
    && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90
    && !(lon === 0 && lat === 0);
}

/**
 * Où vit la géométrie d'une couche, dans sa table.
 *
 * Dans cet ordre : les colonnes que le manifeste déclare (`geometry_fields`,
 * cas d'une source dont Grist a suffixé les noms : `latitude2`) ; la colonne
 * que la couche a retenue à la lecture (`geometryColumn`, chaîne ou
 * `{lat, lng}`) ; la convention du producteur — un point en
 * `latitude`/`longitude`, le reste en `geometry_json`.
 *
 * Une colonne unique porte sa géométrie en GeoJSON ou en WKT : `format` le
 * dit (`layer.geometryFormat`, relevé à la lecture ; à défaut, une colonne
 * nommée `wkt`). Une table WKT est réécrite en WKT — y écrire du GeoJSON
 * la rendrait illisible pour l'outil de l'équipe qui la tient.
 *
 * @returns {{ mode: 'latlon', lat: string, lon: string }
 *   | { mode: 'geojson', geojson: string, format: 'geojson'|'wkt', centroideLat?: string, centroideLon?: string }}
 */
export function colonnesGeometrie(layer) {
  const c = colonnesGeometrieBrutes(layer);
  if (c.mode !== 'geojson') return c;
  const format = layer?.geometryFormat === 'wkt' || layer?.geometryFormat === 'geojson'
    ? layer.geometryFormat
    : (/^wkt$/i.test(c.geojson) ? 'wkt' : 'geojson');
  return { ...c, format };
}

function colonnesGeometrieBrutes(layer) {
  const famille = familleGeometrie(layer?.geometryType) || 'Polygon';
  const gf = layer?._manifestLayer?.source?.geometry_fields
    || layer?._manifestLayer?.source?.geometryFields || null;
  if (gf && typeof gf === 'object') {
    if (famille !== 'Point' && gf.geojson) {
      const out = { mode: 'geojson', geojson: gf.geojson };
      if (gf.lat && gf.lon) { out.centroideLat = gf.lat; out.centroideLon = gf.lon; }
      return out;
    }
    if (famille === 'Point' && gf.lat && gf.lon) return { mode: 'latlon', lat: gf.lat, lon: gf.lon };
  }
  const gc = layer?.geometryColumn;
  // Deux colonnes ne portent qu'un point : une ligne ou une surface qui se
  // réclamerait d'un couple lat/lon n'aurait nulle part où s'écrire.
  if (famille === 'Point' && gc && typeof gc === 'object' && gc.lat && (gc.lng || gc.lon)) {
    return { mode: 'latlon', lat: gc.lat, lon: gc.lng || gc.lon };
  }
  if (typeof gc === 'string' && gc) return { mode: 'geojson', geojson: gc };
  return famille === 'Point'
    ? { mode: 'latlon', lat: 'latitude', lon: 'longitude' }
    : { mode: 'geojson', geojson: 'geometry_json' };
}

/** Les noms de colonnes que la géométrie occupe (jamais des attributs à écrire). */
export function nomsColonnesGeometrie(colonnes) {
  if (!colonnes) return [];
  return colonnes.mode === 'latlon'
    ? [colonnes.lat, colonnes.lon]
    : [colonnes.geojson, colonnes.centroideLat, colonnes.centroideLon].filter(Boolean);
}

function plat2D(coords) {
  if (!Array.isArray(coords)) return coords;
  if (typeof coords[0] === 'number') return [coords[0], coords[1]];
  return coords.map(plat2D);
}

/**
 * Les cellules à écrire pour une géométrie, dans les colonnes de la couche.
 *
 * La géométrie est écrite **telle qu'elle est donnée**, à plat (2D) : arrondir
 * ici réécrirait en silence toutes les géométries existantes au premier
 * enregistrement d'un attribut. L'arrondi appartient à `normaliserGeometrie`,
 * appliquée à ce qu'on vient de dessiner.
 *
 * @returns {object|null} `null` si la géométrie ne peut pas vivre dans ces colonnes
 *   (une ligne dans une table lat/lon)
 */
export function cellulesGeometrie(geom, colonnes) {
  if (!geom?.type || !Array.isArray(geom.coordinates) || !colonnes) return null;
  if (colonnes.mode === 'latlon') {
    if (geom.type !== 'Point') return null;
    const [lon, lat] = geom.coordinates;
    if (!coordonneesUtilisables(lon, lat)) return null;
    return { [colonnes.lat]: lat, [colonnes.lon]: lon };
  }
  const g = { type: geom.type, coordinates: plat2D(geom.coordinates) };
  if (colonnes.format === 'wkt') {
    const wkt = ecrireWkt(g);
    return wkt ? { [colonnes.geojson]: wkt } : null;
  }
  return { [colonnes.geojson]: JSON.stringify(g) };
}

/**
 * Lit la géométrie d'une ligne, d'après ses colonnes.
 * @param {object} ligne objet { colonne: valeur }
 * @returns {object|null} géométrie GeoJSON 2D, ou `null` si la ligne n'en porte pas
 */
export function lireGeometrie(ligne, colonnes) {
  if (!ligne || !colonnes) return null;
  if (colonnes.mode === 'latlon') {
    const lat = lireCoordonnee(ligne[colonnes.lat]);
    const lon = lireCoordonnee(ligne[colonnes.lon]);
    return coordonneesUtilisables(lon, lat) ? { type: 'Point', coordinates: [lon, lat] } : null;
  }
  let v = ligne[colonnes.geojson];
  if (v == null || v === '') return null;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s[0] !== '{') {
      const w = lireWkt(s);
      return w ? { type: w.type, coordinates: plat2D(w.coordinates) } : null;
    }
    try { v = JSON.parse(s); } catch (_) { return null; }
  }
  if (!v || typeof v !== 'object') return null;
  const g = v.type === 'Feature' ? v.geometry : v;
  if (!g?.type || !Array.isArray(g.coordinates)) return null;
  return { type: g.type, coordinates: plat2D(g.coordinates) };
}

/* ------------------------------------------------------------------ *
 * Normalisation — ce qu'on vient de dessiner, avant de l'écrire.
 * ------------------------------------------------------------------ */

function arrondi(x, d = DECIMALES) {
  const f = 10 ** d;
  const r = Math.round(x * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

function sommetsArrondis(coords) {
  return coords
    .filter((c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]))
    .map((c) => [arrondi(c[0]), arrondi(c[1])]);
}

function sansDoublonsConsecutifs(coords) {
  const out = [];
  for (const c of coords) {
    const prec = out[out.length - 1];
    if (prec && distanceMetres(prec, c) < SEUIL_DOUBLON_M) continue;
    out.push(c);
  }
  return out;
}

/** Aire signée en degrés² (x = lon, y = lat) : positive pour un anneau antihoraire. */
function aireSignee(anneau) {
  let s = 0;
  for (let i = 0; i < anneau.length - 1; i++) {
    s += anneau[i][0] * anneau[i + 1][1] - anneau[i + 1][0] * anneau[i][1];
  }
  return s / 2;
}

function anneauNormalise(anneau, exterieur) {
  let a = sansDoublonsConsecutifs(sommetsArrondis(anneau || []));
  // Le dernier sommet répète le premier : on le retire avant de dédoublonner
  // en boucle, puis on referme.
  while (a.length > 1 && distanceMetres(a[0], a[a.length - 1]) < SEUIL_DOUBLON_M) a.pop();
  if (a.length) a.push(a[0].slice());
  // RFC 7946 : extérieur antihoraire, trous horaires. Réorienté plutôt que refusé.
  if (a.length >= 4) {
    const antihoraire = aireSignee(a) > 0;
    if (antihoraire !== exterieur) a = a.reverse();
  }
  return a;
}

/**
 * 2D, 7 décimales, sommets consécutifs confondus fusionnés, anneaux fermés et
 * orientés. Ne valide pas : une forme dégénérée ressort dégénérée, et
 * `validerGeometrie` dit pourquoi.
 * @returns {object|null}
 */
export function normaliserGeometrie(geom) {
  if (!geom?.type || !Array.isArray(geom.coordinates)) return null;
  if (geom.type === 'Point') {
    const [p] = sommetsArrondis([geom.coordinates]);
    return p ? { type: 'Point', coordinates: p } : null;
  }
  if (geom.type === 'LineString') {
    return { type: 'LineString', coordinates: sansDoublonsConsecutifs(sommetsArrondis(geom.coordinates)) };
  }
  if (geom.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geom.coordinates.map((anneau, i) => anneauNormalise(anneau, i === 0)),
    };
  }
  return { type: geom.type, coordinates: plat2D(geom.coordinates) };
}

/* ------------------------------------------------------------------ *
 * Validation — refuser avec un motif nommé plutôt qu'écrire du faux.
 * ------------------------------------------------------------------ */

function longueurM(coords) {
  let n = 0;
  for (let i = 1; i < coords.length; i++) n += distanceMetres(coords[i - 1], coords[i]);
  return n;
}

/** Aire d'un anneau en m², projection locale équirectangulaire (petites emprises). */
function aireM2(anneau) {
  if (anneau.length < 4) return 0;
  const lat0 = anneau[0][1] * Math.PI / 180;
  const kx = Math.cos(lat0) * 111320;
  const ky = 110540;
  const pts = anneau.map((c) => [(c[0] - anneau[0][0]) * kx, (c[1] - anneau[0][1]) * ky]);
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) s += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  return Math.abs(s / 2);
}

/**
 * Les mesures d'une forme, pour les dire pendant le tracé.
 * @returns {{ sommets: number, longueurM?: number, aireM2?: number, perimetreM?: number }}
 */
export function mesurerGeometrie(geom) {
  if (!geom?.type || !Array.isArray(geom.coordinates)) return { sommets: 0 };
  if (geom.type === 'Point') return { sommets: 1 };
  if (geom.type === 'LineString') {
    return { sommets: geom.coordinates.length, longueurM: longueurM(geom.coordinates) };
  }
  if (geom.type === 'Polygon') {
    const anneau = geom.coordinates[0] || [];
    const ferme = anneau.length >= 2
      && anneau[0][0] === anneau[anneau.length - 1][0] && anneau[0][1] === anneau[anneau.length - 1][1];
    const a = ferme ? anneau : [...anneau, anneau[0]].filter(Boolean);
    return { sommets: ferme ? anneau.length - 1 : anneau.length, aireM2: aireM2(a), perimetreM: longueurM(a) };
  }
  return { sommets: 0 };
}

function orient(a, b, c) {
  const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return Math.abs(v) < 1e-18 ? 0 : Math.sign(v);
}

function surSegment(a, b, p) {
  return Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0])
    && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);
}

function segmentsSeCoupent(p1, p2, p3, p4) {
  const o1 = orient(p1, p2, p3);
  const o2 = orient(p1, p2, p4);
  const o3 = orient(p3, p4, p1);
  const o4 = orient(p3, p4, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && surSegment(p1, p2, p3)) return true;
  if (o2 === 0 && surSegment(p1, p2, p4)) return true;
  if (o3 === 0 && surSegment(p3, p4, p1)) return true;
  if (o4 === 0 && surSegment(p3, p4, p2)) return true;
  return false;
}

/**
 * Un anneau fermé se recoupe-t-il ?
 * Deux segments voisins partagent un sommet : ce contact-là n'est pas un
 * croisement. Tout autre contact l'est, y compris un segment qui en longe un
 * autre.
 */
export function anneauSeRecoupe(anneau) {
  const n = anneau.length - 1; // nombre de segments
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const voisins = j === i + 1 || (i === 0 && j === n - 1);
      if (voisins) continue;
      if (segmentsSeCoupent(anneau[i], anneau[i + 1], anneau[j], anneau[j + 1])) return true;
    }
  }
  return false;
}

const MESSAGES = {
  absente: 'Aucune géométrie à enregistrer.',
  type: 'Cette forme ne correspond pas au type de la couche.',
  multiple: 'Les géométries multiples ne se saisissent pas encore dans Atlas.',
  coordonnees: 'Une coordonnée est hors des bornes (longitude −180 à 180, latitude −90 à 90).',
  origine: 'Le point est en (0, 0) : position absente.',
  sommets: 'Pas assez de sommets distincts.',
  'longueur-nulle': 'La ligne n’a pas de longueur.',
  'aire-nulle': 'La surface n’a pas d’aire.',
  'auto-intersection': 'Le contour se recoupe : dessinez-le sans croisement.',
  'trop-de-sommets': `Plus de ${PLAFOND_SOMMETS} sommets : la forme est trop lourde pour une cellule.`,
};

function erreur(code) { return { code, message: MESSAGES[code] }; }

function toutesCoordonnees(coords, out = []) {
  if (!Array.isArray(coords)) return out;
  if (typeof coords[0] === 'number') { out.push(coords); return out; }
  for (const c of coords) toutesCoordonnees(c, out);
  return out;
}

/**
 * Une géométrie peut-elle être écrite dans une couche de ce type ?
 *
 * À appeler sur une géométrie normalisée : un anneau non fermé ou un double
 * sommet final sont des maladresses que la normalisation répare, pas des
 * erreurs.
 *
 * @param {object} geom
 * @param {string} [typeCouche] type déclaré de la couche (famille comparée)
 * @returns {{ ok: boolean, erreurs: {code: string, message: string}[] }}
 */
export function validerGeometrie(geom, typeCouche) {
  const erreurs = [];
  const fin = () => ({ ok: erreurs.length === 0, erreurs });
  if (!geom?.type || !Array.isArray(geom.coordinates)) { erreurs.push(erreur('absente')); return fin(); }
  if (/^Multi/.test(geom.type)) { erreurs.push(erreur('multiple')); return fin(); }
  const famille = familleGeometrie(geom.type);
  if (!famille) { erreurs.push(erreur('type')); return fin(); }
  const attendue = familleGeometrie(typeCouche);
  if (attendue && attendue !== famille) { erreurs.push(erreur('type')); return fin(); }

  const tous = toutesCoordonnees(geom.coordinates);
  if (tous.length > PLAFOND_SOMMETS) { erreurs.push(erreur('trop-de-sommets')); return fin(); }
  if (tous.some((c) => !Number.isFinite(c[0]) || !Number.isFinite(c[1])
    || c[0] < -180 || c[0] > 180 || c[1] < -90 || c[1] > 90)) {
    erreurs.push(erreur('coordonnees'));
    return fin();
  }

  if (famille === 'Point') {
    if (geom.coordinates[0] === 0 && geom.coordinates[1] === 0) erreurs.push(erreur('origine'));
    return fin();
  }
  if (famille === 'LineString') {
    const c = sansDoublonsConsecutifs(geom.coordinates);
    if (c.length < 2) erreurs.push(erreur('sommets'));
    else if (longueurM(c) < LONGUEUR_MIN_M) erreurs.push(erreur('longueur-nulle'));
    return fin();
  }
  // Surface : l'anneau extérieur seulement (pas de trou au premier lot).
  const anneau = geom.coordinates[0] || [];
  const ferme = anneau.length >= 2
    && anneau[0][0] === anneau[anneau.length - 1][0] && anneau[0][1] === anneau[anneau.length - 1][1];
  const distincts = ferme ? anneau.length - 1 : anneau.length;
  if (distincts < 3) { erreurs.push(erreur('sommets')); return fin(); }
  const anneauFerme = ferme ? anneau : [...anneau, anneau[0]];
  // Le croisement d'abord : un huit symétrique a une aire nette nulle, et
  // « pas d'aire » dirait mal ce qui ne va pas.
  if (anneauSeRecoupe(anneauFerme)) { erreurs.push(erreur('auto-intersection')); return fin(); }
  if (aireM2(anneauFerme) < AIRE_MIN_M2) erreurs.push(erreur('aire-nulle'));
  return fin();
}

/* ------------------------------------------------------------------ *
 * Identité — un objet est sa ligne, pas son rang.
 * ------------------------------------------------------------------ */

/** Les `_row_id` des entités désignées par leurs rangs. */
export function rowIdsDepuisRangs(features, rangs) {
  const out = [];
  for (const i of rangs || []) {
    const id = features?.[i]?.properties?._row_id;
    if (id != null) out.push(id);
  }
  return out;
}

/**
 * Les rangs actuels d'objets désignés par leur `_row_id`.
 *
 * Après une relecture, une ligne ajoutée ou retirée décale les rangs : la
 * sélection gardée par rang montrerait un autre objet. Un objet disparu est
 * simplement omis.
 */
export function rangsDepuisRowIds(features, rowIds) {
  const voulus = new Set((rowIds || []).map(String));
  const out = [];
  (features || []).forEach((f, i) => {
    const id = f?.properties?._row_id;
    if (id != null && voulus.has(String(id))) out.push(i);
  });
  return out;
}
