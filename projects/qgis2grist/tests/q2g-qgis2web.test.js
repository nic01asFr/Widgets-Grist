'use strict';
/**
 * Tests de lib/q2g-qgis2web.js (lecture des exports qgis2web / BigQgisMCP), sans DOM.
 *
 * Deux familles :
 *  - equivalence : la sortie du module sur les fixtures reelles est comparee aux golden
 *    captures dans le navigateur avec la page d'origine (tests/golden/parse/*.json) ;
 *  - unitaires : fonctions pures et aiguillage, avec dependances injectees.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Q = require('../lib/q2g-qgis2web.js');
const Schema = require('../lib/q2g-schema.js');
const RemoteMcp = require('../lib/parse-remote-mcp.js');
const { FauxJSZip, zipDepuisTextes, normaliser, normaliserCouche } = require('./q2g-qgis2web.helpers.js');

const FIX = path.join(__dirname, 'fixtures');
const GOLDEN = path.join(__dirname, 'golden', 'parse');

const silencieux = { log() {}, warn() {} };

/** Dependances de base : tout est injecte, rien n'est lu dans les globaux. */
function deps(extra) {
  return Object.assign({
    JSZip: FauxJSZip,
    buildLayerFromGeojson: Schema.buildLayerFromGeojson,
    remoteMcp: RemoteMcp,
    logger: silencieux,
  }, extra || {});
}

function golden(id) {
  return JSON.parse(fs.readFileSync(path.join(GOLDEN, 'parse-' + id + '.json'), 'utf8'));
}

// ── Constructeurs de HTML synthetique ─────────────────────────

function carre(x, y, props) {
  return {
    type: 'Feature',
    properties: props,
    geometry: { type: 'Polygon', coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]] },
  };
}

function point(x, y, props) {
  return { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [x, y] } };
}

function fc(features) {
  return { type: 'FeatureCollection', name: 'jeu', features };
}

function polygones(n, champ) {
  const f = [];
  for (let i = 0; i < n; i++) f.push(carre(i * 2, 0, { [champ]: i, nom: 'zone ' + i }));
  return fc(f);
}

function points(n, champ) {
  const f = [];
  for (let i = 0; i < n; i++) f.push(point(i, 1, { [champ]: i, nom: 'pt ' + i }));
  return fc(f);
}

// ═══════════════════════════════════════════════════════════════
// Equivalence avec les golden du navigateur
// ═══════════════════════════════════════════════════════════════

const CAS_HTML = [
  ['nimes_flood_html', 'qgis2grist_nimes_flood.html'],
  ['marseille4e_webmap_html', 'qgis2grist_marseille4e_webmap.html'],
  ['webmap_marseille4e_user_html', 'webmap_marseille4e_user.html'],
];

for (const [id, fichier] of CAS_HTML) {
  test('golden ' + id + ' : couches et meta identiques a la page d\'origine', async () => {
    const g = golden(id);
    const html = fs.readFileSync(path.join(FIX, fichier), 'utf8');
    let meta = null;
    const couches = await Q.parseQgis2webHtml(html, deps({ onMeta: (m) => { meta = m; } }));
    assert.equal(couches.length, g.nbCouches);
    assert.deepEqual(couches.map(normaliserCouche), g.couches);
    assert.deepEqual(normaliser(meta), g.meta);
  });
}

for (const [id, fichier] of [['gam_communes_zip', 'gam_communes.zip'], ['pp_cibles_zip', 'pp_cibles.zip']]) {
  test('golden ' + id + ' : parseZipFile identique a la page d\'origine', async () => {
    const g = golden(id);
    const octets = fs.readFileSync(path.join(FIX, fichier));
    let meta = null;
    const ab = octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.length);
    const couches = await Q.parseZipFile(ab, fichier, deps({ onMeta: (m) => { meta = m; } }));
    assert.equal(couches.length, g.nbCouches);
    assert.deepEqual(couches.map(normaliserCouche), g.couches);
    assert.deepEqual(normaliser(meta), g.meta);
  });
}

