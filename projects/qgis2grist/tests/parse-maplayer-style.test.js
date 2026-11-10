/**
 * parseMapLayerStyle — pointCluster + categorized imbriqué (qfield_bees.zip).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const QmlParser = require('../lib/qml-style-parser.js');
const Scene = require('../lib/scene-manifest.js');
const Q2G = require('../lib/qml-to-declarative.js');

const FIX = path.join(__dirname, 'fixtures');
const BEES = path.join(FIX, 'web', 'qfield_bees.zip');
const INSPECT = path.join(FIX, 'inspect_qfield_styles.py');

function loadBeesLayers() {
  assert.ok(fs.existsSync(BEES), 'télécharger qfield_bees.zip');
  const out = execFileSync('python', [INSPECT, BEES], { encoding: 'utf8' });
  const layers = JSON.parse(out);
  const imported = {};
  for (const layer of layers) imported[layer.name] = layer;
  return imported;
}

describe('parseMapLayerStyle (bees fixture)', () => {
  it('Apiary style → categorized bee_species avec value brute', () => {
    const { Apiary } = loadBeesLayers();
    const decl = Q2G.qmlStyleToDeclarative(Apiary.style);
    assert.equal(decl.kind, 'categorized');
    assert.equal(decl.field, 'bee_species');
    assert.ok(decl.stops.some(s => s.value === 'Apis Mellifera Mellifera'));
    assert.ok(decl.stops.some(s => s.label === 'European honey bee'));
  });

  it('Fields style → categorized plant_species', () => {
    const { Fields } = loadBeesLayers();
    const decl = Q2G.qmlStyleToDeclarative(Fields.style);
    assert.equal(decl.kind, 'categorized');
    assert.equal(decl.field, 'plant_species');
  });

  it('buildSceneManifest inclut controls[] sur Apiary, Fields, Pollen', () => {
    const imported = loadBeesLayers();
    const manifest = Scene.buildSceneManifest(imported, null, 'qfield_bees.zip');
    const apiary = manifest.layers.find(l => l.id === 'Apiary');
    const fields = manifest.layers.find(l => l.id === 'Fields');
    const pollen = manifest.layers.find(l => l.id === 'Pollen_Consumption');

    assert.ok(apiary.controls?.length, 'Apiary controls');
    assert.equal(apiary.controls.find(c => c.type === 'select')?.field, 'bee_species');

    assert.ok(fields.controls?.length, 'Fields controls');
    assert.equal(fields.controls[0].field, 'plant_species');

    const range = pollen.controls.find(c => c.type === 'range');
    assert.ok(range, 'Pollen range');
    assert.equal(range.max, 100);

    const manifestJson = JSON.stringify(manifest);
    assert.ok(manifestJson.includes('"controls"'), 'controls sérialisés');
  });
});

describe('pointCluster XML', () => {
  it('déballage pointCluster → categorizedSymbol', () => {
    const xml = `<renderer-v2 type="pointCluster">
      <renderer-v2 type="categorizedSymbol" attr="bee_species">
        <categories>
          <category value="Apis Mellifera" label="Buckfast bee" symbol="0"/>
          <category value="Apis Mellifera Carnica" label="Carniolan honey bee" symbol="1"/>
        </categories>
        <symbols>
          <symbol name="0"><Option name="color" value="225,87,89,255"/></symbol>
          <symbol name="1"><Option name="color" value="89,161,79,255"/></symbol>
        </symbols>
      </renderer-v2>
    </renderer-v2>`;
    const style = QmlParser.parseQmlStyle(xml);
    assert.equal(style.type, 'categorizedSymbol');
    assert.equal(style.field, 'bee_species');
    assert.equal(style.categories.length, 2);
    assert.equal(style.categories[0].value, 'Apis Mellifera');
  });

  it('ruleRenderer maladie ignoré si categorized imbriqué (score)', () => {
    const xml = `<maplayer type="vector">
      <renderer-v2 type="ruleRenderer">
        <rules>
          <rule filter="&quot;disease&quot; is not NULL" label="Diseases" symbol="0"/>
          <rule filter="ELSE" label="No disease information" symbol="1"/>
        </rules>
        <symbols>
          <symbol name="0"><Option name="color" value="245,158,11,255"/></symbol>
          <symbol name="1"><Option name="color" value="255,255,255,255"/></symbol>
        </symbols>
      </renderer-v2>
      <renderer-v2 type="pointCluster">
        <renderer-v2 type="categorizedSymbol" attr="bee_species">
          <categories>
            <category value="Apis Mellifera Mellifera" label="European honey bee" symbol="0"/>
          </categories>
          <symbols>
            <symbol name="0"><Option name="color" value="225,87,89,255"/></symbol>
          </symbols>
        </renderer-v2>
      </renderer-v2>
    </maplayer>`;
    const { DOMParser } = require('@xmldom/xmldom');
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const ml = doc.documentElement;
    const style = QmlParser.parseMapLayerStyle(ml);
    assert.equal(style.type, 'categorizedSymbol');
    assert.equal(style.field, 'bee_species');
  });
});
