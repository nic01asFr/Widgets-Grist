/**
 * Qualité adaptative de l'éclairage (lib/qualite-eclairage.js) et hystérésis
 * des ombres (lib/eclairage-rendu.js, `repartirSources`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PALIERS, indicePalier, objectifImages, palierInitial, budgetDuPalier, ratioApplique, creerRegulateur,
} from '../lib/qualite-eclairage.js';
import { repartirSources, penteAuPied } from '../lib/eclairage-rendu.js';

test('paliers : du plus riche au plus sobre, le minimal sans vraie lumière', () => {
  assert.deepEqual(PALIERS.map((p) => p.nom), ['haut', 'moyen', 'bas', 'minimal']);
  for (let i = 1; i < PALIERS.length; i++) {
    assert.ok(PALIERS[i].ombres <= PALIERS[i - 1].ombres);
    assert.ok(PALIERS[i].lumieres <= PALIERS[i - 1].lumieres);
  }
  const m = PALIERS[indicePalier('minimal')];
  assert.equal(m.ombres, 0);
  assert.equal(m.lumieres, 0);
  assert.equal(indicePalier('inconnu'), -1);
});

test('objectif : 30 images/s au téléphone, 55 ailleurs', () => {
  assert.equal(objectifImages({ mobile: true }), 30);
  assert.equal(objectifImages({ mobile: false }), 55);
  assert.equal(objectifImages(), 55);
});

test('palier de départ selon l’appareil', () => {
  assert.equal(PALIERS[palierInitial({ mobile: false, memoireGo: 16, coeurs: 8, ratioPixels: 1.5 })].nom, 'haut');
  assert.equal(PALIERS[palierInitial({ mobile: false, memoireGo: 2, coeurs: 8 })].nom, 'moyen');
  assert.equal(PALIERS[palierInitial({ mobile: false, ratioPixels: 3 })].nom, 'moyen');
  assert.equal(PALIERS[palierInitial({ mobile: true, memoireGo: 8, coeurs: 8, ratioPixels: 3 })].nom, 'bas');
  assert.equal(PALIERS[palierInitial({ mobile: true, memoireGo: 2 })].nom, 'minimal');
  assert.equal(PALIERS[palierInitial({ allege: true, coeurs: 8 })].nom, 'bas');
  assert.equal(PALIERS[palierInitial({ allege: true, coeurs: 2 })].nom, 'minimal');
  // Mémoire inconnue (hors Chromium) : pas de pénalité.
  assert.equal(PALIERS[palierInitial({ mobile: false })].nom, 'haut');
});

test('le bouton « Ombres » et le relief coupent aussi les ombres des lampes', () => {
  assert.equal(budgetDuPalier(0, { ombres: true }).ombres, 4);
  assert.equal(budgetDuPalier(0, { ombres: false }).ombres, 0);
  assert.equal(budgetDuPalier(0, { ombres: true, relief: true }).ombres, 0);
  assert.equal(budgetDuPalier(0, { ombres: false }).lumieres, 16);
  assert.equal(budgetDuPalier(99, {}).lumieres, 0);
});

test('ratio de pixels : plafonné par le palier, jamais relevé', () => {
  assert.equal(ratioApplique(3, 2), 2);
  assert.equal(ratioApplique(1.5, 2), 1.5);
  assert.equal(ratioApplique(3, null), 3);
  assert.equal(ratioApplique(undefined, null), 1);
});

/** Alimente le régulateur à `fps` constant pendant `ms`, depuis `t0` ; rend [t, changements]. */
function nourrir(r, fps, ms, t0) {
  const pas = 1000 / fps;
  const changements = [];
  let t = t0;
  for (; t < t0 + ms; t += pas) {
    const c = r.image(t);
    if (c != null) changements.push({ t, palier: c });
  }
  return [t, changements];
}

test('régulateur : descente rapide sous l’objectif', () => {
  const r = creerRegulateur({ palier: 0, objectif: 55 });
  const [, ch] = nourrir(r, 40, 3000, 0);
  assert.equal(ch.length >= 1, true);
  assert.ok(ch[0].t <= 1700, `descente en ${ch[0].t} ms`);
  assert.equal(ch[0].palier, 1);
});

