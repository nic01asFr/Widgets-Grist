import test from 'node:test';
import assert from 'node:assert/strict';
import { lireWkt, ecrireWkt, estWkt } from '../lib/wkt.js';

test('les formes rencontrees dans un document reel se lisent', () => {
  // Debut reel d'une cellule de 28 000 caracteres (boucles de randonnee).
  const ml = lireWkt('MULTILINESTRING ((5.64345188412329 43.2920003280899,5.64381718375061 43.2918763117016,5.6440 43.2917))');
  assert.equal(ml.type, 'MultiLineString');
  assert.deepEqual(ml.coordinates[0][0], [5.64345188412329, 43.2920003280899], 'x = lon, y = lat, precision gardee');
  const p = lireWkt('POLYGON ((5.6177 43.1594, 5.6176 43.1595, 5.6175 43.1594, 5.6177 43.1594))');
  assert.equal(p.type, 'Polygon');
  assert.equal(p.coordinates[0].length, 4);
});

test('toutes les familles, avec trous et parties multiples', () => {
  assert.deepEqual(lireWkt('POINT (5.4 43.3)'), { type: 'Point', coordinates: [5.4, 43.3] });
  assert.deepEqual(lireWkt('LINESTRING (0 0, 1 1, 2 0)').coordinates, [[0, 0], [1, 1], [2, 0]]);
  const troue = lireWkt('POLYGON ((0 0, 4 0, 4 4, 0 4, 0 0), (1 1, 2 1, 2 2, 1 1))');
  assert.equal(troue.coordinates.length, 2, 'un trou');
  assert.deepEqual(lireWkt('MULTIPOINT ((1 2), (3 4))').coordinates, [[1, 2], [3, 4]]);
  assert.deepEqual(lireWkt('MULTIPOINT (1 2, 3 4)').coordinates, [[1, 2], [3, 4]], 'sans parentheses internes');
  const mp = lireWkt('MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0)), ((5 5, 6 5, 6 6, 5 5), (5.2 5.2, 5.4 5.2, 5.4 5.4, 5.2 5.2)))');
  assert.equal(mp.type, 'MultiPolygon');
  assert.equal(mp.coordinates.length, 2);
  assert.equal(mp.coordinates[1].length, 2);
});

test('variantes d’ecriture : casse, espaces, SRID, Z et M', () => {
  assert.deepEqual(lireWkt('  point(5.4   43.3) ').coordinates, [5.4, 43.3]);
  assert.deepEqual(lireWkt('SRID=4326;POINT(5.4 43.3)').coordinates, [5.4, 43.3]);
  assert.deepEqual(lireWkt('POINT Z (5.4 43.3 120)').coordinates, [5.4, 43.3], 'Atlas est 2D');
  assert.deepEqual(lireWkt('LINESTRING ZM (0 0 1 2, 1 1 1 2)').coordinates, [[0, 0], [1, 1]]);
  assert.deepEqual(lireWkt('POINT (-1.5e-3 4.3E1)').coordinates, [-0.0015, 43]);
});

test('une cellule vide, EMPTY ou malformee n’est pas une geometrie, sans erreur', () => {
  for (const v of ['', 'POINT EMPTY', 'POLYGON EMPTY', 'POINT (5.4)', 'LINESTRING (0 0)', 'POLYGON ((0 0, 1 1)',
    'POINT (a b)', 'CIRCLE (0 0, 1)', '{"type":"Point"}', null, undefined, 42]) {
    assert.equal(lireWkt(v), null, JSON.stringify(v));
  }
});

test('estWkt reconnait sans decoder', () => {
  assert.ok(estWkt('MULTILINESTRING ((0 0, 1 1))'));
  assert.ok(estWkt('srid=2154;polygon ((0 0, 1 0, 1 1, 0 0))'));
  assert.ok(!estWkt('{"type":"Point","coordinates":[0,0]}'));
  assert.ok(!estWkt('Pont du moulin'));
});