test('golden unitaires : rgbaCssToHex et parseQgis2webStyleBody', () => {
  const u = JSON.parse(fs.readFileSync(path.join(GOLDEN, 'unitaires.json'), 'utf8'));
  const attendu = u.unitaires || u;
  const entrees = ['rgba(255,0,0,1)', 'rgb(10, 20, 30)', '#ABCDEF12', '#abc', 'rgba(1.4,2.6,3,0.5)', 'red', '', null];
  assert.deepEqual(normaliser(entrees.map((c) => [c, Q.rgbaCssToHex(c)])), attendu.rgbaCssToHex);

  const categorise = "switch(String(feature.properties['usage'])) { case 'bati': style = {fillColor: '#ff0000', color:'#000'}; break; case 'jardin': style = {fillColor: 'rgba(0,255,0,1)'}; break; default: style = {fillColor:'#cccccc'}; }";
  const gradue = 'var h = feature.properties.hauteur; if (h < 5) { return {fillColor: \'#ffffb2\'}; } else if (h < 10) { return {fillColor: \'#fd8d3c\'}; } else { return {fillColor: \'#bd0026\'}; }';
  const sortie = {
    categorise: Q.parseQgis2webStyleBody(categorise),
    gradue: Q.parseQgis2webStyleBody(gradue),
    vide: Q.parseQgis2webStyleBody('return {};'),
    sansChamp: Q.parseQgis2webStyleBody('return 1;'),
  };
  assert.deepEqual(normaliser(sortie), attendu.parseQgis2webStyleBody);
});

// ═══════════════════════════════════════════════════════════════
// Fonctions pures
// ═══════════════════════════════════════════════════════════════

test('rgbaCssToHex : formats CSS usuels', () => {
  assert.equal(Q.rgbaCssToHex('rgba(255,128,0,0.5)'), '#ff8000');
  assert.equal(Q.rgbaCssToHex('#ABCDEF'), '#abcdef');
  assert.equal(Q.rgbaCssToHex('nimporte'), null);
  assert.equal(Q.rgbaCssToHex(undefined), null);
});

test('deriveLayerNameFromVar : prefixes, suffixes et casse', () => {
  assert.equal(Q.deriveLayerNameFromVar('json_Layer_Name_0'), 'Layer name');
  assert.equal(Q.deriveLayerNameFromVar('FLOOD_JSON'), 'Flood');
  assert.equal(Q.deriveLayerNameFromVar('BUILDINGS_JSON'), 'Buildings');
  assert.equal(Q.deriveLayerNameFromVar('json_Flooddata_0'), 'Flooddata');
  assert.equal(Q.deriveLayerNameFromVar('routes_Data'), 'Routes');
});

test('findMatchingBrace : accolades imbriquees, chaines, echappements, desequilibre', () => {
  assert.equal(Q.findMatchingBrace('{"a":{"b":1}} reste'), 12);
  assert.equal(Q.findMatchingBrace('{"a":"}"}'), 8);
  assert.equal(Q.findMatchingBrace('{"a":"\\"}"}'), 10);
  assert.equal(Q.findMatchingBrace('{"a":{"b":1}'), -1);
  assert.equal(Q.findMatchingBrace(''), -1);
});

test('parseQgis2webStyleBody : categorise, symbole unique et classes masquees', () => {
  const cat = Q.parseQgis2webStyleBody(
    "switch(String(feature.properties['type'])) {"
    + " case 'a': return {fillColor: 'rgba(255,0,0,1)', fillOpacity: 1};"
    + " case 'b': return {fillColor: '#00ff00', fillOpacity: 0};"
    + " case 'c': return {fillColor: '#0000ff'}; }");
  assert.equal(cat.type, 'categorizedSymbol');
  assert.equal(cat.field, 'type');
  // la classe b est transparente : elle est ignoree
  assert.deepEqual(cat.categories.map((c) => c.value), ['a', 'c']);
  assert.equal(cat.categories[0].color, '#ff0000');

  const unique = Q.parseQgis2webStyleBody("return {fillColor: '#123456', color: '#000000'};");
  assert.deepEqual(unique, { type: 'singleSymbol', field: null, color: '#123456', categories: [] });

  assert.equal(Q.parseQgis2webStyleBody("return {fillColor: '#123456', fillOpacity: 0};"), null);
});

