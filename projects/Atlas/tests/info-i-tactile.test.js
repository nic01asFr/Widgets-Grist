import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index_v7.html', import.meta.url), 'utf8');

test('au doigt, la pastille « i » a une zone touchable d\'au moins 44 px', () => {
  // Mesure : 15 px de côté. 15 + 2 x 15 = 45 px ; l'aspect ne change pas.
  const taille = Number(html.match(/\.info-i \{[^}]*width: (\d+)px; height: (\d+)px/)?.[1]);
  const marge = Number(html.match(/\.info-i::after \{ content: ''; position: absolute; inset: -(\d+)px; \}/)?.[1]);
  assert.ok(taille > 0 && marge > 0, 'règle absente');
  assert.ok(taille + 2 * marge >= 44, `zone de ${taille + 2 * marge} px`);
  assert.match(html, /@media \(pointer: coarse\) \{\s*\.info-i \{ position: relative; \}/);
});
