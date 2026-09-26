/**
 * Horloge de scène, rendu des luminaires, nuit dans le rendu.
 * node --test "projects/Atlas/tests/eclairage-scene.test.js"
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FUSEAU_DEFAUT, fuseauValide, fuseauScene, dateValide, dateLocaleScene, instantScene,
  blocHorloge, horlogeDepuisReglages, soleilMemorise,
} from '../lib/horloge-scene.js';
import {
  kelvinVersRvb, fluxDuPoint, angleSolideCone, candelas, intensiteAffichee, EXPOSITION_NUIT,
  repartirSources, eclaireLeSol, estPointLumineux, profilDuPoint, libelleEtat, EFFICACITE_LM_W, poseLuminaire,
} from '../lib/eclairage-rendu.js';
import { opaciteNuit, facteursNuit, estNeutre, TEINTE_NUIT } from '../lib/nuit-rendu.js';
import { etatPointLumineux, heureLocale } from '../lib/eclairage-profil.js';
import { coucherLever } from '../lib/soleil.js';
import { reglagesAEnregistrer, reglagesDepuisJSON } from '../lib/scene-prefs.js';

const proche = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

/* ------------------------------------------------------------------ *
 * Horloge
 * ------------------------------------------------------------------ */

test('le fuseau par défaut est celui de Paris, un fuseau illisible y ramène', () => {
  assert.equal(FUSEAU_DEFAUT, 'Europe/Paris');
  assert.equal(fuseauValide('Indian/Reunion'), true);
  assert.equal(fuseauValide('Mars/Olympus'), false);
  assert.equal(fuseauValide(''), false);
  assert.equal(fuseauScene({}), 'Europe/Paris');
  assert.equal(fuseauScene({ fuseau: 'Pas/Un_Fuseau' }), 'Europe/Paris');
  assert.equal(fuseauScene({ fuseau: 'America/Martinique' }), 'America/Martinique');
});

test('une date épinglée l’emporte sur la date du sélecteur', () => {
  const settings = { date: new Date(2026, 5, 15, 12, 0, 0), dateEpinglee: '2026-01-10' };
  assert.equal(dateLocaleScene(settings), '2026-01-10');
  assert.equal(dateLocaleScene({ date: new Date(2026, 5, 15, 12, 0, 0) }), '2026-06-15');
  assert.equal(dateLocaleScene({ date: new Date(2026, 5, 15), dateEpinglee: '2026-02-30' }), '2026-06-15',
    'une date qui n’existe pas n’est pas épinglée');
  assert.equal(dateValide('2026-02-28'), '2026-02-28');
  assert.equal(dateValide('2026-2-28'), null);
});

test('l’heure est composée dans le fuseau de la scène, pas du navigateur', () => {
  // 14 h 30 le 15 juin à Paris = 12 h 30 UTC (heure d'été), où que tourne le test.
  const t = instantScene({ date: new Date(2026, 5, 15, 12), timeOfDay: 870 });
  assert.equal(new Date(t).toISOString(), '2026-06-15T12:30:00.000Z');
  // En hiver : 13 h 30 UTC.
  const h = instantScene({ dateEpinglee: '2026-01-15', timeOfDay: 870 });
  assert.equal(new Date(h).toISOString(), '2026-01-15T13:30:00.000Z');
  // La même heure de mur à La Réunion (UTC+4) tombe quatre heures plus tôt en UTC.
  const r = instantScene({ dateEpinglee: '2026-01-15', timeOfDay: 870, fuseau: 'Indian/Reunion' });
  assert.equal(new Date(r).toISOString(), '2026-01-15T10:30:00.000Z');
});

test('le bloc horloge porte un instant complet, avec le décalage du jour', () => {
  const ete = blocHorloge({ dateEpinglee: '2026-06-15', timeOfDay: 870 }, { lat: 43.33, lng: 5.44 });
  assert.equal(ete.instant, '2026-06-15T14:30:00+02:00');
  assert.equal(ete.fuseau, 'Europe/Paris');
  assert.deepEqual(ete.lieu, [5.44, 43.33]);
  assert.equal(ete.date_epinglee, true);
  const hiver = blocHorloge({ date: new Date(2026, 0, 15, 12), timeOfDay: 60 }, null);
  assert.equal(hiver.instant, '2026-01-15T01:00:00+01:00');
  assert.equal(hiver.date_epinglee, false);
  assert.equal(hiver.lieu, null);
  // L'aller-retour : ce qu'on écrit se relit à l'identique.
  const relu = horlogeDepuisReglages({ horloge: ete });
  assert.deepEqual(relu, { fuseau: 'Europe/Paris', timeOfDay: 870, dateEpinglee: '2026-06-15', lieu: { lng: 5.44, lat: 43.33 } });
});

