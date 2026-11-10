const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../lib/qfield-publish-pack.js');

describe('buildUrlCustomViewOptions', () => {
  it('produit une customView URL avec widgetDef', () => {
    const optionsStr = P.buildUrlCustomViewOptions({
      url: 'https://example.test/qgis2grist/index_v2.html',
      widgetId: 'qgis2grist-v2',
      name: 'Carte QGIS',
    });
    const outer = JSON.parse(optionsStr);
    const inner = JSON.parse(outer.customView);
    assert.equal(inner.mode, 'url');
    assert.equal(inner.url, 'https://example.test/qgis2grist/index_v2.html');
    assert.equal(inner.widgetId, 'qgis2grist-v2');
    assert.equal(inner.access, 'full');
    assert.equal(inner.widgetDef.url, inner.url);
  });
});

describe('resolveWidgetBaseUrl', () => {
  it('retire le nom de fichier et garde le dossier', () => {
    const base = P.resolveWidgetBaseUrl('https://host/Widgets-Grist/projects/qgis2grist/index_v2.html');
    assert.equal(base, 'https://host/Widgets-Grist/projects/qgis2grist/');
  });
});

describe('resolveGristFormsBaseUrl', () => {
  it('en dev (projects/qgis2grist) : dossier frere grist_forms', () => {
    assert.equal(P.resolveGristFormsBaseUrl('https://host/Widgets-Grist/projects/qgis2grist/'), 'https://host/Widgets-Grist/projects/grist_forms/');
  });
  it('publie v1 (qgis2grist/) : dossier frere grist_forms', () => {
    assert.equal(P.resolveGristFormsBaseUrl('https://nic01asfr.github.io/Widgets-Grist/qgis2grist/'), 'https://nic01asfr.github.io/Widgets-Grist/grist_forms/');
  });
  it('publie v2 (qgis2grist/v2/) : meme dossier frere grist_forms, pas qgis2grist/grist_forms', () => {
    const base = P.resolveWidgetBaseUrl('https://nic01asfr.github.io/Widgets-Grist/qgis2grist/v2/index.html?access=full');
    assert.equal(P.resolveGristFormsBaseUrl(base), 'https://nic01asfr.github.io/Widgets-Grist/grist_forms/');
  });
});

describe('buildPackPlan', () => {
  it('planifie carte, terrain et formulaires métier', () => {
    const plan = P.buildPackPlan({
      primaryTableId: 'Apiary',
      forms: [
        { tableId: 'Apiary', formDef: { id: 'f1', title: 'Rucher' } },
        { tableId: 'Fields', formDef: { id: 'f2', title: 'Parcelles' } },
      ],
    }, { meta: { title: 'Bee Farming' } });

    assert.equal(plan.map.tableId, 'Apiary');
    assert.equal(plan.terrain.tableId, 'Apiary');
    assert.equal(plan.forms.length, 2);
    assert.match(plan.map.pageName, /Carte/);
    assert.match(plan.terrain.pageName, /Terrain/);
    assert.equal(plan.forms[0].pageName, 'Rucher');
  });
});

describe('extractCreateViewSectionRefs', () => {
  it('lit sectionRef et viewRef', () => {
    const refs = P.extractCreateViewSectionRefs({ retValues: [{ sectionRef: 42, viewRef: 99 }] });
    assert.equal(refs.sectionRef, 42);
    assert.equal(refs.viewRef, 99);
  });
});

describe('extractSectionRef', () => {
  it('lit sectionRef dans retValues', () => {
    assert.equal(P.extractSectionRef({ retValues: [{ sectionRef: 42 }] }), 42);
  });
});

describe('indexTableRefs', () => {
  it('mappe tableId vers id numérique', () => {
    const map = P.indexTableRefs({
      id: [1, 2],
      tableId: ['Apiary', 'Fields'],
    });
    assert.equal(map.Apiary, 1);
    assert.equal(map.Fields, 2);
  });
});

describe('normalizeUserActions', () => {
  it('convertit BulkAddRecord scalaires en tableaux', () => {
    const out = P.normalizeUserActions([[
      'BulkAddRecord', 'Formulaires', [null], { Version: 2, Nom: 'Test' },
    ]]);
    assert.deepEqual(out[0][3].Version, [2]);
    assert.deepEqual(out[0][3].Nom, ['Test']);
  });
});
