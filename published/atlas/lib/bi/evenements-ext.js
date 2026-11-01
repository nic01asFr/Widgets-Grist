/**
 * Événements ajoutés au contrat 0.3 SANS toucher à `pont.js` : ce fichier et `client.js` sont les sources du client de l'hôte en un seul fichier, dont l'empreinte
 * est épinglée par les hôtes. Le client livre n'importe quel type d'événement reçu (il ne contrôle pas la version des messages entrants) : un événement
 * ajouté ici atteint donc aussi les hôtes qui gardent l'ancien client.
 *
 *  - `action { layer, featureId, key, actionId }` : la personne a cliqué un bouton de la bulle (`manifeste.layers[].bulle.actions`) ; l'hôte route ;
 *  - `bulle { etat: 'ouverte' | 'fermee', layer, featureId }` : la bulle d'un objet s'ouvre ou se ferme ;
 *  - `classe { layer, cle, libelle, active }` : la personne a cliqué une classe de la légende optionnelle (`interface.legende.cible: true`) ; `active` vaut faux
 *    quand elle désélectionne. La légende ne filtre rien : l'hôte route (par exemple `setFilter`) ;
 *  - `mouvement { …vue de getCamera, phase }` (0.4) : le flux de la caméra, SUR ABONNEMENT (`watchCamera`) ; `phase` vaut `debut`, `en_cours` ou `fin` (toujours envoyé à la fin du mouvement) ;
 *  - `sun { date, actif, azimut, hauteur, lever, coucher }` (0.7) : la date, l'heure ou les ombres du soleil ont changé (la forme de `getSun`) ; `origine` vaut `utilisateur` pour un geste dans Atlas, `api` pour l'effet de `setSun` ;
 *  - `clic { lng, lat, x, y, zoom }` (0.4) : la personne a cliqué la carte en un point qui ne touche aucune entité interactive (un clic sur une entité reste un `select` seul).
 */
import { EVENEMENTS } from './pont.js';

export const EVENEMENTS_AJOUTES = Object.freeze(['action', 'bulle', 'classe', 'clic', 'mouvement', 'sun']);
/** Tous les événements du composant : ceux du pont, puis ceux qui s'y sont ajoutés. */
export const TOUS_LES_EVENEMENTS = Object.freeze([...EVENEMENTS, ...EVENEMENTS_AJOUTES]);
