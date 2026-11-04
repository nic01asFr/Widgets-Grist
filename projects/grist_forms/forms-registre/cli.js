#!/usr/bin/env node
'use strict';

/**
 * Les commandes de Form Builder en ligne de commande : les mêmes que le registre, avec un code de sortie exploitable.
 *
 *   node cli.js --liste                       les commandes, avec leur verbe
 *   node cli.js --decrire forms_synthese      une commande : description, schémas, exemples
 *   node cli.js forms_valider_condition entree.json
 *   cat entree.json | node cli.js forms_valider_condition -
 *
 * Sortie : le JSON de la commande sur la sortie standard. Codes : 0 réussi, 1 refus de la commande (entrée invalide, commande inconnue,
 * échec du noyau), 2 usage. Rien n'est écrit : le CLI lit une entrée et imprime un résultat.
 */

const fs = require('node:fs');
const { monter } = require('./index.js');

function usage(sortie) {
  sortie.write('Usage : cli.js --liste | --decrire <commande> | <commande> <entree.json | ->\n');
}

function lireEntree(source) {
  const brut = source === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(source, 'utf8');
  return JSON.parse(brut);
}

function main(argv, sortie, erreur) {
  const registre = monter();
  const [a, b] = argv;
  if (!a) { usage(erreur); return 2; }
  if (a === '--liste') {
    registre.commandes.forEach((c) => sortie.write(c.verbe.padEnd(14) + c.nom + '\n'));
    return 0;
  }
  if (a === '--decrire') {
    const d = b && registre.decrire(b);
    if (!d) { erreur.write('Commande inconnue : ' + b + '\n'); return 1; }
    sortie.write(JSON.stringify(d, null, 2) + '\n');
    return 0;
  }
  let entree = {};
  if (b) {
    try { entree = lireEntree(b); } catch (e) { erreur.write('Entrée illisible : ' + e.message + '\n'); return 2; }
  }
  const r = registre.appeler(a, entree);
  if (!r.ok) { erreur.write(JSON.stringify(r.erreur, null, 2) + '\n'); return 1; }
  sortie.write(JSON.stringify(r.sortie, null, 2) + '\n');
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2), process.stdout, process.stderr);

module.exports = { main };