test('aller-retour exact : reecrire ne deplace rien', () => {
  const cas = [
    'POINT (5.64345188412329 43.2920003280899)',
    'LINESTRING (0 0, 1.123456789012 1)',
    'POLYGON ((0 0, 4 0, 4 4, 0 4, 0 0), (1 1, 2 1, 2 2, 1 1))',
    'MULTIPOINT ((1 2), (3 4))',
    'MULTILINESTRING ((5.6434518 43.2920003, 5.6438171 43.2918763), (4.79 43.6, 4.791 43.601))',
    'MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0)), ((5 5, 6 5, 6 6, 5 5)))',
  ];
  for (const w of cas) {
    const g = lireWkt(w);
    assert.equal(ecrireWkt(g), w, w);
    assert.deepEqual(lireWkt(ecrireWkt(g)), g);
  }
});

test('ecrireWkt refuse ce qui n’est pas une geometrie', () => {
  assert.equal(ecrireWkt(null), null);
  assert.equal(ecrireWkt({ type: 'GeometryCollection', geometries: [] }), null);
});

// ---- Branchement : lecture des tables, ecriture des cellules ----
import { tableToGeoJSON, detectGeometryColumn, formatGeometrie } from '../lib/geo-tables.js';
import { colonnesGeometrie, cellulesGeometrie, lireGeometrie } from '../lib/geometrie-saisie.js';
import { rowToFeature } from '../lib/grist-rows.js';

test('une table WKT se lit comme une table GeoJSON', () => {
  const cols = {
    id: [1, 2, 3],
    WKT: ['POLYGON ((5.61 43.15, 5.62 43.15, 5.62 43.16, 5.61 43.15))', '', 'POINT EMPTY'],
    nom: ['Domaine A', 'Domaine B', 'Domaine C'],
  };
  const gc = detectGeometryColumn(cols);
  assert.equal(gc, 'WKT');
  assert.equal(formatGeometrie(cols, gc), 'wkt');
  const fc = tableToGeoJSON(cols, gc);
  assert.equal(fc.features.length, 1, 'cellules vides ou EMPTY : pas d’objet');
  assert.equal(fc.features[0].geometry.type, 'Polygon');
  assert.equal(fc.features[0].properties._row_id, 1);
  assert.equal(fc.features[0].properties.WKT, undefined, 'la geometrie n’est pas un attribut');
});

test('une table WKT est reecrite en WKT, une table GeoJSON en GeoJSON', () => {
  const ligne = { type: 'LineString', coordinates: [[5.6, 43.2], [5.7, 43.3]] };
  const wkt = colonnesGeometrie({ geometryType: 'LineString', geometryColumn: 'WKT', geometryFormat: 'wkt' });
  assert.deepEqual(cellulesGeometrie(ligne, wkt), { WKT: 'LINESTRING (5.6 43.2, 5.7 43.3)' });
  const parNom = colonnesGeometrie({ geometryType: 'Polygon', geometryColumn: 'wkt' });
  assert.equal(parNom.format, 'wkt', 'une colonne nommee wkt, meme sans lecture prealable');
  const gj = colonnesGeometrie({ geometryType: 'LineString', geometryColumn: 'geometry_json' });
  assert.equal(gj.format, 'geojson');
  assert.equal(JSON.parse(cellulesGeometrie(ligne, gj).geometry_json).type, 'LineString');
  // Relire ce qu'on vient d'ecrire rend la meme forme.
  assert.deepEqual(lireGeometrie(cellulesGeometrie(ligne, wkt), wkt), ligne);
});

test('une couche de manifeste qui declare une colonne WKT se lit', () => {
  const f = rowToFeature({ id: 7, WKT: 'MULTILINESTRING ((5.64 43.29, 5.65 43.30))', Nom: 'Boucle' },
    { geomType: 'LineString', geometryFields: { geojson: 'WKT' } }, '#336699', true);
  assert.equal(f.geometry.type, 'MultiLineString');
  assert.equal(f.properties._row_id, 7);
});

