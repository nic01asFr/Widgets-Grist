/**
 * Poser les surfaces en volume sur le relief.
 *
 * Dans MapLibre, `fill-extrusion-base` et `fill-extrusion-height` se comptent
 * depuis le **niveau de la mer**, pas depuis le sol. Une entité extrudée de 0 à
 * 12 m est donc ancrée à l'altitude zéro : sur un relief à 50 m elle est
 * entièrement enfouie, et sur un relief à 10 m seuls deux mètres dépassent —
 * d'où les interférences entre la donnée et le terrain.
 *
 * Les modèles 3D three.js, eux, étaient déjà posés correctement (`Models3D`
 * interroge le MNT). Ce module applique la même règle aux surfaces, en
 * réutilisant **le même échantillonnage** : un lampadaire et le bâtiment sous
 * lui reposent ainsi à la même altitude par construction, quelle que soit
 * l'exagération du relief.
 */

/** Propriété portant l'altitude du sol, injectée dans chaque entité. */
export const TERRAIN_BASE_PROP = '_sol';

/**
 * Décalage minimal entre le sol et le dessous des surfaces, en mètres.
 *
 * Posée exactement à l'altitude du terrain, la face inférieure du prisme est
 * coplanaire avec lui : les deux se disputent le tampon de profondeur et la
 * surface scintille (*z-fighting*). Un demi-mètre suffit à les départager, et
 * reste invisible à toute échelle.
 *
 * **Constante, et non expression de zoom.** MapLibre n'autorise `["zoom"]`
 * qu'à la racine d'une expression de propriété : imbriquée dans un `["+"]`,
 * elle invalide l'expression entière — et `setPaintProperty` la rejette
 * **sans rien signaler**. La base retombait alors à sa valeur par défaut, ce
 * qui annulait tout le calage sur le relief. Mesuré : avec un décalage
 * dépendant du zoom, `getPaintProperty('fill-extrusion-base')` renvoyait `0`.
 */
export const DECALAGE_ANTI_SCINTILLEMENT = 0.5;

/**
 * Expressions d'extrusion posées sur le sol.
 *
 * `base` et `height` peuvent être des nombres ou des expressions MapLibre
 * (hauteur graduée, champ de la donnée) : elles sont composées telles quelles.
 *
 * @param {number|Array} base hauteur du dessous, au-dessus du sol
 * @param {number|Array} height épaisseur au-dessus de la base
 * @param {boolean} surTerrain false = comportement d'origine, ancré au niveau de la mer
 */
export function extrusionExpressions(base, height, surTerrain, solConstant = null) {
  if (!surTerrain) return { base, height };
  // Une couche dont Atlas ne detient pas les entites n'a pas de `_sol` par
  // objet : le `coalesce` retomberait sur 0, donc au niveau de la mer, et sur
  // un relief a 50 m toute la couche disparaitrait sous le sol. Une altitude
  // unique pour la couche est approximative — le relief varie sur une emprise —
  // mais elle place les objets a portee de vue au lieu de les enfouir.
  const sol = Number.isFinite(solConstant)
    ? solConstant
    : ['coalesce', ['get', TERRAIN_BASE_PROP], 0];
  const eps = DECALAGE_ANTI_SCINTILLEMENT;
  return {
    base: ['+', sol, eps, base],
    // Épaisseur plancher : une hauteur graduée part souvent de zéro pour la
    // plus petite valeur, et un prisme d'épaisseur nulle a ses faces
    // supérieure et inférieure confondues — elles se disputent le tampon de
    // profondeur quoi qu'on fasse. Aucune base ni marge ne corrige cela ; seule
    // une épaisseur non nulle le peut.
    height: ['+', sol, eps, base, ['max', height, EPAISSEUR_MIN_M]],
  };
}

/**
 * Épaisseur minimale d'une surface en volume, en mètres.
 *
 * Assez pour que les deux faces ne soient jamais confondues, assez peu pour ne
 * pas fausser la lecture d'une hauteur graduée : la plus petite classe reste
 * visuellement la plus basse.
 */
export const EPAISSEUR_MIN_M = 0.5;

/** Nombre maximal de points sondés par entité. */
export const MAX_POINTS_SONDES = 8;

/**
 * Points caractéristiques d'une entité, pour sonder le relief sous elle.
 *
 * Une surface est **plane** : la poser à l'altitude de son seul centre la fait
 * traverser tout terrain en pente — bord amont enfoui, bord aval en lévitation.
 * Sur une maille de 200 m et une pente de 10 %, l'écart atteint ±10 m, l'ordre
 * de grandeur de la hauteur d'extrusion elle-même.
 *
 * On sonde donc aussi les sommets, en les parcourant à pas régulier pour ne pas
 * dépendre de la finesse du contour. Sur une grille régulière, ces sommets sont
 * partagés par les mailles voisines : le cache d'altitude absorbe la
 * multiplication des appels.
 */
