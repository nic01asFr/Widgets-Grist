/**
 * Matching table GPKG ↔ couche QGIS (bees: Fields → area).
 * node --test projects/qgis2grist/tests/gpkg-datasource.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  gpkgTableFromDatasource,
  resolveGpkgTableHint,
  matchGpkgTables,
  matchGpkgFeatureTables,
} = require('../lib/gpkg-datasource.js');

describe('gpkg-datasource', () => {
  it('parse layername= depuis datasource QGIS', () => {
    assert.equal(
      gpkgTableFromDatasource('./datasets/bees.gpkg|layername=area'),
      'area',
    );
    assert.equal(
      gpkgTableFromDatasource('./datasets/bees.gpkg|layername=apiary'),
      'apiary',
    );
  });

  it('bees Fields — hint area pas fields', () => {
    const ds = './datasets/bees.gpkg|layername=area';
    assert.equal(resolveGpkgTableHint('Fields', ds), 'area');
    const tables = ['apiary', 'area', 'tracks'];
    assert.deepEqual(matchGpkgFeatureTables(tables, 'area'), ['area']);
    assert.deepEqual(matchGpkgFeatureTables(tables, 'Fields'), []);
  });

  it('ne fusionne pas toutes les tables si hint inconnu', () => {
    const tables = ['apiary', 'area', 'tracks'];
    assert.deepEqual(matchGpkgFeatureTables(tables, 'Champignon'), []);
  });

  it('bees — tables attributaires Pollen_Consumption et Reviews', () => {
    const tables = ['apiary', 'area', 'tracks', 'Pollen_Consumption', 'Reviews'];
    assert.deepEqual(
      matchGpkgTables(tables, 'Pollen_Consumption'),
      ['Pollen_Consumption'],
    );
    assert.deepEqual(
      matchGpkgTables(tables, resolveGpkgTableHint('Apiary_Reviews', './datasets/bees.gpkg|layername=Reviews')),
      ['Reviews'],
    );
  });

  it('Apiary → apiary (casse)', () => {
    const tables = ['apiary', 'area', 'tracks'];
    assert.deepEqual(
      matchGpkgFeatureTables(tables, resolveGpkgTableHint('Apiary', './datasets/bees.gpkg|layername=apiary')),
      ['apiary'],
    );
  });
});
