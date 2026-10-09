/**
 * Agrégats spatiaux : points -> grille carrée ou hexagones.
 *
 * Module pur (aucune carte, aucun DOM). Les mailles ont une taille en MÈTRES, donc la même forme à toute latitude :
 * le calcul se fait en Web Mercator (mètres de projection), puis les sommets sont ramenés en longitude/latitude.
 * À haute latitude, un mètre de projection est plus long qu'un mètre réel ; `corrigerLatitude` (par défaut) divise la
 * taille par 1/cos(lat) au centre des données pour que la maille représente la taille demandée sur le terrain.
 *
 * Agrégation d'un champ numérique : somme, moyenne, minimum, maximum, ou simple décompte.
 */
export const VERSION = '1.0.0';
const R = 6378137;
const D2R = Math.PI / 180;

export const versMercator = (lng, lat) => [R * lng * D2R, R * Math.log(Math.tan(Math.PI / 4 + (lat * D2R) / 2))];
export const depuisMercator = (x, y) => [(x / R) / D2R, (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) / D2R];

function lirePoint(f) {
  const g = f?.geometry;
  if (!g) return null;
  if (g.type === 'Point') return g.coordinates;
  if (g.type === 'MultiPoint' && g.coordinates.length) return g.coordinates[0];
  return null; // les lignes et surfaces ne s'agrègent pas ici : leurs centres sont à fournir par l'appelant
}

const nombre = (v) => { const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };

/** Les agrégats d'un compartiment, mis à jour valeur par valeur. */
function creerCase() { return { n: 0, somme: 0, nVal: 0, min: Infinity, max: -Infinity, ids: [] }; }
function ajouter(c, valeur, id) {
  c.n += 1; if (id !== undefined) c.ids.push(id);
  if (Number.isFinite(valeur)) { c.somme += valeur; c.nVal += 1; if (valeur < c.min) c.min = valeur; if (valeur > c.max) c.max = valeur; }
}
function proprietes(c, id) {
  return { id, n: c.n, somme: c.nVal ? c.somme : null, moyenne: c.nVal ? c.somme / c.nVal : null, min: c.nVal ? c.min : null, max: c.nVal ? c.max : null };
}

/** Facteur de correction de la taille selon la latitude moyenne. */
export function facteurLatitude(points) {
  if (!points.length) return 1;
  const lat = points.reduce((s, p) => s + p[1], 0) / points.length;
  return 1 / Math.max(0.05, Math.cos(lat * D2R));
}

/**
 * @param {object[]} features GeoJSON Feature (points)
 * @param {{taille:number, champ?:string, forme?:'carre'|'hexagone', corrigerLatitude?:boolean, garderIds?:boolean}} opts
 *   taille : côté du carré, ou rayon du cercle circonscrit de l'hexagone, en mètres
 */
export function agreger(features, opts = {}) {
  const { taille = 500, champ = null, forme = 'carre', corrigerLatitude = true, garderIds = false } = opts;
  const pts = [];
  for (const f of features || []) { const p = lirePoint(f); if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) pts.push([p, f]); }
  if (!pts.length) return { type: 'FeatureCollection', features: [], stats: { cases: 0, nMax: 0, valeurMax: null } };
  const k = corrigerLatitude ? facteurLatitude(pts.map((x) => x[0])) : 1;
  const t = taille * k;
  const cases = new Map();
  const ajoute = (cle, q, r, valeur, id) => { let c = cases.get(cle); if (!c) { c = creerCase(); c.q = q; c.r = r; cases.set(cle, c); } ajouter(c, valeur, garderIds ? id : undefined); };
  for (const [p, f] of pts) {
    const [x, y] = versMercator(p[0], p[1]);
    const v = champ ? nombre(f.properties?.[champ]) : NaN;
    if (forme === 'hexagone') {
      // sommet en haut (« pointy-top ») ; coordonnées axiales, arrondies en coordonnées cubiques
      const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / t, r = ((2 / 3) * y) / t;
      let cx = q, cz = r, cy = -cx - cz; let rx = Math.round(cx), ry = Math.round(cy), rz = Math.round(cz);
      const dx = Math.abs(rx - cx), dy = Math.abs(ry - cy), dz = Math.abs(rz - cz);
      if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
      ajoute(rx + ':' + rz, rx, rz, v, f.id);
    } else {
      const i = Math.floor(x / t), j = Math.floor(y / t);
      ajoute(i + ':' + j, i, j, v, f.id);
    }
  }
  const sortie = []; let nMax = 0, vMax = -Infinity;
  for (const [cle, c] of cases) {
    let ring;
    if (forme === 'hexagone') {
      const cx = t * Math.sqrt(3) * (c.q + c.r / 2), cy = t * 1.5 * c.r;
      ring = Array.from({ length: 6 }, (_, i) => { const a = D2R * (60 * i - 30); return depuisMercator(cx + t * Math.cos(a), cy + t * Math.sin(a)); });
    } else {
      const x0 = c.q * t, y0 = c.r * t;
      ring = [[x0, y0], [x0 + t, y0], [x0 + t, y0 + t], [x0, y0 + t]].map(([x, y]) => depuisMercator(x, y));
    }
    ring.push(ring[0]);
    const props = proprietes(c, cle); if (garderIds) props.ids = c.ids;
    if (c.n > nMax) nMax = c.n; if (props.somme != null && props.somme > vMax) vMax = props.somme;
    sortie.push({ type: 'Feature', id: sortie.length + 1, properties: props, geometry: { type: 'Polygon', coordinates: [ring] } });
  }
  return { type: 'FeatureCollection', features: sortie, stats: { cases: sortie.length, nMax, valeurMax: Number.isFinite(vMax) ? vMax : null, tailleMetres: taille } };
}

/** Aire (m², projection corrigée) d'une maille : utile pour une densité. */
export function aireMaille(taille, forme = 'carre') { return forme === 'hexagone' ? (3 * Math.sqrt(3) / 2) * taille * taille : taille * taille; }
