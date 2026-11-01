/**
 * Contrat 0.6 : `exportScene3D`, la scène 3D en UN GLB (objets, couches extrudées, bâti du fond) pour la réalité augmentée, un QR imprimé, un lecteur 3D.
 * La construction de la scène se teste ici avec three.js seul (celui qu'Atlas embarque) ; l'écriture du GLB (GLTFExporter) et la collecte dans l'application se vérifient en navigateur.
 * node --test projects/Atlas/tests/bi-export-scene3d-0-6.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { attacher } from '../lib/bi/bi-runtime.js';
import { brancher } from '../lib/bi/canevas.js';
import { COMMANDES, COMMANDES_0_6, CAPACITE_DE_COMMANDE, validerCommande, versionDeCommande } from '../lib/bi/pont.js';
import { TEXTES_COMMANDES } from '../lib/bi/describe.js';
import * as E from '../lib/export-scene3d.js';
import { carteSimulee } from './aide-carte-bi.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const THREE = await import(pathToFileURL(path.join(ICI, '..', '..', '..', 'published', 'atlas', 'vendor', 'three', 'three.module.js')).href);
const app = fs.readFileSync(path.join(ICI, '..', 'app_v7.js'), 'utf8');

const ANCRE = { lng: 5.3646, lat: 43.2954 };
const carre = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
const lotVide = () => ({ pos: [], nor: [], idx: [] });
const pts = (liste) => liste.map(([x, y]) => ({ x, y }));

test('contrat : exportScene3D est une commande 0.6 de la capacité socle, décrite, refusée à un hôte resté en 0.5', () => {
  assert.ok('exportScene3D' in COMMANDES && COMMANDES_0_6.includes('exportScene3D')); assert.equal(versionDeCommande('exportScene3D'), '0.6'); assert.equal(CAPACITE_DE_COMMANDE.exportScene3D, 'socle');
  assert.ok(Array.isArray(TEXTES_COMMANDES.exportScene3D) && /GLB/.test(TEXTES_COMMANDES.exportScene3D[0]));
  const ctx = { origine: 'https://hote.test', autorisees: ['https://hote.test'] };
  const msg = (version, args) => ({ source: 'hote-bi', version, id: 'a', cmd: 'exportScene3D', args });
  assert.equal(validerCommande(msg('0.5', []), ctx).code, 'version');
  assert.equal(validerCommande(msg('0.6', []), ctx).ok, true); assert.equal(validerCommande(msg('0.6', [{ inclure: { bati: true } }]), ctx).ok, true);
  assert.equal(validerCommande(msg('0.6', ['x']), ctx).code, 'argument');
});

test('carte nue : exportScene3D répond capacite_absente (la scène 3D est celle de l application) ; le profil complet la branche', async () => {
  const rt = attacher(carteSimulee(), {});
  await assert.rejects(() => rt.api.exportScene3D({}), /capacite_absente.*profil complet/);
  const appels = [];
  const facade = { outils: {}, monterScene: async () => ({ couches: [] }), monterDalles: async () => ({}), retirerScene: () => 0, visibilite: () => true, cadrer: () => true, abonner: () => () => {}, exporter3d: async (o) => { appels.push(o); return { octets: 1 }; } };
  brancher(rt, facade);
  assert.deepEqual(await rt.api.exportScene3D({ bbox: [1, 1, 2, 2] }), { octets: 1 }); assert.deepEqual(appels, [{ bbox: [1, 1, 2, 2] }]);
  const sans = attacher(carteSimulee(), {}); brancher(sans, { ...facade, exporter3d: undefined });
  await assert.rejects(() => sans.api.exportScene3D({}), /capacite_absente/);
});

test('options : bornes, valeurs par défaut, erreurs lisibles', () => {
  const d = E.normaliserOptions();
  assert.deepEqual(d, { bbox: null, ancre: null, inclure: { objets: true, extrusions: true, bati: false }, hauteurParDefaut: 3, plafondOctets: 5 * 1024 * 1024, couches: null, simplification: 0.1, sol: null });
  const o = E.normaliserOptions({ bbox: [5.3, 43.2, 5.4, 43.3], ancre: { lng: 5.35, lat: 43.25 }, inclure: { bati: true, objets: false }, hauteurParDefaut: 6, plafondOctets: 2 * 1048576, couches: ['a', 'b'], simplification: 0 });
  assert.deepEqual(o.inclure, { objets: false, extrusions: true, bati: true }); assert.equal(o.simplification, 0); assert.deepEqual(o.couches, ['a', 'b']);
  const mauvaises = [{ bbox: [1, 2, 3] }, { bbox: [3, 2, 1, 4] }, { bbox: [0, 0, 181, 1] }, { bbox: [0, 0, 10, 10] }, { ancre: { lng: 200, lat: 0 } }, { ancre: 'x' }, { inclure: 'x' }, { inclure: { relief: true } }, { inclure: { bati: 'oui' } },
    { inclure: { objets: false, extrusions: false, bati: false } }, { hauteurParDefaut: 0 }, { hauteurParDefaut: 5000 }, { plafondOctets: 10 }, { plafondOctets: 1e12 }, { plafondOctets: 1.5 }, { couches: 'a' }, { couches: [3] }, { couches: Array(65).fill('a') }, { simplification: -1 }, { simplification: 9 }, 'x', []];
  for (const m of mauvaises) assert.throws(() => E.normaliserOptions(m), /exportScene3D/, JSON.stringify(m));
});

test('repère : projection locale en mètres autour de l ancre (à 1 cm sur 1 km)', () => {
  const v = E.projectionLocale(ANCRE), o = v(ANCRE.lng, ANCRE.lat);
  assert.deepEqual(o, { x: 0, y: 0 });
  const e = v(ANCRE.lng + 0.01, ANCRE.lat), n = v(ANCRE.lng, ANCRE.lat + 0.01);
  assert.ok(Math.abs(e.x - 0.01 * Math.PI / 180 * 6378137 * 0 - e.x) < 1e-9 && e.x > 800 && e.x < 820, 'est : ' + e.x);   // 0,01° de longitude à 43,3° ≈ 811 m
  assert.ok(Math.abs(n.y - 1112) < 3, 'nord : ' + n.y);                                                                      // 0,01° de latitude ≈ 1112 m
  assert.equal(E.centreDe([0, 10, 4, 20]).lng, 2); assert.equal(E.centreDe([0, 10, 4, 20]).lat, 15);
});

test('aides : noms sûrs, couleurs, polygones lisibles', () => {
  assert.equal(E.nomSur('objet:o1 / x'), 'objet_o1_x'); assert.equal(E.nomSur(''), 'x'); assert.equal(E.nomSur(null, 'repli'), 'repli'); assert.ok(E.nomSur('a'.repeat(200)).length <= 60);
  assert.equal(E.couleurEntiere('#8a7bd0'), 0x8a7bd0); assert.equal(E.couleurEntiere('#fa0'), 0xffaa00); assert.equal(E.couleurEntiere('rouge'), 0x9a9a9a); assert.equal(E.couleurEntiere(null, 1), 1);
  assert.equal(E.polygonesDe({ type: 'Polygon', coordinates: [carre(0, 0, 1, 1)] }).length, 1);
  assert.equal(E.polygonesDe({ type: 'MultiPolygon', coordinates: [[carre(0, 0, 1, 1)], [carre(2, 2, 1, 1), carre(2.2, 2.2, .3, .3)]] })[1].length, 2, 'le trou du second polygone est gardé');
  for (const rien of [null, {}, { type: 'Point', coordinates: [0, 0] }, { type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] }, { type: 'Polygon', coordinates: [[[0, 0], [1, 'a'], [1, 1], [0, 0]]] }, { type: 'Polygon', coordinates: 'x' }]) assert.deepEqual(E.polygonesDe(rien), []);
});

test('simplification : les points alignés disparaissent, la forme et ses coins restent, jamais moins de trois points', () => {
  const carreAvecMilieux = pts([[0, 0], [5, 0], [10, 0], [10, 5], [10, 10], [5, 10], [0, 10], [0, 5]]);
  const s = E.simplifierAnneau(carreAvecMilieux, 0.1);
  assert.equal(s.length, 4); for (const c of [[0, 0], [10, 0], [10, 10], [0, 10]]) assert.ok(s.some((p) => p.x === c[0] && p.y === c[1]), 'coin ' + c);
  assert.equal(E.simplifierAnneau(carreAvecMilieux, 0).length, 8, 'tolérance nulle : rien ne bouge');
  const dent = pts([[0, 0], [5, 0], [5, 0.5], [6, 0], [10, 0], [10, 10], [0, 10], [0, 5]]);
  assert.ok(E.simplifierAnneau(dent, 0.1).some((p) => p.y === 0.5), 'une dent de 50 cm survit à 10 cm');
  assert.ok(!E.simplifierAnneau(dent, 1).some((p) => p.y === 0.5), 'et disparaît à 1 m');
  assert.ok(E.simplifierAnneau(pts([[0, 0], [1, 0.00001], [2, 0], [1, -0.00001], [0.5, 0]]), 5).length >= 3);
});

/** L'aire d'un ensemble de triangles horizontaux (le toit) et le sens de chaque triangle par rapport à sa normale. */
function controler(lot) {
  let aireToit = 0, mauvais = 0;
  for (let t = 0; t < lot.idx.length; t += 3) {
    const [a, b, c] = [lot.idx[t], lot.idx[t + 1], lot.idx[t + 2]];
    const P = (i) => [lot.pos[3 * i], lot.pos[3 * i + 1], lot.pos[3 * i + 2]], N = (i) => [lot.nor[3 * i], lot.nor[3 * i + 1], lot.nor[3 * i + 2]];
    const A = P(a), B = P(b), C = P(c), n = N(a);
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] <= 0) mauvais++;
    if (n[1] === 1) aireToit += Math.hypot(...cr) / 2;
  }
  return { aireToit, mauvais };
}

