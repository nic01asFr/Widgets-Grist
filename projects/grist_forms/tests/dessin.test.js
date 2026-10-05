/*
 * dessin.test.js — un canevas qu'on compose n'est pas une illustration.
 *
 * On demande d'entourer le désordre sur une photo, de croquer une implantation,
 * de signer un constat : dans les trois cas la personne produit quelque chose,
 * et ce quelque chose part en pièce jointe.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Dessin = require('../shared/dessin.js');
const Engine = require('../runtime/engine.js');

const def = { manifest_version: '1.0.0', id: 'f', tableId: 'T', composeMode: 'bind', choices: {}, sections: [] };

function champ(dessin) {
  return { colId: 'D', label: 'Votre croquis', type: 'Attachments', widget: 'dessin', options: { dessin } };
}

describe('la signature n’est pas un croquis', () => {
  it('se fait en noir, dans un cadre large, sans palette', () => {
    const r = Dessin.reglages({ usage: 'signature' });
    assert.deepEqual(r.couleurs, ['#161616']);
    assert.equal(r.fondBlanc, true);
    assert.ok(r.hauteur < Dessin.reglages({ usage: 'croquis' }).hauteur);
  });

  it('le croquis propose de quoi distinguer deux choses', () => {
    assert.ok(Dessin.reglages({}).couleurs.length > 1);
  });

  it('ce qu’on précise l’emporte sur l’usage', () => {
    const r = Dessin.reglages({ usage: 'signature', hauteur: 400, trait: 9 });
    assert.equal(r.hauteur, 400);
    assert.equal(r.trait, 9);
  });
});

describe('le rendu de la question', () => {
  it('porte son hôte, son usage et son champ de dépôt', () => {
    const html = Engine.renderFieldHtml(champ({ usage: 'croquis' }), {}, null, def);
    assert.ok(html.includes('data-dessin-de="D"'));
    assert.ok(html.includes('data-usage="croquis"'));
    assert.ok(html.includes('type="file"'), 'le dessin part comme un fichier');
    assert.ok(html.includes('name="D"'));
    assert.ok(html.includes('hidden'), 'le champ de dépôt ne se montre pas');
  });

  it('dit ce qu’on attend, selon l’usage', () => {
    assert.ok(Engine.renderFieldHtml(champ({ usage: 'signature' }), {}, null, def).includes('Signez'));
    assert.ok(Engine.renderFieldHtml(champ({ fond: 'https://x/p.png' }), {}, null, def).includes('sur l’image'));
  });

  it('transporte le fond jusqu’au composant', () => {
    const html = Engine.renderFieldHtml(champ({ fond: 'https://exemple.fr/plan.png' }), {}, null, def);
    assert.ok(html.includes('data-fond="https://exemple.fr/plan.png"'));
  });

  it('rappelle ce qui est déjà joint', () => {
    const html = Engine.renderFieldHtml(champ({}), { D: [12] }, null, def);
    assert.ok(html.includes('dessin #12'));
  });
});

describe('les traits se peignent à n’importe quelle taille', () => {
  it('les coordonnées sont des fractions, pas des pixels', () => {
    const trace = [];
    const ctx = {
      lineCap: '', lineJoin: '', strokeStyle: '', lineWidth: 0,
      beginPath() {}, stroke() {},
      moveTo(x, y) { trace.push(['M', x, y]); },
      lineTo(x, y) { trace.push(['L', x, y]); },
    };
    const traits = [{ couleur: '#000', largeur: 2, points: [[0.5, 0.5], [1, 1]] }];
    Dessin.peindre(ctx, traits, 1000, 400, 1);
    assert.deepEqual(trace, [['M', 500, 200], ['L', 1000, 400]]);
  });

  it('un point posé sans glisser laisse une marque', () => {
    const trace = [];
    const ctx = {
      lineCap: '', lineJoin: '', strokeStyle: '', lineWidth: 0,
      beginPath() {}, stroke() {},
      moveTo(x, y) { trace.push(['M', x, y]); },
      lineTo(x, y) { trace.push(['L', x, y]); },
    };
    Dessin.peindre(ctx, [{ couleur: '#000', largeur: 2, points: [[0.5, 0.5]] }], 100, 100, 1);
    assert.equal(trace.length, 2, 'un trait de longueur nulle ne se dessine pas');
  });

  it('l’épaisseur suit l’échelle d’export, et ne descend jamais sous 1', () => {
    let largeurs = [];
    const ctx = {
      lineCap: '', lineJoin: '', strokeStyle: '',
      set lineWidth(v) { largeurs.push(v); }, get lineWidth() { return 0; },
      beginPath() {}, stroke() {}, moveTo() {}, lineTo() {},
    };
    Dessin.peindre(ctx, [{ couleur: '#000', largeur: 3, points: [[0, 0], [1, 1]] }], 1200, 400, 4);
    assert.deepEqual(largeurs, [12]);
    largeurs = [];
    Dessin.peindre(ctx, [{ couleur: '#000', largeur: 0.1, points: [[0, 0], [1, 1]] }], 100, 100, 0.1);
    assert.deepEqual(largeurs, [1]);
  });
});
