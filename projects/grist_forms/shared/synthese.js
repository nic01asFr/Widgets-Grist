/**
 * synthese.js — ce que les réponses disent, une fois relues avec le FormDef.
 *
 * > **La table des réponses n'est pas lisible seule.** Une échelle y écrit `4`
 * > dans une colonne d'entiers — on ne sait pas si c'est « plutôt d'accord » ou
 * > « 4 sur 10 ». Un classement est éclaté en trois colonnes. « Autre » vit
 * > ailleurs que la liste à laquelle il appartient. Le FormDef, lui, sait tout
 * > cela : la synthèse n'est que la table relue par lui.
 *
 * Ce module ne dessine rien et ne connaît pas Grist. Il prend une définition et
 * des lignes, il rend un modèle. C'est ce qui permet de l'éprouver sans écran,
 * et de poser le même calcul derrière un tableau de bord, un export ou une page
 * publiée.
 *
 * **Ce qu'il ne fait pas, volontairement** : des graphiques, des croisements,
 * des agrégats libres. Grist sait faire des résumés et des graphiques, et le
 * fera mieux. Ce qui lui manque, et qui est ici, c'est le sens que seul le
 * FormDef porte.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.FormSynthese = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  /**
   * La polarité d'une échelle : ce que « haut » veut dire.
   *
   * > **Sans elle, on ne peut rien faire ressortir.** « Les espaces sont
   * > agréables » et « Il faudrait ajouter des places » se notent toutes deux
   * > de 1 à 5, mais un 5 est une bonne nouvelle dans un cas et une demande
   * > dans l'autre. Les mettre dans le même classement, c'est mélanger ce qui
   * > va bien et ce qui reste à faire.
   *
   * Le questionnaire écrit à la main portait cette marque sur chaque question
   * (`p: 'fav' | 'bes' | 'pref'`) ; elle entre ici dans le FormDef.
   */
  var POLARITES = ['satisfaction', 'besoin', 'preference'];

  function polariteDe(field) {
    var p = field && field.options && field.options.polarite;
    return POLARITES.indexOf(p) >= 0 ? p : null;
  }

  /** Toutes les questions, à plat, en gardant leur section. */
  function questions(formDef) {
    var out = [];
    ((formDef && formDef.sections) || []).forEach(function (section) {
      (section.fields || []).forEach(function (field) {
        out.push({ section: section, field: field });
      });
    });
    return out;
  }

  function valeursDe(lignes, colId) {
    var out = [];
    for (var i = 0; i < lignes.length; i++) {
      var v = lignes[i] ? lignes[i][colId] : undefined;
      if (v !== undefined) out.push(v);
    }
    return out;
  }

  function estVide(v) {
    if (v === null || v === undefined || v === '') return true;
    if (Array.isArray(v)) return v.length === 0 || (v.length === 1 && v[0] === 'L');
    return false;
  }

  /**
   * Les bornes d'une échelle, et le seuil au-delà duquel on dit « haut ».
   *
   * Le questionnaire écrit à la main comptait les 4 et les 5 d'une échelle de 1
   * à 5 : les deux crans supérieurs. On garde cette règle, en la rendant vraie
   * pour toute amplitude — mais jamais plus de la moitié de l'échelle, sinon
   * « haut » ne voudrait plus rien dire sur une échelle à trois crans.
   */
  function seuilHaut(min, max) {
    var crans = max - min + 1;
    var hauts = crans >= 4 ? 2 : 1;
    return max - hauts + 1;
  }

  /**
   * Ce qu'une échelle dit : combien ont répondu, la moyenne, et les parts.
   *
   * Les sans-réponse ne comptent pas dans la moyenne, et `n` est toujours rendu
   * avec le résultat : « 70 % » sur quatre réponses n'est pas « 70 % » sur deux
   * cents, et une synthèse qui cache son `n` ment par omission.
   */
  function statsEchelle(lignes, colId, min, max) {
    var vals = [];
    valeursDe(lignes, colId).forEach(function (v) {
      var n = typeof v === 'number' ? v : parseFloat(v);
      if (isFinite(n) && n >= min && n <= max) vals.push(n);
    });
    var n = vals.length;
    if (!n) return { n: 0, moyenne: null, haut: null, bas: null, repartition: {} };
    var somme = 0;
    var repartition = {};
    var sHaut = seuilHaut(min, max);
    var sBas = min + (max - min + 1 >= 4 ? 1 : 0);
    var hauts = 0;
    var bas = 0;
    for (var i = 0; i < n; i++) {
      somme += vals[i];
      repartition[vals[i]] = (repartition[vals[i]] || 0) + 1;
      if (vals[i] >= sHaut) hauts++;
      if (vals[i] <= sBas) bas++;
    }
    return {
      n: n,
      moyenne: somme / n,
      haut: hauts / n,
      bas: bas / n,
      repartition: repartition
    };
  }

  /** Les bornes déclarées d'une échelle, par son nom ou en clair. */
  function bornes(field, formDef) {
    var o = (field && field.options) || {};
    var e = o.echelle && formDef && formDef.echelles ? formDef.echelles[o.echelle] : null;
    var min = (e && e.min) != null ? e.min : (o.min != null ? o.min : 1);
    var max = (e && e.max) != null ? e.max : (o.max != null ? o.max : 5);
    return { min: min, max: max, libelles: (e && e.libelles) || o.libelles || [] };
  }

  /**
   * Un classement, ramené à un score.
   *
   * > **Pondération décroissante** : sur trois rangs, une première place vaut 3
   * > points, une deuxième 2, une troisième 1 — la règle que le questionnaire
   * > écrit à la main appliquait, et celle que tout le monde attend d'un
   * > classement. Le nombre de rangs vient du FormDef, pas d'une constante.
   */
  function scoresClassement(lignes, field) {
    var cols = (field.options && field.options.colonnes && field.options.colonnes.rangs) || [];
    var rangs = cols.length;
    var scores = {};
    var premiers = {};
    var citations = {};
    for (var i = 0; i < lignes.length; i++) {
      for (var r = 0; r < rangs; r++) {
        var v = lignes[i] ? lignes[i][cols[r]] : null;
        if (estVide(v)) continue;
        var cle = String(v);
        scores[cle] = (scores[cle] || 0) + (rangs - r);
        citations[cle] = (citations[cle] || 0) + 1;
        if (r === 0) premiers[cle] = (premiers[cle] || 0) + 1;
      }
    }
    return Object.keys(scores).map(function (k) {
      return { option: k, points: scores[k], premier: premiers[k] || 0, citations: citations[k] };
    }).sort(function (a, b) { return b.points - a.points; });
  }

  /** Les valeurs d'une ChoiceList, dépliées : Grist les préfixe d'un « L ». */
  function itemsListe(v) {
    if (Array.isArray(v)) return v[0] === 'L' ? v.slice(1) : v.slice();
    if (typeof v === 'string' && v !== '') return [v];
    return [];
  }

  /** Combien de fois chaque réponse a été citée. */
  function frequences(lignes, colId) {
    var f = {};
    valeursDe(lignes, colId).forEach(function (v) {
      itemsListe(v).forEach(function (x) {
        if (x === null || x === undefined || x === '') return;
        f[String(x)] = (f[String(x)] || 0) + 1;
      });
    });
    return Object.keys(f).map(function (k) { return { valeur: k, n: f[k] }; })
      .sort(function (a, b) { return b.n - a.n; });
  }

  /** La médiane, qui résiste à la personne partie déjeuner au milieu. */
  function mediane(nombres) {
    var v = nombres.filter(function (x) { return typeof x === 'number' && isFinite(x) && x > 0; })
      .sort(function (a, b) { return a - b; });
    if (!v.length) return null;
    var m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }

  /**
   * Relire une table de réponses avec la définition qui les a produites.
   *
   * `lignes` est une liste d'objets `{ colId: valeur }` — ce que rend n'importe
   * quel lecteur de table Grist, une fois les colonnes remises en lignes.
   */
  function construire(formDef, lignes) {
    lignes = lignes || [];
    var qs = questions(formDef);
    var meta = (formDef && formDef.meta) || {};

    var sections = [];
    var echelles = [];
    var classements = [];
    var listes = [];
    var verbatims = [];
    var lieux = [];
    var pieces = [];

    ((formDef && formDef.sections) || []).forEach(function (section) {
      var mesures = [];
      (section.fields || []).forEach(function (field) {
        var type = String(field.type || '');
        var b;

        if (field.widget === 'echelle' || field.kind === 'echelle' || field.widget === 'likert') {
          b = bornes(field, formDef);
          var st = statsEchelle(lignes, field.colId, b.min, b.max);
          var mesure = {
            colId: field.colId, label: field.label, polarite: polariteDe(field),
            min: b.min, max: b.max, libelles: b.libelles,
            n: st.n, moyenne: st.moyenne, haut: st.haut, bas: st.bas, repartition: st.repartition
          };
          mesures.push(mesure);
          echelles.push(mesure);
          return;
        }

        if (field.kind === 'classement') {
          classements.push({
            colId: field.colId, label: field.label, scores: scoresClassement(lignes, field)
          });
          return;
        }

        if (field.widget === 'geo' || field.kind === 'geometrie') {
          var cols = (field.options && field.options.colonnes) || {};
          var colGeo = cols.geometrie || field.colId;
          var wkts = valeursDe(lignes, colGeo).filter(function (v) { return !estVide(v); })
            .map(function (v) { return String(v); });
          lieux.push({ colId: colGeo, label: field.label, wkts: wkts });
          return;
        }

        if (type === 'Attachments') {
          pieces.push({
            colId: field.colId, label: field.label,
            n: valeursDe(lignes, field.colId).filter(function (v) { return !estVide(v); }).length
          });
          return;
        }

        if (type === 'Choice' || type === 'ChoiceList' || field.widget === 'ouinon' || type === 'Bool') {
          var items = field.widget === 'ouinon' || type === 'Bool'
            ? ouiNon(lignes, field)
            : frequences(lignes, field.colId);
          var liste = { colId: field.colId, label: field.label, items: items,
            n: items.reduce(function (a, x) { return a + x.n; }, 0) };
          // « Autre : … » est une réponse de la liste, pas une colonne de plus :
          // on la ramène là où le public l'a donnée.
          var autre = field.options && field.options.colonnes && field.options.colonnes.autre;
          if (autre) {
            liste.autres = valeursDe(lignes, autre)
              .filter(function (v) { return !estVide(v); }).map(String);
          }
          listes.push(liste);
          mesures.push(liste);
          return;
        }

        if (type === 'Text' || type === 'Any') {
          var textes = valeursDe(lignes, field.colId)
            .filter(function (v) { return !estVide(v); }).map(function (v) { return String(v).trim(); });
          if (textes.length || field.widget === 'textarea') {
            verbatims.push({ colId: field.colId, label: field.label, textes: textes });
          }
        }
      });
      if (mesures.length) sections.push({ id: section.id, label: section.label, mesures: mesures });
    });

    // Ce qui ressort : les échelles les mieux notées, rangées selon ce que
    // « haut » veut dire pour chacune.
    var avecPolarite = echelles.filter(function (m) { return m.n > 0 && m.polarite; });
    function trierParHaut(p) {
      return avecPolarite.filter(function (m) { return m.polarite === p; })
        .sort(function (a, b) { return b.haut - a.haut; });
    }

    var durees = meta.durationCol ? valeursDe(lignes, meta.durationCol) : [];

    return {
      reponses: lignes.length,
      duree: { mediane: mediane(durees), n: durees.filter(function (v) { return v > 0; }).length },
      sections: sections,
      ressort: {
        besoins: trierParHaut('besoin'),
        satisfactions: trierParHaut('satisfaction'),
        preferences: trierParHaut('preference')
      },
      classements: classements,
      listes: listes,
      verbatims: verbatims,
      lieux: lieux,
      pieces: pieces,
      questions: qs.length
    };
  }

  /** Oui / Non : deux réponses, comptées comme telles et non comme 0 et 1. */
  function ouiNon(lignes, field) {
    var o = (field && field.options) || {};
    var oui = 0;
    var non = 0;
    valeursDe(lignes, field.colId).forEach(function (v) {
      if (v === true || v === 1 || v === 'true') oui++;
      else if (v === false || v === 0 || v === 'false') non++;
    });
    var out = [];
    if (oui) out.push({ valeur: o.libelleOui || 'Oui', n: oui });
    if (non) out.push({ valeur: o.libelleNon || 'Non', n: non });
    return out.sort(function (a, b) { return b.n - a.n; });
  }

  /**
   * Les lignes d'une table Grist, remises à l'endroit.
   *
   * Grist rend ses tables en colonnes (`{ colId: [v1, v2, …] }`) ; tout le
   * reste du moteur travaille en lignes.
   */
  function enLignes(colonnaire) {
    if (!colonnaire || typeof colonnaire !== 'object') return [];
    // Selon d'ou vient la table, elle arrive deja en lignes : `loadTable` du
    // bridge les rend ainsi, `fetchTable` non. On accepte les deux plutot que
    // de demander a chaque appelant de savoir lequel il tient.
    if (Array.isArray(colonnaire)) return colonnaire;
    var cles = Object.keys(colonnaire);
    if (!cles.length) return [];
    var longueur = 0;
    cles.forEach(function (k) {
      if (Array.isArray(colonnaire[k])) longueur = Math.max(longueur, colonnaire[k].length);
    });
    var out = [];
    for (var i = 0; i < longueur; i++) {
      var ligne = {};
      cles.forEach(function (k) {
        if (Array.isArray(colonnaire[k])) ligne[k] = colonnaire[k][i];
      });
      out.push(ligne);
    }
    return out;
  }

  return {
    VERSION: VERSION,
    POLARITES: POLARITES,
    construire: construire,
    enLignes: enLignes,
    // Exposés pour les essais, et parce qu'ils servent seuls.
    statsEchelle: statsEchelle,
    scoresClassement: scoresClassement,
    frequences: frequences,
    mediane: mediane,
    seuilHaut: seuilHaut,
    itemsListe: itemsListe
  };
}));
