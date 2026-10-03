/**
 * Où la carte s'ouvre : sur les données, sur un lieu, ou sur une vue figée.
 *
 * Une scène n'a pas à commencer par « un lieu » : quand elle porte des couches, c'est leur emprise qui dit où regarder. Le lieu
 * reste une option (une scène vide, un site précis), et la vue figée une autre (un cadrage choisi par l'auteur). Le choix vit avec
 * la scène (`Atlas_ScenePrefs.ExpositionJSON`, clé `cadrage`) : c'est un choix d'auteur, partagé par tous.
 *
 * Sans choix, la scène s'ouvre sur ses données si elle en a, sinon sur son lieu — ce que faisait Atlas jusqu'ici.
 *
 * Module pur : ni DOM, ni carte, ni Grist.
 */

export const VERSION = '1.0.0';

export const MODES_CADRAGE = Object.freeze(['donnees', 'lieu', 'vue']);

const fini = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Un cadrage sûr, quoi qu'on lui donne : jamais d'exception, jamais de mode inconnu.
 * `null` : aucun choix de l'auteur.
 */
export function normaliserCadrage(brut) {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut) || !MODES_CADRAGE.includes(brut.mode)) return null;
  if (brut.mode === 'donnees') {
    return typeof brut.couche === 'string' && brut.couche ? { mode: 'donnees', couche: brut.couche } : { mode: 'donnees' };
  }
  if (brut.mode === 'lieu') {
    // Un lieu sans coordonnées ne désigne rien : aucun choix.
    const l = brut.lieu;
    if (!l || !fini(l.lng) || !fini(l.lat)) return null;
    return { mode: 'lieu', lieu: typeof l.nom === 'string' && l.nom ? { lng: l.lng, lat: l.lat, nom: l.nom } : { lng: l.lng, lat: l.lat } };
  }
  // Une vue figée sans coordonnées ne désigne rien : aucun choix.
  const v = brut.vue;
  if (!v || !fini(v.lng) || !fini(v.lat) || !fini(v.zoom)) return null;
  return {
    mode: 'vue',
    vue: { lng: v.lng, lat: v.lat, zoom: v.zoom, pitch: fini(v.pitch) ? v.pitch : 0, bearing: fini(v.bearing) ? v.bearing : 0 },
  };
}

/** Le centre d'une emprise `[[ouest, sud], [est, nord]]`, ou null. */
export function centreDesBornes(bornes) {
  if (!Array.isArray(bornes) || bornes.length !== 2) return null;
  const [[ox, oy], [ex, ey]] = bornes;
  if (![ox, oy, ex, ey].every(fini)) return null;
  return { lng: (ox + ex) / 2, lat: (oy + ey) / 2 };
}

/** L'emprise de plusieurs emprises. */
export function unirBornes(liste) {
  let out = null;
  for (const b of liste || []) {
    if (!centreDesBornes(b)) continue;
    out = out
      ? [[Math.min(out[0][0], b[0][0]), Math.min(out[0][1], b[0][1])], [Math.max(out[1][0], b[1][0]), Math.max(out[1][1], b[1][1])]]
      : [[b[0][0], b[0][1]], [b[1][0], b[1][1]]];
  }
  return out;
}

/**
 * Ce que le cadrage demande, ici et maintenant.
 *
 * @param {object} o
 * @param {object|null} [o.cadrage]  le choix de l'auteur (normalisé ou non)
 * @param {Array<{id: string, bornes: Array|null}>} [o.couches]  les couches et leur emprise
 * @returns {{type: 'bornes', bornes: Array} | {type: 'camera', camera: object} | {type: 'lieu', centre: [number, number], zoom: number} | null}
 *   `null` : rien à imposer, la carte reste où elle est
 */
export function cadrageEffectif({ cadrage = null, couches = [] } = {}) {
  const c = normaliserCadrage(cadrage);
  const toutes = unirBornes(couches.map((x) => x.bornes));
  if (c?.mode === 'vue') return { type: 'camera', camera: c.vue };
  if (c?.mode === 'lieu') return { type: 'lieu', centre: [c.lieu.lng, c.lieu.lat], zoom: 16 };
  if (c?.mode === 'donnees' && c.couche) {
    const une = couches.find((x) => x.id === c.couche);
    if (une && centreDesBornes(une.bornes)) return { type: 'bornes', bornes: une.bornes };
  }
  // Pas de choix, ou un choix que la scène ne peut plus tenir (couche retirée) : les données.
  if (toutes) return { type: 'bornes', bornes: toutes };
  return null;
}
