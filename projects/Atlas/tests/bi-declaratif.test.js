/**
 * Configuration déclarative de <atlas-bi> (lib/bi/declaratif.js) : lecture des attributs et des blocs, refus des entrées dangereuses ou ambiguës, ordre
 * d'application (charte, fond, scène), et l'élément de bout en bout sur la carte simulée.
 * node --test projects/Atlas/tests/bi-declaratif.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { installerPont } from '../lib/bi/liaison.js';
import { carteSimulee, reseau, MANIFESTE, DONNEES } from './aide-carte-bi.js';

class ElementFactice {
  constructor() { this._attrs = new Map(); this.style = {}; this.enfants = []; this._ecouteurs = new Map(); this.isConnected = true; this.blocs = []; }
  getAttribute(n) { return this._attrs.has(n) ? this._attrs.get(n) : null; }
  hasAttribute(n) { return this._attrs.has(n); }
  setAttribute(n, v) { this._attrs.set(n, String(v)); }
  appendChild(c) { this.enfants.push(c); c.parent = this; return c; }
  remove() { if (this.parent) this.parent.enfants = this.parent.enfants.filter((x) => x !== this); }
  addEventListener(t, f) { if (!this._ecouteurs.has(t)) this._ecouteurs.set(t, []); this._ecouteurs.get(t).push(f); }
  dispatchEvent(e) { for (const f of this._ecouteurs.get(e.type) || []) f(e); return true; }
  querySelectorAll(sel) { return sel === 'script' ? this.blocs : []; }
}
/** Un bloc `<script type="application/json" data-atlas="nom">` factice. */
const bloc = (nom, contenu, type = 'application/json') => ({ getAttribute: (n) => ({ type, 'data-atlas': nom })[n] ?? null, textContent: typeof contenu === 'string' ? contenu : JSON.stringify(contenu) });
const reponse = (corps, ok = true, status = 200) => ({ ok, status, text: async () => (typeof corps === 'string' ? corps : JSON.stringify(corps)) });

const R = reseau({ origineHote: 'https://hote.test', origineAtlas: 'https://atlas.test' });
globalThis.HTMLElement = ElementFactice;
globalThis.window = R.hote;
globalThis.location = { origin: 'https://hote.test', href: 'https://hote.test/page.html' };
globalThis.document = { createElement: () => { const c = new ElementFactice(); c.contentWindow = R.atlasVuDeLHote; return c; } };
globalThis.CustomEvent = class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
const definis = new Map(); globalThis.customElements = { get: (n) => definis.get(n), define: (n, c) => definis.set(n, c) };
const { AtlasBi } = await import('../lib/bi/atlas-bi-element.js');
const { lireConfiguration, lireAdresse, appliquerConfiguration, estVide, LIMITE_OCTETS } = await import('../lib/bi/declaratif.js');

const BASE = 'https://hote.test/page.html';
const el = (attrs = {}, blocs = []) => { const e = new ElementFactice(); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.blocs = blocs; return e; };

test('rien de déclaré : configuration vide, la carte reste pilotée à la main', async () => {
  const c = await lireConfiguration(el(), { base: BASE, lecteur: async () => { throw new Error('ne doit pas lire'); } });
  assert.ok(estVide(c));
});

test('manifeste par adresse : lu par la page, relatif à son adresse, JSON seulement', async () => {
  const vus = [];
  const lecteur = async (u) => { vus.push(u); return reponse(MANIFESTE); };
  const c = await lireConfiguration(el({ manifeste: '/carte/manifeste.json' }), { base: BASE, lecteur });
  assert.deepEqual(vus, ['https://hote.test/carte/manifeste.json']);
  assert.deepEqual(c.manifeste, MANIFESTE);
  assert.ok(!estVide(c));
});

test('manifeste, données et charte en blocs dans l\'élément', async () => {
  const c = await lireConfiguration(el({ fond: 'plan' }, [bloc('manifeste', MANIFESTE), bloc('donnees', DONNEES), bloc('charte', { version: 'atlas-charte/0.1' })]), { base: BASE });
  assert.deepEqual(c.manifeste, MANIFESTE); assert.deepEqual(c.donnees, DONNEES); assert.equal(c.fond, 'plan'); assert.equal(c.charte.version, 'atlas-charte/0.1');
});

