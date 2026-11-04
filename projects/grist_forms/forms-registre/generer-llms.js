#!/usr/bin/env node
'use strict';

/**
 * Écrit `llms.txt` : la présentation de Form Builder pour un agent qui lit du texte (convention llms.txt), déduite de la fiche et du registre.
 * Jamais saisie à la main : un test refuse un fichier qui diffère de ce que le registre rend.
 *
 *   node projects/grist_forms/forms-registre/generer-llms.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { monter } = require('./index.js');

const CHEMIN = path.join(__dirname, 'llms.txt');

function contenu() {
  const registre = monter();
  const fiche = registre.fiche();
  const l = [];
  l.push('# ' + fiche.presentation.titre);
  l.push('');
  l.push('> ' + fiche.presentation.resume);
  l.push('');
  l.push('Version ' + fiche.version + '. Fiche de capacités : fiche-capacites.json (contrat ' + fiche.contrat + ').');
  l.push('');
  l.push('## Comment appeler ces commandes');
  l.push('');
  l.push('- Serveur MCP : `node mcp.js` (stdio, lecture seule).');
  l.push('- Ligne de commande : `node cli.js <commande> <entree.json>`, `--liste`, `--decrire <commande>`.');
  l.push('- Page WebMCP : webmcp.html (navigator.modelContext), mêmes commandes, plus forms_rendre et forms_recolter qui n’existent que dans la page.');
  l.push('');
  l.push('## Commandes');
  l.push('');
  for (const c of registre.commandes) l.push('- `' + c.nom + '` (' + c.verbe + ') : ' + c.description);
  l.push('');
  l.push('## Ce qui n’est pas couvert');
  l.push('');
  l.push(fiche.non_couverts.length ? 'Verbes sans commande : ' + fiche.non_couverts.join(', ') + '.' : 'Aucun verbe sans commande.');
  l.push('');
  l.push('## Limites');
  l.push('');
  for (const x of fiche.limites) l.push('- ' + x);
  l.push('');
  return l.join('\n');
}

if (require.main === module) {
  fs.writeFileSync(CHEMIN, contenu());
  process.stdout.write('écrit : ' + path.relative(process.cwd(), CHEMIN) + '\n');
}

module.exports = { CHEMIN, contenu };
