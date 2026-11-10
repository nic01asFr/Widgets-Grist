// Compare des captures (tests/harness/_sortie/*.json) aux golden suivis
// (tests/golden/parse/*.json et tests/golden/import/*.json).
//
// Usage :
//   node tests/harness/comparer.mjs                  compare toutes les captures presentes
//   node tests/harness/comparer.mjs <nom> [<nom>..]  compare certaines captures (sans .json)
//   node tests/harness/comparer.mjs --promouvoir     copie les captures dans tests/golden/
//                                                    (a n'utiliser que pour un changement voulu)
//   node tests/harness/comparer.mjs --max=50         limite le nombre d'ecarts affiches par fichier
//
// Code retour : 0 = aucun ecart ; 1 = ecart ; 2 = capture ou golden manquant.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'tests', 'harness', '_sortie');
const GOLDEN = path.join(RACINE, 'tests', 'golden');

const args = process.argv.slice(2);
const promouvoir = args.includes('--promouvoir');
const maxArg = args.find((a) => a.startsWith('--max='));
const MAX = maxArg ? Number(maxArg.slice(6)) : 40;
const noms = args.filter((a) => !a.startsWith('--'));

// Classe un nom de capture vers son sous-dossier golden. Les ".brut" sont des
// entrees de rejeu, jamais des golden.
function destination(nom) {
  if (nom.endsWith('.brut')) return null;
  if (nom.startsWith('import-')) return path.join(GOLDEN, 'import', nom + '.json');
  return path.join(GOLDEN, 'parse', nom + '.json');
}

function ecarts(a, b, chemin, sortie) {
  if (sortie.length > MAX * 4) return;
  if (a === b) return;
  const ta = Array.isArray(a) ? 'tableau' : a === null ? 'null' : typeof a;
  const tb = Array.isArray(b) ? 'tableau' : b === null ? 'null' : typeof b;
  if (ta !== tb) { sortie.push({ chemin, golden: a, capture: b, nature: `type ${ta} -> ${tb}` }); return; }
  if (ta === 'tableau') {
    if (a.length !== b.length) sortie.push({ chemin: chemin + '.length', golden: a.length, capture: b.length, nature: 'longueur' });
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) ecarts(a[i], b[i], `${chemin}[${i}]`, sortie);
    return;
  }
  if (ta === 'object') {
    const cles = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of [...cles].sort()) {
      if (!(k in a)) sortie.push({ chemin: `${chemin}.${k}`, golden: undefined, capture: b[k], nature: 'cle ajoutee' });
      else if (!(k in b)) sortie.push({ chemin: `${chemin}.${k}`, golden: a[k], capture: undefined, nature: 'cle disparue' });
      else ecarts(a[k], b[k], `${chemin}.${k}`, sortie);
    }
    return;
  }
  sortie.push({ chemin, golden: a, capture: b, nature: 'valeur' });
}

function court(v) {
  if (v === undefined) return '(absent)';
  const s = JSON.stringify(v);
  return s && s.length > 160 ? s.slice(0, 157) + '...' : s;
}

if (!fs.existsSync(SORTIE)) {
  console.error('Aucune capture : ' + SORTIE + ' absent. Lancer la capture (voir README.md).');
  process.exit(2);
}

let captures = fs.readdirSync(SORTIE).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
if (noms.length) captures = captures.filter((c) => noms.includes(c));
captures = captures.filter((c) => destination(c)).sort();
if (!captures.length) { console.error('Aucune capture a comparer.'); process.exit(2); }

if (promouvoir) {
  for (const c of captures) {
    const dest = destination(c);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(SORTIE, c + '.json'), dest);
    console.log('promu : ' + path.relative(RACINE, dest));
  }
  process.exit(0);
}

let code = 0, ok = 0;
for (const c of captures) {
  const dest = destination(c);
  if (!fs.existsSync(dest)) { console.log(`MANQUANT  ${c} : pas de golden (${path.relative(RACINE, dest)})`); code = Math.max(code, 2); continue; }
  const cap = JSON.parse(fs.readFileSync(path.join(SORTIE, c + '.json'), 'utf8'));
  const gol = JSON.parse(fs.readFileSync(dest, 'utf8'));
  const liste = [];
  ecarts(gol, cap, '$', liste);
  if (!liste.length) { console.log(`IDENTIQUE ${c}`); ok++; continue; }
  code = 1;
  console.log(`ECART     ${c} : ${liste.length}${liste.length > MAX * 4 ? '+' : ''} difference(s)`);
  for (const e of liste.slice(0, MAX)) {
    console.log(`  ${e.chemin}  [${e.nature}]\n    golden : ${court(e.golden)}\n    capture: ${court(e.capture)}`);
  }
  if (liste.length > MAX) console.log(`  ... ${liste.length - MAX} autre(s) (augmenter avec --max=N)`);
}
console.log(`\n${ok}/${captures.length} identique(s)` + (code ? ' -- ECART' : ''));
process.exit(code);
