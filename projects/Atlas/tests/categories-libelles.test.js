import test from 'node:test';
import assert from 'node:assert/strict';
import { syncColorCategoriesFromFeatures } from '../lib/declarative-style.js';

const couche = (valeurs, categories) => ({
  geojson: { type: 'FeatureCollection', features: valeurs.map((v) => ({ type: 'Feature', properties: { Type: v }, geometry: { type: 'Point', coordinates: [5, 43] } })) },
  style: { symbolization: { color: { mode: 'categorized', field: 'Type', defaultColor: '#999999', categories } } },
});

test('le libelle d’une categorie survit a la relecture des entites', () => {
  // Un champ Ref arrive en identifiant : le libelle vient de la table de reference.
  const l = couche([1, 1, 2], [
    { value: 1, color: '#ff0000', label: 'Pont maçonnerie' },
    { value: 2, color: '#00ff00', label: 'Passerelle bois' },
  ]);
  const sym = syncColorCategoriesFromFeatures(l);
  assert.deepEqual(sym.categories.map((c) => [c.value, c.label, c.color]),
    [['1', 'Pont maçonnerie', '#ff0000'], ['2', 'Passerelle bois', '#00ff00']], 'valeurs normalisees en texte');
});

test('une valeur nouvelle n’invente pas de libelle', () => {
  const l = couche([1, 3], [{ value: 1, color: '#ff0000', label: 'Pont maçonnerie' }]);
  const sym = syncColorCategoriesFromFeatures(l);
  assert.equal(sym.categories.find((c) => c.value === '3').label, undefined);
});
