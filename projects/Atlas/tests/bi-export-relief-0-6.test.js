/**
 * `exportScene3D`, option `relief` : altitudes lues dans des tuiles terrarium (lecture injectée, donc sans réseau), terrain en grille, volumes posés sur la pente.
 * La lecture réseau et l'écriture du GLB se vérifient en navigateur.
 * node --test projects/Atlas/tests/bi-export-relief-0-6.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as E from '../lib/export-scene3d.js';
import * as R from '../lib/export-relief.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const THREE = await import(pathToFileURL(path.join(ICI, '..', '..', '..', 'published', 'atlas', 'vendor', 'three', 'three.module.js')).href);
const app = fs.readFileSync(path.join(ICI, '..', 'app_v7.js'), 'utf8');
const ANCRE = { lng: 5.3646, lat: 43.2954 };
const carre = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];

/** Une tuile terrarium synthétique : l'altitude vaut `f(x, y)` en pixels de la tuile. */
const tuileDe = (f) => async (z, x, y) => {
  const data = new Uint8ClampedArray(256 * 256 * 4);
  for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
    const h = f(x * 256 + i, y * 256 + j, z) + 32768, k = 4 * (j * 256 + i);
    data[k] = Math.floor(h / 256); data[k + 1] = Math.floor(h) % 256; data[k + 2] = Math.round((h - Math.floor(h)) * 256) % 256; data[k + 3] = 255;
  }
  return { data, width: 256, height: 256 };
};

test('relief : options vérifiées, normalisées ; un relief sans sol en implique un', () => {
  assert.equal(R.normaliserRelief(undefined), null); assert.equal(R.normaliserRelief(false), null);
  assert.deepEqual(R.normaliserRelief(true), { exageration: 1, pas: null });
  assert.deepEqual(R.normaliserRelief({ exageration: 2, pas: 5 }), { exageration: 2, pas: 5 });
  for (const m of [{ exageration: 0 }, { exageration: 9 }, { pas: 0.2 }, { pas: 900 }, { inconnu: 1 }, 'oui', [], 3]) assert.throws(() => R.normaliserRelief(m), /exportScene3D : relief/, JSON.stringify(m));
  const o = E.normaliserOptions({ relief: true });
  assert.equal(o.relief.exageration, 1); assert.equal(o.sol.mode, 'uni', 'sol implicite');
  assert.equal(E.normaliserOptions({ relief: true, sol: 'carte' }).sol.mode, 'carte');
  assert.equal(E.normaliserOptions({}).relief, null);
});

test('relief : le décodage terrarium et le choix des tuiles', () => {
  assert.equal(R.decoderTerrarium(128, 0, 0), 0); assert.equal(R.decoderTerrarium(128, 12, 128), 12.5); assert.equal(R.decoderTerrarium(127, 255, 0), -1);
  const t = R.zoomEtTuiles([ANCRE.lng - 0.002, ANCRE.lat - 0.001, ANCRE.lng + 0.002, ANCRE.lat + 0.001]);
  assert.equal(t.z, 14); assert.ok((t.x1 - t.x0 + 1) * (t.y1 - t.y0 + 1) <= R.RELIEF_TUILES_MAX);
  const vaste = R.zoomEtTuiles([5, 43, 6, 44]);
  assert.ok(vaste.z < 14 && (vaste.x1 - vaste.x0 + 1) * (vaste.y1 - vaste.y0 + 1) <= R.RELIEF_TUILES_MAX, 'une emprise vaste baisse le zoom');
  const e = R.elargir([5, 43, 5.1, 43.1], 100); assert.ok(e[0] < 5 && e[1] < 43 && e[2] > 5.1 && e[3] > 43.1); assert.deepEqual(R.elargir([5, 43, 5.1, 43.1], 0), [5, 43, 5.1, 43.1]);
});

