'use strict';

/*
 * Le choix d'une proposition de la liste d'adresses, au geste près.
 *
 * Un lecteur d'écran qui active une option n'émet que `click`, sans `mousedown` :
 * si le choix ne se prenait qu'au `mousedown`, cette personne ne pourrait pas
 * choisir. Ici, le `mousedown` empêche seulement le champ de perdre le focus ;
 * le choix se prend au `click`, et une seule fois.
 *
 * Un mini-DOM suffit : `monter` n'a besoin que d'éléments qui se chaînent, qui
 * portent des attributs et qui reçoivent des événements.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Referentiel = require('../shared/referentiel.js');

function element(tag) {
  const el = {
    tagName: tag, id: '', className: '', hidden: false, value: '', textContent: '',
    attrs: {}, children: [], parentNode: null, nextSibling: null, listeners: {},
    ownerDocument: null,
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter((f) => f !== fn); },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    insertBefore(c, ref) {
      c.parentNode = this;
      const i = this.children.indexOf(ref);
      if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
      return c;
    },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; },
    // Vider : `liste.innerHTML = ''`.
    set innerHTML(v) { if (v === '') this.children = []; },
    get innerHTML() { return ''; },
    declencher(type, extra) {
      const ev = Object.assign({ type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }, extra || {});
      (this.listeners[type] || []).slice().forEach((fn) => fn(ev));
      return ev;
    }
  };
  return el;
}

function montage() {
  const doc = { createElement: element };
  const hote = element('div');
  const ligne = element('div');
  const champ = element('input');
  const bouton = element('button');
  const etat = element('p');
  [hote, ligne, champ, bouton, etat].forEach((e) => { e.ownerDocument = doc; });
  hote.appendChild(ligne);
  ligne.appendChild(champ);
  ligne.appendChild(bouton);
  champ.id = 'adr';

  const reponse = {
    type: 'FeatureCollection',
    features: [
      { geometry: { type: 'Point', coordinates: [2.29, 49.89] }, properties: { label: '8 Boulevard du Port 80000 Amiens', postcode: '80000', citycode: '80021', city: 'Amiens', id: 'a1' } },
      { geometry: { type: 'Point', coordinates: [1.83, 50.1] }, properties: { label: 'Rue de l’Hôtel-Dieu 80100 Abbeville', postcode: '80100', citycode: '80001', city: 'Abbeville', id: 'a2' } }
    ]
  };
  const faux = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(reponse) });

  const choisis = [];
  const vue = Referentiel.monter(champ, { source: 'ban', fetch: faux, etat, bouton, hote, onChoisir: (s) => choisis.push(s) });
  return { champ, bouton, vue, choisis, doc, hote, liste: () => hote.children.find((c) => c.tagName === 'ul') };
}

async function avecPropositions() {
  const m = montage();
  m.champ.value = '8 boulevard du Port Amiens';
  m.bouton.declencher('click');
  await new Promise((r) => setTimeout(r, 60));
  const options = m.liste().children;
  assert.equal(options.length, 2, 'deux propositions affichées');
  return { m, options };
}

describe('Référentiel — choisir une proposition', () => {
  it('un click seul choisit : c’est le geste d’un lecteur d’écran', async () => {
    const { m, options } = await avecPropositions();
    options[0].declencher('click');
    assert.equal(m.champ.value, '8 Boulevard du Port 80000 Amiens');
    assert.equal(m.choisis.length, 1);
    assert.equal(m.choisis[0].insee, '80021');
    assert.equal(m.liste().hidden, true, 'la liste se referme');
    m.vue.detruire();
  });

  it('un mousedown seul ne choisit pas, mais garde le focus dans le champ', async () => {
    const { m, options } = await avecPropositions();
    const ev = options[1].declencher('mousedown');
    assert.equal(ev.defaultPrevented, true, 'le champ ne perd pas le focus');
    assert.equal(m.choisis.length, 0, 'rien n’est choisi à ce stade');
    assert.equal(m.liste().hidden, false, 'la liste reste ouverte');
    m.vue.detruire();
  });

  it('mousedown puis click, comme à la souris, ne choisit qu’une fois', async () => {
    const { m, options } = await avecPropositions();
    options[1].declencher('mousedown');
    options[1].declencher('click');
    assert.equal(m.choisis.length, 1);
    assert.equal(m.choisis[0].insee, '80001');
    assert.equal(m.champ.value, 'Rue de l’Hôtel-Dieu 80100 Abbeville');
    m.vue.detruire();
  });
});
