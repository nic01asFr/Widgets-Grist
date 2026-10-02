import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyserXml, lireGpx, lireKml, lireCsv, analyserCsv, detecterSeparateur, natureFichier, lireFichier,
} from '../lib/import-formats.js';
import { versGpx, versKml, versCsv } from '../lib/export-formats.js';

const point = (nom, x, y, extra = {}) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: { Nom: nom, ...extra } });
const ponts = { name: 'Ponts', geojson: { type: 'FeatureCollection', features: [point('Pont "Neuf" & co', 5.37, 43.29, { Etat: 'A, bon' }), point('Pont 2', 5.4, 43.3)] } };
const sentiers = { name: 'Sentiers', geojson: { type: 'FeatureCollection', features: [
  { type: 'Feature', geometry: { type: 'LineString', coordinates: [[5.37, 43.29], [5.38, 43.3]] }, properties: { Nom: 'Sentier A' } },
  { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: { Nom: 'Zone' } },
] } };

test('XML : éléments, attributs, entités, CDATA, commentaires ; un XML tronqué n’est pas lu', () => {
  const a = analyserXml('<?xml version="1.0"?><!-- x --><r xmlns:g="u"><g:a k="1 &amp; 2">T &lt;b&gt;</g:a><b/><c><![CDATA[<brut>]]></c></r>');
  const r = a.enfants[0];
  assert.equal(r.nom, 'r');
  assert.equal(r.enfants[0].nom, 'a', 'le préfixe d’espace de noms tombe');
  assert.equal(r.enfants[0].attrs.k, '1 & 2');
  assert.equal(r.enfants[0].texte, 'T <b>');
  assert.equal(r.enfants[1].nom, 'b');
  assert.equal(r.enfants[2].texte, '<brut>');
  assert.equal(analyserXml('<r><a></r>'), null);
  assert.equal(analyserXml('<r>'), null);
});

test('GPX : l’export relu rend les mêmes points et traces', () => {
  const { xml, retenues } = versGpx([ponts, sentiers], 'Essai');
  assert.equal(retenues, 3);
  const { couches, ignorees } = lireGpx(xml, 'Essai');
  assert.equal(ignorees, 0);
  assert.deepEqual(couches.map((c) => c.nom), ['Essai — points', 'Essai — traces']);
  const pts = couches[0].geojson.features;
  assert.equal(pts.length, 2);
  assert.deepEqual(pts[0].geometry.coordinates, [5.37, 43.29]);
  assert.equal(pts[0].properties.name, 'Pont "Neuf" & co');
  const traces = couches[1].geojson.features;
  assert.equal(traces[0].geometry.type, 'LineString');
  assert.deepEqual(traces[0].geometry.coordinates, [[5.37, 43.29], [5.38, 43.3]]);
});

test('GPX : trace à segments multiples, itinéraire, position hors degrés écartée, élévation gardée', () => {
  const gpx = `<gpx version="1.1"><wpt lat="43.1" lon="5.1"><ele>12.5</ele><name>A</name></wpt><wpt lat="200" lon="5"/>
    <trk><name>Boucle</name><trkseg><trkpt lat="1" lon="2"/><trkpt lat="1.1" lon="2.1"/></trkseg><trkseg><trkpt lat="3" lon="4"/><trkpt lat="3.1" lon="4.1"/></trkseg></trk>
    <rte><rtept lat="5" lon="6"/><rtept lat="5.1" lon="6.1"/></rte></gpx>`;
  const r = lireGpx(gpx, 'x');
  assert.equal(r.ignorees, 1);
  assert.equal(r.couches[0].geojson.features[0].properties.ele, 12.5);
  const [boucle, itineraire] = r.couches[1].geojson.features;
  assert.equal(boucle.geometry.type, 'MultiLineString');
  assert.equal(itineraire.properties.genre, 'itinéraire');
  assert.throws(() => lireGpx('<kml/>'), /GPX/);
});

test('KML : l’export relu ; un dossier qui mêle les genres est scindé', () => {
  const kml = versKml([ponts, sentiers], 'Essai');
  const { couches } = lireKml(kml, 'Essai');
  const noms = couches.map((c) => c.nom);
  assert.ok(noms.includes('Ponts'));
  assert.ok(noms.includes('Sentiers — lignes') && noms.includes('Sentiers — surfaces'));
  const p = couches.find((c) => c.nom === 'Ponts').geojson.features;
  assert.equal(p[0].properties.name, 'Pont "Neuf" & co');
  assert.equal(p[0].properties.Etat, 'A, bon');
  const s = couches.find((c) => c.nom === 'Sentiers — surfaces').geojson.features[0];
  assert.equal(s.geometry.type, 'Polygon');
});

