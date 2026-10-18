'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Saisies = require('../shared/saisies.js');
const Engine = require('../runtime/engine.js');
const Ensure = require('../shared/ensure-schema.js');
const { createRoot } = require('./helpers/fake-dom.js');

const def = (champs) => ({ id: 'essai', title: 'Essai', tableId: 'T', sections: [{ label: 'S', fields: champs }] });

describe('Étiquettes — la règle', () => {
  it('ajoute une étiquette nettoyée, sans doublon, la casse ne distinguant pas', () => {
    let l = Saisies.ajouterEtiquette([], '  urgent  ');
    assert.deepEqual(l, ['urgent']);
    l = Saisies.ajouterEtiquette(l, 'URGENT');
    assert.deepEqual(l, ['urgent'], 'doublon refusé');
    l = Saisies.ajouterEtiquette(l, 'a\u0000b\tc');
    assert.deepEqual(l, ['urgent', 'a b c'], 'caractères de commande remplacés');
  });

  it('une étiquette vide ne s’ajoute pas', () => {
    assert.deepEqual(Saisies.ajouterEtiquette(['x'], '   '), ['x']);
    assert.deepEqual(Saisies.ajouterEtiquette(['x'], null), ['x']);
  });

  it('borne la longueur et le nombre', () => {
    assert.equal(Saisies.ajouterEtiquette([], 'x'.repeat(100))[0].length, 40);
    assert.deepEqual(Saisies.ajouterEtiquette(['a', 'b'], 'c', { max: 2 }), ['a', 'b'], 'plafond atteint');
    const pleine = Array.from({ length: 20 }, (_, i) => 'e' + i);
    assert.equal(Saisies.ajouterEtiquette(pleine, 'de plus').length, 20, 'plafond par défaut');
  });

  it('retire une étiquette', () => {
    assert.deepEqual(Saisies.retirerEtiquette(['a', 'b', 'c'], 'b'), ['a', 'c']);
    assert.deepEqual(Saisies.retirerEtiquette(['a'], 'z'), ['a']);
  });
});

describe('Étiquettes — dans le moteur', () => {
  const champ = (extra) => ({ colId: 'Tags', label: 'Étiquettes', type: 'ChoiceList', widget: 'etiquettes', options: Object.assign({ choices: ['froid', 'bruit'] }, extra) });

  function monter(champs, values) {
    const root = createRoot();
    let envoye = null;
    Engine.mount(root, def(champs), { skipProbe: true, values: values || {}, submit: (d) => { envoye = d; return Promise.resolve({ ok: true }); } });
    return { root, envoyer: async () => {
      root.querySelector('[data-action="submit"]').dispatchEvent('click');
      await new Promise((r) => setTimeout(r, 10));
      return envoye;
    } };
  }

  it('se rend avec ses puces, sa saisie, son bouton et ses suggestions', () => {
    const html = Engine.renderFieldHtml(champ(), { Tags: ['urgent', 'froid'] }, null, def([]));
    assert.match(html, /data-etiquette="urgent"/);
    assert.match(html, /data-etiquette-retirer="froid"/);
    assert.match(html, /name="Tags__saisie"/);
    assert.match(html, /data-etiquette-ajouter="Tags"/);
    assert.match(html, /<datalist[^>]*><option value="froid">/);
  });

  it('une étiquette piégée est échappée', () => {
    const html = Engine.renderFieldHtml(champ(), { Tags: ['<img src=x onerror=alert(1)>'] }, null, def([]));
    assert.ok(!html.includes('<img'), html);
  });

  it('les étiquettes ajoutées partent en liste Grist, dans l’ordre', async () => {
    const m = monter([champ()]);
    for (const mot of ['urgent', 'froid']) {
      m.root.querySelector('[name="Tags__saisie"]').value = mot;
      m.root.querySelector('[data-etiquette-ajouter="Tags"]').dispatchEvent('click');
    }
    const e = await m.envoyer();
    assert.ok(e);
    assert.deepEqual(e.Tags, ['L', 'urgent', 'froid']);
  });

  it('un mot tapé et pas encore ajouté n’est pas perdu', async () => {
    const m = monter([champ()]);
    m.root.querySelector('[name="Tags__saisie"]').value = 'oublié';
    const e = await m.envoyer();
    assert.deepEqual(e.Tags, ['L', 'oublié']);
  });

  it('sans étiquette, rien n’est écrit ; obligatoire, la question l’exige', async () => {
    const libre = monter([champ()]);
    const e = await libre.envoyer();
    assert.ok(e);
    assert.strictEqual(e.Tags, null);
    const requis = monter([Object.assign(champ(), { required: true })]);
    assert.equal(await requis.envoyer(), null);
  });

  it('des étiquettes libres n’exigent pas de liste de choix à déclarer', () => {
    const libre = { colId: 'Tags', label: 'Étiquettes', type: 'ChoiceList', widget: 'etiquettes', options: {} };
    const r = Ensure.bindingIsComplete(Object.assign(def([libre]), { composeMode: 'ensureSchema' }));
    assert.equal(r.ok, true, r.errors.join(' / '));
    const liste = { colId: 'C', label: 'C', type: 'ChoiceList', widget: 'multiselect', options: {} };
    assert.equal(Ensure.bindingIsComplete(Object.assign(def([liste]), { composeMode: 'ensureSchema' })).ok, false, 'une vraie liste, elle, en exige une');
  });
});

