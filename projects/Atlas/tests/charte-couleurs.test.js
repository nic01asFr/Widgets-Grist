// Calculs de couleur de la charte : analyse stricte, contraste WCAG, Lab, CIEDE2000, daltonisme, gris.
// node --test tests/charte-couleurs.test.js   (aucun accès réseau, aucune dépendance)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../lib/charte/couleurs.js';

// ---------------------------------------------------------------------------------------------------------------- analyse stricte
test('analyse : #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(), hsl() sont normalisés en minuscules', () => {
  assert.deepEqual(C.analyserCouleur('#ABC'), { hex: '#aabbcc', alpha: 1, source: 'hex' });
  assert.equal(C.normaliserCouleur('#C44536'), '#c44536');
  assert.equal(C.normaliserCouleur('  #C44536  '), '#c44536');
  assert.equal(C.normaliserCouleur('#C4453680'), '#c4453680');
  assert.equal(C.normaliserCouleur('#C44536ff'), '#c44536', 'opaque : pas de suffixe');
  assert.equal(C.normaliserCouleur('#f008'), '#ff000088');
  assert.equal(C.normaliserCouleur('rgb(196, 69, 54)'), '#c44536');
  assert.equal(C.normaliserCouleur('rgb(196 69 54)'), '#c44536');
  assert.equal(C.normaliserCouleur('rgb(196,69,54)'), '#c44536');
  assert.equal(C.normaliserCouleur('RGB(196, 69, 54)'), '#c44536');
  assert.equal(C.normaliserCouleur('rgba(255, 0, 0, 0.5)'), '#ff000080');
  assert.equal(C.normaliserCouleur('rgb(255 0 0 / 50%)'), '#ff000080');
  assert.equal(C.normaliserCouleur('hsl(0, 100%, 50%)'), '#ff0000');
  assert.equal(C.normaliserCouleur('hsl(120 100% 25%)'), '#008000');
  assert.equal(C.normaliserCouleur('hsl(240deg, 100%, 50%)'), '#0000ff');
  assert.equal(C.normaliserCouleur('hsla(0, 0%, 100%, 1)'), '#ffffff');
});

test('analyse : hsl, valeurs de référence (CSS Color)', () => {
  assert.equal(C.normaliserCouleur('hsl(60, 100%, 50%)'), '#ffff00');
  assert.equal(C.normaliserCouleur('hsl(180, 100%, 50%)'), '#00ffff');
  assert.equal(C.normaliserCouleur('hsl(300, 100%, 50%)'), '#ff00ff');
  assert.equal(C.normaliserCouleur('hsl(0, 0%, 50%)'), '#808080');
  assert.equal(C.normaliserCouleur('hsl(360, 100%, 50%)'), '#ff0000');
});

test('analyse : tout ce qui n\'est pas une couleur admise est refusé (aucune fonction CSS, aucun HTML)', () => {
  const hostiles = [
    'url(https://evil.example/x.png)', 'url(javascript:alert(1))', 'var(--accent)', 'expression(alert(1))', 'red', 'rebeccapurple', 'transparent', 'currentColor',
    '#ggg', '#12345', '#1234567', '#123456789', '##123456', 'rgb(256, 0, 0)', 'rgb(1000,0,0)', 'rgb(1, 2)', 'rgb(1, 2, 3, 4, 5)', 'rgb(1,2,3);color:red', 'rgb(1,2,3) url(x)',
    'hsl(361, 0%, 0%)', 'hsl(0, 101%, 0%)', 'hsl(0, 0, 0)', 'color-mix(in srgb, red, blue)', 'light-dark(#fff, #000)', 'rgb(0 0 0 / 2)', 'rgb(0 0 0 / 101%)',
    '<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '#fff"><script>x</script>', "#fff'; background:url(x)", '#fff\n#000', '\u0000#fff', '#fff; x',
    '', ' ', null, undefined, 12, 0xff0000, {}, [], ['#fff'], true,
  ];
  for (const h of hostiles) assert.equal(C.analyserCouleur(h), null, JSON.stringify(h));
});

test('analyse : une chaîne démesurée est refusée avant toute expression régulière (pas de blocage)', () => {
  const t0 = Date.now();
  for (const s of ['rgb(' + ' '.repeat(100000) + '1,2,3)', 'rgb(1' + ',  '.repeat(50000) + ')', 'hsl(' + '1'.repeat(100000), '#' + 'a'.repeat(100000), 'rgb(1,2,3' + ' '.repeat(5000)]) assert.equal(C.analyserCouleur(s), null);
  assert.ok(Date.now() - t0 < 200, 'durée ' + (Date.now() - t0) + ' ms');
  assert.equal(C.analyserCouleur('x'.repeat(C.LONGUEUR_COULEUR_MAX + 1)), null);
});

test('aplatir : une couleur translucide posée sur un fond ; une opaque reste telle quelle', () => {
  assert.equal(C.aplatir('#ff000080', '#ffffff'), '#ff7f7f');
  assert.equal(C.aplatir('rgb(0 0 0 / 0)', '#123456'), '#123456');
  assert.equal(C.aplatir('#c44536', '#ffffff'), '#c44536');
  assert.equal(C.aplatir('pas une couleur'), null);
});

