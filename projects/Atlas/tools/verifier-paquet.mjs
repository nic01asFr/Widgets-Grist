// Vérifie un dossier de paquet hors ligne, SANS rien importer d'Atlas (script autonome : l'hôte peut le copier et l'exécuter).
//   node verifier-paquet.mjs <dossier>
// Contrôles : manifeste lisible, chemins relatifs sans « .. » ni lettre de lecteur ni « \ », fichier présent, taille exacte
// (une copie tronquée se voit avant le calcul), empreinte SHA-384, aucun fichier non listé, cache.txt cohérent.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const CHEMIN_VALIDE = (c) => typeof c === 'string' && c.length > 0 && !c.startsWith('/') && !c.includes('\\') && !/^[A-Za-z]:/.test(c) && !c.split('/').some((s) => s === '..' || s === '.' || s === '');

function lister(dossier, base = '') {
  const sortie = [];
  for (const e of fs.readdirSync(path.join(dossier, base), { withFileTypes: true })) {
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) sortie.push(...lister(dossier, rel)); else sortie.push(rel);
  }
  return sortie;
}

/** @returns {{erreurs:string[], fichiers:number, manifeste:object|null}} */
export function verifierPaquet(dossier) {
  const erreurs = []; let manifeste = null;
  const racine = path.resolve(dossier);
  try { manifeste = JSON.parse(fs.readFileSync(path.join(racine, 'manifeste.json'), 'utf8')); }
  catch (e) { return { erreurs: ['manifeste illisible : ' + (e && e.message)], fichiers: 0, manifeste: null }; }
  if (!Array.isArray(manifeste.fichiers)) return { erreurs: ['manifeste sans liste de fichiers'], fichiers: 0, manifeste };
  const listes = new Set();
  for (const x of manifeste.fichiers) {
    if (!CHEMIN_VALIDE(x.chemin)) { erreurs.push('chemin invalide : ' + JSON.stringify(x.chemin)); continue; }
    listes.add(x.chemin);
    const cible = path.join(racine, ...x.chemin.split('/'));
    if (!cible.startsWith(racine + path.sep)) { erreurs.push('chemin hors du dossier : ' + x.chemin); continue; }
    if (!fs.existsSync(cible)) { erreurs.push('fichier absent : ' + x.chemin); continue; }
    const octets = fs.readFileSync(cible);
    if (octets.length !== x.taille) { erreurs.push('taille différente pour ' + x.chemin + ' : ' + octets.length + ' octets au lieu de ' + x.taille + ' (copie tronquée ?)'); continue; }
    const attendu = 'sha384-' + crypto.createHash('sha384').update(octets).digest('base64');
    if (attendu !== x.integrite) erreurs.push('empreinte différente pour ' + x.chemin);
  }
  for (const rel of lister(racine)) if (!listes.has(rel) && rel !== 'manifeste.json' && rel !== 'cache.txt') erreurs.push('fichier non listé au manifeste : ' + rel);
  try {
    const cache = fs.readFileSync(path.join(racine, 'cache.txt'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    for (const c of cache) if (!listes.has(c)) erreurs.push('cache.txt cite un fichier absent du manifeste : ' + c);
  } catch { erreurs.push('cache.txt absent'); }
  return { erreurs, fichiers: manifeste.fichiers.length, manifeste };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dossier = process.argv[2];
  if (!dossier) { console.error('usage : verifier-paquet.mjs <dossier>'); process.exit(2); }
  const v = verifierPaquet(dossier);
  if (v.erreurs.length) { for (const e of v.erreurs) console.error('ERREUR ' + e); process.exit(1); }
  console.log('Paquet conforme : ' + v.fichiers + ' fichiers, version ' + v.manifeste.version_paquet + ', contrat ' + v.manifeste.version_contrat + '.');
}
