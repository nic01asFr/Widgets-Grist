// ThemeDef 1.0 -> charte d'Atlas : règle de lecture de Theme_document, entrée non fiable, valeurs résolues non crues, graines seules.
// node --test tests/charte-depuis-themedef.test.js   (aucun accès réseau, aucune dépendance)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as T from '../lib/charte/depuis-themedef.js';
import { resoudre } from '../lib/charte/resolution.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const kit = (mode) => JSON.parse(readFileSync(join(ICI, 'fixtures/kit-theme', `theme-formulaire.grist.${mode}.json`), 'utf8'));
const themedef = (extra = {}) => ({
  version: 'themedef-1.0', nom: 'Identité du document', graines: { principal: '#017C51' }, police: 'systeme',
  resolu: { version: 'kit-theme/0.1', modes: { clair: { valeurs: kit('clair').valeurs, derive: ['action-actif'] }, sombre: { valeurs: kit('sombre').valeurs, derive: ['action-actif'] } }, police: 'systeme', echecs: [], visualisation: 'non garantie' },
  ...extra,
});

test('valeurs résolues : le mode demandé est traduit, le nom du document est gardé, et on dit que rien n\'est vérifié', () => {
  for (const mode of ['clair', 'sombre']) {
    const r = T.charteDepuisThemeDef(JSON.stringify(themedef()), { mode });
    assert.equal(r.source, 'resolu'); assert.equal(r.mode, mode); assert.equal(r.verifie, false);
    assert.equal(r.charte.nom, 'Identité du document');
    assert.equal(r.charte.graines.fond, kit(mode).valeurs.fond.toLowerCase());
    assert.deepEqual(r.ignore, []);
    assert.ok(r.notes.some((n) => /non vérifiées/.test(n)));
    assert.deepEqual(resoudre({ hote: r.charte }).ignore, []);
  }
});

test('un ThemeDef donné en objet ou en texte donne la même charte', () => {
  assert.deepEqual(T.charteDepuisThemeDef(themedef()).charte, T.charteDepuisThemeDef(JSON.stringify(themedef())).charte);
});

test('sans `resolu` : les graines du document seules ; les états sont ignorés et dits ; la police est posée', () => {
  const r = T.charteDepuisThemeDef({ version: 'themedef-1.0', graines: { principal: '#3D4F63', fond: '#fafafa', ok: '#008000' }, police: 'serif' });
  assert.equal(r.source, 'graines');
  assert.deepEqual(r.charte.graines, { principal: '#3d4f63', fond: '#fafafa' });
  assert.deepEqual(r.charte.texte, { famille: 'serif' });
  assert.deepEqual(r.ignore.map((i) => i.chemin + ':' + i.code), ['graines.ok:etat-ignore']);
});

test('le mode absent de `resolu` retombe sur l\'autre mode, et le dit', () => {
  const t = themedef(); delete t.resolu.modes.sombre;
  const r = T.charteDepuisThemeDef(t, { mode: 'sombre' });
  assert.equal(r.mode, 'clair'); assert.ok(r.notes.some((n) => /mode sombre absent/.test(n)));
});

test('un `resolu` illisible n\'empêche pas d\'appliquer les graines du document', () => {
  const r = T.charteDepuisThemeDef(themedef({ resolu: { modes: { clair: { valeurs: { accent: 'url(http://x)' } } } } }));
  assert.equal(r.source, 'graines'); assert.deepEqual(r.charte.graines, { principal: '#017c51' });
  assert.ok(r.ignore.some((i) => i.chemin === 'valeurs.accent'));
});

test('entrée non fiable : version, taille, profondeur, clé interdite, JSON, type, principal absent', () => {
  const code = (x) => T.lireThemeDef(x).ignore[0].code;
  assert.equal(code('{pas du json'), 'json-illisible');
  assert.equal(code('x'.repeat(16385)), 'taille');
  assert.equal(code({ version: 'themedef-2.0', graines: { principal: '#000000' } }), 'version-inconnue');
  assert.equal(code(42), 'type'); assert.equal(code(null), 'type');
  assert.equal(code({ version: 'themedef-1.0', graines: {} }), 'absent');
  assert.equal(code(JSON.parse('{"version":"themedef-1.0","graines":{"principal":"#000000"},"__proto__":{"x":1}}')), 'profondeur-ou-cle-interdite');
  assert.equal(code({ version: 'themedef-1.0', graines: { principal: '#000000' }, a: { b: { c: { d: { e: { f: {} } } } } } }), 'profondeur-ou-cle-interdite');
  for (const mauvais of ['{', null, 7, { version: 'x' }]) assert.equal(T.charteDepuisThemeDef(mauvais).charte, null);
});

test('règle de lecture : table absente, vide, sans actif, un actif, plusieurs actifs, 50 lignes au plus', () => {
  const ligne = (cle, actif) => ({ cle, actif, themedef: '{}' });
  for (const rien of [undefined, null, [], 'x']) assert.deepEqual(T.choisirThemeDefActif(rien), { ligne: null, avertissements: [] });
  assert.deepEqual(T.choisirThemeDefActif([ligne('a', false)]), { ligne: null, avertissements: [] });
  assert.equal(T.choisirThemeDefActif([ligne('a', false), ligne('b', true)]).ligne.cle, 'b');
  const deux = T.choisirThemeDefActif([ligne('a', true), ligne('b', true)]);
  assert.equal(deux.ligne, null); assert.deepEqual(deux.avertissements, [{ code: 'plusieurs-actifs', nombre: 2 }], 'aucun gagnant silencieux');
  assert.equal(T.choisirThemeDefActif([ligne('A MAJ', true)]).ligne, null, 'une clé hors format est écartée');
  const beaucoup = Array.from({ length: 60 }, (_, i) => ligne('l' + i, i === 55));
  const r = T.choisirThemeDefActif(beaucoup);
  assert.equal(r.ligne, null); assert.deepEqual(r.avertissements, [{ code: 'lignes-ignorees', nombre: 10 }]);
});
