// Composant carte BI : l'événement hover porte la clé métier de l'entité survolée, comme select.
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';

function carte() {
  const calques = [], sources = new Map(), ecouteurs = new Map();
  return { calques, sources, addSource: (i, s) => sources.set(i, { ...s, setData() {} }), getSource: (i) => sources.get(i), removeSource: (i) => sources.delete(i), addLayer: (l) => calques.push(l), getLayer: (i) => calques.find((l) => l.id === i), removeLayer: (i) => { const k = calques.findIndex((l) => l.id === i); if (k >= 0) calques.splice(k, 1); },
    setFilter() {}, setLayoutProperty() {}, getLayoutProperty() {}, setPaintProperty() {}, getPaintProperty() {}, getStyle: () => ({ layers: calques, glyphs: '' }), setFeatureState() {}, hasImage: () => false, addImage() {}, removeImage() {},
    on: (t, f) => { if (!ecouteurs.has(t)) ecouteurs.set(t, []); ecouteurs.get(t).push(f); }, emit: (t, e) => (ecouteurs.get(t) || []).forEach((f) => f(e)), once() {}, getCanvas: () => ({ style: {} }), queryRenderedFeatures: () => [], fitBounds() {}, flyTo() {}, resize() {}, getCenter: () => ({ lng: 0, lat: 0 }), getZoom: () => 5, getPitch: () => 0, getBearing: () => 0, isStyleLoaded: () => true, dragPan: { enable() {}, disable() {} }, setGlyphs() {} };
}
const pt = (lng, lat, props, id) => ({ type: 'Feature', id, geometry: { type: 'Point', coordinates: [lng, lat] }, properties: props });

async function monter(manifeste, donnees) {
  const map = carte(); const evts = [];
  const rt = attacher(map); rt.brancherEmetteur((t, c, o) => evts.push({ type: t, charge: c, origine: o }));
  await rt.api.setScene(manifeste, donnees);
  const calque = map.calques.find((l) => l.source && map.sources.has(l.source));
  return { map, evts, calque };
}
// requestAnimationFrame exécute aussitôt : le survol est limité à une image, ici sans attente.
function survoler(map, calque, feature) {
  const ancien = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (f) => { f(); return 1; };
  try { map.queryRenderedFeatures = () => [{ ...feature, layer: { id: calque.id }, source: calque.source }]; map.emit('mousemove', { point: { x: 1, y: 1 } }); }
  finally { globalThis.requestAnimationFrame = ancien; }
}

test('hover : la clé métier déclarée par la couche accompagne l\'identifiant', async () => {
  const { map, evts, calque } = await monter({ layers: [{ id: 'sites', name: 'Sites', geometry_type: 'Point', cle: 'ref' }] }, { sites: [pt(5.1, 43.2, { nom: 'Alpha', ref: 'A' }, 1), pt(5.2, 43.3, { nom: 'Bravo', ref: 'B' }, 2)] });
  survoler(map, calque, { id: 2, properties: { nom: 'Bravo', ref: 'B' } });
  const h = evts.filter((e) => e.type === 'hover').at(-1);
  assert.equal(h.origine, 'utilisateur'); assert.equal(h.charge.layer, 'sites'); assert.equal(h.charge.featureId, 2); assert.equal(h.charge.key, 'B');
});
test('hover : sans clé déclarée, key reste absente de la valeur (undefined), jamais un autre champ', async () => {
  const { map, evts, calque } = await monter({ layers: [{ id: 'sites', name: 'Sites', geometry_type: 'Point' }] }, { sites: [pt(5.1, 43.2, { nom: 'Alpha', ref: 'A' }, 1)] });
  survoler(map, calque, { id: 1, properties: { nom: 'Alpha', ref: 'A' } });
  const h = evts.filter((e) => e.type === 'hover').at(-1);
  assert.equal(h.charge.featureId, 1); assert.equal(h.charge.key, undefined);
});
