/*
 * Charge dans le document Grist de démonstration les tables fabriquées par fabriquer.py, puis ajoute les colonnes calculées
 * qu'Atlas reconnaît par leur nom (température de couleur, puissance, hauteur de feu, statut).
 *
 * À COLLER DANS LA CONSOLE d'une page du document (pas dans le widget : il faut `gristDocPageModel`), le serveur de
 * développement étant lancé (les JSON sont lus sur http://localhost:3002). Refuse de s'exécuter deux fois.
 *
 * Tables créées : Classes_spectrales, Modeles, Luminaires, Pieges, Releves. Toutes les valeurs de caractérisation,
 * de piégeage et de comptage sont FICTIVES et portent une colonne « Donnee » qui le dit.
 */
(async () => {
  const dd = window.gristDocPageModel.gristDoc.get().docData;
  const base = 'http://localhost:3002/projects/Atlas/vitrine-longchamp/tables/';
  const lire = async (n) => (await fetch(base + n + '.json')).json();
  const [classes, modeles, lum, pieges, releves] = await Promise.all(['classes_spectrales', 'modeles', 'luminaires', 'pieges', 'releves'].map(lire));
  if (dd.getMetaTable('_grist_Tables').getRecords().some((r) => r.tableId === 'Luminaires')) throw new Error('déjà chargé');
  const idClasse = Object.fromEntries(classes.map((c, i) => [c.id, i + 1]));
  const idModele = Object.fromEntries(modeles.map((m, i) => [m.id, i + 1]));
  const idLum = Object.fromEntries(lum.map((l, i) => [l.Code, i + 1]));
  const col = (id, type, extra = {}) => ({ id, type, ...extra });
  const choix = (liste, couleurs) => JSON.stringify({ choices: liste, ...(couleurs ? { choiceOptions: Object.fromEntries(liste.map((c, i) => [c, { fillColor: couleurs[i], textColor: '#1b1b1b' }])) } : {}) });
  const bulk = (t, cols) => ['BulkAddRecord', t, Object.values(cols)[0].map(() => null), cols];
  const unix = (d) => Math.round(Date.parse(d + 'T00:00:00Z') / 1000);
  const W = { M1: 38, M2: 34, M3: 30, M4: 70, M5: 14, M6: 6, M7: 40, M8: 90 };
  await dd.sendActions([
    ['AddTable', 'Classes_spectrales', [col('Libelle', 'Text'), col('Couleur', 'Text'), col('Rang', 'Int'), col('Attraction', 'Numeric'), col('Donnee', 'Text')]],
    ['AddTable', 'Modeles', [col('Libelle', 'Text'), col('Modele3D', 'Text'), col('Classe', 'Ref:Classes_spectrales'), col('Temperature_K', 'Int'), col('Flux_lm', 'Int'), col('ULOR_pct', 'Int'), col('Puissance_W', 'Int'), col('Remarque', 'Text'), col('Donnee', 'Text')]],
    ['AddTable', 'Luminaires', [col('Code', 'Text'), col('Categorie', 'Text'), col('Modele', 'Ref:Modeles'), col('hauteur_feu', 'Numeric'), col('Annee_pose', 'Int'), col('Abaissement_nuit_pct', 'Int'),
      col('Etat', 'Choice', { widgetOptions: choix(['Bon', 'À surveiller', 'Défectueux'], ['#bfe3c7', '#f6dd9a', '#f0b4ae']) }), col('Zone', 'Choice', { widgetOptions: choix(['Parc et Palais', 'Quartier']) }),
      col('Dist_eau_m', 'Int'), col('Dist_bois_m', 'Int'), col('Longitude', 'Numeric'), col('Latitude', 'Numeric'), col('Source', 'Text'), col('Donnee', 'Text'),
      col('Classe', 'Ref:Classes_spectrales', { isFormula: true, formula: '$Modele.Classe' }),
      col('temperatureCouleur', 'Int', { isFormula: true, formula: '$Modele.Temperature_K' }),
      col('puissance', 'Int', { isFormula: true, formula: '$Modele.Puissance_W' }),
      col('statut', 'Text', { isFormula: true, formula: '"decommissioned" if $Etat == "Défectueux" else "functional"' }),
      col('Nom_modele', 'Text', { isFormula: true, formula: '$Modele.Libelle' })]],
    ['AddTable', 'Pieges', [col('Nom', 'Text'), col('Type', 'Choice', { widgetOptions: choix(['Sous un luminaire', 'Témoin non éclairé']) }), col('Luminaire', 'Ref:Luminaires'), col('Longitude', 'Numeric'), col('Latitude', 'Numeric'),
      col('Dist_eau_m', 'Int'), col('Dist_luminaire_m', 'Int'), col('Donnee', 'Text'),
      col('Modele', 'Ref:Modeles', { isFormula: true, formula: '$Luminaire.Modele' }),
      col('Classe', 'Ref:Classes_spectrales', { isFormula: true, formula: '$Luminaire.Modele.Classe or Classes_spectrales.lookupOne(Libelle="Sans éclairage")' }),
      col('Nuits', 'Int', { isFormula: true, formula: 'len(Releves.lookupRecords(Piege=$id))' }),
      col('Total_moyen', 'Int', { isFormula: true, formula: 'r = Releves.lookupRecords(Piege=$id)\nreturn int(round(sum(x.Total for x in r) / len(r))) if r else 0' })]],
    ['AddTable', 'Releves', [col('Piege', 'Ref:Pieges'), col('Nuit', 'Date'), col('Duree_h', 'Numeric'), col('Temp_c', 'Int'), col('Vent_bft', 'Int'), col('Lepidopteres', 'Int'), col('Dipteres', 'Int'), col('Coleopteres', 'Int'),
      col('Hymenopteres', 'Int'), col('Autres', 'Int'), col('Total', 'Int', { isFormula: true, formula: '$Lepidopteres + $Dipteres + $Coleopteres + $Hymenopteres + $Autres' }), col('Donnee', 'Text')]],
    bulk('Classes_spectrales', { Libelle: classes.map((c) => c.Libelle), Couleur: classes.map((c) => c.Couleur), Rang: classes.map((c) => c.Rang), Attraction: classes.map((c) => c.Attraction), Donnee: classes.map((c) => c.Donnee) }),
    ['AddRecord', 'Classes_spectrales', null, { Libelle: 'Sans éclairage', Couleur: '#5b5b66', Rang: 0, Attraction: 0.22, Donnee: 'fictive (règle de la démonstration)' }],
    bulk('Modeles', { Libelle: modeles.map((m) => m.Libelle), Modele3D: modeles.map((m) => m.Modele3D), Classe: modeles.map((m) => idClasse[m.Classe]), Temperature_K: modeles.map((m) => m.Temperature_K),
      Flux_lm: modeles.map((m) => m.Flux_lm), ULOR_pct: modeles.map((m) => m.ULOR_pct), Puissance_W: modeles.map((m) => W[m.id]), Remarque: modeles.map((m) => m.Remarque), Donnee: modeles.map((m) => m.Donnee) }),
    bulk('Luminaires', { Code: lum.map((l) => l.Code), Categorie: lum.map((l) => l.Categorie), Modele: lum.map((l) => idModele[l.Modele]), hauteur_feu: lum.map((l) => l.Hauteur_feu_m), Annee_pose: lum.map((l) => l.Annee_pose),
      Abaissement_nuit_pct: lum.map((l) => l.Abaissement_nuit_pct), Etat: lum.map((l) => l.Etat), Zone: lum.map((l) => l.Zone), Dist_eau_m: lum.map((l) => l.Dist_eau_m), Dist_bois_m: lum.map((l) => l.Dist_bois_m),
      Longitude: lum.map((l) => l.Longitude), Latitude: lum.map((l) => l.Latitude), Source: lum.map((l) => l.Source), Donnee: lum.map((l) => l.Donnee) }),
    bulk('Pieges', { Nom: pieges.map((p) => p.Nom), Type: pieges.map((p) => p.Type), Luminaire: pieges.map((p) => (p.Luminaire ? idLum[p.Luminaire] : 0)), Longitude: pieges.map((p) => p.Longitude), Latitude: pieges.map((p) => p.Latitude),
      Dist_eau_m: pieges.map((p) => p.Dist_eau_m), Dist_luminaire_m: pieges.map((p) => p.Dist_luminaire_m), Donnee: pieges.map((p) => p.Donnee) }),
    bulk('Releves', { Piege: releves.map((r) => r.piege), Nuit: releves.map((r) => unix(r.nuit)), Duree_h: releves.map((r) => r.duree_h), Temp_c: releves.map((r) => r.temp_c), Vent_bft: releves.map((r) => r.vent_bft),
      Lepidopteres: releves.map((r) => r.Lepidopteres), Dipteres: releves.map((r) => r.Dipteres), Coleopteres: releves.map((r) => r.Coleopteres), Hymenopteres: releves.map((r) => r.Hymenopteres), Autres: releves.map((r) => r.Autres),
      Donnee: releves.map((r) => r.Donnee) }),
  ]);
  // Colonne affichée des références : l'identifiant d'une colonne se lit dans les métadonnées, il ne se devine pas.
  const tabs = dd.getMetaTable('_grist_Tables').getRecords();
  const cols = dd.getMetaTable('_grist_Tables_column').getRecords();
  const tid = (n) => tabs.find((t) => t.tableId === n).id;
  const cref = (t, c) => cols.find((x) => x.parentId === tid(t) && x.colId === c).id;
  await dd.sendActions([
    ['ModifyColumn', 'Modeles', 'Classe', { visibleCol: cref('Classes_spectrales', 'Libelle') }],
    ['ModifyColumn', 'Luminaires', 'Modele', { visibleCol: cref('Modeles', 'Libelle') }],
    ['ModifyColumn', 'Luminaires', 'Classe', { visibleCol: cref('Classes_spectrales', 'Libelle') }],
    ['ModifyColumn', 'Pieges', 'Luminaire', { visibleCol: cref('Luminaires', 'Code') }],
    ['ModifyColumn', 'Pieges', 'Modele', { visibleCol: cref('Modeles', 'Libelle') }],
    ['ModifyColumn', 'Pieges', 'Classe', { visibleCol: cref('Classes_spectrales', 'Libelle') }],
    ['ModifyColumn', 'Releves', 'Piege', { visibleCol: cref('Pieges', 'Nom') }],
  ]);
  return { classes: classes.length + 1, modeles: modeles.length, luminaires: lum.length, pieges: pieges.length, releves: releves.length };
})();
