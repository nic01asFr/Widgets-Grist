import test from 'node:test';
import assert from 'node:assert/strict';
import { echapper, chaineJs, assainirTexte } from '../lib/html.js';

test('echapper : le texte ne devient jamais une balise ni une valeur d’attribut', () => {
  assert.equal(echapper('<img src=x onerror="a()">'), '&lt;img src=x onerror=&quot;a()&quot;&gt;');
  assert.equal(echapper(`l'eau & "le" pont`), 'l&#39;eau &amp; &quot;le&quot; pont');
  assert.equal(echapper(null), '');
  assert.equal(echapper(12), '12');
});

test('chaineJs : sûre dans une chaîne JavaScript d’un attribut onclick', () => {
  // Le navigateur décode `&#39;` en `'` APRÈS avoir lu l'attribut : le `\` qui
  // précède garde alors l'apostrophe dans la chaîne JavaScript.
  assert.equal(chaineJs("a'b"), 'a\\&#39;b');
  assert.equal(chaineJs('a"b'), 'a&quot;b');
  assert.equal(chaineJs('a\\b'), 'a\\\\b');
  assert.equal(chaineJs('a\nb'), 'a b');
  assert.equal(chaineJs("');alert(1);//"), '\\&#39;);alert(1);//');
});

test('assainirTexte : la mise en forme d’une consigne passe', () => {
  assert.equal(assainirTexte('Arrivée <b>côté aval</b>, <i>prudence</i>.<br>Puis suivre la digue.'),
    'Arrivée <b>côté aval</b>, <i>prudence</i>.<br>Puis suivre la digue.');
  assert.equal(assainirTexte('<ul><li>un</li><li>deux</li></ul>'), '<ul><li>un</li><li>deux</li></ul>');
  assert.equal(assainirTexte('2 &lt; 3 &amp; 4 &gt; 1'), '2 &lt; 3 &amp; 4 &gt; 1', 'les entités restent du texte');
  assert.equal(assainirTexte(''), '');
  assert.equal(assainirTexte(undefined), '');
});

test('assainirTexte : rien d’actif ne passe', () => {
  const vecteurs = [
    '<script>alert(1)</script>ok',
    '<img src=x onerror=alert(1)>',
    '<b onclick="a()">gras</b>',
    '<a href="javascript:alert(1)">lien</a>',
    '<a href="  JaVa\tScRiPt:alert(1)">lien</a>',
    '<a href="data:text/html,<script>alert(1)</script>">lien</a>',
    '<iframe src="https://exemple.org"></iframe>texte',
    '<svg onload=alert(1)><circle/></svg>',
    '<style>body{display:none}</style>texte',
    '<div style="position:fixed;inset:0">x</div>',
    '<!-- <script>alert(1)</script> -->texte',
    '<<script>script>alert(1)<</script>/script>',
    '<img src="https://exemple.org/a.png" onerror="a()">',
  ];
  for (const v of vecteurs) {
    const r = assainirTexte(v);
    assert.ok(!/<script|<iframe|<svg|<style|\son\w+\s*=|javascript:|data:text|style=/i.test(r), `${v} -> ${r}`);
  }
  assert.equal(assainirTexte('<script>alert(1)</script>ok'), 'ok');
  assert.equal(assainirTexte('<b onclick="a()">gras</b>'), '<b>gras</b>');
  assert.equal(assainirTexte('<div style="position:fixed">x</div>'), '<div>x</div>');
});

test('assainirTexte : les liens et les images restent sur le web', () => {
  assert.equal(assainirTexte('<a href="https://exemple.org/a?b=1&c=2">voir</a>'),
    '<a href="https://exemple.org/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">voir</a>');
  assert.equal(assainirTexte('<a href="javascript:alert(1)">voir</a>'), '<a target="_blank" rel="noopener noreferrer">voir</a>');
  assert.equal(assainirTexte('<img src="https://exemple.org/a.png" alt="Pont">'),
    '<img src="https://exemple.org/a.png" alt="Pont" referrerpolicy="no-referrer" loading="lazy">');
  assert.equal(assainirTexte('<img src="http://exemple.org/a.png">'), '', 'une image reste en https');
  assert.equal(assainirTexte('<img src="data:image/png;base64,AAAA">'), '');
  assert.equal(assainirTexte('<img>'), '');
});

test('assainirTexte : le résultat est toujours bien formé', () => {
  assert.equal(assainirTexte('<b>gras <i>italique'), '<b>gras <i>italique</i></b>');
  assert.equal(assainirTexte('fin</b> orpheline'), 'fin orpheline');
  assert.equal(assainirTexte('a < b et c > d'), 'a &lt; b et c &gt; d');
  assert.equal(assainirTexte('<balise-inconnue>contenu</balise-inconnue>'), 'contenu');
});

test('assainirTexte : une adresse garde ses espaces, un schéma déguisé ne passe pas', () => {
  assert.equal(assainirTexte('<a href="https://x.org/a b">x</a>'),
    '<a href="https://x.org/a b" target="_blank" rel="noopener noreferrer">x</a>');
  assert.equal(assainirTexte('<a href="java\tscript:alert(1)">x</a>'), '<a target="_blank" rel="noopener noreferrer">x</a>');
  assert.equal(assainirTexte('<a href="java script:alert(1)">x</a>'), '<a target="_blank" rel="noopener noreferrer">x</a>');
  assert.equal(assainirTexte('<a href="#haut">x</a>'), '<a target="_blank" rel="noopener noreferrer">x</a>', 'pas d’ancre : elle ouvrirait un onglet sur la même page');
});

test('assainirTexte : une image n’envoie pas de référent et reste de taille raisonnable', () => {
  assert.equal(assainirTexte('<img src="https://x.org/a.png" width="300" height="99999">'),
    '<img src="https://x.org/a.png" width="300" referrerpolicy="no-referrer" loading="lazy">');
});

test('assainirTexte : une très longue série d’espaces dans une balise ne fige rien', () => {
  const t0 = Date.now();
  const r = assainirTexte(`<b${' '.repeat(40000)}x>texte`);
  assert.ok(Date.now() - t0 < 200, 'quadratique avant correction : 650 ms');
  assert.ok(!r.includes('<b'), 'c’est du texte échappé, pas une balise');
});

test('chaineJs : un retour chariot isolé ne casse pas la chaîne', () => {
  assert.equal(chaineJs('a\rb'), 'a b');
  assert.equal(chaineJs('a\u2028b'), 'a b');
});
