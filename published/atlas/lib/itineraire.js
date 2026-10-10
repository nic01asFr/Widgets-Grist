/**
 * Un itinéraire sur un réseau de lignes : du départ à l'arrivée, par le plus court chemin.
 *
 * Importer la BD TOPO, les routes d'OpenStreetMap ou un linéaire de sentiers donne des **tronçons** : des centaines,
 * des milliers de petites lignes qui se touchent. Définir un trajet en les touchant un à un n'a pas de sens ; on veut
 * dire « de là à là, par ces points », et que le chemin se trace sur le réseau.
 *
 * Le réseau est reconstruit des lignes elles-mêmes : chaque sommet est un nœud, chaque segment une arête, et les
 * bouts de lignes qui se touchent à quelques mètres près sont raccordés (les tronçons d'un export ne tombent pas
 * toujours exactement au même point). Un point de départ, de passage ou d'arrivée se **projette** sur le segment le
 * plus proche — pas besoin de le poser sur un carrefour.
 *
 * Ce que ce module ne sait pas : les sens uniques, les interdictions, la vitesse. Le chemin le plus court, et rien de
 * plus — pour un parcours à pied ou une tournée sur un réseau de sentiers, c'est ce qu'on demande. Il ne s'appuie sur
 * aucun service : il marche sans réseau.
 *
 * Module pur : des coordonnées en entrée, des coordonnées en sortie.
 */

import { distanceMetres } from './releve.js?v=1.14.2';

export const VERSION = '1.0.0';

/** Distance en dessous de laquelle deux bouts de lignes sont tenus pour le même carrefour. */
export const RACCORD_M = 3;
/** Au-delà, un point n'est « sur » aucune ligne : on le dit plutôt que de tracer depuis loin. */
export const ECART_MAX_M = 250;

/**
 * Le sens de circulation de la BD TOPO (`sens_de_circulation`), en trois valeurs. « Sens direct » : du premier au dernier point de la
 * géométrie ; « Sens inverse » : l'inverse ; « Double sens », « Sans objet » et toute autre valeur n'interdisent rien.
 */
export function sensBdTopo(valeur) {
  if (valeur === 'Sens direct') return 'direct';
  if (valeur === 'Sens inverse') return 'inverse';
  return 'double';
}
/**
 * Le sens de circulation d'OpenStreetMap, lu dans les étiquettes que l'import garde telles quelles : `oneway=yes|true|1` -> « direct », `oneway=-1|reverse` ->
 * « inverse », `oneway=no` -> double sens. Sans étiquette `oneway`, un rond-point (`junction=roundabout|circular`) et une autoroute (`highway=motorway`,
 * `motorway_link`) sont à sens unique, comme le dit le modèle d'OSM ; tout le reste est à double sens.
 */
export function sensOsm(proprietes) {
  const p = proprietes || {};
  const o = String(p.oneway ?? '').trim().toLowerCase();
  if (o === 'yes' || o === 'true' || o === '1') return 'direct';
  if (o === '-1' || o === 'reverse') return 'inverse';
  if (o === 'no' || o === 'false' || o === '0') return 'double';
  const jonction = String(p.junction ?? '').toLowerCase();
  if (jonction === 'roundabout' || jonction === 'circular') return 'direct';
  const route = String(p.highway ?? '').toLowerCase();
  if (route === 'motorway' || route === 'motorway_link') return 'direct';
  return 'double';
}

/**
 * Le sens d'une entité : la colonne `sens_de_circulation` de la BD TOPO quand elle est là, sinon les étiquettes d'OpenStreetMap. Une entité qui ne porte ni
 * l'une ni l'autre est à double sens.
 */
const sensDeEntite = (e) => {
  const p = e?.properties;
  if (p && p.sens_de_circulation != null && p.sens_de_circulation !== '') return sensBdTopo(p.sens_de_circulation);
  return sensOsm(p);
};

const CLE = (p) => `${Math.round(p[0] * 1e5)}_${Math.round(p[1] * 1e5)}`;

