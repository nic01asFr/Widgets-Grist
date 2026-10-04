/*
 * GP2OA : un contexte de tournée par boucle, écrit dans `Atlas_Story` du document.
 *
 * À COLLER DANS LA CONSOLE d'une page du document Grist (pas dans le widget : il faut `gristDocPageModel`). Écrit dans le document
 * ouvert — l'essayer sur la copie de travail d'abord. Relancé, il refuse de poser deux fois (clés `ctx-boucle-*`).
 *
 * Pour chaque boucle : un contexte copié de « Unité Sainte-Baume » (même état de scène, mêmes filtres), avec
 *   - la caméra cadrée sur la boucle ;
 *   - seule la couche des ouvrages visible (la tournée dessine la boucle elle-même) ;
 *   - le filtre d'unité de la boucle (Sainte-Baume ou Crau-Camargue-Alpilles) ;
 *   - `usage = { contexte: true, releves: ['Table_structure'], tournee: { LineString copiée de la boucle } }`.
 * La ligne est simplifiée (un point tous les 4 m au plus) : ~20 à 30 ko par contexte.
 *
 * Défaut connu : le filtre d'unité garde tous les ouvrages de l'unité, pas seulement ceux de la boucle. Ceux que la ligne ne longe pas
 * (plus de 250 m) passent en fin de liste, marqués « hors ligne ». Un filtre « à proximité de la tournée » les retirerait.
 */
(async () => {
  const dd = window.gristDocPageModel.gristDoc.get().docData;
  await dd.fetchTable('Boucles'); await dd.fetchTable('Atlas_Story');
  const B = dd.getTable('Boucles');
  const S = dd.getTable('Atlas_Story');
  if (S.getRowIds().some((id) => String(S.getValue(id, 'Cle')).startsWith('ctx-boucle-'))) throw new Error('déjà posées');
  const rad = Math.PI / 180;
  const dist = (a, b) => Math.hypot((a[0] - b[0]) * Math.cos(a[1] * rad) * 111320, (a[1] - b[1]) * 110540);
  const parse = (w) => w.match(/\(\((.*)\)\)/s)[1].split(/\)\s*,\s*\(/).map((p) => p.split(',').map((c) => c.trim().split(/\s+/).map(Number)));
  const longueur = (c) => c.slice(1).reduce((n, p, i) => n + dist(c[i], p), 0);
  const simplifier = (c) => {
    const out = [c[0]];
    for (let i = 1; i < c.length - 1; i++) if (dist(out[out.length - 1], c[i]) >= 4) out.push(c[i]);
    out.push(c[c.length - 1]);
    return out.map((p) => [+p[0].toFixed(6), +p[1].toFixed(6)]);
  };
  // Le modèle : une étape qui filtre déjà sur l'unité.
  const modele = JSON.parse(S.getValue(S.getRowIds().find((id) => S.getValue(id, 'Cle') === 'ctx-sainte-baume'), 'StateJSON'));
  const boucles = [
    { id: 4, cle: 'ctx-boucle-pic-bertagne', titre: 'Boucle Pic Bertagne', unite: 'Unité Sainte-Baume' },
    { id: 3, cle: 'ctx-boucle-glaciere', titre: 'Boucle Glacière Bertagne', unite: 'Unité Sainte-Baume' },
    { id: 1, cle: 'ctx-boucle-cabrelles', titre: 'Boucle Cabrelles Brigou Blé', unite: 'Unité Sainte-Baume' },
    { id: 2, cle: 'ctx-boucle-aulnes', titre: 'Boucle Tour de l’Étang des Aulnes', unite: 'Unité Crau-Camargue-Alpilles' },
  ];
  const cols = { Cle: [], Step: [], Title: [], Description: [], StateJSON: [] };
  const debut = Math.max(...S.getRowIds().map((id) => Number(S.getValue(id, 'Step')) || 0));
  boucles.forEach((d, i) => {
    const brute = parse(B.getValue(d.id, 'WKT'))[0];
    const coords = simplifier(brute);
    const lng = coords.map((p) => p[0]); const lat = coords.map((p) => p[1]);
    const cx = (Math.min(...lng) + Math.max(...lng)) / 2; const cy = (Math.min(...lat) + Math.max(...lat)) / 2;
    const spanLng = Math.max(...lng) - Math.min(...lng); const spanLat = (Math.max(...lat) - Math.min(...lat)) / Math.cos(cy * rad);
    const zoom = Math.min(Math.log2(700 * 360 / (256 * spanLng)), Math.log2(450 * 360 / (256 * spanLat))) - 0.3;
    const etat = JSON.parse(JSON.stringify(modele));
    etat.camera = { center: [+cx.toFixed(5), +cy.toFixed(5)], zoom: +zoom.toFixed(1), pitch: 0, bearing: 0 };
    for (const l of etat.layers) {
      l.visible = l.sourceTable === 'Table_structure';
      if (l.sourceTable === 'Table_structure') { const u = l.controls.find((c) => c.field === 'Unite'); if (u) u.values = [d.unite]; }
    }
    etat.usage = { contexte: true, releves: ['Table_structure'], tournee: { type: 'LineString', coordinates: coords, sourceTable: 'Boucles', sourceRowId: d.id, nom: B.getValue(d.id, 'Nom') } };
    cols.Cle.push(d.cle);
    cols.Step.push(debut + 1 + i);
    cols.Title.push(d.titre);
    // La consigne dit seulement ce que l'auteur a à dire : la longueur et le nombre d'ouvrages sont calculés par Atlas, et la pastille « Tournée » se montre d'elle-même.
    cols.Description.push(`Les ouvrages de l’${d.unite.replace('Unité', 'unité')}, dans l’ordre du parcours.`);
    cols.StateJSON.push(JSON.stringify(etat));
  });
  await dd.sendAction(['BulkAddRecord', 'Atlas_Story', boucles.map(() => null), cols]);
  return boucles.length;
})();
