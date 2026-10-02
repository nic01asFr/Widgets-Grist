import test from 'node:test';
import assert from 'node:assert/strict';
import { objectInspectorTabs, ONGLET_3D, ONGLET_SPECS } from '../lib/model-layer.js';

const couche3D = { style: { mode: 'library' }, geometryType: 'Point' };
const couchePlate = { style: { mode: 'mapbox' }, geometryType: 'Polygon' };

test('l onglet des specifications vient apres le placement 3D, quand l objet a des parametres', () => {
  const tabs = objectInspectorTabs({ layer: couche3D, specs: true });
  assert.deepEqual(tabs.map((t) => t.cle), [ONGLET_3D, ONGLET_SPECS]);
  assert.equal(ONGLET_SPECS, 'Spécifications');
});

test('sans parametres decrits, pas d onglet', () => {
  assert.deepEqual(objectInspectorTabs({ layer: couche3D }).map((t) => t.cle), [ONGLET_3D]);
  assert.deepEqual(objectInspectorTabs({ layer: couche3D, specs: false }).map((t) => t.cle), [ONGLET_3D]);
});

test('jamais sur une selection multiple, sauf en revue ou un curseur designe un objet', () => {
  assert.deepEqual(objectInspectorTabs({ layer: couche3D, specs: true, multi: true }).map((t) => t.cle), [ONGLET_3D]);
  assert.deepEqual(objectInspectorTabs({ layer: couche3D, specs: true, multi: true, revue: true }).map((t) => t.cle), [ONGLET_3D, ONGLET_SPECS]);
});

test('l onglet suit l objet, pas la couche : il peut exister sans placement 3D', () => {
  const tabs = objectInspectorTabs({ layer: couchePlate, specs: true });
  assert.deepEqual(tabs.map((t) => t.cle), [ONGLET_SPECS]);
});
