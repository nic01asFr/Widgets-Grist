/**
 * Unités administratives de référence : codes, hiérarchie, jointure d'un tableau hôte, agrégation point-dans-polygone,
 * indicateurs rapportés, remontée vers les niveaux supérieurs.
 *
 * Module pur (aucune carte, aucun réseau, aucun DOM). Les géométries sont des GeoJSON Feature (Polygon ou MultiPolygon,
 * longitude/latitude). Règle générale : AUCUNE donnée n'est zéro. Une valeur absente, illisible ou non fournie est `null`,
 * jamais 0 ; un taux dont la base manque ou vaut 0 est `null`, jamais Infinity.
 */
import { REGIONS, DEPARTEMENTS } from './admin-referentiel.js';

export const VERSION = '1.0.0';

// ---------------------------------------------------------------------------------------------------------------
// Niveaux, codes, hiérarchie
// ---------------------------------------------------------------------------------------------------------------
export const NIVEAUX = Object.freeze(['pays', 'region', 'departement', 'epci', 'commune', 'arrondissement']);
/** Parent hiérarchique strict. L'EPCI (regroupement de communes) est transverse : il n'a pas de parent unique. */
export const PARENT = Object.freeze({ arrondissement: 'commune', commune: 'departement', departement: 'region', region: 'pays' });
export const PAYS_FRANCE = 'FRA';

/** Paris, Lyon et Marseille : une commune, plusieurs arrondissements municipaux (codes INSEE d'arrondissement). */
export const COMMUNES_PLM = Object.freeze({
  '75056': { nom: 'Paris', arrondissements: Array.from({ length: 20 }, (_, i) => String(75101 + i)) },
  '69123': { nom: 'Lyon', arrondissements: Array.from({ length: 9 }, (_, i) => String(69381 + i)) },
  '13055': { nom: 'Marseille', arrondissements: Array.from({ length: 16 }, (_, i) => String(13201 + i)) },
});
const ARR_VERS_COMMUNE = new Map(Object.entries(COMMUNES_PLM).flatMap(([c, v]) => v.arrondissements.map((a) => [a, c])));

export const communeDeArrondissement = (code) => ARR_VERS_COMMUNE.get(String(code)) || null;
export const estCommunePLM = (code) => String(code) in COMMUNES_PLM;

const brutVersTexte = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? (Number.isInteger(v) ? String(v) : '') : '';
  return String(v).trim().replace(/^'+/, '').replace(/\.0+$/, '').replace(/\s+/g, '');
};

/**
 * Normalise un code saisi par un hôte. Les tableurs retirent les zéros de tête (1 -> « 01 », 1001 -> « 01001 ») et passent
 * « 2A004 » en minuscules : on les rétablit. Renvoie { code, ok, raison }.
 * - commune et arrondissement : 5 caractères (« 2A » ou « 2B » + 3 chiffres pour la Corse) ;
 * - departement : 2 caractères (01 à 95, 2A, 2B) ou 3 chiffres (971 à 976) ;
 * - region : 2 chiffres ; epci : 9 chiffres (SIREN) ; pays : trois lettres ISO 3166-1 alpha-3.
 */
export function normaliserCode(niveau, brut) {
  let t = brutVersTexte(brut); if (!t) return { code: null, ok: false, raison: 'vide' };
  t = t.toUpperCase();
  const echec = (raison) => ({ code: null, ok: false, raison });
  if (niveau === 'pays') return /^[A-Z]{3}$/.test(t) ? { code: t, ok: true } : echec('iso3');
  if (niveau === 'region') { if (!/^\d{1,2}$/.test(t)) return echec('region'); return { code: t.padStart(2, '0'), ok: true }; }
  if (niveau === 'departement') {
    if (/^2[AB]$/.test(t)) return { code: t, ok: true };
    if (/^\d{1,3}$/.test(t)) { const c = t.length === 3 ? t : t.padStart(2, '0'); return { code: c, ok: true }; }
    return echec('departement');
  }
  if (niveau === 'epci') { if (!/^\d{1,9}$/.test(t)) return echec('epci'); return { code: t.padStart(9, '0'), ok: true }; }
  if (niveau === 'commune' || niveau === 'arrondissement') {
    if (/^2[AB]\d{3}$/.test(t)) return { code: t, ok: true };
    if (/^\d{4,5}$/.test(t)) return { code: t.padStart(5, '0'), ok: true };
    return echec(niveau);
  }
  return echec('niveau inconnu : ' + niveau);
}

