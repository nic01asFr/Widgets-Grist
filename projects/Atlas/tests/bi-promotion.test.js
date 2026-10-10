/**
 * La promotion rejouee dans un bac a sable : `scripts/promote-atlas.js` copie `lib/bi/` (modules et jeux embarques)
 * sans planter. Rien n'est ecrit dans `published/` du depot.
 * node --test tests/bi-promotion.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, cpSync, copyFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE_DEPOT = resolve(ICI, '..', '..', '..');
const SCRIPT = join(RACINE_DEPOT, 'scripts', 'promote-atlas.js');
const VENDOR = ['shared/types.js', 'shared/attachments.js', 'shared/session-context.js', 'shared/formulaires-table.js',
  'shared/formdef-from-table.js', 'shared/formdef-from-grist-form.js', 'runtime/engine.js'];

/** Arborescence minimale + le vrai `lib/` ; `modifier(racine)` permet d'y introduire un defaut. */
function bac(modifier = () => {}) {
  const racine = mkdtempSync(join(tmpdir(), 'atlas-promote-bi-'));
  const ecrire = (rel, contenu = '') => { mkdirSync(dirname(join(racine, rel)), { recursive: true }); writeFileSync(join(racine, rel), contenu); };
  mkdirSync(join(racine, 'scripts'), { recursive: true });
  copyFileSync(SCRIPT, join(racine, 'scripts', 'promote-atlas.js'));
  ecrire('published/atlas/package.json', JSON.stringify({ version: '9.9.9' }));
  ecrire('projects/Atlas/index_v7.html', '<!DOCTYPE html><html><head><title>Atlas v7 — Maquette 3D Territoriale</title><meta name="atlas-moteur-formulaire" content="../grist_forms/" /><script type="module" src="./app_v7.js?v=20261010a"></script></head><body></body></html>');
  ecrire('projects/Atlas/app_v7.js', "import { x } from './lib/html.js';\n");
  ecrire('projects/Atlas/lib/mini.js', 'export const x = 1;\n');
  ecrire('projects/Atlas/demos/osm-marseille-vieux-port/scene.json', JSON.stringify({ layers: [] }));
  ecrire('projects/Atlas/demos/hote-bi/index.html', '<!doctype html>');
  ecrire('projects/Atlas/objets/catalog.json', JSON.stringify({ parametric: { assets: [] } }));
  for (const rel of VENDOR) ecrire(`projects/grist_forms/${rel}`, '/* x */\n');
  cpSync(join(ICI, '..', 'lib'), join(racine, 'projects', 'Atlas', 'lib'), { recursive: true });   // le vrai lib/, dont lib/bi/ importe des modules voisins
  modifier(racine);
  return racine;
}
const promouvoir = (racine) => { const r = spawnSync(process.execPath, [join(racine, 'scripts', 'promote-atlas.js')], { encoding: 'utf8' }); return { code: r.status, sortie: r.stdout, erreur: r.stderr }; };

test('promotion : lib/bi et ses jeux embarques sont copies, et le controle des imports ne plante pas sur le sous-dossier donnees/', () => {
  const racine = bac();
  try {
    const r = promouvoir(racine);
    assert.equal(r.code, 0, r.erreur);
    const pub = join(racine, 'published', 'atlas', 'lib', 'bi');
    for (const f of readdirSync(join(ICI, '..', 'lib', 'bi')).filter((n) => n.endsWith('.js'))) assert.ok(existsSync(join(pub, f)), f);
    for (const f of readdirSync(join(ICI, '..', 'lib', 'bi', 'donnees')).filter((n) => n.endsWith('.json'))) assert.ok(existsSync(join(pub, 'donnees', f)), 'donnees/' + f);
    assert.ok(existsSync(join(racine, 'published', 'atlas', 'demos', 'hote-bi', 'index.html')));
  } finally { rmSync(racine, { recursive: true, force: true }); }
});

test('promotion : un module de lib/bi qui en importe un absent fait echouer la promotion', () => {
  const racine = bac((r) => writeFileSync(join(r, 'projects/Atlas/lib/bi/client.js'), "import { x } from './inexistant.js';\n", { flag: 'a' }));
  try {
    const r = promouvoir(racine);
    assert.equal(r.code, 1);
    assert.match(r.erreur, /client\.js importe \.\/inexistant\.js/);
  } finally { rmSync(racine, { recursive: true, force: true }); }
});