test('un bloc d\'un autre type n\'est pas lu (un script exécutable n\'est jamais pris pour une configuration)', async () => {
  const c = await lireConfiguration(el({}, [bloc('manifeste', MANIFESTE, 'text/javascript')]), { base: BASE });
  assert.ok(estVide(c));
});

test('refus : déclaré deux fois, bloc en double, JSON invalide, non objet, fond inconnu, données sans manifeste', async () => {
  const lecteur = async () => reponse(MANIFESTE);
  const echoue = (e, motif) => assert.rejects(lireConfiguration(e, { base: BASE, lecteur }), motif);
  await echoue(el({ manifeste: '/m.json' }, [bloc('manifeste', MANIFESTE)]), /déclaré deux fois/);
  await echoue(el({}, [bloc('manifeste', {}), bloc('manifeste', {})]), /plusieurs blocs/);
  await echoue(el({}, [bloc('manifeste', '{ pas du json')]), /JSON valide/);
  await echoue(el({}, [bloc('manifeste', '[1,2]')]), /objet JSON/);
  await echoue(el({}, [bloc('manifeste', 'null')]), /objet JSON/);
  await echoue(el({ fond: 'degrade' }), /fond « degrade » inconnu/);
  await echoue(el({}, [bloc('donnees', { sites: 'pas des features' })]), /pas une FeatureCollection/);
  await echoue(el({}, [bloc('manifeste', { layers: [{ id: 'a' }, { id: 'b' }] }), bloc('donnees', '[]')]), /2 couches/);
});

test('adresses : seulement http(s), réponse en échec dite, taille bornée', async () => {
  for (const a of ['javascript:alert(1)', 'data:application/json,{}', 'file:///etc/passwd', 'blob:https://x/1']) {
    await assert.rejects(lireAdresse(a, 'manifeste', { base: BASE, lecteur: async () => reponse({}) }), /http\(s\)/, a);
  }
  await assert.rejects(lireAdresse('/m.json', 'manifeste', { base: BASE, lecteur: async () => reponse('', false, 404) }), /réponse 404/);
  await assert.rejects(lireAdresse('/m.json', 'manifeste', { base: BASE, lecteur: async () => { throw new Error('réseau coupé'); } }), /illisible : réseau coupé/);
  await assert.rejects(lireAdresse('/m.json', 'manifeste', { base: BASE, lecteur: async () => reponse(' '.repeat(LIMITE_OCTETS + 1)) }), /dépasse/);
  await assert.rejects(lireAdresse('/m.json', 'manifeste', { base: BASE }), /aucun moyen de lire/);
});

test('ordre d\'application : charte, fond, scène ; l\'étape en échec est nommée', async () => {
  const appels = [];
  const appeler = async (cmd, ...args) => { appels.push(cmd); if (cmd === 'setFond') throw new Error('fond refusé'); return cmd; };
  await assert.rejects(appliquerConfiguration(appeler, { charte: {}, fond: 'plan', manifeste: MANIFESTE }), (e) => e.etape === 'fond' && /fond refusé/.test(e.message));
  assert.deepEqual(appels, ['setTheme', 'setFond'], 'la scène n\'est pas posée sur un fond refusé');
  appels.length = 0;
  const ok = await appliquerConfiguration(async (cmd) => { appels.push(cmd); return cmd; }, { manifeste: MANIFESTE, fond: 'uni', charte: {} });
  assert.deepEqual(appels, ['setTheme', 'setFond', 'setScene', 'fitTo']); assert.deepEqual(Object.keys(ok), ['charte', 'fond', 'scene', 'cadrage']);
});

test('cadrage : automatique par défaut, désactivable, absent quand une couche administrative se cadre seule', async () => {
  const vus = [];
  const appeler = async (cmd) => { vus.push(cmd); return true; };
  await appliquerConfiguration(appeler, { manifeste: MANIFESTE, cadrage: 'aucun' });
  assert.deepEqual(vus, ['setScene'], 'cadrage refusé');
  vus.length = 0;
  await appliquerConfiguration(appeler, { manifeste: { layers: [{ id: 'dep', admin: { niveau: 'departement' } }] } });
  assert.deepEqual(vus, ['setScene'], 'une couche administrative se cadre elle-même');
  vus.length = 0;
  await appliquerConfiguration(appeler, { charte: {} });
  assert.deepEqual(vus, ['setTheme'], 'sans scène, rien à cadrer');
  await assert.rejects(lireConfiguration(el({ cadrage: 'zoom' }), { base: BASE }), /cadrage « zoom » inconnu/);
  assert.equal((await lireConfiguration(el({ cadrage: 'aucun' }), { base: BASE })).cadrage, 'aucun');
});

