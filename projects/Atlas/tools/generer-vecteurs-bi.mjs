// Génère les vecteurs de conformité du pont BI en EXÉCUTANT lib/bi/pont.js : chaque commande entrante est validée comme le composant la valide,
// les enveloppes de réponse et d'événement sont celles que le composant émet. Les hôtes (application, kit) rejouent ce fichier dans leurs tests.
//   node tools/generer-vecteurs-bi.mjs <fichier de sortie .json>
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as P from '../lib/bi/pont.js';

/** Entier croissant : à incrémenter à chaque modification des vecteurs (un hôte le lit pour savoir s'il est à jour). */
export const VERSION_VECTEURS = 1;
const ORIG = 'https://hote.example';
const cmd = (c, args, id = 'c1', version = '0.3') => ({ source: 'hote-bi', version, id, cmd: c, args });
const manifeste = { layers: [{ id: 'sites', name: 'Sites', geometry_type: 'Point', cle: 'code_site', controls: [{ id: 'famille', field: 'famille', type: 'select' }] }] };
const donnees = { sites: [
  { type: 'Feature', id: 1, geometry: { type: 'Point', coordinates: [6.15, 47.62] }, properties: { code_site: 'S001', famille: 'ecole', code_insee: '70550' } },
  { type: 'Feature', id: 2, geometry: { type: 'Point', coordinates: [6.46, 47.72] }, properties: { code_site: 'S002', famille: 'mairie', code_insee: '70285' } } ] };
const entrantes = [
  ['ping valide', cmd('ping', []), ORIG, [ORIG]],
  ['setScene valide', cmd('setScene', [manifeste, donnees]), ORIG, [ORIG]],
  ['setFilter liste', cmd('setFilter', ['famille', ['ecole']]), ORIG, [ORIG]],
  ['setFilter intervalle', cmd('setFilter', ['surface', { min: 100, max: 900 }]), ORIG, [ORIG]],
  ['setFilter texte', cmd('setFilter', ['recherche', { texte: 'nord' }]), ORIG, [ORIG]],
  ['setFilter retrait', cmd('setFilter', ['famille', null]), ORIG, [ORIG]],
  ['select', cmd('select', [1]), ORIG, [ORIG]],
  ['highlight', cmd('highlight', [[1, 2]]), ORIG, [ORIG]],
  ['setTheme charte', cmd('setTheme', [{ version: 'atlas-charte/0.1', graines: { principal: '#292574' } }]), ORIG, [ORIG]],
  ['getLegend', cmd('getLegend', ['sites']), ORIG, [ORIG]],
  ['getRows', cmd('getRows', ['sites']), ORIG, [ORIG]],
  ['batch', cmd('batch', [[{ cmd: 'setFilter', args: ['famille', ['ecole']] }, { cmd: 'select', args: [1] }]]), ORIG, [ORIG]],
  ['commande 0.3 en version 0.2 (refusee)', cmd('addAdminLayer', ['commune', {}], 'c2', '0.2'), ORIG, [ORIG]],
  ['version inconnue (refusee)', cmd('ping', [], 'c3', '9.9'), ORIG, [ORIG]],
  ['commande inconnue (refusee)', cmd('detruireTout', []), ORIG, [ORIG]],
  ['origine non declaree (refusee, aucune reponse)', cmd('ping', []), 'https://autre.example', [ORIG]],
  ['origine opaque null (refusee)', cmd('ping', []), 'null', [ORIG]],
  ['liste d hotes vide (refusee)', cmd('ping', []), ORIG, []],
  ['argument de mauvais type (refuse)', cmd('setLayerVisibility', ['sites', 'oui']), ORIG, [ORIG]],
];

