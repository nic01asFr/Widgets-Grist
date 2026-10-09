/**
 * Conformité du client hôte (lib/bi/client.js) face au vrai pont et au vrai runtime, avec un FAUX hôte : deux fenêtres reliées
 * en mémoire (tests/aide-carte-bi.js), aucun navigateur.
 * node --test tests/bi-client.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { installerPont } from '../lib/bi/liaison.js';
import { creerClient, transportFenetre, negocierVersion, analyserErreur, ErreurBi, VERSIONS_CLIENT } from '../lib/bi/client.js';
import { VERSION, COMMANDES } from '../lib/bi/pont.js';
import { carteSimulee, reseau, MANIFESTE, DONNEES } from './aide-carte-bi.js';

const HOTE = 'https://hote.test', ATLAS = 'https://atlas.test';

/** Monte le côté composant (runtime + pont) et le côté hôte (client) sur un réseau en mémoire. */
function monter({ autorisees = [HOTE], versionsClient, delai = 300, delaiConnexion = 300, origineHote = HOTE } = {}) {
  const r = reseau({ origineHote });
  const map = carteSimulee(); const rt = attacher(map);
  const liaison = installerPont(rt, { cible: r.hoteVuDeAtlas, fenetre: r.atlas, autorisees });
  const cadre = { contentWindow: r.atlasVuDeLHote };
  const rejets = [];
  const transport = transportFenetre({ fenetre: r.hote, cadre, origineComposant: ATLAS, surRejet: (raison) => rejets.push(raison) });
  const client = creerClient({ transport, delai, delaiConnexion, intervalle: 20, ...(versionsClient ? { versions: versionsClient } : {}) });
  return { r, map, rt, liaison, client, rejets };
}
const pause = (ms = 10) => new Promise((res) => setTimeout(res, ms));

test('client : connexion, négociation de version et ping', async () => {
  const { client, liaison } = monter();
  liaison.annoncer();
  const info = await client.connecter();
  assert.equal(client.connecte, true); assert.equal(client.version, VERSION); assert.equal(info.version, VERSION);
  assert.deepEqual(client.composant.versions, ['0.2', '0.3']);
  const p = await client.ping(); assert.equal(p.version, VERSION); assert.deepEqual(p.couches, []);
  client.deconnecter();
});

test('client : connexion sans annonce (le composant était déjà prêt) par relance du ping', async () => {
  const { client } = monter();
  await client.connecter(); assert.equal(client.connecte, true); assert.equal(client.version, '0.3');
  client.deconnecter();
});

test('client : setScene, getRows et accusé par commande', async () => {
  const { client, liaison } = monter(); liaison.annoncer(); await client.connecter();
  const compte = await client.setScene(MANIFESTE, DONNEES); assert.deepEqual(compte, { sites: 3 });
  const rows = await client.getRows('sites'); assert.equal(rows.lignes.length, 3);
  await assert.rejects(client.setLayerVisibility('inconnue', true), (e) => e instanceof ErreurBi && e.code === 'api' && /couche inconnue/.test(e.message));
  await assert.rejects(client.setLayerVisibility('sites'), (e) => e.code === 'argument', 'argument manquant refusé par le composant');
  client.deconnecter();
});

test('client : setFilter — l\'écho de l\'API (origine api) est ignoré par défaut, les gestes (utilisateur) passent', async () => {
  const { client, liaison, rt } = monter(); liaison.annoncer(); await client.connecter(); await client.setScene(MANIFESTE, DONNEES);
  const gestes = [], tout = [];
  client.on('filter', (charge) => gestes.push(charge));
  client.on('filter', (charge, meta) => tout.push(meta.origine), { origine: 'tout' });
  const r = await client.setFilter('f-type', ['x']); assert.deepEqual([r.compte, r.total], [2, 3]);
  await pause();
  assert.deepEqual(tout, ['api'], 'le composant signale le filtre posé par l\'hôte avec origine api');
  assert.equal(gestes.length, 0, 'anti-boucle : l\'hôte ne revoit pas son propre filtre');
  rt._interne.emettre('filter', { controlId: 'f-type', value: ['y'] }, 'utilisateur');   // un geste dans la carte
  await pause();
  assert.deepEqual(gestes.map((g) => g.value), [['y']]);
  client.deconnecter();
});

test('client : batch — un aller-retour, ordre conservé, arrêt à la première erreur', async () => {
  const { client, liaison } = monter(); liaison.annoncer(); await client.connecter();
  const ok = await client.batch([{ cmd: 'setScene', args: [MANIFESTE, DONNEES] }, { cmd: 'setFilter', args: ['f-type', ['x']] }, { cmd: 'getRows', args: ['sites'] }]);
  assert.deepEqual([ok.ok, ok.ko], [3, 0]); assert.equal(ok.resultats[2].valeur.lignes.length, 2);
  const ko = await client.batch([{ cmd: 'setFilter', args: ['inconnu', ['x']] }, { cmd: 'ping' }]);
  assert.deepEqual([ko.ok, ko.ko, ko.nonExecutes], [0, 1, 1]);
  client.deconnecter();
});

test('client : version incompatible — aucune version commune, et commande 0.3 refusée côté hôte en 0.2', async () => {
  const futur = monter({ versionsClient: ['0.9'] }); futur.liaison.annoncer();
  await assert.rejects(futur.client.connecter(), (e) => e.code === 'version'); futur.client.deconnecter();
  const ancien = monter({ versionsClient: ['0.2'] }); ancien.liaison.annoncer();
  await ancien.client.connecter(); assert.equal(ancien.client.version, '0.2');
  await assert.rejects(ancien.client.batch([]), (e) => e.code === 'version' && /0\.3/.test(e.message));
  assert.equal((await ancien.client.ping()).version, '0.3', 'les 19 commandes 0.2 restent servies');
  ancien.client.deconnecter();
});

