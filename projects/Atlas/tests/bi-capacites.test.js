// Capacités d'un chargement du composant (extension additive du contrat 0.3) : annonce dans `ready`, refus `capacite_absente`.
// node --test tests/bi-capacites.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { installerPont } from '../lib/bi/liaison.js';
import { creerClient, transportFenetre, ErreurBi, analyserErreur, VERSION_CLIENT } from '../lib/bi/client.js';
import {
  CAPACITES, CAPACITE_DE_COMMANDE, COMMANDES, ErreurCapacite, normaliserCapacites, garderApi, executerBatch, creerPont, resultat,
} from '../lib/bi/pont.js';
import { carteSimulee, reseau, MANIFESTE, DONNEES } from './aide-carte-bi.js';

const HOTE = 'https://hote.test', ATLAS = 'https://atlas.test';

test('capacites : la liste connue est triee et chaque commande du contrat depend d\'une brique connue', () => {
  assert.deepEqual([...CAPACITES], [...CAPACITES].sort());
  for (const cmd of Object.keys(COMMANDES)) assert.ok(CAPACITES.includes(CAPACITE_DE_COMMANDE[cmd]), 'commande sans brique : ' + cmd);
  for (const cmd of Object.keys(CAPACITE_DE_COMMANDE)) assert.ok(cmd in COMMANDES, 'brique pour une commande inconnue : ' + cmd);
});

test('normaliserCapacites : absent = toutes, doublons retires, tri, nom inconnu et non-tableau refuses', () => {
  assert.deepEqual(normaliserCapacites(undefined), [...CAPACITES]);
  assert.deepEqual(normaliserCapacites(null), [...CAPACITES]);
  assert.deepEqual(normaliserCapacites(['temps', 'socle', 'temps']), ['socle', 'temps']);
  assert.deepEqual(normaliserCapacites([]), []);
  assert.throws(() => normaliserCapacites(['socle', 'reseau']), /capacite inconnue : reseau/);
  assert.throws(() => normaliserCapacites('socle'), /tableau/);
});

test('garderApi : une fonction dont la brique manque leve ErreurCapacite SANS s\'executer', () => {
  let appels = 0; const api = { setTime: () => { appels++; return 1; }, ping: () => 'pong', maison: () => 'x' };
  const g = garderApi(api, ['socle']);
  assert.equal(g.ping(), 'pong'); assert.equal(g.maison(), 'x');
  assert.throws(() => g.setTime('2020'), (e) => e instanceof ErreurCapacite && e.code === 'capacite_absente' && e.capacite === 'temps' && /setTime/.test(e.message));
  assert.equal(appels, 0);
  assert.equal(garderApi(api, ['socle', 'temps']).setTime(), 1);
});

test('pont : le resultat d\'une capacite absente porte code et capacite, une erreur ordinaire non', async () => {
  const envoyes = [];
  const api = garderApi({ ping: () => 1, addAdminLayer: () => 1, setFilter: () => { throw new Error('filtre inconnu'); } }, ['socle']);
  const pont = creerPont({ api, envoyer: (m) => envoyes.push(m), autorisees: [HOTE] });
  const msg = (id, cmd, args) => ({ source: 'hote-bi', version: '0.3', id, cmd, args });
  await pont.recevoir(msg('a', 'addAdminLayer', ['commune']), HOTE);
  await pont.recevoir(msg('b', 'setFilter', ['f', ['x']]), HOTE);
  const [a, b] = envoyes;
  assert.equal(a.ok, false); assert.equal(a.code, 'capacite_absente'); assert.equal(a.capacite, 'territoires'); assert.match(a.erreur, /^capacite_absente : /);
  assert.equal(b.ok, false); assert.equal('code' in b, false); assert.equal('capacite' in b, false); assert.equal(b.erreur, 'filtre inconnu');
});

test('resultat : sans extra, la forme est celle du contrat 0.3', () => {
  assert.deepEqual(Object.keys(resultat('i', false, 'x')).sort(), ['erreur', 'id', 'ok', 'source', 'type', 'version']);
});

test('batch : l\'ordre refuse pour capacite absente porte code et capacite, les autres suivent selon `arret`', async () => {
  const api = garderApi({ ping: () => 'p', setTime: () => 't', select: () => 's' }, ['socle']);
  const r = await executerBatch(api, [{ cmd: 'ping' }, { cmd: 'setTime', args: ['2020'] }, { cmd: 'select', args: [1] }], { arret: 'continuer' });
  assert.deepEqual([r.ok, r.ko, r.nonExecutes], [2, 1, 0]);
  const ko = r.resultats[1];
  assert.equal(ko.ok, false); assert.equal(ko.code, 'capacite_absente'); assert.equal(ko.capacite, 'temps');
  assert.equal('code' in r.resultats[0], false);
  const stop = await executerBatch(api, [{ cmd: 'setTime', args: ['2020'] }, { cmd: 'ping' }]);
  assert.deepEqual([stop.ok, stop.ko, stop.nonExecutes], [0, 1, 1]);
});

test('runtime : toutes les capacites par defaut, ping les annonce, aucune regression de la garde', async () => {
  const rt = attacher(carteSimulee());
  assert.deepEqual(rt.capacites, [...CAPACITES]); assert.equal(rt.paquet, null);
  const p = rt.api.ping(); assert.deepEqual(p.capacites, [...CAPACITES]); assert.equal(p.paquet, null);
  const compte = await rt.api.setScene(MANIFESTE, DONNEES); assert.equal(compte.sites, 3);
});

