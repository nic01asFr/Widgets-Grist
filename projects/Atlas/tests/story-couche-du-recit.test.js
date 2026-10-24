// L'entrée `layers[]` d'une étape de récit retrouve sa couche, y compris celle d'une scène externe (id d'application `layer-scene-<id>`).
// node --test tests/story-couche-du-recit.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { coucheDuRecit } from '../lib/story.js';

const couches = [
  { id: 'layer-scene-sites', name: 'Sites', manifestLayerId: 'sites' },
  { id: 'layer-scene-bati', name: 'Batiments', manifestLayerId: 'bati', sourceTable: 'Batiments_T' },
  { id: 'perso', name: 'Perso' },
];

test('une entrée retrouve sa couche par sourceTable, id, id du manifeste, puis nom', () => {
  assert.equal(coucheDuRecit(couches, { sourceTable: 'Batiments_T' }).id, 'layer-scene-bati');
  assert.equal(coucheDuRecit(couches, { id: 'perso' }).id, 'perso');
  assert.equal(coucheDuRecit(couches, { id: 'sites', visible: true }).id, 'layer-scene-sites', 'l id du manifeste désigne la couche de la scène externe');
  assert.equal(coucheDuRecit(couches, { id: 'layer-scene-sites' }).id, 'layer-scene-sites');
  assert.equal(coucheDuRecit(couches, { name: 'Sites' }).id, 'layer-scene-sites');
});

test('une entrée sans couche correspondante, ou mal formée, rend null (l appelant le dit)', () => {
  assert.equal(coucheDuRecit(couches, { id: 'absente' }), null);
  assert.equal(coucheDuRecit(couches, {}), null);
  for (const mauvais of [null, undefined]) assert.equal(coucheDuRecit(couches, mauvais), null);
  assert.equal(coucheDuRecit(null, { id: 'sites' }), null);
});
