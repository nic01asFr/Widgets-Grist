/**
 * Créer un document Grist et y verser une scène — contre un faux Grist qui applique vraiment les actions.
 *
 * node --test projects/Atlas/tests/creer-document.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  espacesEditables, listerEspacesEditables, nomParDefaut, creerDocument, sceneNeuve, actionsTables, lotsDeLignes,
  planEnvoi, journalVide, envoyerScene, LOT_LIGNES, assurerReconnaissable,
} from '../lib/creer-document.js';
import {
  creerScene, appliquerActions, tableColonnaire, ClientLocal, creerSceneLocale,
} from '../lib/scene-locale.js';
import { StockageMemoire } from '../lib/hors-ligne.js';

/** Un Grist factice : des espaces, des documents, et un moteur qui applique les actions comme Grist le ferait. */
function fauxGrist() {
  const g = {
    docs: {}, suivant: 1, appels: [], echecs: [], photos: 0,
    fetch: async (url, opts = {}) => {
      const u = String(url);
      g.appels.push(`${opts.method || 'GET'} ${u.replace('https://grist.essai', '')}`);
      const rep = (corps, statut = 200) => ({ ok: statut < 400, status: statut, json: async () => corps, text: async () => JSON.stringify(corps) });
      if (g.reseauCoupe) throw new TypeError('Failed to fetch');
      if (u.endsWith('/api/orgs')) return rep([{ id: 1, name: 'Équipe' }, { id: 2, name: 'Ville' }]);
      if (u.endsWith('/api/orgs/1/workspaces')) return rep([{ id: 10, name: 'Terrain', access: 'owners' }, { id: 11, name: 'Archives', access: 'viewers' }]);
      if (u.endsWith('/api/orgs/2/workspaces')) return rep([{ id: 20, name: 'Public', access: 'editors' }]);
      const m = u.match(/\/api\/workspaces\/(\d+)\/docs$/);
      if (m && opts.method === 'POST') {
        if (m[1] === '11') return rep({ error: 'forbidden' }, 403);
        const id = `doc${g.suivant++}`;
        g.docs[id] = { nom: JSON.parse(opts.body).name, scene: creerScene({ id }), espace: m[1] };
        return rep(id);
      }
      const s = u.match(/\/api\/docs\/(\w+)\/sql\?q=(.*)$/);
      if (s) {
        const nom = decodeURIComponent(s[2]).match(/from "(\w+)"/)[1];
        const t = g.docs[s[1]].scene.tables[nom];
        return rep({ records: [{ fields: { n: t ? t.ids.length : 0 } }] });
      }
      return rep({ error: 'inconnu' }, 404);
    },
    client: ({ docId }) => ({
      async listTables() { return Object.keys(g.docs[docId].scene.tables); },
      async applyUserActions(actions) {
        if (g.echecs.length) { const e = g.echecs.shift(); if (e) throw new Error(e); }
        return appliquerActions(g.docs[docId].scene, actions);
      },
      async televerserPieceJointe(blob) { g.photos++; return [5000 + g.photos]; },
    }),
  };
  return g;
}

const COLS = [{ id: 'Nom', type: 'Text' }, { id: 'Ouvrage', type: 'Ref:Ouvrages' }, { id: 'Photos', type: 'Attachments' }];
function sceneRelevee() {
  const s = sceneNeuve({ id: 'loc', nom: 'Relevé' });
  appliquerActions(s, [
    // Visites est créée AVANT Ouvrages, et y renvoie : l'ordre de création ne doit pas compter.
    ['AddTable', 'Visites', [{ id: 'Constat', type: 'Text' }, { id: 'Ouvrage', type: 'Ref:Ouvrages' }, { id: 'Photos', type: 'Attachments' }]],
    ['AddTable', 'Ouvrages', [{ id: 'Nom', type: 'Text' }]],
    ['BulkAddRecord', 'Ouvrages', [1, 2], { Nom: ['Pont', 'Passerelle'] }],
    ['BulkAddRecord', 'Visites', [1, 2, 3], { Constat: ['RAS', 'Fissure', 'RAS'], Ouvrage: [1, 1, 2], Photos: [['L', 1, 2], null, ['L', 2]] }],
  ]);
  s.pj = { 1: { nom: 'a.jpg' }, 2: { nom: 'b.jpg' } };
  return s;
}
const pjs = async () => [{ id: 1, blob: new Blob(['a']), nom: 'a.jpg' }, { id: 2, blob: new Blob(['b']), nom: 'b.jpg' }];

