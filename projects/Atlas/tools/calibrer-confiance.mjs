#!/usr/bin/env node
/**
 * Calibration de la confiance par tronçon (`lib/reseau/confiance.js`).
 *
 *     node tools/calibrer-confiance.mjs <dossier-echantillons> [--ecrire]
 *
 * Lit `echantillons.json` écrit par `mesurer-verite-routage.mjs` : un échantillon = un tronçon retenu par `hmm` ou le
 * mélange, ses douze caractéristiques, et s'il est juste (recouvre au moins la moitié de sa part parcourue sur la vérité
 * de routage). Sépare les DÉPARTEMENTS (un sur trois en test, un sur quatre du reste en validation) : aucun département
 * du test n'a servi à apprendre ni à régler. Apprend une régression logistique (IRLS, ridge), éventuellement corrigée par
 * une régression isotone (choisie sur la validation) ; les classes sont définies par des seuils a priori sur la probabilité
 * calibrée (0,95 et 0,80) ; mesure sur le test la courbe de
 * calibration, l'erreur de calibration attendue (ECE), le score de Brier et la précision par classe. Avec `--ecrire`,
 * écrit `lib/reseau/confiance-modele.js`.
 *
 * La vérité est une vérité de routage, non un relevé : voir `verite-routage.mjs`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { departementsDeTest } from './mesurer-verite-routage.mjs';

const sigmoide = (z) => 1 / (1 + Math.exp(-z));

/** Résout A x = b (élimination de Gauss avec pivot). */
function resoudre(A, b) {
  const n = b.length;
  const M = A.map((l, i) => [...l, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** Régression logistique pondérée par IRLS, avec pénalité ridge sur les poids (pas sur l'ordonnée). */
export function ajusterLogistique(X, y, w, lambda = 1) {
  const n = X.length;
  const d = X[0].length;
  const beta = new Array(d + 1).fill(0);
  const sw = w.reduce((a, b) => a + b, 0) / n;
  const ww = w.map((v) => v / sw);
  for (let it = 0; it < 30; it++) {
    const H = Array.from({ length: d + 1 }, () => new Array(d + 1).fill(0));
    const g = new Array(d + 1).fill(0);
    for (let i = 0; i < n; i++) {
      let z = beta[0];
      for (let j = 0; j < d; j++) z += beta[j + 1] * X[i][j];
      const p = sigmoide(z);
      const v = ww[i] * Math.max(1e-6, p * (1 - p));
      const r = ww[i] * (y[i] - p);
      const xi = [1, ...X[i]];
      for (let a = 0; a <= d; a++) {
        g[a] += r * xi[a];
        for (let b = 0; b <= d; b++) H[a][b] += v * xi[a] * xi[b];
      }
    }
    for (let j = 1; j <= d; j++) { H[j][j] += lambda; g[j] -= lambda * beta[j]; }
    const pas = resoudre(H, g);
    let m = 0;
    for (let j = 0; j <= d; j++) { beta[j] += pas[j]; m = Math.max(m, Math.abs(pas[j])); }
    if (m < 1e-7) break;
  }
  return beta;
}

/** Régression isotone (PAV) pondérée : paliers croissants (x = scores bruts triés, y = fréquence observée). */
export function isotone(scores, y, w) {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
  const blocs = [];
  for (const i of idx) {
    blocs.push({ x0: scores[i], x1: scores[i], s: y[i] * w[i], w: w[i] });
    while (blocs.length > 1 && blocs[blocs.length - 2].s / blocs[blocs.length - 2].w >= blocs[blocs.length - 1].s / blocs[blocs.length - 1].w) {
      const b = blocs.pop();
      const a = blocs[blocs.length - 1];
      a.s += b.s; a.w += b.w; a.x1 = b.x1;
    }
  }
  // points d'interpolation : milieu de chaque palier (réduit à ~100 paliers pour rester lisible)
  const pts = blocs.map((b) => ({ x: (b.x0 + b.x1) / 2, y: b.s / b.w, w: b.w }));
  let reduit = pts;
  while (reduit.length > 120) {
    const f = [];
    for (let i = 0; i < reduit.length; i += 2) {
      const a = reduit[i];
      const b = reduit[i + 1];
      f.push(b ? { x: (a.x * a.w + b.x * b.w) / (a.w + b.w), y: (a.y * a.w + b.y * b.w) / (a.w + b.w), w: a.w + b.w } : a);
    }
    reduit = f;
  }
  return { x: reduit.map((p) => Math.round(p.x * 1e5) / 1e5), y: reduit.map((p) => Math.round(p.y * 1e5) / 1e5) };
}

function interpoler(iso, p) {
  const { x: xs, y: ys } = iso;
  if (p <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (p <= xs[i]) return ys[i - 1] + ((ys[i] - ys[i - 1]) * (p - xs[i - 1])) / Math.max(1e-12, xs[i] - xs[i - 1]);
  return ys[ys.length - 1];
}

/** Courbe de calibration en `k` classes d'effectif égal (pondéré), erreur de calibration attendue, Brier. */
export function calibration(scores, y, w, k = 10) {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
  const W = w.reduce((a, b) => a + b, 0);
  const bins = [];
  let acc = 0;
  let cur = { w: 0, sp: 0, sy: 0, n: 0, min: Infinity, max: -Infinity };
  for (const i of idx) {
    cur.w += w[i]; cur.sp += scores[i] * w[i]; cur.sy += y[i] * w[i]; cur.n++;
    cur.min = Math.min(cur.min, scores[i]); cur.max = Math.max(cur.max, scores[i]);
    acc += w[i];
    if (acc >= (W * (bins.length + 1)) / k && bins.length < k - 1) { bins.push(cur); cur = { w: 0, sp: 0, sy: 0, n: 0, min: Infinity, max: -Infinity }; }
  }
  if (cur.n) bins.push(cur);
  const courbe = bins.map((b) => ({ n: b.n, predit: b.sp / b.w, observe: b.sy / b.w, min: b.min, max: b.max, poids: b.w / W }));
  const ece = courbe.reduce((a, b) => a + b.poids * Math.abs(b.predit - b.observe), 0);
  const brier = idx.reduce((a, i) => a + w[i] * (scores[i] - y[i]) ** 2, 0) / W;
  return { courbe, ece, brier };
}

const parClasse = (scores, y, w, seuils) => {
  const out = { haute: { w: 0, sy: 0, n: 0, juste: 0 }, moyenne: { w: 0, sy: 0, n: 0, juste: 0 }, faible: { w: 0, sy: 0, n: 0, juste: 0 } };
  let W = 0;
  scores.forEach((s, i) => {
    const c = s >= seuils.haute ? 'haute' : s < seuils.moyenne ? 'faible' : 'moyenne';
    out[c].w += w[i]; out[c].sy += y[i] * w[i]; out[c].n++; out[c].juste += y[i]; W += w[i];
  });
  return Object.fromEntries(Object.entries(out).map(([c, o]) => [c, { part: o.w / W, precisionLongueur: o.w ? o.sy / o.w : NaN, precisionNombre: o.n ? o.juste / o.n : NaN, n: o.n }]));
};

/** Seuils des classes fixés sur l'apprentissage : `haute` vise `cibleHaute`, la tranche `moyenne` vise `cibleMoyenne`. */
export function fixerSeuils(scores, y, w, { cibleHaute = 0.95, cibleMoyenne = 0.75 } = {}) {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]); // du meilleur au pire
  let sw = 0;
  let sy = 0;
  let haute = 1.0001;
  const cumul = [];
  for (const i of idx) { sw += w[i]; sy += y[i] * w[i]; cumul.push({ s: scores[i], prec: sy / sw }); }
  for (const c of cumul) if (c.prec >= cibleHaute) haute = c.s; // le plus bas seuil dont la précision cumulée tient la cible
  // tranche moyenne : du seuil haut vers le bas, tant que la précision de la tranche [s, haute) reste >= cibleMoyenne
  let moyenne = haute;
  sw = 0; sy = 0;
  for (const i of idx) {
    if (scores[i] >= haute) continue;
    sw += w[i]; sy += y[i] * w[i];
    if (sy / sw >= cibleMoyenne) moyenne = scores[i];
  }
  return { haute, moyenne };
}

function main() {
  const [dossier, ...reste] = process.argv.slice(2);
  if (!dossier) { console.error('usage : node tools/calibrer-confiance.mjs <dossier-echantillons> [--ecrire]'); process.exit(2); }
  const E = JSON.parse(readFileSync(join(dossier, 'echantillons.json'), 'utf8'));
  const depts = E.map((e) => e.dept);
  const test = departementsDeTest(depts);
  const appr = [...new Set(depts)].filter((d) => !test.has(d)).sort();
  const valid = new Set(appr.filter((_, i) => i % 4 === 3));
  const part = (e) => (test.has(e.dept) ? 'test' : valid.has(e.dept) ? 'validation' : 'apprentissage');
  const jeux = { apprentissage: [], validation: [], test: [] };
  for (const e of E) jeux[part(e)].push(e);
  console.log(`échantillons : ${E.length} (apprentissage ${jeux.apprentissage.length}, validation ${jeux.validation.length}, test ${jeux.test.length}) ; départements test : ${[...test].sort().join(' ')}`);
  const d = E[0].x.length;
  const stats = (S) => {
    const moyenne = new Array(d).fill(0);
    S.forEach((e) => e.x.forEach((v, j) => { moyenne[j] += v / S.length; }));
    const ecartType = new Array(d).fill(0);
    S.forEach((e) => e.x.forEach((v, j) => { ecartType[j] += (v - moyenne[j]) ** 2 / S.length; }));
    return { moyenne, ecartType: ecartType.map((v) => Math.sqrt(v) || 1) };
  };
  const poids = (e) => Math.min(e.parcouru, 500) + 1;
  const entrainer = (S) => {
    const { moyenne, ecartType } = stats(S);
    const X = S.map((e) => e.x.map((v, j) => (v - moyenne[j]) / ecartType[j]));
    const beta = ajusterLogistique(X, S.map((e) => e.juste), S.map(poids), 2);
    return { moyenne, ecartType, intercept: beta[0], poids: beta.slice(1) };
  };
  const brut = (m, e) => {
    let z = m.intercept;
    for (let j = 0; j < d; j++) z += (m.poids[j] * (e.x[j] - m.moyenne[j])) / m.ecartType[j];
    return sigmoide(z);
  };
  const evalue = (S, m, iso) => {
    const s = S.map((e) => (iso ? interpoler(iso, brut(m, e)) : brut(m, e)));
    return { s, y: S.map((e) => e.juste), w: S.map(poids), ...calibration(S.map((e) => (iso ? interpoler(iso, brut(m, e)) : brut(m, e))), S.map((e) => e.juste), S.map(poids)) };
  };
  // choix brut / isotone sur la validation
  const m1 = entrainer(jeux.apprentissage);
  const iso1 = isotone(jeux.apprentissage.map((e) => brut(m1, e)), jeux.apprentissage.map((e) => e.juste), jeux.apprentissage.map(poids));
  const vBrut = evalue(jeux.validation, m1, null);
  const vIso = evalue(jeux.validation, m1, iso1);
  const utiliserIso = vIso.ece < vBrut.ece;
  console.log(`validation : ECE brut ${vBrut.ece.toFixed(4)}, isotone ${vIso.ece.toFixed(4)} -> ${utiliserIso ? 'isotone' : 'logistique seule'}`);
  // modèle final : apprentissage + validation
  const final = [...jeux.apprentissage, ...jeux.validation];
  const m = entrainer(final);
  const iso = utiliserIso ? isotone(final.map((e) => brut(m, e)), final.map((e) => e.juste), final.map(poids)) : null;
  const sFinal = final.map((e) => (iso ? interpoler(iso, brut(m, e)) : brut(m, e)));
  // Seuils FIXÉS A PRIORI sur le sens du score (une probabilité calibrée) : haute = au moins 95 % attendu, moyenne = 80 à 95 %,
  // faible = moins de 80 %. La précision réellement mesurée de chaque classe est rapportée sur le jeu de test.
  const seuils = { haute: 0.95, moyenne: 0.8 };
  void sFinal; void fixerSeuils;
  const rapport = { jeux: Object.fromEntries(Object.entries(jeux).map(([k, v]) => [k, v.length])), departementsTest: [...test].sort(), departementsApprentissage: appr, iso: utiliserIso, seuils, test: {}, apprentissage: {} };
  const modele = {
    version: `confiance-${new Date().toISOString().slice(0, 10)}`,
    caracteristiques: ['postMoy', 'espObs', 'nChoisi', 'dMoy', 'voisines', 'marge', 'longueur', 'part', 'parcouru', 'continuite', 'couverture', 'ruptures'],
    moyenne: m.moyenne.map((v) => Math.round(v * 1e6) / 1e6), ecartType: m.ecartType.map((v) => Math.round(v * 1e6) / 1e6),
    intercept: Math.round(m.intercept * 1e6) / 1e6, poids: m.poids.map((v) => Math.round(v * 1e6) / 1e6),
    isotonique: iso, seuils: { haute: Math.round(seuils.haute * 1e4) / 1e4, moyenne: Math.round(seuils.moyenne * 1e4) / 1e4 },
    appris: { echantillons: final.length, departements: new Set(final.map((e) => e.dept)).size },
  };
  // mesures : apprentissage (final) et test, par méthode
  const mesure = (S, nom) => {
    const sc = S.map((e) => (iso ? interpoler(iso, brut(m, e)) : brut(m, e)));
    const y = S.map((e) => e.juste);
    const w = S.map(poids);
    const cal = calibration(sc, y, w);
    const base = w.reduce((a, b, i) => a + b * y[i], 0) / w.reduce((a, b) => a + b, 0);
    return { n: S.length, precisionGlobale: base, ece: cal.ece, brier: cal.brier, courbe: cal.courbe, classes: parClasse(sc, y, w, modele.seuils) };
  };
  rapport.apprentissage = mesure(final, 'apprentissage');
  rapport.test = {
    tous: mesure(jeux.test, 'test'),
    hmm: mesure(jeux.test.filter((e) => e.methode === 'hmm'), 'hmm'),
    mixte: mesure(jeux.test.filter((e) => e.methode === 'mixte (hmm+pcc)'), 'mixte'),
    'hmm orientée': mesure(jeux.test.filter((e) => e.methode === 'hmm orientée'), 'hmm orientée'),
    'mixte orientée': mesure(jeux.test.filter((e) => e.methode === 'mixte orientée'), 'mixte orientée'),
  };
  for (const dens of ['urbain dense', 'périurbain', 'rural']) rapport.test[dens] = mesure(jeux.test.filter((e) => e.densite === dens), dens);
  for (const niv of ['écart < 5 m', 'écart 5-10 m', 'écart ≥ 10 m']) rapport.test[niv] = mesure(jeux.test.filter((e) => e.niveau === niv), niv);
  const afficher = (nom, r) => {
    console.log(`\n${nom} : ${r.n} tronçons, précision globale ${(100 * r.precisionGlobale).toFixed(1)} %, ECE ${r.ece.toFixed(4)}, Brier ${r.brier.toFixed(4)}`);
    for (const [c, o] of Object.entries(r.classes)) console.log(`  ${c.padEnd(8)} part ${(100 * o.part).toFixed(1).padStart(5)} %  précision (longueur) ${(100 * o.precisionLongueur).toFixed(1).padStart(5)} %  (nombre) ${(100 * o.precisionNombre).toFixed(1).padStart(5)} %  n=${o.n}`);
  };
  afficher('APPRENTISSAGE + VALIDATION', rapport.apprentissage);
  for (const [k, r] of Object.entries(rapport.test)) afficher(`TEST — ${k}`, r);
  console.log('\ncourbe de calibration (test) : prédit -> observé');
  for (const b of rapport.test.tous.courbe) console.log(`  [${b.min.toFixed(2)}-${b.max.toFixed(2)}]  prédit ${b.predit.toFixed(3)}  observé ${b.observe.toFixed(3)}  poids ${(100 * b.poids).toFixed(0)} %  n=${b.n}`);
  console.log('\nseuils :', JSON.stringify(modele.seuils), '| poids :', modele.caracteristiques.map((c, i) => `${c} ${modele.poids[i].toFixed(2)}`).join(', '));
  writeFileSync(join(dossier, 'calibration.json'), JSON.stringify(rapport, null, 1));
  if (reste.includes('--ecrire')) {
    const cible = fileURLToPath(new URL('../lib/reseau/confiance-modele.js', import.meta.url));
    writeFileSync(cible, `/**\n * Modèle de confiance appris par tools/calibrer-confiance.mjs (ne pas éditer à la main).\n * Appris sur ${modele.appris.echantillons} tronçons de ${modele.appris.departements} départements, contre une vérité de routage (voir docs/DONNEES-IGN.md).\n */\nexport const MODELE_CONFIANCE = ${JSON.stringify(modele, null, 2)};\n`);
    console.log('écrit', cible);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
