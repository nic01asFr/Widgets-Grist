import test from 'node:test';
import assert from 'node:assert/strict';
import {
  familleGeometrie, lireCoordonnee, coordonneesUtilisables, colonnesGeometrie,
  nomsColonnesGeometrie, cellulesGeometrie, lireGeometrie, normaliserGeometrie,
  validerGeometrie, anneauSeRecoupe, rowIdsDepuisRangs, rangsDepuisRowIds,
  PLAFOND_SOMMETS,
} from '../lib/geometrie-saisie.js';

const codes = (r) => r.erreurs.map((e) => e.code);

test('une cellule vide est une absence, pas un zéro', () => {
  for (const v of [null, undefined, '', ' ', false, true, [], {}, 'abc', '12a', NaN, Infinity]) {
    assert.ok(Number.isNaN(lireCoordonnee(v)), `${JSON.stringify(v)} doit donner NaN`);
  }
  assert.equal(lireCoordonnee(43.3), 43.3);
  assert.equal(lireCoordonnee(' 43.3 '), 43.3);
  assert.equal(lireCoordonnee('-5.4e0'), -5.4);
  assert.equal(lireCoordonnee(0), 0);
});

test('l’origine et les coordonnées hors bornes ne sont pas utilisables', () => {
  assert.equal(coordonneesUtilisables(5.37, 43.29), true);
  assert.equal(coordonneesUtilisables(0, 0), false);
  assert.equal(coordonneesUtilisables(0, 43), true);
  assert.equal(coordonneesUtilisables(181, 43), false);
  assert.equal(coordonneesUtilisables(5, -91), false);
  assert.equal(coordonneesUtilisables(NaN, 43), false);
});

test('la famille d’un type', () => {
  assert.equal(familleGeometrie('MultiPolygon'), 'Polygon');
  assert.equal(familleGeometrie('MultiLineString'), 'LineString');
  assert.equal(familleGeometrie('Point'), 'Point');
  assert.equal(familleGeometrie('GeometryCollection'), null);
});

test('les colonnes : manifeste, puis colonne retenue, puis convention', () => {
  // Source dont Grist a suffixé les noms.
  assert.deepEqual(colonnesGeometrie({
    geometryType: 'Point',
    _manifestLayer: { source: { geometry_fields: { lat: 'latitude2', lon: 'longitude2' } } },
  }), { mode: 'latlon', lat: 'latitude2', lon: 'longitude2' });
  // Surface qgis2grist : la géométrie, et ses centroïdes.
  assert.deepEqual(colonnesGeometrie({
    geometryType: 'Polygon',
    _manifestLayer: { source: { geometry_fields: { geojson: 'geometry_json2', lat: 'centroid_lat', lon: 'centroid_lon' } } },
  }), { mode: 'geojson', geojson: 'geometry_json2', centroideLat: 'centroid_lat', centroideLon: 'centroid_lon' });
  // Point entablé : rangé en geometry_json, et il doit y être réécrit.
  assert.deepEqual(colonnesGeometrie({ geometryType: 'Point', geometryColumn: 'geometry_json' }),
    { mode: 'geojson', geojson: 'geometry_json' });
  // Table liée en {lat, lng}.
  assert.deepEqual(colonnesGeometrie({ geometryType: 'Point', geometryColumn: { lat: 'y', lng: 'x' } }),
    { mode: 'latlon', lat: 'y', lon: 'x' });
  // Un couple lat/lon ne vaut que pour un point.
  assert.deepEqual(colonnesGeometrie({ geometryType: 'Polygon', geometryColumn: { lat: 'y', lng: 'x' } }),
    { mode: 'geojson', geojson: 'geometry_json' });
  // Convention.
  assert.deepEqual(colonnesGeometrie({ geometryType: 'Point' }), { mode: 'latlon', lat: 'latitude', lon: 'longitude' });
  assert.deepEqual(colonnesGeometrie({ geometryType: 'LineString' }), { mode: 'geojson', geojson: 'geometry_json' });
  assert.deepEqual(colonnesGeometrie({}), { mode: 'geojson', geojson: 'geometry_json' });
  assert.deepEqual(nomsColonnesGeometrie({ mode: 'latlon', lat: 'a', lon: 'b' }), ['a', 'b']);
});