// ---------------------------------------------------------------------------------------------------------------- hexadécimal, mélange
test('hexadécimal et mélange : aller-retour, bornes, repli sur la première couleur si l\'une est illisible', () => {
  assert.deepEqual(C.hexVersRgb('#c44536'), [196, 69, 54]); assert.deepEqual(C.hexVersRgb('abc'), [170, 187, 204]); assert.equal(C.hexVersRgb('#c4453680'), null);
  assert.equal(C.rgbVersHex([300, -5, 12.4]), '#ff000c');
  assert.equal(C.melanger('#000000', '#ffffff', 0.5), '#808080'); assert.equal(C.melanger('#000000', '#ffffff', 0), '#000000'); assert.equal(C.melanger('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(C.melanger('rien', '#ffffff', 0.5), 'rien');
});

// ---------------------------------------------------------------------------------------------------------------- contraste WCAG
test('contraste WCAG : valeurs publiées (21:1 noir/blanc, #767676 = 4,54:1, #777777 = 4,48:1), symétrie, luminance', () => {
  assert.ok(Math.abs(C.contraste('#000000', '#ffffff') - 21) < 1e-9);
  assert.equal(C.contraste('#ffffff', '#ffffff'), 1);
  assert.ok(Math.abs(C.contraste('#767676', '#ffffff') - 4.54) < 0.005);
  assert.ok(Math.abs(C.contraste('#777777', '#ffffff') - 4.48) < 0.005);
  assert.ok(C.contraste('#767676', '#ffffff') >= 4.5 && C.contraste('#777777', '#ffffff') < 4.5);
  assert.equal(C.contraste('#c44536', '#ffffff'), C.contraste('#ffffff', '#c44536'));
  assert.equal(C.luminance('#ffffff'), 1); assert.equal(C.luminance('#000000'), 0); assert.equal(C.contraste('#zzz', '#fff'), null); assert.equal(C.luminance('zzz'), null);
  assert.ok(Math.abs(C.luminance('#808080') - 0.2159) < 0.001, 'gris moyen : luminance relative 0,2159');
});

// ---------------------------------------------------------------------------------------------------------------- Lab
test('Lab : couleurs primaires sRGB (D65), valeurs de référence', () => {
  const proche = (a, b, tol = 0.05) => a.every((x, i) => Math.abs(x - b[i]) < tol);
  assert.ok(proche(C.hexVersLab('#ffffff'), [100, 0, 0], 0.01));
  assert.ok(proche(C.hexVersLab('#000000'), [0, 0, 0], 0.01));
  assert.ok(proche(C.hexVersLab('#ff0000'), [53.2408, 80.0925, 67.2032]), String(C.hexVersLab('#ff0000')));
  assert.ok(proche(C.hexVersLab('#00ff00'), [87.7347, -86.1827, 83.1793]), String(C.hexVersLab('#00ff00')));
  assert.ok(proche(C.hexVersLab('#0000ff'), [32.297, 79.1875, -107.8602]), String(C.hexVersLab('#0000ff')));
  assert.ok(proche(C.hexVersLab('#808080'), [53.5850, 0, 0], 0.05), String(C.hexVersLab('#808080')));
  assert.equal(C.hexVersLab('zzz'), null);
});

test('Lab : aller-retour hex -> Lab -> hex exact sur les couleurs de l\'interface et de la dataviz', () => {
  for (const h of ['#c44536', '#2e4e54', '#1f1b14', '#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7', '#440154', '#fde725']) assert.equal(C.labVersHex(C.hexVersLab(h)), h);
  assert.equal(C.deltaE76('#ffffff', '#ffffff'), 0); assert.ok(Math.abs(C.deltaE76('#000000', '#ffffff') - 100) < 0.01);
});

test('interpolation Lab : extrémités exactes, clarté monotone entre deux ancres', () => {
  const a = ['#f9ecea', '#c44536', '#5a1f18'];
  assert.equal(C.interpolerLab(a, 0), '#f9ecea'); assert.equal(C.interpolerLab(a, 1), '#5a1f18'); assert.equal(C.interpolerLab(a, 0.5), '#c44536');
  const L = Array.from({ length: 11 }, (_, i) => C.clarte(C.interpolerLab(a, i / 10))); assert.ok(L.every((x, i) => i === 0 || x < L[i - 1]));
});

// ---------------------------------------------------------------------------------------------------------------- CIEDE2000
test('CIEDE2000 : 21 valeurs de référence publiées (Sharma, Wu, Dalal 2005) à 1e-4 près, symétrie', () => {
  const T = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425], [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615], [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
    [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0], [[50, 0, 0], [50, -1, 2], 2.3669], [[50, 2.5, 0], [50, 0, -2.5], 4.3065], [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[50, 2.5, 0], [61, -5, 29], 22.8977], [[50, 2.5, 0], [56, -27, -3], 31.903], [[50, 2.5, 0], [58, 24, 15], 19.4535], [[50, 2.5, 0], [50, 3.1736, 0.5854], 1.0],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644], [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
    [[61.2901, 3.7196, -5.3901], [61.4292, 2.248, -4.962], 1.8731], [[35.0831, -44.1164, 3.7933], [35.0232, -40.0716, 1.5901], 1.8645],
    [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373], [[36.4612, 47.858, 18.3852], [36.2715, 50.5065, 21.2231], 1.4146],
    [[90.8027, -2.0831, 1.441], [91.1528, -1.6435, 0.0447], 1.4441], [[90.9257, -0.5406, -0.9208], [88.6381, -0.8985, -0.7239], 1.5381],
    [[6.7747, -0.2908, -2.4247], [5.8714, -0.0985, -2.2286], 0.6377], [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
  ];
  assert.equal(T.length, 21);
  for (const [a, b, e] of T) { assert.ok(Math.abs(C.deltaE2000Lab(a, b) - e) < 1e-4, `attendu ${e}, obtenu ${C.deltaE2000Lab(a, b)}`); assert.ok(Math.abs(C.deltaE2000Lab(b, a) - e) < 1e-4, 'symétrie'); }
  assert.equal(C.deltaE2000('#336699', '#336699'), 0); assert.equal(C.deltaE2000('x', '#fff'), null);
});

// ---------------------------------------------------------------------------------------------------------------- daltonisme, gris
test('daltonisme (Machado 2009) : lignes des matrices sommant à 1, gris inchangés, rouge assombri en protanopie, rouge/vert confondus en deutéranopie', () => {
  for (const m of Object.values(C.MATRICES_DALTONISME)) for (const l of m) assert.ok(Math.abs(l.reduce((s, x) => s + x, 0) - 1) < 1e-5);
  assert.deepEqual(C.TYPES_DALTONISME, ['protanopie', 'deuteranopie', 'tritanopie']);
  for (const t of C.TYPES_DALTONISME) for (const g of ['#000000', '#808080', '#c8c8c8', '#ffffff']) assert.ok(C.deltaE76(C.simulerDaltonisme(g, t), g) < 0.8, t + ' ' + g);
  assert.ok(C.clarte(C.simulerDaltonisme('#ff0000', 'protanopie')) < C.clarte('#ff0000') - 10);
  assert.ok(C.deltaE2000('#ff0000', '#00aa00') > 40);
  assert.ok(C.deltaE2000(C.simulerDaltonisme('#ff0000', 'deuteranopie'), C.simulerDaltonisme('#00aa00', 'deuteranopie')) < C.deltaE2000('#ff0000', '#00aa00') / 2);
  assert.equal(C.simulerDaltonisme('#abcdef', 'inconnu'), '#abcdef');
});

test('daltonisme : bleu et jaune restent distincts en protanopie et en deutéranopie (bleu-orange, jamais rouge-vert)', () => {
  for (const t of ['protanopie', 'deuteranopie']) assert.ok(C.deltaE2000(C.simulerDaltonisme('#0072b2', t), C.simulerDaltonisme('#e69f00', t)) > 40, t);
});

test('niveaux de gris : luminance convertie en gris sRGB, ordre blanc > noir, gris idempotent', () => {
  assert.equal(C.versGris('#ffffff'), '#ffffff'); assert.equal(C.versGris('#000000'), '#000000');
  const g = C.versGris('#c44536'); assert.match(g, /^#([0-9a-f]{2})\1\1$/); assert.equal(C.versGris(g), g);
  assert.ok(C.clarte(C.versGris('#f0e442')) > C.clarte(C.versGris('#0072b2')));
});

test('teinte et chroma : le rouge est vers 40 degrés, le bleu vers 270 degrés ; un gris n\'a pas de chroma', () => {
  assert.ok(Math.abs(C.teinte('#ff0000') - 40.0) < 1.0); assert.ok(C.teinte('#0000ff') > 300 && C.teinte('#0000ff') < 310);
  assert.ok(C.chroma('#808080') < 0.01); assert.ok(C.chroma('#ff0000') > 100);
});

test('encre lisible : la plus contrastée parmi les candidates', () => {
  assert.equal(C.encreSur('#ffffff').hex, '#000000'); assert.equal(C.encreSur('#000000').hex, '#ffffff');
  assert.equal(C.encreSur('#808080', ['#ffffff', '#000000']).ok45, true);
  assert.equal(C.encreSur('#ffffff', ['#fefefe']).ok3, false);
});

test('rampes : échantillonnage linéaire entre ancres, identique à celui du composant BI', async () => {
  const E = await import('../lib/bi/echelles.js');
  for (const ancres of [['#000000', '#ffffff'], ['#f8e9e7', '#c44536', '#692e23'], ['#fff', 'zzz', '#000']]) for (const n of [1, 2, 3, 5, 9]) assert.deepEqual(C.echantillonner(ancres, n), E.echantillonner(ancres, n), JSON.stringify(ancres) + ' n=' + n);
  assert.equal(C.rampe([])(0.5), '#808080'); assert.equal(C.rampe(['#123456'])(0.9), '#123456'); assert.equal(C.rampe(['#000000', '#ffffff'])(NaN), '#000000');
});
