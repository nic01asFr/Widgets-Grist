/**
 * Contrat 0.5 : `getFeatures`, les géométries d'une couche (avec propriétés, visuel, style et légende) pour une page qui redessine ou extrude la figure.
 * node --test projects/Atlas/tests/bi-features-0-5.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { featuresDeEntites, normaliserOptionsFeatures, creerLimiteur, LIMITE_DEFAUT, LIMITE_MAX, SOMMETS_PAR_ENTITE_MAX } from '../lib/bi/features.js';
import { COMMANDES, COMMANDES_0_5, CAPACITE_DE_COMMANDE, validerCommande, versionDeCommande } from '../lib/bi/pont.js';
import { TEXTES_COMMANDES } from '../lib/bi/describe.js';
import { carteSimulee, MANIFESTE, DONNEES } from './aide-carte-bi.js';

const lire = (entites, opt = {}) => featuresDeEntites(entites, { bbox: null, limite: LIMITE_DEFAUT, ...opt });
const poly = (id, x, y, props = {}) => ({ id, geometry: { type: 'Polygon', coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]] }, properties: props });
const ligne = (n) => ({ id: 'l', geometry: { type: 'LineString', coordinates: Array.from({ length: n }, (_, i) => [i / 1000, 0]) }, properties: {} });

test('contrat : getFeatures est une commande 0.5 de la capacité socle, décrite, refusée à un hôte resté en 0.4', () => {
  assert.ok('getFeatures' in COMMANDES && COMMANDES_0_5.includes('getFeatures')); assert.equal(versionDeCommande('getFeatures'), '0.5'); assert.equal(CAPACITE_DE_COMMANDE.getFeatures, 'socle');
  assert.ok(Array.isArray(TEXTES_COMMANDES.getFeatures));
  const ctx = { origine: 'https://hote.test', autorisees: ['https://hote.test'] };
  const msg = (version, args) => ({ source: 'hote-bi', version, id: 'a', cmd: 'getFeatures', args });
  assert.equal(validerCommande(msg('0.4', ['sites']), ctx).code, 'version');
  assert.equal(validerCommande(msg('0.5', ['sites', { limite: 10 }]), ctx).ok, true);
  assert.equal(validerCommande(msg('0.5', []), ctx).code, 'argument', 'la couche est obligatoire');
  assert.equal(validerCommande(msg('0.5', [3]), ctx).code, 'argument');
});

test('options : limite et bbox vérifiées, erreurs lisibles', () => {
  assert.deepEqual(normaliserOptionsFeatures(), { limite: LIMITE_DEFAUT, bbox: null });
  assert.deepEqual(normaliserOptionsFeatures({ limite: 3, bbox: [1, 2, 3, 4] }), { limite: 3, bbox: [1, 2, 3, 4] });
  for (const mauvais of [{ limite: 0 }, { limite: LIMITE_MAX + 1 }, { limite: 1.5 }, { bbox: [1, 2, 3] }, { bbox: [3, 2, 1, 4] }, { bbox: [0, 0, 181, 1] }, { bbox: ['a', 0, 1, 1] }, 'x', []]) {
    assert.throws(() => normaliserOptionsFeatures(mauvais), /getFeatures/, JSON.stringify(mauvais));
  }
});

test('lecture : géométries arrondies à 7 décimales, propriétés copiées, identifiants gardés', () => {
  const r = lire([{ id: 7, geometry: { type: 'Point', coordinates: [5.123456789012, 43.2] }, properties: { nom: 'A', h: 12 } }, poly('p', 5, 43)]);
  assert.equal(r.total, 2); assert.equal(r.tronque, false); assert.deepEqual(r.avertissements, []);
  assert.deepEqual(r.features[0], { type: 'Feature', id: 7, geometry: { type: 'Point', coordinates: [5.1234568, 43.2] }, properties: { nom: 'A', h: 12 } });
  assert.equal(r.features[1].geometry.type, 'Polygon');
});

test('lecture : la bbox filtre par emprise ; hors emprise = vide sans erreur', () => {
  const e = [poly('a', 5, 43), poly('b', 10, 50)];
  assert.deepEqual(lire(e, { bbox: [4.5, 42.5, 6.5, 44.5] }).features.map((f) => f.id), ['a']);
  assert.equal(lire(e, { bbox: [-10, -10, -9, -9] }).features.length, 0);
});

test('plafonds : limite, entité géante ignorée et nommée, géométrie illisible ignorée', () => {
  const r = lire([poly('a', 0, 0), poly('b', 2, 2), poly('c', 4, 4)], { limite: 2 });
  assert.equal(r.features.length, 2); assert.equal(r.tronque, true); assert.ok(r.avertissements.some((a) => /^limite/.test(a)));
  const g = lire([ligne(SOMMETS_PAR_ENTITE_MAX + 1), poly('ok', 0, 0)]);
  assert.deepEqual(g.features.map((f) => f.id), ['ok']); assert.ok(g.avertissements.some((a) => /geometrie-trop-grande/.test(a)));
  const m = lire([{ id: 1, geometry: { type: 'Point', coordinates: [NaN, 1] } }, { id: 2, geometry: { type: 'Circle', coordinates: [] } }, { id: 3 }, null, poly('v', 0, 0)]);
  assert.deepEqual(m.features.map((f) => f.id), ['v']); assert.ok(m.avertissements.some((a) => /entites-ignorees : 4/.test(a)));
});

test('propriétés non sérialisables : écartées, jamais de plantage', () => {
  const cycle = {}; cycle.moi = cycle;
  const r = lire([{ id: 1, geometry: { type: 'Point', coordinates: [1, 1] }, properties: cycle }]);
  assert.deepEqual(r.features[0].properties, {});
});

test('limiteur : 5 appels par seconde', () => {
  let t = 0; const ok = creerLimiteur(() => t);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(() => ok()), [true, true, true, true, true, false]); t = 1000; assert.equal(ok(), true);
});

async function monter() {
  const m = carteSimulee(); const rt = attacher(m, {});
  await rt.api.setScene(MANIFESTE, DONNEES);
  return rt.api;
}

test('runtime : getFeatures rend la couche avec géométries, propriétés, visuel et légende ; bbox et limite respectées', async () => {
  const api = await monter();
  const r = await api.getFeatures('sites');
  assert.equal(r.type, 'FeatureCollection'); assert.equal(r.layer, 'sites'); assert.equal(r.geometrie, 'point');
  assert.equal(r.features.length, DONNEES.sites.length); assert.equal(r.tronque, false);
  assert.deepEqual(r.features[0].geometry, DONNEES.sites[0].geometry); assert.equal(r.features[0].properties.nom, 'Alpha');
  assert.ok(r.visuel && typeof r.visuel === 'object'); assert.ok('legende' in r && 'style' in r); assert.equal(r.visible, true);
  assert.equal((await api.getFeatures('sites', { limite: 1 })).features.length, 1);
  assert.equal((await api.getFeatures('sites', { bbox: [-1, -1, 0, 0] })).features.length, 0);
});

test('runtime : couche inconnue refusée, le résultat est indépendant de la couche (copie)', async () => {
  const api = await monter();
  await assert.rejects(() => api.getFeatures('nope'), /couche inconnue/);
  const r = await api.getFeatures('sites'); r.features[0].geometry.coordinates[0] = 999; r.features[0].properties.nom = 'X';
  const encore = await api.getFeatures('sites');
  assert.notEqual(encore.features[0].geometry.coordinates[0], 999); assert.equal(encore.features[0].properties.nom, 'Alpha');
});

test('runtime : une couche masquée est lue et le dit (visible:false)', async () => {
  const api = await monter(); api.setLayerVisibility('sites', false);
  const r = await api.getFeatures('sites'); assert.equal(r.visible, false); assert.ok(r.features.length > 0);
});

test('runtime : au plus 5 lectures par seconde', async () => {
  const api = await monter(); let ok = 0, trop = 0;
  for (let i = 0; i < 8; i++) { try { await api.getFeatures('sites'); ok++; } catch (e) { if (/trop_frequent/.test(e.message)) trop++; } }
  assert.equal(ok, 5); assert.equal(trop, 3);
});
