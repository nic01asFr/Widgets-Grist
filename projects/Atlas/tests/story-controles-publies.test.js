/**
 * Un contexte (ou une étape) ne retire pas les pastilles que l'auteur a publiées.
 *
 * Constaté le 02/10/2026 sur une copie réelle : jouer un contexte qui ne citait pas les
 * contrôles publiés les désactivait, et leurs pastilles disparaissaient du dock.
 *
 * node --test projects/Atlas/tests/story-controles-publies.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStoryControlsToLayer,
  marquerControlesPublies,
  rendreSansRestriction,
  buildControlPredicate,
} from '../lib/controls.js';

const objets = [
  { properties: { etat: 'A', delai: -3, unite: 'U1' } },
  { properties: { etat: 'B', delai: 2, unite: 'U2' } },
  { properties: { etat: 'A', delai: 5, unite: 'U2' } },
];
const couche = (controls) => ({ id: 'l1', geojson: { features: objets }, controls });
const passent = (l) => objets.filter(buildControlPredicate(l) || (() => true)).length;

test('un contrôle publié que l\'étape ne cite pas reste actif, sans restriction', () => {
  const l = couche([
    { field: 'etat', type: 'select', active: true, values: ['A'], _selectionTouched: true },
    { field: 'delai', type: 'range', active: true, min: 0, max: 3, dataMin: -3, dataMax: 5 },
  ]);
  marquerControlesPublies([l]);
  applyStoryControlsToLayer(l, []);
  const etat = l.controls.find((c) => c.field === 'etat');
  const delai = l.controls.find((c) => c.field === 'delai');
  assert.equal(etat.active, true, 'la pastille reste');
  assert.equal(etat.values, undefined, 'la sélection est levée');
  assert.equal(delai.active, true);
  assert.deepEqual([delai.min, delai.max], [-3, 5], 'la plage retrouve les bornes des données');
  assert.equal(passent(l), 3, 'rien n\'est filtré');
});

test('un contrôle que l\'étape cite est restreint comme avant', () => {
  const l = couche([{ field: 'etat', type: 'select', active: true }]);
  marquerControlesPublies([l]);
  applyStoryControlsToLayer(l, [{ field: 'etat', type: 'select', values: ['B'] }]);
  assert.equal(passent(l), 1);
});

test('un contrôle non publié, activé par une étape, est éteint par la suivante', () => {
  const l = couche([{ field: 'unite', type: 'select', active: false }]);
  marquerControlesPublies([l]);
  applyStoryControlsToLayer(l, [{ field: 'unite', type: 'select', values: ['U1'] }]);
  assert.equal(passent(l), 1);
  applyStoryControlsToLayer(l, []);
  const c = l.controls.find((x) => x.field === 'unite');
  assert.equal(c.active, false, 'il n\'était pas publié : il s\'éteint');
  assert.equal(passent(l), 3);
});

test('un contrôle publié est rendu à la restriction de l\'étape suivante, puis levé à nouveau', () => {
  const l = couche([{ field: 'etat', type: 'select', active: true }]);
  marquerControlesPublies([l]);
  applyStoryControlsToLayer(l, [{ field: 'etat', type: 'select', values: ['A'] }]);
  assert.equal(passent(l), 2);
  applyStoryControlsToLayer(l, []);
  assert.equal(passent(l), 3);
  assert.equal(l.controls[0].active, true);
});

test('une étape sans pastille publiée n\'en fait pas apparaître', () => {
  const l = couche([{ field: 'etat', type: 'select', active: false }]);
  marquerControlesPublies([l]);
  applyStoryControlsToLayer(l, []);
  assert.equal(l.controls[0].active, false);
});

test('marquerControlesPublies suit l\'état courant : un contrôle désactivé depuis perd sa marque', () => {
  const l = couche([{ field: 'etat', type: 'select', active: true }]);
  marquerControlesPublies([l]);
  assert.equal(l.controls[0]._publie, true);
  l.controls[0].active = false;
  marquerControlesPublies([l]);
  assert.equal(l.controls[0]._publie, undefined);
});

test('rendreSansRestriction : une recherche texte est vidée', () => {
  const c = { field: 'nom', type: 'text', active: true, texte: 'pont' };
  rendreSansRestriction(c);
  assert.equal(c.texte, '');
  assert.equal(c.active, true);
});
