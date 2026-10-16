#!/usr/bin/env node
/**
 * Plancher de couverture de la surface publique d'Atlas.
 *
 * Lance les tests avec la couverture de Node (`--experimental-test-coverage`), lit le rapport lcov et vérifie des PLANCHERS : la couverture
 * ne peut plus reculer sans qu'on le voie. Ce ne sont pas des objectifs : ce sont l'état mesuré le 15/10/2026 moins une marge.
 * `app_v7.js` (18 000 lignes) n'est PAS couvert par les tests Node (il ne s'y charge pas) : il n'a pas de plancher ici ; la garde des
 * références (`check:atlas`) et les parcours en navigateur le surveillent.
 *
 *     node projects/Atlas/tools/couverture.mjs           # lance les tests, vérifie les planchers
 *     node projects/Atlas/tools/couverture.mjs rapport.lcov   # vérifie un rapport déjà produit
 *
 * Pour RELEVER un plancher (la couverture a progressé) : modifier PLANCHERS ci-dessous dans le commit qui l'a fait progresser.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..', '..', '..');

/** Planchers de lignes couvertes, en %. `groupe` : tous les fichiers du dossier ensemble ; `fichier` : chacun séparément. */
export const PLANCHERS = [
  { nom: 'lib/bi (ensemble)', test: (f) => /\/lib\/bi\//.test(f), groupe: 96 },          // mesuré 98,5
  { nom: 'lib/charte (ensemble)', test: (f) => /\/lib\/charte\//.test(f), groupe: 98 },   // mesuré 100
  { nom: 'lib/trafic* (ensemble)', test: (f) => /\/lib\/trafic/.test(f), groupe: 73 },          // mesuré 76,1 (moteur de simulation : zones de conflit et feux couverts par des essais de comportement, pas ligne à ligne)
  { nom: 'lib (ensemble)', test: (f) => /\/lib\//.test(f), groupe: 82 },                   // mesuré 84,1
  { nom: 'lib/bi (chaque fichier)', test: (f) => /\/lib\/bi\//.test(f), fichier: 85 },
  { nom: 'lib/charte (chaque fichier)', test: (f) => /\/lib\/charte\//.test(f), fichier: 95 },
];

/** Les enregistrements lcov : { f, LF, LH } hors tests. */
export function lire(lcov) {
  const sortie = [];
  for (const r of lcov.split('end_of_record')) {
    const sf = /^SF:(.*)$/m.exec(r);
    if (!sf) continue;
    const n = (k) => { const m = new RegExp('^' + k + ':([0-9]+)', 'm').exec(r); return m ? +m[1] : 0; };
    const f = sf[1].split(String.fromCharCode(92)).join('/').trim();
    if (/\/tests\//.test(f) || !/projects\/Atlas\//.test(f)) continue;
    sortie.push({ f, LF: n('LF'), LH: n('LH') });
  }
  return sortie;
}

/** Les manquements aux planchers : [] quand tout est tenu. */
export function verifier(fichiers, planchers = PLANCHERS) {
  const manques = [];
  const pct = (h, f) => (f ? (100 * h / f) : 100);
  for (const p of planchers) {
    const lot = fichiers.filter((x) => p.test(x.f));
    if (!lot.length) { manques.push(`${p.nom} : aucun fichier dans le rapport`); continue; }
    if (p.groupe != null) {
      const LH = lot.reduce((a, x) => a + x.LH, 0), LF = lot.reduce((a, x) => a + x.LF, 0), v = pct(LH, LF);
      if (v < p.groupe) manques.push(`${p.nom} : ${v.toFixed(1)} % de lignes, plancher ${p.groupe} %`);
    }
    if (p.fichier != null) {
      for (const x of lot) { const v = pct(x.LH, x.LF); if (v < p.fichier) manques.push(`${p.nom} : ${x.f.slice(x.f.indexOf('projects/Atlas/'))} à ${v.toFixed(1)} %, plancher ${p.fichier} %`); }
    }
  }
  return manques;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let lcov;
  if (process.argv[2]) lcov = readFileSync(process.argv[2], 'utf8');
  else {
    const dossier = mkdtempSync(join(tmpdir(), 'couverture-'));
    const sortie = join(dossier, 'couverture.lcov');
    const tests = readdirSync(join(RACINE, 'projects', 'Atlas', 'tests')).filter((f) => f.endsWith('.test.js')).map((f) => join('projects', 'Atlas', 'tests', f));
    const r = spawnSync(process.execPath, ['--test', '--experimental-test-coverage', '--test-reporter=lcov', `--test-reporter-destination=${sortie}`, ...tests],
      { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 28 });
    lcov = readFileSyncSafe(sortie);
    if (!lcov) { console.error(r.stderr || r.stdout || 'pas de rapport de couverture'); process.exit(2); }
    if (r.status !== 0) { console.error('des tests échouent : la couverture n’est pas jugée'); process.exit(2); }
    rmSync(dossier, { recursive: true, force: true });
  }
  const manques = verifier(lire(lcov));
  if (manques.length) { console.error('Couverture sous le plancher :\n  ' + manques.join('\n  ')); process.exit(1); }
  console.log('couverture : tous les planchers sont tenus');
}

function readFileSyncSafe(p) { try { return readFileSync(p, 'utf8'); } catch { return null; } }
