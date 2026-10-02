/**
 * La colonne technique d'Atlas (`atlas_3d_json`) : sans elle, le placement et les réglages d'un objet
 * étaient perdus en silence. Elle est créée à l'enregistrement, et seulement alors.
 *
 * node --test projects/Atlas/tests/atlas3d-colonne.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { featureToRowUpdate, saveFeatureToSource, saveFeaturesToSource, assurerColonneAtlas3d } from '../lib/grist-sync.js';

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

// Grist ne refuse pas un doublon : il cree « atlas_3d_json2 » et le dit dans sa reponse (mesure en reel).
const fauxGrist = ({ colId = null, refus = null } = {}) => {
  const journal = [];
  return {
    journal,
    applyUserActions: async (a) => {
      journal.push(a);
      if (a[0][0] === 'AddColumn') {
        if (refus) throw new Error(refus);
        return { retValues: [{ colRef: 61, colId: colId || a[0][2] }] };
      }
      return { retValues: [null] };
    },
  };
};

test('une colonne que la table avait deja, sans qu Atlas le sache : la colonne parasite est retiree, on ecrit dans la vraie', async () => {
  const l = couche(['nom'], [objet({ _params: { puissance: 20 } })]);
  const docApi = fauxGrist({ colId: 'atlas_3d_json2' });
  assert.equal(await saveFeatureToSource(docApi, l, 0), true);
  const actions = docApi.journal.flat();
  assert.deepEqual(actions.map((a) => a[0]), ['AddColumn', 'RemoveColumn', 'UpdateRecord']);
  assert.deepEqual(actions[1], ['RemoveColumn', 'Arbres_remarquables', 'atlas_3d_json2']);
  assert.deepEqual(JSON.parse(actions[2][3].atlas_3d_json).params, { puissance: 20 });
  assert.equal(l.colonne3dCreee, undefined, 'rien n a ete cree : la colonne existait');
});

test('une colonne vraiment creee est signalee comme telle', async () => {
  const l = couche(['nom'], [objet({ _params: { puissance: 20 } })]);
  await saveFeatureToSource(fauxGrist(), l, 0);
  assert.equal(l.colonne3dCreee, true);
});

test('pas le droit de modifier la structure : le reste de la ligne s ecrit, le placement et les reglages non, et on le dit', async () => {
  const l = couche(['nom'], [objet({ nom: 'Platane', _params: { puissance: 20 } })]);
  l._fields = [{ name: 'nom' }];
  const docApi = fauxGrist({ refus: 'Blocked by table update access rules' });
  assert.equal(await saveFeatureToSource(docApi, l, 0), true, 'la ligne est ecrite');
  const actions = docApi.journal.flat();
  assert.deepEqual(actions.map((a) => a[0]), ['AddColumn', 'UpdateRecord']);
  assert.equal(actions[1][3].nom, 'Platane');
  assert.equal(actions[1][3].atlas_3d_json, undefined);
  assert.match(l.colonne3dRefusee, /Blocked by table/);
});

test('pas le droit, et rien d autre a ecrire : rien n est ecrit, sans erreur', async () => {
  const l = couche(['nom'], [objet({ _params: { puissance: 20 } })]);
  const docApi = fauxGrist({ refus: 'Blocked by table update access rules' });
  assert.equal(await saveFeatureToSource(docApi, l, 0), false);
  assert.equal(docApi.journal.flat().length, 1, 'seul l ajout de colonne a ete tente');
  assert.ok(l.colonne3dRefusee);
});

// ---------------------------------------------------------------------------
// S'assurer de la colonne AU PREMIER REGLAGE, pas a l'enregistrement
// ---------------------------------------------------------------------------

test('la colonne est la : rien n est tente', async () => {
  const docApi = fauxGrist();
  const l = couche(['nom', 'atlas_3d_json'], []);
  assert.deepEqual(await assurerColonneAtlas3d(docApi, l), { etat: 'presente' });
  assert.equal(docApi.journal.length, 0);
});

test('on ne sait pas quelles colonnes la table porte : on n y touche pas', async () => {
  const docApi = fauxGrist();
  assert.deepEqual(await assurerColonneAtlas3d(docApi, couche([], [])), { etat: 'inconnue' });
  assert.deepEqual(await assurerColonneAtlas3d(docApi, couche(undefined, [])), { etat: 'inconnue' });
  assert.equal(docApi.journal.length, 0);
});

test('la colonne manque : elle est creee, et la liste des colonnes la connait ensuite', async () => {
  const docApi = fauxGrist();
  const l = couche(['nom'], []);
  assert.deepEqual(await assurerColonneAtlas3d(docApi, l), { etat: 'creee' });
  assert.ok(l._gristColumns.includes('atlas_3d_json'));
  // un second appel ne retente rien
  assert.deepEqual(await assurerColonneAtlas3d(docApi, l), { etat: 'presente' });
  assert.equal(docApi.journal.flat().length, 1);
});

test('liste perimee : la colonne parasite que Grist cree est retiree, la colonne existe', async () => {
  const docApi = fauxGrist({ colId: 'atlas_3d_json2' });
  const r = await assurerColonneAtlas3d(docApi, couche(['nom'], []));
  assert.deepEqual(r, { etat: 'presente' });
  assert.deepEqual(docApi.journal.flat().map((a) => a[0]), ['AddColumn', 'RemoveColumn']);
});

test('pas le droit de modifier la structure : verdict immediat, avec la raison', async () => {
  const r = await assurerColonneAtlas3d(fauxGrist({ refus: 'Blocked by table update access rules' }), couche(['nom'], []));
  assert.equal(r.etat, 'refusee');
  assert.match(r.message, /Blocked by table/);
});

test('les colonnes connues peuvent venir d ailleurs que de la couche (schema du document)', async () => {
  const docApi = fauxGrist();
  const l = couche([], []);
  assert.deepEqual(await assurerColonneAtlas3d(docApi, l, ['nom', 'atlas_3d_json']), { etat: 'presente' });
  assert.equal(docApi.journal.length, 0);
});
