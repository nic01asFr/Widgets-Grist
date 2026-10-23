const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../runtime/engine.js');
const FormUx = require('../shared/ux.js');

describe('evaluateCondition AND/OU', () => {
  it('règle simple', () => {
    assert.equal(Engine.evaluateCondition({ field: 'A', operator: '==', value: 'x' }, { A: 'x' }), true);
    assert.equal(Engine.evaluateCondition({ field: 'A', operator: '==', value: 'x' }, { A: 'y' }), false);
  });

  it('AND', () => {
    const c = {
      op: 'and',
      rules: [
        { field: 'A', operator: '==', value: 1 },
        { field: 'B', operator: '==', value: 'oui' }
      ]
    };
    assert.equal(Engine.evaluateCondition(c, { A: 1, B: 'oui' }), true);
    assert.equal(Engine.evaluateCondition(c, { A: 1, B: 'non' }), false);
  });

  it('OU', () => {
    const c = {
      op: 'or',
      rules: [
        { field: 'A', operator: '==', value: 'x' },
        { field: 'A', operator: '==', value: 'y' }
      ]
    };
    assert.equal(Engine.evaluateCondition(c, { A: 'y' }), true);
    assert.equal(Engine.evaluateCondition(c, { A: 'z' }), false);
  });
});

describe('section chemins', () => {
  it('condition section prime sur gate', () => {
    const sec = {
      gate: 'Flag',
      condition: { field: 'Type', operator: '==', value: 'Pro' }
    };
    assert.equal(Engine.isSectionVisible(sec, { Flag: true, Type: 'Perso' }), false);
    assert.equal(Engine.isSectionVisible(sec, { Flag: false, Type: 'Pro' }), true);
  });

  it('gate Bool legacy', () => {
    assert.equal(Engine.isSectionVisible({ gate: 'Ok' }, { Ok: false }), false);
    assert.equal(Engine.isSectionVisible({ gate: 'Ok' }, { Ok: true }), true);
  });
});

describe('filterDynamicOptions', () => {
  it('filtre par colonne != cascade Ref', () => {
    const choices = [
      { value: 1, label: 'A' },
      { value: 2, label: 'B' },
      { value: 3, label: 'C' }
    ];
    const records = {
      id: [1, 2, 3],
      Nom: ['A', 'B', 'C'],
      Type: ['Client', 'Prospect', 'Client']
    };
    const out = Engine.filterDynamicOptions(choices, records, 'Type', 'Client');
    assert.deepEqual(out.map(o => o.value), [1, 3]);
  });
});

describe('FormUx condition helpers', () => {
  it('compact / normalize roundtrip', () => {
    const simple = { field: 'X', operator: '==', value: 1 };
    const compound = FormUx.normalizeToCompound(simple);
    assert.equal(compound.op, 'and');
    assert.equal(compound.rules.length, 1);
    assert.deepEqual(FormUx.compactCondition(compound), simple);
  });

  it('detectRefColumn', () => {
    const cols = [
      { colId: 'Nom', type: 'Text' },
      { colId: 'Region', type: 'Ref:Regions' }
    ];
    assert.equal(FormUx.detectRefColumn(cols, 'Regions'), 'Region');
  });
});

/* ======================================================================
 * shared/conditions.js — l'évaluateur partagé (contrat conditions-1.0)
 * ====================================================================== */

const Conditions = require('../shared/conditions.js');
const { ConditionInvalide } = Conditions;

const ev = (cond, values, context) => Conditions.evaluer(cond, { values, context });
const regle = (operator, value, actual) =>
  ev({ field: 'X', operator, value }, { X: actual });

