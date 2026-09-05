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