test('KML : MultiGeometry de même genre regroupé, trous de polygone, altitude, repère sans géométrie compté', () => {
  const kml = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>D</name>
    <Placemark><name>M</name><MultiGeometry><Point><coordinates>1,2,30</coordinates></Point><Point><coordinates>3,4</coordinates></Point></MultiGeometry></Placemark>
    <Placemark><name>P</name><Polygon><outerBoundaryIs><LinearRing><coordinates>0,0 4,0 4,4 0,0</coordinates></LinearRing></outerBoundaryIs>
      <innerBoundaryIs><LinearRing><coordinates>1,1 2,1 2,2 1,1</coordinates></LinearRing></innerBoundaryIs></Polygon></Placemark>
    <Placemark><name>Vide</name></Placemark></Document></kml>`;
  const r = lireKml(kml, 'x');
  assert.equal(r.ignorees, 1);
  const multi = r.couches.find((c) => c.nom === 'D — points').geojson.features[0].geometry;
  assert.deepEqual(multi, { type: 'MultiPoint', coordinates: [[1, 2, 30], [3, 4]] });
  const poly = r.couches.find((c) => c.nom === 'D — surfaces').geojson.features[0].geometry;
  assert.equal(poly.coordinates.length, 2, 'le trou est gardé');
  assert.throws(() => lireKml('<gpx/>'), /KML/);
});

test('CSV : séparateur reconnu, guillemets, sauts de ligne dans une cellule, BOM', () => {
  assert.equal(detecterSeparateur('a;b;c\n1;2;3'), ';');
  assert.equal(detecterSeparateur('a\tb\n1\t2'), '\t');
  assert.equal(detecterSeparateur('"a,b";c'), ';', 'une virgule entre guillemets ne compte pas');
  assert.deepEqual(analyserCsv('\uFEFFa,b\r\n"x ""q"" y","l1\nl2"\r\n'), [['a', 'b'], ['x "q" y', 'l1\nl2']]);
});

test('CSV : l’export relu rend les mêmes entités (géométrie en WKT)', () => {
  const csv = versCsv([ponts, sentiers]);
  const r = lireCsv('\uFEFF' + csv, 'Export');
  assert.equal(r.colonnes, 'wkt');
  const f = r.couches[0].geojson.features;
  assert.equal(f.length, 4);
  assert.deepEqual(f[0].geometry, { type: 'Point', coordinates: [5.37, 43.29] });
  assert.equal(f[0].properties.Nom, 'Pont "Neuf" & co');
  assert.equal(f[2].geometry.type, 'LineString');
  assert.equal(f[0].properties.couche, 'Ponts');
});

test('CSV : colonnes de coordonnées, virgule décimale, nombres rendus en nombres, lignes sans position écartées', () => {
  const r = lireCsv('Nom;Latitude;Longitude;Hauteur\nA;43,29;5,37;12\nB;;;7\nC;43,3;5,4;9', 'Relevé');
  assert.equal(r.colonnes, 'lonlat');
  assert.equal(r.ignorees, 1);
  const [a, c] = r.couches[0].geojson.features;
  assert.deepEqual(a.geometry.coordinates, [5.37, 43.29]);
  assert.equal(a.properties.Hauteur, 12);
  assert.equal(c.properties.Hauteur, 9);
  assert.equal(lireCsv('lat,lon,h\n1,2,x\n3,4,5').couches[0].geojson.features[1].properties.h, '5', 'une colonne qui n’est pas toute numérique reste du texte');
});

test('CSV : sans géométrie, hors degrés ou vide, une phrase qui dit pourquoi', () => {
  assert.throws(() => lireCsv('a,b\n1,2'), /rien à placer/);
  assert.throws(() => lireCsv('x,y\n843000,6520000'), /pas en degrés/);
  assert.throws(() => lireCsv('lat,lon'), /ligne de données/);
  assert.throws(() => lireCsv('lat,lon\n,'), /ligne de données/);
  assert.throws(() => lireCsv('lat,lon\nx,y'), /Aucune ligne/);
});

test('reconnaître un fichier : par l’extension, ou par ce qu’il contient', () => {
  assert.equal(natureFichier('trace.gpx', ''), 'gpx');
  assert.equal(natureFichier('x.xml', '<?xml?><gpx version="1.1">'), 'gpx');
  assert.equal(natureFichier('x.kml', ''), 'kml');
  assert.equal(natureFichier('x.csv', 'a,b'), 'csv');
  assert.equal(natureFichier('x.txt', 'a;b'), 'csv');
  assert.equal(natureFichier('x.txt', '{"type":"FeatureCollection"}'), null, 'un JSON déguisé n’est pas un CSV');
  assert.equal(natureFichier('x.geojson', '{}'), null);
  assert.equal(lireFichier('t.gpx', versGpx([ponts]).xml).couches.length, 1);
  assert.throws(() => lireFichier('x.json', '{}'), /non reconnu/);
});