/** Département d'une commune (ou d'un arrondissement) d'après son code INSEE ; null si le code ne le permet pas. */
export function departementDeCommune(code) {
  const c = String(code || '');
  if (/^2[AB]\d{3}$/.test(c)) return c.slice(0, 2);
  if (!/^\d{5}$/.test(c)) return null;
  if (c.startsWith('20')) return null; // ancien code Corse (20xxx) : ni 2A ni 2B sans table de passage
  if (c.startsWith('97') || c.startsWith('98')) return c.slice(0, 3);
  return c.slice(0, 2);
}
export const regionDeDepartement = (dep) => (DEPARTEMENTS[dep] ? DEPARTEMENTS[dep].region : null);
export const nomRegion = (code) => REGIONS[code] || null;
export const nomDepartement = (code) => (DEPARTEMENTS[code] ? DEPARTEMENTS[code].nom : null);

/** Chaîne de parents d'un code : { arrondissement?, commune?, departement?, region?, pays }. Un niveau inconnu vaut null. */
export function parents(niveau, code) {
  const c = String(code || ''); const r = { pays: PAYS_FRANCE };
  if (niveau === 'pays') return { pays: c };
  if (niveau === 'region') { r.region = c; return r; }
  if (niveau === 'departement') { r.departement = c; r.region = regionDeDepartement(c); return r; }
  if (niveau === 'arrondissement') { r.arrondissement = c; const cm = communeDeArrondissement(c); r.commune = cm; r.departement = cm ? departementDeCommune(cm) : departementDeCommune(c); }
  else if (niveau === 'commune') { r.commune = c; r.departement = departementDeCommune(c); }
  else return r;
  r.region = r.departement ? regionDeDepartement(r.departement) : null;
  return r;
}
/** Code du niveau demandé pour une unité d'un niveau plus fin (ex. la région d'une commune). null si indéterminé. */
export function ancetre(niveau, code, cible) { if (niveau === cible) return code; const p = parents(niveau, code); return p[cible] ?? null; }

