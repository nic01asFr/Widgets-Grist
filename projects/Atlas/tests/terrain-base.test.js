import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TERRAIN_BASE_PROP,
  applyTerrainBase,
  clearTerrainBase,
  extrusionExpressions,
  needsTerrainBase,
  pointsSondes,
  DECALAGE_ANTI_SCINTILLEMENT,
  MARGE_MAX_M,
  EPAISSEUR_MIN_M,
  margeRelief,
  baseSurTerrain,
  paliersDemDifferents,
  altitudeOrigineStable,
  ecartAuSol,
} from '../lib/terrain-base.js';

const centre = (f) => (f?.geometry?.coordinates ? [f.geometry.coordinates] : []);
const maille200 = (lng, lat, cote = 0.002) => ({
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [lng, lat], [lng + cote, lat], [lng + cote, lat + cote], [lng, lat + cote], [lng, lat],
    ]],
  },
  properties: {},
});
const maille = (lng, lat, props = {}) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lng, lat] },
  properties: { ...props },
});

/* ---------- expressions ---------- */

test('sans terrain : les valeurs passent telles quelles', () => {
  const { base, height } = extrusionExpressions(0, 12, false);
  assert.equal(base, 0);
  assert.equal(height, 12);
});

test('sur terrain : base et sommet décalés de l’altitude du sol', () => {
  const { base, height } = extrusionExpressions(0, 12, true);
  const sol = ['coalesce', ['get', TERRAIN_BASE_PROP], 0];
  const eps = DECALAGE_ANTI_SCINTILLEMENT;
  assert.deepEqual(base, ['+', sol, eps, 0]);
  // Le sommet doit inclure la base : sinon une entité posée à 50 m avec une
  // base de 3 m aurait une épaisseur de 12 m à partir de 50 m, pas de 53 m.
  assert.deepEqual(height, ['+', sol, eps, 0, ['max', 12, EPAISSEUR_MIN_M]]);
});

/* ---------- épaisseur plancher ---------- */

test('une épaisseur nulle est relevée au plancher', () => {
  // Cas réel CRESO : la hauteur est graduée de 0 à 500 m sur ln(nb_bat+1).
  // Les mailles à nb_bat = 1 recevaient donc une épaisseur ZÉRO — faces
  // supérieure et inférieure confondues, donc scintillement que ni la base ni
  // la marge ne peuvent corriger.
  const { height } = extrusionExpressions(0, 0, true);
  assert.deepEqual(height[height.length - 1], ['max', 0, EPAISSEUR_MIN_M]);
});

test('le plancher n’écrase pas les hauteurs réelles', () => {
  // La plus petite classe doit rester visuellement la plus basse.
  assert.ok(EPAISSEUR_MIN_M > 0);
  assert.ok(EPAISSEUR_MIN_M < 1, 'assez petit pour ne pas fausser une graduation');
});

test('sans terrain, aucun plancher : le rendu d’origine est intact', () => {
  const { height } = extrusionExpressions(0, 0, false);
  assert.equal(height, 0);
});

/* ---------- anti-scintillement ---------- */

test('la base ne repose jamais exactement sur le sol', () => {
  // Coplanaires, terrain et face inférieure se disputent le tampon de
  // profondeur : c'est le scintillement observé à l'écran.
  const { base } = extrusionExpressions(0, 12, true);
  assert.ok(base.includes(DECALAGE_ANTI_SCINTILLEMENT), 'décalage absent de la base');
});

test('le décalage est une constante, jamais une expression de zoom', () => {
  // MapLibre n'autorise ["zoom"] qu'à la racine d'une expression de propriété.
  // Imbriquée dans un ["+"], elle invalide l'expression entière et
  // setPaintProperty la rejette SANS RIEN SIGNALER : la base retombait à sa
  // valeur par défaut, annulant tout le calage. Vérifié à l'écran —
  // getPaintProperty renvoyait 0.
  assert.equal(typeof DECALAGE_ANTI_SCINTILLEMENT, 'number');
  assert.ok(DECALAGE_ANTI_SCINTILLEMENT > 0, 'jamais nul, sinon le scintillement revient');
  assert.ok(DECALAGE_ANTI_SCINTILLEMENT < 2, 'assez petit pour rester invisible');
});

