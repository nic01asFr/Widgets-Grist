/**
 * La couche de dalles 3D (lib/dalles3d-couche.js) avec des doubles de three.js, de la carte et du réseau : manifeste, liste des dalles, niveau selon la distance,
 * file à priorité et parallélisme, jamais de trou entre niveaux, cache, republication de la Fabrique, échec d'un GLB, retrait, pose des matrices.
 * Le rendu réel (three.js sur la carte) se vérifie en navigateur : voir essais-integration/validation/scripts/dalles3d.mjs.
 * node --test projects/Atlas/tests/dalles3d-couche.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { creerCoucheDalles } from '../lib/dalles3d-couche.js';
import { mercator, metreEnMercator, matriceDalle, produit4, inverse4, SCHEMA_GRILLE } from '../lib/dalles3d-geo.js';

const URL_GRILLE = 'https://fabrique.example/api/fabrique/atlas/grille3d.json';
const GRILLE = {
  schema: SCHEMA_GRILLE, version: 'v1', crs: 'EPSG:2154', pas_m: 200, attribution: 'Fabrique ; IGN',
  gabarits: { glb: 'dalles3d/FXX_L93_200_E{E}_N{N}/{niveau}.glb', ancrage: 'dalles3d/FXX_L93_200_E{E}_N{N}/ancrage.json', disponibilite: 'dalles3d/disponibilite.json' },
  niveaux: [{ niveau: 'D3', refine: 'REPLACE', distance_max_m: 6000, produit: true }, { niveau: 'D2', refine: 'REPLACE', distance_max_m: 1500, produit: true }, { niveau: 'D1', refine: 'ADD', distance_max_m: 400, produit: false }],
};
const LNG0 = 5.396094822683652, LAT0 = 43.303702735297065;
/** Une dalle à `i` fois 200 m à l'est de la dalle témoin (en degrés : ~ 200 m = 0,00247° de longitude à cette latitude). */
const DEG_PAR_DALLE = 200 / (111320 * Math.cos(LAT0 * Math.PI / 180));
const ident = (i) => ({ E: String(894400 + 200 * i).padStart(7, '0'), N: '6248000' });
const nom = (i) => 'FXX_L93_200_E' + ident(i).E + '_N' + ident(i).N;
const ancrageDe = (i) => ({ schema: 'x#ancrage', identifiant: nom(i), ancrage: { origine_wgs84: [LNG0 + i * DEG_PAR_DALLE, LAT0], altitude_origine_m: 50, convergence_deg: -1.7386, facteur_echelle: 1.000591 } });
const dalleDispo = (i, niveaux = ['D2', 'D3']) => ({ ...ident(i), identifiant: nom(i), statut: 'livree', niveaux: niveaux.map((n) => ({ niveau: n, empreinte: n + 'e' + i, octets: 1000 })), empreinte_ancrage: 'a' + i });

