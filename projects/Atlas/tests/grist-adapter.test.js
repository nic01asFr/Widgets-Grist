import test from 'node:test';
import assert from 'node:assert/strict';
import { adapterEnGrist, installerAdaptateur } from '../lib/grist-adapter.js';

const clientFactice = () => {
  const appels = [];
  return {
    appels,
    listTables: async () => { appels.push('listTables'); return ['Atlas_Story']; },
    fetchTable: async (t) => { appels.push('fetch:' + t); return { id: [1] }; },
    applyUserActions: async (a) => { appels.push('apply:' + a.length); return { retValues: [7] }; },
  };
};

test('l adaptateur a la forme de l API plugin', () => {
  const g = adapterEnGrist(clientFactice());
  assert.equal(typeof g.ready, 'function');
  for (const m of ['listTables', 'fetchTable', 'applyUserActions', 'getAccessToken']) {
    assert.equal(typeof g.docApi[m], 'function', m);
  }
});

test('les lectures et ecritures passent au client', async () => {
  const c = clientFactice();
  const g = adapterEnGrist(c);
  await g.docApi.listTables();
  await g.docApi.fetchTable('Atlas_LayerPrefs');
  await g.docApi.applyUserActions([['AddRecord', 'T', null, {}]]);
  assert.deepEqual(c.appels, ['listTables', 'fetch:Atlas_LayerPrefs', 'apply:1']);
});

test('ready ne leve pas, et n annonce rien', () => {
  // Atlas l'appelle ; hors document, il n'y a personne a qui parler.
  const g = adapterEnGrist(clientFactice());
  assert.doesNotThrow(() => g.ready({ requiredAccess: 'full' }));
});

test('getAccessToken rend null au lieu de lever', async () => {
  // Le jeton signe est un service du document hote. L'appelant sait deja
  // traiter son absence : un widget en lecture peut se le voir refuser.
  const g = adapterEnGrist(clientFactice());
  assert.equal(await g.docApi.getAccessToken({ readOnly: true }), null);
});

test('l identite est transmise quand on la connait', () => {
  const g = adapterEnGrist(clientFactice(), { userId: 42, user: { email: 'a@b.fr' } });
  assert.equal(g.userId, 42);
  assert.equal(g.user.email, 'a@b.fr');
  assert.equal(adapterEnGrist(clientFactice()).userId, null);
});

test('un vrai Grist n est JAMAIS remplace', () => {
  // Garde essentielle : l'adaptateur ne doit pas pouvoir casser le widget.
  const vrai = { docApi: { listTables: () => ['reel'] } };
  const portee = { grist: vrai };
  const rendu = installerAdaptateur(clientFactice(), {}, portee);
  assert.equal(rendu, vrai);
  assert.equal(portee.grist, vrai);
});

test('hors Grist, l adaptateur s installe', () => {
  const portee = {};
  installerAdaptateur(clientFactice(), {}, portee);
  assert.ok(portee.grist?.docApi);
  assert.ok(portee.grist._adaptateur, 'un repere doit signaler qu on n est pas dans Grist');
});

test('un adaptateur deja pose peut etre remplace', () => {
  // Changer de scene reinstalle un adaptateur sur un autre document.
  const portee = {};
  installerAdaptateur(clientFactice(), {}, portee);
  const c2 = clientFactice();
  installerAdaptateur(c2, {}, portee);
  portee.grist.docApi.listTables();
  assert.deepEqual(c2.appels, ['listTables']);
});

test('sans client, on leve tout de suite', () => {
  assert.throws(() => adapterEnGrist(null), /client requis/);
});

test('l adaptateur sait verser une piece jointe — c est le seul chemin dans l application', async () => {
  // Le jeton signe n'existe pas hors widget : sans ce relais, une photo prise
  // depuis un formulaire n'aurait aucune facon de partir.
  const c = clientFactice();
  c.televerserPieceJointe = async (f) => { c.appels.push('pj:' + f.name); return [4]; };
  const g = adapterEnGrist(c);
  assert.deepEqual(await g.docApi.televerserPieceJointe({ name: 'p.jpg' }), [4]);
  assert.deepEqual(c.appels, ['pj:p.jpg']);
});

test('un client sans pieces jointes le dit, au lieu d echouer plus loin', () => {
  const g = adapterEnGrist(clientFactice());
  assert.throws(() => g.docApi.televerserPieceJointe({ name: 'p.jpg' }), /pièces jointes/);
});
