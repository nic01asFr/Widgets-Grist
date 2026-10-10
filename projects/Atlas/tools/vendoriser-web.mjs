// Embarque les dépendances externes de la page d'Atlas (CDN) dans la version publiée : `published/atlas/vendor/`.
//
//   node tools/vendoriser-web.mjs                 télécharge, vérifie les empreintes connues, écrit les fichiers, les licences et le verrou
//   node tools/vendoriser-web.mjs --verifier      relit le dossier : chaque fichier du verrou existe, a la bonne taille et la bonne empreinte
//   node tools/vendoriser-web.mjs --mettre-a-jour accepte de nouvelles empreintes (version changée dans le manifeste, ou CDN modifié)
//
// Entrées : `vendor-externe.json` (versions FIGÉES, règles de réécriture de la page). Sortie : `vendor/<id>/…`, `vendor/polices/`,
// `vendor/LICENCES.txt` et `vendor/verrou-externe.json` (chemin, taille, SHA-384 de chaque fichier). Une empreinte qui change sans
// `--mettre-a-jour` est une ERREUR : un CDN qui sert autre chose qu'à la dernière exécution ne doit pas entrer sans qu'on le voie.
// La promotion (scripts/promote-atlas.js) ne réécrit la page que si le verrou est présent.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const html = require('./vendor-web-html.cjs');

const ICI = path.dirname(fileURLToPath(import.meta.url));
export const RACINE = path.resolve(ICI, '..');
export const CHEMIN_MANIFESTE = path.join(RACINE, 'vendor-externe.json');
export const DOSSIER_SORTIE = path.resolve(RACINE, '..', '..', 'published', 'atlas', 'vendor');
export const NOM_VERROU = 'verrou-externe.json';
const UA_NAVIGATEUR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Safari/537.36';

export const empreinte = (octets) => 'sha384-' + crypto.createHash('sha384').update(octets).digest('base64');
export const lireManifeste = (chemin = CHEMIN_MANIFESTE) => JSON.parse(fs.readFileSync(chemin, 'utf8'));
export { html };

/**
 * Les blocs `@font-face` d'une feuille de Google Fonts, pour les sous-ensembles demandés (la feuille annonce chacun par un commentaire
 * CSS qui le nomme : latin, latin-ext, cyrillic…). Rend { sousEnsemble, famille, style, graisse, url, plage }.
 */
