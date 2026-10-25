/**
 * Le tracé d'une couche de lignes déclaré par l'hôte : largeur fixe ou suivant un nombre, opacité, bouts arrondis ; sans réglage, 3 px comme avant.
 * node --test projects/Atlas/tests/bi-lignes-trace.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { traceLigneDeclare } from '../lib/bi/style-polygone.js';
import { carteSimulee } from './aide-carte-bi.js';

const ligne = (id, props) => ({ type: 'Feature', id, geometry: { type: 'LineString', coordinates: [[1.67, 48.11], [1.68, 48.12]] }, properties: props });
const COUCHE = (visuel) => ({ id: 'rues', name: 'Rues', geometry_type: 'line', cle: 'ref', visuel, style: { declarative: { kind: 'categorized', field: 'etat', stops: [{ value: 'a', color: '#2a9d8f' }, { value: 'b', color: '#e76f51' }] } } });

test('traceLigneDeclare : largeur bornée de 0,5 à 12, une largeur qui suit un nombre, opacité de 0 à 1 ; le reste est écarté', () => {
  assert.deepEqual(traceLigneDeclare({}), { largeur: 3, opacite: null, tirets: null });
  assert.deepEqual(traceLigneDeclare({ largeur: 99, opacite: 4 }), { largeur: 12, opacite: 1, tirets: null });
  assert.deepEqual(traceLigneDeclare({ largeur: 0, opacite: -1 }), { largeur: 0.5, opacite: 0, tirets: null });
  assert.deepEqual(traceLigneDeclare({ largeur: { champ: 'debit', min: 0, max: 100, lMin: 1, lMax: 6 } }).largeur, { champ: 'debit', min: 0, max: 100, lMin: 1, lMax: 6 });
  for (const mauvais of ['x', null, [], {}, { champ: '' }, { champ: 'd', min: 5, max: 5 }, { champ: 'd', min: 'a', max: 9 }]) assert.equal(traceLigneDeclare({ largeur: mauvais }).largeur, 3, JSON.stringify(mauvais));
  assert.equal(traceLigneDeclare({ opacite: 'beaucoup' }).opacite, null);
});

test('une couche de lignes sans réglage garde ses 3 px ; avec réglages, le calque porte la largeur, l\'opacité et les bouts arrondis ; la sélection grossit', async () => {
  const carte = carteSimulee(); const rt = attacher(carte);
  await rt.api.setScene({ layers: [COUCHE({})] }, { rues: [ligne(1, { ref: 'r1', etat: 'a' })] });
  let l = carte.calques.find((c) => c.id === 'bi-line-rues'); assert.ok(l); assert.deepEqual(l.paint['line-width'], ['case', ['boolean', ['feature-state', 'selected'], false], ['+', 3, 3], ['boolean', ['feature-state', 'highlight'], false], ['+', 3, 2], 3]);
  assert.equal(l.paint['line-opacity'], undefined);
  await rt.api.setScene({ layers: [COUCHE({ largeur: 5, opacite: 0.7 })] }, { rues: [ligne(1, { ref: 'r1', etat: 'a' })] });
  l = carte.calques.find((c) => c.id === 'bi-line-rues');
  assert.equal(l.paint['line-width'][5], 5, 'largeur de base'); assert.deepEqual(l.paint['line-width'][2], ['+', 5, 3]); assert.equal(l.paint['line-opacity'], 0.7); assert.equal(l.layout['line-cap'], 'round'); assert.equal(l.layout['line-join'], 'round');
});

test('une largeur qui suit un champ est une interpolation sur ce champ', async () => {
  const carte = carteSimulee(); const rt = attacher(carte);
  await rt.api.setScene({ layers: [COUCHE({ largeur: { champ: 'debit', min: 0, max: 200, lMin: 1, lMax: 8 } })] }, { rues: [ligne(1, { ref: 'r1', etat: 'b', debit: 150 })] });
  const l = carte.calques.find((c) => c.id === 'bi-line-rues'); const base = l.paint['line-width'][5];
  assert.equal(base[0], 'interpolate'); assert.deepEqual(base.slice(3), [0, 1, 200, 8]); assert.deepEqual(base[2], ['to-number', ['get', 'debit'], 0]);
});
