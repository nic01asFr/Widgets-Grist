/**
 * Chercher un objet par son nom, depuis la palette.
 *
 * La barre du haut promet « Rechercher un objet, une couche, un lieu… » ; la
 * palette ne connaissait que les modules, les couches et les actions. Taper le
 * nom d'un arrêt de bus ne rendait « Aucun résultat » — constaté le 15/09/2026
 * en lecture, où la palette est pourtant la seule recherche.
 *
 * On cherche dans le **nom** de l'objet, pas dans tous ses attributs : une
 * recherche plein texte ferait remonter chaque objet qui porte « oui » ou
 * « 1 », et 2 820 bâtiments ne se parcourent pas dans une liste.
 */

/** Les propriétés qui portent un nom lisible, dans l'ordre où on les essaie. */
export const CHAMPS_NOM = Object.freeze([
  'name', 'nom', 'Name', 'Nom', 'NOM', 'libelle', 'Libelle', 'label', 'titre', 'title',
  'toponyme', 'ref', 'Ref',
]);

/** Minuscules, sans accents : « Barbusse » se trouve en tapant « barbusse ». */
export function normaliser(texte) {
  return String(texte ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Le nom lisible d'un objet, ou `null` s'il n'en porte pas. */
export function nomObjet(properties) {
  if (!properties || typeof properties !== 'object') return null;
  for (const champ of CHAMPS_NOM) {
    const v = properties[champ];
    if (v == null) continue;
    if (typeof v !== 'string' && typeof v !== 'number') continue;
    const t = String(v).trim();
    if (t) return t;
  }
  return null;
}

/**
 * Les objets dont le nom contient la requête.
 *
 * Seules les couches visibles comptent : proposer un objet qu'on ne verra pas
 * en y allant serait une promesse creuse. Les noms qui **commencent** par la
 * requête passent devant, puis les plus courts — « Colbert » avant « Barbusse
 * Colbert » quand on tape « colb ».
 *
 * @param {object[]} couches `{ id, name, visible, geojson }`
 * @param {string} requete
 * @param {{max?: number, minLongueur?: number}} [options]
 * @returns {{coucheId: string, couche: string, idx: number, nom: string}[]}
 */
export function objetsPourPalette(couches, requete, { max = 8, minLongueur = 2 } = {}) {
  const q = normaliser(requete).trim();
  if (q.length < minLongueur) return [];
  const trouves = [];
  for (const couche of couches || []) {
    if (!couche || couche.visible === false) continue;
    const entites = couche.geojson?.features;
    if (!Array.isArray(entites)) continue;
    for (let i = 0; i < entites.length; i++) {
      const nom = nomObjet(entites[i]?.properties);
      if (!nom) continue;
      const n = normaliser(nom);
      const pos = n.indexOf(q);
      if (pos < 0) continue;
      trouves.push({ coucheId: couche.id, couche: couche.name, idx: i, nom, _debut: pos === 0 });
    }
  }
  trouves.sort((a, b) => (b._debut - a._debut) || (a.nom.length - b.nom.length));
  return trouves.slice(0, max).map(({ _debut, ...o }) => o);
}
