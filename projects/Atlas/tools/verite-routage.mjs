/**
 * Une VÉRITÉ DE ROUTAGE pour mesurer le calage : des trajets calculés par le service d'itinéraire de la Géoplateforme
 * (`bdtopo-pgr`, séquence de `cleabs` de chaque étape), indépendants de la méthode de calage.
 *
 * **Ce que cette vérité est, et n'est pas.** C'est la sortie d'un moteur de routage appliqué à la BD TOPO : elle est
 * indépendante de la méthode de calage (autre algorithme, autre code), mais pas de la donnée (même BD TOPO). Elle ne dit
 * rien d'un défaut de la BD TOPO (tronçon manquant, sens erroné), ni de la route réellement empruntée par un véhicule ou
 * dessinée par une personne. Les trajets sont des plus courts ou plus rapides chemins : ils sous-représentent les
 * itinéraires atypiques, les demi-tours, les trajets qui s'attardent. Aucune relecture humaine n'intervient.
 *
 * Ce module construit, d'un trajet et de son réseau, un « cas » : le graphe, la vérité en portions de tronçons, le
 * contexte (densité, tags) et la ligne de départ ; il évalue une méthode sur une ligne dégradée.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { construireGraphe } from '../lib/reseau/graphe-routier.js';
import { tracer, sousLigne } from '../lib/reseau/calage.js';
import { projLigne, longueur, echantillonner, distPtLignes } from '../lib/reseau/geo.js';
import { f1Troncons } from '../lib/reseau/mesures-trace.js';

/** Lit un dossier de cache de `collecter-trajets.mjs` : [{ trajet, features }] des trajets complets. */
export function chargerCache(dossier) {
  const out = [];
  const api = join(dossier, 'api');
  for (const f of readdirSync(api).sort()) {
    const trajet = JSON.parse(readFileSync(join(api, f), 'utf8'));
    if (trajet.rejet) continue;
    const w = join(dossier, 'wfs', f);
    if (!existsSync(w)) continue;
    out.push({ trajet, features: JSON.parse(readFileSync(w, 'utf8')) });
  }
  return out;
}

/**
 * Construit un cas. Rend `null` si la vérité n'est pas exploitable (moins de 90 % de la distance du trajet sur des
 * tronçons connus du graphe lu : édition différente de la BD TOPO, tronçon filtré).
 */
export function construireCas({ trajet, features }) {
  const Gr = construireGraphe(features);
  if (!Gr.repere) return null;
  const portions = [];
  const ordre = []; // portions dans l'ordre du trajet, avec le sens du parcours quand il est lisible
  let connu = 0;
  let total = 0;
  let inconnus = 0;
  const indetermines = new Set(); // tronçons parcourus mais dont l'étape n'a qu'une position : portion inconnue, ni juste ni faux
  for (const e of trajet.etapes) {
    total += e.distanceM || 0;
    if (!e.cleabs) continue;
    const E = Gr.parCleabs.get(e.cleabs);
    if (!E) { inconnus++; continue; }
    connu += e.distanceM || 0;
    // MESURÉ : la géométrie d'une étape du service omet le segment qui part du début du tronçon (elle commence à son
    // deuxième sommet). Seules la distance de l'étape et la fin de sa géométrie sont fiables. Une étape qui couvre le
    // tronçon entier (distance = longueur, à 8 % ou 3 m près) donne [0, L] ; sinon (début ou fin du trajet, tronçon
    // coupé au point d'accroche) la portion est la dernière position de la géométrie, remontée de la distance de l'étape,
    // dans le sens du parcours ; une étape sans sens lisible (une seule position) est indéterminée.
    const d = e.distanceM || 0;
    if (Math.abs(d - E.L) <= Math.max(3, 0.08 * E.L)) { portions.push({ cleabs: e.cleabs, arete: E.id, s0: 0, s1: E.L }); ordre.push({ arete: E.id, lo: 0, hi: E.L, sens: 0 }); continue; }
    const c = e.geometrie ? e.geometrie.coordinates : [];
    if (c.length < 2) { indetermines.add(e.cleabs); continue; }
    const a = projLigne(Gr.repere.vers(c[0]), E.pts, E.cum);
    const b = projLigne(Gr.repere.vers(c[c.length - 1]), E.pts, E.cum);
    const sens = b.s >= a.s ? 1 : -1;
    const debut = Math.max(0, Math.min(E.L, b.s - sens * d));
    portions.push({ cleabs: e.cleabs, arete: E.id, s0: debut, s1: b.s });
    ordre.push({ arete: E.id, lo: Math.min(debut, b.s), hi: Math.max(debut, b.s), sens });
  }
  if (!total || connu / total < 0.9) return null;
  // regrouper par tronçon (un tronçon repassé reste une seule portion)
  const parCleabs = new Map();
  for (const p of portions) {
    const lo = Math.min(p.s0, p.s1);
    const hi = Math.max(p.s0, p.s1);
    const x = parCleabs.get(p.cleabs);
    if (x) { x.s0 = Math.min(x.s0, lo); x.s1 = Math.max(x.s1, hi); } else parCleabs.set(p.cleabs, { cleabs: p.cleabs, arete: p.arete, s0: lo, s1: hi });
  }
  const verite = [...parCleabs.values()].filter((p) => p.s1 - p.s0 > 1);
  for (const p of verite) indetermines.delete(p.cleabs);
  if (verite.length < 2) return null;
  // La ligne de départ est la géométrie BD TOPO des tronçons du trajet, dans l'ordre et le sens du parcours (la géométrie
  // d'ensemble du service, elle, saute le premier segment de chaque tronçon) ; repli sur celle du service si le trajet a des trous.
  let ligne = ligneDuTrajet(Gr, ordre);
  const lgAttendue = trajet.distanceM || 0;
  if (!ligne || ligne.length < 3 || Math.abs(longueur(ligne) - lgAttendue) > 0.25 * lgAttendue) ligne = trajet.geometrie.coordinates.map((p) => Gr.repere.vers(p));
  const cas = { id: trajet.id, famille: trajet.famille, zone: trajet.zone, dept: trajet.dept, Gr, verite, ligne, couverture: connu / total, inconnus, indetermines, distanceM: trajet.distanceM };
  cas.contexte = contexteDe(cas);
  return cas;
}

