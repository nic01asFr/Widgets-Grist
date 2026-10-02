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
  var vis = { 'Passerelles.Etat': 'Etats.Libelle', 'Controles.Passerelle': 'Passerelles.Nom', 'Controles.Etat_constate': 'Etats.Libelle' };

  var journal = window.__journalRest = [];
  var vrai = window.fetch.bind(window);
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
    var pj = chemin.match(/^\/attachments\/(\d+)\/download/);
    if (pj) { return vrai(photos[pj[1]]); }
    if (chemin === '/tables') return rep({ tables: Object.keys(tables).map(function (id) { return { id: id }; }) });
    var m = chemin.match(/^\/tables\/([^/]+)\/records/);
    if (m) { var t = tables[decodeURIComponent(m[1])]; return t ? rep({ records: t.rows }) : rep({ error: 'Table not found' }, 404); }
    if (chemin.indexOf('/sql') === 0) {
      var q = decodeURIComponent(chemin.split('q=')[1] || ''); var noms = Object.keys(tables);
      var ids = {}, n0 = 1;
      noms.forEach(function (nom) { tables[nom].cols.forEach(function (c) { ids[nom + '.' + c[0]] = n0++; }); });
      if (/_grist_Tables_column/.test(q)) {
        var recs = [];
        noms.forEach(function (nom, i) { tables[nom].cols.forEach(function (c) { var k = nom + '.' + c[0]; recs.push({ id: ids[k], fields: { id: ids[k], parentId: i + 1, colId: c[0], type: c[1], label: c[0], isFormula: !!c[2], widgetOptions: '{}', visibleCol: vis[k] ? ids[vis[k]] : 0 } }); }); });
        return rep({ records: recs });
      }
      if (/_grist_Tables/.test(q)) return rep({ records: noms.map(function (nom, i) { return { id: i + 1, fields: { id: i + 1, tableId: nom } }; }) });
      return rep({ records: [] });
    }
    if (chemin === '/apply') {
      var actions = JSON.parse((opts && opts.body) || '[]'); journal.push(actions);
      actions.forEach(function (a) {
        var t = tables[a[1]];
        if (a[0] === 'AddTable') { tables[a[1]] = { cols: a[2].map(function (c) { return [c.id, c.type]; }), rows: [] }; return; }
        if (!t) return;
        if (a[0] === 'AddColumn') { t.cols.push([a[2], a[3] && a[3].type]); return; }
        if (a[0] === 'UpdateRecord') { t.rows.forEach(function (r) { if (r.id === a[2]) Object.assign(r.fields, a[3]); }); return; }
        if (a[0] === 'AddRecord') { t.rows.push({ id: t.rows.length + 1, fields: a[3] }); }
      });
      return rep({ retValues: actions.map(function (a) { return a[0] === 'AddRecord' && tables[a[1]] ? tables[a[1]].rows.length : null; }) });
    }
    return rep({ error: 'inconnu' }, 404);
  };
})();
