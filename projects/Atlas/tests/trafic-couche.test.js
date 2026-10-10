/**
 * Un trafic simulé sur les routes d'une couche (lib/trafic-couche.js) : adaptation des tronçons, comptes, repère, et le cycle de vie sur une carte simulée.
 * node --test projects/Atlas/tests/trafic-couche.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  adapterTroncons, centreDe, longueurKm, nombreDeVehicules, versLngLat, instantane, creerTrafic, libelleMotifs,
  DENSITE_DEFAUT, VEHICULES_MIN, VEHICULES_MAX, ID_SOURCE, CADENCE_MS,
} from '../lib/trafic-couche.js';
import { Trafic } from '../lib/trafic/index.js';
import { carteSimulee } from './aide-carte-bi.js';

const require = createRequire(import.meta.url);
const S = require('./aide-trafic-reseau.js');

const ligne = (props, ...coords) => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } });
const A = [5.0, 43.0], B = [5.002, 43.0], C = [5.002, 43.002];

test('le moteur se charge sous un seul nom, par le module', () => {
  assert.equal(typeof Trafic.construire, 'function');
  assert.equal(typeof Trafic.creer, 'function');
});

test('adapterTroncons : écarte ce qu\'un véhicule ne parcourt pas, garde le reste', () => {
  const { troncons, ecartes } = adapterTroncons([
    ligne({ highway: 'residential' }, A, B),
    ligne({ highway: 'footway' }, A, B),
    ligne({ highway: 'path' }, A, B),
    ligne({ nature: 'Sentier' }, A, B),
    ligne({ nature: 'Escalier' }, A, B),
    ligne({ nature: 'Piste cyclable' }, A, B),
    ligne({ etat_de_l_objet: 'Projet' }, A, B),
    ligne({ acces_vehicule_leger: 'Physiquement impossible' }, A, B),
    { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: A } },
    { type: 'Feature', properties: {}, geometry: null },
    ligne({}, A),
  ]);
  assert.equal(troncons.length, 1);
  assert.equal(ecartes, 10);
});

test('adapterTroncons : le sens vient de la BD TOPO, sinon d\'OpenStreetMap ; l\'importance de la classe de la route', () => {
  const { troncons } = adapterTroncons([
    ligne({ sens_de_circulation: 'Sens inverse', highway: 'primary', oneway: 'yes' }, A, B),
    ligne({ oneway: 'yes', highway: 'secondary' }, B, C),
    ligne({ oneway: '-1', highway: 'tertiary' }, B, C),
    ligne({ junction: 'roundabout', highway: 'residential' }, B, C),
    ligne({ highway: 'residential' }, B, C),
    ligne({ sens_de_circulation: '', oneway: 'yes', highway: 'residential' }, B, C),
    ligne({ importance: '2', highway: 'service' }, A, B),
    ligne({ highway: 'motorway' }, A, B),
    ligne({ highway: 'invention' }, A, B),
  ]);
  assert.deepEqual(troncons.map((t) => t.properties.sens_de_circulation), ['Sens inverse', 'Sens direct', 'Sens inverse', 'Sens direct', 'Double sens', 'Sens direct', 'Double sens', 'Sens direct']);   // la route de classe inconnue (« invention ») est écartée : les autres se déclarent
  assert.deepEqual(troncons.map((t) => t.properties.importance), ['2', '3', '4', '5', '5', '5', '2', '1']);
});

test('adapterTroncons : identifiants, valeurs par défaut du moteur, MultiLineString lue par sa première ligne, entrée non modifiée', () => {
  const brut = [ligne({ highway: 'residential' }, A, B), { type: 'Feature', id: 7, properties: {}, geometry: { type: 'MultiLineString', coordinates: [[A, C], [B, C]] } }];
  brut[1].properties = { highway: 'residential' };
  const copie = JSON.stringify(brut);
  const { troncons } = adapterTroncons(brut);
  assert.equal(JSON.stringify(brut), copie, 'les entités de la couche ne sont pas modifiées');
  assert.equal(troncons[0].properties.cleabs, 'atlas:0');
  assert.equal(troncons[1].properties.cleabs, 'atlas:7');
  assert.deepEqual(troncons[1].geometry.coordinates, [A, C]);
  for (const t of troncons) {
    assert.equal(t.properties.position_par_rapport_au_sol, '0');
    assert.equal(t.properties.etat_de_l_objet, 'En service');
    assert.equal(t.properties.acces_vehicule_leger, 'Libre');
  }
  assert.deepEqual(adapterTroncons(undefined), { troncons: [], ecartes: 0, motifs: {} });
});

test('centre, longueur et nombre de véhicules : bornés et sensés', () => {
  const { troncons } = adapterTroncons([ligne({}, [5, 43], [5.01, 43]), ligne({}, [5.01, 43], [5.01, 43.01])]);
  const c = centreDe(troncons);
  assert.deepEqual(c.map((v) => +v.toFixed(4)), [5.005, 43.005]);
  const km = longueurKm(troncons, c);
  assert.ok(Math.abs(km - (0.8139 + 1.1057)) < 0.02, 'environ 1,92 km, mesuré ' + km.toFixed(3));
  assert.equal(nombreDeVehicules(0.1), VEHICULES_MIN, 'plancher');
  assert.equal(nombreDeVehicules(1000), VEHICULES_MAX, 'plafond');
  assert.equal(nombreDeVehicules(10, 8), 80);
  assert.equal(nombreDeVehicules(10, 0), 10 * DENSITE_DEFAUT, 'une densité invalide retombe sur la valeur par défaut');
  assert.equal(nombreDeVehicules(10, NaN), 10 * DENSITE_DEFAUT);
});

test('versLngLat : le repère du moteur (mètres autour du centre) et la carte (degrés) se répondent', () => {
  const c = [5, 43];
  assert.deepEqual(versLngLat(c, 0, 0), c);
  const [lng, lat] = versLngLat(c, 100, 200);
  assert.ok(Math.abs((lng - 5) * 111320 * Math.cos(43 * Math.PI / 180) - 100) < 1e-6);
  assert.ok(Math.abs((lat - 43) * 111320 - 200) < 1e-6);
  // la même formule que l'aide des tests du moteur (ll)
  const M = 111320, k = Math.cos(43 * Math.PI / 180), [x, y] = [37, -12];
  assert.deepEqual(versLngLat(c, x, y).map((v) => +v.toFixed(9)), [5 + x / (M * k), 43 + y / M].map((v) => +v.toFixed(9)));
});

test('creerTrafic : refuse une couche sans route, et dit pourquoi', () => {
  const carte = carteSimulee();
  assert.throws(() => creerTrafic({ carte, entites: [] }), /aucune route ouverte à la circulation/);
  assert.throws(() => creerTrafic({ carte, entites: [ligne({ highway: 'footway' }, A, B)] }), /aucune route ouverte à la circulation/);
  assert.equal(carte.sources.size, 0, 'rien n\'est posé sur la carte tant que le trafic n\'est pas démarré');
});

test('creerTrafic : démarrer pose une source et une couche, chaque image déplace les véhicules, arrêter nettoie', () => {
  const carte = carteSimulee();
  const taches = [];
  const t = creerTrafic({ carte, entites: S.grille({ nv: 2 }), densite: 8, graine: 5, planifier: (f, ms) => { taches.push({ f, ms }); return taches.length; }, annuler: () => {} });
  assert.equal(carte.sources.size, 0);
  const e0 = t.demarrer();
  assert.equal(e0.actif, true); assert.equal(e0.simule, true);
  assert.ok(carte.sources.has(ID_SOURCE) && carte.calques.some((l) => l.id === ID_SOURCE), 'source et couche posées');
  assert.equal(taches.length, 1); assert.equal(taches[0].ms, CADENCE_MS);
  const avant = JSON.stringify(carte.sources.get(ID_SOURCE).data.features.map((f) => f.geometry.coordinates));
  const n = carte.sources.get(ID_SOURCE).data.features.length;
  assert.ok(n >= VEHICULES_MIN && n === e0.vehicules, 'un point par véhicule (' + n + ')');
  for (let i = 0; i < 25; i++) taches[0].f();
  const apres = JSON.stringify(carte.sources.get(ID_SOURCE).data.features.map((f) => f.geometry.coordinates));
  assert.notEqual(apres, avant, 'les véhicules ont roulé');
  assert.ok(t.etat().temps >= 5, 'le temps simulé avance (' + t.etat().temps + ' s)');
  const f = carte.sources.get(ID_SOURCE).data.features[0];
  assert.deepEqual(Object.keys(f.properties).sort(), ['cap', 'o', 'pl']);
  assert.equal(f.properties.o, 1, 'sans lissage, un véhicule est pleinement opaque');
  assert.ok(f.geometry.coordinates.every(Number.isFinite));
  assert.ok(Math.abs(f.geometry.coordinates[0] - 5) < 0.02 && Math.abs(f.geometry.coordinates[1] - 43) < 0.02, 'autour du réseau de l\'essai');
  t.arreter();
  assert.equal(carte.sources.size, 0, 'source retirée'); assert.equal(carte.calques.length, 0, 'couche retirée');
  assert.equal(t.etat().actif, false);
});

test('creerTrafic : pause et reprise sans doublon de source ; un démarrage répété ne multiplie pas les minuteries', () => {
  const carte = carteSimulee(); let minuteries = 0, annulees = 0;
  const t = creerTrafic({ carte, entites: S.grille({ nv: 2 }), planifier: () => ++minuteries, annuler: () => { annulees++; } });
  t.demarrer(); t.demarrer();
  assert.equal(minuteries, 1, 'un seul minuteur');
  t.pause(); assert.equal(annulees, 1); assert.equal(carte.sources.size, 1, 'la source reste en pause');
  t.reprendre(); assert.equal(minuteries, 2); t.reprendre(); assert.equal(minuteries, 2);
  t.arreter(); assert.equal(annulees, 2); assert.equal(carte.sources.size, 0);
  t.arreter();   // idempotent
});

test('creerTrafic : l\'état annonce que le trafic est simulé, avec le réseau lu', () => {
  const carte = carteSimulee();
  const t = creerTrafic({ carte, entites: S.grille({ nv: 2 }), planifier: () => 1, annuler: () => {} });
  const e = t.etat();
  assert.equal(e.simule, true);
  assert.ok(e.reseau.troncons > 5 && e.reseau.kmVoie > 0.2, JSON.stringify(e.reseau));
  assert.equal(e.actif, false);
});

test('instantane : un point par véhicule, cap en degrés entiers, classe poids lourd', () => {
  const sim = { agents: [{ pl: true }, { pl: false }, { pl: false }], position: (a) => (a.pl ? [10, 20, 90.4] : [0, 0, NaN]) };
  const fc = instantane(sim, [5, 43]);
  assert.equal(fc.features.length, 3);
  assert.equal(fc.features[0].properties.pl, true); assert.equal(fc.features[0].properties.cap, 90);
  assert.equal(fc.features[1].properties.cap, 0, 'un cap illisible devient 0');
  const horsChamp = instantane({ agents: [{}], position: () => null }, [5, 43]);
  assert.equal(horsChamp.features.length, 0, 'un véhicule sans position est ignoré');
});

/* ---- distinguer les routes, les chemins, les sentiers, les pistes cyclables, les voies ferrées ---- */

