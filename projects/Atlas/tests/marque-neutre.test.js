/**
 * La marque d'Atlas est neutre par défaut : le glyphe seul, aux couleurs de la charte (jeton --accent), pas de nom dans la barre, un titre d'onglet sans version ni slogan ;
 * en widget Grist, pas de logo sans demande. `?marque=atlas` rend le nom, `?marque=aucune` retire aussi le glyphe.
 * node --test projects/Atlas/tests/marque-neutre.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const lire = (f) => fs.readFileSync(path.join(ICI, '..', f), 'utf8');
const html = lire('index_v7.html');

// le script de tête, exécuté contre une adresse donnée
function marqueDe(recherche) {
  const script = /<script>try \{ var mq = [^<]*<\/script>/.exec(html)[0].replace(/^<script>|<\/script>$/g, '');
  const attrs = {};
  const contexte = { URLSearchParams, location: { search: recherche }, document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } } };
  new Function('URLSearchParams', 'location', 'document', script)(contexte.URLSearchParams, contexte.location, contexte.document);
  return attrs['data-marque'];
}

test('défaut : le glyphe seul ; atlas : avec le nom ; aucune : sans glyphe ; valeur inconnue : le défaut', () => {
  assert.equal(marqueDe(''), 'icone');
  assert.equal(marqueDe('?marque=atlas'), 'atlas');
  assert.equal(marqueDe('?marque=aucune'), 'aucune');
  assert.equal(marqueDe('?marque=n-importe-quoi'), 'icone');
});

test('le glyphe est générique : aucune couleur figée, il prend --accent et --surface (donc la charte et le thème du document)', () => {
  const svgs = html.match(/<svg class="brand-logo"[\s\S]*?<\/svg>/g);
  assert.equal(svgs.length, 2, 'la barre et le bouton de menu');
  for (const svg of svgs) assert.ok(!/#[0-9a-fA-F]{3,6}/.test(svg), 'aucune couleur littérale dans le glyphe');
  assert.match(html, /\.brand-logo-corps \{ fill: var\(--accent\); \}/);
  assert.match(html, /\.brand-logo-trait \{ stroke: var\(--surface\); \}/);
});

test('titres d\'onglet neutres : ni version, ni slogan', () => {
  assert.match(html, /<title>Atlas<\/title>/);
  assert.match(lire('index_bi.html'), /<title>Atlas — carte<\/title>/);
});

test('en widget Grist, pas de logo sans marque demandée dans l\'adresse', () => {
  const app = lire('app_v7.js');
  assert.match(app, /caps\.mode === 'grist' && !new URLSearchParams\(location\.search\)\.has\('marque'\)\) document\.documentElement\.setAttribute\('data-marque', 'aucune'\)/);
});
