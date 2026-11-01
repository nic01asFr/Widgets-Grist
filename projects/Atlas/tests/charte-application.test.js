// L'identité de l'hôte sur l'application complète : variables dérivées des graines que l'hôte a données, refus dits, branchement du profil complet.
// node --test tests/charte-application.test.js   (aucun accès réseau, aucune dépendance)
import { luminance, contraste } from '../lib/charte/couleurs.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { variablesApplication, VARIABLES } from '../lib/charte/application.js';
import { charteDepuisKit } from '../lib/charte/depuis-kit.js';
import { resoudre } from '../lib/charte/resolution.js';
import { attacher } from '../lib/bi/bi-runtime.js';
import { brancher } from '../lib/bi/canevas.js';
import { carteSimulee } from './aide-carte-bi.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const kit = (paquet, mode) => JSON.parse(readFileSync(join(ICI, 'fixtures/kit-theme', `theme-formulaire.${paquet}.${mode}.json`), 'utf8'));
const lecture = (hote) => ({ charte: resoudre({ hote }).charte, hote: resoudre({ hote }).charte && assaini(hote) });
// ce que `getTheme` rend comme `hote` : la charte de l'hôte assainie (graines en minuscules)
const assaini = (h) => JSON.parse(JSON.stringify(h, (k, v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : v)));
const HEX = /^#[0-9a-f]{6}$/;

test('sans charte de l\'hôte : aucune variable, l\'application garde ses jetons', () => {
  assert.deepEqual(variablesApplication({ charte: resoudre({}).charte, hote: {} }), { variables: {}, notes: [] });
  assert.deepEqual(variablesApplication(null), { variables: {}, notes: [] });
  assert.deepEqual(variablesApplication({}), { variables: {}, notes: [] });
});

test('une charte claire du kit habille surfaces, encre, filets et accent ; seules des couleurs #rrggbb et la pile admise sont écrites', () => {
  const hote = charteDepuisKit(kit('grist', 'clair')).charte;
  const { variables, notes } = variablesApplication(lecture(hote));
  assert.deepEqual(notes, []);
  assert.equal(variables['--accent'], '#017c51'); assert.equal(variables['--ink'], '#262633'); assert.equal(variables['--bg'], '#ffffff');
  for (const nom of ['--bg', '--surface', '--surface-muted', '--ink', '--text', '--muted', '--muted-light', '--hairline', '--hairline-strong', '--accent', '--accent-soft']) assert.match(variables[nom], HEX, nom);
  assert.equal(variables['--sans'], 'system-ui, sans-serif'); assert.equal(variables['--serif'], variables['--sans']);
  for (const nom of Object.keys(variables)) assert.ok(VARIABLES.includes(nom), nom + ' : hors de la liste fermée');
  assert.equal('--accent2' in variables, false, 'le kit n\'a pas de couleur secondaire');
});

test('une charte qui ne fixe que la couleur principale ne change que l\'accent', () => {
  const { variables, notes } = variablesApplication(lecture({ version: 'atlas-charte/0.1', graines: { principal: '#1b5fa8' } }));
  assert.deepEqual(Object.keys(variables).sort(), ['--accent', '--accent-soft']); assert.deepEqual(notes, []);
});

test('une charte à fond SOMBRE retourne l interface : fond, surfaces éclaircies, encre lisible (4,5:1), mode sombre dit ; la police est reprise', () => {
  const { variables, notes } = variablesApplication(lecture(charteDepuisKit(kit('grist', 'sombre')).charte));
  assert.equal(variables['--mode-application'], 'sombre');
  assert.ok(luminance(variables['--bg']) < 0.5, 'fond sombre'); assert.ok(luminance(variables['--surface']) > luminance(variables['--bg']), 'surface plus claire que le fond');
  assert.ok(contraste(variables['--ink'], variables['--bg']) >= 4.5, 'encre lisible'); assert.ok(contraste(variables['--muted'], variables['--bg']) >= 4.5 || contraste(variables['--muted'], variables['--bg']) >= 3, 'texte atténué lisible');
  assert.ok(!notes.includes('fond-sombre-non-suivi') && !notes.includes('encre-non-suivie'));
  assert.ok('--sans' in variables, 'la police est reprise');
});