test('une scène déclare son horloge en bloc ou à plat ; l’illisible est ignoré', () => {
  assert.deepEqual(horlogeDepuisReglages({ fuseau: 'Europe/Paris', dateEpinglee: '2026-12-21', timeOfDay: 1320 }),
    { fuseau: 'Europe/Paris', timeOfDay: 1320, dateEpinglee: '2026-12-21' });
  assert.deepEqual(horlogeDepuisReglages({ horloge: { fuseau: 'Nulle/Part', instant: 'hier', lieu: [500, 1] } }), {});
  assert.deepEqual(horlogeDepuisReglages(null), {});
  // Un instant en UTC se relit en heure du site.
  const r = horlogeDepuisReglages({ horloge: { instant: '2026-01-15T22:00:00Z', date_epinglee: true } });
  assert.equal(r.timeOfDay, 23 * 60);
  assert.equal(r.dateEpinglee, '2026-01-15');
});

test('les préférences retiennent le fuseau et la date seulement épinglée', () => {
  const g = reglagesAEnregistrer({ fuseau: 'Europe/Paris', dateEpinglee: null, date: new Date() });
  assert.deepEqual(g, { fuseau: 'Europe/Paris' });
  const e = reglagesDepuisJSON(JSON.stringify(reglagesAEnregistrer({ dateEpinglee: '2026-01-10' })));
  assert.deepEqual(e, { dateEpinglee: '2026-01-10' });
});

test('le soleil mémorisé ne recalcule pas ce qu’il sait déjà', () => {
  let n = 0;
  const s = soleilMemorise((m, la, lo) => { n++; return { coucher: m + la, lever: m - lo }; }, 2);
  assert.deepEqual(s(1000, 43.3, 5.4), { coucher: 1043.3, lever: 994.6 });
  s(1000, 43.3, 5.4);
  assert.equal(n, 1);
  s(2000, 43.3, 5.4); s(3000, 43.3, 5.4); s(1000, 43.3, 5.4);
  assert.equal(n, 4, 'la plus ancienne entrée est oubliée au-delà de la taille');
});

test('voirie au Jarret : allumée au coucher NOAA, abaissée à 2 h, éteinte à 14 h', () => {
  const lieu = { lat: 43.3325, lon: 5.4437 };
  const soleil = soleilMemorise(coucherLever);
  const ctx = { ...lieu, fuseau: 'Europe/Paris', soleil };
  const point = { statut: 'functional', temperatureCouleur: 3000, puissance: 36, typeSource: 'LED' };
  const { profil, plages } = profilDuPoint({
    allumageSoir: '+0CS', extinctionMatin: '+0LS', profilNocturne: 'voirie_A',
    plages: JSON.stringify([{ nomPlage: 'abaissement', grandeurVariation: 'F', formatVariation: '%', valeur: 50, heureDebut: '23:30HL', heureFin: '05:30HL' }]),
  });
  const a = (min, date = '2026-01-15') => instantScene({ dateEpinglee: date, timeOfDay: min });
  assert.equal(etatPointLumineux(point, profil, plages, a(14 * 60), ctx).allume, false);
  const nuit = etatPointLumineux(point, profil, plages, a(22 * 60), ctx);
  assert.equal(nuit.allume, true);
  assert.equal(nuit.facteurFlux, 1);
  const deux = etatPointLumineux(point, profil, plages, a(2 * 60), ctx);
  assert.equal(deux.facteurFlux, 0.5);
  assert.equal(libelleEtat(deux), 'abaissé à 50 %');
  // Le coucher NOAA de janvier à Marseille tombe entre 17 h et 17 h 30 locales.
  const { coucher } = coucherLever(a(12 * 60), lieu.lat, lieu.lon);
  const hl = heureLocale(coucher, 'Europe/Paris').minutes;
  assert.ok(hl > 17 * 60 && hl < 17 * 60 + 30, `coucher à ${hl} min`);
  assert.equal(etatPointLumineux(point, profil, plages, coucher - 60000, ctx).allume, false);
  assert.equal(etatPointLumineux(point, profil, plages, coucher, ctx).allume, true);
});

