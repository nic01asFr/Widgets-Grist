import test from 'node:test';
import assert from 'node:assert/strict';
import { seuilDecoupe, cheminTranscodeur, TRANSCODEUR_CDN } from '../lib/gltf-chargeur.js';

test('un feuillage MASK garde le seuil que GLTFLoader a pose', () => {
  assert.equal(seuilDecoupe({ alphaTest: 0.5 }), 0.5);
  assert.equal(seuilDecoupe({ alphaTest: 0.3 }), 0.3);
});

test('un materiau opaque ou BLEND reste sans decoupe, comme avant', () => {
  // GLTFLoader ne pose alphaTest que pour MASK : BLEND arrive a 0.
  assert.equal(seuilDecoupe({ alphaTest: 0 }), 0);
  assert.equal(seuilDecoupe({}), 0);
  assert.equal(seuilDecoupe(null), 0);
});

test('un seuil aberrant ne fait pas disparaitre le modele', () => {
  // alphaTest >= 1 jette tous les pixels : le modele serait invisible.
  assert.equal(seuilDecoupe({ alphaTest: 1 }), 0);
  assert.equal(seuilDecoupe({ alphaTest: NaN }), 0);
  assert.equal(seuilDecoupe({ alphaTest: -0.2 }), 0);
});

test('le transcodeur suit la carte d import : CDN en widget, local dans l application', () => {
  const cdn = (s) => 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/' + s.slice('three/addons/'.length);
  assert.equal(cheminTranscodeur(cdn), TRANSCODEUR_CDN);
  const appli = (s) => 'https://localhost/vendor/three-addons/' + s.slice('three/addons/'.length);
  assert.equal(cheminTranscodeur(appli), 'https://localhost/vendor/three-addons/libs/basis/');
});

test('sans carte d import lisible, repli sur le CDN', () => {
  assert.equal(cheminTranscodeur(undefined), TRANSCODEUR_CDN);
  assert.equal(cheminTranscodeur(() => { throw new TypeError('non resolu'); }), TRANSCODEUR_CDN);
  // Un specificateur nu non mappe revient tel quel : ce n'est pas une URL.
  assert.equal(cheminTranscodeur((s) => s), TRANSCODEUR_CDN);
});
