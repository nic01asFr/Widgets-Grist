'use strict';

/**
 * La page WebMCP de Form Builder : les mêmes commandes pures que le registre (mêmes noms, schémas, sorties), plus forms_rendre et forms_recolter
 * qui n'existent que dans une page. On rejoue l'installation de la page SANS navigateur : les modules du noyau sont chargés comme la page les
 * charge (des scripts dans un espace global), et `navigator.modelContext` est remplacé par un faux qui retient ce qu'on lui confie.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { monter } = require('../forms-registre/index.js');
const { contenu: llms, CHEMIN: CHEMIN_LLMS } = require('../forms-registre/generer-llms.js');

const RACINE = path.join(__dirname, '..');
const registre = monter();

/** Les scripts de la page, dans l'ordre où elle les charge (le moteur de formulaire est remplacé, au besoin, par un faux). */
const SCRIPTS = [
  'shared/types.js', 'shared/formats.js', 'shared/conditions.js', 'shared/formdef-from-table.js', 'shared/formdef-from-grist-form.js',
  'shared/survey-project.js', 'shared/ensure-schema.js', 'shared/theme.js', 'shared/theme-instance.js', 'shared/derivation-valeurs.js',
  'shared/themedef.js', 'shared/publish.js', 'shared/synthese.js', 'shared/valider-schema.js', 'forms-registre/registre.js', 'forms-registre/navigateur.js'
];

function espace(extra) {
  const ctx = vm.createContext(Object.assign({ console }, extra || {}));
  ctx.self = ctx;
  ctx.window = ctx;
  for (const s of SCRIPTS) vm.runInContext(fs.readFileSync(path.join(RACINE, s), 'utf8'), ctx, { filename: s });
  return ctx;
}

const lireJson = (chemin) => Promise.resolve(JSON.parse(fs.readFileSync(path.join(RACINE, 'forms-registre', chemin), 'utf8')));
const rond = (v) => JSON.parse(JSON.stringify(v));

async function installer(extra, env) {
  const ctx = espace(extra);
  const fournis = [];
  const navigator = { modelContext: { provideContext: (c) => fournis.push(...c.tools) } };
  const page = await ctx.FormsWebMCP.installer(Object.assign({ global: ctx, navigator, lireJson, conteneur: {} }, env || {}));
  return { page, fournis, ctx };
}

describe('Page WebMCP Form Builder : mêmes commandes que le registre', () => {
  it('propose toutes les commandes du registre, plus forms_rendre et forms_recolter, à WebMCP', async () => {
    const { page, fournis } = await installer();
    assert.equal(page.expose, true);
    assert.deepEqual(fournis.map((t) => t.name).sort(), [...registre.commandes.map((c) => c.nom), 'forms_rendre', 'forms_recolter'].sort());
  });

  it('chaque outil porte la description et le schéma d’entrée de la commande du registre', async () => {
    const { fournis } = await installer();
    for (const c of registre.commandes) {
      const t = fournis.find((x) => x.name === c.nom);
      assert.equal(t.description, c.description, c.nom);
      assert.deepEqual(rond(t.inputSchema), rond(c.entree), c.nom);
      assert.equal(t.annotations.readOnlyHint, true, c.nom);
    }
  });

  it('chaque exemple du registre donne, par la page, la même sortie', async () => {
    const { fournis } = await installer();
    for (const d of registre.lister()) for (const x of d.exemples) {
      const r = await fournis.find((t) => t.name === d.nom).execute(x.entree);
      assert.equal(r.isError, false, d.nom);
      assert.deepEqual(JSON.parse(r.content[0].text), rond(x.sortie), d.nom);
    }
  });

  it('une entrée invalide est refusée par la page comme par le registre', async () => {
    const { fournis } = await installer();
    const r = await fournis.find((t) => t.name === 'forms_verifier_format').execute({});
    assert.equal(r.isError, true);
    assert.equal(JSON.parse(r.content[0].text).code, 'entree-invalide');
  });

  it('sans WebMCP dans le navigateur, la page le dit et reste appelable', async () => {
    const ctx = espace();
    const page = await ctx.FormsWebMCP.installer({ global: ctx, navigator: {}, lireJson, conteneur: {} });
    assert.equal(page.expose, false);
    assert.equal(page.appeler('forms_verifier_format', { format: 'codePostal', valeur: '13001' }).sortie.valide, true);
  });

  it('une variante de WebMCP qui enregistre outil par outil est aussi servie', async () => {
    const ctx = espace();
    const vus = [];
    const page = await ctx.FormsWebMCP.installer({ global: ctx, navigator: { modelContext: { registerTool: (t) => vus.push(t.name) } }, lireJson, conteneur: {} });
    assert.equal(page.expose, true);
    assert.equal(vus.length, registre.commandes.length + 2);
  });

  it('une fiche versionnée qui ne correspond plus aux commandes empêche l’installation', async () => {
    const ctx = espace();
    const perimee = (chemin) => lireJson(chemin).then((j) => (chemin === 'fiche-capacites.json' ? Object.assign({}, j, { limites: ['autre'] }) : j));
    await assert.rejects(ctx.FormsWebMCP.installer({ global: ctx, navigator: {}, lireJson: perimee, conteneur: {} }), /fiche-capacites\.json/);
  });
});

