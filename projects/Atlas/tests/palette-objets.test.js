/**
 * Tests de la recherche d'objets dans la palette.
 * node --test "projects/Atlas/tests/palette-objets.test.js"
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normaliser, nomObjet, objetsPourPalette } from '../lib/palette-objets.js';

const point = (properties) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [5.37, 43.29] }, properties });
const ARRETS = {
  id: 'l-arrets', name: 'Arrêts bus', visible: true,
  geojson: { type: 'FeatureCollection', features: [
    point({ name: 'Barbusse Colbert', bus: 'yes' }),
    point({ name: 'Colbert', bus: 'yes' }),
    point({ bus: 'yes' }),
    point({ name: 'Canebière Bourse' }),
  ] },
};

describe('normaliser', () => {
  it('ignore la casse et les accents', () => {
    assert.equal(normaliser('Canebière'), 'canebiere');
    assert.equal(normaliser(null), '');
  });
});

describe('nomObjet', () => {
  it('prend le premier champ de nom renseigné', () => {
    assert.equal(nomObjet({ nom: 'Mairie', name: '' }), 'Mairie');
    assert.equal(nomObjet({ name: '  ', ref: 'A12' }), 'A12');
  });

  it('un nombre est un nom ; un objet ne l’est pas', () => {
    assert.equal(nomObjet({ ref: 42 }), '42');
    assert.equal(nomObjet({ name: { fr: 'x' } }), null);
  });

  it('pas de nom, pas de résultat', () => {
    assert.equal(nomObjet({ bus: 'yes' }), null);
    assert.equal(nomObjet(null), null);
  });
});

describe('objetsPourPalette', () => {
  it('trouve un objet par son nom, sans accent ni casse', () => {
    const r = objetsPourPalette([ARRETS], 'canebiere');
    assert.deepEqual(r, [{ coucheId: 'l-arrets', couche: 'Arrêts bus', idx: 3, nom: 'Canebière Bourse' }]);
  });

  it('les noms qui commencent par la requête passent devant', () => {
    const r = objetsPourPalette([ARRETS], 'colb');
    assert.deepEqual(r.map((o) => o.nom), ['Colbert', 'Barbusse Colbert']);
  });

  it('ne cherche pas dans les couches masquées', () => {
    assert.deepEqual(objetsPourPalette([{ ...ARRETS, visible: false }], 'colbert'), []);
  });

  it('attend deux caractères, et borne la liste', () => {
    assert.deepEqual(objetsPourPalette([ARRETS], 'c'), []);
    assert.equal(objetsPourPalette([ARRETS], 'er', { max: 2 }).length, 2);
  });

  it('une couche sans entités locales ne gêne pas', () => {
    const distante = { id: 'd', name: 'BD TOPO', visible: true, geojson: 'https://exemple.test/bati' };
    assert.deepEqual(objetsPourPalette([distante, ARRETS], 'colbert').length, 2);
  });
});