test('parseQgis2webStyleBody : graduation par if/else et par ternaires chaines', () => {
  const ifelse = Q.parseQgis2webStyleBody(
    "var v = feature.properties['hauteur'];"
    + " if (v < 1) { return {fillColor: '#aaaaaa'}; } else if (v < 3) { return {fillColor: '#888888'}; }"
    + " else { return {fillColor: '#222222'}; }");
  assert.equal(ifelse.type, 'graduatedSymbol');
  assert.equal(ifelse.field, 'hauteur');
  assert.deepEqual(ifelse.categories.map((c) => [c.lower, c.upper]), [[0, 1], [1, 3], [3, Infinity]]);

  const croissant = Q.parseQgis2webStyleBody(
    "return {fillColor: feature.properties.v < 0.5 ? '#111111' : feature.properties.v < 1 ? '#222222' : '#333333'};");
  assert.equal(croissant.type, 'graduatedSymbol');
  assert.deepEqual(croissant.categories.map((c) => [c.lower, c.upper, c.color]),
    [[0, 0.5, '#111111'], [0.5, 1, '#222222'], [1, Infinity, '#333333']]);

  const decroissant = Q.parseQgis2webStyleBody(
    "return {fillColor: feature.properties.v > 2 ? '#aa0000' : feature.properties.v > 1 ? '#bb0000' : '#cc0000'};");
  assert.deepEqual(decroissant.categories.map((c) => [c.lower, c.upper, c.color]),
    [[0, 1, '#cc0000'], [1, 2, '#bb0000'], [2, Infinity, '#aa0000']]);
});

const FN_PALETTES = `
function floodColor(h) {
  if (h > 2) return '#08306b';
  if (h > 1) return '#2171b5';
  return '#9ecae1';
}
function buildingColor(h) {
  if (h > 2) return '#bd0026';
  if (h > 1) return '#fd8d3c';
  return '#ffffb2';
}
function utilitaire(e) { return e.target.style.color = '#ff0000'; }
function lireDom(x) { return document.getElementById('a') && '#123456'; }
`;

test('extractColorScaleFns : ne garde que les fonctions de palette scalaires', () => {
  const fns = Q.extractColorScaleFns(FN_PALETTES);
  assert.deepEqual(Object.keys(fns).sort(), ['buildingColor', 'floodColor']);
  assert.equal(fns.floodColor.type, 'graduatedSymbol');
  assert.equal(fns.floodColor._paramName, 'h');
  assert.equal(fns.floodColor.field, null);
  assert.ok(fns.floodColor.categories.length >= 2);
});

test('resolveColorFnFields : champ trace depuis le site d\'appel (variable locale ou acces direct)', () => {
  const fns = Q.extractColorScaleFns(FN_PALETTES);
  const html = FN_PALETTES + `
    function applyWaterLevel(level) {
      var htMax = parseFloat(p.ht_max);
      return floodColor(htMax);
    }
    function applyBuilding(p) { return buildingColor(p.max_water_height); }
  `;
  const champs = Q.resolveColorFnFields(html, fns);
  assert.equal(champs.floodColor, 'ht_max');
  assert.equal(champs.buildingColor, 'max_water_height');
});

test('findColorFnCallerVars : variable GeoJSON appelante par L.geoJSON puis par repli', () => {
  const fns = Q.extractColorScaleFns(FN_PALETTES);
  const html = FN_PALETTES + `
    var layerA = L.geoJSON(FLOOD_JSON, { style: function (f) { return {fillColor: floodColor(f.properties.ht_max)}; } });
    BUILD_JSON.features.forEach(function (f) { var c = buildingColor(f.properties.v); });
  `;
  const appelants = Q.findColorFnCallerVars(html, fns, ['FLOOD_JSON']);
  assert.equal(appelants.floodColor, 'FLOOD_JSON');
  // sans varName connu : le repli remonte au dernier .features.forEach
  assert.equal(appelants.buildingColor, 'BUILD_JSON');
});

