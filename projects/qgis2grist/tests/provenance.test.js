const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Q2G = require('../lib/provenance.js');

describe('buildSourceStrateLite', () => {
  it('format D8 par défaut', () => {
    const s = Q2G.buildSourceStrateLite('demo.gpkg');
    assert.equal(s.corpus, 'qgis-import');
    assert.equal(s.ref_id, null);
    assert.equal(s.authority, 'demo.gpkg');
    assert.equal(s.licence, 'unknown');
    assert.equal(s.statut, 'a_verifier');
    assert.match(s.millesime, /^\d{4}$/);
  });
});

describe('buildImportProvenance', () => {
  it('sources import + une par couche', () => {
    const prov = Q2G.buildImportProvenance({
      batiments: { displayName: 'Bâtiments', geomType: 'Polygon' },
      flood: { displayName: 'Inondation', geomType: 'Polygon' },
    }, 'projet.qgz', { title: 'Carte flood test' });

    assert.equal(prov.sources.length, 3);
    assert.equal(prov.sources[0].authority, 'Carte flood test');
    assert.equal(prov.sources[1].ref_id, 'batiments');
    assert.equal(prov.classification, 'internal');
    assert.equal(prov.source_info.source.referential, 'qgis2grist');
    assert.equal(prov.provenance[0].platform_id, 'widgets-grist-qgis2grist');
    assert.ok(prov.provenance[0].ingested_at);
  });

  it('formatProvenanceLabel', () => {
    const prov = Q2G.buildImportProvenance({ a: { displayName: 'A' } }, 'x.gpkg');
    const label = Q2G.formatProvenanceLabel(prov);
    assert.ok(label.includes('x.gpkg'));
  });
});