/** Les lignes d'une entité : une `LineString` en donne une, une `MultiLineString` plusieurs. */
function lignesDe(geometrie) {
  if (!geometrie) return [];
  if (geometrie.type === 'LineString') return [geometrie.coordinates];
  if (geometrie.type === 'MultiLineString') return geometrie.coordinates;
  return [];
}

/**
 * Le réseau d'un ensemble d'entités linéaires.
 *
 * Chaque segment porte le sens de son entité (`sens(entite)` : 'double', 'direct' ou 'inverse' ; par défaut, la BD TOPO). Le réseau est
 * `oriente` dès qu'un segment n'est pas à double sens. Les raccords entre bouts de lignes voisins ne portent aucun sens.
 *
 * @param {Array<{geometry: object}>} entites
 * @param {{ raccordM?: number, sens?: (entite: object) => 'double'|'direct'|'inverse' }} [o]
 * @returns {{ noeuds: number[][], voisins: Array<Array<{vers: number, poids: number, seg: number}>>, segments: Array<{a: number, b: number, sens: string}>, oriente: boolean }}
 */
export function construireReseau(entites, { raccordM = RACCORD_M, sens = sensDeEntite } = {}) {
  const noeuds = [];
  const voisins = [];
  const segments = [];
  const parCle = new Map();
  const bouts = [];

  const noeud = (p) => {
    const k = CLE(p);
    let i = parCle.get(k);
    if (i === undefined) { i = noeuds.length; parCle.set(k, i); noeuds.push([p[0], p[1]]); voisins.push([]); }
    return i;
  };
  const relier = (a, b, poids, seg = -1) => {
    if (a === b) return;
    voisins[a].push({ vers: b, poids, seg });
    voisins[b].push({ vers: a, poids, seg });
  };

  let oriente = false;
  for (const e of entites || []) {
    const sensEntite = sens(e) || 'double';
    for (const ligne of lignesDe(e?.geometry)) {
      const pts = (ligne || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
      if (pts.length < 2) continue;
      let prec = noeud(pts[0]);
      bouts.push(prec);
      for (let i = 1; i < pts.length; i++) {
        const cour = noeud(pts[i]);
        if (cour !== prec) {
          relier(prec, cour, distanceMetres(noeuds[prec], noeuds[cour]), segments.length);
          segments.push({ a: prec, b: cour, sens: sensEntite });
          if (sensEntite !== 'double') oriente = true;
        }
        prec = cour;
      }
      bouts.push(prec);
    }
  }

  // Raccord des bouts : un export tombe rarement au centimètre près là où deux tronçons se rejoignent.
  if (raccordM > 0 && bouts.length) {
    const latMoy = noeuds[bouts[0]][1] * Math.PI / 180;
    const degLat = raccordM / 110540;
    const degLng = raccordM / (111320 * Math.max(0.2, Math.cos(latMoy)));
    const grille = new Map();
    const cellule = (p) => `${Math.floor(p[0] / degLng)}_${Math.floor(p[1] / degLat)}`;
    const vus = new Set();
    for (const n of bouts) {
      if (vus.has(n)) continue;
      vus.add(n);
      const p = noeuds[n];
      const cx = Math.floor(p[0] / degLng);
      const cy = Math.floor(p[1] / degLat);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const m of grille.get(`${cx + dx}_${cy + dy}`) || []) {
            const d = distanceMetres(p, noeuds[m]);
            if (d <= raccordM) relier(n, m, d);
          }
        }
      }
      const k = cellule(p);
      if (!grille.has(k)) grille.set(k, []);
      grille.get(k).push(n);
    }
  }
  return { noeuds, voisins, segments, oriente };
}

