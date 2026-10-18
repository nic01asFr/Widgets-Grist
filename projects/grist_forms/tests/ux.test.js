const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Ux = require('../shared/ux.js');

describe('FormUx', () => {
  it('slugify strips accents and spaces', () => {
    assert.equal(Ux.slugify('Nom complet'), 'Nom_complet');
    assert.equal(Ux.slugify('Été 2026'), 'Ete_2026');
  });

  it('tableNameFromTitle prefixes Reponses_', () => {
    assert.equal(Ux.tableNameFromTitle('Satisfaction client'), 'Reponses_Satisfaction_client');
  });

  it('isValidGristIdent rejects accents and spaces', () => {
    assert.equal(Ux.isValidGristIdent('Reponses_OK'), true);
    assert.equal(Ux.isValidGristIdent('Mes Réponses'), false);
    assert.equal(Ux.isValidGristIdent('1bad'), false);
  });

  it('humanizeBindingErrors translates choices', () => {
    const msgs = Ux.humanizeBindingErrors(['Champ « Note » : choices manquants pour Choice']);
    assert.ok(msgs[0].includes('option'));
    assert.ok(msgs[0].includes('Note'));
  });

  it('templates expose contact / satisfaction / inscription', () => {
    const ids = Ux.templates().map(t => t.id);
    assert.deepEqual(ids, ['contact', 'satisfaction', 'inscription']);
  });
});

describe('FormUx — le champ d’adresse', () => {
  const adresse = { colId: 'A', type: 'Text', widget: 'text', kind: 'referentiel' };

  it('figure parmi les types qu’on peut choisir', () => {
    const cles = Ux.ADVANCED_TYPES.map((t) => t.key);
    assert.ok(cles.includes('adresse'));
  });

  it('se reconnaît par son kind, pas pour un texte ordinaire', () => {
    assert.equal(Ux.fieldTypeKey(adresse), 'adresse');
    assert.equal(Ux.fieldTypeKey({ colId: 'T', type: 'Text', widget: 'text' }), 'text',
      'un texte sans kind reste un texte');
  });

  it('choisir ce type pose le kind, le type Grist et le widget d’un texte', () => {
    const f = { colId: 'A', type: 'Int', widget: 'number' };
    Ux.applyTypeKey(f, 'adresse');
    assert.equal(f.kind, 'referentiel');
    assert.equal(f.type, 'Text');
    assert.equal(f.widget, 'text');
  });

  it('le quitter retire le kind', () => {
    const f = Object.assign({}, adresse);
    Ux.applyTypeKey(f, 'text');
    assert.equal(f.kind, undefined);
  });

  it('les types qui se reconnaissaient par leur widget se reconnaissent encore', () => {
    assert.equal(Ux.fieldTypeKey({ type: 'Choice', widget: 'classement', kind: 'classement' }), 'classement');
    assert.equal(Ux.fieldTypeKey({ type: 'Text', widget: 'geo', kind: 'geometrie' }), 'geo');
  });
});
