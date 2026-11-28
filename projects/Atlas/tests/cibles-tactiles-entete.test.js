import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index_v7.html', import.meta.url), 'utf8');

test('au doigt, les boutons de la barre du haut ont une zone touchable de 44 px', () => {
  // Mesure sur téléphone : 26 à 35 dp réels. L'aspect ne change pas, la zone si.
  const bloc = html.match(/@media \(pointer: coarse\) \{\s*\.header-actions \.btn-ghost[\s\S]*?\n        \}\n/);
  assert.ok(bloc, 'bloc pointer: coarse de la barre du haut absent');
  for (const sel of ['.btn-ghost', '.btn-posture', '.enreg-etat', '.synchro-pastille']) {
    assert.ok(bloc[0].includes(`.header-actions ${sel}::after`), `${sel} sans zone agrandie`);
  }
  assert.match(bloc[0], /height: 44px/);
});