/** La ligne (mètres) formée par les portions de tronçons du trajet, orientées de proche en proche. */
function ligneDuTrajet(Gr, ordre) {
  if (!ordre.length) return null;
  const pts = [];
  const proches = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  ordre.forEach((o, i) => {
    const E = Gr.aretes[o.arete];
    let sens = o.sens;
    if (!sens) {
      const suivant = ordre[i + 1] ? Gr.aretes[ordre[i + 1].arete] : null;
      if (pts.length) {
        const fin = pts[pts.length - 1];
        sens = proches(fin, E.pts[0]) <= proches(fin, E.pts[E.pts.length - 1]) ? 1 : -1;
      } else if (suivant) {
        const versB = [suivant.a, suivant.b].includes(E.b) ? 1 : [suivant.a, suivant.b].includes(E.a) ? -1 : 1;
        sens = versB;
      } else sens = 1;
    }
    const morceau = sens > 0 ? sousLigne(E, o.lo, o.hi) : sousLigne(E, o.hi, o.lo);
    for (const q of morceau) if (!pts.length || proches(pts[pts.length - 1], q) > 0.01) pts.push(q);
  });
  return pts;
}

/** Le contexte d'un cas : densité (exclusive) et étiquettes (non exclusives), calculés sur le réseau et la vérité. */
export function contexteDe(cas) {
  const { Gr, verite, ligne } = cas;
  const L = verite.reduce((a, p) => a + (p.s1 - p.s0), 0) || 1;
  const parLongueur = (pred) => verite.reduce((a, p) => a + (pred(Gr.aretes[p.arete]) ? p.s1 - p.s0 : 0), 0);
  const urbain = parLongueur((e) => e.props.urbain === true || e.props.urbain === 'true') / L;
  const carrefours = new Set();
  for (const p of verite) for (const n of [Gr.aretes[p.arete].a, Gr.aretes[p.arete].b]) if (Gr.noeuds[n].inc.length >= 3) carrefours.add(n);
  const parKm = carrefours.size / (L / 1000);
  let densite = 'périurbain';
  if (urbain >= 0.8 && parKm >= 8) densite = 'urbain dense';
  else if (urbain < 0.3) densite = 'rural';
  const droite = Math.hypot(ligne[ligne.length - 1][0] - ligne[0][0], ligne[ligne.length - 1][1] - ligne[0][1]) || 1;
  const sinuosite = longueur(ligne) / droite;
  const tags = [];
  if (parLongueur((e) => e.sens === 'direct' || e.sens === 'inverse') / L >= 0.1) tags.push('sens uniques');
  if (verite.some((p) => Gr.aretes[p.arete].rond)) tags.push('giratoire');
  if (parLongueur((e) => e.nature === 'Bretelle') >= 100) tags.push('échangeur');
  if (parLongueur((e) => e.nature === 'Route à 2 chaussées' || e.nature === 'Type autoroutier') >= 200) tags.push('chaussées séparées');
  if (densite !== 'urbain dense' && sinuosite >= 1.4) tags.push('sinueux');
  // voies parallèles : une autre arête court à moins de 30 m, sans que ses deux bouts soient près du point
  const dansVerite = new Set(verite.map((p) => p.arete));
  let alongside = 0;
  let n = 0;
  for (const q of echantillonner(ligne, 20)) {
    n++;
    for (const e of Gr.aretes) {
      if (dansVerite.has(e.id)) continue;
      if (q[0] < e.bb[0] - 30 || q[0] > e.bb[2] + 30 || q[1] < e.bb[1] - 30 || q[1] > e.bb[3] + 30) continue;
      if (distPtLignes(q, [e.pts]) > 30) continue;
      const debut = Math.hypot(e.pts[0][0] - q[0], e.pts[0][1] - q[1]);
      const fin = Math.hypot(e.pts[e.pts.length - 1][0] - q[0], e.pts[e.pts.length - 1][1] - q[1]);
      if (debut > 40 && fin > 40) { alongside++; break; }
    }
  }
  if (n && alongside / n >= 0.25) tags.push('voies parallèles');
  return { densite, tags, urbain, carrefoursParKm: parKm, sinuosite, voisinesParalleles: n ? alongside / n : 0 };
}

