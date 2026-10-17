/**
 * Style des polygones fournis par l'hôte (parcelles, emprises de bâtiments) : opacité du remplissage et contour.
 *
 * La couleur du remplissage vient de `style.declarative` (`{ kind: 'single', color }` ou `{ kind: 'categorized', field, stops }` : la clé est `kind`).
 * Deux réglages s'y ajoutent, tous deux facultatifs ; sans eux, le rendu est celui d'avant :
 *  - `style.declarative.opacity` : opacité du remplissage, de 0 à 1 ;
 *  - `visuel.contour` : `{ couleur?, largeur?, tirets? }` (largeur en pixels, de 0 exclu à 20 ; `tirets` : au moins deux longueurs positives, en multiples de la largeur).
 * Une valeur invalide est ignorée (jamais d'erreur : l'hôte ne doit pas perdre sa carte pour un réglage de style).
 */

export const VERSION = '1.0.0';
export const LARGEUR_MAX = 20;

/** L'opacité du remplissage déclarée, ou `null`. */
export function opaciteDeclaree(decl) {
  const o = decl && decl.opacity;
  return typeof o === 'number' && Number.isFinite(o) && o >= 0 && o <= 1 ? o : null;
}

/**
 * Le contour réglé par l'hôte, ou `null` s'il n'en règle aucun.
 * @param {*} contour
 * @param {(couleur: string) => string} [resoudre]  résout les jetons de charte (`jeton:<nom>`)
 * @returns {{ couleur: string|null, largeur: number, tirets: number[]|null }|null}
 */
export function contourPolygone(contour, resoudre = (c) => c) {
  if (!contour || typeof contour !== 'object' || Array.isArray(contour)) return null;
  const couleur = typeof contour.couleur === 'string' && contour.couleur.trim() ? resoudre(contour.couleur.trim()) : null;
  const largeur = typeof contour.largeur === 'number' && Number.isFinite(contour.largeur) && contour.largeur > 0 && contour.largeur <= LARGEUR_MAX ? contour.largeur : 1;
  const t = contour.tirets;
  const tirets = Array.isArray(t) && t.length >= 2 && t.length <= 8 && t.every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0 && x <= LARGEUR_MAX) ? [...t] : null;
  return { couleur, largeur, tirets };
}

/**
 * L’étiquette permanente d’une couche de polygones : un texte lu dans une propriété, posé au centre de chaque surface, toujours affiché (jamais masqué par une collision).
 * `visuel.etiquette: { champ: 'etiquette', taille: 12 }` ; la taille est bornée (8 à 24). `null` quand rien n’est déclaré ou que la déclaration est invalide.
 * @returns {{ champ: string, taille: number }|null}
 */
export function etiquetteDeclaree(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e) || typeof e.champ !== 'string' || !e.champ.trim()) return null;
  const t = Number(e.taille);
  return { champ: e.champ.trim(), taille: Number.isFinite(t) ? Math.min(24, Math.max(8, t)) : 12 };
}

/** Les curseurs que l’hôte peut demander pour la carte (hors survol d’un objet, qui garde « pointer »). */
export const CURSEURS = Object.freeze(['crosshair', 'zoom-in', 'zoom-out', 'pointer', 'grab', 'cell', 'default']);
/** @returns {string|null} un curseur de la liste, ou null (aucun : le curseur par défaut de la carte) */
export function curseurDeclare(v) { return typeof v === 'string' && CURSEURS.includes(v) ? v : null; }
