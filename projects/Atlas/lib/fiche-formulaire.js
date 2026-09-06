/**
 * La fiche d'entité rendue par le moteur de formulaire de `grist_forms`.
 *
 * ## Pourquoi ce module n'invente rien
 *
 * `renderAttrFields` d'Atlas et le moteur `FormEngine` rendent **le même objet**
 * — les attributs d'une ligne Grist — mais l'un devine ses champs et l'autre
 * dispose d'une définition. Atlas écrase tous les types Grist en deux
 * (`detectFieldType`) : une colonne `Bool` s'y édite en texte libre et repart en
 * base comme la chaîne `"true"`, une `Choice` en champ libre, une `Date` en
 * chaîne. Le moteur, lui, connaît `checkbox`, `select`, `radio`, `multiselect`,
 * `date`, `file`, les cascades `Ref`, la visibilité conditionnelle — et il porte
 * déjà la coercition d'écriture (`Types.coerceForWrite`).
 *
 * Écrire ici une table type → widget et une coercition aurait fait de ce fichier
 * le **cinquième site** de la même règle, non testé. On monte donc le moteur.
 *
 * ## Ce que ce module fait, et rien d'autre
 *
 * Il fabrique le **pont** : traduire ce qu'Atlas sait (la couche, l'entité, la
 * session Grist) dans le contrat que `FormEngine.mount` attend. Le moteur fait
 * le reste.
 *
 * > **Le pont est obligatoire, et c'est une garde, pas une commodité.** Sans
 * > lui, le moteur retombe sur `window.grist.docApi.applyUserActions` (lignes
 * > 565, 573 de `engine.js`) — or Atlas expose `grist` globalement. Le garde
 * > d'écriture d'Atlas serait donc court-circuité, et l'édition rouverte à qui
 * > n'a pas le droit d'écrire. Le dépôt a déjà payé une fois pour ce défaut.
 */

/** Le moteur est chargé en `<script>` classique (UMD) — il n'est pas en module ES. */
export function moteurDisponible() {
  return typeof window !== 'undefined' && !!window.FormEngine && !!window.FormTypes;
}

/**
 * Les statuts que la table `Formulaires` connaît — le vocabulaire est celui de
 * `grist_forms/shared/formulaires-table.js`, et il ne s'invente pas ici.
 *
 * `terrain` est celui qu'écrit qgis2grist en important un projet QField : un
 * pack de terrain arrive donc prêt à servir, ce qui est cohérent — importer un
 * projet de terrain *est* le geste qui en demande.
 */
export const STATUTS = Object.freeze(['brouillon', 'publie', 'terrain']);

/** Un brouillon se règle et se teste ; il ne s'offre pas à un lecteur. */
export const STATUTS_OFFRABLES = Object.freeze(['publie', 'terrain']);

/**
 * La table `Formulaires`, lue une fois pour toutes.
 *
 * Atlas ne gardait que le `Def`, et perdait donc `Statut` — l'état que le
 * document tient déjà sur chaque formulaire. Il l'aurait réinventé ailleurs,
 * et deux vérités sur le même fait sont une panne en attente.
 *
 * Une définition illisible n'empêche pas les autres : c'est la même règle que
 * partout dans Atlas, une donnée abîmée ne coûte que sa propre ligne.
 *
 * @param {object} rec table colonnaire renvoyée par `fetchTable('Formulaires')`
 */
export function lireFormulaires(rec) {
  const ids = rec?.id || [];
  const out = [];
  for (let i = 0; i < ids.length; i++) {
    let def = null;
    try {
      def = JSON.parse(rec.Def?.[i] || 'null');
    } catch (_) {
      continue;
    }
    if (!def || !def.tableId) continue;
    const statut = String(rec.Statut?.[i] || '').trim();
    out.push({
      rowId: ids[i],
      formId: def.id || rec.FormId?.[i] || null,
      titre: def.title || rec.Titre?.[i] || rec.Nom?.[i] || def.tableId,
      tableCible: rec.TableCible?.[i] || def.tableId,
      version: Number(rec.Version?.[i]) || 0,
      statut: STATUTS.includes(statut) ? statut : 'brouillon',
      def,
    });
  }
  return out;
}

/** Un formulaire qu'on peut proposer hors édition. */
export function formulaireOffrable(entree) {
  return !!entree && STATUTS_OFFRABLES.includes(entree.statut);
}

/** Tous les formulaires qui visent cette table. */
export function formulairesPourTable(entrees, table) {
  if (!table || !Array.isArray(entrees)) return [];
  return entrees.filter((e) => e && e.def?.tableId === table);
}

/**
 * Lequel sert la fiche, quand une table en porte plusieurs.
 *
 * `find` sur la table suffisait tant qu'il n'y en avait qu'un ; c'est faux dès
 * que le module permet d'en avoir plusieurs, ce qui est son objet même. L'ordre
 * de préférence dit ce qu'on veut : **le choix de la scène d'abord** — c'est
 * l'auteur qui a tranché —, puis un formulaire abouti, puis le premier venu,
 * pour ne jamais rendre `null` quand quelque chose existe.
 *
 * @param {object[]} entrees
 * @param {{table: string, prefereId?: string|null}} o
 */
