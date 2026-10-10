/**
 * Le trafic ne fige pas la page : un réseau réel (carrefours, tronçons courts ou confondus) ne fait pas échouer le moteur, un pas reste court,
 * et un moteur qui échoue est arrêté au lieu de lever une exception cinq fois par seconde.
 * node --test projects/Atlas/tests/trafic-robustesse.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { creerTrafic } from '../lib/trafic-couche.js';
import { carteSimulee } from './aide-carte-bi.js';

const require = createRequire(import.meta.url);
const C = require('../lib/trafic/carrefour.js');

/** Un réseau connexe reproductible : nœuds sur une grille bruitée, arêtes entre voisins et diagonales, sommets intermédiaires, impasses courtes, points confondus. */
function reseauAleatoire(graine, n, etendue, biais) {
  let g0 = graine; const alea = () => { g0 = (g0 * 1664525 + 1013904223) % 4294967296; return g0 / 4294967296; };
  const m = (dx, dy) => [5.3946 + dx / 80900, 43.3047 + dy / 111320];
  const g = Math.max(3, Math.round(Math.sqrt(n / 2))), pas = etendue / g, noeuds = [], f = [];
  const bruit = biais === 'court' ? 0.45 : 0.25;
  for (let i = 0; i <= g; i++) for (let j = 0; j <= g; j++) noeuds.push([(i - g / 2) * pas + (alea() - 0.5) * pas * bruit, (j - g / 2) * pas + (alea() - 0.5) * pas * bruit]);
  const id = (i, j) => i * (g + 1) + j;
  let k = 0;
  const ajouter = (a, b) => {
    const pts = [noeuds[a]];
    for (let q = 1, nb = Math.floor(alea() * 3); q <= nb; q++) { const t = q / (nb + 1); pts.push([noeuds[a][0] + (noeuds[b][0] - noeuds[a][0]) * t + (alea() - 0.5) * 6, noeuds[a][1] + (noeuds[b][1] - noeuds[a][1]) * t + (alea() - 0.5) * 6]); }
    pts.push(noeuds[b]);
    if (biais === 'double' && alea() < 0.3) pts.push(noeuds[b]);
    if (biais === 'double' && alea() < 0.2) pts.splice(1, 0, noeuds[a]);
    f.push({ type: 'Feature', properties: { nature: alea() < 0.15 ? 'Rond-point' : 'Route à 1 chaussée', importance: String(1 + Math.floor(alea() * 5)), nombre_de_voies: String(1 + Math.floor(alea() * 3)), acces_vehicule_leger: 'Libre', sens_de_circulation: alea() < 0.3 ? 'Sens direct' : 'Double sens', cleabs: 'F' + k++ }, geometry: { type: 'LineString', coordinates: pts.map(([x, y]) => m(x, y)) } });
  };
  for (let i = 0; i <= g; i++) for (let j = 0; j <= g; j++) {
    if (i < g && alea() < 0.85) ajouter(id(i, j), id(i + 1, j));
    if (j < g && alea() < 0.85) ajouter(id(i, j), id(i, j + 1));
    if (i < g && j < g && alea() < 0.2) ajouter(id(i, j), id(i + 1, j + 1));
    if (biais === 'court' && alea() < 0.15) { const b = noeuds.length; noeuds.push([noeuds[id(i, j)][0] + (alea() - 0.5) * 12, noeuds[id(i, j)][1] + (alea() - 0.5) * 12]); ajouter(id(i, j), b); }
  }
  return f;
}

test('pointA : une trajectoire de longueur nulle donne son point, sans lever d\'exception', () => {
  const pts = [[3, 4]];
  assert.deepEqual(C.pointA(pts, C.cumul(pts), 0), [3, 4, 0]);
  assert.deepEqual(C.pointA(pts, C.cumul(pts), 12), [3, 4, 0]);
});

for (const [nom, graine, n, etendue, biais] of [['dense', 3, 150, 600, 'long'], ['court', 4, 120, 500, 'court'], ['points confondus', 5, 80, 600, 'double']]) {
  test(`réseau ${nom} : 150 pas du moteur sans exception`, () => {
    for (let essai = 0; essai < 4; essai++) {
      const t = creerTrafic({ carte: carteSimulee(), entites: reseauAleatoire(graine + essai, n, etendue, biais), planifier: () => 0, annuler: () => {} });
      for (let i = 0; i < 150; i++) t._sim.pas();
      assert.ok(t._sim.agents.length > 0);
    }
  });
}

test('un grand réseau (400 tronçons) : aucun pas ne dépasse 1,5 s, le pas courant reste sous 50 ms', () => {
  const t = creerTrafic({ carte: carteSimulee(), entites: reseauAleatoire(3, 400, 1500, 'long'), planifier: () => 0, annuler: () => {} });
  let pire = 0; const tard = [];
  for (let i = 0; i < 200; i++) { const s = performance.now(); t._sim.pas(); const d = performance.now() - s; pire = Math.max(pire, d); if (i >= 100) tard.push(d); }
  assert.ok(pire < 1500, `un pas a duré ${pire.toFixed(0)} ms`);
  assert.ok(tard.reduce((a, b) => a + b, 0) / tard.length < 50, 'le pas courant dépasse 50 ms en moyenne');
});

test('un moteur qui échoue : arrêté au troisième échec de suite, l\'erreur dite une fois, le trafic rendu à la carte', () => {
  const carte = carteSimulee();
  let appels = 0, erreurDite = null, minuterie = null;
  const moteur = {
    construire: () => ({ externes: [1], resume: {} }),
    creer: () => ({ agents: [], t: 0, pas() { appels++; throw new Error('moteur en échec'); }, position: () => null }),
  };
  const t = creerTrafic({ carte, entites: [{ type: 'Feature', properties: { highway: 'residential' }, geometry: { type: 'LineString', coordinates: [[5, 43], [5.002, 43]] } }],
    moteur, planifier: (f) => { minuterie = f; return 1; }, annuler: () => { minuterie = null; }, surErreur: (e) => { erreurDite = e; } });
  t.demarrer();
  assert.equal(t.etat().actif, true, 'une première exception ne l\'arrête pas');
  minuterie(); assert.equal(erreurDite, null);
  minuterie && minuterie();
  assert.equal(appels, 3);
  assert.equal(erreurDite.message, 'moteur en échec');
  assert.equal(t.etat().actif, false);
  assert.equal(t.etat().erreur, 'moteur en échec');
  assert.equal(minuterie, null, 'la minuterie est retirée');
});
