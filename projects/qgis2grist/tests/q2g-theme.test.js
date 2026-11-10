'use strict';
// Tests de lib/q2g-theme.js : suivi du ThemeDef 1.0 par le widget qgis2grist.
// Lecteurs REELS en lecture seule : FormThemeDef (projects/grist_forms/shared) et le module d'Atlas
// (projects/Atlas/lib/charte/theme-document.js, charge par import dynamique, jamais modifie).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const Q = require('../lib/q2g-theme.js');
const FT = require('../../grist_forms/shared/themedef.js');

const ATLAS_THEME_DOCUMENT = path.join(__dirname, '..', '..', 'Atlas', 'lib', 'charte', 'theme-document.js');

const TD = {
  version: 'themedef-1.0', nom: 'Mon theme',
  graines: { principal: '#0b6e4f', secondaire: '#f4a259', encre: '#1b1b1b', fond: '#fdfaf3' },
  modes: { sombre: 'derive' },
};
const colonnes = (lignes) => {
  const c = { id: [], cle: [], themedef: [], actif: [] };
  lignes.forEach((l, i) => {
    c.id.push(i + 1); c.cle.push(l.cle || 'mon-theme');
    c.themedef.push(typeof l.themedef === 'string' || l.themedef === undefined ? l.themedef : JSON.stringify(l.themedef));
    c.actif.push(l.actif === undefined ? true : l.actif);
  });
  return c;
};
const aucuneMedia = () => ({ matches: false });
const mediaImposee = (q) => ({ matches: /prefers-contrast: more|forced-colors: active/.test(q) });

/** API de document factice : note les appels et refuse toute ecriture. */
function apiFausse(tables, contenu) {
  const appels = [];
  const api = {
    appels,
    contenu,
    listTables: async () => { appels.push('listTables'); return tables; },
    fetchTable: async (t) => { appels.push('fetchTable:' + t); return api.contenu; },
    applyUserActions: () => { appels.push('ECRITURE'); throw new Error('le widget n\'ecrit jamais Theme_document'); },
  };
  return api;
}

let themeDuDocumentAtlas = null;
test.before(async () => {
  try { ({ themeDuDocument: themeDuDocumentAtlas } = await import(pathToFileURL(ATLAS_THEME_DOCUMENT).href)); } catch (_) { themeDuDocumentAtlas = null; }
});
const avecAtlas = () => Q.create({ formThemeDef: FT, atlasThemeDuDocument: themeDuDocumentAtlas, matchMedia: aucuneMedia });
const sansAtlas = () => Q.create({ formThemeDef: FT, matchMedia: aucuneMedia });

// ---- Aucune ligne, table absente ----

test('aucune ligne : aucun theme, sans bruit (table vide, colonnes vides, contenu inattendu)', () => {
  for (const T of [avecAtlas(), sansAtlas()]) {
    for (const contenu of [{ id: [], cle: [], themedef: [], actif: [] }, {}, null, 'x', [], { cle: 'pas un tableau' }]) {
      const r = T.depuisTable(contenu, { mode: 'clair' });
      assert.equal(r.raison, 'aucun-actif');
      assert.equal(r.vars, null);
      assert.equal(r.charte, null);
      assert.deepEqual(r.avertissements, []);
    }
  }
});

test('une table dont aucune ligne n est active : aucun theme, sans bruit', () => {
  const r = avecAtlas().depuisTable(colonnes([{ themedef: TD, actif: false }, { cle: 'autre', themedef: TD, actif: 'oui' }]), { mode: 'clair' });
  assert.equal(r.raison, 'aucun-actif');
  assert.equal(r.charte, null);
  assert.deepEqual(r.avertissements, []);
});

test('table absente : fetchTable n est jamais appele, rien n est ecrit', async () => {
  const api = apiFausse(['Parcelles', 'SceneManifest'], colonnes([{ themedef: TD }]));
  const r = await avecAtlas().lire(api, { mode: 'clair' });
  assert.equal(r.raison, 'table-absente');
  assert.equal(r.vars, null);
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(api.appels, ['listTables']);
});

test('listTables rend des objets { id } ou des textes ; lecture impossible ne leve jamais', async () => {
  const T = avecAtlas();
  const api = apiFausse([{ id: 'Theme_document' }], colonnes([{ themedef: TD }]));
  assert.equal((await T.lire(api, { mode: 'clair' })).raison, 'applique');
  const casse = { listTables: async () => { throw new Error('reseau'); }, fetchTable: async () => ({}) };
  assert.equal((await T.lire(casse, { mode: 'clair' })).raison, 'lecture-impossible');
  const casse2 = { listTables: async () => ['Theme_document'], fetchTable: async () => { throw new Error('acl'); } };
  assert.equal((await T.lire(casse2, { mode: 'clair' })).raison, 'lecture-impossible');
  assert.equal((await T.lire(null, { mode: 'clair' })).raison, 'pas-de-document');
});

test('sans aucun lecteur injecte : lecteur-absent', () => {
  const r = Q.create({ matchMedia: aucuneMedia }).depuisTable(colonnes([{ themedef: TD }]), { mode: 'clair' });
  assert.equal(r.raison, 'lecteur-absent');
  assert.equal(r.vars, null);
  assert.equal(r.charte, null);
});

// ---- Plusieurs lignes actives ----

test('plusieurs lignes actives : rien n est applique et plusieurs-actifs est dit', () => {
  const contenu = colonnes([{ cle: 'a', themedef: TD }, { cle: 'b', themedef: TD }]);
  for (const T of [avecAtlas(), sansAtlas()]) {
    const r = T.depuisTable(contenu, { mode: 'clair' });
    assert.equal(r.raison, 'plusieurs-actifs');
    assert.equal(r.vars, null);
    assert.equal(r.charte, null);
    assert.ok(r.avertissements.some((a) => a.code === 'plusieurs-actifs' && a.nombre === 2));
  }
});

