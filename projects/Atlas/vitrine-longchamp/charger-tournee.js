/*
 * Ajoute au document de démonstration la table Tournees : la ligne de la ronde de nuit, calculée par fabriquer.py sur le réseau de
 * routes et de chemins de la BD TOPO (IGN, Licence Ouverte 2.0). Le tracé est réel ; l'ordre de passage entre les pièges est fictif.
 *
 * À COLLER DANS LA CONSOLE d'une page du document (il faut `gristDocPageModel`), le serveur de développement étant lancé.
 * Refuse de s'exécuter deux fois.
 */
(async () => {
  const dd = window.gristDocPageModel.gristDoc.get().docData;
  if (dd.getMetaTable('_grist_Tables').getRecords().some((r) => r.tableId === 'Tournees')) throw new Error('déjà chargé');
  const t = await (await fetch('http://localhost:3002/projects/Atlas/vitrine-longchamp/tables/tournees.json')).json();
  const col = (id, type) => ({ id, type });
  await dd.sendActions([
    ['AddTable', 'Tournees', [col('Nom', 'Text'), col('WKT', 'Text'), col('Longueur_m', 'Int'), col('Arrets', 'Int'), col('Ordre', 'Text'), col('Donnee', 'Text')]],
    ['BulkAddRecord', 'Tournees', t.map(() => null), { Nom: t.map((x) => x.Nom), WKT: t.map((x) => x.WKT), Longueur_m: t.map((x) => x.Longueur_m), Arrets: t.map((x) => x.Arrets), Ordre: t.map((x) => x.Ordre), Donnee: t.map((x) => x.Donnee) }],
  ]);
  return t.length;
})();