test('régulateur : aucun changement dans la bande morte', () => {
  const r = creerRegulateur({ palier: 1, objectif: 55 });
  const [, ch] = nourrir(r, 54, 20000, 0);
  assert.deepEqual(ch, []);
});

test('régulateur : remontée prudente (trois fenêtres au-dessus de la marge)', () => {
  const r = creerRegulateur({ palier: 2, objectif: 55 });
  const [, ch] = nourrir(r, 60, 5000, 0);
  assert.equal(ch.length, 1);
  assert.equal(ch[0].palier, 1);
  assert.ok(ch[0].t >= 2200, 'pas avant trois fenêtres');
});

test('régulateur : pas d’oscillation — un palier d’où l’on tombe deux fois est abandonné', () => {
  // Le palier 0 coûte trop (40 images/s), le palier 1 passe large (62).
  const r = creerRegulateur({ palier: 0, objectif: 55, attenteMs: 5000 });
  let t = 0;
  let changements = 0;
  for (let i = 0; i < 600; i++) {       // 10 minutes simulées, par pas de 1 s
    const fps = r.palier === 0 ? 40 : 62;
    const [t2, ch] = nourrir(r, fps, 1000, t);
    t = t2;
    changements += ch.length;
  }
  assert.equal(r.palier, 1);
  // Chute, remontée d'essai après l'attente, chute : trois changements, puis plus rien.
  assert.ok(changements <= 3, `${changements} changements`);
});

test('régulateur : une carte immobile (rendu à la demande) ne compte pas', () => {
  const r = creerRegulateur({ palier: 0, objectif: 55 });
  let ch = [];
  // Une image toutes les 500 ms : ce n'est pas un régime, pas de descente.
  for (let t = 0; t < 20000; t += 500) { const c = r.image(t); if (c != null) ch.push(c); }
  assert.deepEqual(ch, []);
});

test('régulateur : bornes min / max respectées', () => {
  const r = creerRegulateur({ palier: 3, objectif: 30, max: 3 });
  const [, ch] = nourrir(r, 10, 5000, 0);
  assert.deepEqual(ch, []);
  const r2 = creerRegulateur({ palier: 0, objectif: 30, min: 0 });
  const [, ch2] = nourrir(r2, 120, 5000, 0);
  assert.deepEqual(ch2, []);
});

/* ------------------------------------------------------------------ *
 * Hystérésis des ombres (P7)
 * ------------------------------------------------------------------ */

const bas = { y: -1 };
const mat = (id, x) => ({ id, x, y: 6, z: 0, allume: true, dir: bas });

test('hystérésis : une ombre ne saute pas quand l’ordre des distances change de peu', () => {
  const s = [mat('A', 10), mat('B', 11), mat('C', 30)];
  const r1 = repartirSources(s, { x: 0, y: 6, z: 0 }, { ombres: 1, lumieres: 2 });
  assert.deepEqual(r1.ombrees, ['A']);
  // La caméra glisse : B devient légèrement plus proche que A.
  const cam = { x: 10.8, y: 6, z: 0 };
  const sans = repartirSources(s, cam, { ombres: 1, lumieres: 2 });
  assert.deepEqual(sans.ombrees, ['B'], 'sans hystérésis, l’ombre saute');
  const avec = repartirSources(s, cam, { ombres: 1, lumieres: 2 }, r1);
  assert.deepEqual(avec.ombrees, ['A'], 'avec hystérésis, A garde son ombre');
  assert.deepEqual(avec.eclairantes, ['A', 'B']);
});

test('hystérésis : hors de la marge, l’ombre passe à la plus proche', () => {
  const s = [mat('A', 0), mat('B', 50), mat('C', 100), mat('D', 150)];
  const r1 = repartirSources(s, { x: 0, y: 6, z: 0 }, { ombres: 1, lumieres: 1 });
  assert.deepEqual(r1.ombrees, ['A']);
  // Caméra à côté de D : A est au rang 3 (≥ 1 + 2) et à 150 m contre 0.
  const r2 = repartirSources(s, { x: 150, y: 6, z: 0 }, { ombres: 1, lumieres: 1 }, r1);
  assert.deepEqual(r2.ombrees, ['D']);
});

