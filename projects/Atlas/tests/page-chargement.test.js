import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Ce que `index_v7.html` charge au démarrage, et dans quel ordre.
 *
 * Un `<script src>` classique sans `defer` BLOQUE l'analyse du HTML : rien ne s'affiche tant qu'il n'est pas téléchargé et exécuté. MapLibre (940 Ko) et
 * SunCalc le faisaient (mesuré le 10/10/2026 : premier affichage 5 180 ms à froid contre 211 ms en `defer`). `defer` garde l'ordre d'exécution (les scripts
 * différés et les modules partagent la même file, dans l'ordre du document) et supprime le blocage.
 *
 * Le moteur de formulaires (`../grist_forms/...`) reste classique et bloquant : son chargement à la demande est un autre lot.
 * L'API plugin de Grist est injectée par un script inline (`window.__gristApi`), sans bloquer.
 */
const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(RACINE, 'index_v7.html'), 'utf8');

/** Les balises `<script ...>` ouvrantes avec leur corps, dans l'ordre du document. */
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map((m) => ({
  attrs: m[1],
  corps: m[2],
  src: (m[1].match(/\ssrc\s*=\s*"([^"]*)"/i) || [])[1] || null,
  type: (m[1].match(/\stype\s*=\s*"([^"]*)"/i) || [])[1] || null,
  defer: /\sdefer(\s|=|$)/i.test(' ' + m[1]),
  index: m.index,
}));
const distants = scripts.filter((s) => s.src && /^https:\/\//.test(s.src) && !s.type);

test('MapLibre et SunCalc sont différés : ils ne bloquent plus l\'analyse de la page', () => {
  const bloquants = distants.filter((s) => !s.defer).map((s) => s.src);
  assert.deepEqual(bloquants, [], 'un script distant classique sans defer bloque le premier affichage');
  const differes = distants.map((s) => s.src.split('/')[3]).sort();
  assert.deepEqual(differes, ['maplibre-gl@5.6.1', 'suncalc@1.8.0']);
});

test('l\'application (module) vient APRÈS les scripts différés : ses globales sont là', () => {
  const module = scripts.find((s) => s.type === 'module' && s.src && /app_v7\.js/.test(s.src));
  assert.ok(module, 'le module d\'application est introuvable');
  for (const s of distants) assert.ok(s.index < module.index, `${s.src} doit précéder app_v7.js`);
});

test('aucun script inline ne lit maplibregl ou SunCalc avant la fin de l\'analyse', () => {
  const lecteurs = scripts.filter((s) => !s.src && !s.type && /\b(maplibregl|SunCalc)\b/.test(s.corps)).map((s) => s.corps.slice(0, 60));
  assert.deepEqual(lecteurs, [], 'un script inline classique s\'exécute avant les scripts différés : maplibregl et SunCalc n\'existent pas encore');
});

test('la carte d\'import est déclarée avant tout module (un module qui importe three.js la lit à son chargement)', () => {
  const carte = scripts.find((s) => s.type === 'importmap');
  const premierModule = scripts.find((s) => s.type === 'module');
  assert.ok(carte && premierModule, 'carte d\'import ou module introuvable');
  assert.ok(carte.index < premierModule.index);
});
