import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index_v7.html', import.meta.url), 'utf8');

test('sur téléphone, les messages passent en haut et ne captent aucun toucher', () => {
  // Mesuré : deux messages empilés recouvraient « Abandonner » au bas de la fiche.
  const r = html.match(/body\.mobile-layout \.toasts \{([^}]*)\}/);
  assert.ok(r, 'règle mobile des messages absente');
  assert.match(r[1], /top: calc\(var\(--header-h\)/);
  assert.match(r[1], /bottom: auto/);
  assert.match(r[1], /pointer-events: none/);
});