test('hystérésis : une source éteinte perd son ombre, le budget reste plein', () => {
  const s = [mat('A', 10), mat('B', 12), mat('C', 14)];
  const r1 = repartirSources(s, { x: 0, y: 6, z: 0 }, { ombres: 2, lumieres: 3 });
  assert.deepEqual(r1.ombrees, ['A', 'B']);
  s[0].allume = false;
  const r2 = repartirSources(s, { x: 0, y: 6, z: 0 }, { ombres: 2, lumieres: 3 }, r1);
  assert.deepEqual(r2.ombrees, ['B', 'C']);
  assert.deepEqual(r2.emissives, []);
});

test('hystérésis : l’ordre d’avant est gardé (même lampe du réservoir)', () => {
  const s = [mat('A', 10), mat('B', 11), mat('C', 12)];
  const r1 = { ombrees: ['C', 'A'], eclairantes: ['C', 'A', 'B'] };
  const r2 = repartirSources(s, { x: 0, y: 6, z: 0 }, { ombres: 2, lumieres: 3 }, r1);
  assert.deepEqual(r2.ombrees, ['C', 'A']);
  assert.deepEqual(r2.eclairantes, ['C', 'A', 'B']);
});

/* ------------------------------------------------------------------ *
 * Relief : pente au pied d'un luminaire (P3)
 * ------------------------------------------------------------------ */

test('pente au pied : un sol qui monte vers l’est et vers le nord', () => {
  const lat0 = 43.33;
  const mEst = 111320 * Math.cos((lat0 * Math.PI) / 180);
  // 5 % vers l'est, 10 % vers le nord.
  const sonde = (lng, lat) => 100 + (lng - 5.44) * mEst * 0.05 + (lat - lat0) * 111320 * 0.10;
  const p = penteAuPied(sonde, 5.44, lat0);
  assert.ok(Math.abs(p.x - 0.05) < 1e-6, `x = ${p.x}`);
  // Z local = sud : monter vers le nord, c'est descendre selon Z.
  assert.ok(Math.abs(p.z + 0.10) < 1e-6, `z = ${p.z}`);
});

test('pente au pied : tuile manquante → plat ; pente bornée', () => {
  assert.deepEqual(penteAuPied(() => null, 5.44, 43.33), { x: 0, z: 0 });
  const mur = (lng) => (lng > 5.44 ? 50 : 0);
  assert.equal(penteAuPied(mur, 5.44, 43.33).x, 0.35);
});

test('régulateur : une descente qui ne gagne rien est annulée, sans rechute', () => {
  // La carte seule plafonne à 50 images/s : aucun palier n'y change rien.
  const r = creerRegulateur({ palier: 0, objectif: 55 });
  let t = 0;
  let changements = 0;
  for (let i = 0; i < 120; i++) {
    const [t2, ch] = nourrir(r, 48, 1000, t);
    t = t2;
    changements += ch.length;
  }
  assert.equal(r.palier, 0, 'retour au palier riche');
  assert.equal(changements, 2, 'une descente d’essai, un retour, puis plus rien');
});

test('régulateur : une descente qui gagne est gardée', () => {
  const r = creerRegulateur({ palier: 0, objectif: 55 });
  let t = 0;
  for (let i = 0; i < 30; i++) {
    const [t2] = nourrir(r, r.palier === 0 ? 40 : 56, 1000, t);
    t = t2;
  }
  assert.equal(r.palier, 1);
});

test('régulateur : les images interrompues (chargement) ne comptent pas', () => {
  const r = creerRegulateur({ palier: 0, objectif: 55 });
  let ch = [];
  for (let t = 0; t < 10000; t += 25) { r.interrompre(); const c = r.image(t); if (c != null) ch.push(c); }
  assert.deepEqual(ch, []);
});

test('régulateur : le bruit de mesure (± 8 %) ne fait pas descendre tous les paliers', () => {
  // La carte plafonne vers 45 images/s ; chaque palier ne change rien, au bruit près.
  const r = creerRegulateur({ palier: 0, objectif: 55 });
  let t = 0;
  let graine = 7;
  const bruit = () => { graine = (graine * 16807) % 2147483647; return (graine / 2147483647 - 0.5) * 0.16; };
  for (let i = 0; i < 300; i++) {
    const [t2] = nourrir(r, 45 * (1 + bruit()), 1000, t);
    t = t2;
  }
  assert.ok(r.palier <= 1, `palier ${r.palier}`);
});
