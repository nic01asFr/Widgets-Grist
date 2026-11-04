/**
 * Contrat 0.8 : le récit piloté par la page hôte — `getRecit`, `goToStep`, l'événement `step`.
 * Le récit et la carte vivent dans l'application (vérifiés en navigateur) ; ici : le contrat, la lecture des étapes, la résolution d'une étape, le branchement du profil complet.
 * node --test projects/Atlas/tests/bi-recit-0-8.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attacher } from '../lib/bi/bi-runtime.js';
import { brancher } from '../lib/bi/canevas.js';
import { COMMANDES, COMMANDES_0_8, CAPACITE_DE_COMMANDE, validerCommande, versionDeCommande } from '../lib/bi/pont.js';
import { TEXTES_COMMANDES, TEXTES_EVENEMENTS } from '../lib/bi/describe.js';
import { TOUS_LES_EVENEMENTS } from '../lib/bi/evenements-ext.js';
import { etapesDuRecit, resumerRecit, resoudreEtape, normaliserOptionsAller, etatEtape, TEXTE_MAX } from '../lib/recit-hote.js';
import { carteSimulee } from './aide-carte-bi.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(ICI, '..', 'app_v7.js'), 'utf8');

const etape = (cle, titre, extra = {}) => ({ cle, title: titre, text: 'Texte de ' + titre, state: { camera: { center: [5.4, 43.3], zoom: 14.123, pitch: 20, bearing: 10 }, layers: [{ sourceTable: 'sites', visible: true }, { sourceTable: 'cachee', visible: false }], ...extra } });
const RECIT = [etape('a1', 'Entrée'), etape('ctx', 'Contexte de travail', { usage: { contexte: true } }), etape('b2', 'Le canal'), { title: 'Sans clé', text: '', state: {} }];

test('contrat : getRecit et goToStep sont des commandes 0.8 de la capacité socle, décrites, refusées à un hôte resté en 0.7 ; step est un événement décrit', () => {
  for (const c of ['getRecit', 'goToStep']) {
    assert.ok(COMMANDES_0_8.includes(c) && c in COMMANDES); assert.equal(versionDeCommande(c), '0.8'); assert.equal(CAPACITE_DE_COMMANDE[c], 'socle');
    assert.ok(Array.isArray(TEXTES_COMMANDES[c]) && TEXTES_COMMANDES[c][0].length > 60, c);
  }
  assert.ok(TOUS_LES_EVENEMENTS.includes('step')); assert.ok(Array.isArray(TEXTES_EVENEMENTS.step));
  const ctx = { origine: 'https://hote.test', autorisees: ['https://hote.test'] };
  const msg = (version, cmd, args) => ({ source: 'hote-bi', version, id: 'a', cmd, args });
  assert.equal(validerCommande(msg('0.7', 'getRecit', []), ctx).code, 'version');
  assert.equal(validerCommande(msg('0.7', 'goToStep', ['a1']), ctx).code, 'version');
  assert.equal(validerCommande(msg('0.8', 'getRecit', []), ctx).ok, true);
  assert.equal(validerCommande(msg('0.8', 'goToStep', ['a1']), ctx).ok, true);
  assert.equal(validerCommande(msg('0.8', 'goToStep', [2, { attendre: false }]), ctx).ok, true);
  assert.equal(validerCommande(msg('0.8', 'goToStep', []), ctx).code, 'argument', 'la cible est obligatoire');
});

test('récit : les contextes de travail n\'en font pas partie, chaque étape porte clé, titre, texte, caméra arrondie et couches visibles', () => {
  assert.equal(etapesDuRecit(RECIT).length, 3);
  const r = resumerRecit(RECIT, { courant: null, lecture: false });
  assert.equal(r.total, 3); assert.equal(r.lecture, false); assert.equal(r.courant, null); assert.equal(r.cle_courante, null);
  assert.deepEqual(r.etapes.map((e) => e.cle), ['a1', 'b2', null]);
  assert.deepEqual(r.etapes[0].camera, { center: [5.4, 43.3], zoom: 14.12, pitch: 20, bearing: 10 });
  assert.deepEqual(r.etapes[0].couches, ['sites'], 'une couche masquée n\'est pas citée');
  assert.equal(r.etapes[2].camera, null);
  assert.ok(!('_source' in r.etapes[0]));
  assert.equal(resumerRecit([etape('x', 't', {})].map((e) => ({ ...e, text: 'a'.repeat(TEXTE_MAX + 50) })), {}).etapes[0].texte.length, TEXTE_MAX, 'texte borné');
  assert.deepEqual(resumerRecit(undefined, {}), { lecture: false, total: 0, courant: null, cle_courante: null, etapes: [] });
});

test('récit : l\'étape jouée se lit par son rang DANS LE RÉCIT, même si un contexte la précède dans la liste', () => {
  const r = resumerRecit(RECIT, { courant: 2, lecture: true });   // index 2 de la liste complète = « Le canal », rang 1 du récit
  assert.equal(r.lecture, true); assert.equal(r.courant, 1); assert.equal(r.cle_courante, 'b2');
  assert.equal(resumerRecit(RECIT, { courant: 1, lecture: true }).lecture, false, 'un contexte joué n\'est pas la lecture du récit');
  assert.equal(resumerRecit(RECIT, { courant: 2, lecture: false }).courant, null, 'hors lecture, rien n\'est joué');
  assert.deepEqual(etatEtape(RECIT, 2, true), { lecture: true, index: 1, cle: 'b2', titre: 'Le canal', total: 3 });
  assert.deepEqual(etatEtape(RECIT, null, false), { lecture: false, index: null, cle: null, titre: null, total: 3 });
});

test('goToStep : une clé ou un rang, des refus à code', () => {
  assert.deepEqual(resoudreEtape(RECIT, 'b2'), { index: 1, indexSource: 2, cle: 'b2', titre: 'Le canal' });
  assert.deepEqual(resoudreEtape(RECIT, 0), { index: 0, indexSource: 0, cle: 'a1', titre: 'Entrée' });
  assert.equal(resoudreEtape(RECIT, 2).cle, null, 'une étape sans clé se joue par son rang');
  assert.throws(() => resoudreEtape(RECIT, 'ctx'), /etape_inconnue/, 'un contexte ne se joue pas comme une étape');
  assert.throws(() => resoudreEtape(RECIT, 'nope'), /etape_inconnue/);
  assert.throws(() => resoudreEtape(RECIT, 3), /etape_inconnue/); assert.throws(() => resoudreEtape(RECIT, -1), /etape_inconnue/);
  assert.throws(() => resoudreEtape(RECIT, 1.5), /etape_invalide/); assert.throws(() => resoudreEtape(RECIT, {}), /etape_invalide/);
  assert.throws(() => resoudreEtape([], 0), /recit_vide/); assert.throws(() => resoudreEtape([RECIT[1]], 0), /recit_vide/, 'une scène qui n\'a que des contextes');
});

test('goToStep : options vérifiées', () => {
  assert.deepEqual(normaliserOptionsAller(), { attendre: true, delai: 15000 });
  assert.deepEqual(normaliserOptionsAller({ attendre: false, delai: 500 }), { attendre: false, delai: 500 });
  for (const mauvais of [{ attendre: 'oui' }, { delai: 5 }, { delai: 70000 }, { delai: 1.5 }, { x: 1 }, 'x', []]) assert.throws(() => normaliserOptionsAller(mauvais), /goToStep/, JSON.stringify(mauvais));
});

test('carte nue : getRecit et goToStep répondent capacite_absente', async () => {
  const { api } = attacher(carteSimulee(), {});
  await assert.rejects(api.getRecit(), /capacite_absente/); await assert.rejects(api.goToStep('a1'), /capacite_absente/);
});

test('profil complet : le canevas branche le récit de l\'application, et son événement step devient l\'événement du composant', async () => {
  const appels = []; let abonne = null;
  const canevas = {
    monterScene() { return {}; }, retirerScene() {}, outils: {},
    abonner: (fn) => { abonne = fn; return () => {}; },
    recit: { lire: () => ({ total: 3 }), aller: async (cible, o) => { appels.push([cible, o]); return { index: 1 }; } },
  };
  const plein = attacher(carteSimulee(), {}); brancher(plein, canevas);
  assert.deepEqual(await plein.api.getRecit(), { total: 3 });
  assert.deepEqual(await plein.api.goToStep('b2', { attendre: false }), { index: 1 }); assert.deepEqual(appels, [['b2', { attendre: false }]]);
  const vus = []; plein.on('step', (c, origine) => vus.push([c, origine]));
  const etat = { lecture: true, index: 1, cle: 'b2', titre: 'Le canal', total: 3 };
  abonne('step', { etat, origine: 'api' });
  assert.equal(vus.length, 1); assert.deepEqual(vus[0][0], etat);
});

test('application : la façade du récit est branchée, signale chaque changement d\'étape et rend la main sur l\'état de la carte', () => {
  assert.match(app, /recit: RecitHote,/);
  assert.match(app, /_abonneHote\('step', \{ etat: etatEtape\(/);
  const corps = (nom) => { const i = app.indexOf('function ' + nom + '('); assert.ok(i > 0, nom); return app.slice(i, i + 2600); };
  for (const f of ['allerEtape', 'enterStoryPresentation']) assert.match(corps(f), /signalerRecitAHote\(\);/, f + ' signale l\'étape à l\'hôte');
  assert.match(app, /storyExit\(\) \{[\s\S]{0,400}signalerRecitAHote\(\);/, 'l\'arrêt de la lecture est signalé');
  assert.match(app, /_originRecit = 'api';\s*try \{ if \(_storyPresenting\) allerEtape\(etape\.indexSource\); else enterStoryPresentation\(etape\.indexSource\); \} finally \{ _originRecit = 'utilisateur'; \}/);
  assert.match(app, /map\.triggerRepaint\(\)/, 'une étape qui ne change rien rend quand même la main');
});

test('caméra d\'une étape : la forme enregistrée par l\'application (center) et la forme { lng, lat } sont lues', async () => {
  const { resumerRecit } = await import('../lib/recit-hote.js');
  const camDe = (camera) => resumerRecit([{ cle: 'a', title: 'A', text: '', state: { camera } }], { courant: null, lecture: false }).etapes[0].camera;
  assert.deepEqual(camDe({ center: [5.4, 43.3], zoom: 12, pitch: 10, bearing: 5 }), { center: [5.4, 43.3], zoom: 12, pitch: 10, bearing: 5 });
  assert.deepEqual(camDe({ lng: 5.4, lat: 43.3, zoom: 12 }), { center: [5.4, 43.3], zoom: 12, pitch: 0, bearing: 0 });
  assert.equal(camDe({ center: ['x', 1] }), null);
  assert.equal(camDe(undefined), null);
});
