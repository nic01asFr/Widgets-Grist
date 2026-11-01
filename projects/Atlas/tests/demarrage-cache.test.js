/**
 * La mémoire de démarrage : la première image est déjà la bonne (thème, fond de carte, vue), sans écran de chargement.
 * node --test projects/Atlas/tests/demarrage-cache.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleCache, assainirVariables, assainirPlan, assainirVue, assainirCache, lireCache, ecrireCache, VARIABLES_PERMISES, FORMAT, PREFIXE } from '../lib/demarrage-cache.js';
import { themerStyle, peintureFondTheme } from '../lib/fond-theme.js';
import { VARIABLES } from '../lib/charte/application.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const lire = (f) => fs.readFileSync(path.join(ICI, '..', f), 'utf8');
const html = lire('index_v7.html'), app = lire('app_v7.js');

const stockage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, _m: m }; };

test('la clé est celle de l instance hôte ; une origine illisible ou absente : pas de mémoire', () => {
  assert.equal(cleCache('https://grist.numerique.gouv.fr'), PREFIXE + 'https://grist.numerique.gouv.fr');
  for (const mauvaise of [null, undefined, '', 'javascript:alert(1)', 'https://a/b', 'https://x y', 42]) assert.equal(cleCache(mauvaise), null, String(mauvaise));
});

test('les variables permises sont exactement celles de la charte de l application (aucune de plus)', () => {
  assert.deepEqual([...VARIABLES_PERMISES].sort(), [...VARIABLES].sort());
});

test('variables : seules les permises, seules des valeurs de couleur, de pile ou de mode ; tout ce qui pourrait sortir de la déclaration est écarté', () => {
  const ok = assainirVariables({ '--accent': '#a2b6ff', '--sans': 'Marianne,-apple-system,Helvetica,Arial,sans-serif', '--mode-application': 'sombre', '--bg': 'rgb(1, 2, 3)' });
  assert.deepEqual(Object.keys(ok).sort(), ['--accent', '--bg', '--mode-application', '--sans']);
  const mauvais = assainirVariables({ '--accent': 'red; background: url(x)', '--bg': '}{', '--inconnue': '#fff', '--ink': 'x'.repeat(301), '--text': 42, '--muted': 'url(http://x)' });
  assert.deepEqual(mauvais, {});
  for (const rien of [null, undefined, 'x', [], 42]) assert.deepEqual(assainirVariables(rien), {});
});

test('plan : des couleurs #rrggbb seulement ; vue : des coordonnées valides seulement', () => {
  assert.deepEqual(assainirPlan({ fond: '#FFFFFF', eau: '#c0cacc', bati: 'rgba(1,2,3,.5)', inconnu: '#000000' }), { fond: '#ffffff', eau: '#c0cacc' });
  assert.deepEqual(assainirVue({ lng: 5.37, lat: 43.29, zoom: 16.4, pitch: 55, bearing: -18 }), { lng: 5.37, lat: 43.29, zoom: 16.4, pitch: 55, bearing: -18 });
  assert.deepEqual(assainirVue({ lng: 5.37, lat: 43.29 }), { lng: 5.37, lat: 43.29, zoom: null, pitch: null, bearing: null });
  for (const mauvaise of [null, {}, { lng: 500, lat: 0 }, { lng: 0, lat: 91 }, { lng: 'a', lat: 1 }, { lng: NaN, lat: 0 }]) assert.equal(assainirVue(mauvaise), null);
  assert.equal(assainirVue({ lng: 1, lat: 1, zoom: 99, pitch: 200, bearing: 'x' }).zoom, null);
});

test('écriture et relecture : le thème et la vue se gardent séparément ; un stockage illisible ou refusé ne casse rien', () => {
  const s = stockage(), cle = cleCache('https://grist.example.org');
  assert.equal(ecrireCache(s, cle, { theme: { variables: { '--accent': '#a2b6ff' }, mode: 'sombre', plan: { fond: '#222631' } } }), true);
  assert.equal(ecrireCache(s, cle, { vue: { lng: 5.37, lat: 43.29, zoom: 16, pitch: 55, bearing: 0 } }), true);
  const c = lireCache(s, cle);
  assert.equal(c.format, FORMAT); assert.equal(c.theme.mode, 'sombre'); assert.equal(c.theme.variables['--accent'], '#a2b6ff'); assert.equal(c.theme.plan.fond, '#222631'); assert.equal(c.vue.zoom, 16);
  s.setItem(cle, '{pas du json'); assert.deepEqual(lireCache(s, cle), { format: FORMAT, theme: null, vue: null });
  s.setItem(cle, JSON.stringify({ format: 99, theme: {} })); assert.equal(lireCache(s, cle).theme, null);
  assert.equal(ecrireCache({ getItem() { return null; }, setItem() { throw new Error('quota'); } }, cle, { vue: { lng: 1, lat: 1 } }), false);
  assert.deepEqual(lireCache(null, cle), { format: FORMAT, theme: null, vue: null }); assert.equal(ecrireCache(s, null, { vue: {} }), false);
  const piege = assainirCache({ format: FORMAT, theme: { variables: { '--accent': 'red}body{display:none' }, mode: 'x', plan: { fond: 'javascript:1' } }, vue: null });
  assert.deepEqual(piege.theme, { variables: {}, mode: 'clair', plan: {} });
});

/** Le script de tête, exécuté contre un faux navigateur : ce qu'il pose avant le premier affichage. */
function executerScriptDeTete({ ancetres = ['https://grist.example.org'], referrer = '', origine = 'https://nic01asfr.github.io', search = '', memoire = null }) {
  const script = /<script>\s*\/\* Mémoire de démarrage[\s\S]*?<\/script>/.exec(html)[0].replace(/^<script>|<\/script>$/g, '');
  const props = {}, attrs = {}, classes = new Set(), minuteries = [];
  const h = { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) }, style: { setProperty: (k, v) => { props[k] = v; } }, setAttribute: (k, v) => { attrs[k] = v; } };
  const win = {};
  const loc = { ancestorOrigins: ancetres, origin: origine, search };
  const stock = { getItem: (k) => (memoire && memoire[k] !== undefined ? memoire[k] : null) };
  new Function('window', 'location', 'document', 'localStorage', 'setTimeout', 'URL', script)(win, loc, { referrer, documentElement: h }, stock, (f, ms) => { minuteries.push(ms); }, URL);
  return { win, props, attrs, classes, minuteries };
}