test('plusieurs actifs sans FormThemeDef : le lecteur d Atlas le dit aussi', () => {
  const r = Q.create({ atlasThemeDuDocument: themeDuDocumentAtlas, matchMedia: aucuneMedia })
    .depuisTable(colonnes([{ cle: 'a', themedef: TD }, { cle: 'b', themedef: TD }]), { mode: 'clair' });
  assert.equal(r.raison, 'plusieurs-actifs');
  assert.equal(r.charte, null);
});

// ---- Document invalide (donnee non fiable) ----

test('document invalide : aucun theme et la raison est dite', () => {
  const trop = JSON.stringify(Object.assign({}, TD, { nom: 'x'.repeat(17000) }));
  const profond = JSON.parse(JSON.stringify(TD));
  profond.surcharges = { clair: {} };
  profond.extra = { a: { b: { c: { d: { e: 1 } } } } };
  const cas = {
    'json casse': '{pas du json',
    'version inconnue': Object.assign({}, TD, { version: 'themedef-9.9' }),
    'principal absent': Object.assign({}, TD, { graines: { secondaire: '#f4a259' } }),
    'principal pas en hexadecimal': Object.assign({}, TD, { graines: { principal: 'red' } }),
    'trop gros': trop,
    'trop profond': profond,
    'tableau': [1, 2],
    'cle interdite': '{"version":"themedef-1.0","graines":{"principal":"#0b6e4f"},"__proto__":{"x":1}}',
    'mode sombre hors liste': Object.assign({}, TD, { modes: { sombre: 'rouge' } }),
  };
  for (const [nom, themedef] of Object.entries(cas)) {
    for (const T of [avecAtlas(), sansAtlas()]) {
      const r = T.depuisTable(colonnes([{ themedef }]), { mode: 'clair' });
      assert.equal(r.vars, null, nom);
      assert.equal(r.charte, null, nom);
      assert.notEqual(r.raison, 'applique', nom);
      assert.ok(r.avertissements.length >= 1, nom + ' : la raison doit etre dite');
    }
  }
});

test('colonne version de la ligne inconnue : version-inconnue ; vide ou absente : tolere', () => {
  const T = avecAtlas();
  const c = colonnes([{ themedef: TD }]);
  c.version = ['themedef-0.5'];
  assert.equal(T.depuisTable(c, { mode: 'clair' }).raison, 'version-inconnue');
  c.version = [''];
  assert.equal(T.depuisTable(c, { mode: 'clair' }).raison, 'applique');
  c.version = ['themedef-1.0'];
  assert.equal(T.depuisTable(c, { mode: 'clair' }).raison, 'applique');
});

test('cle de ligne non conforme : ligne ignoree, aucun theme', () => {
  const r = avecAtlas().depuisTable(colonnes([{ cle: 'Mon Theme!', themedef: TD }]), { mode: 'clair' });
  assert.equal(r.raison, 'aucun-actif');
});

test('contraste insuffisant (graines illisibles) : theme refuse en entier, ni interface ni charte', () => {
  const illisible = Object.assign({}, TD, { graines: { principal: '#ffff00', fond: '#ffffff', encre: '#fefefe' } });
  for (const T of [avecAtlas(), sansAtlas()]) {
    const r = T.depuisTable(colonnes([{ themedef: illisible }]), { mode: 'clair' });
    assert.equal(r.raison, 'contraste-insuffisant');
    assert.equal(r.vars, null);
    assert.equal(r.charte, null);
    assert.ok(r.avertissements.some((a) => a.code === 'contraste-insuffisant' && typeof a.mesure === 'number'));
  }
});

test('theme sans mode sombre demande en sombre : rien, sans bruit', () => {
  const sansSombre = Object.assign({}, TD, { modes: { sombre: 'aucun' } });
  const r = avecAtlas().depuisTable(colonnes([{ themedef: sansSombre }]), { mode: 'sombre' });
  assert.equal(r.raison, 'sans-mode-sombre');
  assert.equal(r.vars, null);
  assert.equal(r.charte, null);
  assert.deepEqual(r.avertissements, []);
  assert.equal(avecAtlas().depuisTable(colonnes([{ themedef: sansSombre }]), { mode: 'clair' }).raison, 'applique');
});

// ---- Graines valides ----

test('graines valides : variables --kit-* (26) et charte Atlas issue du module d Atlas', () => {
  assert.ok(themeDuDocumentAtlas, 'le module d Atlas doit se charger en lecture seule');
  const r = avecAtlas().depuisTable(colonnes([{ themedef: TD }]), { mode: 'clair' });
  assert.equal(r.raison, 'applique');
  assert.equal(r.ligne, 'mon-theme');
  assert.equal(r.nom, 'Mon theme');
  assert.equal(r.verifie, false);
  assert.equal(Object.keys(r.vars).length, 26);
  assert.ok(Object.keys(r.vars).every((k) => k.startsWith('--kit-')));
  assert.equal(r.vars['--kit-fond'], '#fdfaf3');
  assert.equal(r.vars['--kit-action'], '#0b6e4f');
  assert.equal(r.origineCharte, 'atlas');
  assert.equal(r.charte.version, 'atlas-charte/0.1');
  assert.equal(r.charte.graines.principal, '#0b6e4f');
  assert.equal(r.charte.graines.fond, '#fdfaf3');
  assert.equal(r.charte.graines.encre, '#1b1b1b');
});

