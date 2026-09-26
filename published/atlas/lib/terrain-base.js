/**
 * Le relief, et qui s'en charge.
 *
 * **MapLibre pose lui-même sur le terrain tout ce qu'il rend** : surfaces à
 * plat, lignes, cercles, et — c'est le point qui a coûté cher — les extrusions,
 * sommet par sommet. Sur relief actif, `fill-extrusion-base` et
 * `fill-extrusion-height` se comptent depuis le **sol**, pas depuis le niveau
 * de la mer.
 *
 * Ce module a longtemps affirmé l'inverse et ajoutait aux extrusions l'altitude
 * du sol qu'il sondait lui-même. Elle était donc **comptée deux fois**, et
 * chaque volume soulevé de sa propre altitude — de 85 m à 245 m sur le transect
 * des Aygalades. C'était la cause des volumes « qui flottent », et deux
 * tentatives de mieux répartir ce décalage n'y ont rien changé : le décalage
 * lui-même était de trop.
 *
 * Ne reste donc ici que ce qu'Atlas place vraiment de sa main : les **modèles
 * 3D** three.js, rendus dans un custom layer que MapLibre ne connaît pas, et
 * qui doivent interroger le MNT pour se poser.
 */

/**
 * Expressions d'extrusion.
 *
 * **MapLibre pose déjà les extrusions sur le relief**, sommet par sommet : sur
 * terrain actif, `fill-extrusion-base` et `fill-extrusion-height` se comptent
 * depuis le **sol**, pas depuis le niveau de la mer. Une entité posée sur une
 * pente épouse donc le terrain par construction — sa paroi est plus haute en
 * aval qu'en amont, comme un mur réel.
 *
 * Atlas ajoutait par-dessus l'altitude du sol qu'il avait lui-même sondée. Elle
 * était donc **comptée deux fois**, et chaque volume soulevé de sa propre
 * altitude : mesuré sur le vallon des Aygalades, de 85 m en fond de vallon à
 * 245 m sur le coteau. C'est ce qui faisait « flotter » les volumes, et aucune
 * répartition de ce décalage — point culminant, point bas, ou compromis selon
 * la hauteur — ne pouvait le corriger, puisque le décalage lui-même était de
 * trop.
 *
 * > Le CLAUDE.md a longtemps affirmé l'inverse. C'était sans doute vrai d'une
 * > version antérieure de MapLibre ; ça ne l'est plus en 5.6.1. Vérifié à
 * > l'écran, trois fois : `_sol = 0` pose la dalle au sol, la neutralisation à
 * > caméra fixe fait redescendre les blocs, et un prisme de 6 m sur 23 m de
 * > dénivelé épouse la pente.
 *
 * Il ne reste donc rien à composer : les hauteurs déclarées sont déjà des
 * hauteurs au-dessus du sol, avec ou sans relief.
 *
 * **`height` est une épaisseur, et le sommet inclut la base.** Les deux
 * branches d'origine ne s'accordaient pas là-dessus : sans relief le sommet
 * valait `height` seul, avec relief `base + height`. Une entité à base 3 et
 * hauteur 12 mesurait donc 9 m à plat et 12 m sur relief. La seconde lecture
 * est la bonne — c'est celle que défendait déjà le commentaire du code — et
 * elle vaut maintenant dans les deux cas. Sans base déclarée (le cas courant,
 * `base = 0`) les deux se confondent, ce qui explique que l'écart soit passé
 * inaperçu.
 *
 * @param {number|Array} base hauteur du dessous, au-dessus du sol
 * @param {number|Array} height épaisseur au-dessus de la base
 */
