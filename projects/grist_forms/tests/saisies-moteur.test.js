'use strict';

/*
 * Les saisies dans le moteur monté : valeur de départ, bornes, ordre entre deux
 * questions, curseur, compteur, heure. Le module pur (`saisies.test.js`) dit ce
 * que chaque règle décide ; ici on vérifie que le moteur l'applique.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Saisies = require('../shared/saisies.js');
const Engine = require('../runtime/engine.js');
const { createRoot } = require('./helpers/fake-dom.js');

const def = (champs) => ({ id: 'essai', title: 'Essai', tableId: 'T', sections: [{ label: 'S', fields: champs }] });

function monter(champs, bridge) {
  const root = createRoot();
  let envoye = null;
  Engine.mount(root, def(champs), Object.assign({
    skipProbe: true,
    submit: (d) => { envoye = d; return Promise.resolve({ ok: true }); }
  }, bridge || {}));
  return {
    root,
    envoyer: async () => {
      root.querySelector('[data-action="submit"]').dispatchEvent('click');
      await new Promise((r) => setTimeout(r, 10));
      return envoye;
    }
  };
}

describe('Moteur — valeur de départ', () => {
  const date = (extra) => [{ colId: 'D', label: 'Date', type: 'Date', widget: 'date', options: Object.assign({ depart: { source: 'aujourdhui' } }, extra) }];

  it('une date montre le jour même au départ', () => {
    const m = monter(date());
    assert.equal(m.root.querySelector('[name="D"]').value, Saisies.dateLocale(new Date()));
  });

  it('une valeur déjà donnée passe devant le départ', () => {
    const m = monter(date(), { values: { D: '2020-01-02' } });
    assert.equal(m.root.querySelector('[name="D"]').value, '2020-01-02');
  });

  it('en modification d’une ligne, le départ ne s’applique pas', () => {
    const m = monter(date(), { editRowId: 7, values: {} });
    assert.equal(m.root.querySelector('[name="D"]').value, '');
  });

  it('une valeur fixe de départ est montrée', () => {
    const m = monter([{ colId: 'V', label: 'Ville', type: 'Text', widget: 'text', options: { depart: { source: 'valeur', valeur: 'Amiens' } } }]);
    assert.equal(m.root.querySelector('[name="V"]').value, 'Amiens');
  });

  it('la dernière saisie se garde sur l’appareil et revient à l’ouverture suivante', async () => {
    const stock = {};
    global.localStorage = { getItem: (k) => (k in stock ? stock[k] : null), setItem: (k, v) => { stock[k] = String(v); } };
    try {
      const champ = { colId: 'Z', label: 'Zone', type: 'Text', widget: 'text', options: { depart: { source: 'derniere' } } };
      const a = monter([champ]);
      a.root.querySelector('[name="Z"]').value = 'Zone Nord';
      await a.envoyer();
      const b = monter([champ]);
      assert.equal(b.root.querySelector('[name="Z"]').value, 'Zone Nord');
    } finally {
      delete global.localStorage;
    }
  });

  it('sans stockage (refusé, absent), la dernière saisie n’offre rien et ne casse rien', () => {
    delete global.localStorage;
    const m = monter([{ colId: 'Z', label: 'Zone', type: 'Text', widget: 'text', options: { depart: { source: 'derniere' } } }]);
    assert.equal(m.root.querySelector('[name="Z"]').value, '');
  });
});

describe('Moteur — bornes et ordre', () => {
  const nombre = () => [{ colId: 'N', label: 'Gravité', type: 'Int', widget: 'number', options: { min: 1, max: 5 } }];

  it('un nombre hors bornes ne part pas, et la question dit les bornes', async () => {
    const m = monter(nombre());
    m.root.querySelector('[name="N"]').value = '9';
    assert.equal(await m.envoyer(), null);
    assert.match(m.root.querySelector('[data-error-for="N"]').textContent, /entre 1 et 5/);
  });

  it('un nombre dans les bornes part', async () => {
    const m = monter(nombre());
    m.root.querySelector('[name="N"]').value = '3';
    const e = await m.envoyer();
    assert.ok(e);
    assert.equal(e.N, 3);
  });

  it('une question facultative laissée vide n’est pas hors bornes', async () => {
    const m = monter(nombre());
    assert.ok(await m.envoyer());
  });

  it('une date avant le jour même est refusée quand la borne est « aujourdhui »', async () => {
    const m = monter([{ colId: 'D', label: 'Date', type: 'Date', widget: 'date', options: { min: 'aujourdhui' } }]);
    m.root.querySelector('[name="D"]').value = '2020-01-01';
    assert.equal(await m.envoyer(), null);
    assert.match(m.root.querySelector('[data-error-for="D"]').textContent, /précéder/);
  });

  const periode = () => [
    { colId: 'Debut', label: 'Début', type: 'Date', widget: 'date' },
    { colId: 'Fin', label: 'Fin', type: 'Date', widget: 'date', options: { apres: 'Debut' } }
  ];

  it('une fin avant son début est refusée, en nommant la question de début', async () => {
    const m = monter(periode());
    m.root.querySelector('[name="Debut"]').value = '2026-10-10';
    m.root.querySelector('[name="Fin"]').value = '2026-10-01';
    assert.equal(await m.envoyer(), null);
    assert.match(m.root.querySelector('[data-error-for="Fin"]').textContent, /« Début »/);
  });

  it('une fin égale ou postérieure part', async () => {
    const m = monter(periode());
    m.root.querySelector('[name="Debut"]').value = '2026-10-10';
    m.root.querySelector('[name="Fin"]').value = '2026-10-10';
    assert.ok(await m.envoyer());
  });
});

describe('Moteur — curseur, compteur, heure', () => {
  it('un curseur non touché n’écrit rien, et le dit à l’écran', async () => {
    const champ = { colId: 'A', label: 'Avancement', type: 'Int', widget: 'curseur', options: { min: 0, max: 100, presets: [0, 50, 100], unite: '%' } };
    assert.match(Engine.renderFieldHtml(champ, {}, null, def([])), /Pas de réponse/);
    assert.match(Engine.renderFieldHtml(champ, { A: 40 }, null, def([])), /40 %/, 'touché, il affiche sa valeur et son unité');
    const m = monter([champ]);
    const e = await m.envoyer();
    assert.ok(e);
    assert.strictEqual(e.A, null, 'la position de départ n’est pas une réponse');
  });

  it('un curseur touché écrit sa valeur', async () => {
    const m = monter([{ colId: 'A', label: 'Avancement', type: 'Int', widget: 'curseur', options: { min: 0, max: 100 } }]);
    const curs = m.root.querySelector('[name="A"]');
    curs.setAttribute('data-touche', '1');
    curs.value = '75';
    const e = await m.envoyer();
    assert.equal(e.A, 75);
  });

  it('un compteur porte ses bornes, son pas, son unité et ses deux boutons', () => {
    const html = Engine.renderFieldHtml({ colId: 'C', label: 'Quantité', type: 'Int', widget: 'compteur', options: { min: 0, max: 10, step: 2, unite: 'u' } }, {}, null, def([]));
    assert.match(html, /data-delta="-1"/);
    assert.match(html, /data-delta="1"/);
    assert.match(html, /min="0"/);
    assert.match(html, /max="10"/);
    assert.match(html, /step="2"/);
    assert.match(html, /fr-unite">u</);
  });

  it('une heure se saisit en HH:MM (champ « time ») ; « midi » est refusé', async () => {
    const champ = { colId: 'H', label: 'Heure', type: 'Text', widget: 'heure' };
    assert.match(Engine.renderFieldHtml(champ, {}, null, def([])), /type="time"/);
    const m = monter([champ]);
    m.root.querySelector('[name="H"]').value = 'midi';
    assert.equal(await m.envoyer(), null);
    assert.match(m.root.querySelector('[data-error-for="H"]').textContent, /heure/i);
    m.root.querySelector('[name="H"]').value = '12:30';
    const e = await m.envoyer();
    assert.ok(e);
    assert.equal(e.H, '12:30');
  });
});
