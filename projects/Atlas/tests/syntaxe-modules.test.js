// Tout module JavaScript qu'Atlas sert doit se LIRE : une apostrophe mal échappée dans app_v7.js (1.29.0) a rendu toute l'application complète illisible en ligne,
// sans qu'aucun autre test ne la lise (les tests importent des modules de lib/, pas la page). Ce test lit la syntaxe de app_v7.js et de chaque module de lib/.
// node --test tests/syntaxe-modules.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const fichiers = (dossier) => readdirSync(dossier).flatMap((n) => {
  const p = join(dossier, n);
  if (statSync(p).isDirectory()) return n === 'donnees' || n === 'node_modules' ? [] : fichiers(p);
  return n.endsWith('.js') || n.endsWith('.mjs') ? [p] : [];
});

function erreurDeSyntaxe(chemin) {
  const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: readFileSync(chemin), encoding: 'utf8' });
  return r.status === 0 ? null : String(r.stderr || r.stdout).split('\n').filter(Boolean).slice(0, 4).join(' | ');
}

test('app_v7.js et chaque module de lib/ ont une syntaxe lisible', () => {
  const liste = [join(RACINE, 'app_v7.js'), ...fichiers(join(RACINE, 'lib'))];
  assert.ok(liste.length > 100, 'la liste des modules est celle attendue (' + liste.length + ')');
  const mauvais = liste.map((f) => [relative(RACINE, f), erreurDeSyntaxe(f)]).filter(([, e]) => e);
  assert.deepEqual(mauvais, [], 'modules illisibles : ' + mauvais.map(([f, e]) => f + ' : ' + e).join(' ;; '));
});

test('le test voit une vraie erreur de syntaxe (garde du garde)', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: "console.warn('citée par l'étape');", encoding: 'utf8' });
  assert.notEqual(r.status, 0);
});