test('mise en lumière B1 : éteinte à 1 h, que l’éclairage de voirie reste allumé', () => {
  const soleil = soleilMemorise(coucherLever);
  const ctx = { lat: 43.3325, lon: 5.4437, fuseau: 'Europe/Paris', soleil };
  const { profil, plages } = profilDuPoint({ allumageSoir: '+0CS', extinctionMatin: '01:00HL' });
  const point = { statut: 'functional', temperatureCouleur: 3000, puissance: 50 };
  const t = (min) => instantScene({ dateEpinglee: '2026-06-15', timeOfDay: min });
  assert.equal(etatPointLumineux(point, profil, plages, t(23 * 60), ctx).allume, true);
  assert.equal(etatPointLumineux(point, profil, plages, t(90), ctx).allume, false);
  assert.equal(libelleEtat(etatPointLumineux(point, profil, plages, t(90), ctx)), 'éteint');
});

/* ------------------------------------------------------------------ *
 * Couleur et intensité
 * ------------------------------------------------------------------ */

test('kelvins → RVB : le chaud est orangé, 6 600 K est blanc, le froid bleuit', () => {
  const c3000 = kelvinVersRvb(3000);
  assert.equal(c3000[0], 1);
  assert.ok(proche(c3000[1], 177.2 / 255, 0.003), `vert ${c3000[1] * 255}`);
  assert.ok(proche(c3000[2], 109.9 / 255, 0.003), `bleu ${c3000[2] * 255}`);
  const c2700 = kelvinVersRvb(2700);
  assert.ok(c2700[2] < c3000[2] && c2700[1] < c3000[1], '2 700 K est plus chaud que 3 000 K');
  assert.deepEqual(kelvinVersRvb(6600).map((v) => Math.round(v * 255)), [255, 255, 255]);
  const froid = kelvinVersRvb(10000);
  assert.ok(froid[2] === 1 && froid[0] < 1, 'au-delà de 6 600 K le rouge baisse');
  assert.deepEqual(kelvinVersRvb(null), [1, 1, 1]);
  assert.deepEqual(kelvinVersRvb(1800), kelvinVersRvb(1800).map((v) => Math.min(1, Math.max(0, v))));
  assert.equal(kelvinVersRvb(1000)[2], 0, 'sous 1 900 K, aucun bleu');
});

test('le flux vient de la fiche : fluxLuminaire, sinon puissance × efficacité de la source', () => {
  assert.deepEqual(fluxDuPoint({ fluxLuminaire: 4200, puissance: 36 }), { flux: 4200, origine: 'fluxLuminaire' });
  assert.deepEqual(fluxDuPoint({ puissance: 36, typeSource: 'LED' }), { flux: 36 * 110, origine: 'puissance' });
  assert.deepEqual(fluxDuPoint({ puissance: 100, typeSource: 'shp' }), { flux: 100 * EFFICACITE_LM_W.SHP, origine: 'puissance' });
  assert.deepEqual(fluxDuPoint({ puissance: 36, typeSource: 'XX' }), { flux: 36 * 110, origine: 'puissance' });
  assert.deepEqual(fluxDuPoint({ puissance: 0 }), { flux: null, origine: null });
  assert.deepEqual(fluxDuPoint({}), { flux: null, origine: null });
});

test('candelas ≈ flux / angle solide du cône (formule provisoire)', () => {
  assert.ok(proche(angleSolideCone(Math.PI / 2), 2 * Math.PI));
  assert.ok(proche(angleSolideCone(Math.PI / 3), Math.PI));
  assert.ok(proche(candelas(3960, Math.PI / 3), 3960 / Math.PI));
  assert.equal(candelas(0, 1), 0);
  assert.equal(candelas(1000, 0), 0, 'un cône nul n’a pas d’intensité finie à afficher');
  // Abaissement à 50 % : l'intensité affichée est divisée par deux.
  const f = { flux: 3960 };
  const plein = intensiteAffichee(f, Math.PI / 3, { facteurFlux: 1, facteurPuissance: 1 });
  assert.ok(proche(plein, 3960 / Math.PI * EXPOSITION_NUIT));
  assert.ok(proche(intensiteAffichee(f, Math.PI / 3, { facteurFlux: 0.5, facteurPuissance: 1 }), plein / 2));
  assert.equal(intensiteAffichee({ flux: null }, 1, {}), 0);
});

/* ------------------------------------------------------------------ *
 * Budget
 * ------------------------------------------------------------------ */