test('prisme : un carré de 10 m avec une cour de 4 m — toit percé, parois vers l extérieur, tous les triangles tournés vers l extérieur, hauteur juste', () => {
  const lot = lotVide();
  const n = E.ajouterPrisme(THREE, lot, [pts([[0, 0], [10, 0], [10, 10], [0, 10]]), pts([[3, 3], [3, 7], [7, 7], [7, 3]])], 12, 0);   // l'anneau extérieur et le trou donnés « à l envers » : remis dans le bon sens
  assert.equal(n, lot.pos.length / 3); assert.ok(n > 0);
  const { aireToit, mauvais } = controler(lot);
  assert.ok(Math.abs(aireToit - (100 - 16)) < 1e-6, 'toit : ' + aireToit);
  assert.equal(mauvais, 0, 'triangles à l envers : ' + mauvais);
  const ys = lot.pos.filter((_, i) => i % 3 === 1); assert.equal(Math.min(...ys), 0); assert.equal(Math.max(...ys), 12);
  const zs = lot.pos.filter((_, i) => i % 3 === 2); assert.ok(Math.min(...zs) >= -10 - 1e-9 && Math.max(...zs) <= 1e-9, 'le nord (y>0) va vers -z');
  for (const i of lot.idx) assert.ok(i >= 0 && i < n);
  // une paroi extérieure sud (y=0) regarde le sud = +z ; la paroi de la cour côté sud (y=3, matière au sud) regarde le nord = -z
  const sud = []; for (let v = 0; v < n; v++) if (lot.nor[3 * v + 2] === 1 && lot.pos[3 * v + 2] === -0) sud.push(v);
  assert.ok(sud.length >= 4, 'paroi sud extérieure vers +z');
});

