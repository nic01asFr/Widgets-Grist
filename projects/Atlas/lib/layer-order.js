/**
 * Ordre d'affichage des couches.
 *
 * MapLibre empile dans l'ordre d'ajout, et Atlas ajoute toujours au sommet : une
 * couche remontée — bascule de visibilité, chargement différé, changement de
 * style, repli en points — repasse donc devant les autres. L'ordre observé
 * dépendait de l'historique des clics, pas d'un état.
 *
 * Ce module calcule la séquence de `moveLayer` qui rétablit l'ordre voulu. Il ne
 * touche pas à la carte : il produit une liste d'identifiants, l'appelant agit.
 *
 * SENS — la **dernière** couche de `STATE.layers` est peinte **au-dessus**.
 * C'est la sémantique existante : la redéfinir inverserait la superposition de
 * toutes les scènes déjà enregistrées. L'interface, elle, présente la liste à
 * l'envers pour respecter l'usage des SIG (cf. CADRAGE-ORDRE-COUCHES.md §4).
 */

/** Couches système à maintenir au-dessus des données, dans cet ordre. */
/**
 * Habillages systeme toujours peints au-dessus des couches de donnees.
 *
 * Le halo de selection compte trois couches — remplissage, contour, anneau —
 * car une couche `circle` posee sur un polygone dessine un disque par sommet.
 * Les trois doivent remonter ensemble, sinon le contour d'un objet selectionne
 * passerait sous la couche qui le porte.
 */
export const SYSTEM_TOP_IDS = ['sel-hl-fill', 'sel-hl-line', 'sel-hl-ring'];

/**
 * Habillages d'une couche, **du plus bas au plus haut**.
 *
 * Contour et étiquettes doivent rester au-dessus de leur propre remplissage :
 * le groupe se déplace d'un bloc, jamais séparément.
 *
 * @param {{id: string}} layer
 * @returns {string[]}
 */
export function layerGfxIds(layer) {
  const id = layer?.id;
  if (!id) return [];
  // `-pts` (repli en points) se superpose au remplissage ; `-label` domine tout.
  return [id, `${id}-outline`, `${id}-pts`, `${id}-label`];
}

/**
 * Séquence complète, du bas vers le haut, couches système comprises.
 *
 * @param {Array<{id: string}>} layers dans l'ordre de `STATE.layers`
 * @returns {string[]}
 */
export function orderedGfxIds(layers) {
  const out = [];
  for (const l of layers || []) out.push(...layerGfxIds(l));
  out.push(...SYSTEM_TOP_IDS);
  return out;
}

/**
 * Identifiants à passer à `map.moveLayer`, dans l'ordre d'appel.
 *
 * `moveLayer(id)` sans destination place la couche au sommet : en parcourant du
 * bas vers le haut, la dernière traitée finit donc au-dessus. Les identifiants
 * absents de la carte sont écartés — une couche différée n'est pas encore
 * montée, un contour d'épaisseur nulle n'existe pas, le repli en points
 * n'apparaît que sous son seuil de zoom.
 *
 * @param {Array<{id: string}>} layers
 * @param {(id: string) => boolean} exists
 * @returns {string[]}
 */
export function moveSequence(layers, exists) {
  const present = typeof exists === 'function' ? exists : () => true;
  return orderedGfxIds(layers).filter((id) => present(id));
}

/* ------------------------------------------------------------------ *
 * Réordonnancement — le vocabulaire est celui de l'utilisateur.
 *
 * Dans le panneau, la liste est présentée du dessus vers le dessous (usage
 * SIG). « Monter » signifie donc **avancer vers la fin** de `STATE.layers`.
 * On raisonne ici en direction visuelle pour éviter les erreurs de signe.
 * ------------------------------------------------------------------ */

/** Ordre d'affichage du panneau : le dessus d'abord. */
export function displayOrder(layers) {
  return [...(layers || [])].reverse();
}

/**
 * Déplace une couche d'un cran, en **direction visuelle**.
 *
 * @param {Array<{id: string}>} layers
 * @param {string} id
 * @param {'up'|'down'} direction 'up' = vers le dessus de la carte
 * @returns {Array} nouveau tableau ; l'entrée est rendue telle quelle si le
 *   mouvement est impossible (bord, couche inconnue, liste d'un élément)
 */