test('écrire puis relire rend la même géométrie', () => {
  const surface = { type: 'Polygon', coordinates: [[[5, 43], [5.001, 43], [5.001, 43.001], [5, 43]]] };
  const colsG = { mode: 'geojson', geojson: 'geometry_json' };
  const cellules = cellulesGeometrie(surface, colsG);
  assert.deepEqual(lireGeometrie(cellules, colsG), surface);

  const point = { type: 'Point', coordinates: [5.3698, 43.2965] };
  const colsP = { mode: 'latlon', lat: 'latitude2', lon: 'longitude2' };
  assert.deepEqual(cellulesGeometrie(point, colsP), { latitude2: 43.2965, longitude2: 5.3698 });
  assert.deepEqual(lireGeometrie(cellulesGeometrie(point, colsP), colsP), point);
  // Un point rangé en geometry_json y retourne.
  assert.deepEqual(cellulesGeometrie(point, colsG), { geometry_json: '{"type":"Point","coordinates":[5.3698,43.2965]}' });
});

test('l’écriture n’arrondit pas et retire le Z', () => {
  const g = { type: 'LineString', coordinates: [[5.123456789012, 43.1, 12], [5.2, 43.2, 8]] };
  const { geometry_json: s } = cellulesGeometrie(g, { mode: 'geojson', geojson: 'geometry_json' });
  assert.deepEqual(JSON.parse(s).coordinates, [[5.123456789012, 43.1], [5.2, 43.2]]);
});

test('une ligne ne tient pas dans des colonnes lat/lon', () => {
  const ligne = { type: 'LineString', coordinates: [[5, 43], [5.1, 43]] };
  assert.equal(cellulesGeometrie(ligne, { mode: 'latlon', lat: 'latitude', lon: 'longitude' }), null);
  assert.equal(cellulesGeometrie({ type: 'Point', coordinates: [0, 0] }, { mode: 'latlon', lat: 'latitude', lon: 'longitude' }), null);
});

test('lire : ligne vide, origine, Feature dépliée, texte illisible', () => {
  const ll = { mode: 'latlon', lat: 'latitude', lon: 'longitude' };
  assert.equal(lireGeometrie({ latitude: null, longitude: null }, ll), null);
  assert.equal(lireGeometrie({ latitude: '', longitude: '' }, ll), null);
  assert.equal(lireGeometrie({ latitude: 0, longitude: 0 }, ll), null);
  assert.deepEqual(lireGeometrie({ latitude: '43.2', longitude: '5.3' }, ll), { type: 'Point', coordinates: [5.3, 43.2] });
  const gj = { mode: 'geojson', geojson: 'g' };
  assert.deepEqual(lireGeometrie({ g: '{"type":"Feature","geometry":{"type":"Point","coordinates":[5,43,7]}}' }, gj),
    { type: 'Point', coordinates: [5, 43] });
  assert.equal(lireGeometrie({ g: 'POINT(5 43)' }, gj), null);
  assert.equal(lireGeometrie({ g: '{pas du json' }, gj), null);
  assert.equal(lireGeometrie({ g: '' }, gj), null);
});

test('normaliser : 7 décimales, doublons fusionnés, anneau fermé et antihoraire', () => {
  assert.deepEqual(normaliserGeometrie({ type: 'Point', coordinates: [5.123456789, 43.987654321, 3] }),
    { type: 'Point', coordinates: [5.1234568, 43.9876543] });

  // Double-clic de fin : le dernier sommet est posé deux fois.
  const l = normaliserGeometrie({ type: 'LineString', coordinates: [[5, 43], [5.001, 43], [5.001, 43.0000001]] });
  assert.equal(l.coordinates.length, 2);

  // Anneau ouvert, horaire.
  const horaire = [[5, 43], [5, 43.001], [5.001, 43.001], [5.001, 43]];
  const p = normaliserGeometrie({ type: 'Polygon', coordinates: [horaire] });
  const a = p.coordinates[0];
  assert.deepEqual(a[0], a[a.length - 1], 'anneau refermé');
  assert.equal(a.length, 5);
  // Antihoraire : aire signée positive.
  let s = 0;
  for (let i = 0; i < a.length - 1; i++) s += a[i][0] * a[i + 1][1] - a[i + 1][0] * a[i][1];
  assert.ok(s > 0, 'extérieur antihoraire');

  // Déjà fermé avec un double sommet final : un seul point de fermeture.
  const p2 = normaliserGeometrie({ type: 'Polygon', coordinates: [[[5, 43], [5.001, 43], [5.001, 43.001], [5.001, 43.001], [5, 43]]] });
  assert.equal(p2.coordinates[0].length, 4);
});

