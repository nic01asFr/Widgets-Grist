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

export const PLAFOND_OCTETS_DEFAUT = 5 * 1024 * 1024;
export const PLAFOND_OCTETS_MAX = 32 * 1024 * 1024;
export const PLAFOND_OBJETS = 2000;
export const PLAFOND_ENTITES = 5000;
export const PLAFOND_SOMMETS = 300000;
export const HAUTEUR_DEFAUT = 3;
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
  let couches = null;
  if (options.couches !== undefined && options.couches !== null) {
    if (!Array.isArray(options.couches) || options.couches.length > 64 || !options.couches.every((c) => typeof c === 'string' && c)) throw new Error("exportScene3D : couches doit être une liste d'identifiants (64 au plus)");
    couches = [...options.couches];
  }
  if (!inclure.objets && !inclure.extrusions && !inclure.bati) throw new Error('exportScene3D : rien à exporter (inclure : objets, extrusions, bati tous à faux)');
  return { bbox, ancre, inclure, hauteurParDefaut, plafondOctets, couches, simplification };
}

/** Le centre d'une emprise. */
export const centreDe = (b) => ({ lng: (b[0] + b[2]) / 2, lat: (b[1] + b[3]) / 2 });

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
 * @returns {number} le nombre de sommets ajoutés (0 si la surface est dégénérée)
 */
export function ajouterPrisme(THREE, lot, anneaux, hauteur, base) {
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
  if (base > 0) plan(base, -1);
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
    scene.add(r);
    stats.objets++;
  }
  if ((e.objets || []).length > PLAFOND_OBJETS) avertissements.push('objets : ' + (e.objets.length - PLAFOND_OBJETS) + ' objet(s) au-delà du plafond de ' + PLAFOND_OBJETS + ' ignoré(s)');

  // --- surfaces extrudées : UNE géométrie INDEXÉE par (couche, couleur, opacité), faite de parois et d'un toit (le fond posé au sol et les coordonnées de texture, inutiles, ne sont pas écrits :
  //     un bâti de quartier pèse ainsi quelques centaines de Ko, et non des Mo). Les trous sont percés, un MultiPolygon donne plusieurs prismes dans la même géométrie.
  const lots = new Map();
  let entites = 0;
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
    for (const rings of polys) ajoute += ajouterPrisme(THREE, lot, rings.map((ring) => anneauLocal(ring, local, e.simplification === undefined ? SIMPLIFICATION_DEFAUT : e.simplification)), hauteur, base);
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
  if (stats.ignores) avertissements.push('ignorés : ' + stats.ignores + ' élément(s) sans géométrie lisible ou au-delà des plafonds (' + PLAFOND_OBJETS + ' objets, ' + PLAFOND_ENTITES + ' surfaces, ' + PLAFOND_SOMMETS + ' sommets)');

  // --- traçabilité : sources et licences dans les extras du fichier ; la liste à part est celle que la commande rend
  scene.userData = {
    atlas: {
      format: FORMAT, unite: 'm', repere: REPERE, ancre: { lng: e.ancre.lng, lat: e.ancre.lat },
      ...(e.emprise ? { emprise: [...e.emprise] } : {}),
      ...(e.genere ? { genere: e.genere } : {}),
      contenu: { objets: stats.objets, extrusions: stats.extrusions },
      attributions: (e.attributions || []).map((a) => ({ source: String(a.source), ...(a.licence ? { licence: String(a.licence) } : {}), ...(a.url ? { url: String(a.url) } : {}) })),
    },
  };
  return { scene, stats, avertissements };
}

/** Une promesse du GLB binaire de la scène (GLTFExporter, passé en paramètre) ; l'ArrayBuffer rendu est celui du fichier. */
export function exporterGlb(GLTFExporter, scene) {
  return new Promise((ok, ko) => {
    try { new GLTFExporter().parse(scene, (glb) => (glb instanceof ArrayBuffer ? ok(glb) : ko(new Error('export : le résultat n\'est pas binaire'))), ko, { binary: true, onlyVisible: false }); }
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
    vues.add(cle); sortie.push({ source: String(a.source), ...(a.licence ? { licence: String(a.licence) } : {}), ...(a.url ? { url: String(a.url) } : {}) });
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
  const B = await import('./bi/batiments.js?v=1.39.0');
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