export function choisirFormulaire(entrees, { table, prefereId = null } = {}) {
  const candidats = formulairesPourTable(entrees, table);
  if (!candidats.length) return null;
  if (prefereId) {
    const voulu = candidats.find((e) => e.formId === prefereId);
    if (voulu) return voulu;
  }
  return candidats.find((e) => e.statut !== 'brouillon') || candidats[0];
}

/**
 * Les réglages de formulaire que porte une couche, normalisés.
 *
 * Ils voyagent avec la **scène**, pas avec le formulaire : on peut vouloir
 * exposer le relevé du mobilier dans une scène et pas dans une autre, alors que
 * la table est la même. Une seule définition, chaque scène décidant de ce
 * qu'elle publie.
 */
export function reglagesFormulaire(couche) {
  const r = couche?.formulaire || {};
  return { id: r.id || null, expose: r.expose === true };
}

/**
 * Le FormDef qui décrit cette couche, ou `null`.
 *
 * La clé est la **table cible**, pas la couche : deux couches d'une même table
 * partagent le formulaire, ce qui est le comportement voulu — c'est la donnée
 * qu'on saisit, pas la représentation.
 */
export function formDefPourCouche(couche, entrees) {
  const entree = choisirFormulaire(entrees, {
    table: couche?.sourceTable,
    prefereId: reglagesFormulaire(couche).id,
  });
  return entree ? entree.def : null;
}

/**
 * Ce que le module montre : une ligne par table, qu'elle porte un formulaire,
 * des couches, ou les deux.
 *
 * Les deux inventaires se rejoignent ici, et aucun ne commande l'autre. Une
 * table géo sans formulaire est une **occasion** — c'est là qu'on en crée un.
 * Un formulaire dont aucune couche ne porte la table est **normal** : une table
 * de visites n'a pas de géométrie, et elle se saisit depuis le bâtiment.
 *
 * @param {{couches: object[], entrees: object[]}} o
 */
export function inventaireFormulaires({ couches = [], entrees = [] } = {}) {
  const tables = [];
  const index = new Map();
  const ligne = (table) => {
    if (!index.has(table)) {
      const l = { table, couches: [], formulaires: [], choisi: null, expose: false };
      index.set(table, l);
      tables.push(l);
    }
    return index.get(table);
  };

  // Les couches d'abord : l'ordre du panneau suit celui de la carte, qui est
  // celui que l'auteur a sous les yeux.
  for (const c of couches) {
    if (!c?.sourceTable) continue;
    const l = ligne(c.sourceTable);
    l.couches.push(c);
    if (reglagesFormulaire(c).expose) l.expose = true;
  }
  for (const e of entrees) {
    if (!e?.def?.tableId) continue;
    ligne(e.def.tableId).formulaires.push(e);
  }
  for (const l of tables) {
    const prefere = l.couches.map((c) => reglagesFormulaire(c).id).find(Boolean) || null;
    l.choisi = choisirFormulaire(entrees, { table: l.table, prefereId: prefere });
  }
  return tables;
}

/**
 * Le mode exploitation : peut-on saisir cet objet hors édition ?
 *
 * Atlas confondait deux choses sous un seul mot. « Lecture » disait à la fois
 * *« Atlas ne montre pas ses outils d'auteur »* et *« vous ne pouvez rien
 * écrire »* — or le lien de terrain veut précisément le premier sans le second.
 *
 * Quatre conditions, et aucune n'est de trop :
 *
 * | | Ce qu'elle empêche sans elle |
 * |---|---|
 * | l'objet a une ligne | on écrirait dans un blob GeoJSON, où rien n'a d'identité |
 * | la scène l'a publié | tout formulaire du document deviendrait saisissable partout |
 * | le formulaire est prêt | un brouillon en cours de réglage partirait au terrain |
 * | la personne peut écrire | on ferait remplir un formulaire pour un refus |
 *
 * En édition (`view` faux) la question ne se pose pas : ce chemin ne décrit que
 * ce qui reste ouvert **hors** édition.
 *
 * @param {{view: boolean, aDesLignes: boolean, peutEcrire: boolean, reglages: object, entree: object|null, moteur: boolean}} o
 */
export function saisieHorsEdition({ view, aDesLignes, peutEcrire, reglages, entree, moteur } = {}) {
  return !!view && !!aDesLignes && !!peutEcrire && !!moteur
    && reglages?.expose === true && formulaireOffrable(entree);
}

/**
 * Au-delà, un horodatage est déjà en millisecondes.
 *
 * 1e11 secondes tombe en l'an 5138 ; 1e11 millisecondes en 1973. Aucune donnée
 * de terrain ne vit entre les deux, et le seuil sépare donc sans ambiguïté.
 */
const SECONDES_OU_MILLISECONDES = 1e11;

function versDate(v, avecHeure) {
  if (v == null || v === '') return null;
  const d = (typeof v === 'number' && Number.isFinite(v))
    ? new Date(Math.abs(v) < SECONDES_OU_MILLISECONDES ? v * 1000 : v)
    : new Date(String(v).trim());
  if (Number.isNaN(d.getTime())) return null;
  const iso = d.toISOString();
  return avecHeure ? iso.slice(0, 16) : iso.slice(0, 10);
}

