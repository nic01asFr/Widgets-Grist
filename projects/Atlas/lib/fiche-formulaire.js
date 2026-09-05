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
 * Le FormDef qui décrit cette couche, ou `null`.
 *
 * La clé est la **table cible**, pas la couche : deux couches d'une même table
 * partagent le formulaire, ce qui est le comportement voulu — c'est la donnée
 * qu'on saisit, pas la représentation.
 */
export function formDefPourCouche(couche, formulaires) {
  const table = couche?.sourceTable;
  if (!table || !Array.isArray(formulaires)) return null;
  return formulaires.find((f) => f && f.tableId === table) || null;
}

/**
 * Les valeurs de départ, dans le vocabulaire du formulaire.
 *
 * Le moteur lit `values[field.colId]` ; Atlas porte ses attributs dans
 * `feature.properties`, préfixés `_` pour les siens. On ne passe que ce que le
 * formulaire déclare : une valeur qu'il ne connaît pas n'a rien à faire là, et
 * la lui donner reviendrait à la lui faire réécrire.
 */
export function valeursDepuisEntite(formDef, props) {
  const out = {};
  for (const section of (formDef?.sections || [])) {
    for (const champ of (section.fields || [])) {
      const v = props?.[champ.colId];
      if (v !== undefined) out[champ.colId] = v;
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
export function pontFormulaire({ couche, rowId, docApi, peutEcrire, signaler, apresEcriture }) {
  const table = couche?.sourceTable;
  const dire = typeof signaler === 'function' ? signaler : () => {};

  return {
    // Présent ⇒ le moteur est en édition de ligne, pas en création.
    editRowId: rowId,

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
