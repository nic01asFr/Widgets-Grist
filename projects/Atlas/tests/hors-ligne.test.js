/**
 * Travailler sans réseau : lecture depuis l'appareil, file d'écriture, photos différées.
 *
 * node --test projects/Atlas/tests/hors-ligne.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ClientHorsLigne, StockageMemoire, ETATS, BASE_PROVISOIRE,
  estErreurReseau, appliquerFileSurTable, substituerIds, provisoiresRestants, estEcritureSimple, resumer,
} from '../lib/hors-ligne.js';

/** Un client REST factice : coupable à volonté, il consigne ce qu'il reçoit. */
function fauxClient() {
  const c = {
    mode: 'rest', baseUrl: 'https://grist.essai', docId: 'doc1', jeton: 'k',
    coupe: false, refus: null, journal: [], pj: [], suivant: 100, tables: { Visites: { id: [1], Constat: ['RAS'] } },
    async listTables() { if (c.coupe) throw new TypeError('Failed to fetch'); return Object.keys(c.tables); },
    async fetchTable(t) { if (c.coupe) throw new TypeError('Failed to fetch'); return JSON.parse(JSON.stringify(c.tables[t] || { id: [] })); },
    async applyUserActions(actions) {
      if (c.coupe) throw new TypeError('Network request failed');
      if (c.refus) throw new Error(c.refus);
      c.journal.push(actions);
      return { retValues: actions.map((a) => (a[0] === 'AddRecord' ? c.suivant++ : null)) };
    },
    async televerserPieceJointe(f) { if (c.coupe) throw new TypeError('Failed to fetch'); c.pj.push(f); return 900 + c.pj.length; },
    async urlPieceJointe(id) { return 'blob:reel-' + id; },
  };
  return c;
}
const reseauFixe = (v = true) => { let en = v; const ab = new Set(); return { enLigne: () => en, poser: (x) => { en = x; }, abonner: (f) => { ab.add(f); return () => ab.delete(f); }, dire: (x) => { en = x; ab.forEach((f) => f(x)); } }; };
const monter = (client = fauxClient(), stockage = new StockageMemoire(), reseau = reseauFixe()) => ({
  client, stockage, reseau, hl: new ClientHorsLigne(client, { stockage, reseau, intervalleMs: 0 }),
});
const visite = (constat, ouvrage = 5) => [['AddRecord', 'Visites', null, { Constat: constat, Ouvrage: ouvrage }]];

test('estErreurReseau : une coupure, oui ; un refus du serveur, non', () => {
  assert.equal(estErreurReseau(new TypeError('Failed to fetch')), true);
  assert.equal(estErreurReseau(new Error('Unable to resolve host')), true);
  assert.equal(estErreurReseau(new Error('timeout')), true);
  assert.equal(estErreurReseau(new Error('HTTP 403 — Blocked by table update access rules')), false);
  assert.equal(estErreurReseau(new Error('HTTP 500')), false);
  assert.equal(estErreurReseau(null), false);
});

test('lire : la table est gardée, et sert quand le réseau manque', async () => {
  const { client, hl } = monter();
  assert.deepEqual(await hl.fetchTable('Visites'), { id: [1], Constat: ['RAS'] });
  client.coupe = true;
  assert.deepEqual(await hl.fetchTable('Visites'), { id: [1], Constat: ['RAS'] });
  assert.equal(hl.etat().enLigne, false);
  assert.equal(hl.instantanes().length, 1);
});

test('lire : une table jamais vue, sans réseau, échoue comme avant', async () => {
  const { client, hl } = monter();
  client.coupe = true;
  await assert.rejects(() => hl.fetchTable('Jamais_vue'), /fetch/);
});

test('lire : un refus du serveur n\'est pas pris pour une coupure', async () => {
  const { client, hl } = monter();
  await hl.fetchTable('Visites');
  client.fetchTable = async () => { throw new Error('HTTP 403 — interdit'); };
  await assert.rejects(() => hl.fetchTable('Visites'), /403/);
});

test('écrire en ligne : direct, rien en file', async () => {
  const { client, hl } = monter();
  await hl.applyUserActions(visite('A'));
  assert.equal(client.journal.length, 1);
  assert.equal(hl.etat().enAttente, 0);
});