// ---------------------------------------------------------------------------------------------------------------
// Valeurs : lecture prudente (jamais de zéro par défaut)
// ---------------------------------------------------------------------------------------------------------------
const MANQUANTS = new Set(['', 'na', 'n/a', 'nd', 'n.d.', 'nc', 'null', 'undefined', 'nan', '-', '--', '—', 's', 'c', 'x', '.', '..', '...']);
/** Lit une valeur d'hôte. Renvoie un nombre fini ou null. Gère « 1 234,5 », « 12 % », « 3,2e3 ». Le texte secret (s, c) est manquant. */
export function lireValeur(v) {
  if (v === null || v === undefined || typeof v === 'boolean') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const t = v.trim().toLowerCase(); if (MANQUANTS.has(t)) return null;
  const n = Number(t.replace(/[\s  ]/g, '').replace('%', '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Jointure d'un tableau hôte sur une couche
// ---------------------------------------------------------------------------------------------------------------
/**
 * Joint un tableau hôte aux unités d'une couche.
 * @param {object[]} unites  GeoJSON Feature ; leur code est dans `properties[cleUnite]`
 * @param {object|Map|object[]} table  { code: valeur } | Map | [{ [cle]: code, [champ]: valeur }]
 * @param {{niveau:string, cleUnite?:string, cle?:string, champ?:string, doublons?:'premier'|'somme'|'dernier'}} o
 * @returns {{valeurs: Map<string, number|null>, rapport: object}}
 *   rapport : unites, joints (valeur non nulle), sansDonnee (unité sans valeur), orphelins (codes hôte sans unité),
 *   doublons (codes présents plusieurs fois), invalides (codes illisibles), nonNumeriques (valeurs illisibles)
 */
export function joindre(unites, table, o = {}) {
  const { niveau = 'commune', cleUnite = 'code', cle = 'code', champ = 'valeur', doublons = 'premier' } = o;
  const entrees = [];
  if (table instanceof Map) for (const [k, v] of table) entrees.push([k, v]);
  else if (Array.isArray(table)) for (const r of table) entrees.push([r?.[cle], r && typeof r === 'object' ? r[champ] : undefined]);
  else if (table && typeof table === 'object') for (const [k, v] of Object.entries(table)) entrees.push([k, v && typeof v === 'object' && !Array.isArray(v) && champ in v ? v[champ] : v]);
  const rapport = { unites: unites.length, joints: 0, sansDonnee: 0, orphelins: [], doublons: [], invalides: [], nonNumeriques: [] };
  const hote = new Map(); const dup = new Set();
  for (const [brut, v] of entrees) {
    const n = normaliserCode(niveau, brut);
    if (!n.ok) { rapport.invalides.push(String(brut)); continue; }
    const val = lireValeur(v); if (val === null && v !== null && v !== undefined && String(v).trim() !== '' && !MANQUANTS.has(String(v).trim().toLowerCase())) rapport.nonNumeriques.push(n.code);
    if (hote.has(n.code)) {
      dup.add(n.code);
      if (doublons === 'somme') hote.set(n.code, val === null ? hote.get(n.code) : (hote.get(n.code) ?? 0) + val);
      else if (doublons === 'dernier') hote.set(n.code, val);
      continue;
    }
    hote.set(n.code, val);
  }
  rapport.doublons = [...dup];
  const valeurs = new Map(); const vus = new Set();
  for (const u of unites) {
    const code = u.properties?.[cleUnite]; vus.add(code);
    const v = hote.has(code) ? hote.get(code) : null;
    valeurs.set(code, v); if (v === null) rapport.sansDonnee++; else rapport.joints++;
  }
  for (const c of hote.keys()) if (!vus.has(c)) rapport.orphelins.push(c);
  return { valeurs, rapport };
}

// ---------------------------------------------------------------------------------------------------------------
// Géométrie : aire, anneaux, index spatial, point dans polygone
// ---------------------------------------------------------------------------------------------------------------
const R_TERRE = 6371008.8, D2R = Math.PI / 180;

/** Aire d'un anneau en km² (formule sphérique de Chamberlain-Duquette). Signée selon l'orientation. */
function aireAnneauSphere(r) {
  let s = 0; const n = r.length;
  for (let i = 0; i < n - 1; i++) { const [x1, y1] = r[i], [x2, y2] = r[i + 1]; s += (x2 - x1) * D2R * (2 + Math.sin(y1 * D2R) + Math.sin(y2 * D2R)); }
  return (s * R_TERRE * R_TERRE) / 2 / 1e6;
}
/** Aire géodésique (km²) d'un Polygon ou MultiPolygon, trous retranchés. */
export function aireGeodesiqueKm2(g) {
  if (!g) return null; const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null; if (!polys) return null;
  let a = 0; for (const p of polys) { a += Math.abs(aireAnneauSphere(p[0])); for (let k = 1; k < p.length; k++) a -= Math.abs(aireAnneauSphere(p[k])); }
  return a;
}

/**
 * Anneau aplati (Float64Array x,y,x,y...) ; au-delà de SEUIL_BANDES sommets, les arêtes sont rangées par bandes horizontales
 * (CSR) : un tir de rayon ne parcourt alors que les arêtes de la bande du point (≈ racine du nombre de sommets) au lieu de toutes.
 */
const SEUIL_BANDES = 64;
function preparerAnneau(r) {
  const f = new Float64Array(r.length * 2); let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < r.length; i++) { f[2 * i] = r[i][0]; f[2 * i + 1] = r[i][1]; if (r[i][1] < y0) y0 = r[i][1]; if (r[i][1] > y1) y1 = r[i][1]; }
  const n = r.length; if (n <= SEUIL_BANDES || !(y1 > y0)) return { f, n, bandes: null };
  const K = Math.max(8, Math.min(1024, Math.ceil(Math.sqrt(n)))), h = (y1 - y0) / K, comptes = new Int32Array(K + 1);
  const bande = (y) => Math.min(K - 1, Math.max(0, Math.floor((y - y0) / h)));
  for (let i = 0, j = n - 1; i < n; j = i++) { const a = bande(Math.min(f[2 * i + 1], f[2 * j + 1])), b = bande(Math.max(f[2 * i + 1], f[2 * j + 1])); for (let k = a; k <= b; k++) comptes[k + 1]++; }
  for (let k = 0; k < K; k++) comptes[k + 1] += comptes[k];
  const aretes = new Int32Array(comptes[K]), pos = comptes.slice(0, K);
  for (let i = 0, j = n - 1; i < n; j = i++) { const a = bande(Math.min(f[2 * i + 1], f[2 * j + 1])), b = bande(Math.max(f[2 * i + 1], f[2 * j + 1])); for (let k = a; k <= b; k++) aretes[pos[k]++] = i; }
  return { f, n, bandes: { K, y0, h, debut: comptes, aretes } };
}
/** Anneaux et boîte englobante d'une partie. */
function preparerPartie(p) {
  const anneaux = p.map(preparerAnneau);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; const ext = anneaux[0].f;
  for (let i = 0; i < ext.length; i += 2) { if (ext[i] < x0) x0 = ext[i]; if (ext[i] > x1) x1 = ext[i]; if (ext[i + 1] < y0) y0 = ext[i + 1]; if (ext[i + 1] > y1) y1 = ext[i + 1]; }
  return { anneaux, x0, y0, x1, y1 };
}
/** Tir de rayon (pair-impair) sur un anneau préparé. */
function dansAnneau(a, x, y) {
  const { f, n, bandes } = a; let dedans = false;
  const test = (i) => { const j = i === 0 ? n - 1 : i - 1; const xi = f[2 * i], yi = f[2 * i + 1], xj = f[2 * j], yj = f[2 * j + 1]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans; };
  if (bandes) {
    const { K, y0, h, debut, aretes } = bandes; const b = Math.min(K - 1, Math.max(0, Math.floor((y - y0) / h)));
    for (let k = debut[b]; k < debut[b + 1]; k++) test(aretes[k]);
  } else for (let i = 0; i < n; i++) test(i);
  return dedans;
}
function dansPartie(pt, x, y) {
  if (x < pt.x0 || x > pt.x1 || y < pt.y0 || y > pt.y1) return false;
  if (!dansAnneau(pt.anneaux[0], x, y)) return false;
  for (let k = 1; k < pt.anneaux.length; k++) if (dansAnneau(pt.anneaux[k], x, y)) return false; // dans un trou
  return true;
}
/** Distance (m) d'un point au contour extérieur d'une partie, plan local équirectangulaire. */
function distanceMetres(pt, x, y) {
  const k = Math.cos(y * D2R), M = 111320; let best = Infinity;
  for (const { f } of pt.anneaux.slice(0, 1)) {
    const n = f.length / 2;
    for (let i = 0; i < n - 1; i++) {
      const ax = (f[2 * i] - x) * M * k, ay = (f[2 * i + 1] - y) * M, bx = (f[2 * i + 2] - x) * M * k, by = (f[2 * i + 3] - y) * M;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; let t = l2 ? -(ax * dx + ay * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(ax + t * dx, ay + t * dy); if (d < best) best = d;
    }
  }
  return best;
}

/**
 * Index spatial (grille éparse) sur des polygones. Chaque polygone est inscrit dans toutes les cellules que recouvre sa
 * boîte englobante ; une requête ne teste que les polygones de la cellule du point.
 * @param {object[]} features  Polygon / MultiPolygon
 * @param {{cle?:string, cellule?:number}} o  cle : propriété du code (défaut « code »), cellule : taille en degrés (auto sinon)
 */
export function creerIndex(features, o = {}) {
  const { cle = 'code' } = o; const unites = [];
  for (const f of features) {
    const g = f.geometry; if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null; if (!polys) continue;
    const code = f.properties?.[cle]; if (code === undefined || code === null) continue;
    unites.push({ code: String(code), parties: polys.filter((p) => p.length && p[0].length >= 4).map(preparerPartie) });
  }
  unites.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)); // ordre déterministe : le plus petit code gagne en cas de chevauchement
  const dims = []; for (const u of unites) for (const p of u.parties) dims.push(Math.max(p.x1 - p.x0, p.y1 - p.y0));
  dims.sort((a, b) => a - b);
  const med = dims.length ? dims[dims.length >> 1] : 1;
  const cellule = o.cellule || Math.max(0.01, Math.min(10, med / 2));
  const grille = new Map(), grands = []; const cle2 = (i, j) => i * 100003 + j;
  const MAX_CELLULES = 2500;
  unites.forEach((u, idx) => {
    u.parties.forEach((p) => {
      const i0 = Math.floor(p.x0 / cellule), i1 = Math.floor(p.x1 / cellule), j0 = Math.floor(p.y0 / cellule), j1 = Math.floor(p.y1 / cellule);
      if ((i1 - i0 + 1) * (j1 - j0 + 1) > MAX_CELLULES) { grands.push([idx, p]); return; }
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = cle2(i, j); let l = grille.get(k); if (!l) grille.set(k, (l = [])); l.push([idx, p]); }
    });
  });
  const candidats = (x, y) => { const l = grille.get(cle2(Math.floor(x / cellule), Math.floor(y / cellule))); return l ? (grands.length ? l.concat(grands) : l) : grands; };
  return {
    nUnites: unites.length, cellule, nCellules: grille.size,
    /** Renvoie { code, ambigu } ; code null si aucun polygone ne contient le point (après tolérance éventuelle). */
    trouver(lng, lat, tolerance = 0) {
      const c = candidats(lng, lat); let premier = -1, autre = false;
      for (let i = 0; i < c.length; i++) {
        const [idx, p] = c[i];
        if (idx === premier || !dansPartie(p, lng, lat)) continue;
        if (premier === -1) premier = idx; else { autre = true; if (idx < premier) premier = idx; }
      }
      const n = autre ? 2 : 1;
      if (premier !== -1) return { code: unites[premier].code, ambigu: n > 1, proche: false };
      if (tolerance > 0) {
        const m = tolerance / 111320 * 1.5; const vus = new Set(); let meilleur = null, dmin = tolerance;
        for (const dx of [-m, 0, m]) for (const dy of [-m, 0, m]) for (const [idx, p] of candidats(lng + dx, lat + dy)) {
          if (vus.has(p)) continue; vus.add(p);
          if (lng < p.x0 - m || lng > p.x1 + m || lat < p.y0 - m || lat > p.y1 + m) continue;
          const d = distanceMetres(p, lng, lat); if (d < dmin) { dmin = d; meilleur = idx; }
        }
        if (meilleur !== null) return { code: unites[meilleur].code, ambigu: false, proche: true };
      }
      return { code: null, ambigu: false, proche: false };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Agrégation de points par unité
// ---------------------------------------------------------------------------------------------------------------
const lirePoint = (p) => {
  if (!p) return null;
  if (p.geometry) { const g = p.geometry; if (g.type === 'Point') return { lng: g.coordinates[0], lat: g.coordinates[1], props: p.properties || {} }; return null; }
  if (Number.isFinite(p.lng) && Number.isFinite(p.lat)) return { lng: p.lng, lat: p.lat, props: p };
  return null;
};
const mediane = (v) => { if (!v.length) return null; const a = Float64Array.from(v).sort(); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

/**
 * Agrège des points par unité administrative.
 * @param {object[]} points  GeoJSON Feature (Point) ou { lng, lat, ...propriétés }
 * @param {object} index  résultat de creerIndex
 * @param {{champ?:string, categorie?:string, tolerance?:number, affectation?:boolean}} o  affectation : renvoie aussi `codes` (code de l'unité de chaque point, null si aucune)
 * @returns {{unites: Map<string, object>, stats: object, codes?: (string|null)[]}}
 *   unité : { n, nVal, somme, moyenne, mediane, min, max, categories:{cat:n} } ; somme/moyenne/... valent null sans valeur numérique
 *   stats : points, affectes, horsZone, ambigus (points tombés dans plusieurs unités : affectés à la plus petite), proches (rattachés par tolérance), invalides, ms
 */
export function agregerPoints(points, index, o = {}) {
  const { champ = null, categorie = null, tolerance = 0, affectation = false } = o; const codes = affectation ? [] : null; const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
  const acc = new Map(); const stats = { points: 0, affectes: 0, horsZone: 0, ambigus: 0, proches: 0, invalides: 0, ms: 0 };
  for (const src of points || []) {
    const p = lirePoint(src); stats.points++;
    if (!p || !Number.isFinite(p.lng) || !Number.isFinite(p.lat) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) { stats.invalides++; if (codes) codes.push(null); continue; }
    const r = index.trouver(p.lng, p.lat, tolerance);
    if (codes) codes.push(r.code);
    if (r.code === null) { stats.horsZone++; continue; }
    stats.affectes++; if (r.ambigu) stats.ambigus++; if (r.proche) stats.proches++;
    let a = acc.get(r.code); if (!a) acc.set(r.code, (a = { n: 0, vals: [], somme: 0, min: Infinity, max: -Infinity, categories: {} }));
    a.n++;
    if (champ) { const v = lireValeur(p.props[champ]); if (v !== null) { a.vals.push(v); a.somme += v; if (v < a.min) a.min = v; if (v > a.max) a.max = v; } }
    if (categorie) { const c = p.props[categorie]; const k = c === null || c === undefined || c === '' ? '(sans valeur)' : String(c); a.categories[k] = (a.categories[k] || 0) + 1; }
  }
  const unites = new Map();
  for (const [code, a] of acc) {
    const nVal = a.vals.length;
    unites.set(code, { n: a.n, nVal, somme: nVal ? a.somme : null, moyenne: nVal ? a.somme / nVal : null, mediane: nVal ? mediane(a.vals) : null, min: nVal ? a.min : null, max: nVal ? a.max : null, categories: a.categories });
  }
  stats.ms = (typeof performance !== 'undefined' ? performance : Date).now() - t0;
  return codes ? { unites, stats, codes } : { unites, stats };
}

/** Valeur d'une métrique pour une unité agrégée. n, somme, moyenne, mediane, min, max, « n:<cat> » (effectif), « part:<cat> » (part en %). null si indéfinie. */
export function metrique(unite, nom) {
  if (!unite) return null;
  if (nom === 'n') return unite.n;
  if (nom === 'somme' || nom === 'moyenne' || nom === 'mediane' || nom === 'min' || nom === 'max') return unite[nom] ?? null;
  let m = /^n:(.+)$/.exec(nom); if (m) return unite.categories[m[1]] || 0;
  m = /^part:(.+)$/.exec(nom);
  if (m) { const tot = Object.entries(unite.categories).filter(([k]) => k !== '(sans valeur)').reduce((s, [, v]) => s + v, 0); return tot ? (100 * (unite.categories[m[1]] || 0)) / tot : null; }
  throw new Error('métrique inconnue : ' + nom);
}

// ---------------------------------------------------------------------------------------------------------------
// Indicateurs rapportés, petits effectifs, remontée
// ---------------------------------------------------------------------------------------------------------------
/** valeur / base * facteur ; null si la valeur ou la base manque, ou si la base est nulle ou négative. */
export function rapporter(valeur, base, facteur = 1) {
  if (valeur === null || valeur === undefined || !Number.isFinite(valeur)) return null;
  if (base === null || base === undefined || !Number.isFinite(base) || base <= 0) return null;
  return (valeur / base) * facteur;
}
/** Base d'un rapport pour une unité : « population » (habitants) ou « surface » (km²). */
export function baseDe(props, type) {
  if (type === 'population') { const p = lireValeur(props?.population); return p === null || p <= 0 ? null : p; }
  if (type === 'surface') { const s = lireValeur(props?.surface_km2); return s === null || s <= 0 ? null : s; }
  return null;
}
/**
 * Marque les unités dont l'effectif est sous un seuil : la valeur peut être calculée mais elle est instable
 * (un taux sur 3 habitants, une moyenne sur 2 points). `effectif` est le nombre d'observations qui fondent la valeur.
 */
export function signalerPetits(effectifs, seuil) {
  const petits = new Set(); if (!(seuil > 0)) return petits;
  for (const [code, n] of effectifs) if (n !== null && n !== undefined && n < seuil) petits.add(code);
  return petits;
}

/**
 * Remonte des valeurs d'un niveau fin vers un niveau supérieur (communes -> départements -> régions -> pays).
 * @param {Map<string,{num:number|null,den?:number|null}>} lignes  par code du niveau source
 * @param {{source:string, cible:string, mode?:'somme'|'rapport', facteur?:number}} o
 *   somme : somme des num ; rapport : (somme des num) / (somme des den) * facteur. Les taux ne se moyennent JAMAIS.
 * @returns {Map<string,{valeur:number|null, num, den, nSource, nManquants, couverture}>} couverture = part (0-1) des unités source renseignées ;
 *   une somme avec unités manquantes est partielle (couverture < 1) : l'appelant décide de l'afficher ou non.
 */
export function remonter(lignes, o) {
  const { source, cible, mode = 'somme', facteur = 1, attendus = null } = o; const acc = new Map();
  for (const [code, l] of lignes) {
    const parent = ancetre(source, code, cible); if (parent === null || parent === undefined) continue;
    let a = acc.get(parent); if (!a) acc.set(parent, (a = { num: 0, den: 0, nNum: 0, nSource: 0, nManquants: 0 }));
    a.nSource++;
    const num = l.num, den = l.den;
    const ok = num !== null && num !== undefined && Number.isFinite(num) && (mode !== 'rapport' || (den !== null && den !== undefined && Number.isFinite(den)));
    if (!ok) { a.nManquants++; continue; }
    a.num += num; a.nNum++; if (mode === 'rapport') a.den += den;
  }
  const sortie = new Map();
  for (const [p, a] of acc) {
    const attendu = attendus && attendus.get(p) > a.nSource ? attendus.get(p) : a.nSource; // des unités absentes du tableau comptent comme manquantes
    a.nManquants += attendu - a.nSource; a.nSource = attendu;
    const valeur = a.nNum === 0 ? null : mode === 'rapport' ? rapporter(a.num, a.den, facteur) : a.num;
    sortie.set(p, { valeur, num: a.nNum ? a.num : null, den: mode === 'rapport' && a.nNum ? a.den : null, nSource: a.nSource, nManquants: a.nManquants, couverture: a.nSource ? a.nNum / a.nSource : 0 });
  }
  return sortie;
}

/**
 * Nombre d'unités filles attendues par parent, pour détecter les lignes ABSENTES d'un tableau hôte (une somme sans la moitié des communes
 * n'est pas un total). departement -> region et -> pays : table du COG ; commune -> departement / region / epci : `refs` (comptes de l'IGN).
 * Renvoie null quand l'information n'existe pas (le total est alors jugé sur les seules lignes reçues).
 */
export function enfantsAttendus(source, cible, refs = null) {
  const m = new Map();
  if (source === 'departement' && cible === 'region') { for (const d of Object.values(DEPARTEMENTS)) m.set(d.region, (m.get(d.region) || 0) + 1); return m; }
  if (source === 'departement' && cible === 'pays') return new Map([[PAYS_FRANCE, Object.keys(DEPARTEMENTS).length]]);
  if (source === 'region' && cible === 'pays') return new Map([[PAYS_FRANCE, Object.keys(REGIONS).length]]);
  if (source === 'commune' && refs && refs[cible]) { for (const [k, v] of Object.entries(refs[cible])) m.set(k, v.communes); return m; }
  if (source === 'commune' && cible === 'pays' && refs && refs.region) return new Map([[PAYS_FRANCE, Object.values(refs.region).reduce((s, v) => s + v.communes, 0)]]);
  return null;
}

/**
 * Remplace, dans une liste de communes, Paris / Lyon / Marseille par leurs arrondissements municipaux (statistique « fine »).
 * Évite le double compte : une commune et ses arrondissements ne coexistent jamais dans le résultat.
 * Les arrondissements reçoivent `commune` (code de la commune de rattachement).
 */
export function fusionnerArrondissements(communes, arrondissements, cle = 'code') {
  const present = new Set(arrondissements.map((a) => a.properties?.[cle]));
  const detailles = new Set(Object.entries(COMMUNES_PLM).filter(([, v]) => v.arrondissements.every((a) => present.has(a))).map(([c]) => c));
  const sortie = communes.filter((c) => !detailles.has(c.properties?.[cle]));
  for (const a of arrondissements) { const c = communeDeArrondissement(a.properties?.[cle]); if (c && detailles.has(c)) sortie.push({ ...a, properties: { ...a.properties, commune: c, niveau: 'arrondissement' } }); }
  return sortie;
}
/** Regroupe des valeurs d'arrondissements sur leur commune (somme). */
export function arrondissementsVersCommune(valeurs) {
  const sortie = new Map();
  for (const [code, v] of valeurs) { const c = communeDeArrondissement(code) || code; const prev = sortie.get(c); sortie.set(c, v === null ? (prev ?? null) : (prev ?? 0) + v); }
  return sortie;
}
