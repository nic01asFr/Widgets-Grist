/**
 * L'attribution d'une couche administrative (fournie par l'hôte avec ses données) est écrite dans le DOM par MapLibre avec
 * `innerHTML` : elle doit arriver échappée. node --test tests/bi-securite-attribution.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher, attributionTexte } from '../lib/bi/bi-runtime.js';
import { carteSimulee } from './aide-carte-bi.js';

const CHARGES = [
  `<iframe srcdoc="<script>top.x=1</script>"></iframe>`, `<img src=x onerror=alert(1)>`, `<a href="javascript:alert(1)">x</a>`,
  `<base href="https://evil.example/">`, `<form action="https://evil.example"></form>`, `</a><script>1</script>`, '`<b>',
];

test('attributionTexte : aucun caractère actif ne survit, le texte reste lisible, la taille est bornée', () => {
  for (const c of CHARGES) assert.ok(!/[<>"'`]/.test(attributionTexte(c)), c);
  assert.equal(attributionTexte('IGN & INSEE © 2026'), 'IGN &amp; INSEE © 2026');
  assert.equal(attributionTexte(null), ''); assert.equal(attributionTexte(undefined), '');
  assert.ok(attributionTexte('x'.repeat(100000)).length <= 300 * 6);
});

test('une couche administrative fournie par l\'hôte : l\'attribution passée à MapLibre est échappée', async () => {
  const carte = carteSimulee(); const rt = attacher(carte);
  const poly = (x) => ({ type: 'Feature', properties: { code: 'A' + x, nom: 'n' + x }, geometry: { type: 'Polygon', coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]] } });
  for (const [i, c] of CHARGES.entries()) {
    await rt.api.addAdminLayer('departement', { id: 'adm' + i, donnees: [poly(i)], attribution: c, visuel: { type: 'choroplethe' } });
    const src = [...carte.sources.entries()].find(([k]) => k.endsWith('adm' + i));
    assert.ok(src, 'source absente pour ' + c);
    const a = src[1].attribution; assert.equal(typeof a, 'string');
    assert.ok(!/[<>"'`]/.test(a), 'attribution non échappée : ' + a);
  }
});
