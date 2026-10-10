import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { FICHIERS_MOTEUR } from '../lib/moteur-formulaire.js';

/**
 * `scripts/promote-atlas.js` rejoue dans un bac a sable : une arborescence minimale, copiee dans un
 * dossier temporaire, avec le vrai script. Rien n'est ecrit dans `published/` du depot.
 *
 * Ce qu'on garde : les modules de lib/ (dont ceux du chargement a la demande) et la feuille du
 * formulaire sont publies, le moteur l'est par sa liste nommee, et la page qui declare mal le dossier
 * du moteur fait ECHOUER la promotion au lieu de publier une fiche aux champs devines.
 */
const RACINE_DEPOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = join(RACINE_DEPOT, 'scripts', 'promote-atlas.js');

const PAGE = (meta) => `<!DOCTYPE html><html><head><title>Atlas v7 — Maquette 3D Territoriale</title>
${meta}
<script type="module" src="./app_v7.js?v=20261005e"></script></head><body></body></html>`;
const META_OK = '<meta name="atlas-moteur-formulaire" content="../grist_forms/" />';

/** Fabrique le bac a sable ; `meta` est la ligne que la page declare. */
function bac({ meta = META_OK, sansFichierMoteur = null } = {}) {
  const racine = mkdtempSync(join(tmpdir(), 'atlas-promote-'));
  const ecrire = (rel, contenu = '') => { mkdirSync(dirname(join(racine, rel)), { recursive: true }); writeFileSync(join(racine, rel), contenu); };
  copyFileSync(SCRIPT, (mkdirSync(join(racine, 'scripts')), join(racine, 'scripts', 'promote-atlas.js')));
  ecrire('published/atlas/package.json', JSON.stringify({ version: '9.9.9' }));
  ecrire('projects/Atlas/index_v7.html', PAGE(meta));
  ecrire('projects/Atlas/app_v7.js', "import { x } from './lib/chargement-paresseux.js?v=20261010a';\nimport('./lib/moteur-formulaire.js?v=20261010a');\n");
  ecrire('projects/Atlas/lib/chargement-paresseux.js', 'export const x = 1;\n');
  ecrire('projects/Atlas/lib/moteur-formulaire.js', "export const URL_FEUILLE = new URL('./formulaire-atlas.css?v=20261003h', import.meta.url).href;\n");
  ecrire('projects/Atlas/lib/three-differe.js', "export const y = () => import('./extrusion-ombres.js?v=20261010a');\n");
  ecrire('projects/Atlas/lib/extrusion-ombres.js', 'export const z = 1;\n');
  ecrire('projects/Atlas/lib/formulaire-atlas.css', '#insp-body .fr-form { display: flex; }\n');
  ecrire('projects/Atlas/demos/osm-marseille-vieux-port/scene.json', JSON.stringify({ layers: [] }));
  ecrire('projects/Atlas/objets/catalog.json', JSON.stringify({ parametric: { assets: [] } }));
  for (const rel of FICHIERS_MOTEUR) if (rel !== sansFichierMoteur) ecrire(`projects/grist_forms/${rel}`, `/* ${rel} */\n`);
  return racine;
}

function promouvoir(racine) {
  const r = spawnSync(process.execPath, [join(racine, 'scripts', 'promote-atlas.js')], { encoding: 'utf8' });
  return { code: r.status, sortie: r.stdout, erreur: r.stderr };
}

test('promote-atlas : tous les modules et la feuille de lib/ sont publies, le moteur par sa liste nommee', () => {
  const racine = bac();
  try {
    const r = promouvoir(racine);
    assert.equal(r.code, 0, r.erreur);
    for (const f of ['chargement-paresseux.js', 'moteur-formulaire.js', 'three-differe.js', 'extrusion-ombres.js', 'formulaire-atlas.css']) {
      assert.ok(existsSync(join(racine, 'published/atlas/lib', f)), f);
    }
    for (const rel of FICHIERS_MOTEUR) assert.ok(existsSync(join(racine, 'published/atlas/vendor/grist_forms', rel)), rel);
    // Le dossier du moteur est reecrit vers la copie embarquee, et la version remplace le jeton de dev.
    const page = readFileSync(join(racine, 'published/atlas/index.html'), 'utf8');
    assert.match(page, /<meta name="atlas-moteur-formulaire" content="\.\/vendor\/grist_forms\/"/);
    assert.match(page, /app\.js\?v=9\.9\.9/);
    const moteur = readFileSync(join(racine, 'published/atlas/lib/moteur-formulaire.js'), 'utf8');
    assert.match(moteur, /formulaire-atlas\.css\?v=9\.9\.9/);
  } finally { rmSync(racine, { recursive: true, force: true }); }
});

test('promote-atlas : un fichier du moteur absent de la source arrete la promotion', () => {
  const racine = bac({ sansFichierMoteur: 'runtime/engine.js' });
  try {
    const r = promouvoir(racine);
    assert.equal(r.code, 1);
    assert.match(r.erreur, /runtime\/engine\.js introuvable/);
  } finally { rmSync(racine, { recursive: true, force: true }); }
});

test('promote-atlas : une page qui ne declare pas le dossier du moteur fait echouer la promotion', () => {
  const racine = bac({ meta: '' });
  try {
    const r = promouvoir(racine);
    assert.equal(r.code, 1);
    assert.match(r.erreur, /ne declare pas <meta name="atlas-moteur-formulaire">/);
  } finally { rmSync(racine, { recursive: true, force: true }); }
});

test('promote-atlas : un dossier du moteur mal reecrit (autre que la copie embarquee) echoue', () => {
  const racine = bac({ meta: '<meta name="atlas-moteur-formulaire" content="../ailleurs/" />' });
  try {
    const r = promouvoir(racine);
    assert.equal(r.code, 1);
    assert.match(r.erreur, /dossier du moteur de formulaire \(\.\.\/ailleurs\/\) n'a pas/);
  } finally { rmSync(racine, { recursive: true, force: true }); }
});

test('promote-atlas : un module de lib/ importe par app.js mais absent echoue (controle existant, garde)', () => {
  const racine = bac();
  try {
    writeFileSync(join(racine, 'projects/Atlas/app_v7.js'), "import './lib/fantome.js?v=20261010a';\n");
    const r = promouvoir(racine);
    assert.equal(r.code, 1);
    assert.match(r.erreur, /fantome\.js/);
  } finally { rmSync(racine, { recursive: true, force: true }); }
});
