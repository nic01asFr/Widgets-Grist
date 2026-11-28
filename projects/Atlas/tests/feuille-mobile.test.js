import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANCRAGES, VITESSE_FRANCHE, ancrageApresGeste, ancragePlusProche,
  fractionPendantGeste, gestePourLaFeuille, ancrageApresOnglet,
} from '../lib/feuille-mobile.js';

/* ---------- ou la feuille s'arrete ---------- */

test('un coup de pouce vers le bas referme, sans avoir a parcourir l’ecran', () => {
  // C'est le geste qui remplace l'ancien onglet « Carte ». Exiger la distance
  // le rendrait penible a repeter.
  const a = ancrageApresGeste({ depart: 'demi', fraction: 0.48, vitesse: -1.4 });
  assert.equal(a, 'fermee');
});

test('depuis la position pleine, le meme geste ne referme pas d’un coup', () => {
  // Un cran a la fois : sinon on perd le panneau en voulant seulement voir la
  // carte derriere.
  assert.equal(ancrageApresGeste({ depart: 'pleine', fraction: 0.9, vitesse: -1.4 }), 'demi');
});

test('un geste vif vers le haut deploie', () => {
  assert.equal(ancrageApresGeste({ depart: 'demi', fraction: 0.55, vitesse: 1.4 }), 'pleine');
  assert.equal(ancrageApresGeste({ depart: 'pleine', fraction: 0.92, vitesse: 1.4 }), 'pleine',
    'rien au-dessus de pleine');
});

test('un deplacement lent s’arrete a la position la plus proche', () => {
  // La main cherche une hauteur : on la lui accorde, sans interpreter.
  assert.equal(ancrageApresGeste({ depart: 'pleine', fraction: 0.60, vitesse: -0.2 }), 'demi');
  assert.equal(ancrageApresGeste({ depart: 'demi', fraction: 0.12, vitesse: -0.1 }), 'fermee');
  assert.equal(ancrageApresGeste({ depart: 'demi', fraction: 0.80, vitesse: 0.1 }), 'pleine');
});

test('le seuil de vitesse separe les deux lectures', () => {
  const juste = { depart: 'demi', fraction: 0.50 };
  assert.equal(ancrageApresGeste({ ...juste, vitesse: -(VITESSE_FRANCHE - 0.01) }), 'demi',
    'sous le seuil : la position atteinte decide');
  assert.equal(ancrageApresGeste({ ...juste, vitesse: -VITESSE_FRANCHE }), 'fermee',
    'au seuil : l’intention decide');
});

test('sans geste, la feuille ne bouge pas', () => {
  assert.equal(ancrageApresGeste({ depart: 'demi', fraction: ANCRAGES.demi, vitesse: 0 }), 'demi');
});

test('ancragePlusProche couvre toute la course', () => {
  assert.equal(ancragePlusProche(0), 'fermee');
  assert.equal(ancragePlusProche(1), 'pleine');
  assert.equal(ancragePlusProche(ANCRAGES.demi), 'demi');
});

/* ---------- la feuille pendant le geste ---------- */

test('la feuille suit le doigt, sans se decoller du bord', () => {
  const h = 800;
  assert.ok(Math.abs(fractionPendantGeste('demi', 80, h) - (ANCRAGES.demi - 0.1)) < 1e-9,
    'vers le bas, elle descend');
  assert.equal(fractionPendantGeste('pleine', -400, h), ANCRAGES.pleine,
    'vers le haut, elle bute sur la position pleine');
  assert.equal(fractionPendantGeste('demi', 5000, h), 0, 'elle ne descend pas sous l’ecran');
});

test('une hauteur d’ecran inconnue ne fait pas sauter la feuille', () => {
  assert.equal(fractionPendantGeste('demi', 100, 0), ANCRAGES.demi);
});

/* ---------- a qui appartient le geste ---------- */

test('la poignee appartient toujours a la feuille', () => {
  assert.equal(gestePourLaFeuille({ surPoignee: true, defilement: 300, versLeBas: false }), true);
});

