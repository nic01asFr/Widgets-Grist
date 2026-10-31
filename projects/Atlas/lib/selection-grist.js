/**
 * La ligne que Grist désigne, retrouvée sur la carte.
 *
 * Quand Atlas est un widget dans un document Grist et que la personne sélectionne une ligne ailleurs (un autre widget,
 * ou la table elle-même), Grist remet à Atlas cette ligne par `grist.onRecord`. Une couche liée à une table
 * (`layer.sourceTable`) porte sur chaque entité l'identifiant de la ligne dans `properties._row_id` : c'est la seule
 * correspondance dont on a besoin, sans colonne-clé à configurer et sans règle propre à une application.
 *
 * Module pur (aucun accès à la carte ni à Grist) : il se teste sous Node.
 */
export const VERSION = '1.0.0';

/** L'identifiant de ligne d'un enregistrement remis par Grist, ou `null` (ligne vide, ligne en cours de création). */
export function idLigne(enregistrement) {
  const id = enregistrement && enregistrement.id;
  return typeof id === 'number' && Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * La couche liée à `table` qui porte l'entité de la ligne `rowId`, et son rang dans la couche.
 * Une couche visible passe avant une couche masquée : si la même table est montrée deux fois, c'est celle qu'on voit.
 * @param {{id:string, visible?:boolean, sourceTable?:string, geojson?:{features?:object[]}}[]} couches
 * @param {string|null} table  identifiant de la table de la section du widget
 * @param {number|null} rowId
 * @returns {{layer:object, idx:number}|null}
 */
export function retrouverEntite(couches, table, rowId) {
  if (!table || rowId == null || !Array.isArray(couches)) return null;
  const candidates = couches.filter((l) => l && l.sourceTable === table);
  candidates.sort((a, b) => (b.visible !== false) - (a.visible !== false));
  for (const layer of candidates) {
    const entites = layer.geojson && layer.geojson.features;
    if (!Array.isArray(entites)) continue;
    const idx = entites.findIndex((f) => f && f.properties && f.properties._row_id === rowId);
    if (idx !== -1) return { layer, idx };
  }
  return null;
}
