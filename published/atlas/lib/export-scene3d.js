/**
 * L'export de la scène 3D d'Atlas en UN fichier GLB (commande `exportScene3D`, contrat 0.6) : pour la réalité augmentée, un QR imprimé, un lecteur 3D, un livre : un support figé,
 * sans Atlas derrière. Le fichier contient les éléments 3D de la scène : les OBJETS (modèles GLB du catalogue ou posés à la main), les COUCHES EXTRUDÉES (surfaces avec leur hauteur,
 * trous compris) et, sur demande, le BÂTI DU FOND (hauteur et base lues dans les tuiles).
 *
 * Repère du fichier (écrit aussi dans ses extras) : mètres ; x vers l'EST, y vers le HAUT, z vers le SUD (convention glTF : le nord est -z) ; le sol est y = 0 (pas d'altitude absolue :
 * le relief n'est pas exporté) ; l'origine est une ancre WGS84 (le centre de l'emprise par défaut). Les objets se placent comme dans Atlas : échelle, rotations (`YXZ`), décalages.
 *
 * Module sans dépendance au navigateur : `THREE` et l'exporteur sont INJECTÉS (`app_v7.js` les charge à la demande), donc la construction de la scène se teste sous Node avec three.js seul.
 * Ce module ne lit ni la carte ni le réseau : il reçoit des descriptions (`objets`, `extrusions`) et rend la scène, puis le GLB.
 */
export const VERSION = '1.0.0';
export const FORMAT = 'atlas-scene3d/1';
export const REPERE = 'x=est, y=haut, z=sud (nord = -z), mètres, sol y=0';

import { normaliserRelief, elargir, RELIEF_COTE_MAX } from './export-relief.js?v=1.41.0';

export const PLAFOND_OCTETS_DEFAUT = 5 * 1024 * 1024;
export const PLAFOND_OCTETS_MAX = 32 * 1024 * 1024;
export const PLAFOND_OBJETS = 2000;
export const PLAFOND_ENTITES = 5000;
export const PLAFOND_SOMMETS = 300000;
export const HAUTEUR_DEFAUT = 3;
export const SOL_RESOLUTION_DEFAUT = 2048;   // pixels, plus grand côté de la texture du fond (« carte »)
export const SOL_COULEUR_DEFAUT = '#e9e6df';
export const ANCRAGE_RELIEF = 0.3;   // mètres dont un volume posé sur le terrain s'enfonce dessous
export const SIMPLIFICATION_DEFAUT = 0.1;   // mètres : les sommets qui s'écartent de moins de 10 cm de la forme sont retirés (un relevé OSM ou une tuile en porte des milliers de superflus)
export const SURFACE_MAX_DEG2 = 4;      // une emprise de plus de 4 degrés carrés n'est pas une scène qu'on pose sur une table
const fini = (v) => typeof v === 'number' && Number.isFinite(v);

/** Les options de la commande, vérifiées ; lève une erreur lisible. `bbox` : [ouest, sud, est, nord] ou null (la vue courante). */
export function normaliserOptions(o) {
  const options = o === undefined ? {} : o;
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error("exportScene3D : un objet d'options est attendu");
  let bbox = null;
  if (options.bbox !== undefined && options.bbox !== null) {
    const b = options.bbox;
    if (!Array.isArray(b) || b.length !== 4 || !b.every(fini) || b[0] < -180 || b[2] > 180 || b[1] < -90 || b[3] > 90 || !(b[0] < b[2]) || !(b[1] < b[3])) throw new Error('exportScene3D : bbox mal formée (ouest, sud, est, nord)');
    if ((b[2] - b[0]) * (b[3] - b[1]) > SURFACE_MAX_DEG2) throw new Error('exportScene3D : emprise trop vaste (' + SURFACE_MAX_DEG2 + ' degrés carrés au plus)');
    bbox = [...b];
  }
  let ancre = null;
  if (options.ancre !== undefined && options.ancre !== null) {
    const a = options.ancre;
    if (!a || typeof a !== 'object' || !fini(a.lng) || !fini(a.lat) || a.lng < -180 || a.lng > 180 || a.lat < -90 || a.lat > 90) throw new Error('exportScene3D : ancre mal formée ({ lng, lat })');
    ancre = { lng: a.lng, lat: a.lat };
  }
  const inclure = { objets: true, extrusions: true, bati: false };
  if (options.inclure !== undefined) {
    if (!options.inclure || typeof options.inclure !== 'object' || Array.isArray(options.inclure)) throw new Error("exportScene3D : inclure doit être un objet ({ objets, extrusions, bati })");
    for (const k of Object.keys(options.inclure)) {
      if (!(k in inclure)) throw new Error('exportScene3D : inclure.' + k + ' inconnu (objets, extrusions, bati)');
      if (typeof options.inclure[k] !== 'boolean') throw new Error('exportScene3D : inclure.' + k + ' doit être vrai ou faux');
      inclure[k] = options.inclure[k];
    }
  }
  const hauteurParDefaut = options.hauteurParDefaut === undefined ? HAUTEUR_DEFAUT : options.hauteurParDefaut;
  if (!fini(hauteurParDefaut) || hauteurParDefaut < 0.1 || hauteurParDefaut > 1000) throw new Error('exportScene3D : hauteurParDefaut hors bornes (0,1 à 1000 mètres)');
  const plafondOctets = options.plafondOctets === undefined ? PLAFOND_OCTETS_DEFAUT : options.plafondOctets;
  if (!Number.isInteger(plafondOctets) || plafondOctets < 1024 || plafondOctets > PLAFOND_OCTETS_MAX) throw new Error('exportScene3D : plafondOctets hors bornes (1 Ko à ' + PLAFOND_OCTETS_MAX / 1048576 + ' Mo)');
  const simplification = options.simplification === undefined ? SIMPLIFICATION_DEFAUT : options.simplification;
  if (!fini(simplification) || simplification < 0 || simplification > 5) throw new Error('exportScene3D : simplification hors bornes (0 à 5 mètres)');
  let sol = normaliserSol(options.sol);
  const relief = normaliserRelief(options.relief);
  // un relief sans sol laisserait le bâti en l'air sur des pentes : il en implique un (aplat, sans épaisseur)
  if (relief && !sol) sol = { mode: 'uni', couleur: null, epaisseur: 0, marge: 0, resolution: SOL_RESOLUTION_DEFAUT };
  let couches = null;
  if (options.couches !== undefined && options.couches !== null) {
    if (!Array.isArray(options.couches) || options.couches.length > 64 || !options.couches.every((c) => typeof c === 'string' && c)) throw new Error("exportScene3D : couches doit être une liste d'identifiants (64 au plus)");
    couches = [...options.couches];
  }
  if (!inclure.objets && !inclure.extrusions && !inclure.bati) throw new Error('exportScene3D : rien à exporter (inclure : objets, extrusions, bati tous à faux)');
  return { bbox, ancre, inclure, hauteurParDefaut, plafondOctets, couches, simplification, sol, relief };
}

