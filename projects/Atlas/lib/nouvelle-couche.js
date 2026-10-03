/**
 * Créer une couche vide depuis Atlas : une table Grist, sa ligne d'inventaire,
 * sa ligne d'apparence — en une seule transaction.
 *
 * Lot 1 du chantier d'édition géométrique (`docs/CADRAGE-EDITION-GEOMETRIES.md`).
 * Rien ici ne touche Grist ni le DOM : le module rend un nom de table, des
 * colonnes, un paquet d'actions et la lecture de la réponse. `app_v7.js` envoie
 * le paquet et monte la couche.
 *
 * Trois choix, mesurés ou tranchés au cadrage :
 *
 * - **Une couche = une table d'un seul type.** Le type d'une table vide ne se
 *   devine pas : c'est la ligne de `Maquette_Layers` qui le porte, et c'est elle
 *   qui fait remonter la couche au rechargement.
 * - **Une seule `applyUserActions`.** Un refus ne laisse ni table orpheline, ni
 *   inventaire qui pointe dans le vide.
 * - **Colonnes plates** `{ id, type, label }` : `AddTable` ignore sans erreur la
 *   forme `{ id, fields }` (mesuré le 26/09/2026, cf. `CLAUDE.md`).
 */

export const TYPES_COUCHE = ['Point', 'LineString', 'Polygon'];

/** Libellés montrés à l'utilisateur. */
export const LIBELLES_TYPE = { Point: 'Point', LineString: 'Ligne', Polygon: 'Surface' };

/**
 * Tables qu'une couche ne doit jamais prendre : celles d'Atlas et de ses
 * producteurs. Une couche nommée « Maquette Layers » écraserait l'inventaire.
 */
const TABLES_RESERVEES = new Set([
  'maquette_layers', 'scenemanifest', 'qgiswidgets', 'formdef', 'formulaires', 'artefacts',
]);
const PREFIXES_RESERVES = ['atlas_', '_grist', 'gristhidden_'];

/** Longueur maximale d'un nom de table, pour qu'il reste lisible dans Grist. */
const LONGUEUR_MAX = 60;

/**
 * L'identifiant Grist d'un nom saisi : accents translittérés, le reste réduit
 * à des soulignés, première lettre en capitale — Grist met lui-même une
 * capitale en tête d'un identifiant de table, et on montre le nom tel qu'il
 * apparaîtra.
 *
 * @returns {string} vide si le nom ne contient aucune lettre ni chiffre
 */
export function idTableDepuisNom(nom) {
  let v = String(nom == null ? '' : nom).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[æÆ]/g, 'ae').replace(/[œŒ]/g, 'oe')
    .trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!v) return '';
  if (!/^[a-zA-Z]/.test(v)) v = 'Couche_' + v;
  v = v.slice(0, LONGUEUR_MAX).replace(/_+$/, '');
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function estReservee(id) {
  const b = String(id).toLowerCase();
  return TABLES_RESERVEES.has(b) || PREFIXES_RESERVES.some((p) => b.startsWith(p));
}

/**
 * Le nom de table qu'aura la couche, et pourquoi on ne peut pas la créer.
 *
 * Les identifiants de table Grist ne distinguent pas la casse : « arbres » et
 * « Arbres » sont la même table. Une collision propose `Arbres_2` **avant**
 * d'écrire, plutôt que de laisser Grist renommer en silence.
 *
 * @param {{ nom: string, type: string, tables?: string[] }} p
 * @returns {{ ok: boolean, tableId?: string, erreur?: string, renomme?: boolean }}
 */
export function planNouvelleCouche({ nom, type, tables = [] } = {}) {
  const libre = String(nom == null ? '' : nom).trim();
  if (!libre) return { ok: false, erreur: 'Donnez un nom à la couche.' };
  if (!TYPES_COUCHE.includes(type)) return { ok: false, erreur: 'Choisissez point, ligne ou surface.' };
  return planNomDeTable(libre, tables);
}

/**
 * Le nom de table libre pour un nom saisi : translittéré, jamais un nom d'Atlas, suffixé en cas de collision.
 * Partagé avec les tables de relevé que crée le module Formulaires.
 *
 * @returns {{ ok: boolean, tableId?: string, erreur?: string, renomme?: boolean }}
 */
export function planNomDeTable(nom, tables = []) {
  let base = idTableDepuisNom(nom);
  if (!base) return { ok: false, erreur: 'Le nom doit contenir au moins une lettre ou un chiffre.' };
  if (estReservee(base)) base = 'Couche_' + base;
  const prises = new Set(tables.map((t) => String(t).toLowerCase()));
  let tableId = base;
  for (let i = 2; prises.has(tableId.toLowerCase()); i++) tableId = `${base}_${i}`;
  return { ok: true, tableId, renomme: tableId !== base };
}

/**
 * Colonnes de départ : le nom et la géométrie, rien d'autre. Les champs métier
 * s'ajoutent ensuite dans Grist ou par le module Formulaires.
 */