test('adapterTroncons : les routes seules roulent ; chaque écart a son motif', () => {
  const route = { nature: 'Route à 1 chaussée', acces_vehicule_leger: 'Libre' };
  const { troncons, ecartes, motifs } = adapterTroncons([
    ligne({ ...route, cleabs: 'R1' }, A, B),
    ligne({ nature: 'Rond-point', acces_vehicule_leger: 'Libre', cleabs: 'R2' }, B, C),
    ligne({ nature: 'Route empierrée', acces_vehicule_leger: 'Restreint aux ayants droit' }, A, B),
    ligne({ nature: 'Route empierrée', acces_vehicule_leger: 'Restreint aux ayants droit' }, A, C),
    ligne({ nature: 'Chemin' }, A, B),
    ligne({ nature: 'Sentier', acces_vehicule_leger: 'Physiquement impossible' }, A, B),
    ligne({ nature: 'Escalier' }, A, B),
    ligne({ nature: 'Piste cyclable' }, A, B),
    ligne({ highway: 'cycleway' }, A, B),
    ligne({ railway: 'rail' }, A, B),
    ligne({ nature: 'Route à 1 chaussée', acces_vehicule_leger: 'Physiquement impossible' }, A, B),
    ligne({ nature: 'Route à 1 chaussée', etat_de_l_objet: 'Projet' }, A, B),
    { type: 'Feature', properties: route, geometry: null },
    ligne({ sens_de_circulation: 'Double sens' }, A, B),   // une ligne qui ne dit pas ce qu'elle est, au milieu de lignes qui le disent
  ]);
  assert.deepEqual(troncons.map((t) => t.properties.cleabs), ['R1', 'R2']);
  assert.equal(ecartes, 12);
  assert.deepEqual(motifs, { acces_restreint: 2, chemin: 1, sentier: 1, escalier: 1, cyclable: 2, ferre: 1, acces_impossible: 1, projet: 1, geometrie: 1, autre: 1 });
});