test('espacesEditables : propriétaire ou éditeur seulement', () => {
  const r = espacesEditables([{ id: 1, name: 'Équipe' }, { id: 2, name: 'Ville' }], {
    1: [{ id: 10, name: 'Terrain', access: 'owners' }, { id: 11, name: 'Archives', access: 'viewers' }],
    2: [{ id: 20, name: 'Public', access: 'editors' }, { id: 21, name: 'Sans rôle' }],
  });
  assert.deepEqual(r, [{ id: 10, nom: 'Terrain', org: 'Équipe', acces: 'owners' }, { id: 20, nom: 'Public', org: 'Ville', acces: 'editors' }]);
  assert.deepEqual(espacesEditables(null, null), []);
});

test('listerEspacesEditables : le compte, ses organisations, ses espaces', async () => {
  const g = fauxGrist();
  const r = await listerEspacesEditables('https://grist.essai/', 'cle', { fetchFn: g.fetch });
  assert.deepEqual(r.map((e) => e.nom), ['Terrain', 'Public']);
  g.reseauCoupe = true;
  await assert.rejects(() => listerEspacesEditables('https://grist.essai', 'cle', { fetchFn: g.fetch }), /fetch/);
});

test('nomParDefaut : daté, en français', () => {
  assert.equal(nomParDefaut(new Date(2026, 9, 2)), 'Scène Atlas — 02/10/2026');
});

test('creerDocument : rend l’identifiant ; un refus se dit', async () => {
  const g = fauxGrist();
  assert.equal(await creerDocument({ baseUrl: 'https://grist.essai', jeton: 'k', espaceId: 10, nom: 'Mon doc', fetchFn: g.fetch }), 'doc1');
  assert.equal(g.docs.doc1.nom, 'Mon doc');
  await assert.rejects(() => creerDocument({ baseUrl: 'https://grist.essai', jeton: 'k', espaceId: 11, nom: 'x', fetchFn: g.fetch }), /HTTP 403/);
});

test('sceneNeuve : la table de préférences, qui fait reconnaître la scène', () => {
  const s = sceneNeuve({ nom: 'Neuve' });
  assert.deepEqual(Object.keys(s.tables), ['Atlas_ScenePrefs']);
  assert.ok(s.tables.Atlas_ScenePrefs.cols.some((c) => c.id === 'Miniature'));
});

test('actionsTables : les colonnes de référence viennent après toutes les tables', () => {
  const a = actionsTables(sceneRelevee());
  const noms = a.map((x) => `${x[0]} ${x[1]}${x[0] === 'AddColumn' ? '.' + x[2] : ''}`);
  assert.deepEqual(noms, ['AddTable Atlas_ScenePrefs', 'AddTable Visites', 'AddTable Ouvrages', 'AddColumn Visites.Ouvrage']);
  const visites = a.find((x) => x[0] === 'AddTable' && x[1] === 'Visites');
  assert.deepEqual(visites[2].map((c) => c.id), ['Constat', 'Photos'], 'sans la colonne de référence');
  assert.deepEqual(actionsTables(sceneRelevee(), { dejaCreees: ['Visites', 'Atlas_ScenePrefs'] }).map((x) => x[1]), ['Ouvrages']);
});

test('lotsDeLignes : par lots, identifiants gardés, photos traduites', () => {
  const s = sceneRelevee();
  const lots = lotsDeLignes(s, 'Visites', { pjMap: { 1: 7001, 2: 7002 } });
  assert.equal(lots.length, 1);
  assert.deepEqual(lots[0][2], [1, 2, 3]);
  assert.deepEqual(lots[0][3].Photos, [['L', 7001, 7002], null, ['L', 7002]]);
  assert.equal(lotsDeLignes(s, 'Visites', { taille: 2 }).length, 2);
  assert.deepEqual(lotsDeLignes(s, 'Visites', { depart: 2 })[0][2], [3], 'la reprise saute ce qui est arrivé');
  assert.deepEqual(lotsDeLignes(s, 'Visites', { pjMap: {} })[0][3].Photos[0], null, 'une photo non versée disparaît plutôt que de pointer dans le vide');
  assert.ok(LOT_LIGNES >= 100);
});

