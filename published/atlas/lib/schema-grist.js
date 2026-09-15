/**
 * Le schéma du document, lu une fois et rendu exploitable.
 *
 * ## Pourquoi ce module existe
 *
 * Atlas lisait déjà `_grist_Tables` et `_grist_Tables_column` — `scanGeoTables`
 * le fait pour trouver les couches — mais il **jetait les types** : il ne
 * retenait que les noms de colonnes, ce qui suffisait à repérer une géométrie
 * et à rien d'autre.
 *
 * Or deux choses en dépendent maintenant :
 *
 * - **quelles tables référencent une couche**, ce qui demande de lire les types
 *   `Ref:Table` ;
 * - **quel widget pour quelle colonne**, ce que `formdef-from-table.js` déduit
 *   du type.
 *
 * Le module tient donc la lecture, et `scanGeoTables` s'y ramène : deux
 * requêtes de métadonnées, une seule fois, quel que soit le volume du document.
 * Les rendre deux fois aurait doublé le coût d'ouverture pour la même réponse.
 */

/** Tables système, jamais candidates à quoi que ce soit. */
const PREFIXES_SYSTEME = ['_grist_', 'GristHidden_'];

export function estTableSysteme(table) {
  const t = String(table || '');
  return !t || PREFIXES_SYSTEME.some((p) => t.startsWith(p));
}

/**
 * Le schéma, depuis les deux tables de métadonnées telles que `fetchTable` les
 * rend — colonnaires, donc un tableau par attribut.
 *
 * Tolérant par construction : un document ancien, ou un faux `docApi` de test,
 * peut ne pas porter `type`, `label` ou `isFormula`. Une colonne sans type vaut
 * `Text`, ce qui donne un champ libre — jamais une erreur.
 *
 * @returns {Object<string, Array<{colId: string, type: string, label: string, isFormula: boolean, widgetOptions: string}>>}
 */
export function schemaDepuisMeta(tables, cols) {
  const nomParRef = {};
  (tables?.id || []).forEach((rowId, i) => { nomParRef[rowId] = tables.tableId?.[i]; });

  const out = {};
  (cols?.id || []).forEach((_, i) => {
    const table = nomParRef[cols.parentId?.[i]];
    const colId = cols.colId?.[i];
    if (!table || !colId) return;
    (out[table] = out[table] || []).push({
      colId,
      type: cols.type?.[i] || 'Text',
      label: cols.label?.[i] || '',
      isFormula: !!cols.isFormula?.[i],
      widgetOptions: cols.widgetOptions?.[i] || '',
    });
  });
  return out;
}

/** Les deux lectures de métadonnées, et rien d'autre. */
export async function chargerSchema(docApi) {
  if (!docApi) return {};
  try {
    const [tables, cols] = await Promise.all([
      docApi.fetchTable('_grist_Tables'),
      docApi.fetchTable('_grist_Tables_column'),
    ]);
    return schemaDepuisMeta(tables, cols);
  } catch (_) {
    // Un document sans métadonnées accessibles n'est pas une erreur d'Atlas :
    // il n'aura simplement ni couche découverte ni formulaire dérivé.
    return {};
  }
}

/** Les colonnes d'une table, ou une liste vide. */
export function colonnesDe(schema, table) {
  return (schema && schema[table]) || [];
}

/**
 * Les tables qui **référencent** celle-ci, et par quelle colonne.
 *
 * C'est toute la définition d'un formulaire lié : *sa table cible porte une
 * colonne `Ref:` vers la table de la couche*. Rien n'est déclaré nulle part —
 * créer un formulaire de visite depuis une couche fait poser la colonne par
 * `ensure-schema`, et la lecture la retrouve ensuite comme n'importe quelle
 * autre.
 *
 * Deux restrictions, chacune pour une raison :
 *
 * - **`Ref:` seulement, pas `RefList:`.** Une liste de références dirait qu'un
 *   relevé porte sur plusieurs objets à la fois ; y injecter l'objet cliqué
 *   demanderait de l'ajouter à une liste existante, ce qui n'est pas le même
 *   geste. Le jour où le cas se présente, il se traitera pour lui-même.
 * - **pas d'auto-référence.** Une table qui se référence elle-même décrit une
 *   hiérarchie, pas un relevé.
 *
 * Quand une table référence **deux fois** la même — `batiment_avant`,
 * `batiment_apres` — on retient la première colonne et l'appelant l'affiche.
 * Choisir en silence serait le mode de panne habituel de ce dépôt.
 *
 * @returns {Array<{table: string, via: string}>}
 */
export function tablesReferencant(schema, table) {
  if (!schema || !table) return [];
  const attendu = `Ref:${table}`;
  const out = [];
  for (const [autre, colonnes] of Object.entries(schema)) {
    if (autre === table || estTableSysteme(autre)) continue;
    const ref = colonnes.find((c) => c && c.type === attendu && !c.isFormula);
    if (ref) out.push({ table: autre, via: ref.colId });
  }
  return out;
}