/**
 * Ce qu'un champ rendu attend, depuis ce que Grist stocke.
 *
 * > **Grist garde les dates en secondes Unix.** Un `<input type="date">` veut
 * > `AAAA-MM-JJ` et rejette tout le reste **en silence** : le champ reste vide,
 * > la personne ressaisit, et rien ne dit pourquoi. Le sens inverse existait
 * > déjà — `Types.coerceForWrite` — mais personne n'avait écrit la lecture.
 *
 * @param {object} champ le champ du FormDef (`type` Grist, `widget` de rendu)
 * @param {*} v la valeur portée par l'entité
 * @returns {{genre: 'date'|'coche'|'liste'|'valeur', valeur: *}|null} `null` = rien à poser
 */
export function valeurPourFormulaire(champ, v) {
  if (v === undefined || v === null || v === '') return null;
  const type = String(champ?.type || '').toLowerCase();
  const widget = String(champ?.widget || '').toLowerCase();

  if (type === 'datetime' || widget === 'datetime') {
    const d = versDate(v, true);
    return d == null ? null : { genre: 'date', valeur: d };
  }
  if (type === 'date' || widget === 'date') {
    const d = versDate(v, false);
    return d == null ? null : { genre: 'date', valeur: d };
  }
  // Une liste Grist arrive comme `['L', 'a', 'b']` : le marqueur n'est pas une
  // valeur, et le laisser passer cocherait un choix qui n'existe pas.
  if (Array.isArray(v)) {
    const items = (v[0] === 'L' ? v.slice(1) : v).map(String);
    return items.length ? { genre: 'liste', valeur: items } : null;
  }
  if (type === 'bool' || widget === 'checkbox') {
    const faux = v === false || v === 0 || v === '0' || String(v).toLowerCase() === 'false';
    return { genre: 'coche', valeur: !faux };
  }
  return { genre: 'valeur', valeur: String(v) };
}

/**
 * Les valeurs de départ, dans le vocabulaire du formulaire.
 *
 * Deux tris en un. **Ce que le formulaire déclare** : une valeur qu'il ignore
 * n'a rien à faire là, et `collectSubmitData` la réécrirait sans que personne
 * l'ait vue. **Ce qu'un champ rendu attend** : Grist et le DOM ne parlent pas
 * la même langue, et l'écart se solde en silence.
 *
 * > **Elles entrent par le pont, pas par le DOM.** Amorcer les champs après le
 * > montage ne pouvait pas marcher : un formulaire multi-étapes ne rend que
 * > l'étape courante, et les champs des suivantes n'existent pas encore — le
 * > choix « Bon » restait décoché à l'étape 2, alors que la ligne le portait.
 * > Le correctif est allé là où il devait être, dans `mount`.
 */
export function valeursPourMoteur(formDef, props) {
  const out = {};
  for (const section of (formDef?.sections || [])) {
    for (const champ of (section.fields || [])) {
      const cible = valeurPourFormulaire(champ, props?.[champ.colId]);
      if (cible) out[champ.colId] = cible.valeur;
    }
  }
  return out;
}

/**
 * Le pont entre le moteur et Atlas.
 *
 * @param {object} o
 * @param {object} o.couche        couche Atlas (porte `sourceTable`)
 * @param {number} o.rowId         `_row_id` de l'entité — l'identifiant Grist
 * @param {object} o.docApi        `grist.docApi`
 * @param {() => boolean} o.peutEcrire  le garde d'Atlas, consulté à CHAQUE soumission
 * @param {(msg:string, ok:boolean) => void} [o.signaler]
 * @param {() => void} [o.apresEcriture]
 */
export function pontFormulaire({ couche, rowId, docApi, peutEcrire, signaler, apresEcriture, valeurs }) {
  const table = couche?.sourceTable;
  const dire = typeof signaler === 'function' ? signaler : () => {};

  return {
    // Présent ⇒ le moteur est en édition de ligne, pas en création.
    editRowId: rowId,

    // Lues AVANT le premier rendu : c'est `mount` qui les prend, et lui seul
    // voit les étapes que le DOM n'a pas encore.
    values: valeurs || {},

    async updateRow(_tableId, id, data) {
      // Le garde est consulté ici, pas à la construction du pont : les droits
      // peuvent avoir changé entre l'ouverture de la fiche et la soumission.
      if (typeof peutEcrire === 'function' && !peutEcrire()) {
        throw new Error('Mode lecture — enregistrement indisponible');
      }
      if (!table) throw new Error('Couche sans table source');
      await docApi.applyUserActions([['UpdateRecord', table, id ?? rowId, data]]);
      dire('Enregistré', true);
      if (typeof apresEcriture === 'function') apresEcriture();
    },

    // Cascades et listes de références : lecture seule, aucun garde nécessaire.
    loadTable: (t) => docApi.fetchTable(t),

    getAccessToken: (opts) => docApi.getAccessToken(opts),
  };
}
