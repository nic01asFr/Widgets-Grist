// Premier rendu du composant BI : un voile neutre jusqu'a la scene de l'hote, fond et charte nommes poses avant. node --test tests/bi-voile.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { voileDemande, parametresInitiaux, creerVoile, FONDS_INITIAUX, DELAI_VOILE_MS } from '../lib/bi/voile.js';
import { monter } from '../lib/bi/liaison.js';
import { CHARTES_NOMMEES } from '../lib/charte/defauts.js';
import { carteSimulee } from './aide-carte-bi.js';

const html = fs.readFileSync(new URL('../index_v7.html', import.meta.url), 'utf8');
const SCRIPT = /<body>\s*(?:<!--[\s\S]*?-->\s*)?<script>([\s\S]*?)<\/script>/;
const ADRESSES = ['?bi=1', '?bi=1&voile=0', '?bi=1&voile=false', '?bi=1&voile=non', '?bi=1&voile=1', '?bi=1&voile=', '?bi=true&voile=0', '?voile=0', '', '?bi=0', '?bi=1&voile=0&voile=1', '?bi=1&voile=00', '?bi=1&VOILE=0'];

/** Un corps de page minimal : les classes et attributs que le script ou le voile posent. */
function corps() {
  const classes = new Set(); const attributs = new Map();
  return { classes, attributs, classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) }, setAttribute: (k, v) => attributs.set(k, v), removeAttribute: (k) => attributs.delete(k) };
}

test('voileDemande : actif sauf ?voile=0, false ou non', () => {
  assert.equal(voileDemande('?bi=1'), true);
  assert.equal(voileDemande(''), true);
  for (const v of ['0', 'false', 'non']) assert.equal(voileDemande('?bi=1&voile=' + v), false, v);
  for (const v of ['1', '', 'oui', '00']) assert.equal(voileDemande('?bi=1&voile=' + v), true, v);
});

test('la page pose body.voile-bi exactement quand ?bi=1 et voileDemande le dit', () => {
  const code = SCRIPT.exec(html)[1];
  for (const search of ADRESSES) {
    const b = corps();
    vm.runInNewContext(code, { URLSearchParams, location: { search }, document: { body: b } });
    const bi = /(?:^|[?&])bi=(?:1|true)(?:&|$)/.test(search);
    assert.equal(b.classes.has('mode-bi'), bi, 'mode-bi : ' + search);
    assert.equal(b.classes.has('voile-bi'), bi && voileDemande(search), 'voile-bi : ' + search);
    assert.equal(b.attributs.get('aria-busy') === 'true', b.classes.has('voile-bi'), 'aria-busy : ' + search);
  }
});