describe('Conditions.OPERATEURS — le vocabulaire fermé', () => {
  it('liste exactement les opérateurs du moteur, plus empty / notEmpty', () => {
    assert.deepEqual(Conditions.OPERATEURS, [
      '==', '!=', '>', '>=', '<', '<=', 'contains', 'in', 'notIn', 'truthy', 'empty', 'notEmpty'
    ]);
    assert.deepEqual(Conditions.SOURCES, ['field', 'context', 'audience']);
    assert.deepEqual(Conditions.COMPOSES, ['and', 'or', 'not']);
  });

  it('chaque opérateur listé s’évalue (aucun n’est un mot mort)', () => {
    Conditions.OPERATEURS.forEach((op) => {
      assert.doesNotThrow(() => regle(op, 1, 1), op);
    });
  });
});

describe('Conditions.evaluer — opérateurs', () => {
  it('== et != : égalité lâche, comportement historique', () => {
    assert.equal(regle('==', 1, '1'), true, "'1' == 1");
    assert.equal(regle('==', 'x', 'x'), true);
    assert.equal(regle('==', 'x', 'y'), false);
    assert.equal(regle('!=', 'x', 'y'), true);
    assert.equal(regle('!=', 1, '1'), false);
    // Le piège documenté : une réponse vide égale 0.
    assert.equal(regle('==', 0, ''), true, "'' == 0");
    // Un absent n'égale pas la chaîne vide, mais égale null.
    assert.equal(regle('==', '', undefined), false);
    assert.equal(regle('==', null, undefined), true);
    // true n'égale pas la chaîne 'true' (celle des boutons oui/non) : on écrit 'true'.
    assert.equal(regle('==', true, 'true'), false);
    assert.equal(regle('==', 'true', 'true'), true);
  });

  it('opérateur absent = ==', () => {
    assert.equal(ev({ field: 'X', value: 'a' }, { X: 'a' }), true);
    assert.equal(ev({ field: 'X', operator: '', value: 'a' }, { X: 'b' }), false);
  });

  it('> >= < <= : comparaison numérique', () => {
    assert.equal(regle('>', 5, '6'), true);
    assert.equal(regle('>', 5, 5), false);
    assert.equal(regle('>=', 5, 5), true);
    assert.equal(regle('<', 5, '4'), true);
    assert.equal(regle('<=', 5, 6), false);
    // Une valeur non numérique donne faux, y compris pour une date ISO.
    assert.equal(regle('>', '2026-01-01', '2026-06-01'), false);
    assert.equal(regle('<', 5, 'abc'), false);
    // Une réponse vide vaut 0 : documenté.
    assert.equal(regle('<', 5, ''), true);
  });

  it('contains : élément d’une liste (strict) ou sous-chaîne', () => {
    assert.equal(regle('contains', 'a', ['a', 'b']), true);
    assert.equal(regle('contains', 'c', ['a', 'b']), false);
    assert.equal(regle('contains', 1, ['1']), false, 'strict sur les listes');
    assert.equal(regle('contains', 'ell', 'Hello'), true);
    assert.equal(regle('contains', 'x', null), false);
  });

  it('in / notIn : appartenance par chaînes, liste ou valeur seule', () => {
    assert.equal(regle('in', ['a', 'b'], 'a'), true);
    assert.equal(regle('in', ['a', 'b'], 'c'), false);
    assert.equal(regle('in', [1, 2], '2'), true);
    assert.equal(regle('in', 'a', 'a'), true, 'value seule');
    assert.equal(regle('in', ['a'], ['z', 'a']), true, 'une liste réelle : un élément suffit');
    assert.equal(regle('in', [], 'a'), false);
    assert.equal(regle('notIn', ['a', 'b'], 'c'), true);
    assert.equal(regle('notIn', ['a', 'b'], 'a'), false);
    assert.equal(regle('notIn', ['a'], ['z', 'a']), false);
  });

  it('truthy : vrai au sens JavaScript', () => {
    assert.equal(regle('truthy', undefined, 'x'), true);
    assert.equal(regle('truthy', undefined, ''), false);
    assert.equal(regle('truthy', undefined, 0), false);
    assert.equal(regle('truthy', undefined, false), false);
    assert.equal(regle('truthy', undefined, []), true, 'une liste vide est vraie');
  });

  it('empty / notEmpty : l’absence de réponse, pas zéro ni false', () => {
    [undefined, null, '', [], ['L']].forEach((v) => {
      assert.equal(regle('empty', undefined, v), true, JSON.stringify(v));
      assert.equal(regle('notEmpty', undefined, v), false, JSON.stringify(v));
    });
    [0, false, 'a', ' ', ['a'], ['L', 3], '0'].forEach((v) => {
      assert.equal(regle('empty', undefined, v), false, JSON.stringify(v));
      assert.equal(regle('notEmpty', undefined, v), true, JSON.stringify(v));
    });
    assert.equal(ev({ field: 'Absent', operator: 'empty' }, {}), true, 'valeur jamais posée');
    assert.equal(ev({ field: 'X', operator: 'empty', value: 'ignorée' }, { X: '' }), true, 'value ignorée');
  });
});