test('conversion minimale (sans module d Atlas) : exactement les quatre graines, en minuscules', () => {
  const td = Object.assign({}, TD, { graines: { principal: '#0B6E4F', secondaire: '#F4A259', encre: '#1B1B1B', fond: '#FDFAF3', succes: '#00ff00' } });
  const r = sansAtlas().depuisTable(colonnes([{ themedef: td }]), { mode: 'clair' });
  assert.equal(r.raison, 'applique');
  assert.equal(r.origineCharte, 'minimale');
  assert.deepEqual(r.charte, {
    version: 'atlas-charte/0.1', nom: 'Mon theme',
    graines: { principal: '#0b6e4f', secondaire: '#f4a259', encre: '#1b1b1b', fond: '#fdfaf3' },
  });
});

test('conversion minimale : police de la liste sure reprise, pile ou adresse ecartee', () => {
  const T = sansAtlas();
  const ok = T.depuisTable(colonnes([{ themedef: Object.assign({}, TD, { police: 'serif' }) }]), { mode: 'clair' });
  assert.deepEqual(ok.charte.texte, { famille: 'serif' });
  const pile = T.depuisTable(colonnes([{ themedef: Object.assign({}, TD, { police: 'Comic Sans, url(http://x)' }) }]), { mode: 'clair' });
  assert.equal(pile.charte.texte, undefined);
});

test('conversion minimale : le nom de charte est borne et nettoye', () => {
  const r = sansAtlas().depuisTable(colonnes([{ themedef: Object.assign({}, TD, { nom: 'A\nB' + 'x'.repeat(100) }) }]), { mode: 'clair' });
  assert.ok(r.charte.nom.length <= 60);
  assert.ok(!/[\n\r]/.test(r.charte.nom));
});

test('mode sombre derive : interface sombre, charte sur les graines du document', () => {
  const clair = avecAtlas().depuisTable(colonnes([{ themedef: TD }]), { mode: 'clair' });
  const sombre = avecAtlas().depuisTable(colonnes([{ themedef: TD }]), { mode: 'sombre' });
  assert.equal(sombre.raison, 'applique');
  assert.equal(sombre.mode, 'sombre');
  assert.notEqual(sombre.vars['--kit-fond'], clair.vars['--kit-fond']);
  assert.equal(sombre.charte.graines.principal, '#0b6e4f');
});

test('valeurs resolues du document : la charte minimale reprend accent, fond, texte', () => {
  const T = sansAtlas();
  const base = T.depuisTable(colonnes([{ themedef: TD }]), { mode: 'clair' });
  const sombre = T.depuisTable(colonnes([{ themedef: TD }]), { mode: 'sombre' });
  const court = (vars) => Object.fromEntries(Object.entries(vars).map(([k, v]) => [k.slice(6), v]));
  const avecResolu = Object.assign({}, TD, { resolu: { modes: { clair: { valeurs: court(base.vars) }, sombre: { valeurs: court(sombre.vars) } } } });
  const r = T.depuisTable(colonnes([{ themedef: avecResolu }]), { mode: 'clair' });
  assert.equal(r.raison, 'applique');
  assert.equal(r.origineCharte, 'minimale');
  assert.deepEqual(r.charte.graines, { principal: base.vars['--kit-accent'], fond: base.vars['--kit-fond'], encre: base.vars['--kit-texte'] });
});

// ---- Delegation a Atlas : repli et respect des refus ----

test('le module d Atlas qui leve une erreur : repli sur la conversion minimale, dit', () => {
  const T = Q.create({ formThemeDef: FT, atlasThemeDuDocument: () => { throw new Error('boum'); }, matchMedia: aucuneMedia });
  const r = T.depuisTable(colonnes([{ themedef: TD }]), { mode: 'clair' });
  assert.equal(r.origineCharte, 'minimale');
  assert.equal(r.charte.graines.principal, '#0b6e4f');
  assert.ok(r.avertissements.some((a) => a.code === 'atlas-indisponible'));
});

test('le module d Atlas qui rend une forme inexploitable : repli minimal', () => {
  for (const faux of [null, 42, 'x', {}, []]) {
    const r = Q.create({ formThemeDef: FT, atlasThemeDuDocument: () => faux, matchMedia: aucuneMedia })
      .depuisTable(colonnes([{ themedef: TD }]), { mode: 'clair' });
    assert.equal(r.origineCharte, 'minimale', JSON.stringify(faux));
  }
});

test('un refus d Atlas est respecte, pas contourne : interface posee, pas de charte', () => {
  const refus = () => ({ charte: null, raison: 'contraste-insuffisant', ligne: 'mon-theme', avertissements: [] });
  const r = Q.create({ formThemeDef: FT, atlasThemeDuDocument: refus, matchMedia: aucuneMedia })
    .depuisTable(colonnes([{ themedef: TD }]), { mode: 'clair' });
  assert.equal(r.raison, 'applique');
  assert.ok(r.vars);
  assert.equal(r.charte, null);
  assert.equal(r.origineCharte, null);
  assert.equal(r.raisonCharte, 'contraste-insuffisant');
});

test('une charte d Atlas demesuree est ecartee', () => {
  const T = Q.create({ formThemeDef: FT, atlasThemeDuDocument: () => ({ charte: { version: 'atlas-charte/0.1', nom: 'x'.repeat(40000) }, raison: 'applique' }), matchMedia: aucuneMedia });
  const r = T.depuisTable(colonnes([{ themedef: TD }]), { mode: 'clair' });
  assert.equal(r.charte, null);
  assert.ok(r.avertissements.some((a) => a.code === 'charte-inexploitable'));
});

