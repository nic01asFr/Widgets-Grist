import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Un même module importé sous deux adresses (`./x.js` et `./x.js?v=…`, ou deux
// jetons `?v=` différents) est chargé DEUX fois par le navigateur : deux
// instances, donc deux états et deux jeux de fonctions. Relevé à l'audit du
// 02/10/2026 sur dix modules, dont deux avec un code réellement différent
// (`eclairage-rendu`, `model-layer`).

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SOURCES = [
  path.join(racine, 'app_v7.js'),
  ...fs.readdirSync(path.join(racine, 'lib'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(racine, 'lib', f)),
];

/** Chaque import (statique ou dynamique) d'un module de `lib/`, avec son jeton. */
function importsDe(fichier) {
  const texte = fs.readFileSync(fichier, 'utf8');
  const dossier = path.dirname(fichier);
  // `from '…'`, `import('…')` et `import '…'` (sans `from`, pour l'effet de bord).
  const re = /(?:from\s+|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+?\.js)(\?v=[^'"]+)?['"]/g;
  const out = [];
  let m;
  while ((m = re.exec(texte))) {
    const cible = path.resolve(dossier, m[1]);
    if (!cible.startsWith(path.join(racine, 'lib') + path.sep)) continue;
    out.push({ module: path.basename(cible), jeton: m[2] || '(sans version)', depuis: path.basename(fichier) });
  }
  return out;
}

test('un module de lib/ est importé sous un seul jeton de version', () => {
  const parModule = new Map();
  for (const f of SOURCES) {
    for (const i of importsDe(f)) {
      if (!parModule.has(i.module)) parModule.set(i.module, new Map());
      const jetons = parModule.get(i.module);
      if (!jetons.has(i.jeton)) jetons.set(i.jeton, []);
      jetons.get(i.jeton).push(i.depuis);
    }
  }
  const divergents = [];
  for (const [module, jetons] of parModule) {
    if (jetons.size > 1) {
      divergents.push(`${module} : ${[...jetons].map(([j, d]) => `${j} (${[...new Set(d)].join(', ')})`).join(' / ')}`);
    }
  }
  assert.deepEqual(divergents, [], `modules importés sous plusieurs adresses :\n  ${divergents.join('\n  ')}`);
});
