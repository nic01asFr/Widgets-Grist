/**
 * Le canevas piloté par l'hôte (lib/bi/canevas.js) : la scène Atlas envoyée par `setScene` dans le profil complet.
 * Reconnaissance de la forme, contrôle des adresses et des plafonds, correspondance des identifiants, aiguillage des commandes,
 * et ce que le composant nu ne doit jamais charger.
 * node --test projects/Atlas/tests/bi-canevas.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { attacher } from '../lib/bi/bi-runtime.js';
import { estSceneAtlas, adresseAdmise, verifierSceneHote, correspondanceCouches, classerEchecs, brancher, PLAFOND_OCTETS, PLAFOND_COUCHES } from '../lib/bi/canevas.js';
import { VERSIONS_LUES, deballerScene, verifierFormeScene } from '../lib/scene-externe.js';
import { carteSimulee, MANIFESTE, DONNEES } from './aide-carte-bi.js';

const OUTILS = { VERSIONS_LUES, deballerScene, verifierFormeScene };

const lire = (rel) => fs.readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
const SCENE = { version: '0.2.2', layers: [{ id: 'bati', name: 'Bâti', geojson: 'https://donnees.example/bati.geojson' }, { id: 'lampes', name: 'Lampes', geojson: { type: 'FeatureCollection', features: [] } }] };

test('estSceneAtlas : la version 0.2.x fait la scène ; un manifeste BI, rien ou une valeur étrangère, non', () => {
  assert.equal(estSceneAtlas(SCENE, OUTILS), true);
  assert.equal(estSceneAtlas({ ...SCENE, version: '0.2.1' }, OUTILS), true);
  assert.equal(estSceneAtlas({ scene: SCENE }, OUTILS), true, 'enveloppe { scene }');
  assert.equal(estSceneAtlas(MANIFESTE, OUTILS), false);
  for (const v of [null, undefined, 'x', 3, [], { layers: [] }, { ...SCENE, version: '0.3' }, { ...SCENE, version: '9' }]) assert.equal(estSceneAtlas(v, OUTILS), false, JSON.stringify(v));
});

test('adresseAdmise : https absolue, http seulement sur localhost ; relative, data:, blob:, file:, http distant refusés', () => {
  for (const ok of ['https://a.example/x.json', 'http://localhost:8096/x.glb', 'http://127.0.0.1:4512/a', 'https://a.example/{z}/{x}/{y}.png']) assert.equal(adresseAdmise(ok), null, ok);
  for (const ko of ['./bati.geojson', '/bati.geojson', 'bati.geojson', 'data:application/json,{}', 'blob:https://a.example/1', 'file:///c:/x', 'http://a.example/x', 'javascript:alert(1)', '']) assert.ok(adresseAdmise(ko), ko);
  assert.match(adresseAdmise('./x'), /absolue/);
});

test('verifierSceneHote : copie marquée externe, jamais l\'objet reçu ; les adresses de toute couche sont contrôlées', () => {
  const r = verifierSceneHote(SCENE, OUTILS);
  assert.deepEqual(r.ecarts, []); assert.notEqual(r.scene, SCENE); assert.equal(r.scene.externe, true); assert.equal(r.scene._origine, 'hote');
  assert.equal(SCENE.externe, undefined, 'l\'objet reçu n\'est pas modifié');
  const mauvaise = (def) => verifierSceneHote({ version: '0.2.2', layers: [{ id: 'c', ...def }] }, OUTILS).ecarts.join(' | ');
  assert.match(mauvaise({ geojson: './a.geojson' }), /geojson/); assert.match(mauvaise({ data_url: 'data:text/plain,1' }), /data_url/);
  assert.match(mauvaise({ gltf_url: 'http://a.example/x.glb' }), /gltf_url/); assert.match(mauvaise({ tiles_url: 'blob:x' }), /tiles_url/);
  assert.match(mauvaise({ style: { custom: { url: './m.glb' } } }), /style\.custom\.url/); assert.match(mauvaise({ source: { url: 'http://a.example/s' } }), /source\.url/);
  assert.equal(mauvaise({ geojson: { type: 'FeatureCollection', features: [] } }), '', 'une donnée posée dans la scène n\'a pas d\'adresse');
});

test('verifierSceneHote : forme, plafond de taille et de couches', () => {
  assert.match(verifierSceneHote({ layers: [] }, OUTILS).ecarts.join(' '), /version/);
  assert.match(verifierSceneHote({ version: '0.2.2', layers: [] }, OUTILS).ecarts.join(' '), /vide/);
  const trop = { version: '0.2.2', layers: Array.from({ length: PLAFOND_COUCHES + 1 }, (_, i) => ({ id: 'c' + i })) };
  assert.match(verifierSceneHote(trop, OUTILS).ecarts.join(' '), /trop de couches/);
  const lourde = { version: '0.2.2', layers: [{ id: 'g', geojson: { type: 'FeatureCollection', features: [], x: 'y'.repeat(PLAFOND_OCTETS) } }] };
  assert.match(verifierSceneHote(lourde, OUTILS).ecarts.join(' '), /volumineuse/);
  const cyclique = { version: '0.2.2', layers: [{ id: 'a' }] }; cyclique.layers[0].self = cyclique;
  assert.match(verifierSceneHote(cyclique, OUTILS).ecarts.join(' '), /sérialisable/);
});

test('correspondanceCouches : retrouve l\'identifiant d\'application de chaque couche du manifeste', () => {
  const defs = [{ id: 'bati' }, { id: 'zone nord/1' }, { id: 'fond' }, { id: 'absente' }, { name: 'Sans id' }];
  const couches = [{ id: 'layer-scene-bati' }, { id: 'layer-scene-zone_nord_1' }, { id: 'fond' }, { id: 'layer-scene-Sans_id' }];
  assert.deepEqual(correspondanceCouches(defs, couches), { bati: 'layer-scene-bati', 'zone nord/1': 'layer-scene-zone_nord_1', fond: 'fond', 'Sans id': 'layer-scene-Sans_id' });
  assert.deepEqual(correspondanceCouches(null, null), {});
});

test('classerEchecs : une couche non montée est une erreur, une couche montée mais signalée un avertissement', () => {
  const defs = [{ id: 'bati', name: 'Bâti' }, { id: 'carrieres', name: 'Carrières' }];
  const r = classerEchecs([{ nom: 'Bâti', raison: 'aucune emprise déclarée (bbox)' }, { nom: 'Carrières', raison: 'source.table : pas de document' }, { nom: 'Inconnue', origine: 'url x' }], defs, { bati: 'layer-scene-bati' });
  assert.deepEqual(r.avertissements, { bati: ['aucune emprise déclarée (bbox)'] });
  assert.deepEqual(r.erreurs, { carrieres: 'source.table : pas de document', Inconnue: 'url x' });
  assert.deepEqual(classerEchecs(null, null, {}), { erreurs: {}, avertissements: {} });
});

/** Une façade simulée : ce que fait `app_v7.js`, sans application. */
function facade() {
  const journal = [];
  return { journal, outils: OUTILS, monterScene: async (s) => { journal.push(['monter', s]); return { couches: [{ id: 'layer-scene-bati', n: 12 }, { id: 'layer-scene-lampes', n: 0 }], echecs: [{ nom: 'Carrières', raison: 'source.table : pas de document' }], erreur: null }; },
    retirerScene: () => { journal.push(['retirer']); return 2; }, visibilite: (id, v) => { journal.push(['visibilite', id, v]); return v; }, cadrer: (ids) => { journal.push(['cadrer', ids]); return true; } };
}

