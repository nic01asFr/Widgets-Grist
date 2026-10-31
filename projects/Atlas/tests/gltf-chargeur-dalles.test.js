/**
 * Le chargeur glTF d'une maquette en dalles 3D (lib/gltf-chargeur.js, `chargeurDalles`) : meshopt toujours, KTX2 dès que le moteur de rendu est connu.
 * Cas de départ : les GLB de pix2hdr arrivent en `EXT_meshopt_compression` + `KHR_texture_basisu` ; sans KTX2Loader, `GLTFLoader` les refuse.
 * node --test projects/Atlas/tests/gltf-chargeur-dalles.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargeurDalles } from '../lib/gltf-chargeur.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const CHEMIN = 'https://atlas.example/vendor/three/addons/libs/basis/';

/** Des doubles de GLTFLoader et de KTX2Loader qui disent ce qu'on leur a demandé. */
function doubles({ ktx2Leve = null } = {}) {
  const j = { meshopt: null, ktx2Pose: null, transcodeur: null, support: null, dispose: 0, ktx2Crees: 0 };
  class GLTFLoader { setMeshoptDecoder(d) { j.meshopt = d; return this; } setKTX2Loader(k) { j.ktx2Pose = k; return this; } }
  class KTX2Loader {
    constructor() { j.ktx2Crees++; if (ktx2Leve === 'constructeur') throw new Error('boum constructeur'); }
    setTranscoderPath(p) { j.transcodeur = p; return this; }
    detectSupport(r) { if (ktx2Leve === 'support') throw new Error('boum support'); j.support = r; return this; }
    dispose() { j.dispose++; }
  }
  return { j, GLTFLoader, KTX2Loader };
}
const MESHOPT = { decoder: 'meshopt' };

test('avec le moteur de rendu : meshopt ET KTX2 (chemin du transcodeur, détection du GPU), et libération du transcodeur', () => {
  const { j, GLTFLoader, KTX2Loader } = doubles(); const rendu = { rendu: true };
  const l = chargeurDalles({ GLTFLoader, MeshoptDecoder: MESHOPT, KTX2Loader, renderer: rendu, chemin: CHEMIN });
  assert.equal(j.meshopt, MESHOPT);
  assert.ok(j.ktx2Pose instanceof KTX2Loader, 'KTX2Loader branché sur le GLTFLoader');
  assert.equal(j.transcodeur, CHEMIN); assert.equal(j.support, rendu, 'detectSupport reçoit le moteur de rendu');
  assert.equal(j.dispose, 0); l.liberer(); assert.equal(j.dispose, 1); l.liberer(); assert.equal(j.dispose, 2, 'dispose est délégué à chaque appel, la couche ne l\'appelle qu\'une fois');
});

test('sans moteur de rendu : meshopt seul, aucun KTX2Loader créé, liberer est un no-op', () => {
  const { j, GLTFLoader, KTX2Loader } = doubles();
  const l = chargeurDalles({ GLTFLoader, MeshoptDecoder: MESHOPT, KTX2Loader, renderer: null, chemin: CHEMIN });
  assert.equal(j.meshopt, MESHOPT); assert.equal(j.ktx2Crees, 0); assert.equal(j.ktx2Pose, null); assert.doesNotThrow(() => l.liberer());
});

test('sans KTX2Loader fourni : meshopt seul, sans exception', () => {
  const { j, GLTFLoader } = doubles();
  const l = chargeurDalles({ GLTFLoader, MeshoptDecoder: MESHOPT, renderer: {}, chemin: CHEMIN });
  assert.equal(j.meshopt, MESHOPT); assert.equal(j.ktx2Pose, null); assert.doesNotThrow(() => l.liberer());
});

test('KTX2 qui échoue (constructeur ou détection du GPU) : le chargeur reste utilisable pour meshopt, l\'échec est dit une fois', () => {
  for (const etape of ['constructeur', 'support']) {
    const { j, GLTFLoader, KTX2Loader } = doubles({ ktx2Leve: etape }); const dits = [];
    const l = chargeurDalles({ GLTFLoader, MeshoptDecoder: MESHOPT, KTX2Loader, renderer: {}, chemin: CHEMIN, journal: { warn: (m) => dits.push(m) } });
    assert.equal(j.meshopt, MESHOPT, etape); assert.equal(j.ktx2Pose, null, etape + ' : KTX2 non branché');
    assert.equal(dits.length, 1); assert.match(dits[0], /^KTX2 indisponible pour les dalles : boum /); assert.doesNotThrow(() => l.liberer());
  }
});

test('câblage : l\'application construit le chargeur des dalles par chargeurDalles, avec le moteur de rendu et le transcodeur de la carte d\'import', () => {
  const app = fs.readFileSync(path.join(ICI, '..', 'app_v7.js'), 'utf8');
  assert.match(app, /creerChargeur: \(renderer\) => chargeurDalles\(\{ GLTFLoader, MeshoptDecoder, KTX2Loader, renderer, chemin: cheminTranscodeur\(/);
  assert.ok(!/creerChargeur: \(\) => \{ const l = new GLTFLoader\(\); l\.setMeshoptDecoder/.test(app), 'l\'ancien chargeur sans KTX2 a disparu');
});
