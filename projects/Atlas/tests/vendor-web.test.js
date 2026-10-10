/**
 * Dépendances externes embarquées (vendor/) : le manifeste, la réécriture de la page, l'analyse des polices, le verrou.
 * Aucun accès réseau. Une dépendance ajoutée à la page ou au code sans règle dans le manifeste fait échouer ces tests.
 *
 * node --test projects/Atlas/tests/vendor-web.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { html, analyserCssPolices, nomFichierPolice, lireManifeste, empreinte, verifier, NOM_VERROU, RACINE } from '../tools/vendoriser-web.mjs';

const manifeste = lireManifeste();
const PAGE = fs.readFileSync(path.join(RACINE, 'index_v7.html'), 'utf8');
const CODE = [path.join(RACINE, 'app_v7.js'), ...fs.readdirSync(path.join(RACINE, 'lib'), { recursive: true }).filter((f) => String(f).endsWith('.js')).map((f) => path.join(RACINE, 'lib', String(f)))];

test('manifeste : chaque bibliothèque a une version figée, une licence connue et des fichiers à chemins relatifs sans « .. »', () => {
  assert.equal(manifeste.format, 'atlas-vendor-externe/1');
  const vus = new Set();
  for (const b of manifeste.bibliotheques) {
    assert.match(b.version, /^\d+\.\d+\.\d+$/, b.id); assert.ok(b.licence && b.licenceUrl.startsWith('https://'), b.id);
    for (const f of b.fichiers) {
      assert.match(f.depuis, new RegExp('@' + b.version.replace(/\./g, '\\.') + '/'), 'l\'adresse porte la version figée : ' + f.depuis);
      assert.ok(!f.vers.startsWith('/') && !f.vers.includes('..') && !f.vers.includes('\\'), f.vers);
      assert.ok(!vus.has(f.vers), 'chemin en double : ' + f.vers); vus.add(f.vers);
    }
  }
});

test('la page : après réécriture, plus aucune adresse de CDN ; chaque adresse d\'origine a une règle', () => {
  assert.ok(html.referencesExternes(PAGE).length > 0, 'la page source vise bien des CDN');
  const apres = html.reecrireHtml(PAGE, manifeste);
  assert.deepEqual(html.referencesExternes(apres), [], 'rien ne doit partir chercher un CDN');
  for (const r of manifeste.reecritures) assert.ok(apres.includes(r.vers), r.vers);
});

test('la page réécrite vise vendor/ pour MapLibre, SunCalc, three.js (et ses extensions), terra-draw, et la feuille de polices locale', () => {
  const apres = html.reecrireHtml(PAGE, manifeste);
  assert.match(apres, /<script src="\.\/vendor\/maplibre-gl\/maplibre-gl\.js">/);
  assert.match(apres, /<link href="\.\/vendor\/maplibre-gl\/maplibre-gl\.css" rel="stylesheet" \/>/);
  assert.match(apres, /<script src="\.\/vendor\/suncalc\/suncalc\.js">/);
  assert.match(apres, /"three": "\.\/vendor\/three\/three\.module\.js"/);
  assert.match(apres, /"three\/addons\/": "\.\/vendor\/three\/addons\/"/);
  assert.match(apres, /"terra-draw": "\.\/vendor\/terra-draw\/terra-draw\.module\.js"/);
  assert.match(apres, /<link href="\.\/vendor\/polices\/polices\.css" rel="stylesheet" \/>/);
  assert.doesNotMatch(apres, /rel="preconnect"[^>]*fonts\.(googleapis|gstatic)|fonts\.(googleapis|gstatic)[^>]*rel="preconnect"/);
  assert.match(apres, /window\.__ATLAS_VENDOR__ = "\.\/vendor\/";/);
  assert.equal(apres.split('__ATLAS_VENDOR__').length, 2, 'posé une seule fois, même si on réécrit deux fois');
  assert.equal(html.reecrireHtml(apres, manifeste), apres, 'réécrire deux fois ne change plus rien');
});

test('le fichier du plugin Grist reste en ligne : il appartient à Grist, pas à nous', () => {
  const apres = html.reecrireHtml(PAGE, manifeste);
  assert.match(apres, /https:\/\/docs\.getgrist\.com\/grist-plugin-api\.js/);
});

test('aucune adresse de CDN dans le code, hors les deux replis connus (worker geotiff, transcodeur Basis) qui passent par la page embarquée', () => {
  const permis = [
    { fichier: 'lib/gltf-chargeur.js', motif: /TRANSCODEUR_CDN = 'https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/examples\/jsm\/libs\/basis\/'/ },
    { fichier: 'app_v7.js', motif: /GEOTIFF_CDN = 'https:\/\/cdn\.jsdelivr\.net\/npm\/geotiff@2\.1\.3\/dist-browser\/geotiff\.js'/ },
  ];
  for (const f of CODE) {
    const rel = path.relative(RACINE, f).replace(/\\/g, '/'); const t = fs.readFileSync(f, 'utf8');
    const trouvees = html.referencesExternes(t); if (!trouvees.length) continue;
    const p = permis.find((x) => x.fichier === rel);
    assert.ok(p && p.motif.test(t) && trouvees.length === 1, `${rel} : adresse de CDN non prévue : ${trouvees.join(', ')}`);
  }
});

test('le worker de lecture des MNT vise geotiff embarqué quand la page le dit, le CDN sinon', () => {
  const app = fs.readFileSync(path.join(RACINE, 'app_v7.js'), 'utf8');
  assert.match(app, /function urlGeotiff\(\)/);
  assert.match(app, /self\.importScripts\(\$\{JSON\.stringify\(urlGeotiff\(\)\)\}\)/);
  assert.doesNotMatch(app, /importScripts\('https:/);
  const corps = /function urlGeotiff\(\) \{([\s\S]*?)\n\}/.exec(app)[1];
  const fabrique = new Function('window', 'location', 'GEOTIFF_CDN', corps);
  assert.equal(fabrique({ __ATLAS_VENDOR__: './vendor/' }, { href: 'https://h.example/atlas/index.html' }, 'CDN'), 'https://h.example/atlas/vendor/geotiff/geotiff.js');
  assert.equal(fabrique({}, { href: 'https://h.example/atlas/' }, 'https://cdn/geotiff.js'), 'https://cdn/geotiff.js');
});

const CSS = `/* cyrillic */
@font-face { font-family: 'Hanken Grotesk'; font-style: normal; font-weight: 400; font-display: swap; src: url(https://fonts.gstatic.com/s/h/v1/cyr.woff2) format('woff2'); unicode-range: U+0301, U+0400-045F; }
/* latin-ext */
@font-face { font-family: 'Hanken Grotesk'; font-style: normal; font-weight: 400 700; font-display: swap; src: url(https://fonts.gstatic.com/s/h/v1/ext.woff2) format('woff2'); unicode-range: U+0100-02BA; }
/* latin */
@font-face { font-family: 'Newsreader'; font-style: italic; font-weight: 400; font-display: swap; src: url(https://fonts.gstatic.com/s/n/v26/lat.woff2) format('woff2'); unicode-range: U+0000-00FF; }`;

test('polices : on garde latin et latin-ext, on écarte le reste, on lit famille, style, graisse, adresse et plage', () => {
  const blocs = analyserCssPolices(CSS, ['latin', 'latin-ext']);
  assert.deepEqual(blocs.map((b) => b.sousEnsemble), ['latin-ext', 'latin']);
  assert.deepEqual(blocs[0], { sousEnsemble: 'latin-ext', famille: 'Hanken Grotesk', style: 'normal', graisse: '400 700', url: 'https://fonts.gstatic.com/s/h/v1/ext.woff2', plage: 'U+0100-02BA' });
  assert.equal(blocs[1].style, 'italic');
  assert.equal(analyserCssPolices(CSS, ['cyrillic']).length, 1);
  assert.deepEqual(analyserCssPolices('pas du css', ['latin']), []);
});

test('polices : nom de fichier stable depuis l\'adresse', () => {
  assert.equal(nomFichierPolice('https://fonts.gstatic.com/s/newsreader/v26/cY9AfjOCX1hbuyalUrK4397yjA.woff2'), 'cY9AfjOCX1hbuyalUrK4397yjA.woff2');
  assert.equal(nomFichierPolice('https://x.example/f/abc'), 'abc.woff2');
});

test('verrou : un dossier conforme passe ; fichier modifié, tronqué ou absent, et licences manquantes sont signalés', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-'));
  const a = Buffer.from('console.log(1)'), b = Buffer.from('console.log(2)');
  fs.mkdirSync(path.join(d, 'x'), { recursive: true });
  fs.writeFileSync(path.join(d, 'x', 'a.js'), a); fs.writeFileSync(path.join(d, 'x', 'b.js'), b); fs.writeFileSync(path.join(d, 'LICENCES.txt'), 'MIT');
  fs.writeFileSync(path.join(d, NOM_VERROU), JSON.stringify({ format: 'atlas-vendor-verrou/1', fichiers: { 'x/a.js': { taille: a.length, integrite: empreinte(a) }, 'x/b.js': { taille: b.length, integrite: empreinte(b) } } }));
  assert.deepEqual(verifier({ sortie: d }), []);
  fs.writeFileSync(path.join(d, 'x', 'a.js'), Buffer.from('console.log(9)'));
  assert.deepEqual(verifier({ sortie: d }), ['empreinte : x/a.js']);
  fs.writeFileSync(path.join(d, 'x', 'a.js'), Buffer.from('co'));
  assert.match(verifier({ sortie: d })[0], /taille : x\/a\.js/);
  fs.rmSync(path.join(d, 'x', 'b.js'));
  assert.ok(verifier({ sortie: d }).includes('absent : x/b.js'));
  fs.rmSync(path.join(d, 'LICENCES.txt'));
  assert.ok(verifier({ sortie: d }).includes('LICENCES.txt absent'));
  assert.deepEqual(verifier({ sortie: path.join(d, 'inexistant') }).length, 1);
});

test('si le dossier publié embarque ses dépendances, le verrou est respecté (sinon ce test ne porte sur rien)', (t) => {
  const publie = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'published', 'atlas', 'vendor');
  if (!fs.existsSync(path.join(publie, NOM_VERROU))) return t.skip('dépendances pas encore embarquées dans published/atlas/vendor');
  assert.deepEqual(verifier({ sortie: publie }), []);
});
