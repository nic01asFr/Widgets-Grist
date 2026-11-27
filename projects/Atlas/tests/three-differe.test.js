import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { creerChargeurThree, IMPORTS_THREE } from '../lib/three-differe.js';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (rel) => readFileSync(resolve(RACINE, rel), 'utf8');

/** Des modules factices, et le compte de ce qui a ete demande. */
function fauxImports({ echec = null } = {}) {
  const demandes = [];
  const rendre = (nom, valeur) => async () => {
    demandes.push(nom);
    if (echec === nom) throw new Error('coupure ' + nom);
    return valeur;
  };
  return {
    demandes,
    importer: {
      three: rendre('three', { nom: 'THREE' }),
      gltf: rendre('gltf', { GLTFLoader: 'gltf' }),
      ktx2: rendre('ktx2', { KTX2Loader: 'ktx2' }),
      meshopt: rendre('meshopt', { MeshoptDecoder: 'meshopt' }),
      utils: rendre('utils', { mergeGeometries: 'merge' }),
      luminaires: rendre('luminaires', { creerLuminaires3D: 'lampes', marquerPochoirModele: 'pochoir' }),
      casters: rendre('casters', { creerCasters: 'casters' }),
    },
  };
}

test('chargerThree : rend d un coup tout ce dont le moteur 3D se sert', async () => {
  const { importer } = fauxImports();
  const lib = await creerChargeurThree(importer)();
  assert.deepEqual(lib, {
    THREE: { nom: 'THREE' }, GLTFLoader: 'gltf', KTX2Loader: 'ktx2', MeshoptDecoder: 'meshopt',
    mergeGeometries: 'merge', creerLuminaires3D: 'lampes', marquerPochoirModele: 'pochoir', creerCasters: 'casters',
  });
});

test('chargerThree : rien n est importe avant le premier appel', () => {
  const { importer, demandes } = fauxImports();
  creerChargeurThree(importer);
  assert.deepEqual(demandes, []);
});

test('chargerThree : appels simultanes ou tardifs, sept importations une seule fois', async () => {
  const { importer, demandes } = fauxImports();
  const charger = creerChargeurThree(importer);
  const [a, b, c] = await Promise.all([charger(), charger(), charger()]);
  assert.equal(a, b); assert.equal(b, c);
  await charger();
  assert.equal(demandes.length, 7);
  assert.deepEqual([...demandes].sort(), Object.keys(importer).sort());
});

test('chargerThree : un echec de CDN n est pas memorise, le nouvel essai reussit', async () => {
  const f = fauxImports({ echec: 'gltf' });
  const charger = creerChargeurThree(f.importer);
  await assert.rejects(charger(), /coupure gltf/);
  f.importer.gltf = async () => ({ GLTFLoader: 'gltf2' });
  const lib = await charger();
  assert.equal(lib.GLTFLoader, 'gltf2');
});

