/* Rejeu d'une capture d'import dans un VRAI document Grist (anonyme, temporaire).
 *
 * A coller/injecter (evaluate_script) dans l'onglet d'un document Grist ouvert sur
 * docs.getgrist.com ("Blank document" depuis l'accueil, jamais un document de
 * l'utilisateur). Les widgets locaux (localhost) sont bloques par Grist cloud : on
 * rejoue donc les actions via window.gristDocPageModel.gristDoc.get().docData.sendActions.
 *
 * Expose window.__q2gRejeu.rejouer(brut) ou `brut` est { scenario, appels:[ [action,...], ... ] }
 * (capture brute, ou version reduite par reduire-brut.mjs).
 *
 * Rend un rapport : { acceptees, refusees, tables:[...], ecarts:[...] }.
 * Un "ecart" est une difference entre ce que l'AddTable demandait et ce que Grist a cree
 * (type de base, libelle, choix, description, renommage de colonne ou de table).
 */
(function () {
  'use strict';

  function doc() {
    var gd = window.gristDocPageModel && window.gristDocPageModel.gristDoc.get();
    if (!gd) throw new Error('document Grist non ouvert dans cet onglet');
    return gd;
  }

  function lignesMeta(gd, nomTable) {
    return gd.docData.getMetaTable(nomTable).getRecords();
  }

  function leTableDeId(gd, tableId) {
    return lignesMeta(gd, '_grist_Tables').filter(function (t) { return t.tableId === tableId; })[0];
  }

  function colonnesReelles(gd, tableId) {
    var t = leTableDeId(gd, tableId);
    if (!t) return null;
    return lignesMeta(gd, '_grist_Tables_column')
      .filter(function (c) { return c.parentId === t.id && c.colId !== 'manualSort' && !/^gristHelper_/.test(c.colId); })
      .sort(function (a, b) { return a.parentPos - b.parentPos; });
  }

  function jsonOuNull(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function base(t) { return String(t || '').split(':')[0]; }

  async function rejouer(brut) {
    var gd = doc();
    var rapport = { scenario: brut.scenario, acceptees: 0, refusees: 0, erreurs: [], tables: [], ecarts: [] };
    var demandes = {}; // tableId demande -> { colonnes demandees, tableIdReel, colIdsReels }

    for (var i = 0; i < brut.appels.length; i++) {
      var actions = brut.appels[i];
      try {
        var ret = await gd.docData.sendActions(actions);
        rapport.acceptees++;
        actions.forEach(function (a, k) {
          if (a[0] === 'AddTable') {
            var r = ret[k] || {};
            demandes[a[1]] = { colonnes: a[2], tableIdReel: r.table_id, colIdsReels: r.columns };
          }
        });
      } catch (e) {
        rapport.refusees++;
        rapport.erreurs.push({ appel: i, actions: actions.map(function (a) { return a[0] + ':' + a[1]; }), erreur: String((e && e.message) || e) });
      }
    }

    Object.keys(demandes).forEach(function (nom) {
      var d = demandes[nom];
      var reel = d.tableIdReel || nom;
      if (reel !== nom) rapport.ecarts.push({ table: nom, nature: 'table renommee', demande: nom, reel: reel });
      var cols = colonnesReelles(gd, reel) || [];
      var parId = {};
      cols.forEach(function (c) { parId[c.colId] = c; });
      var nbLignes = gd.docData.getTable(reel) ? gd.docData.getTable(reel).numRecords() : null;
      var t = { table: reel, nbColonnes: cols.length, nbLignes: nbLignes, types: {} };
      d.colonnes.forEach(function (c, idx) {
        var idReel = (d.colIdsReels && d.colIdsReels[idx]) || c.id;
        if (idReel !== c.id) rapport.ecarts.push({ table: reel, colonne: c.id, nature: 'colonne renommee', reel: idReel });
        var r = parId[idReel];
        if (!r) { rapport.ecarts.push({ table: reel, colonne: c.id, nature: 'colonne absente' }); return; }
        t.types[base(r.type)] = (t.types[base(r.type)] || 0) + 1;
        if (base(r.type) !== base(c.type)) rapport.ecarts.push({ table: reel, colonne: c.id, nature: 'type', demande: c.type, reel: r.type });
        if (base(c.type) === 'Ref' || base(c.type) === 'RefList') {
          var cibleDemandee = String(c.type).split(':')[1];
          var cibleReelle = String(r.type).split(':')[1];
          if (cibleDemandee !== cibleReelle) rapport.ecarts.push({ table: reel, colonne: c.id, nature: 'cible Ref', demande: c.type, reel: r.type });
        }
        if (c.label && r.label !== c.label) rapport.ecarts.push({ table: reel, colonne: c.id, nature: 'libelle', demande: c.label, reel: r.label });
        if (c.description && r.description !== c.description) rapport.ecarts.push({ table: reel, colonne: c.id, nature: 'description', demande: c.description, reel: r.description });
        if (c.widgetOptions) {
          var wd = jsonOuNull(c.widgetOptions), wr = jsonOuNull(r.widgetOptions);
          if (wd && wd.choices) {
            var ok = wr && JSON.stringify(wr.choices) === JSON.stringify(wd.choices);
            if (!ok) rapport.ecarts.push({ table: reel, colonne: c.id, nature: 'choix', demande: wd.choices, reel: wr && wr.choices });
          }
        }
      });
      rapport.tables.push(t);
    });
    return rapport;
  }

  async function nettoyer(brut) {
    // Supprime les tables creees par le rejeu (le document est jetable, mais on rend la main propre).
    var gd = doc();
    var noms = [];
    brut.appels.forEach(function (as) { as.forEach(function (a) { if (a[0] === 'AddTable') noms.push(a[1]); }); });
    var presents = lignesMeta(gd, '_grist_Tables').map(function (t) { return t.tableId; });
    var acts = noms.filter(function (n) { return presents.indexOf(n) >= 0; }).map(function (n) { return ['RemoveTable', n]; });
    if (acts.length) await gd.docData.sendActions(acts);
    return acts.length;
  }

  window.__q2gRejeu = { rejouer: rejouer, nettoyer: nettoyer, colonnesReelles: function (t) { return colonnesReelles(doc(), t); } };
})();