describe('Conditions.evaluer — sources', () => {
  it('field (défaut) lit les réponses, par field ou par path (path l’emporte)', () => {
    assert.equal(ev({ field: 'A', value: 1 }, { A: 1 }), true);
    assert.equal(ev({ path: 'A', value: 1 }, { A: 1 }), true);
    assert.equal(ev({ field: 'B', path: 'A', value: 1 }, { A: 1, B: 2 }), true);
    assert.equal(ev({ source: 'field', field: 'A', value: 1 }, { A: 2 }), false);
  });

  it('context lit les clés fournies par l’hôte', () => {
    const ctx = { site: 'lyon', role: 'admin' };
    assert.equal(ev({ source: 'context', path: 'site', value: 'lyon' }, {}, ctx), true);
    assert.equal(ev({ source: 'context', field: 'role', operator: 'in', value: ['admin', 'chef'] }, {}, ctx), true);
    assert.equal(ev({ source: 'context', path: 'site', value: 'paris' }, {}, ctx), false);
    assert.equal(ev({ source: 'context', path: 'absent', operator: 'empty' }, {}, ctx), true);
    assert.equal(ev({ source: 'context', path: 'site', value: 'x' }, {}), false, 'sans contexte');
  });

  it('le préfixe context. / audience. dans field reste accepté (alias historique)', () => {
    assert.equal(ev({ field: 'context.site', value: 'lyon' }, { 'context.site': 'zzz' }, { site: 'lyon' }), true);
    assert.equal(ev({ path: 'audience.member', operator: 'truthy' }, {}, { userEmail: 'a@b.fr' }), true);
  });

  it('audience : email normalisé, groupes, membre', () => {
    const ctx = { userEmail: '  Jean@Exemple.FR ', groups: ['terrain', 'bureau'] };
    assert.equal(ev({ source: 'audience', path: 'email', value: 'jean@exemple.fr' }, {}, ctx), true);
    assert.equal(ev({ source: 'audience', path: 'email', operator: 'in', value: ['X@y.fr', 'JEAN@exemple.fr'] }, {}, ctx), true);
    assert.equal(ev({ source: 'audience', path: 'group', operator: 'in', value: ['terrain'] }, {}, ctx), true);
    assert.equal(ev({ source: 'audience', path: 'groups', operator: 'contains', value: 'bureau' }, {}, ctx), true);
    assert.equal(ev({ source: 'audience', path: 'member', operator: 'truthy' }, {}, ctx), true);
    assert.equal(ev({ source: 'audience', path: 'member', operator: 'truthy' }, {}, { userEmail: '' }), false);
    // bind.groups tient lieu de valeur attendue
    const bind = { groups: ['direction'] };
    assert.equal(ev({ source: 'audience', path: 'group', operator: 'in', bind }, {}, { groups: ['direction'] }), true);
    assert.equal(ev({ source: 'audience', path: 'group', operator: 'in', bind }, {}, { groups: ['terrain'] }), false);
    // une clé d'audience quelconque se lit dans le contexte
    assert.equal(ev({ source: 'audience', path: 'role', value: 'x' }, {}, { role: 'x' }), true);
  });

  it('une règle que le compositeur n’a pas remplie reste vraie (historique)', () => {
    assert.equal(ev({ field: '', operator: '==', value: '' }, { '': 'x' }), true);
    assert.equal(ev({ source: 'field', field: '', path: '', operator: '==', value: '', bind: null }, {}), true);
  });
});