test('le module d Atlas ne recoit que la table reduite (50 lignes, lignes inactives vides)', () => {
  let recu = null;
  const T = Q.create({ formThemeDef: FT, atlasThemeDuDocument: (c) => { recu = c; return { charte: null, raison: 'aucun-actif' }; }, matchMedia: aucuneMedia });
  const lignes = [];
  for (let i = 0; i < 80; i++) lignes.push({ cle: 'l' + i, themedef: i === 3 ? TD : { version: 'themedef-1.0', nom: 'gros' + i }, actif: i === 3 });
  const r = T.depuisTable(colonnes(lignes), { mode: 'clair' });
  assert.equal(recu.cle.length, 50);
  assert.equal(recu.themedef.filter((t) => t !== '').length, 1);
  assert.ok(r.avertissements.some((a) => a.code === 'lignes-ignorees' && a.nombre === 30));
});

// ---- reduireTable ----

test('reduireTable : colonnes inattendues ignorees, actif strictement booleen, texte demesure borne', () => {
  const r = Q.reduireTable({
    id: [1, 2, 3], cle: ['a', 5, 'c'.repeat(100)], actif: [true, 'true', true],
    themedef: ['{"x":1}', '{"y":2}', 'z'.repeat(20000)], secret: ['a', 'b', 'c'], manualSort: [1, 2, 3],
  });
  assert.deepEqual(Object.keys(r.table).sort(), ['actif', 'cle', 'id', 'themedef']);
  assert.deepEqual(r.table.actif, [true, false, true]);
  assert.equal(r.table.cle[1], '');
  assert.equal(r.table.cle[2], '');
  assert.equal(r.table.themedef[1], '');
  assert.equal(r.table.themedef[2], '');
  assert.equal(r.total, 3);
  assert.equal(Q.reduireTable(null), null);
  assert.equal(Q.reduireTable([]), null);
});

test('reduireTable : un theme demesure d une ligne active est refuse en trop-gros par le lecteur', () => {
  const r = avecAtlas().depuisTable({ id: [1], cle: ['gros'], actif: [true], themedef: ['x'.repeat(20000)] }, { mode: 'clair' });
  assert.equal(r.raison, 'invalide');
  assert.ok(r.avertissements.some((a) => a.detail === 'trop-gros'));
});

// ---- Preference de contraste de la personne ----

test('prefers-contrast ou forced-colors : rien n est lu, rien n est pose, aucune charte', async () => {
  const T = Q.create({ formThemeDef: FT, atlasThemeDuDocument: themeDuDocumentAtlas, matchMedia: mediaImposee });
  const api = apiFausse(['Theme_document'], colonnes([{ themedef: TD }]));
  const r = await T.lire(api, { mode: 'clair' });
  assert.equal(r.raison, 'preference-personne');
  assert.equal(r.vars, null);
  assert.equal(r.charte, null);
  assert.deepEqual(api.appels, []);
  for (const q of ['(prefers-contrast: more)', '(forced-colors: active)']) {
    const un = Q.create({ formThemeDef: FT, matchMedia: (x) => ({ matches: x === q }) });
    assert.equal((await un.lire(apiFausse(['Theme_document'], colonnes([{ themedef: TD }])), { mode: 'clair' })).raison, 'preference-personne', q);
  }
  assert.equal(Q.personneImpose(aucuneMedia), false);
  assert.equal(Q.personneImpose(mediaImposee), true);
  assert.equal(Q.personneImpose(null), false);
});

test('le mode par defaut est celui du systeme (prefers-color-scheme)', async () => {
  const sombre = Q.create({ formThemeDef: FT, matchMedia: (q) => ({ matches: /dark/.test(q) }) });
  const r = await sombre.lire(apiFausse(['Theme_document'], colonnes([{ themedef: TD }])));
  assert.equal(r.mode, 'sombre');
  assert.equal(Q.modeSysteme((q) => ({ matches: /dark/.test(q) })), 'sombre');
  assert.equal(Q.modeSysteme(aucuneMedia), 'clair');
});

// ---- Variables d'interface ----

test('variablesInterface : --kit-* et alias du widget, derives de l action', () => {
  const r = avecAtlas().depuisTable(colonnes([{ themedef: TD }]), { mode: 'clair' });
  const v = Q.variablesInterface(r.vars);
  assert.equal(v['--kit-action'], '#0b6e4f');
  assert.equal(v['--primary'], '#0b6e4f');
  assert.equal(v['--bg'], r.vars['--kit-fond']);
  assert.equal(v['--text'], r.vars['--kit-texte']);
  assert.equal(v['--orange'], r.vars['--kit-alerte']);
  assert.equal(v['--primary-dim'], 'rgba(11,110,79,0.08)');
  assert.equal(v['--primary-glow'], 'rgba(11,110,79,0.18)');
});

test('variablesInterface : une valeur douteuse est omise, un nom hors liste aussi', () => {
  const v = Q.variablesInterface({
    '--kit-fond': '#ffffff', '--kit-texte': 'url(http://x)', '--kit-action': '#fff; background:red',
    '--kit-surface': 'var(--grist-theme-bg)', 'color': '#000', '--autre': '#000', '--kit-Bad Name': '#000',
  });
  assert.equal(v['--kit-fond'], '#ffffff');
  assert.equal(v['--kit-surface'], 'var(--grist-theme-bg)');
  assert.equal(v['--kit-texte'], undefined);
  assert.equal(v['--text'], undefined);
  assert.equal(v['--kit-action'], undefined);
  assert.equal(v['--primary-dim'], undefined);
  assert.equal(v.color, undefined);
  assert.equal(v['--autre'], undefined);
  assert.equal(Object.keys(v).some((k) => k.includes(' ')), false);
  assert.deepEqual(Q.variablesInterface(null), {});
});

