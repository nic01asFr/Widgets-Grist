(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./types.js'));
  } else if (typeof define === 'function' && define.amd) {
    define(['./types'], factory);
  } else {
    root.FormDefFromTable = factory(root.FormTypes);
  }
}(typeof self !== 'undefined' ? self : this, function (Types) {
  'use strict';

  /**
   * Un FormDef déduit des colonnes d'une table Grist.
   *
   * ## Pourquoi ici, et pas chez l'appelant
   *
   * La règle « type Grist → widget » existe déjà, une fois, dans `types.js`
   * (`defaultWidget`). Le générateur la relit en construisant son écran ;
   * `qgis-form-to-formdef.js` en tient une variante pour les couches QGIS. Un
   * troisième site chez le consommateur — Atlas, l'app terrain, le prochain —
   * aurait garanti trois comportements pour une seule intention.
   *
   * Ce module ne fait donc qu'assembler : il ne décide d'aucun widget, il
   * demande. Ce qu'il ajoute, c'est **ce qu'on écarte** — une colonne calculée
   * n'est pas saisissable, une colonne interne n'a rien à faire dans un
   * formulaire, et l'appelant sait des choses que ce module ignore (la colonne
   * de géométrie d'une couche, par exemple).
   *
   * ## Ce qu'il ne fait pas
   *
   * Il ne crée rien et n'écrit nulle part. Le FormDef rendu est un **brouillon
   * en mémoire** : tant que personne ne l'enregistre dans `Formulaires`, il se
   * recalcule à chaque ouverture et le document n'en garde aucune trace.
   */

  /** Colonnes que Grist tient pour lui et qu'aucun formulaire ne saisit. */
  var COLONNES_INTERNES = ['id', 'manualSort'];

  /**
   * Le préfixe d'identifiant d'un formulaire dérivé.
   *
   * Un dérivé n'a pas de ligne, donc pas d'identifiant de base — or tout le
   * reste s'y accroche : le choix de la fiche, l'exposition. Il lui en faut un,
   * stable et reconstructible sans rien lire.
   */
  var PREFIXE_DERIVE = 'derive:';

  function idDerive(tableId) { return PREFIXE_DERIVE + tableId; }
  function estDerive(id) { return String(id || '').indexOf(PREFIXE_DERIVE) === 0; }
  function tableDuDerive(id) {
    return estDerive(id) ? String(id).slice(PREFIXE_DERIVE.length) : null;
  }

  /**
   * Le libellé d'une colonne — et pourquoi celui de Grist ne suffit pas.
   *
   * > **Grist remplit `label` avec le `colId` quand personne n'en a donné.**
   * > Le prendre tel quel affichait « nom » et « hauteur » en minuscules, à
   * > côté d'« État » et de « Date de visite » que quelqu'un avait nommés. On
   * > ne peut donc pas se fier à sa présence : il faut le comparer.
   */
  function libelleDeLaColonne(col) {
    var brut = col.label;
    if (brut && brut !== col.colId) return brut;
    return libelleDepuisColId(col.colId);
  }

  /** Un libellé lisible depuis un `colId` qui ne l'est pas toujours. */
  function libelleDepuisColId(colId) {
    var mots = String(colId).replace(/[_-]+/g, ' ').trim();
    if (!mots) return colId;
    return mots.charAt(0).toUpperCase() + mots.slice(1);
  }

  /**
   * Les choix d'une colonne `Choice` / `ChoiceList`, s'ils sont déclarés.
   *
   * Grist les range dans `widgetOptions`, une chaîne JSON. Illisible ⇒ pas de
   * choix, et le champ retombe sur du texte libre plutôt que de proposer une
   * liste vide.
   */
  function choixDeLaColonne(col) {
    if (!col || !col.widgetOptions) return null;
    try {
      var opts = typeof col.widgetOptions === 'string'
        ? JSON.parse(col.widgetOptions)
        : col.widgetOptions;
      var choix = opts && opts.choices;
      return (Array.isArray(choix) && choix.length) ? choix.slice() : null;
    } catch (_) {
      return null;
    }
  }

  /** La table visée par une colonne `Ref:Table` ou `RefList:Table`. */
  function tableReferencee(type) {
    var m = /^Ref(?:List)?:(.+)$/.exec(String(type || '').trim());
    return m ? m[1] : null;
  }

  /**
   * Un champ, ou `null` si la colonne ne se saisit pas.
   *
   * @param {{colId: string, type: string, label?: string, isFormula?: boolean, widgetOptions?: string}} col
   */
  function champDepuisColonne(col) {
    if (!col || !col.colId) return null;
    // Une colonne calculée se lit, elle ne se remplit pas : l'offrir ferait
    // saisir une valeur que Grist écraserait aussitôt.
    if (col.isFormula) return null;

    var champ = {
      colId: col.colId,
      label: libelleDeLaColonne(col),
      type: col.type || 'Text',
      widget: Types && Types.defaultWidget ? Types.defaultWidget(col.type) : 'text',
      required: false,
    };

    var choix = choixDeLaColonne(col);
    if (choix) champ.options = { choices: choix };

    var visee = tableReferencee(col.type);
    if (visee) champ.options = Object.assign({}, champ.options, { refTable: visee });

    return champ;
  }

  /**
   * Le FormDef d'une table, déduit de ses colonnes.
   *
   * @param {object} o
   * @param {string} o.tableId
   * @param {object[]} o.colonnes  telles que `_grist_Tables_column` les donne
   * @param {string} [o.titre]     par défaut le nom de la table
   * @param {string[]} [o.ignorer] colonnes que l'appelant sait hors-sujet —
   *                               la géométrie d'une couche, par exemple
   */
  function formDefDepuisColonnes(o) {
    o = o || {};
    var tableId = o.tableId;
    if (!tableId) return null;

    var ecartees = COLONNES_INTERNES.concat(o.ignorer || []);
    var champs = (o.colonnes || [])
      .filter(function (c) { return c && ecartees.indexOf(c.colId) === -1; })
      .map(champDepuisColonne)
      .filter(Boolean);

    if (!champs.length) return null;

    return {
      manifest_version: '1.0.0',
      id: idDerive(tableId),
      title: o.titre || tableId,
      description: '',
      tableId: tableId,
      composeMode: 'bind',
      sections: [{ id: 'main', label: o.titre || tableId, fields: champs }],
      choices: {},
    };
  }

  return {
    COLONNES_INTERNES: COLONNES_INTERNES,
    PREFIXE_DERIVE: PREFIXE_DERIVE,
    idDerive: idDerive,
    estDerive: estDerive,
    tableDuDerive: tableDuDerive,
    tableReferencee: tableReferencee,
    libelleDeLaColonne: libelleDeLaColonne,
    champDepuisColonne: champDepuisColonne,
    formDefDepuisColonnes: formDefDepuisColonnes,
  };
}));
