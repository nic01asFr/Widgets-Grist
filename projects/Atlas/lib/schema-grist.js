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
 * @returns {Object<string, Array<{colId: string, type: string, label: string, isFormula: boolean, widgetOptions: string, visibleCol: string}>>}
 */
export function schemaDepuisMeta(tables, cols) {
  const nomParRef = {};
  (tables?.id || []).forEach((rowId, i) => { nomParRef[rowId] = tables.tableId?.[i]; });

  // `visibleCol` désigne la colonne affichée par son identifiant de ligne
  // dans `_grist_Tables_column` ; on le traduit en nom de colonne.
  const colIdParRef = {};
  (cols?.id || []).forEach((rowId, i) => { colIdParRef[rowId] = cols.colId?.[i]; });

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
      visibleCol: colIdParRef[cols.visibleCol?.[i]] || '',
    });
  });
  return out;
}

/** Les deux lectures de métadonnées, et rien d'autre. */
export async function chargerSchema(docApi) {
  const meta = await chargerMeta(docApi);
  return meta ? schemaDepuisMeta(meta.tables, meta.colonnes) : {};
}

/**
 * Les métadonnées brutes du document — tables, colonnes, et, si `vues` est
 * demandé, les vues et leurs sections, où Grist range ses formulaires.
 *
 * Une seule lecture de `_grist_Tables_column`, la plus lourde, pour le schéma
 * et pour les formulaires. Les vues sont facultatives : illisibles, le
 * document n'a simplement pas de formulaire natif à reprendre.
 *
 * @returns {Promise<{tables, colonnes, vues?, sections?, champs?}|null>}
 */
export async function chargerMeta(docApi, { vues = false } = {}) {
  if (!docApi) return null;
  let tables;
  let colonnes;
  try {
    [tables, colonnes] = await Promise.all([
      docApi.fetchTable('_grist_Tables'),
      docApi.fetchTable('_grist_Tables_column'),
    ]);
  } catch (_) {
    // Un document sans métadonnées accessibles n'est pas une erreur d'Atlas :
    // il n'aura simplement ni couche découverte ni formulaire dérivé.
    return null;
  }
  const meta = { tables, colonnes };
  if (vues) {
    try {
      [meta.vues, meta.sections, meta.champs] = await Promise.all([
        docApi.fetchTable('_grist_Views'),
        docApi.fetchTable('_grist_Views_section'),
        docApi.fetchTable('_grist_Views_section_field'),
      ]);
    } catch (_) { /* pas de formulaire natif */ }
  }
  return meta;
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

/**
 * Le type Grist d'une colonne créée à partir de valeurs, pour `AddTable`.
 *
 * Seules des valeurs **déjà** numériques ou booléennes donnent une colonne
 * typée : une chaîne reste du texte, même si elle a l'air d'un nombre. Dans une
 * colonne `Int`, Grist range « 01004 » en 1004 — un code INSEE, un code postal
 * ou un numéro de parcelle y perdraient leur zéro de tête (mesuré le
 * 26/09/2026). Tant qu'Atlas passait ses colonnes sous une forme que Grist
 * ignorait, tout finissait en texte et la perte ne se voyait pas.
 *
 * Rappel : `AddTable` attend des colonnes **plates**,
 * `{ id, type, label }`. La forme `{ id, fields: { type, label } }` est ignorée
 * sans erreur : colonnes en `Text`, libellé égal à l'identifiant.
 *
 * @param {Iterable<unknown>} valeurs
 * @returns {'Text' | 'Bool' | 'Int' | 'Numeric'}
 */
export function typeColonneDepuisValeurs(valeurs) {
  let vu = false;
  let booleens = true;
  let entiers = true;
  let nombres = true;
  for (const v of valeurs) {
    if (v == null || v === '') continue;
    vu = true;
    if (typeof v !== 'boolean') booleens = false;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      nombres = false;
      entiers = false;
    } else if (!Number.isInteger(v)) {
      entiers = false;
    }
  }
  if (!vu) return 'Text';
  if (booleens) return 'Bool';
  if (entiers) return 'Int';
  if (nombres) return 'Numeric';
  return 'Text';
}