test('alias injectable', () => {
  const T = Q.create({ formThemeDef: FT, alias: { fond: ['--ma-page'] }, matchMedia: aucuneMedia });
  const v = T.variablesInterface({ '--kit-fond': '#ffffff', '--kit-action': '#0b6e4f' });
  assert.equal(v['--ma-page'], '#ffffff');
  assert.equal(v['--bg'], undefined);
  assert.equal(v['--primary-dim'], undefined);
});

// ---- Suivi a chaud ----

/** Une racine factice. */
function racineFausse() {
  const props = {};
  return { props, style: { setProperty: (k, v) => { props[k] = v; }, removeProperty: (k) => { delete props[k]; } } };
}
const attendre = () => new Promise((r) => setImmediate(r));

test('habiller : pose les variables, signale la charte, suit un changement, retire a la desactivation', async () => {
  const racine = racineFausse();
  const api = apiFausse(['Theme_document'], colonnes([{ themedef: TD }]));
  let declencher = null;
  const chartes = [];
  const h = avecAtlas().habiller(racine, api, {
    mode: 'clair', abonner: (cb) => { declencher = cb; return () => { declencher = null; }; },
    surCharte: (c) => chartes.push(c),
  });
  const premier = await h.pret;
  assert.equal(premier.raison, 'applique');
  assert.equal(racine.props['--kit-action'], '#0b6e4f');
  assert.equal(racine.props['--primary'], '#0b6e4f');
  assert.equal(chartes.length, 1);
  assert.equal(chartes[0].graines.principal, '#0b6e4f');

  // rien n a change : ni relecture visible, ni nouvel appel a surCharte
  await h.rafraichir();
  assert.equal(chartes.length, 1);

  // le theme change dans la table
  api.contenu = colonnes([{ themedef: Object.assign({}, TD, { graines: Object.assign({}, TD.graines, { principal: '#0a3d8f' }) }) }]);
  declencher();
  await attendre(); await h.rafraichir();
  assert.equal(racine.props['--kit-action'], '#0a3d8f');
  assert.equal(chartes.length, 2);
  assert.equal(chartes[1].graines.principal, '#0a3d8f');

  // le theme est desactive : variables retirees, charte null signalee
  api.contenu = colonnes([{ themedef: TD, actif: false }]);
  await h.rafraichir();
  assert.deepEqual(racine.props, {});
  assert.equal(chartes.length, 3);
  assert.equal(chartes[2], null);
  assert.ok(!api.appels.includes('ECRITURE'));
  assert.ok(api.appels.every((a) => a === 'listTables' || a === 'fetchTable:Theme_document'));

  h.arreter();
  assert.equal(declencher, null);
});

test('habiller : aucun theme au demarrage, aucun appel a surCharte', async () => {
  const racine = racineFausse();
  let appels = 0;
  const h = avecAtlas().habiller(racine, apiFausse(['Theme_document'], colonnes([])), { mode: 'clair', surCharte: () => { appels++; } });
  const r = await h.pret;
  assert.equal(r.raison, 'aucun-actif');
  assert.equal(appels, 0);
  assert.deepEqual(racine.props, {});
});

test('suivre : une panne de lecture apres une lecture reussie garde le theme en place', async () => {
  const racine = racineFausse();
  const api = apiFausse(['Theme_document'], colonnes([{ themedef: TD }]));
  const h = avecAtlas().habiller(racine, api, { mode: 'clair' });
  await h.pret;
  assert.equal(racine.props['--kit-action'], '#0b6e4f');
  api.fetchTable = async () => { throw new Error('reseau'); };
  await h.rafraichir();
  assert.equal(racine.props['--kit-action'], '#0b6e4f');
  assert.equal(h.dernier().raison, 'applique');
});

test('suivre : les lectures ne se chevauchent pas, une demande en cours provoque une seule relecture', async () => {
  let lectures = 0; let libere = null;
  const api = {
    listTables: async () => ['Theme_document'],
    fetchTable: () => { lectures++; return new Promise((ok) => { libere = () => ok(colonnes([{ themedef: TD }])); }); },
  };
  const h = avecAtlas().suivre(api, { mode: 'clair' });
  h.rafraichir(); h.rafraichir(); h.rafraichir();
  await attendre(); await attendre();
  assert.equal(lectures, 1);
  libere();
  await attendre(); await attendre(); await attendre();
  assert.equal(lectures, 2);
  libere();
  await h.pret;
  h.arreter();
});

test('suivre : apres arreter(), plus aucune notification', async () => {
  const api = apiFausse(['Theme_document'], colonnes([{ themedef: TD }]));
  let n = 0;
  const h = avecAtlas().suivre(api, { mode: 'clair', surChangement: () => { n++; } });
  await h.pret;
  assert.equal(n, 1);
  h.arreter();
  api.contenu = colonnes([]);
  await h.rafraichir();
  assert.equal(n, 1);
});