test('brancher : une scène Atlas passe par l\'application, remplace la scène BI, rend un compte par couche et dit ce qui a échoué', async () => {
  const rt = attacher(carteSimulee()); const f = facade(); brancher(rt, f);
  const prets = []; rt.on('ready', (c) => prets.push(c));
  await rt.api.setScene(MANIFESTE, DONNEES); assert.deepEqual(rt.api.ping().couches, ['sites']);
  const r = await rt.api.setScene(SCENE);
  assert.deepEqual(rt.api.ping().couches, [], 'la scène BI est vidée : une scène en remplace une autre');
  const envoye = f.journal.find((j) => j[0] === 'monter')[1];
  assert.equal(envoye.externe, true); assert.equal(envoye._origine, 'hote');
  assert.equal(r.bati, 12); assert.equal(r.lampes, 0); assert.deepEqual(r._erreurs, { 'Carrières': 'source.table : pas de document' });
  assert.deepEqual(prets.at(-1).layers, { bati: 12, lampes: 0 }); assert.equal(prets.at(-1).canevas, true);
  assert.deepEqual(rt.api.ping().couches_scene, ['bati', 'lampes']); assert.equal(rt.api.ping().canevas, true);
});

test("brancher : le compte d'une couche distante est null (inconnu), jamais un faux zéro ; une couche montée mais signalée est un avertissement", async () => {
  const rt = attacher(carteSimulee()); const f = facade();
  f.monterScene = async () => ({ couches: [{ id: 'layer-scene-bati', n: null }], echecs: [{ nom: 'Bâti', raison: 'aucune emprise déclarée (bbox)' }], erreur: null });
  brancher(rt, f);
  const r = await rt.api.setScene(SCENE);
  assert.equal(r.bati, null); assert.deepEqual(r._avertissements, { bati: ['aucune emprise déclarée (bbox)'] }); assert.equal(r._erreurs, undefined);
});