test('script de tête : pas embarqué ou composant BI, rien ; embarqué, la classe de démarrage et, avec une mémoire, le thème avant le premier affichage', () => {
  const cle = 'atlas-demarrage:https://grist.example.org';
  const sombre = JSON.stringify({ format: 1, theme: { variables: { '--accent': '#a2b6ff', '--bg': '#222631', '--sans': 'Marianne,Arial,sans-serif' }, mode: 'sombre', plan: { fond: '#222631' } }, vue: { lng: 5.37, lat: 43.29, zoom: 16, pitch: 55, bearing: 0 } });
  const seul = executerScriptDeTete({ ancetres: [], referrer: '' });
  assert.equal(seul.classes.size, 0); assert.deepEqual(seul.props, {});
  const bi = executerScriptDeTete({ search: '?bi=1&profil=complet', memoire: { [cle]: sombre } });
  assert.equal(bi.classes.size, 0); assert.deepEqual(bi.props, {});
  const emmeme = executerScriptDeTete({ ancetres: ['https://nic01asfr.github.io'] });
  assert.equal(emmeme.classes.size, 0);
  const vide = executerScriptDeTete({});
  assert.ok(vide.classes.has('atlas-demarrage')); assert.deepEqual(vide.minuteries, [10000]); assert.deepEqual(vide.props, {});
  const e = executerScriptDeTete({ memoire: { [cle]: sombre } });
  assert.equal(e.props['--accent'], '#a2b6ff'); assert.equal(e.props['--bg'], '#222631'); assert.equal(e.props['color-scheme'], 'dark'); assert.equal(e.attrs['data-mode'], 'sombre');
  assert.equal(e.win.__atlasCleDemarrage, cle); assert.equal(e.win.__atlasDemarrage.vue.zoom, 16);
});

