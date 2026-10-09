/**
 * <atlas-bi> et client : `src` n'est jamais un schéma exécutable ou opaque, et l'origine opaque « null » n'est jamais une origine de composant.
 * node --test tests/bi-securite-element.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { urlComposant } from '../lib/bi/atlas-bi-element.js';
import { transportFenetre, ErreurBi } from '../lib/bi/client.js';

test('urlComposant refuse javascript:, data:, blob:, file:, ftp: et accepte http(s)', () => {
  for (const src of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>1</script>', 'blob:https://x.example/uuid', 'file:///etc/passwd', 'ftp://x.example/', ' javascript:alert(1)']) {
    assert.throws(() => urlComposant(src, 'https://hote.example', 'https://hote.example/p'), (e) => e instanceof ErreurBi && e.code === 'commande', src);
  }
  assert.equal(urlComposant('https://atlas.example/index.html', 'https://hote.example').origin, 'https://atlas.example');
  assert.equal(urlComposant('/atlas/index.html', 'https://hote.example', 'https://hote.example/p').origin, 'https://hote.example');
});

test('transportFenetre refuse l\'origine opaque « null » comme origine du composant', () => {
  for (const o of ['null', '*', '', undefined]) assert.throws(() => transportFenetre({ fenetre: {}, cadre: {}, origineComposant: o }), (e) => e.code === 'origine', String(o));
});
