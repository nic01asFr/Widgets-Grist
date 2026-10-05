(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./formdef-from-table.js'));
  } else if (typeof define === 'function' && define.amd) {
    define(['./formdef-from-table'], factory);
  } else {
    root.FormDefFromGristForm = factory(root.FormDefFromTable);
  }
}(typeof self !== 'undefined' ? self : this, function (Derivation) {
  'use strict';

  /**
   * Les formulaires natifs de Grist, relus en FormDef.
   *
   * Une équipe qui a soigné ses formulaires dans Grist — l'ordre des questions,
   * leur libellé, ce qui est obligatoire, une consigne sous une question — ne
   * doit pas les refaire ailleurs. Grist les range dans ses métadonnées : une
   * section de vue de type `form`, sa mise en page (`layoutSpec`), et pour
   * chaque question les options de la colonne (`question`, `formRequired`…),
   * éventuellement surchargées par celles du champ.
   *
   * Ce module ne fait que lire ces métadonnées. Il n'écrit rien, et le FormDef
   * qu'il rend se recalcule à chaque ouverture : modifier le formulaire dans
   * Grist suffit à le modifier partout où il sert.
   *
   * ## Ce qui est repris
   *
   * | Dans Grist | Dans le FormDef |
   * |---|---|
   * | l'ordre de la mise en page | l'ordre des champs |
   * | `question` (sa première ligne) | le libellé |
   * | la suite de la question, la description de la colonne | l'aide sous le libellé |
   * | `formRequired` | `required` |
   * | `formSelectFormat: 'radio'` | des boutons radio au lieu d'une liste |
   * | `formTextFormat: 'multiline'` | une zone de texte |
   * | `formOptionsSortOrder` | l'ordre des choix |
   * | le premier paragraphe titre | le titre |
   * | les autres paragraphes | la description, ou le titre de la section qui suit |
   * | le formulaire publié (lien public) | `partage: true` — une information, pas une condition |
   *
   * Une question sur une colonne calculée est écartée, comme dans un formulaire
   * déduit : Grist l'écraserait.
   *
   * > **Le statut est `publie`, que le formulaire soit partagé ou non.** Dans
   * > Grist, « publier » ouvre un lien public, sans compte. Une équipe peut
   * > vouloir son formulaire dans son outil sans l'ouvrir au monde : en faire
   * > la condition aurait obligé à choisir entre les deux. Qui le propose, et
   * > où, reste une décision de la scène qui l'utilise.
   */

  var PREFIXE = 'grist-form:';

  function idFormulaireGrist(sectionId) { return PREFIXE + sectionId; }
  function estFormulaireGrist(id) { return String(id || '').indexOf(PREFIXE) === 0; }

  /** Une option JSON de Grist, lue sans jamais échouer. */
  function lireOptions(brut) {
    if (!brut) return {};
    if (typeof brut === 'object') return brut;
    try {
      var o = JSON.parse(brut);
      return o && typeof o === 'object' ? o : {};
    } catch (_) {
      return {};
    }
  }

  /** Une table de métadonnées colonnaire en lignes `{id, ...}`. */
  function lignes(table) {
    var ids = (table && table.id) || [];
    var cles = Object.keys(table || {});
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var l = {};
      for (var k = 0; k < cles.length; k++) l[cles[k]] = table[cles[k]][i];
      out.push(l);
    }
    return out;
  }

  /**
   * Le texte d'un paragraphe de formulaire, sans son balisage Markdown : un
   * titre de formulaire n'a ni dièses ni astérisques.
   */
  function texteSimple(md) {
    return String(md || '')
      .replace(/^\s*#{1,6}\s*/gm, '')
      .replace(/\*\*|`/g, '')
      // L'emphase `_mot_` ou `*mot*`, et seulement elle : les soulignés d'un
      // identifiant (`Fiche_visite`) font partie du texte.
      .replace(/(^|[\s(])[*_]([^\s*_][^*_]*?)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
      .replace(/\s+\n/g, '\n')
      .trim();
  }

  function estTitre(md) { return /^\s*#{1,6}\s/.test(String(md || '')); }

  /** Les feuilles `Field`, `Paragraph` et `Section` de la mise en page, dans l'ordre. */
  function parcourir(noeud, visite) {
    if (!noeud || typeof noeud !== 'object') return;
    visite(noeud);
    var enfants = Array.isArray(noeud.children) ? noeud.children : [];
    for (var i = 0; i < enfants.length; i++) parcourir(enfants[i], visite);
  }

  /**
   * Un champ du FormDef depuis une question du formulaire Grist.
   *
   * Les options du champ l'emportent sur celles de la colonne : c'est ce que
   * Grist fait quand on coche « réglages propres à ce widget ».
   */
  function champDepuisQuestion(col, optionsChamp) {
    var champ = Derivation.champDepuisColonne(col);
    if (!champ) return null;
    var o = Object.assign({}, lireOptions(col.widgetOptions), lireOptions(optionsChamp));

    var question = typeof o.question === 'string' ? o.question.trim() : '';
    var lignesQuestion = question ? question.split(/\r?\n/) : [];
    if (lignesQuestion.length && lignesQuestion[0].trim()) champ.label = lignesQuestion[0].trim();
    var aide = [lignesQuestion.slice(1).join('\n').trim(), String(col.description || '').trim()]
      .filter(Boolean).join('\n');
    if (aide) champ.description = aide;

    champ.required = o.formRequired === true;

    var base = String(champ.type || '').replace(/:.*$/, '');
    if ((base === 'Choice' || base === 'Ref') && o.formSelectFormat === 'radio') champ.widget = 'radio';
    if (base === 'Text' && o.formTextFormat === 'multiline') champ.widget = 'textarea';
    if (o.formOptionsSortOrder === 'ascending' || o.formOptionsSortOrder === 'descending') {
      champ.options = Object.assign({}, champ.options, { sortOrder: o.formOptionsSortOrder });
    }
    return champ;
  }

  /**
   * Les formulaires natifs du document, en FormDef.
   *
   * @param {object} meta les tables de métadonnées, colonnaires, telles que
   *   `fetchTable` les rend : `tables` (`_grist_Tables`), `colonnes`
   *   (`_grist_Tables_column`), `vues` (`_grist_Views`), `sections`
   *   (`_grist_Views_section`), `champs` (`_grist_Views_section_field`)
   * @returns {Array<{formId: string, sectionId: number, titre: string, tableCible: string, statut: string, def: object}>}
   */
  function formulairesGrist(meta) {
    meta = meta || {};
    var nomTable = {};
    lignes(meta.tables).forEach(function (t) { nomTable[t.id] = t.tableId; });
    var colonneParRef = {};
    lignes(meta.colonnes).forEach(function (c) { colonneParRef[c.id] = c; });
    var nomVue = {};
    lignes(meta.vues).forEach(function (v) { nomVue[v.id] = v.name; });
    var champParRef = {};
    var champsParSection = {};
    lignes(meta.champs).forEach(function (f) {
      champParRef[f.id] = f;
      (champsParSection[f.parentId] = champsParSection[f.parentId] || []).push(f);
    });

    var out = [];
    lignes(meta.sections).forEach(function (s) {
      if (s.parentKey !== 'form') return;
      var tableId = nomTable[s.tableRef];
      if (!tableId) return;
      var mise = lireOptions(s.layoutSpec);

      var titre = '';
      var description = [];
      var sections = [];
      var enAttente = null;   // un titre de paragraphe qui nommera la section suivante
      var courante = null;
      var vus = {};
      var nChamps = 0;        // « avant le premier champ » : titre et description du formulaire

      var nouvelleSection = function (libelle) {
        courante = { id: 's' + (sections.length + 1), label: libelle || '', fields: [] };
        sections.push(courante);
      };

      var ajouterChamp = function (f) {
        var col = f && colonneParRef[f.colRef];
        if (!col || vus[col.colId]) return;
        // `visibleCol` est, dans les métadonnées, le numéro d'une ligne de
        // colonne ; le formulaire veut le nom. Celui du champ prime sur celui
        // de la colonne, comme les autres réglages.
        var affichee = colonneParRef[f.visibleCol || col.visibleCol];
        var champ = champDepuisQuestion(Object.assign({}, col, { visibleCol: affichee ? affichee.colId : '' }), f.widgetOptions);
        if (!champ) return;
        vus[col.colId] = true;
        if (!courante) nouvelleSection(enAttente);
        courante.fields.push(champ);
        nChamps++;
      };

      parcourir(mise, function (n) {
        if (n.type === 'Paragraph') {
          var texte = texteSimple(n.text);
          if (!texte) return;
          // Le repère est le premier champ, pas la première section : un
          // paragraphe posé DANS la section, avant ses questions, est encore le
          // titre ou la description du formulaire.
          if (!nChamps && !titre && estTitre(n.text)) titre = texte;
          else if (estTitre(n.text)) enAttente = texte;
          else if (!nChamps) description.push(texte);
          else enAttente = enAttente || texte;
        } else if (n.type === 'Section') {
          nouvelleSection(enAttente);
          enAttente = null;
        } else if (n.type === 'Field') {
          ajouterChamp(champParRef[n.leaf]);
        }
      });

      /*
       * Un formulaire dont personne n'a touché la mise en page.
       *
       * > **`layoutSpec` reste vide tant que l'éditeur ne l'a pas écrit.**
       * > Mesuré le 04/10/2026 sur grist.numerique : une section de type `form`
       * > créée par action, puis ouverte, affiche bien ses quatre questions à
       * > l'écran — et le lecteur ne rendait rien, sans un mot. Grist tient
       * > alors la disposition par défaut pour lui, et seules les colonnes de
       * > la section disent ce que le formulaire demande.
       *
       * On retombe donc sur elles, dans leur ordre, ce qui est exactement ce
       * que Grist affiche. L'ordre et les titres repris de la mise en page
       * restent prioritaires quand elle existe.
       *
       * Seulement quand elle est **absente** : une mise en page présente mais
       * illisible est un signe d'autre chose, et on préfère ne rien rendre
       * plutôt que d'inventer un formulaire à partir d'un reste.
       */
      if (!nChamps && !String(s.layoutSpec || '').trim()) {
        (champsParSection[s.id] || []).slice()
          .sort(function (a, b) { return (a.parentPos || 0) - (b.parentPos || 0); })
          .forEach(ajouterChamp);
      }

      sections = sections.filter(function (sec) { return sec.fields.length; });
      if (!sections.length) return;
      var nom = titre || texteSimple(s.title) || String(nomVue[s.parentId] || '').replace(/^[^\p{L}\p{N}]+/u, '').trim() || tableId;
      sections.forEach(function (sec) { if (!sec.label) sec.label = nom; });

      var partage = lireOptions(s.shareOptions);
      out.push({
        formId: idFormulaireGrist(s.id),
        sectionId: s.id,
        titre: nom,
        tableCible: tableId,
        statut: 'publie',
        partage: partage.publish === true && partage.form !== false,
        source: 'grist',
        def: {
          manifest_version: '1.0.0',
          id: idFormulaireGrist(s.id),
          title: nom,
          description: description.join('\n\n'),
          tableId: tableId,
          composeMode: 'bind',
          source: { type: 'grist-form', section: s.id },
          sections: sections,
          choices: {},
        },
      });
    });
    return out;
  }

  /** Les tables de métadonnées que `formulairesGrist` lit, dans l'ordre de `meta`. */
  var TABLES_META = {
    tables: '_grist_Tables',
    colonnes: '_grist_Tables_column',
    vues: '_grist_Views',
    sections: '_grist_Views_section',
    champs: '_grist_Views_section_field',
  };

  return {
    PREFIXE: PREFIXE,
    TABLES_META: TABLES_META,
    idFormulaireGrist: idFormulaireGrist,
    estFormulaireGrist: estFormulaireGrist,
    texteSimple: texteSimple,
    champDepuisQuestion: champDepuisQuestion,
    formulairesGrist: formulairesGrist,
  };
}));
