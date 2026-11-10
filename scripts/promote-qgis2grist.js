/**
 * promote-qgis2grist.js
 * Publie qgis2grist v2 en parallèle de v1 (CADRAGE D4-B).
 *
 * - published/qgis2grist/index.html  = v1 Leaflet (+ lib/ qu'elle référence)
 * - published/qgis2grist/v2/         = MapLibre + Scene Manifest + terrain
 * - package.json : deux entrées grist
 *
 * Usage: node scripts/promote-qgis2grist.js
 *        node scripts/promote-qgis2grist.js --out <dossier>   (promotion d'essai : published/ n'est pas touche)
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'projects', 'qgis2grist');
const forms = path.join(root, 'projects', 'grist_forms');
const outIdx = process.argv.indexOf('--out');
if (outIdx > -1 && !process.argv[outIdx + 1]) throw new Error('--out demande un dossier');
const pub = outIdx > -1 ? path.resolve(process.argv[outIdx + 1]) : path.join(root, 'published', 'qgis2grist');
const v2 = path.join(pub, 'v2');
const vendor = path.join(v2, 'vendor', 'grist_forms');
const VER = '2.1.0';

function mkdirp(d) {
  fs.mkdirSync(d, { recursive: true });
}
function copyFile(from, to) {
  mkdirp(path.dirname(to));
  fs.copyFileSync(from, to);
}
function copyDirJs(fromDir, toDir) {
  mkdirp(toDir);
  for (const f of fs.readdirSync(fromDir)) {
    if (!f.endsWith('.js')) continue;
    fs.copyFileSync(path.join(fromDir, f), path.join(toDir, f));
  }
}
function rewrite(file, replacers) {
  let s = fs.readFileSync(file, 'utf8');
  for (const [re, to] of replacers) s = s.replace(re, to);
  fs.writeFileSync(file, s);
}

mkdirp(v2);
mkdirp(path.join(v2, 'lib'));
mkdirp(vendor);

// --- v1 HTML ---
// La v1 charge désormais quelques modules de lib/ (WKB/GPKG, réconciliation
// de géométrie). Publier l'index seul les laisserait en 404 : on copie donc
// exactement les fichiers qu'elle référence, pas tout lib/ (le reste est v2).
copyFile(path.join(src, 'index.html'), path.join(pub, 'index.html'));
const v1Libs = [
  ...fs.readFileSync(path.join(pub, 'index.html'), 'utf8').matchAll(/src="lib\/([\w.-]+\.js)/g),
].map((m) => m[1]);
for (const name of new Set(v1Libs)) {
  copyFile(path.join(src, 'lib', name), path.join(pub, 'lib', name));
}
rewrite(path.join(pub, 'index.html'), [
  [/lib\/([\w.-]+\.js)\?v=[^"']+/g, `lib/$1?v=${VER}`],
]);

// --- v2 HTML ---
copyFile(path.join(src, 'index_v2.html'), path.join(v2, 'index.html'));
copyFile(path.join(src, 'terrain.html'), path.join(v2, 'terrain.html'));
copyDirJs(path.join(src, 'lib'), path.join(v2, 'lib'));

// Vendor grist_forms deps (chemins relatifs cassés hors monorepo)
const vendorFiles = [
  ['shared/publish.js', 'publish.js'],
  ['shared/grist-bridge.js', 'grist-bridge.js'],
  ['shared/types.js', 'types.js'],
  ['shared/attachments.js', 'attachments.js'],
  ['shared/session-context.js', 'session-context.js'],
  ['shared/dsfr-like.css', 'dsfr-like.css'],
  ['runtime/engine.js', 'engine.js'],
  // Theme charge par index_v2.html : sans ces fichiers, 404 une fois publie et theme non applique.
  ['shared/theme.js', 'theme.js'],
  ['shared/theme-instance.js', 'theme-instance.js'],
  ['shared/derivation-valeurs.js', 'derivation-valeurs.js'],
  ['shared/themedef.js', 'themedef.js'],
];
for (const [rel, name] of vendorFiles) {
  const from = path.join(forms, rel);
  if (!fs.existsSync(from)) {
    console.warn('WARN missing', rel);
    continue;
  }
  copyFile(from, path.join(vendor, name));
}

rewrite(path.join(v2, 'index.html'), [
  [/<title>[^<]*<\/title>/, '<title>QGIS → Grist Importer v2</title>'],
  [/lib\/([\w.-]+\.js)\?v=[^"']+/g, `lib/$1?v=${VER}`],
  // Scripts sans version : on les versionne aussi, sinon un navigateur garde l'ancien module en cache.
  [/src="lib\/([\w.-]+\.js)"/g, `src="lib/$1?v=${VER}"`],
  [/\.\.\/grist_forms\/shared\/publish\.js/g, 'vendor/grist_forms/publish.js'],
  [/\.\.\/grist_forms\/shared\/(theme|theme-instance|derivation-valeurs|themedef)\.js/g, 'vendor/grist_forms/$1.js'],
]);

rewrite(path.join(v2, 'terrain.html'), [
  [/lib\/([\w.-]+\.js)\?v=[^"']+/g, `lib/$1?v=${VER}`],
  [/\.\.\/grist_forms\/shared\/grist-bridge\.js/g, 'vendor/grist_forms/grist-bridge.js'],
  [/\.\.\/grist_forms\/shared\/types\.js/g, 'vendor/grist_forms/types.js'],
  [/\.\.\/grist_forms\/shared\/attachments\.js/g, 'vendor/grist_forms/attachments.js'],
  [/\.\.\/grist_forms\/shared\/session-context\.js/g, 'vendor/grist_forms/session-context.js'],
  [/\.\.\/grist_forms\/runtime\/engine\.js/g, 'vendor/grist_forms/engine.js'],
  [/\.\.\/grist_forms\/shared\/dsfr-like\.css/g, 'vendor/grist_forms/dsfr-like.css'],
]);

// --- Garde : le nom de l'employeur ne doit jamais figurer dans le paquet publie (decision de Nicolas) ---
function listFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}
const INTERDIT = new RegExp(['cer', 'ema'].join(''), 'i');
const fautifs = listFiles(pub).filter((f) => /.(js|html|css|json|md)$/i.test(f) && INTERDIT.test(fs.readFileSync(f, 'utf8')));
if (fautifs.length) {
  throw new Error('Nom interdit present dans le paquet : ' + fautifs.map((f) => path.relative(pub, f)).join(', '));
}

// package.json dual widget
const pkg = {
  name: 'qgis2grist',
  version: VER,
  description:
    'Importateur QGIS → Grist : schéma typé, Scene Manifest V0.2, carte MapLibre (v2), pack terrain',
  authors: [{ name: 'nic01asfr', url: 'https://github.com/nic01asfr' }],
  grist: [
    {
      widgetId: 'qgis2grist',
      name: 'QGIS → Grist Importer',
      url: '',
      accessLevel: 'full',
      description:
        'v1 Leaflet — importez qgis2web / QGZ / QField / GPKG dans Grist (schéma auto)',
    },
    {
      widgetId: 'qgis2grist-v2',
      name: 'QGIS → Grist Importer v2',
      url: 'v2/',
      accessLevel: 'full',
      description:
        'v2 MapLibre + Scene Manifest + contrôles + pack terrain (interop Atlas)',
    },
  ],
};
fs.writeFileSync(path.join(pub, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

console.log('published/qgis2grist/v2 ready (v' + VER + ')');
console.log('  widgets: qgis2grist (v1) + qgis2grist-v2');