describe('Conditions.evaluer — composés et imbrication', () => {
  it('and / or / not', () => {
    const a = { field: 'A', value: 1 };
    const b = { field: 'B', value: 2 };
    assert.equal(ev({ op: 'and', rules: [a, b] }, { A: 1, B: 2 }), true);
    assert.equal(ev({ op: 'and', rules: [a, b] }, { A: 1, B: 3 }), false);
    assert.equal(ev({ op: 'or', rules: [a, b] }, { A: 0, B: 2 }), true);
    assert.equal(ev({ op: 'or', rules: [a, b] }, { A: 0, B: 0 }), false);
    assert.equal(ev({ op: 'not', rules: [a] }, { A: 1 }), false);
    assert.equal(ev({ op: 'not', rules: [a] }, { A: 2 }), true);
  });

  it('and / or sans règle valent vrai (historique) ; pas de condition = vrai', () => {
    assert.equal(ev({ op: 'and', rules: [] }, {}), true);
    assert.equal(ev({ op: 'or', rules: [] }, {}), true);
    assert.equal(ev(null, {}), true);
    assert.equal(ev(undefined, {}), true);
    assert.equal(ev({}, {}), true, 'objet vide laissé par l’ancien compositeur');
    assert.equal(Conditions.evaluer(null), true, 'sans portée');
  });

  it('imbrication profonde, not dans or dans and', () => {
    const cond = {
      op: 'and',
      rules: [
        { source: 'context', path: 'site', operator: 'in', value: ['lyon', 'paris'] },
        {
          op: 'or',
          rules: [
            { op: 'not', rules: [{ field: 'Type', operator: 'in', value: ['ecole', 'college'] }] },
            { source: 'audience', path: 'group', operator: 'in', value: ['direction'] }
          ]
        }
      ]
    };
    const ctx = { site: 'lyon', groups: [] };
    assert.equal(ev(cond, { Type: 'creche' }, ctx), true);
    assert.equal(ev(cond, { Type: 'ecole' }, ctx), false);
    assert.equal(ev(cond, { Type: 'ecole' }, { site: 'lyon', groups: ['direction'] }), true);
    assert.equal(ev(cond, { Type: 'creche' }, { site: 'nice', groups: [] }), false);
  });

  it('not de not rend la règle', () => {
    const r = { field: 'A', value: 1 };
    assert.equal(ev({ op: 'not', rules: [{ op: 'not', rules: [r] }] }, { A: 1 }), true);
    assert.equal(ev({ op: 'not', rules: [{ op: 'not', rules: [r] }] }, { A: 2 }), false);
  });
});

