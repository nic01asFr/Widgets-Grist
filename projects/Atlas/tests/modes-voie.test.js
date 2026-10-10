/**
 * Distinguer les routes, les chemins, les sentiers, les escaliers, les pistes cyclables et les voies ferrées (lib/modes-voie.js).
 * node --test projects/Atlas/tests/modes-voie.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, TYPES, TYPES_DE_VOIE, modeDe, accesVehicule, classerTroncon, typeDeVoie } from '../lib/modes-voie.js';

test('BD TOPO : chaque nature de tronçon a son mode', () => {
  const attendu = {
    'Autoroute': 'route', 'Quasi-autoroute': 'route', 'Bretelle': 'route', 'Route à 2 chaussées': 'route', 'Route à 1 chaussée': 'route', 'Rond-point': 'route', 'Route empierrée': 'route',
    'Chemin': 'chemin', 'Sentier': 'sentier', 'Escalier': 'escalier', 'Piste cyclable': 'cyclable', 'Bac ou liaison maritime': 'autre',
    'LGV': 'ferre', 'Voie ferrée principale': 'ferre', 'Tramway': 'ferre', 'Métro': 'ferre',
  };
  for (const [nature, mode] of Object.entries(attendu)) assert.equal(modeDe({ nature }), mode, nature);
  assert.equal(modeDe({ nature: 'Nature inventée' }), 'autre');
  assert.equal(modeDe({}), 'autre');
  assert.equal(modeDe(undefined), 'autre');
});

test('OpenStreetMap : highway et railway', () => {
  for (const h of ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service', 'living_street', 'primary_link']) assert.equal(modeDe({ highway: h }), 'route', h);
  assert.equal(modeDe({ highway: 'cycleway' }), 'cyclable');
  assert.equal(modeDe({ highway: 'steps' }), 'escalier');
  assert.equal(modeDe({ highway: 'track' }), 'chemin');
  assert.equal(modeDe({ highway: 'bridleway' }), 'chemin');
  for (const h of ['footway', 'pedestrian', 'path']) assert.equal(modeDe({ highway: h }), 'sentier', h);
  assert.equal(modeDe({ highway: 'path', bicycle: 'designated' }), 'cyclable', 'un sentier réservé aux vélos');
  assert.equal(modeDe({ highway: 'path', bicycle: 'designated', foot: 'designated' }), 'sentier', 'partagé avec les piétons : un sentier');
  for (const r of ['rail', 'light_rail', 'subway', 'tram', 'funicular', 'narrow_gauge']) assert.equal(modeDe({ railway: r }), 'ferre', r);
  assert.equal(modeDe({ highway: 'HIGHWAY-INVENTE' }), 'autre');
  assert.equal(modeDe({ highway: ' Residential ' }), 'route', 'espaces et casse');
});

test('l\'accès d\'un véhicule léger : BD TOPO, puis motor_vehicle, vehicle, access d\'OpenStreetMap', () => {
  assert.equal(accesVehicule({ acces_vehicule_leger: 'Libre' }), 'libre');
  assert.equal(accesVehicule({ acces_vehicule_leger: 'A péage' }), 'peage');
  assert.equal(accesVehicule({ acces_vehicule_leger: 'Restreint aux ayants droit' }), 'restreint');
  assert.equal(accesVehicule({ acces_vehicule_leger: 'Physiquement impossible' }), 'impossible');
  assert.equal(accesVehicule({ acces_vehicule_leger: 'valeur nouvelle' }), 'inconnu');
  assert.equal(accesVehicule({}), 'inconnu');
  assert.equal(accesVehicule({ access: 'private' }), 'restreint');
  assert.equal(accesVehicule({ access: 'no' }), 'impossible');
  assert.equal(accesVehicule({ access: 'yes' }), 'libre');
  assert.equal(accesVehicule({ access: 'no', motor_vehicle: 'yes' }), 'libre', 'le plus précis l\'emporte : motor_vehicle avant access');
  assert.equal(accesVehicule({ access: 'yes', vehicle: 'no' }), 'impossible');
  assert.equal(accesVehicule({ motor_vehicle: 'destination' }), 'restreint');
  assert.equal(accesVehicule({ acces_vehicule_leger: 'Libre', access: 'no' }), 'libre', 'la BD TOPO l\'emporte quand elle parle');
});

test('classerTroncon : seule une route ouverte à la circulation est routière, et le motif dit pourquoi les autres ne le sont pas', () => {
  const c = (p) => classerTroncon(p);
  assert.deepEqual([c({ nature: 'Route à 1 chaussée', acces_vehicule_leger: 'Libre' }).routier, c({ nature: 'Route à 1 chaussée', acces_vehicule_leger: 'Libre' }).motif], [true, null]);
  assert.equal(c({ nature: 'Autoroute', acces_vehicule_leger: 'A péage' }).routier, true, 'une autoroute à péage reste une route');
  assert.equal(c({ nature: 'Route à 1 chaussée' }).routier, true, 'accès non renseigné : on ne l\'invente pas fermé');
  assert.equal(c({ nature: 'Route empierrée', acces_vehicule_leger: 'Restreint aux ayants droit' }).motif, 'acces_restreint', 'l\'allée d\'un parc');
  assert.equal(c({ nature: 'Route empierrée', acces_vehicule_leger: 'Libre' }).routier, true, 'une route empierrée ouverte est une route');
  assert.equal(c({ nature: 'Route à 1 chaussée', acces_vehicule_leger: 'Physiquement impossible' }).motif, 'acces_impossible');
  assert.equal(c({ nature: 'Chemin' }).motif, 'chemin');
  assert.equal(c({ nature: 'Sentier' }).motif, 'sentier');
  assert.equal(c({ nature: 'Escalier' }).motif, 'escalier');
  assert.equal(c({ nature: 'Piste cyclable' }).motif, 'cyclable');
  assert.equal(c({ railway: 'rail' }).motif, 'ferre');
  assert.equal(c({ nature: 'Route à 1 chaussée', etat_de_l_objet: 'Projet' }).motif, 'projet');
  assert.equal(c({ highway: 'construction' }).motif, 'projet');
  assert.equal(c({ highway: 'residential', access: 'private' }).motif, 'acces_restreint');
  assert.equal(c({ highway: 'residential', motor_vehicle: 'no' }).motif, 'acces_impossible');
  assert.equal(c({}).motif, 'autre');
  assert.equal(c(undefined).routier, false);
});

test('les voies ferrées sont reconnues et jamais routières (un autre moteur les lira)', () => {
  for (const p of [{ nature: 'LGV' }, { nature: 'Voie ferrée principale' }, { railway: 'tram' }, { railway: 'subway' }]) {
    const r = classerTroncon(p);
    assert.equal(r.mode, 'ferre'); assert.equal(r.routier, false); assert.equal(r.libelle, 'Voie ferrée');
  }
});

test('types de voie : un libellé par mode, dans un ordre stable, avec une couleur chacun', () => {
  assert.deepEqual(TYPES_DE_VOIE, ['Route', 'Route à accès restreint', 'Chemin', 'Sentier', 'Escalier', 'Piste cyclable', 'Voie ferrée', 'Autre']);
  assert.equal(typeDeVoie({ nature: 'Route à 1 chaussée' }), 'Route');
  assert.equal(typeDeVoie({ nature: 'Piste cyclable' }), 'Piste cyclable');
  const couleurs = TYPES.map((t) => t.couleur);
  assert.equal(new Set(couleurs).size, couleurs.length, 'deux types ne partagent pas leur couleur');
  for (const t of TYPES) assert.match(t.couleur, /^#[0-9a-f]{6}$/i);
  // une route qui n'est pas ouverte à tous ne se confond pas avec la voirie ouverte
  assert.equal(typeDeVoie({ nature: 'Route empierrée', acces_vehicule_leger: 'Restreint aux ayants droit' }), 'Route à accès restreint');
  assert.equal(typeDeVoie({ nature: 'Route à 1 chaussée', acces_vehicule_leger: 'Physiquement impossible' }), 'Route à accès restreint');
  assert.equal(typeDeVoie({ highway: 'service', access: 'private' }), 'Route à accès restreint');
  assert.equal(typeDeVoie({ nature: 'Route à 1 chaussée' }), 'Route', 'accès non renseigné : une route');
});

test('les tronçons de l\'essai du 11/10/2026 (Palais Longchamp, 126 tronçons BD TOPO) : 65 routières, les allées du parc et les escaliers non', () => {
  const lot = [
    ...Array(61).fill({ nature: 'Route à 1 chaussée', acces_vehicule_leger: 'Libre' }),
    ...Array(4).fill({ nature: 'Rond-point', acces_vehicule_leger: 'Libre' }),
    ...Array(9).fill({ nature: 'Route à 1 chaussée', acces_vehicule_leger: 'Restreint aux ayants droit' }),
    ...Array(2).fill({ nature: 'Route à 1 chaussée', acces_vehicule_leger: 'Physiquement impossible' }),
    ...Array(38).fill({ nature: 'Route empierrée', acces_vehicule_leger: 'Restreint aux ayants droit' }),
    ...Array(5).fill({ nature: 'Escalier', acces_vehicule_leger: 'Physiquement impossible' }),
    ...Array(7).fill({ nature: 'Sentier', acces_vehicule_leger: 'Physiquement impossible' }),
  ];
  assert.equal(lot.length, 126);
  assert.equal(lot.filter((p) => classerTroncon(p).routier).length, 65);
  const motifs = {}; for (const p of lot) { const m = classerTroncon(p).motif; if (m) motifs[m] = (motifs[m] || 0) + 1; }
  assert.deepEqual(motifs, { acces_restreint: 47, acces_impossible: 2, escalier: 5, sentier: 7 });
});
