/**
 * Le garde d'amorçage du mode composant (script en ligne de `index_v7.html`) : une carte qui ne démarre pas le DIT, au lieu de rester sur
 * « Chargement de la carte… » ; l'hôte est averti par un événement `error`, aux seules origines qu'il a déclarées (`hote=`).
 * Mesure d'origine (15/10/2026) : un CDN bloqué laissait « Chargement… » sans fin, et l'hôte ne recevait qu'un délai dépassé trompeur.
 * node --test projects/Atlas/tests/amorcage-garde.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(path.join(ICI, '..', 'index_v7.html'), 'utf8');

function script() {
  const blocs = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const b = blocs.find((x) => x.includes('prevenir') && x.includes('bi-voile'));
  assert.ok(b, 'garde d\'amorçage introuvable dans la page');
  return b;
}

/** Une page simulée : minuteries pilotées à la main, voile, messages envoyés à la fenêtre parente. */
function page(search, { dansCadre = true, pret = false } = {}) {
  const minuteries = [], messages = [], erreursConsole = [], ecouteurs = {};
  const voile = { textContent: 'Chargement de la carte…' };
  const parent = { postMessage: (m, o) => messages.push({ m, o }) };
  const window = { __biPret: pret };
  window.parent = dansCadre ? parent : window;
  const contexte = {
    window, location: { search, href: 'https://atlas.example/index.html' + search }, URL, URLSearchParams,
    document: { getElementById: (id) => (id === 'bi-voile' ? voile : null) },
    setTimeout: (f, ms) => { minuteries.push({ f, ms }); return minuteries.length; },
    addEventListener: (type, f) => { ecouteurs[type] = f; },
    console: { error: (...a) => erreursConsole.push(a.join(' ')) },
  };
  vm.runInNewContext(script(), contexte);
  const attendre = (ms) => minuteries.filter((t) => t.ms === ms).forEach((t) => t.f());
  return { voile, messages, erreursConsole, ecouteurs, window, attendre, minuteries };
}

test('hors mode composant : le garde ne fait rien', () => {
  const p = page('?mode=view');
  assert.equal(p.minuteries.length, 0);
  assert.deepEqual(p.ecouteurs, {});
});

test('mode composant : un script qui ne se charge pas est nommé dans le voile, sans prévenir l\'hôte tout de suite', () => {
  const p = page('?bi=1&hote=https%3A%2F%2Fhote.example');
  p.ecouteurs.error({ target: { tagName: 'SCRIPT', src: 'https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js' } });
  assert.match(p.voile.textContent, /unpkg\.com/);
  assert.match(p.voile.textContent, /ne se charge pas/);
  assert.equal(p.messages.length, 0, 'un script secondaire en échec n\'est pas forcément fatal : l\'hôte n\'est pas alerté avant le délai');
});

test('une ressource qui n\'est pas un script (police, feuille de style) ne change pas le voile', () => {
  const p = page('?bi=1');
  p.ecouteurs.error({ target: { tagName: 'LINK', href: 'https://fonts.googleapis.com/css2' } });
  assert.equal(p.voile.textContent, 'Chargement de la carte…');
});

test('après 6 s sans démarrage : « Chargement lent »', () => {
  const p = page('?bi=1');
  p.attendre(6000);
  assert.match(p.voile.textContent, /Chargement lent/);
});

test('après 20 s sans démarrage : message de cause et événement error vers CHAQUE origine déclarée, jamais « * »', () => {
  const p = page('?bi=1&hote=https%3A%2F%2Fhote.example&hote=https%3A%2F%2Fautre.example%3A8443');
  p.ecouteurs.error({ target: { tagName: 'SCRIPT', src: 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js' } });
  p.attendre(1500); p.attendre(20000);
  assert.match(p.voile.textContent, /La carte n.a pas démarré : cdn\.jsdelivr\.net/);
  assert.equal(p.messages.length, 2);
  assert.deepEqual(p.messages.map((x) => x.o).sort(), ['https://autre.example:8443', 'https://hote.example']);
  for (const { m } of p.messages) {
    assert.equal(m.source, 'atlas-bi'); assert.equal(m.type, 'error'); assert.equal(m.version, '0.3');
    assert.equal(m.charge.code, 'dependance'); assert.equal(m.charge.niveau, 'fatal');
  }
  assert.equal(p.erreursConsole.length, 1, 'une seule erreur en console');
});

test('sans cause identifiée : message de délai et code « delai »', () => {
  const p = page('?bi=1&hote=https%3A%2F%2Fhote.example');
  p.attendre(20000);
  assert.match(p.voile.textContent, /après 20 s/);
  assert.equal(p.messages[0].m.charge.code, 'delai');
  assert.equal(p.messages[0].m.charge.niveau, 'avertissement', 'un démarrage lent n est pas fatal : la carte peut encore se monter (mesuré : 32 s sur un réseau lent)');
});

test('quand le composant a démarré (__biPret) : rien ne change, aucun message', () => {
  const p = page('?bi=1&hote=https%3A%2F%2Fhote.example', { pret: true });
  p.ecouteurs.error({ target: { tagName: 'SCRIPT', src: 'https://unpkg.com/x.js' } });
  p.attendre(1500); p.attendre(6000); p.attendre(20000);
  assert.equal(p.voile.textContent, 'Chargement de la carte…');
  assert.equal(p.messages.length, 0);
});

test('page ouverte hors cadre (pas de parent) : le voile informe, personne n\'est prévenu', () => {
  const p = page('?bi=1&hote=https%3A%2F%2Fhote.example', { dansCadre: false });
  p.attendre(20000);
  assert.match(p.voile.textContent, /n.a pas démarré/);
  assert.equal(p.messages.length, 0);
});

test('un événement error de 20 s n\'est envoyé qu\'une fois, même si le garde est relancé', () => {
  const p = page('?bi=1&hote=https%3A%2F%2Fhote.example');
  p.attendre(20000); p.attendre(20000);
  assert.equal(p.messages.length, 1);
});

test('lib/bi/montage.js pose __biPret quand le composant est monté', () => {
  const src = fs.readFileSync(path.join(ICI, '..', 'lib', 'bi', 'montage.js'), 'utf8');
  assert.match(src, /fenetre\.__biPret = true;/);
});

test('<atlas-bi> attend le composant 30 s par défaut, réglable par delai-connexion', () => {
  const src = fs.readFileSync(path.join(ICI, '..', 'lib', 'bi', 'atlas-bi-element.js'), 'utf8');
  assert.match(src, /delaiConnexion = Number\(this\.getAttribute\('delai-connexion'\)\) \|\| 30000/);
  assert.match(src, /observedAttributes\(\) \{ return \[[^\]]*'delai-connexion'/);
  assert.match(src, /creerClient\(\{ delai, delaiConnexion,/);
});
