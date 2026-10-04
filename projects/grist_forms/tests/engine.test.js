const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../runtime/engine.js');

describe('Engine conditions', () => {
  it('gate Bool hides section when false', () => {
    const sec = { id: 's2', gate: 'Concerne', fields: [] };
    assert.equal(Engine.isSectionVisible(sec, { Concerne: false }), false);
    assert.equal(Engine.isSectionVisible(sec, { Concerne: true }), true);
  });
  it('field condition ==', () => {
    const f = { colId: 'X', condition: { field: 'Type', operator: '==', value: 'A' } };
    assert.equal(Engine.isFieldVisible(f, { Type: 'A' }), true);
    assert.equal(Engine.isFieldVisible(f, { Type: 'B' }), false);
  });
});

describe('Engine.collectSubmitData', () => {
  it('omits hidden fields', () => {
    const def = {
      sections: [{
        id: 's1', gate: null, fields: [
          { colId: 'A', type: 'Text', widget: 'text', required: false },
          { colId: 'B', type: 'Text', widget: 'text', condition: { field: 'A', operator: '==', value: 'oui' } }
        ]
      }]
    };
    const data = Engine.collectSubmitData(def, { A: 'non', B: 'secret' });
    assert.deepEqual(data, { A: 'non' });
  });
});

describe('Engine.filterCascadeOptions', () => {
  it('filters by record id not array index', () => {
    const choices = [
      { value: 10, label: 'Nord' },
      { value: 20, label: 'Sud' }
    ];
    const refRecords = {
      id: [10, 20],
      name: ['Nord', 'Sud'],
      pays: [1, 2]
    };
    const out = Engine.filterCascadeOptions(choices, refRecords, 'pays', 2);
    assert.deepEqual(out, [{ value: 20, label: 'Sud' }]);
  });

  it('accepte parentValue string (select HTML) vs id number', () => {
    const choices = [
      { value: 10, label: 'Nord' },
      { value: 20, label: 'Sud' }
    ];
    const refRecords = { id: [10, 20], name: ['Nord', 'Sud'], pays: [1, 2] };
    const out = Engine.filterCascadeOptions(choices, refRecords, 'pays', '2');
    assert.deepEqual(out, [{ value: 20, label: 'Sud' }]);
  });

  it('liste vide si parent non choisi', () => {
    const choices = [{ value: 10, label: 'Nord' }];
    const refRecords = { id: [10], pays: [1] };
    assert.deepEqual(Engine.filterCascadeOptions(choices, refRecords, 'pays', null), []);
    assert.deepEqual(Engine.filterCascadeOptions(choices, refRecords, 'pays', ''), []);
  });
});

describe('Engine.resolveParentFilterValue', () => {
  const formDef = {
    sections: [{
      id: 's1', fields: [
        { colId: 'Groupe', type: 'Choice', widget: 'select' },
        {
          colId: 'Contact', type: 'Ref', widget: 'select',
          options: { refTable: 'Contacts', visibleCol: 'Nom' }
        },
        {
          colId: 'Autre', type: 'Ref', widget: 'select',
          options: { refTable: 'Contacts', visibleCol: 'Email' },
          dynamicFilter: {
            parentField: 'Contact',
            filterColumn: 'Groupe',
            parentResolve: 'refRow',
            parentValueColumn: 'Groupe'
          }
        }
      ]
    }]
  };
  const refRecords = {
    Contacts: {
      id: [1, 2, 3],
      Nom: ['Alice', 'Bob', 'Carol'],
      Groupe: ['Agents', 'Public', 'Agents']
    }
  };

  it('cas A : parentResolve value (défaut) retourne la valeur brute', () => {
    const field = {
      dynamicFilter: { parentField: 'Groupe', filterColumn: 'Groupe' }
    };
    assert.equal(
      Engine.resolveParentFilterValue(field, { Groupe: 'Agents' }, formDef, refRecords),
      'Agents'
    );
  });

  it('cas C : refRow lit la colonne sur la ligne parent', () => {
    const field = {
      dynamicFilter: {
        parentField: 'Contact',
        filterColumn: 'Groupe',
        parentResolve: 'refRow',
        parentValueColumn: 'Groupe'
      }
    };
    assert.equal(
      Engine.resolveParentFilterValue(field, { Contact: 1 }, formDef, refRecords),
      'Agents'
    );
    assert.equal(
      Engine.resolveParentFilterValue(field, { Contact: '2' }, formDef, refRecords),
      'Public'
    );
  });

  it('cas C : id manquant ou parent vide → null', () => {
    const field = {
      dynamicFilter: {
        parentField: 'Contact',
        filterColumn: 'Groupe',
        parentResolve: 'refRow',
        parentValueColumn: 'Groupe'
      }
    };
    assert.equal(Engine.resolveParentFilterValue(field, {}, formDef, refRecords), null);
    assert.equal(Engine.resolveParentFilterValue(field, { Contact: 99 }, formDef, refRecords), null);
  });
});

describe('valuesFromRecord — une ligne Grist vers les champs', () => {
  const def = {
    sections: [{ id: 's1', label: 'E', fields: [
      { colId: 'Nom', label: 'Nom', type: 'Text', widget: 'text' },
      { colId: 'Jour', label: 'Jour', type: 'Date', widget: 'date' },
      { colId: 'Instant', label: 'Instant', type: 'DateTime:Europe/Paris', widget: 'datetime' },
      { colId: 'Modes', label: 'Modes', type: 'ChoiceList', widget: 'multiselect' },
      { colId: 'Batiment', label: 'Batiment', type: 'Ref:Batiments', widget: 'select' },
      { colId: 'Ouvert', label: 'Ouvert', type: 'Bool', widget: 'checkbox' }
    ] }]
  };

  it('rend une Date en AAAA-MM-JJ depuis des secondes', () => {
    const v = Engine.valuesFromRecord(def, { Jour: 1726617600 });
    assert.equal(v.Jour, '2024-09-18');
  });

  it('rend un DateTime dans la forme attendue par le champ, et le relit à l identique', () => {
    const secondes = 1726653600; // instant quelconque
    const v = Engine.valuesFromRecord(def, { Instant: secondes });
    assert.match(v.Instant, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    const Types = require('../shared/types.js');
    assert.equal(Types.coerceForWrite({ type: 'DateTime' }, v.Instant), secondes);
  });

  it('deplie une liste Grist et garde une reference non vide', () => {
    const v = Engine.valuesFromRecord(def, { Modes: ['L', 'Velo', 'Bus'], Batiment: 7, Ouvert: true });
    assert.deepEqual(v.Modes, ['Velo', 'Bus']);
    assert.equal(v.Batiment, 7);
    assert.equal(v.Ouvert, true);
  });

  it('ignore une reference vide (0 cote Grist) et ce que le formulaire ne declare pas', () => {
    const v = Engine.valuesFromRecord(def, { Batiment: 0, Inconnu: 'x', Nom: 'Mairie' });
    assert.equal('Batiment' in v, false);
    assert.equal('Inconnu' in v, false);
    assert.equal(v.Nom, 'Mairie');
  });
});
