/**
 * Une couche de dalles 3D envoyée à la carte NUE (profil BI, sans three.js) est refusée seule, avec ce qu'il faut changer, au lieu de répondre `0` sans un mot.
 * node --test projects/Atlas/tests/bi-dalles-carte-nue.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { carteSimulee, point } from './aide-carte-bi.js';

const COUCHE_DALLES = { id: 'maquette', name: 'Maquette 3D', type: 'dalles3d', dalles3d: { grille: 'https://serveur.example/api/atlas/grille3d.json' } };
const COUCHE_POINTS = { id: 'sites', name: 'Sites', geometry_type: 'point', cle: 'ref' };
const SITES = [point(5.1, 43.2, { ref: 'A' }, 1), point(5.2, 43.3, { ref: 'B' }, 2)];

test('carte nue : une couche dalles3d est refusée avec le profil complet et la version de scène à demander, et n\'est pas comptée à 0', async () => {
  const rt = attacher(carteSimulee());
  const r = await rt.api.setScene({ layers: [COUCHE_DALLES] }, {});
  assert.ok(r._erreurs && r._erreurs.maquette, 'une erreur pour la couche');
  assert.match(r._erreurs.maquette, /^capacite_absente/);
  assert.match(r._erreurs.maquette, /profil="complet"/);
  assert.match(r._erreurs.maquette, /0\.2\.2/);
  assert.ok(!('maquette' in r), 'pas de compte 0 : la couche n\'existe pas dans la carte nue');
});

test('carte nue : le refus est propre à la couche de dalles, les autres couches de la scène se montent', async () => {
  const rt = attacher(carteSimulee());
  const r = await rt.api.setScene({ layers: [COUCHE_POINTS, COUCHE_DALLES] }, { sites: SITES });
  assert.equal(r.sites, 2, 'la couche de points est montée');
  assert.ok(r._erreurs.maquette && !r._erreurs.sites);
});

test('carte nue : sans couche de dalles, rien ne change', async () => {
  const rt = attacher(carteSimulee());
  const r = await rt.api.setScene({ layers: [COUCHE_POINTS] }, { sites: SITES });
  assert.equal(r.sites, 2); assert.ok(!r._erreurs);
});
