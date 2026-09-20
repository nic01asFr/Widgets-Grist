import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  fnv1a32, microdegres, cleLatLon, tirage, variante, rotation, echelle, garde,
  cleMaille, pointMaille,
} from '../lib/graine.js';

// Vecteurs du contrat `atlas-objets/0.1#seed`, produits par la reference Python
// de pix2hdr (Blender_servers/.../gn_lib/objseed.py), md5 c11909c1… Copies tels
// quels : ne pas les regenerer ici, c'est l'autre implementation qui fait foi.
const V = JSON.parse(readFileSync(new URL('./fixtures/graine-vecteurs.json', import.meta.url), 'utf8'));
const hex = (s) => Buffer.from(s, 'utf8').toString('hex');

/** Egalite stricte, sans tolerance, -0 distingue de 0. */
const pareil = (obtenu, attendu, quoi) => assert.ok(Object.is(obtenu, attendu), `${quoi} : ${obtenu} au lieu de ${attendu}`);

function verifierFlux(cas) {
  assert.equal(hex(cas.key), cas.utf8_hex, `${cas.label} : UTF-8`);
  for (const [flux, { h, u }] of Object.entries(cas.streams)) {
    pareil(fnv1a32(cas.key + '#' + flux), h, `${cas.label} h(${flux})`);
    pareil(tirage(cas.key, flux), u, `${cas.label} u(${flux})`);
  }
  pareil(variante(cas.key, 3), cas.variant_k3, `${cas.label} variante k=3`);
  pareil(variante(cas.key, 4), cas.variant_k4, `${cas.label} variante k=4`);
  pareil(rotation(cas.key), cas.rot, `${cas.label} rotation`);
  pareil(echelle(cas.key), cas.scale, `${cas.label} echelle`);
  pareil(tirage(cas.key, 'keep'), cas.keep, `${cas.label} keep`);
}

test('vecteurs du contrat : cles lat/lon, au bit pres', () => {
  assert.equal(V.schema, 'atlas-objets/0.1#seed');
  assert.ok(V.ll.length >= 7);
  for (const cas of V.ll) {
    pareil(microdegres(cas.lat), cas.i_lat, `${cas.label} i_lat`);
    pareil(microdegres(cas.lon), cas.i_lon, `${cas.label} i_lon`);
    assert.equal(cleLatLon(cas.lat, cas.lon), cas.key, `${cas.label} cle`);
    verifierFlux(cas);
  }
});

test('vecteurs du contrat : cles OSM et de referentiel, UTF-8 compris', () => {
  for (const cas of V.keys) verifierFlux(cas);
});

test('vecteurs du contrat : points de maille en Lambert-93', () => {
  for (const cas of V.cells) {
    const p = pointMaille(cas.type, cas.ix, cas.iy, cas.step_m);
    assert.equal(p.cle, cas.key);
    assert.equal(cleMaille(cas.type, cas.ix, cas.iy), cas.key);
    pareil(p.x, cas.x, `${cas.key} x`);
    pareil(p.y, cas.y, `${cas.key} y`);
    pareil(tirage(cas.key, 'keep'), cas.keep, `${cas.key} keep`);
  }
});

test('FNV-1a 32 bits : valeurs de reference publiees', () => {
  assert.equal(fnv1a32(''), 0x811c9dc5);
  assert.equal(fnv1a32('a'), 0xe40c292c);
  assert.equal(fnv1a32('foobar'), 0xbf9cf968);
});

test('memes valeurs qu une implementation Python de reference', () => {
  // Calcule le 19/09/2026 en Python (octets UTF-8, masque 32 bits, math.pi) :
  // c'est la garantie que Blender et Atlas tirent le meme arbre. Les vecteurs
  // officiels du contrat, fournis par pix2hdr, s'ajouteront ici.
  assert.equal(fnv1a32('é'), 513665217);                       // 2 octets UTF-8
  assert.equal(fnv1a32('Platane d’Orient'), 4086044874);        // apostrophe typographique
  assert.equal(fnv1a32('ll:43305000,5395000#variant'), 3030757554);
  assert.equal(rotation('ll:43305000,5395000'), 0.07047368220888157);
  assert.equal(echelle('ll:43305000,5395000'), 1.037027538800612);
});

test('microdegres entiers, sans zero negatif', () => {
  assert.equal(microdegres(43.305), 43305000);
  assert.equal(microdegres(5.395), 5395000);
  assert.equal(microdegres(-1.5e-7), 0);
  assert.equal(microdegres(-6e-7), -1);
  assert.ok(!Object.is(microdegres(-0), -0));
  assert.equal(cleLatLon(-0, -0), 'll:0,0');
});

test('la cle d un point, et son refus s il est illisible', () => {
  assert.equal(cleLatLon(43.305, 5.395), 'll:43305000,5395000');
  assert.equal(cleLatLon(-21.1151, 55.5364), 'll:-21115100,55536400');
  assert.equal(cleLatLon(NaN, 5), null);
  assert.equal(cleLatLon(43, undefined), null);
});

test('un tirage est stable, dans [0, 1), et propre a chaque flux', () => {
  const cle = cleLatLon(43.305, 5.395);
  const u = tirage(cle, 'variant');
  assert.equal(tirage(cle, 'variant'), u);
  assert.ok(u >= 0 && u < 1);
  assert.notEqual(tirage(cle, 'rot'), u);
});

test('variante, rotation et echelle restent dans leurs bornes', () => {
  for (let i = 0; i < 500; i++) {
    const cle = cleLatLon(43.3 + i * 1e-5, 5.39 - i * 1e-5);
    const v = variante(cle, 4);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 4);
    const r = rotation(cle);
    assert.ok(r >= 0 && r < 2 * Math.PI);
    const s = echelle(cle);
    assert.ok(s >= 0.9 && s < 1.1);
  }
});

test('les variantes se repartissent, elles ne tombent pas toutes sur la meme', () => {
  const compte = [0, 0, 0];
  for (let i = 0; i < 3000; i++) compte[variante(cleLatLon(43.3 + i * 1e-5, 5.39), 3)]++;
  for (const n of compte) assert.ok(n > 800 && n < 1200, `repartition ${compte}`);
});

test('la densite garde des ensembles emboites', () => {
  const cles = Array.from({ length: 1000 }, (_, i) => cleLatLon(43.3, 5.39 + i * 1e-5));
  const a = cles.filter((c) => garde(c, 0.3));
  const b = cles.filter((c) => garde(c, 0.6));
  for (const c of a) assert.ok(b.includes(c));
  assert.ok(a.length < b.length);
  assert.equal(cles.filter((c) => garde(c, 0)).length, 0);
  assert.equal(cles.filter((c) => garde(c, 1)).length, 1000);
});