test('valider : types, multiples, bornes, origine', () => {
  const pt = { type: 'Point', coordinates: [5, 43] };
  assert.equal(validerGeometrie(pt, 'Point').ok, true);
  assert.equal(validerGeometrie(pt, 'MultiPoint').ok, true);
  assert.deepEqual(codes(validerGeometrie(pt, 'Polygon')), ['type']);
  assert.deepEqual(codes(validerGeometrie({ type: 'LineString', coordinates: [[5, 43], [5.1, 43]] }, 'Polygon')), ['type']);
  assert.deepEqual(codes(validerGeometrie({ type: 'MultiPoint', coordinates: [[5, 43]] }, 'Point')), ['multiple']);
  assert.deepEqual(codes(validerGeometrie({ type: 'Point', coordinates: [0, 0] }, 'Point')), ['origine']);
  assert.deepEqual(codes(validerGeometrie({ type: 'Point', coordinates: [200, 43] }, 'Point')), ['coordonnees']);
  assert.deepEqual(codes(validerGeometrie(null)), ['absente']);
});

test('valider : ligne trop courte ou de longueur nulle', () => {
  assert.deepEqual(codes(validerGeometrie({ type: 'LineString', coordinates: [[5, 43]] }, 'LineString')), ['sommets']);
  assert.deepEqual(codes(validerGeometrie({ type: 'LineString', coordinates: [[5, 43], [5, 43]] }, 'LineString')), ['sommets']);
  assert.equal(validerGeometrie({ type: 'LineString', coordinates: [[5, 43], [5.0001, 43]] }, 'LineString').ok, true);
});

test('valider : surface aplatie, en huit, ou juste', () => {
  const carre = normaliserGeometrie({ type: 'Polygon', coordinates: [[[5, 43], [5.001, 43], [5.001, 43.001], [5, 43.001]]] });
  assert.equal(validerGeometrie(carre, 'Polygon').ok, true);

  const aplati = normaliserGeometrie({ type: 'Polygon', coordinates: [[[5, 43], [5.001, 43], [5.002, 43]]] });
  assert.deepEqual(codes(validerGeometrie(aplati, 'Polygon')), ['aire-nulle']);

  const huit = normaliserGeometrie({ type: 'Polygon', coordinates: [[[5, 43], [5.001, 43.001], [5.001, 43], [5, 43.001]]] });
  assert.deepEqual(codes(validerGeometrie(huit, 'Polygon')), ['auto-intersection']);

  const deux = { type: 'Polygon', coordinates: [[[5, 43], [5.001, 43], [5, 43]]] };
  assert.deepEqual(codes(validerGeometrie(deux, 'Polygon')), ['sommets']);
});

test('le recoupement d’un anneau : voisins permis, contact ailleurs refusé', () => {
  const carre = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
  assert.equal(anneauSeRecoupe(carre), false);
  // Un sommet qui touche un segment non voisin.
  const pincé = [[0, 0], [2, 0], [2, 2], [1, 0], [0, 2], [0, 0]];
  assert.equal(anneauSeRecoupe(pincé), true);
});

test('valider : trop de sommets', () => {
  const coords = Array.from({ length: PLAFOND_SOMMETS + 1 }, (_, i) => [5 + i * 1e-5, 43]);
  assert.deepEqual(codes(validerGeometrie({ type: 'LineString', coordinates: coords }, 'LineString')), ['trop-de-sommets']);
});

test('chaque erreur a un message lisible', () => {
  const r = validerGeometrie({ type: 'Point', coordinates: [0, 0] }, 'Point');
  assert.ok(r.erreurs[0].message.length > 10);
});

test('la sélection suit les lignes, pas les rangs', () => {
  const avant = [10, 11, 12].map((id) => ({ properties: { _row_id: id } }));
  const choisis = rowIdsDepuisRangs(avant, [1, 2]);
  assert.deepEqual(choisis, [11, 12]);
  // Une ligne ajoutée en tête, la 11 supprimée.
  const apres = [9, 10, 12].map((id) => ({ properties: { _row_id: id } }));
  assert.deepEqual(rangsDepuisRowIds(apres, choisis), [2]);
  assert.deepEqual(rangsDepuisRowIds(apres, ['12']), [2], 'identifiant en texte');
  assert.deepEqual(rangsDepuisRowIds(null, [1]), []);
});

/* ---- L'écrivain passe par la même règle ---- */

import { featureToRowUpdate } from '../lib/grist-sync.js';

const pointEn = (lon, lat, props = {}) => ({
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { _row_id: 3, ...props },
});

