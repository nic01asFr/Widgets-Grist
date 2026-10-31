/**
 * Contrat 0.4 : `getBuildings`, les bâtiments visibles du fond (emprises et hauteurs) pour une page qui pose sa propre 3D.
 * L'échantillon (tests/fixtures/batiments-openfreemap-marseille.json) est lu dans les tuiles réelles : un bâtiment coupé en deux fragments, une copie identique,
 * deux bâtiments seuls.
 * node --test projects/Atlas/tests/bi-batiments-0-4.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attacher } from '../lib/bi/bi-runtime.js';
import { batimentsDeEntites, normaliserOptionsBatiments, creerLimiteur, intersection, LIMITE_DEFAUT, LIMITE_MAX, SOMMETS_PAR_ENTITE_MAX, OCTETS_MAX, ATTRIBUTION } from '../lib/bi/batiments.js';
import { COMMANDES, COMMANDES_0_4, CAPACITE_DE_COMMANDE, validerCommande } from '../lib/bi/pont.js';
import { TEXTES_COMMANDES } from '../lib/bi/describe.js';
import { carteSimulee } from './aide-carte-bi.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const ECHANTILLON = JSON.parse(fs.readFileSync(path.join(ICI, 'fixtures', 'batiments-openfreemap-marseille.json'), 'utf8')).features;
const MONDE = [-180, -90, 180, 90];
const lire = (opt = {}) => batimentsDeEntites(ECHANTILLON, { bbox: MONDE, limite: LIMITE_DEFAUT, hauteurMin: 0, ...opt });

test('contrat : getBuildings est une commande 0.4 de la capacité socle, décrite, refusée à un hôte resté en 0.3', () => {
  assert.ok('getBuildings' in COMMANDES && COMMANDES_0_4.includes('getBuildings')); assert.equal(CAPACITE_DE_COMMANDE.getBuildings, 'socle');
  assert.ok(Array.isArray(TEXTES_COMMANDES.getBuildings) && /ODbL/.test(TEXTES_COMMANDES.getBuildings[0]));
  const ctx = { origine: 'https://hote.test', autorisees: ['https://hote.test'] };
  assert.equal(validerCommande({ source: 'hote-bi', version: '0.3', id: 'a', cmd: 'getBuildings', args: [] }, ctx).code, 'version');
  assert.equal(validerCommande({ source: 'hote-bi', version: '0.4', id: 'a', cmd: 'getBuildings', args: [{ limite: 10 }] }, ctx).ok, true);
  assert.equal(validerCommande({ source: 'hote-bi', version: '0.4', id: 'a', cmd: 'getBuildings', args: ['x'] }, ctx).code, 'argument');
});

test('échantillon réel : la copie identique est retirée, un bâtiment coupé garde ses deux fragments marqués coupe:true', () => {
  const r = lire();
  assert.equal(r.total, 5); assert.equal(r.features.length, 5); assert.equal(r.tronque, false); assert.deepEqual(r.avertissements, []);
  const parId = (id) => r.features.filter((f) => f.id === id);
  assert.equal(parId(6998751562).length, 2); assert.ok(parId(6998751562).every((f) => f.properties.coupe === true), 'les deux fragments');
  assert.equal(parId(2644237122).length, 1, 'la copie identique est retirée'); assert.equal(parId(2644237122)[0].properties.coupe, false);
  assert.ok(parId(2652470892)[0].properties.coupe === false && parId(689412552)[0].properties.coupe === false);
});

test('propriétés : hauteur, base et coupe seulement, en nombres ; id et géométrie recopiés', () => {
  for (const f of lire().features) {
    assert.equal(f.type, 'Feature'); assert.deepEqual(Object.keys(f.properties).sort(), ['base', 'coupe', 'hauteur']);
    assert.ok(Number.isFinite(f.properties.hauteur) && Number.isFinite(f.properties.base) && typeof f.properties.coupe === 'boolean');
    assert.ok(['Polygon', 'MultiPolygon'].includes(f.geometry.type)); assert.ok(typeof f.id === 'number');
  }
  const b = lire().features.find((f) => f.id === 2652470892); assert.deepEqual([b.properties.hauteur, b.properties.base], [19, 15]);
});

test('emprise utile : seuls les bâtiments qui touchent la bbox sont rendus', () => {
  const r = lire({ bbox: [5.3575, 43.2940, 5.3586, 43.2945] });
  assert.deepEqual(r.features.map((f) => f.id), [2652470892]);
  assert.equal(lire({ bbox: [10, 10, 11, 11] }).features.length, 0);
});

test('hauteurMin : écarte les bâtiments plus bas, et ceux dont la hauteur est inconnue', () => {
  assert.deepEqual(lire({ hauteurMin: 20 }).features.map((f) => f.id).sort((a, b) => a - b), [689412552, 2644237122]);
  const inconnue = batimentsDeEntites([{ id: 1, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: {} }], { bbox: MONDE, limite: 10, hauteurMin: 1 });
  assert.equal(inconnue.features.length, 0);
});

test('limite : au-delà, la liste est tronquée et le dit ; total compte tout ce qui passe les filtres', () => {
  const r = lire({ limite: 2 });
  assert.equal(r.features.length, 2); assert.equal(r.tronque, true); assert.equal(r.total, 5); assert.ok(r.avertissements.some((a) => /^limite :/.test(a)));
});

test('rien d\'une tuile tierce ne traverse : une chaîne n\'est pas une hauteur, un nom est écarté, NaN devient la base par défaut', () => {
  const g = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
  const r = batimentsDeEntites([{ id: 'x1', geometry: g, properties: { render_height: '12', render_min_height: NaN, name: '<img src=x onerror=alert(1)>', colour: 'red' } }], { bbox: MONDE, limite: 10, hauteurMin: 0 });
  const p = r.features[0].properties;
  assert.deepEqual(p, { hauteur: null, base: 0, coupe: false }); assert.ok(!JSON.stringify(r).includes('onerror') && !JSON.stringify(r).includes('red'));
  assert.equal(r.features[0].id, 'x1', 'un identifiant texte est gardé');
});

test('entités sans géométrie de surface ignorées et comptées ; entités sans id : pas d\'id, dédoublonnées par géométrie', () => {
  const g = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
  const r = batimentsDeEntites([null, { id: 1, geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} }, { geometry: g, properties: { render_height: 5 } }, { geometry: g, properties: { render_height: 5 } }, { id: {}, geometry: g, properties: { render_height: 6 } }],
    { bbox: MONDE, limite: 10, hauteurMin: 0 });
  assert.equal(r.features.length, 1, 'trois entités identiques sans id : une seule'); assert.ok(!('id' in r.features[0]));
  assert.ok(r.avertissements.some((a) => /^entites-ignorees : 2/.test(a)));
});

const polygone = (id, sommets, x0 = 0) => ({ id, geometry: { type: 'Polygon', coordinates: [Array.from({ length: sommets }, (_, i) => [x0 + i * 1e-6, 1 + (i % 2) * 1e-6])] }, properties: { render_height: 1 } });

test('une entité géante (ensemble, pas un bâtiment) est ignorée et nommée, sans priver l\'hôte des autres (cas mesuré : 35 216 sommets, 2 bâtiments rendus sur 55)', () => {
  const r = batimentsDeEntites([polygone(111, SOMMETS_PAR_ENTITE_MAX + 1), polygone(222, 50), polygone(333, 80, 5)], { bbox: MONDE, limite: 100, hauteurMin: 0 });
  assert.deepEqual(r.features.map((f) => f.id), [222, 333]); assert.equal(r.total, 2);
  assert.ok(r.avertissements.some((a) => /^geometrie-trop-grande : 1 entité\(s\) de plus de 20000 sommets ignorée\(s\) \(identifiants : 111\)/.test(a)), r.avertissements.join(' | '));
  assert.equal(r.tronque, false, 'une entité ignorée n\'est pas une troncature');
});

test('budget de taille : l\'entité qui le ferait dépasser est sautée, les suivantes, plus petites, passent ; tronque et un seul avertissement taille', () => {
  const grandes = Array.from({ length: 12 }, (_, i) => polygone(1000 + i, 19000, i * 10));   // 12 x 19 000 sommets : le plafond de 200 000 sommets arrête le onzième
  const r = batimentsDeEntites([...grandes, polygone(9, 30, 150)], { bbox: MONDE, limite: 100, hauteurMin: 0 });
  assert.equal(r.tronque, true); assert.equal(r.avertissements.filter((a) => /^taille :/.test(a)).length, 1);
  assert.ok(r.features.length >= 1 && r.features.length < 12);
  assert.ok(r.features.some((f) => f.id === 9), 'la petite entité de la fin passe malgré les grandes sautées');
  assert.ok(JSON.stringify(r.features).length <= OCTETS_MAX + 1024, 'la réponse reste sous le plafond');
});

test('options : bornes et formes vérifiées, messages lisibles', () => {
  assert.deepEqual(normaliserOptionsBatiments(), { limite: LIMITE_DEFAUT, hauteurMin: 0, bbox: null });
  assert.deepEqual(normaliserOptionsBatiments({ limite: 10, hauteurMin: 3, bbox: [1, 2, 3, 4] }), { limite: 10, hauteurMin: 3, bbox: [1, 2, 3, 4] });
  for (const l of [0, -1, LIMITE_MAX + 1, 1.5, '10', NaN]) assert.throws(() => normaliserOptionsBatiments({ limite: l }), /limite hors bornes \(1 à 5000\)/, String(l));
  for (const h of [-1, 1001, NaN, '3']) assert.throws(() => normaliserOptionsBatiments({ hauteurMin: h }), /hauteurMin hors bornes/, String(h));
  for (const b of [[1, 2], [3, 2, 1, 4], [1, 4, 3, 2], [-181, 0, 1, 1], [0, 0, 181, 1], [0, -91, 1, 1], [0, 0, 1, 91], 'x', [NaN, 0, 1, 1]]) assert.throws(() => normaliserOptionsBatiments({ bbox: b }), /bbox mal formée/, JSON.stringify(b));
  assert.throws(() => normaliserOptionsBatiments([]), /objet d'options/); assert.throws(() => normaliserOptionsBatiments(null), /objet d'options/);
});

test('limiteur : cinq appels par seconde, le sixième est refusé, la seconde suivante repart', () => {
  let t = 0; const ok = creerLimiteur(() => t);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(() => ok()), [true, true, true, true, true, false]);
  t = 999; assert.equal(ok(), false); t = 1000; assert.equal(ok(), true);
});

test('intersection de deux emprises', () => {
  assert.deepEqual(intersection([0, 0, 10, 10], [5, 5, 20, 20]), [5, 5, 10, 10]);
  assert.equal(intersection([0, 0, 1, 1], [2, 2, 3, 3]), null); assert.equal(intersection([0, 0, 1, 1], [1, 0, 2, 1]), null, 'une arête commune n\'est pas une emprise');
});

// ---- la commande, sur une carte simulée ----
function carteBati({ zoom = 16, source = true, entites = ECHANTILLON, bounds = [5.35, 43.29, 5.38, 43.31] } = {}) {
  const m = carteSimulee();
  m.getZoom = () => zoom;
  m.getBounds = () => ({ getWest: () => bounds[0], getSouth: () => bounds[1], getEast: () => bounds[2], getNorth: () => bounds[3] });
  m.getSource = (id) => (source && id === 'openmaptiles' ? {} : undefined);
  m.demandes = []; m.querySourceFeatures = (id, o) => { m.demandes.push([id, o]); return entites; };
  return m;
}
const horloge = () => { const h = { t: 0, maintenant: () => h.t, setTimeout, clearTimeout }; return h; };

test('commande : lit la couche building de la source openmaptiles, rend un FeatureCollection avec attribution, emprise et zoom', async () => {
  const m = carteBati(); const rt = attacher(m, { horloge: horloge() });
  const r = await rt.api.getBuildings();
  assert.equal(r.type, 'FeatureCollection'); assert.equal(r.features.length, 5); assert.equal(r.total, 5); assert.equal(r.tronque, false);
  assert.equal(r.source, 'openmaptiles'); assert.equal(r.attribution, ATTRIBUTION); assert.match(r.attribution, /OpenStreetMap/); assert.equal(r.zoom, 16);
  assert.deepEqual(r.bounds, [5.35, 43.29, 5.38, 43.31]);
  assert.deepEqual(m.demandes, [['openmaptiles', { sourceLayer: 'building' }]]);
});

test('commande : la bbox demandée est intersectée avec la vue, jamais élargie', async () => {
  const rt = attacher(carteBati({ bounds: [5.355, 43.29, 5.38, 43.31] }), { horloge: horloge() });
  const r = await rt.api.getBuildings({ bbox: [5.0, 43.0, 5.36, 43.2955] });
  assert.deepEqual(r.bounds, [5.355, 43.29, 5.36, 43.2955]);
  assert.ok(r.features.every((f) => f.geometry.coordinates[0][0][0] <= 5.36 + 0.01));
  const loin = await rt.api.getBuildings({ bbox: [1, 1, 2, 2] });
  assert.equal(loin.features.length, 0); assert.ok(loin.avertissements.some((a) => /^emprise :/.test(a)));
});

test('commande : sous le zoom 14, liste vide et avertissement zoom-trop-faible ; la source n\'est pas interrogée', async () => {
  const m = carteBati({ zoom: 12.3 }); const r = await attacher(m, { horloge: horloge() }).api.getBuildings();
  assert.equal(r.features.length, 0); assert.match(r.avertissements[0], /^zoom-trop-faible : .*zoom 14 .*12\.3/); assert.equal(m.demandes.length, 0);
});

test('commande : un fond sans bâti (source absente) est une erreur lisible', async () => {
  const rt = attacher(carteBati({ source: false }), { horloge: horloge() });
  await assert.rejects(async () => rt.api.getBuildings(), /batiments : ce fond n'a pas de bâti \(source absente\)/);
});

test('commande : options refusées avant toute lecture ; au plus cinq appels par seconde', async () => {
  const h = horloge(); const m = carteBati(); const rt = attacher(m, { horloge: h });
  await assert.rejects(async () => rt.api.getBuildings({ bbox: [1, 2] }), /bbox mal formée/); assert.equal(m.demandes.length, 0);
  for (let i = 0; i < 5; i++) await rt.api.getBuildings();
  await assert.rejects(async () => rt.api.getBuildings(), /trop_frequent \(5 appels par seconde au plus\)/);
  h.t = 1001; assert.equal((await rt.api.getBuildings()).features.length, 5);
});