export function extrusionExpressions(base, height) {
  return {
    base,
    // Épaisseur plancher : une hauteur graduée part souvent de zéro pour la
    // plus petite valeur, et un prisme d'épaisseur nulle a ses faces
    // supérieure et inférieure confondues — elles se disputent le tampon de
    // profondeur quoi qu'on fasse. Seule une épaisseur non nulle le corrige.
    height: ['+', base, ['max', height, EPAISSEUR_MIN_M]],
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

/**
 * Une tuile MNT déjà décodée ne se retélécharge pas quand MapLibre la recharge.
 *
 * **Défaut de MapLibre 5.6.1** (`RasterDEMTileSource.loadTile`, corrigé dans
 * les 5.x ultérieures) : `reload()` passe les tuiles chargées à `reloading`,
 * puis `loadTile` retélécharge l'image mais ne décode — et ne repasse à
 * `loaded` — que si la tuile n'a pas encore d'`actor` ou qu'elle a expiré.
 * Une tuile rechargée reste donc `reloading` **pour toujours** : la source ne
 * se dit jamais chargée, et la carte n'émet plus jamais `idle`.
 *
 * Deux appels d'Atlas déclenchent ce `reload()` : `setProjection` quand la
 * projection change (globe → mercator à la première étape d'un récit), et
 * `setTerrain` quand le relief se rallume. Mesuré le 24/09/2026 sur la démo
 * des Aygalades : 14 tuiles bloquées dès l'ouverture, 11 tuiles de 1 Mo
 * retéléchargées pour rien, et aucun `idle` ensuite — or le changement de
 * fond (`quandNouveauStyle`), le montage des couches et le récit attendent
 * `idle`.
 *
 * Le MNT d'une tuile ne dépend ni de la projection ni de l'état du relief :
 * une tuile `reloading` qui a déjà son `dem` repasse directement à `loaded`
 * (textures du terrain à préparer de nouveau). Une tuile expirée, ou jamais
 * décodée, suit le chemin normal.
 *
 * @param {{ loadTile: Function } | null | undefined} source la source
 *   `raster-dem` (`map.getSource('terrain-dem')`)
 * @returns la source, corrigée une seule fois, ou `null`
 */
export function garderDemAuRechargement(source) {
  if (!source || typeof source.loadTile !== 'function') return null;
  if (source.__demGardeAuRechargement) return source;
  const origine = source.loadTile;
  source.loadTile = function loadTileGardantDem(tile) {
    if (tile && tile.state === 'reloading' && tile.dem) {
      tile.needsTerrainPrepare = true;
      tile.needsHillshadePrepare = true;
      tile.state = 'loaded';
      return Promise.resolve();
    }
    return origine.apply(this, arguments);
  };
  source.__demGardeAuRechargement = true;
  return source;
}

/**
 * Niveau de zoom jusqu'où MapLibre découpe une source GeoJSON d'Atlas.
 *
 * **Défaut de MapLibre 5.6.1** (`SourceCache._updateRetainedTiles`, réécrit
 * dans les 5.x ultérieures) : pour une tuile idéale sans données, il cherche
 * les quatre enfants qui la couvriraient — `tileID.children(maxzoom)` — dès
 * que le zoom de couverture est au moins un cran sous le `maxzoom` de la
 * source. Mais une tuile déjà au `maxzoom` n'a qu'**un** enfant (surzoomé), et
 * `children[1].key` lève « Cannot read properties of undefined (reading
 * 'key') ». Ce cas n'arrive que sur **relief en vue inclinée** : les tuiles
 * proches de la caméra y montent d'un cran au-dessus du zoom de couverture.
 *
 * C'est l'exception des étapes qui passent le bâti en volume (démo des
 * Aygalades, étape 6 : 7 à 9 exceptions à chaque entrée, sur le bâti, la
 * voirie, l'eau et le mobilier — maxzoom 18 par défaut, couverture 17, tuiles
 * proches en 18). Avec 22, la fenêtre fautive remonte au-delà de z20.
 * Mesuré : 0 exception sur trois tours des étapes 5 à 7, contre 24.
 * Contrepartie : au-delà de z18 la géométrie est redécoupée au lieu d'être
 * agrandie — plus fine, et un peu plus de travail au worker.
 */
export const SOURCE_GEOJSON_MAXZOOM = 22;

/** Options d'une source GeoJSON d'Atlas. */
export function optionsSourceGeojson(data) {
  return { type: 'geojson', data, maxzoom: SOURCE_GEOJSON_MAXZOOM };
}

/**
 * MapLibre 5.6.1 lèverait-il sur cette tuile idéale sans données ?
 *
 * Reproduit sa condition : il demande quatre enfants quand
 * `zoomCouverture + 1 <= maxzoom`, et n'en obtient qu'un quand la tuile est
 * au `maxzoom` ou au-delà.
 */
export function tuileSansQuatreEnfants(zoomCouverture, zoomTuile, maxzoomSource) {
  return zoomCouverture + 1 <= maxzoomSource && zoomTuile >= maxzoomSource;
}

/**
 * Cet événement `data` dit-il qu'une tuile du MNT vient d'arriver ?
 *
 * Atlas rejoue le calage des modèles quand le relief s'affine. Il filtrait sur
 * `sourceDataType === 'content'`, que MapLibre 5.6.1 **n'émet jamais** à
 * l'arrivée d'une tuile `raster-dem` : l'événement porte `dataType: 'source'`
 * et `tile`, sans `sourceDataType` (mesuré le 24/09/2026 : 3 sur 3). Le
 * recalage « à l'arrivée du MNT » n'a donc jamais eu lieu ; seuls restaient le
 * changement de palier de zoom (350 ms après `moveend`, souvent avant la
 * tuile) et la sonde de l'origine. Aygalades, étape 6 : 65 modèles sur 232 à
 * plus de 50 cm de leur sol, jusqu'à 2,16 m, et cela restait.
 */
export function evenementMntArrive(e) {
  if (!e || e.sourceId !== 'terrain-dem') return false;
  return !!e.tile || e.sourceDataType === 'content';
}

/**
 * Clé du cache d'altitude des modèles : un millionième de degré (≈ 8 cm).
 *
 * L'ancienne clé rangeait par dix-millièmes (≈ 8 × 11 m) : deux objets voisins
 * partageaient l'altitude du premier sondé — jusqu'à 1,45 m d'écart sur le
 * mobilier en pente des Aygalades. Le cache est vidé à chaque recalage : il ne
 * sert qu'à ne pas sonder deux fois le même point dans un même calcul.
 */
export function cleAltitude(lng, lat) {
  return Math.round(lng * 1e6) + ',' + Math.round(lat * 1e6);
}