test('relief : l altitude interpolée suit une rampe connue (pente vers l est : 0,05 m par pixel)', async () => {
  const bbox = [ANCRE.lng - 0.002, ANCRE.lat - 0.001, ANCRE.lng + 0.002, ANCRE.lat + 0.001];
  const r = await R.chargerRelief(bbox, tuileDe((px) => 100 + 0.05 * (px % 4096)));
  assert.equal(r.zoom, 14); assert.ok(r.tuiles >= 1);
  // deux points distants de 0,001 degré de longitude : combien de pixels z14 ? 0,001 / 360 * 2^14 * 256
  const pix = (0.001 / 360) * (2 ** 14) * 256;
  const h0 = r.altitude(ANCRE.lng, ANCRE.lat), h1 = r.altitude(ANCRE.lng + 0.001, ANCRE.lat);
  assert.ok(Math.abs((h1 - h0) - 0.05 * pix) < 0.02, 'pente est ' + (h1 - h0).toFixed(3) + ' attendue ' + (0.05 * pix).toFixed(3));
  assert.ok(Math.abs(r.altitude(ANCRE.lng, ANCRE.lat + 0.0005) - h0) < 0.02, 'pas de pente vers le nord');
});

test('relief : une tuile qui manque fait échouer le chargement (l application en dit la cause et exporte à plat)', async () => {
  await assert.rejects(() => R.chargerRelief([5, 43, 5.001, 43.001], async () => { throw new Error('HTTP 404'); }), /404/);
});

const pente = (lng, lat) => (lng - ANCRE.lng) * 100000;   // 1 m par 1e-5 degré vers l est, exagération comprise
const emprise = [ANCRE.lng - 0.001, ANCRE.lat - 0.0006, ANCRE.lng + 0.001, ANCRE.lat + 0.0006];
const batiment = (x) => ({ id: x, couche: 'c', geometrie: { type: 'Polygon', coordinates: [carre(ANCRE.lng + x, ANCRE.lat, 0.00005, 0.00005)] }, hauteur: 10 });

test('relief : le terrain est une grille dont chaque sommet porte son altitude, face vers le haut, nord en -z', () => {
  const r = E.construireScene(THREE, { ancre: ANCRE, emprise, relief: { hauteur: pente, emprise, exageration: 1, altitudeAncre: 50 }, sol: { mode: 'uni', epaisseur: 0, marge: 0 }, extrusions: [batiment(0)] });
  const t = r.scene.children.find((o) => o.name === 'sol_dessus'); assert.ok(t);
  const pos = t.geometry.getAttribute('position');
  assert.ok(pos.count > 4, 'une grille, pas un quadrilatère');
  const b = new THREE.Box3().setFromObject(t);
  assert.ok(Math.abs(b.min.y - pente(emprise[0])) < 1e-3 && Math.abs(b.max.y - pente(emprise[2])) < 1e-3, 'de ' + b.min.y + ' à ' + b.max.y);
  // toutes les faces regardent vers le haut
  const idx = t.geometry.index; let bas = 0;
  for (let k = 0; k < idx.count; k += 3) {
    const P = (i) => new THREE.Vector3().fromBufferAttribute(pos, idx.getX(k + i));
    const n = new THREE.Vector3().subVectors(P(1), P(0)).cross(new THREE.Vector3().subVectors(P(2), P(0)));
    if (n.y <= 0) bas++;
  }
  assert.equal(bas, 0, 'faces tournées vers le bas');
  assert.equal(r.stats.relief.max > r.stats.relief.min, true); assert.equal(r.stats.sol, 'uni');
  const x = r.scene.userData.atlas;
  assert.equal(x.contenu.relief, true); assert.equal(x.relief.altitudeAncre, 50); assert.equal(x.relief.source, 'terrarium'); assert.deepEqual(x.relief.denivele, [r.stats.relief.min, r.stats.relief.max]);
  assert.ok(pos.count <= R.RELIEF_COTE_MAX ** 2);
});

