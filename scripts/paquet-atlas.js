/**
 * Le paquet WEB d'Atlas, figé : ce qu'un client en production copie chez lui pour ne plus suivre la dernière version de l'adresse publique.
 *
 * Deux profils :
 *  - `complet` : `published/atlas/` sans ce qui ne sert pas à l'exploiter (`demos/`, `vitrine.json`, images de la vitrine) : la page maigre `bi.html`, la page de l'application
 *    `index.html` et `app.js`, `lib/`, `vendor/` (MapLibre, three.js, polices : aucun CDN), `models/` et `objets/` ;
 *  - `bi` (« carte seule ») : seulement ce qu'il faut pour servir le composant carte BI et l'élément `<atlas-bi>` (voir scripts/paquet-atlas-bi.js), avec `PRECACHE.json` (les fichiers
 *    de la page, pour un service worker) et `CSP.txt` (la politique de sécurité de contenu recommandée, avec les empreintes exactes des blocs en ligne s'il en reste).
 * Chacun porte `LICENSE` et `PAQUET.json` : la version d'Atlas, celle du contrat, le client des hôtes avec son empreinte, et l'empreinte SHA-256 de chaque fichier, pour qu'une
 * copie se vérifie.
 *
 *   node scripts/paquet-atlas.js --sortie dist                  # profil complet : dist/atlas-web-<version>/ et dist/NOTES.md
 *   node scripts/paquet-atlas.js --sortie dist --profil bi      # carte seule : dist/atlas-web-bi-<version>/
 *   node scripts/paquet-atlas.js --sortie dist --profil tous    # les deux, et des notes communes
 *
 * Le workflow `.github/workflows/paquet-atlas.yml` s'en sert à chaque étiquette `atlas-web-v<version>` ; ce module est pur côté logique (testé : `scripts/paquet-atlas.test.js`).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bi = require('./paquet-atlas-bi.js');

const RACINE = path.join(__dirname, '..');
const SOURCE = path.join(RACINE, 'published', 'atlas');
/** Ce qui ne part pas : la vitrine, ses images, les démonstrations. */
const EXCLUS = [/^demos\//, /^vitrine\.json$/, /\.(jpg|jpeg|png|webp)$/i, /^essai/];
const CLIENT = 'lib/bi/client-hote.js';
const PROFILS = ['complet', 'bi'];
/**
 * Fichiers du dépôt qui voyagent avec le paquet sans être dans `published/atlas/` : la licence d'Atlas (MIT impose que l'avis accompagne chaque copie ;
 * `vendor/LICENCES.txt` ne couvre que les dépendances). Chemin dans le paquet -> chemin depuis la racine du dépôt.
 */
const EXTRAS = { LICENSE: 'LICENSE' };
/** Ce que seul le profil « carte seule » emporte : l'outil de contrôle d'une copie (autonome, sans dépendance), pour que l'hôte le lance dans sa copie. */
const EXTRAS_BI = { 'controle-copie.mjs': 'projects/Atlas/tools/controle-copie.mjs' };
const extrasDe = (profil) => (profil === 'bi' ? { ...EXTRAS, ...EXTRAS_BI } : EXTRAS);

const sha = (algo, octets, base64 = false) => crypto.createHash(algo).update(octets).digest(base64 ? 'base64' : 'hex');

function lister(dossier, base = dossier) {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dossier, e.name);
    return e.isDirectory() ? lister(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  }).sort();
}

const verifierProfil = (profil) => { if (!PROFILS.includes(profil)) throw new Error('profil inconnu : ' + profil + ' (attendu : ' + PROFILS.join(', ') + ')'); };

/** Les fichiers du paquet (chemins relatifs, triés), SANS ceux que le profil génère (`PRECACHE.json`, `CSP.txt`). */
function fichiersDuPaquet(source = SOURCE, racine = RACINE, profil = 'complet') {
  verifierProfil(profil);
  const dispo = extrasDe(profil);
  const extras = Object.keys(dispo).filter((f) => fs.existsSync(path.join(racine, dispo[f])));
  const base = profil === 'bi' ? bi.fichiersProfilBi(source) : lister(source).filter((f) => !EXCLUS.some((re) => re.test(f)));
  return [...new Set([...base, ...extras])].sort();
}

/** Le contenu d'un fichier du paquet : un extra vient de la racine du dépôt, tout le reste de `source`. */
function lireFichier(chemin, source = SOURCE, racine = RACINE) {
  const tous = { ...EXTRAS, ...EXTRAS_BI };
  return fs.readFileSync(tous[chemin] && !fs.existsSync(path.join(source, chemin)) ? path.join(racine, tous[chemin]) : path.join(source, chemin));
}