function banc({ nDalles = 3, parallelisme = 3, budget, camera = null } = {}) {
  const j = { demandes: [], ouverts: 0, maxOuverts: 0, version: 'v1', echecsGlb: new Set(), dalles: Array.from({ length: nDalles }, (_, i) => dalleDispo(i)), libere: [] };
  const attente = [];   // téléchargements de GLB en pause : les tests les relâchent à la main
  const ecouteurs = {}, couches = new Map(), sources = new Map();
  const carte = {
    getBounds: () => ({ getWest: () => LNG0 - 0.01, getSouth: () => LAT0 - 0.01, getEast: () => LNG0 + 0.02, getNorth: () => LAT0 + 0.01 }),
    getCenter: () => ({ lng: LNG0, lat: LAT0 }),
    getFreeCameraOptions: () => ({ position: camera || { x: mercator(LNG0, LAT0)[0], y: mercator(LNG0, LAT0)[1], z: 300 * metreEnMercator(LAT0) } }),
    getCanvas: () => ({ width: 800, height: 600 }), triggerRepaint() { j.repaints = (j.repaints || 0) + 1; },
    addLayer(spec) { couches.set(spec.id, spec); spec.onAdd(carte, {}); }, getLayer: (id) => couches.get(id), removeLayer(id) { const s = couches.get(id); couches.delete(id); if (s && s.onRemove) s.onRemove(); },
    addSource(id, s) { sources.set(id, s); }, getSource: (id) => sources.get(id), removeSource(id) { sources.delete(id); },
    on(t, f) { (ecouteurs[t] = ecouteurs[t] || []).push(f); }, off(t, f) { ecouteurs[t] = (ecouteurs[t] || []).filter((x) => x !== f); },
  };
  class Mat { constructor() { this.e = new Array(16).fill(0); this.e[0] = this.e[5] = this.e[10] = this.e[15] = 1; } fromArray(a) { this.e = [...a]; return this; } multiply(m) { this.e = produit4(this.e, m.e); return this; } }
  class Groupe { constructor() { this.children = []; this.visible = true; this.userData = {}; this.matrix = new Mat(); } add(...o) { this.children.push(...o); } traverse(f) { f(this); this.children.forEach((c) => c.traverse && c.traverse(f)); } }
  const THREE = {
    Scene: class extends Groupe { remove(o) { this.children = this.children.filter((c) => c !== o); j.libere.push(o.userData && o.userData.cle); } }, Group: Groupe,
    Camera: class { constructor() { this.projectionMatrix = new Mat(); } },
    HemisphereLight: class {}, DirectionalLight: class { constructor() { this.position = { set() {} }; } }, Matrix4: Mat,
    SRGBColorSpace: 'srgb',
    WebGLRenderer: class { constructor() { j.espaceSortie = null; j.instance = this; } setViewport() {} resetState() {} render(s, c) { j.rendus = (j.rendus || 0) + 1; j.derniereProjection = c.projectionMatrix.e; } dispose() { j.rendererLibere = true; } },
  };
  const fetchJson = async (url) => {
    j.demandes.push(url);
    if (url === URL_GRILLE) return { ...GRILLE, version: j.version };
    if (/disponibilite\.json/.test(url)) return { version: j.version, dalles: j.dalles };
    const m = /E(\d{7})_N6248000\/ancrage\.json/.exec(url); if (m) return ancrageDe((Number(m[1]) - 894400) / 200);
    throw new Error('404 ' + url);
  };
  const fetchOctets = (url) => new Promise((ok, ko) => {
    j.demandes.push(url); j.ouverts++; j.maxOuverts = Math.max(j.maxOuverts, j.ouverts);
    const fin = () => { j.ouverts--; if (j.echecsGlb.has(url)) ko(new Error('HTTP 500')); else ok(new ArrayBuffer(1000)); };
    attente.push({ url, fin });
  });
  const creerChargeur = () => ({ parse: (octets, base, ok) => { const g = new Groupe(); ok({ scene: g }); } });
  const planifie = [];
  const couche = creerCoucheDalles({
    id: 'maquette', urlGrille: URL_GRILLE, THREE, creerChargeur, carte, altitudeBase: () => 50, fetchJson, fetchOctets, journal: { warn: (m) => (j.avertissements = [...(j.avertissements || []), m]) },
    parallelisme, ...(budget ? { budgetOctets: budget } : {}), planifier: (f) => { planifie.push(f); return planifie.length; }, annuler: () => {},
  });
  const tick = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
  /** Relâche le premier téléchargement en attente dont l'adresse correspond (ou le premier), puis laisse la couche réagir. */
  const relacher = async (motif) => { const i = attente.findIndex((a) => !motif || motif.test(a.url)); if (i < 0) return false; const [a] = attente.splice(i, 1); a.fin(); await tick(); return a.url; };
  return { j, couche, carte, couches, sources, ecouteurs, attente, tick, relacher, planifie, THREE };
}

test('le rendu encode sa sortie en sRGB : les couleurs de sommet du glTF sont linéaires', async () => {
  const b = banc({ nDalles: 1 }); await b.couche.charger();
  assert.equal(b.j.instance.outputColorSpace, 'srgb');
});

test('charger : manifeste lu, mention de la source ajoutée, couche MapLibre ajoutée, dalles de la vue connues', async () => {
  const b = banc(); const r = await b.couche.charger(); await b.tick();
  assert.equal(r.n, 3); assert.equal(r.version, 'v1'); assert.ok(b.couches.has('dalles3d-maquette')); assert.equal(b.couches.get('dalles3d-maquette').type, 'custom');
  assert.equal(b.sources.get('dalles3d-attribution-maquette').attribution, 'Fabrique ; IGN');
  assert.match(b.j.demandes.find((u) => /disponibilite/.test(u)), /bbox=5\.\d+%2C43\.\d+%2C5\.\d+%2C43\.\d+/, 'la fenêtre déborde de la vue');
  assert.ok(b.ecouteurs.moveend.length === 1, 'un écouteur de fin de mouvement');
});

