import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index_v7.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app_v7.js', import.meta.url), 'utf8');

test('« Supprimer la couche » demande une confirmation avant d\'agir', () => {
  const i = app.indexOf('deleteLayer(id, e) {');
  assert.ok(i > 0);
  const corps = app.slice(i, i + 700);
  assert.match(corps, /if \(!confirm\(`Supprimer la couche « \$\{l\.name\} » \?`\)\) return;\s*removeLayerGfx\(l\);/);
});

test('l\'action destructive est séparée des autres et haute au doigt', () => {
  assert.match(html, /\.menu-couche-item \+ \.menu-couche-item\.danger \{[^}]*border-top: 1px solid var\(--hairline\)/);
  assert.match(html, /@media \(pointer: coarse\) \{ \.menu-couche-item \{ min-height: 48px; \} \}/);
});