describe('Conditions.validerCondition — des fautes qui disent quoi écrire', () => {
  const fautes = (c) => Conditions.validerCondition(c);

  it('valide : rien à signaler', () => {
    [null, undefined, {}, { field: 'A' }, { field: 'A', operator: '==', value: 1 },
      { op: 'and', rules: [] }, { op: 'not', rules: [{ field: 'A' }] },
      { source: 'audience', path: 'email', bind: null }, { field: '', path: '' }
    ].forEach((c) => assert.deepEqual(fautes(c), [], JSON.stringify(c)));
  });

  it('opérateur inconnu : chemin, message actionnable, proposition', () => {
    const [e, ...reste] = fautes({ op: 'and', rules: [{ field: 'A' }, { field: 'B', operator: 'contain', value: 'x' }] });
    assert.equal(reste.length, 0);
    assert.equal(e.chemin, '/rules/1/operator');
    assert.equal(e.code, 'operateur_inconnu');
    assert.equal(e.bloquant, true);
    assert.ok(e.message.includes('« contain »'), e.message);
    assert.ok(e.message.includes('contains'), 'dit quoi écrire : ' + e.message);
    assert.deepEqual(e.propositions, ['contains']);
  });

  it('propose le bon opérateur pour les graphies courantes', () => {
    const prop = (op) => fautes({ field: 'A', operator: op })[0].propositions;
    assert.deepEqual(prop('==='), ['==']);
    assert.deepEqual(prop('='), ['==']);
    assert.deepEqual(prop('<>'), ['!=']);
    assert.deepEqual(prop('notin'), ['notIn']);
    assert.deepEqual(prop('IN'), ['in']);
    assert.deepEqual(prop('isEmpty'), ['empty']);
    assert.equal(fautes({ field: 'A', operator: 'zzz' })[0].propositions, undefined, 'rien de proche : pas de devinette');
  });

  it('source inconnue', () => {
    const [e] = fautes({ source: 'contexte', field: 'x' });
    assert.equal(e.chemin, '/source');
    assert.equal(e.code, 'source_inconnue');
    assert.deepEqual(e.propositions, ['context']);
    assert.ok(/field, context, audience/.test(e.message));
    assert.equal(fautes({ source: 'filtre', field: 'x' })[0].code, 'source_inconnue');
  });

  it('composé : op inconnu, op absent, rules absent, not à deux règles, règle nulle', () => {
    assert.equal(fautes({ op: 'xor', rules: [] })[0].code, 'op_inconnu');
    assert.equal(fautes({ op: 'xor', rules: [] })[0].chemin, '/op');
    assert.equal(fautes({ rules: [{ field: 'A' }] })[0].code, 'op_absent');
    assert.equal(fautes({ op: 'and' })[0].code, 'rules_absent');
    assert.equal(fautes({ op: 'and', rules: 'A' })[0].code, 'rules_absent');
    const not2 = fautes({ op: 'not', rules: [{ field: 'A' }, { field: 'B' }] })[0];
    assert.equal(not2.code, 'not_arite');
    assert.ok(/enveloppez/.test(not2.message), 'dit comment faire : ' + not2.message);
    assert.equal(fautes({ op: 'not', rules: [] })[0].code, 'not_arite');
    assert.equal(fautes({ op: 'and', rules: [null] })[0].code, 'regle_absente');
    assert.equal(fautes({ op: 'and', rules: [null] })[0].chemin, '/rules/0');
  });

  it('règle sans cible, mauvais types', () => {
    assert.equal(fautes({ operator: '==', value: 1 })[0].code, 'cible_absente');
    assert.equal(fautes({ field: 3 })[0].code, 'type_cible');
    assert.equal(fautes('A == 1')[0].code, 'type_condition');
    assert.equal(fautes(['A'])[0].code, 'type_condition');
    assert.equal(fautes(42)[0].code, 'type_condition');
  });

  it('clés inconnues et bind mal typé : signalés, mais pas bloquants', () => {
    const f = fautes({ field: 'A', operater: 'in' });
    assert.equal(f.length, 1);
    assert.equal(f[0].code, 'cle_inconnue');
    assert.equal(f[0].bloquant, false);
    assert.ok(/operator/.test(f[0].message), 'suggère operator : ' + f[0].message);
    assert.equal(fautes({ op: 'and', rules: [], label: 'x' })[0].bloquant, false);
    assert.equal(fautes({ field: 'A', bind: 'oups' })[0].bloquant, false);
  });

  it('plusieurs fautes à la fois, avec leurs chemins', () => {
    const f = fautes({
      op: 'and',
      rules: [{ source: 'zz', field: 'A' }, { op: 'or', rules: [{ field: 'B', operator: '~=' }] }]
    });
    assert.deepEqual(f.map((e) => e.chemin), ['/rules/0/source', '/rules/1/rules/0/operator']);
  });
});