describe('Pastilles — des choix colorés', () => {
  const champ = (couleurs) => ({
    colId: 'P', label: 'Priorité', type: 'Choice', widget: 'pastilles',
    options: { choices: ['Critique', 'Haute', 'Basse'], couleurs }
  });

  it('chaque choix porte sa couleur, déclarée par la question', () => {
    const html = Engine.renderFieldHtml(champ({ Critique: '#c9191e', Haute: '#b34000', Basse: '#18753c' }), {}, null, def([]));
    assert.match(html, /data-option="Critique"[^>]*style="--pastille:#c9191e"/);
    assert.match(html, /data-option="Basse"[^>]*style="--pastille:#18753c"/);
    assert.match(html, /fr-fieldset--pastilles/);
  });

  it('une couleur qui n’en est pas une est ignorée : elle ne peut pas injecter de style', () => {
    const html = Engine.renderFieldHtml(champ({ Critique: 'red;background:url(javascript:alert(1))', Haute: 'rgb(0,0,0)', Basse: '#12' }), {}, null, def([]));
    assert.ok(!html.includes('style='), 'aucun style posé : ' + html);
  });

  it('un choix sans couleur reste un choix ordinaire', () => {
    const html = Engine.renderFieldHtml(champ({ Critique: '#c9191e' }), {}, null, def([]));
    assert.match(html, /data-option="Critique"[^>]*style=/);
    assert.ok(!/data-option="Haute"[^>]*style=/.test(html));
  });

  it('un choix se lit et part comme un bouton radio', async () => {
    const root = createRoot();
    let envoye = null;
    Engine.mount(root, def([champ({ Critique: '#c9191e' })]), { skipProbe: true, submit: (d) => { envoye = d; return Promise.resolve({}); } });
    const radio = root.querySelector('input[name="P"][value="Haute"]');
    radio.checked = true;
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(envoye);
    assert.equal(envoye.P, 'Haute');
  });

  it('Saisies.couleurValide : #rgb et #rrggbb seulement', () => {
    ['#fff', '#FFFFFF', '#1a2b3c'].forEach((c) => assert.equal(Saisies.couleurValide(c), true, c));
    ['fff', '#ffff', 'red', '#12', 'rgb(0,0,0)', '', null, 12].forEach((c) => assert.equal(Saisies.couleurValide(c), false, String(c)));
  });
});
