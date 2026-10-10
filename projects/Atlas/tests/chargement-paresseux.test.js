import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unSeulChargement, chargerScript, chargerScriptsEnOrdre } from '../lib/chargement-paresseux.js';
import {
  FICHIERS_MOTEUR, NOM_META, moteurPresent, baseDuMoteur, adressesDuMoteur, creerChargeurMoteur,
} from '../lib/moteur-formulaire.js';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (rel) => readFileSync(resolve(RACINE, rel), 'utf8');
const attendre = () => new Promise((r) => setImmediate(r));

/**
 * Un `document` minimal : `createElement('script')` + `head.appendChild`.
 * Chaque script insere « se charge » au tour suivant, sauf ceux de `echecs`.
 */
function faussePage({ echecs = [], meta = null, base = 'http://page.test/Atlas/index_v7.html', onInsere = () => {} } = {}) {
  const inseres = [];
  const doc = {
    baseURI: base,
    createElement: (tag) => ({ tag }),
    head: {
      appendChild(s) {
        inseres.push(s.src);
        onInsere(s);
        setImmediate(() => (echecs.includes(s.src) ? s.onerror() : s.onload()));
      },
    },
    querySelector: (sel) => (sel === `meta[name="${NOM_META}"]` && meta !== null
      ? { getAttribute: (n) => (n === 'content' ? meta : null) } : null),
  };
  return { doc, inseres };
}

/* ---------- unSeulChargement ---------- */

test('unSeulChargement : dix appels simultanes ne lancent qu un chargement', async () => {
  let n = 0;
  const get = unSeulChargement(async () => { n++; await attendre(); return 'pret'; });
  const rs = await Promise.all(Array.from({ length: 10 }, () => get()));
  assert.equal(n, 1);
  assert.deepEqual(new Set(rs), new Set(['pret']));
});

test('unSeulChargement : le succes est mis en cache, un appel tardif ne relance rien', async () => {
  let n = 0;
  const get = unSeulChargement(async () => { n++; return n; });
  assert.equal(await get(), 1);
  assert.equal(await get(), 1);
  assert.equal(n, 1);
});

test('unSeulChargement : un echec n est pas memorise, l appel suivant retente', async () => {
  let n = 0;
  const get = unSeulChargement(async () => { n++; if (n === 1) throw new Error('coupure'); return 'ok'; });
  await assert.rejects(get(), /coupure/);
  assert.equal(await get(), 'ok');
  assert.equal(n, 2);
});

test('unSeulChargement : les appelants simultanes d un echec le recoivent tous', async () => {
  const get = unSeulChargement(async () => { await attendre(); throw new Error('non'); });
  const rs = await Promise.allSettled([get(), get(), get()]);
  assert.deepEqual(rs.map((r) => r.status), ['rejected', 'rejected', 'rejected']);
});

test('unSeulChargement : une exception synchrone du chargeur devient un rejet', async () => {
  const get = unSeulChargement(() => { throw new Error('sync'); });
  await assert.rejects(get(), /sync/);
});

/* ---------- scripts classiques ---------- */

test('chargerScript : se termine au load, insere dans head', async () => {
  const { doc, inseres } = faussePage();
  await chargerScript('http://x.test/a.js', { document: doc });
  assert.deepEqual(inseres, ['http://x.test/a.js']);
});

test('chargerScript : un fichier introuvable rejette en nommant l adresse', async () => {
  const { doc } = faussePage({ echecs: ['http://x.test/a.js'] });
  await assert.rejects(chargerScript('http://x.test/a.js', { document: doc }), /introuvable : http:\/\/x\.test\/a\.js/);
});

test('chargerScriptsEnOrdre : le suivant n est insere qu apres le load du precedent', async () => {
  const log = [];
  const { doc } = faussePage({
    onInsere: (s) => log.push('insere ' + s.src),
  });
  // On observe l ordre des chargements via le doc : chaque load se resout au tour suivant.
  const orig = doc.head.appendChild;
  doc.head.appendChild = (s) => { const ol = s.onload; s.onload = () => { log.push('load ' + s.src); ol(); }; orig.call(doc.head, s); };
  await chargerScriptsEnOrdre(['a', 'b', 'c'], { document: doc });
  assert.deepEqual(log, ['insere a', 'load a', 'insere b', 'load b', 'insere c', 'load c']);
});

test('chargerScriptsEnOrdre : au premier echec, les suivants ne sont pas demandes', async () => {
  const { doc, inseres } = faussePage({ echecs: ['b'] });
  await assert.rejects(chargerScriptsEnOrdre(['a', 'b', 'c'], { document: doc }), /introuvable : b/);
  assert.deepEqual(inseres, ['a', 'b']);
});

/* ---------- le moteur de formulaire ---------- */

test('FICHIERS_MOTEUR : les sept scripts, types d abord, le moteur en dernier', () => {
  assert.equal(FICHIERS_MOTEUR.length, 7);
  assert.equal(FICHIERS_MOTEUR[0], 'shared/types.js');
  assert.equal(FICHIERS_MOTEUR.at(-1), 'runtime/engine.js');
  // formdef-from-table lit FormTypes : il vient apres types.
  assert.ok(FICHIERS_MOTEUR.indexOf('shared/formdef-from-table.js') > FICHIERS_MOTEUR.indexOf('shared/types.js'));
});

