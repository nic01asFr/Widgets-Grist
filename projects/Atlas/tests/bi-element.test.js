/**
 * Élément web <atlas-bi> (lib/bi/atlas-bi-element.js), sur un DOM minimal simulé : construction de l'URL du composant,
 * méthodes du contrat, événements, nettoyage. Les essais dans un vrai navigateur sont décrits dans docs/EXPLOITATION-EXTERNE-BI.md.
 * node --test tests/bi-element.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { installerPont } from '../lib/bi/liaison.js';
import { COMMANDES } from '../lib/bi/pont.js';
import { carteSimulee, reseau, MANIFESTE, DONNEES } from './aide-carte-bi.js';

// ---- DOM minimal, posé AVANT l'import du module (qui choisit sa classe de base à l'import) ----
class ElementFactice {
  constructor() { this._attrs = new Map(); this.style = {}; this.enfants = []; this._ecouteurs = new Map(); this.isConnected = true; }
  getAttribute(n) { return this._attrs.has(n) ? this._attrs.get(n) : null; }
  hasAttribute(n) { return this._attrs.has(n); }
  setAttribute(n, v) { this._attrs.set(n, String(v)); }
  appendChild(c) { this.enfants.push(c); c.parent = this; return c; }
  remove() { if (this.parent) this.parent.enfants = this.parent.enfants.filter((x) => x !== this); }
  addEventListener(t, f) { if (!this._ecouteurs.has(t)) this._ecouteurs.set(t, []); this._ecouteurs.get(t).push(f); }
  dispatchEvent(e) { for (const f of this._ecouteurs.get(e.type) || []) f(e); return true; }
}
const R = reseau({ origineHote: 'https://hote.test', origineAtlas: 'https://atlas.test' });
globalThis.HTMLElement = ElementFactice;
globalThis.window = R.hote;
globalThis.location = { origin: 'https://hote.test', href: 'https://hote.test/page.html' };
globalThis.document = { createElement: () => { const c = new ElementFactice(); c.contentWindow = R.atlasVuDeLHote; return c; } };
globalThis.CustomEvent = class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
const definis = new Map(); globalThis.customElements = { get: (n) => definis.get(n), define: (n, c) => definis.set(n, c) };
const { AtlasBi, urlComposant } = await import('../lib/bi/atlas-bi-element.js');

test('urlComposant : ajoute bi, navbar, mode et hote sans écraser ce que l\'hôte a posé', () => {
  const u = urlComposant('https://atlas.test/index.html', 'https://hote.test', 'https://hote.test/p');
  assert.equal(u.searchParams.get('bi'), '1'); assert.equal(u.searchParams.get('navbar'), 'false'); assert.equal(u.searchParams.get('mode'), 'view'); assert.deepEqual(u.searchParams.getAll('hote'), ['https://hote.test']);
  const v = urlComposant('/atlas/?bi=1&navbar=true&hote=https://hote.test&x=2', 'https://hote.test', 'https://atlas.test/');
  assert.equal(v.origin, 'https://atlas.test'); assert.equal(v.searchParams.get('navbar'), 'true'); assert.deepEqual(v.searchParams.getAll('hote'), ['https://hote.test']); assert.equal(v.searchParams.get('x'), '2');
});

test('l\'élément est enregistré sous <atlas-bi> et expose une méthode par commande', () => {
  assert.equal(definis.get('atlas-bi'), AtlasBi);
  for (const cmd of Object.keys(COMMANDES)) assert.equal(typeof AtlasBi.prototype[cmd], 'function', cmd);
});

test('élément : connexion, setScene, événements (gestes seulement par défaut), déconnexion', async () => {
  const rt = attacher(carteSimulee());
  const liaison = installerPont(rt, { cible: R.hoteVuDeAtlas, fenetre: R.atlas, autorisees: ['https://hote.test'] });
  const el = new AtlasBi(); el.setAttribute('src', 'https://atlas.test/index.html');
  const vus = []; for (const t of ['atlas-bi-pret', 'atlas-bi-select', 'atlas-bi-filter']) el.addEventListener(t, (e) => vus.push([t, e.detail]));
  el.connectedCallback();
  const cadre = el.enfants[0]; assert.equal(cadre.title, 'Carte'); assert.equal(el.client.connecte, false);
  assert.match(cadre.src, /^https:\/\/atlas\.test\/index\.html\?bi=1&navbar=false&mode=view&hote=https%3A%2F%2Fhote\.test$/);
  liaison.annoncer();
  const info = await el.pret; assert.equal(info.version, '0.3'); assert.equal(vus[0][0], 'atlas-bi-pret');
  assert.deepEqual(await el.setScene(MANIFESTE, DONNEES), { sites: 3 });
  await el.setFilter('f-type', ['x']);
  rt._interne.emettre('select', { layer: 'sites', featureId: 2 }, 'utilisateur');
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(vus.filter((v) => v[0] === 'atlas-bi-select').map((v) => v[1].charge.featureId), [2]);
  assert.equal(vus.filter((v) => v[0] === 'atlas-bi-filter').length, 0, 'l\'écho d\'une commande de la page n\'est pas un événement de l\'utilisateur');
  assert.deepEqual(R.joker, []);
  el.disconnectedCallback(); assert.equal(el.enfants.length, 0); assert.equal(R.hote.ecouteurs.size, 0);
});

test('élément : src manquant ou origine opaque -> erreur claire, pas de iframe', async () => {
  const sans = new AtlasBi(); sans.connectedCallback();
  await assert.rejects(sans.pret, (e) => e.code === 'commande' && /src/.test(e.message)); assert.equal(sans.enfants.length, 0);
  const avant = globalThis.location; globalThis.location = { origin: 'null', href: 'file:///a.html' };
  const opaque = new AtlasBi(); opaque.setAttribute('src', 'https://atlas.test/'); opaque.connectedCallback();
  await assert.rejects(opaque.setScene({}), (e) => e.code === 'origine' && /hote/.test(e.message)); globalThis.location = avant;
});

test('élément : à la mise à niveau (attributs signalés avant connectedCallback) une seule iframe, et un changement de src remonte', async () => {
  const el = new AtlasBi(); el.setAttribute('src', 'https://atlas.test/a.html');
  el.attributeChangedCallback('src', null, 'https://atlas.test/a.html'); el.connectedCallback();
  assert.equal(el.enfants.length, 1); const premier = el.enfants[0];
  el.connectedCallback(); assert.equal(el.enfants.length, 1, 'connectedCallback répété : pas de doublon');
  el.setAttribute('src', 'https://atlas.test/b.html'); el.attributeChangedCallback('src', 'https://atlas.test/a.html', 'https://atlas.test/b.html');
  assert.equal(el.enfants.length, 1); assert.notEqual(el.enfants[0], premier); assert.match(el.enfants[0].src, /^https:\/\/atlas\.test\/b\.html\?bi=1/);
  el.disconnectedCallback(); assert.equal(el.enfants.length, 0);
});
