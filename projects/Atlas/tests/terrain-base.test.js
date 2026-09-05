import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extrusionExpressions,
  EPAISSEUR_MIN_M,
  paliersDemDifferents,
  altitudeOrigineStable,
  ecartAuSol,
} from '../lib/terrain-base.js';

/* ---------- expressions : MapLibre pose deja sur le terrain ---------- */

test('aucune altitude de sol n’est ajoutee — MapLibre s’en charge', () => {
  // La regression a garder : Atlas ajoutait l'altitude du sol qu'il sondait,
  // alors que MapLibre drape deja l'extrusion sommet par sommet. Elle etait
  // comptee deux fois, et chaque volume souleve de sa propre altitude — de
  // 85 m a 245 m sur le transect des Aygalades. Verifie a l'ecran : mettre ce
  // decalage a zero pose les volumes sur le sol.
  const { base, height } = extrusionExpressions(0, 12);
  assert.equal(base, 0, 'la base est celle que l’auteur a declaree, sans ajout');
  assert.deepEqual(height, ['+', 0, ['max', 12, EPAISSEUR_MIN_M]]);
  const texte = JSON.stringify([base, height]);
  for (const trace of ['_sol', '_solHaut', 'coalesce']) {
    assert.ok(!texte.includes(trace), `plus aucune trace de ${trace}`);
  }
});

test('le sommet inclut la base', () => {
  // Une entite a base 3 et hauteur 12 mesure 12 m d'epaisseur au-dessus de
  // 3 m, donc son sommet est a 15. Les deux branches d'origine ne s'accordaient
  // pas la-dessus ; sans base declaree — le cas courant — l'ecart ne se voyait
  // pas.
  const { base, height } = extrusionExpressions(3, 12);
  assert.equal(base, 3);
  assert.deepEqual(height, ['+', 3, ['max', 12, EPAISSEUR_MIN_M]]);
});

test('une hauteur graduee reste composable', () => {
  const graduee = ['interpolate', ['linear'], ['get', 'nb_bat'], 0, 2, 134, 40];
  const { height } = extrusionExpressions(0, graduee);
  assert.deepEqual(height, ['+', 0, ['max', graduee, EPAISSEUR_MIN_M]]);
});

/* ---------- epaisseur plancher ---------- */

test('une epaisseur nulle est relevee au plancher', () => {
  // Cas reel CRESO : la hauteur est graduee de 0 a 500 m sur ln(nb_bat+1). Les
  // mailles a nb_bat = 1 recevaient une epaisseur ZERO — faces superieure et
  // inferieure confondues, donc scintillement qu'aucun calage ne corrige.
  const { height } = extrusionExpressions(0, 0);
  assert.deepEqual(height, ['+', 0, ['max', 0, EPAISSEUR_MIN_M]]);
  assert.ok(EPAISSEUR_MIN_M > 0);
});

test('le plancher n’ecrase pas les hauteurs reelles', () => {
  // Assez peu pour que la plus petite classe d'une graduation reste la plus
  // basse : le plancher departage deux faces, il ne fausse pas la lecture.
  assert.ok(EPAISSEUR_MIN_M <= 1);
});

test('aucune sous-expression de zoom dans les expressions produites', () => {
  // MapLibre n'autorise ["zoom"] qu'a la racine d'une expression de propriete.
  // Imbriquee, elle invalide l'expression entiere — et `setPaintProperty` la
  // rejette SANS RIEN SIGNALER, la propriete retombant a son defaut.
  const { base, height } = extrusionExpressions(0, ['get', 'h']);
  assert.ok(!JSON.stringify([base, height]).includes('"zoom"'));
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