test('relief : un volume est posé sur le point le plus bas de son emprise, enfoncé de 0,3 m, sans dessous ; un volume surélevé garde son dessous', () => {
  const lieu = (x) => ANCRE.lng + x;
  const r = E.construireScene(THREE, { ancre: ANCRE, emprise, relief: { hauteur: pente, emprise, exageration: 1, altitudeAncre: 0 }, sol: { mode: 'uni', epaisseur: 0, marge: 0 }, extrusions: [batiment(0.0004)] });
  const m = r.scene.children.find((o) => o.name.startsWith('couche_')); const b = new THREE.Box3().setFromObject(m);
  const bas = pente(lieu(0.0004)), attendu = bas - E.ANCRAGE_RELIEF;
  assert.ok(Math.abs(b.min.y - attendu) < 0.01, 'base ' + b.min.y + ' attendue ' + attendu);
  assert.ok(Math.abs(b.max.y - (bas + 10)) < 0.01, 'sommet ' + b.max.y + ' attendu ' + (bas + 10));
  const nor = m.geometry.getAttribute('normal'); let dessous = 0; for (let i = 0; i < nor.count; i++) if (nor.getY(i) < -0.5) dessous++;
  assert.equal(dessous, 0, 'pas de dessous');
  const leve = E.construireScene(THREE, { ancre: ANCRE, emprise, relief: { hauteur: pente, emprise, exageration: 1, altitudeAncre: 0 }, sol: { mode: 'uni', epaisseur: 0, marge: 0 }, extrusions: [{ ...batiment(0.0004), base: 4 }] });
  const bl = new THREE.Box3().setFromObject(leve.scene.children.find((o) => o.name.startsWith('couche_')));
  assert.ok(Math.abs(bl.min.y - (bas + 4)) < 0.01 && Math.abs(bl.max.y - (bas + 14)) < 0.01, 'surélevé : ' + bl.min.y + ' à ' + bl.max.y);
});

test('relief : avec épaisseur, une jupe ferme les quatre bords et le dessous plat tient sous le point le plus bas', () => {
  const r = E.construireScene(THREE, { ancre: ANCRE, emprise, relief: { hauteur: pente, emprise, exageration: 1, altitudeAncre: 0 }, sol: { mode: 'uni', epaisseur: 5, marge: 0 }, extrusions: [batiment(0)] });
  const d = r.scene.children.find((o) => o.name === 'sol_dalle'); assert.ok(d);
  const t = r.scene.children.find((o) => o.name === 'sol_dessus');
  const bt = new THREE.Box3().setFromObject(t), bd = new THREE.Box3().setFromObject(d);
  assert.ok(Math.abs(bd.min.y - (bt.min.y - 5)) < 1e-6, 'dessous à ' + bd.min.y);
  assert.ok(bd.max.y <= bt.max.y + 1e-6);
  // fermée : chaque triangle de la jupe regarde vers l extérieur ou vers le bas
  const pos = d.geometry.getAttribute('position'), nor = d.geometry.getAttribute('normal'), idx = d.geometry.index;
  for (let k = 0; k < idx.count; k += 3) {
    const P = (i) => new THREE.Vector3().fromBufferAttribute(pos, idx.getX(k + i));
    const n = new THREE.Vector3().subVectors(P(1), P(0)).cross(new THREE.Vector3().subVectors(P(2), P(0)));
    const v = new THREE.Vector3().fromBufferAttribute(nor, idx.getX(k));
    assert.ok(n.dot(v) > 0, 'triangle ' + k / 3 + ' tourné à l envers');
  }
});

test('relief : en mode carte, la texture couvre la grille (non éclairée, sans normales) ; l exagération multiplie les hauteurs', () => {
  const texture = new THREE.Texture();
  const r = E.construireScene(THREE, { ancre: ANCRE, emprise, relief: { hauteur: (a, b) => 2 * pente(a, b), emprise, exageration: 2, altitudeAncre: 0 }, sol: { mode: 'carte', texture, epaisseur: 0, marge: 0 }, extrusions: [batiment(0)] });
  const t = r.scene.children.find((o) => o.name === 'sol_dessus');
  assert.equal(t.material.isMeshBasicMaterial, true); assert.equal(t.material.map, texture); assert.equal(t.geometry.getAttribute('normal'), undefined);
  const uv = t.geometry.getAttribute('uv'); let umin = 9, umax = -9, vmin = 9, vmax = -9;
  for (let i = 0; i < uv.count; i++) { umin = Math.min(umin, uv.getX(i)); umax = Math.max(umax, uv.getX(i)); vmin = Math.min(vmin, uv.getY(i)); vmax = Math.max(vmax, uv.getY(i)); }
  assert.deepEqual([umin, umax, vmin, vmax], [0, 1, 0, 1]);
  assert.equal(r.scene.userData.atlas.relief.exageration, 2);
});