/** Précision, rappel et F1 en nombre de tronçons : un tronçon prédit est juste s'il recouvre au moins 50 % de sa propre portion sur la vérité. */
export function f1Compte(verite, essai) {
  const v = new Map(verite.map((t) => [t.cleabs, t]));
  let justes = 0;
  for (const e of essai) {
    const t = v.get(e.cleabs);
    if (t && Math.min(t.s1, e.s1) - Math.max(t.s0, e.s0) >= 0.5 * (e.s1 - e.s0)) justes++;
  }
  const retrouves = verite.filter((t) => {
    const e = essai.find((x) => x.cleabs === t.cleabs);
    return e && Math.min(t.s1, e.s1) - Math.max(t.s0, e.s0) >= 0.5 * (t.s1 - t.s0);
  }).length;
  const precision = essai.length ? justes / essai.length : 0;
  const rappel = verite.length ? retrouves / verite.length : 0;
  return { precision, rappel, f1: precision + rappel ? (2 * precision * rappel) / (precision + rappel) : 0, justes };
}

export const METHODES = [
  ['hmm', { methode: 'hmm' }],
  ['hmm orientée', { methode: 'hmm', orientee: true }],
  ['pcc-ligne', { methode: 'pcc-ligne' }],
  ['mixte (hmm+pcc)', { methode: 'hmm+pcc' }],
  ['mixte orientée', { methode: 'hmm+pcc', orientee: true }],
];

/** Évalue une méthode sur une ligne dégradée (mètres) : scores, résultat et étiquette de chaque tronçon retenu. */
export function evaluer(cas, ligneDegradee, { methode, orientee = false, ...opts }) {
  const Gr = cas.Gr;
  const geo = { type: 'LineString', coordinates: ligneDegradee.map((p) => Gr.repere.depuis(p[0], p[1])) };
  const r = tracer(Gr, geo, methode, { elagage: 0, orientee, ...opts });
  // un tronçon dont la portion vraie est indéterminée n'est compté ni juste ni faux
  const connus = r.troncons.map((t) => !cas.indetermines.has(t.cleabs));
  const essai = r.troncons.filter((_, i) => connus[i]).map((t) => ({ cleabs: t.cleabs, s0: t.s0, s1: t.s1 }));
  const lon = f1Troncons(cas.verite, essai);
  const cpt = f1Compte(cas.verite, essai);
  const v = new Map(cas.verite.map((t) => [t.cleabs, t]));
  const etiquettes = r.troncons.map((t) => {
    const x = v.get(t.cleabs);
    const rec = x ? Math.max(0, Math.min(x.s1, t.s1) - Math.max(x.s0, t.s0)) : 0;
    return { cleabs: t.cleabs, parcouru: t.parcouru, juste: rec >= 0.5 * (t.s1 - t.s0) ? 1 : 0, recouvre: rec, connu: !cas.indetermines.has(t.cleabs) };
  });
  return { r, longueur: lon, compte: cpt, etiquettes };
}