/**
 * L'option `sol` : un plan (ou une dalle) sous la scène, pour que le bâti ne flotte pas quand rien n'est dessous (table, lecteur de téléphone).
 * Absente ou `false` : pas de sol. `'uni'` ou `{ mode: 'uni', couleur?, epaisseur?, marge? }` : un aplat. `'carte'` ou `{ mode: 'carte', resolution?, epaisseur?, marge? }` : le fond de carte rendu à plat en texture.
 * @returns {{ mode: 'uni'|'carte', couleur: string|null, epaisseur: number, marge: number, resolution: number }|null}
 */
export function normaliserSol(s) {
  if (s === undefined || s === null || s === false) return null;
  const o = s === true ? { mode: 'uni' } : typeof s === 'string' ? { mode: s } : s;
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error("exportScene3D : sol doit être 'uni', 'carte' ou un objet ({ mode, couleur, epaisseur, marge, resolution })");
  for (const k of Object.keys(o)) if (!['mode', 'couleur', 'epaisseur', 'marge', 'resolution', 'format'].includes(k)) throw new Error('exportScene3D : sol.' + k + ' inconnu (mode, couleur, epaisseur, marge, resolution, format)');
  if (o.format !== undefined && !['auto', 'png', 'jpeg'].includes(o.format)) throw new Error("exportScene3D : sol.format doit être 'auto', 'png' ou 'jpeg'");
  if (o.mode !== 'uni' && o.mode !== 'carte') throw new Error("exportScene3D : sol.mode doit être 'uni' ou 'carte'");
  if (o.couleur !== undefined && !/^#[0-9a-fA-F]{6}$/.test(String(o.couleur))) throw new Error('exportScene3D : sol.couleur doit s\'écrire #rrggbb');
  const epaisseur = o.epaisseur === undefined ? 0 : o.epaisseur, marge = o.marge === undefined ? 0 : o.marge, resolution = o.resolution === undefined ? SOL_RESOLUTION_DEFAUT : o.resolution;
  if (!fini(epaisseur) || epaisseur < 0 || epaisseur > 50) throw new Error('exportScene3D : sol.epaisseur hors bornes (0 à 50 mètres)');
  if (!fini(marge) || marge < 0 || marge > 1000) throw new Error('exportScene3D : sol.marge hors bornes (0 à 1000 mètres)');
  if (!Number.isInteger(resolution) || resolution < 256 || resolution > 4096) throw new Error('exportScene3D : sol.resolution hors bornes (256 à 4096 pixels)');
  return { mode: o.mode, couleur: o.couleur ? String(o.couleur).toLowerCase() : null, epaisseur, marge, resolution, ...(o.format ? { format: o.format } : {}) };
}

/** Le centre d'une emprise. */
export const centreDe = (b) => ({ lng: (b[0] + b[2]) / 2, lat: (b[1] + b[3]) / 2 });

/** Un texte d'attribution sans balises ni entités HTML (« &copy; » devient « © »), pour un fichier ou une légende imprimée. */
export function texteAttribution(html) {
  const noms = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '\u00a9' };
  return String(html || '').replace(/<[^>]*>/g, '').replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, c) => {
    if (c[0] === '#') { const n = c[1] === 'x' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
    return Object.prototype.hasOwnProperty.call(noms, c) ? noms[c] : m;
  }).replace(/\s+/g, ' ').trim();
}

