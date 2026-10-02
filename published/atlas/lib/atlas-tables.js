/**
 * Les tables d'Atlas dans le document de l'utilisateur — un seul endroit.
 *
 * Quatre listes différentes en parlaient (`GEO_SKIP_TABLES`, `TABLES_RESERVEES`,
 * `PROBE_TABLE_PREF`, l'expression de `table-reference`), et chaque ajout de
 * table en touchait quatre ou cinq. Celle-ci donne le vocabulaire ; les autres
 * en tirent ce dont elles ont besoin.
 *
 * Une table d'Atlas n'est jamais une couche : ses colonnes de forme (un alias
 * `geometry`, `wkt`) la feraient proposer comme telle.
 *
 * Les tables de DONNÉES d'une couche enregistrée depuis Atlas (`Atlas_<nom>`,
 * voir `entableLayer`) ne sont pas ici : ce sont des couches, et elles doivent
 * le rester.
 */

/** Écrites par Atlas pour retenir la configuration d'un document. */
export const TABLES_CONFIGURATION = Object.freeze([
  'Atlas_LayerPrefs',
  'Atlas_ScenePrefs',
  'Atlas_Story',
]);

/** L'inventaire des couches d'une scène sans manifeste. */
export const TABLES_INVENTAIRE = Object.freeze(['Maquette_Layers']);

/** Produites en amont (qgis2grist), lues par Atlas. */
export const TABLES_AMONT = Object.freeze(['SceneManifest', 'QgisWidgets']);

/**
 * Noms gardés d'avance pour les chantiers cadrés : une couche importée qui
 * prendrait l'un d'eux ferait écrire Atlas dans la table de l'utilisateur le
 * jour où la fonction arrive.
 */
export const TABLES_PREVUES = Object.freeze([
  'Atlas_Propositions',
  'Atlas_Scenes',
  'Atlas_Progression',
]);

/** Toutes les tables qu'Atlas possède ou se réserve : jamais des couches. */
export const TABLES_ATLAS = Object.freeze([
  ...TABLES_CONFIGURATION,
  ...TABLES_INVENTAIRE,
  ...TABLES_AMONT,
  ...TABLES_PREVUES,
]);

const EN_MINUSCULES = new Set(TABLES_ATLAS.map((t) => t.toLowerCase()));

/** Ce nom est-il celui d'une table d'Atlas (casse ignorée, comme Grist) ? */
export function estTableAtlas(nom) {
  return EN_MINUSCULES.has(String(nom || '').toLowerCase());
}

/**
 * Un nom de table qui ne prend ni une table d'Atlas ni une table existante.
 *
 * @param {string} voulu
 * @param {Iterable<string>} [existantes]
 * @returns {string}
 */
export function nomDeTableLibre(voulu, existantes = []) {
  const pris = new Set([...existantes].map((t) => String(t).toLowerCase()));
  const libre = (n) => !estTableAtlas(n) && !pris.has(n.toLowerCase());
  const base = String(voulu || 'Table');
  if (libre(base)) return base;
  // « Atlas_Propositions » devient « Atlas_Propositions_donnees », puis _2, _3…
  const racine = estTableAtlas(base) ? `${base}_donnees` : base;
  if (libre(racine)) return racine;
  for (let n = 2; n < 1000; n++) {
    if (libre(`${racine}_${n}`)) return `${racine}_${n}`;
  }
  return `${racine}_${Date.now()}`;
}
