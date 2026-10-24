// Volume d'une couche de polygones (`visuel.extrusion`) et étiquette d'une couche de points (`visuel.etiquette`) : déclarations lues, bornées, ignorées si invalides ;
// le volume se filtre comme le reste ; l'étiquette est une couche à part.
// node --test tests/bi-extrusion-etiquette.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { extrusionDeclaree, etiquetteDeclaree } from '../lib/bi/style-polygone.js';
import { carteSimulee } from './aide-carte-bi.js';

const carre = (x, y, t = 0.001) => ({ type: 'Polygon', coordinates: [[[x, y], [x + t, y], [x + t, y + t], [x, y + t], [x, y]]] });
const bati = (id, h, usage, x) => ({ type: 'Feature', id, properties: { hauteur: h, usage, nom: 'Bâtiment ' + id }, geometry: carre(5.3 + x * 0.01, 43.3) });
const pt = (id, nom, x) => ({ type: 'Feature', id, properties: { nom, type: id % 2 ? 'a' : 'b' }, geometry: { type: 'Point', coordinates: [5.3 + x * 0.01, 43.3] } });
const filtres = (map) => { const j = []; map.setFilter = (id, f) => j.push([id, f]); return j; };
const couche = (rt, map, fin) => map.calques.find((l) => l.id.endsWith(fin));

test('extrusionDeclaree : champ requis, facteur et plafond bornés, valeurs invalides ramenées au défaut', () => {
  assert.deepEqual(extrusionDeclaree({ champ: 'hauteur' }), { champ: 'hauteur', facteur: 1, max: 500 });
  assert.deepEqual(extrusionDeclaree({ champ: ' h ', facteur: 3, max: 120 }), { champ: 'h', facteur: 3, max: 120 });
  assert.deepEqual(extrusionDeclaree({ champ: 'h', facteur: 0, max: 99999 }), { champ: 'h', facteur: 1, max: 500 });
  for (const mauvais of [undefined, null, true, 12, 'hauteur', [], {}, { champ: '' }, { champ: 3 }]) assert.equal(extrusionDeclaree(mauvais), null);
});

test('polygones avec `visuel.extrusion` : un fill-extrusion à la hauteur du champ, le contour reste au sol, et les contrôles le filtrent', async () => {
  const map = carteSimulee(); const j = filtres(map); const rt = attacher(map);
  await rt.api.setScene({ layers: [{ id: 'bati', name: 'Bati', geometry_type: 'polygon', visuel: { extrusion: { champ: 'hauteur', facteur: 2, max: 80 } },
    style: { declarative: { kind: 'single', color: '#3366aa' } }, controls: [{ id: 'c_usage', type: 'select', field: 'usage', active: true, values: ['maison'] }] }] },
  { bati: [bati(1, 6, 'maison', 0), bati(2, 12, 'atelier', 1)] });
  const ext = couche(rt, map, 'fill-bati');
  assert.equal(ext.type, 'fill-extrusion');
  assert.deepEqual(ext.paint['fill-extrusion-height'], ['min', 80, ['*', 2, ['max', 0, ['to-number', ['get', 'hauteur'], 0]]]]);
  assert.equal(ext.paint['fill-extrusion-base'], 0);
  const contour = couche(rt, map, 'line-bati');
  assert.equal(contour.type, 'line', 'le contour reste posé au sol, pour la sélection');
  assert.deepEqual(contour.paint['line-opacity'], ['case', ['boolean', ['feature-state', 'selected'], false], 1, ['boolean', ['feature-state', 'highlight'], false], 1, 0], 'invisible au repos : il traverserait les faces du volume');
  assert.ok(j.some(([id, f]) => id === ext.id && f), 'le contrôle actif filtre aussi le volume');
  assert.deepEqual(rt.api.getRows('bati').lignes.map((l) => l.id), [1]);
});

test('polygones sans extrusion, ou extrusion invalide : le remplissage plat d\'avant', async () => {
  for (const extrusion of [undefined, { champ: '' }, true, 'hauteur']) {
    const map = carteSimulee(); const rt = attacher(map);
    await rt.api.setScene({ layers: [{ id: 'bati', name: 'Bati', geometry_type: 'polygon', visuel: extrusion === undefined ? {} : { extrusion } }] }, { bati: [bati(1, 6, 'maison', 0)] });
    assert.equal(couche(rt, map, 'fill-bati').type, 'fill', JSON.stringify(extrusion));
    assert.equal(couche(rt, map, 'line-bati').paint['line-opacity'], undefined, 'sans volume, le contour est celui d avant');
  }
});

test('points avec `visuel.etiquette` : une couche de texte à part, sous la marque, filtrée comme elle ; sans étiquette, rien n\'est ajouté', async () => {
  const map = carteSimulee(); const j = filtres(map); const rt = attacher(map);
  await rt.api.setScene({ layers: [{ id: 'sites', name: 'Sites', geometry_type: 'point', visuel: { etiquette: { champ: 'nom', taille: 13, zoomMin: 12 } },
    controls: [{ id: 'c_type', type: 'select', field: 'type', active: true, values: ['a'] }] }] }, { sites: [pt(1, 'Alpha', 0), pt(2, 'Bravo', 1), pt(3, 'Charlie', 2)] });
  const marque = couche(rt, map, 'pts-sites'), etiq = couche(rt, map, 'etiq-sites');
  assert.equal(marque.type, 'circle', 'la marque est une couche de cercles : une police en erreur ne l\'emporte pas');
  assert.equal(etiq.type, 'symbol'); assert.equal(etiq.minzoom, 12);
  assert.deepEqual(etiq.layout['text-field'], ['to-string', ['coalesce', ['get', 'nom'], '']]); assert.equal(etiq.layout['text-size'], 13);
  assert.equal(etiq.layout['text-anchor'], 'top'); assert.equal(etiq.layout['text-optional'], true);
  assert.ok(j.some(([id, f]) => id === etiq.id && f), 'le filtre des contrôles s\'applique à l\'étiquette');
  assert.deepEqual(rt.api.getRows('sites').lignes.map((l) => l.id), [1, 3]);
  const map2 = carteSimulee(); const rt2 = attacher(map2);
  await rt2.api.setScene({ layers: [{ id: 'sites', name: 'Sites', geometry_type: 'point' }] }, { sites: [pt(1, 'Alpha', 0)] });
  assert.equal(couche(rt2, map2, 'etiq-sites'), undefined);
});

test('une étiquette invalide est ignorée : zoomMin hors bornes ramené, champ absent = pas de couche', async () => {
  assert.equal(etiquetteDeclaree({ taille: 12 }), null);
  const map = carteSimulee(); const rt = attacher(map);
  await rt.api.setScene({ layers: [{ id: 's', name: 's', geometry_type: 'point', visuel: { etiquette: { champ: 'nom', zoomMin: 99 } } }] }, { s: [pt(1, 'A', 0)] });
  assert.equal(couche(rt, map, 'etiq-s').minzoom, 22);
  const map2 = carteSimulee(); const rt2 = attacher(map2);
  await rt2.api.setScene({ layers: [{ id: 's', name: 's', geometry_type: 'point', visuel: { etiquette: { champ: '' } } }] }, { s: [pt(1, 'A', 0)] });
  assert.equal(couche(rt2, map2, 'etiq-s'), undefined);
});
