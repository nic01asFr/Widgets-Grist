/**
 * Projets QField officiels (qfield.org/sample-projects) — structure + données.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const WEB = path.join(__dirname, 'fixtures', 'web');
const INSPECT = path.join(__dirname, 'fixtures', 'inspect_qfield_zip.py');

function inspectZip(name) {
  const zipPath = path.join(WEB, name);
  assert.ok(fs.existsSync(zipPath), 'télécharger : ' + name);
  const out = execFileSync('python', [INSPECT, zipPath], { encoding: 'utf8' });
  const layers = [];
  for (const line of out.split('\n')) {
    const t = line.trim();
    const m = t.match(/^- (.+?) \| (.+?) \| (\d+) entités \| (.+)$/);
    if (m) {
      layers.push({
        name: m[1],
        geometry: m[2],
        featureCount: parseInt(m[3], 10),
        gpkg: m[4] === 'None' ? null : m[4],
      });
    }
  }
  return { raw: out, layers };
}

describe('QField web — Bee Farming (qfield.org)', () => {
  it('archive complète qgz + gpkg + basemap', () => {
    assert.ok(fs.existsSync(path.join(WEB, 'qfield_bees.zip')));
    const { layers } = inspectZip('qfield_bees.zip');
    assert.ok(layers.length >= 6, 'projet multi-couches (' + layers.length + ')');
    const withGeom = layers.filter(l => l.geometry !== 'No geometry' && l.featureCount > 0);
    assert.ok(withGeom.length >= 3, 'couches spatiales');
    assert.ok(layers.some(l => l.name === 'Apiary'), 'couche Apiary');
    assert.ok(layers.some(l => l.name === 'Fields'), 'couche Fields');
  });
});

describe('QField web — Wastewater (qgep)', () => {
  it('3 GPKG qgep + réseau eaux usées', () => {
    assert.ok(fs.existsSync(path.join(WEB, 'qfield_wastewater.zip')));
    const { layers } = inspectZip('qfield_wastewater.zip');
    assert.ok(layers.length >= 20, 'projet qgep complet (' + layers.length + ' tables)');
    const reaches = layers.find(l => l.name === 'Reaches');
    const structures = layers.find(l => l.name === 'Wastewater structures');
    assert.ok(reaches && reaches.featureCount > 1000, 'Reaches ~4076');
    assert.ok(structures && structures.featureCount > 1000, 'structures ~2489');
  });
});
