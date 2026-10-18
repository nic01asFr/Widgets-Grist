/**
 * La page « Un orage qui traverse la métropole » (demos/hote-chaleur/index.html) : une carte de chaleur dans le temps, sur des données simulées dans la page.
 * Ce que le test garde : aucune donnée réelle ni aucun service de données, une simulation qui se rejoue à l'identique, un temps qui avance par pas fixes,
 * et le statut dit (données simulées, prototype).
 * node --test projects/Atlas/tests/demo-chaleur.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ICI, '..', 'demos', 'hote-chaleur', 'index.html'), 'utf8');
const NL = String.fromCharCode(10);

/** La simulation, extraite de la page et rejouée sous Node (elle ne touche ni au DOM ni au réseau). */
function charger() {
  const m = /\/\/ ---- La simulation[\s\S]*?(?=\/\/ ---- La scène)/.exec(html);
  assert.ok(m, 'bloc de simulation introuvable');
  const ctx = {};
  vm.runInNewContext(m[0] + NL + 'globalThis.R = { simuler, cellule, heureEnTexte: (h) => { const mm = Math.round((h - Math.floor(h)) * 60); return Math.floor(h) + " h " + String(mm).padStart(2, "0"); }, DEBUT, FIN, PAS, POINTS_PAR_INSTANT };', ctx);
  return ctx.R;
}

test('la page ne nomme aucun service de données, et dit que les données sont simulées et la brique un prototype', () => {
  const hotes = new Set([...html.matchAll(/https?:\/\/([a-z0-9.-]+)\//g)].map((m) => m[1]));
  for (const h of hotes) assert.ok(/^(www\.w3\.org)$/.test(h), 'hôte inattendu : ' + h);
  assert.match(html, /Données simulées/);
  assert.match(html, /class="proto">Prototype/, 'le statut de la brique est dit');
  assert.match(html, /Aucune donnée réelle/);
  assert.ok(html.length < 20000, 'une page, pas un jeu de données : ' + html.length);
});

test('la simulation se rejoue à l\'identique et produit le même nombre de points à chaque instant', () => {
  const { simuler, DEBUT, FIN, PAS, POINTS_PAR_INSTANT } = charger();
  const a = simuler(), b = simuler();
  assert.deepEqual(a.pluie.slice(0, 40), b.pluie.slice(0, 40), 'même graine, mêmes points');
  const instants = Math.round((FIN - DEBUT) / PAS) + 1;
  assert.equal(a.heures.length, instants);
  assert.equal(a.pluie.length, instants * POINTS_PAR_INSTANT);
  assert.equal(a.centre.length, instants, 'un centre de cellule par instant');
  const par = new Map();
  for (const f of a.pluie) par.set(f.properties.heure, (par.get(f.properties.heure) || 0) + 1);
  assert.ok([...par.values()].every((n) => n === POINTS_PAR_INSTANT), 'autant de mesures à chaque instant');
});

test('les identifiants sont des entiers uniques sur toute la scène, comme l\'exige le contrat', () => {
  const { simuler } = charger();
  const s = simuler();
  const ids = [...s.pluie, ...s.centre].map((f) => f.id);
  assert.ok(ids.every(Number.isInteger));
  assert.equal(new Set(ids).size, ids.length);
});

test('le temps avance par pas fixes, de DEBUT à FIN bornes comprises, et les heures se lisent en français', () => {
  const { simuler, heureEnTexte, DEBUT, FIN, PAS } = charger();
  const h = simuler().heures;
  assert.equal(h[0], DEBUT); assert.equal(h[h.length - 1], FIN);
  for (let i = 1; i < h.length; i += 1) assert.ok(Math.abs(h[i] - h[i - 1] - PAS) < 1e-6, 'pas irrégulier en ' + h[i]);
  assert.equal(heureEnTexte(13), '13 h 00'); assert.equal(heureEnTexte(16.5), '16 h 30'); assert.equal(heureEnTexte(18.75), '18 h 45');
});

test('la cellule traverse la région du sud-ouest au nord-est, et sa force monte puis redescend', () => {
  const { cellule, DEBUT, FIN } = charger();
  const a = cellule(DEBUT), m = cellule((DEBUT + FIN) / 2), z = cellule(FIN);
  assert.ok(a.lon < m.lon && m.lon < z.lon, 'vers l\'est');
  assert.ok(a.lat < m.lat && m.lat < z.lat, 'vers le nord');
  assert.ok(m.pic > a.pic && m.pic > z.pic, 'le pic est au milieu');
  assert.ok(m.pic <= 42, 'sous le maximum déclaré pour le poids (poidsMax)');
});

test('les intensités des mesures restent dans l\'échelle de la carte de chaleur', () => {
  const { simuler } = charger();
  for (const f of simuler().pluie) assert.ok(f.properties.intensite >= 0 && f.properties.intensite <= 42, 'intensité hors échelle : ' + f.properties.intensite);
  assert.match(html, /poidsMax: 42/);
});

test('la page pilote le temps par les commandes du composant et reste accessible au clavier et au lecteur d\'écran', () => {
  assert.match(html, /carte\.setTime\(/); assert.match(html, /carte\.play\(\{ parSeconde: 4, boucle: true \}\)/); assert.match(html, /carte\.pause\(\)/);
  assert.match(html, /<input id="heure-curseur" type="range"[^>]*aria-label=/);
  assert.match(html, /aria-valuetext/);
  assert.match(html, /id="annonce" role="status" aria-live="polite"/);
  assert.match(html, /aria-pressed/);
  assert.match(html, /:focus-visible/);
  assert.match(html, /min-height: 44px/, 'cibles tactiles de 44 px');
  assert.match(html, /charte="herite"/);
});

test('la lecture ne bavarde pas : l\'annonce n\'est faite que lorsque la personne déplace le curseur', () => {
  assert.match(html, /afficher\(c\.valeur, !enLecture\)/, 'pas d\'annonce pendant la lecture');
});
