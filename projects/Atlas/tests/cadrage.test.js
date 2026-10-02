import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliserCadrage, centreDesBornes, unirBornes, cadrageEffectif, MODES_CADRAGE } from '../lib/cadrage.js';

const A = { id: 'a', bornes: [[5, 43], [6, 44]] };
const B = { id: 'b', bornes: [[7, 45], [8, 46]] };
const VUE = { lng: 5.4, lat: 43.3, zoom: 14, pitch: 40, bearing: 10 };

test('un cadrage sûr : jamais de mode inconnu, jamais de vue sans coordonnées', () => {
  assert.deepEqual(MODES_CADRAGE, ['donnees', 'lieu', 'vue']);
  assert.equal(normaliserCadrage(null), null);
  assert.equal(normaliserCadrage([1]), null);
  assert.equal(normaliserCadrage({ mode: 'hologramme' }), null);
  assert.deepEqual(normaliserCadrage({ mode: 'donnees' }), { mode: 'donnees' });
  assert.deepEqual(normaliserCadrage({ mode: 'donnees', couche: 'a' }), { mode: 'donnees', couche: 'a' });
  assert.equal(normaliserCadrage({ mode: 'lieu' }), null, 'un lieu sans coordonnées ne désigne rien');
  assert.deepEqual(normaliserCadrage({ mode: 'lieu', lieu: { lng: 2, lat: 48, nom: 'Paris' } }), { mode: 'lieu', lieu: { lng: 2, lat: 48, nom: 'Paris' } });
  assert.deepEqual(normaliserCadrage({ mode: 'lieu', lieu: { lng: 2, lat: 48 } }), { mode: 'lieu', lieu: { lng: 2, lat: 48 } });
  assert.equal(normaliserCadrage({ mode: 'vue' }), null);
  assert.equal(normaliserCadrage({ mode: 'vue', vue: { lng: 'x', lat: 1, zoom: 3 } }), null);
  assert.deepEqual(normaliserCadrage({ mode: 'vue', vue: { lng: 1, lat: 2, zoom: 3 } }), { mode: 'vue', vue: { lng: 1, lat: 2, zoom: 3, pitch: 0, bearing: 0 } });
});

test('le centre et l’union des emprises', () => {
  assert.deepEqual(centreDesBornes([[0, 0], [10, 20]]), { lng: 5, lat: 10 });
  assert.equal(centreDesBornes(null), null);
  assert.equal(centreDesBornes([[0, 0], [NaN, 1]]), null);
  assert.deepEqual(unirBornes([A.bornes, B.bornes, null]), [[5, 43], [8, 46]]);
  assert.equal(unirBornes([]), null);
});

test('sans choix : les données si la scène en a, sinon rien à imposer', () => {
  assert.deepEqual(cadrageEffectif({ couches: [A, B] }), { type: 'bornes', bornes: [[5, 43], [8, 46]] });
  assert.equal(cadrageEffectif({ couches: [{ id: 'x', bornes: null }] }), null);
});

test('sur une couche : son emprise ; si elle a disparu, toutes les données', () => {
  assert.deepEqual(cadrageEffectif({ cadrage: { mode: 'donnees', couche: 'b' }, couches: [A, B] }), { type: 'bornes', bornes: B.bornes });
  assert.deepEqual(cadrageEffectif({ cadrage: { mode: 'donnees', couche: 'zz' }, couches: [A, B] }), { type: 'bornes', bornes: [[5, 43], [8, 46]] });
});

test('sur un lieu : son centre, même si la scène a des données ; un lieu abîmé retombe sur les données', () => {
  assert.deepEqual(cadrageEffectif({ cadrage: { mode: 'lieu', lieu: { lng: 2, lat: 48 } }, couches: [A] }), { type: 'lieu', centre: [2, 48], zoom: 16 });
  assert.deepEqual(cadrageEffectif({ cadrage: { mode: 'lieu' }, couches: [A] }), { type: 'bornes', bornes: A.bornes });
});

test('sur une vue figée : la caméra, quoi que disent les couches', () => {
  assert.deepEqual(cadrageEffectif({ cadrage: { mode: 'vue', vue: VUE }, couches: [A] }), { type: 'camera', camera: VUE });
});
