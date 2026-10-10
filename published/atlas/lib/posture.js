/**
 * Les trois postures d'Atlas : Préparer, Exploiter, Lecture.
 *
 * Elles existaient sans nom, dans deux booléens que le code lisait partout :
 *
 * | Posture | `viewMode` | `peutSaisir` | Ce qu'on y fait |
 * |---|---|---|---|
 * | **Préparer** | faux | vrai | régler couches, formulaires, contrôles et récit |
 * | **Exploiter** | vrai | vrai | relever : choisir un objet, ajouter une visite |
 * | **Lecture** | vrai | faux | voir la carte, sans rien écrire |
 *
 * `viewMode` dit « Atlas ne montre pas ses outils d'auteur » ; `peutSaisir` dit
 * « on offre la saisie des formulaires proposés ». Les deux restent les champs
 * que le code lit ; la posture est ce qu'on CHOISIT, et elle les détermine.
 *
 * **Atlas ne donne jamais plus que Grist.** Ce module ne sait rien des droits :
 * il nomme, et choisit parmi ce que `posturesOffertes` (lib/droits-tables.js)
 * propose. Grist refuse ce qui n'est pas permis, et Atlas l'apprend.
 */
import { POSTURES } from './droits-tables.js?v=1.14.0';

export { POSTURES };

/** Le nom et le sens de chaque posture, dits comme on les dit à l'écran. */
export const LIBELLES = Object.freeze({
  preparer: { nom: 'Préparer', badge: 'Édition', aide: 'Régler les couches, les formulaires, les contrôles et le récit' },
  exploiter: { nom: 'Exploiter', badge: 'Exploitation', aide: 'Relever sur le terrain : choisir un objet, ajouter une visite' },
  lecture: { nom: 'Lecture', badge: 'Lecture', aide: 'Consulter la carte, sans rien écrire' },
});

/** La posture que disent les deux booléens. */
export function postureDepuis({ viewMode = false, peutSaisir = false } = {}) {
  if (!viewMode) return 'preparer';
  return peutSaisir ? 'exploiter' : 'lecture';
}

/** Les deux booléens qu'une posture détermine. */
export function etatDePosture(posture) {
  if (posture === 'preparer') return { viewMode: false, peutSaisir: true };
  if (posture === 'exploiter') return { viewMode: true, peutSaisir: true };
  return { viewMode: true, peutSaisir: false };
}

/**
 * La posture d'ouverture.
 *
 * 1. celle que la personne a choisie la dernière fois sur cet appareil, si elle
 *    est encore offerte — un choix retenu ne rouvre jamais une posture que les
 *    droits ne proposent plus ;
 * 2. dans l'application, *Exploiter* si elle est offerte : c'est l'outil du
 *    terrain, et on prépare au bureau ;
 * 3. sinon celle que l'ouverture a donnée (`initiale`) ;
 * 4. à défaut, la première offerte.
 *
 * @param {object} o
 * @param {string[]} o.offertes   dans l'ordre de préférence : préparer, exploiter, lecture
 * @param {string|null} [o.memorisee]
 * @param {string|null} [o.initiale]
 * @param {boolean} [o.application]
 * @returns {'preparer'|'exploiter'|'lecture'}
 */
export function postureParDefaut({ offertes = [], memorisee = null, initiale = null, application = false } = {}) {
  const permises = offertes.filter((p) => POSTURES.includes(p));
  if (!permises.length) return 'lecture';
  if (memorisee && permises.includes(memorisee)) return memorisee;
  if (application && permises.includes('exploiter')) return 'exploiter';
  if (initiale && permises.includes(initiale)) return initiale;
  return permises[0];
}
