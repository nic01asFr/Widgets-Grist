/**
 * Phase E — validation binding Bee Farming (qfield_bees.zip réel).
 * Pipeline : QGS styles + widgets Range → buildSceneManifest → controls[].
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Scene = require('../lib/scene-manifest.js');
const Q2G = require('../lib/qml-to-declarative.js');

const FIX = path.join(__dirname, 'fixtures');
const BEES = path.join(FIX, 'web', 'qfield_bees.zip');
const INSPECT = path.join(FIX, 'inspect_qfield_styles.py');

function loadBeesLayers() {
  assert.ok(fs.existsSync(BEES), 'télécharger qfield_bees.zip (scripts/download-qfield-samples.ps1)');
  const out = execFileSync('python', [INSPECT, BEES], { encoding: 'utf8' });
  const layers = JSON.parse(out);
  const imported = {};
  for (const layer of layers) imported[layer.name] = layer;
  return { layers, imported };
}

describe('Bee Farming — binding controls E1', () => {
  it('Pollen_Consumption — range depuis widget Range (0–100)', () => {
    const { imported } = loadBeesLayers();
    const pollen = imported.Pollen_Consumption;
    assert.ok(pollen, 'couche Pollen_Consumption');
    const pct = pollen.fields.find((f) => f.name === 'percentage');
    assert.equal(pct._rangeMin, 0);
    assert.equal(pct._rangeMax, 100);

    const manifest = Scene.buildSceneManifest(imported, null, 'qfield_bees.zip');
    const ml = manifest.layers.find((l) => l.id === 'Pollen_Consumption');
    assert.ok(ml);
    const range = ml.controls.find((c) => c.field === 'percentage' && c.type === 'range');
    assert.ok(range, 'control range percentage');
    assert.equal(range.min, 0);
    assert.equal(range.max, 100);
    assert.equal(range.active, false);
  });

  it('Apiary — select bee_species (pointCluster → categorized)', () => {
    const { imported } = loadBeesLayers();
    const apiary = imported.Apiary;
    assert.equal(apiary.style.type, 'categorizedSymbol');
    assert.equal(apiary.style.field, 'bee_species');

    const decl = Q2G.qmlStyleToDeclarative(apiary.style);
    assert.equal(decl.kind, 'categorized');
    const manifest = Scene.buildSceneManifest(imported, null, 'qfield_bees.zip');
    const ml = manifest.layers.find((l) => l.id === 'Apiary');
    const sel = ml.controls.find((c) => c.type === 'select');
    assert.ok(sel);
    assert.equal(sel.field, 'bee_species');
    assert.ok(sel.values.length >= 3);
  });

  it('Fields — select plant_species', () => {
    const { imported } = loadBeesLayers();
    const manifest = Scene.buildSceneManifest(imported, null, 'qfield_bees.zip');
    const ml = manifest.layers.find((l) => l.id === 'Fields');
    assert.ok(ml);
    assert.equal(ml.style.declarative.kind, 'categorized');
    assert.equal(ml.controls[0].field, 'plant_species');
    assert.equal(ml.controls[0].type, 'select');
  });

  it('manifest complet — au moins 3 couches avec controls', () => {
    const { imported } = loadBeesLayers();
    const manifest = Scene.buildSceneManifest(imported, null, 'qfield_bees.zip');
    const withControls = manifest.layers.filter((l) => l.controls?.length);
    assert.ok(withControls.length >= 3, `attendu ≥3, got ${withControls.length}`);
    assert.equal(manifest.version, '0.2.1');
  });
});
