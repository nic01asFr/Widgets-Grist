/**
 * Tests de la reconnaissance des fichiers JSON.
 * node --test "projects/Atlas/tests/ouvrir-fichier.test.js"
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { natureJson, messageNature } from '../lib/ouvrir-fichier.js';

describe('natureJson', () => {
  it('un GeoJSON, collection ou entité seule', () => {
    assert.equal(natureJson({ type: 'FeatureCollection', features: [] }), 'geojson');
    assert.equal(natureJson({ type: 'Feature', geometry: null, properties: {} }), 'geojson');
  });

  it('une scène 0.2.x, nue ou enveloppée', () => {
    const scene = { version: '0.2.2', layers: [{ id: 'bati', name: 'Bâti', geometry_type: 'Polygon' }] };
    assert.equal(natureJson(scene), 'scene');
    assert.equal(natureJson({ scene }), 'scene');
    assert.equal(natureJson({ manifest: scene }), 'scene');
  });

  it('un projet Atlas, par sa version ou par ses couches', () => {
    assert.equal(natureJson({ version: '2.2-atlas-binding', layers: [] }), 'projet');
    assert.equal(natureJson({ layers: [{ name: 'Voirie', geometryType: 'LineString', geojson: {} }] }), 'projet');
  });

  it('une scène d’une version non lue n’est pas prise pour une scène', () => {
    // Même garde que ?scene= : ce qui est refusé là n'est pas accepté ici.
    const r = natureJson({ version: '9.9', layers: [{ id: 'x', name: 'x' }] });
    assert.notEqual(r, 'scene');
  });

  it('rien de reconnaissable', () => {
    for (const v of [null, 42, 'texte', [], {}, { layers: 'non' }]) {
      assert.equal(natureJson(v), null, JSON.stringify(v));
    }
  });
});

describe('messageNature', () => {
  it('chaque nature a sa phrase, et l’inconnu aussi', () => {
    for (const n of ['scene', 'projet', 'geojson', null]) {
      assert.ok(messageNature(n).length > 10, String(n));
    }
  });
});
