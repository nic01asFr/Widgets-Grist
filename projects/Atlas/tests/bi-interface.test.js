/**
 * L'interface optionnelle de la carte BI (lib/bi/ui/) : la zone d'accueil (dans la zone utile), la légende, le curseur de temps, et leur branchement sur le runtime
 * (`interface: { legende, temps }` dans la scène). DOM simulé : on regarde le texte, les attributs et les événements, pas le rendu (le rendu se vérifie en navigateur).
 * node --test projects/Atlas/tests/bi-interface.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { creerZone, COINS } from '../lib/bi/ui/zone.js';
import { creerLegende, couleurSure } from '../lib/bi/ui/legende.js';
import { creerTemps } from '../lib/bi/ui/temps.js';
import { attacher } from '../lib/bi/bi-runtime.js';
import { carteSimulee, point } from './aide-carte-bi.js';
import { TOUS_LES_EVENEMENTS } from '../lib/bi/evenements-ext.js';

class N {
  constructor(tag) { this.tag = tag; this.enfants = []; this.attrs = {}; this.style = {}; this.className = ''; this._t = ''; this.ecouteurs = {}; this.parentNode = null; this.value = ''; }
  appendChild(c) { c.parentNode = this; this.enfants.push(c); return c; }
  removeChild(c) { this.enfants = this.enfants.filter((x) => x !== c); c.parentNode = null; return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return this.attrs[k]; }
  addEventListener(t, f) { (this.ecouteurs[t] = this.ecouteurs[t] || []).push(f); }
  declencher(t, e = {}) { for (const f of this.ecouteurs[t] || []) f(e); }
  set textContent(v) { this._t = String(v); this.enfants.forEach((e) => { e.parentNode = null; }); this.enfants = []; } get textContent() { return this._t + this.enfants.map((e) => e.textContent).join(''); }
  trouver(p, s = []) { if (p(this)) s.push(this); this.enfants.forEach((e) => e.trouver(p, s)); return s; }
}
function banc() {
  const ids = new Map(), head = new N('head'); const a = head.appendChild.bind(head); head.appendChild = (n) => { if (n.id) ids.set(n.id, n); return a(n); };
  const doc = { head, createElement: (t) => new N(t), getElementById: (i) => ids.get(i) || null };
  const conteneur = new N('div');
  return { doc, conteneur };
}
const sansAttente = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const classesDe = (n) => n.trouver((x) => /atlas-bi-legende-classe/.test(x.className));

test('zone : cinq emplacements dans un calque posé sur la carte, décalé par les marges de l hôte ; un emplacement inconnu retombe en bas à gauche', () => {
  const { doc, conteneur } = banc();
  const vars = []; const z = creerZone({ document: doc, conteneur, variables: () => ({ '--atlas-fond': '#fff' }), appliquer: (el, v) => vars.push(v) });
  assert.equal(conteneur.enfants.length, 1); assert.equal(z.racine.enfants.length, COINS.length); assert.deepEqual(vars, [{ '--atlas-fond': '#fff' }]);
  assert.deepEqual([z.racine.style.top, z.racine.style.left], ['8px', '8px']);
  z.ajuster({ top: 0, right: 380, bottom: 212, left: 0 }); assert.deepEqual([z.racine.style.right, z.racine.style.bottom], ['388px', '240px'], 'huit pixels d air plus les marges ; le bas garde la place des crédits de la carte (28 px)');
  assert.equal(z.coin('haut-droite').className.includes('haut-droite'), true); assert.equal(z.coin('nimporte'), z.coin('bas-gauche'));
  assert.ok(doc.getElementById('atlas-bi-ui-style'), 'la feuille de style est posée une fois'); creerZone({ document: doc, conteneur }); assert.equal(doc.head.enfants.length, 1);
  z.actualiser(); assert.equal(vars.length, 2); z.detruire(); assert.ok(!conteneur.enfants.includes(z.racine));
  assert.throws(() => creerZone({ document: doc, conteneur: null }), /conteneur/);
});

test('légende : une pastille, un libellé et un compte par classe ; texte seul ; couleur non sûre écartée ; repliable ; invisible sans classe', () => {
  const { doc, conteneur } = banc(); const z = creerZone({ document: doc, conteneur });
  let donnees = [{ layer: 'sites', titre: 'Sites', classes: [{ libelle: 'Bureau <b>x</b>', couleur: '#0072b2', compte: 3 }, { libelle: 'Atelier', couleur: 'url(javascript:1)', compte: 0 }, { libelle: 'Rond', couleur: 'red', forme: 'cercle' }] }];
  const l = creerLegende({ document: doc, zone: z, fournir: () => donnees, position: 'haut-droite' });
  assert.equal(l.rafraichir(), 1); const lignes = classesDe(l.racine); assert.equal(lignes.length, 3);
  assert.equal(lignes[0].textContent, 'Bureau <b>x</b>3', 'le texte reste du texte : aucune balise n est interprétée');
  const pastilles = l.racine.trouver((n) => /atlas-bi-legende-pastille/.test(n.className)); assert.equal(pastilles[0].style.background, '#0072b2'); assert.equal(pastilles[1].style.background, '#808080', 'url() jamais écrit dans un style'); assert.ok(pastilles[2].className.includes('cercle'));
  assert.ok(z.coin('haut-droite').enfants.includes(l.racine)); assert.equal(l.racine.attrs['aria-label'], 'Légende');
  const tete = l.racine.trouver((n) => /atlas-bi-legende-tete/.test(n.className))[0]; assert.equal(tete.attrs['aria-expanded'], 'true');
  tete.declencher('click'); assert.equal(l.estOuverte(), false); assert.equal(tete.attrs['aria-expanded'], 'false'); tete.declencher('click'); assert.equal(l.estOuverte(), true);
  donnees = []; assert.equal(l.rafraichir(), 0); assert.equal(l.racine.style.display, 'none', 'rien à montrer : la légende disparaît');
  donnees = [{ layer: 'a', classes: [] }, null]; assert.equal(l.rafraichir(), 0);
  const repliee = creerLegende({ document: doc, zone: z, fournir: () => [], repliee: true }); assert.equal(repliee.estOuverte(), false);
  assert.equal(couleurSure('#abc'), '#abc'); assert.equal(couleurSure('rgb(1, 2, 3)'), 'rgb(1, 2, 3)'); assert.equal(couleurSure('red; x'), '#808080'); assert.equal(couleurSure(null), '#808080');
  l.detruire(); assert.ok(!z.coin('haut-droite').enfants.includes(l.racine));
});

test('curseur de temps : bornes, pas et valeur lus de l état ; bouton lecture/pause ; le curseur met en pause et pose le temps ; caché sans dimension temporelle', () => {
  const { doc, conteneur } = banc(); const z = creerZone({ document: doc, conteneur });
  let e = { champ: 'annee', min: 2019, max: 2024, valeur: 2022, pas: 1, enLecture: false }; const appels = [];
  const t = creerTemps({ document: doc, zone: z, etat: () => e, poser: (v) => { appels.push(['poser', v]); e = { ...e, valeur: v }; }, lire: () => { appels.push(['lire']); e = { ...e, enLecture: true }; }, pauser: () => { appels.push(['pauser']); e = { ...e, enLecture: false }; } });
  const curseur = t.racine.trouver((n) => n.tag === 'input')[0], valeur = t.racine.trouver((n) => n.tag === 'output')[0], bouton = t.racine.trouver((n) => n.tag === 'button')[0];
  assert.deepEqual([curseur.min, curseur.max, curseur.step, curseur.value, valeur.textContent], ['2019', '2024', '1', '2022', '2022']); assert.equal(bouton.attrs['aria-label'], 'Lecture'); assert.equal(t.racine.attrs.role, 'group');
  bouton.declencher('click'); assert.deepEqual(appels.pop(), ['lire']); assert.equal(bouton.attrs['aria-label'], 'Pause');
  curseur.value = '2020'; curseur.declencher('input'); assert.deepEqual(appels.splice(0), [['pauser'], ['poser', 2020]], 'déplacer le curseur pendant la lecture la met en pause'); assert.equal(valeur.textContent, '2020');
  bouton.declencher('click'); bouton.declencher('click'); assert.deepEqual(appels.splice(0), [['lire'], ['pauser']]);
  e = { champ: null, min: null, max: null, valeur: null, pas: 1, enLecture: false }; assert.equal(t.rafraichir(), false); assert.equal(t.racine.style.display, 'none');
  assert.ok(z.coin('bas-centre').enfants.includes(t.racine), 'bas-centre par défaut');
});

const MANIFESTE = (extra = {}) => ({ temps: { champ: 'annee', mode: 'cumul', pas: 1, valeur: 2024 }, layers: [{ id: 'sites', name: 'Sites', geometry_type: 'point', cle: 'ref', visuel: { type: 'cercles', rayon: 6 },
  style: { declarative: { kind: 'categorized', field: 'type', stops: [{ value: 'a', color: '#0072b2', label: 'Type A' }, { value: 'b', color: '#e69f00', label: 'Type B' }] } } }], ...extra });
const SITES = [point(5.30, 43.2, { ref: 'S1', type: 'a', annee: 2020 }, 1), point(5.31, 43.2, { ref: 'S2', type: 'b', annee: 2022 }, 2), point(5.32, 43.2, { ref: 'S3', type: 'a', annee: 2024 }, 3)];
function runtime(extra) {
  const { doc, conteneur } = banc(); const carte = carteSimulee(); carte.getContainer = () => conteneur; carte.getZoom = () => 10;
  const rt = attacher(carte, { document: doc, creerPopup: () => ({ setLngLat() { return this; }, setDOMContent() { return this; }, addTo() { return this; }, remove() { return this; }, isOpen: () => false }), ...extra });
  const evts = []; rt.on('time', (c) => evts.push(c)); return { rt, doc, conteneur, carte, evts };
}

test('runtime : interface { legende, temps } monte les modules à la demande, avec les classes et les comptes de getLegend ; elle suit un changement de visuel, de filtre et de temps', async () => {
  const { rt, conteneur, evts } = runtime();
  const r = await rt.api.setScene(MANIFESTE({ interface: { legende: true, temps: true } }), { sites: SITES });
  assert.equal(r._avertissements, undefined); const zone = conteneur.enfants[0]; assert.ok(zone && /atlas-bi-ui/.test(zone.className));
  await sansAttente(); const lignes = classesDe(zone);
  assert.deepEqual(lignes.map((n) => n.textContent), ['Type A2', 'Type B1'], 'les comptes de getLegend');
  const curseur = zone.trouver((n) => n.tag === 'input')[0]; assert.deepEqual([curseur.min, curseur.max, curseur.value], ['2020', '2024', '2024']);
  curseur.value = '2021'; curseur.declencher('input'); await sansAttente();
  assert.equal(evts.at(-1).valeur, 2021); assert.deepEqual(classesDe(zone).map((n) => n.textContent), ['Type A1', 'Type B0'], 'le temps filtre ; la légende suit (cumul jusqu en 2021 : S1 seulement)');
  rt.api.setVisual('sites', { style: { declarative: { kind: 'categorized', field: 'type', stops: [{ value: 'a', color: '#000000', label: 'Alpha' }] } } }); await sansAttente();
  assert.ok(classesDe(zone)[0].textContent.startsWith('Alpha'));
  rt.api.setLayerVisibility('sites', false); await sansAttente(); assert.equal(zone.trouver((n) => /atlas-bi-legende$|atlas-bi-legende /.test(n.className))[0].style.display, 'none', 'couche masquée : plus de légende');
  rt.api.setLayerVisibility('sites', true); await sansAttente(); assert.ok(classesDe(zone).length >= 1);
});

test('runtime : le curseur commande play/pause de la carte ; les marges de l hôte déplacent la zone ; une autre scène sans interface retire tout', async () => {
  const { rt, conteneur, evts } = runtime();
  await rt.api.setScene(MANIFESTE({ interface: { temps: { position: 'haut-gauche' } }, marges: { bottom: 100 } }), { sites: SITES });
  const zone = conteneur.enfants[0]; assert.equal(zone.style.bottom, '128px'); assert.ok(zone.trouver((n) => n.tag === 'input').length === 1);
  const bouton = zone.trouver((n) => n.tag === 'button')[0]; global.requestAnimationFrame = () => 1; bouton.declencher('click'); assert.equal(bouton.attrs['aria-label'], 'Pause', 'la lecture a démarré');
  bouton.declencher('click'); assert.equal(bouton.attrs['aria-label'], 'Lecture');
  rt.api.flyTo({ marges: { top: 0, right: 0, bottom: 300, left: 0 } }); assert.equal(zone.style.bottom, '328px');
  await rt.api.setScene(MANIFESTE(), { sites: SITES }); assert.equal(conteneur.enfants.length, 0, 'pas d interface déclarée : plus de calque'); assert.ok(evts.length >= 0);
});

test('runtime : une interface invalide est écartée ET dite ; sans conteneur de carte, dite aussi ; rien n est monté sans déclaration', async () => {
  const { rt, conteneur } = runtime();
  const r1 = await rt.api.setScene(MANIFESTE({ interface: { legende: true, surprise: 1, temps: 'oui' } }), { sites: SITES });
  assert.match(r1._avertissements._interface.join(' | '), /surprise/); assert.match(r1._avertissements._interface.join(' | '), /temps : true ou un objet/); assert.ok(conteneur.enfants.length === 1, 'la légende valide est montée');
  const r2 = await rt.api.setScene(MANIFESTE({ interface: 'oui' }), { sites: SITES }); assert.match(r2._avertissements._interface[0], /un objet est attendu/); assert.equal(conteneur.enfants.length, 0);
  const r3 = await rt.api.setScene(MANIFESTE({ interface: { legende: false, temps: null } }), { sites: SITES }); assert.equal(r3._avertissements, undefined); assert.equal(conteneur.enfants.length, 0);
  const sans = attacher(carteSimulee(), {}); const r4 = await sans.api.setScene(MANIFESTE({ interface: { legende: true } }), { sites: SITES }); assert.match(r4._avertissements._interface[0], /pas de conteneur/);
  const nu = runtime(); const r5 = await nu.rt.api.setScene(MANIFESTE(), { sites: SITES }); assert.equal(r5._avertissements, undefined); assert.equal(nu.conteneur.enfants.length, 0);
});

test("légende cible : une classe est un bouton à bascule dont le clic est DIT à l hôte, une à la fois par couche ; sans l option, ce sont de simples lignes", () => {
  const { doc, conteneur } = banc(); const z = creerZone({ document: doc, conteneur }); const clics = [];
  const donnees = [{ layer: 'sites', titre: 'Sites', classes: [{ cle: 'a', libelle: 'Type A', couleur: '#0072b2', compte: 2 }, { cle: 'b', libelle: 'Type B', couleur: '#e69f00', compte: 1 }] }];
  const l = creerLegende({ document: doc, zone: z, fournir: () => donnees, cible: true, surClasse: (...a) => clics.push(a) }); l.rafraichir();
  let boutons = classesDe(l.racine); assert.deepEqual(boutons.map((b) => b.tag), ['button', 'button']); assert.deepEqual(boutons.map((b) => b.attrs['aria-pressed']), ['false', 'false']);
  boutons[0].declencher('click'); assert.deepEqual(clics.pop(), ['sites', 'a', 'Type A', true]); boutons = classesDe(l.racine); assert.deepEqual(boutons.map((b) => b.attrs['aria-pressed']), ['true', 'false'], 'l état ciblé survit au redessin');
  boutons[1].declencher('click'); assert.deepEqual(clics.pop(), ['sites', 'b', 'Type B', true]); boutons = classesDe(l.racine); assert.deepEqual(boutons.map((b) => b.attrs['aria-pressed']), ['false', 'true'], 'une seule classe ciblée par couche');
  boutons[1].declencher('click'); assert.deepEqual(clics.pop(), ['sites', 'b', 'Type B', false], 'un second clic désélectionne'); assert.deepEqual(classesDe(l.racine).map((b) => b.attrs['aria-pressed']), ['false', 'false']);
  const lecture = creerLegende({ document: doc, zone: z, fournir: () => donnees }); lecture.rafraichir(); assert.deepEqual(classesDe(lecture.racine).map((b) => b.tag), ['div', 'div']);
});

test("carte étroite (téléphone) : la légende se range en bas comme une feuille, repliée ; une carte large ou un repli explicite gardent le comportement d avant", () => {
  const etroit = banc(); etroit.conteneur.clientWidth = 400; const ze = creerZone({ document: etroit.doc, conteneur: etroit.conteneur }); assert.equal(ze.etroit(), true);
  const l = creerLegende({ document: etroit.doc, zone: ze, fournir: () => [], position: 'haut-droite' });
  assert.ok(ze.coin('bas-centre').enfants.includes(l.racine), 'la position demandée cède la place à la feuille du bas'); assert.ok(l.racine.className.includes('feuille')); assert.equal(l.estOuverte(), false, 'repliée par défaut');
  assert.equal(creerLegende({ document: etroit.doc, zone: ze, fournir: () => [], repliee: false }).estOuverte(), true, 'repliee: false explicite : ouverte quand même');
  const large = banc(); large.conteneur.clientWidth = 1200; const zl = creerZone({ document: large.doc, conteneur: large.conteneur }); assert.equal(zl.etroit(), false);
  const g = creerLegende({ document: large.doc, zone: zl, fournir: () => [], position: 'haut-droite' }); assert.ok(zl.coin('haut-droite').enfants.includes(g.racine)); assert.equal(g.estOuverte(), true); assert.ok(!g.racine.className.includes('feuille'));
  assert.equal(creerZone({ document: banc().doc, conteneur: banc().conteneur }).etroit(), false, 'largeur inconnue : pas étroite');
});

test("runtime : interface.legende.cible emet l evenement classe avec les identifiants de la scene ; l evenement est decrit dans le contrat", async () => {
  const { rt, conteneur } = runtime(); const vus = []; rt.on('classe', (c) => vus.push(c));
  await rt.api.setScene(MANIFESTE({ interface: { legende: { cible: true } } }), { sites: SITES }); await sansAttente();
  const boutons = classesDe(conteneur.enfants[0]); assert.equal(boutons.length, 2); boutons[0].declencher('click');
  assert.deepEqual(vus, [{ layer: 'sites', cle: 'a', libelle: 'Type A', active: true }]);
  assert.ok(TOUS_LES_EVENEMENTS.includes('classe'));
});

test('la carte de la légende ne défile pas elle-même : seul son corps défile (une carte à défilement sur la carte laissait un rectangle vide dans Chrome)', async () => {
  const { FEUILLE } = await import('../lib/bi/ui/legende.js');
  const carte = /\.atlas-bi-legende \{[^}]*\}/.exec(FEUILLE)[0], corps = /\.atlas-bi-legende-corps \{[^}]*\}/.exec(FEUILLE)[0];
  assert.match(carte, /overflow: hidden/); assert.doesNotMatch(carte, /overflow: auto/); assert.match(carte, /max-height: 50vh/);
  assert.match(corps, /overflow: auto/); assert.match(corps, /min-height: 0/);
});
