// node --test tests/bi-fond-plan.test.js   (aucun accès réseau)
import test from 'node:test';
import assert from 'node:assert/strict';
import { classerOMT, classerIGN, peinture, planOMT, deriverStyleIGN, bilanRoles, planMonochrome, PLAN_DEFAUT, FONDS } from '../lib/bi/fond-plan.js';
import { contraste, luminance } from '../lib/bi/echelles.js';

const omt = (id, type, sl, src = 'openmaptiles') => ({ id, type, 'source-layer': sl, source: src });
const COUCHES_OMT = [
  omt('background', 'background', null, null), omt('natural_earth', 'raster', null, 'ne2_shaded'), omt('park', 'fill', 'park'), omt('park_outline', 'line', 'park'),
  omt('landuse_residential', 'fill', 'landuse'), omt('landcover_wood', 'fill', 'landcover'), omt('landcover_ice', 'fill', 'landcover'), omt('landuse_cemetery', 'fill', 'landuse'),
  omt('waterway_river', 'line', 'waterway'), omt('waterway_tunnel', 'line', 'waterway'), omt('water', 'fill', 'water'), omt('aeroway_fill', 'fill', 'aeroway'),
  omt('tunnel_street', 'line', 'transportation'), omt('road_minor_casing', 'line', 'transportation'), omt('road_minor', 'line', 'transportation'), omt('road_trunk_primary', 'line', 'transportation'),
  omt('road_major_rail', 'line', 'transportation'), omt('road_major_rail_hatching', 'line', 'transportation'), omt('road_one_way_arrow', 'symbol', 'transportation'), omt('bridge_street_casing', 'line', 'transportation'),
  omt('building', 'fill', 'building'), omt('building-3d', 'fill-extrusion', 'building'), omt('boundary_2', 'line', 'boundary'), omt('boundary_disputed', 'line', 'boundary'),
  omt('poi_r1', 'symbol', 'poi'), omt('highway-name-major', 'symbol', 'transportation_name'), omt('highway-shield-non-us', 'symbol', 'transportation_name'), omt('label_city', 'symbol', 'place'),
  omt('label_country_1', 'symbol', 'place'), omt('water_name_point_label', 'symbol', 'water_name'), omt('bi-pts-parc', 'symbol', null, 'bi-src-parc'), omt('layer-scene-x', 'fill', null, 'layer-x'),
];

test('OMT : chaque couche reçoit un rôle et celles qui ne sont pas du fond sont laissées', () => {
  const roles = Object.fromEntries(COUCHES_OMT.map((l) => [l.id, classerOMT(l).role]));
  assert.equal(roles.background, 'fond'); assert.equal(roles.natural_earth, 'masquer'); assert.equal(roles.park, 'vert'); assert.equal(roles.landcover_wood, 'vert'); assert.equal(roles.landcover_ice, 'masquer');
  assert.equal(roles.landuse_residential, 'masquer'); assert.equal(roles.landuse_cemetery, 'vert'); assert.equal(roles.water, 'eau'); assert.equal(roles.waterway_river, 'eau-ligne'); assert.equal(roles.waterway_tunnel, 'masquer');
  assert.equal(roles.road_minor_casing, 'filet'); assert.equal(roles.road_minor, 'route'); assert.equal(roles.road_trunk_primary, 'route'); assert.equal(roles.tunnel_street, 'masquer'); assert.equal(roles.bridge_street_casing, 'filet');
  assert.equal(roles.road_major_rail, 'rail'); assert.equal(roles.road_major_rail_hatching, 'masquer'); assert.equal(roles.road_one_way_arrow, 'masquer');
  assert.equal(roles.building, 'bati'); assert.equal(roles['building-3d'], 'masquer'); assert.equal(roles.boundary_2, 'limite'); assert.equal(roles.boundary_disputed, 'masquer');
  assert.equal(roles.poi_r1, 'masquer'); assert.equal(roles['highway-name-major'], 'voie'); assert.equal(roles['highway-shield-non-us'], 'masquer'); assert.equal(roles.label_city, 'lieu'); assert.equal(roles.label_country_1, 'masquer');
  assert.equal(roles.water_name_point_label, 'eau-nom'); assert.equal(roles['bi-pts-parc'], null); assert.equal(roles['layer-scene-x'], null);
  assert.equal(planOMT(COUCHES_OMT).some((p) => p.id.startsWith('bi-') || p.id.startsWith('layer-')), false, 'les couches BI et de scène ne sont jamais repeintes');
});