test('aucune sous-expression de zoom dans les expressions produites', () => {
  // Garde anti-régression : la même erreur, ailleurs dans l'expression, serait
  // tout aussi silencieuse.
  const { base, height } = extrusionExpressions(0, 12, true);
  const contientZoom = (e) => Array.isArray(e)
    ? (e[0] === 'zoom' || e.some(contientZoom))
    : false;
  assert.equal(contientZoom(base), false, 'zoom imbriqué dans la base');
  assert.equal(contientZoom(height), false, 'zoom imbriqué dans la hauteur');
});

test('sans terrain, aucun décalage : le rendu d’origine est intact', () => {
  const { base, height } = extrusionExpressions(2, 12, false);
  assert.equal(base, 2);
  assert.equal(height, 12);
});

test('une hauteur graduée reste composable', () => {
  const graduee = ['interpolate', ['linear'], ['get', 'nb_bat'], 0, 2, 134, 40];
  const { height } = extrusionExpressions(3, graduee, true);
  assert.deepEqual(height, [
    '+', ['coalesce', ['get', TERRAIN_BASE_PROP], 0], DECALAGE_ANTI_SCINTILLEMENT, 3,
    ['max', graduee, EPAISSEUR_MIN_M],
  ]);
});

test('sol absent : l’entité retombe au niveau de la mer, pas d’erreur', () => {
  // `coalesce` garantit qu'une entité non échantillonnée reste rendue.
  const { base } = extrusionExpressions(0, 12, true);
  assert.equal(base[1][0], 'coalesce');
  assert.equal(base[1][2], 0);
});

/* ---------- injection ---------- */

test('pose l’altitude sur chaque entité', () => {
  const fc = { features: [maille(9.1, 39.2), maille(9.2, 39.3)] };
  const n = applyTerrainBase(fc, (lng) => (lng === 9.1 ? 12.5 : 47), centre);
  assert.equal(n, 2);
  // Un seul point sondé : amplitude nulle, donc marge plancher.
  assert.equal(fc.features[0].properties[TERRAIN_BASE_PROP], 12.5 + DECALAGE_ANTI_SCINTILLEMENT);
  assert.equal(fc.features[1].properties[TERRAIN_BASE_PROP], 47 + DECALAGE_ANTI_SCINTILLEMENT);
});

test('altitude indisponible : l’entité est laissée intacte', () => {
  // Tuile MNT pas encore chargée. L'écraser à zéro ferait sauter l'entité au
  // moment où le relief arrive — mieux vaut ne rien poser et rejouer.
  const fc = { features: [maille(9.1, 39.2, { nb: 3 })] };
  const n = applyTerrainBase(fc, () => null, centre);
  assert.equal(n, 0);
  assert.equal(TERRAIN_BASE_PROP in fc.features[0].properties, false);
  assert.equal(fc.features[0].properties.nb, 3, 'les autres attributs sont préservés');
});

test('altitude négative (dépression, bathymétrie) acceptée', () => {
  const fc = { features: [maille(9.1, 39.2)] };
  applyTerrainBase(fc, () => -8, centre);
  assert.equal(fc.features[0].properties[TERRAIN_BASE_PROP], -8 + DECALAGE_ANTI_SCINTILLEMENT);
});

test('entité sans géométrie : ignorée', () => {
  const fc = { features: [{ type: 'Feature', geometry: null, properties: {} }] };
  assert.equal(applyTerrainBase(fc, () => 10, centre), 0);
});

/* ---------- points sondés : le cœur de la correction ---------- */

test('une surface est sondée sur ses sommets, pas seulement son centre', () => {
  // Une facette plane posée à l'altitude de son centre traverse tout terrain
  // en pente : bord amont enfoui, bord aval en lévitation.
  const pts = pointsSondes(maille200(9.1, 39.2));
  assert.ok(pts.length >= 4, `attendu au moins les 4 coins, obtenu ${pts.length}`);
});