/** Le point d'un segment le plus proche de `p`, et sa distance (mètres), en repère local plat. */
function projeterSurSegment(a, b, p) {
  const lat = a[1] * Math.PI / 180;
  const kx = Math.cos(lat) * 111320;
  const ky = 110540;
  const bx = (b[0] - a[0]) * kx;
  const by = (b[1] - a[1]) * ky;
  const px = (p[0] - a[0]) * kx;
  const py = (p[1] - a[1]) * ky;
  const len2 = bx * bx + by * by;
  const u = len2 ? Math.max(0, Math.min(1, (px * bx + py * by) / len2)) : 0;
  const q = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  return { point: q, distance: Math.hypot(px - bx * u, py - by * u) };
}

/** Le segment du réseau le plus proche d'un point. */
export function segmentLePlusProche(reseau, p) {
  let meilleur = null;
  for (let i = 0; i < reseau.segments.length; i++) {
    const s = reseau.segments[i];
    const r = projeterSurSegment(reseau.noeuds[s.a], reseau.noeuds[s.b], p);
    if (!meilleur || r.distance < meilleur.distance) meilleur = { segment: i, ...r };
  }
  return meilleur;
}

/** Un tas binaire minimal : le plus court chemin sur un réseau de milliers de nœuds n'a pas à trier à chaque pas. */
class Tas {
  constructor() { this.v = []; }
  get taille() { return this.v.length; }
  pousser(cle, val) {
    const v = this.v; v.push([cle, val]);
    let i = v.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (v[p][0] <= v[i][0]) break; [v[p], v[i]] = [v[i], v[p]]; i = p; }
  }
  tirer() {
    const v = this.v; const haut = v[0]; const dernier = v.pop();
    if (v.length) {
      v[0] = dernier; let i = 0;
      for (;;) {
        const g = 2 * i + 1; const d = g + 1; let m = i;
        if (g < v.length && v[g][0] < v[m][0]) m = g;
        if (d < v.length && v[d][0] < v[m][0]) m = d;
        if (m === i) break;
        [v[m], v[i]] = [v[i], v[m]]; i = m;
      }
    }
    return haut;
  }
}

/**
 * Le chemin le plus court entre deux points posés sur le réseau.
 * @returns {{ ok: true, coordonnees: number[][], longueurM: number } | { ok: false, raison: string }}
 */
export function cheminEntre(reseau, depart, arrivee, { ecartMaxM = ECART_MAX_M, oriente } = {}) {
  const orienter = oriente === undefined ? !!reseau?.oriente : !!oriente && !!reseau?.oriente;
  const r = chercher(reseau, depart, arrivee, ecartMaxM, orienter);
  // Sans chemin dans le sens permis : dire si un chemin existe sans le respecter, plutôt que de laisser croire à un réseau coupé.
  if (!r.ok && orienter && r.coupe && chercher(reseau, depart, arrivee, ecartMaxM, false).ok) {
    return { ok: false, raison: 'Aucun chemin ne respecte les sens de circulation entre ces deux points (un chemin existe sans les respecter).' };
  }
  return r.ok ? { ok: true, coordonnees: r.coordonnees, longueurM: r.longueurM, oriente: orienter } : { ok: false, raison: r.raison };
}

