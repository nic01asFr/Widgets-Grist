/*
 * Les quatre saisies mobiles (voix, audio, scan, photo) rendues par le moteur sans aucune capacité : le REPLI. C'est
 * ce qu'un hôte sans micro ni caméra montre, et ce qu'un moteur ancien montrerait d'un FormDef récent.
 *
 * Constat qui a motivé ce fichier : un champ `photo` s'affichait déjà comme un champ fichier (repli par le type Grist
 * Attachments), mais ses fichiers étaient relus comme une chaîne vide : la photo prise n'arrivait jamais à l'envoi.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../runtime/engine.js');
const { createRoot } = require('./helpers/fake-dom.js');

function def(champs) {
  return { manifest_version: '1.0.0', id: 'x', title: 'X', tableId: 'T', composeMode: 'bind', choices: {}, sections: [{ id: 's', label: 'S', fields: champs }] };
}
const champ = (widget, type, options) => ({ colId: widget, label: widget.toUpperCase(), type, widget, options });

describe('le repli de chaque saisie mobile', () => {
  it('photo : un champ fichier d\'images', () => {
    const html = Engine.renderFieldHtml(champ('photo', 'Attachments'), {});
    assert.match(html, /type="file"/);
    assert.match(html, /accept="image\/\*"/);
    assert.match(html, /data-widget="photo"/);
  });
  it('audio : un champ fichier de sons, un seul enregistrement par défaut', () => {
    const html = Engine.renderFieldHtml(champ('audio', 'Attachments'), {});
    assert.match(html, /type="file"/);
    assert.match(html, /accept="audio\/\*"/);
    assert.match(html, /data-widget="audio"/);
    assert.match(html, /Jusqu’à 1 fichier/);
  });
  it('voix : une zone de texte, où la personne écrit ou colle ce qu\'elle a dit', () => {
    const html = Engine.renderFieldHtml(champ('voix', 'Text'), { voix: 'Fissure à gauche' });
    assert.match(html, /<textarea/);
    assert.match(html, /Fissure à gauche/);
  });
  it('scan : un champ texte, où la personne tape le code', () => {
    const html = Engine.renderFieldHtml(champ('scan', 'Text'), { scan: 'AB-123' });
    assert.match(html, /<input class="fr-input" type="text"/);
    assert.match(html, /value="AB-123"/);
  });
  it('les options de l\'auteur l\'emportent sur les valeurs par défaut du widget', () => {
    const photo = Engine.renderFieldHtml(champ('photo', 'Attachments', { accept: 'image/png', maxFiles: 2 }), {});
    assert.match(photo, /accept="image\/png"/);
    assert.match(photo, /Jusqu’à 2 fichiers/);
    const audio = Engine.renderFieldHtml(champ('audio', 'Attachments', { maxFiles: 3 }), {});
    assert.match(audio, /Jusqu’à 3 fichiers/);
  });
  it('le rendu ne modifie jamais le champ de l\'auteur : le FormDef reste ce qu\'il était', () => {
    const photo = champ('photo', 'Attachments');
    const audio = champ('audio', 'Attachments', { maxFiles: 3 });
    const avant = JSON.stringify([photo, audio]);
    Engine.renderFieldHtml(photo, {});
    Engine.renderFieldHtml(audio, {});
    assert.equal(JSON.stringify([photo, audio]), avant);
    assert.equal(photo.options, undefined, 'les valeurs par défaut ne s\'écrivent pas dans le champ');
    Object.freeze(photo); Object.freeze(audio);
    assert.doesNotThrow(() => { 'use strict'; Engine.renderFieldHtml(photo, {}); Engine.renderFieldHtml(audio, {}); });
  });
  it('le libellé est échappé, comme pour tout champ', () => {
    const html = Engine.renderFieldHtml({ colId: 'p', label: '<img src=x onerror=alert(1)>', type: 'Attachments', widget: 'photo' }, {});
    assert.ok(!html.includes('<img'));
  });
  it('un champ fichier ordinaire n\'a pas changé', () => {
    const html = Engine.renderFieldHtml({ colId: 'f', label: 'F', type: 'Attachments', widget: 'file' }, {});
    assert.match(html, /data-widget="file"/);
    assert.doesNotMatch(html, /accept=/);
  });
});

describe('sur un appareil tactile : prise de vue et enregistreur du système', () => {
  function surTactile(fn) {
    const avant = global.window;
    global.window = { matchMedia: () => ({ matches: true }) };
    try { return fn(); } finally { if (avant === undefined) delete global.window; else global.window = avant; }
  }
  it('audio : un bouton « Enregistrer un son » qui porte capture, même nom que le champ', () => {
    const html = surTactile(() => Engine.renderFieldHtml(champ('audio', 'Attachments'), {}));
    assert.match(html, /<input[^>]*accept="audio\/\*"[^>]*capture/);
    assert.match(html, /Enregistrer un son/);
    assert.equal((html.match(/name="audio"/g) || []).length, 2, 'le sélecteur et l\'enregistreur portent le même nom');
  });
  it('photo : la prise de vue (capture=environment), comme pour un champ fichier d\'images', () => {
    const html = surTactile(() => Engine.renderFieldHtml(champ('photo', 'Attachments'), {}));
    assert.match(html, /capture="environment"/);
    assert.match(html, /Prendre une photo/);
  });
  it('audio sur ordinateur : pas de bouton d\'enregistrement, le sélecteur suffit', () => {
    const html = Engine.renderFieldHtml(champ('audio', 'Attachments'), {});
    assert.doesNotMatch(html, /capture/);
    assert.doesNotMatch(html, /Enregistrer un son/);
  });
  it('photo sur ordinateur : pas de second bouton, capture n\'y a pas d\'effet', () => {
    assert.doesNotMatch(Engine.renderFieldHtml(champ('photo', 'Attachments'), {}), /capture/);
  });
  it('un champ audio d\'images n\'a pas de bouton photo ; un champ fichier n\'a pas d\'enregistreur', () => {
    const fichier = surTactile(() => Engine.renderFieldHtml({ colId: 'f', label: 'F', type: 'Attachments', widget: 'file' }, {}));
    assert.doesNotMatch(fichier, /Enregistrer un son/);
    const audio = surTactile(() => Engine.renderFieldHtml(champ('audio', 'Attachments'), {}));
    assert.doesNotMatch(audio, /Prendre une photo/);
  });
});

describe('les fichiers d\'un champ photo ou audio sont relus, comme ceux d\'un champ fichier', () => {
  it('les deux champs de même nom se lisent ensemble : sélection et enregistreur', () => {
    const avant = global.window;
    global.window = { matchMedia: () => ({ matches: true }) };
    try {
      const root = createRoot();
      const h = Engine.monter(root, def([champ('audio', 'Attachments')]), {});
      const champs = root.querySelectorAll('input[type="file"][name="audio"]');
      assert.equal(champs.length, 2);
      champs[1].files = [{ name: 'enregistrement.m4a' }];
      h.valider();
      assert.deepEqual(h.valeurs().audio, [{ name: 'enregistrement.m4a' }]);
    } finally { if (avant === undefined) delete global.window; else global.window = avant; }
  });
  function monterAvec(champs) {
    const root = createRoot();
    const h = Engine.monter(root, def(champs), {});
    return { root, h };
  }
  it('photo : le fichier choisi arrive à la valeur du formulaire', () => {
    const { root, h } = monterAvec([champ('photo', 'Attachments')]);
    root.querySelector('input[type="file"][name="photo"]').files = [{ name: 'fissure.jpg' }];
    h.valider();
    assert.deepEqual(h.valeurs().photo, [{ name: 'fissure.jpg' }]);
  });
  it('audio : de même', () => {
    const { root, h } = monterAvec([champ('audio', 'Attachments')]);
    root.querySelector('input[type="file"][name="audio"]').files = [{ name: 'constat.webm' }];
    h.valider();
    assert.deepEqual(h.valeurs().audio, [{ name: 'constat.webm' }]);
  });
  it('file : comme avant', () => {
    const { root, h } = monterAvec([champ('file', 'Attachments')]);
    root.querySelector('input[type="file"][name="file"]').files = [{ name: 'a.pdf' }];
    h.valider();
    assert.deepEqual(h.valeurs().file, [{ name: 'a.pdf' }]);
  });
  it('rien de choisi : pas une chaîne vide, mais null (une colonne de pièces jointes n\'a pas de texte)', () => {
    const { h } = monterAvec([champ('photo', 'Attachments')]);
    h.valider();
    assert.equal(h.valeurs().photo, null);
  });
  it('voix et scan se lisent comme du texte', () => {
    const { root, h } = monterAvec([champ('voix', 'Text'), champ('scan', 'Text')]);
    root.querySelector('[name="voix"]').value = 'dictée';
    root.querySelector('[name="scan"]').value = 'AB-123';
    h.valider();
    assert.equal(h.valeurs().voix, 'dictée');
    assert.equal(h.valeurs().scan, 'AB-123');
  });
});

describe('un champ obligatoire de photo', () => {
  it('sans fichier, le formulaire n\'est pas valide', () => {
    const root = createRoot();
    const h = Engine.monter(root, def([Object.assign(champ('photo', 'Attachments'), { required: true })]), {});
    const r = h.valider();
    assert.equal(r.ok, false);
    assert.deepEqual(r.manquants.length, 1);
  });
  it('avec un fichier, il l\'est', () => {
    const root = createRoot();
    const h = Engine.monter(root, def([Object.assign(champ('photo', 'Attachments'), { required: true })]), {});
    root.querySelector('input[type="file"][name="photo"]').files = [{ name: 'p.jpg' }];
    assert.equal(h.valider().ok, true);
  });
});
