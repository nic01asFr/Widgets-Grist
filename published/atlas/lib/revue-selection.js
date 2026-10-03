/**
 * La revue d'une sélection : passer d'un objet au suivant sans s'arrêter sur ce qu'on ne voit pas.
 *
 * Les filtres d'une couche (ceux d'un contexte compris, voir `buildControlPredicate`) écartent des objets de la carte. La revue
 * porte toute la couche : sans ce module, « suivant » s'arrêtait sur un objet masqué et la fiche s'ouvrait sur du vide. Rien ici
 * ne parle à la carte ni à Grist : on donne la couche, le prédicat des filtres et la liste des indices, on reçoit un indice ou
 * un rang.
 */

export const VERSION = '1.0.0';

/**
 * L'objet d'indice `idx` est-il laissé voir par `garde` ? Sans filtre (`garde` nul) tout l'est ; un indice qui ne désigne aucun
 * objet n'est pas écarté — ce n'est pas aux filtres de le dire.
 */
export function objetAffiche(features, garde, idx) {
  if (!garde) return true;
  const f = features?.[idx];
  return !f || !!garde(f);
}

/**
 * Le pas suivant (`dir` = 1) ou précédent (`dir` = -1) dans `liste` depuis la position `depuis`, en sautant les objets écartés.
 * On boucle sur la liste. Rend la position dans `liste`, ou `null` si les filtres écartent tout.
 */
export function pasAffiche(features, garde, liste, depuis, dir) {
  const n = liste?.length || 0;
  if (!n) return null;
  const sens = dir < 0 ? -1 : 1;
  for (let k = 1; k <= n; k++) {
    const i = (((depuis + sens * k) % n) + n) % n;
    if (objetAffiche(features, garde, liste[i])) return i;
  }
  return null;
}

/**
 * Le rang de l'objet courant parmi ceux qu'on voit, et leur nombre. Si les filtres écartent tout, on retombe sur la sélection
 * entière plutôt que d'annoncer « 0 / 0 ».
 *
 * @param {number} courant position du curseur dans `liste`
 */
export function rangParmiAffiches(features, garde, liste, courant) {
  const n = liste?.length || 0;
  const visibles = garde ? liste.filter((i) => objetAffiche(features, garde, i)) : liste;
  if (!visibles?.length) return { rang: Math.min(courant + 1, n), total: n };
  const r = visibles.indexOf(liste[courant]);
  return { rang: (r < 0 ? 0 : r) + 1, total: visibles.length };
}
