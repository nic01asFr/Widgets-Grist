// Marqueurs à formes (visuel `etats`) : les quatre formes, le contour par état, le chiffre (couleur et taille) et le glyphe « – ».
// Référence : la maquette de carte de SURFAC²E (états complet / partiel / audit / à vérifier), reçue le 10/10/2026.
// node --test tests/bi-etats-marqueurs.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { tracer, ajouterIcones, couleurTexteEtats, tailleTexte, FORMES } from '../lib/bi/icones-etats.js';
import { carteSimulee, MANIFESTE } from './aide-carte-bi.js';

/** Un contexte 2D qui consigne les appels de tracé. */
function ctxEnregistreur() {
  const appels = [];
  const ctx = new Proxy({}, { get: (_, nom) => (...a) => { appels.push([String(nom), ...a]); } });
  return { ctx, appels, de: (nom) => appels.filter((a) => a[0] === nom).length };
}

test('les quatre formes : cercle (un arc), carré aux coins arrondis (quatre arcs), losange (quatre sommets), triangle (trois)', () => {
  assert.deepEqual([...FORMES], ['cercle', 'carre', 'losange', 'triangle']);
  let e = ctxEnregistreur(); tracer(e.ctx, 'cercle', 1); assert.equal(e.de('arc'), 1);
  e = ctxEnregistreur(); tracer(e.ctx, 'carre', 1); assert.equal(e.de('arcTo'), 4, 'coins arrondis'); assert.equal(e.de('arc'), 0);
  e = ctxEnregistreur(); tracer(e.ctx, 'losange', 1); assert.equal(e.de('moveTo'), 1); assert.equal(e.de('lineTo'), 3); assert.equal(e.de('closePath'), 1);
  e = ctxEnregistreur(); tracer(e.ctx, 'triangle', 1); assert.equal(e.de('moveTo'), 1); assert.equal(e.de('lineTo'), 2); assert.equal(e.de('closePath'), 1);
});

/** Un canevas simulé qui consigne, à chaque `stroke()`, ce qui était posé : remplissage, couleur et épaisseur du trait. */
function poserCanevas() {
  const dessins = [];
  globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() {
    const etat = {};
    const cible = { getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), stroke() { dessins.push({ fond: etat.fillStyle, trait: etat.strokeStyle, epaisseur: etat.lineWidth }); } };
    return new Proxy(cible, { get: (t, k) => (k in t ? t[k] : (k in etat ? etat[k] : () => {})), set: (t, k, v) => { etat[k] = v; return true; } });
  } };
  return dessins;
}
const carteImages = () => { const images = new Map(); return { images, hasImage: (i) => images.has(i), addImage: (i, img) => images.set(i, img), removeImage: (i) => images.delete(i) }; };

// La spécification de la maquette de SURFAC²E : contour #26312B partout, épaisseur 2,5 ; « audit » : losange blanc au contour plus épais (3).
const ETATS = {
  complet: { forme: 'cercle', fill: '#448D60', stroke: '#26312B', texteCouleur: '#000000' },
  partiel: { forme: 'carre', fill: '#F7D05C', stroke: '#26312B', texteCouleur: '#000000' },
  audit: { forme: 'losange', fill: '#ffffff', stroke: '#26312B', largeurTrait: 3, texteCouleur: '#26312B' },
  verifier: { forme: 'triangle', fill: '#EF7757', stroke: '#26312B', texteCouleur: '#000000' },
};

test('une image par état, avec son remplissage, son contour et son épaisseur (2,5 par défaut, 3 pour « audit »)', () => {
  const dessins = poserCanevas();
  try {
    const carte = carteImages();
    const ids = ajouterIcones(carte, ETATS);
    assert.deepEqual(Object.keys(ids), ['complet', 'partiel', 'audit', 'verifier']);
    assert.equal(carte.images.size, 4);
    assert.deepEqual(dessins.map((d) => d.fond), ['#448D60', '#F7D05C', '#ffffff', '#EF7757']);
    assert.deepEqual(dessins.map((d) => d.trait), ['#26312B', '#26312B', '#26312B', '#26312B']);
    assert.deepEqual(dessins.map((d) => d.epaisseur), [2.5 * 2, 2.5 * 2, 3 * 2, 2.5 * 2].map((v) => v), 'trait à l\'échelle de l\'image (densité 2)');
  } finally { delete globalThis.OffscreenCanvas; }
});

