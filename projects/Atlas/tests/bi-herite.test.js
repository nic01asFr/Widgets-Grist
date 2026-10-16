/**
 * La carte hérite du style de la page (lib/bi/herite.js) : lecture des variables CSS d'Atlas et des systèmes de design, de la couleur du texte, du fond,
 * de la police ; ramené à une charte ordinaire ; relue quand la page change de thème ; contrôlé par la charte (contrastes dits).
 * node --test projects/Atlas/tests/bi-herite.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { installerPont } from '../lib/bi/liaison.js';
import { lireStyleHote, charteDepuisStyle, charteHerite, familleDepuisPile, VARIABLES } from '../lib/bi/herite.js';
import { resoudre } from '../lib/charte/resolution.js';
import { carteSimulee, reseau, MANIFESTE, DONNEES } from './aide-carte-bi.js';

/** Une page factice : un arbre d'éléments avec leurs styles calculés ; `variables` s'héritent comme en CSS. */
function page(chaine) {
  // chaine : du plus profond au plus haut ; chaque nœud { color, backgroundColor, fontFamily, variables, accentColor }
  const noeuds = chaine.map((n) => ({ ...n, parentElement: null }));
  noeuds.forEach((n, i) => { n.parentElement = noeuds[i + 1] || null; });
  const calcule = (el) => {
    const variables = {}; for (let e = el; e; e = e.parentElement) for (const [k, v] of Object.entries(e.variables || {})) if (!(k in variables)) variables[k] = v;
    return { color: el.color || 'rgb(0, 0, 0)', backgroundColor: el.backgroundColor || 'rgba(0, 0, 0, 0)', fontFamily: el.fontFamily || 'serif', accentColor: el.accentColor || 'auto', getPropertyValue: (k) => variables[k] || '' };
  };
  return { element: noeuds[0], fenetre: { getComputedStyle: calcule } };
}
const sans = (extra = {}) => ({ color: 'rgb(31, 27, 20)', fontFamily: 'Marianne, Arial, sans-serif', ...extra });

test('familleDepuisPile : la famille admise la plus proche, jamais une police distante', () => {
  const f = (p) => familleDepuisPile(p).famille;
  assert.equal(f('Marianne, Arial, sans-serif'), 'sans'); assert.equal(f('Georgia, serif'), 'serif'); assert.equal(f('"Times New Roman", Times, serif'), 'serif');
  assert.equal(f('Consolas, monospace'), 'mono'); assert.equal(f('"Atkinson Hyperlegible", sans-serif'), 'lisible');
  assert.equal(f('"Police Maison", sans-serif'), 'sans', 'police inconnue : le générique de la pile décide');
  assert.equal(f('"Police Maison", serif'), 'serif'); assert.equal(f('"Police Maison"'), 'systeme'); assert.equal(f(''), 'systeme'); assert.equal(f(undefined), 'systeme');
  assert.equal(f('system-ui'), 'systeme');
});

test('convention : les variables --atlas-* posées par l\'hôte priment sur tout', () => {
  const p = page([sans({ variables: { '--atlas-principal': '#0b6e4f', '--atlas-fond': '#fafaf5', '--atlas-encre': '#10201a', '--atlas-secondaire': 'rgb(20, 60, 90)', '--atlas-police': 'serif', '--primary': '#ff0000' } })]);
  const lu = lireStyleHote(p.element, { fenetre: p.fenetre });
  assert.deepEqual(lu.graines, { principal: '#0b6e4f', secondaire: '#143c5a', fond: '#fafaf5', encre: '#10201a' });
  assert.equal(lu.famille, 'serif'); assert.equal(lu.sombre, false); assert.ok(lu.notes.some((n) => /--atlas-principal/.test(n)));
});

test('systèmes de design : la couleur principale est prise dans les variables usuelles, dans l\'ordre ; jamais la couleur d\'un lien', () => {
  const dsfr = page([sans({ variables: { '--background-action-high-blue-france': '#000091' } })]);
  assert.equal(lireStyleHote(dsfr.element, { fenetre: dsfr.fenetre }).graines.principal, '#000091');
  const bs = page([sans({ variables: { '--bs-primary': 'rgb(13, 110, 253)', '--accent': '#111111' } })]);
  assert.equal(lireStyleHote(bs.element, { fenetre: bs.fenetre }).graines.principal, '#111111', 'l\'ordre de VARIABLES.principal fait foi (--accent avant --bs-primary)');
  const acc = page([sans({ accentColor: 'rgb(200, 30, 90)' })]);
  assert.equal(lireStyleHote(acc.element, { fenetre: acc.fenetre }).graines.principal, '#c81e5a');
  const rien = page([sans()]);
  assert.equal(lireStyleHote(rien.element, { fenetre: rien.fenetre }).graines.principal, undefined, 'rien de trouvé : la couleur d\'Atlas reste');
  assert.ok(VARIABLES.principal[0] === '--atlas-principal');
});