/** Le contrat du composant, lu dans son document (`| Contrat du composant carte BI | 0.3 ... |`). */
function versionContrat(racine = RACINE) {
  const t = fs.readFileSync(path.join(racine, 'projects', 'Atlas', 'CHANGELOG.md'), 'utf8');
  const m = /Contrat du composant carte BI \| (\d+\.\d+)/.exec(t);
  return m ? m[1] : null;
}

/** Les fichiers que le profil génère à partir des autres (nom -> texte) : rien pour le profil complet. */
function fichiersGeneres({ source = SOURCE, racine = RACINE, profil = 'complet' } = {}) {
  verifierProfil(profil);
  if (profil !== 'bi') return {};
  const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  const html = fs.readFileSync(path.join(source, 'bi.html'), 'utf8');
  return {
    'CSP.txt': bi.texteCsp({ version: pkg.version, html, feuillesConstruites: fs.existsSync(path.join(source, 'lib', 'bi', 'ui', 'feuille.js')) }),
    'PRECACHE.json': JSON.stringify(bi.listePrecache({ version: pkg.version, contrat: versionContrat(racine), source }), null, 2) + '\n',
  };
}

/** `PAQUET.json` : le contenu, pour une version, un profil et un commit donnés. */
function construireManifeste({ source = SOURCE, racine = RACINE, commit = null, genere = new Date().toISOString(), profil = 'complet' } = {}) {
  verifierProfil(profil);
  const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  const lus = fichiersDuPaquet(source, racine, profil).map((f) => { const o = lireFichier(f, source, racine); return { chemin: f, octets: o.length, sha256: sha('sha256', o) }; });
  const generes = Object.entries(fichiersGeneres({ source, racine, profil })).map(([f, texte]) => { const o = Buffer.from(texte, 'utf8'); return { chemin: f, octets: o.length, sha256: sha('sha256', o) }; });
  const fichiers = [...lus, ...generes].sort((a, b) => (a.chemin < b.chemin ? -1 : a.chemin > b.chemin ? 1 : 0));
  const client = fs.readFileSync(path.join(source, CLIENT));
  const entree = /VERSION_CLIENT\s*=\s*(\d+)/.exec(client.toString('utf8'));
  return {
    nom: profil === 'bi' ? 'atlas-web-bi' : 'atlas-web', profil, version: pkg.version, contrat: versionContrat(racine), commit, genere,
    client: { fichier: CLIENT, versionClient: entree ? Number(entree[1]) : null, empreinte: 'sha384-' + sha('sha384', client, true), octets: client.length },
    fichiers,
    note: profil === 'bi'
      ? 'Paquet web d\'Atlas, carte seule : la page maigre du composant (bi.html), l\'élément <atlas-bi>, MapLibre, les contours de repli et le client des hôtes, sans CDN. CSP.txt : la politique recommandée ; PRECACHE.json : les fichiers de la page. Vérifier une copie : SHA-256 de chaque fichier ci-dessus.'
      : 'Paquet web d\'Atlas : la carte nue (bi.html), l\'application (index.html) et leurs dépendances, sans CDN. Vérifier une copie : SHA-256 de chaque fichier ci-dessus.',
  };
}