/** La licence d'une attribution de fond de carte, quand on la connaît sans ambiguïté : les données d'OpenStreetMap sont sous ODbL. */
export const licenceDeAttribution = (texte) => (/OpenStreetMap/i.test(texte) ? 'ODbL' : null);

/** Un nom de nœud sûr (glTF laisse passer presque tout, mais le chargeur de three.js retire « : » et « . » : on évite de dépendre de ce nettoyage). */
export const nomSur = (s, repli = 'x') => String(s === undefined || s === null || s === '' ? repli : s).replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60);

/**
 * La projection locale de l'export : longitude/latitude -> mètres autour de l'ancre, x = est, nord = y (avant conversion en z = -nord). Approximation équirectangulaire
 * à l'ancre (l'erreur reste sous le centimètre à 1 km, et d'environ 0,5 % à 25 km : une scène à poser sur une table n'est pas plus vaste).
 */
export function projectionLocale(ancre) {
  const R = 6378137, rad = (d) => (d * Math.PI) / 180, k = Math.cos(rad(ancre.lat));
  return (lng, lat) => ({ x: R * rad(lng - ancre.lng) * k, y: R * rad(lat - ancre.lat) });
}

/** Les rangées d'anneaux d'une géométrie de surface : Polygon -> [rangée], MultiPolygon -> rangées ; autre chose : []. Un anneau de moins de 3 points distincts est écarté. */
export function polygonesDe(geometrie) {
  if (!geometrie || !Array.isArray(geometrie.coordinates)) return [];
  const bons = (rings) => (Array.isArray(rings) ? rings.filter((r) => Array.isArray(r) && r.length >= 4 && r.every((p) => Array.isArray(p) && fini(p[0]) && fini(p[1]))) : []);
  if (geometrie.type === 'Polygon') { const r = bons(geometrie.coordinates); return r.length ? [r] : []; }
  if (geometrie.type === 'MultiPolygon') return geometrie.coordinates.map(bons).filter((r) => r.length);
  return [];
}

/** Une couleur CSS « #rrggbb » (ou « #rgb ») en entier 0xRRGGBB ; gris moyen sinon. */
export function couleurEntiere(c, repli = 0x9a9a9a) {
  if (typeof c !== 'string') return repli;
  const m = /^#([0-9a-fA-F]{6})$/.exec(c.trim()) || /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(c.trim());
  if (!m) return repli;
  return m.length === 2 ? parseInt(m[1], 16) : parseInt(m[1] + m[1] + m[2] + m[2] + m[3] + m[3], 16);
}

/** Ramer-Douglas-Peucker sur un anneau fermé : les sommets à moins de `tol` mètres de la forme sont retirés ; trois points au moins sont gardés. */
export function simplifierAnneau(pts, tol) {
  if (!(tol > 0) || pts.length <= 4) return pts;
  const dist = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy; if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y); const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)); return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)); };
  const e = [...pts, pts[0]];                  // l'anneau refermé : le dernier point est le premier
  const garde = new Array(e.length).fill(false);
  const rec = (i, j) => { let m = -1, dm = tol; for (let k = i + 1; k < j; k++) { const d = dist(e[k], e[i], e[j]); if (d > dm) { dm = d; m = k; } } if (m >= 0) { garde[m] = true; rec(i, m); rec(m, j); } };
  // un anneau n'a pas de début : on le coupe en deux au sommet le plus éloigné du premier
  let loin = 1, dmax = -1; for (let k = 1; k < pts.length; k++) { const d = Math.hypot(pts[k].x - pts[0].x, pts[k].y - pts[0].y); if (d > dmax) { dmax = d; loin = k; } }
  garde[0] = true; garde[loin] = true;
  rec(0, loin); rec(loin, e.length - 1);
  const sortie = pts.filter((_, k) => garde[k]);
  return sortie.length >= 3 ? sortie : pts;
}

/**
 * Un anneau de [lng, lat] rogné à une emprise [ouest, sud, est, nord] (Sutherland-Hodgman, une demi-droite après l'autre) ; rend l'anneau refermé, ou [] s'il ne reste rien.
 * Un anneau entièrement dedans est rendu tel quel (même tableau). Sur une forme concave, le rognage peut laisser des arêtes de largeur nulle le long du bord : sans effet sur le volume.
 */
export function rognerAnneau(ring, b) {
  const dedans = (p) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
  if (ring.every(dedans)) return ring;
  let pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring.slice();
  const bords = [
    [(p) => p[0] >= b[0], (p, q) => [b[0], p[1] + ((q[1] - p[1]) * (b[0] - p[0])) / (q[0] - p[0])]],
    [(p) => p[0] <= b[2], (p, q) => [b[2], p[1] + ((q[1] - p[1]) * (b[2] - p[0])) / (q[0] - p[0])]],
    [(p) => p[1] >= b[1], (p, q) => [p[0] + ((q[0] - p[0]) * (b[1] - p[1])) / (q[1] - p[1]), b[1]]],
    [(p) => p[1] <= b[3], (p, q) => [p[0] + ((q[0] - p[0]) * (b[3] - p[1])) / (q[1] - p[1]), b[3]]],
  ];
  for (const [garde, coupe] of bords) {
    const sortie = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length], pin = garde(p), qin = garde(q);
      if (pin && qin) sortie.push(q);
      else if (pin && !qin) sortie.push(coupe(p, q));
      else if (!pin && qin) { sortie.push(coupe(p, q)); sortie.push(q); }
    }
    pts = sortie;
    if (pts.length < 3) return [];
  }
  return [...pts, pts[0]];
}