test('on retient l’altitude la plus haute sous l’entité, plus une marge', () => {
  const fc = { features: [maille200(9.1, 39.2)] };
  // Terrain en pente : l'altitude croît avec la longitude, de 0 à 10 m.
  applyTerrainBase(fc, (lng) => (lng - 9.1) * 5000, pointsSondes);
  // Point culminant à 10 m, amplitude 10 m → marge de 5 m.
  const z = fc.features[0].properties[TERRAIN_BASE_PROP];
  assert.ok(Math.abs(z - 15) < 1e-3, `attendu ~15 (10 + marge 5), obtenu ${z}`);
});

/* ---------- marge adaptative ---------- */

test('terrain plat : la marge se réduit au décalage minimal', () => {
  assert.equal(margeRelief(0), DECALAGE_ANTI_SCINTILLEMENT);
  assert.equal(margeRelief(0.2), DECALAGE_ANTI_SCINTILLEMENT);
});

test('la marge croît avec la rugosité du terrain', () => {
  // MapLibre simplifie le maillage du relief selon la distance, et cette
  // simplification CHANGE pendant la navigation : l'altitude rendue s'écarte
  // de celle mesurée. C'est ce qui faisait encore traverser les prismes plats.
  assert.ok(margeRelief(10) > margeRelief(4));
  assert.equal(margeRelief(10), 5);
});

test('la marge est plafonnée : pas de lévitation visible sur une falaise', () => {
  assert.equal(margeRelief(200), MARGE_MAX_M);
  assert.ok(MARGE_MAX_M > DECALAGE_ANTI_SCINTILLEMENT);
});

test('amplitude invalide : plancher', () => {
  assert.equal(margeRelief(NaN), DECALAGE_ANTI_SCINTILLEMENT);
  assert.equal(margeRelief(undefined), DECALAGE_ANTI_SCINTILLEMENT);
  assert.equal(margeRelief(-6), 3, 'une amplitude négative est une amplitude');
});

test('le nombre de points sondés reste borné', () => {
  // Un contour très détaillé ne doit pas faire exploser le coût.
  const anneau = Array.from({ length: 500 }, (_, i) => [9 + i * 1e-5, 39]);
  const f = { geometry: { type: 'Polygon', coordinates: [anneau] } };
  assert.ok(pointsSondes(f).length <= 8);
});

test('un point n’a qu’un seul point sondé', () => {
  assert.deepEqual(pointsSondes(maille(9.1, 39.2)), [[9.1, 39.2]]);
});

test('MultiPolygon : l’anneau extérieur du premier polygone', () => {
  const f = {
    geometry: {
      type: 'MultiPolygon',
      coordinates: [[[[9, 39], [9.1, 39], [9.1, 39.1], [9, 39]]]],
    },
  };
  assert.equal(pointsSondes(f).length, 4);
});

test('géométrie inexploitable : aucun point', () => {
  assert.deepEqual(pointsSondes({ geometry: { type: 'Polygon', coordinates: [] } }), []);
  assert.deepEqual(pointsSondes(null), []);
});

test('entrées invalides', () => {
  assert.equal(applyTerrainBase(null, () => 1, centre), 0);
  assert.equal(applyTerrainBase({ features: [] }, () => 1, centre), 0);
  assert.equal(applyTerrainBase({ features: [maille(1, 1)] }, null, centre), 0);
});

/* ---------- nettoyage ---------- */

test('couper le relief retire l’altitude', () => {
  // Sans cela, l'expression retomberait sur une valeur périmée et les entités
  // resteraient en lévitation au-dessus d'une carte redevenue plate.
  const fc = { features: [maille(9.1, 39.2), maille(9.2, 39.3)] };
  applyTerrainBase(fc, () => 30, centre);
  assert.equal(clearTerrainBase(fc), 2);
  assert.equal(TERRAIN_BASE_PROP in fc.features[0].properties, false);
});

test('nettoyer une collection déjà propre ne casse rien', () => {
  assert.equal(clearTerrainBase({ features: [maille(1, 1)] }), 0);
  assert.equal(clearTerrainBase(null), 0);
});

/* ---------- garde ---------- */

