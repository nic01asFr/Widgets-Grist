/*
 * Ajoute au document de démonstration ce qui sert à RESTITUER les résultats sur la carte, en formules Grist :
 *   - Luminaires.Cellule      : la maille de 50 m qui contient le luminaire ;
 *   - Releves.WKT, Releves.Mois : un plot de 7 m au pied du piège, décalé de 10 m vers l'est par nuit (trois colonnes côte à côte) ;
 *   - la table Grille          : une ligne par maille occupée, avec nombre de luminaires, flux total et température moyenne.
 *
 * À COLLER DANS LA CONSOLE d'une page du document (il faut `gristDocPageModel`), après charger-dans-grist.js, le serveur de
 * développement étant lancé. Les formules sont celles que fabriquer.py reproduit pour la page d'essai : mêmes constantes, même
 * ordre d'opérations. Refuse de s'exécuter deux fois.
 */
(async () => {
  const dd = window.gristDocPageModel.gristDoc.get().docData;
  if (dd.getMetaTable('_grist_Tables').getRecords().some((r) => r.tableId === 'Grille')) throw new Error('déjà chargé');
  const grille = await (await fetch('http://localhost:3002/projects/Atlas/vitrine-longchamp/tables/grille.json')).json();
  const col = (id, type, extra = {}) => ({ id, type, ...extra });
  const F_CELLULE = 'import math\nreturn "%d_%d" % (math.floor($Longitude * 111320.0 * math.cos(math.radians(43.3044)) / 50.0), math.floor($Latitude * 110574.0 / 50.0))';
  const F_WKT = [
    'import math',
    'p = $Piege',
    'if not p:',
    '  return ""',
    'rang = {6: 0, 7: 1, 9: 2}.get($Nuit.month, 1)',
    'lat = p.Latitude',
    'cos = math.cos(math.radians(lat))',
    'cx = p.Longitude + (rang - 1) * 10.0 / (111320.0 * cos)',
    'dx = 3.5 / (111320.0 * cos)',
    'dy = 3.5 / 110574.0',
    'pts = [(cx - dx, lat - dy), (cx + dx, lat - dy), (cx + dx, lat + dy), (cx - dx, lat + dy), (cx - dx, lat - dy)]',
    'return "POLYGON((" + ", ".join("%.7f %.7f" % q for q in pts) + "))"',
  ].join('\n');
  await dd.sendActions([
    ['AddColumn', 'Luminaires', 'Cellule', { type: 'Text', isFormula: true, formula: F_CELLULE }],
    ['AddColumn', 'Releves', 'Mois', { type: 'Text', isFormula: true, formula: '{6: "Juin", 7: "Juillet", 9: "Septembre"}.get($Nuit.month, "")' }],
    ['AddColumn', 'Releves', 'WKT', { type: 'Text', isFormula: true, formula: F_WKT }],
    ['AddTable', 'Grille', [
      col('Cle', 'Text'), col('WKT', 'Text'),
      col('N_lum', 'Int', { isFormula: true, formula: 'len(Luminaires.lookupRecords(Cellule=$Cle))' }),
      col('Flux_total_lm', 'Int', { isFormula: true, formula: 'sum(l.Modele.Flux_lm for l in Luminaires.lookupRecords(Cellule=$Cle))' }),
      col('K_moyen', 'Int', { isFormula: true, formula: 'r = Luminaires.lookupRecords(Cellule=$Cle)\nreturn int(round(sum(l.Modele.Temperature_K for l in r) / len(r))) if r else 0' }),
      col('Donnee', 'Text'),
    ]],
    ['BulkAddRecord', 'Grille', grille.map(() => null), { Cle: grille.map((c) => c.Cle), WKT: grille.map((c) => c.WKT), Donnee: grille.map((c) => c.Donnee) }],
  ]);
  await dd.fetchTable('Grille');
  const G = dd.getTable('Grille');
  const ecarts = grille.filter((c, i) => { const id = G.getRowIds()[i]; return G.getValue(id, 'N_lum') !== c.N_lum || G.getValue(id, 'Flux_total_lm') !== c.Flux_total_lm || G.getValue(id, 'K_moyen') !== c.K_moyen; }).length;
  return { mailles: grille.length, ecartsAvecLaPage: ecarts };
})();
