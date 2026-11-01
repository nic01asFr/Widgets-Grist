/**
 * Contrat carte BI 0.4 : la règle de version. Une commande exige AU MOINS la version qui l'a introduite ; la montée de VERSION à 0.4 ne refuse
 * pas un hôte resté en 0.3 (ni en 0.2), et un ancien client négocie la version qu'il parle.
 * node --test projects/Atlas/tests/bi-version-0-4.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { VERSION, VERSIONS_ACCEPTEES, COMMANDES, COMMANDES_0_3, COMMANDES_0_4, versionDeCommande, versionAuMoins, validerCommande, versionsCompatibles } from '../lib/bi/pont.js';
import { VERSION as VERSION_RUNTIME } from '../lib/bi/bi-runtime.js';
import { creerClient, VERSION_CLIENT, VERSIONS_CLIENT } from '../lib/bi/client.js';

const ctx = { origine: 'https://hote.test', autorisees: ['https://hote.test'] };
const cmd = (c, args, version) => ({ source: 'hote-bi', version, id: 'a', cmd: c, args });

test('une seule version du contrat : celle du pont ; 0.2 à 0.6 sont acceptées', () => {
  assert.equal(VERSION, '0.6'); assert.equal(VERSION_RUNTIME, VERSION);
  assert.deepEqual([...VERSIONS_ACCEPTEES], ['0.2', '0.3', '0.4', '0.5', '0.6']);
  assert.ok(versionsCompatibles('0.6') && !versionsCompatibles('0.3') && !versionsCompatibles('0.5'));
});

test('versionAuMoins : comparaison de la mineure, une version illisible n\'est jamais suffisante', () => {
  assert.ok(versionAuMoins('0.3', '0.3') && versionAuMoins('0.4', '0.3') && versionAuMoins('0.4', '0.2') && !versionAuMoins('0.2', '0.3') && !versionAuMoins('0.3', '0.4'));
  for (const mauvais of [undefined, null, '', 'x', '1.4', 3, [], {}]) assert.equal(versionAuMoins(mauvais, '0.2'), false, String(mauvais));
});

test('versionDeCommande : 0.2 pour les 19 premières, 0.3 pour les commandes 0.3, 0.4 pour celles de la 0.4', () => {
  assert.equal(versionDeCommande('ping'), '0.2'); assert.equal(versionDeCommande('setScene'), '0.2');
  for (const c of COMMANDES_0_3) assert.equal(versionDeCommande(c), '0.3', c);
  for (const c of COMMANDES_0_4) assert.equal(versionDeCommande(c), '0.4', c);
  for (const c of [...COMMANDES_0_3, ...COMMANDES_0_4]) assert.ok(c in COMMANDES, 'commande déclarée : ' + c);
});

test('R1 : un hôte resté en 0.3 garde ses commandes 0.3 ; un hôte en 0.2 ne les a toujours pas', () => {
  assert.equal(validerCommande(cmd('drillUp', [], '0.3'), ctx).ok, true, 'commande 0.3, hôte 0.3 : servie');
  assert.equal(validerCommande(cmd('drillUp', [], '0.4'), ctx).ok, true, 'commande 0.3, hôte 0.4 : servie');
  const refus = validerCommande(cmd('drillUp', [], '0.2'), ctx);
  assert.equal(refus.ok, false); assert.equal(refus.code, 'version'); assert.match(refus.erreur, /demande la version 0\.3 \(reçu 0\.2\)/);
  assert.equal(validerCommande(cmd('ping', [], '0.2'), ctx).ok, true, 'commande 0.2, hôte 0.2 : servie');
});

test('une commande 0.4 n\'est servie qu\'à un hôte en 0.4', () => {
  for (const c of COMMANDES_0_4) {
    for (const v of ['0.2', '0.3']) { const r = validerCommande(cmd(c, [], v), ctx); assert.equal(r.code, 'version', c + ' en ' + v); assert.match(r.erreur, /demande la version 0\.4/); }
    assert.notEqual(validerCommande(cmd(c, [], '0.4'), ctx).code, 'version', c + ' en 0.4 passe la règle de version');
  }
});

test('client : un hôte qui a négocié 0.3 se voit refuser une commande 0.4 côté hôte, sans envoi ; VERSION_CLIENT est 4 et le client préfère 0.6', async () => {
  assert.equal(VERSION_CLIENT, 4); assert.deepEqual([...VERSIONS_CLIENT], ['0.6', '0.5', '0.4', '0.3', '0.2']);
  // une commande 0.4 déclarée : seulement si le contrat en porte déjà ; sinon la règle est couverte par validerCommande ci-dessus
  const nom = COMMANDES_0_4[0]; if (!nom) return;
  const envoyes = [];
  const transport = { envoyer: (m) => envoyes.push(m), ecouter: () => () => {} };
  const client = creerClient({ transport, versions: ['0.3'] });
  await assert.rejects(client.appeler(nom), (e) => e.code === 'version' && /0\.4/.test(e.message));
  assert.equal(envoyes.length, 0);
});