/** La section du journal des versions pour `version` (`## 1.32.0 — …` jusqu'à la suivante), ou null. */
function notesDeVersion(version, racine = RACINE) {
  const t = fs.readFileSync(path.join(racine, 'projects', 'Atlas', 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n');
  const debut = t.search(new RegExp('^## ' + version.replace(/\./g, '\\.') + ' —', 'm'));
  if (debut < 0) return null;
  const suite = t.slice(debut + 3).search(/^## /m);
  return t.slice(debut, suite < 0 ? undefined : debut + 3 + suite).trim();
}

const mo = (fichiers) => (fichiers.reduce((n, f) => n + f.octets, 0) / 1048576).toFixed(1);

/** Les notes de la release pour un ou deux paquets du même numéro de version. */
function texteNotes(manifestes, journal) {
  const [m] = manifestes;
  const archives = manifestes.map((x) => `- \`atlas-web-${x.profil === 'bi' ? 'bi-' : ''}${x.version}.zip\` : ${x.profil === 'bi' ? 'la carte seule (composant carte BI et élément `<atlas-bi>`)' : 'le paquet complet (application et carte)'}, ${x.fichiers.length} fichiers, ${mo(x.fichiers)} Mo.`);
  return [
    `Paquet${manifestes.length > 1 ? 's' : ''} web d'Atlas ${m.version}, figé${manifestes.length > 1 ? 's' : ''} : à copier chez soi pour ne pas suivre la dernière version de l'adresse publique.`, '',
    ...archives, '',
    `- Contrat du composant : ${m.contrat} ; client des hôtes : \`${m.client.fichier}\`, version ${m.client.versionClient}, empreinte \`${m.client.empreinte}\`.`,
    `- Vérification : \`PAQUET.json\` donne l'empreinte SHA-256 de chaque fichier ; \`SHA256SUMS\` celle des archives. \`LICENSE\` (MIT) accompagne chaque copie.`,
    "- Servir le dossier tel quel (http ou https) ; l'hôte déclare son origine par `hote=`. MapLibre, three.js et les polices sont dans le paquet (aucun CDN) ; le fond de carte (OpenFreeMap, IGN) reste un service tiers. `base=\"aucune\"` n'en demande aucun au démarrage, mais une couche qui affiche du texte demande ses polices à demotiles.maplibre.org ; l'application, en widget Grist, charge en plus l'API de plugin de Grist.",
    ...(manifestes.some((x) => x.profil === 'bi') ? ["- Carte seule : `CSP.txt` donne la politique de sécurité de contenu recommandée pour `bi.html` (en-tête HTTP), `PRECACHE.json` les fichiers de la page pour un service worker."] : []), '',
    journal ? '## Ce que contient cette version\n\n' + journal.replace(/^## [^\n]*\n+/, '') : '',
  ].join('\n');
}

/**
 * Écrit le dossier d'un paquet. Les notes de la release sont écrites avec lui sauf `notes: false` (quand plusieurs profils partagent les mêmes notes).
 * @returns {{ dossier: string, manifeste: object }}
 */
function ecrire({ sortie, source = SOURCE, racine = RACINE, commit = null, profil = 'complet', notes = true } = {}) {
  const manifeste = construireManifeste({ source, racine, commit, profil });
  const dossier = path.join(sortie, `atlas-web-${profil === 'bi' ? 'bi-' : ''}${manifeste.version}`);
  fs.rmSync(dossier, { recursive: true, force: true });
  for (const f of fichiersDuPaquet(source, racine, profil)) { fs.mkdirSync(path.dirname(path.join(dossier, f)), { recursive: true }); fs.writeFileSync(path.join(dossier, f), lireFichier(f, source, racine)); }
  for (const [f, texte] of Object.entries(fichiersGeneres({ source, racine, profil }))) fs.writeFileSync(path.join(dossier, f), texte);
  fs.writeFileSync(path.join(dossier, 'PAQUET.json'), JSON.stringify(manifeste, null, 2) + '\n');
  fs.mkdirSync(sortie, { recursive: true });
  if (notes) fs.writeFileSync(path.join(sortie, 'NOTES.md'), texteNotes([manifeste], notesDeVersion(manifeste.version, racine)) + '\n');
  return { dossier, manifeste };
}

/** Écrit les deux profils et des notes communes. @returns {{ dossier: string, manifeste: object }[]} */
function ecrireTous({ sortie, source = SOURCE, racine = RACINE, commit = null } = {}) {
  const ecrits = PROFILS.map((profil) => ecrire({ sortie, source, racine, commit, profil, notes: false }));
  const manifestes = ecrits.map((x) => x.manifeste);
  fs.writeFileSync(path.join(sortie, 'NOTES.md'), texteNotes(manifestes, notesDeVersion(manifestes[0].version, racine)) + '\n');
  return ecrits;
}

if (require.main === module) {
  const arg = (nom, defaut) => { const i = process.argv.indexOf(nom); return i > 0 ? process.argv[i + 1] : defaut; };
  const sortie = path.resolve(arg('--sortie', 'dist'));
  const profil = arg('--profil', 'complet');
  const commit = process.env.GITHUB_SHA || null;
  const ecrits = profil === 'tous' ? ecrireTous({ sortie, commit }) : [ecrire({ sortie, commit, profil })];
  for (const { dossier, manifeste } of ecrits) console.log(`paquet ${manifeste.profil} ${manifeste.version} : ${manifeste.fichiers.length} fichiers, ${mo(manifeste.fichiers)} Mo -> ${dossier}`);
}

module.exports = { fichiersDuPaquet, fichiersGeneres, lireFichier, construireManifeste, notesDeVersion, texteNotes, versionContrat, ecrire, ecrireTous, EXCLUS, EXTRAS, EXTRAS_BI, PROFILS };
