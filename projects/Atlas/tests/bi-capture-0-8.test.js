/**
 * Contrat 0.8 : `captureImage`, une image de la carte dans son état présent (figure papier).
 * node --test projects/Atlas/tests/bi-capture-0-8.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { normaliserOptionsCapture, texteDAttribution, mentionsDeSources, dimensionsImage, composerImage, creerLimiteur, OCTETS_MAX, PIXELS_MAX } from '../lib/bi/capture-image.js';
import { COMMANDES, COMMANDES_0_8, CAPACITE_DE_COMMANDE, validerCommande, versionDeCommande } from '../lib/bi/pont.js';
import { TEXTES_COMMANDES } from '../lib/bi/describe.js';
import { carteSimulee } from './aide-carte-bi.js';

/** Une fabrique de canevas 2D simulée : elle consigne les appels de dessin et rend une URL de données de la taille demandée. */
function fabriqueSimulee({ refus = null, octets = 1000 } = {}) {
  const journal = [];
  const fabrique = (w, h) => {
    const dessins = [];
    const ctx = { fillStyle: '', font: '', textBaseline: '', fillRect: (...a) => dessins.push(['fillRect', ...a]), drawImage: (...a) => dessins.push(['drawImage', a[1], a[2], a[3], a[4]]), fillText: (t) => dessins.push(['fillText', t]), measureText: (t) => ({ width: t.length * 5 }) };
    const c = { width: w, height: h, dessins, getContext: () => ctx, toDataURL: (mime) => { if (refus) throw new Error(refus); return 'data:' + mime + ';base64,' + 'A'.repeat(Math.ceil((octets * 4) / 3)); } };
    journal.push(c); return c;
  };
  fabrique.journal = journal; return fabrique;
}

test('contrat : captureImage est une commande 0.8 de la capacité socle, décrite, refusée à un hôte resté en 0.7', () => {
  assert.ok(COMMANDES_0_8.includes('captureImage') && 'captureImage' in COMMANDES); assert.equal(versionDeCommande('captureImage'), '0.8'); assert.equal(CAPACITE_DE_COMMANDE.captureImage, 'socle');
  assert.ok(Array.isArray(TEXTES_COMMANDES.captureImage) && TEXTES_COMMANDES.captureImage[0].length > 100);
  const ctx = { origine: 'https://hote.test', autorisees: ['https://hote.test'] };
  const msg = (version, args) => ({ source: 'hote-bi', version, id: 'a', cmd: 'captureImage', args });
  assert.equal(validerCommande(msg('0.7', []), ctx).code, 'version');
  assert.equal(validerCommande(msg('0.8', []), ctx).ok, true);
  assert.equal(validerCommande(msg('0.8', [{ format: 'jpeg', largeur: 1200 }]), ctx).ok, true);
  assert.equal(validerCommande(msg('0.8', ['x']), ctx).code, 'argument');
});

test('options : format, qualité, largeur, drapeaux et délai vérifiés', () => {
  assert.deepEqual(normaliserOptionsCapture(), { format: 'png', mime: 'image/png', qualite: 0.92, largeur: null, mentions: true, attendre: true, delai: 15000 });
  assert.equal(normaliserOptionsCapture({ format: 'jpeg', largeur: 800, mentions: false, attendre: false }).mime, 'image/jpeg');
  for (const mauvais of [{ format: 'gif' }, { format: 'toString' }, { qualite: 0 }, { qualite: 2 }, { largeur: 10 }, { largeur: 9000 }, { largeur: 800.5 }, { mentions: 'oui' }, { attendre: 1 }, { delai: 5 }, { x: 1 }, 'x', []]) assert.throws(() => normaliserOptionsCapture(mauvais), /captureImage/, JSON.stringify(mauvais));
  assert.throws(() => normaliserOptionsCapture({ format: 'gif' }), /format_invalide/);
});

