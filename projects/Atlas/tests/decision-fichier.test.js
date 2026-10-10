import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decisionFichier, messageNature } from '../lib/ouvrir-fichier.js';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const GPX = '<?xml version="1.0"?><gpx version="1.1"><wpt lat="43.29" lon="5.37"><name>Pont</name></wpt></gpx>';
const GEOJSON = JSON.stringify({ type: 'FeatureCollection', features: [] });
const PROJET = JSON.stringify({ version: '2.2-atlas-binding', layers: [] });
const SCENE = JSON.stringify({ version: '0.2.2', layers: [{ id: 'bati', name: 'Bati', geometry_type: 'Polygon' }] });

test('un GPX : des couches, lues par import-formats', () => {
  const d = decisionFichier('trace.gpx', GPX);
  assert.equal(d.action, 'couches');
  assert.equal(d.couches.length, 1);
  assert.equal(d.ignorees, 0);
});

test('un CSV : des couches ; un .txt qui ressemble a du JSON n en est pas un', () => {
  const csv = decisionFichier('points.csv', 'nom,lat,lon\nA,43.29,5.37\n');
  assert.equal(csv.action, 'couches');
  const json = decisionFichier('notes.txt', GEOJSON);
  assert.equal(json.action, 'geojson');
});

test('un GeoJSON : l objet est rendu tel quel, pret a devenir une couche', () => {
  const d = decisionFichier('batis.geojson', GEOJSON);
  assert.equal(d.action, 'geojson');
  assert.equal(d.nature, 'geojson');
  assert.deepEqual(d.obj, { type: 'FeatureCollection', features: [] });
});

test('un projet Atlas : action projet, avec le message que « Fichier » donnerait en le refusant', () => {
  const d = decisionFichier('projet.json', PROJET);
  assert.equal(d.action, 'projet');
  assert.equal(d.obj.version, '2.2-atlas-binding');
  // « Fichier » refuse un projet ; « Ouvrir » le restaure : la decision porte les deux.
  assert.equal(d.message, messageNature('projet'));
  assert.equal(d.niveau, 'info');
});

test('une scene publiee : refus d information, avec la facon de l ouvrir', () => {
  const d = decisionFichier('scene.json', SCENE);
  assert.equal(d.action, 'refus');
  assert.equal(d.nature, 'scene');
  assert.match(d.message, /\?scene=/);
  assert.equal(d.niveau, 'info');
});

test('un JSON qu on ne reconnait pas : refus en erreur', () => {
  for (const contenu of ['{"a":1}', '[1,2]', 'null', '42']) {
    const d = decisionFichier('x.json', contenu);
    assert.equal(d.action, 'refus', contenu);
    assert.equal(d.nature, null);
    assert.equal(d.niveau, 'error');
    assert.match(d.message, /Fichier non reconnu/);
  }
});

test('ni un format d echange ni du JSON : l exception remonte, l appelant dit « illisible »', () => {
  assert.throws(() => decisionFichier('photo.png', 'PNG binaire'), SyntaxError);
  assert.throws(() => decisionFichier('casse.json', '{"type": "FeatureCollection", '), SyntaxError);
});

test('app_v7.js : l import et l export de fichiers ne sont pas dans le graphe statique', () => {
  const app = readFileSync(resolve(RACINE, 'app_v7.js'), 'utf8');
  for (const m of ['import-formats', 'export-formats', 'ouvrir-fichier']) {
    assert.doesNotMatch(app, new RegExp(`from './lib/${m}[.]js`), `${m} ne doit pas etre importe statiquement`);
  }
  // import-formats est lu par ouvrir-fichier : la page ne demande que la decision et l'export.
  for (const m of ['export-formats', 'ouvrir-fichier']) {
    assert.match(app, new RegExp(`import[(]'./lib/${m}[.]js`), `${m} doit etre charge par import()`);
  }
});
