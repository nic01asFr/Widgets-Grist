'use strict';

/**
 * La dérivation des graines : `shared/derivation-valeurs.js` est une COPIE MÉCANIQUE du module du kit. Ces tests gardent la copie : mêmes empreintes que celles de
 * l'en-tête, et les 126 vecteurs du kit rejoués (valeurs et liste `derive` à l'identique ; refus : mêmes portes en échec).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const D = require('../shared/derivation-valeurs.js');
const FICHIER = fs.readFileSync(path.join(__dirname, '..', 'shared', 'derivation-valeurs.js'), 'utf8');
const BRUT = fs.readFileSync(path.join(__dirname, 'fixtures', 'themedef-derivation.vecteurs.json'));
const VEC = JSON.parse(BRUT.toString('utf8'));

describe('Dérivation des graines : la copie du kit est intacte', () => {
  it('les vecteurs sont ceux de l\'empreinte inscrite dans l\'en-tête de la copie', () => {
    const inscrite = /vecteurs sha256 ([0-9a-f]{64})/.exec(FICHIER);
    assert.ok(inscrite);
    assert.equal(crypto.createHash('sha256').update(BRUT).digest('hex'), inscrite[1]);
  });

  it('la copie n\'importe rien et ne touche ni au DOM ni au réseau', () => {
    const code = FICHIER.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/^\s*import\s/m.test(code));
    assert.ok(!/document\.|window\.|fetch\(|XMLHttpRequest|localStorage/.test(code));
  });

  it('expose seulement deriverValeurs', () => {
    assert.deepEqual(Object.keys(D), ['deriverValeurs']);
  });
});

describe('Dérivation des graines : les vecteurs du kit, rejoués', () => {
  it('le fichier porte 126 cas', () => {
    assert.equal(VEC.cas.length, 126);
  });

  for (const c of VEC.cas) {
    it(c.id, () => {
      const r = D.deriverValeurs({ ...c.graines, mode: c.mode });
      assert.equal(r.ok, c.attendu.ok);
      if (c.attendu.ok) {
        assert.deepEqual(r.valeurs, c.attendu.valeurs);
        assert.deepEqual(r.derive, c.attendu.derive);
        assert.deepEqual(r.echecs, []);
      } else {
        assert.equal(r.valeurs, null);
        // le kit liste les portes dans l'ordre alphabétique, la copie dans l'ordre de calcul : même ensemble
        assert.deepEqual(r.echecs.map((e) => e.porte || e.code).sort(), [...c.attendu.portes].sort());
      }
    });
  }

  it('une entrée absurde ne lève jamais d\'exception', () => {
    for (const x of [undefined, null, 42, 'x', {}, { principal: 12 }, { principal: '#zzzzzz', mode: 'clair' }, { principal: '#336699', mode: 'autre' }]) {
      assert.doesNotThrow(() => D.deriverValeurs(x));
      assert.equal(D.deriverValeurs(x).ok, false);
    }
  });
});