describe('Page WebMCP Form Builder : les commandes qui n’existent que dans la page', () => {
  const formdef = JSON.parse(fs.readFileSync(path.join(RACINE, 'demo', 'cas', 'inscription.json'), 'utf8'));

  it('forms_rendre monte le formulaire, forms_recolter rend ce qui a été envoyé (envoi simulé)', async () => {
    const montes = [];
    const moteur = { mount: (conteneur, def, options) => { montes.push({ def, options }); } };
    const { fournis } = await installer({ FormEngine: moteur });
    const rendre = fournis.find((t) => t.name === 'forms_rendre');
    const recolter = fournis.find((t) => t.name === 'forms_recolter');

    let r = await recolter.execute({});
    assert.deepEqual(JSON.parse(r.content[0].text), { envoye: false, valeurs: null });

    r = await rendre.execute({ formdef, valeurs: { nom: 'Exemple' } });
    assert.equal(r.isError, false);
    assert.equal(montes.length, 1);
    assert.deepEqual(rond(montes[0].options.values), { nom: 'Exemple' });
    assert.equal(montes[0].options.skipProbe, true);

    await montes[0].options.submit({ nom: 'Exemple', age: 30 });
    r = await recolter.execute({});
    assert.deepEqual(JSON.parse(r.content[0].text), { envoye: true, valeurs: { nom: 'Exemple', age: 30 } });

    await rendre.execute({ formdef });
    r = await recolter.execute({});
    assert.equal(JSON.parse(r.content[0].text).envoye, false, 'un nouveau formulaire repart de zéro');
  });

  it('forms_rendre refuse un FormDef non conforme, et une page sans moteur le dit', async () => {
    const { fournis } = await installer({ FormEngine: { mount() { throw new Error('ne doit pas être appelé'); } } });
    const r = await fournis.find((t) => t.name === 'forms_rendre').execute({ formdef: {} });
    assert.equal(r.isError, true);
    assert.equal(JSON.parse(r.content[0].text).code, 'formdef-invalide');

    const sans = await installer();
    const r2 = await sans.fournis.find((t) => t.name === 'forms_rendre').execute({ formdef });
    assert.equal(JSON.parse(r2.content[0].text).code, 'page-sans-moteur');
  });

  it('la page n’écrit dans aucun document : elle n’appelle pas grist', () => {
    const src = fs.readFileSync(path.join(RACINE, 'forms-registre', 'navigateur.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
    assert.ok(!/\bgrist\.|localStorage|XMLHttpRequest|\bfetch\(/.test(src));
  });
});

describe('Page WebMCP Form Builder : les fichiers qui l’accompagnent', () => {
  it('llms.txt est ce que le registre rend (relancer generer-llms.js sinon)', () => {
    assert.equal(fs.readFileSync(CHEMIN_LLMS, 'utf8'), llms());
  });

  it('llms.txt liste toutes les commandes', () => {
    const t = fs.readFileSync(CHEMIN_LLMS, 'utf8');
    for (const c of registre.commandes) assert.ok(t.includes('`' + c.nom + '`'), c.nom);
  });

  it('shared/valider-schema.js est la copie exacte de scripts/valider-schema.js', () => {
    const a = fs.readFileSync(path.join(RACINE, '..', '..', 'scripts', 'valider-schema.js'));
    const b = fs.readFileSync(path.join(RACINE, 'shared', 'valider-schema.js'));
    assert.ok(a.equals(b));
  });

  it('webmcp.html charge les modules dont la page a besoin, dans l’ordre où le test les charge', () => {
    const html = fs.readFileSync(path.join(RACINE, 'forms-registre', 'webmcp.html'), 'utf8');
    const charges = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => path.normalize(path.join('forms-registre', m[1])));
    for (const s of SCRIPTS) assert.ok(charges.includes(path.normalize(s)), s + ' est chargé par la page');
    const pos = (s) => charges.indexOf(path.normalize(s));
    assert.ok(pos('forms-registre/registre.js') < pos('forms-registre/navigateur.js'));
    assert.ok(pos('shared/derivation-valeurs.js') < pos('shared/themedef.js'));
  });
});

describe('Page WebMCP Form Builder : le module d’entrée que la vitrine injecte', () => {
  const entree = fs.readFileSync(path.join(RACINE, 'forms-registre', 'webmcp-entree.js'), 'utf8');

  it('la fiche nomme ce module, et il existe', () => {
    const fiche = registre.fiche();
    assert.equal(fiche.interfaces.webmcp, true);
    assert.equal(fiche.entree_webmcp, 'forms-registre/webmcp-entree.js');
    assert.ok(fs.existsSync(path.join(RACINE, fiche.entree_webmcp)));
  });

  it('il charge les mêmes scripts, dans le même ordre, que webmcp.html', () => {
    const ctx = vm.createContext({ console });
    ctx.self = ctx;
    vm.runInContext(entree, ctx);
    const html = fs.readFileSync(path.join(RACINE, 'forms-registre', 'webmcp.html'), 'utf8');
    const dePage = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual([...ctx.FormsWebMCPEntree.SCRIPTS], dePage);
    assert.equal(typeof ctx.FormsWebMCPEntree.installer, 'function');
  });

  it('en page publique (pures_seulement) : les commandes du registre seulement, jamais forms_rendre ni forms_recolter', async () => {
    const { page, fournis } = await installer(undefined, { pures_seulement: true });
    assert.deepEqual(fournis.map((t) => t.name).sort(), registre.commandes.map((c) => c.nom).sort());
    const r = page.appeler('forms_rendre', { formdef: {} });
    assert.equal(r.ok, false);
    assert.equal(r.erreur.code, 'exige-la-page');
  });

  it('il ne contient aucun appel d’écriture ni aucune adresse hors du widget', () => {
    assert.ok(!/https?:\/\//.test(entree.replace(/\/\*[\s\S]*?\*\//g, '')));
    assert.ok(!/method:\s*['"](POST|PUT|PATCH|DELETE)/i.test(entree));
  });
});
