#!/usr/bin/env node
/**
 * Mesure du calage contre la VÉRITÉ DE ROUTAGE (voir `verite-routage.mjs` : ce que cette vérité est et n'est pas).
 *
 *     node tools/mesurer-verite-routage.mjs <cache> [--sortie <dossier>] [--degradations 4]
 *
 * Pour chaque trajet collecté (`collecter-trajets.mjs`) : on dégrade la ligne du trajet avec le modèle de
 * `degradations-trace.mjs` (4 tirages par trajet), on lance chaque méthode, et on note précision, rappel et F1 en longueur
 * et en nombre de tronçons. Les résultats sont agrégés par contexte (densité, étiquettes), par méthode et par niveau
 * d'écart réel de la ligne dégradée. Les échantillons « un tronçon retenu » (caractéristiques, juste ou faux) sont écrits
 * pour `calibrer-confiance.mjs`.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargerCache, construireCas, evaluer, METHODES } from './verite-routage.mjs';
import { tirage, degrader, ecartMoyen } from './degradations-trace.mjs';
import { rng } from './mesurer-calage.mjs';

/** Niveau de sévérité réel : écart moyen entre la ligne dégradée et la route. */
export const niveauEcart = (m) => (m < 5 ? 'écart < 5 m' : m < 10 ? 'écart 5-10 m' : 'écart ≥ 10 m');

/** Les départements de test : un sur trois, dans l'ordre alphabétique, fixé une fois pour toutes. */
export function departementsDeTest(depts) {
  return new Set([...new Set(depts)].sort().filter((_, i) => i % 3 === 2));
}

/** Lance la mesure sur des cas déjà construits. */
export function mesurer(cas, { degradations = 4, graine = 424242 } = {}) {
  const lignes = [];
  cas.forEach((c, ic) => {
    for (let k = 0; k < degradations; k++) {
      const r = rng(graine + ic * 101 + k * 7919);
      const params = tirage(r);
      const ligne = degrader(c.ligne, params, r);
      const ecart = ecartMoyen(ligne, c.ligne);
      for (const [nom, opts] of METHODES) {
        const e = evaluer(c, ligne, opts);
        lignes.push({
          cas: c.id, famille: c.famille, zone: c.zone, dept: c.dept, densite: c.contexte.densite, tags: c.contexte.tags, deg: k, ecart, niveau: niveauEcart(ecart),
          methode: nom, f1L: e.longueur.f1, precL: e.longueur.precision, rappL: e.longueur.rappel, f1C: e.compte.f1, precC: e.compte.precision, rappC: e.compte.rappel,
          ruptures: e.r.ruptures, contreSens: e.r.contreSens || 0, ok: e.r.ok,
        });
      }
    }
  });
  return { lignes };
}

const moy = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);

/** Agrège les lignes de résultat par une clé (ou plusieurs, pour les étiquettes). */
export function agreger(lignes, cles) {
  const groupes = new Map();
  for (const l of lignes) {
    for (const k of cles(l)) {
      const key = `${k}\u0000${l.methode}`;
      if (!groupes.has(key)) groupes.set(key, []);
      groupes.get(key).push(l);
    }
  }
  const out = {};
  for (const [key, ls] of groupes) {
    const [k, m] = key.split('\u0000');
    (out[k] ||= {})[m] = {
      essais: ls.length, trajets: new Set(ls.map((l) => l.cas)).size,
      f1L: moy(ls.map((l) => l.f1L)), precL: moy(ls.map((l) => l.precL)), rappL: moy(ls.map((l) => l.rappL)),
      f1C: moy(ls.map((l) => l.f1C)), precC: moy(ls.map((l) => l.precC)), rappC: moy(ls.map((l) => l.rappC)),
      ruptures: moy(ls.map((l) => l.ruptures)), sansResultat: ls.filter((l) => !l.ok).length,
    };
  }
  return out;
}

function afficher(titre, tab) {
  console.log(`\n${titre}`);
  console.log('contexte'.padEnd(28), 'méthode'.padEnd(18), 'trajets', 'essais', 'F1 long.', 'préc.', 'rappel', 'F1 nb', 'rupt.');
  for (const [k, parM] of Object.entries(tab)) {
    for (const [m, s] of Object.entries(parM)) {
      console.log(k.padEnd(28), m.padEnd(18), String(s.trajets).padStart(7), String(s.essais).padStart(6), s.f1L.toFixed(2).padStart(8), s.precL.toFixed(2).padStart(5), s.rappL.toFixed(2).padStart(6), s.f1C.toFixed(2).padStart(5), s.ruptures.toFixed(1).padStart(5));
    }
  }
}

async function main() {
  const [cache, ...reste] = process.argv.slice(2);
  if (!cache) { console.error('usage : node tools/mesurer-verite-routage.mjs <cache> [--sortie dossier]'); process.exit(2); }
  const sortie = reste.includes('--sortie') ? reste[reste.indexOf('--sortie') + 1] : null;
  const bruts = chargerCache(cache);
  const cas = bruts.map(construireCas).filter(Boolean);
  console.log(`${bruts.length} trajets lus, ${cas.length} exploitables (>= 90 % de la distance sur des tronçons connus du graphe)`);
  const dens = {};
  for (const c of cas) dens[c.contexte.densite] = (dens[c.contexte.densite] || 0) + 1;
  const tags = {};
  for (const c of cas) for (const t of c.contexte.tags) tags[t] = (tags[t] || 0) + 1;
  console.log('densité :', JSON.stringify(dens), '| étiquettes :', JSON.stringify(tags), '| départements :', new Set(cas.map((c) => c.dept)).size);
  const t0 = Date.now();
  const { lignes } = mesurer(cas, { degradations: Number(reste[reste.indexOf('--degradations') + 1]) || 4 });
  console.log(`${lignes.length} évaluations, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  afficher('Par méthode (tous contextes)', agreger(lignes, () => ['tous']));
  afficher('Par densité', agreger(lignes, (l) => [l.densite]));
  afficher('Par étiquette (un trajet peut en porter plusieurs)', agreger(lignes, (l) => l.tags));
  afficher('Par niveau d’écart réel de la ligne dégradée', agreger(lignes, (l) => [l.niveau]));
  if (sortie) {
    mkdirSync(sortie, { recursive: true });
    writeFileSync(join(sortie, 'lignes.json'), JSON.stringify(lignes));
    writeFileSync(join(sortie, 'cas.json'), JSON.stringify(cas.map((c) => ({ id: c.id, famille: c.famille, zone: c.zone, dept: c.dept, distanceM: c.distanceM, couverture: c.couverture, troncons: c.verite.length, contexte: c.contexte }))));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
