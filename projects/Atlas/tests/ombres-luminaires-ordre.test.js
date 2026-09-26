/**
 * Contrat d'ordre dans le rendu du calque three.js (app_v7.js, `render`).
 *
 * Vérifié le 24/09/2026 en navigateur : `shadowMap.enabled` était décidé AVANT
 * `Eclairage.avantRendu()`, qui attribue les ombres aux spots. L'image où les
 * spots prenaient leur ombre partait shadow map coupée ; three.js y compilait
 * les matériaux sans ombre et ne les recompilait plus (il ne suit que le
 * nombre de lumières ombrantes, pas `shadowMap.enabled`). Aucune ombre de
 * luminaire ne s'affichait : 0 pixel d'écart entre 4 ombres et 0 ombre.
 *
 * Le rendu three.js ne se teste pas sous Node : on garde l'ordre des appels.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(ICI, '..', 'app_v7.js'), 'utf8');

test('les ombres des luminaires sont attribuées avant que la shadow map soit décidée', () => {
  const debut = source.indexOf('Eclairage.avantRendu();');
  const decision = source.indexOf('Eclairage.ombresActives()');
  const rendu = source.indexOf('self.renderer.render(self.scene, self.camera);');
  assert.ok(debut > 0 && decision > 0 && rendu > 0, 'repères introuvables');
  assert.ok(debut < decision, '`avantRendu` doit précéder la décision `shadowMap.enabled`');
  assert.ok(decision < rendu, 'décision avant le rendu de la même image');
});

test('une bascule de shadowMap.enabled fait recompiler les matériaux', () => {
  const i = source.indexOf('Eclairage.ombresActives()');
  const bloc = source.slice(i, i + 900);
  assert.match(bloc, /shadowMap\.enabled = wantShadow \|\| ombresSpots;[\s\S]*needsUpdate = true/);
});

test('pochoir : effacé juste avant le rendu three.js, masque de MapLibre invalidé après', () => {
  const i = source.indexOf('const pochoir = Eclairage.besoinPochoir();');
  const rendu = source.indexOf('self.renderer.render(self.scene, self.camera);');
  const apres = source.indexOf('map.painter.currentStencilSource = undefined');
  assert.ok(i > 0 && apres > 0, 'repères introuvables');
  assert.ok(i < rendu && rendu < apres);
  assert.match(source.slice(i, rendu), /clearStencil\(\)/);
});

test('shadow maps des lampes figées hors soleil, refaites quand les sources ombrées changent', () => {
  const i = source.indexOf('sm.autoUpdate = wantShadow;');
  assert.ok(i > 0);
  assert.match(source.slice(i, i + 400), /Eclairage\.versionOmbres\(\)[\s\S]*sm\.needsUpdate = true/);
});

test('le bouton « Ombres » et le relief passent par le budget des lampes', () => {
  const i = source.indexOf('    avantRendu() {');
  const bloc = source.slice(i, i + 2500);
  assert.match(bloc, /budgetDuPalier\([^)]*ombres: STATE\.settings\.shadows, relief: STATE\.settings\.terrain3D/);
});
