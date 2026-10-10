// setScene : une couche de polygones de l'hote declarant un choroplethe SANS `admin` est refusee seule, avec un message lisible
// (avant : TypeError « Cannot set properties of undefined (setting 'etatPose') » et setScene entier rejete).
// node --test tests/bi-scene-choroplethe-sans-admin.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { carteSimulee, MANIFESTE, DONNEES } from './aide-carte-bi.js';

const carre = (x, y) => ({ type: 'Feature', id: 1, properties: { valeur: 3, nom: 'A' }, geometry: { type: 'Polygon', coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]] } });

test('setScene : choroplethe sans admin refuse seul et lisiblement, les autres couches se montent', async () => {
  const rt = attacher(carteSimulee());
  const manifeste = { layers: [...MANIFESTE.layers, { id: 'zones', name: 'Zones', geometry_type: 'Polygon', visuel: { type: 'choroplethe', champ: 'valeur' } }] };
  const r = await rt.api.setScene(manifeste, { ...DONNEES, zones: [carre(2, 48)] });
  assert.equal(r.sites, 3, 'la couche de points se monte');
  assert.match(r._erreurs.zones, /choroplethe.*zones.*`admin`/);
  assert.ok(!('zones' in r) || r.zones === undefined);
  assert.deepEqual(rt.api.ping().couches, ['sites']);
});

test('setScene : les memes polygones en cercles, proportionnel ou etats restent acceptes', async () => {
  for (const type of ['cercles', 'proportionnel', 'etats']) {
    const rt = attacher(carteSimulee());
    const manifeste = { layers: [{ id: 'zones', name: 'Zones', geometry_type: 'Polygon', visuel: { type, champ: 'valeur' } }] };
    const r = await rt.api.setScene(manifeste, { zones: [carre(2, 48)] }).catch((e) => ({ echec: e.message }));
    assert.ok(!r.echec, type + ' : ' + r.echec);
    assert.equal(r._erreurs, undefined, type);
  }
});
