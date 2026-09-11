/**
 * L'import OSM se fait à plat.
 *
 * La zone importée est l'emprise visible (`map.getBounds()`). Dans une vue
 * inclinée, cette emprise court jusqu'à l'horizon : à 55°, elle couvre bien plus
 * que ce que l'on voit au premier plan, et la requête Overpass rapporte des
 * objets que personne n'a regardés — ou échoue, faute de temps. À plat, la zone
 * importée est exactement celle qui est à l'écran.
 *
 * On ne remet que l'inclinaison à zéro : l'orientation reste, pour que le
 * lecteur garde ses repères.
 */

/** En deçà (en degrés), la vue est considérée à plat. */
export const INCLINAISON_TOLEREE = 0.5;

/** La vue doit-elle être mise à plat avant d'importer ? */
export function doitMettreAPlat(inclinaison) {
  const p = Number(inclinaison);
  return Number.isFinite(p) && p > INCLINAISON_TOLEREE;
}

/**
 * Met la carte à plat et attend la fin du mouvement.
 *
 * Une garde de temps résout la promesse si `moveend` n'arrive pas : l'import ne
 * doit jamais rester suspendu à une animation.
 *
 * @param {{getPitch: Function, easeTo: Function, once: Function}} carte
 * @param {{duree?: number}} [options]
 * @returns {Promise<boolean>} vrai si la vue a été mise à plat
 */
export function mettreAPlat(carte, { duree = 500 } = {}) {
  return new Promise((resolve) => {
    if (!carte || typeof carte.getPitch !== 'function' || !doitMettreAPlat(carte.getPitch())) {
      resolve(false);
      return;
    }
    let fini = false;
    const finir = () => { if (!fini) { fini = true; resolve(true); } };
    carte.once('moveend', finir);
    setTimeout(finir, duree + 400);
    carte.easeTo({ pitch: 0, duration: duree });
  });
}
