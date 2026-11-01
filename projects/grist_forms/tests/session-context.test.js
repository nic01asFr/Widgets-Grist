const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../runtime/engine.js');
const SessionContext = require('../shared/session-context.js');

describe('SessionContext', () => {
  it('groupsForEmail', () => {
    const rows = [
      { Email: 'a@x.fr', Groupe: 'terrain' },
      { Email: 'A@X.FR', Groupe: 'direction' },
      { Email: 'b@x.fr', Groupe: 'terrain' }
    ];
    assert.deepEqual(
      SessionContext.groupsForEmail(rows, 'Email', 'Groupe', 'a@x.fr').sort(),
      ['direction', 'terrain']
    );
  });

  it('probe forceContext', async () => {
    const ctx = await SessionContext.probe({}, {}, {
      forceContext: { inGristWidget: true, userEmail: 'u@t.fr', isLoggedIn: true, groups: ['g'] }
    });
    assert.equal(ctx.userEmail, 'u@t.fr');
    assert.equal(ctx.inGristWidget, true);
  });
});

describe('evaluateCondition context / audience', () => {
  it('context.inGristWidget', () => {
    const c = { source: 'context', path: 'inGristWidget', operator: '==', value: true };
    assert.equal(Engine.evaluateCondition(c, {}, { inGristWidget: true }), true);
    assert.equal(Engine.evaluateCondition(c, {}, { inGristWidget: false }), false);
  });

  it('raccourci field context.*', () => {
    const c = { field: 'context.isLoggedIn', operator: '==', value: true };
    assert.equal(Engine.evaluateCondition(c, {}, { isLoggedIn: true }), true);
  });

  it('audience email in list', () => {
    const c = { source: 'audience', path: 'email', operator: 'in', value: ['a@x.fr', 'b@x.fr'] };
    assert.equal(Engine.evaluateCondition(c, {}, { userEmail: 'A@X.FR' }), true);
    assert.equal(Engine.evaluateCondition(c, {}, { userEmail: 'z@x.fr' }), false);
  });

  it('audience group in', () => {
    const c = {
      source: 'audience',
      path: 'group',
      operator: 'in',
      value: ['terrain'],
      bind: { groups: ['terrain'] }
    };
    assert.equal(Engine.evaluateCondition(c, {}, { groups: ['direction', 'terrain'] }), true);
    assert.equal(Engine.evaluateCondition(c, {}, { groups: ['direction'] }), false);
  });

  it('legacy field inchangé', () => {
    assert.equal(
      Engine.evaluateCondition({ field: 'A', operator: '==', value: 1 }, { A: 1 }, {}),
      true
    );
  });
});

describe('SessionContext — la sonde d\'audience', () => {
  const GristBridge = require('../shared/grist-bridge.js');

  /** Un document Grist minimal derrière `window.grist.docApi`, avec deux personnes déjà dans la table. */
  const faireDocument = () => {
    const table = { id: [1, 2], Email: ['alice@x.fr', 'bob@x.fr'] };
    const supprimees = [];
    let seq = 2;
    global.window = {
      get self() { return {}; }, get top() { return {}; }, // différents : on est dans un widget
      grist: { docApi: {
        fetchTable: async () => JSON.parse(JSON.stringify(table)),
        applyUserActions: async (actions) => {
          for (const a of actions) {
            if (a[0] === 'BulkAddRecord') { seq++; table.id.push(seq); table.Email.push('moi@x.fr'); }
            if (a[0] === 'RemoveRecord') { supprimees.push(a[2]); const i = table.id.indexOf(a[2]); if (i >= 0) { table.id.splice(i, 1); table.Email.splice(i, 1); } }
          }
          return { retValues: [] };
        }
      } }
    };
    return { table, supprimees };
  };

  it('ne prend pas l\'adresse d\'une autre personne et ne supprime que la ligne qu\'elle a créée', async () => {
    const { table, supprimees } = faireDocument();
    // Le pont rend la table entière après un ajout : la première ligne n'est pas la nôtre.
    const bridge = {
      addRow: GristBridge.addRow, loadTable: GristBridge.loadTable, deleteRow: GristBridge.deleteRow
    };
    const def = { audience: { mode: 'bind', tableId: 'Equipe', emailCol: 'Email', groupCol: '', probe: true } };
    try {
      const ctx = await SessionContext.probe(bridge, def, {});
      assert.notEqual(ctx.userEmail, 'alice@x.fr', 'jamais l\'adresse de la première personne de la table');
      assert.ok(!supprimees.includes(1) && !supprimees.includes(2), 'les lignes des autres personnes sont intactes');
      assert.deepEqual(table.id.slice(0, 2), [1, 2]);
    } finally { delete global.window; }
  });
});
