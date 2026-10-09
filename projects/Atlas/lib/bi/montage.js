/**
 * Point d'entrée du mode composant carte BI, chargé À LA DEMANDE par `app_v7.js` (import dynamique, seulement avec `?bi=1`).
 * Sans ce paramètre, ce module et tout ce qu'il importe ne sont jamais téléchargés.
 */
import { attendreCarte } from '../acces-carte.js?v=20261009a';
import { monter } from './liaison.js';

export { biDemande, lireHotes, normaliserOrigine } from './liaison.js';

/** Attend la carte d'Atlas (point d'accès officiel), puis monte le composant. */
export async function demarrer(fenetre = window) {
  const carte = await attendreCarte(fenetre);
  return monter({ carte, fenetre });
}