test('encre et fond calculés : le premier fond opaque en remontant les ancêtres ; blanc par défaut, et dit', () => {
  const p = page([sans({ color: 'rgb(240, 240, 240)' }), { backgroundColor: 'rgba(0, 0, 0, 0)' }, { backgroundColor: 'rgb(18, 24, 32)' }, { backgroundColor: 'rgb(255, 0, 0)' }]);
  const lu = lireStyleHote(p.element, { fenetre: p.fenetre });
  assert.equal(lu.graines.fond, '#121820'); assert.equal(lu.graines.encre, '#f0f0f0'); assert.equal(lu.sombre, true, 'fond sombre reconnu');
  const sansFond = page([sans(), { backgroundColor: 'rgba(0, 0, 0, 0)' }]);
  const l2 = lireStyleHote(sansFond.element, { fenetre: sansFond.fenetre });
  assert.equal(l2.graines.fond, '#ffffff'); assert.ok(l2.notes.some((n) => /blanc par défaut/.test(n)));
  const translucide = page([sans({ backgroundColor: 'rgba(255, 255, 255, 0.3)' }), { backgroundColor: 'rgb(10, 10, 10)' }]);
  assert.equal(lireStyleHote(translucide.element, { fenetre: translucide.fenetre }).graines.fond, '#0a0a0a', 'un fond trop translucide n\'est pas un fond');
});

test('valeurs illisibles : écartées et dites ; une valeur nommée passe par la sonde', () => {
  const p = page([sans({ variables: { '--atlas-principal': 'beaucoup de bleu', '--atlas-police': 'comic' } })]);
  const lu = lireStyleHote(p.element, { fenetre: p.fenetre, resoudre: () => null });
  assert.equal(lu.graines.principal, undefined); assert.ok(lu.ignore.some((i) => /--atlas-principal/.test(i)) && lu.ignore.some((i) => /--atlas-police/.test(i)));
  const nomme = page([sans({ variables: { '--atlas-principal': 'rebeccapurple' } })]);
  const l2 = lireStyleHote(nomme.element, { fenetre: nomme.fenetre, resoudre: (v) => (v === 'rebeccapurple' ? 'rgb(102, 51, 153)' : null) });
  assert.equal(l2.graines.principal, '#663399');
  assert.equal(lireStyleHote(null).graines.principal, undefined); assert.ok(lireStyleHote(null).ignore.length);
});

test('la charte produite est ordinaire : le composant la résout, mesure ses contrastes et dit ce qui ne va pas', () => {
  const p = page([sans({ variables: { '--atlas-principal': '#f2c200', '--atlas-fond': '#ffffff' } })]);
  const charte = charteHerite(p.element, { fenetre: p.fenetre });
  assert.equal(charte.version, 'atlas-charte/0.1'); assert.equal(charte.graines.principal, '#f2c200'); assert.equal(charte.texte.famille, 'sans');
  const r = resoudre({ hote: charte });
  assert.equal(r.charte.graines.principal, '#f2c200'); assert.equal(r.charte.texte.famille, 'sans'); assert.deepEqual(r.ignore, [], 'rien d\'écarté par la charte');
  assert.equal(charteDepuisStyle({ graines: {}, famille: null }).texte, undefined);
});

// ---- l'élément ----
class Elt {
  constructor() { this._attrs = new Map(); this.style = {}; this.enfants = []; this._ecouteurs = new Map(); this.isConnected = true; this.blocs = []; this.parentElement = null; }
  getAttribute(n) { return this._attrs.has(n) ? this._attrs.get(n) : null; }
  hasAttribute(n) { return this._attrs.has(n); }
  setAttribute(n, v) { this._attrs.set(n, String(v)); }
  appendChild(c) { this.enfants.push(c); c.parent = this; return c; }
  remove() { if (this.parent) this.parent.enfants = this.parent.enfants.filter((x) => x !== this); }
  addEventListener(t, f) { if (!this._ecouteurs.has(t)) this._ecouteurs.set(t, []); this._ecouteurs.get(t).push(f); }
  dispatchEvent(e) { for (const f of this._ecouteurs.get(e.type) || []) f(e); return true; }
  querySelectorAll(sel) { return sel === 'script' ? this.blocs : []; }
}
const R = reseau({ origineHote: 'https://hote.test', origineAtlas: 'https://atlas.test' });
let styleCourant = { fond: 'rgb(255, 255, 255)', encre: 'rgb(31, 27, 20)', principal: '#0b6e4f' };
const observateurs = [];
globalThis.HTMLElement = Elt;
globalThis.window = Object.assign(R.hote, { getComputedStyle: (el) => ({ color: styleCourant.encre, backgroundColor: styleCourant.fond, fontFamily: 'Marianne, sans-serif', accentColor: 'auto', getPropertyValue: (k) => (k === '--atlas-principal' ? styleCourant.principal : '') }) });
globalThis.location = { origin: 'https://hote.test', href: 'https://hote.test/page.html' };
globalThis.document = { createElement: () => { const c = new Elt(); c.contentWindow = R.atlasVuDeLHote; return c; }, documentElement: new Elt(), body: new Elt() };
globalThis.CustomEvent = class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
globalThis.MutationObserver = class { constructor(cb) { this.cb = cb; this.actif = true; observateurs.push(this); } observe() {} disconnect() { this.actif = false; } };
const definis = new Map(); globalThis.customElements = { get: (n) => definis.get(n), define: (n, c) => definis.set(n, c) };
const { AtlasBi } = await import('../lib/bi/atlas-bi-element.js');