export function pointsSondes(feature, max = MAX_POINTS_SONDES) {
  const g = feature?.geometry;
  if (!g) return [];
  const estPoint = (c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]);
  if (g.type === 'Point') return estPoint(g.coordinates) ? [g.coordinates] : [];

  // Anneau extérieur : Polygon → coordinates[0] ; MultiPolygon → [0][0].
  const anneau = g.type === 'Polygon' ? g.coordinates?.[0]
    : g.type === 'MultiPolygon' ? g.coordinates?.[0]?.[0]
      : g.type === 'LineString' ? g.coordinates
        : null;
  if (!Array.isArray(anneau) || !anneau.length) return [];

  const pts = [];
  const pas = Math.max(1, Math.ceil(anneau.length / max));
  for (let i = 0; i < anneau.length; i += pas) {
    if (estPoint(anneau[i])) pts.push(anneau[i]);
  }
  return pts;
}

/**
 * Injecte l'altitude du sol dans les entités d'une collection.
 *
 * L'échantillonnage est délégué : l'appelant fournit la même fonction que celle
 * qui pose les modèles 3D. On retient l'altitude **la plus haute** sous
 * l'entité : ainsi elle repose sur son point culminant et ne traverse jamais le
 * sol. Elle décolle un peu côté aval — moindre mal, et c'est l'absence
 * d'interférence qui est recherchée.
 *
 * Une altitude non finie — tuile MNT pas encore chargée — laisse l'entité
 * inchangée plutôt que de la coller à zéro, ce qui la ferait sauter au moment
 * où le relief arrive.
 *
 * @param {{features?: Array}} geojson
 * @param {(lng: number, lat: number) => number} echantillonner
 * @param {(feature: object) => Array<[number, number]>} points
 * @returns {number} nombre d'entités effectivement posées
 */
export function applyTerrainBase(geojson, echantillonner, points = pointsSondes, hauteurDe = null) {
  const feats = geojson?.features;
  if (!Array.isArray(feats) || typeof echantillonner !== 'function') return 0;
  let posees = 0;
  for (const f of feats) {
    let haut = null;
    let bas = null;
    for (const p of (points?.(f) || [])) {
      const v = echantillonner(p[0], p[1]);
      if (!Number.isFinite(v)) continue;
      if (haut === null || v > haut) haut = v;
      if (bas === null || v < bas) bas = v;
    }
    if (haut === null) continue;
    const plafond = haut + margeRelief(haut - bas);
    const h = typeof hauteurDe === 'function' ? hauteurDe(f) : null;
    (f.properties = f.properties || {})[TERRAIN_BASE_PROP] = baseSurTerrain(bas, plafond, h);
    posees++;
  }
  return posees;
}

/**
 * L'altitude à laquelle poser un volume, entre s'enfouir et léviter.
 *
 * Poser sur le **point culminant** garantit qu'aucun volume ne traverse le sol —
 * c'était la règle, et elle vient d'un vrai défaut : un prisme plat calé plus
 * bas disparaît entièrement dans la bosse qu'il couvre. Mais elle en produit un
 * symétrique, mesuré sur le vallon des Aygalades : une maille de 78 m couvrant
 * 37 m de dénivelé se retrouve **45 m au-dessus de son point bas**, suspendue
 * au-dessus de sa propre emprise, traversée par les lignes drapées qui, elles,
 * suivent le sol.
 *
 * Les deux règles fixes ont donc chacune leur cas de ruine, et le bon choix
 * n'est ni l'une ni l'autre : **il dépend de la hauteur du volume**. Un bloc de
 * 60 m sur 37 m de dénivelé peut descendre au point bas sans disparaître ; un
 * bloc de 2 m, non.
 *
 * D'où la règle : on descend aussi bas que possible, **sans que le sommet passe
 * sous le point culminant**. Le volume reste donc toujours visible, et ne
 * décolle que de ce qu'il faut pour le rester.
 *
 *     base = max(bas, plafond − hauteur)
 *
 * - hauteur nulle ou inconnue → `plafond` : l'ancien comportement, le seul sûr
 *   quand on ignore l'épaisseur ;
 * - hauteur ≥ amplitude → `bas` : le volume est posé au sol, ancré ;
 * - entre les deux, la transition est continue — pas de seuil, donc pas de
 *   saut visible quand une hauteur graduée franchit une borne.
 *
 * @param {number|null} bas altitude la plus basse sous l'entité
 * @param {number} plafond point culminant + marge anti-scintillement
 * @param {number|null} hauteur épaisseur du volume, en mètres
 */
export function baseSurTerrain(bas, plafond, hauteur) {
  if (!Number.isFinite(hauteur) || hauteur <= 0) return plafond;
  if (!Number.isFinite(bas)) return plafond;
  return Math.max(bas, plafond - hauteur);
}

