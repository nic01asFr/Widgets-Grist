import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index_v7.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app_v7.js', import.meta.url), 'utf8');

test('la feuille « Plus » a une croix de fermeture visible de 44 px', () => {
  assert.match(html, /<button type="button" class="mp-fermer" data-fermer-plus aria-label="Fermer">/);
  assert.match(html, /#mobile-plus \.mp-feuille \.mp-fermer \{[^}]*width: 44px; height: 44px/);
});

test('la barre du bas reste découverte sous la feuille « Plus »', () => {
  assert.match(html, /#mobile-plus \{ position: fixed; inset: 0 0 calc\(56px \+ env\(safe-area-inset-bottom, 0px\)\) 0;/);
  assert.match(html, /#mobile-plus \.mp-feuille \{[^}]*max-height: calc\(100dvh - 56px/);
});

test('retoucher « Plus » referme la feuille, et la croix aussi', () => {
  assert.match(app, /if \(tab === 'plus' && feuillePlusOuverte\(\)\) \{ fermerFeuillePlus\(\); return; \}/);
  assert.match(app, /f\.querySelector\('\[data-fermer-plus\]'\)\.onclick = fermer;/);
});