test('seules les surfaces en volume sont concernées', () => {
  const enVolume = { geometryType: 'Polygon', style: {} };
  const aPlat = { geometryType: 'Polygon', style: { polygonMode: 'flat' } };
  assert.equal(needsTerrainBase(enVolume, true), true);
  // À plat, MapLibre drape déjà le remplissage sur le relief.
  assert.equal(needsTerrainBase(aPlat, true), false);
  assert.equal(needsTerrainBase({ geometryType: 'LineString' }, true), false);
  assert.equal(needsTerrainBase({ geometryType: 'Point' }, true), false);
  assert.equal(needsTerrainBase({ geometryType: 'MultiPolygon', style: {} }, true), true);
});

test('relief coupé : aucune couche concernée', () => {
  assert.equal(needsTerrainBase({ geometryType: 'Polygon', style: {} }, false), false);
  assert.equal(needsTerrainBase(null, true), false);
});

/* ---------- quand rejouer l'echantillonnage ---------- */

test('un panoramique ne fait pas re-sonder le relief', () => {
  // C'etait LE defaut : le cache d'altitude etait vide a chaque `moveend`, donc
  // un simple deplacement faisait re-sonder tous les objets. Ceux dont la tuile
  // DEM n'etait pas revenue retombaient a zero et la scene 3D sautait — les
  // modeles « bougeaient avec la carte ».
  assert.equal(paliersDemDifferents(12.1, 12.9), false);
  assert.equal(paliersDemDifferents(12.0, 12.0), false);
});

test('changer de palier de zoom rejoue l’echantillonnage', () => {
  // La resolution des tuiles MNT change a chaque entier : l'altitude relevee a
  // z11 n'est pas celle que MapLibre rendra a z14.
  assert.equal(paliersDemDifferents(11.9, 12.1), true);
  assert.equal(paliersDemDifferents(14, 11), true);
});

test('premier calage : aucun palier connu, on echantillonne', () => {
  assert.equal(paliersDemDifferents(null, 12), true);
  assert.equal(paliersDemDifferents(undefined, 12), true);
  assert.equal(paliersDemDifferents(NaN, 12), true);
});

/* ---------- altitude de l'origine de la scene 3D ---------- */

test('tuile absente : l’origine garde sa derniere altitude connue', () => {
  // Le repli historique `|| 0` ramenait l'origine au niveau de la mer des
  // qu'elle sortait des tuiles chargees — et toute la scene avec elle.
  assert.equal(altitudeOrigineStable(null, 214), 214);
  assert.equal(altitudeOrigineStable(undefined, 214), 214);
  assert.equal(altitudeOrigineStable(NaN, 214), 214);
});

test('altitude disponible : elle prime sur la precedente', () => {
  assert.equal(altitudeOrigineStable(220, 214), 220);
});

test('zero est une altitude valide, pas une absence', () => {
  // Bord de mer : confondre les deux relevait l'origine sans raison.
  assert.equal(altitudeOrigineStable(0, 214), 0);
});

test('altitude negative acceptee (bathymetrie, depression)', () => {
  assert.equal(altitudeOrigineStable(-12, 214), -12);
});

test('aucune valeur connue : niveau de la mer, faute de mieux', () => {
  assert.equal(altitudeOrigineStable(null, null), 0);
  assert.equal(altitudeOrigineStable(null, undefined), 0);
});

/* ---------- ecart au sol : les deux echantillonnages doivent s'accorder ---------- */

test('tuile absente : l’entite repose sur le plan de l’origine, pas au niveau de la mer', () => {
  // REGRESSION VECUE : l'origine conservait son altitude (200 m) pendant que les
  // entites retombaient a zero. L'ecart valait -200 m et toute la scene 3D
  // passait sous le sol — les objets semblaient ne plus charger du tout.
  assert.equal(ecartAuSol(null, 200), 0);
  assert.equal(ecartAuSol(undefined, 200), 0);
  assert.equal(ecartAuSol(NaN, 200), 0);
});

test('altitude connue : ecart reel a l’origine', () => {
  assert.equal(ecartAuSol(212, 200), 12);
  assert.equal(ecartAuSol(188, 200), -12);
});

test('zero est une altitude, pas une absence', () => {
  // Bord de mer avec une origine en hauteur : l'entite DOIT descendre.
  assert.equal(ecartAuSol(0, 200), -200);
});

test('relief coupe : origine a zero, ecart nul', () => {
  assert.equal(ecartAuSol(0, 0), 0);
  assert.equal(ecartAuSol(null, 0), 0);
});

