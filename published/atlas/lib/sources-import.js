/**
 * Les sources d'import d'Atlas : OpenStreetMap, l'IGN, et celles qui viendront.
 *
 * Chaque source est un bouton du panneau Couches et une entrée de la palette de commandes. Les écrire à la main dans
 * `app_v7.js`, une fois pour chaque endroit, obligeait à y toucher à chaque nouvelle source. Ce registre est la liste
 * unique : `{id, nom, libelle, icone, titre, ouvrir}`, où `ouvrir` est le NOM de la fonction de `A` qui ouvre le
 * panneau de la source (`A.openOSM`, `A.openIGN`). Ajouter une source, c'est ajouter une entrée ici et la fonction
 * dans `A` ; rien d'autre ne bouge.
 *
 * Module pur : les icônes (fournies par l'application, qui les dessine) et l'échappement sont des paramètres.
 */

export const SOURCES_IMPORT = Object.freeze([
  Object.freeze({
    id: 'osm', nom: 'OpenStreetMap', libelle: 'OSM', icone: 'globe',
    titre: 'Importer depuis OpenStreetMap', ouvrir: 'openOSM',
  }),
  Object.freeze({
    id: 'ign', nom: 'IGN', libelle: 'IGN', icone: 'carte',
    titre: 'Importer des données de l’IGN (BD TOPO, Admin Express)', ouvrir: 'openIGN',
  }),
]);

/**
 * Les boutons du panneau Couches, dans la grille « Ajouter une couche ».
 * @param {(icone: string) => string} icone le dessin d'une icône, par son nom
 * @param {(texte: string) => string} echapper
 * @param {readonly object[]} [sources]
 */
export function boutonsSourcesImport(icone, echapper, sources = SOURCES_IMPORT) {
  return sources.map((s) => `<button class="btn btn-soft" onclick="A.${s.ouvrir}()" title="${echapper(s.titre)}">${icone(s.icone)} ${echapper(s.libelle)}</button>`).join('\n                ');
}

/**
 * Les entrées de la palette de commandes : « Importer depuis <source> ».
 * @param {{icone: (icone: string) => string, lancer: (source: object) => void, sources?: readonly object[]}} o
 */
export function entreesPaletteSources({ icone, lancer, sources = SOURCES_IMPORT }) {
  return sources.map((s) => ({ label: `Importer depuis ${s.libelle === 'OSM' ? 'OSM' : s.nom}`, kind: 'action', run: () => lancer(s), ic: icone(s.icone) }));
}
