/**
 * Le cap de la personne, tel que le GPS le donne.
 *
 * `GeolocationCoordinates.heading` est un angle en degrés dans le sens horaire depuis le nord vrai, mais il n'a de sens qu'en
 * mouvement : à l'arrêt, la valeur est `null` ou `NaN`, ou une direction résiduelle qui change au hasard. On ne montre donc
 * un cap que si la vitesse est connue et assez élevée pour qu'il soit fiable.
 *
 * Rien ici ne touche la carte ni le DOM : l'application pose la flèche.
 */

export const VERSION = '1.0.0';

/** En dessous, le cap du GPS n'est pas fiable (m/s, soit environ 3 km/h). */
export const VITESSE_MIN_MS = 0.8;

/**
 * Le cap à afficher, en degrés dans [0, 360[, ou `null` s'il ne faut rien montrer.
 * @param {{ heading?: number|null, speed?: number|null }|null|undefined} coords
 * @param {{ vitesseMin?: number }} [o]
 */
export function capUtilisable(coords, { vitesseMin = VITESSE_MIN_MS } = {}) {
  if (!coords) return null;
  const { heading, speed } = coords;
  if (typeof heading !== 'number' || !Number.isFinite(heading)) return null;
  if (typeof speed !== 'number' || !Number.isFinite(speed) || speed < vitesseMin) return null;
  return ((heading % 360) + 360) % 360;
}