test('runtime : une brique retiree refuse ses commandes ET le type de couche correspondant, sans empecher le reste', async () => {
  const rt = attacher(carteSimulee(), { capacites: ['socle', 'points'] });
  assert.deepEqual(rt.capacites, ['points', 'socle']);
  await assert.rejects(async () => rt.api.setTime('2020'), (e) => e.code === 'capacite_absente' && e.capacite === 'temps');
  await assert.rejects(async () => rt.api.addAdminLayer('commune', {}), (e) => e.code === 'capacite_absente' && e.capacite === 'territoires');
  await assert.rejects(async () => rt.api.setEdition('sites', true), (e) => e.capacite === 'edition');
  const manifeste = { layers: [...MANIFESTE.layers, { id: 'dep', name: 'Departements', admin: { niveau: 'departement' } }] };
  const r = await rt.api.setScene(manifeste, DONNEES);
  assert.equal(r.sites, 3, 'la couche de donnees se monte');
  assert.match(r._erreurs.dep, /^capacite_absente : .*territoires/, 'la couche administrative est refusee seule');
  const b = await rt.api.batch([{ cmd: 'setTime', args: ['2020'] }, { cmd: 'ping' }], { arret: 'continuer' });
  assert.equal(b.resultats[0].code, 'capacite_absente'); assert.equal(b.resultats[0].capacite, 'temps'); assert.equal(b.resultats[1].ok, true);
});

test('runtime : l\'hote ne peut pas elargir les capacites par les options de batch', async () => {
  const rt = attacher(carteSimulee(), { capacites: ['socle'] });
  const b = await rt.api.batch([{ cmd: 'setTime', args: ['2020'] }], { arret: 'continuer', capacites: ['socle', 'temps'] });
  assert.equal(b.resultats[0].code, 'capacite_absente');
});

test('runtime : un nom de capacite inconnu est refuse a la construction', () => {
  assert.throws(() => attacher(carteSimulee(), { capacites: ['socle', '3d'] }), /capacite inconnue/);
});

function monter(opts = {}) {
  const r = reseau({ origineHote: HOTE });
  const rt = attacher(carteSimulee(), opts);
  const liaison = installerPont(rt, { cible: r.hoteVuDeAtlas, fenetre: r.atlas, autorisees: [HOTE] });
  const transport = transportFenetre({ fenetre: r.hote, cadre: { contentWindow: r.atlasVuDeLHote }, origineComposant: ATLAS });
  const client = creerClient({ transport, delai: 300, delaiConnexion: 300, intervalle: 20 });
  return { r, rt, liaison, client };
}

test('ready : annonce capacites (triees) et paquet null quand aucun manifeste n\'a ete lu', async () => {
  const { client, liaison, r } = monter({ capacites: ['temps', 'socle', 'points'] });
  const vus = []; client.on('ready', (c) => vus.push(c), { origine: 'tout' });
  liaison.annoncer();
  const info = await client.connecter();
  assert.deepEqual(info.capacites, ['points', 'socle', 'temps']); assert.equal(info.paquet, null);
  assert.deepEqual(client.composant.capacites, ['points', 'socle', 'temps']);
  assert.ok(vus.some((c) => c.runtime === true && Array.isArray(c.capacites) && c.paquet === null));
  client.deconnecter(); void r;
});

test('ready : un paquet lu est annonce avec sa version, son edition et son recensement', async () => {
  const paquet = { version_paquet: '1.0.0', edition_admin_express: '2026', recensement: '2023' };
  const { client, liaison } = monter({ paquet });
  liaison.annoncer();
  const info = await client.connecter();
  assert.deepEqual(info.paquet, paquet);
  client.deconnecter();
});

test('ready : un hote qui a manque l\'annonce retrouve capacites et paquet par le ping', async () => {
  const { client } = monter({ capacites: ['socle'] });
  const info = await client.connecter();
  assert.deepEqual(info.capacites, ['socle']); assert.equal(info.paquet, null);
  client.deconnecter();
});

test('client : une commande dont la brique manque rejette ErreurBi capacite_absente avec capacite, sans parser le texte', async () => {
  const { client, liaison } = monter({ capacites: ['socle', 'points'] });
  liaison.annoncer(); await client.connecter();
  await assert.rejects(() => client.appeler('setTime', '2020'), (e) => e instanceof ErreurBi && e.code === 'capacite_absente' && e.capacite === 'temps' && e.details.cmd === 'setTime');
  await assert.rejects(() => client.appeler('drillUp'), (e) => e.code === 'capacite_absente' && e.capacite === 'territoires');
  assert.equal((await client.ping()).version, '0.3', 'le reste fonctionne');
  client.deconnecter();
});

test('client : analyserErreur reconnait aussi le texte capacite_absente (repli) et VERSION_CLIENT est un entier', () => {
  assert.equal(analyserErreur('capacite_absente : setTime demande la capacité « temps »').code, 'capacite_absente');
  assert.ok(Number.isInteger(VERSION_CLIENT) && VERSION_CLIENT >= 1);
});
