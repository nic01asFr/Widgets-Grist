// Les expressions de style posees par le composant BI doivent etre ACCEPTEES par MapLibre.
//
// Constat navigateur (10/10/2026) : MapLibre refuse un calque dont une expression imbrique `['zoom']` ailleurs qu'en entree d'un
// `interpolate` ou d'un `step` de tete (« "zoom" expression may only be used as input to a top-level "step" or "interpolate"
// expression »). Le refus est SILENCIEUX (evenement `error` de la carte, que personne n'ecoute) : le calque n'existe pas. Le contour
// des unites d'un choroplethe (`bi-line-<id>`, qui porte aussi le trait de selection et le contour clair des classes sombres) n'etait
// jamais ajoute.
//
// Ce test n'a pas besoin de navigateur : il parcourt les expressions de chaque calque pose sur une carte simulee et applique la regle.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { attacher } from '../lib/bi/bi-runtime.js';

const DON = new URL('../lib/bi/donnees/', import.meta.url);

/** Contient-il `['zoom']` n'importe ou ? */
const contientZoom = (e) => Array.isArray(e) && (e[0] === 'zoom' || e.some((x) => contientZoom(x)));
/** Violations de la regle : une expression qui utilise `zoom` doit etre un `interpolate` / `step` de tete dont l'entree est `['zoom']`, sans autre `zoom`. */
export function violationsZoom(expr) {
  if (!Array.isArray(expr) || !contientZoom(expr)) return [];
  const tete = expr[0];
  const entree = tete === 'step' ? expr[1] : /^interpolate/.test(String(tete)) ? expr[2] : undefined;
  if (entree === undefined || !Array.isArray(entree) || entree[0] !== 'zoom' || entree.length !== 1) return ['zoom hors de l\'entree d\'un interpolate/step de tete : ' + JSON.stringify(expr).slice(0, 120)];
  const sorties = tete === 'step' ? expr.slice(2) : expr.slice(3);
  return sorties.some((s) => contientZoom(s)) ? ['zoom dans une sortie : ' + JSON.stringify(expr).slice(0, 120)] : [];
}
test('la regle : zoom en entree d\'un interpolate de tete passe, zoom sous un case est refuse', () => {
  assert.deepEqual(violationsZoom(['interpolate', ['linear'], ['zoom'], 3, 1, 8, 2]), []);
  assert.deepEqual(violationsZoom(['step', ['zoom'], 1, 5, 2]), []);
  assert.deepEqual(violationsZoom(['interpolate', ['linear'], ['zoom'], 3, ['case', ['boolean', ['feature-state', 'a'], false], 3, 1], 8, 2]), []);
  assert.equal(violationsZoom(['case', ['boolean', ['feature-state', 'a'], false], 3, ['interpolate', ['linear'], ['zoom'], 3, 1, 8, 2]]).length, 1);
  assert.equal(violationsZoom(['*', 2, ['interpolate', ['linear'], ['zoom'], 3, 1, 8, 2]]).length, 1);
});

