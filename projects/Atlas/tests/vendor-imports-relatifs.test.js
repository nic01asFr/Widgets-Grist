/**
 * Les modules de three.js embarqués (`published/atlas/vendor/three/`) importent d'autres fichiers par adresse relative (`./../utils/TextureUtils.js`) : chacun doit être embarqué aussi.
 * Relevé le 02/11/2026 : l'exporteur GLB de la 1.39.0 était vendorisé sans `utils/TextureUtils.js` qu'il importe ; en ligne, la commande `exportScene3D` échouait (« Failed to fetch dynamically
 * imported module »), alors qu'avec le CDN, où tout se résout, l'essai local passait.
 * node --test projects/Atlas/tests/vendor-imports-relatifs.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '..', '..', '..');
const VENDOR = path.join(RACINE, 'published', 'atlas', 'vendor');
const manifeste = JSON.parse(fs.readFileSync(path.join(ICI, '..', 'vendor-externe.json'), 'utf8'));

const fichiersJs = (dossier) => fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? fichiersJs(path.join(dossier, e.name)) : /\.(js|mjs)$/.test(e.name) ? [path.join(dossier, e.name)] : []));

test('chaque import relatif d\'un module three.js embarqué désigne un fichier embarqué', () => {
  const manquants = [];
  const three = path.join(VENDOR, 'three');
  assert.ok(fs.existsSync(three), 'le dossier vendor/three existe (promotion faite)');
  for (const f of fichiersJs(three)) {
    const texte = fs.readFileSync(f, 'utf8');
    for (const m of texte.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const cible = path.resolve(path.dirname(f), m[1]);
      if (!fs.existsSync(cible)) manquants.push(path.relative(VENDOR, f) + ' -> ' + m[1]);
    }
  }
  assert.deepEqual(manquants, [], 'imports relatifs sans fichier embarqué :\n  ' + manquants.join('\n  '));
});

test('le manifeste des dépendances déclare chaque fichier three.js embarqué (rien n\'est posé à la main)', () => {
  const declares = new Set(manifeste.bibliotheques.find((b) => b.id === 'three').fichiers.map((f) => 'three/' + f.vers.replace(/^three\//, '')));
  const presents = fichiersJs(path.join(VENDOR, 'three')).map((f) => path.relative(VENDOR, f).split(path.sep).join('/'));
  for (const p of presents) assert.ok(declares.has(p), p + ' est embarqué sans être déclaré dans vendor-externe.json');
});
