#!/usr/bin/env node
'use strict';

/**
 * Engendre `shared/noyau-saisies.mjs`, la sortie ESM du noyau, depuis `shared/noyau-saisies.js`, qui reste la
 * seule source. Le kit d'appkit est en ESM, le moteur de Form Builder en scripts classiques : une source,
 * deux sorties, et un test qui échoue si la seconde n'est pas à jour.
 *
 * Conditions posées par le kit, tenues ici : ESM pur, sans import ni effet de bord à l'import ; exports
 * nommés identiques à ceux de l'enveloppe UMD ; bannière de licence d'une ligne conservée ; sortie
 * déterministe (fins de ligne LF, aucune date).
 *
 *   node projects/grist_forms/outils/generer-noyau-esm.js              écrit la sortie
 *   node projects/grist_forms/outils/generer-noyau-esm.js --verifier   échoue (code 1) si elle n'est pas à jour
 */

const fs = require('node:fs');
const path = require('node:path');

const SOURCE = path.join(__dirname, '..', 'shared', 'noyau-saisies.js');
const SORTIE = path.join(__dirname, '..', 'shared', 'noyau-saisies.mjs');

const DEBUT_FABRIQUE = "}(typeof self !== 'undefined' ? self : this, function () {\n";
const FIN_FABRIQUE = '\n}));';

/** Le contenu attendu de la sortie ESM, sans rien écrire. */
function fabriquer() {
  const brut = fs.readFileSync(SOURCE, 'utf8').replace(/\r\n/g, '\n');
  const debut = brut.indexOf(DEBUT_FABRIQUE);
  const fin = brut.lastIndexOf(FIN_FABRIQUE);
  if (debut < 0 || fin < 0 || fin < debut) throw new Error("enveloppe UMD non reconnue dans " + SOURCE);

  const licence = brut.split('\n')[0];
  if (!/Licence MIT/.test(licence)) throw new Error('la bannière de licence d\'une ligne manque en tête de ' + SOURCE);

  const corps = brut.slice(debut + DEBUT_FABRIQUE.length, fin + 1);
  const noms = Object.keys(require(SOURCE));

  return [
    licence,
    '/* Fichier GÉNÉRÉ depuis noyau-saisies.js : ne pas éditer. Régénérer avec `node projects/grist_forms/outils/generer-noyau-esm.js`. */',
    'const noyau = (function () {',
    corps + '}());',
    '',
    'export const {',
    noms.map((n) => '  ' + n).join(',\n'),
    '} = noyau;',
    ''
  ].join('\n');
}

function main(argv) {
  const attendu = fabriquer();
  if (argv.includes('--verifier')) {
    const actuel = fs.existsSync(SORTIE) ? fs.readFileSync(SORTIE, 'utf8') : null;
    if (actuel !== attendu) {
      process.stderr.write('shared/noyau-saisies.mjs n\'est pas à jour : relancer le générateur.\n');
      return 1;
    }
    return 0;
  }
  fs.writeFileSync(SORTIE, attendu, { encoding: 'utf8' });
  process.stdout.write('écrit : ' + path.relative(process.cwd(), SORTIE) + '\n');
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { fabriquer, SOURCE, SORTIE };