test('écrire sans réseau : mise en file, identifiant provisoire, visible dans la lecture', async () => {
  const { client, hl } = monter();
  await hl.fetchTable('Visites');
  client.coupe = true;
  const r = await hl.applyUserActions(visite('Pont fissuré'));
  assert.equal(r._enAttente, true);
  assert.ok(r.retValues[0] <= BASE_PROVISOIRE);
  assert.equal(hl.etat().enAttente, 1);
  const t = await hl.fetchTable('Visites');
  assert.deepEqual(t.Constat, ['RAS', 'Pont fissuré']);
  assert.equal(t.id[1], r.retValues[0]);
});

test('retour du réseau : la file part dans l\'ordre, et se vide', async () => {
  const { client, hl } = monter();
  client.coupe = true;
  await hl.applyUserActions(visite('première'));
  await hl.applyUserActions(visite('deuxième'));
  assert.equal(hl.etat().enAttente, 2);
  client.coupe = false;
  await hl.envoyer();
  assert.equal(client.journal.length, 2);
  assert.equal(client.journal[0][0][3].Constat, 'première');
  assert.equal(client.journal[1][0][3].Constat, 'deuxième');
  assert.equal(hl.etat().enAttente, 0);
  assert.ok(hl.etat().derniereSynchro);
});

test('une écriture faite alors que la file n\'est pas vide passe après elle', async () => {
  const { client, hl } = monter();
  client.coupe = true;
  await hl.applyUserActions(visite('première'));
  client.coupe = false;
  // le réseau est revenu, mais « première » n'est pas partie : la suivante ne la double pas
  await hl.applyUserActions(visite('deuxième'));
  await hl.envoyer();
  assert.deepEqual(client.journal.map((j) => j[0][3].Constat), ['première', 'deuxième']);
});

test('une visite posée sur un objet créé hors réseau suit l\'identifiant réel de l\'objet', async () => {
  const { client, hl } = monter();
  client.coupe = true;
  const o = await hl.applyUserActions([['AddRecord', 'Ouvrages', null, { Nom: 'Pont neuf' }]]);
  const provisoire = o.retValues[0];
  await hl.applyUserActions([['AddRecord', 'Visites', null, { Constat: 'RAS', Ouvrage: provisoire, Delai: -6 }]]);
  client.coupe = false;
  await hl.envoyer();
  assert.equal(client.journal.length, 2);
  assert.equal(client.journal[1][0][3].Ouvrage, 100, 'le vrai identifiant, pas le provisoire');
  assert.equal(client.journal[1][0][3].Delai, -6, 'une valeur négative ordinaire reste intacte');
});

test('un refus du serveur : l\'entrée reste, étiquetée, et ne bloque pas les suivantes indépendantes', async () => {
  const { client, hl } = monter();
  client.coupe = true;
  await hl.applyUserActions(visite('refusée'));
  await hl.applyUserActions(visite('acceptée'));
  client.coupe = false;
  let premier = true;
  const vrai = client.applyUserActions.bind(client);
  client.applyUserActions = async (a) => { if (premier) { premier = false; throw new Error('HTTP 403 — Blocked by table update access rules'); } return vrai(a); };
  await hl.envoyer();
  const e = hl.entrees();
  assert.equal(e.length, 1);
  assert.equal(e[0].etat, ETATS.REFUSEE);
  assert.match(e[0].raison, /Blocked/);
  assert.equal(client.journal.length, 1);
  assert.equal(client.journal[0][0][3].Constat, 'acceptée');
});

test('une entrée qui dépend d\'une ligne refusée est refusée elle aussi, pas envoyée de travers', async () => {
  const { client, hl } = monter();
  client.coupe = true;
  const o = await hl.applyUserActions([['AddRecord', 'Ouvrages', null, { Nom: 'X' }]]);
  await hl.applyUserActions([['AddRecord', 'Visites', null, { Ouvrage: o.retValues[0] }]]);
  client.coupe = false;
  client.refus = 'HTTP 403 — interdit';
  await hl.envoyer();
  client.refus = null;
  assert.deepEqual(hl.entrees().map((e) => e.etat), [ETATS.REFUSEE, ETATS.REFUSEE]);
  assert.equal(client.journal.length, 0);
});

