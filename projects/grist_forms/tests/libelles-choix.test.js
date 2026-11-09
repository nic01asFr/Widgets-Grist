/*
 * options.libelles — un libellé distinct de la valeur. Même ordre de priorité que le rendu du kit d'appkit :
 * libellé porté par l'option, puis libelles, puis la valeur. La valeur écrite ne change jamais.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../runtime/engine.js');

const radio = (options) => ({ colId: 'p', label: 'Priorité', type: 'Choice', widget: 'radio', options: Object.assign({ choices: ['1', '2', '3', '4'] }, options) });

/** Les libellés affichés, dans l'ordre, tels que le rendu les pose (texte des <label> des cases). */
function libellesAffiches(html) {
  return Array.from(html.matchAll(/<label[^>]*for="[^"]*"[^>]*>([\s\S]*?)<\/label>/g)).map((m) => m[1].replace(/<[^>]+>/g, '').trim());
}
function valeursPosees(html) {
  return Array.from(html.matchAll(/value="([^"]*)"/g)).map((m) => m[1]);
}

describe('options.libelles : affichage', () => {
  it('sans libelles : la valeur est le libellé, comme avant', () => {
    const html = Engine.renderFieldHtml(radio(), {});
    assert.deepEqual(libellesAffiches(html).filter(Boolean).slice(-4), ['1', '2', '3', '4']);
  });
  it('avec libelles : le libellé s\'affiche, la valeur posée reste la clé', () => {
    const html = Engine.renderFieldHtml(radio({ libelles: { 1: 'Critique', 2: 'Haute', 3: 'Moyenne', 4: 'Basse' } }), {});
    const affiches = libellesAffiches(html).join(' | ');
    ['Critique', 'Haute', 'Moyenne', 'Basse'].forEach((l) => assert.ok(affiches.includes(l), l + ' absent : ' + affiches));
    const valeurs = valeursPosees(html);
    ['1', '2', '3', '4'].forEach((v) => assert.ok(valeurs.includes(v), 'la valeur ' + v + ' doit rester la clé'));
    ['Critique', 'Haute', 'Moyenne', 'Basse'].forEach((l) => assert.ok(!valeurs.includes(l), l + ' ne doit pas devenir une valeur'));
  });
  it('un libellé partiel : les autres gardent leur valeur', () => {
    const html = Engine.renderFieldHtml(radio({ libelles: { 1: 'Critique' } }), {});
    const affiches = libellesAffiches(html).join(' | ');
    assert.ok(affiches.includes('Critique'));
    ['2', '3', '4'].forEach((v) => assert.ok(affiches.includes(v), v));
  });
  it('la case cochée reste celle de la valeur, pas celle du libellé', () => {
    const html = Engine.renderFieldHtml(radio({ libelles: { 1: 'Critique', 2: 'Haute' } }), { p: '2' });
    const m = /<input[^>]*value="2"[^>]*>/.exec(html);
    assert.ok(m && /checked/.test(m[0]), 'la case de la valeur 2 doit être cochée');
  });
  it('ça marche aussi pour une liste déroulante et des cases multiples', () => {
    const select = Engine.renderFieldHtml({ colId: 'p', label: 'P', type: 'Choice', widget: 'select', options: { choices: ['a', 'b'], libelles: { a: 'Alpha' } } }, {});
    assert.ok(select.includes('>Alpha<'));
    assert.ok(select.includes('value="a"'));
    const multi = Engine.renderFieldHtml({ colId: 'p', label: 'P', type: 'ChoiceList', widget: 'multiselect', options: { choices: ['a', 'b'], libelles: { b: 'Bravo' } } }, {});
    assert.ok(multi.includes('Bravo'));
    assert.ok(multi.includes('value="b"'));
  });
  it('échappé : un libellé ne peut pas injecter de balise', () => {
    const html = Engine.renderFieldHtml(radio({ libelles: { 1: '<img src=x onerror=alert(1)>' } }), {});
    assert.ok(!html.includes('<img'));
  });
});

describe('options.libelles : ce qu\'on ignore, sans lever', () => {
  const rendu = (lib) => Engine.renderFieldHtml(radio({ libelles: lib }), {});
  it('un libellé vide ou non texte est ignoré : la valeur sert de libellé', () => {
    [{ 1: '' }, { 1: '   ' }, { 1: 7 }, { 1: null }, { 1: { a: 1 } }].forEach((lib) => {
      const affiches = libellesAffiches(rendu(lib)).join(' | ');
      assert.ok(affiches.includes('1'), JSON.stringify(lib));
    });
  });
  it('une forme inutilisable est ignorée', () => {
    ['Critique', 42, ['Critique'], null, true].forEach((lib) => {
      assert.doesNotThrow(() => rendu(lib));
      assert.deepEqual(libellesAffiches(rendu(lib)).filter(Boolean).slice(-4), ['1', '2', '3', '4']);
    });
  });
  it('un tableau dont les indices tombent sur les valeurs n\'est pas un dictionnaire : ignoré', () => {
    const lib = ['zéro', 'Critique', 'Haute', 'Moyenne', 'Basse'];
    const affiches = libellesAffiches(rendu(lib)).join(' | ');
    assert.ok(!affiches.includes('Critique') && !affiches.includes('Haute'), affiches);
  });
  it('un dictionnaire hérité d\'un prototype n\'est pas lu : seules les propriétés propres comptent', () => {
    const herite = Object.create({ 1: 'Hérité', 2: 'Hérité aussi' });
    const affiches = libellesAffiches(rendu(herite)).join(' | ');
    assert.ok(!affiches.includes('Hérité'), affiches);
  });
  it('une clé qui n\'est pas une valeur du choix est sans effet', () => {
    assert.deepEqual(libellesAffiches(rendu({ 9: 'Inconnue' })).filter(Boolean).slice(-4), ['1', '2', '3', '4']);
  });
  it('un nom de propriété du prototype n\'est pas une clé du dictionnaire', () => {
    const html = Engine.renderFieldHtml({ colId: 'p', label: 'P', type: 'Choice', widget: 'radio', options: { choices: ['toString', 'constructor'], libelles: {} } }, {});
    const affiches = libellesAffiches(html).join(' | ');
    assert.ok(affiches.includes('toString'));
    assert.ok(affiches.includes('constructor'));
  });
});

describe('options.libelles : priorité', () => {
  it('un libellé porté par l\'option l\'emporte sur libelles', () => {
    const f = { colId: 'p', label: 'P', type: 'Choice', widget: 'radio', options: { choices: [{ value: 'a', label: 'Déjà nommé' }, 'b'], libelles: { a: 'Autre', b: 'Bravo' } } };
    const affiches = libellesAffiches(Engine.renderFieldHtml(f, {})).join(' | ');
    assert.ok(affiches.includes('Déjà nommé'));
    assert.ok(!affiches.includes('Autre'));
    assert.ok(affiches.includes('Bravo'));
  });
  it('sans effet sur une référence : ses libellés viennent de la table liée', () => {
    const f = { colId: 'r', label: 'R', type: 'Ref:Projects', widget: 'select', options: { libelles: { 1: 'Ignoré' } } };
    const html = Engine.renderFieldHtml(f, {}, [{ value: 1, label: 'Refonte' }, { value: 2, label: 'Mobile' }]);
    assert.ok(html.includes('Refonte'));
    assert.ok(!html.includes('Ignoré'));
  });
  it('une référence dont le libellé égale la valeur n\'est pas remplacée : libelles ne vaut que pour les choix', () => {
    const f = { colId: 'r', label: 'R', type: 'RefList:Projects', widget: 'multiselect', options: { libelles: { 7: 'Ignoré' } } };
    const html = Engine.renderFieldHtml(f, {}, [7, 8]);
    assert.ok(!html.includes('Ignoré'), 'une référence ne prend pas de libellé de libelles');
  });
  it('la liste d\'options passée au rendu reçoit aussi les libellés', () => {
    const f = { colId: 'p', label: 'P', type: 'Choice', widget: 'select', options: { libelles: { a: 'Alpha' } } };
    assert.ok(Engine.renderFieldHtml(f, {}, ['a', 'b']).includes('>Alpha<'));
  });
});

describe('options.libelles : le noyau et le moteur s\'accordent', () => {
  const Mobiles = require('../shared/saisies-mobiles.js');
  it('ce que le validateur accepte, le moteur l\'affiche', () => {
    const champ = radio({ libelles: { 1: 'Critique', 2: 'Haute' } });
    const def = { manifest_version: '1.0.0', id: 'x', title: 'X', tableId: 'T', composeMode: 'bind', choices: {}, sections: [{ id: 's', label: 'S', fields: [champ] }] };
    assert.equal(Mobiles.validerSaisiesMobiles(def).conforme, true);
    assert.ok(Engine.renderFieldHtml(champ, {}).includes('Critique'));
  });
});
