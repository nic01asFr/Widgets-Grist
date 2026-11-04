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

const COPY_DIRS = ['shared', 'runtime', 'demo'];
const COPY_FILES = ['builder.html', 'design-system.html', 'README.md'];

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

// Le widget auto-descriptif (forms-registre) : seulement ce qui sert en ligne, c'est-a-dire le module que la vitrine injecte et ce qu'il lit.
// Le CLI et le serveur MCP requierent les scripts du depot (scripts/valider-schema.js) : ils restent dans les sources, pas dans published/.
// La fiche, les commandes, le llms.txt et le skill vont aussi a la racine du widget, la ou la vitrine les cherche.
const REGISTRE_EN_LIGNE = ['registre.js', 'navigateur.js', 'webmcp-entree.js', 'fiche-capacites.json', 'commandes.json'];
const REGISTRE_A_LA_RACINE = ['fiche-capacites.json', 'commandes.json', 'llms.txt', 'SKILL.md'];
const REGISTRE_SRC = path.join(SRC, 'forms-registre');
if (fs.existsSync(REGISTRE_SRC)) {
  fs.mkdirSync(path.join(DEST, 'forms-registre'), { recursive: true });
  REGISTRE_EN_LIGNE.forEach(function (f) { fs.copyFileSync(path.join(REGISTRE_SRC, f), path.join(DEST, 'forms-registre', f)); });
  REGISTRE_A_LA_RACINE.forEach(function (f) { fs.copyFileSync(path.join(REGISTRE_SRC, f), path.join(DEST, f)); });
}

// La version se lit dans le journal de la fiche de vitrine (sa première entrée) : c'est elle qu'on écrit à chaque
// publication. Elle était ici en dur (« 1.4.0 ») et écrasait, à chaque promotion, la version corrigée à la main.
function versionPubliee() {
  try {
    const fiche = JSON.parse(garde['vitrine.json'].toString('utf8'));
    const v = String((fiche.journal && fiche.journal[0] && fiche.journal[0].version) || '').replace(/^v/, '');
    if (/^\d+\.\d+\.\d+$/.test(v)) return v;
  } catch (e) { /* fiche absente ou illisible : version de repli ci-dessous */ }
  console.warn('Version illisible dans vitrine.json (journal[0].version) : 0.0.0 écrite, à corriger.');
  return '0.0.0';
}

const pkg = {
  name: 'grist-forms',
  version: versionPubliee(),
  description: 'Form Builder Grist — composer, remplir et dépouiller des formulaires dans un document',
  authors: [{ name: 'nic01asfr', url: 'https://github.com/nic01asfr' }],
  // Deux widgets, un seul paquet : le compositeur de formulaires, et la page qui verse un design system dans le document.
  grist: [
    {
      widgetId: 'grist-forms-builder',
      name: 'Form Builder — formulaires Grist',
      url: 'builder.html',
      accessLevel: 'full',
      description: 'Questionnaires liés aux tables : étapes, conditions, audience, carte, dessin, synthèse'
    },
    {
      widgetId: 'grist-forms-design-system',
      name: 'Design system — saisir et verser',
      url: 'design-system.html',
      // Servi, mais pas proposé dans le sélecteur de Grist tant que la décision de le montrer n'est pas prise
      // (le manifeste ignore un widget `prive`) : passer à false pour l'annoncer.
      prive: true,
      accessLevel: 'full',
      description: 'Renseigner un design system par niveaux, le garder en brouillon dans le document, contrôler ses règles'
    }
  ]
};
fs.writeFileSync(path.join(DEST, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

console.log('Promu : projects/grist_forms → published/grist_forms/');
console.log('Fichiers : builder.html, README.md, shared/, runtime/ (vitrine.json préservée)');
console.log('Exécutez : npm run manifest');