/** Un anneau de [lng, lat] en points locaux {x, y} (est, nord) sans le point de fermeture ni les doublons consécutifs, simplifié à `tol` mètres. */
function anneauLocal(ring, local, tol = 0) {
  const pts = [];
  for (const [lng, lat] of ring) {
    const p = local(lng, lat);
    const d = pts[pts.length - 1];
    if (!d || Math.abs(d.x - p.x) > 1e-7 || Math.abs(d.y - p.y) > 1e-7) pts.push(p);
  }
  if (pts.length > 1 && Math.abs(pts[0].x - pts[pts.length - 1].x) < 1e-7 && Math.abs(pts[0].y - pts[pts.length - 1].y) < 1e-7) pts.pop();
  return simplifierAnneau(pts, tol);
}

const aireSignee = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; } return a / 2; };

/**
 * Ajoute à un lot (positions, normales, indices) le prisme d'une surface : parois et toit, et le dessous seulement si la surface est surélevée (`base` > 0). Repère de sortie : x est, y haut,
 * z = -nord. L'anneau extérieur est mis en sens antihoraire, les trous en sens horaire, et chaque triangle est tourné vers l'extérieur (le sens est vérifié, pas supposé).
 * `dessous` : par défaut, seulement si la base n'est pas à zéro ; faux quand la base est enterrée dans un terrain (le dessous est caché, inutile à écrire).
 * @returns {number} le nombre de sommets ajoutés (0 si la surface est dégénérée)
 */
export function ajouterPrisme(THREE, lot, anneaux, hauteur, base, dessous = base !== 0) {
  const [exterieur, ...trous] = anneaux;
  if (!exterieur || exterieur.length < 3 || Math.abs(aireSignee(exterieur)) < 1e-9) return 0;
  const sens = (pts, antihoraire) => ((aireSignee(pts) > 0) === antihoraire ? pts : [...pts].reverse());
  const ext = sens(exterieur, true);
  const interieurs = trous.filter((t) => t.length >= 3 && Math.abs(aireSignee(t)) > 1e-9).map((t) => sens(t, false));
  const depart = lot.pos.length / 3;
  const haut = base + hauteur;
  const pousser = (x, y, z, nx, ny, nz) => { lot.pos.push(x, y, z); lot.nor.push(nx, ny, nz); return lot.pos.length / 3 - 1; };
  const triangle = (a, b, c, nx, ny, nz) => {
    // sens de rotation vérifié : le produit vectoriel doit aller dans le sens de la normale, sinon le triangle est retourné
    const P = (i) => [lot.pos[3 * i], lot.pos[3 * i + 1], lot.pos[3 * i + 2]];
    const A = P(a), B = P(b), C = P(c);
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (n[0] * nx + n[1] * ny + n[2] * nz >= 0) lot.idx.push(a, b, c); else lot.idx.push(a, c, b);
  };
  // parois : un quadrilatère par arête, normale horizontale vers l'extérieur de la matière
  for (const anneau of [ext, ...interieurs]) {
    for (let i = 0; i < anneau.length; i++) {
      const a = anneau[i], b = anneau[(i + 1) % anneau.length];
      const dx = b.x - a.x, dy = b.y - a.y, longueur = Math.hypot(dx, dy);
      if (longueur < 1e-6) continue;
      const nx = dy / longueur, nz = dx / longueur;   // normale (dy, -dx) en plan (est, nord) ; z = -nord donne (dy, 0, +dx)
      const i0 = pousser(a.x, base, -a.y, nx, 0, nz), i1 = pousser(b.x, base, -b.y, nx, 0, nz), i2 = pousser(b.x, haut, -b.y, nx, 0, nz), i3 = pousser(a.x, haut, -a.y, nx, 0, nz);
      triangle(i0, i1, i2, nx, 0, nz); triangle(i0, i2, i3, nx, 0, nz);
    }
  }
  // toit (et dessous surélevé) : triangulation du contour avec ses trous
  const contour = ext.map((p) => new THREE.Vector2(p.x, p.y)), creux = interieurs.map((t) => t.map((p) => new THREE.Vector2(p.x, p.y)));
  let faces = [];
  try { faces = THREE.ShapeUtils.triangulateShape(contour, creux); } catch (e) { faces = []; }
  const tous = [...ext, ...interieurs.flat()];
  const plan = (y, ny) => { const o = tous.map((p) => pousser(p.x, y, -p.y, 0, ny, 0)); for (const [a, b, c] of faces) triangle(o[a], o[b], o[c], 0, ny, 0); };
  plan(haut, 1);
  if (dessous) plan(base, -1);   // surélevé, ou dalle enterrée (base négative) : un dessous (sauf si le terrain le cache)
  return lot.pos.length / 3 - depart;
}