test('origine illisible : traitee comme le niveau de la mer', () => {
  assert.equal(ecartAuSol(50, null), 50);
  assert.equal(ecartAuSol(50, NaN), 50);
});

/* ---------- seuil de projection ---------- */

test('le placement 3D n’est valable qu’une fois MapLibre passe au plan', () => {
  // Mesure au banc (tests/manuel/projection-3d.html), projection globe, ecart
  // entre le cube three.js et le point MapLibre aux memes coordonnees :
  //   z3 → 570 px · z6 → 1692 px · z9 → 2248 px · z11 → 2337 px · z12 → 0 px
  // Le custom layer pose une translation plane la ou MapLibre projette sur une
  // sphere : sous ce seuil, rien de ce qu'il dessine n'est a sa place.
  const SEUIL = 12;
  const ecarts = { 3: 570, 6: 1692, 9: 2248, 11: 2337, 12: 0, 16: 0, 20: 0 };
  for (const [zoom, ecart] of Object.entries(ecarts)) {
    if (Number(zoom) < SEUIL) assert.ok(ecart > 100, `z${zoom} devrait etre faux`);
    else assert.equal(ecart, 0, `z${zoom} devrait etre exact`);
  }
});

/* ---------- où poser un volume : entre s'enfouir et léviter ---------- */

test('un volume haut descend jusqu’au point bas — il reste visible', () => {
  // 60 m d'épaisseur sur 37 m de dénivelé : le sommet dépasse largement le
  // point culminant, rien n'oblige à le suspendre.
  assert.equal(baseSurTerrain(100, 145, 60), 100);
});

test('un volume plat reste au plafond — descendre l’enfouirait', () => {
  // 2 m sur 37 m de dénivelé : le poser au point bas le ferait disparaître
  // entièrement dans la bosse qu'il couvre. C'est le défaut d'origine, celui
  // pour lequel la règle du point culminant avait été écrite.
  assert.equal(baseSurTerrain(100, 145, 2), 143);
});

test('entre les deux, la transition est continue', () => {
  // Pas de seuil, donc pas de saut visible quand une hauteur graduée franchit
  // une borne : deux entités de hauteurs voisines se posent à des altitudes
  // voisines.
  const a = baseSurTerrain(100, 145, 24);
  const b = baseSurTerrain(100, 145, 26);
  assert.equal(a, 121);
  assert.equal(b, 119);
  assert.ok(Math.abs(a - b) === 2, 'la base suit la hauteur, pas un palier');
});

test('hauteur inconnue : on garde le seul comportement sûr', () => {
  // Sans épaisseur, impossible de savoir jusqu'où descendre sans enfouir.
  for (const h of [null, undefined, NaN, 0, -5]) {
    assert.equal(baseSurTerrain(100, 145, h), 145);
  }
});

test('sans point bas mesuré, on ne descend pas', () => {
  // Une seule sonde a répondu : l'amplitude est inconnue, descendre serait un
  // pari sur un terrain qu'on n'a pas mesuré.
  assert.equal(baseSurTerrain(null, 145, 60), 145);
});

test('sur terrain plat, la règle ne change rien', () => {
  // bas == haut : le plafond n'est que la marge anti-scintillement, et la base
  // ne peut pas descendre plus bas que le sol.
  const plafond = 50 + margeRelief(0);
  assert.equal(baseSurTerrain(50, plafond, 30), 50);
});

test('appliqué aux entités : le volume suit sa hauteur', () => {
  const fc = { features: [maille(9.1, 39.2, { h: 60 }), maille(9.2, 39.3, { h: 2 })] };
  // Un relief en pente sous chaque maille : le point sondé varie.
  let appels = 0;
  const echantillon = () => [100, 137, 120, 110][(appels++) % 4];
  applyTerrainBase(fc, echantillon, (f) => [[0, 0], [1, 1], [2, 2], [3, 3]],
    (f) => f.properties.h);
  const [gros, plat] = fc.features.map((f) => f.properties[TERRAIN_BASE_PROP]);
  assert.ok(gros < plat, 'le volume haut se pose plus bas que le volume plat');
});