test('fixPalettesByLegend : reconstruit les palettes depuis les seuils de la legende', () => {
  const meta = {
    legendItems: [
      { color: '#c6dbef', rawColor: '#c6dbef', label: '0-1 m', circle: false },
      { color: '#6baed6', rawColor: '#6baed6', label: '1-2 m', circle: false },
      { color: '#08519c', rawColor: '#08519c', label: '> 2 m', circle: false },
      { color: '#ffffb2', rawColor: '#ffffb2', label: '0-1 m', circle: true },
    ],
    inferredStyles: {},
  };
  // 'label' doit etre unique dans l'extraction d'origine ; on ne verifie ici que la reconstruction
  Q.fixPalettesByLegend(meta, deps());
  const flood = meta.inferredStyles.floodStyle;
  assert.equal(flood.type, 'graduatedSymbol');
  assert.equal(flood.field, 'ht_max');
  assert.deepEqual(flood.categories.map((c) => [c.lower, c.upper]), [[0, 1], [1, 2], [2, Infinity]]);
});

test('fixPalettesByLegend : sans legende ou sans styles, ne fait rien', () => {
  const vide = { legendItems: [], inferredStyles: { floodStyle: 1 } };
  Q.fixPalettesByLegend(vide, deps());
  assert.equal(vide.inferredStyles.floodStyle, 1);
  assert.doesNotThrow(() => Q.fixPalettesByLegend(null, deps()));
  assert.doesNotThrow(() => Q.fixPalettesByLegend({ legendItems: [{}] }, deps()));
});

test('fixPalettesByLegend : repli par couleurs de legende, echange les palettes inversees', () => {
  const chaud = { type: 'graduatedSymbol', field: 'a', categories: [{ color: '#ff0000' }, { color: '#ff8800' }] };
  const froid = { type: 'graduatedSymbol', field: 'b', categories: [{ color: '#0000ff' }, { color: '#0088ff' }] };
  const meta = {
    // etiquettes sans seuil : pas de reconstruction possible
    legendItems: [
      { color: '#ff0000', label: 'Batiments', circle: true },
      { color: '#0000ff', label: 'Eau', circle: false },
    ],
    inferredStyles: { floodStyle: chaud, buildingStyle: froid },
  };
  Q.fixPalettesByLegend(meta, deps());
  assert.equal(meta.inferredStyles.floodStyle, froid);
  assert.equal(meta.inferredStyles.buildingStyle, chaud);
});

test('extractBigQgisMcpMeta : null hors BigQgisMCP', () => {
  assert.equal(Q.extractBigQgisMcpMeta('<html><body>carte</body></html>', deps()), null);
});

const HTML_BIGQGIS = `<html><body>
<div class="map-title">Inondation Test <small>Scenario 1</small></div>
<div id="slider-panel"></div><div id="stats-panel"></div>
<script>
slider.noUiSlider.create(el, { range: { min: 0, max: 4 } });
function floodColor(h) { if (h > 2) return '#08306b'; if (h > 1) return '#2171b5'; return '#9ecae1'; }
function buildingColor(h) { if (h > 2) return '#bd0026'; if (h > 1) return '#fd8d3c'; return '#ffffb2'; }
var legend = '<div><span class="legend-swatch" style="background:#9ecae1"></span> 0-1 m</div>'
 + '<div><span class="legend-swatch" style="background:#2171b5"></span> 1-2 m</div>'
 + '<div><span class="legend-swatch" style="background:#08306b"></span> &gt; 2 m</div>'
 + '<div><span class="legend-circle" style="background:#ffffb2"></span> Bati 0-1 m</div>';
</script>
Statistiques — Zone test<br>Source : IGN BD TOPO
</body></html>`;