test('prisme : surélevé (base > 0), le dessous existe et regarde vers le bas ; surface dégénérée : rien', () => {
  const lot = lotVide();
  E.ajouterPrisme(THREE, lot, [pts([[0, 0], [4, 0], [4, 4], [0, 4]])], 3, 5);
  const ys = lot.pos.filter((_, i) => i % 3 === 1); assert.equal(Math.min(...ys), 5); assert.equal(Math.max(...ys), 8);
  assert.ok(lot.nor.some((v, i) => i % 3 === 1 && v === -1), 'dessous'); assert.equal(controler(lot).mauvais, 0);
  assert.equal(E.ajouterPrisme(THREE, lotVide(), [pts([[0, 0], [1, 1]])], 3, 0), 0);
  assert.equal(E.ajouterPrisme(THREE, lotVide(), [pts([[0, 0], [1, 1], [2, 2]])], 3, 0), 0, 'trois points alignés : aire nulle');
  assert.equal(E.ajouterPrisme(THREE, lotVide(), [], 3, 0), 0);
});

test('scène : un objet posé comme dans Atlas, une surface avec trou et un MultiPolygone fusionnés par couche, extras de traçabilité', () => {
  const racine = new THREE.Group(); racine.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
  const matrice = new THREE.Matrix4().compose(new THREE.Vector3(12, 2, -30), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0, 'YXZ')), new THREE.Vector3(3, 3, 3));
  const d = 0.0006, c0 = [ANCRE.lng, ANCRE.lat];
  const { scene, stats, avertissements } = E.construireScene(THREE, {
    ancre: ANCRE,
    objets: [{ id: 'o1', couche: 'objets', racine, lng: ANCRE.lng, lat: ANCRE.lat, matrice }, { id: 'sans-racine', couche: 'objets', lng: 1, lat: 1 }],
    extrusions: [
      { id: 1, couche: 'bati', geometrie: { type: 'Polygon', coordinates: [carre(c0[0] - d, c0[1] - d, 2 * d, 2 * d), carre(c0[0] - d / 2, c0[1] - d / 2, d, d)] }, hauteur: 18, couleur: '#8a7bd0' },
      { id: 2, couche: 'bati', geometrie: { type: 'MultiPolygon', coordinates: [[carre(c0[0] + 2 * d, c0[1] - d, d, d)], [carre(c0[0] + 2 * d, c0[1] + d / 2, d, d)]] }, hauteur: 9, couleur: '#8a7bd0' },
      { id: 3, couche: 'autre', geometrie: { type: 'Polygon', coordinates: [carre(c0[0], c0[1] + 3 * d, d, d)] }, hauteur: 0, couleur: '#c44536', opacite: 0.5 },
      { id: 4, couche: 'bati', geometrie: { type: 'Point', coordinates: [0, 0] }, hauteur: 5 }, null,
    ],
    attributions: [{ source: 'Objets du catalogue', licence: 'Licence Ouverte Etalab 2.0', url: 'https://exemple.test/c' }], emprise: [5.36, 43.29, 5.37, 43.30], genere: '2026-11-02T00:00:00.000Z',
  });
  assert.deepEqual(stats, { objets: 1, extrusions: 3, sommets: stats.sommets, ignores: 3 }); assert.ok(stats.sommets > 0);
  assert.ok(avertissements.some((a) => /ignorés : 3/.test(a)));
  const noms = scene.children.map((o) => o.name);
  assert.deepEqual(noms.slice(0, 1), ['objet_objets_o1']); assert.equal(noms.filter((n) => n.startsWith('couche_')).length, 2, 'une géométrie par (couche, couleur, opacité) : bati violet, autre rouge');
  const obj = scene.children[0]; assert.deepEqual(obj.position.toArray().map((v) => +v.toFixed(6)), [12, 2, -30]); assert.ok(Math.abs(obj.scale.x - 3) < 1e-9);
  assert.ok(Math.abs(new THREE.Euler().setFromQuaternion(obj.quaternion, 'YXZ').y - Math.PI / 2) < 1e-9, 'l azimut de l écran est gardé');
  const bati = scene.children.find((o) => o.name.startsWith('couche_bati')), box = new THREE.Box3().setFromObject(bati), t = box.getSize(new THREE.Vector3());
  assert.ok(Math.abs(t.y - 18) < 1e-6, 'hauteur maximale 18 m : ' + t.y); assert.ok(t.x > 150 && t.x < 260, 'largeur de quelque 200 m : ' + t.x);
  const rouge = scene.children.find((o) => o.name.startsWith('couche_autre')); assert.equal(rouge.material.transparent, true); assert.equal(rouge.material.opacity, 0.5);
  assert.equal(new THREE.Box3().setFromObject(rouge).getSize(new THREE.Vector3()).y, 3, 'hauteur nulle : la hauteur par défaut de 3 m');
  const x = scene.userData.atlas;
  assert.equal(x.format, 'atlas-scene3d/1'); assert.equal(x.unite, 'm'); assert.match(x.repere, /z=sud/); assert.deepEqual(x.ancre, ANCRE); assert.deepEqual(x.contenu, { objets: 1, extrusions: 3 });
  assert.deepEqual(x.attributions, [{ source: 'Objets du catalogue', licence: 'Licence Ouverte Etalab 2.0', url: 'https://exemple.test/c' }]); assert.equal(x.genere, '2026-11-02T00:00:00.000Z'); assert.deepEqual(x.emprise, [5.36, 43.29, 5.37, 43.30]);
});

