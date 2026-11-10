// Chronometrage de l'ouverture de la carte (showPreviewMap -> toast « Carte prete »), sur la meme fixture et dans les memes
// conditions : onglet NEUF entre deux mesures (new_page, mesure, close_page), serveur local, Atlas publie sur github.io.
//
//   await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = '/tests/harness/mesure-carte.js';
//     s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
//   await window.__q2gPerf.mesurer()                     // { ms, jalons? }  (QField Wastewater, apercu local)
//   await window.__q2gPerf.mesurer({ jalons: true })     // en plus : debut et duree de chaque etape (fonctions encapsulees)
//   await window.__q2gPerf.mesurer({ latenceGristMs: 60 })  // « Grist simule » : faux docApi (tests/harness/faux-docapi.js) avec
//                                                           // 60 ms par appel et une table vide par cible de Ref : la lecture des
//                                                           // libelles de references (listTables + fetchTable) devient visible
//
// Pour comparer a un commit anterieur : `git archive <commit> projects/qgis2grist projects/grist_forms` dans un dossier
// temporaire, copier ce fichier dans tests/harness/, lancer `node tests/harness/serveur.mjs <autre port>` depuis ce dossier.
// Les jalons n'existent que pour les fonctions presentes dans la page (la liste est volontairement large).
(function () {
  'use strict';
  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
  const ETAPES = [
    'applyLodToImportedLayers', 'loadLayerRowsForMap', 'creerClientAtlas', 'chargerLibellesReferences', 'appliquerThemeAtlas',
    'construireBoutonsCouchesAtlas', 'construireFiltresAtlas', 'chargerVuesAtlas', 'rafraichirLegendeAtlas', 'majPastilleVolume',
    'demarrerSyncAtlas', 'preparerPanneauxTiroir',
  ];

  async function mesurer(opts) {
    const o = opts || {};
    const lien = document.querySelector('.dev-fixture-link[data-name="' + (o.fixture || 'qfield_wastewater.zip') + '"]');
    if (!lien) throw new Error('fixture introuvable');
    lien.click();
    for (let i = 0; i < 400; i++) { if (document.getElementById('state-preview').classList.contains('active')) break; await attendre(50); }
    await attendre(500);
    const jalons = [];
    if (o.latenceGristMs) {
      if (!window.__q2gFaux) await new Promise((ok, ko) => { const sc = document.createElement('script'); sc.src = '/tests/harness/faux-docapi.js'; sc.onload = ok; sc.onerror = ko; document.head.appendChild(sc); });
      const tables = {};
      for (const l of (window.parsedLayers || (typeof parsedLayers !== 'undefined' ? parsedLayers : []))) {
        for (const f of (l.fields || [])) {
          const m = /^(?:Ref|RefList):(.+)$/.exec(String(f.gType || ''));
          if (m) tables[m[1]] = { cols: ['value_en'], rows: [{ id: 1, value_en: 'a' }, { id: 2, value_en: 'b' }] };
        }
      }
      window.__q2gFaux.installer({ latenceMs: o.latenceGristMs, tables });
      window.eval('_gristAvailable = true');
    }
    const T0 = performance.now();
    if (o.jalons) {
      for (const nom of ETAPES) {
        const f = window[nom];
        if (typeof f !== 'function') continue;
        window[nom] = function () {
          const t = performance.now();
          const r = f.apply(this, arguments);
          if (r && typeof r.then === 'function') return r.then((v) => { jalons.push([nom, Math.round(t - T0), Math.round(performance.now() - t)]); return v; });
          jalons.push([nom, Math.round(t - T0), Math.round(performance.now() - t)]);
          return r;
        };
      }
    }
    let tToast = null;
    const orig = window.showToast;
    window.showToast = function (m, t) { if (/prête/.test(m) && tToast === null) tToast = performance.now(); return orig.apply(this, arguments); };
    window.showPreviewMap();
    for (let i = 0; i < 800 && tToast === null; i++) await attendre(20);
    const sortie = { ms: tToast === null ? null : Math.round(tToast - T0), port: location.port, largeur: innerWidth };
    if (o.jalons) sortie.jalons = jalons;
    return sortie;
  }

  window.__q2gPerf = { mesurer };
})();