export function colonnesNouvelleCouche(type) {
  const nom = { id: 'nom', type: 'Text', label: 'Nom' };
  if (type === 'Point') {
    return [
      nom,
      { id: 'latitude', type: 'Numeric', label: 'Latitude' },
      { id: 'longitude', type: 'Numeric', label: 'Longitude' },
    ];
  }
  return [nom, { id: 'geometry_json', type: 'Text', label: 'Géométrie (GeoJSON)' }];
}

/** La colonne de géométrie telle que la lit `tableToGeoJSON`. */
export function colonneGeometrieNouvelleCouche(type) {
  return type === 'Point' ? { lat: 'latitude', lng: 'longitude' } : 'geometry_json';
}

/**
 * Le paquet d'actions, et où lire chaque réponse dans `retValues`.
 *
 * @param {object} p
 * @param {string} p.tableId nom de table donné par `planNouvelleCouche`
 * @param {string} p.type
 * @param {string[]} p.tables tables présentes dans le document
 * @param {object} p.inventaire ligne de `Maquette_Layers` (`ligneInventaire`)
 * @param {object} p.prefs ligne d'`Atlas_LayerPrefs` (`lignePrefs`)
 * @param {{ maquette: object[], prefs: object[] }} p.schemas colonnes des deux tables d'Atlas, si absentes
 * @param {object[]} [p.colonnes] les colonnes de la table, à la place de `colonnesNouvelleCouche(type)`
 * @returns {{ actions: any[], indices: { table: number, inventaire: number, prefs: number } }}
 */
export function actionsNouvelleCouche({ tableId, type, tables = [], inventaire, prefs, schemas, colonnes = null }) {
  const actions = [];
  if (!tables.includes('Maquette_Layers')) actions.push(['AddTable', 'Maquette_Layers', schemas.maquette]);
  if (!tables.includes('Atlas_LayerPrefs')) actions.push(['AddTable', 'Atlas_LayerPrefs', schemas.prefs]);
  // `colonnes` : une table qui est aussi une couche sans être « neuve » (celle d'un formulaire lié) a les siennes.
  const table = actions.push(['AddTable', tableId, colonnes || colonnesNouvelleCouche(type)]) - 1;
  const ligne = actions.push(['AddRecord', 'Maquette_Layers', null, inventaire]) - 1;
  const pref = actions.push(['AddRecord', 'Atlas_LayerPrefs', null, prefs]) - 1;
  return { actions, indices: { table, inventaire: ligne, prefs: pref } };
}

/**
 * Ce que Grist a réellement créé.
 *
 * Grist peut renommer la table (course avec une autre création) : le nom réel
 * est dans `retValues[i].table_id`, et c'est lui qui compte.
 *
 * @returns {{ tableId: string, gristId: number|null, prefRowId: number|null, renommee: boolean }}
 */
export function lireCreation(retValues, indices, tableIdDemande) {
  const r = Array.isArray(retValues) ? retValues : [];
  const t = r[indices.table];
  const tableId = (t && typeof t === 'object' && t.table_id) || tableIdDemande;
  const id = (v) => (Number.isInteger(v) && v > 0 ? v : null);
  return {
    tableId,
    gristId: id(r[indices.inventaire]),
    prefRowId: id(r[indices.prefs]),
    renommee: tableId !== tableIdDemande,
  };
}

/**
 * La nature d'un refus, pour le dire juste sans basculer toute la carte en
 * lecture : un éditeur peut avoir le droit d'écrire des lignes sans celui de
 * créer des tables.
 *
 * Libellés mesurés en Grist réel : « Blocked by table create access rules »
 * (403) ; « [Sandbox] KeyError '…' » (500) pour une colonne ou une table
 * absente. Le refus de structure ne s'observe pas avec un compte propriétaire :
 * son libellé reste à relever, le motif est donc large.
 *
 * @returns {'structure' | 'droits' | 'schema' | 'autre'}
 */
export function natureRefus(erreur) {
  const m = String(erreur?.message || erreur || '').toLowerCase();
  if (/schema|structure|blocked by .*(schema|structure)/.test(m) && /blocked|not allowed|denied|permission|access/.test(m)) return 'structure';
  if (/blocked by|access rules|not authori[sz]ed|unauthori[sz]ed|permission|denied|forbidden|view[\s-]?only|read[\s-]?only/.test(m)) return 'droits';
  if (/keyerror|no such (table|column)|unknown (table|column)/.test(m)) return 'schema';
  return 'autre';
}

/** Le message à montrer pour un refus. */
export function messageRefus(erreur) {
  switch (natureRefus(erreur)) {
    case 'structure': return 'Vous pouvez modifier les données de ce document, mais pas y créer de table : demandez au propriétaire de créer la couche, ou de vous en donner le droit.';
    case 'droits': return 'Grist refuse la création : vos droits sur ce document ne le permettent pas.';
    case 'schema': return 'Grist refuse la création : le document ne contient pas ce qu’Atlas attendait. Rechargez le widget et réessayez.';
    default: return 'Grist refuse la création : ' + String(erreur?.message || erreur || 'erreur inconnue');
  }
}
