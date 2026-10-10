// Les classes que le fond ne detache pas (contraste < seuil de la charte, 3:1) doivent recevoir un contour qui tranche : c'est ce que dit
// l'avertissement `contraste-classe-fond` (« Contour sombre requis sur les classes 1, 2... »), classe par classe, avec le niveau `info`
// — « un fait de la palette que l'affichage compense ».
//
// Constat navigateur (10/10/2026) : l'affichage ne compensait rien. Le contour des unites etait la couleur du fond (blanc) : une unite pale n'avait
// aucun bord visible sur le plan, et les cercles de la qualitative (jaune 1,3:1, orange 2,3:1, ciel 2,3:1) gardaient un trait blanc sur fond blanc.
// Le contraste se juge sur la couleur VUE : un aplat de choroplethe est dessine a 88 % d'opacite, donc plus proche du fond que sa couleur pleine
// (classe 6 sur 9 de la rampe d'Atlas : 3,48:1 annonce, 2,72:1 a l'ecran sur la classe 5 de 9).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { attacher } from '../lib/bi/bi-runtime.js';
import { couleurVue, estPale, contraste } from '../lib/bi/echelles.js';

const DON = new URL('../lib/bi/donnees/', import.meta.url);
const SOMBRE = JSON.parse(fs.readFileSync(new URL('./fixtures/charte/sombre.json', import.meta.url), 'utf8'));