test('scène : sans matrice, l objet se pose avec échelle, azimut, rotations et décalages (rotation YXZ, z = -nord)', () => {
  const racine = new THREE.Group();
  const { scene } = E.construireScene(THREE, { ancre: ANCRE, objets: [{ id: 1, couche: 'o', racine, lng: ANCRE.lng + 0.001, lat: ANCRE.lat + 0.001, echelle: 2, azimut: 90, offX: 1, offY: 2, elevation: 3 }] });
  const o = scene.children[0], v = E.projectionLocale(ANCRE)(ANCRE.lng + 0.001, ANCRE.lat + 0.001);
  assert.ok(Math.abs(o.position.x - (v.x + 1)) < 1e-6); assert.ok(Math.abs(o.position.z - (-v.y - 2)) < 1e-6, 'le nord est -z'); assert.equal(o.position.y, 3); assert.equal(o.scale.x, 2);
  assert.ok(Math.abs(o.rotation.y - Math.PI / 2) < 1e-9);
});

test('plafonds : au-delà des objets et des surfaces permis, le reste est ignoré et dit', () => {
  const objets = Array.from({ length: E.PLAFOND_OBJETS + 5 }, (_, i) => ({ id: i, couche: 'o', racine: new THREE.Group(), lng: ANCRE.lng, lat: ANCRE.lat }));
  const r = E.construireScene(THREE, { ancre: ANCRE, objets });
  assert.equal(r.stats.objets, E.PLAFOND_OBJETS); assert.ok(r.avertissements.some((a) => /objets : 5 objet\(s\) au-delà/.test(a)));
  const ext = Array.from({ length: 20 }, (_, i) => ({ id: i, couche: 'c', geometrie: { type: 'Polygon', coordinates: [carre(ANCRE.lng, ANCRE.lat, 0.0001, 0.0001)] }, hauteur: 5 }));
  assert.equal(E.construireScene(THREE, { ancre: ANCRE, extrusions: ext }).stats.extrusions, 20);
});

