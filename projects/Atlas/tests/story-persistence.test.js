import test from 'node:test';
import assert from 'node:assert/strict';
import { saveStoryToGrist, chargerRecitGrist, reinitialiserBaseRecit } from '../lib/story.js';

/** Faux document : une table Atlas_Story en colonnes, et le journal des lots recus. */
function documentFactice({ lignes = [], colonneCle = true, tables = ['Atlas_Story'], echoueSur = null } = {}) {
  const lots = [];
  const table = () => {
    const t = {
      id: lignes.map((l) => l.id),
      Step: lignes.map((l) => l.step),
      Title: lignes.map((l) => l.title),
      Description: lignes.map((l) => l.text || ''),
      StateJSON: lignes.map((l) => l.stateJson || '{}'),
    };
    if (colonneCle) t.Cle = lignes.map((l) => l.cle || '');
    return t;
  };
  return {
    lots,
    listTables: async () => tables,
    fetchTable: async () => table(),
    applyUserActions: async (actions) => {
      lots.push(actions);
      if (echoueSur && actions.some((a) => a[0] === echoueSur)) throw new Error('Blocked by table update access rules');
      return { retValues: [] };
    },
  };
}
const ecritures = (api) => api.lots.filter((l) => l.some((a) => a[0] !== 'AddTable'));
const L = (id, cle, step, title) => ({ id, cle, step, title, text: '', stateJson: '{}' });

test('une sauvegarde ne contient plus d effacement general', async () => {
  reinitialiserBaseRecit();
  const api = documentFactice({ lignes: [L(1, 'a', 1, 'A'), L(2, 'b', 2, 'B'), L(3, 'c', 3, 'C')] });
  const { recit } = await chargerRecitGrist(api);
  recit[1].title = 'B2';
  await saveStoryToGrist(api, recit, {});
  const lots = ecritures(api);
  assert.equal(lots.length, 1, 'un seul lot, donc une seule transaction');
  assert.deepEqual(lots[0], [['UpdateRecord', 'Atlas_Story', 2, { Title: 'B2' }]]);
});

test('rien n a change : rien n est ecrit', async () => {
  reinitialiserBaseRecit();
  const api = documentFactice({ lignes: [L(1, 'a', 1, 'A')] });
  const { recit } = await chargerRecitGrist(api);
  await saveStoryToGrist(api, recit, {});
  assert.equal(ecritures(api).length, 0);
});

test('un recit vide apres lecture retire les etapes lues', async () => {
  reinitialiserBaseRecit();
  const api = documentFactice({ lignes: [L(1, 'a', 1, 'A'), L(2, 'b', 2, 'B')] });
  await chargerRecitGrist(api);
  await saveStoryToGrist(api, [], {});
  assert.deepEqual(ecritures(api)[0], [['BulkRemoveRecord', 'Atlas_Story', [1, 2]]]);
});

test('sans lecture prealable, on n efface rien', async () => {
  reinitialiserBaseRecit();
  const api = documentFactice({ lignes: [L(1, 'a', 1, 'A')] });
  await saveStoryToGrist(api, [{ cle: 'n', title: 'N', text: '', state: {} }], {});
  const lot = ecritures(api)[0];
  assert.ok(lot.every((a) => a[0] !== 'BulkRemoveRecord'));
  assert.equal(lot[0][0], 'BulkAddRecord');
});

test('table vide : on ecrit seulement', async () => {
  reinitialiserBaseRecit();
  const api = documentFactice({ lignes: [] });
  await chargerRecitGrist(api);
  await saveStoryToGrist(api, [{ title: 'Vue 1', text: 'a', state: {} }], {});
  const lot = ecritures(api)[0];
  assert.deepEqual(lot.map((a) => a[0]), ['BulkAddRecord']);
  assert.match(lot[0][3].Cle[0], /^e-/, 'la cle est posee a l ecriture');
});

