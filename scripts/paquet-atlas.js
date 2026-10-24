/**
 * Le paquet WEB d'Atlas, figé : ce qu'un client en production copie chez lui pour ne plus suivre la dernière version de l'adresse publique.
 *
 * Le paquet est `published/atlas/` sans ce qui ne sert pas à l'exploiter (`demos/`, `vitrine.json`, images de la vitrine) : la page maigre `bi.html`, la page de l'application `index.html`
 * et `app.js`, `lib/`, `vendor/` (MapLibre, three.js, polices : aucun CDN), `models/` et `objets/`. Il porte `PAQUET.json` : la version d'Atlas, celle du contrat, le client des hôtes avec son
 * empreinte, et l'empreinte SHA-256 de chaque fichier, pour qu'une copie se vérifie.
 *
 *   node scripts/paquet-atlas.js --sortie dist            # écrit dist/atlas-web-<version>/ (le dossier à zipper) et dist/NOTES.md
 *
 * Le workflow `.github/workflows/paquet-atlas.yml` s'en sert à chaque étiquette `atlas-web-v<version>` ; ce module est pur côté logique (testé : `scripts/paquet-atlas.test.js`).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RACINE = path.join(__dirname, '..');
const SOURCE = path.join(RACINE, 'published', 'atlas');
/** Ce qui ne part pas : la vitrine, ses images, les démonstrations. */
const EXCLUS = [/^demos\//, /^vitrine\.json$/, /\.(jpg|jpeg|png|webp)$/i, /^essai/];
const CLIENT = 'lib/bi/client-hote.js';

const sha = (algo, octets, base64 = false) => crypto.createHash(algo).update(octets).digest(base64 ? 'base64' : 'hex');

function lister(dossier, base = dossier) {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dossier, e.name);
    return e.isDirectory() ? lister(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  }).sort();
}

/** Les fichiers du paquet (chemins relatifs, triés). */
function fichiersDuPaquet(source = SOURCE) {
  return lister(source).filter((f) => !EXCLUS.some((re) => re.test(f)));
}

/** Le contrat du composant, lu dans son document (`| Contrat du composant carte BI | 0.3 ... |`). */
function versionContrat(racine = RACINE) {
  const t = fs.readFileSync(path.join(racine, 'projects', 'Atlas', 'CHANGELOG.md'), 'utf8');
  const m = /Contrat du composant carte BI \| (\d+\.\d+)/.exec(t);
  return m ? m[1] : null;
}

/** `PAQUET.json` : le contenu, pour une version et un commit donnés. */
function construireManifeste({ source = SOURCE, racine = RACINE, commit = null, genere = new Date().toISOString() } = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  const fichiers = fichiersDuPaquet(source).map((f) => { const o = fs.readFileSync(path.join(source, f)); return { chemin: f, octets: o.length, sha256: sha('sha256', o) }; });
  const client = fs.readFileSync(path.join(source, CLIENT));
  const entree = /VERSION_CLIENT\s*=\s*(\d+)/.exec(client.toString('utf8'));
  return {
    nom: 'atlas-web', version: pkg.version, contrat: versionContrat(racine), commit, genere,
    client: { fichier: CLIENT, versionClient: entree ? Number(entree[1]) : null, empreinte: 'sha384-' + sha('sha384', client, true), octets: client.length },
    fichiers,
    note: 'Paquet web d\'Atlas : la carte nue (bi.html), l\'application (index.html) et leurs dépendances, sans CDN. Vérifier une copie : SHA-256 de chaque fichier ci-dessus.',
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

/** Écrit le dossier du paquet et les notes de la release. @returns {{ dossier: string, manifeste: object }} */
function ecrire({ sortie, source = SOURCE, racine = RACINE, commit = null } = {}) {
  const manifeste = construireManifeste({ source, racine, commit });
  const dossier = path.join(sortie, `atlas-web-${manifeste.version}`);
  fs.rmSync(dossier, { recursive: true, force: true });
  for (const f of manifeste.fichiers.map((x) => x.chemin)) { fs.mkdirSync(path.dirname(path.join(dossier, f)), { recursive: true }); fs.copyFileSync(path.join(source, f), path.join(dossier, f)); }
  fs.writeFileSync(path.join(dossier, 'PAQUET.json'), JSON.stringify(manifeste, null, 2) + '\n');
  const journal = notesDeVersion(manifeste.version, racine);
  const notes = [
    `Paquet web d'Atlas ${manifeste.version}, figé : à copier chez soi pour ne pas suivre la dernière version de l'adresse publique.`, '',
    `- Contrat du composant : ${manifeste.contrat} ; client des hôtes : \`${manifeste.client.fichier}\`, version ${manifeste.client.versionClient}, empreinte \`${manifeste.client.empreinte}\`.`,
    `- Vérification : \`PAQUET.json\` donne l'empreinte SHA-256 de chacun des ${manifeste.fichiers.length} fichiers ; \`SHA256SUMS\` celle de l'archive.`,
    "- Servir le dossier tel quel (http ou https) ; l'hôte déclare son origine par `hote=`. MapLibre, three.js et les polices sont dans le paquet (aucun CDN) ; le fond de carte (OpenFreeMap, IGN) reste un service tiers, sauf avec `base=\"aucune\"` ; l'application, en widget Grist, charge en plus l'API de plugin de Grist.", '',
    journal ? '## Ce que contient cette version\n\n' + journal.replace(/^## [^\n]*\n+/, '') : '',
  ].join('\n');
  fs.mkdirSync(sortie, { recursive: true });
  fs.writeFileSync(path.join(sortie, 'NOTES.md'), notes + '\n');
  return { dossier, manifeste };
}

if (require.main === module) {
  const i = process.argv.indexOf('--sortie');
  const sortie = path.resolve(i > 0 ? process.argv[i + 1] : 'dist');
  const { dossier, manifeste } = ecrire({ sortie, commit: process.env.GITHUB_SHA || null });
  console.log(`paquet ${manifeste.version} : ${manifeste.fichiers.length} fichiers, ${(manifeste.fichiers.reduce((n, f) => n + f.octets, 0) / 1048576).toFixed(1)} Mo -> ${dossier}`);
}

module.exports = { fichiersDuPaquet, construireManifeste, notesDeVersion, versionContrat, ecrire, EXCLUS };
