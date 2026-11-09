/*
 * « Utiliser ma position » selon l'hôte. Dans un widget Grist, l'iframe refuse la position (mesuré) : un bouton qui
 * échouerait ne se promet pas. Mais SEULEMENT quand un hôte est passé : sans lui, le bouton est celui d'avant.
 */
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../runtime/engine.js');
const { createRoot } = require('./helpers/fake-dom.js');

const flush = () => new Promise((resolve) => setTimeout(() => setImmediate(resolve), 5));
async function laisser(n) { for (let i = 0; i < (n || 4); i++) await flush(); }

const geo = (options) => ({ colId: 'Lieu', label: 'Où ?', type: 'Text', widget: 'geo', kind: 'geometrie', options: Object.assign({ geometrie: 'Point' }, options) });
const def = (champ) => ({ manifest_version: '1.0.0', id: 'x', title: 'X', tableId: 'T', composeMode: 'bind', choices: {}, sections: [{ id: 's', label: 'S', fields: [champ || geo()] }] });
const hote = (capacites) => ({ contrat: 'hote-capacites-0.1', nom: 'test', capacites });
const bouton = (root) => root.querySelector('.fr-geo__ici');
function monter(options, champ) {
  const root = createRoot();
  const h = Engine.monter(root, def(champ), options);
  return { root, h };
}

describe('sans hôte : le bouton est celui d\'avant', () => {
  it('carte seule (le cas courant)', () => {
    assert.ok(bouton(monter({}).root));
  });
  it('carte et adresse', () => {
    assert.ok(bouton(monter({}, geo({ saisieLieu: 'les-deux' })).root));
  });
  it('adresse seule', () => {
    assert.ok(bouton(monter({}, geo({ saisieLieu: 'adresse' })).root));
  });
  it('un hôte non conforme est ignoré : le bouton reste', () => {
    const h = hote({ position: false }); h.cle = 'sk-secret';
    Engine.definirJournal(() => {});
    try { assert.ok(bouton(monter({ hote: h }).root)); } finally { Engine.definirJournal(); }
  });
});

describe('avec un hôte qui offre la position', () => {
  it('le bouton reste, et aucun message ne parle d\'indisponibilité', () => {
    const { root } = monter({ hote: hote({ position: true }) });
    assert.ok(bouton(root));
    assert.doesNotMatch(root.innerHTML, /n’est pas disponible ici|refusé la position/);
  });
});

describe('avec un hôte qui ne l\'offre pas (un widget Grist, par exemple)', () => {
  it('pas de bouton qui échouerait, et on le dit', () => {
    const { root } = monter({ hote: hote({}) });
    assert.equal(bouton(root), null);
    assert.match(root.innerHTML, /La position de l’appareil n’est pas disponible ici/);
    assert.doesNotMatch(root.innerHTML, /Utiliser ma position/);
  });
  it('position déclarée à faux : de même', () => {
    assert.equal(bouton(monter({ hote: hote({ position: false }) }).root), null);
  });
  it('le point reste saisissable : carte, et saisie à la main', () => {
    const { root } = monter({ hote: hote({ position: false }) });
    assert.match(root.innerHTML, /data-carte-de="Lieu"/);
    assert.ok(root.querySelector('input[name="Lieu"]'), 'le champ des coordonnées reste');
    assert.match(root.innerHTML, /Saisir les coordonnées à la main/);
  });
  it('en carte et adresse, comme en adresse seule : le bouton disparaît aussi', () => {
    assert.equal(bouton(monter({ hote: hote({}) }, geo({ saisieLieu: 'les-deux' })).root), null);
    assert.equal(bouton(monter({ hote: hote({}) }, geo({ saisieLieu: 'adresse' })).root), null);
  });
  it('seul le widget geo est concerné', () => {
    const { root } = monter({ hote: hote({}) }, { colId: 'T', label: 'T', type: 'Text', widget: 'text' });
    assert.doesNotMatch(root.innerHTML, /position de l’appareil/);
  });
  it('le message ne donne rien d\'autre que la phrase : pas de clé, pas d\'adresse', () => {
    const { root } = monter({ hote: hote({}) });
    assert.doesNotMatch(root.innerHTML, /sk-|https?:\/\//);
  });
});

describe('un refus de la personne se retient pour la séance', () => {
  const garde = {};
  afterEach(() => {
    if (garde.nav) Object.defineProperty(globalThis, 'navigator', garde.nav); else delete globalThis.navigator;
    garde.nav = undefined;
  });
  function poserGeolocalisation(refuse) {
    garde.nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true, writable: true,
      value: { geolocation: { getCurrentPosition: (ok, ko) => { if (refuse) ko({ code: 1 }); else ok({ coords: { longitude: 5.37, latitude: 43.29, accuracy: 12 } }); } } }
    });
  }

  it('position refusée avec un hôte : le message d\'avant, puis plus de bouton au prochain affichage', async () => {
    poserGeolocalisation(true);
    const { root, h } = monter({ hote: hote({ position: true }) });
    bouton(root).dispatchEvent('click');
    await laisser();
    assert.match(root.querySelector('.fr-geo__etat').textContent, /Position refusée ou indisponible/);
    h.rendre(); await laisser();
    assert.equal(bouton(root), null);
    assert.match(root.innerHTML, /Vous avez refusé la position de l’appareil/);
  });
  it('position acceptée : le bouton reste', async () => {
    poserGeolocalisation(false);
    const { root, h } = monter({ hote: hote({ position: true }) });
    bouton(root).dispatchEvent('click'); await laisser();
    h.rendre(); await laisser();
    assert.ok(bouton(root));
  });
  it('SANS hôte, un refus ne change rien : le bouton reste, comme avant', async () => {
    poserGeolocalisation(true);
    const { root, h } = monter({});
    bouton(root).dispatchEvent('click'); await laisser();
    h.rendre(); await laisser();
    assert.ok(bouton(root), 'sans hôte, aucun comportement nouveau');
  });
});
