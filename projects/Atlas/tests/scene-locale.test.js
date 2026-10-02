/**
 * Une scène sur l'appareil : le moteur d'actions, le client, le registre.
 *
 * node --test projects/Atlas/tests/scene-locale.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  creerScene, appliquerActions, tableColonnaire, metaTables, metaColonnes, colonnesReference, resumerScene,
  ClientLocal, creerSceneLocale, lireSceneLocale, scenesLocales, supprimerSceneLocale,
  idDocumentLocal, estIdLocal, idDepuisDocument, identifiantNeuf,
} from '../lib/scene-locale.js';
import { StockageMemoire } from '../lib/hors-ligne.js';

const COLS = [{ id: 'Nom', type: 'Text', label: 'Nom' }, { id: 'Hauteur', type: 'Numeric' }, { id: 'Ouvrage', type: 'Ref:Ouvrages' }];

test('identifiants : une scène locale se reconnaît à son document', () => {
  assert.equal(idDocumentLocal('abc'), 'local:abc');
  assert.equal(estIdLocal('local:abc'), true);
  assert.equal(estIdLocal('qX9fK2'), false);
  assert.equal(estIdLocal(''), false);
  assert.equal(idDepuisDocument('local:abc'), 'abc');
  assert.match(identifiantNeuf(() => 0.5, () => 1000), /^[0-9a-z]+$/);
});

test('AddTable puis AddRecord : la table se relit au format colonnaire, avec les valeurs rendues', () => {
  const s = creerScene({ id: 'a', nom: 'Essai' });
  const r = appliquerActions(s, [
    ['AddTable', 'Ouvrages', COLS],
    ['AddRecord', 'Ouvrages', null, { Nom: 'Pont', Hauteur: 12 }],
    ['AddRecord', 'Ouvrages', null, { Nom: 'Passerelle' }],
  ]);
  assert.equal(r.retValues[0].table_id, 'Ouvrages');
  assert.deepEqual(r.retValues.slice(1), [1, 2]);
  assert.deepEqual(tableColonnaire(s, 'Ouvrages'), { id: [1, 2], Nom: ['Pont', 'Passerelle'], Hauteur: [12, null], Ouvrage: [null, null] });
});

test('une table au nom pris reçoit un autre nom, et le dit', () => {
  const s = creerScene({ id: 'a' });
  appliquerActions(s, [['AddTable', 'Points', COLS]]);
  const r = appliquerActions(s, [['AddTable', 'points', COLS]]);
  assert.equal(r.retValues[0].table_id, 'points2');
  assert.deepEqual(Object.keys(s.tables), ['Points', 'points2']);
});

test('BulkAddRecord garde les identifiants demandés (c’est ce qui permet de renvoyer une scène à l’identique)', () => {
  const s = creerScene({ id: 'a' });
  const r = appliquerActions(s, [
    ['AddTable', 'T', [{ id: 'A', type: 'Text' }]],
    ['BulkAddRecord', 'T', [5, 9], { A: ['x', 'y'] }],
    ['AddRecord', 'T', null, { A: 'z' }],
  ]);
  assert.deepEqual(r.retValues[1], [5, 9]);
  assert.equal(r.retValues[2], 10, 'la suite continue après le plus grand');
  assert.deepEqual(tableColonnaire(s, 'T').id, [5, 9, 10]);
});

test('UpdateRecord, BulkUpdateRecord, RemoveRecord, BulkRemoveRecord', () => {
  const s = creerScene({ id: 'a' });
  appliquerActions(s, [['AddTable', 'T', [{ id: 'A', type: 'Text' }, { id: 'B', type: 'Int' }]], ['BulkAddRecord', 'T', [1, 2, 3, 4], { A: ['a', 'b', 'c', 'd'], B: [1, 2, 3, 4] }]]);
  appliquerActions(s, [['UpdateRecord', 'T', 2, { A: 'B!' }], ['BulkUpdateRecord', 'T', [3, 4], { B: [30, 40] }], ['RemoveRecord', 'T', 1], ['BulkRemoveRecord', 'T', [4]]]);
  assert.deepEqual(tableColonnaire(s, 'T'), { id: [2, 3], A: ['B!', 'c'], B: [2, 30] });
});

test('AddColumn et RemoveColumn : les lignes existantes suivent', () => {
  const s = creerScene({ id: 'a' });
  appliquerActions(s, [['AddTable', 'T', [{ id: 'A', type: 'Text' }]], ['AddRecord', 'T', null, { A: 'x' }], ['AddColumn', 'T', 'Nouvelle', { type: 'Int', label: 'Nouvelle' }]]);
  assert.deepEqual(tableColonnaire(s, 'T'), { id: [1], A: ['x'], Nouvelle: [null] });
  appliquerActions(s, [['RemoveColumn', 'T', 'A']]);
  assert.deepEqual(tableColonnaire(s, 'T'), { id: [1], Nouvelle: [null] });
});

test('un lot est atomique : une action en échec défait les précédentes', () => {
  const s = creerScene({ id: 'a' });
  appliquerActions(s, [['AddTable', 'T', [{ id: 'A', type: 'Text' }]]]);
  assert.throws(() => appliquerActions(s, [
    ['AddRecord', 'T', null, { A: 'perdu' }],
    ['AddTable', 'Autre', [{ id: 'B' }]],
    ['UpdateRecord', 'T', 99, { A: 'x' }],
  ]), /Ligne introuvable/);
  assert.deepEqual(tableColonnaire(s, 'T'), { id: [], A: [] });
  assert.deepEqual(Object.keys(s.tables), ['T'], 'la table du lot raté n’existe pas');
});

test('ce que le moteur ne sait pas, il le refuse en le disant', () => {
  const s = creerScene({ id: 'a' });
  assert.throws(() => appliquerActions(s, [['RenameTable', 'T', 'U']]), /non prise en charge/);
  assert.throws(() => appliquerActions(s, [['AddTable', 'T', [{ id: 'F', type: 'Numeric', isFormula: true, formula: '1+1' }]]]), /formule/);
  assert.throws(() => appliquerActions(s, [['AddRecord', 'Absente', null, {}]]), /Table introuvable/);
  appliquerActions(s, [['AddTable', 'T', [{ id: 'A' }]]]);
  assert.throws(() => appliquerActions(s, [['AddRecord', 'T', null, { Inconnue: 1 }]]), /Colonne introuvable/);
  assert.throws(() => appliquerActions(s, [['AddColumn', 'T', 'A', { type: 'Text' }]]), /déjà présente/);
});

test('les métadonnées que lit Atlas : tables et colonnes, avec leur table parente', () => {
  const s = creerScene({ id: 'a' });
  appliquerActions(s, [['AddTable', 'Ouvrages', COLS], ['AddTable', 'Visites', [{ id: 'Constat', type: 'Text', widgetOptions: { widget: 'TextBox' } }]]]);
  assert.deepEqual(metaTables(s), { id: [1, 2], tableId: ['Ouvrages', 'Visites'] });
  const m = metaColonnes(s);
  const colsDe = (parent) => m.id.map((_, i) => i).filter((i) => m.parentId[i] === parent).map((i) => [m.colId[i], m.type[i]]);
  assert.deepEqual(colsDe(1), [['id', 'Id'], ['Nom', 'Text'], ['Hauteur', 'Numeric'], ['Ouvrage', 'Ref:Ouvrages']]);
  assert.deepEqual(colsDe(2), [['id', 'Id'], ['Constat', 'Text']]);
  assert.equal(m.widgetOptions[m.colId.indexOf('Constat')], '{"widget":"TextBox"}');
  assert.ok(m.isFormula.every((x) => x === false));
});

test('les références entre tables, pour ordonner un envoi', () => {
  const s = creerScene({ id: 'a' });
  appliquerActions(s, [['AddTable', 'Ouvrages', COLS], ['AddTable', 'V', [{ id: 'Liste', type: 'RefList:Ouvrages' }]]]);
  assert.deepEqual(colonnesReference(s), [
    { table: 'Ouvrages', col: 'Ouvrage', type: 'Ref:Ouvrages', cible: 'Ouvrages' },
    { table: 'V', col: 'Liste', type: 'RefList:Ouvrages', cible: 'Ouvrages' },
  ]);
  assert.deepEqual(resumerScene(s), { tables: [{ nom: 'Ouvrages', lignes: 0 }, { nom: 'V', lignes: 0 }], lignes: 0, photos: 0 });
});

test('le client local : la forme de ClientRest, l’état gardé à chaque écriture', async () => {
  const stockage = new StockageMemoire();
  const scene = await creerSceneLocale(stockage, { nom: 'Relevé du jour' });
  const c = new ClientLocal({ stockage, scene });
  assert.equal(c.mode, 'local');
  assert.equal(c.docId, `local:${scene.id}`);
  const r = await c.applyUserActions([['AddTable', 'Points', COLS], ['AddRecord', 'Points', null, { Nom: 'P1' }]]);
  assert.equal(r.retValues[1], 1);
  assert.deepEqual(await c.listTables(), ['Points']);
  assert.deepEqual((await c.fetchTable('Points')).Nom, ['P1']);
  assert.deepEqual((await c.fetchTable('_grist_Tables')).tableId, ['Points']);
  assert.deepEqual(await c.fetchTable('_grist_Views'), { id: [] });
  assert.deepEqual((await lireSceneLocale(stockage, scene.id)).tables.Points.ids, [1], 'gardé dans le stockage');
  assert.equal(c.etat().local, true);
  assert.deepEqual(c.entrees(), []);
});

test('le client local garde les photos et les relit', async () => {
  const stockage = new StockageMemoire();
  const scene = await creerSceneLocale(stockage, { nom: 'x' });
  const c = new ClientLocal({ stockage, scene });
  const a = await c.televerserPieceJointe(new Blob([new Uint8Array(10)], { type: 'image/jpeg' }));
  const b = await c.televerserPieceJointe(new Blob([new Uint8Array(20)]));
  assert.deepEqual([a, b], [1, 2], 'des entiers positifs, comme les pièces jointes de Grist');
  assert.match(await c.urlPieceJointe(1), /^blob:/);
  await assert.rejects(() => c.urlPieceJointe(7), /introuvable/);
  assert.deepEqual((await c.piecesJointes()).map((p) => [p.id, p.blob.size]), [[1, 10], [2, 20]]);
  assert.equal(resumerScene(scene).photos, 2);
});

test('le registre : créer, lister (récentes d’abord, sans confondre avec le reste du stockage), supprimer', async () => {
  const stockage = new StockageMemoire();
  await stockage.put('divers', 'etat:https://x|doc', { prochainProvisoire: -1 });
  await stockage.put('divers', 'pret:https://x|doc', { version: 1, doc: 'https://x|doc', tables: [{ nom: 'A' }] });
  await stockage.put('divers', 'pjreel:x|1', { blob: new Blob(['x']) });
  const a = await creerSceneLocale(stockage, { nom: 'Ancienne', maintenant: () => 1000, aleatoire: () => 0.1 });
  const b = await creerSceneLocale(stockage, { nom: 'Récente', maintenant: () => 2000, aleatoire: () => 0.2 });
  assert.deepEqual((await scenesLocales(stockage)).map((s) => s.nom), ['Récente', 'Ancienne']);
  const c = new ClientLocal({ stockage, scene: a });
  await c.televerserPieceJointe(new Blob(['photo']));
  await supprimerSceneLocale(stockage, a.id);
  assert.equal(await lireSceneLocale(stockage, a.id), null);
  assert.deepEqual((await scenesLocales(stockage)).map((s) => s.nom), ['Récente']);
  assert.equal(await stockage.get('divers', `locale:${a.id}|pj:1`), undefined, 'la photo part avec la scène');
  assert.ok(b.id !== a.id);
});
