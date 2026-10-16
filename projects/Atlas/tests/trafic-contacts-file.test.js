// node --test tests/trafic-contacts*.test.js   (aucun acces reseau)
// Contacts résiduels : la file d'attente par voie (mesurée contre l'ancien réglage).
const test = require('node:test'), assert = require('node:assert/strict');
const { T, G, pas, moy, ANCIEN, mesure } = require('./aide-trafic-contacts.js');

test('file d attente par voie (premier arrive, premier servi) : sans elle, les vehicules de queue bloquent ceux de tete (impasses, contacts)', () => {
  const avec = mesure({}), sans = mesure({ file: false });
  assert.ok(sans.forces >= avec.forces * 3, 'arbitrages forces ' + sans.forces + ' sans file contre ' + avec.forces + ' avec');
  assert.ok(sans.contacts >= avec.contacts * 1.8, 'contacts ' + sans.contacts + ' sans file contre ' + avec.contacts + ' avec');
  assert.ok(avec.vitesse > sans.vitesse * 1.1, 'vitesse ' + avec.vitesse.toFixed(1) + ' contre ' + sans.vitesse.toFixed(1) + ' km/h');
});

