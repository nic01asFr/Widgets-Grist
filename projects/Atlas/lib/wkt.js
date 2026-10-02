/**
 * WKT ↔ GeoJSON, pour les tables qui portent leur géométrie en texte WKT.
 *
 * Constaté le 01/10/2026 sur un document réel : des couches entières en
 * `POLYGON ((…))` et `MULTILINESTRING ((…))`, WGS84, jusqu'à 28 000
 * caractères. Atlas n'acceptait que du GeoJSON : la cellule était ignorée sans
 * un mot, et l'équipe avait dû créer des copies converties de ses tables, qui
 * ne suivaient plus les originaux.
 *
 * Ce module est pur. Il lit `POINT`, `LINESTRING`, `POLYGON`, leurs `MULTI`,
 * le préfixe EWKT `SRID=…;`, les dimensions Z/M (ignorées : Atlas est 2D) et
 * `EMPTY`. Il ne reprojette rien : les coordonnées sont prises telles quelles,
 * dans l'ordre WKT (x = longitude, y = latitude).
 */

const TYPES = {
  POINT: 'Point',
  LINESTRING: 'LineString',
  POLYGON: 'Polygon',
  MULTIPOINT: 'MultiPoint',
  MULTILINESTRING: 'MultiLineString',
  MULTIPOLYGON: 'MultiPolygon',
};
const ENTETE = /^\s*(?:SRID=\d+\s*;\s*)?(MULTIPOINT|MULTILINESTRING|MULTIPOLYGON|POINT|LINESTRING|POLYGON)\s*(ZM|Z|M)?\s*/i;

/** La cellule ressemble-t-elle à du WKT ? (sans la décoder) */
export function estWkt(v) {
  return typeof v === 'string' && ENTETE.test(v);
}

/** « x y [z [m]] » → [x, y], ou null si illisible. */
function position(txt) {
  const n = txt.trim().split(/\s+/).map(Number);
  return n.length >= 2 && Number.isFinite(n[0]) && Number.isFinite(n[1]) ? [n[0], n[1]] : null;
}

/**
 * Découpe « (a), (b) » au premier niveau de parenthèses.
 * Rend les contenus sans leurs parenthèses extérieures.
 */
function groupes(txt) {
  const out = [];
  let prof = 0, debut = -1;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (c === '(') { if (prof === 0) debut = i + 1; prof++; }
    else if (c === ')') { prof--; if (prof === 0 && debut >= 0) { out.push(txt.slice(debut, i)); debut = -1; } if (prof < 0) return null; }
  }
  return prof === 0 ? out : null;
}

/** « x y, x y » → [[x, y], …] ; null si une position est illisible. */
function positions(txt) {
  const out = [];
  for (const p of txt.split(',')) {
    // MULTIPOINT accepte « (x y), (x y) » comme « x y, x y ».
    const q = position(p.replace(/[()]/g, ''));
    if (!q) return null;
    out.push(q);
  }
  return out;
}

/**
 * WKT → géométrie GeoJSON, ou `null` si la cellule n'en est pas, est vide
 * (`EMPTY`) ou est malformée. Ne lève jamais : une cellule illisible est une
 * absence de géométrie, comme une cellule vide.
 * @param {string} wkt
 * @returns {{type: string, coordinates: any}|null}
 */
export function lireWkt(wkt) {
  if (typeof wkt !== 'string') return null;
  const m = ENTETE.exec(wkt);
  if (!m) return null;
  const type = TYPES[m[1].toUpperCase()];
  const corps = wkt.slice(m[0].length).trim();
  if (!corps || /^EMPTY$/i.test(corps)) return null;
  const g = groupes(corps);
  if (!g || g.length !== 1) return null;
  const interieur = g[0];
  try {
    if (type === 'Point') {
      const p = position(interieur);
      return p ? { type, coordinates: p } : null;
    }
    if (type === 'LineString') {
      const c = positions(interieur);
      return c && c.length >= 2 ? { type, coordinates: c } : null;
    }
    if (type === 'MultiPoint') {
      const c = positions(interieur);
      return c && c.length ? { type, coordinates: c } : null;
    }
    if (type === 'Polygon' || type === 'MultiLineString') {
      const parts = groupes(interieur);
      if (!parts || !parts.length) return null;
      const c = parts.map(positions);
      return c.every(Boolean) ? { type, coordinates: c } : null;
    }
    if (type === 'MultiPolygon') {
      const polys = groupes(interieur);
      if (!polys || !polys.length) return null;
      const c = polys.map((p) => {
        const anneaux = groupes(p);
        return anneaux && anneaux.length ? anneaux.map(positions) : null;
      });
      return c.every((p) => p && p.every(Boolean)) ? { type, coordinates: c } : null;
    }
  } catch (_) { /* illisible */ }
  return null;
}

/** Un nombre tel qu'il est, sans notation exponentielle ni arrondi. */
function nombre(x) {
  return String(x);
}
const pos = (c) => `${nombre(c[0])} ${nombre(c[1])}`;
const ligne = (cs) => `(${cs.map(pos).join(', ')})`;
const poly = (anneaux) => `(${anneaux.map(ligne).join(', ')})`;

/**
 * Géométrie GeoJSON → WKT 2D, à précision inchangée : réécrire une géométrie
 * dont on n'a modifié qu'un attribut ne doit pas la déplacer d'un millimètre.
 * @returns {string|null}
 */
export function ecrireWkt(geom) {
  if (!geom?.type || !Array.isArray(geom.coordinates)) return null;
  const c = geom.coordinates;
  switch (geom.type) {
    case 'Point': return `POINT (${pos(c)})`;
    case 'LineString': return `LINESTRING ${ligne(c)}`;
    case 'Polygon': return `POLYGON ${poly(c)}`;
    case 'MultiPoint': return `MULTIPOINT (${c.map((p) => `(${pos(p)})`).join(', ')})`;
    case 'MultiLineString': return `MULTILINESTRING (${c.map(ligne).join(', ')})`;
    case 'MultiPolygon': return `MULTIPOLYGON (${c.map(poly).join(', ')})`;
    default: return null;
  }
}
