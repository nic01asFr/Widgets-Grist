/**
 * L'identifiant d'une maquette en dalles 3D : gardé en mémoire, présenté à sa seule origine, une seule question à la fois.
 * node --test projects/Atlas/tests/dalles3d-acces.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creerAccesDalles, enteteBasic, DELAI_REFUS_MS } from '../lib/dalles3d-acces.js';
import { adresseAdmise } from '../lib/scene-externe.js';

const ICI = 'https://maquette.example';
const URL_GRILLE = ICI + '/api/atlas/grille3d.json';
const saisie = (r) => { const q = { appels: [] }; q.demander = async (x) => { q.appels.push(x); return typeof r === 'function' ? r(x) : r; }; return q; };

test('enteteBasic : Basic + base64 de « identifiant:mot de passe » en UTF-8', () => {
  assert.equal(enteteBasic('admin', 'secret'), 'Basic ' + Buffer.from('admin:secret').toString('base64'));
  assert.equal(enteteBasic('é', 'à:b'), 'Basic ' + Buffer.from('é:à:b', 'utf8').toString('base64'));
});

test('sans identifiant connu : aucun en-tête, vers aucune origine', () => {
  const a = creerAccesDalles({ demander: async () => null, adresseAdmise });
  assert.deepEqual(a.entetes(URL_GRILLE), {});
  assert.deepEqual(a.entetes('pas une adresse'), {});
});

test('après un 401 saisi : l\'en-tête part vers cette origine, et vers elle seule', async () => {
  const q = saisie({ identifiant: 'admin', motDePasse: 'secret' });
  const a = creerAccesDalles({ demander: q.demander, adresseAdmise });
  assert.equal(await a.apres401(URL_GRILLE, false), true);
  assert.equal(q.appels.length, 1); assert.deepEqual(q.appels[0], { origine: ICI, refuse: false });
  assert.equal(a.entetes(ICI + '/api/atlas/dalles3d/D1/x.glb').Authorization, enteteBasic('admin', 'secret'));
  assert.deepEqual(a.entetes('https://autre.example/x.glb'), {}, 'jamais vers une autre origine');
  assert.deepEqual(a.entetes('http://maquette.example/x.glb'), {}, 'ni vers la même machine en clair');
});

test('http hors localhost : pas de question et pas d en-tête (un mot de passe en clair ne traverse pas un réseau)', async () => {
  const q = saisie({ identifiant: 'a', motDePasse: 'b' });
  const a = creerAccesDalles({ demander: q.demander, adresseAdmise });
  assert.equal(await a.apres401('http://maquette.example/grille3d.json', false), false);
  assert.equal(q.appels.length, 0);
});

test('http sur localhost : admis', async () => {
  const q = saisie({ identifiant: 'a', motDePasse: 'b' });
  const a = creerAccesDalles({ demander: q.demander, adresseAdmise });
  assert.equal(await a.apres401('http://127.0.0.1:8098/grille3d.json', false), true);
  assert.ok(a.entetes('http://127.0.0.1:8098/x.glb').Authorization);
});

test('plusieurs 401 en même temps : une seule question', async () => {
  let ouvrir; const attente = new Promise((r) => { ouvrir = r; });
  const q = saisie(async () => { await attente; return { identifiant: 'a', motDePasse: 'b' }; });
  const a = creerAccesDalles({ demander: q.demander, adresseAdmise });
  const trois = [a.apres401(ICI + '/1.glb'), a.apres401(ICI + '/2.glb'), a.apres401(ICI + '/3.glb')];
  ouvrir();
  assert.deepEqual(await Promise.all(trois), [true, true, true]);
  assert.equal(q.appels.length, 1);
});

test('saisie annulée : non, et pas redemandée avant le délai', async () => {
  let t = 1000; const q = saisie(null);
  const a = creerAccesDalles({ demander: q.demander, adresseAdmise, maintenant: () => t });
  assert.equal(await a.apres401(URL_GRILLE), false);
  assert.equal(await a.apres401(ICI + '/2.glb'), false); assert.equal(q.appels.length, 1, 'pas de seconde boîte');
  t += DELAI_REFUS_MS + 1;
  assert.equal(await a.apres401(ICI + '/3.glb'), false); assert.equal(q.appels.length, 2, 'redemandée après le délai');
});

test('identifiant refusé par le serveur : oublié, et la personne est invitée à le ressaisir (refuse: true)', async () => {
  const reponses = [{ identifiant: 'a', motDePasse: 'faux' }, { identifiant: 'a', motDePasse: 'bon' }];
  const q = saisie(() => reponses.shift());
  const a = creerAccesDalles({ demander: q.demander, adresseAdmise });
  assert.equal(await a.apres401(URL_GRILLE, false), true);
  assert.equal(await a.apres401(URL_GRILLE, true), true);
  assert.deepEqual(q.appels.map((x) => x.refuse), [false, true]);
  assert.equal(a.entetes(URL_GRILLE).Authorization, enteteBasic('a', 'bon'));
});

test('saisie incomplète (identifiant vide) ou qui lève : traitée comme annulée', async () => {
  const a = creerAccesDalles({ demander: async () => ({ identifiant: '', motDePasse: 'x' }), adresseAdmise });
  assert.equal(await a.apres401(URL_GRILLE), false);
  const b = creerAccesDalles({ demander: async () => { throw new Error('boum'); }, adresseAdmise });
  assert.equal(await b.apres401(URL_GRILLE), false);
});

test('oublier : une origine, ou toutes', async () => {
  const a = creerAccesDalles({ demander: async () => ({ identifiant: 'a', motDePasse: 'b' }), adresseAdmise });
  await a.apres401(URL_GRILLE);
  a.oublier(ICI); assert.deepEqual(a.entetes(URL_GRILLE), {});
  await a.apres401(URL_GRILLE); a.oublier(); assert.deepEqual(a.entetes(URL_GRILLE), {});
});

test('câblage : lireReponseDalles présente l\'en-tête, rejoue UNE fois après un 401, et l\'identifiant ne touche ni le stockage ni l\'adresse', () => {
  const app = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app_v7.js'), 'utf8');
  const i = app.indexOf('async function lireReponseDalles');
  const corps = app.slice(i, app.indexOf('\n}\n', i));
  assert.match(corps, /accesDalles\.entetes\(url\)/);
  assert.match(corps, /status === 401/);
  assert.match(corps, /accesDalles\.apres401\(url,/);
  assert.ok(!/localStorage|sessionStorage|indexedDB/.test(corps), 'jamais dans le stockage');
  const module = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'dalles3d-acces.js'), 'utf8');
  assert.ok(!/localStorage|sessionStorage|indexedDB|console\./.test(module.replace(/\/\*[\s\S]*?\*\//g, '')), 'le module ne stocke et ne journalise rien');
});
