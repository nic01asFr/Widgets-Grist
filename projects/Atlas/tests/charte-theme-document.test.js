// Le thème d'un document Grist : la table `Theme_document` lue, la ligne active choisie, le thème appliqué à la carte et à l'application ; aucune écriture.
// node --test tests/charte-theme-document.test.js   (aucun accès réseau, aucune dépendance)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { themeDuDocument, habillageApplication, lignesDeTable, TABLE } from '../lib/charte/theme-document.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const kit = (mode) => JSON.parse(readFileSync(join(ICI, 'fixtures/kit-theme', `theme-formulaire.grist.${mode}.json`), 'utf8'));
const themedef = (extra = {}) => JSON.stringify({ version: 'themedef-1.0', nom: 'Identité du document', graines: { principal: '#017C51' }, police: 'systeme',
  resolu: { modes: { clair: { valeurs: kit('clair').valeurs }, sombre: { valeurs: kit('sombre').valeurs } }, police: 'systeme' }, ...extra });
/** Ce que rend `grist.docApi.fetchTable` : des colonnes. */
const colonnes = (lignes) => ({ id: lignes.map((_, i) => i + 1), cle: lignes.map((l) => l.cle), themedef: lignes.map((l) => l.themedef), actif: lignes.map((l) => l.actif), maj: lignes.map(() => 1_790_000_000), manualSort: lignes.map((_, i) => i) });

test('la table de Grist (colonnes) est lue en lignes ; le nom de la table est celui de la spécification', () => {
  assert.equal(TABLE, 'Theme_document');
  const l = lignesDeTable(colonnes([{ cle: 'a', themedef: '{}', actif: true }, { cle: 'b', themedef: '{}', actif: false }]));
  assert.equal(l.length, 2); assert.deepEqual(Object.keys(l[0]).sort(), ['actif', 'cle', 'id', 'maj', 'themedef']); assert.equal(l[1].cle, 'b');
  assert.deepEqual(lignesDeTable(null), []); assert.deepEqual(lignesDeTable('x'), []); assert.deepEqual(lignesDeTable({}), []);
  assert.equal(lignesDeTable([{ cle: 'x' }, null, 4]).length, 1);
});

test('table absente, vide, sans ligne active : aucun thème, sans bruit ; plusieurs actives : rien, et c\'est dit', () => {
  for (const rien of [undefined, null, colonnes([]), colonnes([{ cle: 'a', themedef: themedef(), actif: false }])]) {
    const t = themeDuDocument(rien); assert.equal(t.charte, null); assert.deepEqual(t.avertissements, []);
  }
  const deux = themeDuDocument(colonnes([{ cle: 'a', themedef: themedef(), actif: true }, { cle: 'b', themedef: themedef(), actif: true }]));
  assert.equal(deux.charte, null); assert.deepEqual(deux.avertissements, [{ code: 'plusieurs-actifs', nombre: 2 }]);
});

test('une ligne active : la charte du mode demandé, non vérifiée, avec la ligne et la source', () => {
  const lignes = colonnes([{ cle: 'ancien', themedef: '{}', actif: false }, { cle: 'identite', themedef: themedef(), actif: true }]);
  for (const mode of ['clair', 'sombre']) {
    const t = themeDuDocument(lignes, { mode });
    assert.equal(t.ligne, 'identite'); assert.equal(t.mode, mode); assert.equal(t.source, 'resolu'); assert.equal(t.verifie, false);
    assert.equal(t.charte.graines.fond, kit(mode).valeurs.fond.toLowerCase()); assert.equal(t.charte.nom, 'Identité du document');
  }
  assert.equal(themeDuDocument(lignes, { mode: 'nuit' }).mode, 'clair', 'un mode inconnu retombe sur le clair');
});

test('un contenu illisible n\'applique rien et le dit : JSON cassé, version inconnue, trop gros', () => {
  const t = themeDuDocument(colonnes([{ cle: 'a', themedef: '{pas du json', actif: true }]));
  assert.equal(t.charte, null); assert.equal(t.ignore[0].code, 'json-illisible');
  assert.equal(themeDuDocument(colonnes([{ cle: 'a', themedef: JSON.stringify({ version: 'themedef-9', graines: { principal: '#000000' } }), actif: true }])).ignore[0].code, 'version-inconnue');
  assert.equal(themeDuDocument(colonnes([{ cle: 'a', themedef: 'x'.repeat(20000), actif: true }])).ignore[0].code, 'taille');
  assert.equal(themeDuDocument(colonnes([{ cle: 'A MAJ', themedef: themedef(), actif: true }])).charte, null, 'une clé de ligne hors format est écartée');
});

test('l\'application complète : jetons d\'Atlas dérivés du thème clair ; un thème sombre ne retourne pas l\'interface claire, et c\'est dit', () => {
  const clair = habillageApplication(themeDuDocument(colonnes([{ cle: 'a', themedef: themedef(), actif: true }]), { mode: 'clair' }));
  assert.equal(clair.variables['--accent'], '#017c51'); assert.equal(clair.variables['--ink'], '#262633'); assert.deepEqual(clair.notes, []);
  const sombre = habillageApplication(themeDuDocument(colonnes([{ cle: 'a', themedef: themedef(), actif: true }]), { mode: 'sombre' }));
  assert.equal(sombre.variables['--mode-application'], 'sombre'); assert.ok(!sombre.notes.includes('fond-sombre-non-suivi'));
  assert.deepEqual(habillageApplication(null), { variables: {}, notes: [] });
  assert.deepEqual(habillageApplication(themeDuDocument(null)), { variables: {}, notes: [] });
});

test('le widget ne crée jamais la table : il la lit seulement si listTables la connaît', () => {
  const app = readFileSync(join(ICI, '../app_v7.js'), 'utf8');
  const i = app.indexOf('async function chargerThemeDocument');
  assert.ok(i > 0, 'fonction de chargement présente');
  const corps = app.slice(i, app.indexOf('\n}\n', i));
  assert.match(corps, /listTables\(\)/); assert.match(corps, /tables\.includes\('Theme_document'\)/);
  assert.doesNotMatch(corps, /AddTable|addTable|applyUserActions|\.create|setRecords|AddRecord/);
});
