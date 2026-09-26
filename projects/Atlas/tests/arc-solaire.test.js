import test from 'node:test';
import assert from 'node:assert/strict';
import {
  minutesDepuisPosition, positionDepuisMinutes, courbeHauteurs, geometrieArc,
  libelleHeure, minutesApresTouche,
} from '../lib/arc-solaire.js';
import { positionSoleil } from '../lib/soleil.js';
import { instantLocal } from '../lib/eclairage-profil.js';

test('l’arc couvre les vingt-quatre heures, nuit comprise', () => {
  assert.equal(minutesDepuisPosition(0), 0);
  assert.equal(minutesDepuisPosition(1), 1439);
  assert.equal(minutesDepuisPosition(0.5), 720);
  // 2 h du matin et 23 h, hors de l'ancienne plage 6 h – 20 h.
  assert.equal(minutesDepuisPosition(2 / 24), 120);
  assert.equal(minutesDepuisPosition(23 / 24), 1380);
  assert.equal(minutesDepuisPosition(-1), 0);
  assert.equal(minutesDepuisPosition(NaN), 0);
  for (const m of [0, 1, 359, 720, 1200, 1439]) {
    assert.equal(minutesDepuisPosition(positionDepuisMinutes(m)), m);
  }
  assert.equal(positionDepuisMinutes(-60), 1380 / 1440);
});

test('l’arc suit la hauteur réelle du soleil : sous l’horizon la nuit', () => {
  const fuseau = 'Europe/Paris';
  const hauteurA = (min) => positionSoleil(43.33, 5.44, instantLocal('2026-01-15', min, fuseau)).hauteur;
  const courbe = courbeHauteurs(hauteurA, 30);
  assert.equal(courbe.length, 49);
  const g = geometrieArc(courbe);
  assert.match(g.chemin, /^M/);
  // Minuit sous l'horizon, midi au-dessus (y SVG croît vers le bas).
  assert.ok(g.point(0).y > g.horizonY);
  assert.ok(g.point(12 * 60 + 45).y < g.horizonY);
  assert.ok(g.point(23 * 60).y > g.horizonY);
  // Le point reste dans la boîte.
  for (let m = 0; m <= 1440; m += 17) {
    const p = g.point(m);
    assert.ok(p.x >= 8 && p.x <= 160 && p.y >= 0 && p.y <= 34, `minute ${m}`);
  }
});

test('libellés et clavier', () => {
  assert.equal(libelleHeure(0), '00:00');
  assert.equal(libelleHeure(1439), '23:59');
  assert.equal(libelleHeure(1440), '00:00');
  assert.equal(minutesApresTouche(1435, 'ArrowRight'), 0);
  assert.equal(minutesApresTouche(0, 'ArrowLeft'), 1435);
  assert.equal(minutesApresTouche(600, 'ArrowRight', true), 660);
  assert.equal(minutesApresTouche(600, 'Enter'), null);
});