test('couleur du chiffre : constante sans état qui en déclare une, sinon un `match` sur le champ d\'état', () => {
  assert.equal(couleurTexteEtats('etat', { a: { forme: 'cercle', fill: '#fff' } }, (c) => c, '#000000'), '#000000');
  const expr = couleurTexteEtats('etat', ETATS, (c) => c, '#000000');
  assert.equal(expr[0], 'match'); assert.deepEqual(expr[1], ['get', 'etat']);
  assert.ok(expr.includes('audit') && expr[expr.indexOf('audit') + 1] === '#26312B');
  assert.equal(expr[expr.length - 1], '#000000', 'repli : la couleur par défaut');
});

test('couleur du chiffre : les jetons de la charte se résolvent comme les autres couleurs', () => {
  const expr = couleurTexteEtats('etat', { a: { forme: 'cercle', fill: '#fff', texteCouleur: 'jeton:encre' } }, (c) => (c === 'jeton:encre' ? '#101820' : c), '#000000');
  assert.ok(expr.includes('#101820'));
});

test('taille du chiffre : la charte par défaut, un nombre, ou une règle « longue » (15, et 12 au-delà de 2 caractères)', () => {
  assert.equal(tailleTexte('pct', undefined, 12), 12);
  assert.equal(tailleTexte('pct', 15, 12), 15);
  const expr = tailleTexte('pct', { normal: 15, long: 12, seuil: 2 }, 11);
  assert.deepEqual(expr, ['case', ['>', ['length', ['to-string', ['coalesce', ['get', 'pct'], '–']]], 2], 12, 15]);
  assert.deepEqual(tailleTexte('pct', { normal: 15, long: 12 }, 11), ['case', ['>', ['length', ['to-string', ['coalesce', ['get', 'pct'], '–']]], 2], 12, 15], 'seuil de 2 par défaut');
  assert.equal(tailleTexte('pct', { normal: 'x' }, 11), 11, 'une règle illisible retombe sur la charte');
});

const scene = (extra = {}) => ({ title: 't', layers: [{ id: 'sites', name: 'Sites', geometry_type: 'point', visuel: { type: 'etats', champEtat: 'etat', texte: 'pct', etats: ETATS, ...extra }, style: { declarative: { kind: 'single', color: '#448d60' } } }] });
const site = (id, etat, pct) => ({ type: 'Feature', id, geometry: { type: 'Point', coordinates: [5.37 + id / 1000, 43.29] }, properties: { etat, ...(pct === undefined ? {} : { pct }) } });

test('composant : la couche de marqueurs porte l\'icône par état, le chiffre (« – » sans valeur), sa couleur par état et sa taille', async () => {
  poserCanevas();
  try {
    const carte = carteSimulee();
    const rt = attacher(carte);
    await rt.api.setScene(scene({ texteTaille: { normal: 15, long: 12, seuil: 2 } }), { sites: [site(1, 'complet', 92), site(2, 'audit'), site(3, 'verifier', 100)] });
    const l = carte.calques.find((c) => c.type === 'symbol');
    assert.ok(l, 'une couche de symboles');
    assert.equal(l.layout['icon-image'][0], 'match'); assert.deepEqual(l.layout['icon-image'][1], ['get', 'etat']);
    assert.deepEqual(l.layout['text-field'], ['to-string', ['coalesce', ['get', 'pct'], '–']], 'sans valeur : le tiret');
    assert.equal(l.paint['text-color'][0], 'match'); assert.ok(l.paint['text-color'].includes('#26312B'));
    assert.equal(l.layout['text-size'][0], 'case');
  } finally { delete globalThis.OffscreenCanvas; }
});

test('composant : sans réglage de chiffre, rien ne change (noir, taille de la charte)', async () => {
  poserCanevas();
  try {
    const carte = carteSimulee();
    const rt = attacher(carte);
    const sansReglage = { forme: 'cercle', fill: '#448D60' };
    await rt.api.setScene(scene({ etats: { complet: sansReglage } }), { sites: [site(1, 'complet', 50)] });
    const l = carte.calques.find((c) => c.type === 'symbol');
    assert.equal(l.paint['text-color'], '#000000');
    assert.equal(typeof l.layout['text-size'], 'number', 'la taille d\'étiquette de la charte');
  } finally { delete globalThis.OffscreenCanvas; }
});
