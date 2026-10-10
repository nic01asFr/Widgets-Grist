/**
 * Le cap de la personne : montré seulement en mouvement, ramené dans [0, 360[.
 *
 * node --test projects/Atlas/tests/cap-position.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { capUtilisable, VITESSE_MIN_MS } from '../lib/cap-position.js';

test('en mouvement, le cap du GPS est rendu tel quel', () => {
  assert.equal(capUtilisable({ heading: 90, speed: 3 }), 90);
  assert.equal(capUtilisable({ heading: 0, speed: 1.5 }), 0);
});

test('un cap hors de [0, 360[ est ramené dedans', () => {
  assert.equal(capUtilisable({ heading: 370, speed: 2 }), 10);
  assert.equal(capUtilisable({ heading: -90, speed: 2 }), 270);
  assert.equal(capUtilisable({ heading: 360, speed: 2 }), 0);
});

test('à l\'arrêt, ou sous la vitesse minimale, pas de cap', () => {
  assert.equal(capUtilisable({ heading: 90, speed: 0 }), null);
  assert.equal(capUtilisable({ heading: 90, speed: VITESSE_MIN_MS - 0.01 }), null);
  assert.equal(capUtilisable({ heading: 90, speed: VITESSE_MIN_MS }), 90);
  assert.equal(capUtilisable({ heading: 90, speed: 0.3 }, { vitesseMin: 0.2 }), 90);
});

test('cap ou vitesse absents, nuls ou illisibles : pas de cap', () => {
  for (const c of [null, undefined, {}, { heading: null, speed: 3 }, { heading: NaN, speed: 3 }, { heading: '90', speed: 3 },
    { heading: 90, speed: null }, { heading: 90, speed: NaN }, { heading: 90 }, { heading: Infinity, speed: 3 }]) {
    assert.equal(capUtilisable(c), null, JSON.stringify(c));
  }
});