test('peinture : couleurs de la charte par rôle, fond et lignes sans dégradé', () => {
  assert.deepEqual(peinture('fond', 'background').paint, { 'background-color': PLAN_DEFAUT.fond });
  assert.equal(peinture('fond', 'fill').paint['fill-color'], PLAN_DEFAUT.fond);
  assert.equal(peinture('eau', 'fill').paint['fill-color'], PLAN_DEFAUT.eau); assert.equal(peinture('vert', 'fill').paint['fill-color'], PLAN_DEFAUT.vert);
  assert.equal(peinture('bati', 'fill').paint['fill-outline-color'], PLAN_DEFAUT.filet);
  assert.equal(peinture('route', 'line').paint['line-color'], '#FFFFFF'); assert.equal(peinture('filet', 'line').paint['line-color'], PLAN_DEFAUT.filet);
  assert.deepEqual(peinture('limite', 'line').paint['line-dasharray'], [2, 2]);
  const t = peinture('lieu', 'symbol').paint; assert.equal(t['text-halo-color'], PLAN_DEFAUT.halo); assert.equal(peinture('masquer', 'line').visibility, 'none'); assert.equal(peinture(null, 'line'), null);
  assert.equal(peinture('vert', 'fill', { vert: '#00ff00' }).paint['fill-color'], '#00ff00', 'les jetons de l\'hôte priment');
});

test('contraste : le texte du plan lit sur le fond, les marques sombres ressortent', () => {
  assert.ok(contraste(PLAN_DEFAUT.texte, PLAN_DEFAUT.fond) >= 7, 'texte sur fond');
  assert.ok(contraste(PLAN_DEFAUT.texte2, PLAN_DEFAUT.fond) >= 4.5, 'texte secondaire sur fond');
  assert.ok(contraste('#26312B', PLAN_DEFAUT.vert) >= 7 && contraste('#26312B', PLAN_DEFAUT.eau) >= 7, 'contour sombre sur vert et sur eau');
  assert.ok(contraste(PLAN_DEFAUT.filet, PLAN_DEFAUT.fond) < 3, 'le filet reste discret : c\'est voulu, la donnée prime');
});

const ign = (id, type, sl) => ({ id, type, 'source-layer': sl, paint: { 'line-width': { stops: [[14, 3]] }, 'line-color': '#000' }, layout: { 'icon-image': 'x', visibility: 'none' }, source: 'plan_ign' });
const STYLE_IGN = { version: 8, glyphs: 'https://exemple/{fontstack}/{range}.pbf', sprite: 'https://exemple/sprite', sources: { plan_ign: { type: 'vector', tiles: ['https://exemple/{z}/{x}/{y}.pbf'] } }, layers: [
  ign('bckgrd', 'fill', 'fond_opaque'), ign('oro', 'fill', 'oro_relief'), ign('boise', 'fill', 'ocs_vegetation_surf'), ign('eau', 'fill', 'hydro_surf'), ign('bati', 'fill', 'bati_surf'), ign('zai', 'fill', 'bati_zai'),
  ign('Routier a niveau - filet extérieur - route locale', 'line', 'routier_route'), ign('Routier a niveau - filet interieur - route locale', 'line', 'routier_route'), ign('Routier a niveau - axe central', 'line', 'routier_route'),
  ign('Routier a niveau - filet extérieur - route locale', 'line', 'routier_route_sup'), ign('Routier a niveau - filet extérieur - tunnel', 'line', 'routier_route_sou'),
  ign('Chemin a niveau - sentier', 'line', 'routier_chemin'), ign('Chemin a niveau - Rue pietonne', 'line', 'routier_chemin'),
  ign('Ferre a niveau - voie normale', 'line', 'ferre'), ign('Ferre a niveau - voie normale trait perpendic', 'line', 'ferre'), ign('parcelle', 'line', 'parcellaire_parcelle'),
  ign('toponyme localite', 'symbol', 'toponyme_localite_ponc'), ign('odonyme', 'symbol', 'toponyme_routier_odonyme_lin'), ign('poi', 'symbol', 'toponyme_bati_ponc'), ign('pt', 'circle', 'bati_ponc'),
] };