describe('Conditions.evaluer — une condition invalide lève ConditionInvalide', () => {
  it('opérateur inconnu : plus « vrai »', () => {
    assert.throws(() => ev({ field: 'A', operator: 'contain', value: 'x' }, { A: 'xx' }), (err) => {
      assert.ok(err instanceof ConditionInvalide);
      assert.ok(err instanceof Error);
      assert.equal(err.name, 'ConditionInvalide');
      assert.equal(err.chemin, '/operator');
      assert.equal(err.erreurs.length, 1);
      assert.ok(err.message.includes('contains'));
      assert.ok(typeof err.stack === 'string');
      return true;
    });
  });

  it('source, composé et not mal formés lèvent aussi', () => {
    assert.throws(() => ev({ source: 'filtre', field: 'A' }, {}), ConditionInvalide);
    assert.throws(() => ev({ op: 'xor', rules: [] }, {}), ConditionInvalide);
    assert.throws(() => ev({ op: 'not', rules: [{ field: 'A' }, { field: 'B' }] }, {}), ConditionInvalide);
    assert.throws(() => ev({ operator: '==', value: 1 }, {}), ConditionInvalide);
  });

  it('la faute est vue même quand un or l’aurait court-circuitée', () => {
    const cond = { op: 'or', rules: [{ field: 'A', value: 1 }, { field: 'B', operator: 'nope' }] };
    assert.throws(() => ev(cond, { A: 1 }), ConditionInvalide);
  });

  it('les fautes non bloquantes ne lèvent pas : le comportement d’avant est conservé', () => {
    assert.equal(ev({ field: 'A', value: 1, commentaire: 'x' }, { A: 1 }), true);
  });

  it('comparer lève aussi, avec une proposition', () => {
    assert.throws(() => Conditions.comparer(1, 'gt', 0), (err) => {
      assert.ok(err instanceof ConditionInvalide);
      assert.deepEqual(err.erreurs[0].propositions, ['>']);
      return true;
    });
  });

  it('plusieurs fautes : le message le dit', () => {
    assert.throws(
      () => ev({ op: 'and', rules: [{ field: 'A', operator: 'x1' }, { field: 'B', operator: 'x2' }] }, {}),
      (err) => err.erreurs.length === 2 && /\+1 autre/.test(err.message)
    );
  });
});