test('brancher : une scène Atlas refusée ne monte rien et dit pourquoi ; un manifeste BI retire la scène Atlas', async () => {
  const rt = attacher(carteSimulee()); const f = facade(); brancher(rt, f);
  await assert.rejects(rt.api.setScene({ version: '0.2.2', layers: [{ id: 'x', geojson: './local.geojson' }] }), /scène Atlas refusée.*geojson/);
  assert.equal(f.journal.length, 0, 'rien n\'a été monté');
  await rt.api.setScene(SCENE); f.journal.length = 0;
  const r = await rt.api.setScene(MANIFESTE, DONNEES);
  assert.deepEqual(f.journal, [['retirer']]); assert.equal(r.sites, 3); assert.deepEqual(rt.api.ping().couches_scene, []);
});

test('brancher : setLayerVisibility et fitTo reconnaissent les couches de la scène Atlas, les autres restent au runtime BI', async () => {
  const carte = carteSimulee(); const rt = attacher(carte); const f = facade(); brancher(rt, f);
  await rt.api.setScene(MANIFESTE, DONNEES);
  assert.equal(rt.api.setLayerVisibility('sites', false), false); assert.equal(f.journal.length, 0, 'une couche BI ne passe pas par l\'application');
  await rt.api.setScene(SCENE); f.journal.length = 0;
  assert.equal(rt.api.setLayerVisibility('bati', false), false); assert.deepEqual(f.journal.pop(), ['visibilite', 'layer-scene-bati', false]);
  assert.equal(rt.api.fitTo(), true); assert.deepEqual(f.journal.pop(), ['cadrer', ['layer-scene-bati', 'layer-scene-lampes']]);
  assert.equal(rt.api.fitTo('lampes'), true); assert.deepEqual(f.journal.pop(), ['cadrer', ['layer-scene-lampes']]);
  assert.throws(() => rt.api.setLayerVisibility('inconnue', true), /couche inconnue/);
});

test('le composant nu ne charge jamais le canevas : seul le profil complet pose la façade, seul montage.js l\'importe, et à la demande', () => {
  const app = lire('app_v7.js'), montage = lire('lib/bi/montage.js');
  assert.match(app, /if \(PROFIL_COMPLET\) \{\s*window\.__atlasCanevas = Object\.freeze\(\{\s*monterScene: monterSceneHote, retirerScene: retirerSceneHote, visibilite: visibiliteCoucheHote, cadrer: cadrerCouchesHote,\s*outils: Object\.freeze\(\{ VERSIONS_LUES, deballerScene, verifierFormeScene \}\),/);
  assert.equal((app.match(/__atlasCanevas/g) || []).length, 1, 'posée une seule fois');
  assert.match(montage, /fenetre\.__atlasCanevas \? await import\('\.\/canevas\.js'\) : null/);
  for (const f of ['lib/bi/entree.js', 'lib/bi/carte-nue.js', 'lib/bi/liaison.js', 'lib/bi/bi-runtime.js', 'index_bi.html']) assert.ok(!/(?:from\s+|import\s*\(\s*)['"][^'"]*canevas\.js/.test(lire(f)), f + ' ne doit pas importer canevas.js');
});
