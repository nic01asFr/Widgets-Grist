/*
 * client-contrat.js — le pont de ce dépôt sous la forme du contrat de données,
 * et le contrat sous la forme du pont. Banc : un faux Grist en mémoire (la
 * sémantique de grist.docApi : fetchTable colonnaire, applyUserActions).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Contrat = require('../shared/client-contrat.js');
const Engine = require('../runtime/engine.js');
const { createRoot } = require('./helpers/fake-dom.js');

function flush() {
  return new Promise((resolve) => setTimeout(() => setImmediate(resolve), 2));
}

/** Le plus petit dénominateur commun de grist-bridge.js : fetchTable + applyUserActions. */
function fauxPont() {
  const tables = { T: { id: [1, 2], nom: ['a', 'b'], n: [10, 20] } };
  const appels = { fetchTable: [], applyUserActions: [] };
  let seq = 10;
  return {
    tables, appels,
    async fetchTable(table) {
      appels.fetchTable.push(Array.prototype.slice.call(arguments));
      if (!tables[table]) throw new Error('table inconnue');
      return JSON.parse(JSON.stringify(tables[table]));
    },
    async applyUserActions(actions) {
      appels.applyUserActions.push(actions);
      const retValues = [];
      for (const [nom, table, id, champs] of actions) {
        const t = tables[table];
        if (nom === 'BulkAddRecord') {
          const ids = [];
          const n = champs[Object.keys(champs)[0]].length;
          for (let k = 0; k < n; k++) {
            ids.push(++seq);
            Object.keys(t).forEach((c) => t[c].push(c === 'id' ? seq : (champs[c] ? champs[c][k] : null)));
          }
          retValues.push(ids);
        } else if (nom === 'UpdateRecord') {
          const i = t.id.indexOf(id);
          Object.keys(champs).forEach((c) => { t[c][i] = champs[c]; });
          retValues.push(id);
        } else if (nom === 'RemoveRecord') {
          const i = t.id.indexOf(id);
          Object.keys(t).forEach((c) => t[c].splice(i, 1));
          retValues.push(id);
        }
      }
      return { retValues };
    }
  };
}

describe('depuisPont — un pont grist-bridge sous la forme du contrat', () => {
  it('lireTable(table) : un seul argument, colonnaire, rien d’autre transmis', async () => {
    const pont = fauxPont();
    const c = Contrat.depuisPont(pont);
    const d = await c.lireTable('T', ['nom'], { filtre: 1 }, 5);
    assert.deepEqual(d, { id: [1, 2], nom: ['a', 'b'], n: [10, 20] }, 'la table entière : ni colonnes ni filtre');
    assert.deepEqual(pont.appels.fetchTable, [['T']], 'le pont ne reçoit que le nom de la table');
  });

  it('lireLigne rend l’objet ou null', async () => {
    const c = Contrat.depuisPont(fauxPont());
    assert.deepEqual(await c.lireLigne('T', 2), { id: 2, nom: 'b', n: 20 });
    assert.equal(await c.lireLigne('T', 99), null);
  });

  it('appliquer : { retValues }, UserActions transmises telles quelles', async () => {
    const pont = fauxPont();
    const c = Contrat.depuisPont(pont);
    const r = await c.appliquer([['BulkAddRecord', 'T', [null], { nom: ['c'], n: [30] }]], 'essai');
    assert.deepEqual(r, { retValues: [[11]] });
    assert.equal(pont.tables.T.nom[2], 'c');
    const r2 = await c.appliquer([['UpdateRecord', 'T', 1, { n: 11 }]]);
    assert.deepEqual(r2.retValues, [1]);
    assert.equal((await c.lireLigne('T', 1)).n, 11);
  });

  it('appliquer normalise ce que rend le pont : tableau, objet, rien', async () => {
    const mk = (res) => Contrat.depuisPont({ fetchTable() {}, applyUserActions: async () => res });
    assert.deepEqual(await mk([7]).appliquer([]), { retValues: [7] });
    assert.deepEqual(await mk({ retValues: [8], autre: 1 }).appliquer([]), { retValues: [8], autre: 1 });
    assert.deepEqual(await mk(undefined).appliquer([]), { retValues: [] });
    assert.deepEqual(await mk({ enfile: true }).appliquer([]), { enfile: true });
  });

  it('un échec d’écriture se propage : ce socle n’a pas de file qui l’avalerait', async () => {
    const c = Contrat.depuisPont({ fetchTable() {}, applyUserActions: async () => { throw new Error('refusé'); } });
    await assert.rejects(c.appliquer([['AddRecord', 'T', null, {}]]), /refusé/);
  });

  it('la surface du contrat est présente, la file est vide', async () => {
    const c = Contrat.depuisPont(fauxPont());
    ['init', 'lireTable', 'lireLigne', 'listerTables', 'appliquer', 'synchroniser', 'tailleFile',
      'surFile', 'fileEnEchec', 'identite', 'urlImage', 'surEnregistrement'].forEach((m) => {
      assert.equal(typeof c[m], 'function', m);
    });
    assert.equal(await c.tailleFile(), 0);
    assert.deepEqual(await c.synchroniser(), { envoyes: 0, restants: 0 });
    assert.deepEqual(await c.fileEnEchec(), []);
    let vu = null;
    c.surFile((n) => { vu = n; });
    assert.equal(vu, 0);
    assert.equal(c.urlImage('x'), null);
    assert.equal(c.surEnregistrement(() => {}), undefined, 'sans effet hors widget');
  });

  it('listerTables et identite passent par ce que l’hôte fournit', async () => {
    const c = Contrat.depuisPont(fauxPont(), {
      docApi: { listTables: async () => ['T', 'U'] },
      identite: () => ({ email: 'a@b.fr', role: 'editeur' })
    });
    assert.deepEqual(await c.listerTables(), ['T', 'U']);
    assert.deepEqual(await c.identite(), { email: 'a@b.fr', role: 'editeur' });
    await assert.rejects(Contrat.depuisPont(fauxPont()).listerTables(), /listTables/);
    assert.deepEqual(await Contrat.depuisPont(fauxPont()).identite(), { email: '', role: 'grist' });
  });

  it('un pont invalide est refusé avec un message qui dit ce qu’il faut', () => {
    assert.throws(() => Contrat.depuisPont({}), /fetchTable.*applyUserActions/);
    assert.throws(() => Contrat.depuisPont(null), TypeError);
  });
});

