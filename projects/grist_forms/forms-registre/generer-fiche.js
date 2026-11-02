#!/usr/bin/env node
'use strict';

/**
 * Écrit `fiche-capacites.json` : la fiche de capacités de Form Builder, déduite du registre (jamais saisie à la main).
 * Un test refuse que le fichier versionné diffère de ce que le registre rend : on relance ce script après toute modification d'une commande.
 *
 *   node projects/grist_forms/forms-registre/generer-fiche.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { monter } = require('./index.js');

const CHEMIN = path.join(__dirname, 'fiche-capacites.json');

function contenu() {
  return JSON.stringify(monter().fiche(), null, 2) + '\n';
}

if (require.main === module) {
  fs.writeFileSync(CHEMIN, contenu());
  process.stdout.write('écrit : ' + path.relative(process.cwd(), CHEMIN) + '\n');
}

module.exports = { CHEMIN, contenu };
