/**
 * La page « Rennes en direct » (demos/hote-direct/index.html) : une application alimentée uniquement par des flux de données ouvertes lus depuis la page, rien d'embarqué.
 * Ce que le test garde : les sources sont des portails de données ouvertes en https, la licence est dite, les données sont normalisées comme annoncé, la lecture se met en veille.
 * node --test projects/Atlas/tests/demo-direct.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DEMO = path.join(ICI, '..', 'demos', 'hote-direct');
const html = fs.readFileSync(path.join(DEMO, 'index.html'), 'utf8');

test('la page lit deux flux de données ouvertes en https, cite leur licence, et n’embarque aucune donnée', () => {
  const hotes = new Set([...html.matchAll(/https:\/\/([a-z0-9.-]+)\//g)].map((m) => m[1]));
  for (const h of hotes) assert.ok(['data.rennesmetropole.fr', 'data.explore.star.fr', 'fonts.googleapis.com'].includes(h) || /^www\.w3\.org$/.test(h), 'hôte inattendu : ' + h);
  assert.match(html, /etat-du-trafic-en-temps-reel/); assert.match(html, /tco-bus-vehicules-position-tr/);
  assert.match(html, /ODbL/); assert.match(html, /attribution: 'Rennes Métropole, STAR \(ODbL\)'/);
  assert.doesNotMatch(html, /http:\/\/(?!127\.0\.0\.1|localhost)/, 'aucune adresse http');
  assert.ok(html.length < 40000, 'une page, pas un jeu de données : ' + html.length);
});

test('la lecture se met en veille quand la page est masquée, réessaie avec un délai croissant, et la sonde de fraîcheur évite de relire 1,6 Mo pour rien', () => {
  assert.match(html, /document\.hidden/); assert.match(html, /visibilitychange/);
  assert.match(html, /Math\.min\(120, periodeS \* \(1 \+ b\.essais\)\)/);
  assert.match(html, /select=datetime/); assert.match(html, /date\.getTime\(\) === etat\.dateTrafic\.getTime\(\)/);
});

test('les données du trafic et des bus sont normalisées : états en français, épaisseur par importance, seuls les bus en ligne, ponctualité par seuils', () => {
  const m = /const BASE_TRAFIC[\s\S]*?\/\/ ---- La scène/.exec(html); assert.ok(m, 'bloc de normalisation introuvable');
  const ctx = {}; vm.runInNewContext(m[0].replace(/\/\/ ---- La scène$/, '') + String.fromCharCode(10) + 'globalThis.R = { normaliserTrafic, normaliserBus, STATUTS };', ctx);
  const { normaliserTrafic, normaliserBus } = ctx.R;
  const ligne = (id, p) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[-1.7, 48.1], [-1.71, 48.11]] }, properties: { id_rva_troncon_fcd_v1_1: id, denomination: 'Rue X', vitesse_maxi: 50, vehicleprobemeasurement: 2, averagevehiclespeed: 31.4, hierarchie: 'Réseau d\'armature', ...p } });
  const t = normaliserTrafic({ features: [ligne(1, { trafficstatus: 'freeFlow' }), ligne(2, { trafficstatus: 'heavy' }), ligne(3, { trafficstatus: 'congested' }), ligne(4, { trafficstatus: 'unknown', vehicleprobemeasurement: 0 }), ligne(5, { trafficstatus: 'inconnu-du-futur', denomination: null, hierarchie: 'autre' })] });
  assert.deepEqual(t.map((f) => f.properties.statut), ['fluide', 'dense', 'bloque', 'inconnu', 'inconnu']);
  assert.equal(t[0].properties.vitesseTexte, '31 km/h (limite 50)'); assert.equal(t[3].properties.vitesseTexte, 'pas de mesure en ce moment'); assert.equal(t[3].properties.sondesTexte, 'aucun véhicule mesuré');
  assert.equal(t[0].properties.epaisseur, 0.85); assert.equal(t[4].properties.epaisseur, 0.5); assert.equal(t[4].properties.nom, 'Voie sans nom'); assert.equal(t[0].id, 1);
  const bus = (id, etat, ecart) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [-1.68, 48.11] }, properties: { idbus: id, etat: [etat], nomcourtligne: '68', destination: 'Gévezé', ecartsecondes: ecart } });
  const b = normaliserBus({ features: [bus('a', 'En ligne', 0), bus('b', 'Hors-service', 0), bus('c', 'En ligne', 250), bus('d', 'En ligne', 400), bus('e', 'En ligne', -200), bus('f', 'En ligne', null), { type: 'Feature', geometry: null, properties: { etat: ['En ligne'] } }] });
  assert.deepEqual(b.map((f) => f.id), ['a', 'c', 'd', 'e', 'f']); assert.deepEqual(b.map((f) => f.properties.ponctualite), ['heure', 'retard', 'fort', 'avance', 'inconnu'], 'un horaire non communiqué n’est pas « à l’heure »');
  const seuil = normaliserBus({ features: [bus('g', 'En ligne', 60), bus('h', 'En ligne', 70)] }); assert.deepEqual(seuil.map((f) => f.properties.ponctualite), ['heure', 'retard'], 'un seul seuil, celui du texte de la bulle'); assert.equal(seuil[0].properties.ecartTexte, 'à l’heure');
  assert.equal(b[1].properties.ecartTexte, '4 min de retard'); assert.equal(b[0].properties.ecartTexte, 'à l’heure'); assert.equal(b[3].properties.ecartTexte, '3 min d’avance');
});

test('la couche des routes utilise le tracé déclaré (largeur selon l’importance) ; les bus se déplacent sur place quand ce sont les mêmes', () => {
  assert.match(html, /visuel: \{ largeur: \{ champ: 'epaisseur'/); assert.match(html, /cmd: 'updateFeature'/); assert.match(html, /i \+= 100/, 'au plus 100 ordres par lot');
  assert.match(html, /await carte\.select\(s\.id\)/, 'la sélection survit au rafraîchissement');
});

test('trois apparences décrites par leurs jetons : la page change d’attribut, la carte relit la page, fond de plan compris', () => {
  for (const id of ['nuit', 'contraste']) { const i = html.indexOf('[data-ds="' + id + '"] {'); assert.ok(i > 0 && html.slice(i, i + 400).includes('--fond: #'), 'jetons de l’apparence ' + id); }
  assert.match(html, /data-apparence="nuit"/); assert.match(html, /charte="herite" fond="plan"/, 'le fond de plan monochrome de la charte suit les couleurs de la page'); assert.match(html, /evenements-api/);
  assert.doesNotMatch(html, /<button[^>]*data-ds=/, 'un bouton ne porte pas data-ds : il prendrait lui-même les jetons du système qu’il désigne');
});

test('les corrections de l’évaluation indépendante tiennent : bus en ligne demandés au serveur, filtres et sélection rendus après remplacement d’une couche, une seule chaîne de lecture, boutons créés une fois', () => {
  assert.ok(html.includes('where=etat%3D%22En%20ligne%22'), 'seuls les bus en ligne sont demandés');
  assert.match(html, /async function rejouerFiltres/); assert.match(html, /await rejouerFiltres\(def\.id\)/);
  assert.equal((html.match(/document\.addEventListener\('visibilitychange'/g) || []).length, 1, 'un seul écouteur de visibilité (pas une chaîne de lecture par appel)');
  assert.match(html, /construirePuces\(\$\('puces-trafic'\)/); assert.doesNotMatch(html, /z\.textContent = ''; for \(const s of STATUTS\)/, 'les puces ne sont plus reconstruites à chaque lecture');
  assert.match(html, /timeZone: FUSEAU/); assert.match(html, /le réseau STAR ne circule pas à cette heure/);
  assert.doesNotMatch(html, /\.innerHTML = .*(?:nom|destination|ligne)(?!Texte)/, 'aucun champ venu des flux n’entre dans du HTML');
});