test('suivre : un changement de preference de contraste ou de mode relance la lecture', async () => {
  const ecouteurs = {};
  let impose = false; let sombre = false;
  const mm = (q) => ({
    get matches() { return /prefers-contrast: more/.test(q) ? impose : /prefers-color-scheme: dark/.test(q) ? sombre : false; },
    addEventListener: (_t, f) => { (ecouteurs[q] = ecouteurs[q] || []).push(f); },
    removeEventListener: (_t, f) => { ecouteurs[q] = (ecouteurs[q] || []).filter((x) => x !== f); },
  });
  const racine = racineFausse();
  const api = apiFausse(['Theme_document'], colonnes([{ themedef: TD }]));
  const h = Q.create({ formThemeDef: FT, matchMedia: mm }).habiller(racine, api, {});
  await h.pret;
  const clair = racine.props['--kit-fond'];
  assert.equal(clair, '#fdfaf3');

  sombre = true; ecouteurs['(prefers-color-scheme: dark)'][0](); await h.rafraichir();
  assert.notEqual(racine.props['--kit-fond'], clair);

  impose = true; ecouteurs['(prefers-contrast: more)'][0](); await h.rafraichir();
  assert.deepEqual(racine.props, {});
  assert.equal(h.dernier().raison, 'preference-personne');

  h.arreter();
  assert.equal(Object.values(ecouteurs).every((l) => l.length === 0), true);
});

test('habiller : arreter({ retirer: true }) rend l interface a son rendu d origine', async () => {
  const racine = racineFausse();
  const h = avecAtlas().habiller(racine, apiFausse(['Theme_document'], colonnes([{ themedef: TD }])), { mode: 'clair' });
  await h.pret;
  assert.ok(Object.keys(racine.props).length > 26);
  h.arreter({ retirer: true });
  assert.deepEqual(racine.props, {});
});

test('un surChangement qui leve ne casse pas le suivi', async () => {
  const erreurs = [];
  const h = avecAtlas().suivre(apiFausse(['Theme_document'], colonnes([{ themedef: TD }])), {
    mode: 'clair', surChangement: () => { throw new Error('boum'); }, surErreur: (e) => erreurs.push(e.message),
  });
  const r = await h.pret;
  assert.equal(r.raison, 'applique');
  assert.deepEqual(erreurs, ['boum']);
});

// ---- Abonnement par sondage ----

test('abonnementParSondage : periodique, suspendu onglet masque, desabonnable', () => {
  const taches = new Map(); let id = 0; let visible = true; let appels = 0;
  const abonner = Q.abonnementParSondage({
    periodeMs: 5000,
    setInterval: (f, ms) => { taches.set(++id, { f, ms }); return id; },
    clearInterval: (i) => taches.delete(i),
    estVisible: () => visible,
  });
  const arret = abonner(() => { appels++; });
  assert.equal([...taches.values()][0].ms, 5000);
  [...taches.values()][0].f();
  assert.equal(appels, 1);
  visible = false;
  [...taches.values()][0].f();
  assert.equal(appels, 1);
  arret();
  assert.equal(taches.size, 0);
  assert.equal(typeof Q.abonnementParSondage({})(() => {}), 'function');
});

// ---- Le widget n'ecrit jamais ----