test('extractBigQgisMcpMeta : titre, slider, legende, source et palettes', () => {
  const lignes = [];
  const meta = Q.extractBigQgisMcpMeta(HTML_BIGQGIS, { logger: { log: (...a) => lignes.push(a.join(' ')), warn: (...a) => lignes.push(a.join(' ')) } });
  assert.ok(meta);
  assert.equal(meta.title, 'Inondation Test');
  assert.equal(meta.subtitle, 'Scenario 1');
  assert.equal(meta.sliderMin, 0);
  assert.equal(meta.sliderMax, 4);
  assert.equal(meta.statsTitle, 'Zone test');
  assert.equal(meta.source, 'IGN BD TOPO');
  assert.equal(meta.interactiveMap, 'flood');
  assert.equal(meta.legendItems.length, 4);
  assert.equal(meta.legendItems[2].label, '> 2 m');
  assert.equal(meta.legendItems[3].circle, true);
  assert.deepEqual(Object.keys(meta.colorScaleFns).sort(), ['buildingColor', 'floodColor']);
  assert.ok(meta.inferredStyles.floodStyle.categories.length >= 2);
  // la palette froide va a l'inondation, la chaude aux batiments
  assert.ok(lignes.some((l) => l.includes('[Palette init]')), 'le journal injecte recoit les traces');
});

// ═══════════════════════════════════════════════════════════════
// parseQgis2webHtml
// ═══════════════════════════════════════════════════════════════

function htmlQgis2web() {
  return `<html><script>
function style_Zones_0_0(feature) {
  switch(String(feature.properties['usage'])) {
    case 'a': return {fillColor: '#ff0000'};
    case 'b': return {fillColor: '#00ff00'};
  }
}
var json_Zones_0 = ${JSON.stringify(polygones(6, 'usage'))};
var json_Zones_copie = ${JSON.stringify(polygones(6, 'usage'))};
var json_Poi_1 = ${JSON.stringify(points(6, 'cat'))};
</script></html>`;
}

test('parseQgis2webHtml : couches, noms derives, style associe, doublons ecartes', async () => {
  const appels = [];
  const couches = await Q.parseQgis2webHtml(htmlQgis2web(), deps({ onMeta: (m) => appels.push(m) }));
  assert.equal(couches.length, 2, 'la copie a l\'identique (meme empreinte) est ecartee');
  assert.equal(couches[0].displayName, 'Zones');
  assert.equal(couches[0].varName, 'json_Zones_0');
  assert.equal(couches[0].geomType, 'Polygon');
  assert.equal(couches[0].style.type, 'categorizedSymbol');
  assert.equal(couches[0].style.field, 'usage');
  assert.equal(couches[1].geomType, 'Point');
  assert.equal(couches[1].style, undefined);
  assert.equal(appels.length, 0, 'pas de meta hors BigQgisMCP : onMeta n\'est pas appelee');
});

test('parseQgis2webHtml : sans onMeta, aucune erreur et aucun etat partage', async () => {
  const a = await Q.parseQgis2webHtml(htmlQgis2web(), deps());
  const b = await Q.parseQgis2webHtml(htmlQgis2web(), deps());
  assert.deepEqual(a.map((l) => l.name), b.map((l) => l.name));
});

test('parseQgis2webHtml : couche sans nom de variable -> "Couche N"', async () => {
  const html = '<script>L.geoJSON(' + JSON.stringify(polygones(5, 'v')) + ');</script>';
  const couches = await Q.parseQgis2webHtml(html, deps());
  assert.equal(couches.length, 1);
  assert.equal(couches[0].displayName, 'Couche 1');
  assert.equal(couches[0].varName, null);
});

test('parseQgis2webHtml : export multi-fichiers sans donnees -> erreur explicite', async () => {
  const html = '<html><script src="data/Zones_0.js"></script><script src="layers/x.js"></script></html>';
  await assert.rejects(Q.parseQgis2webHtml(html, deps()), /multi-fichiers.*Zones_0\.js, x\.js/);
});