test('planEnvoi : le plan en clair', () => {
  const p = planEnvoi(sceneRelevee());
  assert.deepEqual(p.map((e) => e.id), ['document', 'photos', 'tables', 'donnees:Visites', 'donnees:Ouvrages']);
  assert.match(p[1].libelle, /2 photos/);
  assert.deepEqual(planEnvoi(sceneNeuve()).map((e) => e.id), ['document', 'tables']);
});

test('envoyer : le document est créé, tables, références, photos et lignes y arrivent à l’identique', async () => {
  const g = fauxGrist();
  const etapes = [];
  const r = await envoyerScene({
    scene: sceneRelevee(), piecesJointes: pjs, baseUrl: 'https://grist.essai', jeton: 'k', espaceId: 10, nom: 'Mon relevé',
    fetchFn: g.fetch, creerClient: async (o) => g.client(o), onEtape: (e) => etapes.push(e.phase),
  });
  assert.equal(r.docId, 'doc1');
  assert.equal(g.docs.doc1.nom, 'Mon relevé');
  const distant = g.docs.doc1.scene;
  assert.deepEqual(Object.keys(distant.tables).sort(), ['Atlas_ScenePrefs', 'Ouvrages', 'Visites']);
  assert.deepEqual(tableColonnaire(distant, 'Ouvrages'), { id: [1, 2], Nom: ['Pont', 'Passerelle'] });
  const v = tableColonnaire(distant, 'Visites');
  assert.deepEqual(v.Ouvrage, [1, 1, 2], 'les références sont restées vraies, sans rien traduire');
  assert.deepEqual(v.Photos, [['L', 5001, 5002], null, ['L', 5002]], 'les photos portent les identifiants que Grist a donnés');
  assert.equal(distant.tables.Visites.cols.find((c) => c.id === 'Ouvrage').type, 'Ref:Ouvrages');
  assert.equal(r.journal.termine, true);
  assert.ok(['document', 'photos', 'tables', 'donnees'].every((p) => etapes.includes(p)));
});

test('une scène neuve dans Grist : un document reconnaissable, prêt à ouvrir', async () => {
  const g = fauxGrist();
  const r = await envoyerScene({ scene: sceneNeuve({ nom: 'Neuve' }), baseUrl: 'https://grist.essai', jeton: 'k', espaceId: 20, nom: 'Neuve', fetchFn: g.fetch, creerClient: async (o) => g.client(o) });
  assert.deepEqual(Object.keys(g.docs[r.docId].scene.tables), ['Atlas_ScenePrefs']);
  assert.equal(g.docs[r.docId].espace, '20');
});

test('reprise : un réseau qui tombe à mi-chemin ne double ni le document, ni les tables, ni les lignes', async () => {
  const g = fauxGrist();
  const scene = sceneRelevee();
  const tenu = { journal: null };
  const lancer = (journal) => envoyerScene({
    scene, piecesJointes: pjs, baseUrl: 'https://grist.essai', jeton: 'k', espaceId: 10, nom: 'Relevé', fetchFn: g.fetch,
    creerClient: async (o) => g.client(o), journal, ecrireJournal: (j) => { tenu.journal = JSON.parse(JSON.stringify(j)); },
  });
  // Les tables passent (1er appel), puis le versement d'« Ouvrages » échoue.
  g.echecs = [null, 'Network request failed'];
  await assert.rejects(() => lancer(journalVide()), /Network/);
  assert.equal(tenu.journal.docId, 'doc1');
  assert.deepEqual(tenu.journal.photos, { 1: 5001, 2: 5002 }, 'les photos sont déjà parties');
  assert.equal(Object.keys(g.docs).length, 1);
  assert.deepEqual(tableColonnaire(g.docs.doc1.scene, 'Ouvrages'), { id: [], Nom: [] });

  const r = await lancer(tenu.journal);
  assert.equal(r.docId, 'doc1');
  assert.equal(Object.keys(g.docs).length, 1, 'aucun second document');
  assert.equal(g.photos, 2, 'aucune photo versée deux fois');
  assert.deepEqual(tableColonnaire(g.docs.doc1.scene, 'Ouvrages').id, [1, 2]);
  assert.deepEqual(tableColonnaire(g.docs.doc1.scene, 'Visites').id, [1, 2, 3]);
  assert.equal(r.journal.termine, true);
});