test('la page porte l\'element du voile, cache hors mode composant, avec son message', () => {
  assert.match(html, /<div id="bi-voile" role="status" aria-live="polite">Chargement de la carte…<\/div>/);
  assert.match(html, /#bi-voile \{ display: none; \}/);
  assert.match(html, /body\.voile-bi #bi-voile \{[^}]*position: fixed; inset: 0;/);
  assert.match(html, /prefers-color-scheme: dark\) \{ body\.voile-bi #bi-voile/);
});

test('parametresInitiaux : listes fermees, rien d\'autre ne passe', () => {
  assert.deepEqual(parametresInitiaux('?bi=1&fond=plan-ign&theme=contraste-eleve'), { fond: 'plan-ign', theme: 'contraste-eleve', ignorees: [] });
  assert.deepEqual(parametresInitiaux('?bi=1'), { fond: null, theme: null, ignorees: [] });
  for (const f of FONDS_INITIAUX) assert.equal(parametresInitiaux('?fond=' + f).fond, f);
  for (const t of Object.keys(CHARTES_NOMMEES)) assert.equal(parametresInitiaux('?theme=' + t).theme, t);
  const hostile = parametresInitiaux('?fond=<script>alert(1)</script>&theme=__proto__');
  assert.equal(hostile.fond, null); assert.equal(hostile.theme, null); assert.equal(hostile.ignorees.length, 2);
  assert.ok(hostile.ignorees.every((x) => x.length <= 46), 'les valeurs signalees sont tronquees');
  assert.equal(parametresInitiaux('?fond=constructor').fond, null);
});

test('le voile se leve une seule fois, carte posee : classe et aria-busy retires', async () => {
  const b = corps(); b.classes.add('voile-bi'); b.attributs.set('aria-busy', 'true');
  const carte = { loaded: () => true, areTilesLoaded: () => true };
  const v = creerVoile({ document: { body: b }, carte, planifier: () => null });
  assert.equal(v.estLeve(), false);
  assert.equal(await v.lever('scene'), 'scene');
  assert.equal(v.estLeve(), true);
  assert.equal(b.classes.has('voile-bi'), false); assert.equal(b.attributs.has('aria-busy'), false);
  assert.equal(await v.lever('autre'), 'scene', 'une seconde levee ne change pas la raison');
});

test('carte pas encore posee : le voile attend l\'evenement idle', async () => {
  const b = corps(); b.classes.add('voile-bi');
  const rappels = []; const carte = { loaded: () => false, areTilesLoaded: () => false, once: (e, f) => rappels.push([e, f]) };
  const v = creerVoile({ document: { body: b }, carte, planifier: () => null });
  const fini = v.lever('scene');
  assert.equal(b.classes.has('voile-bi'), true, 'encore voilee');
  assert.equal(rappels[0][0], 'idle');
  rappels[0][1]();
  assert.equal(await fini, 'scene');
  assert.equal(b.classes.has('voile-bi'), false);
});

test('carte qui ne se pose jamais : le delai de repos leve le voile', async () => {
  const b = corps(); b.classes.add('voile-bi');
  const taches = []; const carte = { loaded: () => false, once: () => {} };
  const v = creerVoile({ document: { body: b }, carte, delaiMax: 8000, delaiRepos: 1500, planifier: (f, ms) => { taches.push({ f, ms }); return null; } });
  const fini = v.lever('scene');
  const repos = taches.find((t) => t.ms === 1500); assert.ok(repos, 'un delai de repos est arme');
  repos.f();
  assert.equal(await fini, 'scene');
});

test('aucune scene : le delai maximal leve le voile (pas d\'ecran vide a vie)', () => {
  const b = corps(); b.classes.add('voile-bi');
  const taches = [];
  const v = creerVoile({ document: { body: b }, carte: {}, planifier: (f, ms) => { taches.push({ f, ms }); return 7; }, annuler: () => {} });
  const maximal = taches.find((t) => t.ms === DELAI_VOILE_MS); assert.ok(maximal, 'delai maximal arme a ' + DELAI_VOILE_MS + ' ms');
  maximal.f();
  assert.equal(v.estLeve(), true); assert.equal(v.raison(), 'delai'); assert.equal(b.classes.has('voile-bi'), false);
});

test('document ou carte absents : le voile ne plante pas', async () => {
  const v = creerVoile({ document: undefined, carte: undefined, planifier: () => null });
  assert.equal(await v.lever('scene'), 'scene');
});

/* ---- liaison : monter() applique ?fond= / ?theme= et leve le voile apres la scene ---- */
function fenetreSimulee(search) {
  const b = corps(); b.classes.add('mode-bi'); if (voileDemande(search)) b.classes.add('voile-bi');
  const doc = { body: b, querySelector: () => null, addEventListener() {}, createElement: () => ({ style: {}, appendChild() {}, setAttribute() {} }) };
  const fenetre = { document: doc, location: { search }, parent: { postMessage() {} }, addEventListener() {}, removeEventListener() {} };
  return { fenetre, doc, b };
}

test('monter : le fond et la charte nommes de l\'adresse sont poses, le voile tient jusqu\'a la scene', async () => {
  const carte = carteSimulee();
  carte.loaded = () => true; carte.areTilesLoaded = () => true;   // la carte est au repos : seule la scene retient le voile
  const { fenetre, doc, b } = fenetreSimulee('?bi=1&hote=https://hote.example&fond=uni&theme=contraste-eleve');
  const r = monter({ carte, fenetre, document: doc, search: fenetre.location.search, journal: { warn() {} } });
  await r.reglages;
  assert.equal(r.rt.api.getTheme().charte.base, 'contraste-eleve', 'charte nommee posee avant la scene');
  assert.equal(b.classes.has('voile-bi'), true, 'toujours voilee : aucune scene encore');
  await r.rt.api.setScene({ layers: [] }, {});
  await new Promise((ok) => setTimeout(ok, 30));
  assert.equal(b.classes.has('voile-bi'), false, 'voile leve apres la scene');
  assert.equal(r.voile.raison(), 'scene');
});

test('monter avec ?voile=0 : pas de voile, les reglages de l\'adresse s\'appliquent quand meme', async () => {
  const carte = carteSimulee();
  const { fenetre, doc } = fenetreSimulee('?bi=1&hote=https://hote.example&voile=0&theme=atlas');
  const r = monter({ carte, fenetre, document: doc, search: fenetre.location.search, journal: { warn() {} } });
  await r.reglages;
  assert.equal(r.voile, null);
});

test('monter : une valeur d\'adresse hors liste est signalee et ignoree', async () => {
  const carte = carteSimulee(); const avertissements = [];
  const { fenetre, doc } = fenetreSimulee('?bi=1&hote=https://hote.example&fond=inconnu&theme=x');
  const r = monter({ carte, fenetre, document: doc, search: fenetre.location.search, journal: { warn: (m) => avertissements.push(m) } });
  await r.reglages;
  assert.ok(avertissements.filter((m) => /ignor/.test(m)).length >= 2, avertissements.join(' | '));
});