test('relief : une maille trop fine pour la grille est portée au plafond, et dit', () => {
  const r = E.construireScene(THREE, { ancre: ANCRE, emprise, relief: { hauteur: pente, emprise, exageration: 1, altitudeAncre: 0, pas: 1 }, sol: { mode: 'uni', epaisseur: 0, marge: 0 }, extrusions: [batiment(0)] });
  const t = r.scene.children.find((o) => o.name === 'sol_dessus');
  assert.ok(t.geometry.getAttribute('position').count <= R.RELIEF_COTE_MAX ** 2);
  assert.ok(r.avertissements.some((a) => /maille portée/.test(a)) || r.stats.relief.mailles > 0);
});

test('application : le relief est lu à part, ramène objets et luminaires sur le terrain, décale la texture du sol à l emprise élargie', () => {
  assert.match(app, /export-relief\.js\?v=/); assert.match(app, /lireTuileRelief/);
  assert.match(app, /relief\.hauteur\(it\.lng, it\.lat\)/); assert.match(app, /relief \? relief\.hauteur\(lng, lat\) : 0/);
  assert.match(app, /rendreFondAPlat\(emprise,/);
  assert.match(app, /scène à plat/);
});

test('rognage : un bâtiment qui déborde de l emprise est coupé à son bord, un anneau dedans est gardé tel quel, un anneau dehors disparaît', () => {
  const b = [0, 0, 10, 10];
  const dedans = [[2, 2], [4, 2], [4, 4], [2, 2]];
  assert.equal(E.rognerAnneau(dedans, b), dedans);
  assert.deepEqual(E.rognerAnneau([[20, 20], [30, 20], [30, 30], [20, 20]], b), []);
  const deborde = E.rognerAnneau([[5, 5], [15, 5], [15, 15], [5, 15], [5, 5]], b);
  assert.ok(deborde.length >= 5 && deborde.every(([x, y]) => x >= 0 && x <= 10 && y >= 0 && y <= 10), JSON.stringify(deborde));
  assert.deepEqual(deborde[0], deborde[deborde.length - 1]);
  const xs = deborde.map((p) => p[0]), ys = deborde.map((p) => p[1]);
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [5, 10, 5, 10]);
});

test('rognage : dans la scène, le volume ne sort pas du plan du sol (marge comprise) et l écart est dit', () => {
  const grand = { id: 1, couche: 'c', geometrie: { type: 'Polygon', coordinates: [carre(ANCRE.lng - 0.01, ANCRE.lat - 0.01, 0.02, 0.02)] }, hauteur: 8 };
  const r = E.construireScene(THREE, { ancre: ANCRE, emprise, sol: { mode: 'uni', epaisseur: 0, marge: 0 }, extrusions: [grand] });
  const v = new THREE.Box3().setFromObject(r.scene.children.find((o) => o.name.startsWith('couche_'))), s = new THREE.Box3().setFromObject(r.scene.children.find((o) => o.name === 'sol_dessus'));
  assert.ok(v.min.x >= s.min.x - 0.05 && v.max.x <= s.max.x + 0.05 && v.min.z >= s.min.z - 0.05 && v.max.z <= s.max.z + 0.05, 'volume ' + v.min.x + '..' + v.max.x + ' sol ' + s.min.x + '..' + s.max.x);
  assert.ok(r.avertissements.some((a) => /rognés : 1/.test(a)));
  const loin = E.construireScene(THREE, { ancre: ANCRE, emprise, extrusions: [grand, { ...grand, id: 2, geometrie: { type: 'Polygon', coordinates: [carre(ANCRE.lng + 0.5, ANCRE.lat, 0.001, 0.001)] } }] });
  assert.equal(loin.stats.extrusions, 1, 'celui qui est hors emprise n est pas écrit');
});

test('attribution : les entités HTML sont décodées, la licence d OpenStreetMap est ODbL', () => {
  assert.equal(E.texteAttribution('<a href="x">OpenFreeMap</a> &copy; OpenMapTiles Data from OpenStreetMap &amp; co &#169; &#x41;'), 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap & co © A');
  assert.equal(E.texteAttribution('a &inconnue; b'), 'a &inconnue; b');
  assert.equal(E.licenceDeAttribution('OpenFreeMap © OpenMapTiles Data from OpenStreetMap'), 'ODbL'); assert.equal(E.licenceDeAttribution('© IGN'), null);
});