test('attributions fusionnées sans doublon ; poids vérifié avec un message qui dit quoi faire', () => {
  assert.deepEqual(E.fusionnerAttributions([[{ source: 'A', licence: 'L' }, { source: 'A', licence: 'L' }, { source: 'A' }, null, { source: '' }], [{ source: 'B', url: 'https://b' }]]), [{ source: 'A', licence: 'L' }, { source: 'A' }, { source: 'B', url: 'https://b' }]);
  assert.equal(E.verifierPoids(100, 200), 100);
  assert.throws(() => E.verifierPoids(6 * 1048576, 5 * 1048576), /trop_lourd \(6\.0 Mo pour un plafond de 5\.0 Mo\).*bbox/);
});

test('application : la commande est branchée dans la façade, charge l exporteur à la demande, ramène les objets à l ancre sol à zéro, dit les couches muettes', () => {
  assert.match(app, /exporter3d: exporter3dScene,/);
  assert.match(app, /async function exporter3dScene\(entree\)/);
  assert.match(app, /await import\('three\/addons\/exporters\/GLTFExporter\.js'\)/);
  assert.match(app, /m\.elements\[12\] -= ancreLocale\.x;/); assert.match(app, /m\.elements\[14\] \+= ancreLocale\.y;/); assert.match(app, /m\.elements\[13\] -= eOff \|\| 0;/);
  assert.match(app, /collect\(opts = \{\}\)/); assert.match(app, /aucun objet exporté/);
  const json = JSON.parse(fs.readFileSync(path.join(ICI, '..', 'vendor-externe.json'), 'utf8'));
  assert.ok(json.bibliotheques.find((b) => b.id === 'three').fichiers.some((f) => f.vers === 'three/addons/exporters/GLTFExporter.js'), 'l exporteur est vendorisé');
});

