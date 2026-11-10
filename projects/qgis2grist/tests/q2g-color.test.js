/**
 * Q2GColor : chaque fonction est identique a l'original qu'elle remplace.
 * node --test projects/qgis2grist/tests/q2g-color.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../lib/q2g-color.js');
const qmlDecl = require('../lib/qml-to-declarative.js');
const remoteMcp = require('../lib/parse-remote-mcp.js');
const qmlStyle = require('../lib/qml-style-parser.js');

// Copie litterale de rgbaCssToHex d'index_v2.html (08/11/2026), seule des quatre non exportee.
function rgbaCssToHexIndexV2(str) {
  if (!str) return null;
  if (str.startsWith('#')) return str.slice(0, 7).toLowerCase();
  const m = str.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (!m) return null;
  return '#' + [m[1], m[2], m[3]].map(v => Math.round(+v).toString(16).padStart(2, '0')).join('');
}

const CORPUS = [
  '', null, undefined, 0, 5, true, {}, [], ' ', 'red', 'transparent',
  '#', '#a', '#abc', '#ABC', '#abcd', '#abcdef', '#ABCDEF', '#abcdef12', '#ABCDEF80', ' #FFF ', ' #ffffff ', '#12345g',
  'rgb(1,2,3)', 'rgb(1, 2, 3)', 'rgba(255, 0, 10, 0.5)', 'RGBA(255,0,10,1)', 'rgb( 1.5 , 2.2 , 3.7 )', 'rgba( 1.5 , 2.2 , 3.7 , 1)',
  'rgb(300,2,3)', 'rgb(-1,2,3)', 'rgb(1,2)', 'color: rgb(10,20,30)',
  '1,2,3,255', '255,0,0,255', '255, 128, 0, 255', '300,0,0', 'a,b,c', '1,2', '12', '0,0,0',
];

describe('Q2GColor : equivalence avec les originaux', () => {
  const sortie = (f, ...a) => { try { return { v: f(...a) }; } catch (e) { return { e: e.constructor.name }; } };

  it('rgbaCssToHex = index_v2.html', () => {
    for (const c of CORPUS) assert.deepEqual(sortie(C.rgbaCssToHex, c), sortie(rgbaCssToHexIndexV2, c), JSON.stringify(c));
  });
  it('normalizeHex = qml-to-declarative (avec et sans repli)', () => {
    for (const c of CORPUS) {
      assert.deepEqual(sortie(C.normalizeHex, c), sortie(qmlDecl.normalizeHex, c), JSON.stringify(c));
      assert.deepEqual(sortie(C.normalizeHex, c, '#123456'), sortie(qmlDecl.normalizeHex, c, '#123456'), JSON.stringify(c));
    }
  });
  it('normalizeHexLoose = parse-remote-mcp', () => {
    for (const c of CORPUS) assert.deepEqual(sortie(C.normalizeHexLoose, c), sortie(remoteMcp.normalizeHex, c), JSON.stringify(c));
  });
  it('rgbaStringToHex = qml-style-parser', () => {
    for (const c of CORPUS) assert.deepEqual(sortie(C.rgbaStringToHex, c), sortie(qmlStyle.rgbaStringToHex, c), JSON.stringify(c));
  });
  it('valeurs de reference', () => {
    assert.equal(C.rgbaCssToHex('rgba(255, 0, 10, 0.5)'), '#ff000a');
    assert.equal(C.rgbaCssToHex('#ABC'), '#abc');               // non etendu, contrairement a normalizeHex
    assert.equal(C.normalizeHex('#ABC'), '#aabbcc');
    assert.equal(C.normalizeHex('rouge'), '#808080');
    assert.equal(C.normalizeHexLoose(''), '#888888');
    assert.equal(C.normalizeHexLoose('rouge'), 'rouge');         // texte inchange
    assert.equal(C.rgbaStringToHex('255,128,0,255'), '#ff8000');
  });
  it('les quatre comportements restent distincts (pas d unification silencieuse)', () => {
    assert.notEqual(C.rgbaCssToHex('#abc'), C.normalizeHex('#abc'));
    assert.notEqual(C.normalizeHexLoose('rouge'), C.normalizeHex('rouge'));
  });
});
