/**
 * La pastille « Relevé » : ce qu'elle propose, et vers quel objet elle mène.
 *
 * Un contrôle publié devient une pastille ; un formulaire publié ne devenait
 * rien de visible. Le lecteur ne pouvait découvrir qu'un objet se saisit qu'en
 * le touchant — sur le terrain, c'est justement ce qu'il faut savoir en
 * arrivant. D'où une pastille, et UNE seule quel que soit le nombre de
 * formulaires : elle regroupe, pour ne pas charger le dock.
 *
 * Ce module ne touche ni au DOM ni à la carte. Il répond à deux questions —
 * que lister, et quel objet est le plus proche — pour que la réponse se
 * vérifie sans navigateur.
 */

export const VERSION = '1.0.0';

/** Rayon terrestre moyen, en mètres. */
const R = 6371008.8;

/**
 * Distance au sol entre deux points `[lng, lat]`, en mètres.
 *
 * Haversine : l'équirectangulaire suffirait à l'échelle d'une rue, mais une
 * scène peut couvrir un département, et le classement doit rester juste.
 */
export function distanceMetres(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return Infinity;
  const [lng1, lat1] = a.map(Number);
  const [lng2, lat2] = b.map(Number);
  if (![lng1, lat1, lng2, lat2].every(Number.isFinite)) return Infinity;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * L'objet le plus proche d'une position.
 *
 * @param {object[]} features   les entités d'une couche
 * @param {[number, number]} position `[lng, lat]`
 * @param {(f: object) => [number, number]|null} centre  où se trouve une entité
 * @returns {{ idx: number, distance: number } | null} `idx` est le rang dans
 *   `features` — celui qu'Atlas utilise pour ouvrir la fiche.
 */
export function objetLePlusProche(features, position, centre) {
  if (!Array.isArray(features) || !features.length || typeof centre !== 'function') return null;
  let meilleur = null;
  features.forEach((f, idx) => {
    const d = distanceMetres(centre(f), position);
    if (!Number.isFinite(d)) return;
    if (!meilleur || d < meilleur.distance) meilleur = { idx, distance: d };
  });
  return meilleur;
}

/**
 * Une distance dite comme on la dit sur le terrain.
 *
 * Au mètre près sous 100 m, par dizaines ensuite, en kilomètres au-delà :
 * « à 437 m » annonce une précision que le GPS d'un téléphone n'a pas.
 */
export function direDistance(m) {
  if (!Number.isFinite(m)) return '';
  if (m < 100) return `à ${Math.round(m)} m`;
  if (m < 1000) return `à ${Math.round(m / 10) * 10} m`;
  const km = m / 1000;
  return `à ${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} km`;
}

/**
 * Ce que la pastille liste : une entrée par couche en relevé, avec les titres
 * des formulaires qu'elle offre.
 *
 * @param {{ couche: object, formulaires: {titre: string}[] }[]} entrees
 */
export function lignesReleve(entrees) {
  return (entrees || [])
    .filter((e) => e?.couche && Array.isArray(e.formulaires) && e.formulaires.length)
    .map((e) => ({
      couche: e.couche,
      nom: e.couche.name || e.couche.sourceTable || 'Couche',
      formulaires: [...new Set(e.formulaires.map((f) => f.titre).filter(Boolean))],
    }));
}