/**
 * Construit la scène three.js.
 * @param {object} THREE  le module three.js
 * @param {{ ancre: {lng:number, lat:number}, versLocal?: (lng:number, lat:number) => {x:number, y:number},
 *           objets?: {id:any, couche:string, racine:object, lng:number, lat:number, echelle?:number, rotX?:number, rotY?:number, azimut?:number, offX?:number, offY?:number, elevation?:number}[],
 *           extrusions?: {id:any, couche:string, geometrie:object, hauteur:number, base?:number, couleur?:string, opacite?:number}[],
 *           attributions?: {source:string, licence?:string, url?:string}[], emprise?: number[]|null, genere?: string }} e
 * @returns {{ scene: object, stats: { objets:number, extrusions:number, sommets:number, ignores:number }, avertissements: string[] }}
 */
export function construireScene(THREE, e) {
  const avertissements = [];
  const versLocal = e.versLocal || projectionLocale(e.ancre);
  const ancreLocale = versLocal(e.ancre.lng, e.ancre.lat);
  const local = (lng, lat) => { const p = versLocal(lng, lat); return { x: p.x - ancreLocale.x, y: p.y - ancreLocale.y }; };
  const scene = new THREE.Scene();
  scene.name = 'atlas-scene3d';
  const stats = { objets: 0, extrusions: 0, sommets: 0, ignores: 0 };
  const rad = (d) => (d * Math.PI) / 180;

  // --- objets : posés comme dans Atlas (`Models3D.placement` : position x est, y haut, z = -nord ; rotation `YXZ` ; échelle uniforme)
  let objetsTotal = 0;
  for (const o of e.objets || []) {
    if (!o || !o.racine || !fini(o.lng) || !fini(o.lat)) { stats.ignores++; continue; }
    if (objetsTotal >= PLAFOND_OBJETS) { stats.ignores++; continue; }
    objetsTotal++;
    const r = o.racine;
    r.name = 'objet_' + nomSur(o.couche) + '_' + nomSur(o.id);
    r.matrixAutoUpdate = true;
    if (o.matrice) {
      // la matrice de l'écran (`Models3D.placement`), déjà ramenée à l'ancre : position, rotation et échelle en sortent telles quelles
      r.matrix.copy(o.matrice);
      r.matrix.decompose(r.position, r.quaternion, r.scale);
    } else {
      const p = local(o.lng, o.lat), s = fini(o.echelle) && o.echelle > 0 ? o.echelle : 1;
      r.position.set(p.x + (fini(o.offX) ? o.offX : 0), fini(o.elevation) ? o.elevation : 0, -p.y - (fini(o.offY) ? o.offY : 0));
      r.scale.set(s, s, s);
      r.rotation.set(rad(fini(o.rotX) ? o.rotX : 0), rad(fini(o.azimut) ? o.azimut : 0), rad(fini(o.rotY) ? o.rotY : 0), 'YXZ');
    }
    r.updateMatrix();
    // les lumières d'un GLB (les `SpotLight` d'un luminaire, lues par Atlas mais jamais rendues) n'ont rien à faire dans un fichier de maquette : elles sont retirées
    const lumieres = []; r.traverse((n) => { if (n.isLight) lumieres.push(n); }); for (const l of lumieres) if (l.parent) l.parent.remove(l);
    scene.add(r);
    stats.objets++;
  }
  if ((e.objets || []).length > PLAFOND_OBJETS) avertissements.push('objets : ' + (e.objets.length - PLAFOND_OBJETS) + ' objet(s) au-delà du plafond de ' + PLAFOND_OBJETS + ' ignoré(s)');

  // --- surfaces extrudées : UNE géométrie INDEXÉE par (couche, couleur, opacité), faite de parois et d'un toit (le fond posé au sol et les coordonnées de texture, inutiles, ne sont pas écrits :
  //     un bâti de quartier pèse ainsi quelques centaines de Ko, et non des Mo). Les trous sont percés, un MultiPolygon donne plusieurs prismes dans la même géométrie.
  const lots = new Map();
  const rogne = e.emprise ? elargir(e.emprise, (e.sol && e.sol.marge) || 0) : null;
  let entites = 0, rognees = 0;
  for (const x of e.extrusions || []) {
    if (!x) { stats.ignores++; continue; }
    if (entites >= PLAFOND_ENTITES || stats.sommets >= PLAFOND_SOMMETS) { stats.ignores++; continue; }
    const polys = polygonesDe(x.geometrie);
    if (!polys.length) { stats.ignores++; continue; }
    const hauteur = fini(x.hauteur) && x.hauteur > 0 ? x.hauteur : HAUTEUR_DEFAUT, base = fini(x.base) && x.base > 0 ? x.base : 0;
    const opacite = fini(x.opacite) && x.opacite < 1 ? Math.max(0, x.opacite) : 1;
    const cle = nomSur(x.couche) + '|' + (typeof x.couleur === 'string' ? x.couleur : '') + '|' + opacite;
    if (!lots.has(cle)) lots.set(cle, { couche: x.couche, couleur: x.couleur, opacite, pos: [], nor: [], idx: [] });
    const lot = lots.get(cle);
    let ajoute = 0;
    for (const rings of polys) {
      // rogné à l'emprise du sol (marge comprise) : un bâtiment ou une surface qui déborde ne sort pas du plan
      let ringsRognes = rings;
      if (rogne) {
        const r = rings.map((ring) => rognerAnneau(ring, rogne));
        if (!r[0].length) { continue; }
        if (r.some((q, i) => q !== rings[i])) rognees++;
        ringsRognes = r.filter((q) => q.length >= 4);
      }
      const anneaux = ringsRognes.map((ring) => anneauLocal(ring, local, e.simplification === undefined ? SIMPLIFICATION_DEFAUT : e.simplification));
      if (e.relief) {
        // posé sur le terrain : la base suit le point le plus BAS de l'emprise au sol (la pente côté haut est mangée par le terrain, et rien ne flotte), enfoncée un peu pour ne laisser aucune fente
        let zmin = Infinity; for (const [lng, lat] of ringsRognes[0]) zmin = Math.min(zmin, e.relief.hauteur(lng, lat));
        if (!Number.isFinite(zmin)) zmin = 0;
        ajoute += base > 0 ? ajouterPrisme(THREE, lot, anneaux, hauteur, zmin + base) : ajouterPrisme(THREE, lot, anneaux, hauteur + ANCRAGE_RELIEF, zmin - ANCRAGE_RELIEF, false);
      } else ajoute += ajouterPrisme(THREE, lot, anneaux, hauteur, base);
    }
    if (!ajoute) { stats.ignores++; continue; }
    stats.sommets += ajoute;
    entites++; stats.extrusions++;
  }
  const matieres = new Map();
  for (const [cle, lot] of lots) {
    if (!lot.idx.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(lot.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(lot.nor, 3));
    geo.setIndex(lot.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(lot.idx, 1) : new THREE.Uint16BufferAttribute(lot.idx, 1));
    if (!matieres.has(cle)) {
      const m = new THREE.MeshStandardMaterial({ color: couleurEntiere(lot.couleur), roughness: 0.9, metalness: 0 });
      if (lot.opacite < 1) { m.transparent = true; m.opacity = lot.opacite; }
      matieres.set(cle, m);
    }
    const maillage = new THREE.Mesh(geo, matieres.get(cle));
    maillage.name = 'couche_' + nomSur(lot.couche) + (lots.size > 1 ? '_' + nomSur(lot.couleur || 'x') : '');
    scene.add(maillage);
  }
  if (rognees) avertissements.push('rognés : ' + rognees + ' volume(s) débordaient de l\'emprise, coupés à son bord');
  if (stats.ignores) avertissements.push('ignorés : ' + stats.ignores + ' élément(s) sans géométrie lisible ou au-delà des plafonds (' + PLAFOND_OBJETS + ' objets, ' + PLAFOND_ENTITES + ' surfaces, ' + PLAFOND_SOMMETS + ' sommets)');

  // --- sol en relief : une grille de terrain (altitudes lues par `e.relief.hauteur`, relatives à l'ancre, exagération comprise), texture de la carte ou aplat, jupe et dessous si épaisseur
  function solRelief() {
    const s = e.sol, R = e.relief, g = R.emprise || e.emprise;
    const sw = local(g[0], g[1]), ne = local(g[2], g[3]);
    const largeur = ne.x - sw.x, profondeur = ne.y - sw.y;
    let pas = R.pas || Math.max(4, Math.max(largeur, profondeur) / 160);
    const cote = RELIEF_COTE_MAX - 1;
    if (Math.ceil(largeur / pas) > cote || Math.ceil(profondeur / pas) > cote) { pas = Math.max(largeur, profondeur) / cote; avertissements.push('relief : maille portée à ' + pas.toFixed(1) + ' m pour tenir sous ' + RELIEF_COTE_MAX + ' sommets par côté'); }
    const nx = Math.max(1, Math.ceil(largeur / pas)), ny = Math.max(1, Math.ceil(profondeur / pas));
    const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    const m0 = merc(g[1]), m1 = merc(g[3]);
    const texture = s.mode === 'carte' && s.texture;
    const pos = [], uv = [];
    let ymin = Infinity, ymax = -Infinity;
    for (let j = 0; j <= ny; j++) {
      const lat = g[1] + ((g[3] - g[1]) * j) / ny;
      for (let i = 0; i <= nx; i++) {
        const lng = g[0] + ((g[2] - g[0]) * i) / nx, p = local(lng, lat), h = R.hauteur(lng, lat);
        pos.push(p.x, h, -p.y);
        uv.push(i / nx, (merc(lat) - m0) / (m1 - m0));
        if (h < ymin) ymin = h; if (h > ymax) ymax = h;
      }
    }
    const idx = [], pitch = nx + 1;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = j * pitch + i, b = a + 1, c = a + pitch + 1, d = a + pitch;
      idx.push(a, b, c, a, c, d);   // vus de dessus, sens antihoraire : la face regarde vers le haut
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (texture) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    const couleur = couleurEntiere(s.couleur || SOL_COULEUR_DEFAUT);
    let matiere;
    if (texture) matiere = new THREE.MeshBasicMaterial({ map: s.texture });   // non éclairé : le fond tel qu'il a été vu, sans ombre propre sur la table
    else { geo.computeVertexNormals(); matiere = new THREE.MeshStandardMaterial({ color: couleur, roughness: 1, metalness: 0 }); }
    const dessus = new THREE.Mesh(geo, matiere);
    dessus.name = 'sol_dessus';
    scene.add(dessus);
    const eps = s.epaisseur || 0;
    if (eps > 0) {
      // une dalle de maquette : le terrain découpé comme une tranche, jupe sur les quatre bords et dessous plat à (point le plus bas - épaisseur)
      const yb = ymin - eps, lot = { pos: [], nor: [], idx: [] };
      const quad = (A, B, C2, D, nx_, ny_, nz_) => {
        const o = lot.pos.length / 3; for (const q of [A, B, C2, D]) { lot.pos.push(q[0], q[1], q[2]); lot.nor.push(nx_, ny_, nz_); }
        const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C2[0] - A[0], C2[1] - A[1], C2[2] - A[2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        if (n[0] * nx_ + n[1] * ny_ + n[2] * nz_ >= 0) lot.idx.push(o, o + 1, o + 2, o, o + 2, o + 3); else lot.idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
      };
      const P = (i, j) => { const k = 3 * (j * pitch + i); return [pos[k], pos[k + 1], pos[k + 2]]; };
      const bas = (q) => [q[0], yb, q[2]];
      for (let i = 0; i < nx; i++) {
        const a = P(i, 0), b = P(i + 1, 0), c = P(i, ny), d = P(i + 1, ny);
        quad(a, b, bas(b), bas(a), 0, 0, 1);          // bord sud (z positif)
        quad(c, d, bas(d), bas(c), 0, 0, -1);         // bord nord
      }
      for (let j = 0; j < ny; j++) {
        const a = P(0, j), b = P(0, j + 1), c = P(nx, j), d = P(nx, j + 1);
        quad(a, b, bas(b), bas(a), -1, 0, 0);         // bord ouest
        quad(c, d, bas(d), bas(c), 1, 0, 0);          // bord est
      }
      quad(bas(P(0, 0)), bas(P(nx, 0)), bas(P(nx, ny)), bas(P(0, ny)), 0, -1, 0);   // dessous, face vers le bas
      const g2 = new THREE.BufferGeometry();
      g2.setAttribute('position', new THREE.Float32BufferAttribute(lot.pos, 3)); g2.setAttribute('normal', new THREE.Float32BufferAttribute(lot.nor, 3)); g2.setIndex(lot.idx);
      const dalle = new THREE.Mesh(g2, new THREE.MeshStandardMaterial({ color: couleur, roughness: 1, metalness: 0 }));
      dalle.name = 'sol_dalle';
      scene.add(dalle);
    }
    stats.sol = s.mode;
    stats.relief = { pas: Math.round(pas * 10) / 10, mailles: nx * ny, min: Math.round(ymin * 100) / 100, max: Math.round(ymax * 100) / 100 };
  }

  // --- sol : un plan à y = 0 sur l'emprise (aplat, ou texture du fond rendu à plat), avec ou sans épaisseur de maquette
  if (e.sol && e.emprise && e.relief) {
    solRelief();
  } else if (e.sol && e.emprise) {
    const s = e.sol, marge = s.marge || 0;
    const coin = (lng, lat) => local(lng, lat);
    const sw = coin(e.emprise[0], e.emprise[1]), ne = coin(e.emprise[2], e.emprise[3]);
    const x0 = sw.x - marge, x1 = ne.x + marge, y0 = sw.y - marge, y1 = ne.y + marge;     // est, nord
    const eps = s.epaisseur || 0;
    const geoPlan = (haut, y, ny, uv) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y, -y0, x1, y, -y0, x1, y, -y1, x0, y, -y1], 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute([0, ny, 0, 0, ny, 0, 0, ny, 0, 0, ny, 0], 3));
      if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
      g.setIndex(haut ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);   // le dessus regarde vers le haut, le dessous vers le bas
      return g;
    };
    const couleur = couleurEntiere(s.couleur || SOL_COULEUR_DEFAUT);
    let dessus;
    if (s.mode === 'carte' && s.texture) {
      const m = new THREE.MeshBasicMaterial({ map: s.texture });   // le fond tel qu'il a été vu : sans éclairage, donc sans ombre ni reflet sur la table
      dessus = new THREE.Mesh(geoPlan(true, 0, 1, true), m);
    } else dessus = new THREE.Mesh(geoPlan(true, 0, 1, false), new THREE.MeshStandardMaterial({ color: couleur, roughness: 1, metalness: 0 }));
    dessus.name = 'sol_dessus';
    scene.add(dessus);
    if (eps > 0) {
      // une dalle de maquette : le dessous et les quatre côtés, de la couleur de l'aplat
      const lot = { pos: [], nor: [], idx: [] };
      ajouterPrisme(THREE, lot, [[{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]], eps, -eps);
      // `ajouterPrisme` pose le toit à `base + hauteur` = 0 (déjà couvert par le dessus) : on ne garde que les parois et le dessous
      const idx = [];
      for (let t = 0; t < lot.idx.length; t += 3) { const a = lot.idx[t]; if (lot.nor[3 * a + 1] !== 1) idx.push(lot.idx[t], lot.idx[t + 1], lot.idx[t + 2]); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(lot.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(lot.nor, 3)); g.setIndex(idx);
      const dalle = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: couleur, roughness: 1, metalness: 0 }));
      dalle.name = 'sol_dalle';
      scene.add(dalle);
    }
    stats.sol = s.mode;
  }

  // --- traçabilité : sources et licences dans les extras du fichier ; la liste à part est celle que la commande rend
  scene.userData = {
    atlas: {
      format: FORMAT, unite: 'm', repere: REPERE, ancre: { lng: e.ancre.lng, lat: e.ancre.lat },
      ...(e.emprise ? { emprise: [...e.emprise] } : {}),
      ...(e.genere ? { genere: e.genere } : {}),
      contenu: { objets: stats.objets, extrusions: stats.extrusions, ...(stats.sol ? { sol: stats.sol } : {}), ...(stats.relief ? { relief: true } : {}) },
      ...(e.relief ? { relief: { source: e.relief.source || 'terrarium', altitudeAncre: e.relief.altitudeAncre, exageration: e.relief.exageration, ...(stats.relief ? { denivele: [stats.relief.min, stats.relief.max] } : {}) } } : {}),
      attributions: (e.attributions || []).map((a) => ({ source: String(a.source), ...(a.licence ? { licence: String(a.licence) } : {}), ...(a.mention ? { mention: String(a.mention) } : {}), ...(a.url ? { url: String(a.url) } : {}) })),
    },
  };
  return { scene, stats, avertissements };
}

