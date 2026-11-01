/**
 * « Sans thème » (`?theme=aucun`) et refus dit : le choix explicite l'emporte sur le document et sur l'instance ; un thème refusé est dit à la personne.
 * node --test projects/Atlas/tests/theme-sans-theme.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { themeDuDocument } from '../lib/charte/theme-document.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(ICI, '..', 'app_v7.js'), 'utf8');
const corps = (nom) => { const i = app.indexOf('async function ' + nom + '('); assert.ok(i > 0, nom); return app.slice(i, i + 3500); };

test('sans thème : ?theme=aucun passe avant le document ET l instance, et efface ce que la mémoire de démarrage avait posé', () => {
  assert.match(app, /function themeAucunDemande\(\) \{ try \{ return new URLSearchParams\(location\.search\)\.get\('theme'\) === 'aucun'/);
  const doc = corps('chargerThemeDocument');
  assert.ok(doc.indexOf('themeAucunDemande()') > 0 && doc.indexOf('themeAucunDemande()') < doc.indexOf('listTables'), 'testé avant de lire la table');
  assert.match(doc, /poserHabillageApplication\(\{\}, AP\.VARIABLES\)/);
  assert.match(corps('appliquerThemeInstance'), /themeAucunDemande\(\)/);
});

test('refus dit : chaque raison de refus a sa phrase, aucune pour « aucun thème » ni « sans mode sombre »', () => {
  for (const raison of ['contraste-insuffisant', 'resolu-incomplet', 'plusieurs-actifs', 'version-inconnue', 'invalide']) assert.match(app, new RegExp("'" + raison + "': '"), raison);
  assert.doesNotMatch(app, /RAISONS_THEME_REFUSE = \{[^}]*'(aucun-actif|sans-mode-sombre)'/);
  assert.match(app, /showToast\('Le thème de ce document n’est pas appliqué : ' \+ dit, 'warning'\)/);
});

test('les raisons rendues par le lecteur sont toutes connues de l interface', () => {
  const td = (x) => JSON.stringify({ version: 'themedef-1.0', graines: { principal: '#0b6e4f' }, ...x });
  const cols = (themedef, extra = {}) => ({ id: [1], cle: ['a'], themedef: [themedef], actif: [true], ...extra });
  const attendues = {
    invalide: themeDuDocument(cols('{pas du json')).raison,
    'version-inconnue': themeDuDocument(cols(td({}), { version: ['themedef-9'] })).raison,
    'plusieurs-actifs': themeDuDocument({ id: [1, 2], cle: ['a', 'b'], themedef: [td({}), td({})], actif: [true, true] }).raison,
  };
  for (const [voulu, obtenu] of Object.entries(attendues)) assert.equal(obtenu, voulu);
  assert.equal(themeDuDocument(null).raison, 'aucun-actif');
});

test('un document qui dit quelque chose d illisible n applique rien et l instance Grist ne le remplace pas ; elle ne prend le relais que sans thème de document', () => {
  const doc = corps('chargerThemeDocument');
  assert.match(doc, /if \(!theme\.charte && theme\.raison !== 'aucun-actif'\) documentADit = true;/);
  assert.match(doc, /if \(!documentAUnTheme && !documentADit\) \{ brancherThemeInstance\(\); await appliquerThemeInstance\(\); \}/);
});
