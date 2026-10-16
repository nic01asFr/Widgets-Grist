/**
 * L'API de plugin de Grist (967 Ko, jamais appelée par le composant) n'est PAS chargée en mode composant (`?bi=1`) ;
 * partout ailleurs elle l'est, au même moment qu'avant (à l'analyse de la page), et l'application l'attend avant de démarrer.
 * node --test projects/Atlas/tests/grist-plugin-api-conditionnel.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const lire = (...p) => fs.readFileSync(path.join(ICI, '..', ...p), 'utf8');

/** Le script en ligne qui charge l'API de plugin : celui qui définit `window.__gristApi`. */
function scriptDeChargement(html) {
  const blocs = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const b = blocs.find((x) => x.includes('__gristApi') && x.includes('grist-plugin-api.js'));
  assert.ok(b, 'script de chargement conditionnel introuvable dans la page');
  return b;
}

function executer(html, search) {
  const ajoutes = [];
  const head = { appendChild: (el) => { ajoutes.push(el); if (el.onload) setTimeout(() => el.onload(), 0); } };
  const document = { head, createElement: () => ({ set src(v) { this._src = v; }, get src() { return this._src; } }) };
  const window = {};
  vm.runInNewContext(scriptDeChargement(html), { window, document, location: { search }, Promise, setTimeout });
  return { window, ajoutes };
}

for (const [nom, fichier] of [['sources (index_v7.html)', ['index_v7.html']], ['publié (published/atlas/index.html)', ['..', '..', 'published', 'atlas', 'index.html']]]) {
  test(`${nom} : plus de balise statique pour l'API de plugin`, () => {
    const html = lire(...fichier);
    assert.ok(!/<script[^>]+src=["']https:\/\/docs\.getgrist\.com\/grist-plugin-api\.js["']/.test(html), 'la balise statique bloquante est revenue');
  });

  test(`${nom} : mode composant (?bi=1) : aucune requête vers l'API de plugin`, () => {
    const html = lire(...fichier);
    for (const search of ['?bi=1', '?bi=true', '?navbar=false&bi=1&mode=view']) {
      const { window, ajoutes } = executer(html, search);
      assert.equal(window.__gristApi, null, search);
      assert.equal(ajoutes.length, 0, `${search} : aucun script ajouté`);
    }
  });

  test(`${nom} : hors mode composant, l'API est chargée et attendable`, async () => {
    const html = lire(...fichier);
    for (const search of ['', '?mode=view', '?bi=0', '?scene=https://x.example/s.json']) {
      const { window, ajoutes } = executer(html, search);
      assert.equal(ajoutes.length, 1, `${search} : un script ajouté`);
      assert.equal(ajoutes[0].src, 'https://docs.getgrist.com/grist-plugin-api.js');
      assert.ok(window.__gristApi && typeof window.__gristApi.then === 'function', `${search} : une promesse`);
      await window.__gristApi;
    }
  });

  test(`${nom} : une erreur de chargement ne bloque pas le démarrage (la promesse se résout quand même)`, async () => {
    const html = lire(...fichier);
    const ajoutes = [];
    const head = { appendChild: (el) => { ajoutes.push(el); setTimeout(() => el.onerror(), 0); } };
    const window = {};
    vm.runInNewContext(scriptDeChargement(html), { window, document: { head, createElement: () => ({}) }, location: { search: '' }, Promise, setTimeout });
    await window.__gristApi;
    assert.equal(ajoutes.length, 1);
  });
}

test('l\'application attend l\'API de plugin avant de décider du régime (hors mode composant)', () => {
  const src = lire('app_v7.js');
  const i = src.indexOf('async function demarrer()');
  assert.ok(i > 0);
  assert.match(src.slice(i, i + 700), /if \(window\.__gristApi\) await window\.__gristApi;/);
});