test('composant : un message d\'une version inconnue reçoit une erreur de version, sans exécution', async () => {
  const { r, client, liaison } = monter(); liaison.annoncer(); await client.connecter();
  const recus = [];
  r.hote.addEventListener('message', (e) => recus.push(e.data));
  r.atlasVuDeLHote.postMessage({ source: 'hote-bi', version: '0.9', id: 'v', cmd: 'ping', args: [] }, ATLAS);
  await pause();
  const rep = recus.find((m) => m.id === 'v'); assert.equal(rep.ok, false); assert.match(rep.erreur, /^version :/);
  client.deconnecter();
});

test('origine refusée — un hôte non déclaré n\'obtient aucune réponse et ne reçoit rien', async () => {
  const { r, client, liaison, rejets } = monter({ origineHote: 'https://pirate.test', autorisees: [HOTE], delaiConnexion: 120 });
  liaison.annoncer();
  await assert.rejects(client.connecter(), (e) => e.code === 'delai' && /\?hote=/.test(e.message));
  assert.equal(liaison.refus.n > 0, true, 'le refus est consigné côté composant');
  assert.equal(r.journal.filter((j) => j.de === ATLAS && j.targetOrigin === 'https://pirate.test').length, 0, 'aucun message ne vise l\'origine refusée');
  assert.equal(r.journal.filter((j) => j.de === ATLAS && j.msg.type === 'resultat').length, 0, 'aucun accusé, même d\'erreur');
  assert.deepEqual(r.joker, [], 'aucun envoi en targetOrigin *');
  assert.equal(rejets.length, 0); client.deconnecter();
});

test('liste d\'hôtes vide — le composant ne répond à personne', async () => {
  const { client, liaison, r } = monter({ autorisees: [], delaiConnexion: 100 }); liaison.annoncer();
  await assert.rejects(client.connecter(), (e) => e.code === 'delai');
  assert.equal(r.journal.filter((j) => j.de === ATLAS).length, 0, 'rien n\'est émis tant qu\'aucun hôte n\'est déclaré');
  client.deconnecter();
});

test('client : un message d\'une autre origine ou d\'une autre fenêtre est écarté, jamais traité', async () => {
  const { r, client, liaison, rejets } = monter(); liaison.annoncer(); await client.connecter();
  const vus = []; client.on('select', (c) => vus.push(c), { origine: 'tout' });
  const msg = { source: 'atlas-bi', version: '0.3', type: 'select', charge: { featureId: 99 }, origine: 'utilisateur' };
  for (const f of [...r.hote.ecouteurs]) {
    f({ data: msg, origin: 'https://pirate.test', source: r.atlasVuDeLHote });   // bonne fenêtre, mauvaise origine
    f({ data: msg, origin: ATLAS, source: {} });                                  // bonne origine, autre fenêtre
  }
  assert.deepEqual(rejets, ['origine', 'source']); assert.equal(vus.length, 0);
  for (const f of [...r.hote.ecouteurs]) f({ data: msg, origin: ATLAS, source: r.atlasVuDeLHote });
  assert.equal(vus.length, 1, 'le même message de la bonne origine passe');
  client.deconnecter();
});

test('client : aucun envoi en targetOrigin *, ni du composant, ni de l\'hôte', async () => {
  const { r, client, liaison } = monter(); liaison.annoncer(); await client.connecter(); await client.setScene(MANIFESTE, DONNEES); await client.ping();
  assert.deepEqual(r.joker, []); assert.ok(r.journal.length > 4);
  assert.throws(() => transportFenetre({ fenetre: r.hote, cadre: {}, origineComposant: '*' }), (e) => e.code === 'origine');
  client.deconnecter();
});

test('client : délai maximal d\'une commande, puis déconnexion propre', async () => {
  const { r, client, liaison } = monter({ delai: 80 }); liaison.annoncer(); await client.connecter();
  liaison.desinstaller();                                  // le composant ne répond plus
  const attente = client.ping(); assert.equal(client.enAttente(), 1);
  await assert.rejects(attente, (e) => e.code === 'delai' && /80 ms/.test(e.message)); assert.equal(client.enAttente(), 0);
  const enCours = client.getLegend('x'); client.deconnecter();
  await assert.rejects(enCours, (e) => e.code === 'deconnecte');
  assert.equal(r.hote.ecouteurs.size, 0, 'l\'écoute de la fenêtre est retirée');
  await assert.rejects(client.ping(), (e) => e.code === 'deconnecte'); assert.equal(client.connecte, false);
});

test('client : commande inconnue refusée localement ; toutes les commandes du contrat sont des méthodes', async () => {
  const { client } = monter();
  await assert.rejects(client.appeler('exec'), (e) => e.code === 'commande');
  for (const cmd of Object.keys(COMMANDES)) assert.equal(typeof client[cmd], 'function', cmd);
});

test('client : fonctions pures de négociation et d\'analyse d\'erreur', () => {
  assert.equal(negocierVersion(['0.3', '0.2'], ['0.2', '0.3']), '0.3'); assert.equal(negocierVersion(['0.3', '0.2'], ['0.2']), '0.2'); assert.equal(negocierVersion(['0.3'], ['0.2']), null); assert.equal(negocierVersion(['0.3'], undefined), null);
  assert.deepEqual(analyserErreur('version : trop vieux'), { code: 'version', message: 'trop vieux' });
  assert.deepEqual(analyserErreur('couche inconnue : a'), { code: 'api', message: 'couche inconnue : a' });
  assert.deepEqual(VERSIONS_CLIENT, ['0.3', '0.2']);
});
