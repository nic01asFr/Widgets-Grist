/**
 * Tests de la mise à plat avant l'import OSM.
 * node --test "projects/Atlas/tests/vue-import.test.js"
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { doitMettreAPlat, mettreAPlat, INCLINAISON_TOLEREE } from '../lib/vue-import.js';

function carteSimulee(inclinaison, { emetMoveend = true } = {}) {
  const ecouteurs = {};
  const appels = [];
  return {
    appels,
    getPitch: () => inclinaison,
    once(type, fn) { ecouteurs[type] = fn; },
    easeTo(opts) {
      appels.push(opts);
      inclinaison = opts.pitch;
      if (emetMoveend) setTimeout(() => ecouteurs.moveend?.(), 5);
    },
  };
}

describe('doitMettreAPlat', () => {
  it('une vue inclinée doit être mise à plat', () => {
    assert.equal(doitMettreAPlat(55), true);
    assert.equal(doitMettreAPlat(INCLINAISON_TOLEREE + 0.1), true);
  });

  it('une vue à plat, ou presque, reste telle quelle', () => {
    assert.equal(doitMettreAPlat(0), false);
    assert.equal(doitMettreAPlat(INCLINAISON_TOLEREE), false);
  });

  it('une mesure absente ne déclenche rien', () => {
    assert.equal(doitMettreAPlat(undefined), false);
    assert.equal(doitMettreAPlat('penche'), false);
  });
});

describe('mettreAPlat', () => {
  it('remet l’inclinaison à zéro, sans toucher à l’orientation', async () => {
    const carte = carteSimulee(55);
    assert.equal(await mettreAPlat(carte, { duree: 10 }), true);
    assert.deepEqual(carte.appels, [{ pitch: 0, duration: 10 }]);
    assert.ok(!('bearing' in carte.appels[0]), 'l’orientation reste');
  });

  it('ne bouge pas une vue déjà à plat', async () => {
    const carte = carteSimulee(0);
    assert.equal(await mettreAPlat(carte), false);
    assert.equal(carte.appels.length, 0);
  });

  it('ne reste jamais suspendue si moveend ne vient pas', async () => {
    const carte = carteSimulee(40, { emetMoveend: false });
    assert.equal(await mettreAPlat(carte, { duree: 10 }), true);
  });

  it('sans carte, rien à faire', async () => {
    assert.equal(await mettreAPlat(null), false);
  });
});
