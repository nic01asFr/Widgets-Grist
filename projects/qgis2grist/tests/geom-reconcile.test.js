/**
 * Tests recalage geomType qgis2grist.
 * node --test projects/qgis2grist/tests/geom-reconcile.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  reconcileLayerGeometry,
  geometryFieldsForType,
  stripGeometryFields,
} = require('../lib/geom-reconcile.js');

function detectGeomTypeFromFeatures(features) {
  const votes = { Point: 0, Line: 0, Polygon: 0 };
  for (const f of features.slice(0, 50)) {
    const t = (f.geometry?.type || '').toLowerCase();
    if (t.includes('polygon')) votes.Polygon++;
    else if (t.includes('linestring') || t === 'multiline') votes.Line++;
    else if (t.includes('point')) votes.Point++;
  }
  if (votes.Polygon >= votes.Point && votes.Polygon >= votes.Line) return 'Polygon';
  if (votes.Line >= votes.Point) return 'Line';
  if (votes.Point > 0) return 'Point';
  return 'Polygon';
}

function flattenGeoJsonFeatures(features, fields, geomType) {
  return features.map((feat, i) => {
    const row = { _localId: i + 1 };
    if (geomType === 'Point') {
      row.latitude = feat.geometry.coordinates[1];
      row.longitude = feat.geometry.coordinates[0];
    } else {
      row.geometry_json = JSON.stringify(feat.geometry);
    }
    return row;
  });
}

describe('geom-reconcile', () => {
  it('recalé Polygon quand XML disait Point', () => {
    const features = [{
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[1, 43], [2, 43], [2, 44], [1, 44], [1, 43]]],
      },
      properties: {},
    }];
    const baseFields = [{ name: 'plant_species', gType: 'Text' }];
    const out = reconcileLayerGeometry(
      'Point', baseFields, features, true,
      detectGeomTypeFromFeatures, flattenGeoJsonFeatures
    );
    assert.equal(out.geomType, 'Polygon');
    assert.ok(out.fields.some((f) => f.name === 'geometry_json'));
    assert.ok(out.rows[0].geometry_json.includes('Polygon'));
  });

  it('conserve Point si features point', () => {
    const features = [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [5.4, 43.5] },
      properties: {},
    }];
    const out = reconcileLayerGeometry(
      'Point', [], features, true,
      detectGeomTypeFromFeatures, flattenGeoJsonFeatures
    );
    assert.equal(out.geomType, 'Point');
    assert.equal(out.rows[0].latitude, 43.5);
  });

  it('stripGeometryFields retire colonnes géo', () => {
    const fields = [
      { name: 'a' },
      { name: 'geometry_json' },
      { name: 'latitude' },
    ];
    assert.deepEqual(stripGeometryFields(fields).map((f) => f.name), ['a']);
  });

  it('geometryFieldsForType', () => {
    assert.equal(geometryFieldsForType('Point').length, 2);
    assert.equal(geometryFieldsForType('Polygon').length, 3);
    assert.equal(geometryFieldsForType('No geometry').length, 0);
  });

  it('table attributaire — pas de colonnes géo', () => {
    const features = [{
      type: 'Feature',
      geometry: null,
      properties: { percentage: 42, apiary_uuid: 'abc' },
    }];
    const baseFields = [
      { name: 'percentage', gType: 'Int' },
      { name: 'apiary_uuid', gType: 'Ref:Apiary' },
    ];
    const out = reconcileLayerGeometry(
      'No geometry', baseFields, features, true,
      detectGeomTypeFromFeatures, (feats, fields) =>
        feats.map((f, i) => ({ _localId: i + 1, ...f.properties })),
    );
    assert.equal(out.geomType, 'No geometry');
    assert.ok(!out.fields.some((f) => f.name === 'geometry_json'));
    assert.equal(out.rows[0].percentage, 42);
  });
});