test('FICHIERS_MOTEUR : la liste nommee de promote-atlas.js (VENDOR) est la meme', () => {
  const src = readFileSync(resolve(RACINE, '../../scripts/promote-atlas.js'), 'utf8');
  const bloc = src.match(/const VENDOR = \[([\s\S]*?)\];/)[1];
  const vendor = [...bloc.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(vendor, [...FICHIERS_MOTEUR]);
});

test('index_v7.html : plus aucun script de grist_forms charge d avance, mais la meta declare le dossier', () => {
  const html = lire('index_v7.html');
  assert.doesNotMatch(html, /<script[^>]+src="\.\.\/grist_forms\//);
  assert.match(html, /<meta name="atlas-moteur-formulaire" content="\.\.\/grist_forms\/"/);
});

test('app_v7.js n importe pas statiquement le moteur : seul le chargeur le demande', () => {
  const app = lire('app_v7.js');
  assert.match(app, /assurerMoteurFormulaire/);
  assert.doesNotMatch(app, /from '\.\/lib\/moteur-formulaire\.js[^']*'/, 'import statique : le module doit se charger par import()');
});

test('baseDuMoteur : lit la meta, null sans elle', () => {
  assert.equal(baseDuMoteur(faussePage({ meta: '../grist_forms/' }).doc), '../grist_forms/');
  assert.equal(baseDuMoteur(faussePage().doc), null);
});

test('adressesDuMoteur : resolues depuis la page, avec ou sans barre finale', () => {
  const a = adressesDuMoteur('../grist_forms/', 'http://h.test/Atlas/index_v7.html');
  assert.equal(a[0], 'http://h.test/grist_forms/shared/types.js');
  assert.equal(a.at(-1), 'http://h.test/grist_forms/runtime/engine.js');
  assert.deepEqual(adressesDuMoteur('./vendor/grist_forms', 'http://h.test/atlas/index.html'),
    FICHIERS_MOTEUR.map((f) => 'http://h.test/atlas/vendor/grist_forms/' + f));
});

test('moteurPresent : FormEngine ET FormTypes', () => {
  assert.equal(moteurPresent({}), false);
  assert.equal(moteurPresent({ FormEngine: {} }), false);
  assert.equal(moteurPresent({ FormEngine: {}, FormTypes: {} }), true);
});

/** Un chargeur de moteur dont les scripts posent FormEngine/FormTypes a la fin de la liste. */
function chargeurDeTest({ echecs = [], meta = '../grist_forms/', portee = {} } = {}) {
  const avertis = [];
  const { doc, inseres } = faussePage({ echecs, meta });
  const charger = async (urls, o) => {
    await chargerScriptsEnOrdre(urls, { document: o.document });
    portee.FormEngine = {}; portee.FormTypes = {};
  };
  const assurer = creerChargeurMoteur({ document: doc, portee, charger, avertir: (...a) => avertis.push(a.join(' ')) });
  return { assurer, inseres, avertis, portee };
}

test('assurerMoteur : charge les sept scripts dans l ordre, depuis le dossier declare', async () => {
  const { assurer, inseres } = chargeurDeTest();
  assert.equal(await assurer(), true);
  assert.deepEqual(inseres, FICHIERS_MOTEUR.map((f) => 'http://page.test/grist_forms/' + f));
});

test('assurerMoteur : deux appels simultanes, un seul chargement', async () => {
  const { assurer, inseres } = chargeurDeTest();
  const rs = await Promise.all([assurer(), assurer(), assurer()]);
  assert.deepEqual(rs, [true, true, true]);
  assert.equal(inseres.length, 7);
});

test('assurerMoteur : apres un succes, un nouvel appel ne recharge rien', async () => {
  const { assurer, inseres } = chargeurDeTest();
  await assurer();
  assert.equal(await assurer(), true);
  assert.equal(inseres.length, 7);
});

test('assurerMoteur : un moteur deja present (page ancienne) n insere rien', async () => {
  const { assurer, inseres } = chargeurDeTest({ portee: { FormEngine: {}, FormTypes: {} } });
  assert.equal(await assurer(), true);
  assert.deepEqual(inseres, []);
});

test('assurerMoteur : un fichier introuvable rend false, avertit, et ne lance pas', async () => {
  const { assurer, avertis } = chargeurDeTest({ echecs: ['http://page.test/grist_forms/runtime/engine.js'] });
  assert.equal(await assurer(), false);
  assert.match(avertis[0], /introuvable : http:\/\/page\.test\/grist_forms\/runtime\/engine\.js/);
});

test('assurerMoteur : apres un echec, l appel suivant retente (coupure passagere)', async () => {
  const echecs = ['http://page.test/grist_forms/shared/types.js'];
  const { assurer, inseres } = chargeurDeTest({ echecs });
  assert.equal(await assurer(), false);
  echecs.length = 0;                    // le reseau revient
  assert.equal(await assurer(), true);
  assert.ok(inseres.length > 7);        // 1 tentative (echec) + 7 scripts
});

test('assurerMoteur : sans meta dans la page, false et un avertissement clair', async () => {
  const { assurer, avertis, inseres } = chargeurDeTest({ meta: null });
  assert.equal(await assurer(), false);
  assert.match(avertis[0], /atlas-moteur-formulaire/);
  assert.deepEqual(inseres, []);
});

test('assurerMoteur : des scripts charges qui ne posent pas FormEngine sont signales', async () => {
  const avertis = [];
  const { doc } = faussePage({ meta: '../grist_forms/' });
  const assurer = creerChargeurMoteur({
    document: doc, portee: {}, charger: async () => {}, avertir: (...a) => avertis.push(a.join(' ')),
  });
  assert.equal(await assurer(), false);
  assert.match(avertis[0], /FormEngine reste absent/);
});
