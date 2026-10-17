/**
 * Les tables liées de la carte BI et l'historique dans la bulle d'un objet : lignes sans géométrie fournies par l'hôte (couche `type: "table"`), jointure par clé,
 * tri par date, mise à jour à chaud (une seule opération : corriger ou créer), bulle ouverte rafraîchie sur place.
 * node --test projects/Atlas/tests/bi-tables-liees.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliserLignes, lignesLiees, comparer, mettreAJour, LIGNES_MAX, VALEUR_MAX } from '../lib/bi/tables.js';
import { normaliserBulle, contenuBulle, creerBulle } from '../lib/bi/bulle.js';
import { attacher } from '../lib/bi/bi-runtime.js';
import { carteSimulee, point } from './aide-carte-bi.js';

const COTATIONS = [
  { id: 1, batiment: 'B-01', date: '2024-03-10', note: 12 }, { id: 2, batiment: 'B-01', date: '2025-01-05', note: 15 }, { id: 3, batiment: 'B-02', date: '2025-02-01', note: 9 },
  { id: 4, batiment: 'B-01', date: '2023-06-30', note: 8 }, { id: 5, batiment: 'B-01', date: '2025-09-12', note: 17 },
];

test('normaliserLignes : valeurs simples seulement, longueurs et effectifs bornés, tout écart dit', () => {
  const r = normaliserLignes([{ a: 'x', b: 1, c: true, d: null, e: { objet: 1 }, f: [1], g: 'y'.repeat(VALEUR_MAX + 50), h: NaN }, 'pas un objet', null, [1]]);
  assert.equal(r.lignes.length, 1); assert.deepEqual(Object.keys(r.lignes[0]), ['a', 'b', 'c', 'd', 'g']);
  assert.equal(r.lignes[0].g.length, VALEUR_MAX); assert.match(r.avertissements[0], /3 ligne\(s\) écartée/);
  assert.deepEqual(normaliserLignes(undefined), { lignes: [], avertissements: [] }); assert.match(normaliserLignes('x').avertissements[0], /liste de lignes/);
  const gros = normaliserLignes(Array.from({ length: LIGNES_MAX + 5 }, (_, i) => ({ i }))); assert.equal(gros.lignes.length, LIGNES_MAX); assert.match(gros.avertissements[0], /5 ligne/);
  const larges = normaliserLignes([Object.fromEntries(Array.from({ length: 40 }, (_, i) => ['c' + i, i]))]); assert.equal(Object.keys(larges.lignes[0]).length, 20);
});

test('comparer : nombres, dates lisibles, texte français ; les valeurs vides en dernier', () => {
  assert.ok(comparer(2, 10) < 0); assert.ok(comparer('2024-03-10', '2025-01-05') < 0); assert.ok(comparer('a2', 'a10') < 0, 'ordre naturel'); assert.ok(comparer('é', 'z') < 0);
  assert.ok(comparer(null, 1) > 0 && comparer(1, '') < 0 && comparer(null, '') === 0);
});

test('lignesLiees : jointure par clé (comparée en texte), tri par date décroissant par défaut, limitée, avec le total', () => {
  const r = lignesLiees(COTATIONS, { cle: 'batiment', valeur: 'B-01', tri: 'date', max: 2 });
  assert.deepEqual(r.lignes.map((l) => l.id), [5, 2]); assert.equal(r.total, 4);
  assert.deepEqual(lignesLiees(COTATIONS, { cle: 'batiment', valeur: 'B-01', tri: 'date', ordre: 'asc', max: 10 }).lignes.map((l) => l.id), [4, 1, 2, 5]);
  assert.deepEqual(lignesLiees([{ k: 12, v: 'a' }], { cle: 'k', valeur: '12' }).lignes.length, 1, '12 et "12" se joignent');
  assert.deepEqual(lignesLiees(COTATIONS, { cle: 'batiment', valeur: 'inconnu' }), { lignes: [], total: 0 }); assert.deepEqual(lignesLiees(COTATIONS, { cle: 'batiment', valeur: undefined }), { lignes: [], total: 0 });
  assert.equal(lignesLiees(COTATIONS, { cle: 'batiment', valeur: 'B-01', max: 999 }).lignes.length, 4, 'au plus 10');
  assert.equal(lignesLiees(COTATIONS, { cle: 'batiment', valeur: 'B-01', max: -3 }).lignes.length, 1, 'au moins 1');
});

test('mettreAJour : corrige la ligne d identifiant donné, ou la crée ; refuse un objet invalide et une table pleine', () => {
  const l = [{ id: 1, a: 'x' }];
  assert.deepEqual(mettreAJour(l, 1, { properties: { a: 'y', b: 2 } }), { cree: false }); assert.deepEqual(l[0], { id: 1, a: 'y', b: 2 });
  assert.deepEqual(mettreAJour(l, 2, { a: 'z' }), { cree: true }); assert.deepEqual(l[1], { a: 'z', id: 2 });
  assert.throws(() => mettreAJour(l, 3, 'x'), /objet de valeurs simples/);
  const pleine = Array.from({ length: LIGNES_MAX }, (_, i) => ({ id: i })); assert.throws(() => mettreAJour(pleine, 'nouveau', { a: 1 }), /table pleine/);
  assert.deepEqual(mettreAJour(pleine, 5, { a: 1 }), { cree: false }, 'corriger une ligne reste possible dans une table pleine');
});

test('bulle.liste : déclaration validée, écarts dits', () => {
  const ok = normaliserBulle({ titre: 'nom', liste: { table: 'cotations', cle: 'batiment', valeur: 'ref', tri: 'date', max: 3, titre: 'Cotations', champs: [{ champ: 'date', libelle: 'Date', format: 'date' }, { champ: 'note' }] } });
  assert.deepEqual(ok.avertissements, []); const l = ok.bulle.liste;
  assert.deepEqual([l.table, l.cle, l.valeur, l.tri, l.ordre, l.max, l.titre], ['cotations', 'batiment', 'ref', 'date', 'desc', 3, 'Cotations']);
  assert.deepEqual(l.champs.map((c) => [c.champ, c.libelle, c.format]), [['date', 'Date', 'date'], ['note', 'note', 'texte']]);
  const defauts = normaliserBulle({ liste: { table: 't', cle: 'k', champs: [{ champ: 'a' }] } }).bulle.liste; assert.deepEqual([defauts.valeur, defauts.tri, defauts.max, defauts.titre], [null, null, 5, 'Historique']);
  const ko = (liste, motif) => { const r = normaliserBulle({ liste }); assert.equal(r.bulle.liste, undefined, JSON.stringify(liste)); assert.match(r.avertissements.join(' | '), motif); };
  ko('x', /un objet est attendu/); ko({ cle: 'k', champs: [{ champ: 'a' }] }, /table/); ko({ table: 'mauvais id', cle: 'k', champs: [{ champ: 'a' }] }, /table/);
  ko({ table: 't', champs: [{ champ: 'a' }] }, /cle/); ko({ table: 't', cle: 'k' }, /au moins un champ/); ko({ table: 't', cle: 'k', champs: [{ champ: '' }, 'x'] }, /champs\[0\]/);
  const lim = normaliserBulle({ liste: { table: 't', cle: 'k', max: 99, ordre: 'milieu', surprise: 1, champs: ['a', 'b', 'c', 'd', 'e', 'f'].map((champ) => ({ champ })) } });
  assert.equal(lim.bulle.liste.max, 10); assert.equal(lim.bulle.liste.ordre, 'desc'); assert.equal(lim.bulle.liste.champs.length, 4);
  assert.match(lim.avertissements.join(' | '), /max : entre 1 et 10/); assert.match(lim.avertissements.join(' | '), /ordre/); assert.match(lim.avertissements.join(' | '), /surprise/); assert.match(lim.avertissements.join(' | '), /4 au plus/);
});

const BULLE = normaliserBulle({ titre: '{nom}', champs: [{ champ: 'usage' }], liste: { table: 'cotations', cle: 'batiment', tri: 'date', max: 2, titre: 'Cotations', champs: [{ champ: 'date', libelle: 'Date', format: 'date' }, { champ: 'note', libelle: 'Note', format: 'nombre' }] } }).bulle;

test('contenuBulle : l historique est les lignes liées, triées, formatées, avec ce qui reste ; la clé par défaut est celle de la couche', () => {
  const tables = new Map([['cotations', COTATIONS]]);
  const c = contenuBulle(BULLE, { nom: 'Bâtiment A', usage: 'bureau', cle: 'B-01' }, 'Emprises', tables, 'cle');
  assert.equal(c.liste.titre, 'Cotations'); assert.deepEqual(c.liste.entetes, ['Date', 'Note']); assert.equal(c.liste.total, 4);
  assert.deepEqual(c.liste.lignes, [['12/09/2025', '17'], ['05/01/2025', '15']]);
  assert.deepEqual(contenuBulle(BULLE, { cle: 'B-03' }, 'E', tables, 'cle').liste.lignes, [], 'aucune ligne liée : liste vide (la bulle dit « Aucune ligne »)');
  assert.equal(contenuBulle(BULLE, { cle: 'B-01' }, 'E', new Map(), 'cle').liste, undefined, 'table absente : pas de section');
  assert.equal(contenuBulle(BULLE, { cle: 'B-01' }, 'E').liste, undefined);
  const objet = contenuBulle(BULLE, { cle: 'B-01' }, 'E', { cotations: COTATIONS }, 'cle'); assert.equal(objet.liste.total, 4, 'un objet simple convient aussi');
});

// ---- DOM minimal : on ne regarde que le texte rendu ----
class N { constructor(t) { this.tag = t; this.enfants = []; this.attrs = {}; this.style = { setProperty() {} }; this.className = ''; this._t = ''; this.ecouteurs = {}; }
  appendChild(c) { this.enfants.push(c); return c; } setAttribute(k, v) { this.attrs[k] = v; } addEventListener() {} getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0 }; } querySelector() { return null; }
  set textContent(v) { this._t = String(v); this.enfants = []; } get textContent() { return this._t + this.enfants.map((e) => e.textContent).join(''); }
  trouver(p, s = []) { if (p(this)) s.push(this); this.enfants.forEach((e) => e.trouver(p, s)); return s; } }
const doc = () => { const ids = new Map(), head = new N('head'); const a = head.appendChild.bind(head); head.appendChild = (n) => { if (n.id) ids.set(n.id, n); return a(n); }; return { head, createElement: (t) => new N(t), getElementById: (i) => ids.get(i) || null }; };
const popup = () => { const p = { ouvert: false, contenu: null, element: new N('div'), setLngLat() { return p; }, setDOMContent(c) { p.contenu = c; return p; }, addTo() { p.ouvert = true; return p; }, remove() { p.ouvert = false; return p; }, isOpen: () => p.ouvert, getElement: () => p.element }; return p; };

test('la bulle montre l historique en tableau (en-têtes, lignes, reste) et se rafraîchit sur place quand la table change', () => {
  const p = popup(); const evts = []; const tables = new Map([['cotations', [...COTATIONS]]]);
  const b = creerBulle({ map: { on() {} }, document: doc(), creerPopup: () => p, emettre: (t, c) => evts.push([t, c]), variables: () => ({}), tables: () => tables });
  const couche = { id: 'emprises', def: { name: 'Emprises', cle: 'cle' }, bulle: BULLE };
  assert.equal(b.ouvrir(couche, { id: 1, geometry: { type: 'Point', coordinates: [5, 43] }, properties: { nom: 'A', usage: 'bureau', cle: 'B-01' } }), true);
  let ths = p.contenu.trouver((n) => n.tag === 'th').map((n) => n.textContent), tds = p.contenu.trouver((n) => n.tag === 'td').map((n) => n.textContent);
  assert.deepEqual(ths, ['Date', 'Note']); assert.deepEqual(tds, ['12/09/2025', '17', '05/01/2025', '15']);
  assert.match(p.contenu.textContent, /\+ 2 autres lignes/);
  evts.length = 0; tables.get('cotations').push({ id: 6, batiment: 'B-01', date: '2026-01-01', note: 18 });
  assert.equal(b.rafraichir(), true);
  tds = p.contenu.trouver((n) => n.tag === 'td').map((n) => n.textContent); assert.deepEqual(tds.slice(0, 2), ['01/01/2026', '18']);
  assert.deepEqual(evts, [], 'la même bulle : aucun événement bulle ouverte/fermée');
  b.fermer(); assert.equal(b.rafraichir(), false, 'bulle fermée : rien à rafraîchir');
  const vide = creerBulle({ map: { on() {} }, document: doc(), creerPopup: () => (p), emettre() {}, variables: () => ({}), tables: () => new Map([['cotations', []]]) });
  vide.ouvrir(couche, { id: 1, geometry: { type: 'Point', coordinates: [5, 43] }, properties: { cle: 'B-09' } }); assert.match(p.contenu.textContent, /Aucune ligne/);
});

const SCENE = (extra = {}) => ({ layers: [
  { id: 'emprises', name: 'Emprises', geometry_type: 'polygon', cle: 'cle', bulle: { titre: '{nom}', liste: { table: 'cotations', cle: 'batiment', tri: 'date', champs: [{ champ: 'date', format: 'date' }, { champ: 'note' }] } }, ...extra },
  { id: 'cotations', name: 'Cotations', type: 'table' }] });
const POLYS = [{ type: 'Feature', id: 1, geometry: { type: 'Polygon', coordinates: [[[5.37, 43.29], [5.38, 43.29], [5.38, 43.3], [5.37, 43.29]]] }, properties: { cle: 'B-01', nom: 'Bâtiment A' } }];

test('runtime : une couche type table est lue, comptée, non montée sur la carte ; getRows la rend ; la scène suivante la remplace', async () => {
  const carte = carteSimulee(); const rt = attacher(carte);
  const r = await rt.api.setScene(SCENE(), { emprises: POLYS, cotations: COTATIONS });
  assert.equal(r.emprises, 1); assert.equal(r.cotations, 5); assert.equal(r._erreurs, undefined);
  assert.deepEqual(rt.api.ping().couches, ['emprises'], 'une table n est pas une couche de la carte');
  const lignes = rt.api.getRows('cotations').lignes; assert.equal(lignes.length, 5); lignes[0].note = 99; assert.equal(rt.api.getRows('cotations').lignes[0].note, 12, 'getRows rend des copies');
  const sans = await rt.api.setScene(SCENE(), { emprises: POLYS }); assert.equal(sans.cotations, 0);
  await rt.api.setScene({ layers: [{ id: 'emprises', name: 'E', geometry_type: 'polygon' }] }, { emprises: POLYS }); assert.throws(() => rt.api.getRows('cotations'), /couche inconnue/);
});

test('runtime : lignes invalides dites dans _avertissements ; une bulle.liste vers une table absente ne casse rien', async () => {
  const rt = attacher(carteSimulee());
  const r = await rt.api.setScene(SCENE(), { emprises: POLYS, cotations: [{ id: 1 }, 'x', null] });
  assert.equal(r.cotations, 1); assert.match(r._avertissements.cotations[0], /2 ligne\(s\) écartée/);
  const r2 = await rt.api.setScene({ layers: [{ id: 'emprises', name: 'E', geometry_type: 'polygon', cle: 'cle', bulle: { liste: { table: 'absente', cle: 'k', champs: [{ champ: 'a' }] } } }] }, { emprises: POLYS });
  assert.equal(r2.emprises, 1); assert.equal(r2._erreurs, undefined);
});

test('runtime : updateFeature sur une table corrige la ligne ou la crée, sans rejouer la scène ; getRows le voit', async () => {
  const rt = attacher(carteSimulee()); await rt.api.setScene(SCENE(), { emprises: POLYS, cotations: COTATIONS });
  assert.equal(rt.api.updateFeature('cotations', 2, { properties: { note: 16 } }), true); assert.equal(rt.api.getRows('cotations').lignes.find((l) => l.id === 2).note, 16);
  assert.equal(rt.api.updateFeature('cotations', 10, { properties: { batiment: 'B-01', date: '2026-02-02', note: 19 } }), 'cree'); assert.equal(rt.api.getRows('cotations').lignes.length, 6);
  assert.throws(() => rt.api.updateFeature('cotations', 11, { properties: 'x' }), /valeurs simples/);
  assert.equal(rt.api.updateFeature('emprises', 1, { properties: { nom: 'B' } }), true, 'une couche de la carte : comportement d avant');
});
