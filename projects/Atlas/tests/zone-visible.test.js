import test from 'node:test';
import assert from 'node:assert/strict';
import { deplacementPourVoir, margesCarte, dureeRestante, zoomPourEcran, deplacementPourCentrer, ECRAN_REF } from '../lib/viewport.js';

const carte = { largeur: 756, hauteur: 700 };

test('un objet déjà visible ne fait pas bouger la carte', () => {
  assert.deepEqual(deplacementPourVoir({ emprise: { minX: 100, minY: 100, maxX: 300, maxY: 300 }, carte, marge: 20 }),
    { dx: 0, dy: 0, cadrer: false });
});

test('un objet passé sous la fiche revient juste ce qu’il faut', () => {
  // Mesure de l'audit : îlot cliqué à 100 px du bord, la fiche retire 360 px.
  const r = deplacementPourVoir({ emprise: { minX: 700, minY: 300, maxX: 836, maxY: 360 }, carte, marge: 20 });
  assert.deepEqual(r, { dx: 836 - (756 - 20), dy: 0, cadrer: false });
  // À gauche et en haut : déplacement négatif.
  assert.deepEqual(deplacementPourVoir({ emprise: { minX: -50, minY: -10, maxX: 40, maxY: 30 }, carte, marge: 10 }),
    { dx: -60, dy: -20, cadrer: false });
});

test('les marges comptent : sur téléphone, sous la feuille n’est pas visible', () => {
  const r = deplacementPourVoir({
    emprise: { minX: 150, minY: 500, maxX: 200, maxY: 540 },
    carte: { largeur: 390, hauteur: 844 }, marges: { bottom: 495 }, marge: 16,
  });
  assert.equal(r.cadrer, false);
  assert.equal(r.dy, 540 - (844 - 495 - 16));
});

test('un objet plus grand que la zone demande un cadrage', () => {
  assert.equal(deplacementPourVoir({ emprise: { minX: 0, minY: 0, maxX: 900, maxY: 50 }, carte }).cadrer, true);
  assert.equal(deplacementPourVoir({ emprise: { minX: 0, minY: 0, maxX: 10, maxY: 10 }, carte: { largeur: 30, hauteur: 30 }, marge: 20 }).cadrer, true);
  assert.deepEqual(deplacementPourVoir({ emprise: { minX: NaN } , carte }), { dx: 0, dy: 0, cadrer: false });
});

test('les marges de carte : feuille, barre du bas et bulle, la plus haute l’emporte', () => {
  // Chiffres de l'audit : écran 844, feuille à mi-hauteur (0,52), barre de 56.
  assert.equal(margesCarte({ hauteurCarte: 844, feuilles: [], barreBas: 56 }).bottom, 56);
  assert.equal(margesCarte({ hauteurCarte: 844, feuilles: [0.52], barreBas: 56 }).bottom, Math.round(56 + 0.52 * 844));
  assert.equal(margesCarte({ hauteurCarte: 844, feuilles: [0, 0.52, 0.3], barreBas: 56 }).bottom, Math.round(56 + 0.52 * 844));
  // Récit : la bulle plus haute que la barre l'emporte ; pas de somme.
  assert.equal(margesCarte({ hauteurCarte: 900, bulle: 190 }).bottom, 190);
  assert.equal(margesCarte({ hauteurCarte: 844, feuilles: [0.52], barreBas: 56, bulle: 190 }).bottom, Math.round(56 + 0.52 * 844));
  // Feuille pleine : il reste toujours de quoi viser.
  assert.equal(margesCarte({ hauteurCarte: 844, feuilles: [0.92], barreBas: 56 }).bottom, 844 - 120);
  assert.deepEqual(margesCarte(), { top: 0, right: 0, left: 0, bottom: 0 });
});

test('la durée restante d’une animation', () => {
  assert.equal(dureeRestante({ debut: 1000, duree: 800, maintenant: 1150 }), 650);
  assert.equal(dureeRestante({ debut: 1000, duree: 800, maintenant: 2000 }), 0);
  assert.equal(dureeRestante({ debut: undefined, duree: 800, maintenant: 2000 }), 0);
});