test('parseQgis2webHtml : HTML sans donnees ni script externe -> aucune couche', async () => {
  assert.deepEqual(await Q.parseQgis2webHtml('<html>vide</html>', deps()), []);
});

test('parseQgis2webHtml : export QgisRemoteMCP rendu tel quel, sans meta', async () => {
  const layersData = [{
    name: 'Voirie',
    color: '#ff0000',
    geojson: polygones(3, 'x'),
    legend: [],
  }];
  const html = '<script>var layersData = ' + JSON.stringify(layersData) + ';</script>';
  const appels = [];
  const couches = await Q.parseQgis2webHtml(html, deps({ onMeta: (m) => appels.push(m) }));
  assert.equal(couches.length, 1);
  assert.equal(couches[0].displayName, 'Voirie');
  assert.equal(appels.length, 0);
});

test('parseQgis2webHtml : sans module QgisRemoteMCP, retombe sur le balayage FeatureCollection', async () => {
  const layersData = [{ name: 'Voirie', color: '#ff0000', geojson: polygones(3, 'x'), legend: [] }];
  const html = '<script>var layersData = ' + JSON.stringify(layersData) + ';</script>';
  // remoteMcp: false -> _first() le retient (false != null), pas de fonction : on l'ignore
  const couches = await Q.parseQgis2webHtml(html, deps({ remoteMcp: false }));
  assert.equal(couches.length, 1);
  assert.equal(couches[0].varName, null);
});

function htmlBigQgisComplet() {
  const flood = polygones(4, 'ht_max');
  const bati = points(4, 'max_water_height');
  return `<html><body>
<div class="map-title">Titre <small>Sous-titre</small></div>
<div id="slider-panel"></div><div id="stats-panel"></div>
<script>
slider.noUiSlider.create(el, { range: { min: 0, max: 3 } });
function floodColor(h) { if (h > 2) return '#08306b'; if (h > 1) return '#2171b5'; return '#9ecae1'; }
function buildingColor(h) { if (h > 2) return '#bd0026'; if (h > 1) return '#fd8d3c'; return '#ffffb2'; }
var FLOOD_JSON = ${JSON.stringify(flood)};
var BUILDINGS_JSON = ${JSON.stringify(bati)};
function applyWaterLevel(level) {
  floodLayer.eachLayer(function (l) { var htMax = parseFloat(l.feature.properties.ht_max); l.setStyle({fillColor: floodColor(htMax)}); });
}
</script>
Statistiques — Test<br>Source : BD TOPO
</body></html>`;
}

test('parseQgis2webHtml : BigQgisMCP -> meta confiee a onMeta, identique a parseQgis2webHtmlWithMeta', async () => {
  const recues = [];
  const couches = await Q.parseQgis2webHtml(htmlBigQgisComplet(), deps({ onMeta: (m) => recues.push(m) }));
  assert.equal(couches.length, 2);
  assert.equal(recues.length, 1);
  assert.equal(recues[0].title, 'Titre');
  assert.equal(recues[0].interactiveMap, 'flood');
  assert.ok(recues[0].inferredStyles.floodStyle);

  const res = await Q.parseQgis2webHtmlWithMeta(htmlBigQgisComplet(), deps());
  assert.equal(res.layers.length, 2);
  assert.deepEqual(normaliser(res.meta), normaliser(recues[0]));
  assert.deepEqual(res.layers.map((l) => l.name), couches.map((l) => l.name));
});

test('parseQgis2webHtmlWithMeta : meta null hors BigQgisMCP', async () => {
  const res = await Q.parseQgis2webHtmlWithMeta(htmlQgis2web(), deps());
  assert.equal(res.meta, null);
  assert.equal(res.layers.length, 2);
});

// ═══════════════════════════════════════════════════════════════
// ZIP : aiguillage et lecture
// ═══════════════════════════════════════════════════════════════

