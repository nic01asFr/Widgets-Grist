import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { positionSoleil, coucherLever, HAUTEUR_COUCHER_DEG } from '../lib/soleil.js';
import { instantLocal, etatPointLumineux } from '../lib/eclairage-profil.js';

// Vecteurs PROVISOIRES : produits en exécutant la référence de pix2hdr
// (src/pairs/sun.py, md5 dans le fichier), à remplacer par ceux que pix2hdr
// publiera. Ne pas les régénérer ici à partir de lib/soleil.js.
const V = JSON.parse(readFileSync(new URL('./fixtures/soleil-noaa-vecteurs.json', import.meta.url), 'utf8'));

test('la traduction suit la référence NOAA de pix2hdr à 1e-9° près', () => {
  assert.equal(V.cas.length, 84);
  let pire = 0;
  for (const c of V.cas) {
    const r = positionSoleil(c.lat, c.lon, Date.parse(c.instant));
    const dh = Math.abs(r.hauteur - c.hauteur);
    // L'azimut boucle à 360° : on compare l'écart angulaire.
    const da = Math.abs(((r.azimut - c.azimut + 540) % 360) - 180);
    pire = Math.max(pire, dh, da);
    assert.ok(dh <= V.tolerance_deg, `${c.lieu} ${c.instant} hauteur ${r.hauteur} / ${c.hauteur}`);
    assert.ok(da <= V.tolerance_deg, `${c.lieu} ${c.instant} azimut ${r.azimut} / ${c.azimut}`);
  }
  assert.ok(pire <= V.tolerance_deg);
});

test('coucher et lever apparents, à la seconde, au bon seuil', () => {
  const midi = instantLocal('2026-01-15', 12 * 60, 'Europe/Paris');
  const { coucher, lever } = coucherLever(midi, 43.333, 5.444);
  assert.equal(coucher % 1000, 0);
  assert.equal(lever % 1000, 0);
  // Au coucher, le soleil est à −0,833° à une seconde près (≈ 0,004° à Marseille en janvier).
  assert.ok(Math.abs(positionSoleil(43.333, 5.444, coucher).hauteur - HAUTEUR_COUCHER_DEG) < 0.01);
  assert.ok(Math.abs(positionSoleil(43.333, 5.444, lever).hauteur - HAUTEUR_COUCHER_DEG) < 0.01);
  // Marseille, mi-janvier : coucher vers 17 h 25, lever vers 8 h (heure locale).
  const hh = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
  assert.match(hh(coucher), /^17:[12]\d$/);
  assert.match(hh(lever), /^0[78]:\d\d$/);
});

test('nuit polaire : pas de lever ni de coucher, et on le dit par null', () => {
  const midi = Date.parse('2026-12-21T11:00:00Z');
  const { coucher, lever } = coucherLever(midi, 78.22, 15.65); // Svalbard
  assert.equal(coucher, null);
  assert.equal(lever, null);
});

test('branché sur le profil nocturne : la voirie de pix2hdr suit le vrai soleil', () => {
  const fuseau = 'Europe/Paris';
  const ctx = { lat: 43.3049, lon: 5.3947, fuseau, soleil: (midiMs, lat, lon) => coucherLever(midiMs, lat, lon) };
  const profil = { nomProfil: 'voirie_A', allumageSoir: '+0CS', extinctionMatin: '+0LS' };
  const point = { statut: 'functional', temperatureCouleur: 3000, puissance: 40 };
  const a = (d, h, m) => instantLocal(d, h * 60 + m, fuseau);
  // Hiver : allumée à 18 h, éteinte à 16 h.
  assert.equal(etatPointLumineux(point, profil, [], a('2026-01-15', 18, 0), ctx).allume, true);
  assert.equal(etatPointLumineux(point, profil, [], a('2026-01-15', 16, 0), ctx).allume, false);
  // Été : encore éteinte à 21 h (coucher vers 21 h 15), allumée à 22 h.
  assert.equal(etatPointLumineux(point, profil, [], a('2026-06-21', 21, 0), ctx).allume, false);
  assert.equal(etatPointLumineux(point, profil, [], a('2026-06-21', 22, 0), ctx).allume, true);
});