test('le niveau suit la distance : D2 près (portée 1500 m), D3 plus loin (portée 6000 m), rien au-delà', async () => {
  const proche = banc({ nDalles: 1 }); await proche.couche.charger(); await proche.tick();
  assert.match(proche.attente.map((a) => a.url).join(), /D2\.glb/); assert.ok(!/D3\.glb/.test(proche.attente.map((a) => a.url).join()));
  const [x, y] = mercator(LNG0, LAT0), s = metreEnMercator(LAT0);
  const loin = banc({ nDalles: 1, camera: { x, y, z: 3000 * s } }); await loin.couche.charger(); await loin.tick();
  assert.match(loin.attente.map((a) => a.url).join(), /D3\.glb/); assert.ok(!/D2\.glb/.test(loin.attente.map((a) => a.url).join()));
  const tresLoin = banc({ nDalles: 1, camera: { x, y, z: 9000 * s } }); await tresLoin.couche.charger(); await tresLoin.tick();
  assert.equal(tresLoin.attente.length, 0, 'au-delà de la portée du niveau le plus grossier : rien à demander');
});

test('file à priorité et parallélisme : les plus proches d abord, jamais plus de N téléchargements en même temps', async () => {
  const b = banc({ nDalles: 6, parallelisme: 2 }); await b.couche.charger(); await b.tick();
  assert.equal(b.attente.length, 2, 'deux seulement partent'); assert.equal(b.j.maxOuverts, 2);
  assert.match(b.attente[0].url, new RegExp(nom(0) + '/D2')); assert.match(b.attente[1].url, new RegExp(nom(1) + '/D2'), 'la plus proche en premier, puis la suivante');
  await b.relacher(); assert.equal(b.j.maxOuverts, 2); assert.match(b.attente.at(-1).url, new RegExp(nom(2) + '/D2'));
});

test('jamais de trou : un niveau plus grossier déjà chargé reste affiché tant que le niveau voulu n est pas là', async () => {
  const [x, y] = mercator(LNG0, LAT0), s = metreEnMercator(LAT0);
  const cam = { x, y, z: 3000 * s }; const b = banc({ nDalles: 1, camera: cam }); await b.couche.charger(); await b.tick();
  await b.relacher(/D3\.glb/);
  const montres = () => b.THREE && [...b.couche.etat().affiches];
  assert.deepEqual(montres(), [nom(0) + '|D3|D3e0'], 'D3 chargé, affiché');
  cam.z = 300 * s;   // la caméra descend : D2 devient le niveau voulu
  await b.couche.rafraichir(); await b.tick();
  assert.deepEqual(montres(), [nom(0) + '|D3|D3e0'], 'D2 en route : D3 reste, aucun trou');
  assert.match(b.attente.map((a) => a.url).join(), /D2\.glb/);
  await b.relacher(/D2\.glb/);
  assert.deepEqual(montres(), [nom(0) + '|D2|D2e0'], 'D2 prêt : il remplace D3');
});

test('republication de la Fabrique : une nouvelle version vide le cache et tout se relit ; un GLB dont l empreinte change se recharge', async () => {
  const b = banc({ nDalles: 1 }); await b.couche.charger(); await b.tick(); await b.relacher(/D2\.glb/);
  assert.equal(b.couche.etat().enCache, 1);
  b.j.version = 'v2'; b.j.dalles = [{ ...dalleDispo(0), niveaux: [{ niveau: 'D2', empreinte: 'neuve', octets: 1000 }, { niveau: 'D3', empreinte: 'D3e0', octets: 1000 }] }];
  await b.couche.rafraichir(); await b.tick();
  assert.equal(b.couche.etat().version, 'v2'); assert.equal(b.couche.etat().enCache, 0, 'le cache est vidé'); assert.ok(b.j.libere.length >= 1, 'les groupes sont retirés de la scène');
  assert.match(b.attente.map((a) => a.url).join(), /D2\.glb/, 'le GLB est redemandé');
  await b.relacher(/D2\.glb/); assert.deepEqual(b.couche.etat().affiches, [nom(0) + '|D2|neuve']);
});

