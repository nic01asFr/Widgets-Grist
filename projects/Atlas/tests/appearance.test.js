/**
 * Tests Atlas v7 — apparence des couches : opacité déclarative, contour,
 * rendu surfacique, persistance des réglages.
 * node --test projects/Atlas/tests/appearance.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { opacityFnFromDeclarative, applyDeclarativeToLayer } from '../lib/declarative-style.js';
import { layerPrefsPayload, mergeAppearancePrefs, applyLayerPrefsBinding } from '../lib/manifest-binding.js';
import { rowsToGeoJSON } from '../lib/grist-rows.js';

describe('opacityFnFromDeclarative', () => {
  it('null quand aucun stop ne déclare d\'opacité', () => {
    const fn = opacityFnFromDeclarative({
      kind: 'graduated', field: 'score', stops: [{ lower: 0, upper: 1, color: '#fff' }],
    });
    assert.equal(fn, null);
  });

  it('gradué — opacité de la classe correspondante', () => {
    const fn = opacityFnFromDeclarative({
      kind: 'graduated',
      field: 'score',
      stops: [
        { lower: 0, upper: 0.5, color: '#aaa', opacity: 0.3 },
        { lower: 0.5, upper: 1, color: '#bbb', opacity: 0.9 },
      ],
    });
    assert.equal(fn({ score: 0.2 }), 0.3);
    assert.equal(fn({ score: 0.8 }), 0.9);
  });

  it('catégorisé — opacité par valeur', () => {
    const fn = opacityFnFromDeclarative({
      kind: 'categorized',
      field: 'usage',
      stops: [
        { value: 'Residential', color: '#aaa', opacity: 0.85 },
        { value: 'Autre', color: '#bbb', opacity: 0.25 },
      ],
    });
    assert.equal(fn({ usage: 'Residential' }), 0.85);
    assert.equal(fn({ usage: 'Autre' }), 0.25);
  });

  it('single — opacité constante', () => {
    const fn = opacityFnFromDeclarative({ kind: 'single', color: '#abc', opacity: 0.42 });
    assert.equal(fn({}), 0.42);
  });

  it('valeur hors classes — null, l\'appelant garde son défaut', () => {
    const fn = opacityFnFromDeclarative({
      kind: 'categorized', field: 'usage',
      stops: [{ value: 'A', color: '#aaa', opacity: 0.5 }],
    });
    assert.equal(fn({ usage: 'inconnu' }), null);
  });
});

describe('_fill_opacity porté par les entités', () => {
  const layerMeta = {
    geomType: 'Point',
    opacityFn: (row) => (row.usage === 'fort' ? 0.9 : null),
  };

  it('posé quand le style déclaratif le définit', () => {
    const gj = rowsToGeoJSON([{ id: 1, latitude: 43, longitude: 5, usage: 'fort' }], layerMeta, null);
    assert.equal(gj.features[0].properties._fill_opacity, 0.9);
  });

  it('absent sinon — le rendu retombe sur l\'opacité de couche', () => {
    const gj = rowsToGeoJSON([{ id: 2, latitude: 43, longitude: 5, usage: 'faible' }], layerMeta, null);
    assert.equal('_fill_opacity' in gj.features[0].properties, false);
  });

  it('une valeur portée par la ligne reste prioritaire', () => {
    const gj = rowsToGeoJSON(
      [{ id: 3, latitude: 43, longitude: 5, usage: 'fort', _fill_opacity: 0.1 }],
      layerMeta,
      null
    );
    assert.equal(gj.features[0].properties._fill_opacity, 0.1);
  });
});

describe('persistance des réglages d\'apparence', () => {
  it('layerPrefsPayload embarque polygonMode', () => {
    const payload = layerPrefsPayload({
      color: '#123456',
      style: { mode: 'mapbox', polygonMode: 'extruded', symbolization: { opacity: 0.4 } },
    });
    assert.equal(payload.polygonMode, 'extruded');
    assert.equal(payload.symbolization.opacity, 0.4);
  });

  it('mergeAppearancePrefs n\'écrase pas les couleurs', () => {
    const layer = { style: { symbolization: { color: { mode: 'categorized', field: 'usage' } } } };
    mergeAppearancePrefs(layer, {
      opacity: 0.7,
      stroke: { enabled: false, mode: 'fixed', color: '#ff0000', width: 3 },
      extrusion: { base: 12 },
      label: { size: 18, color: '#000000' },
    });
    const sym = layer.style.symbolization;
    assert.equal(sym.color.mode, 'categorized', 'la symbolisation couleur est préservée');
    assert.equal(sym.opacity, 0.7);
    assert.equal(sym.stroke.width, 3);
    assert.equal(sym.extrusion.base, 12);
    assert.equal(sym.label.size, 18);
  });

  it('un déclaratif restaure aussi l\'apparence (et pas seulement les couleurs)', () => {
    const layer = { id: 'l1', color: '#888', geometryType: 'Polygon', style: { mode: 'mapbox' }, _fields: [] };
    applyLayerPrefsBinding(layer, {
      style: {
        declarative: { kind: 'single', color: '#00ff00' },
        polygonMode: 'extruded',
        symbolization: { opacity: 0.33, stroke: { enabled: true, mode: 'fixed', color: '#111', width: 2 } },
      },
    });
    assert.equal(layer.style.polygonMode, 'extruded');
    assert.equal(layer.style.symbolization.opacity, 0.33);
    assert.equal(layer.style.symbolization.stroke.width, 2);
  });
});

describe('classes graduées bornées', () => {
  const decl = {
    kind: 'graduated', field: 'nb_bat',
    stops: [
      { lower: 1, upper: 2, color: '#fed98e' },
      { lower: 3, upper: 4, color: '#fe9929' },
      { lower: 5, upper: 10, color: '#d95f0e' },
      { lower: 11, upper: 134, color: '#993404' },
    ],
  };
  const layerAvec = (valeurs) => ({
    id: 'g', color: '#440154', geometryType: 'Polygon', _fields: [{ name: 'nb_bat' }],
    geojson: { type: 'FeatureCollection', features: valeurs.map((v) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [9, 39] }, properties: { nb_bat: v } })) },
  });

  it('respecte les bornes au lieu d\'étaler de min à max', () => {
    const l = layerAvec([1, 2, 3, 6, 40, 134]);
    applyDeclarativeToLayer(l, decl);
    const c = l.geojson.features.map((f) => f.properties._fill_color);
    // Un étalement linéaire sur [1,134] mettrait 1,2,3,6 ET 40 dans la 1re classe.
    assert.deepEqual(c, ['#fed98e', '#fed98e', '#fe9929', '#d95f0e', '#993404', '#993404']);
  });

  it('entité sans valeur numérique — couleur de repli', () => {
    const l = layerAvec(['', 5]);
    applyDeclarativeToLayer(l, decl);
    assert.equal(l.geojson.features[0].properties._fill_color, '#440154');
    assert.equal(l.geojson.features[1].properties._fill_color, '#d95f0e');
  });

  it('sans bornes déclarées — étalement linéaire conservé', () => {
    const l = layerAvec([0, 100]);
    applyDeclarativeToLayer(l, { kind: 'graduated', field: 'nb_bat',
      stops: [{ color: '#000000' }, { color: '#ffffff' }] });
    assert.deepEqual(l.geojson.features.map((f) => f.properties._fill_color), ['#000000', '#ffffff']);
  });
});

describe('retour à une couleur unie — le récit repasse en vue neutre', () => {
  const couche = () => ({
    id: 'c', color: '#888888', geometryType: 'Polygon', style: {},
    _fields: [{ name: 'v', gType: 'Numeric' }, { name: 'fam', gType: 'Text' }],
    geojson: {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { v: 5, fam: 'A' }, geometry: null },
        { type: 'Feature', properties: { v: 80, fam: 'B' }, geometry: null },
      ],
    },
  });

  it('une couleur unie efface la peinture de la graduation précédente', () => {
    // Le paint MapLibre lit `['coalesce', ['get','_fill_color'], couleur]` :
    // tant que `_fill_color` survit, la couleur unie déclarée n'a aucun effet.
    // Une étape revenant à une vue neutre gardait donc l'aspect de la
    // thématique qui la précédait.
    const l = couche();
    applyDeclarativeToLayer(l, {
      kind: 'graduated', field: 'v',
      stops: [{ lower: 0, upper: 50, color: '#111111' }, { lower: 50, upper: 100, color: '#999999' }],
    });
    assert.deepEqual(l.geojson.features.map((f) => f.properties._fill_color), ['#111111', '#999999']);

    applyDeclarativeToLayer(l, { kind: 'single', color: '#e6ded2' });
    assert.deepEqual(l.geojson.features.map((f) => f.properties._fill_color), ['#e6ded2', '#e6ded2']);
  });

  it('et celle d’une catégorisation', () => {
    const l = couche();
    applyDeclarativeToLayer(l, {
      kind: 'categorized', field: 'fam',
      stops: [{ value: 'A', color: '#aa0000' }, { value: 'B', color: '#00aa00' }],
    });
    assert.notEqual(l.geojson.features[0].properties._fill_color,
                    l.geojson.features[1].properties._fill_color);

    applyDeclarativeToLayer(l, { kind: 'single', color: '#123456' });
    assert.deepEqual(l.geojson.features.map((f) => f.properties._fill_color), ['#123456', '#123456']);
  });

  it('sans entités, l’unie se contente de régler la symbolisation', () => {
    // Couche distante : rien à repeindre, et surtout rien à casser.
    const l = { id: 'd', color: '#888888', geometryType: 'Polygon', style: {}, geojson: 'https://h.fr/x.geojson' };
    const sym = applyDeclarativeToLayer(l, { kind: 'single', color: '#abcdef' });
    assert.equal(sym.color.mode, 'single');
    assert.equal(sym.color.value, '#abcdef');
  });
});
