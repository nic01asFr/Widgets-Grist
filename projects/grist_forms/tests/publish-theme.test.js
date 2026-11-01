'use strict';

/*
 * Le formulaire publié lit le thème du document, puis se monte.
 *
 * Le bundle figé est exécuté dans un bac à sable (un `window`, un `grist` et un moteur factices) : on regarde l'ORDRE des gestes
 * (le thème est posé avant le montage), ce qui ne se passe pas (aucune écriture, aucun retard au-delà d'une seconde et demie),
 * et que les formulaires sans thème s'ouvrent exactement comme avant.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const Publish = require('../shared/publish.js');

const source = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const THEME_JS = source('shared/theme.js');
const THEMEDEF_JS = source('shared/themedef.js');

const defBase = { id: 'f', title: 'F', tableId: 'T', manifest_version: '1.0.0', composeMode: 'ensureSchema', sections: [{ id: 's', label: 'S', fields: [] }] };
let def = defBase;

const themedef = JSON.stringify({ version: 'themedef-1.0', nom: 'Vert', graines: { principal: '#0b6e4f', fond: '#fdfaf3' }, modes: { sombre: 'aucun' } });

/** Exécute le bootstrap d'un formulaire publié ; rend ce qui s'est passé. */
function executer(bundles, grist, apparence) {
  def = apparence ? Object.assign({}, defBase, { apparence }) : defBase;
  const html = Publish.buildRuntimeDocument(def, Object.assign({ engineJs: '' }, bundles));
  const js = Publish.splitHtmlJs(html).js;
  const journal = [];
  const posees = {};
  const minuteries = [];
  const bac = {
    console, Promise, JSON, Object, Array, String, Math, Date, Error,
    setTimeout: (fn, ms) => { minuteries.push({ fn, ms }); return minuteries.length; },
    clearTimeout: () => {},
    grist,
    document: {
      readyState: 'complete',
      addEventListener: () => {},
      getElementById: (id) => (id === 'app' ? { id: 'app', textContent: '' } : null),
      documentElement: { style: { setProperty: (k, v) => { posees[k] = v; journal.push('pose'); }, removeProperty: () => {} } }
    },
    FormEngine: {
      mount: () => { journal.push('mount'); },
      collectSubmitData: () => ({}),
      valuesFromRecord: () => ({})
    },
    parent: { postMessage: () => {} }
  };
  bac.window = bac;
  bac.self = bac;
  vm.createContext(bac);
  // le moteur factice est posé APRES le bundle (qui le définit à vide) : on l'impose par un script de plus
  vm.runInContext(js.replace('window.FormEngine', 'window.FormEngine'), bac);
  return { journal, posees, minuteries, bac };
}

const bundleTheme = { themeJs: THEME_JS, themeDefJs: THEMEDEF_JS };

const gristAvec = (tables, colonnes, appels) => ({
  ready: () => {},
  docApi: {
    listTables: () => { appels.push('listTables'); return Promise.resolve(tables); },
    fetchTable: (t) => { appels.push('fetchTable:' + t); return Promise.resolve(colonnes); },
    applyUserActions: () => { appels.push('ECRITURE'); throw new Error('écriture interdite'); },
    getAccessToken: () => Promise.resolve({})
  }
});

const tableTheme = (actif) => ({ id: [1], cle: ['maison'], themedef: [themedef], actif: [actif] });

describe('Formulaire publié : le thème du document', () => {
  it('le bundle embarque le lecteur, avant le moteur', () => {
    const html = Publish.buildRuntimeDocument(def, { themeJs: '/*THEME*/', themeDefJs: '/*THEMEDEF*/', engineJs: '/*ENGINE*/' });
    assert.ok(html.indexOf('/*THEME*/') > -1 && html.indexOf('/*THEMEDEF*/') > -1);
    assert.ok(html.indexOf('/*THEMEDEF*/') < html.indexOf('/*ENGINE*/'), 'lu avant le moteur');
    assert.match(html, /function habiller\(suite\)/);
  });

  it('un thème actif est posé AVANT le montage, et rien n\'est écrit', async () => {
    const appels = [];
    const r = executer(bundleTheme, gristAvec(['T', 'Theme_document'], tableTheme(true), appels));
    await new Promise((resolu) => setTimeout(resolu, 30));
    assert.ok(r.journal.indexOf('pose') > -1, 'des variables sont posées');
    assert.ok(r.journal.indexOf('pose') < r.journal.indexOf('mount'), 'avant le montage');
    assert.ok(r.posees['--kit-action']);
    assert.deepEqual(appels, ['listTables', 'fetchTable:Theme_document']);
  });

  it('sans table de thème, le formulaire se monte comme avant : rien n\'est posé, rien n\'est lu en plus', async () => {
    const appels = [];
    const r = executer(bundleTheme, gristAvec(['T'], {}, appels));
    await new Promise((resolu) => setTimeout(resolu, 30));
    assert.deepEqual(r.journal, ['mount']);
    assert.deepEqual(appels, ['listTables']);
  });

  it('un thème qui n\'est pas actif ne pose rien', async () => {
    const r = executer(bundleTheme, gristAvec(['Theme_document'], tableTheme(false), []));
    await new Promise((resolu) => setTimeout(resolu, 30));
    assert.deepEqual(r.journal, ['mount']);
  });

  it('une lecture qui tarde ne retient personne : le formulaire s\'ouvre au bout de 1,5 s', async () => {
    const grist = { ready: () => {}, docApi: { listTables: () => new Promise(() => {}), fetchTable: () => new Promise(() => {}), getAccessToken: () => Promise.resolve({}) } };
    const r = executer(bundleTheme, grist);
    assert.deepEqual(r.journal, [], 'pas encore monté');
    const garde = r.minuteries.filter((m) => m.ms === 1500)[0];
    assert.ok(garde, 'une garde de 1,5 s');
    garde.fn();
    assert.deepEqual(r.journal, ['mount']);
  });

  it('une lecture en panne ne casse pas le formulaire', async () => {
    const grist = { ready: () => {}, docApi: { listTables: () => Promise.reject(new Error('hors ligne')), fetchTable: () => Promise.resolve({}), getAccessToken: () => Promise.resolve({}) } };
    const r = executer(bundleTheme, grist);
    await new Promise((resolu) => setTimeout(resolu, 30));
    assert.deepEqual(r.journal, ['mount']);
  });

  it('un formulaire publié sans le lecteur (bundle ancien) se monte tout de suite', () => {
    const r = executer({}, gristAvec(['Theme_document'], tableTheme(true), []));
    assert.deepEqual(r.journal, ['mount']);
  });

  it('il ne se monte qu\'une fois, même si la garde et la lecture arrivent toutes deux', async () => {
    const r = executer(bundleTheme, gristAvec(['Theme_document'], tableTheme(true), []));
    await new Promise((resolu) => setTimeout(resolu, 30));
    r.minuteries.forEach((m) => m.fn());
    assert.equal(r.journal.filter((j) => j === 'mount').length, 1);
  });
});

