// Polygones de l'hôte (parcelles, emprises de bâtiments) : couleur par `style.declarative` (clé `kind`, pas `type`), opacité du remplissage,
// contour réglable par `visuel.contour` { couleur, largeur, tirets }. Sans réglage, rien ne change.
// node --test tests/bi-polygones-style.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { opaciteDeclaree, contourPolygone } from '../lib/bi/style-polygone.js';
import { carteSimulee } from './aide-carte-bi.js';

test('opaciteDeclaree : un nombre de 0 à 1, sinon rien', () => {
  assert.equal(opaciteDeclaree({ opacity: 0.15 }), 0.15);
  assert.equal(opaciteDeclaree({ opacity: 0 }), 0);
  assert.equal(opaciteDeclaree({ opacity: 1 }), 1);
  for (const d of [null, undefined, {}, { opacity: -0.1 }, { opacity: 1.2 }, { opacity: NaN }, { opacity: '0.5' }, { opacity: null }]) assert.equal(opaciteDeclaree(d), null, JSON.stringify(d));
});

test('contourPolygone : couleur (jeton résolu), largeur bornée, tirets valides ; le reste est ignoré', () => {
  assert.equal(contourPolygone(undefined), null);
  assert.equal(contourPolygone(null), null);
  assert.deepEqual(contourPolygone({ couleur: '#26312B', largeur: 1.5, tirets: [4, 2] }), { couleur: '#26312B', largeur: 1.5, tirets: [4, 2] });
  assert.deepEqual(contourPolygone({ couleur: 'jeton:encre' }, (c) => (c === 'jeton:encre' ? '#101820' : c)), { couleur: '#101820', largeur: 1, tirets: null });
  assert.deepEqual(contourPolygone({ largeur: 0 }), { couleur: null, largeur: 1, tirets: null }, 'largeur nulle : la valeur par défaut');
  assert.deepEqual(contourPolygone({ largeur: 99 }), { couleur: null, largeur: 1, tirets: null }, 'largeur démesurée : la valeur par défaut');
  assert.deepEqual(contourPolygone({ tirets: [4] }), { couleur: null, largeur: 1, tirets: null }, 'au moins deux longueurs');
  assert.deepEqual(contourPolygone({ tirets: [4, -1] }), { couleur: null, largeur: 1, tirets: null });
  assert.deepEqual(contourPolygone({ tirets: 'tireté' }), { couleur: null, largeur: 1, tirets: null });
  assert.deepEqual(contourPolygone({ couleur: '' }), { couleur: null, largeur: 1, tirets: null });
});

const poly = (id, x, y, props = {}) => ({ type: 'Feature', id, properties: props, geometry: { type: 'Polygon', coordinates: [[[x, y], [x + 0.001, y], [x + 0.001, y + 0.001], [x, y + 0.001], [x, y]]] } });
const scene = (layer) => ({ title: 't', layers: [{ id: 'p', name: 'P', geometry_type: 'polygon', ...layer }] });
async function monter(layer) {
  const carte = carteSimulee();
  const rt = attacher(carte);
  await rt.api.setScene(scene(layer), { p: [poly(1, 5.37, 43.29, { etat: 'complet' }), poly(2, 5.372, 43.29, { etat: 'audit' })] });
  return { rt, carte, remplissage: carte.calques.find((c) => c.type === 'fill'), contour: carte.calques.find((c) => c.type === 'line') };
}

test('sans réglage : le remplissage et le contour d\'avant', async () => {
  const { remplissage, contour } = await monter({ style: { declarative: { kind: 'single', color: '#5062A7' } } });
  assert.equal(remplissage.paint['fill-color'], '#5062A7');
  assert.deepEqual(remplissage.paint['fill-opacity'], ['case', ['boolean', ['feature-state', 'selected'], false], 0.95, 0.72]);
  assert.equal(contour.paint['line-dasharray'], undefined);
  assert.equal(contour.paint['line-width'][3], 1);
});

test('la couleur vient de `kind`, pas de `type` : `type` retombe sur la couleur par défaut de la charte', async () => {
  const bon = await monter({ style: { declarative: { kind: 'single', color: '#5062A7' } } });
  const mauvais = await monter({ style: { declarative: { type: 'single', color: '#5062A7' } } });
  assert.equal(bon.remplissage.paint['fill-color'], '#5062A7');
  assert.notEqual(mauvais.remplissage.paint['fill-color'], '#5062A7');
});

test('une couleur par état (kind categorized) : une expression `match` sur le champ d\'état', async () => {
  const { remplissage } = await monter({ style: { declarative: { kind: 'categorized', field: 'etat', stops: [{ value: 'complet', color: '#448D60' }, { value: 'audit', color: '#ffffff' }] } } });
  assert.equal(remplissage.paint['fill-color'][0], 'match');
  assert.ok(remplissage.paint['fill-color'].includes('#448D60') && remplissage.paint['fill-color'].includes('#ffffff'));
});

test('opacité déclarée : le remplissage est à cette opacité, sélectionné ou non', async () => {
  const { remplissage } = await monter({ style: { declarative: { kind: 'single', color: '#5062A7', opacity: 0.15 } } });
  assert.equal(remplissage.paint['fill-opacity'], 0.15);
});

test('opacité invalide : celle d\'avant', async () => {
  const { remplissage } = await monter({ style: { declarative: { kind: 'single', color: '#5062A7', opacity: 3 } } });
  assert.equal(remplissage.paint['fill-opacity'][0], 'case');
});

test('contour réglé : couleur, largeur et tirets ; la sélection garde sa couleur et épaissit le trait', async () => {
  const { contour } = await monter({ style: { declarative: { kind: 'single', color: '#5062A7', opacity: 0.15 } }, visuel: { contour: { couleur: '#26312B', largeur: 1.5, tirets: [4, 2] } } });
  assert.deepEqual(contour.paint['line-dasharray'], [4, 2]);
  const couleur = contour.paint['line-color'];
  assert.equal(couleur[0], 'case'); assert.equal(couleur[3], '#26312B', 'hors sélection : la couleur demandée');
  const largeur = contour.paint['line-width'];
  assert.equal(largeur[3], 1.5); assert.ok(largeur[2] >= 3 && largeur[2] > largeur[3], 'sélectionné : plus épais');
});

test('contour plein réglé sans tirets : pas de `line-dasharray`', async () => {
  const { contour } = await monter({ visuel: { contour: { couleur: '#26312B' } } });
  assert.equal(contour.paint['line-dasharray'], undefined);
  assert.equal(contour.paint['line-color'][3], '#26312B');
});

test('le choroplèthe sans admin reste refusé : le contour réglé n\'y change rien', async () => {
  const carte = carteSimulee();
  const rt = attacher(carte);
  const r = await rt.api.setScene(scene({ visuel: { type: 'choroplethe', champ: 'v', contour: { couleur: '#000' } } }), { p: [poly(1, 5.37, 43.29)] });
  assert.match(r._erreurs.p, /choroplethe/);
});