function carteSimulee() {
  const sources = new Map(), calques = [], etats = new Map(), images = new Set();
  const m = {
    sources, calques, etats,
    addSource: (id, s) => sources.set(id, { ...s, setData(d) { this.data = d; } }), getSource: (id) => sources.get(id), removeSource: (id) => sources.delete(id),
    addLayer: (l, avant) => { const i = avant ? calques.findIndex((x) => x.id === avant) : -1; if (i >= 0) calques.splice(i, 0, l); else calques.push(l); },
    getLayer: (id) => calques.find((l) => l.id === id), removeLayer: (id) => { const i = calques.findIndex((l) => l.id === id); if (i >= 0) calques.splice(i, 1); },
    setFilter() {}, setLayoutProperty() {}, getLayoutProperty: () => 'visible', setPaintProperty() {}, getPaintProperty: () => null, getStyle: () => ({ layers: calques, glyphs: '' }),
    setFeatureState: ({ source, id }, e) => etats.set(source + '|' + id, { ...(etats.get(source + '|' + id) || {}), ...e }), getFeatureState: () => ({}),
    hasImage: (i) => images.has(i), addImage: (i) => images.add(i), removeImage: (i) => images.delete(i),
    on() {}, once() {}, off() {}, getCanvas: () => ({ style: {} }), queryRenderedFeatures: () => [], fitBounds() {}, flyTo() {}, jumpTo() {}, resize() {}, project: () => ({ x: 0, y: 0 }),
    getCenter: () => ({ lng: 2.4, lat: 46.6 }), getZoom: () => 5, getPitch: () => 0, getBearing: () => 0, isStyleLoaded: () => true, dragPan: { enable() {}, disable() {} }, setGlyphs() {},
  };
  return m;
}
const fetchEmbarque = async (url) => { const nom = String(url).split('/').pop(); const t = fs.readFileSync(new URL(nom, DON), 'utf8'); return { ok: true, status: 200, json: async () => JSON.parse(t), text: async () => t }; };
const expressionsDe = (l) => [...Object.entries(l.paint || {}), ...Object.entries(l.layout || {})].map(([k, v]) => [l.id + ' ' + k, v]);
const toutesLesViolations = (map) => map.calques.flatMap((l) => expressionsDe(l).flatMap(([nom, e]) => violationsZoom(e).map((v) => nom + ' : ' + v)));

test('choroplethe administratif : aucun calque ne porte une expression de zoom que MapLibre refuse, et le contour des unites existe', async () => {
  const map = carteSimulee(); const rt = attacher(map, { admin: { fetch: fetchEmbarque, base: '' } });
  await rt.api.addAdminLayer('region', { id: 'r', source: 'embarque', visuel: { source: 'hote', table: { 93: 10, 11: 40 }, niveauTable: 'region' } });
  const calques = map.calques.map((l) => l.id);
  assert.ok(calques.includes('bi-line-r'), 'le calque de contour des unites est present : ' + calques.join(','));
  assert.deepEqual(toutesLesViolations(map), []);
  const ligne = map.getLayer('bi-line-r');
  assert.equal(violationsZoom(ligne.paint['line-width']).length, 0, 'largeur du contour : zoom en entree d\'un interpolate de tete');
  // le trait de selection et le survol restent plus larges que le trait de base, a tous les zooms
  const w = ligne.paint['line-width']; assert.equal(w[0], 'interpolate'); for (let i = 4; i < w.length; i += 2) assert.equal(w[i][0], 'case', 'chaque palier distingue selection et survol');
});
test('les visuels de points (cercles, proportionnel, chaleur, hexagones, grille, marqueurs) respectent aussi la regle', async () => {
  const map = carteSimulee(); const rt = attacher(map);
  const f = (id, x) => ({ type: 'Feature', id, geometry: { type: 'Point', coordinates: [2 + x, 47] }, properties: { v: id * 10, etat: ['a', 'b'][id % 2], type: 'k' } });
  const donnees = { p: [f(1, 0), f(2, 0.1), f(3, 0.2)] };
  const decl = { kind: 'categorized', field: 'type', stops: [{ value: 'k', color: '#292574' }] };
  for (const visuel of [{ type: 'cercles' }, { type: 'proportionnel', champ: 'v', min: 0, max: 30, rMin: 3, rMax: 12 }, { type: 'heat', poids: 'v', points: 9 }, { type: 'hex', taille: 20000, champ: 'v', metrique: 'somme' }, { type: 'grille', taille: 20000 }, { type: 'etats', champEtat: 'etat', etats: { a: { forme: 'cercle', fill: '#448D60' }, b: { forme: 'carre', fill: '#F7D05C' } } }]) {
    // la simulation n'a pas de canevas : les marqueurs a formes sont exclus de la creation d'icones, la regle ne porte que sur les expressions
    if (visuel.type === 'etats') { globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return new Proxy({ getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }) }, { get: (t, k) => (k in t ? t[k] : () => {}), set: () => true }); } }; }
    await rt.api.setScene({ title: 't', layers: [{ id: 'p', name: 'P', geometry_type: 'point', visuel, style: { declarative: decl } }] }, donnees);
    assert.deepEqual(toutesLesViolations(map), [], 'visuel ' + visuel.type);
  }
  delete globalThis.OffscreenCanvas;
});
