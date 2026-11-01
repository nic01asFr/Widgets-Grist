/**
 * Atlas colle au thème du document : la couleur d'accent de la carte (trajet, halo de sélection, tracé de saisie) et du CSS (teintes, poignées, police) vient du jeton --accent / --sans
 * que la charte redéfinit, plus d'un rouge figé dans le code. Le rouge d'origine ne reste que comme repli.
 * node --test projects/Atlas/tests/accent-themedef.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const lire = (f) => fs.readFileSync(path.join(ICI, '..', f), 'utf8');
const app = lire('app_v7.js'), html = lire('index_v7.html');

test('la carte lit l\'accent courant dans le jeton CSS au moment de dessiner', () => {
  assert.match(app, /function accentCourant\(\)[\s\S]*?getPropertyValue\('--accent'\)/);
  assert.match(app, /const couleurTrace = accentCourant;/);
});

test('le rouge d\'origine n\'est plus qu\'un repli : trajet, halo de sélection, tracé et pastille d\'étape passent par l\'accent', () => {
  const sansRepli = app
    .replace("const ACCENT_PAR_DEFAUT = '#C44536';", '')
    .replace("'var(--accent, #C44536)'", '')
    .replace("const c = ['#C44536', '#2E4E54'", "const c = ['#2E4E54'");   // la palette de couleurs aléatoires de couches : des données, pas l'identité
  assert.ok(!sansRepli.includes('#C44536'), 'aucun #C44536 littéral hors repli');
  assert.ok(!/'rgba\(196,69,54/.test(app));
  assert.match(app, /const haloSelection = \(\) => \[/);
});

test('le CSS : plus de teinte rgba du rouge d\'origine ni du papier d\'origine, tout passe par color-mix sur les jetons', () => {
  assert.ok(!/rgba\(196,\s*69,\s*54/.test(html));
  assert.ok(!/rgba\(244,\s*239,\s*227/.test(html));
  assert.match(html, /color-mix\(in srgb, var\(--accent\) \d+%, transparent\)/);
  assert.match(html, /\.trajet-poignee \{[^}]*background: var\(--accent\)/);
  assert.match(html, /\.trajet-sens \{[^}]*border-left: 7px solid var\(--accent\)/);
});

test('la police de la légende suit --sans (la charte la redéfinit), pas un nom de police figé', () => {
  assert.ok(!/font-family: 'Hanken Grotesk', sans-serif;/.test(html));
});
