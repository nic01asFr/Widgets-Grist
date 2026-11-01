/**
 * Le thème de l'instance Grist, repris quand le document n'a pas de thème : de ce que Grist donne à un widget vers un ThemeDef, puis par la chaîne ThemeDef
 * d'Atlas vers les jetons de l'application, avec les garde-fous de contraste. Les valeurs sont celles MESURÉES sur docs.getgrist.com (GristLight) et lues dans
 * grist-core (GristDark).
 * node --test projects/Atlas/tests/charte-theme-instance.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { themeDeLInstance, hexSur, pileSure, CLES, PREFIXE } from '../lib/charte/theme-instance.js';
import { charteDepuisThemeDef } from '../lib/charte/depuis-themedef.js';
import { habillageApplication } from '../lib/charte/theme-document.js';
import { contraste } from '../lib/charte/couleurs.js';
import { VARIABLES } from '../lib/charte/application.js';

const CLAIR = { appearance: 'light', name: 'GristLight', colors: { 'control-primary-bg': '#16b378', 'primary-muted': '#009058', 'primary-dim': '#007548', 'page-bg': '#f7f7f7', 'text': '#262633', 'widget-bg': '#ffffff', 'bg': 'url("img/gplaypattern.png")' } };
const SOMBRE = { appearance: 'dark', name: 'GristDark', colors: { 'control-primary-bg': '#157a54', 'primary-muted': '#1da270', 'primary-dim': '#157a54', 'link': '#17b378', 'control-fg': '#17b378', 'primary': '#17b378', 'page-bg': '#262633', 'text': '#efefef' } };
const variablesDe = (theme, lire) => {
  const t = themeDeLInstance(theme, lire);
  const r = t.themedef ? charteDepuisThemeDef(t.themedef, { mode: 'clair' }) : { charte: null, ignore: [] };
  return { t, r, h: r.charte ? habillageApplication({ charte: r.charte }) : { variables: {}, notes: [] } };
};

test('hexSur : #rrggbb et #rgb repris, tout le reste écarté', () => {
  assert.equal(hexSur('#16B378'), '#16b378'); assert.equal(hexSur(' #abc '), '#aabbcc');
  for (const mauvais of ['rgba(22,179,120,0.5)', 'red', 'url("img/x.png")', '#12345', '#1234567', '', null, 42, undefined]) assert.equal(hexSur(mauvais), null, String(mauvais));
});

test('thème clair de Grist (contrat unique, 4,5:1) : le vert d accent (2,5:1) et sa variante « muted » (3,8:1) ne tiennent pas, « dim » est retenu ; fond de page et texte deviennent des graines ThemeDef, police système', () => {
  const t = themeDeLInstance(CLAIR);
  assert.deepEqual(t.themedef, { version: 'themedef-1.0', nom: 'Instance Grist (GristLight)', graines: { principal: '#007548', fond: '#f7f7f7', encre: '#262633' }, police: 'systeme' });
  assert.equal(t.sombre, false); assert.deepEqual(t.ecartes, []);
});

test('chaîne complète, thème clair : l\'application prend l\'accent de Grist, son fond et sa police', () => {
  const { r, h } = variablesDe(CLAIR);
  assert.equal(r.source, 'graines'); assert.deepEqual(r.ignore, []);
  assert.equal(h.variables['--accent'], '#007548');
  assert.equal(h.variables['--bg'], '#f7f7f7');
  assert.equal(h.variables['--ink'], '#262633');
  assert.match(h.variables['--sans'], /system-ui/);
  for (const nom of Object.keys(h.variables)) assert.ok(VARIABLES.includes(nom), nom + ' est un jeton connu de l\'application');
});

test('thème sombre : l interface est retournée (mode sombre, fond et encre du thème), l accent est celui qui se lit sur ce fond', () => {
  const { t, h } = variablesDe(SOMBRE);
  assert.equal(t.sombre, true);
  assert.equal(h.variables['--mode-application'], 'sombre');
  assert.equal(h.variables['--bg'], '#262633'); assert.equal(h.variables['--ink'], '#efefef');
  assert.equal(h.variables['--accent'], '#4ab58d', 'la couleur de Grist retenue par le contrat (#1da270, 4,5:1 sur le fond) est éclaircie jusqu à tenir 4,5:1 sur la surface des cartes que l application pose');
  assert.ok(!h.notes.includes('fond-sombre-non-suivi'));
});

test('une couleur qui n\'est pas #rrggbb est écartée et dite ; sans accent reprenable, aucun thème repris', () => {
  const t = themeDeLInstance({ colors: { 'control-primary-bg': 'rgba(22,179,120,0.5)', 'page-bg': '#f7f7f7', 'text': 'noir' } });
  assert.equal(t.themedef, null);
  assert.deepEqual(t.ecartes.map((e) => e.cle + ':' + e.code).sort(), ['control-primary-bg:valeur-ecartee', 'text:valeur-ecartee']);
  const u = themeDeLInstance({ colors: { 'control-primary-bg': '#16b378', 'page-bg': 'url(x)' } });
  assert.equal(u.themedef.graines.principal, '#11865a', 'l action trop pâle est redressée à 4,5:1 (règle 5), et dit'); assert.equal(u.themedef.graines.fond, undefined);
  assert.deepEqual(u.ecartes.map((e) => e.cle + ':' + e.code).sort(), ['control-primary-bg:action-redressee', 'page-bg:valeur-ecartee']);
});

test('à défaut de `colors`, les variables CSS --grist-theme-* sont lues ; entrée absente ou illisible : rien, sans bruit', () => {
  const css = { [PREFIXE + CLES.principal]: '#16b378', [PREFIXE + CLES.fond]: '#f7f7f7', [PREFIXE + CLES.encre]: '#262633' };
  const t = themeDeLInstance({ appearance: 'light' }, (nom) => css[nom] || '');
  assert.equal(t.themedef.graines.principal, '#108156', 'redressé à 4,5:1 sur le fond #f7f7f7'); assert.equal(t.themedef.nom, 'Instance Grist');
  for (const rien of [null, undefined, 'x', 42, []]) assert.equal(themeDeLInstance(rien).themedef, null);
  assert.equal(themeDeLInstance({ colors: null }).themedef, null);
});

test('le nom du thème ne passe pas tel quel : tronqué', () => {
  const t = themeDeLInstance({ name: 'x'.repeat(500), colors: { 'control-primary-bg': '#16b378' } });
  assert.ok(t.themedef.nom.length <= 60);
});

test('l accent pris tient toujours 4,5:1 sur le fond que l application aura (contrat unique : redressé s il ne tient pas, et dit)', () => {
  const { h } = variablesDe(CLAIR);
  assert.ok(contraste(h.variables['--accent'], h.variables['--bg']) >= 4.5);
  const pale = { colors: { 'control-primary-bg': '#cde8d9', 'primary-muted': '#d5eadf', 'page-bg': '#f7f7f7' } };
  const v = variablesDe(pale);
  assert.ok(v.t.ecartes.some((e) => e.code === 'action-redressee'));
  assert.ok(contraste(v.t.themedef.graines.principal, '#f7f7f7') >= 4.5);
});

const PILE_GRIST = ['-apple-system,BlinkMacSystemFont,Segoe UI,Liberation Sans,', '    Helvetica,Arial,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol'].join(String.fromCharCode(10));
const PILE_DINUM = 'Marianne,-apple-system,BlinkMacSystemFont,Liberation Sans, Helvetica,Arial,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol';

test('la police de l instance : sa pile exacte, relevée sur docs.getgrist.com et sur DINUM (Marianne en tête)', () => {
  const grist = themeDeLInstance({ colors: { 'control-primary-bg': '#007548', 'font-family': PILE_GRIST } });
  assert.equal(grist.pile, '-apple-system,BlinkMacSystemFont,Segoe UI,Liberation Sans, Helvetica,Arial,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol');
  const dinum = themeDeLInstance({ colors: { 'control-primary-bg': '#3E5DE7', 'font-family': PILE_DINUM } });
  assert.ok(dinum.pile.startsWith('Marianne,')); assert.ok(dinum.themedef.police === 'systeme', 'ThemeDef garde la police système, la pile exacte est reprise à part');
});

test('une pile qui pourrait sortir de la déclaration est refusée : le point-virgule, l accolade, url(, un texte trop long', () => {
  for (const mauvaise of ['Arial; background: red', 'a } b {', 'url(http://x/f.woff)', 'x'.repeat(301), '', null, 42, 'Arial, <script>']) assert.equal(pileSure(mauvaise), null, String(mauvaise).slice(0, 30));
  assert.equal(pileSure('Marianne, "Segoe UI", sans-serif'), 'Marianne, "Segoe UI", sans-serif');
});

test('la pile se lit aussi dans les variables CSS --grist-theme-font-family', () => {
  const css = { [PREFIXE + 'control-primary-bg']: '#007548', [PREFIXE + 'font-family']: PILE_DINUM };
  assert.ok(themeDeLInstance({ appearance: 'light' }, (n) => css[n] || '').pile.startsWith('Marianne'));
  assert.equal(themeDeLInstance({ colors: { 'control-primary-bg': '#007548' } }).pile, null);
});
