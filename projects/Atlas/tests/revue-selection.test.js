import test from 'node:test';
import assert from 'node:assert/strict';
import { objetAffiche, pasAffiche, rangParmiAffiches } from '../lib/revue-selection.js';

// Cinq objets ; le contexte ne laisse voir que l'état « bon ».
const features = ['bon', 'mauvais', 'bon', 'mauvais', 'bon'].map((etat) => ({ properties: { etat } }));
const garde = (f) => f.properties.etat === 'bon';
const tous = [0, 1, 2, 3, 4];

test('sans filtre, tout est affiché', () => {
  assert.equal(objetAffiche(features, null, 1), true);
  assert.equal(pasAffiche(features, null, tous, 0, 1), 1);
});

test('le pas saute les objets que le filtre écarte', () => {
  assert.equal(pasAffiche(features, garde, tous, 0, 1), 2);
  assert.equal(pasAffiche(features, garde, tous, 2, 1), 4);
  assert.equal(pasAffiche(features, garde, tous, 2, -1), 0);
});

test('le pas boucle en sautant les masqués aux deux bouts', () => {
  assert.equal(pasAffiche(features, garde, tous, 4, 1), 0);
  assert.equal(pasAffiche(features, garde, tous, 0, -1), 4);
});

test('depuis un objet masqué, on rejoint le plus proche affiché', () => {
  assert.equal(pasAffiche(features, garde, tous, 1, 1), 2);
  assert.equal(pasAffiche(features, garde, tous, 1, -1), 0);
});

test('une revue sur une partie de la couche reste dans cette partie', () => {
  // Sélection {1, 2, 3, 4} : seuls 2 et 4 sont affichés ; de 2 (position 1) on va à 4 (position 3), jamais à l'objet 0.
  assert.equal(pasAffiche(features, garde, [1, 2, 3, 4], 1, 1), 3);
  assert.equal(pasAffiche(features, garde, [1, 2, 3, 4], 3, 1), 1);
});

test('un seul objet affiché : le pas y revient', () => {
  const seul = (f) => f === features[2];
  assert.equal(pasAffiche(features, seul, tous, 2, 1), 2);
});

test('tout écarté : aucun pas', () => {
  assert.equal(pasAffiche(features, () => false, tous, 0, 1), null);
  assert.equal(pasAffiche(features, garde, [], 0, 1), null);
});

test('le rang ne compte que les objets affichés', () => {
  assert.deepEqual(rangParmiAffiches(features, garde, tous, 0), { rang: 1, total: 3 });
  assert.deepEqual(rangParmiAffiches(features, garde, tous, 2), { rang: 2, total: 3 });
  assert.deepEqual(rangParmiAffiches(features, garde, tous, 4), { rang: 3, total: 3 });
});

test('le rang sans filtre est la position dans la sélection', () => {
  assert.deepEqual(rangParmiAffiches(features, null, tous, 3), { rang: 4, total: 5 });
});

test('tout écarté : le rang retombe sur la sélection entière', () => {
  assert.deepEqual(rangParmiAffiches(features, () => false, tous, 1), { rang: 2, total: 5 });
});
