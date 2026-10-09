#!/usr/bin/env node
/**
 * Mesure du calage (`lib/reseau/calage.js`) avec une VÉRITÉ SYNTHÉTIQUE, hors réseau.
 *
 *     node tools/mesurer-calage.mjs
 *
 * Principe, sur des tronçons réels de la BD TOPO figés dans `tests/fixtures/reseau/troncons-mesure.json` :
 *   1. on prend pour vérité un plus court chemin du réseau (de la tête de la plus grande composante au nœud le plus
 *      éloigné à moins de 3 km) ;
 *   2. on DÉGRADE sa géométrie de façon contrôlée : bruit gaussien de 6 m, décimation à 6 sommets, décalage latéral
 *      de 12 m, et le cumul des trois ;
 *   3. on demande à chaque méthode de retrouver la vérité, et on note la part (en longueur) qu'elle en retrouve.
 *
 * Score : F1 pondéré par la longueur sur les portions de tronçons (`f1Troncons`).
 *
 * **Limites, à lire avant de citer un chiffre.** La vérité est un calcul, pas un relevé : `pcc-ligne` (plus court
 * chemin entre les extrémités) lui ressemble par construction, puisque la vérité EST un plus court chemin. Les
 * cas ne couvrent que cinq voisinages. Cela mesure la robustesse à une géométrie dégradée, pas l'exactitude sur des
 * lignes réelles dont on ignore le chemin vrai : il n'existe pas de vérité terrain.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { construireGraphe, composantesConnexes } from '../lib/reseau/graphe-routier.js';
import { tracer, entrePositions, sousLigne } from '../lib/reseau/calage.js';
import { echantillonner, longueur, pointA, cumul } from '../lib/reseau/geo.js';
import { f1Troncons } from '../lib/reseau/mesures-trace.js';

export const METHODES_MESUREES = ['hmm', 'pcc-ligne', 'hmm+pcc'];

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
export function rng(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

const bruit = (ln, sigma, r) => echantillonner(ln, 10).map((p) => [p[0] + sigma * gauss(r), p[1] + sigma * gauss(r)]);
function decimer(ln, n) {
  const L = longueur(ln);
  const cum = cumul(ln);
  return Array.from({ length: n }, (_, k) => pointA(ln, cum, (L * k) / (n - 1)));
}
function decaler(ln, d) {
  const out = [];
  for (let i = 0; i < ln.length; i++) {
    const a = ln[Math.max(0, i - 1)];
    const b = ln[Math.min(ln.length - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    out.push([ln[i][0] + (d * (b[1] - a[1])) / l, ln[i][1] - (d * (b[0] - a[0])) / l]);
  }
  return out;
}

export const DEGRADATIONS = {
  'bruit 6 m': (ln, r) => bruit(ln, 6, r),
  'décimée (6 sommets)': (ln) => decimer(ln, 6),
  'décalage 12 m': (ln) => decaler(echantillonner(ln, 10), 12),
  'cumul (bruit + décimation + décalage)': (ln, r) => decaler(decimer(bruit(ln, 4, r), 8), 10),
};

/** La vérité d'un graphe : plus court chemin de la tête de la plus grande composante au nœud le plus éloigné à moins de 3 km. */
function veriteDe(Gr) {
  const plusGrande = composantesConnexes(Gr)[0];
  const depart = Gr.aretes[plusGrande[0]];
  // Dijkstra sur les nœuds, par balayage (graphes de quelques centaines d'arêtes)
  const n = Gr.noeuds.length;
  const d = new Float64Array(n).fill(Infinity);
  const fait = new Uint8Array(n);
  d[depart.a] = 0;
  for (;;) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) if (!fait[i] && d[i] < best) { best = d[i]; u = i; }
    if (u < 0) break;
    fait[u] = 1;
    for (const ei of Gr.noeuds[u].inc) {
      const e = Gr.aretes[ei];
      const v = e.a === u ? e.b : e.a;
      if (d[u] + e.L < d[v]) d[v] = d[u] + e.L;
    }
  }
  let cible = -1;
  let loin = 0;
  for (let i = 0; i < n; i++) if (d[i] < Infinity && d[i] <= 3000 && d[i] > loin) { loin = d[i]; cible = i; }
  if (cible < 0 || loin < 500) return null;
  const Ec = Gr.aretes.find((e) => e.a === cible || e.b === cible);
  const r = entrePositions(
    Gr,
    { e: depart.id, s: 0 },
    { e: Ec.id, s: Ec.a === cible ? 0 : Ec.L },
    (e) => e.L,
    'verite',
  );
  if (!r) return null;
  const pts = [];
  for (const sg of r.segs) {
    for (const q of sousLigne(Gr.aretes[sg.e], sg.s0, sg.s1)) {
      const l = pts[pts.length - 1];
      if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 0.01) pts.push(q);
    }
  }
  const portions = [];
  for (const sg of r.segs) {
    const lo = Math.min(sg.s0, sg.s1);
    const hi = Math.max(sg.s0, sg.s1);
    const e = Gr.aretes[sg.e];
    const x = portions.find((p) => p.cleabs === e.cleabs);
    if (x) { x.s0 = Math.min(x.s0, lo); x.s1 = Math.max(x.s1, hi); } else portions.push({ cleabs: e.cleabs, s0: lo, s1: hi });
  }
  return { pts, portions: portions.filter((p) => p.s1 - p.s0 > 0.5) };
}

