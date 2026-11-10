/**
 * L'apparence d'ORIGINE d'Atlas est celle de l'instance Grist DINUM (lib/charte/origine-grist.js), pas la palette historique : trois graines ThemeDef lues par la chaîne d'Atlas.
 * Les valeurs de `:root` (index_v7.html) en sont la copie, pour que la première image soit la bonne sans attendre un module : ce test les compare, une dérive le casse.
 * `?theme=atlas` rend la palette historique. node --test projects/Atlas/tests/origine-grist.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { origineGrist, THEMEDEF_ORIGINE, PILE_ORIGINE } from '../lib/charte/origine-grist.js';
import { contraste } from '../lib/charte/couleurs.js';
import { resoudre } from '../lib/charte/resolution.js';
import { CHARTE_ATLAS } from '../lib/charte/defauts.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const lire = (f) => fs.readFileSync(path.join(ICI, '..', f), 'utf8').replace(/\r\n/g, '\n');
const html = lire('index_v7.html');
const app = lire('app_v7.js');

/** Les déclarations `--x: valeur;` d'un bloc CSS. */
function declarations(bloc) {
  const out = {};
  for (const m of bloc.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const blocRoot = /:root \{([\s\S]*?)\n        \}/.exec(html)[1];
const blocAtlas = /html\[data-origine="atlas"\] \{([\s\S]*?)\n        \}/.exec(html)[1];
const racine = declarations(blocRoot);
const historique = declarations(blocAtlas);
const { charte, variables } = origineGrist();

test('les graines d\'origine sont celles de l\'instance DINUM relevée en réel (THEMEDEF-INSTANCE-GRIST.md, V3)', () => {
  assert.equal(THEMEDEF_ORIGINE.version, 'themedef-1.0');
  assert.deepEqual({ ...THEMEDEF_ORIGINE.graines }, { principal: '#3E5DE7', fond: '#F6F8F9', encre: '#222631' });
  assert.ok(charte, 'la chaîne d\'Atlas accepte ce ThemeDef');
});

test('le `:root` d\'index_v7.html est la copie exacte des variables calculées par la chaîne d\'Atlas', () => {
  for (const cle of ['--bg', '--surface', '--surface-muted', '--ink', '--text', '--muted', '--muted-light', '--hairline', '--hairline-strong', '--accent', '--accent-soft']) {
    assert.equal(racine[cle].toLowerCase(), String(variables[cle]).toLowerCase(), cle);
  }
  assert.equal(racine['--sans'], PILE_ORIGINE);
  assert.equal(racine['--serif'], PILE_ORIGINE);
});

test('`?theme=atlas` rend la palette historique : crème, terre cuite, Newsreader et Hanken Grotesk', () => {
  assert.equal(historique['--bg'], '#F4EFE3');
  assert.equal(historique['--accent'], '#C44536');
  assert.equal(historique['--ink'], '#1F1B14');
  assert.match(historique['--serif'], /Newsreader/);
  assert.match(historique['--sans'], /Hanken Grotesk/);
  for (const cle of ['--bg', '--surface', '--surface-muted', '--ink', '--text', '--muted', '--muted-light', '--hairline', '--hairline-strong', '--accent', '--accent-soft']) assert.ok(cle in historique, cle);
});

test('le script de tête pose data-origine="atlas" pour `?theme=atlas` seulement', () => {
  const script = /<script>try \{ if \(new URLSearchParams\(location\.search\)\.get\('theme'\) === 'atlas'\)[^<]*<\/script>/.exec(html);
  assert.ok(script, 'script de tête présent');
  const corps = script[0].replace(/^<script>|<\/script>$/g, '');
  const poser = (recherche) => { const attrs = {}; new Function('URLSearchParams', 'location', 'document', corps)(URLSearchParams, { search: recherche }, { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } }); return attrs['data-origine']; };
  assert.equal(poser('?theme=atlas'), 'atlas');
  assert.equal(poser(''), undefined);
  assert.equal(poser('?theme=aucun'), undefined);
  assert.equal(poser('?theme=contraste-eleve'), undefined);
});

test('lisible : texte, texte secondaire et accent tiennent 4,5:1 sur le fond et sur les surfaces (les garde-fous de la chaîne)', () => {
  for (const [nom, c] of [['ink', variables['--ink']], ['text', variables['--text']], ['muted', variables['--muted']], ['accent', variables['--accent']]]) {
    for (const fond of [variables['--bg'], variables['--surface']]) assert.ok(contraste(c, fond) >= 4.5, `${nom} ${c} sur ${fond} : ${contraste(c, fond).toFixed(2)}`);
  }
});

test('le fond de carte et les palettes de données suivent la charte d\'origine : un plan qui n\'est plus celui d\'Atlas', () => {
  const origine = resoudre({ hote: charte }).charte;
  const atlas = resoudre({ hote: {} }).charte;
  assert.notDeepEqual(origine.fond.plan, atlas.fond.plan);
  assert.equal(origine.graines.principal.toLowerCase(), '#3e5de7');
  assert.equal(CHARTE_ATLAS.graines.principal, '#c44536', 'la charte d\'Atlas elle-même n\'est pas modifiée');
});

test('l\'application part de la charte d\'origine et y revient quand aucun thème ne s\'applique ; `?theme=atlas` rend le plan d\'Atlas', () => {
  assert.match(app, /import \{ origineGrist \} from '\.\/lib\/charte\/origine-grist\.js\?v=/);
  assert.match(app, /function charteOrigineInitiale\(\) \{ try \{ return themeAtlasDemande\(\) \? null : origineGrist\(\)\.charte; \}/);
  assert.match(app, /_charteDuFond = charteOrigineInitiale\(\), _fondThemeModule = null,/);
  // les deux retours « sans thème » (`?theme=aucun` et thème d'instance inutilisable) reprennent l'origine, plus null
  assert.equal(app.split('_charteDuFond = charteOrigineInitiale();').length - 1, 2);
  assert.ok(!/_charteDuFond = null;/.test(app), 'plus de retour au plan d\'Atlas sans l\'avoir demandé');
});

test('l\'écran d\'accueil suit la marque et les couleurs de la charte : plus de logo rouge écrit en dur', () => {
  const hote = lire('lib/hote-ui.js');
  const marque = /const MARQUE = `[\s\S]*?<\/div>`;/.exec(hote)[0];
  assert.ok(!/#[0-9a-fA-F]{3,6}/.test(marque), 'aucune couleur littérale dans le logo de l\'accueil');
  assert.ok(hote.includes('html[data-marque="aucune"] .hote-marque { display: none; }'));
  assert.ok(hote.includes('html[data-marque="icone"] .hote-marque span { display: none; }'));
  assert.ok(hote.includes('.hote-logo-corps { fill: var(--accent, #3e5de7); }'));
});
