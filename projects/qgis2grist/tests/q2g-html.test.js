'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { echapper, couleurSure } = require('../lib/q2g-html.js');

test('echapper : les cinq caracteres dangereux plus l apostrophe inverse', () => {
  assert.equal(echapper('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(echapper('a & b'), 'a &amp; b');
  assert.equal(echapper('"x" \'y\' `z`'), '&quot;x&quot; &#39;y&#39; &#96;z&#96;');
  assert.equal(echapper('"><script>1</script>'), '&quot;&gt;&lt;script&gt;1&lt;/script&gt;');
});

test('echapper : le rendu normal est inchange (texte, accents, nombres)', () => {
  assert.equal(echapper('Bâtiments d’habitation 2021'), 'Bâtiments d’habitation 2021');
  assert.equal(echapper(12.5), '12.5');
  assert.equal(echapper(0), '0');
  assert.equal(echapper(false), 'false');
  assert.equal(echapper('10/08/2021 12:14'), '10/08/2021 12:14');
});

test('echapper : null, undefined, objets, tableaux', () => {
  assert.equal(echapper(null), '');
  assert.equal(echapper(undefined), '');
  assert.equal(echapper(['L', 1]), '[&quot;L&quot;,1]');
  assert.equal(echapper({ a: '<b>' }), '{&quot;a&quot;:&quot;&lt;b&gt;&quot;}');
  const cyc = {}; cyc.moi = cyc;
  assert.equal(typeof echapper(cyc), 'string');
});

test('echapper : un double echappement n est pas fait par erreur sur &amp; (la valeur brute est toujours echappee une fois)', () => {
  assert.equal(echapper('&amp;'), '&amp;amp;');
});

test('couleurSure : hex, rgb, nom acceptes ; injection de style ou d attribut refusee', () => {
  assert.equal(couleurSure('#3e5de7'), '#3e5de7');
  assert.equal(couleurSure(' rgba(10, 20, 30, 0.5) '), 'rgba(10, 20, 30, 0.5)');
  assert.equal(couleurSure('red'), 'red');
  assert.equal(couleurSure('red;background:url(http://x/y)', '#000'), '#000');
  assert.equal(couleurSure('" onmouseover="alert(1)', '#000'), '#000');
  assert.equal(couleurSure('url(http://x)', '#000'), '#000');
  assert.equal(couleurSure(null), '#808080');
  assert.equal(couleurSure(42, 'blue'), 'blue');
});

test('index_v2.html : les gabarits de l ancienne carte, de la legende et de l apercu passent par echapper', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index_v2.html'), 'utf8');
  const popup = html.slice(html.indexOf('function buildPopupHtml'), html.indexOf('// TOAST'));
  assert.ok(popup.includes('Q2GHtml.echapper(f.label || f.name)') && popup.includes('Q2GHtml.echapper(v)'));
  assert.ok(!/\$\{String\(v\)\}/.test(popup));
  const legende = html.slice(html.indexOf('function renderMapLegend'), html.indexOf('function setSyncState'));
  assert.ok(!/\$\{item\.label\}|\$\{ld\.layerName\}|\$\{cat\.label/.test(legende), 'legende : plus de valeur brute dans le gabarit');
  const meta = html.slice(html.indexOf('_metaTitleEl.innerHTML'), html.indexOf('_metaTitleEl.innerHTML') + 260);
  assert.ok(meta.includes('Q2GHtml.echapper(_currentMeta.title)') && meta.includes('Q2GHtml.echapper(_currentMeta.subtitle)'));
  const apercu = html.slice(html.indexOf('function showPreview'), html.indexOf('// Bandeau d\'erreur bloquant'));
  assert.ok(!/\$\{layer\.displayName\}|\$\{f\.label \|\| f\.name\}|\$\{f\.qType\}|\$\{f\.gType\}/.test(apercu), 'apercu : plus de valeur brute dans le gabarit');
  assert.ok(html.includes('src="lib/q2g-html.js'), 'module charge avant le script de la page');
});
