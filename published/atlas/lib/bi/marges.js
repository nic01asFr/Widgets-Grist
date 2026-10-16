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

/** Les marges augmentées d'une marge de confort (pour `fitBounds`). */
export function avecConfort(marges, confort) {
  const m = marges || { top: 0, right: 0, bottom: 0, left: 0 };
  return { top: m.top + confort, right: m.right + confort, bottom: m.bottom + confort, left: m.left + confort };
}
