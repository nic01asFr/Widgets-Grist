/**
 * Manifeste inféré (lib/bi/inference.js) : de simples données GeoJSON à une carte lisible, sans inventer, en disant ce qui a été décidé.
 * node --test projects/Atlas/tests/bi-inference.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { inferer, genreDeGeometrie, CLASSES_MAX } from '../lib/bi/inference.js';
import { carteSimulee } from './aide-carte-bi.js';

const pt = (id, props, lng = 5.37, lat = 43.3) => ({ type: 'Feature', ...(id === undefined ? {} : { id }), properties: props, geometry: { type: 'Point', coordinates: [lng, lat] } });
const ligne = (id) => ({ type: 'Feature', id, properties: { nom: 'L' }, geometry: { type: 'LineString', coordinates: [[5, 43], [5.1, 43.1]] } });
const surface = (id) => ({ type: 'Feature', id, properties: {}, geometry: { type: 'Polygon', coordinates: [[[5, 43], [5.1, 43], [5.1, 43.1], [5, 43]]] } });
const fc = (features) => ({ type: 'FeatureCollection', features });

test('genre de géométrie', () => {
  assert.equal(genreDeGeometrie({ type: 'MultiPoint', coordinates: [] }), 'point');
  assert.equal(genreDeGeometrie({ type: 'MultiLineString', coordinates: [] }), 'line');
  assert.equal(genreDeGeometrie({ type: 'MultiPolygon', coordinates: [] }), 'polygon');
  assert.equal(genreDeGeometrie({ type: 'GeometryCollection', geometries: [] }), null);
  assert.equal(genreDeGeometrie(null), null);
});

test('une FeatureCollection de points : une couche, identifiants gardés, clé trouvée', () => {
  const r = inferer(fc([pt(11, { ref: 'A', nom: 'Alpha' }), pt(12, { ref: 'B', nom: 'Bravo' }), pt(13, { ref: 'C', nom: 'Charlie' })]));
  assert.equal(r.manifeste.layers.length, 1);
  const l = r.manifeste.layers[0];
  assert.deepEqual({ id: l.id, geometry_type: l.geometry_type, cle: l.cle }, { id: 'donnees', geometry_type: 'point', cle: 'ref' });
  assert.deepEqual(r.donnees.donnees.map((f) => f.id), [11, 12, 13]);
  assert.equal(l.style, undefined, 'pas de classification : style par défaut de la charte');
});

test('identifiants absents, en double ou non entiers : numérotés, ancien identifiant gardé comme clé', () => {
  const r = inferer([pt('a', { x: 1 }), pt('b', { x: 2 }), pt(undefined, { x: 3 })]);
  assert.deepEqual(r.donnees.donnees.map((f) => f.id), [1, 2, 3]);
  assert.equal(r.manifeste.layers[0].cle, 'id_origine');
  assert.deepEqual(r.donnees.donnees.map((f) => f.properties.id_origine), ['a', 'b', undefined]);
  const d = inferer([pt(5, {}), pt(5, {})]);
  assert.deepEqual(d.donnees.donnees.map((f) => f.id), [1, 2]);
  assert.ok(d.notes.some((n) => /numérotés/.test(n)));
});

test('identifiants uniques dans TOUTE la scène : deux couches qui se recouvrent sont renumérotées', () => {
  const r = inferer({ a: [pt(1, {}), pt(2, {})], b: [pt(1, {}), pt(2, {})] });
  const tous = [...r.donnees.a, ...r.donnees.b].map((f) => f.id);
  assert.equal(new Set(tous).size, 4);
});

test("une propriété d'identifiant de l'hôte l'emporte sur id_origine comme clé", () => {
  const r = inferer([pt('a', { ref: 'R1' }), pt('b', { ref: 'R2' })]);
  assert.equal(r.manifeste.layers[0].cle, 'ref');
  assert.deepEqual(r.donnees.donnees.map((f) => f.id), [1, 2]);
});

test('géométries mêlées : une couche par type', () => {
  const r = inferer(fc([pt(1, {}), ligne(2), surface(3), pt(4, {})]));
  assert.deepEqual(r.manifeste.layers.map((l) => [l.id, l.geometry_type]), [['donnees-points', 'point'], ['donnees-lignes', 'line'], ['donnees-surfaces', 'polygon']]);
  assert.equal(r.donnees['donnees-points'].length, 2);
});

test('classification : première propriété texte à 2..8 valeurs partagées ; un filtre est posé', () => {
  const genres = ['école', 'école', 'mairie', 'école', 'mairie', 'parc'];
  const r = inferer(fc(genres.map((g, i) => pt(i + 1, { nom: 'site ' + i, genre: g }))));
  const l = r.manifeste.layers[0];
  assert.equal(l.style.declarative.kind, 'categorized'); assert.equal(l.style.declarative.field, 'genre');
  assert.deepEqual(l.style.declarative.stops.map((s) => s.value), ['école', 'mairie', 'parc'], 'les plus fréquentes d\'abord');
  assert.ok(l.style.declarative.stops.every((s) => s.color === undefined), 'aucune couleur écrite : la charte de l\'hôte décide');
  assert.deepEqual(l.controls, [{ id: 'f-genre', field: 'genre', type: 'select' }]);
});

test('pas de classification : libellés tous différents, trop de valeurs, nombres, couverture faible, trop peu d\'entités', () => {
  const sans = (props) => inferer(fc(props.map((p, i) => pt(i + 1, p)))).manifeste.layers[0].style;
  assert.equal(sans(Array.from({ length: 6 }, (_, i) => ({ nom: 'n' + i }))), undefined, 'libellés tous différents');
  assert.equal(sans(Array.from({ length: 30 }, (_, i) => ({ t: 'v' + (i % (CLASSES_MAX + 2)) }))), undefined, 'trop de valeurs');
  assert.equal(sans(Array.from({ length: 6 }, (_, i) => ({ n: i % 2 }))), undefined, 'nombres : pas une classe');
  assert.equal(sans([{ t: 'a' }, { t: 'a' }, { t: 'b' }, {}, {}, {}]), undefined, 'moins de 80 % des entités');
  assert.equal(sans([{ t: 'a' }, { t: 'b' }]), undefined, 'deux entités : rien à classer');
});

test('les données de l\'hôte ne sont pas modifiées', () => {
  const entree = fc([pt('a', { genre: 'x' }), pt('b', { genre: 'x' }), pt('c', { genre: 'y' })]);
  const avant = JSON.stringify(entree);
  inferer(entree);
  assert.equal(JSON.stringify(entree), avant);
});

test('entités sans géométrie écartées et dites ; rien à dessiner : erreur claire', () => {
  const r = inferer(fc([pt(1, {}), { type: 'Feature', id: 2, properties: {}, geometry: null }]));
  assert.equal(r.donnees.donnees.length, 1); assert.ok(r.notes.some((n) => /sans géométrie/.test(n)));
  assert.throws(() => inferer(fc([{ type: 'Feature', properties: {}, geometry: null }])), /aucune entité/);
  assert.throws(() => inferer('texte'), /FeatureCollection/);
  assert.throws(() => inferer({ a: 3 }), /« a »/);
  assert.throws(() => inferer({}), /aucune donnée/);
});

test('bout en bout : le manifeste inféré se monte sur le runtime et le filtre posé fonctionne', async () => {
  const genres = ['école', 'école', 'mairie', 'école', 'mairie', 'parc'];
  const r = inferer(fc(genres.map((g, i) => pt(i + 1, { ref: 'R' + i, genre: g }))));
  const rt = attacher(carteSimulee());
  const res = await rt.api.setScene(r.manifeste, r.donnees);
  assert.deepEqual(res, { donnees: 6 });
  const leg = rt.api.getLegend('donnees');
  assert.deepEqual(leg.classes.map((c) => c.couleur), ['#0072b2', '#d55e00', '#009e73'], 'classes sans couleur : palette qualitative de la charte');
  assert.deepEqual(await rt.api.setFilter('f-genre', ['école']), { layer: 'donnees', compte: 3, total: 6 });
});
