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
import { estSceneAtlas, verifierSceneHote, correspondanceCouches, classerEchecs, brancher, PLAFOND_OCTETS, PLAFOND_COUCHES, PLAFOND_COUCHES_DALLES, estCoucheDalles } from '../lib/bi/canevas.js';
import { VERSIONS_LUES, deballerScene, verifierFormeScene, adresseAdmise } from '../lib/scene-externe.js';
import { carteSimulee, MANIFESTE, DONNEES } from './aide-carte-bi.js';

const OUTILS = { VERSIONS_LUES, deballerScene, verifierFormeScene, adresseAdmise };

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
    monterDalles: async (d) => { journal.push(['dalles', d]); if (/mauvaise/.test(d.grille)) throw new Error('manifeste de grille : schéma non lu'); return { id: 'dalles:' + d.id, n: 7 }; },
    abonne: null, abonner(fn) { this.abonne = fn; return () => { this.abonne = null; }; },
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
  assert.match(app, /if \(PROFIL_COMPLET\) \{\s*window\.__atlasCanevas = Object\.freeze\(\{\s*monterScene: monterSceneHote, monterDalles: monterDallesHote, retirerScene: retirerSceneHote, abonner: \(fn\) => \{ _abonneHote = fn; return \(\) => \{ if \(_abonneHote === fn\) _abonneHote = null; \}; \}, visibilite: visibiliteCoucheHote, cadrer: cadrerCouchesHote,\s*outils: Object\.freeze\(\{ VERSIONS_LUES, deballerScene, verifierFormeScene, adresseAdmise \}\),/);
  assert.equal((app.match(/__atlasCanevas/g) || []).length, 1, 'posée une seule fois');
  assert.match(montage, /fenetre\.__atlasCanevas \? await import\('\.\/canevas\.js'\) : null/);
  for (const f of ['lib/bi/entree.js', 'lib/bi/carte-nue.js', 'lib/bi/liaison.js', 'lib/bi/bi-runtime.js', 'index_bi.html']) assert.ok(!/(?:from\s+|import\s*\(\s*)['"][^'"]*canevas\.js/.test(lire(f)), f + ' ne doit pas importer canevas.js');
});

const AVEC_DALLES = { version: '0.2.2', layers: [
  { id: 'maquette', name: 'Maquette', type: 'dalles3d', dalles3d: { grille: 'https://fabrique.example/api/fabrique/atlas/grille3d.json' } },
  { id: 'bati', name: 'Bâti', geojson: { type: 'FeatureCollection', features: [] } }] };

test('estCoucheDalles et contrôle : une couche de dalles 3D porte l adresse HTTPS de son manifeste de grille, rien d autre', () => {
  assert.equal(estCoucheDalles(AVEC_DALLES.layers[0]), true); assert.equal(estCoucheDalles(AVEC_DALLES.layers[1]), false); assert.equal(estCoucheDalles(null), false);
  assert.deepEqual(verifierSceneHote(AVEC_DALLES, OUTILS).ecarts, []);
  const ko = (d) => verifierSceneHote({ version: '0.2.2', layers: [{ id: 'm', type: 'dalles3d', dalles3d: d }] }, OUTILS).ecarts.join(' | ');
  assert.match(ko(undefined), /grille/); assert.match(ko({}), /manquante/); assert.match(ko({ grille: './grille3d.json' }), /absolue/); assert.match(ko({ grille: 'http://distant.example/g.json' }), /https requis/);
  assert.match(ko({ grille: 'data:application/json,{}' }), /https requis/); assert.equal(ko({ grille: 'http://127.0.0.1:8096/api/fabrique/atlas/grille3d.json' }), '');
  const trop = { version: '0.2.2', layers: Array.from({ length: PLAFOND_COUCHES_DALLES + 1 }, (_, i) => ({ id: 'm' + i, type: 'dalles3d', dalles3d: { grille: 'https://f.example/g.json' } })) };
  assert.match(verifierSceneHote(trop, OUTILS).ecarts.join(' '), /trop de couches de dalles 3D/);
});

test('brancher : une scène avec dalles 3D monte chaque couche de dalles seule, l application monte le reste, le compte et les erreurs sont par couche', async () => {
  const rt = attacher(carteSimulee()); const f = facade(); brancher(rt, f);
  const r = await rt.api.setScene(AVEC_DALLES);
  assert.equal(r.maquette, 7, 'le compte d une couche de dalles : les dalles disponibles dans la vue'); assert.equal(r.bati, 12);
  const monte = f.journal.find((j) => j[0] === 'monter')[1]; assert.deepEqual(monte.layers.map((l) => l.id), ['bati'], 'la couche de dalles n est pas passée à l application');
  assert.deepEqual(f.journal.find((j) => j[0] === 'dalles')[1], { id: 'maquette', nom: 'Maquette', grille: 'https://fabrique.example/api/fabrique/atlas/grille3d.json', options: AVEC_DALLES.layers[0].dalles3d });
  assert.deepEqual(rt.api.ping().couches_scene, ['bati', 'maquette']);
  assert.equal(rt.api.setLayerVisibility('maquette', false), false); assert.deepEqual(f.journal.pop(), ['visibilite', 'dalles:maquette', false]);
  assert.equal(rt.api.fitTo('maquette'), true); assert.deepEqual(f.journal.pop(), ['cadrer', ['dalles:maquette']]);
  assert.equal(rt.api.fitTo(), true); assert.deepEqual(f.journal.pop(), ['cadrer', ['layer-scene-bati', 'dalles:maquette']]);
});

test('brancher : un manifeste de grille illisible est une erreur de CETTE couche, les autres se montent ; une scène de dalles seules ne monte rien dans l application', async () => {
  const rt = attacher(carteSimulee()); const f = facade(); brancher(rt, f);
  const mauvaise = { version: '0.2.2', layers: [{ id: 'm', name: 'M', type: 'dalles3d', dalles3d: { grille: 'https://f.example/mauvaise/grille3d.json' } }, AVEC_DALLES.layers[1]] };
  const r = await rt.api.setScene(mauvaise);
  assert.match(r._erreurs.m, /schéma non lu/); assert.equal(r.bati, 12); assert.equal(r.m, undefined);
  f.journal.length = 0;
  const seules = await rt.api.setScene({ version: '0.2.2', layers: [AVEC_DALLES.layers[0]] });
  assert.equal(seules.maquette, 7); assert.equal(f.journal.filter((j) => j[0] === 'monter').length, 0, 'aucune couche pour l application : elle n est pas appelée');
  assert.deepEqual(f.journal[0], ['retirer'], 'la scène précédente est retirée d abord');
});

test("clics et survols : les couches de la scene Atlas parlent a la page avec les identifiants DE LA SCENE, comme la carte BI ; le reste est ignore", async () => {
  const rt = attacher(carteSimulee()); const f = facade(); brancher(rt, f);
  const vus = []; rt.on('select', (c) => vus.push(['select', c])); rt.on('hover', (c) => vus.push(['hover', c]));
  await rt.api.setScene(SCENE);   // bati (layer-scene-bati) et lampes
  f.abonne('select', { couche: 'layer-scene-bati', id: 4, proprietes: { nom: 'Hotel de ville', etages: 3 } });
  f.abonne('hover', { couche: 'layer-scene-lampes', id: 'a' });
  f.abonne('select', { couche: null, id: null });
  f.abonne('select', { couche: 'une-couche-de-la-personne', id: 1 });
  f.abonne('click', { couche: 'layer-scene-bati', id: 1 });
  assert.deepEqual(vus, [
    ['select', { layer: 'bati', featureId: 4, key: 4, properties: { nom: 'Hotel de ville', etages: 3 } }],
    ['hover', { layer: 'lampes', featureId: 'a', key: 'a' }],
    ['select', { layer: null, featureId: null }],
  ]);
});

test("clics : l evenement est celui d un geste de la personne (visible meme sans evenements-api), et un nouveau setScene remet la correspondance a jour", async () => {
  const rt = attacher(carteSimulee()); const f = facade(); brancher(rt, f);
  const origines = []; const vrai = rt._interne.emettre; rt._interne.emettre = (t, c, o) => { origines.push([t, o]); return vrai(t, c, o); };
  await rt.api.setScene(SCENE); f.abonne('select', { couche: 'layer-scene-bati', id: 1 });
  assert.deepEqual(origines.filter((o) => o[0] === 'select'), [['select', 'utilisateur']]);
  await rt.api.setScene(MANIFESTE, DONNEES);   // la scene Atlas est remplacee : ses couches ne parlent plus
  const avant = origines.length; f.abonne('select', { couche: 'layer-scene-bati', id: 1 });
  assert.equal(origines.length, avant, 'plus aucune couche de scene Atlas : rien n est emis');
});

test("l application ne signale que les couches posees par la page, au clic et au survol, sans sortir de la chaine des clics", () => {
  const app = lire('app_v7.js');
  assert.match(app, /function signalerHote\(type, layer, f\) \{\s*if \(!_abonneHote\) return;\s*if \(layer && !_sceneHote\.ids\.includes\(layer\.id\)\)/, "seules les couches de la page");
  assert.match(app, /signalerHote\('hover', feats\.length \? coucheDuRendu\(feats\[0\]\.layer\.id\) : null, feats\[0\]\);/);
  assert.match(app, /signalerHote\('select', null, null\);\s*if \(CONFIG\.viewMode\) closeViewPopup\(\);/);
  assert.match(app, /signalerHote\('select', layer, f\);/);
  assert.match(app, /abonner: \(fn\) => \{ _abonneHote = fn;/);
});
