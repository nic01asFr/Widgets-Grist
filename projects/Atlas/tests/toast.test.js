/**
 * Le message éphémère montre du texte : un nom de couche venu d'une scène n'y devient pas une balise.
 * node --test projects/Atlas/tests/toast.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creerToast } from '../lib/toast.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Un document minimal : assez pour voir ce que `creerToast` pose, et surtout ce qu'il n'écrit pas en HTML. */
function faussesDoc() {
  const creer = (nom) => {
    const el = {
      nom, className: '', enfants: [], _texte: '',
      set textContent(v) { this._texte = String(v); },
      get textContent() { return this._texte + this.enfants.map((e) => e.textContent).join(''); },
      append(...n) { this.enfants.push(...n); },
      attributs: {}, setAttribute(k, v) { this.attributs[k] = String(v); },
    };
    Object.defineProperty(el, 'innerHTML', { set() { throw new Error('innerHTML interdit'); }, get() { throw new Error('innerHTML interdit'); } });
    return el;
  };
  return { createElement: creer, createElementNS: (ns, nom) => Object.assign(creer(nom), { ns }) };
}

/** Un document sans DOM vectoriel : l'icône retombe sur un signe en texte. */
function fausseDocSansSvg() {
  const d = faussesDoc(); delete d.createElementNS; return d;
}

describe('creerToast', () => {
  it('le message est posé comme texte, jamais comme HTML', () => {
    const el = creerToast(faussesDoc(), `Couche non chargée : <img src=x onerror="top.x=1">`, 'warning');
    assert.equal(el.enfants[1].textContent, `Couche non chargée : <img src=x onerror="top.x=1">`);
    const icone = el.enfants[0];
    assert.equal(icone.nom, 'svg'); assert.equal(icone.ns, 'http://www.w3.org/2000/svg'); assert.equal(icone.attributs.class, 'toast-ic');
    assert.equal(icone.enfants[0].nom, 'path'); assert.match(icone.enfants[0].attributs.d, /^M12 3 2 20h20z/, 'le tracé est fixe : celui de l avertissement');
    assert.equal(el.className, 'toast warning');
  });

  it('un type inconnu ne se retrouve pas dans la classe', () => {
    const el = creerToast(faussesDoc(), 'x', 'a b"onclick=1');
    assert.equal(el.className, 'toast info');
  });

  it('un message absent donne une chaîne vide', () => {
    assert.equal(creerToast(faussesDoc(), undefined).enfants[1].textContent, '');
  });

  it('un nom de propriété de prototype n’est pas un type', () => {
    assert.equal(creerToast(faussesDoc(), 'x', 'constructor').className, 'toast info');
  });
});

describe('showToast dans app_v7.js', () => {
  it('passe par creerToast et n’écrit aucun HTML', () => {
    const app = fs.readFileSync(path.join(RACINE, 'app_v7.js'), 'utf8');
    const debut = app.indexOf('function showToast(');
    assert.ok(debut > 0, 'showToast introuvable');
    const corps = app.slice(debut, debut + app.slice(debut).search(/\r?\n}\r?\n/));
    assert.match(corps, /creerToast\(document, msg, type\)/);
    assert.doesNotMatch(corps, /innerHTML|insertAdjacentHTML|outerHTML/);
  });
});

describe('icone du message', () => {
  it('chaque type a son tracé fixe, jamais un texte du message', () => {
    const traces = new Set();
    for (const type of ['success', 'warning', 'error', 'info']) {
      const el = creerToast(faussesDoc(), '<script>alert(1)</script>', type);
      const d = el.enfants[0].enfants[0].attributs.d; assert.match(d, /^M[0-9 .a-z-]+$/i); traces.add(d);
    }
    assert.equal(traces.size, 4);
  });
  it('sans DOM vectoriel : un signe en texte, pas un emoji', () => {
    const el = creerToast(fausseDocSansSvg(), 'x', 'error');
    assert.equal(el.enfants[0].textContent, '✕');
  });
});
