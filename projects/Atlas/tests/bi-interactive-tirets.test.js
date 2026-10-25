// `interactive:false` : une couche exclue du clic, du survol et du test « vide » de l'édition ; `visuel.tirets` : des pointillés sur une couche de lignes.
// node --test tests/bi-interactive-tirets.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { traceLigneDeclare } from '../lib/bi/style-polygone.js';
import { validerManifeste } from '../lib/bi/valider-manifeste.js';
import { carteSimulee } from './aide-carte-bi.js';

const pt = (id, x) => ({ type: 'Feature', id, properties: { ref: 'p' + id }, geometry: { type: 'Point', coordinates: [5.3 + x, 43.3] } });
const ligne = (id) => ({ type: 'Feature', id, properties: { ref: 'l' + id }, geometry: { type: 'LineString', coordinates: [[5.3, 43.3], [5.31, 43.31]] } });
const SCENE = (interactive) => ({ layers: [
  { id: 'panneaux', name: 'Panneaux', geometry_type: 'point', cle: 'ref' },
  { id: 'visees', name: 'Visées', geometry_type: 'line', cle: 'ref', visuel: { tirets: [4, 2] }, ...(interactive === undefined ? {} : { interactive }) }] });
const DONNEES = { panneaux: [pt(1, 0)], visees: [ligne(7)] };

test('traceLigneDeclare : des tirets valides sont repris, les autres écartés', () => {
  assert.deepEqual(traceLigneDeclare({ tirets: [4, 2] }).tirets, [4, 2]);
  for (const mauvais of [undefined, null, [4], [4, -1], [0, 2], ['a', 2], 'x', [1, 2, 3, 4, 5, 6, 7, 8, 9], [4, 99]]) assert.equal(traceLigneDeclare({ tirets: mauvais }).tirets, null, JSON.stringify(mauvais));
});

test('une couche de lignes avec tirets porte line-dasharray, sans tirets elle reste pleine', async () => {
  const carte = carteSimulee(); const rt = attacher(carte);
  await rt.api.setScene(SCENE(), DONNEES);
  assert.deepEqual(carte.calques.find((c) => c.id === 'bi-line-visees').paint['line-dasharray'], [4, 2]);
  await rt.api.setScene({ layers: [{ id: 'visees', name: 'V', geometry_type: 'line' }] }, DONNEES);
  assert.equal(carte.calques.find((c) => c.id === 'bi-line-visees').paint['line-dasharray'], undefined);
});

test('le clic et le survol n\'interrogent pas une couche `interactive:false` ; sans le réglage, toutes sont interrogées', async () => {
  for (const [interactive, attendu] of [[undefined, 2], [true, 2], [false, 1]]) {
    const carte = carteSimulee(); const rt = attacher(carte); const demandes = [];
    carte.queryRenderedFeatures = (_p, o) => { demandes.push(o.layers); return []; };
    await rt.api.setScene(SCENE(interactive), DONNEES);
    carte.emit('click', { point: { x: 1, y: 1 }, lngLat: { lng: 5.3, lat: 43.3 } });
    assert.ok(demandes.length, 'le clic interroge la carte');
    const couches = demandes[0]; assert.equal(couches.length, attendu, JSON.stringify([interactive, couches]));
    assert.equal(couches.includes('bi-line-visees'), interactive !== false);
  }
});

test('en édition, un clic sur une couche non interactive est un clic dans le vide : `edit add`, pas un `select`', async () => {
  const carte = carteSimulee(); const rt = attacher(carte); const evts = [];
  // la carte rendrait la visée sous le clic si on l'interrogeait : la couche exclue ne doit pas être demandée
  carte.queryRenderedFeatures = (_p, o) => (o.layers.includes('bi-line-visees') ? [{ id: 7, source: 'bi-src-visees', layer: { id: 'bi-line-visees' } }] : []);
  await rt.api.setScene(SCENE(false), DONNEES);
  rt.on('select', (e) => evts.push(['select', e])); rt.on('edit', (e) => evts.push(['edit', e]));
  await rt.api.setEdition('panneaux', true);
  carte.emit('click', { point: { x: 1, y: 1 }, lngLat: { lng: 5.31, lat: 43.31 } });
  assert.equal(evts.length, 1); assert.equal(evts[0][0], 'edit'); assert.equal(evts[0][1].op, 'add'); assert.equal(evts[0][1].layer, 'panneaux');
});

test('le validateur connaît `interactive` et refuse autre chose qu\'un booléen', () => {
  const ok = validerManifeste({ layers: [{ id: 'a', name: 'A', geometry_type: 'point', interactive: false }] }, {});
  assert.ok(!JSON.stringify(ok).includes('interactive'), 'aucune remarque sur une propriété connue');
  const mal = validerManifeste({ layers: [{ id: 'a', name: 'A', geometry_type: 'point', interactive: 'non' }] }, {});
  assert.ok(JSON.stringify(mal).includes('interactive'));
});
