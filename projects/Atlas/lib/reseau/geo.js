/**
 * Géométrie pure en plan local, pour travailler en mètres sur des coordonnées WGS84.
 *
 * Le repère est équirectangulaire, centré sur un point : `x` = écart en longitude × cos(lat₀), `y` = écart en
 * latitude, tous deux en mètres. Sur une emprise de quelques dizaines de kilomètres (un couloir autour d'un tracé,
 * une commune), la distorsion reste négligeable devant la précision des données (le mètre). Au-delà, il faut un autre
 * repère par zone : ce module ne fait aucune projection cartographique.
 *
 * Aucune entrée-sortie, aucune dépendance : ces fonctions servent au graphe routier, au calage et aux comparaisons.
 */

/** Mètres par degré de latitude (rayon moyen 6 371 km). */
export const M_PAR_DEGRE = 111320;
export const D2R = Math.PI / 180;

/**
 * Un repère local centré en (lng0, lat0).
 * @returns {{ vers: (p: number[]) => number[], depuis: (x: number, y: number) => number[] }}
 */
export function creerRepere(lng0, lat0) {
  const k = Math.cos(lat0 * D2R);
  return {
    vers: (p) => [(p[0] - lng0) * M_PAR_DEGRE * k, (p[1] - lat0) * M_PAR_DEGRE],
    depuis: (x, y) => [lng0 + x / (M_PAR_DEGRE * k), lat0 + y / M_PAR_DEGRE],
  };
}

/**
 * Les lignes (tableaux de positions) d'une géométrie GeoJSON : une `LineString` en donne une, une
 * `MultiLineString` plusieurs, une `GeometryCollection` ce que contiennent ses membres. Le reste n'en donne aucune.
 * @param {object|null|undefined} g
 * @returns {number[][][]}
 */
export function lignesDe(g) {
  if (!g) return [];
  if (g.type === 'LineString') return [g.coordinates];
  if (g.type === 'MultiLineString') return g.coordinates;
  if (g.type === 'GeometryCollection') return (g.geometries || []).flatMap(lignesDe);
  return [];
}

export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Pied de la perpendiculaire de p sur le segment [a, b] : `t` dans [0, 1], `d` distance, `q` le point. */
export function projSeg(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  const q = [a[0] + t * dx, a[1] + t * dy];
  return { t, d: Math.hypot(p[0] - q[0], p[1] - q[1]), q };
}

/** Abscisses curvilignes cumulées de chaque sommet (le premier vaut 0). */
export function cumul(ln) {
  const c = [0];
  for (let i = 1; i < ln.length; i++) c.push(c[i - 1] + dist(ln[i - 1], ln[i]));
  return c;
}

/** Cap de a vers b, en degrés depuis le nord, dans [0, 360[. */
export const cap = (a, b) => (Math.atan2(b[0] - a[0], b[1] - a[1]) / D2R + 360) % 360;

/** Écart entre deux caps, dans [0, 180]. */
export function ecartCap(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Projection d'un point sur une polyligne : `d` distance, `s` abscisse (m) du pied, `i` indice du segment
 * (de i-1 à i), `q` le pied, `cap` le cap de la ligne en ce segment, dans le sens de la ligne.
 * @returns {{d: number, s: number, i: number, q: number[], cap: number}|null} null pour une ligne de moins de deux points
 */
export function projLigne(p, ln, cum) {
  cum = cum || cumul(ln);
  let best = null;
  for (let i = 1; i < ln.length; i++) {
    const r = projSeg(p, ln[i - 1], ln[i]);
    if (!best || r.d < best.d) best = { d: r.d, s: cum[i - 1] + r.t * (cum[i] - cum[i - 1]), i, q: r.q };
  }
  if (best) best.cap = cap(ln[best.i - 1], ln[best.i]);
  return best;
}

/** Point de la polyligne à l'abscisse s (bornée à la ligne). */
export function pointA(ln, cum, s) {
  const L = cum[cum.length - 1];
  s = Math.max(0, Math.min(L, s));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const seg = cum[i] - cum[i - 1];
  const t = seg ? (s - cum[i - 1]) / seg : 0;
  return [ln[i - 1][0] + (ln[i][0] - ln[i - 1][0]) * t, ln[i - 1][1] + (ln[i][1] - ln[i - 1][1]) * t];
}

/** Points régulièrement espacés tous les `pas` mètres, extrémités comprises. */
export function echantillonner(ln, pas) {
  const cum = cumul(ln);
  const L = cum[cum.length - 1];
  if (L === 0) return [ln[0]];
  const n = Math.max(1, Math.ceil(L / pas));
  const out = [];
  for (let k = 0; k <= n; k++) out.push(pointA(ln, cum, (L * k) / n));
  return out;
}

export function longueur(ln) {
  const c = cumul(ln);
  return c[c.length - 1];
}

/** Distance d'un point à la plus proche de plusieurs lignes. */
export function distPtLignes(p, lns) {
  let d = Infinity;
  for (const ln of lns) {
    const r = projLigne(p, ln);
    if (r && r.d < d) d = r.d;
  }
  return d;
}

/** Distance de Hausdorff dirigée de A vers B : le plus grand écart d'un point de A (échantillonné tous les `pas` m) à B. */
export function hausdorffDirige(A, B, pas = 5) {
  let m = 0;
  for (const ln of A) for (const p of echantillonner(ln, pas)) m = Math.max(m, distPtLignes(p, B));
  return m;
}

/** Distance de Hausdorff symétrique entre deux ensembles de lignes (en mètres). */
export function hausdorff(A, B, pas = 5) {
  return Math.max(hausdorffDirige(A, B, pas), hausdorffDirige(B, A, pas));
}

/** Fréchet discret entre deux suites de points. */
export function frechetDiscret(P, Q) {
  const n = P.length;
  const m = Q.length;
  const ca = Array.from({ length: n }, () => new Float64Array(m));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const d = dist(P[i], Q[j]);
      if (i === 0 && j === 0) ca[i][j] = d;
      else if (i === 0) ca[i][j] = Math.max(ca[0][j - 1], d);
      else if (j === 0) ca[i][j] = Math.max(ca[i - 1][0], d);
      else ca[i][j] = Math.max(Math.min(ca[i - 1][j], ca[i - 1][j - 1], ca[i][j - 1]), d);
    }
  }
  return ca[n - 1][m - 1];
}

/** Fréchet entre deux polylignes, le sens de la seconde étant libre (le meilleur des deux). */
export function frechet(lnA, lnB, pas = 10) {
  const P = echantillonner(lnA, pas);
  const Q = echantillonner(lnB, pas);
  return Math.min(frechetDiscret(P, Q), frechetDiscret(P, Q.slice().reverse()));
}
