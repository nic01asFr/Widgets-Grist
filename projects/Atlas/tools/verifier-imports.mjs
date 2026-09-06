#!/usr/bin/env node
/**
 * Vérifie que chaque nom importé par `app_v7.js` est bien exporté.
 *
 * ## Pourquoi cet outil existe
 *
 * `node --check app_v7.js` **ne suffit pas** : il a rendu 0 sur un fichier que
 * le navigateur refusait de charger. Et il ne voit de toute façon rien des
 * imports — un `import { xyz }` d'un nom qui n'existe plus est une erreur de
 * *liaison*, levée au chargement du module, donc invisible à l'analyse
 * syntaxique.
 *
 * Le symptôme, lui, est spectaculaire et muet : le widget affiche son cadre,
 * « Nouveau projet », une carte vide, et rien dans la console de la page
 * hôte — parce que l'erreur est dans l'iframe. On croit à une régression
 * fonctionnelle là où il n'y a qu'un nom mal orthographié.
 *
 *     node tools/verifier-imports.mjs
 *
 * Sort en 1 dès qu'un nom manque, pour servir de garde avant de recharger.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Les noms qu'un module ES exporte, sous les formes que ce dépôt emploie. */
function exportsDe(source) {
  const noms = new Set();
  // export function x / export async function x / export const x / export class x
  for (const m of source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) {
    noms.add(m[1]);
  }
  // export { a, b as c }
  for (const m of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const brut of m[1].split(',')) {
      const parts = brut.trim().split(/\s+as\s+/);
      const nom = (parts[1] || parts[0] || '').trim();
      if (nom) noms.add(nom);
    }
  }
  return noms;
}

/** Les noms qu'un fichier importe, par module local. */
function importsDe(source) {
  const out = [];
  for (const m of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const chemin = m[2].split('?')[0];
    if (!chemin.startsWith('.')) continue;
    const noms = m[1]
      .split(',')
      .map((x) => x.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    out.push({ chemin, noms });
  }
  return out;
}

/**
 * Un nom importé deux fois est une liaison en double — SyntaxError au
 * chargement, et le même symptôme muet. C'est exactement la faute qui a motivé
 * cet outil, alors il la cherche aussi.
 */
function doublons(source) {
  const vus = new Set();
  const doubles = [];
  for (const { noms } of importsDe(source)) {
    for (const nom of noms) {
      if (vus.has(nom)) doubles.push(nom);
      vus.add(nom);
    }
  }
  return doubles;
}

const cibles = process.argv.slice(2);
const fichiers = cibles.length ? cibles : ['app_v7.js'];
let manques = 0;

for (const fichier of fichiers) {
  const chemin = resolve(RACINE, fichier);
  const source = readFileSync(chemin, 'utf8');
  for (const nom of doublons(source)) {
    console.error(`  importé deux fois  ${nom}  (dans ${fichier})`);
    manques++;
  }
  for (const { chemin: rel, noms } of importsDe(source)) {
    const cible = resolve(dirname(chemin), rel);
    let exportes;
    try {
      exportes = exportsDe(readFileSync(cible, 'utf8'));
    } catch (_) {
      console.error(`  fichier absent  ${rel}  (importé par ${fichier})`);
      manques++;
      continue;
    }
    for (const nom of noms) {
      if (!exportes.has(nom)) {
        console.error(`  n'est pas exporté  ${nom}  <-  ${rel}  (importé par ${fichier})`);
        manques++;
      }
    }
  }
}

if (manques) {
  console.error(`\n${manques} import(s) sans export. Le module ne se chargera pas.`);
  process.exit(1);
}
console.log(`imports vérifiés — ${fichiers.join(', ')} : tout est exporté.`);