/**
 * Marge au-dessus du point culminant, en mètres.
 *
 * MapLibre simplifie le maillage du relief selon la distance, et cette
 * simplification **change pendant la navigation** : l'altitude effectivement
 * rendue s'écarte de celle que `queryTerrainElevation` a donnée. Une marge fixe
 * ne suffit donc pas — c'est ce qui faisait encore traverser les prismes les
 * plus plats, ceux des faibles valeurs, dès qu'on déplaçait la caméra.
 *
 * L'écart de simplification suit la rugosité locale : on prend donc la moitié
 * de l'amplitude mesurée sous l'entité, avec un plancher pour le terrain plat
 * et un plafond pour ne pas faire léviter visiblement une maille posée sur une
 * falaise.
 */
export function margeRelief(amplitude) {
  const a = Number.isFinite(amplitude) ? Math.abs(amplitude) : 0;
  return Math.min(MARGE_MAX_M, Math.max(DECALAGE_ANTI_SCINTILLEMENT, a * 0.5));
}

/** Plafond de la marge adaptative, en mètres. */
export const MARGE_MAX_M = 8;

/**
 * Retire l'altitude injectée.
 *
 * Nécessaire quand le relief est coupé : l'expression retomberait sinon sur une
 * valeur périmée et laisserait les entités en lévitation.
 *
 * @returns {number} nombre d'entités nettoyées
 */
export function clearTerrainBase(geojson) {
  const feats = geojson?.features;
  if (!Array.isArray(feats)) return 0;
  let n = 0;
  for (const f of feats) {
    if (f?.properties && TERRAIN_BASE_PROP in f.properties) {
      delete f.properties[TERRAIN_BASE_PROP];
      n++;
    }
  }
  return n;
}

/**
 * Une couche a-t-elle besoin d'être posée sur le relief ?
 *
 * Seules les surfaces **en volume** sont concernées : à plat, MapLibre drape
 * déjà le remplissage sur le terrain. Les points et les lignes sont drapés eux
 * aussi. Sans cette garde, on paierait un échantillonnage inutile sur toute
 * couche visible.
 */
export function needsTerrainBase(layer, terrainActif) {
  if (!terrainActif || !layer) return false;
  const g = layer.geometryType;
  const surfacique = g === 'Polygon' || g === 'MultiPolygon';
  return surfacique && layer.style?.polygonMode !== 'flat';
}

/**
 * Les deux echantillonnages du relief doivent-ils etre rejoues ?
 *
 * Le MNT arrive par tuiles, et leur resolution change a chaque palier entier de
 * zoom : une altitude relevee a z11 n'est pas celle que MapLibre rendra a z14.
 * Il faut donc bien re-echantillonner un jour ou l'autre — mais **pas a chaque
 * fin de deplacement**.
 *
 * C'etait le defaut : le cache d'altitude etait vide a chaque `moveend`, donc
 * un simple panoramique suffisait a faire re-sonder tous les objets. Ceux dont
 * la tuile n'etait pas encore revenue retombaient a zero, et la scene entiere
 * sautait — d'ou les modeles 3D qui « bougeaient avec la carte ». Le meme cache
 * alimentant le calage des surfaces, les mailles heritaient des memes altitudes
 * douteuses.
 *
 * On ne rejoue donc que sur changement de palier, ou la donnee change vraiment.
 */
export function paliersDemDifferents(zoomA, zoomB) {
  if (!Number.isFinite(zoomA) || !Number.isFinite(zoomB)) return true;
  return Math.floor(zoomA) !== Math.floor(zoomB);
}

/**
 * Altitude de reference de la scene 3D, jamais retombee a zero.
 *
 * `queryTerrainElevation` ne repond que pour les tuiles chargees. L'origine de
 * la scene est un objet fixe, souvent hors du champ apres quelques
 * deplacements : le repli historique `|| 0` la ramenait alors au niveau de la
 * mer et translatait toute la scene d'un coup. Mieux vaut conserver la derniere
 * altitude connue — perimee au pire, jamais absurde.
 */
export function altitudeOrigineStable(sondee, precedente) {
  if (Number.isFinite(sondee)) return sondee;
  return Number.isFinite(precedente) ? precedente : 0;
}

/**
 * Ecart vertical entre une entite et l'origine de la scene 3D, en metres.
 *
 * Les instances three.js sont placees relativement a une origine, elle-meme
 * translatee par l'altitude de son propre point. Les deux echantillonnages
 * doivent donc suivre la MEME regle de repli, sans quoi ils divergent.
 *
 * C'est ce qui est arrive : l'origine conservait sa derniere altitude connue
 * (`altitudeOrigineStable`) pendant que les entites retombaient au niveau de la
 * mer. Sur un relief a 200 m, l'ecart valait -200 m et toute la scene passait
 * sous le sol — les objets 3D semblaient ne plus charger.
 *
 * Sans altitude pour l'entite, l'ecart est donc NUL : elle repose sur le plan de
 * l'origine, jamais au niveau de la mer.
 */
export function ecartAuSol(solEntite, altitudeOrigine) {
  const origine = Number.isFinite(altitudeOrigine) ? altitudeOrigine : 0;
  if (!Number.isFinite(solEntite)) return 0;
  return solEntite - origine;
}