test('le module ne contient aucun appel d ecriture Grist', () => {
  const src = require('node:fs').readFileSync(path.join(__dirname, '..', 'lib', 'q2g-theme.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/applyUserActions|AddTable|AddRecord|BulkAddRecord|UpdateRecord|RemoveRecord/.test(code));
});

// ---- Repli sur le theme de l'INSTANCE Grist, fond de la carte ----

const HOTE_CLAIR = { apparence: 'clair', nom: 'GristLight', couleurs: {}, vars: { 'control-primary-bg': '#0b6e4f', 'page-bg': '#f3f8f5', text: '#14231c' } };
const HOTE_SOMBRE = { apparence: 'sombre', nom: 'GristDark', couleurs: {}, vars: { 'control-primary-bg': '#7ad0ab' } };
const avecHote = (hote, extra) => Q.create(Object.assign({ formThemeDef: FT, matchMedia: aucuneMedia, lireHote: async () => hote }, extra || {}));
const apiSansTheme = () => apiFausse(['Parcelles'], null);

test('instance : sans Theme_document, le theme de l instance habille l interface et produit une charte', async () => {
  const r = await avecHote(HOTE_CLAIR).lire(apiSansTheme(), { mode: 'clair' });
  assert.equal(r.origine, 'instance');
  assert.equal(r.raison, 'hote');
  assert.ok(r.vars && r.vars['--kit-accent'] && r.vars['--kit-fond']);
  assert.equal(r.origineCharte, 'instance');
  assert.equal(r.charte.version, 'atlas-charte/0.1');
  assert.equal(r.charte.graines.principal, '#0b6e4f');
  assert.equal(r.charte.graines.fond, '#f3f8f5');
  assert.equal(r.charte.graines.encre, '#14231c');
  assert.equal('secondaire' in r.charte.graines, false);
});

test('instance : table absente et table vide donnent le meme repli', async () => {
  const T = avecHote(HOTE_CLAIR);
  const vide = apiFausse(['Theme_document'], { id: [], cle: [], themedef: [], actif: [] });
  assert.equal((await T.lire(vide, { mode: 'clair' })).origine, 'instance');
  assert.equal((await T.lire(apiSansTheme(), { mode: 'clair' })).origine, 'instance');
});

test('priorite : la ligne active du document l emporte sur l instance', async () => {
  const api = apiFausse(['Theme_document'], colonnes([{ themedef: TD }]));
  const r = await avecHote(HOTE_CLAIR, { atlasThemeDuDocument: themeDuDocumentAtlas || undefined }).lire(api, { mode: 'clair' });
  assert.equal(r.origine, 'document');
  assert.equal(r.charte.graines.principal, '#0b6e4f');
  assert.equal(r.vars['--kit-accent'] !== undefined, true);
  assert.deepEqual(r.fond, { mode: 'plan', jetons: { principal: '#0b6e4f' } });
});

test('document refuse (plusieurs actifs, invalide) : repli sur l instance, le refus est dit', async () => {
  const T = avecHote(HOTE_CLAIR);
  const deux = await T.lire(apiFausse(['Theme_document'], colonnes([{ themedef: TD }, { cle: 'autre', themedef: TD }])), { mode: 'clair' });
  assert.equal(deux.origine, 'instance');
  assert.equal(deux.documentRefuse, 'plusieurs-actifs');
  assert.ok(deux.avertissements.some((a) => a.code === 'document-refuse'));
  const invalide = await T.lire(apiFausse(['Theme_document'], colonnes([{ themedef: '{pas du json' }])), { mode: 'clair' });
  assert.equal(invalide.origine, 'instance');
  assert.equal(invalide.documentRefuse, 'invalide');
});

test('instance : lecture du document impossible, repli sur l instance marque comme tel', async () => {
  const api = apiFausse(['Theme_document'], null);
  api.fetchTable = async () => { throw new Error('reseau'); };
  const r = await avecHote(HOTE_CLAIR).lire(api, { mode: 'clair' });
  assert.equal(r.origine, 'instance');
  assert.equal(r.documentIllisible, true);
});

test('aucun theme : ni document ni instance exploitable, rien (origine, charte et fond nuls)', async () => {
  for (const hote of [null, { apparence: null, couleurs: {}, vars: {} }]) {
    const r = await avecHote(hote).lire(apiSansTheme(), { mode: 'clair' });
    assert.equal(r.origine, null);
    assert.equal(r.vars, null);
    assert.equal(r.charte, null);
    assert.equal(r.fond, null);
  }
  const sans = await Q.create({ formThemeDef: FT, matchMedia: aucuneMedia }).lire(apiSansTheme(), { mode: 'clair' });
  assert.equal(sans.origine, null);
});

test('la preference de contraste de la personne passe avant le document ET l instance', async () => {
  let lu = 0;
  const T = Q.create({ formThemeDef: FT, matchMedia: mediaImposee, lireHote: async () => { lu++; return HOTE_CLAIR; } });
  const api = apiSansTheme();
  const r = await T.lire(api, { mode: 'clair' });
  assert.equal(r.raison, 'preference-personne');
  assert.equal(r.origine, null);
  assert.equal(r.fond, null);
  assert.equal(lu, 0);
  assert.deepEqual(api.appels, []);
});

test('instance sombre : interface sombre, charte avec fond et texte sombres du kit', async () => {
  const r = await avecHote(HOTE_SOMBRE).lire(apiSansTheme(), { mode: 'clair' });
  assert.equal(r.origine, 'instance');
  assert.equal(r.mode, 'sombre');
  assert.equal(r.charte.graines.principal, '#7ad0ab');
  assert.equal(r.charte.graines.fond, r.vars['--kit-fond']);
  assert.equal(r.charte.graines.encre, r.vars['--kit-texte']);
});

test('instance : un themeHote absent ou un lecteur qui leve ne casse rien', async () => {
  const sansThemeHote = Object.assign({}, FT, { themeHote: undefined });
  const r = await Q.create({ formThemeDef: sansThemeHote, matchMedia: aucuneMedia, lireHote: async () => HOTE_CLAIR }).lire(apiSansTheme(), { mode: 'clair' });
  assert.equal(r.origine, null);
  const l = await Q.create({ formThemeDef: FT, matchMedia: aucuneMedia, lireHote: async () => { throw new Error('boum'); } }).lire(apiSansTheme(), { mode: 'clair' });
  assert.equal(l.origine, null);
});

test('charteDepuisInstance : couleurs relues en #RRGGBB strict, aucune graine exploitable donne null', () => {
  assert.equal(Q.charteDepuisInstance({ vars: {}, action: '' }), null);
  assert.equal(Q.charteDepuisInstance({ vars: { '--kit-fond': 'red' }, action: 'pas-une-couleur', repris: { fond: true }, mode: 'clair' }), null);
  const c = Q.charteDepuisInstance({ vars: { '--kit-fond': '#FFFFFF' }, action: '#ABCDEF', repris: { fond: true }, mode: 'clair', nom: 'Grist' });
  assert.deepEqual(c.graines, { principal: '#abcdef', fond: '#ffffff' });
  assert.equal(c.nom, 'Instance Grist');
});

test('fond de carte : plan sur la couleur principale de tout theme applique, null sinon', () => {
  assert.deepEqual(Q.fondDeCharte({ graines: { principal: '#0B6E4F' } }), { mode: 'plan', jetons: { principal: '#0b6e4f' } });
  assert.equal(Q.fondDeCharte({ graines: { fond: '#ffffff' } }), null);
  assert.equal(Q.fondDeCharte(null), null);
});

test('fond : le document (ligne active) donne un fond de plan sur sa graine principale', () => {
  const r = avecAtlas().depuisTable(colonnes([{ themedef: TD }]), { mode: 'clair' });
  assert.equal(r.origine, 'document');
  assert.deepEqual(r.fond, { mode: 'plan', jetons: { principal: '#0b6e4f' } });
  const desactive = avecAtlas().depuisTable(colonnes([{ themedef: TD, actif: false }]), { mode: 'clair' });
  assert.equal(desactive.fond, null);
  assert.equal(desactive.origine, null);
});

/** Faux hote Atlas : note les envois, peut refuser. */
function hoteFaux(refuse) {
  const envois = [];
  return {
    envois,
    appliquerTheme: async (c, o) => { if (refuse) throw new Error('refus'); envois.push(['setTheme', c, o]); },
    definirFond: async (m, j) => { if (refuse) throw new Error('refus'); envois.push(j ? ['setFond', m, j] : ['setFond', m]); },
  };
}
const PLAN = { mode: 'plan', jetons: { principal: '#0b6e4f' } };
const CHARTE = { version: 'atlas-charte/0.1', nom: 'x', graines: { principal: '#0b6e4f' } };

test('envoyerApparence, cas 1 document : charte puis fond de plan, une seule fois', async () => {
  const h = hoteFaux();
  let e = await Q.envoyerApparence(h, { charte: CHARTE, fond: PLAN }, null);
  assert.deepEqual(h.envois, [['setTheme', CHARTE, { remplacer: true }], ['setFond', 'plan', PLAN.jetons]]);
  e = await Q.envoyerApparence(h, { charte: CHARTE, fond: PLAN }, e);
  assert.equal(h.envois.length, 2);
});

test('envoyerApparence, cas 2 instance : meme comportement (le fond suit tout theme applique)', async () => {
  const r = await avecHote(HOTE_CLAIR).lire(apiSansTheme(), { mode: 'clair' });
  const h = hoteFaux();
  await Q.envoyerApparence(h, { charte: r.charte, fond: r.fond }, null);
  assert.deepEqual(h.envois.map((x) => x[0]), ['setTheme', 'setFond']);
  assert.deepEqual(h.envois[1], ['setFond', 'plan', { principal: '#0b6e4f' }]);
});

test('envoyerApparence, cas 3 aucun theme : rien d envoye au depart, retour a atlas si le theme disparait', async () => {
  const h = hoteFaux();
  let e = await Q.envoyerApparence(h, { charte: null, fond: null }, null);
  assert.deepEqual(h.envois, []);
  e = await Q.envoyerApparence(h, { charte: CHARTE, fond: PLAN }, e);
  assert.equal(h.envois.length, 2);
  e = await Q.envoyerApparence(h, { charte: null, fond: null }, e);
  assert.deepEqual(h.envois.slice(2), [['setTheme', {}, { remplacer: true }], ['setFond', 'atlas']]);
  await Q.envoyerApparence(h, { charte: null, fond: null }, e);
  assert.equal(h.envois.length, 4);
});

test('envoyerApparence : un envoi refuse n est pas memorise et est retente', async () => {
  const erreurs = [];
  const mauvais = hoteFaux(true);
  const e = await Q.envoyerApparence(mauvais, { charte: CHARTE, fond: PLAN }, null, (x) => erreurs.push(x.message));
  assert.deepEqual(e, { charte: null, fond: null });
  assert.equal(erreurs.length, 2);
  const bon = hoteFaux();
  await Q.envoyerApparence(bon, { charte: CHARTE, fond: PLAN }, e);
  assert.equal(bon.envois.length, 2);
  assert.equal((await Q.envoyerApparence(null, { charte: CHARTE, fond: PLAN }, null)).charte, null);
});

test('habiller : instance puis document active puis desactive, variables, charte et fond suivis', async () => {
  let contenu = null;
  const api = apiFausse(['Theme_document'], null);
  api.fetchTable = async () => contenu;
  const racine = { style: { props: {}, setProperty(k, v) { this.props[k] = v; }, removeProperty(k) { delete this.props[k]; } } };
  const fonds = [];
  const chartes = [];
  let rappelHote = null;
  const T = Q.create({ formThemeDef: FT, matchMedia: aucuneMedia, lireHote: async () => HOTE_CLAIR, suivreHote: (f) => { rappelHote = f; return () => { rappelHote = null; }; } });
  const suivi = T.habiller(racine, api, { mode: 'clair', surCharte: (c) => chartes.push(c), surFond: (f) => fonds.push(f) });
  await suivi.pret;
  assert.ok(racine.style.props['--kit-accent']);
  assert.equal(fonds.length, 1);
  assert.deepEqual(fonds[0], { mode: 'plan', jetons: { principal: '#0b6e4f' } });
  assert.equal(typeof rappelHote, 'function');
  contenu = colonnes([{ themedef: TD }]);
  await suivi.rafraichir();
  assert.equal(suivi.dernier().origine, 'document');
  contenu = colonnes([{ themedef: TD, actif: false }]);
  await suivi.rafraichir();
  assert.equal(suivi.dernier().origine, 'instance');
  suivi.arreter();
  assert.equal(rappelHote, null);
});

test('habiller : le theme qui disparait remet le fond a null ; sans aucun theme rien n est signale', async () => {
  const api = apiFausse(['Theme_document'], colonnes([{ themedef: TD }]));
  const racine = { style: { props: {}, setProperty(k, v) { this.props[k] = v; }, removeProperty(k) { delete this.props[k]; } } };
  const fonds = [];
  const T = Q.create({ formThemeDef: FT, matchMedia: aucuneMedia, lireHote: async () => null, suivreHote: () => () => {} });
  const suivi = T.habiller(racine, api, { mode: 'clair', surFond: (f) => fonds.push(f) });
  await suivi.pret;
  assert.equal(fonds.length, 1);
  api.contenu = colonnes([{ themedef: TD, actif: false }]);
  await suivi.rafraichir();
  assert.equal(fonds.length, 2);
  assert.equal(fonds[1], null);
  assert.deepEqual(racine.style.props, {});
  suivi.arreter();
  const T2 = Q.create({ formThemeDef: FT, matchMedia: aucuneMedia, lireHote: async () => null });
  const rien = [];
  const s2 = T2.habiller(racine, apiFausse(['Parcelles'], null), { mode: 'clair', surFond: (f) => rien.push(f), surCharte: (c) => rien.push(c) });
  await s2.pret;
  assert.deepEqual(rien, []);
  s2.arreter();
});