/**
 * Lance la mesure.
 * @param {{graines?: number[], fixture?: object}} [o]
 * @returns {{cas: object[], graines: number[], resume: Record<string, Record<string, object>>}}
 */
export function lancer({ graines = [1, 2, 3], fixture } = {}) {
  const data = fixture || JSON.parse(readFileSync(fileURLToPath(new URL('../tests/fixtures/reseau/troncons-mesure.json', import.meta.url)), 'utf8'));
  const acc = {};
  for (const dn of Object.keys(DEGRADATIONS)) {
    acc[dn] = {};
    for (const m of METHODES_MESUREES) acc[dn][m] = { f1: [], precision: [], rappel: [], vide: 0 };
  }
  const cas = [];
  for (const [id, feats] of Object.entries(data.cas)) {
    const Gr = construireGraphe(feats);
    const v = veriteDe(Gr);
    if (!v) { cas.push({ id, retenu: false }); continue; }
    cas.push({ id, retenu: true, longueurM: Math.round(longueur(v.pts)), troncons: v.portions.length });
    for (const [dn, degrader] of Object.entries(DEGRADATIONS)) {
      for (const g of graines) {
        const ligne = degrader(v.pts, rng(g * 1000 + id.length));
        const geo = { type: 'LineString', coordinates: ligne.map((p) => Gr.repere.depuis(p[0], p[1])) };
        for (const m of METHODES_MESUREES) {
          const r = tracer(Gr, geo, m, { elagage: 0 });
          const s = f1Troncons(v.portions, r.troncons.map((t) => ({ cleabs: t.cleabs, s0: t.s0, s1: t.s1 })));
          const a = acc[dn][m];
          if (!r.troncons.length) a.vide++;
          a.f1.push(s.f1);
          a.precision.push(s.precision);
          a.rappel.push(s.rappel);
        }
      }
    }
  }
  const moy = (x) => x.reduce((a, b) => a + b, 0) / (x.length || 1);
  const resume = {};
  for (const [dn, parMethode] of Object.entries(acc)) {
    resume[dn] = {};
    for (const [m, a] of Object.entries(parMethode)) {
      resume[dn][m] = { f1: moy(a.f1), precision: moy(a.precision), rappel: moy(a.rappel), sansResultat: a.vide, essais: a.f1.length };
    }
  }
  return { cas, graines, resume };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = lancer();
  console.log('cas retenus :', r.cas.filter((c) => c.retenu).map((c) => `${c.id} (${c.longueurM} m, ${c.troncons} tronçons)`).join(' ; '), '| graines', r.graines.length);
  console.log('dégradation'.padEnd(40), 'méthode'.padEnd(10), 'F1', ' précision', 'rappel', 'sans résultat');
  for (const [dn, parMethode] of Object.entries(r.resume)) {
    for (const [m, s] of Object.entries(parMethode)) {
      console.log(dn.padEnd(40), m.padEnd(10), s.f1.toFixed(2).padStart(4), s.precision.toFixed(2).padStart(9), s.rappel.toFixed(2).padStart(6), `${s.sansResultat}/${s.essais}`.padStart(8));
    }
  }
}