test('adapterTroncons : les routes à accès restreint roulent sur demande, jamais les impossibles', () => {
  const entites = [
    ligne({ nature: 'Route à 1 chaussée', acces_vehicule_leger: 'Libre' }, A, B),
    ligne({ nature: 'Route empierrée', acces_vehicule_leger: 'Restreint aux ayants droit' }, B, C),
    ligne({ nature: 'Route à 1 chaussée', acces_vehicule_leger: 'Physiquement impossible' }, A, C),
  ];
  assert.equal(adapterTroncons(entites).troncons.length, 1);
  const tous = adapterTroncons(entites, { acces: 'tous' });
  assert.equal(tous.troncons.length, 2);
  assert.ok(tous.troncons.every((t) => t.properties.acces_vehicule_leger !== 'Restreint aux ayants droit'), "le moteur reçoit un accès qu'il ne refuse pas");
  assert.deepEqual(tous.motifs, { acces_impossible: 1 });
});

test('adapterTroncons : des lignes tracées à la main, sans aucun attribut, sont prises pour un réseau routier', () => {
  const { troncons, ecartes } = adapterTroncons([ligne({}, A, B), ligne({}, B, C)]);
  assert.equal(troncons.length, 2); assert.equal(ecartes, 0);
});

test('creerTrafic : sur une couche qui ne contient que des chemins, le message dit ce qui a été écarté', () => {
  const carte = carteSimulee();
  const entites = [ligne({ nature: 'Chemin' }, A, B), ligne({ nature: 'Sentier' }, B, C), ligne({ nature: 'Route empierrée', acces_vehicule_leger: 'Restreint aux ayants droit' }, A, C)];
  assert.throws(() => creerTrafic({ carte, entites }), /aucune route ouverte à la circulation dans cette couche \(3 tronçons écartés : .*chemin.*sentier.*acces restreint/);
});

test('creerTrafic : aucun véhicule ne roule sur une allée à accès restreint (le moteur ne la voit pas)', () => {
  const carte = carteSimulee();
  const rue = (id, pts) => ({ type: 'Feature', properties: { cleabs: id, nature: 'Route à 1 chaussée', acces_vehicule_leger: 'Libre', sens_de_circulation: 'Double sens', importance: '3' }, geometry: { type: 'LineString', coordinates: pts } });
  const allee = { type: 'Feature', properties: { cleabs: 'ALLEE', nature: 'Route empierrée', acces_vehicule_leger: 'Restreint aux ayants droit', sens_de_circulation: 'Double sens', importance: '5' }, geometry: { type: 'LineString', coordinates: [[5.0, 43.0012], [5.003, 43.0012]] } };
  const t = creerTrafic({ carte, entites: [rue('R-O', [[5.0, 43.0], [5.003, 43.0]]), rue('R-E', [[5.003, 43.0], [5.006, 43.0]]), allee], planifier: () => 1, annuler: () => {} });
  const cles = new Set(); for (const a of t._sim.G.aretes) for (const c of a.cl) cles.add(c);
  assert.ok(cles.has('R-O') && cles.has('R-E'));
  assert.ok(!cles.has('ALLEE'), "l'allée n'est pas dans le réseau du moteur");
  assert.equal(t.etat().motifs.acces_restreint, 1);
});

test('libelleMotifs : une phrase française pour ce qui a été écarté, le plus fréquent d\'abord', () => {
  assert.equal(libelleMotifs({}), '');
  assert.equal(libelleMotifs(undefined), '');
  assert.equal(libelleMotifs({ chemin: 1 }), '1 tronçon écarté : 1 chemins');
  assert.equal(libelleMotifs({ sentier: 2, acces_restreint: 38, escalier: 5 }), '45 tronçons écartés : 38 à accès restreint, 5 escaliers, 2 sentiers');
  assert.equal(libelleMotifs({ cyclable: 3, ferre: 1, geometrie: 2, projet: 1, inconnu: 1 }), '8 tronçons écartés : 3 pistes cyclables, 2 sans géométrie lisible, 1 voies ferrées, 1 en projet, 1 inconnu');
});

test('creerTrafic : l\'état porte la phrase des écarts, pour l\'interface', () => {
  const carte = carteSimulee();
  const rue = (id, pts) => ({ type: 'Feature', properties: { cleabs: id, nature: 'Route à 1 chaussée', acces_vehicule_leger: 'Libre', sens_de_circulation: 'Double sens', importance: '3' }, geometry: { type: 'LineString', coordinates: pts } });
  const t = creerTrafic({ carte, entites: [rue('A', [[5.0, 43.0], [5.003, 43.0]]), rue('B', [[5.003, 43.0], [5.006, 43.0]]), { type: 'Feature', properties: { nature: 'Sentier' }, geometry: { type: 'LineString', coordinates: [[5, 43.001], [5.001, 43.001]] } }], planifier: () => 1, annuler: () => {} });
  assert.equal(t.etat().ecartesTexte, '1 tronçon écarté : 1 sentiers');
});
