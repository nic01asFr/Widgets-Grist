/**
 * L'identifiant d'un modèle 3D dans le schéma Atlas.
 *
 * Un identifiant de modèle — `style.library.modelId`, `_modelId` d'une entité (colonne
 * `atlas_3d_json`), `categories[].modelId`, `defaultModelId`, le manifeste de scène — désigne
 * **un modèle parmi deux familles**, dont l'identifiant dit lui-même laquelle :
 *
 * | forme            | famille                                   | exemple                  |
 * |------------------|-------------------------------------------|--------------------------|
 * | `<id>`           | bibliothèque low-poly (`models/`)         | `streetlamp`             |
 * | `objet:<type>`   | type du catalogue d'objets réalistes      | `objet:applique_facade`  |
 *
 * Le préfixe n'est pas décoratif : les identifiants low-poly existent depuis les premières
 * scènes et sont écrits en clair dans des tables Grist, des manifestes et des démos. Aucun ne
 * porte de `:`, donc `objet:` ne peut jamais en recouvrir un, et **tout identifiant ancien reste
 * lisible tel quel**. Un identifiant `objet:` désigne le *type* (« Applique de façade »), pas un
 * fichier : la variante, la classe de hauteur et le niveau de détail restent choisis par le
 * catalogue (spec `atlas-objets/0.1` §3.7), sans quoi une scène figerait un nom de fichier.
 *
 * Tout ici est pur : ni DOM, ni MapLibre, ni réseau.
 */

/** Préfixe des identifiants de type du catalogue d'objets. */
export const PREFIXE_OBJET = 'objet:';

/** Un identifiant de type de catalogue : minuscules, chiffres, `_` et `-` (comme dans `catalog.json`). */
const TYPE_VALIDE = /^[A-Za-z0-9_-]+$/;

/** L'identifiant de modèle d'un type du catalogue : `idObjet('applique_facade')`. */
export function idObjet(typeId) {
  const t = String(typeId ?? '').trim();
  return TYPE_VALIDE.test(t) ? PREFIXE_OBJET + t : null;
}

/** Cet identifiant désigne-t-il un type du catalogue d'objets ? */
export function estIdObjet(id) {
  return typeof id === 'string' && id.startsWith(PREFIXE_OBJET) && TYPE_VALIDE.test(id.slice(PREFIXE_OBJET.length));
}

/** Le type visé par un identifiant `objet:<type>`, ou `null`. */
export function typeDeIdObjet(id) {
  return estIdObjet(id) ? id.slice(PREFIXE_OBJET.length) : null;
}

/** La famille d'un identifiant : `'objet'`, `'bibliotheque'`, ou `null` s'il est vide ou mal formé. */
export function genreDeModele(id) {
  if (id == null || id === '') return null;
  if (typeof id !== 'string') return null;
  if (id.startsWith(PREFIXE_OBJET)) return estIdObjet(id) ? 'objet' : null;
  return id.includes(':') ? null : 'bibliotheque';
}

/**
 * La fiche d'un type du catalogue, telle que l'interface la montre : un nom, une famille,
 * l'identifiant à écrire dans le schéma, et ce qui conditionne l'affichage.
 *
 * @param {{id: string, name?: string, family?: string, category?: string, fallback?: string, variants?: number}} type
 * @param {Array<{type: string, licence?: {usage?: string}}>} assets
 */
export function ficheObjet(type, assets = []) {
  const fichiers = (assets || []).filter((a) => a.type === type.id);
  return {
    id: idObjet(type.id),
    typeId: type.id,
    nom: type.name || type.id,
    famille: type.family || type.category || null,
    categorie: type.category || type.family || null,
    repli: type.fallback || null,
    variantes: Number.isInteger(type.variants) && type.variants > 0 ? type.variants : 1,
    fichiers: fichiers.length,
    // Un fichier réservé à un usage interne n'est pas servi sur une page publique (spec §3.8).
    interne: fichiers.some((a) => a.licence?.usage === 'internal'),
  };
}

/** Les fiches de tous les types d'un catalogue lu par `lireCatalogue`, dans l'ordre du catalogue. */
export function fichesObjets(cat) {
  return (cat?.types || []).map((t) => ficheObjet(t, cat.assets)).filter((f) => f.id);
}

/** La fiche désignée par un identifiant `objet:<type>`, ou `null` (catalogue absent, type inconnu). */
export function ficheDeId(cat, id) {
  const typeId = typeDeIdObjet(id);
  if (!typeId) return null;
  const type = (cat?.types || []).find((t) => t.id === typeId);
  return type ? ficheObjet(type, cat.assets) : null;
}

/**
 * Un identifiant de modèle est-il admissible, et reconnu ?
 *
 * `valide` dit si la **forme** est bonne ; `connu` dit si le modèle existe aujourd'hui. Un
 * identifiant `objet:` bien formé mais absent du catalogue chargé est `valide` et pas `connu` :
 * le catalogue peut ne pas être encore arrivé, ou avoir changé — l'identifiant est conservé,
 * jamais effacé, et l'objet retombe sur le modèle de sa couche (spec §3.4).
 *
 * @param {unknown} id
 * @param {{bibliotheque?: Iterable<string>, cat?: object|null}} o  `bibliotheque` : les identifiants low-poly connus
 * @returns {{valide: boolean, genre: 'objet'|'bibliotheque'|null, connu: boolean|null}}
 */
export function verifierIdModele(id, { bibliotheque = null, cat = null } = {}) {
  const genre = genreDeModele(id);
  if (!genre) return { valide: false, genre: null, connu: null };
  if (genre === 'objet') {
    return { valide: true, genre, connu: cat ? !!ficheDeId(cat, id) : null };
  }
  return { valide: true, genre, connu: bibliotheque ? new Set(bibliotheque).has(id) : null };
}