async function elementConnecte(attrs, blocs, lecteur) {
  globalThis.fetch = lecteur;
  const rt = attacher(carteSimulee());
  const liaison = installerPont(rt, { cible: R.hoteVuDeAtlas, fenetre: R.atlas, autorisees: ['https://hote.test'] });
  const e = new AtlasBi(); e.setAttribute('src', 'https://atlas.test/index.html');
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.blocs = blocs;
  const vus = []; for (const t of ['atlas-bi-configure', 'atlas-bi-erreur']) e.addEventListener(t, (ev) => vus.push([t, ev.detail]));
  e.connectedCallback(); liaison.annoncer(); await e.pret;
  return { e, rt, vus, fin: () => { e.disconnectedCallback(); } };
}

test('élément : sans configuration déclarative, rien n\'est posé et aucun événement de configuration', async () => {
  const { e, vus, fin } = await elementConnecte({}, [], async () => { throw new Error('ne doit pas lire'); });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(await e.configure, null); assert.deepEqual(vus, []); fin();
});

test('élément : des données seules suffisent, le manifeste est inféré et dit', async () => {
  const feats = ['école', 'école', 'mairie', 'école', 'mairie', 'parc'].map((g, i) => ({ type: 'Feature', id: i + 1, properties: { ref: 'R' + i, genre: g }, geometry: { type: 'Point', coordinates: [5.3 + i / 100, 43.3] } }));
  const { e, rt, fin } = await elementConnecte({ donnees: '/sites.geojson' }, [], async () => reponse({ type: 'FeatureCollection', features: feats }));
  const r = await e.configure;
  assert.deepEqual(r.scene, { donnees: 6 });
  assert.ok(r.inference.some((n) => /couleurs par « genre »/.test(n)), 'ce qui a été décidé est dit');
  assert.deepEqual(rt.api.ping().couches, ['donnees']);
  fin();
});

test('élément : manifeste et données en blocs -> la scène est montée sans une ligne de code', async () => {
  const { e, rt, vus, fin } = await elementConnecte({}, [bloc('manifeste', MANIFESTE), bloc('donnees', DONNEES)], async () => { throw new Error('pas de lecture'); });
  const r = await e.configure;
  assert.deepEqual(r.scene, { sites: 3 });
  assert.deepEqual(rt.api.ping().couches, ['sites']);
  assert.equal(vus.filter((v) => v[0] === 'atlas-bi-configure').length, 1); assert.deepEqual(vus.find((v) => v[0] === 'atlas-bi-configure')[1].charge.scene, { sites: 3 });
  fin();
});

test('élément : manifeste par adresse, puis changement d\'attribut = reconfiguration sans remonter l\'iframe', async () => {
  const lus = [];
  const lecteur = async (u) => { lus.push(u); return reponse(u.endsWith('/a.json') ? MANIFESTE : { ...MANIFESTE, layers: [{ ...MANIFESTE.layers[0], id: 'autres' }] }); };
  const { e, rt, fin } = await elementConnecte({ manifeste: '/a.json' }, [], lecteur);
  // données par la couche : le manifeste de l'essai les porte dans `donnees`, ici on vérifie seulement que la scène se pose
  await e.configure; assert.deepEqual(rt.api.ping().couches, ['sites']);
  const cadre = e.enfants[0];
  e.setAttribute('manifeste', '/b.json'); e.attributeChangedCallback('manifeste', '/a.json', '/b.json');
  await e.configure;
  assert.deepEqual(lus, ['https://hote.test/a.json', 'https://hote.test/b.json']);
  assert.deepEqual(rt.api.ping().couches, ['autres']); assert.equal(e.enfants[0], cadre, 'même iframe');
  fin();
});

test('élément : une configuration illisible émet atlas-bi-erreur avec l\'étape, sans casser la connexion', async () => {
  const { e, vus, fin } = await elementConnecte({ manifeste: '/m.json' }, [], async () => reponse('', false, 404));
  await assert.rejects(e.configure, /réponse 404/);
  await new Promise((r) => setTimeout(r, 10));
  const err = vus.find((v) => v[0] === 'atlas-bi-erreur'); assert.ok(err); assert.match(err[1].erreur.message, /404/);
  assert.equal((await e.ping()).version, '0.5', 'la connexion reste utilisable');
  fin();
});
