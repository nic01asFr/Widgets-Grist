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

import { tablesReferencant } from './schema-grist.js';

/** Le moteur est chargé en `<script>` classique (UMD) — il n'est pas en module ES. */
export function moteurDisponible() {
  return typeof window !== 'undefined' && !!window.FormEngine && !!window.FormTypes;
}

/**
 * La dérivation d'un FormDef depuis des colonnes, elle aussi en UMD.
 *
 * Elle vit dans `grist_forms/shared/` et non ici : la règle type → widget
 * existe une fois, et un second site chez le consommateur aurait garanti deux
 * comportements. Absente — page servie sans elle —, on rend `null` et il n'y a
 * simplement pas de formulaire dérivé.
 */
function derivation() {
  return (typeof window !== 'undefined' && window.FormDefFromTable) || null;
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
 *
 * > **D'un booléen à un ensemble.** Le réglage valait `{ id, expose }` — **un**
 * > formulaire, **un** booléen — parce qu'une couche n'en portait qu'un. Depuis
 * > que les tables qui la référencent en fournissent autant qu'elles sont,
 * > « exposé » désigne **plusieurs** formulaires, par identifiant.
 * >
 * > L'ancienne forme se relit sans rien perdre : `expose: true` voulait dire
 * > « la fiche de cette couche est exposée », ce que `exposeHerite` reporte au
 * > premier formulaire de la couche — le seul qui existait alors.
 *
 * @returns {{fiche: string|null, exposes: string[]|null, exposeHerite: boolean}}
 *   `exposes` vaut `null` quand la couche n'a jamais rien décidé, ce qui n'est
 *   pas la même chose qu'une liste vide — celle-là dit « rien n'est exposé ».
 */
export function reglagesFormulaire(couche) {
  const r = couche?.formulaire || {};
  return {
    fiche: r.fiche || r.id || null,
    exposes: Array.isArray(r.exposes) ? r.exposes.filter((x) => typeof x === 'string') : null,
    exposeHerite: !Array.isArray(r.exposes) && r.expose === true,
  };
}

/**
 * Colonnes qu'aucun formulaire de couche ne saisit.
 *
 * La géométrie se dessine, elle ne se tape pas ; `atlas_3d_json` est une
 * mémoire d'Atlas. Les offrir dans un formulaire ferait éditer à la main ce que
 * la carte règle, et un relevé de terrain y perdrait son sens.
 */
export function colonnesHorsFormulaire(couche) {
  const gc = couche?.geometryColumn;
  const geo = typeof gc === 'string' ? [gc] : (gc ? [gc.lat, gc.lng].filter(Boolean) : []);
  return ['atlas_3d_json', ...geo];
}

/**
 * Tous les formulaires d'une couche, dans l'ordre où ils s'affichent.
 *
 * **La table de la couche d'abord** — ce qui corrige l'objet — puis **les
 * tables qui la référencent**, qui ajoutent une ligne. C'est l'ordre des
 * onglets, et il ne varie pas.
 *
 * ## Un onglet par formulaire, vraiment
 *
 * Une table peut en porter **plusieurs** : un relevé importé de QField, un
 * formulaire composé ici, un troisième pour une campagne. Chacun a son onglet
 * et **son nom**. Ce code n'en retenait qu'un — il appelait `choisirFormulaire`,
 * qui tranche — et la règle « un onglet par formulaire » n'était donc pas
 * tenue.
 *
 * ## Le dérivé de la couche ne disparaît jamais
 *
 * La fiche d'Atlas a toujours montré **tous** les attributs de l'objet. Ce
 * n'est pas parce qu'un formulaire a été importé sur la table que cette vue
 * doit disparaître : un formulaire importé montre ce que son auteur a choisi,
 * pas ce que la table contient.
 *
 * Le dérivé de la table de la couche est donc **toujours** présent, en premier,
 * sous le nom `Attributs` — c'est ce qu'il est. Pour les tables liées, il n'est
 * qu'un **repli** : dès qu'un enregistré existe, il suffit.
 *
 * @param {object} o
 * @param {object} o.couche
 * @param {object[]} [o.entrees] les lignes de `Formulaires`
 * @param {object} [o.schema]    le schéma du document — sans lui, pas de dérivé
 * @returns {Array<{id, titre, tableId, def, statut, derive, surLaCouche, via, expose}>}
 */
export function formulairesPourCouche({ couche, entrees = [], schema = null } = {}) {
  const table = couche?.sourceTable;
  if (!table) return [];
  const D = derivation();
  const reglages = reglagesFormulaire(couche);
  const out = [];

  const pousser = ({ entree, surLaCouche, via, derive }) => {
    out.push({
      id: entree.formId || entree.def?.id || null,
      titre: entree.titre || entree.def?.title || entree.tableCible,
      tableId: entree.def?.tableId || entree.tableCible,
      def: entree.def,
      statut: entree.statut || null,
      derive: !!derive,
      // **Porte sur la table de la couche**, et non « le formulaire principal ».
      // C'est ce fait-là qui decide `updateRow` contre `addRow` — pas le rang.
      surLaCouche: !!surLaCouche,
      via: via || null,
    });
  };

  const ajouterTable = ({ tableCible, surLaCouche, via, titre, ignorer }) => {
    const enregistres = formulairesPourTable(entrees, tableCible);
    const deriver = () => {
      if (!D || !schema) return null;
      const def = D.formDefDepuisColonnes({
        tableId: tableCible, colonnes: schema[tableCible] || [], titre, ignorer,
      });
      return def ? { formId: def.id, titre, tableCible, statut: null, def } : null;
    };

    // Sur la couche, le dérivé vient EN PREMIER : « Attributs » est le premier
    // onglet, et le premier onglet fait toujours la même chose.
    if (surLaCouche) {
      const d = deriver();
      if (d) pousser({ entree: d, surLaCouche, via, derive: true });
    }
    for (const e of enregistres) pousser({ entree: e, surLaCouche, via, derive: false });
    if (!surLaCouche && !enregistres.length) {
      const d = deriver();
      if (d) pousser({ entree: d, surLaCouche, via, derive: true });
    }
  };

  ajouterTable({
    tableCible: table,
    surLaCouche: true,
    titre: 'Attributs',
    ignorer: colonnesHorsFormulaire(couche),
  });

  for (const { table: liee, via } of (schema ? tablesReferencant(schema, table) : [])) {
    // La colonne qui porte la référence n'est pas une saisie : c'est le clic
    // qui la remplit. La montrer ferait choisir l'objet qu'on vient de choisir.
    ajouterTable({ tableCible: liee, surLaCouche: false, via, titre: liee, ignorer: [via] });
  }

  // « Exposé » se décide par identifiant. L'ancien booléen ne connaissait que la
  // fiche : on le reporte sur le premier formulaire de la couche, le seul qui
  // existait alors.
  const premierDeLaCouche = out.find((f) => f.surLaCouche)?.id || null;
  for (const f of out) {
    f.expose = reglages.exposes
      ? reglages.exposes.includes(f.id)
      : (reglages.exposeHerite && f.id === premierDeLaCouche);
  }
  return out;
}

/**
 * Le libellé d'un onglet.
 *
 * Un formulaire enregistré porte **son nom** : l'afficher comme « Attributs »
 * effacerait ce que son auteur a écrit, et laisserait croire qu'il montre
 * toutes les colonnes alors qu'il montre celles qu'on a choisies. Seul le
 * dérivé de la table de la couche s'appelle « Attributs » — parce que c'est
 * exactement ce qu'il est.
 */
export function libelleFormulaire(f) {
  if (!f) return '';
  return (f.derive && f.surLaCouche) ? 'Attributs' : (f.titre || f.tableId || '');
}

/**
 * Ceux qu'un lecteur peut ouvrir : exposés, et prêts.
 *
 * Un dérivé n'a pas de statut — il n'est pas « publié », il n'existe même pas
 * en base. Il reste donc réservé à l'édition : l'exposer demande d'abord de
 * l'enregistrer, ce qui est un geste et pas un effet de bord.
 */
export function formulairesOffertsEnLecture(formulaires) {
  return (formulaires || []).filter((f) => f && f.expose && !f.derive && formulaireOffrable(f));
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
    prefereId: reglagesFormulaire(couche).fiche,
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
    // Une table est dite exposée dès qu'une de ses couches offre quelque
    // chose — l'ancien booléen comme la nouvelle liste.
    const r = reglagesFormulaire(c);
    if (r.exposeHerite || (r.exposes && r.exposes.length)) l.expose = true;
  }
  for (const e of entrees) {
    if (!e?.def?.tableId) continue;
    ligne(e.def.tableId).formulaires.push(e);
  }
  for (const l of tables) {
    const prefere = l.couches.map((c) => reglagesFormulaire(c).fiche).find(Boolean) || null;
    l.choisi = choisirFormulaire(entrees, { table: l.table, prefereId: prefere });
  }
  return tables;
}

