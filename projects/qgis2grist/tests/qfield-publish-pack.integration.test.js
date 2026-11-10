const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../lib/qfield-publish-pack.js');

describe('publishQfieldPack (mock Grist)', () => {
  it('crée carte, terrain et formulaires', async () => {
    const actions = [];
    const grist = {
      docApi: {
        fetchTable: async (name) => {
          if (name === '_grist_Tables') {
            return { id: [10, 11], tableId: ['Apiary', 'Fields'] };
          }
          if (name === 'Formulaires') {
            return {
              id: [100],
              FormId: ['apiary-saisie'],
              PublishedSectionRef: [null],
              Version: [1],
            };
          }
          throw new Error('unexpected table ' + name);
        },
        listTables: async () => ['Apiary', 'Fields', 'Formulaires'],
        applyUserActions: async (batch) => {
          actions.push(...batch);
          const op = batch[0][0];
          if (op === 'CreateViewSection') {
            return { retValues: [{ sectionRef: 500 + actions.length, viewRef: 600 + actions.length }] };
          }
          return {};
        },
      },
    };

    const terrainPack = {
      primaryTableId: 'Apiary',
      forms: [{
        tableId: 'Apiary',
        displayName: 'Apiary',
        formDef: { id: 'apiary-saisie', title: 'Rucher', tableId: 'Apiary', sections: [], choices: {} },
      }],
    };

    const result = await P.publishQfieldPack(grist, {
        terrainPack,
        config: { meta: { title: 'Bees' } },
        widgetBaseUrl: 'http://localhost:8765/qgis2grist/',
        fetchScript: async (rel) => {
          if (rel.endsWith('.css')) return '.fr-container{}';
          return '/* ' + rel + ' */';
        },
      });

      assert.ok(result.map);
      assert.ok(result.terrain);
      assert.equal(result.forms['apiary-saisie'], result.published.formSectionRefs['apiary-saisie']);
      assert.ok(result.published.mapSectionRef);

      const creates = actions.filter(a => a[0] === 'CreateViewSection');
      assert.equal(creates.length, 3);
      assert.ok(creates.every(a => a[5] == null));

      const viewRenames = actions.filter(a => a[0] === 'UpdateRecord' && a[1] === '_grist_Views');
      assert.equal(viewRenames.length, 3);
      assert.ok(viewRenames.some(a => String(a[3].name).includes('Carte')));
      assert.ok(viewRenames.some(a => String(a[3].name).includes('Terrain')));

      const urlUpdates = actions.filter(a => a[0] === 'UpdateRecord' && a[1] === '_grist_Views_section');
      assert.ok(urlUpdates.length >= 3);
      const mapOptions = JSON.parse(urlUpdates[0][3].options);
      const inner = JSON.parse(mapOptions.customView);
      assert.match(inner.url, /index_v2\.html$/);

      const formUpdate = actions.find(a => a[0] === 'UpdateRecord' && a[1] === 'Formulaires');
      assert.ok(formUpdate);
      assert.equal(formUpdate[3].Statut, 'publie');
  });

  it('crée une ligne Formulaires si absente au publish', async () => {
    const actions = [];
    const grist = {
      docApi: {
        fetchTable: async (name) => {
          if (name === '_grist_Tables') {
            return { id: [10], tableId: ['Apiary'] };
          }
          if (name === 'Formulaires') {
            return { id: [], FormId: [], PublishedSectionRef: [], Version: [] };
          }
          throw new Error('unexpected table ' + name);
        },
        listTables: async () => ['Apiary', 'Formulaires'],
        applyUserActions: async (batch) => {
          actions.push(...batch);
          const op = batch[0][0];
          if (op === 'CreateViewSection') {
            return { retValues: [{ sectionRef: 700 + actions.length, viewRef: 800 + actions.length }] };
          }
          return {};
        },
      },
    };

    const terrainPack = {
      primaryTableId: 'Apiary',
      forms: [{
        tableId: 'Apiary',
        displayName: 'Apiary',
        formDef: {
          id: 'apiary-terrain',
          title: 'Rucher — saisie',
          tableId: 'Apiary',
          sections: [{ id: 'main', fields: [] }],
          choices: {},
        },
      }],
    };

    await P.publishQfieldPack(grist, {
      terrainPack,
      config: { meta: { title: 'Bees' } },
      widgetBaseUrl: 'http://localhost:8765/qgis2grist/',
      fetchScript: async (rel) => (rel.endsWith('.css') ? '.fr-container{}' : '/* */'),
    });

    const bulkAdd = actions.find(a => a[0] === 'BulkAddRecord' && a[1] === 'Formulaires');
    assert.ok(bulkAdd, 'BulkAddRecord Formulaires attendu');
    const row = bulkAdd[3];
    const formId = Array.isArray(row.FormId) ? row.FormId[0] : row.FormId;
    assert.equal(formId, 'apiary-terrain');
    const statut = Array.isArray(row.Statut) ? row.Statut[0] : row.Statut;
    assert.equal(statut, 'publie');
    const def = Array.isArray(row.Def) ? row.Def[0] : row.Def;
    assert.ok(def.includes('apiary-terrain'));
  });

  it('incrémente Version numériquement même si Grist renvoie des strings', async () => {
    const actions = [];
    const grist = {
      docApi: {
        fetchTable: async (name) => {
          if (name === '_grist_Tables') {
            return { id: ['10'], tableId: ['Apiary'] };
          }
          if (name === 'Formulaires') {
            return {
              id: ['100'],
              FormId: ['apiary-saisie'],
              PublishedSectionRef: ['500'],
              Version: ['1'],
            };
          }
          throw new Error('unexpected table ' + name);
        },
        listTables: async () => ['Apiary', 'Formulaires'],
        applyUserActions: async (batch) => {
          actions.push(...batch);
          if (batch[0][0] === 'CreateViewSection') {
            return { retValues: [{ sectionRef: 501, viewRef: 601 }] };
          }
          return {};
        },
      },
    };

    await P.publishQfieldPack(grist, {
      terrainPack: {
        primaryTableId: 'Apiary',
        forms: [{
          tableId: 'Apiary',
          displayName: 'Apiary',
          formDef: { id: 'apiary-saisie', title: 'Rucher', tableId: 'Apiary', sections: [], choices: {} },
        }],
      },
      config: { meta: { title: 'Bees' }, published: { mapSectionRef: '400', terrainSectionRef: '401' } },
      widgetBaseUrl: 'http://localhost:8765/qgis2grist/',
      fetchScript: async (rel) => (rel.endsWith('.css') ? '.fr-container{}' : '/* */'),
    });

    const formUpdate = actions.find(a => a[0] === 'UpdateRecord' && a[1] === 'Formulaires');
    assert.ok(formUpdate);
    assert.equal(formUpdate[3].Version, 2);
    assert.equal(typeof formUpdate[3].Version, 'number');
    assert.equal(formUpdate[2], 100);
    assert.equal(typeof formUpdate[2], 'number');
  });

  it('ignore published refs invalides (doc copié) — recrée les pages', async () => {
    const actions = [];
    const grist = {
      docApi: {
        fetchTable: async (name) => {
          if (name === '_grist_Tables') {
            return { id: [10], tableId: ['Apiary'] };
          }
          if (name === '_grist_Views_section') {
            return { id: [1, 2] };
          }
          if (name === '_grist_Views') {
            return { id: [1, 2] };
          }
          if (name === 'Formulaires') {
            return {
              id: [100],
              FormId: ['apiary-saisie'],
              PublishedSectionRef: [9999],
              Version: [1],
            };
          }
          throw new Error('unexpected table ' + name);
        },
        listTables: async () => ['Apiary', 'Formulaires'],
        applyUserActions: async (batch) => {
          actions.push(...batch);
          const op = batch[0][0];
          if (op === 'CreateViewSection') {
            return { retValues: [{ sectionRef: 500 + actions.length, viewRef: 600 + actions.length }] };
          }
          return {};
        },
      },
    };

    await P.publishQfieldPack(grist, {
      terrainPack: {
        primaryTableId: 'Apiary',
        forms: [{
          tableId: 'Apiary',
          displayName: 'Apiary',
          formDef: { id: 'apiary-saisie', title: 'Rucher', tableId: 'Apiary', sections: [], choices: {} },
        }],
      },
      config: {
        meta: { title: 'Bees' },
        published: { mapSectionRef: 9999, terrainSectionRef: 8888, formSectionRefs: { 'apiary-saisie': 7777 } },
      },
      widgetBaseUrl: 'http://localhost:8765/qgis2grist/',
      fetchScript: async (rel) => (rel.endsWith('.css') ? '.fr-container{}' : '/* */'),
    });

    const creates = actions.filter(a => a[0] === 'CreateViewSection');
    assert.equal(creates.length, 3, 'doit recréer carte + terrain + formulaire');
    const staleUpdates = actions.filter(a =>
      a[0] === 'UpdateRecord' && a[1] === '_grist_Views_section' && [9999, 8888, 7777].includes(a[2])
    );
    assert.equal(staleUpdates.length, 0, 'ne doit pas UpdateRecord sur refs fantômes');
  });
});
