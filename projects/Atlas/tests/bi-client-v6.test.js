/**
 * Client de l'hôte, révision 6 (contrat 0.8) : `connecter()` échoue vite sur une erreur fatale du composant, le message du délai cite ce que le composant a signalé,
 * le délai de connexion par défaut passe à 90 s ; le `ping` annonce les commandes servies.
 * node --test projects/Atlas/tests/bi-client-v6.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { creerClient, ErreurBi, VERSION_CLIENT } from '../lib/bi/client.js';
import { attacher } from '../lib/bi/bi-runtime.js';
import { brancher } from '../lib/bi/canevas.js';
import { commandesServies, COMMANDES, COMMANDES_PROFIL_COMPLET } from '../lib/bi/pont.js';
import { carteSimulee } from './aide-carte-bi.js';

/** Un fil simulé : on pilote les minuteries et on injecte les messages du composant à la main (le composant ne répond jamais au ping). */
function fil() {
  const minuteries = new Map(); const ecouteurs = new Set(); let n = 0; const envoyes = [];
  const minuterie = {
    setTimeout(fn, ms) { const id = ++n; minuteries.set(id, { fn, ms }); return id; }, clearTimeout(id) { minuteries.delete(id); },
    setInterval() { return ++n; }, clearInterval() {},
  };
  const transport = { envoyer: (m) => envoyes.push(m), ecouter: (f) => { ecouteurs.add(f); return () => ecouteurs.delete(f); } };
  const recevoir = (msg) => { for (const f of ecouteurs) f(msg); };
  const echeance = (ms) => { for (const [id, m] of [...minuteries]) if (m.ms === ms) { minuteries.delete(id); m.fn(); } };
  const delais = () => [...minuteries.values()].map((m) => m.ms);
  return { minuterie, transport, recevoir, echeance, delais, envoyes };
}
const erreur = (charge) => ({ source: 'atlas-bi', version: '0.3', type: 'error', charge, origine: 'utilisateur' });

test('le client est en révision 6', () => { assert.equal(VERSION_CLIENT, 6); });

test('connecter : le délai de connexion par défaut est de 90 s', async () => {
  const f = fil(); const client = creerClient({ transport: f.transport, minuterie: f.minuterie });
  const p = client.connecter(); p.catch(() => {});
  assert.ok(f.delais().includes(90000), 'la minuterie de connexion attend 90 s : ' + f.delais());
  f.echeance(90000); await assert.rejects(p, (e) => e.code === 'delai');
});

test('connecter : une erreur fatale du composant coupe l\'attente tout de suite, avec la cause', async () => {
  const f = fil(); const client = creerClient({ transport: f.transport, minuterie: f.minuterie });
  const p = client.connecter();
  f.recevoir(erreur({ code: 'dependance', message: 'La carte n’a pas démarré : unpkg.com ne se charge pas.', niveau: 'fatal' }));
  await assert.rejects(p, (e) => e instanceof ErreurBi && e.code === 'composant' && /ne peut pas démarrer/.test(e.message) && /unpkg\.com/.test(e.message) && e.details.causes.length === 1 && e.details.code === 'dependance');
  assert.equal(client.connecte, false);
  assert.ok(!f.delais().includes(90000), 'la minuterie de connexion est retirée');
});

test('connecter : un avertissement ne coupe rien, mais le message du délai le cite', async () => {
  const f = fil(); const client = creerClient({ transport: f.transport, minuterie: f.minuterie, delaiConnexion: 5000 });
  const p = client.connecter(); p.catch(() => {});
  f.recevoir(erreur({ code: 'delai', message: 'La carte n’a pas démarré après 20 s (réseau lent ou dépendance bloquée).', niveau: 'avertissement' }));
  f.recevoir(erreur({ code: 'delai', message: 'La carte n’a pas démarré après 20 s (réseau lent ou dépendance bloquée).', niveau: 'avertissement' }));
  f.echeance(5000);
  await assert.rejects(p, (e) => e.code === 'delai' && /Causes possibles/.test(e.message) && /\(\?hote=<origine>\)/.test(e.message) && /réseau très lent/.test(e.message) && /signalé par le composant : La carte n’a pas démarré après 20 s/.test(e.message) && e.details.causes.length === 1, 'cause dédoublonnée');
});

test('connecter : sans rien signalé, le message du délai donne les causes possibles sans section « signalé »', async () => {
  const f = fil(); const client = creerClient({ transport: f.transport, minuterie: f.minuterie, delaiConnexion: 5000 });
  const p = client.connecter(); p.catch(() => {});
  f.echeance(5000);
  await assert.rejects(p, (e) => /après 5000 ms/.test(e.message) && !/signalé par le composant/.test(e.message) && Array.isArray(e.details.causes) && e.details.causes.length === 0);
});

test('connecter : une erreur qui arrive APRÈS la connexion n\'a aucun effet sur la liaison', async () => {
  const f = fil(); const client = creerClient({ transport: f.transport, minuterie: f.minuterie });
  const p = client.connecter();
  f.recevoir({ source: 'atlas-bi', version: '0.8', type: 'ready', charge: { runtime: true, versions: ['0.8'], version: '0.8' }, origine: 'api' });
  await p; assert.equal(client.connecte, true);
  f.recevoir(erreur({ code: 'police', message: 'police', niveau: 'fatal' })); assert.equal(client.connecte, true);
});

test('ping : le composant annonce les commandes qu\'il sert, triées', () => {
  const { api } = attacher(carteSimulee(), {});
  const c = api.ping().commandes;
  assert.deepEqual(c, [...c].sort());
  for (const sert of ['ping', 'setScene', 'getElevationGrid', 'captureImage', 'getFeatures', 'getRows']) assert.ok(c.includes(sert), sert);
  for (const absente of COMMANDES_PROFIL_COMPLET) assert.ok(!c.includes(absente), absente + ' : la carte nue la refuse, elle ne l\'annonce pas');
  const restreint = attacher(carteSimulee(), { capacites: ['socle'] }).api.ping().commandes;
  assert.ok(restreint.includes('getElevationGrid') && !restreint.includes('setEdition') && !restreint.includes('setTime') && !restreint.includes('addAdminLayer'), 'les commandes d\'une brique absente ne sont pas annoncées');
});

test('ping : le profil complet ajoute ce qu\'il a branché', () => {
  const nu = attacher(carteSimulee(), {});
  const sans = nu.api.ping().commandes;
  const plein = attacher(carteSimulee(), {});
  brancher(plein, { monterScene() { return {}; }, retirerScene() {}, outils: {}, abonner: () => () => {}, exporter3d: async () => ({}), soleil: { lire: () => ({}), poser: () => ({}), dock() {}, dockVisible: () => false }, recit: { lire: () => ({}), aller: async () => ({}) } });
  const avec = plein.api.ping().commandes;
  for (const n of COMMANDES_PROFIL_COMPLET) assert.ok(avec.includes(n), n);
  assert.deepEqual(avec.filter((n) => !COMMANDES_PROFIL_COMPLET.includes(n)), sans);
  const partiel = attacher(carteSimulee(), {});
  brancher(partiel, { monterScene() { return {}; }, retirerScene() {}, outils: {}, abonner: () => () => {}, exporter3d: async () => ({}) });
  const p = partiel.api.ping().commandes; assert.ok(p.includes('exportScene3D') && !p.includes('getRecit') && !p.includes('getSun'));
});

test('commandesServies : seules les commandes du contrat sont annoncées', () => {
  assert.deepEqual(commandesServies(['socle'], ['inconnue', 'constructor']).filter((n) => !(n in COMMANDES)), []);
});