export function construireVecteurs() {
  const vecteurs = {
    version_vecteurs: VERSION_VECTEURS,
    description: "Vecteurs du pont BI 0.3 produits en executant lib/bi/pont.js : chaque commande entrante est validee comme le composant la valide ; les enveloppes de reponse et d'evenement sont celles que le composant emet.",
    version_contrat: P.VERSION, versions_acceptees: P.VERSIONS_ACCEPTEES, source_hote: P.SOURCE_HOTE, source_composant: P.SOURCE_RUNTIME, batch_max: P.BATCH_MAX,
    commandes: Object.keys(P.COMMANDES), evenements: [...P.EVENEMENTS], capacites: [...P.CAPACITES], capacite_de_commande: { ...P.CAPACITE_DE_COMMANDE },
  };
  vecteurs.entrantes = entrantes.map(([nom, msg, origine, autorisees]) => ({
    nom, origine_de_l_envoi: origine, origines_declarees: autorisees, message: msg,
    attendu: (({ ok, code, erreur }) => ({ accepte: ok, code: code || null, erreur: erreur || null }))(P.validerCommande(msg, { origine, autorisees })),
  }));
  const paquet = { version_paquet: '1.0.0', edition_admin_express: '2026', recensement: '2023' };
  const refus = new P.ErreurCapacite('temps', 'setTime');
  vecteurs.sortantes = [
    { nom: 'resultat ok', message: P.resultat('c1', true, { pong: true }) },
    { nom: 'resultat en erreur', message: P.resultat('c2', false, 'commande inconnue') },
    { nom: 'resultat capacite_absente (code et capacite en plus du texte)', message: P.resultat('c4', false, refus.message, { code: refus.code, capacite: refus.capacite }) },
    { nom: 'ready (annonce de la version seule, hote de l ancien contrat)', message: P.evenement('ready', { versions: P.VERSIONS_ACCEPTEES }, 'api') },
    { nom: 'ready avec capacites et paquet null (aucun manifeste lu)', message: P.evenement('ready', { runtime: true, version: P.VERSION, versions: [...P.VERSIONS_ACCEPTEES], capacites: [...P.CAPACITES], paquet: null }, 'api') },
    { nom: 'ready avec capacites reduites et paquet lu', message: P.evenement('ready', { runtime: true, version: P.VERSION, versions: [...P.VERSIONS_ACCEPTEES], capacites: ['points', 'socle'], paquet }, 'api') },
    { nom: 'select (geste de l utilisateur, avec key)', message: P.evenement('select', { layer: 'sites', featureId: 1, key: 'S001' }, 'utilisateur') },
    { nom: 'hover (avec key)', message: P.evenement('hover', { layer: 'sites', featureId: 2, key: 'S002' }, 'utilisateur') },
    { nom: 'hover de sortie', message: P.evenement('hover', { layer: null, featureId: null }, 'utilisateur') },
    { nom: 'filter (effet d une commande : origine api, a ignorer par l hote qui l a provoque)', message: P.evenement('filter', { controlId: 'famille', value: ['ecole'], layer: 'sites', compte: 1, total: 2 }, 'api') },
  ];
  vecteurs.regles_hote = [
    'Ignorer les evenements dont origine vaut api quand on les a provoques soi-meme.',
    'Renvoyer la scene a chaque evenement ready (une iframe rechargee revient vide).',
    'Relire capacites et paquet a chaque ready : ils decrivent CE chargement du composant.',
    'Ne jamais envoyer en targetOrigin * ; viser l origine exacte du composant.',
    'Un evenement ou resultat dont source ne vaut pas atlas-bi, ou venant d une autre fenetre ou origine, est ecarte.',
  ];
  return vecteurs;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sortie = process.argv[2];
  if (!sortie) { console.error('usage : generer-vecteurs-bi.mjs <fichier de sortie .json>'); process.exit(1); }
  const v = construireVecteurs();
  writeFileSync(sortie, JSON.stringify(v, null, 2) + '\n');
  console.log(v.entrantes.map((e) => e.nom + ' -> ' + (e.attendu.accepte ? 'ok' : e.attendu.code)).join('\n'));
}