test('sur une carte étroite, le module cède la place à la fiche', async () => {
  const { moduleCedeALaFiche } = await import('../lib/viewport.js');
  // Bureau 1440 : rail 64 + module 260 → carte 1116 ; avec la fiche : 756.
  assert.equal(moduleCedeALaFiche({ largeurCarte: 1116, largeurFiche: 360 }), false);
  // Tablette portrait 820 : carte 496 avec le module ; 136 avec la fiche.
  assert.equal(moduleCedeALaFiche({ largeurCarte: 496, largeurFiche: 360 }), true);
  assert.equal(moduleCedeALaFiche({ largeurCarte: NaN, largeurFiche: 360 }), false);
});

test('zoomPourEcran — une vue d’auteur sur un autre ecran : un telephone recule du rapport des ecrans, sur le cote le plus contraint', () => {
  // 390 x 600 contre 1100 x 700 : la largeur contraint (0,355) -> log2(2,82) = 1,5 niveau.
  assert.equal(zoomPourEcran(8.5, { largeur: 390, hauteur: 600 }), 7);
});
test('zoomPourEcran — une vue d’auteur sur un autre ecran : un grand ecran garde le zoom de l’auteur : on ne zoome jamais plus', () => {
  assert.equal(zoomPourEcran(8.5, { largeur: 1900, hauteur: 1000 }), 8.5);
  assert.equal(zoomPourEcran(8.5, { largeur: ECRAN_REF.largeur, hauteur: ECRAN_REF.hauteur }), 8.5);
});
test('zoomPourEcran — une vue d’auteur sur un autre ecran : l’ecran de l’auteur, quand la vue le dit, remplace celui de bureau', () => {
  // Composee sur un telephone (390 x 700) et rejouee sur un telephone : rien ne change.
  assert.equal(zoomPourEcran(12, { largeur: 390, hauteur: 700, ref: { largeur: 390, hauteur: 700 } }), 12);
  // Composee sur un telephone, rejouee sur une tablette plus grande : on garde le zoom.
  assert.equal(zoomPourEcran(12, { largeur: 800, hauteur: 1000, ref: { largeur: 390, hauteur: 700 } }), 12);
});
test('zoomPourEcran — une vue d’auteur sur un autre ecran : le recul est borne, et sans mesure rien ne bouge', () => {
  assert.equal(zoomPourEcran(10, { largeur: 40, hauteur: 600 }), 7);
  assert.equal(zoomPourEcran(10, {}), 10);
  assert.equal(zoomPourEcran(10, { largeur: 0, hauteur: 600 }), 10);
  assert.equal(zoomPourEcran(undefined, { largeur: 390, hauteur: 600 }), undefined);
});

test('deplacementPourCentrer — l’objet et sa bulle au centre de la zone visible : amene le centre de l’emprise au centre de la zone que les feuilles ne recouvrent pas', () => {
  // Carte 400 x 800, feuille de 300 px en bas, pastilles de 70 px en haut : zone visible = 70 -> 500, centre 285.
  const r = deplacementPourCentrer({ emprise: { minX: 100, minY: 100, maxX: 300, maxY: 300 }, carte: { largeur: 400, hauteur: 800 }, marges: { top: 70, bottom: 300 } });
  assert.deepEqual(r, { dx: 0, dy: -85 });
});
test('deplacementPourCentrer — l’objet et sa bulle au centre de la zone visible : recentre aussi ce qui etait deja visible, et gere les marges laterales', () => {
  const r = deplacementPourCentrer({ emprise: { minX: 0, minY: 0, maxX: 100, maxY: 100 }, carte: { largeur: 400, hauteur: 400 }, marges: { left: 100 } });
  assert.deepEqual(r, { dx: -200, dy: -150 });
});
test('deplacementPourCentrer — l’objet et sa bulle au centre de la zone visible : sans emprise ou sans zone, ne bouge pas', () => {
  assert.deepEqual(deplacementPourCentrer({}), { dx: 0, dy: 0 });
  assert.deepEqual(deplacementPourCentrer({ emprise: { minX: 0, minY: 0, maxX: 10, maxY: 10 }, carte: { largeur: 100, hauteur: 100 }, marges: { top: 60, bottom: 60 } }), { dx: 0, dy: 0 });
});