test('une liste a moitie defilee garde son geste', () => {
  // Sans cette regle, lire la liste des couches refermerait le panneau.
  assert.equal(gestePourLaFeuille({ surPoignee: false, defilement: 120, versLeBas: true }), false);
});

test('en haut de liste, tirer vers le bas rend la main a la feuille', () => {
  assert.equal(gestePourLaFeuille({ surPoignee: false, defilement: 0, versLeBas: true }), true);
  assert.equal(gestePourLaFeuille({ surPoignee: false, defilement: 0, versLeBas: false }), false,
    'vers le haut, c’est encore le contenu qui defile');
});

/* ---------- l’onglet ---------- */

test('toucher l’onglet actif referme, et le rouvre ensuite', () => {
  // Ce va-et-vient remplace l'onglet « Carte » : un onglet de moins, et la
  // carte se decouvre la ou le doigt se trouve deja.
  assert.equal(ancrageApresOnglet({ ongletActif: 'couches', onglet: 'couches', position: 'demi' }), 'fermee');
  assert.equal(ancrageApresOnglet({ ongletActif: 'couches', onglet: 'couches', position: 'pleine' }), 'fermee');
  assert.equal(ancrageApresOnglet({ ongletActif: 'couches', onglet: 'couches', position: 'fermee' }), 'demi');
});

test('changer d’onglet ouvre a mi-hauteur, jamais en plein ecran', () => {
  // La carte reste visible : c'est elle le sujet, le panneau l'accompagne.
  assert.equal(ancrageApresOnglet({ ongletActif: 'couches', onglet: 'recit', position: 'pleine' }), 'demi');
});

/* ---------- ou se tient la fiche d'une saisie ---------- */

import { positionFicheSaisie } from '../lib/feuille-mobile.js';

test('en attente de pose, la fiche prend la hauteur de son contenu', () => {
  // Elle n'a qu'une consigne a montrer : mi-hauteur ou pleine hauteur cachaient la carte ou l'on touche.
  assert.equal(positionFicheSaisie({ attentePose: true, position: 'demi' }), 'compacte');
  assert.equal(positionFicheSaisie({ attentePose: true, position: 'pleine' }), 'compacte', 'saisie en serie apres un clavier');
  assert.equal(positionFicheSaisie({ attentePose: true, position: 'compacte' }), 'compacte');
});

test('une fiche fermee reste fermee', () => {
  assert.equal(positionFicheSaisie({ attentePose: true, position: 'fermee' }), 'fermee');
  assert.equal(positionFicheSaisie({ attentePose: false, position: 'fermee' }), 'fermee');
});

test('la geometrie posee, le formulaire sort de la position compacte, sans toucher aux autres', () => {
  assert.equal(positionFicheSaisie({ attentePose: false, position: 'compacte' }), 'demi');
  assert.equal(positionFicheSaisie({ attentePose: false, position: 'demi' }), 'demi');
  assert.equal(positionFicheSaisie({ attentePose: false, position: 'pleine' }), 'pleine', 'le clavier garde la pleine hauteur');
});

test('la position compacte est plus basse que mi-hauteur et hors de l’ordre des gestes', () => {
  assert.ok(ANCRAGES.compacte > ANCRAGES.fermee && ANCRAGES.compacte < ANCRAGES.demi);
  // Un geste lent qui s'arrete pres d'elle retombe sur une position de l'ordre, jamais sur elle.
  assert.ok(['fermee', 'demi', 'pleine'].includes(ancragePlusProche(ANCRAGES.compacte)));
});

import { pourLeDoigt } from '../lib/feuille-mobile.js';

test('au doigt, « cliquez » devient « touchez », avec ou sans majuscule', () => {
  assert.equal(pourLeDoigt('Cliquez sur la carte pour placer le point.', true), 'Touchez la carte pour placer le point.');
  assert.equal(pourLeDoigt('Cliquez ailleurs sur la carte', true), 'Touchez ailleurs sur la carte');
  assert.equal(pourLeDoigt('Cliquez ; puis cliquez le premier sommet', true), 'Touchez ; puis touchez le premier sommet');
});

test('à la souris, le texte ne change pas', () => {
  assert.equal(pourLeDoigt('Cliquez sur la carte', false), 'Cliquez sur la carte');
});