test('budget : les plus proches portent ombre, puis lumière, puis lampe seule', () => {
  const sources = Array.from({ length: 20 }, (_, i) => ({ id: `L${i}`, x: i * 10, y: 6, z: 0, allume: true }));
  sources[1].allume = false;
  const r = repartirSources(sources, { x: 0, y: 50, z: 0 });
  assert.deepEqual(r.ombrees, ['L0', 'L2', 'L3', 'L4']);
  assert.equal(r.eclairantes.length, 16);
  assert.deepEqual(r.eclairantes.slice(0, 4), r.ombrees);
  assert.deepEqual(r.emissives, ['L17', 'L18', 'L19'], '19 allumées : 16 lumières, 3 lampes seules');
  assert.ok(!r.eclairantes.includes('L1') && !r.emissives.includes('L1'), 'une source éteinte n’entre nulle part');
});

test('budget réglable, et stable à distance égale', () => {
  const s = [{ id: 'b', x: 1, y: 0, z: 0, allume: true }, { id: 'a', x: -1, y: 0, z: 0, allume: true }];
  assert.deepEqual(repartirSources(s, { x: 0, y: 0, z: 0 }, { ombres: 1, lumieres: 1 }),
    { ombrees: ['b'], eclairantes: ['b'], emissives: ['a'] });
  assert.deepEqual(repartirSources(s, { x: 0, y: 0, z: 0 }, { ombres: 0, lumieres: 8 }).ombrees, []);
  assert.deepEqual(repartirSources([], { x: 0, y: 0, z: 0 }), { ombrees: [], eclairantes: [], emissives: [] });
});

test('les ombres vont aux sources qui éclairent le sol, pas au projecteur tourné vers le ciel', () => {
  // Cas mesuré au Jarret (24/09/2026) : les deux projecteurs montants, les
  // plus proches de la caméra, prenaient deux des quatre ombres.
  const bas = { y: -1 };
  const s = [
    { id: 'ciel', x: 1, y: 0, z: 0, allume: true, dir: { y: 1 } },
    { id: 'facade', x: 2, y: 4, z: 0, allume: true, dir: { y: 0.82 } },
    { id: 'm1', x: 3, y: 6, z: 0, allume: true, dir: bas },
    { id: 'm2', x: 4, y: 6, z: 0, allume: true, dir: bas },
    { id: 'm3', x: 50, y: 6, z: 0, allume: true, dir: bas },
    { id: 'sansAxe', x: 60, y: 6, z: 0, allume: true },
  ];
  const r = repartirSources(s, { x: 0, y: 0, z: 0 }, { ombres: 3, lumieres: 5 });
  assert.deepEqual(r.ombrees, ['m1', 'm2', 'm3']);
  assert.deepEqual(r.eclairantes, ['m1', 'm2', 'm3', 'ciel', 'facade'], 'ombrées en tête, puis les plus proches');
  assert.deepEqual(r.emissives, ['sansAxe']);
  assert.equal(eclaireLeSol({ dir: { y: -0.5 } }), true);
  assert.equal(eclaireLeSol({ dir: { y: 0 } }), false);
  assert.equal(eclaireLeSol({}), true, 'axe inconnu : on suppose le sol');
});

/* ------------------------------------------------------------------ *
 * Lecture des entités
 * ------------------------------------------------------------------ */

test('un point lumineux se reconnaît à ses attributs EclExt obligatoires', () => {
  assert.equal(estPointLumineux({ structure: 'LANT', support: 'MAT', temperatureCouleur: 3000 }), true);
  assert.equal(estPointLumineux({ structure: 'LANT', support: 'MAT' }), false);
  assert.equal(estPointLumineux({ highway: 'street_lamp' }), false);
  assert.equal(estPointLumineux(null), false);
});

test('pose : le mât au pied, l’applique à la cote du feu, orientée par son champ', () => {
  const pied = { ancrage: 'pied' };
  const feu = { ancrage: 'feu', hauteur_de_feu_par_defaut_m: 4.0 };
  assert.deepEqual(poseLuminaire(pied, { hauteurFeu: 6.75 }, 123), { elevation: 0, azimutDeg: 123, origineAzimut: 'tirage' });
  assert.deepEqual(poseLuminaire(feu, { hauteurFeu: '5,5', azimut: -90 }, 123), { elevation: 5.5, azimutDeg: 270, origineAzimut: 'champ' });
  assert.deepEqual(poseLuminaire(feu, {}, 10), { elevation: 4, azimutDeg: 10, origineAzimut: 'tirage_provisoire' });
  assert.equal(poseLuminaire(null, { orientation: 45 }, 0).azimutDeg, 45);
  assert.equal(poseLuminaire(null, {}, 0).elevation, 0, 'luminaire de test : posé au sol');
});

