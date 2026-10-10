// Le contour des marqueurs a formes (visuel `etats`) vient de la charte (`marqueurs.contour`), sauf si l'hote donne le sien.
//
// Constat navigateur (10/10/2026) : la charte derive et verifie `marqueurs.contour` (l'encre, 17:1 sur le fond) et l'expose dans le theme d'execution,
// mais `ajouterIcones` dessinait toujours un trait BLANC : le marqueur « a auditer » (losange blanc) disparaissait sur le plan blanc et le contour des
// autres n'avait pas le contraste que la charte annonce.
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { ajouterIcones } from '../lib/bi/icones-etats.js';

/** Un canevas simule : consigne les `strokeStyle` / `fillStyle` poses (un par forme dessinee). */
function poserCanevas() {
  const dessins = [];
  globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() {
    const etat = { }; const cible = { getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), stroke() { dessins.push({ fond: etat.fillStyle, trait: etat.strokeStyle }); } };
    return new Proxy(cible, { get: (t, k) => (k in t ? t[k] : (k in etat ? etat[k] : () => {})), set: (t, k, v) => { etat[k] = v; return true; } }); } };
  return dessins;
}
const carteImages = () => { const images = new Map(); return { images, hasImage: (i) => images.has(i), addImage: (i, img) => images.set(i, img), removeImage: (i) => images.delete(i) }; };

test('ajouterIcones : le contour par defaut est celui qu\'on lui donne, le blanc seulement a defaut', () => {
  const dessins = poserCanevas();
  try {
    const etats = { a: { forme: 'cercle', fill: '#448d60' }, b: { forme: 'carre', fill: '#ffffff', stroke: '#ff0000' } };
    ajouterIcones(carteImages(), etats, { contourDefaut: '#1f1b14' });
    assert.deepEqual(dessins.map((d) => d.trait), ['#1f1b14', '#ff0000'], 'contour de la charte, sauf celui que l\'etat declare');
    dessins.length = 0; ajouterIcones(carteImages(), etats);
    assert.deepEqual(dessins.map((d) => d.trait), ['#ffffff', '#ff0000'], 'sans contour de charte : le blanc d\'avant');
  } finally { delete globalThis.OffscreenCanvas; }
});

function carteSimulee() {
  const sources = new Map(), calques = [], images = carteImages();
  return { sources, calques, ...images, addSource: (id, s) => sources.set(id, { ...s, setData() {} }), getSource: (id) => sources.get(id), removeSource: (id) => sources.delete(id), addLayer: (l) => calques.push(l), getLayer: (id) => calques.find((l) => l.id === id), removeLayer() {},
    setFilter() {}, setLayoutProperty() {}, getLayoutProperty: () => 'visible', setPaintProperty() {}, getPaintProperty: () => null, getStyle: () => ({ layers: calques, glyphs: '' }), setFeatureState() {}, getFeatureState: () => ({}),
    on() {}, once() {}, off() {}, getCanvas: () => ({ style: {} }), queryRenderedFeatures: () => [], fitBounds() {}, flyTo() {}, resize() {}, project: () => ({ x: 0, y: 0 }), getCenter: () => ({ lng: 2, lat: 47 }), getZoom: () => 5, getPitch: () => 0, getBearing: () => 0, isStyleLoaded: () => true, dragPan: { enable() {}, disable() {} }, setGlyphs() {} };
}
const scene = (etats) => ({ title: 't', layers: [{ id: 'e', name: 'E', geometry_type: 'point', visuel: { type: 'etats', champEtat: 'etat', etats }, style: { declarative: { kind: 'single', color: '#448d60' } } }] });
const pts = [{ type: 'Feature', id: 1, geometry: { type: 'Point', coordinates: [2, 47] }, properties: { etat: 'a' } }];

test('composant : les marqueurs a formes sont traces avec le contour de la charte (encre), celui de l\'hote si elle le change', async () => {
  const dessins = poserCanevas();
  try {
    const rt = attacher(carteSimulee(), { preferences: { contrasteEleve: false } });
    await rt.api.setScene(scene({ a: { forme: 'cercle', fill: '#448d60' }, b: { forme: 'losange', fill: '#ffffff' } }), { e: pts });
    const encre = rt.api.getTheme().charte.marqueurs.contour;
    assert.equal(encre, '#1f1b14');
    assert.deepEqual(dessins.map((d) => d.trait), [encre, encre]);
    dessins.length = 0;
    rt.api.setTheme({ version: 'atlas-charte/0.1', graines: { principal: '#1b6b7a', secondaire: '#e07b00', encre: '#101820', fond: '#ffffff' } });
    const encreHote = rt.api.getTheme().charte.marqueurs.contour;
    assert.notEqual(encreHote, encre, 'la charte de l\'hote change le contour des marqueurs');
    assert.deepEqual(dessins.map((d) => d.trait), [encreHote, encreHote], 'les marqueurs sont redessines apres setTheme');
  } finally { delete globalThis.OffscreenCanvas; }
});