test('une photo prise sans réseau part d\'abord, et son vrai identifiant remplace le provisoire', async () => {
  const { client, hl } = monter();
  client.coupe = true;
  const idPhoto = await hl.televerserPieceJointe({ name: 'ouvrage.jpg' });
  assert.ok(idPhoto <= BASE_PROVISOIRE);
  await hl.applyUserActions([['AddRecord', 'Visites', null, { Constat: 'RAS', Photo: ['L', idPhoto] }]]);
  client.coupe = false;
  await hl.envoyer();
  assert.equal(client.pj.length, 1);
  assert.deepEqual(client.journal[0][0][3].Photo, ['L', 901]);
});

test('la photo provisoire s\'affiche depuis l\'appareil', async () => {
  const { client, hl } = monter();
  client.coupe = true;
  const id = await hl.televerserPieceJointe({ name: 'p.jpg' });
  globalThis.URL.createObjectURL = (f) => 'blob:local-' + f.name;
  assert.equal(await hl.urlPieceJointe(id), 'blob:local-p.jpg');
  assert.equal(await hl.urlPieceJointe(7), 'blob:reel-7');
});

test('un envoi interrompu devient « incertain » au redémarrage, et n\'est pas renvoyé d\'office', async () => {
  const { client, stockage } = monter();
  await stockage.put('file', 'e1', {
    id: 'e1', doc: 'https://grist.essai|doc1', ordre: 1, date: 1, etat: ETATS.EN_COURS,
    actions: visite('en vol'), provisoires: [BASE_PROVISOIRE], pj: [],
  });
  const hl = new ClientHorsLigne(client, { stockage, reseau: reseauFixe(), intervalleMs: 0 });
  await hl.envoyer();
  assert.equal(hl.etat().incertaines, 1);
  assert.equal(client.journal.length, 0);
  assert.equal(await hl.reessayer('e1'), true);
  await hl.envoyer();
  assert.equal(client.journal.length, 1);
});

test('la file survit à un redémarrage', async () => {
  const a = monter();
  a.client.coupe = true;
  await a.hl.applyUserActions(visite('gardée'));
  const b = new ClientHorsLigne(a.client, { stockage: a.stockage, reseau: reseauFixe(), intervalleMs: 0 });
  a.client.coupe = false;
  await b.envoyer();
  assert.equal(a.client.journal[0][0][3].Constat, 'gardée');
});

test('abandonner : l\'entrée disparaît de la file et des lectures', async () => {
  const { client, hl } = monter();
  await hl.fetchTable('Visites');
  client.coupe = true;
  await hl.applyUserActions(visite('à jeter'));
  const [e] = hl.entrees();
  assert.equal(await hl.abandonner(e.id), true);
  assert.equal(hl.etat().enAttente, 0);
  assert.deepEqual((await hl.fetchTable('Visites')).Constat, ['RAS']);
});

test('créer une table ou une colonne sans réseau : refusé clairement, rien en file', async () => {
  const { client, hl } = monter();
  client.coupe = true;
  await assert.rejects(() => hl.applyUserActions([['AddColumn', 'Visites', 'x', {}]]), /structure/);
  assert.equal(hl.etat().enAttente, 0);
});

test('le réseau annoncé hors ligne par l\'appareil : lecture depuis la copie sans attendre l\'échec', async () => {
  const { client, hl, reseau } = monter();
  await hl.fetchTable('Visites');
  reseau.poser(false);
  let appels = 0;
  client.fetchTable = async () => { appels++; return { id: [] }; };
  assert.deepEqual((await hl.fetchTable('Visites')).Constat, ['RAS']);
  assert.equal(appels, 0);
});

test('le retour du réseau (événement) vide la file tout seul', async () => {
  const { client, hl, reseau } = monter();
  reseau.poser(false);
  await hl.applyUserActions(visite('en route'));
  assert.equal(client.journal.length, 0);
  reseau.dire(true);
  await hl.envoyer();
  assert.equal(client.journal.length, 1);
});

