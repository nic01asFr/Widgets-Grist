import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { luminairesHorsScene } from '../lib/eclairage-rendu.js';

/**
 * Un changement de fond (`setStyle`) recrée la scène three.js dans `onAdd`,
 * sans que MapLibre appelle `onRemove` : les luminaires restaient accrochés à
 * l'ancienne scène, qui n'est plus rendue. Mesuré le 24/09/2026 (Jarret, relief
 * LiDAR HD, 22 h) : 95 luminaires allumés avant `setBasemap('positron')`, plus
 * aucun à l'écran après.
 */
describe('éclairage — la scène change sous les luminaires', () => {
  const ancienne = { id: 'ancienne' };
  const nouvelle = { id: 'nouvelle' };

  it('racine accrochée à une autre scène : à reconstruire', () => {
    assert.equal(luminairesHorsScene({ racine: { parent: ancienne } }, nouvelle), true);
  });

  it('racine dans la scène rendue : rien à faire', () => {
    assert.equal(luminairesHorsScene({ racine: { parent: nouvelle } }, nouvelle), false);
  });

  it('racine détachée : à reconstruire', () => {
    assert.equal(luminairesHorsScene({ racine: { parent: null } }, nouvelle), true);
  });

  it('pas encore de luminaires, ou pas de scène : rien à faire', () => {
    assert.equal(luminairesHorsScene(null, nouvelle), false);
    assert.equal(luminairesHorsScene({ racine: { parent: ancienne } }, null), false);
  });
});
