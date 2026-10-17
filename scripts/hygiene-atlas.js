/**
 * Hygiène du dépôt : ce qui part dans un commit, et ce qu'Atlas montre en ligne, doivent rester légers et propres.
 *
 *   node scripts/hygiene-atlas.js            ce qui est INDEXÉ (git add) : liste, poids, refus
 *   node scripts/hygiene-atlas.js --publie   tout ce que git suit sous published/atlas (ce que GitHub Pages sert)
 *
 * Refus (code de sortie 1) : dossier d'essai, capture ou cache de navigateur, fichier d'environnement ou de clé,
 * fichier de plus de 5 Mo, chemin absolu d'un poste, secret reconnaissable, terme interdit.
 * Avertissement : fichier de plus de 1 Mo, adresse de messagerie.
 *
 * Les TERMES INTERDITS (noms d'organisation, d'équipe, de personne qu'on ne montre pas) ne sont jamais écrits ici : ils sont lus
 * dans `<dossier git>/hygiene-termes.txt`, un par ligne, hors suivi. Sans ce fichier, le contrôle des termes est ignoré et le dit.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const AVERTIR_OCTETS = 1024 * 1024;
const REFUSER_OCTETS = 5 * 1024 * 1024;
const LIRE_JUSQU_A = 2 * 1024 * 1024;

const CHEMINS_REFUSES = [
  [/(^|\/)essais-[^/]+\//, "dossier d'essai : il reste hors dépôt (une fiche de conclusion courte va sous docs/)"],
  [/(^|\/)(captures|resultats|resultats-[^/]+|profil-[^/]+|Cache_Data)\//, 'capture, résultat de rejeu ou cache de navigateur'],
  [/(^|\/)node_modules\//, 'dépendances installées'],
  [/(^|\/)\.env(\.|$)/, "fichier d'environnement"],
  [/\.(pem|key|p12|pfx|local|secret)$/i, 'clé, certificat ou fichier local'],
  [/\.(zip|7z|rar|tar|tgz|mp4|mov|avi)$/i, 'archive ou vidéo : à héberger ailleurs'],
];
const EXTENSIONS_TEXTE = /\.(json|geojson|js|mjs|cjs|html|css|md|py|txt|svg|yml|yaml)$/i;
const SANS_CONTENU = /(^|\/)(vendor|node_modules|vendor-externe)(\/|\.)/;

const MOTIFS_ERREUR = [
  [/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s'"`]+/, "chemin absolu d'un poste Windows"],
  [/\/(?:home|Users)\/[a-z][\w.-]{2,}\//, "chemin absolu d'un poste"],
  [/ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/, 'jeton GitHub'],
  [/AKIA[0-9A-Z]{16}/, "clé d'accès AWS"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'clé privée'],
  [/\bBearer\s+[A-Za-z0-9._-]{40,}/, "jeton porteur dans un texte"],
  [/["']?(?:api[_-]?key|secret|token)["']?\s*[:=]\s*["'][A-Za-z0-9_\-]{24,}["']/i, 'secret écrit en clair'],
];
const MOTIF_MEL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/g;
const MELS_ADMIS = /(noreply|no-reply|example\.(com|org)|users\.noreply\.github\.com)/i;

/**
 * @param {{chemin:string, octets:number, texte?:string}[]} fichiers
 * @param {{termes?:string[]}} [options]
 * @returns {{erreurs:string[], avertissements:string[], octets:number}}
 */
