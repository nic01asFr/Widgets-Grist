'use strict';

/**
 * Le registre de Form Builder, monté pour Node : les modules du noyau (`shared/`), le validateur de schéma du dépôt, les contrats déclarés
 * avec leurs empreintes calculées sur les fichiers (une empreinte ne se recopie pas, elle se mesure).
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const SHARED = path.join(RACINE, 'shared');
const { valider } = require(path.join(RACINE, '..', '..', 'scripts', 'valider-schema.js'));
const { creer } = require('./registre.js');

const empreinte = (contenu) => 'sha256:' + crypto.createHash('sha256').update(contenu).digest('hex').slice(0, 16);

function versionDuWidget() {
  const pkg = path.join(RACINE, '..', '..', 'published', 'grist_forms', 'package.json');
  return JSON.parse(fs.readFileSync(pkg, 'utf8')).version;
}

/** ThemeDef 1.0 n'est pas encore au catalogue : il se déclare par l'empreinte de la dérivation figée qu'on rejoue (en-tête de derivation-valeurs.js). */
function empreinteThemeDef() {
  const entete = fs.readFileSync(path.join(SHARED, 'derivation-valeurs.js'), 'utf8');
  const m = /source sha256 ([0-9a-f]{64})/.exec(entete);
  if (!m) throw new Error('derivation-valeurs.js : empreinte de la source introuvable');
  return 'sha256:' + m[1].slice(0, 16);
}

function contrats() {
  const manifeste = fs.readFileSync(path.join(RACINE, 'runtime', 'survey-manifest.schema.json'));
  const formdef = { nom: 'FormDef', version: '1.0', catalogue: true };
  const conditions = { nom: 'Conditions', version: '1.0', catalogue: true };
  const enquete = { nom: 'Survey Manifest', version: '1', catalogue: false, empreinte: empreinte(manifeste) };
  const themedef = { nom: 'ThemeDef', version: '1.0', catalogue: false, empreinte: empreinteThemeDef() };
  return { produit: [formdef, conditions, enquete], lit: [formdef, conditions, enquete, themedef] };
}

function monter() {
  const modules = {
    FormDefFromTable: require(path.join(SHARED, 'formdef-from-table.js')),
    FormDefFromGristForm: require(path.join(SHARED, 'formdef-from-grist-form.js')),
    Conditions: require(path.join(SHARED, 'conditions.js')),
    Formats: require(path.join(SHARED, 'formats.js')),
    SurveyProject: require(path.join(SHARED, 'survey-project.js')),
    EnsureSchema: require(path.join(SHARED, 'ensure-schema.js')),
    ThemeDef: require(path.join(SHARED, 'themedef.js')),
    Publish: require(path.join(SHARED, 'publish.js')),
    NoyauSaisies: require(path.join(SHARED, 'noyau-saisies.js')),
    SaisiesMobiles: require(path.join(SHARED, 'saisies-mobiles.js')),
    HoteCapacites: require(path.join(SHARED, 'hote-capacites.js')),
    Synthese: require(path.join(SHARED, 'synthese.js')),
    validerSchema: valider,
    valider,
    schemaFormDef: JSON.parse(fs.readFileSync(path.join(RACINE, 'runtime', 'formdef.schema.json'), 'utf8'))
  };
  return creer(modules, { version: versionDuWidget(), contrats: contrats() });
}

module.exports = { monter, contrats };
