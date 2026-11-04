#!/usr/bin/env node
'use strict';

/**
 * Écrit `fiche-capacites.json` (la fiche de capacités de Form Builder) et `commandes.json` (les commandes décrites une à une, avec leurs schémas et leurs exemples,
 * entrée ET sortie : ce que la vitrine générée montre). Les deux sont déduits du registre, jamais saisis à la main.
 * Un test refuse que les fichiers versionnés diffèrent de ce que le registre rend : on relance ce script après toute modification d'une commande.
 *
 *   node projects/grist_forms/forms-registre/generer-fiche.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { monter } = require('./index.js');

const CHEMIN = path.join(__dirname, 'fiche-capacites.json');
const CHEMIN_COMMANDES = path.join(__dirname, 'commandes.json');

function contenu() {
  return JSON.stringify(monter().fiche(), null, 2) + '\n';
}

/** L'identité du fichier (contrat, widget, version), puis les commandes : le même vocabulaire que la fiche, rien d'autre. */
function contenuCommandes() {
  const registre = monter();
  const fiche = registre.fiche();
  return JSON.stringify({ contrat: 'commandes-0.1', widget: fiche.widget, version: fiche.version, commandes: registre.lister() }, null, 2) + '\n';
}

if (require.main === module) {
  fs.writeFileSync(CHEMIN, contenu());
  fs.writeFileSync(CHEMIN_COMMANDES, contenuCommandes());
  process.stdout.write('écrit : ' + path.relative(process.cwd(), CHEMIN) + ', ' + path.relative(process.cwd(), CHEMIN_COMMANDES) + '\n');
}

module.exports = { CHEMIN, CHEMIN_COMMANDES, contenu, contenuCommandes };
