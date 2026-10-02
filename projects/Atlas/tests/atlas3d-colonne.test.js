/**
 * La colonne technique d'Atlas (`atlas_3d_json`) : sans elle, le placement et les réglages d'un objet
 * étaient perdus en silence. Elle est créée à l'enregistrement, et seulement alors.
 *
 * node --test projects/Atlas/tests/atlas3d-colonne.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { featureToRowUpdate, saveFeatureToSource, saveFeaturesToSource } from '../lib/grist-sync.js';

const objet = (props) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [5.4, 43.3] }, properties: { _row_id: 4, ...props } });
const couche = (colonnes, features) => ({
  id: 'l1', name: 'Arbres', geometryType: 'Point', sourceTable: 'Arbres_remarquables',
  style: { mode: 'library', library: { modelId: 'objet:mat_crosse' } },
  _fields: [], _gristColumns: colonnes, geojson: { features },
});
const faux = (refus = null) => {
  const journal = [];
  return { journal, applyUserActions: async (a) => { journal.push(a); if (refus && a[0][0] === 'AddColumn') throw new Error(refus); return {}; } };
};

test('une table qui n a pas la colonne : le reglage d objet est signale, pas jete', () => {
  const p = featureToRowUpdate(objet({ _params: { puissance: 20 } }), couche(['nom', 'latitude', 'longitude']));
  assert.ok(p.colonne3dManquante);
  assert.deepEqual(JSON.parse(p.colonne3dManquante).params, { puissance: 20 });
  assert.equal(p.update.atlas_3d_json, undefined);
});

test('une table qui a la colonne : ecrit directement, rien a creer', () => {
  const p = featureToRowUpdate(objet({ _params: { puissance: 20 } }), couche(['nom', 'atlas_3d_json']));
  assert.equal(p.colonne3dManquante, undefined);
  assert.deepEqual(JSON.parse(p.update.atlas_3d_json).params, { puissance: 20 });
});

test('sans liste de colonnes connue, rien ne change : on ecrit comme avant', () => {
  const p = featureToRowUpdate(objet({ _params: { puissance: 20 } }), couche([]));
  assert.deepEqual(JSON.parse(p.update.atlas_3d_json).params, { puissance: 20 });
  assert.equal(p.colonne3dManquante, undefined);
});

test('rien a ecrire : toujours aucune mise a jour', () => {
  assert.equal(featureToRowUpdate(objet({}), couche(['nom'])), null);
});

test('a l enregistrement, la colonne est creee puis remplie, dans cet ordre', async () => {
  const l = couche(['nom'], [objet({ _params: { puissance: 20 } })]);
  const docApi = faux();
  assert.equal(await saveFeatureToSource(docApi, l, 0), true);
  assert.equal(docApi.journal.length, 2);
  assert.deepEqual(docApi.journal[0], [['AddColumn', 'Arbres_remarquables', 'atlas_3d_json', { type: 'Text', label: 'Atlas 3D (JSON)' }]]);
  assert.equal(docApi.journal[1][0][0], 'UpdateRecord');
  assert.deepEqual(JSON.parse(docApi.journal[1][0][3].atlas_3d_json).params, { puissance: 20 });
  assert.ok(l._gristColumns.includes('atlas_3d_json'));
  assert.equal(l.colonne3dCreee, true);
});

test('plusieurs objets : la colonne n est creee qu une fois', async () => {
  const l = couche(['nom'], [objet({ _params: { puissance: 20 } }), { ...objet({ _params: { puissance: 30 } }), properties: { _row_id: 5, _params: { puissance: 30 } } }]);
  const docApi = faux();
  assert.equal(await saveFeaturesToSource(docApi, l, [0, 1]), 2);
  assert.equal(docApi.journal.flat().filter((a) => a[0] === 'AddColumn').length, 1);
});

test('une colonne que la table avait deja, sans qu Atlas le sache : on ecrit dedans', async () => {
  const l = couche(['nom'], [objet({ _params: { puissance: 20 } })]);
  const docApi = faux('Column "atlas_3d_json" already exists');
  assert.equal(await saveFeatureToSource(docApi, l, 0), true);
  assert.equal(docApi.journal[1][0][0], 'UpdateRecord');
});

test('un refus de droits n est pas avale', async () => {
  const l = couche(['nom'], [objet({ _params: { puissance: 20 } })]);
  const docApi = faux('Blocked by table update access rules');
  await assert.rejects(() => saveFeatureToSource(docApi, l, 0), /Blocked by table/);
  assert.equal(docApi.journal.length, 1, 'aucune ecriture de ligne apres le refus');
});