export function analyserCssPolices(css, sousEnsembles = ['latin', 'latin-ext']) {
  const blocs = [];
  const re = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
  for (let m; (m = re.exec(css));) {
    const [, sous, corps] = m;
    if (!sousEnsembles.includes(sous)) continue;
    const prop = (nom) => { const x = new RegExp(nom + '\\s*:\\s*([^;]+);').exec(corps); return x ? x[1].trim() : null; };
    const url = /url\(\s*['"]?([^)'"]+)['"]?\s*\)/.exec(corps);
    if (!url) continue;
    blocs.push({ sousEnsemble: sous, famille: (prop('font-family') || '').replace(/['"]/g, ''), style: prop('font-style') || 'normal', graisse: prop('font-weight') || '400', url: url[1], plage: prop('unicode-range') });
  }
  return blocs;
}

/** Un nom de fichier lisible et stable pour un fichier de police (le même fichier sert souvent plusieurs graisses : un seul exemplaire). */
export function nomFichierPolice(url) {
  const nom = path.posix.basename(new URL(url).pathname);
  return nom.endsWith('.woff2') ? nom : nom + '.woff2';
}

async function telecharger(url, entetes = {}) {
  const r = await fetch(url, { headers: entetes });
  if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
const ecrire = (dossier, rel, octets) => { const f = path.join(dossier, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, octets); };

/** Rend le verrou calculé ; lève si une empreinte déjà connue change et que `majour` est faux. */
export async function vendoriser({ manifeste = lireManifeste(), sortie = DOSSIER_SORTIE, majour = false, journal = console.log } = {}) {
  const ancien = fs.existsSync(path.join(sortie, NOM_VERROU)) ? JSON.parse(fs.readFileSync(path.join(sortie, NOM_VERROU), 'utf8')) : { fichiers: {} };
  const verrou = { format: 'atlas-vendor-verrou/1', fichiers: {} };
  const licences = [];
  const poser = (rel, octets, origine) => {
    const e = empreinte(octets);
    const connu = ancien.fichiers[rel];
    if (connu && connu.integrite !== e && !majour) throw new Error(`${rel} : l'empreinte a changé (${connu.integrite.slice(0, 16)}… -> ${e.slice(0, 16)}…) ; relancer avec --mettre-a-jour si c'est voulu`);
    ecrire(sortie, rel, octets);
    verrou.fichiers[rel] = { taille: octets.length, integrite: e, origine };
  };
  for (const b of manifeste.bibliotheques) {
    for (const f of b.fichiers) { poser(f.vers, await telecharger(f.depuis), f.depuis); journal('  ' + f.vers); }
    licences.push({ titre: `${b.id} ${b.version} (${b.licence})`, source: b.licenceUrl, texte: (await telecharger(b.licenceUrl)).toString('utf8') });
  }
  // Polices : la feuille de Google, lue comme un navigateur récent, ramenée aux sous-ensembles utiles et à des fichiers locaux.
  const p = manifeste.polices;
  if (p) {
    const css = (await telecharger(p.css, { 'User-Agent': UA_NAVIGATEUR })).toString('utf8');
    const blocs = analyserCssPolices(css, p.sousEnsembles);
    if (!blocs.length) throw new Error('aucune police trouvée dans la feuille de Google Fonts : format changé ?');
    const vus = new Map(); let feuille = `/* Polices embarquées (licence OFL-1.1, voir ../LICENCES.txt). Générée par tools/vendoriser-web.mjs : ne pas modifier. */\n`;
    for (const x of blocs) {
      let nom = vus.get(x.url);
      if (!nom) { nom = 'polices/' + nomFichierPolice(x.url); vus.set(x.url, nom); poser(nom, await telecharger(x.url), x.url); journal('  ' + nom); }
      feuille += `@font-face { font-family: '${x.famille}'; font-style: ${x.style}; font-weight: ${x.graisse}; font-display: swap; src: url(${path.posix.basename(nom)}) format('woff2');${x.plage ? ` unicode-range: ${x.plage};` : ''} }\n`;
    }
    poser('polices/polices.css', Buffer.from(feuille, 'utf8'), p.css);
    for (const l of p.licences || []) licences.push({ titre: `${l.famille} (${p.licence})`, source: l.url, texte: (await telecharger(l.url)).toString('utf8') });
  }
  const texteLicences = 'Licences des dépendances embarquées dans ce dossier (vendor/)\n' + '='.repeat(64) + '\n\n'
    + licences.map((l) => `${l.titre}\nSource : ${l.source}\n\n${l.texte.trim()}\n`).join('\n' + '-'.repeat(64) + '\n\n');
  ecrire(sortie, 'LICENCES.txt', Buffer.from(texteLicences, 'utf8'));
  fs.writeFileSync(path.join(sortie, NOM_VERROU), JSON.stringify(verrou, null, 2) + '\n');
  return verrou;
}

/** Relit le dossier : chaque fichier du verrou doit exister, avoir la bonne taille et la bonne empreinte. @returns {string[]} les écarts */
export function verifier({ sortie = DOSSIER_SORTIE } = {}) {
  const chemin = path.join(sortie, NOM_VERROU);
  if (!fs.existsSync(chemin)) return ['verrou absent : ' + chemin];
  const verrou = JSON.parse(fs.readFileSync(chemin, 'utf8')); const ecarts = [];
  for (const [rel, v] of Object.entries(verrou.fichiers)) {
    const f = path.join(sortie, ...rel.split('/'));
    if (!fs.existsSync(f)) { ecarts.push('absent : ' + rel); continue; }
    const octets = fs.readFileSync(f);
    if (octets.length !== v.taille) { ecarts.push(`taille : ${rel} (${octets.length} au lieu de ${v.taille})`); continue; }
    if (empreinte(octets) !== v.integrite) ecarts.push('empreinte : ' + rel);
  }
  if (!fs.existsSync(path.join(sortie, 'LICENCES.txt'))) ecarts.push('LICENCES.txt absent');
  return ecarts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  try {
    if (a.includes('--verifier')) {
      const e = verifier();
      if (e.length) { for (const x of e) console.error('ECART ' + x); process.exit(1); }
      console.log('Dépendances embarquées conformes au verrou.');
    } else {
      const v = await vendoriser({ majour: a.includes('--mettre-a-jour') });
      const total = Object.values(v.fichiers).reduce((s, f) => s + f.taille, 0);
      console.log(`${Object.keys(v.fichiers).length} fichiers, ${(total / 1048576).toFixed(2)} Mo, écrits dans ${DOSSIER_SORTIE}`);
    }
  } catch (e) { console.error(e.message || e); process.exit(1); }
}
