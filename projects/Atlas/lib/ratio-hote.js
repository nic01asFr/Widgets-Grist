/**
 * Plafond du ratio de pixels demandé par l'hôte (`?ratio=2`, ou l'attribut `ratio-max` de `<atlas-bi>`).
 *
 * Sur un écran à fort ratio (3 sur un téléphone récent) la carte dessine 9 fois plus de pixels qu'à 1, pour un gain de netteté que l'œil ne voit
 * guère sur une carte : mesuré le 15/10/2026 à CPU ralenti 4x et ratio 3, 43 images/s sans plafond, 238 avec un plafond à 1 (banc `m5-mobile`).
 * C'est un choix de l'hôte, jamais une valeur imposée : sans paramètre, le comportement est inchangé (ratio de l'appareil).
 *
 * Module pur : aucune dépendance.
 */

/** Bornes acceptées : en dessous de 1 la carte devient floue, au-delà de 4 aucun écran n'en profite. */
export const RATIO_MIN = 1;
export const RATIO_MAX = 4;

/**
 * @param {string|URLSearchParams|null|undefined} recherche  `location.search` (ou ses paramètres)
 * @returns {number|null} le plafond demandé, ou null si absent ou illisible (le ratio de l'appareil s'applique alors)
 */
export function ratioMaxDemande(recherche) {
  let brut;
  try {
    const p = typeof recherche === 'string' ? new URLSearchParams(recherche) : recherche;
    brut = p && typeof p.get === 'function' ? p.get('ratio') : null;
  } catch (_) { return null; }
  if (brut === null || brut === undefined || String(brut).trim() === '') return null;
  const n = Number(String(brut).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(RATIO_MAX, Math.max(RATIO_MIN, n));
}

/** Le plus strict de deux plafonds (`null` = pas de plafond). */
export function plafondLePlusStrict(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return Math.min(a, b);
}