function chercher(reseau, depart, arrivee, ecartMaxM, orienter) {
  if (!reseau?.segments?.length) return { ok: false, raison: 'Aucune ligne dans le réseau choisi.' };
  const d = segmentLePlusProche(reseau, depart);
  const a = segmentLePlusProche(reseau, arrivee);
  if (!d || d.distance > ecartMaxM) return { ok: false, raison: `Le départ est à plus de ${ecartMaxM} m du réseau.` };
  if (!a || a.distance > ecartMaxM) return { ok: false, raison: `L’arrivée est à plus de ${ecartMaxM} m du réseau.` };

  // Deux nœuds virtuels, posés sur leurs segments : les relier aux deux bouts de chacun.
  const N = reseau.noeuds.length;
  const virtuel = [d.point, a.point];
  const extra = new Map();
  const ajouter = (u, v, poids) => {   // sens u -> v seulement
    if (!extra.has(u)) extra.set(u, []);
    extra.get(u).push({ vers: v, poids });
  };
  const sD = reseau.segments[d.segment];
  const sA = reseau.segments[a.segment];
  // Se déplacer de a vers b sur un segment est permis sauf en « sens inverse » ; de b vers a, sauf en « sens direct ».
  const avantOk = (s) => !orienter || s.sens !== 'inverse';
  const arriereOk = (s) => !orienter || s.sens !== 'direct';
  // Le départ part vers le bout b (déplacement a -> b) ou vers le bout a (b -> a) ; l'arrivée est atteinte depuis a (a -> b) ou depuis b (b -> a).
  if (avantOk(sD)) ajouter(N, sD.b, distanceMetres(d.point, reseau.noeuds[sD.b]));
  if (arriereOk(sD)) ajouter(N, sD.a, distanceMetres(d.point, reseau.noeuds[sD.a]));
  if (avantOk(sA)) ajouter(sA.a, N + 1, distanceMetres(a.point, reseau.noeuds[sA.a]));
  if (arriereOk(sA)) ajouter(sA.b, N + 1, distanceMetres(a.point, reseau.noeuds[sA.b]));
  if (d.segment === a.segment) {
    const enAvant = distanceMetres(reseau.noeuds[sD.a], a.point) >= distanceMetres(reseau.noeuds[sD.a], d.point);
    if (enAvant ? avantOk(sD) : arriereOk(sD)) ajouter(N, N + 1, distanceMetres(d.point, a.point));
  }

  const position = (i) => (i >= N ? virtuel[i - N] : reseau.noeuds[i]);
  const dist = new Map([[N, 0]]);
  const prec = new Map();
  const tas = new Tas();
  tas.pousser(0, N);
  while (tas.taille) {
    const [c, u] = tas.tirer();
    if (c > (dist.get(u) ?? Infinity)) continue;
    if (u === N + 1) break;
    const voisinsDe = [...(u < N ? reseau.voisins[u] : []), ...(extra.get(u) || [])];
    for (const { vers, poids, seg } of voisinsDe) {
      if (orienter && seg >= 0) { // un tronçon ne se prend que dans son sens
        const s = reseau.segments[seg];
        if (u === s.a ? s.sens === 'inverse' : s.sens === 'direct') continue;
      }
      const nc = c + poids;
      if (nc < (dist.get(vers) ?? Infinity)) { dist.set(vers, nc); prec.set(vers, u); tas.pousser(nc, vers); }
    }
  }
  if (!dist.has(N + 1)) {
    return { ok: false, coupe: true, raison: 'Aucun chemin entre ces deux points : le réseau est coupé entre eux (un tronçon manque, ou deux lignes ne se touchent pas).' };
  }
  const chemin = [];
  for (let u = N + 1; u !== undefined; u = prec.get(u)) chemin.push(u);
  chemin.reverse();
  const coordonnees = chemin.map((i) => position(i).slice());
  // Un point projeté sur un nœud donne deux fois la même coordonnée : on ne garde qu'une.
  const nettoye = coordonnees.filter((p, i) => i === 0 || p[0] !== coordonnees[i - 1][0] || p[1] !== coordonnees[i - 1][1]);
  return { ok: true, coordonnees: nettoye, longueurM: dist.get(N + 1) };
}

/**
 * Un itinéraire par plusieurs points : départ, points de passage, arrivée.
 * @param {number[][]} points  au moins deux positions `[lng, lat]`
 */
export function itineraire(reseau, points, o = {}) {
  if (!Array.isArray(points) || points.length < 2) return { ok: false, raison: 'Il faut au moins un départ et une arrivée.' };
  let coordonnees = [];
  let longueurM = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const r = cheminEntre(reseau, points[i], points[i + 1], o);
    if (!r.ok) return { ok: false, raison: points.length > 2 ? `Tronçon ${i + 1} : ${r.raison}` : r.raison, tronçon: i };
    coordonnees = coordonnees.length ? coordonnees.concat(r.coordonnees.slice(1)) : r.coordonnees;
    longueurM += r.longueurM;
  }
  return { ok: true, coordonnees, longueurM };
}
