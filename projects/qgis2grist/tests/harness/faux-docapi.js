// Faux docApi en memoire pour essayer l'interface de qgis2grist (vues enregistrees, libelles de references, statut en direct)
// dans un navigateur HORS Grist : meme forme que le docApi du plugin (listTables, fetchTable colonaire, applyUserActions),
// avec une latence reglable. Il ne valide rien et n'ecrit nulle part ailleurs qu'en memoire.
//
//   await chargerScript('/tests/harness/faux-docapi.js');
//   const faux = window.__q2gFaux.installer({ latenceMs: 40 });   // branche window.grist.docApi ; puis _gristAvailable = true dans la page
//   faux.journal                                                    // actions appliquees
//   faux.tables                                                     // tables en memoire (cols, rows)
//
// Apres installation, la carte deja ouverte en apercu doit etre relancee a la main : `_previewMapMode = false;
// await chargerVuesAtlas();` pour les vues ; `showPreviewMap()` apres installation pour que l'import lise ces tables.
(function () {
  'use strict';

  function creer(opts) {
    const o = opts || {};
    const latence = Number.isFinite(o.latenceMs) ? o.latenceMs : 0;
    const attendre = () => (latence > 0 ? new Promise((r) => setTimeout(r, latence)) : Promise.resolve());
    const tables = {};
    for (const [nom, def] of Object.entries(o.tables || {})) {
      tables[nom] = { cols: def.cols.slice(), rows: def.rows.map((r) => ({ ...r })) };
    }
    let prochainId = 100;
    const journal = [];
    const appels = [];
    const api = {
      journal,
      appels,
      tables,
      async listTables() { appels.push('listTables'); await attendre(); return Object.keys(tables); },
      async fetchTable(nom) {
        appels.push('fetchTable:' + nom);
        await attendre();
        if (!tables[nom]) throw new Error('table inconnue ' + nom);
        const rec = { id: tables[nom].rows.map((r) => r.id) };
        for (const c of tables[nom].cols) rec[c] = tables[nom].rows.map((r) => (c in r ? r[c] : null));
        return rec;
      },
      async applyUserActions(actions) {
        await attendre();
        const retValues = [];
        for (const a of actions) {
          journal.push(JSON.parse(JSON.stringify(a)));
          const type = a[0], nom = a[1];
          if (type === 'AddTable') {
            if (tables[nom]) throw new Error('table deja existante');
            tables[nom] = { cols: a[2].map((c) => c.id), rows: [] };
            retValues.push({ table_id: nom });
          } else if (type === 'AddColumn') {
            if (!tables[nom]) throw new Error('table inconnue');
            tables[nom].cols.push(a[2]);
            retValues.push(null);
          } else if (type === 'AddRecord') {
            if (!tables[nom]) throw new Error('table inconnue');
            const id = prochainId++;
            tables[nom].rows.push({ id, ...a[3] });
            retValues.push(id);
          } else if (type === 'UpdateRecord') {
            const r = tables[nom].rows.find((x) => x.id === a[2]);
            if (!r) throw new Error('ligne inconnue');
            Object.assign(r, a[3]);
            retValues.push(null);
          } else {
            throw new Error('action non prevue : ' + type);
          }
        }
        return { retValues };
      },
    };
    return api;
  }

  /** Branche le faux docApi sur window.grist (sans toucher au vrai objet) et declare Grist disponible. */
  function installer(opts) {
    const api = creer(opts);
    const faux = Object.create(window.grist);
    Object.defineProperty(faux, 'docApi', { value: api, configurable: true });   // docApi est un accesseur sans mutateur du vrai objet
    window.grist = faux;
    return api;
  }

  window.__q2gFaux = { creer, installer };
})();