test('fond sombre sans encre donnée : un blanc cassé, jamais l encre sombre d origine ; l accent qui ne se lit pas sur ce fond est refusé et dit', () => {
  const sombre = (principal) => variablesApplication(lecture({ version: 'atlas-charte/0.1', graines: { principal, fond: '#262633' } }));
  const a = sombre('#17b378');
  assert.equal(a.variables['--ink'], '#ececf1'); assert.equal(a.variables['--accent'], '#17b378'); assert.deepEqual(a.notes, []);
  const b = sombre('#2a2a3a');
  assert.ok(b.notes.includes('accent-peu-lisible-non-suivi')); assert.equal('--accent' in b.variables, false);
});

test('fond clair : pas de mode sombre dit', () => {
  const { variables } = variablesApplication(lecture({ version: 'atlas-charte/0.1', graines: { principal: '#1b5fa8', fond: '#f4f4f0' } }));
  assert.equal('--mode-application' in variables, false); assert.equal(variables['--bg'], '#f4f4f0');
});

test('une encre peu contrastée sur le fond de l\'application, ou un accent trop pâle, sont refusés', () => {
  const r = variablesApplication(lecture({ version: 'atlas-charte/0.1', graines: { principal: '#f1f1a0', encre: '#cfcfcf' } }));
  assert.deepEqual(r.variables && Object.keys(r.variables).filter((k) => k !== '--sans' && k !== '--serif'), []);
  assert.deepEqual(r.notes.sort(), ['accent-peu-lisible-non-suivi', 'encre-non-suivie']);
});

test('profil complet : un setTheme de l\'hôte appelle `habiller` avec la charte lue, et l\'interface retombe sur ses jetons sans charte', async () => {
  const appels = [];
  const f = { outils: {}, monterScene: async () => ({ couches: [] }), monterDalles: async () => ({}), abonner: () => () => {}, retirerScene: () => 0, visibilite: () => true, cadrer: () => true, habiller: async (l) => { appels.push(l); } };
  const rt = attacher(carteSimulee()); brancher(rt, f);
  rt.api.setTheme({ version: 'atlas-charte/0.1', graines: { principal: '#017c51' } });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(appels.length, 1); assert.equal(appels[0].hote.graines.principal, '#017c51'); assert.ok(appels[0].charte.graines.fond);
  rt.api.setTheme({}, { remplacer: true });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(appels.length, 2); assert.deepEqual(variablesApplication(appels[1]).variables, {}, 'sans charte de l\'hôte : rien');
  // une façade sans `habiller` (anciennes pages) reste valide
  const rt2 = attacher(carteSimulee()); brancher(rt2, { ...f, habiller: undefined });
  rt2.api.setTheme({ version: 'atlas-charte/0.1', graines: { principal: '#017c51' } });
});

test('la boussole : aiguille du nord suit la couleur principale, comme sa lettre', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(join(ICI, '../index_v7.html'), 'utf8');
  assert.match(html, /\.compass #compass-svg path:first-child \{ fill: var\(--accent\); \}/);
  assert.match(html, /\.compass \.n-label \{[^}]*color: var\(--accent\)/);
  assert.match(html, /<svg width="54" height="54" viewBox="0 0 54 54" id="compass-svg">\s*<path d="M27 18 L31 29 L27 26.5 L23 29 Z" fill="#C44536" \/>/, 'le dessin garde son rouge d origine en repli');
});

test('profil complet : un manifeste BI éteint la légende de l\'application (celle du composant suffit), une scène Atlas la rend', async () => {
  const etats = [];
  const f = { outils: { VERSIONS_LUES: ['0.2.0'], deballerScene: (x) => x, verifierFormeScene: () => [], adresseAdmise: () => true }, monterScene: async () => ({ couches: [] }), monterDalles: async () => ({}), abonner: () => () => {}, retirerScene: () => 0, visibilite: () => true, cadrer: () => true, sceneBi: (oui) => etats.push(oui) };
  const rt = attacher(carteSimulee()); brancher(rt, f);
  await rt.api.setScene({ layers: [] });
  assert.deepEqual(etats, [true]);
  const html = readFileSync(join(ICI, '../index_v7.html'), 'utf8');
  assert.match(html, /body\.scene-bi #legend \{ display: none !important; \}/);
});
