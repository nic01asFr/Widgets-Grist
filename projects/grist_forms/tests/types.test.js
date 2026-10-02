// projects/grist_forms/tests/types.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Types = require('../shared/types.js');

describe('Types.coerceForWrite', () => {
  it('Bool from checkbox', () => {
    assert.equal(Types.coerceForWrite({ type: 'Bool', widget: 'checkbox' }, true), true);
  });
  it('Bool coerces falsey strings', () => {
    assert.equal(Types.coerceForWrite({ type: 'Bool' }, 'false'), false);
    assert.equal(Types.coerceForWrite({ type: 'Bool' }, '0'), false);
    assert.equal(Types.coerceForWrite({ type: 'Bool' }, 'true'), true);
  });
  it('Date ISO to unix seconds', () => {
    const v = Types.coerceForWrite({ type: 'Date', widget: 'date' }, '2024-06-15');
    assert.equal(v, Math.floor(Date.UTC(2024, 5, 15) / 1000));
  });
  it('ChoiceList to L-prefix', () => {
    assert.deepEqual(
      Types.coerceForWrite({ type: 'ChoiceList', widget: 'multiselect' }, ['a', 'b']),
      ['L', 'a', 'b']
    );
  });
  it('Ref to number', () => {
    assert.equal(Types.coerceForWrite({ type: 'Ref', widget: 'select', refTable: 'T' }, '42'), 42);
  });
  it('RefList to L-prefix ids', () => {
    assert.deepEqual(
      Types.coerceForWrite({ type: 'RefList', widget: 'multiselect' }, ['1', '2']),
      ['L', 1, 2]
    );
  });
  it('Attachments to L-prefix ids', () => {
    assert.deepEqual(
      Types.coerceForWrite({ type: 'Attachments', widget: 'file' }, [10, 20]),
      ['L', 10, 20]
    );
    assert.equal(Types.defaultWidget('Attachments'), 'file');
  });
});

describe('Types — DateTime avec fuseau', () => {
  it('`DateTime:Europe/Paris` est un DateTime : widget et écriture', () => {
    // Grist type ainsi toute colonne DateTime ; non reconnu, le champ était du
    // texte libre et `AAAA-MM-JJTHH:mm` s'écrivait tel quel dans la colonne.
    assert.equal(Types.normalizeGristType('DateTime:Europe/Paris'), 'DateTime');
    assert.equal(Types.defaultWidget('DateTime:Europe/Paris'), 'datetime');
    const s = Types.coerceForWrite({ type: 'DateTime:Europe/Paris', widget: 'datetime' }, '2026-10-02T14:30');
    assert.equal(typeof s, 'number');
    assert.ok(s > 1.7e9 && s < 1.9e9);
  });
});