test('IMPORTS_THREE : les specificateurs nus sont ceux de la carte d import de la page', () => {
  const page = lire('index_v7.html');
  const src = lire('lib/three-differe.js');
  for (const spec of ['three', 'three/addons/loaders/GLTFLoader.js', 'three/addons/loaders/KTX2Loader.js',
    'three/addons/libs/meshopt_decoder.module.js', 'three/addons/utils/BufferGeometryUtils.js']) {
    assert.ok(src.includes(`import('${spec}')`), spec);
  }
  assert.match(page, /"three": "https:\/\/cdn\.jsdelivr\.net\/npm\/three@/);
  assert.match(page, /"three\/addons\/": "https:\/\/cdn\.jsdelivr\.net\/npm\/three@/);
  assert.equal(Object.keys(IMPORTS_THREE).length, 7);
});

/* ---------- le graphe d import STATIQUE d app_v7.js ne contient pas three.js ---------- */

/** Les imports statiques locaux d'un fichier (pas `import()`). */
function importsStatiques(fichier) {
  const texte = readFileSync(fichier, 'utf8');
  const re = /(?:^|\n)\s*(?:import|export)\s[^;'"]*?from\s+['"]([^'"]+)['"]|(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;
  const out = [];
  for (const m of texte.matchAll(re)) out.push(m[1] || m[2]);
  return out;
}

test('three.js n est atteint par aucun import statique depuis app_v7.js', () => {
  const vus = new Set();
  const nus = [];
  const parcourir = (fichier) => {
    if (vus.has(fichier)) return;
    vus.add(fichier);
    for (const spec of importsStatiques(fichier)) {
      if (!spec.startsWith('.')) { nus.push(`${fichier.split(/[\\/]/).pop()} -> ${spec}`); continue; }
      const cible = resolve(dirname(fichier), spec.split('?')[0]);
      if (existsSync(cible)) parcourir(cible);
    }
  };
  parcourir(resolve(RACINE, 'app_v7.js'));
  assert.deepEqual(nus, [], 'import statique de module nu (three, three/addons) : il doit passer par lib/three-differe.js');
  assert.ok(vus.size > 40, 'le parcours doit atteindre les modules de lib/');
});

test('app_v7.js : aucune liaison three.js a l import, tout passe par Models3D.activer', () => {
  const app = lire('app_v7.js');
  assert.doesNotMatch(app, /import \* as THREE/);
  assert.doesNotMatch(app, /from 'three/);
  assert.match(app, /let THREE = null/);
  assert.match(app, /chargerThree\(\)\.then\(/);
});

test('Models3D : rien de three.js n est evalue a la creation de l objet', () => {
  const app = lire('app_v7.js');
  const debut = app.indexOf('const Models3D = {');
  const fin = app.indexOf('besoin3D() {', debut);
  assert.ok(debut > 0 && fin > debut);
  assert.doesNotMatch(app.slice(debut, fin), /new THREE\./);
});

test('Models3D.build : sans three.js, il active ou rend la main, avant tout autre travail', () => {
  const app = lire('app_v7.js');
  const i = app.indexOf('    async build() {');
  const bloc = app.slice(i, i + 700);
  assert.match(bloc, /if \(!THREE\) \{ if \(this\.besoin3D\(\)\) await this\.activer\(\); return; \}/);
  // La garde est avant la branche « 3D allegee » et avant `this.scene`.
  assert.ok(bloc.indexOf('if (!THREE)') < bloc.indexOf('this._disabled'));
});

test('Models3D.setSun : le soleil est memorise avant la garde, et rejoue apres le montage', () => {
  const app = lire('app_v7.js');
  const i = app.indexOf('    setSun(azimuthDeg, altitudeDeg, moon) {');
  const bloc = app.slice(i, i + 400);
  assert.ok(bloc.indexOf('this._soleil = [') < bloc.indexOf('if (!THREE) return;'));
  assert.ok(bloc.indexOf('if (!THREE) return;') < bloc.indexOf('this.sunDir.set('));
  const j = app.indexOf('    activer() {');
  const act = app.slice(j, j + 1100);
  assert.ok(act.indexOf('this.monter(') < act.indexOf('this.setSun(...this._soleil)'));
});

test('Models3D.onAdd : le calque garde la carte et le contexte, le moteur se monte si three.js est la', () => {
  const app = lire('app_v7.js');
  assert.match(app, /onAdd\(m, gl\) \{ self\._m = m; self\._gl = gl; if \(THREE\) self\.monter\(m, gl\); \}/);
});

test('Models3D.besoin3D : lampes, ombres du bati et modeles a l ecran, pas la 3D allegee', () => {
  const app = lire('app_v7.js');
  const i = app.indexOf('    besoin3D() {');
  const bloc = app.slice(i, app.indexOf('    activer() {', i));
  assert.match(bloc, /Eclairage\.couches\(\)\.length/);
  assert.match(bloc, /this\._disabled \|\| CONFIG\.light3d/);
  assert.match(bloc, /STATE\.settings\.shadows/);
  assert.match(bloc, /this\.collect\(\)\.length > 0/);
  // Les lampes comptent meme en 3D allegee (elles y restent, cf. `build`) : la verification vient avant.
  assert.ok(bloc.indexOf('Eclairage.couches()') < bloc.indexOf('this._disabled || CONFIG.light3d'));
});
