/**
 * L'adresse PostgreSQL d'un document : réglée UNE fois, retrouvée à chaque ouverture, sans panneau de réglages dans le cas courant.
 *
 * Elle est gardée dans le document, dans UNE ligne `pgAdresse` de la table `Atlas_Config` (Cle, Valeur) : partagée par toutes les personnes qui
 * l'ouvrent, écrite tout de suite (les options du widget Grist restent « non enregistrées » tant qu'on n'a pas cliqué sur Enregistrer), et jamais
 * autre chose qu'une adresse — ni jeton, ni identité, ni mot de passe (voir `pg-acces.js`).
 *
 * ## Une adresse lue dans un document est une donnée, pas une instruction
 * Un document partagé peut porter l'adresse de n'importe quel serveur. Se connecter tout seul à l'ouverture du panneau ne pose donc
 * qu'une question, jamais une action cachée : la sonde `GET /v1/echangeur` n'envoie rien, et l'identité Grist n'est envoyée qu'après la
 * confirmation qui nomme l'adresse (`vue-import-pg.js`, « Refuser » par défaut). Une adresse qui n'est pas https (hors localhost) est
 * ignorée, DITE, et n'est pas essayée.
 *
 * Module pur : ni Grist, ni DOM, ni réseau.
 */

import { adresseAdmisePg } from './pg-acces.js?v=20261109a';

export const OPTION_ADRESSE = 'pgAdresse';

const nettoyer = (v) => (typeof v === 'string' ? v.trim().replace(/\/+$/, '') : '');

/**
 * L'adresse que portent les options du widget.
 * @param {object|null|undefined} options  `{ pgAdresse }`, lu dans `Atlas_Config`
 * @returns {{url: string, refus: string|null}}  `url` vide : rien d'enregistré ; `refus` : une adresse présente mais inutilisable (à dire)
 */
export function lireAdresseDocument(options) {
  const brute = options && typeof options === 'object' ? options[OPTION_ADRESSE] : undefined;
  if (brute === undefined || brute === null || brute === '') return { url: '', refus: null };
  const url = nettoyer(brute);
  if (!url) return { url: '', refus: 'l’adresse enregistrée dans ce document est illisible' };
  const motif = adresseAdmisePg(url);
  if (motif) return { url: '', refus: `l’adresse enregistrée dans ce document est ignorée (${motif})` };
  return { url, refus: null };
}

/**
 * Que fait le panneau à l'ouverture ?
 * @param {{adresseDocument: string, adresseNavigateur: string}} p
 * @returns {{url: string, connexionAuto: boolean, source: 'document'|'navigateur'|null}}
 *   l'adresse du document décide ET connecte tout seul ; celle que ce navigateur a retenue préremplit seulement le champ (aucune connexion
 *   sans geste : ce n'est pas une adresse choisie pour ce document).
 */
export function demarrage({ adresseDocument = '', adresseNavigateur = '' } = {}) {
  if (adresseDocument) return { url: adresseDocument, connexionAuto: true, source: 'document' };
  if (adresseNavigateur) return { url: nettoyer(adresseNavigateur), connexionAuto: false, source: 'navigateur' };
  return { url: '', connexionAuto: false, source: null };
}

/**
 * Faut-il enregistrer l'adresse qui vient de fonctionner dans le document ?
 * Seulement si elle a servi (connexion réussie), qu'elle diffère de celle du document, qu'elle est admise, et que la personne peut écrire
 * dans le document (une personne en lecture seule ne change pas ce que voient les autres).
 */
export function adresseAEnregistrer({ saisie, adresseDocument = '', peutEcrire = false } = {}) {
  const url = nettoyer(saisie);
  if (!peutEcrire || !url || url === adresseDocument) return null;
  if (adresseAdmisePg(url) !== null) return null;
  return url;
}
