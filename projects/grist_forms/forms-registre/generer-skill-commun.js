#!/usr/bin/env node
'use strict';

/**
 * Le skill d'un widget auto-descriptif : un SKILL.md GENERE depuis sa fiche de capacites et son commandes.json
 * (docs/WIDGETS-AUTO-DESCRIPTIFS.md, §2). Jamais saisi a la main : le gabarit ci-dessous est commun a tous les widgets
 * (regles d'ecriture, interdits), le reste vient de la fiche. Un test de peremption refuse un SKILL.md qui differe.
 *
 *   node scripts/generer-skill.js <fiche-capacites.json> <commandes.json> [sortie SKILL.md]
 *
 * Sans sortie, le texte est imprime ; le script n'ecrit jamais dans published/ de lui-meme.
 */

const fs = require('node:fs');

const ORDRE_VERBES = ['presenter', 'configurer', 'creer', 'editer', 'structurer', 'personnaliser', 'publier', 'exploiter', 'recolter', 'traiter'];
const INTERFACES = {
  skill: 'ce skill',
  cli: 'ligne de commande',
  mcp: 'serveur MCP',
  webmcp: 'page WebMCP',
  vitrine: 'annexe « Pour un agent » de la vitrine',
};

/** Règles communes à tous les widgets : le meme texte partout, source unique. */
const REGLES_ECRITURE = [
  'Appeler `<widget>_capacites` (ou la commande de présentation) avant toute autre : elle dit ce que cette version sait faire.',
  'Ne citer que les commandes listées ci-dessous, avec leur nom exact ; ne jamais en inventer une.',
  'Donner à chaque commande une entrée conforme à son schéma ; en cas d’erreur, relire le message et corriger l’entrée plutôt que réessayer à l’identique.',
  'Écrire en français, sans jargon, dès que le résultat est destiné à une personne.',
  'Annoncer à la personne ce qui sera écrit dans un document avant de l’écrire, et seulement quand la commande est marquée comme écrivant.',
];

const INTERDITS = [
  'Ne jamais promettre un refus côté serveur des valeurs invalides : sans contrôle dans le document, une valeur invalide est acceptée.',
  'Ne jamais deviner un identifiant de document, de table ou de colonne : le demander ou le lire.',
  'Ne jamais présenter comme fait un verbe de la section « Non couvert » : le dire, et proposer l’interface qui le couvre quand il en existe une.',
  'Ne jamais publier ni envoyer ailleurs sans l’accord explicite de la personne.',
];

function ligneCommande(c) {
  const requis = (c.entree && c.entree.required) || [];
  const natureTxt = c.nature === 'pure' ? 'calcul pur' : 'exige la page';
  const ecritTxt = !c.ecrit || c.ecrit === 'rien' ? 'n’écrit rien' : 'écrit : ' + (Array.isArray(c.ecrit) ? c.ecrit.join(', ') : c.ecrit);
  return '- `' + c.nom + '` : ' + c.description + '\n  Entrée requise : ' + (requis.length ? requis.map((r) => '`' + r + '`').join(', ') : 'aucune')
    + ' ; ' + natureTxt + ' ; ' + ecritTxt + '.';
}

function contenuSkill({ fiche, commandes }) {
  const titre = fiche.presentation.titre;
  const parNom = new Map(commandes.commandes.map((c) => [c.nom, c]));
  const l = [];
  l.push('---');
  l.push('name: ' + fiche.widget);
  l.push('description: ' + JSON.stringify(titre + ' : ' + fiche.presentation.resume));
  l.push('---');
  l.push('');
  l.push('# ' + titre);
  l.push('');
  l.push(fiche.presentation.resume);
  l.push('');
  l.push('Version ' + fiche.version + '. Généré depuis `fiche-capacites.json` (contrat ' + fiche.contrat + ') et `commandes.json` : ne pas modifier à la main.');
  l.push('');
  l.push('## Interfaces');
  l.push('');
  if (fiche.interfaces) {
    for (const [cle, nom] of Object.entries(INTERFACES)) l.push('- ' + nom + ' : ' + (fiche.interfaces[cle] ? 'disponible' : 'non disponible') + '.');
  } else {
    l.push('Les interfaces ne sont pas déclarées par la fiche.');
  }
  l.push('');
  l.push('## Commandes');
  l.push('');
  for (const verbe of ORDRE_VERBES) {
    const noms = fiche.verbes[verbe];
    if (!noms || !noms.length) continue;
    l.push('### ' + verbe);
    l.push('');
    for (const n of noms) l.push(ligneCommande(parNom.get(n) || { nom: n, description: '(commande absente de commandes.json)' }));
    l.push('');
  }
  l.push('## Non couvert');
  l.push('');
  l.push(fiche.non_couverts.length ? 'Verbes sans commande : ' + fiche.non_couverts.join(', ') + '.' : 'Aucun verbe sans commande.');
  l.push('');
  l.push('## Limites');
  l.push('');
  for (const x of fiche.limites) l.push('- ' + x);
  l.push('');
  l.push('## Règles d’écriture');
  l.push('');
  for (const r of REGLES_ECRITURE) l.push('- ' + r.replace('<widget>', fiche.widget));
  l.push('');
  l.push('## Interdits');
  l.push('');
  for (const r of INTERDITS) l.push('- ' + r);
  l.push('');
  return l.join('\n');
}

/**
 * Parite du skill : il est le texte que le generateur rend, cite chaque commande de la fiche et aucune autre du widget.
 * @returns {string[]} les ecarts ; vide si le skill est a jour
 */
function verifierSkill(texte, { fiche, commandes }) {
  const ecarts = [];
  const attendu = contenuSkill({ fiche, commandes });
  if (texte !== attendu) ecarts.push('SKILL.md perime : relancer scripts/generer-skill.js');
  const cites = new Set((texte.match(new RegExp('`' + fiche.widget + '_[a-z0-9_]+`', 'g')) || []).map((s) => s.slice(1, -1)));
  const connus = new Set(Object.values(fiche.verbes).flat());
  for (const n of connus) if (!cites.has(n)) ecarts.push('commande non citee par le skill : ' + n);
  for (const n of cites) if (!connus.has(n)) ecarts.push('le skill cite une commande inconnue de la fiche : ' + n);
  return ecarts;
}

if (require.main === module) {
  const [, , fichePath, cmdPath, sortie] = process.argv;
  if (!fichePath || !cmdPath) {
    process.stderr.write('usage : node scripts/generer-skill.js <fiche-capacites.json> <commandes.json> [sortie]\n');
    process.exit(2);
  }
  const lire = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
  const texte = contenuSkill({ fiche: lire(fichePath), commandes: lire(cmdPath) });
  if (sortie) fs.writeFileSync(sortie, texte);
  else process.stdout.write(texte);
}

module.exports = { contenuSkill, verifierSkill, REGLES_ECRITURE, INTERDITS };
