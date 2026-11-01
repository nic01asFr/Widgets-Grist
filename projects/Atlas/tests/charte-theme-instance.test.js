/**
 * Le thème de l'instance Grist, repris quand le document n'a pas de thème : de ce que Grist donne à un widget vers un ThemeDef, puis par la chaîne ThemeDef
 * d'Atlas vers les jetons de l'application, avec les garde-fous de contraste. Les valeurs sont celles MESURÉES sur docs.getgrist.com (GristLight) et lues dans
 * grist-core (GristDark).
 * node --test projects/Atlas/tests/charte-theme-instance.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { themeDeLInstance, hexSur, CLES, PREFIXE } from '../lib/charte/theme-instance.js';
import { charteDepuisThemeDef } from '../lib/charte/depuis-themedef.js';
import { habillageApplication } from '../lib/charte/theme-document.js';
import { contraste } from '../lib/charte/couleurs.js';
import { VARIABLES } from '../lib/charte/application.js';

const CLAIR = { appearance: 'light', name: 'GristLight', colors: { 'control-primary-bg': '#16b378', 'primary-muted': '#009058', 'primary-dim': '#007548', 'page-bg': '#f7f7f7', 'text': '#262633', 'widget-bg': '#ffffff', 'bg': 'url("img/gplaypattern.png")' } };
const SOMBRE = { appearance: 'dark', name: 'GristDark', colors: { 'control-primary-bg': '#17b378', 'primary-muted': '#1da270', 'primary-dim': '#157a54', 'page-bg': '#262633', 'text': '#efefef' } };
const variablesDe = (theme, lire) => {
  const t = themeDeLInstance(theme, lire);
  const r = t.themedef ? charteDepuisThemeDef(t.themedef, { mode: 'clair' }) : { charte: null, ignore: [] };
  return { t, r, h: r.charte ? habillageApplication({ charte: r.charte }) : { variables: {}, notes: [] } };
};

test('hexSur : #rrggbb et #rgb repris, tout le reste écarté', () => {
  assert.equal(hexSur('#16B378'), '#16b378'); assert.equal(hexSur(' #abc '), '#aabbcc');
  for (const mauvais of ['rgba(22,179,120,0.5)', 'red', 'url("img/x.png")', '#12345', '#1234567', '', null, 42, undefined]) assert.equal(hexSur(mauvais), null, String(mauvais));
});

test('thème clair de Grist : le vert d accent (2,5:1, trop pâle) cède à sa variante « muted » (4:1) ; fond de page et texte deviennent des graines ThemeDef, police système', () => {
  const t = themeDeLInstance(CLAIR);
  assert.deepEqual(t.themedef, { version: 'themedef-1.0', nom: 'Instance Grist (GristLight)', graines: { principal: '#009058', fond: '#f7f7f7', encre: '#262633' }, police: 'systeme' });
  assert.equal(t.sombre, false); assert.deepEqual(t.ecartes, []);
});

test('chaîne complète, thème clair : l\'application prend l\'accent de Grist, son fond et sa police', () => {
  const { r, h } = variablesDe(CLAIR);
  assert.equal(r.source, 'graines'); assert.deepEqual(r.ignore, []);
  assert.equal(h.variables['--accent'], '#009058');
  assert.equal(h.variables['--bg'], '#f7f7f7');
  assert.equal(h.variables['--ink'], '#262633');
  assert.match(h.variables['--sans'], /system-ui/);
  for (const nom of Object.keys(h.variables)) assert.ok(VARIABLES.includes(nom), nom + ' est un jeton connu de l\'application');
});

test('thème sombre : l\'interface claire d\'Atlas n\'est pas retournée (fond et encre non suivis, dits), l\'accent lisible est gardé', () => {
  const { t, h } = variablesDe(SOMBRE);
  assert.equal(t.sombre, true);
  assert.ok(h.notes.includes('fond-sombre-non-suivi') && h.notes.includes('encre-non-suivie'), h.notes.join());
  assert.equal(h.variables['--bg'], undefined); assert.equal(h.variables['--ink'], undefined);
  assert.equal(h.variables['--accent'], '#157a54', 'la variante sombre qui se lit sur le fond d Atlas');
});

test('une couleur qui n\'est pas #rrggbb est écartée et dite ; sans accent, aucun thème repris', () => {
  const t = themeDeLInstance({ colors: { 'control-primary-bg': 'rgba(22,179,120,0.5)', 'page-bg': '#f7f7f7', 'text': 'noir' } });
  assert.equal(t.themedef, null);
  assert.deepEqual(t.ecartes, [{ cle: 'control-primary-bg', code: 'couleur-non-reprise' }, { cle: 'text', code: 'couleur-non-reprise' }]);
  const u = themeDeLInstance({ colors: { 'control-primary-bg': '#16b378', 'page-bg': 'url(x)' } });
  assert.deepEqual(u.themedef.graines, { principal: '#16b378' }); assert.deepEqual(u.ecartes.map((e) => e.cle + ':' + e.code), ['page-bg:couleur-non-reprise', 'text:absent']);
});

test('à défaut de `colors`, les variables CSS --grist-theme-* sont lues ; entrée absente ou illisible : rien, sans bruit', () => {
  const css = { [PREFIXE + CLES.principal]: '#16b378', [PREFIXE + CLES.fond]: '#f7f7f7', [PREFIXE + CLES.encre]: '#262633' };
  const t = themeDeLInstance({ appearance: 'light' }, (nom) => css[nom] || '');
  assert.equal(t.themedef.graines.principal, '#16b378'); assert.equal(t.themedef.nom, 'Instance Grist');
  for (const rien of [null, undefined, 'x', 42, []]) assert.equal(themeDeLInstance(rien).themedef, null);
  assert.equal(themeDeLInstance({ colors: null }).themedef, null);
});

test('le nom du thème ne passe pas tel quel : tronqué', () => {
  const t = themeDeLInstance({ name: 'x'.repeat(500), colors: { 'control-primary-bg': '#16b378' } });
  assert.ok(t.themedef.nom.length <= 60);
});

test('l accent pris tient toujours 3:1 sur le fond que l application aura ; sinon l application garde le sien et le dit', () => {
  const { h } = variablesDe(CLAIR);
  assert.ok(contraste(h.variables['--accent'], h.variables['--bg']) >= 3);
  const pale = { colors: { 'control-primary-bg': '#cde8d9', 'primary-muted': '#d5eadf', 'page-bg': '#f7f7f7' } };
  const v = variablesDe(pale);
  assert.equal(v.h.variables['--accent'], undefined); assert.ok(v.h.notes.includes('accent-peu-lisible-non-suivi'));
});