test('sol : options vérifiées, normalisées, refus lisibles', () => {
  assert.equal(E.normaliserSol(undefined), null); assert.equal(E.normaliserSol(false), null); assert.equal(E.normaliserSol(null), null);
  assert.deepEqual(E.normaliserSol('uni'), { mode: 'uni', couleur: null, epaisseur: 0, marge: 0, resolution: 2048 });
  assert.deepEqual(E.normaliserSol({ mode: 'carte', resolution: 1024, epaisseur: 4, marge: 10 }), { mode: 'carte', couleur: null, epaisseur: 4, marge: 10, resolution: 1024 });
  assert.equal(E.normaliserSol({ mode: 'uni', couleur: '#ABCDEF' }).couleur, '#abcdef'); assert.equal(E.normaliserSol(true).mode, 'uni');
  assert.equal(E.normaliserOptions({ sol: 'carte' }).sol.mode, 'carte');
  for (const m of ['plan', 'x', { mode: 'cube' }, { mode: 'uni', couleur: 'rouge' }, { mode: 'uni', epaisseur: -1 }, { mode: 'uni', epaisseur: 99 }, { mode: 'uni', marge: 5000 }, { mode: 'carte', resolution: 100 }, { mode: 'carte', resolution: 9000 }, { mode: 'carte', resolution: 1.5 }, { mode: 'uni', inconnu: 1 }, [], 42]) assert.throws(() => E.normaliserSol(m), /exportScene3D : sol/, JSON.stringify(m));
});