test('profil lu à plat sur l’entité ; sans heure ni plage, pas de profil', () => {
  assert.deepEqual(profilDuPoint({}), { profil: null, plages: [] });
  const p = profilDuPoint({ allumageSoir: '+0CS', plages: 'abîmé' });
  assert.equal(p.profil.allumageSoir, '+0CS');
  assert.deepEqual(p.plages, []);
  const q = profilDuPoint({ plages: [{ grandeurVariation: 'EX' }, null] });
  assert.equal(q.plages.length, 1);
  assert.ok(q.profil, 'une plage seule fait un profil');
});

/* ------------------------------------------------------------------ *
 * Nuit
 * ------------------------------------------------------------------ */

test('la nuit reprend la formule du voile, et de jour ne change rien', () => {
  assert.equal(opaciteNuit(45, null), 0);
  assert.equal(opaciteNuit(12, null), 0);
  assert.ok(proche(opaciteNuit(-10, null), 0.68));
  assert.ok(proche(opaciteNuit(0, null), 12 / 28));
  assert.ok(proche(opaciteNuit(-30, { isUp: true, moonIntensity: 1 }), 0.68 * 0.65));
  assert.deepEqual(facteursNuit(0), [1, 1, 1]);
  assert.deepEqual(facteursNuit(0.02), [1, 1, 1], 'sous le seuil, le voile était retiré');
  assert.ok(estNeutre(facteursNuit(0.01)));
});

test('le facteur reproduit le mode multiply : Cb · (1 − a + a·Cs)', () => {
  const f = facteursNuit(0.68);
  const attendu = TEINTE_NUIT.map((c) => 1 - 0.68 + 0.68 * c / 255);
  f.forEach((v, i) => assert.ok(proche(v, attendu[i])));
  // Arrondi au millième, comme `toFixed(3)` du voile.
  assert.deepEqual(facteursNuit(0.12345), facteursNuit(0.123));
  assert.ok(f[2] > f[0], 'la nuit est bleue : le bleu est le moins assombri');
});

test('la nuit atteint les matériaux non éclairés (glTF KHR_materials_unlit)', async () => {
  const { estNonEclaire, couleurSousNuit } = await import('../lib/nuit-rendu.js');
  assert.equal(estNonEclaire({ isMeshBasicMaterial: true }), true);
  assert.equal(estNonEclaire({ type: 'MeshBasicMaterial' }), true);
  assert.equal(estNonEclaire({ isMeshStandardMaterial: true, type: 'MeshStandardMaterial' }), false);
  assert.equal(estNonEclaire(null), false);
  assert.deepEqual(couleurSousNuit([1, 0.5, 0.25], [1, 1, 1]), [1, 0.5, 0.25], 'de jour, inchangée');
  assert.deepEqual(couleurSousNuit([1, 0.5, 0.25], [0.5, 0.5, 0.8]), [0.5, 0.25, 0.2]);
});

test('en globe sous z12, les luminaires ne se dessinent pas (décalés de centaines de pixels)', async () => {
  const { luminairesDessinables } = await import('../lib/eclairage-rendu.js');
  assert.equal(luminairesDessinables('globe', 9), false);
  assert.equal(luminairesDessinables('globe', 11.99), false);
  assert.equal(luminairesDessinables('globe', 12), true);
  assert.equal(luminairesDessinables(undefined, 3), false, 'globe par défaut');
  assert.equal(luminairesDessinables('mercator', 3), true, 'en mercator, aucun décalage (mesuré 0 px)');
});

test('nuit du bâti (P5) : plus claire que l’ancien bleu presque noir, neutre', async () => {
  const { LUMIERE_BATI_NUIT, AMBIANCE_NUIT } = await import('../lib/nuit-rendu.js');
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  assert.ok(lum(LUMIERE_BATI_NUIT) > 3 * lum([20, 28, 60]));
  assert.ok(lum(AMBIANCE_NUIT) > lum([16, 22, 52]));
  // Reste sous le crépuscule clair (monotone vers le jour).
  assert.ok(lum(LUMIERE_BATI_NUIT) < lum([255, 210, 140]));
});