test('IGN : le style dérivé garde les sources, remplace la peinture, retire ce qui encombre', () => {
  const d = deriverStyleIGN(STYLE_IGN);
  const ids = d.layers.map((l) => l.id); assert.equal(new Set(ids).size, ids.length, 'identifiants uniques');
  assert.ok(ids.every((i) => i.startsWith('fond-')));
  assert.deepEqual(Object.keys(d.sources), ['fond-plan_ign']); assert.ok(d.layers.every((l) => !l.source || l.source === 'fond-plan_ign'));
  const par = (sl) => d.layers.filter((l) => l['source-layer'] === sl);
  assert.equal(par('fond_opaque')[0].paint['fill-color'], PLAN_DEFAUT.fond, 'le fond IGN (couche fill) est peint en fill-color');
  assert.equal(par('oro_relief').length, 0); assert.equal(par('bati_zai').length, 0); assert.equal(par('routier_route_sou').length, 0); assert.equal(par('parcellaire_parcelle').length, 0); assert.equal(par('bati_ponc').length, 0);
  assert.equal(par('routier_route').length, 2, 'filet extérieur + filet intérieur, sans axe central'); assert.equal(par('routier_route_sup').length, 1);
  assert.deepEqual(par('routier_route').map((l) => l.paint['line-color']).sort(), [PLAN_DEFAUT.filet, '#FFFFFF']);
  assert.equal(par('routier_route')[0].paint['line-width'] !== undefined, true, 'les largeurs d\'origine sont conservées');
  assert.equal(par('ferre').length, 1, 'les traverses (traits perpendiculaires) sont retirées');
  assert.equal(par('routier_chemin').length, 1, 'seules les rues piétonnes restent des chemins');
  const lieu = par('toponyme_localite_ponc')[0]; assert.equal(lieu.layout['icon-image'], undefined); assert.equal(lieu.layout.visibility, 'visible');
  assert.equal(d.sprite, undefined); assert.equal(d.glyphs, STYLE_IGN.glyphs); assert.ok(!('toponyme_bati_ponc' in Object.fromEntries(d.layers.map((l) => [l['source-layer'], 1]))));
});

test('bilan et catalogue des fonds', () => {
  const b = bilanRoles(COUCHES_OMT); assert.ok(b['hors-fond'] === 2 && b.route >= 2 && b.masquer >= 8, JSON.stringify(b));
  assert.deepEqual(Object.keys(FONDS), ['atlas', 'voile', 'plan', 'plan-ign', 'photo', 'uni']); assert.equal(FONDS.uni.reseau, false);
  assert.equal(Object.values(bilanRoles(STYLE_IGN.layers, classerIGN)).reduce((s, n) => s + n, 0), STYLE_IGN.layers.length);
});

test('plan monochrome : une couleur principale, des intensités croissantes, un texte qui se lit', () => {
  for (const principal of ['#615D97', '#282070', '#EE7756']) {
    const j = planMonochrome(principal);
    const ordre = ['fond', 'vert', 'bati', 'eau', 'filet', 'limite'].map((k) => luminance(j[k]));
    for (let i = 1; i < ordre.length; i++) assert.ok(ordre[i] < ordre[i - 1] + 1e-9, principal + ' : l’intensité ne décroît pas en luminance au rang ' + i);
    assert.ok(contraste(j.texte, j.fond) >= 7, principal + ' texte'); assert.ok(contraste(j.texte2, j.fond) >= 4.5, principal + ' texte secondaire');
    assert.ok(Object.values(j).every((c) => /^#[0-9a-f]{6}$/i.test(c)), 'tous les jetons sont des couleurs');
    assert.equal(j.route, j.fond); assert.equal(j.halo, j.fond);
  }
  assert.equal(planMonochrome('#282070', { fond: '#FFFBF0' }).fond, '#FFFBF0');
  assert.notEqual(planMonochrome('#282070').eau, planMonochrome('#282070', { intensites: { eau: 0.5 } }).eau);
  const a = peinture('eau', 'fill', planMonochrome('#282070')).paint['fill-color']; assert.equal(a, planMonochrome('#282070').eau);
  assert.ok(contraste('#26312B', planMonochrome('#282070').eau) >= 7, 'un contour sombre ressort sur l’eau du plan monochrome');
});
