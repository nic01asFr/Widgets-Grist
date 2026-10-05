/**
 * promote-grist-forms.js — Copie projects/grist_forms → published/grist_forms
 *
 * Usage: node scripts/promote-grist-forms.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'projects', 'grist_forms');
const DEST = path.join(ROOT, 'published', 'grist_forms');

const COPY_DIRS = ['shared', 'runtime'];
const COPY_FILES = ['builder.html', 'README.md'];

// Ce qui vit dans published/ et ne vient PAS des sources : la fiche de vitrine
// est ecrite la, et la promotion ne doit pas l'emporter en faisant le menage.
const A_PRESERVER = ['vitrine.json'];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (!fs.existsSync(SRC)) {
  console.error('Source introuvable:', SRC);
  process.exit(1);
}

const garde = {};
if (fs.existsSync(DEST)) {
  A_PRESERVER.forEach(function (f) {
    const chemin = path.join(DEST, f);
    if (fs.existsSync(chemin)) garde[f] = fs.readFileSync(chemin);
  });
  fs.rmSync(DEST, { recursive: true, force: true });
}
fs.mkdirSync(DEST, { recursive: true });
Object.keys(garde).forEach(function (f) {
  fs.writeFileSync(path.join(DEST, f), garde[f]);
});

COPY_FILES.forEach(function (f) {
  fs.copyFileSync(path.join(SRC, f), path.join(DEST, f));
});
COPY_DIRS.forEach(function (d) {
  copyDir(path.join(SRC, d), path.join(DEST, d));
});

const pkg = {
  name: 'grist-forms',
  version: '1.1.0',
  description: 'Form Builder Grist — composer, remplir et dépouiller des formulaires dans un document',
  authors: [{ name: 'nic01asfr', url: 'https://github.com/nic01asfr' }],
  grist: {
    widgetId: 'grist-forms-builder',
    name: 'Form Builder — formulaires Grist',
    url: 'builder.html',
    accessLevel: 'full',
    description: 'Questionnaires liés aux tables : étapes, conditions, audience, carte, dessin, synthèse'
  }
};
fs.writeFileSync(path.join(DEST, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

console.log('Promu : projects/grist_forms → published/grist_forms/');
console.log('Fichiers : builder.html, README.md, shared/, runtime/ (vitrine.json préservée)');
console.log('Exécutez : npm run manifest');
