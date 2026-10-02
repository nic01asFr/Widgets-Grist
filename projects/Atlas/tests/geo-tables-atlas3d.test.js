/**
 * Une table détectée dans le document relit le placement et les réglages que l'objet y a écrits.
 *
 * node --test projects/Atlas/tests/geo-tables-atlas3d.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tableToGeoJSON } from '../lib/geo-tables.js';

const colonnes = (a3d) => ({
  id: [1, 2, 3],
  nom: ['A', 'B', 'C'],
  latitude: [43.30, 43.31, 43.32],
  longitude: [5.39, 5.40, 5.41],
  atlas_3d_json: a3d,
});
const lat = { lat: 'latitude', lng: 'longitude' };

test('les reglages d un objet reviennent sous le nom _params', () => {
  const fc = tableToGeoJSON(colonnes(['{"params":{"puissance":20}}', '', null]), lat);
  assert.deepEqual(fc.features[0].properties._params, { puissance: 20 });
  assert.equal(fc.features[1].properties._params, undefined);
  assert.equal(fc.features[2].properties._params, undefined);
});

test('le placement revient comme pour une couche de manifeste', () => {
  const fc = tableToGeoJSON(colonnes(['{"scale":1.5,"rotationZ":90,"modelId":"objet:mat_crosse"}', '', '']), lat);
  const p = fc.features[0].properties;
  assert.deepEqual([p._scale, p._rotationZ, p._modelId], [1.5, 90, 'objet:mat_crosse']);
});

test('une cellule abimee ou qui n est pas un objet ne casse pas la couche', () => {
  const fc = tableToGeoJSON(colonnes(['{pas du json', '[1,2]', '"texte"']), lat);
  assert.equal(fc.features.length, 3);
  for (const f of fc.features) assert.equal(f.properties._params, undefined);
});

test('une table sans la colonne se lit comme avant', () => {
  const c = colonnes([]); delete c.atlas_3d_json;
  const fc = tableToGeoJSON(c, lat);
  assert.equal(fc.features.length, 3);
  assert.equal(fc.features[0].properties._params, undefined);
});