/**
 * Le mode exploitation : peut-on saisir sur cet objet hors édition ?
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
 * | au moins un formulaire offert | tout formulaire du document deviendrait saisissable partout |
 * | le moteur est là | le repli devine les champs, il n'a rien à écrire ici |
 * | la personne peut écrire | on ferait remplir un formulaire pour un refus |
 *
 * > **La deuxième a changé de forme.** Elle valait `reglages.expose === true` —
 * > un booléen pour la couche entière, du temps où celle-ci ne portait qu'un
 * > formulaire. Elle porte maintenant sur **la liste** : un objet se saisit dès
 * > qu'**un** de ses formulaires est offert, et `formulairesOffertsEnLecture`
 * > dit lesquels. Un dérivé n'en fait jamais partie — il n'existe pas en base.
 *
 * En édition (`view` faux) la question ne se pose pas : ce chemin ne décrit que
 * ce qui reste ouvert **hors** édition.
 *
 * @param {{view: boolean, aDesLignes: boolean, peutEcrire: boolean, formulaires: object[], moteur: boolean}} o
 */
export function saisieHorsEdition({ view, aDesLignes, peutEcrire, formulaires, moteur } = {}) {
  return !!view && !!aDesLignes && !!peutEcrire && !!moteur
    && formulairesOffertsEnLecture(formulaires).length > 0;
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
 * Il traduit ce qu'Atlas sait — la couche, l'objet cliqué, la session Grist —
 * dans le contrat que `FormEngine.mount` attend. Le moteur fait le reste.
 *
 * > **Le pont est obligatoire, et c'est une garde, pas une commodité.** Sans
 * > lui, le moteur retombe sur `window.grist.docApi.applyUserActions` — or
 * > Atlas expose `grist` globalement. Le garde d'écriture serait donc
 * > court-circuité, et l'édition rouverte à qui n'a pas le droit d'écrire.
 *
 * ## Deux modes, et ils ne peuvent pas partager un pont
 *
 * | | `editRowId` | Ce qui se passe |
 * |---|---|---|
 * | **sur la couche** | l'objet | `updateRow` — on **corrige** la ligne cliquée |
 * | **lié** | **absent** | `addRow` — on **ajoute** une ligne qui la référence |
 *
 * Ce qui distingue les deux, c'est **la table visée**, pas le rang : une table
 * peut porter plusieurs formulaires, et ils corrigent tous l'objet.
 *
 * > **L'absence d'`editRowId` n'est pas un oubli, c'est la condition.**
 * > `defaultSubmit` du moteur teste `bridge.editRowId` **avant** `bridge.addRow`
 * > et ne discute pas : le porter sur un formulaire lié ferait corriger le
 * > bâtiment au lieu d'ajouter la visite, sans erreur ni message.
 *
 * ## La référence, Atlas la porte
 *
 * Elle n'est pas une saisie, c'est un **fait du contexte** : on a cliqué cet
 * objet. Le pont l'injecte donc à la soumission, ce qui supprime d'un coup le
 * besoin que le formulaire déclare le champ, celui de le préremplir et celui de
 * le verrouiller. Un formulaire hérité de QField n'expose pas forcément son
 * `Ref` — sans injection, la soumission créerait une ligne rattachée à rien.
 *
 * @param {object} o
 * @param {object} o.couche        couche Atlas (porte `sourceTable`)
 * @param {number} o.rowId         `_row_id` de l'entité — l'identifiant Grist
 * @param {object} o.docApi        `grist.docApi`
 * @param {object} [o.formulaire]  l'entrée de `formulairesPourCouche` — son
 *                                 `surLaCouche` et son `via` décident du mode
 * @param {object} [o.valeurs]     lues avant le premier rendu
 * @param {() => boolean} o.peutEcrire  le garde d'Atlas, consulté à CHAQUE soumission
 * @param {(msg:string, ok:boolean) => void} [o.signaler]
 * @param {() => void} [o.apresEcriture]
 */
export function pontFormulaire({
  couche, rowId, docApi, peutEcrire, signaler, apresEcriture, valeurs, formulaire,
}) {
  const dire = typeof signaler === 'function' ? signaler : () => {};
  // Pas de `formulaire` ⇒ l'appelant vise la table de la couche : c'est le
  // comportement d'avant les formulaires liés, et il reste le défaut.
  const lie = !!formulaire && formulaire.surLaCouche === false;
  const table = lie ? formulaire.tableId : couche?.sourceTable;

  const garde = () => {
    if (typeof peutEcrire === 'function' && !peutEcrire()) {
      throw new Error('Mode lecture — enregistrement indisponible');
    }
    if (!table) throw new Error('Couche sans table source');
  };

  const pont = {
    values: valeurs || {},
    loadTable: (t) => docApi.fetchTable(t),
    getAccessToken: (opts) => docApi.getAccessToken(opts),
  };

  if (lie) {
    pont.addRow = async (_tableId, data) => {
      garde();
      // La référence entre ici, jamais par le formulaire : c'est le clic qui
      // fait foi. Sans `via`, on refuse plutôt que de créer un orphelin.
      if (!formulaire.via) throw new Error('Formulaire lié sans colonne de référence');
      const champs = { ...data, [formulaire.via]: rowId };
      const r = await docApi.applyUserActions([['AddRecord', table, null, champs]]);
      dire('Relevé ajouté', true);
      if (typeof apresEcriture === 'function') apresEcriture();
      return r;
    };
    return pont;
  }

  // Présent ⇒ le moteur est en édition de ligne, pas en création.
  pont.editRowId = rowId;
  pont.updateRow = async (_tableId, id, data) => {
    // Le garde est consulté ici, pas à la construction du pont : les droits
    // peuvent avoir changé entre l'ouverture de la fiche et la soumission.
    garde();
    await docApi.applyUserActions([['UpdateRecord', table, id ?? rowId, data]]);
    dire('Enregistré', true);
    if (typeof apresEcriture === 'function') apresEcriture();
  };
  return pont;
}