/** Une promesse du GLB binaire de la scène (GLTFExporter, passé en paramètre) ; l'ArrayBuffer rendu est celui du fichier. `maxTextureSize` : côté maximal des textures (réduit pour tenir sous le plafond). */
export function exporterGlb(GLTFExporter, scene, { maxTextureSize = Infinity } = {}) {
  return new Promise((ok, ko) => {
    try { new GLTFExporter().parse(scene, (glb) => (glb instanceof ArrayBuffer ? ok(glb) : ko(new Error('export : le résultat n\'est pas binaire'))), ko, { binary: true, onlyVisible: false, maxTextureSize }); }
    catch (e) { ko(e); }
  });
}

/** Les attributions des différentes sources, sans doublons (même source et même licence). */
export function fusionnerAttributions(listes) {
  const vues = new Set(), sortie = [];
  for (const liste of listes) for (const a of liste || []) {
    if (!a || !a.source) continue;
    const cle = a.source + '|' + (a.licence || '');
    if (vues.has(cle)) continue;
    vues.add(cle); sortie.push({ source: String(a.source), ...(a.licence ? { licence: String(a.licence) } : {}), ...(a.mention ? { mention: String(a.mention) } : {}), ...(a.url ? { url: String(a.url) } : {}) });
  }
  return sortie;
}

