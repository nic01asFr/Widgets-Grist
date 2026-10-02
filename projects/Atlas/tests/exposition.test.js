import test from 'node:test';
import assert from 'node:assert/strict';
import {
  expositionVide, normaliserExposition, expositionDepuisJSON, ouvertureEffective, OUVERTURES,
} from '../lib/exposition.js';

const recit = [
  { cle: 'a', title: 'Intro', state: {} },
  { cle: 'b', title: 'Secteur nord', state: { usage: { contexte: true } } },
];

test('par defaut la scene s ouvre sur la carte', () => {
  assert.deepEqual(expositionVide(), { ouverture: { mode: 'carte' } });
  assert.deepEqual(expositionDepuisJSON(''), expositionVide());
  assert.deepEqual(expositionDepuisJSON('pas du json'), expositionVide());
  assert.deepEqual(OUVERTURES, ['carte', 'recit', 'contexte']);
});

test('un bloc inconnu ou abime ne passe pas : jamais de mode que le code ne connait pas', () => {
  assert.deepEqual(normaliserExposition({ ouverture: { mode: 'hologramme' } }), expositionVide());
  assert.deepEqual(normaliserExposition(null), expositionVide());
  assert.deepEqual(normaliserExposition([1, 2]), expositionVide());
  assert.deepEqual(normaliserExposition({ ouverture: 'recit' }), expositionVide());
});

test('un contexte sans cle ne designe rien : carte', () => {
  assert.deepEqual(normaliserExposition({ ouverture: { mode: 'contexte' } }), expositionVide());
  assert.deepEqual(normaliserExposition({ ouverture: { mode: 'contexte', cle: 'b' } }), { ouverture: { mode: 'contexte', cle: 'b' } });
});

test('ce que l auteur regle ne s applique pas a celui qui prepare', () => {
  const expo = { ouverture: { mode: 'recit' } };
  assert.deepEqual(ouvertureEffective({ exposition: expo, story: recit, posture: 'preparer' }), { mode: 'carte' });
  assert.deepEqual(ouvertureEffective({ exposition: expo, story: recit, posture: 'lecture' }), { mode: 'recit' });
  assert.deepEqual(ouvertureEffective({ exposition: expo, story: recit, posture: 'exploiter' }), { mode: 'recit' });
});

test('un reglage que la scene ne peut plus tenir retombe sur la carte, pas sur du vide', () => {
  assert.deepEqual(ouvertureEffective({ exposition: { ouverture: { mode: 'recit' } }, story: [], posture: 'lecture' }), { mode: 'carte' });
  const ctx = { ouverture: { mode: 'contexte', cle: 'b' } };
  assert.deepEqual(ouvertureEffective({ exposition: ctx, story: recit, posture: 'lecture' }), { mode: 'contexte', cle: 'b', index: 1 });
  // L'etape n'est plus proposee comme contexte, ou a ete supprimee.
  assert.deepEqual(ouvertureEffective({ exposition: ctx, story: [recit[0]], posture: 'lecture' }), { mode: 'carte' });
  assert.deepEqual(ouvertureEffective({ exposition: ctx, story: [{ cle: 'b', state: {} }], posture: 'lecture' }), { mode: 'carte' });
});

test('un contexte se retrouve par sa cle, pas par son rang', () => {
  const ctx = { ouverture: { mode: 'contexte', cle: 'b' } };
  const inverse = [recit[1], recit[0]];
  assert.equal(ouvertureEffective({ exposition: ctx, story: inverse, posture: 'lecture' }).index, 0);
});
