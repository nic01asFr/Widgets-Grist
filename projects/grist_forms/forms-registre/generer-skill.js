#!/usr/bin/env node
'use strict';

/**
 * Écrit `SKILL.md` : le skill de Form Builder, GÉNÉRÉ depuis la fiche de capacités et commandes.json (jamais saisi à la main).
 * Le gabarit est celui du dépôt, commun à tous les widgets (`generer-skill-commun.js`, copie identique de `scripts/generer-skill.js` : un widget
 * se publie seul et ne peut pas requérir hors de son dossier, comme `shared/valider-schema.js`). Un test refuse un SKILL.md périmé.
 *
 *   node projects/grist_forms/forms-registre/generer-skill.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { contenuSkill } = require('./generer-skill-commun.js');

const CHEMIN = path.join(__dirname, 'SKILL.md');

function lire(nom) { return JSON.parse(fs.readFileSync(path.join(__dirname, nom), 'utf8')); }

function contenu() {
  return contenuSkill({ fiche: lire('fiche-capacites.json'), commandes: lire('commandes.json') });
}

if (require.main === module) {
  fs.writeFileSync(CHEMIN, contenu());
  process.stdout.write('écrit : ' + path.relative(process.cwd(), CHEMIN) + '\n');
}

module.exports = { CHEMIN, contenu };
