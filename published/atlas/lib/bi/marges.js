/**
 * Les marges de la carte : la zone UTILE est ce qui reste quand l'hôte pose un panneau sur un côté (liste, fiche, légende).
 *
 *   setScene({ marges: { right: 380 }, layers: [...] })          // à la scène
 *   flyTo({ marges: { right: 380 } })                            // à tout moment (sans autre clé : aucun déplacement)
 *   flyTo({ marges: null })                                      // retire les marges
 *   carte.setMarges({ right: 380 })                              // l'élément <atlas-bi> : même chose, en une méthode
 *
 * Les marges PERSISTENT : tant qu'elles sont posées, la caméra (`flyTo`, `fitTo`) centre et cadre dans la zone utile. Elles passent par les commandes
 * déjà existantes du contrat : le client de l'hôte, épinglé par empreinte, n'a pas à changer.
 *
 * Module pur : aucune dépendance.
 */

export const MARGE_MAX = 2000;
const COTES = ['top', 'right', 'bottom', 'left'];

/**
 * @param {*} brut  `{ top?, right?, bottom?, left? }` en pixels (0 à 2000), ou `null`/`undefined` pour retirer
 * @returns {{ top: number, right: number, bottom: number, left: number } | null}  null = pas de marges
 * @throws {Error} message en clair quand la forme n'est pas lisible
 */
export function normaliserMarges(brut) {
  if (brut === null || brut === undefined) return null;
  if (typeof brut !== 'object' || Array.isArray(brut)) throw new Error('marges : un objet { top, right, bottom, left } en pixels est attendu (ou null pour les retirer)');
  const inconnues = Object.keys(brut).filter((k) => !COTES.includes(k));
  if (inconnues.length) throw new Error('marges : côté inconnu « ' + String(inconnues[0]).slice(0, 20) + ' » (top, right, bottom, left)');
  const m = {};
  for (const c of COTES) {
    const v = brut[c] === undefined ? 0 : brut[c];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MARGE_MAX) throw new Error('marges.' + c + ' : un nombre de pixels de 0 à ' + MARGE_MAX + ' est attendu');
    m[c] = Math.round(v);
  }
  return COTES.every((c) => m[c] === 0) ? null : m;
}

/**
 * Un padding qui ne laisse jamais moins de `reste` (20 % par défaut) de la hauteur et de la largeur : MapLibre NE CADRE PAS DU TOUT quand le padding dépasse le
 * conteneur (« Map cannot fit within canvas » : aucun mouvement, aucun événement camera, la carte reste où elle est). Réduit proportionnellement le haut et le bas,
 * puis la gauche et la droite. Taille inconnue (conteneur masqué, carte simulée) : inchangé.
 * @param {number|{top:number,right:number,bottom:number,left:number}} padding
 */
export function limiterPadding(padding, largeur, hauteur, reste = 0.2) {
  if (!(largeur > 0) || !(hauteur > 0)) return padding;
  const p = typeof padding === 'number' ? { top: padding, right: padding, bottom: padding, left: padding } : padding;
  const borne = (a, b, taille) => { const total = a + b, max = taille * (1 - reste); if (total <= max) return [a, b]; const k = max / total; return [a * k, b * k]; };
  const [top, bottom] = borne(p.top, p.bottom, hauteur), [left, right] = borne(p.left, p.right, largeur);
  const sortie = { top, right, bottom, left };
  return top === p.top && bottom === p.bottom && left === p.left && right === p.right ? padding : sortie;
}

/** Les marges augmentées d'une marge de confort (pour `fitBounds`). */
export function avecConfort(marges, confort) {
  const m = marges || { top: 0, right: 0, bottom: 0, left: 0 };
  return { top: m.top + confort, right: m.right + confort, bottom: m.bottom + confort, left: m.left + confort };
}

/**
 * Le décalage (dx, dy), en pixels, à donner à un rectangle (la bulle d'un objet) pour qu'il tienne dans la zone utile : le conteneur moins les marges de l'hôte,
 * moins un peu d'air. Si la zone utile est plus petite que le rectangle, le bord haut-gauche prime (le titre et la fermeture restent visibles).
 * @param {{ left: number, top: number, right: number, bottom: number }} rect       le rectangle, dans le même repère que `conteneur`
 * @param {{ largeur: number, hauteur: number }} conteneur
 * @param {{ top: number, right: number, bottom: number, left: number } | null} marges
 */
export function decalageDansZone(rect, conteneur, marges, air = 8) {
  const m = marges || { top: 0, right: 0, bottom: 0, left: 0 };
  const minX = m.left + air, maxX = conteneur.largeur - m.right - air, minY = m.top + air, maxY = conteneur.hauteur - m.bottom - air;
  let dx = 0, dy = 0;
  if (rect.right > maxX) dx = maxX - rect.right;
  if (rect.left + dx < minX) dx = minX - rect.left;
  if (rect.bottom > maxY) dy = maxY - rect.bottom;
  if (rect.top + dy < minY) dy = minY - rect.top;
  return { dx: Math.round(dx), dy: Math.round(dy) };
}
