/**
 * La bulle d'objet déclarée par l'hôte (lib/bi/bulle.js) : validation, contenu en texte seul, ouverture par la sélection, actions qui reviennent à l'hôte,
 * habillage par la charte (lib/charte/interface.js), et le tout branché sur le runtime BI.
 * node --test projects/Atlas/tests/bi-bulle.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { normaliserBulle, contenuBulle, formater, pointAncrage, creerBulle, FEUILLE, CHAMPS_MAX, ACTIONS_MAX } from '../lib/bi/bulle.js';
import { variablesInterface, appliquerVariables } from '../lib/charte/interface.js';
import { resoudre } from '../lib/charte/resolution.js';
import { TOUS_LES_EVENEMENTS } from '../lib/bi/evenements-ext.js';
import { carteSimulee, point } from './aide-carte-bi.js';

// ---- DOM et popup minimaux ----
class Noeud {
  constructor(tag) { this.tag = tag; this.enfants = []; this.attrs = {}; this.style = { props: {}, setProperty(k, v) { this.props[k] = v; } }; this.ecouteurs = {}; this.className = ''; this._texte = ''; this.type = ''; }
  appendChild(c) { this.enfants.push(c); return c; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(t, f) { (this.ecouteurs[t] = this.ecouteurs[t] || []).push(f); }
  declencher(t, e = {}) { for (const f of this.ecouteurs[t] || []) f(e); }
  set textContent(v) { this._texte = String(v); this.enfants = []; }
  get textContent() { return this._texte + this.enfants.map((e) => e.textContent).join(''); }
  trouver(pred, sortie = []) { if (pred(this)) sortie.push(this); for (const e of this.enfants) e.trouver(pred, sortie); return sortie; }
}
function documentFactice() {
  const head = new Noeud('head'); const ids = new Map();
  return { head, createElement: (t) => new Noeud(t), getElementById: (id) => ids.get(id) || null, _ids: ids,
    headAppend: head.appendChild.bind(head) };
}
function docAvecStyle() { const d = documentFactice(); const ajout = d.head.appendChild.bind(d.head); d.head.appendChild = (n) => { if (n.id) d._ids.set(n.id, n); return ajout(n); }; return d; }
function popupFactice() {
  const p = { ouvert: false, contenu: null, lngLat: null, element: new Noeud('div'),
    setLngLat(x) { p.lngLat = x; return p; }, setDOMContent(c) { p.contenu = c; return p; }, addTo() { p.ouvert = true; return p; },
    remove() { p.ouvert = false; return p; }, isOpen: () => p.ouvert, getElement: () => p.element };
  return p;
}
const proprietes = { nom: 'Alpha', commune: 'Aix', effectif: 1200.5, part: 0.256, jour: 1700000000, ref: 'A' };

test('normaliserBulle : rien ou non objet -> pas de bulle ; les entrées invalides sont écartées ET dites', () => {
  assert.deepEqual(normaliserBulle(undefined), { bulle: null, avertissements: [] });
  assert.equal(normaliserBulle('x').bulle, null); assert.match(normaliserBulle([]).avertissements[0], /objet est attendu/);
  const r = normaliserBulle({
    titre: 'nom', surprise: 1, ouverture: 'survol',
    champs: [{ champ: 'commune' }, { champ: '' }, 'x', { champ: 'a', format: 'enorme' }, { champ: 'b' }, { champ: 'c' }, { champ: 'd' }],
    actions: [{ id: 'ok', libelle: 'OK' }, { id: 'ok', libelle: 'Doublon' }, { id: 'mauvais id', libelle: 'X' }, { id: 'b', libelle: '' }, { id: 'c', libelle: 'C', style: 'rouge' }, { id: 'd', libelle: 'D' }, { id: 'e', libelle: 'E' }],
  });
  assert.equal(r.bulle.ouverture, 'clic');
  assert.equal(r.bulle.champs.length, CHAMPS_MAX); assert.deepEqual(r.bulle.champs.map((c) => c.format), ['texte', 'texte', 'texte', 'texte']);
  assert.deepEqual(r.bulle.actions.map((a) => a.id), ['ok', 'c', 'd']); assert.equal(r.bulle.actions.length, ACTIONS_MAX);
  assert.deepEqual(r.bulle.actions.map((a) => a.style), ['principale', 'secondaire', 'secondaire'], 'la première action est la principale par défaut');
  const dit = r.avertissements.join(' | ');
  for (const motif of [/surprise/, /ouverture/, /champs\[1\]/, /champs\[2\]/, /format/, /au plus/, /en double/, /actions\[2\]\.id/, /actions\[3\]/, /style/]) assert.match(dit, motif);
});

test('formater : texte, nombre, pourcent, date ; vide et objets écartés ; valeurs longues coupées', () => {
  assert.equal(formater('Aix'), 'Aix'); assert.equal(formater(null), ''); assert.equal(formater(''), ''); assert.equal(formater({ a: 1 }), '');
  assert.equal(formater(1200.5, 'nombre').replace(/\s/g, ' '), '1 200,5'); assert.equal(formater('12,5', 'nombre'), '12,5');
  assert.equal(formater(0.256, 'pourcent').replace(/\s/g, ' '), '25,6 %');
  assert.equal(formater(1700000000, 'date'), '14/11/2023', 'secondes (Grist)'); assert.equal(formater(1700000000000, 'date'), '14/11/2023', 'millisecondes'); assert.equal(formater('2023-11-14', 'date'), '14/11/2023');
  assert.equal(formater('pas une date', 'date'), 'pas une date'); assert.equal(formater('abc', 'nombre'), 'abc');
  assert.ok(formater('x'.repeat(500)).length <= 200);
});

test('contenuBulle : titre par propriété, par modèle, ou le nom de la couche ; champs vides sautés', () => {
  const b = normaliserBulle({ titre: 'nom', champs: [{ champ: 'commune', libelle: 'Commune' }, { champ: 'absent' }, { champ: 'effectif', format: 'nombre' }] }).bulle;
  const c = contenuBulle(b, proprietes, 'Sites');
  assert.equal(c.titre, 'Alpha'); assert.deepEqual(c.lignes.map((l) => l.libelle), ['Commune', 'effectif']);
  assert.equal(contenuBulle(normaliserBulle({ titre: 'Site {nom} ({commune}) {inconnu}' }).bulle, proprietes).titre, 'Site Alpha (Aix)');
  assert.equal(contenuBulle(normaliserBulle({}).bulle, proprietes, 'Sites').titre, 'Sites');
  assert.equal(contenuBulle(normaliserBulle({ titre: 'nom' }).bulle, null, 'Sites').titre, 'Sites');
});

test('pointAncrage : le point, ou le centre de l\'emprise', () => {
  assert.deepEqual(pointAncrage({ type: 'Point', coordinates: [5, 43] }), [5, 43]);
  assert.deepEqual(pointAncrage({ type: 'LineString', coordinates: [[0, 0], [4, 2]] }), [2, 1]);
  assert.deepEqual(pointAncrage({ type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 0]]] }), [1, 1]);
  assert.equal(pointAncrage(null), null); assert.equal(pointAncrage({ type: 'Polygon', coordinates: [] }), null);
});

test('interface : variables CSS tirées de la charte, valeurs sûres seulement', () => {
  const v = variablesInterface(resoudre({}).charte);
  for (const [k, val] of Object.entries(v)) { assert.match(k, /^--atlas-[a-z-]+$/); assert.equal(typeof val, 'string'); assert.ok(!/[;{}<>]/.test(val.replace(/["',\s\w-]+/g, '')), k + ' : ' + val); }
  assert.equal(v['--atlas-accent'], '#c44536'); assert.equal(v['--atlas-fond'], '#ffffff');
  const hote = variablesInterface(resoudre({ hote: { version: 'atlas-charte/0.1', graines: { principal: '#0b6e4f', fond: '#101820', encre: '#f5f5f5' } } }).charte);
  assert.equal(hote['--atlas-accent'], '#0b6e4f'); assert.equal(hote['--atlas-fond'], '#101820'); assert.equal(hote['--atlas-encre'], '#f5f5f5');
  const el = new Noeud('div'); const noms = appliquerVariables(el, { ...v, 'x-intrus': 'a', '--autre': 'b', '--atlas-ok': 3 });
  assert.ok(noms.includes('--atlas-accent') && !noms.includes('x-intrus') && !noms.includes('--autre') && !noms.includes('--atlas-ok'));
});

test('la feuille de style n\'emploie que des variables de la charte (avec repli) et respecte les animations réduites', () => {
  assert.ok(/var\(--atlas-fond/.test(FEUILLE)); assert.ok(/prefers-reduced-motion: no-preference/.test(FEUILLE));
  assert.ok(!/url\(|@import|expression\(/.test(FEUILLE), 'aucune ressource externe');
});

// ---- le contrôleur ----
function banc(bulleDef = { titre: 'nom', champs: [{ champ: 'commune', libelle: 'Commune' }], actions: [{ id: 'fiche', libelle: 'Ouvrir la fiche' }, { id: 'itineraire', libelle: 'Itinéraire' }] }) {
  const doc = docAvecStyle(), popup = popupFactice(), evts = [], fermees = [];
  const c = { id: 'sites', def: { name: 'Sites', cle: 'ref' }, bulle: normaliserBulle(bulleDef).bulle };
  const f = { id: 7, properties: { ...proprietes }, geometry: { type: 'Point', coordinates: [5.1, 43.2] } };
  const ctl = creerBulle({ map: { nom: 'carte' }, document: doc, creerPopup: () => popup, emettre: (t, ch, o) => evts.push([t, ch, o]), variables: () => ({ '--atlas-fond': '#fff' }), appliquer: appliquerVariables, quandFermee: () => fermees.push(1) });
  return { doc, popup, evts, fermees, c, f, ctl };
}

test('ouvrir : contenu en texte seul, ancré au point, charte appliquée, événement bulle', () => {
  const { doc, popup, evts, c, f, ctl } = banc();
  assert.equal(ctl.ouvrir(c, f), true);
  assert.deepEqual(popup.lngLat, [5.1, 43.2]); assert.equal(popup.ouvert, true);
  assert.equal(popup.contenu.attrs.role, 'dialog'); assert.equal(popup.contenu.attrs['aria-label'], 'Alpha');
  const textes = popup.contenu.trouver((n) => n.tag === 'button').map((b) => b.textContent);
  assert.deepEqual(textes, ['×', 'Ouvrir la fiche', 'Itinéraire']);
  assert.equal(popup.element.style.props['--atlas-fond'], '#fff');
  assert.ok(doc.getElementById('atlas-bulle-style'), 'feuille posée une fois'); ctl.ouvrir(c, f); assert.equal(doc.head.enfants.length, 1);
  assert.deepEqual(evts.filter((e) => e[0] === 'bulle').map((e) => e[1]), [{ etat: 'ouverte', layer: 'sites', featureId: 7 }], 'rouvrir la même bulle n\'émet rien de plus');
});

test('rien de ce qui vient des données n\'est interprété : tout passe par textContent', () => {
  const { popup, c, f, ctl } = banc({ titre: 'nom', champs: [{ champ: 'commune' }] });
  f.properties.nom = '<img src=x onerror=alert(1)>'; f.properties.commune = '<script>alert(2)</script>';
  ctl.ouvrir(c, f);
  const tout = popup.contenu.trouver(() => true);
  assert.ok(tout.every((n) => ['div', 'button', 'dl', 'dt', 'dd'].includes(n.tag)), 'seuls des éléments de structure : ' + [...new Set(tout.map((n) => n.tag))]);
  assert.match(popup.contenu.textContent, /<img src=x onerror=alert\(1\)>/, 'le texte est affiché tel quel');
});

test('clic d\'une action : événement action vers l\'hôte, la bulle reste ouverte', () => {
  const { popup, evts, c, f, ctl } = banc();
  ctl.ouvrir(c, f);
  const [, fiche, itin] = popup.contenu.trouver((n) => n.tag === 'button');
  fiche.declencher('click'); itin.declencher('click');
  assert.deepEqual(evts.filter((e) => e[0] === 'action').map((e) => e[1]), [
    { layer: 'sites', featureId: 7, key: 'A', actionId: 'fiche' }, { layer: 'sites', featureId: 7, key: 'A', actionId: 'itineraire' }]);
  assert.equal(popup.ouvert, true); assert.ok(evts.filter((e) => e[0] === 'action').every((e) => e[2] === 'utilisateur'));
});

test('fermer : par l\'API, par le bouton (la sélection suit) et par Échap', () => {
  const { popup, evts, fermees, c, f, ctl } = banc();
  ctl.ouvrir(c, f); assert.equal(ctl.fermer(), true); assert.equal(popup.ouvert, false); assert.equal(ctl.fermer(), false, 'déjà fermée');
  assert.deepEqual(evts.filter((e) => e[0] === 'bulle').map((e) => e[1].etat), ['ouverte', 'fermee']);
  assert.equal(fermees.length, 0, 'fermer par l\'API ne signale pas une fermeture de la personne');
  ctl.ouvrir(c, f); popup.contenu.trouver((n) => n.className === 'atlas-bulle-fermer')[0].declencher('click'); assert.equal(fermees.length, 1); assert.equal(popup.ouvert, false);
  ctl.ouvrir(c, f); popup.contenu.declencher('keydown', { key: 'Escape' }); assert.equal(fermees.length, 2);
  ctl.ouvrir(c, f); popup.contenu.declencher('keydown', { key: 'a' }); assert.equal(popup.ouvert, true, 'une autre touche ne ferme pas');
});

test('ouverture « aucune », couche sans bulle, géométrie illisible : rien ne s\'ouvre', () => {
  const a = banc({ titre: 'nom', ouverture: 'aucune' }); assert.equal(a.ctl.ouvrir(a.c, a.f), false); assert.equal(a.popup.ouvert, false);
  const b = banc(); b.c.bulle = null; assert.equal(b.ctl.ouvrir(b.c, b.f), false);
  const d = banc(); d.f.geometry = { type: 'Polygon', coordinates: [] }; assert.equal(d.ctl.ouvrir(d.c, d.f), false);
  const e = banc(); e.f.geometry = { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 0]]] }; assert.equal(e.ctl.ouvrir(e.c, e.f, { lng: 1.5, lat: 0.5 }), true); assert.deepEqual(e.popup.lngLat, [1.5, 0.5], 'le point cliqué ancre une surface');
});

// ---- sur le runtime ----
const MANIFESTE = { layers: [{ id: 'sites', name: 'Sites', geometry_type: 'point', cle: 'ref', bulle: { titre: 'nom', champs: [{ champ: 'commune' }], actions: [{ id: 'fiche', libelle: 'Fiche' }] } }, { id: 'sans', name: 'Sans bulle', geometry_type: 'point' }] };
const DONNEES = { sites: [point(5.1, 43.2, { nom: 'Alpha', ref: 'A', commune: 'Aix' }, 1), point(5.2, 43.3, { nom: 'Bravo', ref: 'B', commune: 'Arles' }, 2)], sans: [point(5.5, 43.5, { nom: 'Z' }, 3)] };

function runtimeAvecBulle() {
  const doc = docAvecStyle(), popup = popupFactice(), vus = [];
  const rt = attacher(carteSimulee(), { document: doc, creerPopup: () => popup });
  for (const t of TOUS_LES_EVENEMENTS) rt.on(t, (ch) => vus.push([t, ch]));
  return { rt, popup, vus, doc };
}

test('runtime : select(id) ouvre la bulle déclarée, select(null) la ferme, une couche sans bulle ne l\'ouvre pas', async () => {
  const { rt, popup, vus } = runtimeAvecBulle();
  const r = await rt.api.setScene(MANIFESTE, DONNEES);
  assert.equal(r._avertissements, undefined, 'une bulle valide ne produit aucun avertissement');
  rt.api.select(1); assert.equal(popup.ouvert, true); assert.deepEqual(popup.lngLat, [5.1, 43.2]); assert.equal(popup.contenu.attrs['aria-label'], 'Alpha');
  rt.api.select(2); assert.equal(popup.contenu.attrs['aria-label'], 'Bravo', 'la bulle suit la sélection');
  rt.api.select(3); assert.equal(popup.ouvert, false, 'couche sans bulle');
  rt.api.select(1); rt.api.select(null); assert.equal(popup.ouvert, false);
  const etats = vus.filter((v) => v[0] === 'bulle').map((v) => v[1].etat + ':' + v[1].featureId);
  assert.deepEqual(etats, ['ouverte:1', 'fermee:1', 'ouverte:2', 'fermee:2', 'ouverte:1', 'fermee:1']);
});

test('runtime : un clic d\'action revient à l\'hôte avec la clé métier ; le bouton fermer efface aussi la sélection', async () => {
  const { rt, popup, vus } = runtimeAvecBulle();
  await rt.api.setScene(MANIFESTE, DONNEES); rt.api.select(2);
  popup.contenu.trouver((n) => n.tag === 'button' && n.className.split(' ').includes('atlas-bulle-action'))[0].declencher('click');
  assert.deepEqual(vus.find((v) => v[0] === 'action')[1], { layer: 'sites', featureId: 2, key: 'B', actionId: 'fiche' });
  popup.contenu.trouver((n) => n.className === 'atlas-bulle-fermer')[0].declencher('click');
  assert.equal(popup.ouvert, false);
  assert.deepEqual(vus.filter((v) => v[0] === 'select').pop()[1], { layer: null, featureId: null }, 'la sélection suit la fermeture');
});

test('runtime : une bulle mal déclarée se dit dans _avertissements et dans ready ; la scène se monte', async () => {
  const { rt, vus } = runtimeAvecBulle();
  const m = { layers: [{ id: 'sites', name: 'Sites', geometry_type: 'point', bulle: { titre: 'nom', champs: [{ champ: '' }], actions: [{ id: 'x y', libelle: 'X' }], magie: 1 } }] };
  const r = await rt.api.setScene(m, DONNEES);
  assert.equal(r.sites, 2); assert.ok(r._avertissements.sites.some((a) => /magie/.test(a)) && r._avertissements.sites.some((a) => /champs\[0\]/.test(a)) && r._avertissements.sites.some((a) => /actions\[0\]\.id/.test(a)));
  assert.deepEqual(vus.filter((v) => v[0] === 'ready').pop()[1].avertissements.sites, r._avertissements.sites);
});

test('runtime : une nouvelle scène ferme la bulle ouverte ; une charte d\'hôte réécrit les variables de la bulle', async () => {
  const { rt, popup } = runtimeAvecBulle();
  await rt.api.setScene(MANIFESTE, DONNEES); rt.api.select(1);
  assert.equal(popup.element.style.props['--atlas-accent'], '#c44536');
  rt.api.setTheme({ version: 'atlas-charte/0.1', graines: { principal: '#0b6e4f' } });
  assert.equal(popup.element.style.props['--atlas-accent'], '#0b6e4f', 'l\'interface suit la charte de l\'hôte');
  await rt.api.setScene(MANIFESTE, DONNEES); assert.equal(popup.ouvert, false);
});
