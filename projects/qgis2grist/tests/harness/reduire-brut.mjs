// Reduit une capture brute d'import (tests/harness/_sortie/import-<scenario>.brut.json)
// a un jeu d'actions assez petit pour etre colle dans evaluate_script (rejeu en
// Grist reel) : toutes les AddTable, mais seulement les K premieres lignes du
// premier BulkAddRecord de chaque table ; les chaines tres longues sont
// remplacees par '{}' (colonnes JSON) ou tronquees.
//
// Usage : node tests/harness/reduire-brut.mjs <scenario> [K=3] > reduit.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const scenario = process.argv[2];
const K = Number(process.argv[3] || 3);
if (!scenario) { console.error('usage : reduire-brut.mjs <scenario> [K]'); process.exit(2); }

const brut = JSON.parse(fs.readFileSync(path.join(RACINE, 'tests', 'harness', '_sortie', `import-${scenario}.brut.json`), 'utf8'));
const dejaVu = new Set();
const appels = [];
for (const actions of brut.appels) {
  const sortie = [];
  for (const a of actions) {
    if (a[0] === 'AddTable') { sortie.push(a); continue; }
    if (a[0] === 'BulkAddRecord') {
      if (dejaVu.has(a[1])) continue;
      dejaVu.add(a[1]);
      const n = Math.min(K, a[2].length);
      const cols = {};
      for (const [c, vals] of Object.entries(a[3])) {
        cols[c] = vals.slice(0, n).map((v) => {
          if (typeof v === 'string' && v.length > 1500) return v.trim().startsWith('{') ? '{}' : v.slice(0, 1500);
          // Ref : ne garder que des cibles presentes dans l'echantillon
          return v;
        });
      }
      sortie.push(['BulkAddRecord', a[1], a[2].slice(0, n), cols]);
      continue;
    }
    // BulkUpdateRecord / autres : ignores dans la version reduite
  }
  if (sortie.length) appels.push(sortie);
}
process.stdout.write(JSON.stringify({ scenario, reduit: true, K, appels }));
