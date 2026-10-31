/**
 * Contrat 0.4 : l'événement `clic { lng, lat, x, y, zoom }`, la position d'un clic qui ne touche aucune entité interactive.
 * node --test projects/Atlas/tests/bi-clic-0-4.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { EVENEMENTS_AJOUTES, TOUS_LES_EVENEMENTS } from '../lib/bi/evenements-ext.js';
import { TEXTES_EVENEMENTS } from '../lib/bi/describe.js';
import { carteSimulee, point, MANIFESTE, DONNEES } from './aide-carte-bi.js';

const clic = (carte, lng, lat, x = 10, y = 20) => carte.emit('click', { point: { x, y }, lngLat: { lng, lat } });
const ecouter = (rt, types) => { const vus = []; for (const t of types) rt.on(t, (c) => vus.push([t, c])); return vus; };

test('clic : un clic hors de toute entité émet clic { lng, lat, x, y, zoom }, origine utilisateur', async () => {
  const carte = carteSimulee(); const rt = attacher(carte);
  await rt.api.setScene(MANIFESTE, DONNEES);
  carte.queryRenderedFeatures = () => [];
  const vus = ecouter(rt, ['clic', 'select']);
  clic(carte, 5.37, 43.29, 10, 20);
  assert.deepEqual(vus, [['clic', { lng: 5.37, lat: 43.29, x: 10, y: 20, zoom: 5 }]]);
});

test('clic : un clic sur une entité reste un select seul, sans clic', async () => {
  const carte = carteSimulee(); const rt = attacher(carte);
  await rt.api.setScene(MANIFESTE, DONNEES);
  carte.queryRenderedFeatures = (_p, o) => [{ id: 1, source: 'bi-src-sites', layer: { id: o.layers[0] } }];
  const vus = ecouter(rt, ['clic', 'select']);
  clic(carte, 5.1, 43.2);
  assert.deepEqual(vus.map((v) => v[0]), ['select']);
});

test('clic : sans aucune couche, le clic part quand même (l\'ancienne sortie anticipée le perdait)', async () => {
  const carte = carteSimulee(); const rt = attacher(carte);
  const vus = ecouter(rt, ['clic']);
  clic(carte, 2.35, 48.85);
  assert.equal(vus.length, 1); assert.equal(vus[0][1].lng, 2.35);
});

test('clic : après une sélection, un clic dans le vide émet select vide PUIS clic', async () => {
  const carte = carteSimulee(); const rt = attacher(carte);
  await rt.api.setScene(MANIFESTE, DONNEES);
  const vus = ecouter(rt, ['clic', 'select']);
  carte.queryRenderedFeatures = (_p, o) => [{ id: 1, source: 'bi-src-sites', layer: { id: o.layers[0] } }]; clic(carte, 5.1, 43.2);
  carte.queryRenderedFeatures = () => []; clic(carte, 5.5, 43.5);
  assert.deepEqual(vus.map((v) => v[0]), ['select', 'select', 'clic']);
  assert.deepEqual(vus[1][1], { layer: null, featureId: null });
});

test('clic : en édition, `edit add` garde la priorité et le clic n\'est pas émis', async () => {
  const carte = carteSimulee(); const rt = attacher(carte);
  await rt.api.setScene(MANIFESTE, DONNEES); carte.queryRenderedFeatures = () => [];
  await rt.api.setEdition('sites', true);
  const vus = ecouter(rt, ['clic', 'edit']);
  clic(carte, 5.2, 43.3);
  assert.deepEqual(vus.map((v) => v[0]), ['edit']);
});

test('clic : coordonnées bornées et arrondies ; une position illisible n\'émet rien et ne lève pas', async () => {
  const carte = carteSimulee(); const rt = attacher(carte); const vus = ecouter(rt, ['clic']);
  clic(carte, 5.123456789, 43.987654321, 10.26, 20.04);
  assert.deepEqual([vus[0][1].lng, vus[0][1].lat, vus[0][1].x, vus[0][1].y], [5.1234568, 43.9876543, 10.3, 20]);
  clic(carte, 365, 95); assert.deepEqual([vus[1][1].lng, vus[1][1].lat], [5, 90], 'longitude ramenée dans [-180, 180], latitude bornée');
  clic(carte, -190, 10); assert.equal(vus[2][1].lng, 170);
  const avant = vus.length;
  for (const mauvais of [{ lng: NaN, lat: 1 }, { lng: 1, lat: Infinity }, { lng: 'a', lat: 1 }, undefined, null]) { carte.emit('click', { point: { x: 1, y: 1 }, lngLat: mauvais }); }
  assert.equal(vus.length, avant);
  carte.emit('click', { lngLat: { lng: 1, lat: 2 } });   // pas de point : pixels absents
  assert.deepEqual([vus.at(-1)[1].x, vus.at(-1)[1].y], [null, null]);
});

test('clic : événement du contrat (livré par l\'élément et décrit), ajouté sans toucher à pont.js', () => {
  assert.ok(EVENEMENTS_AJOUTES.includes('clic') && TOUS_LES_EVENEMENTS.includes('clic'));
  assert.ok(Array.isArray(TEXTES_EVENEMENTS.clic) && /lng, lat, x, y, zoom/.test(TEXTES_EVENEMENTS.clic[1]));
});
