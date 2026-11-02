/**
 * Les feuilles de style de l'interface du composant (zone, légende, temps, bulle) : posées une seule fois, par une feuille CONSTRUITE quand le navigateur sait,
 * par un élément <style> sinon. La feuille construite ne passe pas par `style-src` : la page tient sous `style-src 'self'` (mesuré dans Chrome le 02/11/2026).
 * node --test projects/Atlas/tests/bi-feuille.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { poserFeuille } from '../lib/bi/ui/feuille.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const lire = (rel) => fs.readFileSync(path.join(ICI, '..', rel), 'utf8');

/** Un document minimal, avec ou sans feuilles construites. */
function document({ construites = true, refuse = false } = {}) {
  const head = { enfants: [], appendChild(e) { this.enfants.push(e); } };
  const doc = {
    head, elements: new Map(),
    getElementById(id) { return head.enfants.find((e) => e.id === id) || null; },
    createElement(tag) { return { tag, id: '', textContent: '' }; },
  };
  if (construites) {
    class Feuille { replaceSync(texte) { if (refuse) throw new Error('refusée'); this.texte = texte; } }
    doc.defaultView = { CSSStyleSheet: Feuille };
    doc.adoptedStyleSheets = [];
  }
  return doc;
}

test('un navigateur qui sait construire des feuilles : la feuille est adoptée, aucun élément <style> n\'est créé', () => {
  const doc = document();
  assert.equal(poserFeuille(doc, 'a', '.x { color: red; }'), true);
  assert.equal(doc.adoptedStyleSheets.length, 1);
  assert.equal(doc.adoptedStyleSheets[0].texte, '.x { color: red; }');
  assert.equal(doc.head.enfants.length, 0, 'rien dans <head> : pas de style en ligne');
});

test('une feuille n\'est posée qu\'une fois par identifiant et par document, même après plusieurs appels', () => {
  const doc = document();
  assert.equal(poserFeuille(doc, 'a', '.x {}'), true);
  assert.equal(poserFeuille(doc, 'a', '.x {}'), false);
  assert.equal(poserFeuille(doc, 'b', '.y {}'), true);
  assert.equal(doc.adoptedStyleSheets.length, 2);
  const autre = document();
  assert.equal(poserFeuille(autre, 'a', '.x {}'), true, 'un autre document a ses propres feuilles');
});

test('sans feuilles construites (navigateur ancien, document de test) : repli sur un élément <style>, posé une fois', () => {
  const doc = document({ construites: false });
  assert.equal(poserFeuille(doc, 'a', '.x { color: red; }'), true);
  assert.equal(doc.head.enfants.length, 1);
  assert.deepEqual([doc.head.enfants[0].tag, doc.head.enfants[0].id, doc.head.enfants[0].textContent], ['style', 'a', '.x { color: red; }']);
  assert.equal(poserFeuille(doc, 'a', '.x { color: red; }'), false);
  assert.equal(doc.head.enfants.length, 1);
});

test('une feuille que le navigateur refuse (replaceSync lève) : repli sur l\'élément, l\'interface s\'affiche', () => {
  const doc = document({ refuse: true });
  assert.equal(poserFeuille(doc, 'a', '.x {}'), true);
  assert.equal(doc.adoptedStyleSheets.length, 0);
  assert.equal(doc.head.enfants.length, 1);
});

test('pas de document, ou ni feuilles construites ni <head> : rien n\'est posé et rien ne plante', () => {
  assert.equal(poserFeuille(null, 'a', '.x {}'), false);
  const nu = document({ construites: false }); nu.head = null;
  assert.equal(poserFeuille(nu, 'a', '.x {}'), false);
});

test('les quatre éléments d\'interface posent leur feuille par poserFeuille, et aucun ne crée plus de <style> à la main', () => {
  for (const f of ['lib/bi/ui/zone.js', 'lib/bi/ui/legende.js', 'lib/bi/ui/temps.js', 'lib/bi/bulle.js']) {
    const src = lire(f);
    assert.match(src, /import \{ poserFeuille \} from '\.{1,2}\/(ui\/)?feuille\.js'/, f);
    assert.match(src, /poserFeuille\(doc, STYLE_ID, FEUILLE\)/, f);
    assert.ok(!/createElement\('style'\)/.test(src), f + ' : plus de <style> créé à la main');
  }
});

test('les feuilles ne contiennent rien qu\'une feuille construite refuse (@import) ni ressource externe', () => {
  return Promise.all(['../lib/bi/ui/zone.js', '../lib/bi/ui/legende.js', '../lib/bi/ui/temps.js', '../lib/bi/bulle.js'].map(async (m) => {
    const { FEUILLE } = await import(m);
    assert.ok(typeof FEUILLE === 'string' && FEUILLE.length > 50, m);
    assert.ok(!/@import|url\(/.test(FEUILLE), m + ' : replaceSync refuse @import');
  }));
});
