/*
 * carte-traceur.test.js — l'adaptateur de terra-draw publie un import nu.
 *
 * Atlas le résout par un `importmap` posé dans sa page ; le formulaire vit
 * dans une page qu'il n'a pas écrite. Il pointe donc l'import lui-même, sur
 * le module qu'il vient de charger.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Carte = require('../shared/carte-geometrie.js');
const CIBLE = 'https://cdn.jsdelivr.net/npm/terra-draw@1.35.0/dist/terra-draw.module.js';

describe('résoudre un import nu', () => {
  it('remplace le nom de paquet par une adresse, telle que l’adaptateur l’écrit', () => {
    const vrai = 'import{TerraDrawExtend as e}from"terra-draw";function t(){}';
    const out = Carte.resoudreImportNu(vrai, 'terra-draw', CIBLE);
    assert.ok(out.includes('from"' + CIBLE + '"'));
    assert.ok(!out.includes('from"terra-draw"'));
  });

  it('accepte les apostrophes et les espaces', () => {
    const out = Carte.resoudreImportNu("import {X} from 'terra-draw';", 'terra-draw', CIBLE);
    assert.ok(out.includes("from '" + CIBLE + "'"));
  });

  it('ne touche pas à un nom qui commence pareil', () => {
    const src = 'import{A}from"terra-draw-maplibre-gl-adapter";';
    assert.equal(Carte.resoudreImportNu(src, 'terra-draw', CIBLE), src);
  });

  it('laisse une adresse déjà résolue tranquille', () => {
    const src = 'import{A}from"https://autre/terra-draw.js";';
    assert.equal(Carte.resoudreImportNu(src, 'terra-draw', CIBLE), src);
  });
});

describe('une forme en cours de tracé n’est pas une forme', () => {
  it('une ligne demande deux sommets', () => {
    assert.equal(Carte.geometrieFormee({ type: 'LineString', coordinates: [[5, 43]] }), false);
    assert.equal(Carte.geometrieFormee({ type: 'LineString', coordinates: [[5, 43], [6, 44]] }), true);
  });

  it('une surface demande un anneau fermé', () => {
    assert.equal(Carte.geometrieFormee({ type: 'Polygon', coordinates: [[[5, 43], [6, 44], [5, 43]]] }), false);
    assert.equal(
      Carte.geometrieFormee({ type: 'Polygon', coordinates: [[[5, 43], [6, 44], [6, 43], [5, 43]]] }), true);
  });

  it('un point se suffit à lui-même', () => {
    assert.equal(Carte.geometrieFormee({ type: 'Point', coordinates: [5, 43] }), true);
  });

  it('rien n’est pas une forme', () => {
    assert.equal(Carte.geometrieFormee(null), false);
  });
});
