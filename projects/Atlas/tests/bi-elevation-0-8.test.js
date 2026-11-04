/**
 * Contrat 0.8 : `getElevationGrid`, une grille d'altitudes en mètres lue dans le relief que la carte a chargé.
 * node --test projects/Atlas/tests/bi-elevation-0-8.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { normaliserOptionsElevation, grilleDAltitudes, creerLimiteur, dimensionsMetres, metresParPixelTuile256, SANS_DONNEE, SOURCE_RELIEF, CELLULES_MAX, APPELS_PAR_SECONDE } from '../lib/bi/elevation-grille.js';
import { COMMANDES, COMMANDES_0_8, CAPACITE_DE_COMMANDE, validerCommande, versionDeCommande } from '../lib/bi/pont.js';
import { TEXTES_COMMANDES } from '../lib/bi/describe.js';
import { carteSimulee } from './aide-carte-bi.js';

const VUE = [5.38, 43.29, 5.39, 43.30];

test('contrat : getElevationGrid est une commande 0.8 de la capacité socle, décrite, refusée à un hôte resté en 0.7', () => {
  assert.deepEqual([...COMMANDES_0_8], ['getElevationGrid']);
  assert.ok('getElevationGrid' in COMMANDES); assert.equal(versionDeCommande('getElevationGrid'), '0.8'); assert.equal(CAPACITE_DE_COMMANDE.getElevationGrid, 'socle');
  assert.ok(Array.isArray(TEXTES_COMMANDES.getElevationGrid) && TEXTES_COMMANDES.getElevationGrid[0].length > 80);
  const ctx = { origine: 'https://hote.test', autorisees: ['https://hote.test'] };
  const msg = (version, args) => ({ source: 'hote-bi', version, id: 'a', cmd: 'getElevationGrid', args });
  assert.equal(validerCommande(msg('0.7', []), ctx).code, 'version');
  assert.equal(validerCommande(msg('0.8', []), ctx).ok, true);
  assert.equal(validerCommande(msg('0.8', [{ bbox: VUE, resolution: 10 }]), ctx).ok, true);
  assert.equal(validerCommande(msg('0.8', ['x']), ctx).code, 'argument');
});

test('options : emprise et résolution vérifiées, la vue sert de défaut, les erreurs portent un code', () => {
  const o = normaliserOptionsElevation({ bbox: VUE, resolution: 10 }, undefined);
  assert.deepEqual(o.bbox, VUE); assert.equal(o.resolution, 10);
  const { largeur, hauteur } = dimensionsMetres(VUE);
  assert.equal(o.colonnes, Math.ceil(largeur / 10)); assert.equal(o.lignes, Math.ceil(hauteur / 10));
  assert.deepEqual(normaliserOptionsElevation(undefined, VUE).bbox, VUE, 'la vue par défaut');
  assert.equal(normaliserOptionsElevation(undefined, VUE).resolution, 30, '30 m par défaut');
  assert.throws(() => normaliserOptionsElevation(undefined, undefined), /emprise_invalide/);
  for (const mauvais of [{ bbox: [1, 2, 3] }, { bbox: [3, 2, 1, 4] }, { bbox: [0, 0, 181, 1] }, { bbox: [0, 86, 1, 87] }, { bbox: ['a', 0, 1, 1] }]) assert.throws(() => normaliserOptionsElevation(mauvais, VUE), /emprise_invalide/, JSON.stringify(mauvais));
  for (const mauvais of [{ resolution: 0 }, { resolution: 0.5 }, { resolution: 1001 }, { resolution: 'x' }]) assert.throws(() => normaliserOptionsElevation(mauvais, VUE), /resolution_invalide/, JSON.stringify(mauvais));
  assert.throws(() => normaliserOptionsElevation({ foo: 1 }, VUE), /option inconnue/);
  assert.throws(() => normaliserOptionsElevation('x', VUE), /objet d'options/);
});

test('options : une grille de plus de CELLULES_MAX cellules est refusée avec la résolution minimale utile', () => {
  const vaste = [5.0, 43.0, 5.5, 43.4];
  assert.throws(() => normaliserOptionsElevation({ bbox: vaste, resolution: 10 }, VUE), (e) => /grille_trop_grande/.test(e.message) && /au moins \d+/.test(e.message));
  const ok = normaliserOptionsElevation({ bbox: vaste, resolution: 150 }, VUE);
  assert.ok(ok.colonnes * ok.lignes <= CELLULES_MAX);
});

test('grille : rangée du nord au sud et de l\'ouest à l\'est, une valeur au centre de chaque cellule, arrondie au centimètre', () => {
  const opt = { bbox: [0, 0, 0.002, 0.002], resolution: 100, colonnes: 2, lignes: 2 };
  const appels = [];
  const r = grilleDAltitudes(opt, (lng, lat) => { appels.push([lng, lat]); return lng * 1000 + lat * 10000 + 0.123456; });
  assert.equal(r.format, 'grille-altitudes/1'); assert.equal(r.colonnes, 2); assert.equal(r.lignes, 2); assert.equal(r.valeurs.length, 4);
  assert.deepEqual(appels[0], [0.0005, 0.0015], 'première cellule : nord-ouest'); assert.deepEqual(appels[1], [0.0015, 0.0015], 'puis vers l\'est'); assert.deepEqual(appels[2], [0.0005, 0.0005], 'puis la ligne du dessous');
  assert.equal(r.valeurs[0], Math.round((0.5 + 15 + 0.123456) * 100) / 100);
  assert.equal(r.unite, 'm'); assert.equal(r.sans_donnee, SANS_DONNEE); assert.equal(r.sans_donnee_nb, 0); assert.deepEqual(r.avertissements, []);
  assert.equal(r.min, Math.min(...r.valeurs)); assert.equal(r.max, Math.max(...r.valeurs));
  for (const cle of ['repere', 'source', 'pas', 'bbox', 'resolution_demandee_m']) assert.ok(r[cle] !== undefined, cle);
  assert.equal(r.source.nom, 'Relief : Mapzen / AWS Terrain Tiles'); assert.ok(r.source.licence.length > 40, 'la licence est renseignée'); assert.ok(r.source.url.startsWith('https://'));
});

test('grille : des cellules sans altitude portent la valeur sans-donnée et sont comptées ; aucune altitude du tout : refus, jamais une grille de zéros', () => {
  const opt = { bbox: [0, 0, 0.002, 0.002], resolution: 100, colonnes: 2, lignes: 2 };
  const r = grilleDAltitudes(opt, (lng) => (lng < 0.001 ? 12.5 : null));
  assert.deepEqual(r.valeurs, [12.5, SANS_DONNEE, 12.5, SANS_DONNEE]); assert.equal(r.sans_donnee_nb, 2); assert.equal(r.min, 12.5); assert.equal(r.max, 12.5);
  assert.ok(r.avertissements.some((a) => /^sans-donnee/.test(a)));
  assert.throws(() => grilleDAltitudes(opt, () => null), /relief_non_charge/);
  assert.throws(() => grilleDAltitudes(opt, () => NaN), /relief_non_charge/);
  assert.notDeepEqual(grilleDAltitudes(opt, () => 0).valeurs, [], 'une vraie altitude nulle (bord de mer) reste une donnée');
});

test('grille : un pas natif plus grossier que la résolution demandée est signalé', () => {
  const opt = { bbox: [0, 0, 0.002, 0.002], resolution: 5, colonnes: 2, lignes: 2 };
  assert.ok(grilleDAltitudes(opt, () => 1, { pasNatifM: 38 }).avertissements.some((a) => /resolution-plus-fine-que-le-relief/.test(a)));
  assert.deepEqual(grilleDAltitudes(opt, () => 1, { pasNatifM: 6 }).avertissements, []);
  assert.ok(metresParPixelTuile256(14, 43.3) > 6.5 && metresParPixelTuile256(14, 43.3) < 7.5, 'zoom 14 : environ 7 m à Marseille');
});

test('limiteur : au plus APPELS_PAR_SECONDE par seconde', () => {
  let t = 0; const passe = creerLimiteur(() => t);
  for (let i = 0; i < APPELS_PAR_SECONDE; i++) assert.equal(passe(), true);
  assert.equal(passe(), false); t = 1000; assert.equal(passe(), true);
});

const horlogeLibre = () => { let t = 0; return { maintenant: () => (t += 1000) }; };

function carteAvecRelief({ terrain = { source: 'relief', exaggeration: 2 }, altitude = (lng, lat) => 2 * (100 + lng * 10 + lat) } = {}) {
  const m = carteSimulee();
  m.getBounds = () => ({ getWest: () => VUE[0], getSouth: () => VUE[1], getEast: () => VUE[2], getNorth: () => VUE[3] });
  m.getZoom = () => 14.4;
  m.getTerrain = () => terrain;
  m.queryTerrainElevation = ([lng, lat]) => altitude(lng, lat);
  return m;
}

test('runtime : sans relief dans la scène, refus relief_absent (jamais une grille de zéros)', async () => {
  const m = carteAvecRelief({ terrain: null });
  const { api } = attacher(m, {});
  await assert.rejects(api.getElevationGrid({ resolution: 20 }), /relief_absent/);
  const sans = carteSimulee(); sans.getBounds = m.getBounds;
  await assert.rejects(attacher(sans, {}).api.getElevationGrid({ resolution: 20 }), /relief_absent/, 'une carte sans terrain du tout');
});

test('runtime : la grille de la vue par défaut, exagération du relief retirée, source et licence rendues', async () => {
  const m = carteAvecRelief();
  const { api } = attacher(m, { horloge: horlogeLibre() });
  const r = await api.getElevationGrid({ resolution: 50 });
  assert.deepEqual(r.bbox, VUE); assert.ok(r.colonnes > 10 && r.lignes > 10);
  const lng0 = VUE[0] + 0.5 * (VUE[2] - VUE[0]) / r.colonnes, lat0 = VUE[3] - 0.5 * (VUE[3] - VUE[1]) / r.lignes;
  assert.equal(r.valeurs[0], Math.round((100 + lng0 * 10 + lat0) * 100) / 100, 'l\'exagération (2) est divisée');
  assert.equal(r.source.zoom, 14); assert.ok(r.pas_natif_m > 6.5 && r.pas_natif_m < 7.5);
  assert.ok(r.source.licence && r.source.nom.includes('Terrain Tiles'));
});

test('runtime : une emprise explicite, des tuiles manquantes signalées, des erreurs à code', async () => {
  const m = carteAvecRelief({ altitude: (lng) => (lng < 5.385 ? 40 : null) });
  const { api } = attacher(m, { horloge: horlogeLibre() });
  const r = await api.getElevationGrid({ bbox: VUE, resolution: 50 });
  assert.ok(r.sans_donnee_nb > 0 && r.valeurs.includes(SANS_DONNEE) && r.avertissements.length >= 1);
  await assert.rejects(api.getElevationGrid({ bbox: [1, 2, 3] }), /emprise_invalide/);
  await assert.rejects(api.getElevationGrid({ bbox: [5, 43, 6, 44], resolution: 5 }), /grille_trop_grande/);
  const nulle = carteAvecRelief({ altitude: () => null });
  await assert.rejects(attacher(nulle, { horloge: horlogeLibre() }).api.getElevationGrid({ resolution: 50 }), /relief_non_charge/);
});

test('runtime : le rythme est limité', async () => {
  const m = carteAvecRelief();
  const { api } = attacher(m, {});
  await api.getElevationGrid({ resolution: 100 }); await api.getElevationGrid({ resolution: 100 });
  await assert.rejects(api.getElevationGrid({ resolution: 100 }), /trop_frequent/);
});

test('la licence du relief est la même dans l\'export 3D', async () => {
  const R = await import('../lib/export-relief.js');
  assert.equal(R.RELIEF_ATTRIBUTION.source, SOURCE_RELIEF.nom);
  assert.ok(R.RELIEF_ATTRIBUTION.licence && R.RELIEF_ATTRIBUTION.licence.length > 40, 'plus de « à renseigner »');
});
