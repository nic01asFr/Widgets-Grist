// La dimension temporelle appartient a une SCENE : en poser une autre, sans `temps`, doit l'arreter.
//
// Constat navigateur (10/10/2026) : apres `play` puis un `setScene` sans `temps`, la lecture continuait (evenements `time` d'origine utilisateur), le champ
// temporel de la scene precedente filtrait la nouvelle (16 entites visibles sur 100) et `setTime` etait accepte sur une scene qui n'a pas de temps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';

function carteSimulee() {
  const sources = new Map(), calques = [];
  return {
    sources, calques, addSource: (id, s) => sources.set(id, { ...s, setData() {} }), getSource: (id) => sources.get(id), removeSource: (id) => sources.delete(id),
    addLayer: (l) => calques.push(l), getLayer: (id) => calques.find((l) => l.id === id), removeLayer: (id) => { const i = calques.findIndex((l) => l.id === id); if (i >= 0) calques.splice(i, 1); },
    setFilter() {}, setLayoutProperty() {}, getLayoutProperty: () => 'visible', setPaintProperty() {}, getPaintProperty: () => null, getStyle: () => ({ layers: calques, glyphs: '' }),
    setFeatureState() {}, getFeatureState: () => ({}), hasImage: () => false, addImage() {}, removeImage() {},
    on() {}, once() {}, off() {}, getCanvas: () => ({ style: {} }), queryRenderedFeatures: () => [], fitBounds() {}, flyTo() {}, jumpTo() {}, resize() {}, project: () => ({ x: 0, y: 0 }),
    getCenter: () => ({ lng: 2.4, lat: 46.6 }), getZoom: () => 5, getPitch: () => 0, getBearing: () => 0, isStyleLoaded: () => true, dragPan: { enable() {}, disable() {} }, setGlyphs() {},
  };
}
const sites = Array.from({ length: 12 }, (_, i) => ({ type: 'Feature', id: i + 1, geometry: { type: 'Point', coordinates: [2 + i * 0.1, 47] }, properties: { annee: 2019 + (i % 6) } }));
const sceneAvec = { title: 'a', temps: { champ: 'annee', mode: 'cumul', pas: 1, valeur: 2020 }, layers: [{ id: 'a', name: 'A', geometry_type: 'point', visuel: { type: 'cercles' }, style: { declarative: { kind: 'single', color: '#292574' } } }] };
const sceneSans = { title: 'b', layers: [{ id: 'b', name: 'B', geometry_type: 'point', visuel: { type: 'cercles' }, style: { declarative: { kind: 'single', color: '#EF7757' } } }] };

test('une nouvelle scene sans `temps` arrete la lecture et ne herite pas du champ temporel', async () => {
  const rafs = []; globalThis.requestAnimationFrame = (f) => { rafs.push(f); return rafs.length; };
  try {
    const rt = attacher(carteSimulee(), { preferences: { contrasteEleve: false } }); const evts = []; rt.brancherEmetteur((type, charge, origine) => evts.push({ type, charge, origine }));
    await rt.api.setScene(sceneAvec, { a: sites });
    assert.equal(rt.api.getRows('a').lignes.length, 12, 'avant tout setTime, tout est visible');
    await rt.api.setTime(2020); assert.equal(rt.api.getRows('a').lignes.length, 4);
    rt.api.play({ parSeconde: 5 }); let t = 0; const tic = (dt) => { t += dt; const f = rafs.pop(); if (f) f(t); };
    tic(100); tic(300); assert.ok(evts.some((e) => e.type === 'time' && e.charge.lecture), 'la lecture emet des evenements temps');
    await rt.api.setScene(sceneSans, { b: sites });
    const avant = evts.filter((e) => e.type === 'time').length;
    for (let i = 0; i < 5; i++) tic(400);
    assert.equal(evts.filter((e) => e.type === 'time').length, avant, 'plus d\'evenement temps apres la nouvelle scene');
    assert.equal(rt.api.getRows('b').lignes.length, 12, 'la nouvelle scene n\'est pas filtree par le temps de l\'ancienne');
    assert.throws(() => rt.api.setTime(2020), /aucun champ temporel/);
    assert.throws(() => rt.api.play(), /aucun champ temporel/);
  } finally { delete globalThis.requestAnimationFrame; }
});
test('une nouvelle scene AVEC `temps` repart de sa propre dimension', async () => {
  const rt = attacher(carteSimulee(), { preferences: { contrasteEleve: false } });
  await rt.api.setScene(sceneAvec, { a: sites }); await rt.api.setTime(2019);
  await rt.api.setScene({ ...sceneAvec, temps: { champ: 'annee', mode: 'instant', valeur: 2021 }, layers: [{ ...sceneAvec.layers[0], id: 'c' }] }, { c: sites });
  assert.equal(rt.api.setTime(2021).fenetre.min, 2021, 'mode instantane de la nouvelle scene');
  assert.equal(rt.api.getRows('c').lignes.length, 2);
});