async function connecte(attrs) {
  const rt = attacher(carteSimulee());
  const liaison = installerPont(rt, { cible: R.hoteVuDeAtlas, fenetre: R.atlas, autorisees: ['https://hote.test'] });
  const e = new AtlasBi(); e.setAttribute('src', 'https://atlas.test/index.html');
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  const vus = []; for (const t of ['atlas-bi-configure', 'atlas-bi-herite', 'atlas-bi-erreur']) e.addEventListener(t, (ev) => vus.push([t, ev.detail]));
  e.connectedCallback(); liaison.annoncer(); await e.pret;
  return { e, rt, vus };
}

test('élément charte="herite" : la charte vient de la page, la bulle et les couleurs la suivent, ce qui a été lu est dit', async () => {
  styleCourant = { fond: 'rgb(255, 255, 255)', encre: 'rgb(31, 27, 20)', principal: '#0b6e4f' };
  const { e, rt } = await connecte({ charte: 'herite', manifeste: 'x' });
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ ...MANIFESTE, layers: [{ ...MANIFESTE.layers[0], geojson: { type: 'FeatureCollection', features: DONNEES.sites } }] }) });
  const r = await e.reconfigurer();
  assert.ok(r.charte, 'setTheme appliqué'); assert.equal(r.herite.sombre, false); assert.ok(r.herite.notes.some((n) => /principal : #0b6e4f/.test(n)));
  assert.equal(rt.api.getTheme().charte.graines.principal, '#0b6e4f');
  e.disconnectedCallback();
});

test('élément : le thème de la page change (mode sombre) -> la charte est relue et renvoyée ; rien si rien n\'a changé', async () => {
  styleCourant = { fond: 'rgb(255, 255, 255)', encre: 'rgb(31, 27, 20)', principal: '#0b6e4f' };
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify(MANIFESTE) });
  const { e, rt, vus } = await connecte({ charte: 'herite', fond: 'uni' });
  await e.reconfigurer();
  const veille = observateurs.filter((o) => o.actif); assert.ok(veille.length >= 1, 'la page est surveillée');
  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
  veille[veille.length - 1].cb(); await attendre(350);
  assert.equal(vus.filter((v) => v[0] === 'atlas-bi-herite').length, 0, 'aucun changement : rien renvoyé');
  styleCourant = { fond: 'rgb(18, 24, 32)', encre: 'rgb(240, 240, 240)', principal: '#5fd0a5' };
  veille[veille.length - 1].cb(); await attendre(350);
  const ev = vus.filter((v) => v[0] === 'atlas-bi-herite'); assert.equal(ev.length, 1);
  assert.equal(ev[0][1].charge.herite.sombre, true);
  assert.equal(vus.filter((v) => v[0] === 'atlas-bi-erreur').length, 0, 'le fond de plan déclaré est ré-appliqué sans erreur après le changement de charte'); assert.equal(rt.api.getTheme().charte.graines.fond, '#121820'); assert.equal(rt.api.getTheme().charte.graines.principal, '#5fd0a5');
  e.disconnectedCallback(); assert.equal(observateurs.filter((o) => o.actif).length, 0, 'la veille s\'arrête avec l\'élément');
});

test('élément : charte="herite" avec un bloc data-atlas="charte" est refusé (une seule source)', async () => {
  const { e, vus } = await connecte({ charte: 'herite' });
  e.blocs = [{ getAttribute: (n) => ({ type: 'application/json', 'data-atlas': 'charte' })[n] ?? null, textContent: '{}' }];
  await assert.rejects(e.reconfigurer(), /gardez l'un des deux/);
  e.disconnectedCallback();
});