test('parseZipFile : qgis2web (index.html), libelles de lecture et prechauffage ignore', async () => {
  const etiquettes = [];
  const zip = zipDepuisTextes({ 'export/index.html': htmlQgis2web() });
  const faux = { loadAsync: async () => zip };
  const couches = await Q.parseZipFile(new ArrayBuffer(1), 'export.zip', deps({
    JSZip: faux,
    setReadingLabel: (l, s) => etiquettes.push([l, s]),
    yieldToUi: async () => {},
  }));
  assert.equal(couches.length, 2);
  assert.deepEqual(etiquettes[0], ['Décompression ZIP…', 'export.zip']);
  assert.deepEqual(etiquettes[1], ['Format qgis2web détecté…', 'extraction des couches Leaflet']);
  assert.ok(etiquettes.some(([l]) => l === 'Lecture des couches…') === false, 'index.html seul : repli, pas de fichiers layers');
});

test('parseZipFile : qgis2web avec data/*.js, un fichier par couche, doublons de nom ecartes', async () => {
  const zip = zipDepuisTextes({
    'data/Zones_0.js': 'var json_Zones_0 = ' + JSON.stringify(polygones(5, 'v')) + ';',
    'data/Zones_1.js': 'var json_Zones_0 = ' + JSON.stringify(polygones(7, 'v')) + ';',
    'data/Poi_2.js': 'var json_Poi_2 = ' + JSON.stringify(points(5, 'c')) + ';',
    'index.html': '<html></html>',
  });
  const etiquettes = [];
  const couches = await Q.parseZipFile(new ArrayBuffer(1), 'e.zip', deps({
    JSZip: { loadAsync: async () => zip },
    setReadingLabel: (l, s) => etiquettes.push(l + '|' + s),
    yieldToUi: async () => {},
  }));
  assert.deepEqual(couches.map((l) => l.displayName), ['Zones', 'Poi']);
  assert.ok(etiquettes.includes('Lecture des couches…|Zones_0.js'));
});

test('parseZipFile : meta BigQgisMCP d\'un fichier de couches transmise a onMeta', async () => {
  const zip = zipDepuisTextes({ 'layers/carte.js': htmlBigQgisComplet() });
  const recues = [];
  const couches = await Q.parseZipFile(new ArrayBuffer(1), 'b.zip', deps({
    JSZip: { loadAsync: async () => zip },
    onMeta: (m) => recues.push(m),
    yieldToUi: async () => {},
  }));
  assert.equal(couches.length, 2);
  assert.equal(recues.length, 1);
  assert.equal(recues[0].title, 'Titre');
});

test('parseZipFile : paquet QField (.qgz) -> parseQgzFile(ab, zip, nom) apres prechauffage sql.js', async () => {
  const zip = zipDepuisTextes({ 'p.qgz': 'octets', 'data/a.gpkg': 'x' });
  const ordre = [];
  const res = await Q.parseZipFile(new ArrayBuffer(1), 'p.zip', deps({
    JSZip: { loadAsync: async () => zip },
    yieldToUi: async () => {},
    loadSqlJs: async () => { ordre.push('sql'); throw new Error('hors ligne'); },
    parseQgzFile: async (ab, z, nom) => { ordre.push('qgz'); assert.equal(z, zip); return [{ nom, taille: ab.byteLength === undefined ? Buffer.from(ab).length : ab.byteLength }]; },
  }));
  assert.deepEqual(ordre, ['sql', 'qgz'], 'un echec de sql.js est ignore');
  assert.equal(res[0].nom, 'p.qgz');
});

test('parseZipFile : .qgs direct -> parseQgsXml(texte, zip)', async () => {
  const zip = zipDepuisTextes({ 'projet.qgs': '<qgis/>' });
  let vu = null;
  await Q.parseZipFile(new ArrayBuffer(1), 'p.zip', deps({
    JSZip: { loadAsync: async () => zip },
    yieldToUi: async () => {},
    parseQgsXml: async (texte, z) => { vu = [texte, z]; return []; },
  }));
  assert.deepEqual(vu, ['<qgis/>', zip]);
});