describe('versPont — un client du contrat sous la forme d’un pont', () => {
  it('offre la surface de GristBridge', () => {
    const p = Contrat.versPont(Contrat.depuisPont(fauxPont()));
    ['fetchTable', 'loadTable', 'applyUserActions', 'applyAndFetch', 'addRow', 'updateRow', 'deleteRow']
      .forEach((m) => assert.equal(typeof p[m], 'function', m));
    assert.equal(typeof p.util.toRows, 'function');
  });

  it('loadTable rend des objets ; addRow / updateRow / deleteRow rendent la table à jour', async () => {
    const pont = fauxPont();
    const p = Contrat.versPont(Contrat.depuisPont(pont));
    assert.deepEqual(await p.loadTable('T'), [{ id: 1, nom: 'a', n: 10 }, { id: 2, nom: 'b', n: 20 }]);

    const apresAjout = await p.addRow('T', { nom: 'c', n: 30 });
    assert.equal(apresAjout.length, 3);
    assert.deepEqual(apresAjout[2], { id: 11, nom: 'c', n: 30 });

    const apresMaj = await p.updateRow('T', 1, { n: 99 });
    assert.equal(apresMaj[0].n, 99);

    const apresSuppr = await p.deleteRow('T', 2);
    assert.deepEqual(apresSuppr.map((r) => r.id), [1, 11]);
  });

  it('addRow garde une cellule-liste comme UNE cellule', async () => {
    const pont = fauxPont();
    pont.tables.T.liste = [null, null];
    const p = Contrat.versPont(Contrat.depuisPont(pont));
    await p.addRow('T', { nom: 'x', liste: ['L', 1, 2] });
    assert.deepEqual(pont.appels.applyUserActions[0], [['BulkAddRecord', 'T', [null], { nom: ['x'], liste: [['L', 1, 2]] }]]);
  });

  it('une écriture mise en file par le client est rendue telle quelle', async () => {
    const client = { lireTable: async () => ({ id: [] }), appliquer: async () => ({ enfile: true }) };
    const p = Contrat.versPont(client);
    assert.deepEqual(await p.applyUserActions([['AddRecord', 'T', null, {}]]), { enfile: true });
  });

  it('un client invalide est refusé', () => {
    assert.throws(() => Contrat.versPont({ lireTable() {} }), /appliquer/);
  });
});

describe('Aller-retour et moteur', () => {
  it('versPont(depuisPont(pont)) se comporte comme le pont d’origine', async () => {
    const pont = fauxPont();
    const p = Contrat.versPont(Contrat.depuisPont(pont));
    assert.deepEqual(await p.fetchTable('T'), await pont.fetchTable('T'));
  });

  it('le moteur monte un formulaire sur un pont de ce dépôt, via le contrat', async () => {
    const pont = fauxPont();
    const client = Contrat.depuisPont(pont);
    const def = {
      id: 'f', title: 'F', tableId: 'T', composeMode: 'bind', choices: {}, successMessage: 'Fait',
      sections: [{ id: 's', label: 'S', gate: null, fields: [
        { colId: 'nom', label: 'Nom', type: 'Text', widget: 'text', required: true },
        { colId: 'n', label: 'N', type: 'Int', widget: 'number', required: false }
      ] }]
    };
    const root = createRoot();
    Engine.monter(root, def, { client, contexte: {} });
    await flush();
    root.querySelector('[name="nom"]').value = 'z';
    root.querySelector('[name="n"]').value = '5';
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush(); await flush();
    assert.ok(root.innerHTML.includes('Fait'));
    assert.equal(pont.tables.T.nom[2], 'z');
    assert.equal(pont.tables.T.n[2], 5);
  });
});