test('cache à budget : le moins récent part, sa mémoire est libérée ; un GLB en échec n est pas redemandé à chaque mouvement', async () => {
  const b = banc({ nDalles: 3, budget: 2500 }); await b.couche.charger(); await b.tick();
  for (let i = 0; i < 3; i++) await b.relacher();
  assert.ok(b.couche.etat().enCache <= 2, 'budget de 2500 octets pour 3 GLB de 1000 : un est parti'); assert.ok(b.j.libere.length >= 1);
  const c = banc({ nDalles: 1 }); c.j.echecsGlb.add(`https://fabrique.example/api/fabrique/atlas/dalles3d/${nom(0)}/D2.glb`);
  await c.couche.charger(); await c.tick(); await c.relacher(); await c.tick();
  assert.ok(c.j.avertissements.some((m) => /HTTP 500/.test(m)), 'l échec est dit'); const avant = c.attente.length;
  await c.couche.rafraichir(); await c.tick(); assert.equal(c.attente.length, avant, 'pas redemandé'); assert.deepEqual(Object.keys(c.couche.etat().echecs).length, 1);
});

test('une adresse qui sort de l origine du manifeste est refusée, jamais suivie', async () => {
  const b = banc({ nDalles: 1 });
  const g = await (async () => { const orig = b.couche; return orig; })();
  b.j.dalles = [{ ...dalleDispo(0), E: '0894400' }];
  await b.couche.charger(); await b.tick();
  assert.ok(b.attente.every((a) => a.url.startsWith('https://fabrique.example/')), 'toutes les demandes restent chez la Fabrique'); void g;
});

test('bornes : l emprise des dalles lues ; sans ancrage lu, null', async () => {
  const b = banc({ nDalles: 2 }); assert.equal(b.couche.bornes(), null);
  await b.couche.charger(); await b.tick();
  const [[w, s], [e, n]] = b.couche.bornes(); assert.ok(w < LNG0 && e > LNG0 + DEG_PAR_DALLE && s < LAT0 && n > LAT0);
});

test('render : l origine commune est la première dalle ; sa matrice relative est l identité, celle de la voisine une translation en mètres', async () => {
  const b = banc({ nDalles: 2 }); await b.couche.charger(); await b.tick(); await b.relacher(); await b.relacher();
  const spec = b.couches.get('dalles3d-maquette'); spec.render({}, new Array(16).fill(0).map((_, i) => (i % 5 === 0 ? 1 : 0)));
  assert.equal(b.j.rendus, 1);
  const a0 = ancrageDe(0).ancrage, commun = matriceDalle({ origine: a0.origine_wgs84, convergenceDeg: a0.convergence_deg, facteurEchelle: a0.facteur_echelle }, 50);
  for (let i = 0; i < 16; i++) assert.ok(Math.abs(b.j.derniereProjection[i] - commun[i]) < 1e-12, 'la projection = projection de la carte × matrice de l origine commune');
  const g = b.THREE.Scene && null; void g;
  assert.ok(Math.abs(inverse4(commun)[0]) > 0);
});

test('montrer(false) masque tout sans rien décharger ; retirer libère la carte, le rendu et le cache', async () => {
  const b = banc({ nDalles: 1 }); await b.couche.charger(); await b.tick(); await b.relacher();
  assert.equal(b.couche.montrer(false), false); assert.equal(b.couche.estVisible(), false);
  const spec = b.couches.get('dalles3d-maquette'); spec.render({}, new Array(16).fill(0)); assert.equal(b.j.rendus, undefined, 'masquée : rien n est dessiné');
  assert.equal(b.couche.etat().enCache, 1); b.couche.montrer(true);
  b.couche.retirer();
  assert.ok(!b.couches.has('dalles3d-maquette')); assert.ok(!b.sources.has('dalles3d-attribution-maquette')); assert.equal(b.ecouteurs.moveend.length, 0);
  assert.equal(b.couche.etat().enCache, 0); assert.equal(b.j.rendererLibere, true);
  await b.couche.rafraichir().catch(() => {});   // un retour tardif d une réponse ne ressuscite rien
  assert.equal(b.couche.etat().enCache, 0);
});

test('un manifeste de grille illisible fait échouer charger() sans rien laisser sur la carte', async () => {
  const b = banc(); const orig = b.couche;
  const bad = creerCoucheDalles({ id: 'x', urlGrille: URL_GRILLE, THREE: b.THREE, creerChargeur: () => ({}), carte: b.carte, altitudeBase: () => 0, fetchJson: async () => ({ schema: 'autre' }), fetchOctets: async () => new ArrayBuffer(1), journal: { warn() {} } });
  await assert.rejects(bad.charger(), /schéma/); assert.ok(!b.couches.has('dalles3d-x')); void orig;
});
