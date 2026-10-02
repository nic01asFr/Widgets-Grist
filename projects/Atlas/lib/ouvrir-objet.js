/**
 * Ce qui s'ouvre quand on choisit un objet — un seul endroit pour la règle.
 *
 * Cinq chemins décidaient chacun à leur façon : le toucher sur la carte, la
 * recherche, « le plus proche », les objets d'une étape et, désormais, la liste.
 * La recherche ouvrait la fiche de saisie quand le toucher ouvrait la bulle
 * (constaté le 01/10/2026), et « le plus proche » allait toujours à la fiche.
 * Un objet doit s'ouvrir de la même façon, quelle que soit la manière dont on y
 * est arrivé.
 *
 * | Posture | Couche | Ce qui s'ouvre |
 * |---|---|---|
 * | Préparer | table d'une scène | **fiche** (sélection, édition) |
 * | Préparer | distante, sans ligne à éditer | **popup** (consultation) |
 * | Exploiter ou Lecture | une bulle est réglée | **bulle** |
 * | Exploiter | un formulaire est proposé, pas de bulle | **fiche** (saisie) |
 * | Lecture | rien de plus | **popup** |
 * | pendant un récit | l'étape propose des saisies sur cette couche | **fiche** |
 */

/**
 * @param {object} o
 * @param {boolean} [o.lecture=true] `viewMode` : on ne montre pas les outils d'auteur.
 *   Un oubli se lit comme la lecture : jamais l'édition par omission.
 * @param {boolean} [o.bulleActive]  la couche a une bulle d'objet
 * @param {boolean} [o.enSaisie]     un formulaire de la couche est proposé hors édition
 * @param {boolean} [o.distant]      couche sans ligne Grist derrière
 * @param {boolean} [o.enPresentation]  un récit est joué
 * @param {boolean} [o.saisiesEtape] l'étape en cours propose des saisies sur cette couche
 * @returns {'fiche'|'bulle'|'popup'}
 */
export function decisionOuverture({ lecture = true, bulleActive = false, enSaisie = false, distant = false, enPresentation = false, saisiesEtape = false } = {}) {
  if (enPresentation && saisiesEtape) return 'fiche';
  if (!lecture) return distant ? 'popup' : 'fiche';
  if (bulleActive) return 'bulle';
  return enSaisie ? 'fiche' : 'popup';
}