test('une table ancienne : la colonne est ajoutee et les cles posees, une fois', async () => {
  reinitialiserBaseRecit();
  const api = documentFactice({ lignes: [L(1, '', 1, 'A'), L(2, '', 2, 'B')], colonneCle: false });
  const lu = await chargerRecitGrist(api);
  assert.equal(lu.aReecrire, true);
  assert.deepEqual(lu.recit.map((s) => s.cle), ['h-1', 'h-2']);
  await saveStoryToGrist(api, lu.recit, {});
  const lot = ecritures(api)[0];
  assert.equal(lot[0][0], 'AddColumn');
  assert.deepEqual(lot.slice(1).map((a) => [a[0], a[2], a[3].Cle]), [['UpdateRecord', 1, 'h-1'], ['UpdateRecord', 2, 'h-2']]);
});

test('l echec remonte a l appelant, et la base ne bouge pas', async () => {
  reinitialiserBaseRecit();
  const lignes = [L(1, 'a', 1, 'A')];
  const casse = documentFactice({ lignes, echoueSur: 'UpdateRecord' });
  const { recit } = await chargerRecitGrist(casse);
  recit[0].title = 'A2';
  await assert.rejects(() => saveStoryToGrist(casse, recit, {}), /access rules/);
  // Le meme essai, une fois les droits revenus, repart avec la meme difference.
  const sain = documentFactice({ lignes });
  await saveStoryToGrist(sain, recit, {});
  assert.deepEqual(ecritures(sain)[0], [['UpdateRecord', 'Atlas_Story', 1, { Title: 'A2' }]]);
});

test('un echec ne condamne pas les sauvegardes suivantes', async () => {
  reinitialiserBaseRecit();
  const casse = documentFactice({ lignes: [L(1, 'a', 1, 'A')], echoueSur: 'UpdateRecord' });
  const { recit } = await chargerRecitGrist(casse);
  recit[0].title = 'x';
  await saveStoryToGrist(casse, recit, {}).catch(() => {});
  const sain = documentFactice({ lignes: [] });
  await chargerRecitGrist(sain);
  await saveStoryToGrist(sain, [{ title: 'N', text: '', state: {} }], {});
  assert.ok(sain.lots.some((l) => l.some((a) => a[0] === 'BulkAddRecord')));
});

test('mode lecture : aucune ecriture', async () => {
  reinitialiserBaseRecit();
  const api = documentFactice({ lignes: [L(1, 'a', 1, 'A')] });
  await saveStoryToGrist(api, [], { viewMode: true });
  assert.equal(api.lots.length, 0);
});

test('deux editeurs, deux etapes differentes : aucune ne disparait', async () => {
  reinitialiserBaseRecit();
  const doc = [L(1, 'a', 1, 'A'), L(2, 'b', 2, 'B')];
  const api = documentFactice({ lignes: doc });
  const { recit } = await chargerRecitGrist(api);
  // Pendant ce temps, un autre editeur a retouche B et ajoute C.
  doc[1].title = 'B retouchee ailleurs';
  doc.push(L(3, 'c', 3, 'C ajoutee ailleurs'));
  recit[0].title = 'A retouchee ici';
  await saveStoryToGrist(api, recit, {});
  assert.deepEqual(ecritures(api)[0], [['UpdateRecord', 'Atlas_Story', 1, { Title: 'A retouchee ici' }]]);
});

test('table vide sans colonne Cle : un refus de colonne ajoute la colonne, un refus de droits non', async () => {
  reinitialiserBaseRecit();
  const lots = [];
  const api = {
    listTables: async () => ['Atlas_Story'],
    fetchTable: async () => ({ id: [] }),
    applyUserActions: async (actions) => {
      lots.push(actions);
      if (!actions.some((a) => a[0] === 'AddColumn')) throw new Error("Invalid column 'Cle'");
    },
  };
  await saveStoryToGrist(api, [{ title: 'N', text: '', state: {} }], {});
  assert.equal(lots.length, 2);
  assert.equal(lots[1][0][0], 'AddColumn');

  reinitialiserBaseRecit();
  const refus = { ...api, applyUserActions: async () => { throw new Error('Blocked by table update access rules'); } };
  await assert.rejects(() => saveStoryToGrist(refus, [{ title: 'N', text: '', state: {} }], {}), /access rules/);
});
