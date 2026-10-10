/**
 * Securite du pont postMessage : un nom herite d'Object.prototype n'est jamais une commande, une charge hostile ne fait
 * ni lever d'exception ni laisser de promesse rejetee, et rien n'est execute pour une origine ou une source non autorisee.
 * node --test tests/bi-securite-pont.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validerCommande, creerPont, executerBatch, estCommande, versionsCompatibles } from '../lib/bi/pont.js';
import { installerPont } from '../lib/bi/liaison.js';
import { creerClient } from '../lib/bi/client.js';

const HOTE = 'https://hote.example';
const cmd = (c, args = [], v = '0.3') => ({ source: 'hote-bi', version: v, id: 'x1', cmd: c, args });
const HERITES = ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'];

test('un nom herite de Object.prototype n\'est pas une commande (validation, pont, lot, client)', async () => {
  for (const nom of HERITES) {
    assert.equal(estCommande(nom), false, nom);
    for (const args of [[], ['a'], [{}]]) {
      const v = validerCommande(cmd(nom, args), { origine: HOTE, autorisees: [HOTE] });
      assert.equal(v.ok, false, nom); assert.equal(v.code, 'commande', nom);
    }
  }
  const appels = [];
  const api = new Proxy({ ping: () => 'pong' }, { get: (t, k) => { if (!(k in t) && typeof k === 'string') appels.push(k); return t[k]; } });
  const envoyes = [];
  const p = creerPont({ api, envoyer: (m) => envoyes.push(m), autorisees: [HOTE] });
  for (const nom of HERITES) await p.recevoir(cmd(nom, ['a']), HOTE);
  assert.deepEqual(appels, [], 'api[...] atteint pour un nom herite');
  assert.ok(envoyes.every((m) => m.ok === false));
  const lot = await executerBatch({ ping: () => 1, constructor: Object }, HERITES.map((c) => ({ cmd: c, args: [] })), { arret: 'continuer' });
  assert.equal(lot.ok, 0);
  const c = creerClient({ transport: { envoyer() {}, ecouter: () => () => {} } });
  for (const nom of HERITES) await assert.rejects(c.appeler(nom), (e) => e.code === 'commande');
});

test('une version, une commande ou un identifiant de forme hostile ne fait jamais lever validerCommande', () => {
  const hostiles = [{ toString: 1 }, { valueOf: 1 }, [], [[]], 1, true, null, undefined, 'x'.repeat(100000), Object.create(null)];
  for (const h of hostiles) {
    assert.doesNotThrow(() => validerCommande({ source: 'hote-bi', version: h, cmd: 'ping', args: [] }, { origine: HOTE, autorisees: [HOTE] }));
    assert.doesNotThrow(() => validerCommande({ source: 'hote-bi', version: '0.3', cmd: h, args: [] }, { origine: HOTE, autorisees: [HOTE] }));
    assert.doesNotThrow(() => versionsCompatibles(h));
  }
  const r = validerCommande({ source: 'hote-bi', version: 'x'.repeat(100000), cmd: 'ping' }, { origine: HOTE, autorisees: [HOTE] });
  assert.ok(r.erreur.length < 200, 'message d\'erreur borne');
});

test('liaison : une charge qui fait lever le pont ne laisse pas de promesse rejetee non geree', async () => {
  const ecouteurs = []; const rejets = [];
  const onRejet = (e) => rejets.push(e); process.on('unhandledRejection', onRejet);
  const parent = { postMessage() {} };
  const rt = { api: { ping: () => 'pong' }, brancherEmetteur() {} };
  installerPont(rt, { cible: parent, fenetre: { addEventListener: (t, f) => ecouteurs.push(f) }, autorisees: [HOTE], journal: { warn() {} } });
  for (const nom of HERITES) ecouteurs.forEach((f) => f({ source: parent, origin: HOTE, data: cmd(nom, []) }));
  ecouteurs.forEach((f) => f({ source: parent, origin: HOTE, data: { source: 'hote-bi', version: { toString: 1 }, cmd: 'ping' } }));
  await new Promise((r) => setTimeout(r, 30));
  process.off('unhandledRejection', onRejet);
  assert.deepEqual(rejets, []);
});