describe('Engine — une condition invalide vaut « faux » et se journalise', () => {
  function capter() {
    const entrees = [];
    Engine.definirJournal((e) => entrees.push(e));
    return entrees;
  }
  const rendre = () => Engine.definirJournal(null);

  it('evaluateCondition : faux, et une seule entrée même évaluée cent fois', () => {
    const journal = capter();
    try {
      const cond = { field: 'A', operator: 'contain', value: 'x' };
      for (let i = 0; i < 100; i++) assert.equal(Engine.evaluateCondition(cond, { A: 'xx' }), false);
      assert.equal(journal.length, 1);
      assert.equal(journal[0].niveau, 'erreur');
      assert.equal(journal[0].code, 'condition_invalide');
      assert.equal(journal[0].source, 'FormEngine');
      assert.ok(journal[0].message.includes('contains'), journal[0].message);
      assert.ok(journal[0].message.includes('/operator'), journal[0].message);
    } finally { rendre(); }
  });

  it('sans journal d’hôte : console.error, une seule fois par condition', () => {
    Engine.definirJournal(null);
    const vraiError = console.error;
    const appels = [];
    console.error = (...a) => appels.push(a.join(' '));
    try {
      const cond = { field: 'A', operator: 'egal', value: 1 };
      Engine.evaluateCondition(cond, { A: 1 });
      Engine.evaluateCondition(cond, { A: 1 });
      Engine.evaluateCondition({ field: 'A', operator: 'egal2', value: 1 }, { A: 1 });
      assert.equal(appels.length, 2, 'une par condition distincte');
      assert.ok(appels[0].startsWith('[FormEngine]'));
    } finally { console.error = vraiError; rendre(); }
  });

  it('un journal d’hôte qui plante ne casse pas le formulaire', () => {
    Engine.definirJournal(() => { throw new Error('journal cassé'); });
    const vraiError = console.error;
    console.error = () => {};
    try {
      assert.equal(Engine.evaluateCondition({ field: 'A', operator: 'zz' }, {}), false);
    } finally { console.error = vraiError; rendre(); }
  });

  it('un champ à condition invalide reste caché, et n’est pas collecté', () => {
    capter();
    try {
      const def = {
        sections: [{ fields: [
          { colId: 'Visible', type: 'Text', widget: 'text' },
          { colId: 'Cache', type: 'Text', widget: 'text', condition: { field: 'Visible', operator: 'egal', value: 'x' } }
        ] }]
      };
      assert.equal(Engine.isFieldVisible(def.sections[0].fields[1], { Visible: 'x' }), false);
      const data = Engine.collectSubmitData(def, { Visible: 'x', Cache: 'secret' }, {});
      assert.equal(data.Cache, undefined, 'la valeur d’un champ caché ne part pas');
      assert.equal(data.Visible, 'x');
    } finally { rendre(); }
  });

  it('une étape à condition invalide est cachée', () => {
    const journal = capter();
    try {
      assert.equal(Engine.isSectionVisible({ condition: { op: 'xor', rules: [] } }, {}), false);
      assert.equal(journal.length, 1);
    } finally { rendre(); }
  });

  it('le chargement signale les conditions invalides, chemin du FormDef compris', () => {
    const journal = capter();
    try {
      const def = {
        id: 'enquete-x', title: 'T', tableId: 'T', choices: {},
        sections: [
          { id: 's1', label: 'A', condition: { field: 'Q', operator: 'nope' }, fields: [
            { colId: 'Q', label: 'Q', type: 'Text', widget: 'text' },
            { colId: 'R', label: 'R', type: 'Text', widget: 'text', condition: { source: 'filtre', field: 'Q' } }
          ] }
        ]
      };
      const fautes = Engine.validateFormDefConditions(def);
      assert.deepEqual(fautes.map((f) => f.chemin), [
        '/sections/0/condition/operator',
        '/sections/0/fields/1/condition/source'
      ]);
      const { createRoot } = require('./helpers/fake-dom.js');
      Engine.mount(createRoot(), def, { skipProbe: true });
      const messages = journal.filter((j) => j.code !== 'condition_invalide').map((j) => j.message);
      assert.equal(messages.length, 2);
      assert.ok(messages[0].includes('enquete-x') && messages[0].includes('/sections/0/condition/operator'), messages[0]);
      assert.ok(messages[1].includes('/sections/0/fields/1/condition/source'), messages[1]);
      // remonter le même formulaire ne redit rien
      const avant = journal.length;
      Engine.mount(createRoot(), def, { skipProbe: true });
      assert.equal(journal.length, avant);
    } finally { rendre(); }
  });

  it('un FormDef sain ne dit rien', () => {
    const journal = capter();
    try {
      const def = require('./fixtures/enquete-4e.formdef.json');
      assert.deepEqual(Engine.validateFormDefConditions(def), []);
      const { createRoot } = require('./helpers/fake-dom.js');
      Engine.mount(createRoot(), def, { skipProbe: true });
      assert.equal(journal.length, 0);
    } finally { rendre(); }
  });

  it('les nouveaux opérateurs servent aux champs : not, empty, notEmpty', () => {
    const f = { condition: { op: 'not', rules: [{ field: 'A', operator: 'empty' }] } };
    assert.equal(Engine.isFieldVisible(f, { A: '' }), false);
    assert.equal(Engine.isFieldVisible(f, { A: 'x' }), true);
    assert.equal(Engine.isFieldVisible({ condition: { field: 'A', operator: 'notEmpty' } }, { A: ['a'] }), true);
  });
});

