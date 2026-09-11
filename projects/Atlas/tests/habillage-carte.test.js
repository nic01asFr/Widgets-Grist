/**
 * Tests de l'habillage de la carte (étage du bas, pastille de localisation).
 * node --test "projects/Atlas/tests/habillage-carte.test.js"
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ETAGE,
  largeurMinCoteACote,
  etageCoteACote,
  margeBasseRecit,
  pastilleLocalisationRequise,
} from '../lib/habillage-carte.js';

describe('etageCoteACote — légende et bulle se partagent le bas', () => {
  it('le seuil additionne marges, légende, gouttière et bulle minimale', () => {
    assert.equal(largeurMinCoteACote(), 24 + 220 + 16 + 360 + 24);
    assert.equal(largeurMinCoteACote(), 644);
  });

  it('tient côte à côte dans le widget Grist mesuré (860 px)', () => {
    // La largeur de la capture qui a motivé l'étage : la bulle y mordait sur
    // la légende, remontée à mi-carte pour lui céder la place.
    assert.equal(etageCoteACote({ largeurCarte: 860 }), true);
  });

  it('tient encore à la limite du mode bureau (721 px)', () => {
    assert.equal(etageCoteACote({ largeurCarte: 721 }), true);
  });

  it('empile quand la carte est trop étroite, même dans une grande fenêtre', () => {
    // En édition, rail et panneaux ouverts : la fenêtre ne dit rien.
    assert.equal(etageCoteACote({ largeurCarte: 600 }), false);
    assert.equal(etageCoteACote({ largeurCarte: largeurMinCoteACote() - 1 }), false);
    assert.equal(etageCoteACote({ largeurCarte: largeurMinCoteACote() }), true);
  });

  it('ne s’applique jamais sur mobile, qui a ses propres ancrages', () => {
    assert.equal(etageCoteACote({ largeurCarte: 1200, mobile: true }), false);
  });

  it('refuse une mesure absente', () => {
    assert.equal(etageCoteACote({}), false);
    assert.equal(etageCoteACote(), false);
    assert.equal(etageCoteACote({ largeurCarte: 'large' }), false);
  });

  it('les mesures sont figées', () => {
    assert.throws(() => { ETAGE.legende = 300; });
  });
});

describe('margeBasseRecit — la caméra vise ce que la bulle laisse voir', () => {
  it('distance du bas de la carte au haut de la bulle, plus la respiration', () => {
    // Carte de 100 à 800 à l'écran, bulle dont le haut est à 640 : 160 + 12.
    assert.equal(margeBasseRecit({ basCarte: 800, hautBulle: 640, hauteurCarte: 700 }), 172);
  });

  it('respiration réglable', () => {
    assert.equal(margeBasseRecit({ basCarte: 800, hautBulle: 640, hauteurCarte: 700, respiration: 0 }), 160);
  });

  it('bornée à 60 % de la hauteur de la carte', () => {
    assert.equal(margeBasseRecit({ basCarte: 400, hautBulle: 50, hauteurCarte: 400 }), 240);
  });

  it('nulle quand la bulle n’atteint pas la carte', () => {
    assert.equal(margeBasseRecit({ basCarte: 800, hautBulle: 900, hauteurCarte: 700 }), 0);
  });

  it('nulle sans mesure exploitable — pas de bulle, pas de marge', () => {
    assert.equal(margeBasseRecit({}), 0);
    assert.equal(margeBasseRecit(), 0);
    assert.equal(margeBasseRecit({ basCarte: 800, hautBulle: 640, hauteurCarte: 0 }), 0);
  });
});

describe('pastilleLocalisationRequise — sur mobile seulement', () => {
  it('paraît sur mobile quand le navigateur sait localiser', () => {
    assert.equal(pastilleLocalisationRequise({ mobile: true, geolocalisation: true }), true);
  });

  it('absente au bureau', () => {
    assert.equal(pastilleLocalisationRequise({ mobile: false, geolocalisation: true }), false);
  });

  it('absente quand le navigateur ne sait pas localiser', () => {
    assert.equal(pastilleLocalisationRequise({ mobile: true, geolocalisation: false }), false);
    assert.equal(pastilleLocalisationRequise(), false);
  });
});