describe('Formulaire publié : l\'apparence qu\'il demande', () => {
  it('un thème donné au formulaire est posé avant le montage, même sans document', async () => {
    const r = executer(bundleTheme, null, { mode: 'formulaire', themedef: JSON.parse(themedef) });
    await new Promise((resolu) => setTimeout(resolu, 30));
    assert.ok(r.journal.indexOf('pose') > -1 && r.journal.indexOf('pose') < r.journal.indexOf('mount'));
    assert.ok(r.posees['--kit-action']);
  });

  it('il prime sur le thème du document, qui n\'est même pas lu', async () => {
    const appels = [];
    const r = executer(bundleTheme, gristAvec(['Theme_document'], tableTheme(true), appels), { mode: 'formulaire', themedef: JSON.parse(themedef) });
    await new Promise((resolu) => setTimeout(resolu, 30));
    assert.ok(r.posees['--kit-action']);
    assert.deepEqual(appels, []);
  });

  it('« aucune » : rien n\'est posé, quoi que dise le document', async () => {
    const appels = [];
    const r = executer(bundleTheme, gristAvec(['Theme_document'], tableTheme(true), appels), { mode: 'aucune' });
    await new Promise((resolu) => setTimeout(resolu, 30));
    assert.deepEqual(r.journal, ['mount']);
    assert.deepEqual(appels, []);
  });

  it('un thème de formulaire illisible : le formulaire suit le document', async () => {
    const r = executer(bundleTheme, gristAvec(['Theme_document'], tableTheme(true), []), { mode: 'formulaire', themedef: { version: 'themedef-9' } });
    await new Promise((resolu) => setTimeout(resolu, 30));
    assert.ok(r.posees['--kit-action'], 'le thème du document s\'applique');
  });
});

describe('Page autonome : le thème donné avec le formulaire', () => {
  const Externe = require('../shared/externe.js');
  const adresse = 'https://g.exemple.fr/o/org/forms/CLE123/7';

  it('embarque le lecteur avant le moteur et applique le thème avant de monter', () => {
    const html = Externe.buildExternalDocument(
      Object.assign({}, defBase, { apparence: { mode: 'formulaire', themedef: JSON.parse(themedef) } }),
      { themeJs: '/*THEME*/', themeDefJs: '/*THEMEDEF*/', engineJs: '/*ENGINE*/', cssText: '' }, { adresse });
    assert.ok(html.indexOf('/*THEMEDEF*/') > -1 && html.indexOf('/*THEMEDEF*/') < html.indexOf('/*ENGINE*/'));
    assert.match(html, /T\.charger\(null, \{ def: DEF \}\)/);
    assert.match(html, /"apparence":\{"mode":"formulaire"/);
  });

  it('sans le lecteur (bundle ancien), la page se monte tout de suite, comme avant', () => {
    const html = Externe.buildExternalDocument(defBase, { engineJs: '/*ENGINE*/', cssText: '' }, { adresse });
    assert.match(html, /if \(!T\) \{ monter\(\); return; \}/);
  });
});

describe('Formulaire publié : le thème de Grist en repli', () => {
  it('l\'amorce passe par habiller, qui pose le thème et suit celui de Grist à chaud', () => {
    const Publish = require('../shared/publish.js');
    const source = require('fs').readFileSync(require.resolve('../shared/publish.js'), 'utf8');
    assert.ok(Publish);
    assert.match(source, /T\.habiller\(document\.documentElement, window\.grist && window\.grist\.docApi, \{ def: window\.__FORM_DEF__ \}\)/);
    assert.ok(!/T\.charger\(window\.grist/.test(source), 'l\'ancien appel direct est remplacé');
  });

  it('mode grist sans thème annoncé et sans document : rien n\'est posé, le formulaire se monte', async () => {
    const r = executer(bundleTheme, gristAvec([], tableTheme(false), []), { mode: 'grist' });
    await new Promise((resolu) => setTimeout(resolu, 30));
    assert.deepEqual(r.journal, ['mount']);
  });

  it('mode grist avec un thème actif dans le document : le thème du document est posé avant le montage', async () => {
    const r = executer(bundleTheme, gristAvec(['Theme_document'], tableTheme(true), []), { mode: 'grist' });
    await new Promise((resolu) => setTimeout(resolu, 30));
    assert.ok(r.posees['--kit-action']);
    assert.ok(r.journal.indexOf('pose') < r.journal.indexOf('mount'));
  });
});
