// node --test tests/trafic-contacts*.test.js   (aucun acces reseau)
// Contacts résiduels : l'impatience (créneau accepté de plus en plus court).
const test = require('node:test'), assert = require('node:assert/strict');
const { T, G, pas, moy, ANCIEN, mesure } = require('./aide-trafic-contacts.js');

test('impatience : plus on attend, plus le creneau accepte est court (jusqu\'a la marge minimale)', () => {
  const sim = T.creer(G, { graine: 1, N: 10, patience: 25, marge: 2.5, margeMin: 1 }), c = sim.c;
  const marge = (att) => Math.max(c.margeMin, c.marge - att * (c.marge - c.margeMin) / c.patience);
  assert.equal(marge(0), 2.5); assert.ok(Math.abs(marge(12.5) - 1.75) < 1e-9); assert.equal(marge(60), 1);
  const avec = mesure({ patience: 25 }), sans = mesure({ patience: 0 });
  assert.ok(avec.forces <= sans.forces + 2, 'l\'impatience ne cree pas d\'arbitrage force : ' + avec.forces + ' contre ' + sans.forces);
});