test('mentions : le HTML d\'une attribution devient du texte, sans doublon, la source d\'altitude est écartée', () => {
  assert.equal(texteDAttribution('<a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="x">OpenMapTiles</a> Data from <a>OpenStreetMap</a> &amp; co'), 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap & co');
  assert.equal(texteDAttribution(12), '');
  const m = mentionsDeSources({ a: { type: 'vector', attribution: '© OSM' }, b: { type: 'vector', attribution: '<b>© OSM</b>' }, c: { type: 'raster-dem', attribution: 'Relief' }, d: { type: 'geojson' } }, ['Ma donnée']);
  assert.deepEqual(m, ['© OSM', 'Ma donnée']);
  assert.deepEqual(mentionsDeSources(undefined), []);
});

test('dimensions : la largeur demandée sans agrandir, le rapport conservé, les plafonds', () => {
  assert.deepEqual(dimensionsImage(2000, 1000, null), { w: 2000, h: 1000, avertissements: [] });
  assert.deepEqual(dimensionsImage(2000, 1000, 500), { w: 500, h: 250, avertissements: [] });
  const grand = dimensionsImage(800, 400, 4000); assert.equal(grand.w, 800); assert.ok(/agrandissement-refuse/.test(grand.avertissements[0]));
  assert.throws(() => dimensionsImage(0, 10, null), /carte_vide/);
  assert.throws(() => dimensionsImage(8000, 8000, null), /image_trop_grande/);
  assert.ok(PIXELS_MAX >= 8000 * 4000);
});

test('composition : la source réduite, un fond blanc hors png, la mention en pied, le résultat complet', () => {
  const f = fabriqueSimulee({ octets: 3000 });
  const r = composerImage({ width: 2000, height: 1000 }, normaliserOptionsCapture({ format: 'jpeg', largeur: 1000 }), ['© OpenStreetMap', 'OpenMapTiles'], f);
  assert.equal(r.largeur, 1000); assert.equal(r.hauteur, 500); assert.equal(r.mime, 'image/jpeg'); assert.ok(r.image.startsWith('data:image/jpeg;base64,'));
  assert.ok(Math.abs(r.octets - 3000) <= 3, 'octets estimés'); assert.deepEqual(r.attributions, ['© OpenStreetMap', 'OpenMapTiles']);
  const d = f.journal[0].dessins;
  assert.deepEqual(d[0].slice(0, 1), ['fillRect'], 'fond blanc sous le jpeg'); assert.ok(d.some((x) => x[0] === 'drawImage' && x[3] === 1000 && x[4] === 500));
  const pied = d.find((x) => x[0] === 'fillText'); assert.ok(pied && pied[1].startsWith('© © OpenStreetMap') === false && pied[1].startsWith('© OpenStreetMap | OpenMapTiles'));
  // png : pas de fond blanc, transparence gardée
  const g = fabriqueSimulee(); composerImage({ width: 400, height: 200 }, normaliserOptionsCapture(), ['x'], g);
  assert.equal(g.journal[0].dessins[0][0], 'drawImage');
  // sans pied
  const h = fabriqueSimulee(); const sans = composerImage({ width: 400, height: 200 }, normaliserOptionsCapture({ mentions: false }), ['x'], h);
  assert.ok(!h.journal[0].dessins.some((x) => x[0] === 'fillText')); assert.deepEqual(sans.attributions, ['x']);
  // aucune mention : dit
  assert.ok(composerImage({ width: 400, height: 200 }, normaliserOptionsCapture(), [], fabriqueSimulee()).avertissements.some((a) => /^attribution-vide/.test(a)));
});

test('composition : un canevas souillé donne canvas_illisible, une image trop lourde image_trop_lourde, un format non encodé format_indisponible', () => {
  assert.throws(() => composerImage({ width: 400, height: 200 }, normaliserOptionsCapture(), [], fabriqueSimulee({ refus: 'Tainted canvases may not be exported' })), (e) => /canvas_illisible/.test(e.message) && /Tainted/.test(e.message));
  assert.throws(() => composerImage({ width: 400, height: 200 }, normaliserOptionsCapture(), [], fabriqueSimulee({ octets: OCTETS_MAX + 2000 })), /image_trop_lourde/);
  const png = (w, h) => ({ width: w, height: h, getContext: () => ({ fillRect() {}, drawImage() {}, fillText() {}, measureText: () => ({ width: 1 }) }), toDataURL: () => 'data:image/png;base64,AAAA' });
  assert.throws(() => composerImage({ width: 400, height: 200 }, normaliserOptionsCapture({ format: 'webp' }), [], png), /format_indisponible/);
  assert.throws(() => composerImage({ width: 400, height: 200 }, normaliserOptionsCapture(), [], () => ({ getContext: () => null })), /canvas_indisponible/);
});

test('limiteur : un appel par seconde', () => {
  let t = 0; const passe = creerLimiteur(() => t);
  assert.equal(passe(), true); assert.equal(passe(), false); t = 1000; assert.equal(passe(), true);
});

function carteACapturer() {
  const m = carteSimulee();
  const ecouteurs = [];
  m.getCanvas = () => ({ width: 1600, height: 900, style: {} });
  m.once = (t, f) => { if (t === 'render') setTimeout(f, 0); };
  m.triggerRepaint = () => {};
  m.getStyle = () => ({ layers: [], glyphs: '', sources: { fond: { type: 'vector', attribution: '<a href="https://openmaptiles.org/">© OpenMapTiles</a>' }, relief: { type: 'raster-dem', attribution: 'Relief' } } });
  m.getBounds = () => ({ getWest: () => 5.3, getSouth: () => 43.2, getEast: () => 5.5, getNorth: () => 43.4 });
  return m;
}

test('runtime : la capture rend l\'image, les mentions de source et la caméra pour retrouver la vue', async () => {
  const f = fabriqueSimulee({ octets: 5000 });
  const { api } = attacher(carteACapturer(), { fabriqueCanvas: f });
  const r = await api.captureImage({ largeur: 800 });
  assert.equal(r.format, 'png'); assert.equal(r.largeur, 800); assert.equal(r.hauteur, 450); assert.ok(r.image.startsWith('data:image/png;base64,'));
  assert.deepEqual(r.attributions, ['© OpenMapTiles']);
  assert.ok(r.camera && Array.isArray(r.camera.center), 'la caméra de la figure');
  assert.equal(f.journal[0].width, 1600, 'la copie du tampon de la carte est faite à taille réelle, pendant le rendu');
  assert.deepEqual(r.avertissements, []);
});

test('runtime : des refus à code, un rythme limité', async () => {
  let t = 0;
  const { api } = attacher(carteACapturer(), { fabriqueCanvas: fabriqueSimulee({ refus: 'Tainted' }), horloge: { maintenant: () => (t += 2000) } });
  await assert.rejects(api.captureImage(), /canvas_illisible/);
  await assert.rejects(api.captureImage({ format: 'bmp' }), /format_invalide/);
  const vite = attacher(carteACapturer(), { fabriqueCanvas: fabriqueSimulee() });
  await vite.api.captureImage(); await assert.rejects(vite.api.captureImage(), /trop_frequent/);
});

test('runtime : la mention d\'une source décrite par TileJSON est lue dans la source chargée, pas dans le style', async () => {
  const m = carteACapturer();
  m.getStyle = () => ({ layers: [], glyphs: '', sources: { fond: { type: 'vector', url: 'https://tuiles.test/planet' }, relief: { type: 'raster-dem', attribution: 'Relief' } } });
  m.getSource = (id) => (id === 'fond' ? { attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> © OpenMapTiles' } : null);
  const { api } = attacher(m, { fabriqueCanvas: fabriqueSimulee({ octets: 2000 }) });
  const r = await api.captureImage({ largeur: 800 });
  assert.deepEqual(r.attributions, ['OpenFreeMap © OpenMapTiles']);
  assert.ok(!r.avertissements.some((a) => /^attribution-vide/.test(a)));
});
