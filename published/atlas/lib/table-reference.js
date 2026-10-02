/**
 * Symbologie par table de référence.
 *
 * Une équipe range souvent l'apparence de ses catégories dans le document :
 * une table « États possibles » avec, pour chaque état, une couleur (`#FF0000`),
 * un rang de gravité et une image. Constaté le 01/10/2026 sur un document de
 * suivi d'ouvrages : trois tables de ce genre (état structurel, sécurité des
 * usagers, type d'ouvrage), et une carte maison qui les lisait à la main.
 *
 * Atlas les lit à son tour : la couleur d'une catégorie, l'ordre de dessin
 * (le plus grave par-dessus), l'icône. Ce module est pur — il raisonne sur le
 * schéma et sur des lignes déjà lues ; c'est l'appelant qui lit les tables.
 *
 * Deux façons de rattacher un champ à sa table :
 * - **par référence** : la colonne est un `Ref:<Table>` — la valeur est
 *   l'identifiant de la ligne ;
 * - **par libellé** : la colonne est un texte (souvent une formule) dont les
 *   valeurs sont les libellés d'une colonne de la table.
 */

const COULEUR_HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const IMAGE_URL = /^https?:\/\/\S+\.(?:png|jpe?g|gif|webp|svg)(?:[?#]\S*)?$/i;
const NOM_COULEUR = /coul|colou?r/i;
const NOM_RANG = /grav|rang|ordre|order|prior|niveau|sever|poids|rank/i;
const NOM_IMAGE = /url|ic[oô]ne|icon|picto|schema|image|symbole|png/i;
const SYSTEME = /^(_grist|Atlas_|Maquette_Layers$|SceneManifest$|Formulaires$|QgisWidgets$|GristCoder|Artefacts$)/;

/** Le type cible d'une colonne `Ref:<Table>`, ou null. */
export function tableReferencee(type) {
  const m = /^Ref:(.+)$/.exec(String(type || ''));
  return m ? m[1] : null;
}

/**
 * Les tables qui peuvent porter l'apparence d'un champ, d'après le schéma
 * seul — sans rien télécharger. Lire toutes les tables pour chercher des
 * couleurs coûterait le document entier (leçon du scan des tables géo).
 *
 * @param {Object<string, Array<{colId:string,type?:string,isFormula?:boolean}>>} schema
 * @param {string} tableCouche  la table de la couche
 * @param {string} champ        la colonne symbolisée
 * @returns {Array<{table: string, parReference: boolean}>}
 */
export function candidatsReference(schema, tableCouche, champ) {
  const col = (schema?.[tableCouche] || []).find((c) => c.colId === champ);
  const cible = tableReferencee(col?.type);
  if (cible) return schema?.[cible] ? [{ table: cible, parReference: true }] : [];
  const out = [];
  for (const [table, colonnes] of Object.entries(schema || {})) {
    if (table === tableCouche || SYSTEME.test(table)) continue;
    const parlante = colonnes.some((c) => NOM_COULEUR.test(c.colId) || NOM_RANG.test(c.colId)
      || (NOM_IMAGE.test(c.colId) && c.type !== 'Ref'));
    if (parlante) out.push({ table, parReference: false });
  }
  return out;
}

const texte = (v) => (v == null ? '' : String(v).trim());
const part = (lignes, col, test) => {
  const vals = lignes.map((l) => l[col]).filter((v) => v != null && v !== '');
  return vals.length ? vals.filter(test).length / vals.length : 0;
};

/**
 * Ce qu'une table de référence apporte pour ces valeurs : la colonne clé, et
 * les colonnes de couleur, de rang et d'image. `null` si elle ne couvre pas
 * les valeurs du champ.
 *
 * @param {Array<{colId:string,type?:string}>} colonnes  colonnes de la table (schéma)
 * @param {Array<object>} lignes   lignes de la table ({ id, col: valeur })
 * @param {Array<any>} valeurs     valeurs distinctes du champ dans la couche
 * @param {boolean} parReference   le champ est un `Ref` vers cette table
 */
export function analyserReference(colonnes, lignes, valeurs, parReference) {
  const vals = [...new Set((valeurs || []).map(texte).filter(Boolean))];
  if (!vals.length || !lignes?.length) return null;
  const ids = (colonnes || []).map((c) => c.colId);
  let cle = null, couverture = 0;
  if (parReference) {
    const connus = new Set(lignes.map((l) => texte(l.id)));
    cle = 'id';
    couverture = vals.filter((v) => connus.has(v)).length / vals.length;
  } else {
    for (const c of colonnes) {
      if (c.type && !/^(Text|Choice|Any)$/.test(c.type)) continue;
      const connus = new Set(lignes.map((l) => texte(l[c.colId])));
      const cv = vals.filter((v) => connus.has(v)).length / vals.length;
      if (cv > couverture) { couverture = cv; cle = c.colId; }
    }
  }
  if (!cle || couverture < 0.8) return null;

  const meilleure = (filtre, nom) => {
    const cands = ids.filter((id) => id !== cle && filtre(id));
    return cands.find((id) => nom.test(id)) || cands[0] || null;
  };
  const couleur = meilleure((id) => part(lignes, id, (v) => COULEUR_HEX.test(texte(v))) >= 0.8, NOM_COULEUR);
  const rang = meilleure((id) => NOM_RANG.test(id) && part(lignes, id, (v) => Number.isFinite(Number(v))) >= 0.8, NOM_RANG);
  const icone = meilleure((id) => part(lignes, id, (v) => IMAGE_URL.test(texte(v))) >= 0.5, NOM_IMAGE);
  // Le libellé lisible d'une valeur : la clé elle-même, ou — par référence —
  // la première colonne de texte de la table (ce que Grist affiche).
  const libelle = parReference
    ? ((colonnes || []).find((c) => !c.type || c.type === 'Text')?.colId || null)
    : cle;
  if (!couleur && !rang && !icone) return null;
  return { cle, couleur, rang, icone, libelle, couverture };
}

/**
 * Valeur du champ → apparence. Les clés sont des chaînes : un `Ref` arrive en
 * nombre, un libellé en texte, et MapLibre compare après `to-string`.
 *
 * @returns {Map<string, {couleur?: string, rang?: number, icone?: string, libelle?: string}>}
 */
export function entreesReference(lignes, ref) {
  const out = new Map();
  if (!ref) return out;
  for (const l of lignes || []) {
    const k = texte(ref.cle === 'id' ? l.id : l[ref.cle]);
    if (!k || out.has(k)) continue;
    const e = {};
    const c = texte(ref.couleur ? l[ref.couleur] : '');
    if (COULEUR_HEX.test(c)) e.couleur = c;
    const r = Number(ref.rang ? l[ref.rang] : NaN);
    if (ref.rang && Number.isFinite(r)) e.rang = r;
    const i = texte(ref.icone ? l[ref.icone] : '');
    if (IMAGE_URL.test(i)) e.icone = i;
    const lib = texte(ref.libelle ? l[ref.libelle] : '');
    if (lib) e.libelle = lib;
    out.set(k, e);
  }
  return out;
}

/**
 * Les catégories de couleur d'Atlas (`{ value, color, label }`), dans l'ordre
 * de gravité : la légende se lit du moins grave au plus grave.
 */
export function categoriesDepuisReference(entrees, valeurs, defaut = '#999999') {
  const vals = [...new Set((valeurs || []).map(texte).filter(Boolean))];
  return vals
    .map((v) => {
      const e = entrees.get(v) || {};
      return { value: v, color: e.couleur || defaut, label: e.libelle || v, rang: e.rang ?? null };
    })
    .sort((a, b) => (a.rang ?? Infinity) - (b.rang ?? Infinity) || a.label.localeCompare(b.label, 'fr'));
}

/**
 * Expression MapLibre de l'ordre de dessin : le rang de la valeur. Une valeur
 * plus grave a un rang plus grand, et MapLibre dessine par-dessus les clés de
 * tri les plus grandes.
 */
export function expressionRang(champ, entrees, defaut = -1) {
  const paires = [];
  for (const [k, e] of entrees) if (Number.isFinite(e.rang)) paires.push(k, e.rang);
  return paires.length ? ['match', ['to-string', ['get', champ]], ...paires, defaut] : defaut;
}

/** Identifiant d'image MapLibre pour une URL : stable, sans caractère gênant. */
export function idImage(url) {
  let h = 0x811c9dc5;
  for (const ch of String(url)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'atlas-ico-' + h.toString(16);
}

/** Expression MapLibre de l'icône : l'image de la valeur, sinon rien. */
export function expressionIcone(champ, entrees) {
  const paires = [];
  for (const [k, e] of entrees) if (e.icone) paires.push(k, idImage(e.icone));
  return paires.length ? ['match', ['to-string', ['get', champ]], ...paires, ''] : '';
}
