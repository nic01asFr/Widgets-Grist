/*
 * Faux document Grist pour la capture de la bulle d'objet (vitrine). Données entièrement fictives :
 * cinq passerelles inventées, trois états, des contrôles, et des « photos » dessinées ici même.
 * Même plomberie que faux-releve.js : l'application croit parler à un serveur REST Grist.
 */
(function () {
  window.Capacitor = { isNativePlatform: function () { return true; } };
  var g;
  Object.defineProperty(window, 'grist', { configurable: true, get: function () { return g; }, set: function (v) { if (v && v._adaptateur) g = v; } });
  try { localStorage.setItem('atlas_connexion', JSON.stringify({ baseUrl: 'https://grist.essai', jeton: 'cle-essai', docId: (location.search.indexOf('liste=1') >= 0 ? '' : 'docEssai') })); } catch (e) {}

  function svg(ciel, eau, dessin) {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300"><defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + ciel[0] + '"/><stop offset="1" stop-color="' + ciel[1] + '"/></linearGradient></defs>'
      + '<rect width="480" height="300" fill="url(#c)"/><rect y="205" width="480" height="95" fill="' + eau + '"/>'
      + '<path d="M0 205 Q60 190 120 205 T240 205 T360 205 T480 205" fill="none" stroke="#ffffff55" stroke-width="3"/>' + dessin + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  }
  var photos = {
    1: svg(['#9ec5e3', '#e8f0f6'], '#5f8da8',
      '<rect x="0" y="150" width="480" height="22" fill="#8a8277"/><path d="M40 205 V172 A60 60 0 0 1 160 172 V205 Z M200 205 V172 A60 60 0 0 1 320 172 V205 Z M360 205 V172 A60 60 0 0 1 480 172 V205 Z" fill="#a39a8c"/><rect x="0" y="140" width="480" height="12" fill="#6f685d"/>'),
    2: svg(['#c7dcc0', '#eef3e6'], '#6d8c7a',
      '<rect x="60" y="150" width="360" height="12" fill="#9c6b3f"/><g fill="#7d5430"><rect x="90" y="150" width="8" height="75"/><rect x="200" y="150" width="8" height="75"/><rect x="310" y="150" width="8" height="75"/><rect x="400" y="150" width="8" height="75"/></g><path d="M60 150 V118 H420 V150" fill="none" stroke="#7d5430" stroke-width="6"/><g stroke="#7d5430" stroke-width="3"><path d="M100 118 V150 M140 118 V150 M180 118 V150 M220 118 V150 M260 118 V150 M300 118 V150 M340 118 V150 M380 118 V150"/></g>'),
    3: svg(['#c9d3de', '#f1f3f5'], '#56717f',
      '<rect x="0" y="160" width="480" height="14" fill="#5b6770"/><path d="M60 160 L120 100 L240 100 L360 100 L420 160" fill="none" stroke="#5b6770" stroke-width="7"/><path d="M120 100 L180 160 L240 100 L300 160 L360 100" fill="none" stroke="#5b6770" stroke-width="4"/><rect x="110" y="174" width="14" height="45" fill="#4a545c"/><rect x="356" y="174" width="14" height="45" fill="#4a545c"/>')
  };

  var pts = [
    ['Pont des Lavandières', 'Pont en maçonnerie', 1, 'Rue du Moulin', ['L', 1], 5.3930, 43.3045],
    ['Passerelle du Gué', 'Passerelle bois', 3, 'Chemin du Gué', ['L', 2], 5.3956, 43.3052],
    ['Pont de la Tuilerie', 'Pont en acier', 2, 'Avenue de la Tuilerie', ['L', 3], 5.3979, 43.3041],
    ['Passerelle des Aulnes', 'Passerelle bois', 2, 'Sentier des Aulnes', ['L', 2], 5.3912, 43.3030],
    ['Pont du Chemin Vert', 'Pont en maçonnerie', 1, 'Chemin Vert', ['L', 1], 5.3947, 43.3029]
  ];
  var tables = {
    Passerelles: { cols: [['Nom', 'Text'], ['Type', 'Text'], ['Etat', 'Ref:Etats'], ['Adresse', 'Text'], ['Photos', 'Attachments'], ['Latitude', 'Numeric'], ['Longitude', 'Numeric'], ['Categorie', 'Text'], ['Delai', 'Numeric']],
      rows: pts.map(function (p, i) { return { id: i + 1, fields: { Nom: p[0], Type: p[1], Etat: p[2], Adresse: p[3], Photos: p[4], Longitude: p[5], Latitude: p[6], Categorie: ["A_Bon état / pas de travaux envisagés","B_Etat moyen, travaux à envisager à moyen terme","C_Etat mauvais, travaux à envisager à court terme","D_Etat critique, intervention urgente à prévoir","N-A"][i%5], Delai: [-6,-2,0,3,5][i%5] } }; }) },
    Etats: { cols: [['Libelle', 'Text'], ['Couleur', 'Text'], ['Rang', 'Numeric']], rows: [
      { id: 1, fields: { Libelle: 'Bon état', Couleur: '#4caf7a', Rang: 0 } },
      { id: 2, fields: { Libelle: 'À surveiller', Couleur: '#f0b429', Rang: 1 } },
      { id: 3, fields: { Libelle: 'Dégradé', Couleur: '#d64545', Rang: 2 } } ] },
    Controles: { cols: [['Passerelle', 'Ref:Passerelles'], ['Date_controle', 'Date'], ['Etat_constate', 'Ref:Etats'], ['Constat', 'Text']], rows: [
      { id: 1, fields: { Passerelle: 2, Date_controle: 1694000000, Etat_constate: 2, Constat: 'Planches usées par endroits' } },
      { id: 2, fields: { Passerelle: 2, Date_controle: 1725000000, Etat_constate: 3, Constat: 'Un pieu fendu côté rive gauche' } },
      { id: 3, fields: { Passerelle: 1, Date_controle: 1720000000, Etat_constate: 1, Constat: 'Rien à signaler' } },
      { id: 4, fields: { Passerelle: 3, Date_controle: 1722000000, Etat_constate: 2, Constat: 'Corrosion légère des appuis' } } ] }
  };
  tables.Atlas_LayerPrefs = { cols: [["source_table","Text"],["StyleJSON","Text"],["Visible","Bool"],["UpdatedAt","Numeric"]], rows: [ { id: 1, fields: { source_table: "Passerelles", Visible: true, StyleJSON: JSON.stringify({ mode: "mapbox", controls: [ { field: "Categorie", type: "select", label: "État", active: true }, { field: "Delai", type: "range", label: "Prochaine visite (mois)", active: true } ] }) } } ] };
  var dense = []; for (var i = 0; i < 140; i++) { var a = (i * 2.399) % 6.283, rr = 0.0006 + 0.0100 * ((i * 37) % 100) / 100; dense.push({ id: i + 1, fields: { Nom: 'Point ' + (i + 1), Etat: ['Bon','Moyen','Mauvais','Critique'][(i * 7) % 4 === 0 && i % 9 === 0 ? 3 : i % 3], Latitude: 43.3045 + rr * Math.sin(a), Longitude: 5.3950 + rr * 1.35 * Math.cos(a) } }); }
  tables.Points_dense = { cols: [['Nom','Text'],['Etat','Text'],['Latitude','Numeric'],['Longitude','Numeric']], rows: dense };
  tables.Sentiers = { cols: [['Nom','Text'],['WKT','Text']], rows: [ { id: 1, fields: { Nom: 'Boucle des essais', WKT: 'LINESTRING (5.389 43.301, 5.392 43.3035, 5.395 43.3045, 5.398 43.3062, 5.401 43.308)' } } ] };
  var tr = []; var gx = [5.390, 5.394, 5.398, 5.402], gy = [43.300, 43.304, 43.308]; var idr = 1; function seg(a, b) { tr.push({ id: idr++, fields: { Nom: 'Tronçon ' + idr, WKT: 'LINESTRING (' + a[0] + ' ' + a[1] + ', ' + ((a[0]+b[0])/2).toFixed(6) + ' ' + ((a[1]+b[1])/2).toFixed(6) + ', ' + b[0] + ' ' + b[1] + ')' } }); }
  gx.forEach(function (x, i) { gy.forEach(function (y, j) { if (i < gx.length - 1) seg([x, y], [gx[i+1], y]); if (j < gy.length - 1) seg([x, y], [x, gy[j+1]]); }); });
  tables.Routes_troncons = { cols: [['Nom','Text'],['WKT','Text']], rows: tr };
  // ?tournee=1 : un contexte « Boucle de la vallée » qui porte sa tournée (une ligne figée passant près des cinq passerelles, dans cet ordre).
  if (location.search.indexOf('tournee=1') >= 0) {
    // La couleur d'une couche ajoutée est tirée au hasard : on la fixe (bleu), pour que les points se distinguent de la ligne rouge de la tournée.
    var hasard = Math.random.bind(Math);
    Math.random = function () { return /randomColor/.test(new Error().stack || '') ? 0.8 : hasard(); };
    var ligne = [[5.3908, 43.3028], [5.3912, 43.3030], [5.3930, 43.3027], [5.3947, 43.3029], [5.3965, 43.3033], [5.3979, 43.3041], [5.3972, 43.3048], [5.3956, 43.3052], [5.3941, 43.3050], [5.3930, 43.3045]];
    var etatCtx = { camera: { center: [5.3998, 43.3043], zoom: 15.1, pitch: 0, bearing: 0 }, layers: [], usage: { contexte: true, releves: ['Passerelles'], tournee: { type: 'LineString', coordinates: ligne, sourceTable: 'Sentiers', sourceRowId: 1, nom: 'Boucle de la vallée' } } };
    tables.Atlas_Story = { cols: [['Cle', 'Text'], ['Step', 'Int'], ['Title', 'Text'], ['Description', 'Text'], ['StateJSON', 'Text']], rows: [
      { id: 1, fields: { Cle: 'ctx-vallee', Step: 1, Title: 'Boucle de la vallée', Description: 'Boucle de la vallée · 1,1 km. Les passerelles, dans l’ordre du parcours : ouvrez « Tournée », ou touchez-en une sur la carte.', StateJSON: JSON.stringify(etatCtx) } },
      { id: 2, fields: { Cle: 'ctx-tout', Step: 2, Title: 'Vue d’ensemble', Description: 'Toutes les passerelles du bassin.', StateJSON: JSON.stringify({ camera: { center: [5.3945, 43.3040], zoom: 14.8, pitch: 0, bearing: 0 }, layers: [], usage: { contexte: true } }) } },
      { id: 3, fields: { Cle: 'ctx-degrade', Step: 3, Title: 'Ouvrages à surveiller', Description: 'Les passerelles dégradées ou à surveiller.', StateJSON: JSON.stringify({ camera: { center: [5.3945, 43.3040], zoom: 14.8, pitch: 0, bearing: 0 }, layers: [], usage: { contexte: true } }) } } ] };
    tables.Atlas_ScenePrefs = { cols: [['ViewerJSON', 'Text'], ['SettingsJSON', 'Text'], ['ExpositionJSON', 'Text']], rows: [
      { id: 1, fields: { ViewerJSON: '[]', SettingsJSON: '{}', ExpositionJSON: JSON.stringify({ ouverture: { mode: 'contexte', cle: 'ctx-vallee' } }) } } ] };
  }
  var vis = { 'Passerelles.Etat': 'Etats.Libelle', 'Controles.Passerelle': 'Passerelles.Nom', 'Controles.Etat_constate': 'Etats.Libelle' };


  // ?longchamp=1 : le document de démonstration (éclairage du Palais Longchamp et faune nocturne), alimenté par les tables que
  // fabrique vitrine-longchamp/fabriquer.py. Les colonnes calculées de Grist sont refaites ici ; deux formulaires natifs sont simulés.
  if (location.search.indexOf('longchamp=1') >= 0) {
    var lire = function (nom) {
      var x = new XMLHttpRequest();
      x.open('GET', new URL('../vitrine-longchamp/tables/' + nom + '.json', location.href).href, false);
      x.send();
      return JSON.parse(x.responseText);
    };
    var classes = lire('classes_spectrales'), modeles = lire('modeles'), lum = lire('luminaires'), pieges = lire('pieges'), releves = lire('releves');
    var PUISS = { M1: 38, M2: 34, M3: 30, M4: 70, M5: 14, M6: 6, M7: 40, M8: 90 };
    var idCl = {}; classes.forEach(function (c, i) { idCl[c.id] = i + 1; });
    var idMo = {}; modeles.forEach(function (m, i) { idMo[m.id] = i + 1; });
    var idLu = {}; lum.forEach(function (l, i) { idLu[l.Code] = i + 1; });
    var unix = function (d) { return Math.round(Date.parse(d + 'T00:00:00Z') / 1000); };
    var lignes = function (arr, f) { return arr.map(function (o, i) { return { id: i + 1, fields: f(o, i) }; }); };
    var rowsCl = lignes(classes, function (c) { return { Libelle: c.Libelle, Couleur: c.Couleur, Rang: c.Rang, Attraction: c.Attraction, Donnee: c.Donnee }; });
    rowsCl.push({ id: classes.length + 1, fields: { Libelle: 'Sans éclairage', Couleur: '#5b5b66', Rang: 0, Attraction: 0.22, Donnee: 'fictive (règle de la démonstration)' } });
    var rowsMo = lignes(modeles, function (m) { return { Libelle: m.Libelle, Modele3D: m.Modele3D, Classe: idCl[m.Classe], Temperature_K: m.Temperature_K, Flux_lm: m.Flux_lm, ULOR_pct: m.ULOR_pct, Puissance_W: PUISS[m.id], Remarque: m.Remarque, Donnee: m.Donnee }; });
    var rowsLu = lignes(lum, function (l) {
      var m = modeles[idMo[l.Modele] - 1];
      return { Code: l.Code, Categorie: l.Categorie, Modele: idMo[l.Modele], hauteur_feu: l.Hauteur_feu_m, Annee_pose: l.Annee_pose, Abaissement_nuit_pct: l.Abaissement_nuit_pct, Etat: l.Etat, Zone: l.Zone,
        Dist_eau_m: l.Dist_eau_m, Dist_bois_m: l.Dist_bois_m, Longitude: l.Longitude, Latitude: l.Latitude, Source: l.Source, Donnee: l.Donnee,
        Classe: idCl[m.Classe], temperatureCouleur: m.Temperature_K, puissance: PUISS[m.id], statut: l.Etat === 'Défectueux' ? 'decommissioned' : 'functional', Nom_modele: m.Libelle, Cellule: l.Cellule, Teinte: classes[idCl[m.Classe] - 1].Libelle, Nom: m.Libelle + ' · ' + l.Code };
    });
    var rowsRe = lignes(releves, function (r) { return { Piege: r.piege, Nuit: unix(r.nuit), Duree_h: r.duree_h, Temp_c: r.temp_c, Vent_bft: r.vent_bft, Lepidopteres: r.Lepidopteres, Dipteres: r.Dipteres, Coleopteres: r.Coleopteres,
      Hymenopteres: r.Hymenopteres, Autres: r.Autres, Total: r.Total, Mois: r.Mois, WKT: r.WKT, Donnee: r.Donnee }; });
    var rowsPi = lignes(pieges, function (p, i) {
      var l = p.Luminaire ? rowsLu[idLu[p.Luminaire] - 1].fields : null;
      var mine = rowsRe.filter(function (r) { return r.fields.Piege === i + 1; });
      return { Nom: p.Nom, Type: p.Type, Luminaire: p.Luminaire ? idLu[p.Luminaire] : 0, Longitude: p.Longitude, Latitude: p.Latitude, Dist_eau_m: p.Dist_eau_m, Dist_luminaire_m: p.Dist_luminaire_m, Donnee: p.Donnee,
        Modele: l ? l.Modele : 0, Classe: l ? l.Classe : classes.length + 1, Teinte: l ? classes[l.Classe - 1].Libelle : 'Sans éclairage', Nuits: mine.length, Total_moyen: mine.length ? Math.round(mine.reduce(function (s, r) { return s + r.fields.Total; }, 0) / mine.length) : 0 };
    });
    tables = {
      Classes_spectrales: { cols: [['Libelle', 'Text'], ['Couleur', 'Text'], ['Rang', 'Int'], ['Attraction', 'Numeric'], ['Donnee', 'Text']], rows: rowsCl },
      Modeles: { cols: [['Libelle', 'Text'], ['Modele3D', 'Text'], ['Classe', 'Ref:Classes_spectrales'], ['Temperature_K', 'Int'], ['Flux_lm', 'Int'], ['ULOR_pct', 'Int'], ['Puissance_W', 'Int'], ['Remarque', 'Text'], ['Donnee', 'Text']], rows: rowsMo },
      Luminaires: { cols: [['Code', 'Text'], ['Categorie', 'Text'], ['Modele', 'Ref:Modeles'], ['hauteur_feu', 'Numeric'], ['Annee_pose', 'Int'], ['Abaissement_nuit_pct', 'Int'], ['Etat', 'Choice'], ['Zone', 'Choice'], ['Dist_eau_m', 'Int'], ['Dist_bois_m', 'Int'],
        ['Longitude', 'Numeric'], ['Latitude', 'Numeric'], ['Source', 'Text'], ['Donnee', 'Text'], ['Classe', 'Ref:Classes_spectrales', true], ['temperatureCouleur', 'Int', true], ['puissance', 'Int', true], ['statut', 'Text', true], ['Nom_modele', 'Text', true], ['Cellule', 'Text', true], ['Teinte', 'Text', true], ['Nom', 'Text', true]], rows: rowsLu },
      Pieges: { cols: [['Nom', 'Text'], ['Type', 'Choice'], ['Luminaire', 'Ref:Luminaires'], ['Longitude', 'Numeric'], ['Latitude', 'Numeric'], ['Dist_eau_m', 'Int'], ['Dist_luminaire_m', 'Int'], ['Donnee', 'Text'],
        ['Modele', 'Ref:Modeles', true], ['Classe', 'Ref:Classes_spectrales', true], ['Teinte', 'Text', true], ['Nuits', 'Int', true], ['Total_moyen', 'Int', true]], rows: rowsPi },
      Releves: { cols: [['Piege', 'Ref:Pieges'], ['Nuit', 'Date'], ['Duree_h', 'Numeric'], ['Temp_c', 'Int'], ['Vent_bft', 'Int'], ['Lepidopteres', 'Int'], ['Dipteres', 'Int'], ['Coleopteres', 'Int'], ['Hymenopteres', 'Int'], ['Autres', 'Int'], ['Total', 'Int', true], ['Mois', 'Text', true], ['WKT', 'Text', true], ['Donnee', 'Text']], rows: rowsRe },
      Tournees: { cols: [['Nom', 'Text'], ['WKT', 'Text'], ['Longueur_m', 'Int'], ['Arrets', 'Int'], ['Ordre', 'Text'], ['Donnee', 'Text']], rows: lignes(lire('tournees'), function (c) { return { Nom: c.Nom, WKT: c.WKT, Longueur_m: c.Longueur_m, Arrets: c.Arrets, Ordre: c.Ordre, Donnee: c.Donnee }; }) },
      Grille: { cols: [['Cle', 'Text'], ['WKT', 'Text'], ['N_lum', 'Int', true], ['Flux_total_lm', 'Int', true], ['K_moyen', 'Int', true], ['Donnee', 'Text']], rows: lignes(lire('grille'), function (c) { return { Cle: c.Cle, WKT: c.WKT, N_lum: c.N_lum, Flux_total_lm: c.Flux_total_lm, K_moyen: c.K_moyen, Donnee: c.Donnee }; }) }
    };
    tables.Atlas_ScenePrefs = { cols: [['ViewerJSON', 'Text'], ['SettingsJSON', 'Text'], ['ExpositionJSON', 'Text']], rows: [{ id: 1, fields: { ViewerJSON: '[]', SettingsJSON: '{}', ExpositionJSON: '{}' } }] };
    vis = { 'Modeles.Classe': 'Classes_spectrales.Libelle', 'Luminaires.Modele': 'Modeles.Libelle', 'Luminaires.Classe': 'Classes_spectrales.Libelle', 'Pieges.Luminaire': 'Luminaires.Code',
      'Pieges.Modele': 'Modeles.Libelle', 'Pieges.Classe': 'Classes_spectrales.Libelle', 'Releves.Piege': 'Pieges.Nom' };
    // La configuration d'Atlas (couches, récit, scène) survit au rechargement de la page d'essai : on peut ainsi voir ce que fait
    // l'application en rouvrant un document réglé, comme dans Grist. `?neuf=1` repart d'un document vierge.
    // ?config=1 : la configuration du vrai document de démonstration, exportée de Grist (vitrine-longchamp/configuration/).
    if (location.search.indexOf('config=1') >= 0) {
      try {
        var xc = new XMLHttpRequest();
        xc.open('GET', new URL('../vitrine-longchamp/configuration/atlas-longchamp.json', location.href).href, false);
        xc.send();
        var exportee = JSON.parse(xc.responseText);
        Object.keys(exportee).forEach(function (k) { tables[k] = exportee[k]; });
      } catch (e) {}
    }
    try {
      if (location.search.indexOf('neuf=1') >= 0) localStorage.removeItem('faux_longchamp_atlas');
      var gardees = JSON.parse(localStorage.getItem('faux_longchamp_atlas') || 'null');
      if (gardees) Object.keys(gardees).forEach(function (k) { tables[k] = gardees[k]; });
    } catch (e) {}
    window.__garderTables = function () {
      try {
        var sortie = {};
        Object.keys(tables).forEach(function (k) { if (/^(Atlas_|Maquette_)/.test(k)) sortie[k] = tables[k]; });
        localStorage.setItem('faux_longchamp_atlas', JSON.stringify(sortie));
      } catch (e) {}
    };
    window.__tables = tables;
    // Deux formulaires natifs : « Relevé de nuit » (table Releves) et « Poser un piège » (table Pieges).
    var Q = {
      'Releves.Piege': { question: 'Piège relevé', formRequired: true }, 'Releves.Nuit': { question: 'Date de la nuit', formRequired: true },
      'Releves.Duree_h': { question: 'Durée d’éclairement (heures)', formRequired: true }, 'Releves.Temp_c': { question: 'Température au coucher du soleil (°C)' },
      'Releves.Vent_bft': { question: 'Vent (échelle de Beaufort, 0 à 12)' }, 'Releves.Lepidopteres': { question: 'Papillons de nuit (lépidoptères)' },
      'Releves.Dipteres': { question: 'Mouches et moustiques (diptères)' }, 'Releves.Coleopteres': { question: 'Coléoptères' }, 'Releves.Hymenopteres': { question: 'Abeilles, guêpes et fourmis volantes (hyménoptères)' },
      'Releves.Autres': { question: 'Autres insectes' },
      'Pieges.Nom': { question: 'Nom du piège', formRequired: true }, 'Pieges.Type': { question: 'Type de piège', formRequired: true }, 'Pieges.Luminaire': { question: 'Luminaire à côté duquel il est posé' },
      'Pieges.Longitude': { question: 'Longitude' }, 'Pieges.Latitude': { question: 'Latitude' }
    };
    var FORMS = [
      { view: 10, section: 31, nom: 'Relevé de nuit', titre: '# **Relevé de nuit**', table: 'Releves', champs: ['Piege', 'Nuit', 'Duree_h', 'Temp_c', 'Vent_bft', 'Lepidopteres', 'Dipteres', 'Coleopteres', 'Hymenopteres', 'Autres'], base: 500 },
      { view: 11, section: 32, nom: 'Poser un piège', titre: '# **Poser un piège**', table: 'Pieges', champs: ['Nom', 'Type', 'Luminaire', 'Longitude', 'Latitude'], base: 600 }
    ];
    window.__longchamp = {
      sql: function (q, noms, ids) {
        if (/_grist_Views_section_field/.test(q)) {
          var recs = [];
          FORMS.forEach(function (f) { f.champs.forEach(function (c, i) { recs.push({ id: f.base + i, fields: { id: f.base + i, parentId: f.section, colRef: ids[f.table + '.' + c], parentPos: i, widgetOptions: '' } }); }); });
          return { records: recs };
        }
        if (/_grist_Views_section/.test(q)) {
          return { records: FORMS.map(function (f) {
            var mise = { type: 'Layout', children: [{ type: 'Paragraph', text: f.titre }, { type: 'Section', children: f.champs.map(function (c, i) { return { type: 'Field', leaf: f.base + i }; }) }, { type: 'Submit' }] };
            return { id: f.section, fields: { id: f.section, parentId: f.view, parentKey: 'form', tableRef: noms.indexOf(f.table) + 1, title: '', layoutSpec: JSON.stringify(mise), shareOptions: '' } };
          }) };
        }
        if (/_grist_Views/.test(q)) return { records: FORMS.map(function (f) { return { id: f.view, fields: { id: f.view, name: f.nom } }; }) };
        return null;
      },
      options: function (k) {
        var o = Object.assign({}, Q[k] || {});
        var CH = { 'Pieges.Type': ['Sous un luminaire', 'Témoin non éclairé'], 'Luminaires.Etat': ['Bon', 'À surveiller', 'Défectueux'], 'Luminaires.Zone': ['Parc et Palais', 'Quartier'] };
        if (CH[k]) o.choices = CH[k];
        return JSON.stringify(o);
      }
    };
  }

  var journal = window.__journalRest = [];
  var infos = {};   // libellé et options de colonne que les actions ajoutent : les métadonnées les rendent
  var vrai = window.fetch.bind(window);
  var neufs = window.__docsNeufs = {};
  var moteurNeuf = null;
  function gererDocumentNeuf(m, u, opts) {
    return (moteurNeuf || (moteurNeuf = import('../lib/scene-locale.js'))).then(function (E) {
      if (m[1]) {
        var id = 'docN' + (Object.keys(neufs).length + 1);
        neufs[id] = { nom: JSON.parse(opts.body).name, scene: E.creerScene({ id: id }), photos: 0 };
        return rep(id);
      }
      var d = neufs[m[2]]; var chemin = m[3] || '';
      if (!d) return rep({ error: 'inconnu' }, 404);
      if (chemin === '/tables') return rep({ tables: Object.keys(d.scene.tables).map(function (id) { return { id: id }; }) });
      var rec = chemin.match(new RegExp("^[/]tables[/]([^/?]+)[/]records"));
      if (rec) {
        var tb = E.tableColonnaire(d.scene, decodeURIComponent(rec[1]));
        return rep({ records: tb.id.map(function (rid, i) { var f = {}; Object.keys(tb).forEach(function (c) { if (c !== 'id') f[c] = tb[c][i]; }); return { id: rid, fields: f }; }) });
      }
      if (chemin.indexOf('/sql') === 0) {
        var q = decodeURIComponent(chemin.split('q=')[1] || '');
        var cnt = q.match(new RegExp("count[(][*][)] as n from \"([A-Za-z0-9_]+)\""));
        if (cnt) return rep({ records: [{ fields: { n: d.scene.tables[cnt[1]] ? d.scene.tables[cnt[1]].ids.length : 0 } }] });
        var meta = /_grist_Tables_column/.test(q) ? E.metaColonnes(d.scene) : /_grist_Tables/.test(q) ? E.metaTables(d.scene) : { id: [] };
        return rep({ records: meta.id.map(function (rid, i) { var f = { id: rid }; Object.keys(meta).forEach(function (c) { if (c !== 'id') f[c] = meta[c][i]; }); return { fields: f }; }) });
      }
      if (chemin === '/apply') {
        try { return rep({ retValues: E.appliquerActions(d.scene, JSON.parse(opts.body)).retValues }); }
        catch (e) { return rep({ error: String(e.message) }, 400); }
      }
      if (chemin === '/attachments') { d.photos++; return rep([9000 + d.photos]); }
      return rep({ error: 'inconnu' }, 404);
    });
  }
  function rep(corps, statut) { return Promise.resolve(new Response(JSON.stringify(corps), { status: statut || 200, headers: { 'Content-Type': 'application/json' } })); }
  window.fetch = function (url, opts) {
    var u = String(url && url.url ? url.url : url);
    if (u.indexOf('https://grist.essai/') !== 0) return vrai(url, opts);
    if (window.__coupe) return Promise.reject(new TypeError('Failed to fetch'));
    // La liste des scenes : un compte a deux organisations, trois roles, une miniature.
    if (u.replace(/[/]$/, '') === 'https://grist.essai/api/orgs') return rep([{ id: 1, name: 'Equipe terrain' }, { id: 2, name: 'Ville' }]);
    if (u.indexOf('/api/orgs/1/workspaces') >= 0) return rep([{ id: 10, name: 'Ouvrages', access: 'owners', docs: [
      { id: 'docEssai', name: 'Suivi des ouvrages', access: 'editors', updatedAt: '2026-10-02T09:00:00Z' },
      { id: 'docB', name: 'Bassin versant', access: 'owners', updatedAt: '2026-09-28T12:00:00Z' }] }]);
    if (u.indexOf('/api/orgs/2/workspaces') >= 0) return rep([{ id: 20, name: 'Public', access: 'viewers', docs: [
      { id: 'docC', name: 'Parc urbain', access: 'viewers', updatedAt: '2026-08-15T08:00:00Z' },
      { id: 'docD', name: 'Notes diverses', access: 'viewers', updatedAt: '2026-10-01T08:00:00Z' }] }]);
    // Les documents crees pendant l'essai (« Nouvelle scene », « Envoyer vers Grist ») : un vrai moteur d'actions derriere.
    var neuf = u.match(new RegExp("^https:[/][/]grist[.]essai[/]api[/](?:(workspaces[/]\\d+[/]docs)|docs[/](docN\\d+)([/].*)?)$"));
    if (neuf) return gererDocumentNeuf(neuf, u, opts);
    var autre = u.match(/^https:[/][/]grist[.]essai[/]api[/]docs[/](docB|docC|docD)([/].*)$/);
    if (autre) {
      if (autre[2] === '/tables') return rep({ tables: (autre[1] === 'docD' ? ['Notes'] : autre[1] === 'docB' ? ['Atlas_ScenePrefs', 'Points'] : ['Atlas_Story']).map(function (id) { return { id: id }; }) });
      if (autre[2].indexOf('/tables/Atlas_ScenePrefs/records') === 0) {
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#cfe3d4"/><path d="M0 140 C80 90 160 170 320 110 L320 200 L0 200Z" fill="#8fb7c9"/><circle cx="110" cy="70" r="10" fill="#c44536"/><circle cx="210" cy="95" r="10" fill="#c44536"/></svg>';
        return rep({ records: [{ id: 1, fields: { Miniature: 'data:image/svg+xml;utf8,' + encodeURIComponent(svg) } }] });
      }
      return rep({ records: [] });
    }
    var chemin = u.replace('https://grist.essai/api/docs/docEssai', '');
    var pj = chemin.match(/^\/attachments\/(\\d+)\/download/);
    if (pj) { return vrai(photos[pj[1]]); }
    if (chemin === '/tables') return rep({ tables: Object.keys(tables).map(function (id) { return { id: id }; }) });
    var m = chemin.match(/^\/tables\/([^/]+)\/records/);
    if (m) { var t = tables[decodeURIComponent(m[1])]; return t ? rep({ records: t.rows }) : rep({ error: 'Table not found' }, 404); }
    if (chemin.indexOf('/sql') === 0) {
      var q = decodeURIComponent(chemin.split('q=')[1] || ''); var noms = Object.keys(tables);
      var ids = {}, n0 = 1;
      noms.forEach(function (nom) { tables[nom].cols.forEach(function (c) { ids[nom + '.' + c[0]] = n0++; }); });
      if (window.__longchamp) { var sq = window.__longchamp.sql(q, noms, ids); if (sq) return rep(sq); }
      if (/_grist_Tables_column/.test(q)) {
        var recs = [];
        noms.forEach(function (nom, i) { tables[nom].cols.forEach(function (c) { var k = nom + '.' + c[0]; recs.push({ id: ids[k], fields: { id: ids[k], parentId: i + 1, colId: c[0], type: c[1], label: (infos[k] && infos[k].label) || c[0], isFormula: !!c[2], widgetOptions: (infos[k] && infos[k].widgetOptions) || (window.__longchamp ? window.__longchamp.options(k) : '{}'), visibleCol: vis[k] ? ids[vis[k]] : 0 } }); }); });
        return rep({ records: recs });
      }
      if (/_grist_Tables/.test(q)) return rep({ records: noms.map(function (nom, i) { return { id: i + 1, fields: { id: i + 1, tableId: nom } }; }) });
      return rep({ records: [] });
    }
    if (chemin === '/apply') {
      var actions = JSON.parse((opts && opts.body) || '[]'); journal.push(actions);
      var suivant = function (t) { return t.rows.reduce(function (m, r) { return Math.max(m, r.id); }, 0) + 1; };
      var retours = actions.map(function (a) {
        var t = tables[a[1]];
        if (a[0] === 'AddTable') { tables[a[1]] = { cols: a[2].map(function (c) { infos[a[1] + '.' + c.id] = { label: c.label, widgetOptions: c.widgetOptions }; return [c.id, c.type]; }), rows: [] }; return { table_id: a[1], id: 1, columns: a[2].map(function (c) { return c.id; }), views: [] }; }
        if (!t) return null;
        if (a[0] === 'AddColumn') { t.cols.push([a[2], a[3] && a[3].type]); infos[a[1] + '.' + a[2]] = { label: a[3] && a[3].label, widgetOptions: a[3] && a[3].widgetOptions }; return null; }
        if (a[0] === 'UpdateRecord') { t.rows.forEach(function (r) { if (r.id === a[2]) Object.assign(r.fields, a[3]); }); return null; }
        if (a[0] === 'BulkUpdateRecord') { a[2].forEach(function (id, i) { t.rows.forEach(function (r) { if (r.id === id) Object.keys(a[3]).forEach(function (k) { r.fields[k] = a[3][k][i]; }); }); }); return null; }
        if (a[0] === 'RemoveRecord') { t.rows = t.rows.filter(function (r) { return r.id !== a[2]; }); return null; }
        if (a[0] === 'BulkRemoveRecord') { t.rows = t.rows.filter(function (r) { return a[2].indexOf(r.id) < 0; }); return null; }
        if (a[0] === 'AddRecord') { var id = suivant(t); t.rows.push({ id: id, fields: a[3] }); return id; }
        if (a[0] === 'BulkAddRecord') {
          var cles = Object.keys(a[3]), n = cles.length ? a[3][cles[0]].length : 0, ids = [];
          for (var i = 0; i < n; i++) { var f = {}; cles.forEach(function (k) { f[k] = a[3][k][i]; }); var nid = suivant(t); t.rows.push({ id: nid, fields: f }); ids.push(nid); }
          return ids;
        }
        return null;
      });
      if (window.__garderTables) window.__garderTables();
      return rep({ retValues: retours });
    }
    return rep({ error: 'inconnu' }, 404);
  };
})();
