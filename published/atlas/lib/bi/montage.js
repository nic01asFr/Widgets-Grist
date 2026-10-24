/**
 * Point d'entrée du mode composant carte BI, chargé À LA DEMANDE par `app_v7.js` (import dynamique, seulement avec `?bi=1`).
 * Sans ce paramètre, ce module et tout ce qu'il importe ne sont jamais téléchargés.
 */
import { attendreCarte } from '../acces-carte.js?v=1.30.0';
import { monter } from './liaison.js';

export { biDemande, lireHotes, normaliserOrigine } from './liaison.js';

/**
 * Attend la carte d'Atlas (point d'accès officiel), puis monte le composant. Sans limite de temps : dans un cadre non rendu
 * (sous la ligne de flottaison, onglet ou section masqués) la carte ne finit de charger qu'à l'affichage, et un abandon à 20 s
 * laissait le composant définitivement muet.
 */
export async function demarrer(fenetre = window) {
  const carte = await attendreCarte(fenetre, { delai: Infinity });
  // Profil complet : `app_v7.js` a posé la façade du canevas ; son module n'est téléchargé que dans ce cas (jamais par le composant nu).
  const canevas = fenetre.__atlasCanevas ? await import('./canevas.js') : null;
  const montage = await monter({ carte, fenetre, ...(canevas ? { extension: (rt) => canevas.brancher(rt, fenetre.__atlasCanevas) } : {}) });
  fenetre.__biPret = true;   // le composant tourne : le garde d'amorçage de la page (index_v7.html) cesse de surveiller
  return montage;
}