test('reprise : des lignes déjà arrivées ne sont pas versées deux fois', async () => {
  const g = fauxGrist();
  const tenu = { journal: null };
  const gros = sceneNeuve({ id: 'gros' });
  appliquerActions(gros, [['AddTable', 'T', [{ id: 'A', type: 'Int' }]], ['BulkAddRecord', 'T', [1, 2, 3, 4, 5], { A: [10, 20, 30, 40, 50] }]]);
  const lancer = (journal) => envoyerScene({
    scene: gros, baseUrl: 'https://grist.essai', jeton: 'k', espaceId: 10, nom: 'Gros', fetchFn: g.fetch, tailleLot: 2,
    creerClient: async (o) => g.client(o), journal, ecrireJournal: (j) => { tenu.journal = JSON.parse(JSON.stringify(j)); },
  });
  // Appels : les tables, puis trois lots de 2, 2 et 1 ligne ; le troisième tombe.
  g.echecs = [null, null, null, 'Network request failed'];
  await assert.rejects(() => lancer(journalVide()), /Network/);
  assert.deepEqual(tableColonnaire(g.docs.doc1.scene, 'T').id, [1, 2, 3, 4], 'deux lots sont arrivés');
  const r = await lancer(tenu.journal);
  assert.deepEqual(tableColonnaire(g.docs[r.docId].scene, 'T'), { id: [1, 2, 3, 4, 5], A: [10, 20, 30, 40, 50] }, 'la ligne manquante seule a été versée');
});

test('le journal sert aussi à envoyer une scène locale gardée dans le stockage de l’appareil', async () => {
  const stockage = new StockageMemoire();
  const locale = await creerSceneLocale(stockage, { nom: 'Sur le terrain' });
  const c = new ClientLocal({ stockage, scene: locale });
  await c.applyUserActions([['AddTable', 'Points', [{ id: 'Nom', type: 'Text' }]], ['AddRecord', 'Points', null, { Nom: 'P1' }], ['AddRecord', 'Points', null, { Nom: 'P2' }]]);
  const g = fauxGrist();
  const r = await envoyerScene({
    scene: locale, piecesJointes: () => c.piecesJointes(), baseUrl: 'https://grist.essai', jeton: 'k', espaceId: 10, nom: locale.nom,
    fetchFn: g.fetch, creerClient: async (o) => g.client(o),
  });
  assert.deepEqual(tableColonnaire(g.docs[r.docId].scene, 'Points').Nom, ['P1', 'P2']);
});

test('une scène locale sans table de signature en reçoit une, pour être reconnue dans la liste ; la scène elle-même n’est pas touchée', async () => {
  const s = creerScene({ id: 'x' });
  appliquerActions(s, [['AddTable', 'Maquette_Layers', [{ id: 'Nom', type: 'Text' }]]]);
  const r = assurerReconnaissable(s);
  assert.deepEqual(Object.keys(r.tables), ['Maquette_Layers', 'Atlas_ScenePrefs']);
  assert.deepEqual(Object.keys(s.tables), ['Maquette_Layers']);
  assert.deepEqual(Object.keys(assurerReconnaissable(r).tables), ['Maquette_Layers', 'Atlas_ScenePrefs'], 'une seule fois');
  const g = fauxGrist();
  const rendu = await envoyerScene({ scene: s, baseUrl: 'https://grist.essai', jeton: 'k', espaceId: 10, nom: 'L', fetchFn: g.fetch, creerClient: async (o) => g.client(o) });
  assert.ok(g.docs[rendu.docId].scene.tables.Atlas_ScenePrefs);
  assert.deepEqual(planEnvoi(s).map((e) => e.id), ['document', 'tables']);
});
