/**
 * Créer une copie synchronisable : le plan d'import d'une table PostgreSQL DÉCLARÉE modifiable (`pg_gateway_lire`).
 *
 * Module pur. Il réutilise `planImportPg` (mêmes conventions : `latitude`/`longitude` pour les points, `geometry_json` +
 * `centroid_lat`/`centroid_lon` pour le reste, lots de 100, `null` conservé) et y ajoute ce que la synchronisation doit retenir :
 * la configuration de la copie (correspondance colonne PostgreSQL ⇄ colonne Grist) et la version de chaque ligne à cet instant.
 *
 * Une table sans colonne géométrique devient une simple table Grist, jamais une couche.
 */

import { planImportPg } from './pg-import.js?v=20261109a';

/**
 * @param {object} p
 * @param {{lignes: {cle: object, valeurs: object, version: string|number, actif?: boolean}[], tronque?: boolean}} p.lecture  réponse de `pg_gateway_lire`
 * @param {{colonnes: {nom: string, type_grist: string}[]}} p.table  réponse de `pg_gateway_table` (types Grist proposés)
 * @param {{schema: string, table: string, cle: string[], colonnes: string[], geometrie: string|null, version: string, suppression: string}} p.decl  une entrée de `pg_gateway_tables_modifiables`
 * @param {string} p.url  adresse de la passerelle (jamais le jeton)
 * @param {string} p.connexion
 * @param {string} p.nom
 * @param {string[]} [p.tables]  les tables du document
 */
export function planCopie({ lecture, table, decl, url, connexion, nom, tables = [] }) {
  if (lecture.tronque) {
    return { ok: false, erreur: 'La table est trop grande pour une copie complète (plus de 50 000 lignes, ou une passerelle sans lecture par pages) : une synchronisation compare toutes les lignes.' };
  }
  const lignes = (lecture.lignes || []).filter((l) => l.actif !== false); // une ligne désactivée dans PostgreSQL n'a pas de copie
  if (!lignes.length) return { ok: false, erreur: 'La table ne contient aucune ligne active : rien à copier.' };

  const types = new Map((table.colonnes || []).map((c) => [c.nom, c.type_grist]));
  const colonnesCle = decl.cle;
  const colonnesPg = decl.colonnes.filter((c) => c !== decl.geometrie);
  const noms = [...colonnesCle, ...colonnesPg];
  const features = lignes.map((l) => ({
    type: 'Feature',
    geometry: decl.geometrie ? (l.valeurs[decl.geometrie] ?? null) : null,
    properties: { ...l.cle, ...Object.fromEntries(colonnesPg.map((c) => [c, l.valeurs[c] ?? null])) },
  }));
  const couche = {
    type: 'FeatureCollection', features, tronque: false, avertissements: [],
    colonnes: noms.map((n) => ({ nom: n, type_grist: types.get(n) || null })).filter((c) => c.type_grist),
  };
  const plan = planImportPg({ couche, nom, tables, sansGeometrie: !decl.geometrie });
  if (!plan.ok) return plan;

  const idDe = (pg) => (plan.colonnes.find((c) => c.label === pg) || {}).id;
  const typeDe = (pg) => (plan.colonnes.find((c) => c.label === pg) || {}).type;
  let geometrie = null;
  if (decl.geometrie && plan.geometrie === 'Point') {
    geometrie = { pg: decl.geometrie, mode: 'point', lat: 'latitude', lng: 'longitude' };
  } else if (decl.geometrie && plan.geometrie) {
    geometrie = { pg: decl.geometrie, mode: 'json', grist: 'geometry_json', lat: 'centroid_lat', lng: 'centroid_lon' };
  }
  const avertissements = [...plan.avertissements];
  if (decl.geometrie && !geometrie) avertissements.push('Aucune géométrie renseignée : la copie ne porte pas la colonne géométrique et ne la synchronisera pas.');

  const config = {
    genre: 'copie',
    url: String(url).replace(/\/+$/, ''),
    connexion,
    schema: decl.schema,
    table: decl.table,
    tableGrist: plan.tableId, // corrigé après création si Grist a pris un autre nom
    cles: colonnesCle.map((pg) => ({ pg, grist: idDe(pg), type: typeDe(pg) })),
    colonnes: colonnesPg.map((pg) => ({ pg, grist: idDe(pg), type: typeDe(pg) })),
    geometrie,
    suppression: decl.suppression,
    version: decl.version === 'hachage' ? 'hachage' : 'colonne',
  };
  return {
    ...plan,
    avertissements,
    copie: { config, versions: lignes.map((l) => ({ cle: l.cle, version: l.version })) },
  };
}