test('couleurVue : la couleur melangee au fond selon l\'opacite ; estPale : sous le seuil, sur la couleur vue', () => {
  assert.equal(couleurVue('#000000', '#ffffff', 1), '#000000');
  assert.equal(couleurVue('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(couleurVue('#f8e9e7', '#ffffff', 0), '#ffffff');
  // 5e couleur de la rampe « principale » d'Atlas sur blanc : annoncee a 3,17:1 pleine, 2,72:1 a 88 %
  assert.ok(contraste('#d97463', '#ffffff') >= 3 && contraste(couleurVue('#d97463', '#ffffff', 0.88), '#ffffff') < 3, 'passe pleine, pas a 88 %');
  assert.equal(estPale('#d97463', '#ffffff', { opacite: 1 }), false); assert.equal(estPale('#d97463', '#ffffff', { opacite: 0.88 }), true);
  assert.equal(estPale('#692e23', '#ffffff', { opacite: 0.88 }), false);
  assert.equal(estPale('pas une couleur', '#ffffff'), false); assert.equal(estPale('#ffffff', 'x'), false);
  assert.equal(estPale('#f0e442', '#ffffff', { seuil: 3 }), true); assert.equal(estPale('#f0e442', '#ffffff', { seuil: 1 }), false);
});

function carteSimulee() {
  const sources = new Map(), calques = [], etats = new Map(), images = new Set();
  return { sources, calques, etats, addSource: (id, s) => sources.set(id, { ...s, setData() {} }), getSource: (id) => sources.get(id), removeSource: (id) => sources.delete(id),
    addLayer: (l, avant) => { const i = avant ? calques.findIndex((x) => x.id === avant) : -1; if (i >= 0) calques.splice(i, 0, l); else calques.push(l); }, getLayer: (id) => calques.find((l) => l.id === id), removeLayer: (id) => { const i = calques.findIndex((l) => l.id === id); if (i >= 0) calques.splice(i, 1); },
    setFilter() {}, setLayoutProperty() {}, getLayoutProperty: () => 'visible', setPaintProperty() {}, getPaintProperty: () => null, getStyle: () => ({ layers: calques, glyphs: '' }),
    setFeatureState: ({ source, id }, e) => etats.set(source + '|' + id, { ...(etats.get(source + '|' + id) || {}), ...e }), getFeatureState: () => ({}),
    hasImage: (i) => images.has(i), addImage: (i) => images.add(i), removeImage: (i) => images.delete(i), on() {}, once() {}, off() {}, getCanvas: () => ({ style: {} }), queryRenderedFeatures: () => [], fitBounds() {}, flyTo() {}, jumpTo() {}, resize() {}, project: () => ({ x: 0, y: 0 }),
    getCenter: () => ({ lng: 2.4, lat: 46.6 }), getZoom: () => 5, getPitch: () => 0, getBearing: () => 0, isStyleLoaded: () => true, dragPan: { enable() {}, disable() {} }, setGlyphs() {} };
}
const fetchEmbarque = async (url) => { const t = fs.readFileSync(new URL(String(url).split('/').pop(), DON), 'utf8'); return { ok: true, status: 200, json: async () => JSON.parse(t), text: async () => t }; };
/** 18 regions, valeurs 1..18 : cinq classes d'effectifs voisins. */
const CODES = JSON.parse(fs.readFileSync(new URL('regions-leger.json', DON), 'utf8')).features.map((f) => f.properties.code);
const TABLE = Object.fromEntries(CODES.map((c, i) => [c, i + 1]));
async function regions(theme) {
  const map = carteSimulee(); const rt = attacher(map, { admin: { fetch: fetchEmbarque, base: '' }, preferences: { contrasteEleve: false }, ...(theme ? { theme } : {}) });
  await rt.api.addAdminLayer('region', { id: 'r', source: 'embarque', visuel: { source: 'hote', table: TABLE, niveauTable: 'region', classes: 5, methode: 'quantiles' } });
  return { map, rt, etat: (code) => map.etats.get('bi-src-r|' + code) };
}

test('choroplethe : les unites des classes pales portent l\'etat `pale`, jugees sur la couleur VUE (88 %), et un trait sombre les cerne', async () => {
  const { map, rt, etat } = await regions();
  const legende = rt.api.getLegend('r'); const th = rt.api.getTheme().charte; const fond = th.fond.plan.fond; const encre = th.donnees.selection;
  const attendu = legende.classes.map((k) => contraste(couleurVue(k.couleur, fond, 0.88), fond) < 3);
  assert.deepEqual(attendu, [true, true, true, false, false], 'rampe d\'Atlas a 5 classes : les trois premieres sont pales a l\'ecran (l\'avertissement n\'en annonce que deux)');
  for (const l of rt.api.getRows('r').lignes) { if (l.classe < 0) continue; assert.equal(etat(l.code).pale, attendu[l.classe], 'unite ' + l.code + ' classe ' + l.classe); }
  const pale = map.getLayer('bi-pale-r'); assert.ok(pale, 'le calque de contour des classes pales existe');
  assert.equal(pale.paint['line-color'], encre, 'le trait est l\'encre de la charte (17:1 sur le fond)');
  assert.deepEqual(pale.paint['line-opacity'], ['case', ['boolean', ['feature-state', 'pale'], false], 0.85, 0]);
  assert.ok(map.calques.findIndex((l) => l.id === 'bi-pale-r') < map.calques.findIndex((l) => l.id === 'bi-halo-r'), 'sous le halo et le trait de selection');
  const w = pale.paint['line-width']; assert.equal(w[0], 'interpolate'); assert.deepEqual(w[2], ['zoom']);
  const fill = map.getLayer('bi-fill-r').paint['fill-opacity']; assert.equal(fill[fill.length - 1], 0.88, 'l\'opacite jugee est celle qui est dessinee');
});
test('choroplethe sur fond sombre : ce sont les classes proches du fond qui sont pales, le trait devient clair', async () => {
  const { map, rt, etat } = await regions(SOMBRE);
  const th = rt.api.getTheme().charte; const legende = rt.api.getLegend('r');
  const attendu = legende.classes.map((k) => contraste(couleurVue(k.couleur, th.fond.plan.fond, 0.88), th.fond.plan.fond) < 3);
  assert.ok(attendu[0], 'la premiere classe se confond avec le fond sombre'); assert.equal(attendu[attendu.length - 1], false, 'la derniere se detache');
  for (const l of rt.api.getRows('r').lignes) if (l.classe >= 0) assert.equal(etat(l.code).pale, attendu[l.classe]);
  assert.equal(map.getLayer('bi-pale-r').paint['line-color'], th.donnees.selection);
  assert.ok(contraste(th.donnees.selection, th.fond.plan.fond) > 7, 'le trait se lit sur le fond sombre');
});
test('choroplethe : l\'etat `pale` suit un changement de charte', async () => {
  const { rt, etat } = await regions();
  const compte = () => rt.api.getRows('r').lignes.filter((l) => l.classe >= 0 && etat(l.code).pale).length;
  const avant = compte(); assert.ok(avant > 0, 'avant : des unites pales');
  rt.api.setTheme({ version: 'atlas-charte/0.1', base: 'contraste-eleve' }, { remplacer: true });
  assert.ok(compte() < avant, 'la charte a contraste eleve en compte moins : ' + compte() + ' contre ' + avant);
});

const pt = (id, t) => ({ type: 'Feature', id, geometry: { type: 'Point', coordinates: [2 + id * 0.1, 47] }, properties: { type: t } });
const decl = { kind: 'categorized', field: 'type', stops: [{ value: 'jaune', color: '#f0e442' }, { value: 'bleu', color: '#0072b2' }] };
test('cercles : le trait des couleurs pales est l\'encre, celui des autres reste le contour de la charte, la selection garde le sien', async () => {
  const map = carteSimulee(); const rt = attacher(map, { preferences: { contrasteEleve: false } });
  await rt.api.setScene({ title: 't', layers: [{ id: 'p', name: 'P', geometry_type: 'point', visuel: { type: 'cercles' }, style: { declarative: decl } }] }, { p: [pt(1, 'jaune'), pt(2, 'bleu')] });
  const ch = rt.api.getTheme().charte; const stroke = map.getLayer('bi-pts-p').paint['circle-stroke-color'];
  assert.equal(stroke[0], 'case'); assert.equal(stroke[2], ch.donnees.selection, 'selectionne : encre');
  const m = stroke[3]; assert.equal(m[0], 'match');
  assert.deepEqual(m.slice(2), ['jaune', ch.donnees.selection, 'bleu', ch.donnees.contour, ch.donnees.contour], 'jaune (1,3:1) : trait encre ; bleu (5,2:1) : contour de la charte ; autres : contour');
});
test('cercles d\'une couleur unique et polygones declaratifs : meme regle', async () => {
  const map = carteSimulee(); const rt = attacher(map, { preferences: { contrasteEleve: false } });
  await rt.api.setScene({ title: 't', layers: [
    { id: 'p', name: 'P', geometry_type: 'point', visuel: { type: 'cercles' }, style: { declarative: { kind: 'single', color: '#f0e442' } } },
    { id: 'q', name: 'Q', geometry_type: 'point', visuel: { type: 'cercles' }, style: { declarative: { kind: 'single', color: '#0072b2' } } },
    { id: 'g', name: 'G', geometry_type: 'polygon', style: { declarative: { kind: 'single', color: '#f0e442' } } },
  ] }, { p: [pt(1, 'a')], q: [pt(2, 'a')], g: [{ type: 'Feature', id: 1, geometry: { type: 'Polygon', coordinates: [[[2, 46], [3, 46], [3, 47], [2, 46]]] }, properties: {} }] });
  const ch = rt.api.getTheme().charte; const sel = ['boolean', ['feature-state', 'selected'], false];
  assert.deepEqual(map.getLayer('bi-pts-p').paint['circle-stroke-color'], ['case', sel, ch.donnees.selection, ch.donnees.selection]);
  assert.deepEqual(map.getLayer('bi-pts-q').paint['circle-stroke-color'], ['case', sel, ch.donnees.selection, ch.donnees.contour]);
  assert.deepEqual(map.getLayer('bi-line-g').paint['line-color'], ['case', sel, ch.donnees.selection, ch.donnees.selection], 'contour du polygone pale : encre');
});