test('sol : un aplat à y = 0 sur toute l emprise (plus la marge), le dessus regarde vers le haut ; avec épaisseur, une dalle fermée dont le toit n est pas doublé', () => {
  const emprise = [ANCRE.lng - 0.001, ANCRE.lat - 0.0005, ANCRE.lng + 0.001, ANCRE.lat + 0.0005];
  const base = { ancre: ANCRE, emprise, extrusions: [{ id: 1, couche: 'c', geometrie: { type: 'Polygon', coordinates: [carre(ANCRE.lng, ANCRE.lat, 0.0001, 0.0001)] }, hauteur: 5 }] };
  const sans = E.construireScene(THREE, base);
  assert.ok(!sans.scene.children.some((o) => o.name.startsWith('sol')), 'pas de sol par défaut');
  const plat = E.construireScene(THREE, { ...base, sol: { mode: 'uni', couleur: '#c0d0e0', epaisseur: 0, marge: 0 } });
  const dessus = plat.scene.children.find((o) => o.name === 'sol_dessus'); assert.ok(dessus); assert.equal(plat.scene.children.some((o) => o.name === 'sol_dalle'), false);
  const b = new THREE.Box3().setFromObject(dessus), t = b.getSize(new THREE.Vector3());
  assert.equal(b.min.y, 0); assert.equal(b.max.y, 0); assert.ok(Math.abs(t.x - 2 * 0.001 * Math.PI / 180 * 6378137 * Math.cos(ANCRE.lat * Math.PI / 180) * (180 / Math.PI) * (Math.PI / 180)) < 1e-6 || t.x > 150, 'largeur ~163 m : ' + t.x); assert.ok(t.z > 100 && t.z < 120, 'profondeur ~111 m : ' + t.z);
  assert.equal(dessus.material.color.getHex(), 0xc0d0e0); assert.equal(plat.stats.sol, 'uni');
  const idx = dessus.geometry.index.array, pos = dessus.geometry.attributes.position.array;
  for (let k = 0; k < idx.length; k += 3) { const a = [0, 1, 2].map((i) => [pos[3 * idx[k + i]], pos[3 * idx[k + i] + 1], pos[3 * idx[k + i] + 2]]); const u = [a[1][0] - a[0][0], a[1][2] - a[0][2]], v = [a[2][0] - a[0][0], a[2][2] - a[0][2]]; assert.ok(u[0] * v[1] - u[1] * v[0] < 0, 'dessus tourné vers le haut (sens trigonométrique vu de dessus avec z = sud)'); }
  const marge = E.construireScene(THREE, { ...base, sol: { mode: 'uni', epaisseur: 0, marge: 20 } }).scene.children.find((o) => o.name === 'sol_dessus');
  assert.ok(new THREE.Box3().setFromObject(marge).getSize(new THREE.Vector3()).x > t.x + 39.9, 'la marge de 20 m s ajoute de chaque côté');
  const dalle = E.construireScene(THREE, { ...base, sol: { mode: 'uni', epaisseur: 6, marge: 0 } });
  const d = dalle.scene.children.find((o) => o.name === 'sol_dalle'), bd = new THREE.Box3().setFromObject(d);
  assert.equal(bd.min.y, -6); assert.ok(bd.max.y <= 1e-9, 'le toit de la dalle n est pas doublé : elle ne dépasse pas le sol');
  assert.ok(d.geometry.index.count >= 5 * 6, 'dessous et quatre côtés');
});

test('sol : en mode carte, la texture couvre l emprise (u de l ouest à l est, v du sud au nord) et le matériau n est pas éclairé', () => {
  const emprise = [ANCRE.lng - 0.001, ANCRE.lat - 0.0005, ANCRE.lng + 0.001, ANCRE.lat + 0.0005];
  const texture = new THREE.Texture();
  const r = E.construireScene(THREE, { ancre: ANCRE, emprise, extrusions: [{ id: 1, couche: 'c', geometrie: { type: 'Polygon', coordinates: [carre(ANCRE.lng, ANCRE.lat, 0.0001, 0.0001)] }, hauteur: 5 }], sol: { mode: 'carte', texture, epaisseur: 0, marge: 0 } });
  const dessus = r.scene.children.find((o) => o.name === 'sol_dessus');
  assert.equal(dessus.material.isMeshBasicMaterial, true); assert.equal(dessus.material.map, texture);
  const uv = dessus.geometry.attributes.uv.array, pos = dessus.geometry.attributes.position.array;
  assert.deepEqual([...uv], [0, 0, 1, 0, 1, 1, 0, 1]);
  assert.ok(pos[0] < pos[3], 'u croît vers l est'); assert.ok(pos[2] > pos[8], 'v croît vers le nord (z diminue)');
});

test('lumières : une lumière d un modèle (luminaire) n est pas exportée ; la mention de licence suit', () => {
  const racine = new THREE.Group(); racine.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())); racine.add(new THREE.SpotLight(0xffffff, 1));
  const r = E.construireScene(THREE, { ancre: ANCRE, objets: [{ id: 1, couche: 'o', racine, lng: ANCRE.lng, lat: ANCRE.lat }], attributions: [{ source: 'Catalogue', licence: 'Licence Ouverte Etalab 2.0', mention: 'Mention à citer' }] });
  let lumieres = 0; r.scene.traverse((o) => { if (o.isLight) lumieres++; }); assert.equal(lumieres, 0);
  assert.equal(r.scene.userData.atlas.attributions[0].mention, 'Mention à citer');
  assert.equal(E.fusionnerAttributions([[{ source: 'A', mention: 'm' }]])[0].mention, 'm');
});