export function moveLayerInStack(layers, id, direction) {
  const list = [...(layers || [])];
  const i = list.findIndex((l) => l?.id === id);
  if (i === -1) return list;
  const j = direction === 'up' ? i + 1 : i - 1;
  if (j < 0 || j >= list.length) return list;
  [list[i], list[j]] = [list[j], list[i]];
  return list;
}

/**
 * Position de dépôt d'un glisser-déposer, dans l'ordre **affiché**.
 *
 * On compare l'ordonnée du pointeur au milieu de chaque ligne : au-dessus du
 * milieu, on s'insère avant ; en dessous, après. Comparer aux bords ferait
 * osciller la cible au moindre tremblement du doigt.
 *
 * @param {Array<{top: number, bottom: number}>} rects lignes visibles, dans l'ordre affiché
 * @param {number} y ordonnée du pointeur
 * @returns {number} index d'insertion dans la liste affichée, de 0 à rects.length
 */
export function dropIndex(rects, y) {
  const list = rects || [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (y < (r.top + r.bottom) / 2) return i;
  }
  return list.length;
}

/**
 * Applique un dépôt : la couche part de `fromDisplay` et arrive avant
 * `toDisplay`, **en indices d'affichage** (dessus en premier).
 *
 * @returns {Array} nouveau `STATE.layers`, ou l'entrée si rien ne bouge
 */
export function reorderByDrop(layers, fromDisplay, toDisplay) {
  const vue = displayOrder(layers);
  if (fromDisplay < 0 || fromDisplay >= vue.length) return [...(layers || [])];
  let to = toDisplay;
  if (to > fromDisplay) to -= 1; // la ligne saisie quitte la liste avant l'insertion
  if (to === fromDisplay || to < 0 || to > vue.length) return [...(layers || [])];
  const [saisie] = vue.splice(fromDisplay, 1);
  vue.splice(to, 0, saisie);
  return vue.reverse(); // retour à la sémantique interne : dernier = au-dessus
}

/** Rang de peinture d'un type de géométrie : surfaces dessous, points dessus. */
const GEOM_RANK = { Polygon: 0, MultiPolygon: 0, LineString: 1, MultiLineString: 1, Line: 1 };
const geomRank = (g) => (g in GEOM_RANK ? GEOM_RANK[g] : 2);

/**
 * Où insérer une nouvelle couche.
 *
 * Empiler systématiquement au sommet met un bâti importé après un réseau
 * **par-dessus** lui — c'est le cas rencontré à l'étape 9 du récit CRESO, où
 * 38 848 bâtiments recouvraient la voirie. On insère donc au-dessus des
 * géométries de même rang ou inférieur, et sous les plus fines.
 *
 * @returns {number} index d'insertion dans `STATE.layers`
 */
export function insertionIndex(layers, geometryType) {
  const list = layers || [];
  const r = geomRank(geometryType);
  let i = list.length;
  while (i > 0 && geomRank(list[i - 1]?.geometryType) > r) i--;
  return i;
}

/**
 * Trie selon les rangs enregistrés. Une couche sans rang conserve sa place
 * relative, à la suite de celles qui en ont un — un document antérieur à cette
 * fonctionnalité doit s'ouvrir à l'identique.
 *
 * @param {Array<{sourceTable?: string, id: string}>} layers
 * @param {Map<string, number>|object} rankByKey rang par table source ou id
 */
export function sortByRank(layers, rankByKey) {
  const get = (k) => (rankByKey instanceof Map ? rankByKey.get(k) : rankByKey?.[k]);
  const rangDe = (l) => {
    const r = get(l?.sourceTable) ?? get(l?.id);
    return Number.isFinite(r) ? r : null;
  };
  return [...(layers || [])]
    .map((l, i) => ({ l, i, r: rangDe(l) }))
    .sort((a, b) => {
      if (a.r == null && b.r == null) return a.i - b.i;
      if (a.r == null) return 1;
      if (b.r == null) return -1;
      return a.r - b.r || a.i - b.i;
    })
    .map((x) => x.l);
}
