/**
 * Contrat 0.7 : le soleil de la scène pour la page hôte — `setSun`, `getSun`, l'événement `sun`, le champ `soleil` de `exportScene3D`, l'indicateur `soleil` de `setViewMode`.
 * La lecture du soleil et le dock vivent dans l'application (vérifiés en navigateur) ; ici : le contrat, la validation, la forme rendue, le branchement du profil complet.
 * node --test projects/Atlas/tests/bi-soleil-0-7.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attacher } from '../lib/bi/bi-runtime.js';
import { brancher } from '../lib/bi/canevas.js';
import { COMMANDES, COMMANDES_0_7, CAPACITE_DE_COMMANDE, validerCommande, versionDeCommande } from '../lib/bi/pont.js';
import { TEXTES_COMMANDES, TEXTES_EVENEMENTS } from '../lib/bi/describe.js';
import { TOUS_LES_EVENEMENTS } from '../lib/bi/evenements-ext.js';
import { normaliserSetSun, reglageDepuisInstant, etatSoleil, blocSoleilExport, creerSignalSoleil } from '../lib/soleil-hote.js';
import { carteSimulee } from './aide-carte-bi.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(ICI, '..', 'app_v7.js'), 'utf8');

test('contrat : setSun et getSun sont des commandes 0.7 de la capacité socle, décrites, refusées à un hôte resté en 0.6 ; sun est un événement décrit', () => {
  assert.deepEqual([...COMMANDES_0_7], ['setSun', 'getSun']);
  for (const c of COMMANDES_0_7) {
    assert.ok(c in COMMANDES); assert.equal(versionDeCommande(c), '0.7'); assert.equal(CAPACITE_DE_COMMANDE[c], 'socle');
    assert.ok(Array.isArray(TEXTES_COMMANDES[c]) && TEXTES_COMMANDES[c][0].length > 40, c);
  }
  assert.ok(TOUS_LES_EVENEMENTS.includes('sun')); assert.ok(Array.isArray(TEXTES_EVENEMENTS.sun));
  const ctx = { origine: 'https://hote.test', autorisees: ['https://hote.test'] };
  const msg = (version, cmd, args) => ({ source: 'hote-bi', version, id: 'a', cmd, args });
  assert.equal(validerCommande(msg('0.6', 'setSun', [{ actif: true }]), ctx).code, 'version');
  assert.equal(validerCommande(msg('0.6', 'getSun', []), ctx).code, 'version');
  assert.equal(validerCommande(msg('0.7', 'setSun', [{ date: 0 }]), ctx).ok, true);
  assert.equal(validerCommande(msg('0.7', 'getSun', []), ctx).ok, true);
  assert.equal(validerCommande(msg('0.7', 'setSun', []), ctx).code, 'argument', 'setSun exige un objet');
});

test('setSun : date en ISO avec fuseau ou en millisecondes, actif booléen, au moins l un des deux', () => {
  const ms = Date.UTC(2026, 5, 21, 10, 30);
  assert.deepEqual(normaliserSetSun({ date: '2026-06-21T10:30:00Z' }), { instantMs: ms, actif: undefined });
  assert.deepEqual(normaliserSetSun({ date: '2026-06-21T12:30:00+02:00' }), { instantMs: ms, actif: undefined });
  assert.deepEqual(normaliserSetSun({ date: ms, actif: false }), { instantMs: ms, actif: false });
  assert.deepEqual(normaliserSetSun({ actif: true }), { instantMs: undefined, actif: true });
  const mauvais = [null, [], 'x', {}, { date: '2026-06-21' }, { date: '2026-06-21T10:30:00' }, { date: 'demain' }, { date: NaN }, { date: Infinity }, { date: Date.UTC(1800, 0, 1) }, { date: Date.UTC(2300, 0, 1) },
    { date: ms, actif: 'oui' }, { actif: 1 }, { date: ms, ombres: true }];
  for (const m of mauvais) assert.throws(() => normaliserSetSun(m), /setSun/, JSON.stringify(m));
});

test('l instant se règle dans le fuseau du site : jour et minutes locales', () => {
  const ms = Date.UTC(2026, 5, 21, 10, 30);
  assert.deepEqual(reglageDepuisInstant(ms, 'Europe/Paris'), { date: '2026-06-21', minutes: 12 * 60 + 30 });
  assert.deepEqual(reglageDepuisInstant(Date.UTC(2026, 5, 21, 23, 30), 'Europe/Paris'), { date: '2026-06-22', minutes: 90 }, 'passé minuit, le jour du site change');
  assert.deepEqual(reglageDepuisInstant(ms, 'Indian/Reunion'), { date: '2026-06-21', minutes: 14 * 60 + 30 });
});

test('getSun : date ISO UTC, azimut depuis le nord (0 à 360), hauteur, lever et coucher (null possible)', () => {
  const e = etatSoleil({ instantMs: Date.UTC(2026, 5, 21, 10, 30), actif: true, azimut: 181.23456, hauteur: 68.9876, lever: Date.UTC(2026, 5, 21, 3, 49), coucher: Date.UTC(2026, 5, 21, 19, 52) });
  assert.deepEqual(e, { date: '2026-06-21T10:30:00.000Z', actif: true, azimut: 181.23, hauteur: 68.99, lever: '2026-06-21T03:49:00.000Z', coucher: '2026-06-21T19:52:00.000Z' });
  const polaire = etatSoleil({ instantMs: 0, actif: false, azimut: -90, hauteur: -12.5, lever: null, coucher: null });
  assert.equal(polaire.azimut, 270, 'un azimut négatif est ramené dans 0 à 360'); assert.equal(polaire.lever, null); assert.equal(polaire.coucher, null); assert.equal(polaire.actif, false);
  assert.deepEqual(blocSoleilExport(e), { date: e.date, azimut: 181.23, hauteur: 68.99 });
});

test('événement sun : rien à l ouverture, un signal par changement d instant ou d ombres, aucun pour la même valeur', () => {
  const s = creerSignalSoleil();
  assert.equal(s.signaler(1000, true), false, 'la première lecture pose la référence');
  assert.equal(s.signaler(1000, true), false);
  assert.equal(s.signaler(2000, true), true);
  assert.equal(s.signaler(2000, false), true, 'les ombres seules comptent');
  assert.equal(s.signaler(2000, false), false);
});

test('carte nue : getSun et setSun répondent capacite_absente ; le profil complet les branche, avec l événement sun et l indicateur du dock', async () => {
  const rt = attacher(carteSimulee(), {});
  await assert.rejects(() => rt.api.getSun(), /capacite_absente.*profil complet/);
  await assert.rejects(() => rt.api.setSun({ actif: true }), /capacite_absente.*profil complet/);
  const etat = { date: '2026-06-21T10:30:00.000Z', actif: true, azimut: 181.2, hauteur: 68.9, lever: null, coucher: null };
  const poses = []; let dock = false; let abonne = null;
  const facade = {
    outils: {}, monterScene: async () => ({ couches: [] }), monterDalles: async () => ({}), retirerScene: () => 0, visibilite: () => true, cadrer: () => true,
    abonner: (fn) => { abonne = fn; return () => {}; },
    soleil: { lire: () => etat, poser: (o) => { poses.push(o); return etat; }, dock: (v) => { dock = v; return v; }, dockVisible: () => dock },
  };
  const plein = attacher(carteSimulee(), {}); brancher(plein, facade);
  assert.deepEqual(await plein.api.getSun(), etat);
  assert.deepEqual(await plein.api.setSun({ date: 0 }), etat); assert.deepEqual(poses, [{ date: 0 }]);
  const vus = []; plein.on('sun', (c) => vus.push(c));
  abonne('sun', { etat, origine: 'utilisateur' });
  assert.deepEqual(vus, [etat]);
  const r = plein.api.setViewMode('libre', { soleil: true });
  assert.equal(dock, true); assert.equal(r.dockSoleil, true);
  assert.equal(plein.api.setViewMode('libre', {}).dockSoleil, true, 'sans indicateur, le dock reste comme il est'); assert.equal(dock, true);
  plein.api.setViewMode('libre', { soleil: false }); assert.equal(dock, false);
  assert.throws(() => plein.api.setViewMode('libre', { soleil: 'oui' }), /soleil doit être true ou false/);
});

test('application : le soleil est branché sur le profil complet, signalé après chaque éclairage, et l export 3D le rend', () => {
  assert.match(app, /soleil: SoleilHote,/);
  assert.match(app, /signalerSoleilAHote\(\);\n\}/, 'updateLighting signale le soleil à son terme');
  assert.match(app, /soleil: blocSoleilExport\(etatSoleilScene\(\)\)/);
  assert.match(app, /_originSoleil = 'api';\s+try \{ updateLighting\(\); \} finally \{ _originSoleil = 'utilisateur'; \}/, 'l effet de setSun est marqué api (l hôte ignore ses propres échos)');
});