test('appliquerFileSurTable : ajout, modification, suppression ; la table reçue n\'est pas modifiée', () => {
  const base = { id: [1, 2], Constat: ['a', 'b'] };
  const entrees = [
    { etat: ETATS.EN_ATTENTE, actions: [['AddRecord', 'V', null, { Constat: 'c' }]], provisoires: [BASE_PROVISOIRE] },
    { etat: ETATS.EN_ATTENTE, actions: [['UpdateRecord', 'V', 1, { Constat: 'a2' }]], provisoires: [] },
    { etat: ETATS.EN_ATTENTE, actions: [['RemoveRecord', 'V', 2]], provisoires: [] },
    { etat: ETATS.REFUSEE, actions: [['AddRecord', 'V', null, { Constat: 'refusé' }]], provisoires: [BASE_PROVISOIRE - 1] },
    { etat: ETATS.EN_ATTENTE, actions: [['AddRecord', 'Autre', null, { x: 1 }]], provisoires: [BASE_PROVISOIRE - 2] },
  ];
  const out = appliquerFileSurTable(base, 'V', entrees);
  assert.deepEqual(out.Constat, ['a2', 'c']);
  assert.deepEqual(out.id, [1, BASE_PROVISOIRE]);
  assert.deepEqual(base, { id: [1, 2], Constat: ['a', 'b'] });
});

test('appliquerFileSurTable : une colonne que la table n\'avait pas est créée, les autres lignes à null', () => {
  const out = appliquerFileSurTable({ id: [1] }, 'V', [{ etat: ETATS.EN_ATTENTE, actions: [['AddRecord', 'V', null, { Nouveau: 'x' }]], provisoires: [BASE_PROVISOIRE] }]);
  assert.deepEqual(out.Nouveau, [null, 'x']);
});

test('substituerIds et provisoiresRestants : seuls les identifiants provisoires sont touchés', () => {
  const p = BASE_PROVISOIRE - 4;
  const v = { a: p, b: ['L', p, -6], c: { d: p }, e: 12 };
  assert.deepEqual(substituerIds(v, { [p]: 77 }), { a: 77, b: ['L', 77, -6], c: { d: 77 }, e: 12 });
  assert.deepEqual([...provisoiresRestants(v)], [p]);
});

test('estEcritureSimple et resumer', () => {
  assert.equal(estEcritureSimple(['AddRecord', 'T', null, {}]), true);
  assert.equal(estEcritureSimple(['AddColumn', 'T', 'c', {}]), false);
  assert.equal(resumer([['AddRecord', 'Visites', null, {}], ['AddRecord', 'Visites', null, {}], ['UpdateRecord', 'Ouvrages', 1, {}]]), '2 ajouts dans Visites, 1 modification dans Ouvrages');
});

test('un abonné est prévenu des changements d\'état', async () => {
  const { client, hl } = monter();
  const vus = [];
  hl.abonner((e) => vus.push(e.enAttente));
  client.coupe = true;
  await hl.applyUserActions(visite('x'));
  assert.ok(vus.includes(1));
});

test('les réglages d\'Atlas ne se mettent pas en file : ce ne sont pas des relevés', async () => {
  const { client, hl } = monter();
  client.coupe = true;
  await assert.rejects(() => hl.applyUserActions([['UpdateRecord', 'Atlas_LayerPrefs', 1, { StyleJSON: '{}' }]]), (e) => estErreurReseau(e));
  assert.equal(hl.etat().enAttente, 0);
  await assert.rejects(() => hl.applyUserActions([['AddRecord', 'Maquette_Layers', null, { Name: 'x' }]]), /Hors réseau/);
});

test('le profil de la personne connectée est gardé : sans réseau, elle reste la même', async () => {
  const { client, hl } = monter();
  client.profil = async () => { if (client.coupe) throw new TypeError('Failed to fetch'); return { id: 5, email: 'a@exemple.org', name: 'A' }; };
  assert.deepEqual(await hl.profil(), { id: 5, email: 'a@exemple.org', name: 'A' });
  client.coupe = true;
  assert.deepEqual(await hl.profil(), { id: 5, email: 'a@exemple.org', name: 'A' });
});

test('un client sans profil : null, sans lever', async () => {
  const { hl } = monter();
  assert.equal(await hl.profil(), null);
});

test('phraseSynchro : l\'état en une phrase', async () => {
  const { phraseSynchro } = await import('../lib/hote-ui.js');
  assert.equal(phraseSynchro(null), '');
  assert.equal(phraseSynchro({ enLigne: true, enAttente: 0, refusees: 0, incertaines: 0 }), 'En ligne · tout est parti');
  assert.equal(phraseSynchro({ enLigne: false, enAttente: 2, refusees: 0, incertaines: 0 }), 'Hors réseau · 2 en attente');
  assert.match(phraseSynchro({ enLigne: true, enAttente: 1, refusees: 1, incertaines: 1 }), /1 en attente · 2 à vérifier — toucher pour envoyer/);
});