test('écrivain : un point entablé retourne dans geometry_json, pas dans des colonnes absentes', () => {
  const couche = { geometryType: 'Point', geometryColumn: 'geometry_json', sourceTable: 'Atlas_Arbres', _fields: [{ name: 'nom' }] };
  const { update } = featureToRowUpdate(pointEn(5.37, 43.29, { nom: 'Platane' }), couche);
  assert.equal(update.nom, 'Platane');
  assert.equal(update.geometry_json, '{"type":"Point","coordinates":[5.37,43.29]}');
  assert.equal(update.latitude, undefined);
  assert.equal(update.longitude, undefined);
});

test('écrivain : une source suffixée garde ses colonnes, les homonymes restent des attributs intacts', () => {
  const couche = {
    geometryType: 'Point',
    _manifestLayer: { source: { geometry_fields: { lat: 'latitude2', lon: 'longitude2' } } },
    _gristColumns: ['latitude', 'longitude', 'latitude2', 'longitude2', 'nom'],
    _fields: [{ name: 'nom' }],
  };
  const { update } = featureToRowUpdate(pointEn(5.37, 43.29, { nom: 'R1' }), couche);
  assert.equal(update.latitude2, 43.29);
  assert.equal(update.longitude2, 5.37);
  assert.equal(update.latitude, undefined, 'la colonne « latitude » de la source n’est pas écrasée');
});

test('écrivain : une table liée en x/y s’écrit en x/y, et ces colonnes ne sont pas des attributs', () => {
  const couche = { geometryType: 'Point', geometryColumn: { lat: 'y', lng: 'x' } };
  const { update } = featureToRowUpdate(pointEn(5.37, 43.29, { x: 999, y: 999, nom: 'A' }), couche);
  assert.deepEqual({ x: update.x, y: update.y, nom: update.nom }, { x: 5.37, y: 43.29, nom: 'A' });
});

test('écrivain : une géométrie d’une autre famille que la couche n’est pas écrite', () => {
  const couche = { geometryType: 'Polygon', _fields: [{ name: 'nom' }] };
  const ligne = { geometry: { type: 'LineString', coordinates: [[5, 43], [5.1, 43]] }, properties: { _row_id: 1, nom: 'x' } };
  const { update } = featureToRowUpdate(ligne, couche);
  assert.equal(update.geometry_json, undefined);
  assert.equal(update.nom, 'x');
});

test('écrivain : une colonne absente de la table n’est jamais visée', () => {
  const couche = { geometryType: 'Point', _gristColumns: ['nom'], _fields: [{ name: 'nom' }] };
  const { update } = featureToRowUpdate(pointEn(5.37, 43.29, { nom: 'A' }), couche);
  assert.deepEqual(update, { nom: 'A' });
});

/* ---- Le lecteur des tables liées ---- */

import { tableToGeoJSON } from '../lib/geo-tables.js';

test('lecteur : une ligne sans coordonnées ne fait plus de point en (0, 0)', () => {
  const table = {
    id: [1, 2, 3, 4],
    latitude: [43.29, null, '', 0],
    longitude: [5.37, null, '', 0],
    nom: ['A', 'vide', 'blanc', 'origine'],
  };
  const fc = tableToGeoJSON(table, { lat: 'latitude', lng: 'longitude' });
  assert.deepEqual(fc.features.map((f) => f.properties.nom), ['A']);
  assert.deepEqual(fc.features[0].geometry.coordinates, [5.37, 43.29]);
});

/* ---- Les colonnes qu'on peut écrire ---- */

import { colonnesEcrivables } from '../lib/grist-sync.js';

test('colonnes écrivables : le schéma fait foi, les formules et colonnes Grist sont exclues', () => {
  const schema = [
    { colId: 'manualSort', isFormula: false },
    { colId: 'nom', isFormula: false },
    { colId: 'surface_calc', isFormula: true },
    { colId: 'geometry_json', isFormula: false },
    { colId: 'vide_partout', isFormula: false },
  ];
  assert.deepEqual(colonnesEcrivables(schema, ['nom', 'surface_calc']), ['nom', 'geometry_json', 'vide_partout']);
  // Sans schéma : ce qu'on a lu, dédoublonné, sans id ni manualSort.
  assert.deepEqual(colonnesEcrivables(undefined, ['nom', 'id', 'nom', 'latitude']), ['nom', 'latitude']);
  assert.deepEqual(colonnesEcrivables([], []), []);
});