function controler(fichiers, options = {}) {
  const termes = (options.termes || []).map((t) => t.trim()).filter(Boolean).map((t) => t.toLowerCase());
  const erreurs = []; const avertissements = []; let octets = 0;
  for (const f of fichiers) {
    const chemin = f.chemin.replace(/\\/g, '/'); octets += f.octets;
    for (const [motif, raison] of CHEMINS_REFUSES) if (motif.test(chemin)) erreurs.push(`${chemin} : ${raison}`);
    if (f.octets > REFUSER_OCTETS) erreurs.push(`${chemin} : ${(f.octets / 1048576).toFixed(1)} Mo, au-dessus de 5 Mo`);
    else if (f.octets > AVERTIR_OCTETS) avertissements.push(`${chemin} : ${(f.octets / 1048576).toFixed(1)} Mo`);
    if (typeof f.texte !== 'string' || SANS_CONTENU.test(chemin)) continue;
    for (const [motif, raison] of MOTIFS_ERREUR) if (motif.test(f.texte)) erreurs.push(`${chemin} : ${raison}`);
    const minuscule = f.texte.toLowerCase();
    for (const t of termes) if (minuscule.includes(t)) erreurs.push(`${chemin} : contient un terme interdit (ligne ${numeroDeLigne(f.texte, minuscule.indexOf(t))})`);
    const mels = (f.texte.match(MOTIF_MEL) || []).filter((m) => !MELS_ADMIS.test(m));
    if (mels.length) avertissements.push(`${chemin} : adresse de messagerie (${[...new Set(mels)].slice(0, 2).join(', ')})`);
  }
  return { erreurs, avertissements, octets };
}

function numeroDeLigne(texte, position) { return texte.slice(0, position).split('\n').length; }

function git(args, opts = {}) { return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts }); }

function termesLocaux(racine) {
  try {
    const dossierGit = path.resolve(racine, git(['rev-parse', '--git-common-dir'], { cwd: racine }).trim());
    const fichier = path.join(dossierGit, 'hygiene-termes.txt');
    return fs.existsSync(fichier) ? fs.readFileSync(fichier, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#')) : null;
  } catch { return null; }
}

function lireDepuisDisque(racine, chemins) {
  return chemins.filter((c) => fs.existsSync(path.join(racine, c))).map((c) => {
    const complet = path.join(racine, c); const octets = fs.statSync(complet).size;
    return { chemin: c, octets, texte: EXTENSIONS_TEXTE.test(c) && octets <= LIRE_JUSQU_A ? fs.readFileSync(complet, 'utf8') : undefined };
  });
}

function lireDepuisIndex(racine, chemins) {
  return chemins.map((c) => {
    const octets = Number(git(['cat-file', '-s', `:${c}`], { cwd: racine }).trim());
    return { chemin: c, octets, texte: EXTENSIONS_TEXTE.test(c) && octets <= LIRE_JUSQU_A ? git(['show', `:${c}`], { cwd: racine }) : undefined };
  });
}

function principal() {
  const racine = path.join(__dirname, '..'); const publie = process.argv.includes('--publie');
  const chemins = (publie ? git(['ls-files', '-z', 'published/atlas'], { cwd: racine }) : git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { cwd: racine }))
    .split('\0').filter(Boolean);
  if (!chemins.length) { console.log(publie ? 'Rien de suivi sous published/atlas.' : "Rien d'indexé : rien à contrôler (git add d'abord)."); return 0; }
  const fichiers = publie ? lireDepuisDisque(racine, chemins) : lireDepuisIndex(racine, chemins);
  const termes = termesLocaux(racine);
  const r = controler(fichiers, { termes: termes || [] });
  console.log(`${publie ? 'Publié (published/atlas)' : 'Indexé'} : ${fichiers.length} fichier(s), ${(r.octets / 1048576).toFixed(2)} Mo`);
  if (!publie) for (const f of [...fichiers].sort((a, b) => b.octets - a.octets).slice(0, 15)) console.log(`  ${String((f.octets / 1024).toFixed(0)).padStart(7)} Ko  ${f.chemin}`);
  if (termes === null) console.log("  (termes interdits : aucun fichier <dossier git>/hygiene-termes.txt, ce contrôle est ignoré)");
  for (const a of r.avertissements) console.log(`  avertissement : ${a}`);
  for (const e of r.erreurs) console.log(`  REFUS : ${e}`);
  console.log(r.erreurs.length ? `${r.erreurs.length} refus.` : 'Propre.');
  return r.erreurs.length ? 1 : 0;
}

module.exports = { controler, AVERTIR_OCTETS, REFUSER_OCTETS };
if (require.main === module) process.exit(principal());