/** Contrôle du poids : lève une erreur lisible au-delà du plafond. */
export function verifierPoids(octets, plafond) {
  if (octets > plafond) throw new Error('exportScene3D : trop_lourd (' + (octets / 1048576).toFixed(1) + ' Mo pour un plafond de ' + (plafond / 1048576).toFixed(1) + " Mo) : réduisez l'emprise (bbox), les couches ou retirez le bâti (inclure)");
  return octets;
}

/**
 * Le bâti du fond de carte (tuiles vectorielles déjà chargées : celles de la vue), en surfaces à extruder. Même lecture que `getBuildings` (`lib/bi/batiments.js`, importé à la demande) :
 * fragments aux joints de tuiles gardés, entités géantes ignorées, hauteur inconnue (null ou 0) remplacée par `hauteurParDefaut`, dite dans les avertissements.
 * @returns {{ extrusions: object[], credit: object|null, avertissements: string[] }}
 */
export async function batiDuFond(map, bbox, hauteurParDefaut) {
  const B = await import('./bi/batiments.js?v=1.41.0');
  if (!map || typeof map.getSource !== 'function' || !map.getSource('openmaptiles') || typeof map.querySourceFeatures !== 'function') return { extrusions: [], credit: null, avertissements: ["bâti : ce fond de carte n'a pas de bâti (source absente)"] };
  if (map.getZoom() < B.ZOOM_MINIMAL) return { extrusions: [], credit: null, avertissements: ["bâti : le bâti n'est lu qu'à partir du zoom " + B.ZOOM_MINIMAL + " (non exporté)"] };
  const r = B.batimentsDeEntites(map.querySourceFeatures('openmaptiles', { sourceLayer: 'building' }), { bbox, limite: Math.min(B.LIMITE_MAX, PLAFOND_ENTITES), hauteurMin: 0 });
  const inconnues = r.features.filter((f) => !(f.properties.hauteur > 0)).length;
  const extrusions = r.features.map((f, i) => ({ id: f.id !== undefined ? f.id : i, couche: 'bati', geometrie: f.geometry, hauteur: f.properties.hauteur > 0 ? f.properties.hauteur : hauteurParDefaut, base: f.properties.base || 0, couleur: '#d9d6d0', opacite: 1 }));
  const avertissements = r.avertissements.map((a) => 'bâti : ' + a);
  avertissements.push('bâti : seules les tuiles déjà chargées (la vue courante) sont lues');
  if (inconnues) avertissements.push('bâti : ' + inconnues + ' bâtiment(s) sans hauteur connue, posés à ' + hauteurParDefaut + ' m');
  return { extrusions, credit: extrusions.length ? { source: B.ATTRIBUTION, licence: 'ODbL' } : null, avertissements };
}
