/**
 * Le client de l'hôte en UN SEUL FICHIER (`lib/bi/client-hote.js`), généré par `tools/generer-client-hote.mjs` depuis `client.js` et `pont.js`.
 * Il ne doit rien importer, porter exactement les mêmes tables de commandes que le pont, et être à jour des sources.
 *
 * node --test projects/Atlas/tests/client-hote.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { construireClientHote, CHEMIN_SORTIE } from '../tools/generer-client-hote.mjs';
import * as pont from '../lib/bi/pont.js';
import * as client from '../lib/bi/client.js';
import { attacher } from '../lib/bi/bi-runtime.js';
import { installerPont } from '../lib/bi/liaison.js';
import { carteSimulee, reseau, MANIFESTE, DONNEES } from './aide-carte-bi.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = construireClientHote();

async function charger(texte) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'client-hote-'));
  const f = path.join(dossier, 'client-hote.mjs');
  fs.writeFileSync(f, texte);
  return import(pathToFileURL(f).href);
}

test('le fichier généré n\'importe rien : ni pont, ni charte, ni aucun autre module', () => {
  assert.doesNotMatch(source, /^\s*import\s/m, 'aucune instruction import');
  assert.doesNotMatch(source, /import\(/, 'aucun import dynamique');
  assert.doesNotMatch(source, /charte|verifierTaille/, 'rien de la charte : le client n\'a pas à valider une charte');
  assert.match(source, /^\/\*\*[\s\S]*Généré par tools\/generer-client-hote\.mjs/, 'en-tête : ce fichier est généré, à ne pas modifier à la main');
});

test('mêmes tables que le pont : commandes, commandes 0.3, versions, sources, version du contrat', async () => {
  const hote = await charger(source);
  assert.deepEqual(hote.COMMANDES, pont.COMMANDES);
  assert.deepEqual(hote.COMMANDES_0_3, pont.COMMANDES_0_3);
  assert.deepEqual(hote.VERSIONS_ACCEPTEES, pont.VERSIONS_ACCEPTEES);
  assert.equal(hote.SOURCE_RUNTIME, pont.SOURCE_RUNTIME);
  assert.equal(hote.SOURCE_HOTE, pont.SOURCE_HOTE);
  assert.equal(hote.VERSION, pont.VERSION);
});

test('mêmes fonctions que le pont : versionsCompatibles et estCommande donnent les mêmes réponses', async () => {
  const hote = await charger(source);
  for (const [a, b] of [['0.3', '0.3'], ['0.2', '0.3'], ['0.3.1', '0.3'], ['1.0', '0.3'], ['0.3', undefined], [undefined, '0.3'], ['x', 'y'], [null, null], [0.3, '0.3']]) {
    assert.equal(hote.versionsCompatibles(a, b), pont.versionsCompatibles(a, b), JSON.stringify([a, b]));
  }
  for (const c of ['ping', 'setScene', 'batch', 'constructor', '__proto__', 'toString', '', null, undefined, 42, 'PING']) {
    assert.equal(hote.estCommande(c), pont.estCommande(c), String(c));
  }
});

test('mêmes exports que le client d\'origine, VERSION_CLIENT compris', async () => {
  const hote = await charger(source);
  for (const nom of Object.keys(client)) assert.ok(nom in hote, 'export manquant : ' + nom);
  assert.equal(hote.VERSION_CLIENT, client.VERSION_CLIENT);
  assert.ok(Number.isInteger(hote.VERSION_CLIENT));
  assert.deepEqual(hote.VERSIONS_CLIENT, client.VERSIONS_CLIENT);
});

test('le client autonome parle au vrai composant : connexion, ping, scène, filtre, capacité refusée', async () => {
  const hote = await charger(source);
  const r = reseau({ origineHote: 'https://hote.test' });
  const rt = attacher(carteSimulee(), { capacites: ['socle', 'points'] });
  const liaison = installerPont(rt, { cible: r.hoteVuDeAtlas, fenetre: r.atlas, autorisees: ['https://hote.test'] });
  const c = hote.creerClient({ transport: hote.transportFenetre({ fenetre: r.hote, cadre: { contentWindow: r.atlasVuDeLHote }, origineComposant: 'https://atlas.test' }), delai: 300, delaiConnexion: 300, intervalle: 20 });
  liaison.annoncer();
  const info = await c.connecter();
  assert.deepEqual(info.capacites, ['points', 'socle']);
  assert.equal((await c.setScene(MANIFESTE, DONNEES)).sites, 3);
  await assert.rejects(() => c.appeler('setTime', '2020'), (e) => e instanceof hote.ErreurBi && e.code === 'capacite_absente' && e.capacite === 'temps');
  assert.throws(() => hote.transportFenetre({ fenetre: {}, cadre: {}, origineComposant: 'https://x/chemin' }), (e) => e.code === 'origine');
  c.deconnecter();
});

test('le fichier publié est celui que le générateur produit aujourd\'hui (relancer tools/generer-client-hote.mjs sinon)', () => {
  const publie = fs.readFileSync(path.join(RACINE, CHEMIN_SORTIE), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(publie, source, 'lib/bi/client-hote.js est périmé : node tools/generer-client-hote.mjs');
});
