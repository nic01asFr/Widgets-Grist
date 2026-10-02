import test from 'node:test';
import assert from 'node:assert/strict';
import { nomDeFichier, versGeoJSON, versCsv, versKml, versGpx, nomEntite } from '../lib/export-formats.js';

const point = (nom, x, y, extra = {}) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: { Nom: nom, ...extra } });
const ligne = { type: 'Feature', geometry: { type: 'LineString', coordinates: [[5.37, 43.29], [5.38, 43.3]] }, properties: { Nom: 'Sentier A' } };
const surface = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: { Nom: 'Zone' } };
const C1 = { name: 'Ponts', geojson: { type: 'FeatureCollection', features: [point('Pont "Neuf"', 5.37, 43.29, { Etat: 'A, bon', _interne: 'x' }), point('Pont 2', 5.4, 43.3)] } };
const C2 = { name: 'Sentiers', geojson: { type: 'FeatureCollection', features: [ligne, surface] } };

test('un nom de fichier sûr : sans accent, sans espace', () => {
  assert.equal(nomDeFichier('Mon projet été', 'kml'), 'Mon_projet_ete.kml');
  assert.equal(nomDeFichier('', 'gpx'), 'atlas.gpx');
  assert.equal(nomDeFichier('///', 'csv'), 'atlas.csv');
});

test('GeoJSON : plusieurs couches gardent leur origine ; une seule reste intacte', () => {
  const seul = versGeoJSON([C1]);
  assert.equal(seul.features.length, 2);
  assert.ok(!('layer' in seul.features[0].properties), 'une seule couche : rien n’est ajouté');
  const deux = versGeoJSON([C1, C2]);
  assert.equal(deux.features.length, 4);
  assert.equal(deux.features[0].properties.layer, 'Ponts');
  assert.equal(deux.features[2].properties.layer, 'Sentiers');
});

test('CSV : colonnes en union, géométrie en WKT, guillemets doublés, colonnes internes écartées', () => {
  const csv = versCsv([C1]).split('\r\n');
  assert.equal(csv[0], 'Nom,Etat,geometrie');
  assert.equal(csv[1], '"Pont ""Neuf""","A, bon",POINT (5.37 43.29)');
  assert.equal(csv[2], 'Pont 2,,POINT (5.4 43.3)');
  assert.ok(!csv[0].includes('_interne'));
});

test('CSV : plusieurs couches ajoutent la colonne couche', () => {
  const lignes = versCsv([C1, C2]).split('\r\n');
  assert.equal(lignes[0].split(',')[0], 'couche');
  assert.ok(lignes.some((l) => l.startsWith('Sentiers,Sentier A') && l.includes('LINESTRING')));
});

test('KML : un dossier par couche, noms, attributs, géométries', () => {
  const kml = versKml([C1, C2], 'Essai & co');
  assert.ok(kml.includes('<name>Essai &amp; co</name>'));
  assert.equal((kml.match(/<Folder>/g) || []).length, 2);
  assert.ok(kml.includes('<name>Pont &quot;Neuf&quot;</name>'));
  assert.ok(kml.includes('<Data name="Etat"><value>A, bon</value></Data>'));
  assert.ok(!kml.includes('_interne'));
  assert.ok(kml.includes('<LineString><coordinates>5.37,43.29 5.38,43.3</coordinates></LineString>'));
  assert.ok(kml.includes('<Polygon><outerBoundaryIs>'));
});

test('GPX : points et traces seulement ; le polygone est écarté et compté', () => {
  const r = versGpx([C1, C2]);
  assert.equal(r.ignorees, 1);
  assert.equal(r.retenues, 3);
  assert.equal((r.xml.match(/<wpt /g) || []).length, 2);
  assert.equal((r.xml.match(/<trk>/g) || []).length, 1);
  assert.ok(r.xml.includes('<wpt lat="43.29" lon="5.37">'), 'lat avant lon, ordre GPX');
  assert.ok(r.xml.indexOf('<wpt') < r.xml.indexOf('<trk>'), 'points avant traces');
});

test('nomEntite : cherche un champ de nom, sinon vide', () => {
  assert.equal(nomEntite({ nom: ' Pont ' }), 'Pont');
  assert.equal(nomEntite({ x: 1 }), '');
});