test('script de tête : une mémoire piégée ou d un autre format ne pose rien', () => {
  const cle = 'atlas-demarrage:https://grist.example.org';
  const piege = executerScriptDeTete({ memoire: { [cle]: JSON.stringify({ format: 1, theme: { variables: { '--accent': 'red}body{display:none', '--inconnue': '#fff', '--bg': 'url(x)' }, mode: 'clair' } }) } });
  assert.deepEqual(piege.props, {});
  const ancien = executerScriptDeTete({ memoire: { [cle]: JSON.stringify({ format: 2, theme: { variables: { '--accent': '#fff' } } }) } });
  assert.deepEqual(ancien.props, {});
  const casse = executerScriptDeTete({ memoire: { [cle]: '{pas du json' } });
  assert.deepEqual(casse.props, {}); assert.ok(casse.classes.has('atlas-demarrage'));
});

test('la liste du script de tête est celle du module (un test les garde alignés)', () => {
  const m = /var permises = \[([^\]]*)\]/.exec(html)[1].match(/'(--[a-z0-9-]+)'/g).map((x) => x.replace(/'/g, ''));
  assert.deepEqual(m.sort(), [...VARIABLES_PERMISES].sort());
});

test('themerStyle : un style déjà peint avec le plan, sans modifier celui reçu ; le reste du style est gardé', () => {
  const style = { version: 8, sources: { openmaptiles: { type: 'vector' } }, sprite: 's', glyphs: 'g', layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#f8f4f0' } },
    { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': '#9ac' } },
    { id: 'poi_r20', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi', layout: { 'icon-image': 'x' } },
    { id: 'building-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', paint: { 'fill-extrusion-height': 10 } },
    { id: 'ma-couche', type: 'fill', source: 'ma-couche', paint: { 'fill-color': '#f00' } },
  ] };
  const avant = JSON.stringify(style), plan = { fond: '#222631', eau: '#304060', bati: '#2c3445' };
  const r = themerStyle(style, plan), par = Object.fromEntries(r.layers.map((l) => [l.id, l]));
  assert.equal(JSON.stringify(style), avant, 'le style reçu n est pas modifié');
  assert.equal(par.background.paint['background-color'], '#222631'); assert.equal(par.water.paint['fill-color'], '#304060');
  assert.equal(par.poi_r20.layout.visibility, 'none'); assert.equal(par.poi_r20.layout['icon-image'], 'x');
  assert.equal(par['building-3d'].paint['fill-extrusion-color'], '#2c3445'); assert.equal(par['building-3d'].paint['fill-extrusion-height'], 10); assert.equal(par['building-3d'].layout, undefined);
  assert.deepEqual(par['ma-couche'], style.layers[4]);
  assert.equal(r.glyphs, 'g'); assert.equal(r.sprite, 's'); assert.deepEqual(r.sources, style.sources);
  assert.equal(themerStyle(null, plan), null); assert.deepEqual(themerStyle({ version: 8 }, plan), { version: 8 });
  assert.equal(peintureFondTheme(style.layers, plan).length, 4);
});

test('application : la carte naît peinte (style de base demandé tôt, repeint, vue mémorisée), le fond se remplace peint, le démarrage est levé après les données', () => {
  assert.match(app, /const _styleBasePrefetch = /);
  assert.match(app, /async function initMap\(\)/); assert.match(app, /await initMap\(\);/);
  assert.match(app, /styleInitial = _fondThemeModule\.themerStyle\(json, _planTheme\)/);
  assert.match(app, /style: styleInitial,/);
  assert.match(app, /transformStyle: \(avant, apres\) => _fondThemeModule\.themerStyle\(apres, _planTheme\)/);
  assert.match(app, /ecrireCache\(localStorage, window\.__atlasCleDemarrage, \{ vue:/);
  assert.match(app, /ecrireCache\(localStorage, window\.__atlasCleDemarrage, \{ theme:/);
  assert.match(app, /classList\.remove\('atlas-demarrage'\)/);
  assert.match(html, /html\.atlas-demarrage \.brand-project, html\.atlas-demarrage \.dirty-dot, html\.atlas-demarrage \.legend \{ visibility: hidden; \}/);
});