describe('Engine sans shared/conditions.js — repli sur l’ancien évaluateur', () => {
  // Les hôtes qui n'ont pas encore le nouveau script (une copie figée, une
  // page non mise à jour) ne doivent pas perdre leur formulaire.
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');

  function moteurSansConditions() {
    const sortie = [];
    const self = {
      FormTypes: require('../shared/types.js'),
      FormAttachments: require('../shared/attachments.js'),
      SessionContext: require('../shared/session-context.js')
    };
    const sandbox = { self, console: { warn: (m) => sortie.push(m), error: (m) => sortie.push(m) } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../runtime/engine.js'), 'utf8'), sandbox);
    return { E: self.FormEngine, sortie };
  }

  it('se charge, évalue comme avant (inconnu = vrai) et le dit une fois', () => {
    const { E, sortie } = moteurSansConditions();
    assert.equal(typeof E.evaluateCondition, 'function');
    assert.equal(E.evaluateCondition({ field: 'A', operator: '==', value: 'x' }, { A: 'x' }), true);
    assert.equal(E.evaluateCondition({ field: 'A', operator: '==', value: 'x' }, { A: 'y' }), false);
    assert.equal(E.evaluateCondition({ op: 'or', rules: [{ field: 'A', value: 1 }, { field: 'B', value: 2 }] }, { B: 2 }), true);
    assert.equal(E.evaluateCondition({ field: 'A', operator: 'inconnu' }, { A: 1 }), true, 'comportement historique du repli');
    assert.equal(E.evaluateCondition({ source: 'audience', path: 'email', value: 'A@B.fr' }, {}, { userEmail: ' a@b.fr' }), true);
    assert.equal(sortie.length, 1);
    assert.ok(/conditions\.js/.test(sortie[0]), sortie[0]);
  });
});

describe('condition « est renseigné » (champ qui attend une réponse précédente)', () => {
  const groupe = { field: 'Departement', operator: 'notEmpty', value: '' };

  it('cache la question tant que rien n’est répondu, la montre ensuite', () => {
    assert.equal(Engine.evaluateCondition(groupe, {}), false);
    assert.equal(Engine.evaluateCondition(groupe, { Departement: undefined }), false);
    assert.equal(Engine.evaluateCondition(groupe, { Departement: null }), false);
    assert.equal(Engine.evaluateCondition(groupe, { Departement: '' }), false);
    assert.equal(Engine.evaluateCondition(groupe, { Departement: 5 }), true);
    assert.equal(Engine.evaluateCondition(groupe, { Departement: '5' }), true);
  });

  it('« n’est pas renseigné » est le contraire', () => {
    const vide = { field: 'Departement', operator: 'empty', value: '' };
    assert.equal(Engine.evaluateCondition(vide, {}), true);
    assert.equal(Engine.evaluateCondition(vide, { Departement: 5 }), false);
  });

  it('le piège : « différent de (vide) » laisse la question visible sans réponse', () => {
    const piege = { field: 'Departement', operator: '!=', value: '' };
    assert.equal(Engine.evaluateCondition(piege, {}), true);
  });

  it('le compositeur propose « est renseigné » pour une liste liée, un choix et un texte', () => {
    ['Ref', 'Ref:Departements', 'Choice', 'Text', 'Date'].forEach((t) => {
      const valeurs = FormUx.operatorsForType(t).map((o) => o.value);
      assert.ok(valeurs.includes('notEmpty'), t + ' : notEmpty manquant');
      assert.ok(valeurs.includes('empty'), t + ' : empty manquant');
    });
    // L'opérateur par défaut ne change pas : on n'impose pas « est renseigné » d'office.
    assert.equal(FormUx.operatorsForType('Ref')[0].value, '==');
  });

  it('ces opérateurs n’attendent pas de valeur ; les autres oui', () => {
    assert.equal(FormUx.operatorTakesValue('notEmpty'), false);
    assert.equal(FormUx.operatorTakesValue('empty'), false);
    assert.equal(FormUx.operatorTakesValue('=='), true);
    assert.equal(FormUx.operatorTakesValue('in'), true);
  });

  it('le résumé se lit en français', () => {
    assert.equal(FormUx.summarizeCondition(groupe), 'Departement est renseigné');
    assert.equal(FormUx.summarizeCondition({ field: 'A', operator: 'empty', value: '' }), 'A n’est pas renseigné');
  });
});