test('parseZipFile : GeoJSON seuls', async () => {
  const zip = zipDepuisTextes({
    'a_b.geojson': JSON.stringify(polygones(3, 'v')),
    'casse.json': '{pas du json',
    'autre.json': JSON.stringify({ type: 'Feature' }),
  });
  const couches = await Q.parseZipFile(new ArrayBuffer(1), 'g.zip', deps({
    JSZip: { loadAsync: async () => zip },
    yieldToUi: async () => {},
  }));
  assert.equal(couches.length, 1);
  assert.equal(couches[0].displayName, 'a b');
});

test('parseZipFile : contenu non reconnu et projet QGIS illisible -> erreurs d\'origine', async () => {
  const sans = zipDepuisTextes({ 'readme.txt': 'x' });
  await assert.rejects(
    Q.parseZipFile(new ArrayBuffer(1), 'x.zip', deps({ JSZip: { loadAsync: async () => sans }, yieldToUi: async () => {} })),
    /Contenu du ZIP non reconnu/);
});

test('parseZipFile : JSZip absent -> erreur de dependance', async () => {
  await assert.rejects(
    Q.parseZipFile(new ArrayBuffer(1), 'x.zip', { JSZip: null, yieldToUi: async () => {}, logger: silencieux }),
    /JSZip|dependance/i);
});

test('parseQgis2webZip : repli sur index.html quand aucune couche ni GeoJSON isole', async () => {
  const zip = zipDepuisTextes({ 'index.html': htmlQgis2web() });
  const couches = await Q.parseQgis2webZip(zip, deps());
  assert.equal(couches.length, 2);
});

test('parseQgis2webZip : GeoJSON isoles ajoutes sans doubler les noms', async () => {
  const zip = zipDepuisTextes({
    'layers/z.js': 'var json_Zones_0 = ' + JSON.stringify(polygones(5, 'v')) + ';',
    'zones.geojson': JSON.stringify(polygones(5, 'v')),
    'poi.geojson': JSON.stringify(points(5, 'c')),
  });
  const couches = await Q.parseQgis2webZip(zip, deps());
  // 'Zones' (js) puis 'zones' (geojson) ont le meme nom de table : un seul est garde
  assert.deepEqual(couches.map((l) => l.displayName), ['Zones', 'poi']);
});

test('parseGeojsonFiles : nom derive du fichier, JSON invalide ignore', async () => {
  const zip = zipDepuisTextes({
    'dossier/mes_communes.geojson': JSON.stringify(polygones(3, 'v')),
    'mauvais.geojson': '<<<',
  });
  const couches = await Q.parseGeojsonFiles(zip, ['dossier/mes_communes.geojson', 'mauvais.geojson'], deps());
  assert.equal(couches.length, 1);
  assert.equal(couches[0].displayName, 'mes communes');
});

test('configure : les dependances par defaut s\'appliquent puis se surchargent', async () => {
  const recues = [];
  Q.configure(deps({ onMeta: (m) => recues.push(m) }));
  try {
    await Q.parseQgis2webHtml(htmlBigQgisComplet());
    assert.equal(recues.length, 1);
    await Q.parseQgis2webHtml(htmlBigQgisComplet(), { onMeta: null });
    assert.equal(recues.length, 1, 'une dependance explicite l\'emporte (onMeta ignoree car non fonction)');
  } finally {
    Q.configure({ onMeta: null, JSZip: null, remoteMcp: null, buildLayerFromGeojson: null, logger: null });
  }
});

test('API : toutes les fonctions de l\'extraction sont exportees sous leur nom d\'origine', () => {
  for (const n of [
    'parseZipFile', 'parseQgis2webHtml', 'parseQgis2webZip', 'parseGeojsonFiles', 'rgbaCssToHex',
    'parseQgis2webStyleBody', 'extractColorScaleFns', 'resolveColorFnFields', 'findColorFnCallerVars',
    'fixPalettesByLegend', 'extractBigQgisMcpMeta', 'extractQgis2webStyles', 'deriveLayerNameFromVar',
    'findMatchingBrace', 'configure',
  ]) assert.equal(typeof Q[n], 'function', n);
});
