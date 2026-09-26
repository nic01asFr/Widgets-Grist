import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cameraStorageKey,
  savedCameraNearBounds,
  shouldAutoFitInitialBounds,
} from '../lib/viewport.js';

const BEES_BOUNDS = [[9.252, 46.805], [9.258, 46.808]];
const TOULOUSE = { lng: 1.4437, lat: 43.6043, zoom: 16 };

describe('viewport — centrage initial', () => {
  it('cameraStorageKey scope par projet', () => {
    assert.equal(cameraStorageKey('qfield_bees.zip'), 'atlas_v7_camera_qfield_bees_zip');
  });

  it('caméra Toulouse loin des données bees → pas near bounds', () => {
    const mem = new Map([['atlas_v7_camera_qfield_bees_zip', JSON.stringify(TOULOUSE)]]);
    const storage = { getItem: (k) => mem.get(k) ?? null };
    assert.equal(
      savedCameraNearBounds(BEES_BOUNDS, 'atlas_v7_camera_qfield_bees_zip', storage),
      false,
    );
    assert.equal(
      shouldAutoFitInitialBounds(BEES_BOUNDS, 'atlas_v7_camera_qfield_bees_zip', storage),
      true,
    );
  });

  it('caméra proche des données → conserve navigation', () => {
    const near = { lng: 9.255, lat: 46.8065, zoom: 14 };
    const mem = new Map([['atlas_v7_camera_qfield_bees_zip', JSON.stringify(near)]]);
    const storage = { getItem: (k) => mem.get(k) ?? null };
    assert.equal(
      savedCameraNearBounds(BEES_BOUNDS, 'atlas_v7_camera_qfield_bees_zip', storage),
      true,
    );
    assert.equal(
      shouldAutoFitInitialBounds(BEES_BOUNDS, 'atlas_v7_camera_qfield_bees_zip', storage),
      false,
    );
  });
});

describe('positionCameraMetres — la caméra sans getFreeCameraOptions', async () => {
  const { positionCameraMetres, distanceCameraObjet } = await import('../lib/viewport.js');

  it('vue verticale : hauteur = distance caméra → centre à l’échelle du centre', () => {
    // z18 à l'équateur : 512 · 2^18 / 40 075 016,686 ≈ 3,349 px/m.
    const c = positionCameraMetres({ lngCamera: 0, latCamera: 0, cameraToCenterDistance: 1122, zoom: 18, pitchDeg: 0, latCentre: 0 });
    assert.ok(Math.abs(c.altitude - 1122 / (512 * 2 ** 18 / 40075016.686)) < 1e-9);
  });

  it('inclinée : relevé au Jarret, z18, 62°, 1 122 px → 114 m (MapLibre donne 112,75 m à la caméra)', () => {
    const c = positionCameraMetres({ lngCamera: 5.4475, latCamera: 43.3281, cameraToCenterDistance: 1122, zoom: 18, pitchDeg: 62, latCentre: 43.3298 });
    assert.ok(Math.abs(c.altitude - 114.4) < 1, String(c.altitude));
  });

  it('entrées illisibles (altitude NaN du globe) : null', () => {
    assert.equal(positionCameraMetres({ lngCamera: 5, latCamera: 43, cameraToCenterDistance: NaN, zoom: 18, pitchDeg: 0, latCentre: 43 }), null);
    assert.equal(positionCameraMetres(null), null);
  });

  it('distance : 0 sans caméra ; hauteur seule à l’aplomb ; Pythagore au loin', () => {
    assert.equal(distanceCameraObjet(null, 5, 43), 0);
    const cam = { lng: 5, lat: 43, altitude: 100 };
    assert.equal(distanceCameraObjet(cam, 5, 43), 100);
    // 0,001° de latitude ≈ 111,32 m.
    const d = distanceCameraObjet(cam, 5, 43.001);
    assert.ok(Math.abs(d - Math.hypot(111.32, 100)) < 0.05, String(d));
  });
});

describe('cameraDeclaree — le cadrage `camera` d’une scène ?scene=', async () => {
  const { cameraDeclaree } = await import('../lib/viewport.js');

  it('lit center, zoom, pitch, bearing', () => {
    assert.deepEqual(cameraDeclaree({ camera: { center: [5.4463, 43.3298], zoom: 18, pitch: 62, bearing: -25 } }),
      { center: [5.4463, 43.3298], zoom: 18, pitch: 62, bearing: -25 });
  });

  it('sans camera, ou illisible : null (le cadrage sur les données reste)', () => {
    assert.equal(cameraDeclaree({}), null);
    assert.equal(cameraDeclaree(null), null);
    assert.equal(cameraDeclaree({ camera: { center: [5, 43] } }), null, 'zoom manquant');
    assert.equal(cameraDeclaree({ camera: { center: [500, 43], zoom: 12 } }), null);
    assert.equal(cameraDeclaree({ camera: { center: ['a', 43], zoom: 12 } }), null);
  });

  it('angle illisible omis, inclinaison bornée', () => {
    assert.deepEqual(cameraDeclaree({ camera: { center: [5, 43], zoom: 12, pitch: 120, bearing: 'x' } }),
      { center: [5, 43], zoom: 12, pitch: 85 });
  });
});
