'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/q2g-erreurs.js');

test('messageLecture : un ZIP corrompu ou tronque est explique en francais, detail conserve', () => {
  const a = E.messageLecture(new Error("Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html"), 'projet.zip');
  assert.match(a, /^Archive illisible/);
  assert.match(a, /détail : Can't find end of central directory/);
  assert.match(E.messageLecture(new Error("Corrupted zip: can't find end of central directory"), 'x.zip'), /^Archive illisible/);
  assert.match(E.messageLecture(new Error('Corrupted zip'), 'p.qgz'), /projet QGIS \.qgz/);
});

test('messageLecture : un GeoPackage vide ou invalide est explique, detail conserve', () => {
  const a = E.messageLecture(new Error('no such table: gpkg_geometry_columns'), 'vide.gpkg');
  assert.match(a, /^GeoPackage illisible/);
  assert.match(a, /détail : no such table: gpkg_geometry_columns/);
  assert.match(E.messageLecture(new Error('file is not a database'), 'a.gpkg'), /^GeoPackage illisible/);
});

test('messageLecture : les autres messages (deja en francais) et les cas hors extension restent tels quels', () => {
  assert.equal(E.messageLecture(new Error('Format non reconnu: .txt. Formats supportés: .zip'), 'n.txt'), 'Format non reconnu: .txt. Formats supportés: .zip');
  assert.equal(E.messageLecture(new Error('no such table: x'), 'notes.html'), 'no such table: x');
  assert.equal(E.messageLecture('chaine', 'a.zip'), 'chaine');
  assert.equal(E.messageLecture(null, 'a.zip'), '');
});
