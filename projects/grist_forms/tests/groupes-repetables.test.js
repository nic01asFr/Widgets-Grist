'use strict';

/*
 * Le groupe répétable et la couleur : ce que le moteur ajoute sans rien changer à ce qui existe.
 *
 * Un groupe est UNE question qui s'écrit dans UNE colonne de texte (du JSON) et se développe à l'écran en questions
 * ordinaires. Les formulaires sans groupe ne passent par rien de tout ceci : c'est ce que ces essais vérifient aussi.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Engine = require('../runtime/engine.js');
const { createRoot } = require('./helpers/fake-dom.js');

const G = Engine.groupes;
const flush = () => new Promise((resolve) => setTimeout(() => setImmediate(resolve), 5));

const groupe = (options, extra) => Object.assign({
  colId: 'couleurs', label: 'Couleurs de la marque', description: 'Au moins une.', type: 'Text', widget: 'groupe', required: false,
  options: Object.assign({
    min: 1, max: 3, libelleLigne: 'Couleur', libelleAjout: 'Ajouter une couleur',
    champs: [
      { colId: 'nom', label: 'Nom', type: 'Text', widget: 'text', required: true },
      { colId: 'valeur', label: 'Valeur', type: 'Text', widget: 'couleur', required: false }
    ]
  }, options || {})
}, extra || {});

const def = (g) => ({
  id: 'marque', title: 'Marque', tableId: 'Marques', choices: {},
  sections: [
    { id: 's1', label: 'Identité', gate: null, fields: [
      { colId: 'Nom', label: 'Nom du design system', type: 'Text', widget: 'text', required: false }
    ] },
    { id: 's2', label: 'Couleurs', gate: null, fields: [g || groupe()] }
  ]
});

const sans = (envoyes) => ({ submit: (data) => { if (envoyes) envoyes.push(data); return Promise.resolve([[1]]); } });

async function versEtape2(root) {
  root.querySelector('[data-action="next"]').dispatchEvent('click');
  await flush();
}

const saisir = (root, nom, valeur) => {
  const el = root.querySelector('[name="' + nom + '"]');
  assert.ok(el, 'champ ' + nom);
  el.value = valeur;
  el.dispatchEvent('change');
};

describe('Groupe répétable : les bornes et le développement', () => {
  it('une ligne au départ, jamais moins que le minimum ni plus que le maximum', () => {
    assert.deepEqual(G.bornes(groupe()), { min: 1, max: 3 });
    assert.equal(G.nombre(groupe(), {}), 1);
    assert.equal(G.nombre(groupe({ min: 2 }), {}), 2);
    assert.equal(G.nombre(groupe(), { 'couleurs[n]': 99 }), 3);
    assert.equal(G.nombre(groupe({ min: 0, lignesDepart: 0 }), {}), 0);
    assert.deepEqual(G.bornes(groupe({ min: 0 }, { required: true })), { min: 1, max: 3 }, 'un groupe obligatoire compte une ligne');
    assert.equal(G.bornes(groupe({ max: 9999 })).max, 50, 'un plafond, quoi que dise le formulaire');
  });

  it('chaque ligne devient des questions ordinaires, nommées par leur rang', () => {
    const fs = G.developper(groupe(), { 'couleurs[n]': 2 });
    assert.deepEqual(fs.map((f) => f.colId), ['couleurs[0].nom', 'couleurs[0].valeur', 'couleurs[1].nom', 'couleurs[1].valeur']);
    assert.equal(fs[0].required, true);
    assert.equal(fs[0].widget, 'text');
    assert.equal(fs[0]._ligne.titre, 'Couleur 1');
    assert.equal(fs[2]._ligne.derniere, true);
    assert.equal(fs[2]._ligne.peutRetirer, true);
    assert.equal(fs[0].options.groupe, 'couleurs#0', 'chaque ligne est un bloc sous sa légende');
  });

  it('sans ligne, une ligne « vide » porte le bouton pour en ajouter', () => {
    const fs = G.developper(groupe({ min: 0, lignesDepart: 0 }), {});
    assert.equal(fs.length, 1);
    assert.equal(fs[0].widget, 'groupe-vide');
    assert.equal(fs[0]._ligne.peutAjouter, true);
  });

  it('un nom de question qui brouillerait les clés est écarté', () => {
    const g = groupe();
    g.options.champs.push({ colId: 'a[0]', label: 'X', type: 'Text' });
    assert.deepEqual(G.sousChamps(g).map((c) => c.colId), ['nom', 'valeur']);
  });

  it('ajouter et retirer : les lignes d\'après remontent, jamais sous le minimum', () => {
    const g = groupe({ max: 3 });
    const v = { 'couleurs[n]': 3, 'couleurs[0].nom': 'a', 'couleurs[1].nom': 'b', 'couleurs[2].nom': 'c' };
    assert.equal(G.retirer(g, v, 0), 2);
    assert.equal(v['couleurs[0].nom'], 'b');
    assert.equal(v['couleurs[1].nom'], 'c');
    assert.ok(!('couleurs[2].nom' in v));
    assert.equal(G.ajouter(g, v), 3);
    assert.equal(G.ajouter(g, v), 3, 'plein');
    const seul = { 'couleurs[n]': 1 };
    assert.equal(G.retirer(g, seul, 0), 1, 'au minimum');
  });
});

describe('Groupe répétable : la colonne', () => {
  it('les lignes remplies s\'écrivent en JSON, les lignes vides non', () => {
    const v = { 'couleurs[n]': 3, 'couleurs[0].nom': 'Ardoise', 'couleurs[0].valeur': ' #3D4F63 ', 'couleurs[2].nom': 'Sable' };
    const brut = G.cellule(groupe(), v);
    assert.deepEqual(JSON.parse(brut), [{ nom: 'Ardoise', valeur: '#3D4F63' }, { nom: 'Sable' }]);
    assert.equal(G.cellule(groupe(), {}), null, 'rien de rempli, rien d\'écrit');
  });

  it('la colonne se relit : texte JSON ou liste, une cellule illisible ne donne rien', () => {
    const a = G.aplatir(groupe(), '[{"nom":"Ardoise","valeur":"#3d4f63"},{"nom":"Sable"}]');
    assert.equal(a['couleurs[n]'], 2);
    assert.equal(a['couleurs[0].valeur'], '#3d4f63');
    assert.equal(a['couleurs[1].nom'], 'Sable');
    assert.deepEqual(G.aplatir(groupe(), '[pas du json'), {});
    assert.deepEqual(G.aplatir(groupe(), '{"nom":"x"}'), {});
    assert.equal(G.aplatir(groupe({ max: 2 }), [{ nom: 'a' }, { nom: 'b' }, { nom: 'c' }])['couleurs[n]'], 2, 'au plus le maximum');
    assert.equal(G.aplatir(groupe({ min: 2 }), [{ nom: 'a' }])['couleurs[n]'], 2, 'au moins le minimum');
  });

  it('collectSubmitData écrit le groupe dans sa colonne, et rien d\'autre pour ses lignes', () => {
    const v = { Nom: 'X', 'couleurs[n]': 2, 'couleurs[0].nom': 'Ardoise', 'couleurs[1].nom': 'Sable', 'couleurs[1].valeur': '#c8b26a' };
    const data = Engine.collectSubmitData(def(), v, {}, { creation: true });
    assert.equal(data.Nom, 'X');
    assert.deepEqual(JSON.parse(data.couleurs), [{ nom: 'Ardoise' }, { nom: 'Sable', valeur: '#c8b26a' }]);
    assert.ok(!Object.keys(data).some((k) => k.indexOf('[') !== -1), 'aucune colonne par ligne');
  });

  it('une ligne existante se relit dans le formulaire (modification)', () => {
    const v = Engine.valuesFromRecord(def(), { Nom: 'X', couleurs: '[{"nom":"Ardoise"}]' });
    assert.equal(v['couleurs[0].nom'], 'Ardoise');
    assert.equal(v['couleurs[n]'], 1);
  });

  it('le brouillon garde les lignes à plat', () => {
    const gardees = Engine.valeursDeBrouillon({ 'couleurs[n]': 2, 'couleurs[0].nom': 'Ardoise', 'couleurs[vide]': null });
    assert.equal(gardees['couleurs[n]'], 2);
    assert.equal(gardees['couleurs[0].nom'], 'Ardoise');
  });
});

describe('Groupe répétable : à l\'écran', () => {
  it('les lignes se montrent sous un titre, chacune sous sa légende, avec « Ajouter »', async () => {
    const root = createRoot();
    Engine.mount(root, def(), sans());
    await flush();
    await versEtape2(root);
    assert.match(root.innerHTML, /Couleurs de la marque/);
    assert.match(root.innerHTML, /<legend[^>]*>Couleur 1<\/legend>/);
    assert.ok(root.querySelector('[name="couleurs[0].nom"]'));
    assert.ok(root.querySelector('[data-action="groupe-ajouter"]'));
    assert.ok(!root.querySelector('[data-action="groupe-retirer"]'), 'une seule ligne : rien à retirer (minimum 1)');
  });

  it('« Ajouter » garde ce qui est tapé et ouvre une ligne ; « Retirer » referme', async () => {
    const root = createRoot();
    Engine.mount(root, def(), sans());
    await flush();
    await versEtape2(root);
    saisir(root, 'couleurs[0].nom', 'Ardoise');
    root.querySelector('[data-action="groupe-ajouter"]').dispatchEvent('click');
    await flush();
    assert.ok(root.querySelector('[name="couleurs[1].nom"]'), 'deuxième ligne');
    assert.match(root.innerHTML, /value="Ardoise"/, 'la frappe en cours est gardée');
    assert.equal(root.querySelectorAll('[data-action="groupe-retirer"]').length, 2);
    root.querySelector('[data-action="groupe-retirer"]').dispatchEvent('click');
    await flush();
    assert.ok(!root.querySelector('[name="couleurs[1].nom"]'));
  });

  it('au maximum, « Ajouter » disparaît', async () => {
    const root = createRoot();
    Engine.mount(root, def(groupe({ max: 2 })), sans());
    await flush();
    await versEtape2(root);
    root.querySelector('[data-action="groupe-ajouter"]').dispatchEvent('click');
    await flush();
    assert.ok(!root.querySelector('[data-action="groupe-ajouter"]'));
  });

  it('une question obligatoire d\'une ligne bloque, et se nomme par sa ligne', async () => {
    const envoyes = [];
    const root = createRoot();
    Engine.mount(root, def(), sans(envoyes));
    await flush();
    await versEtape2(root);
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush();
    assert.equal(envoyes.length, 0, 'rien ne part');
    assert.match(root.innerHTML, /Couleur 1 — Nom/, 'le résumé nomme la ligne et la question');
  });

  it('une couleur mal écrite est refusée avec son message ; bien écrite, le groupe s\'envoie en une colonne', async () => {
    const envoyes = [];
    const root = createRoot();
    Engine.mount(root, def(), sans(envoyes));
    await flush();
    await versEtape2(root);
    saisir(root, 'couleurs[0].nom', 'Ardoise');
    saisir(root, 'couleurs[0].valeur', 'bleu');
    await flush();
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush();
    assert.equal(envoyes.length, 0);
    assert.match(root.innerHTML, /six chiffres ou lettres/);
    saisir(root, 'couleurs[0].valeur', '#3D4F63');
    await flush();
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush();
    assert.equal(envoyes.length, 1);
    assert.deepEqual(JSON.parse(envoyes[0].couleurs), [{ nom: 'Ardoise', valeur: '#3D4F63' }]);
  });

  it('un formulaire sans groupe ne montre rien de tout cela', async () => {
    const root = createRoot();
    Engine.mount(root, {
      id: 'x', title: 'X', tableId: 'T', choices: {},
      sections: [{ id: 's', label: 'S', gate: null, fields: [{ colId: 'A', label: 'A', type: 'Text', widget: 'text', required: false }] }]
    }, sans());
    await flush();
    assert.ok(!/groupe-repete|groupe-ajouter|fr-couleur/.test(root.innerHTML));
  });
});

describe('Couleur : le code et le sélecteur', () => {
  const unique = (valeur) => ({
    id: 'c', title: 'C', tableId: 'T', choices: {},
    sections: [{ id: 's', label: 'S', gate: null, fields: [{ colId: 'Teinte', label: 'Teinte', type: 'Text', widget: 'couleur', required: true }] }]
  });

  it('rend un code à taper et un sélecteur nommé', async () => {
    const root = createRoot();
    Engine.mount(root, unique(), sans());
    await flush();
    assert.ok(root.querySelector('[name="Teinte"]'));
    assert.match(root.innerHTML, /type="color"/);
    assert.match(root.innerHTML, /aria-label="Choisir la couleur : Teinte"/);
  });

  it('refuse ce qui n\'est pas #RRGGBB, n\'écrit que le code juste', async () => {
    const envoyes = [];
    const root = createRoot();
    Engine.mount(root, unique(), sans(envoyes));
    await flush();
    for (const mauvais of ['bleu', '#12345', '#GGGGGG', '#1234567', 'rgb(0,0,0)']) {
      saisir(root, 'Teinte', mauvais);
      root.querySelector('[data-action="submit"]').dispatchEvent('click');
      await flush();
      assert.equal(envoyes.length, 0, mauvais + ' refusé');
    }
    saisir(root, 'Teinte', ' #3d4f63 ');
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush();
    assert.equal(envoyes.length, 1);
    assert.equal(envoyes[0].Teinte, '#3d4f63', 'sans espaces autour');
  });

  it('le sélecteur ne reçoit jamais autre chose qu\'un code juste, et se montre estompé tant qu\'il est vide', () => {
    const html = Engine.renderFieldHtml({ colId: 'T', label: 'T', widget: 'couleur', type: 'Text' }, { T: 'red;background:url(x)' }, null, {});
    assert.ok(!/style=/.test(html));
    assert.match(html, /type="color"[^>]*value="#ffffff" data-vide="1"/);
    const bon = Engine.renderFieldHtml({ colId: 'T', label: 'T', widget: 'couleur', type: 'Text' }, { T: '#ABCDEF' }, null, {});
    assert.match(bon, /type="color"[^>]*value="#abcdef"/);
    assert.ok(!/data-vide/.test(bon));
  });

  it('un motif propre à la question juge aussi ; un motif illisible ne bloque personne', () => {
    const q = { colId: 'Id', label: 'Id', type: 'Text', widget: 'text', options: { motif: '^[a-z][a-z0-9-]{0,39}$', motifMessage: 'Minuscules, chiffres, tiret.' } };
    assert.deepEqual(Engine.validerMotifs([q], { Id: 'Mon Id' }), [{ colId: 'Id', message: 'Minuscules, chiffres, tiret.' }]);
    assert.deepEqual(Engine.validerMotifs([q], { Id: 'mon-id' }), []);
    assert.deepEqual(Engine.validerMotifs([q], { Id: '' }), [], 'vide : c\'est l\'obligation qui juge');
    const casse = { colId: 'X', label: 'X', type: 'Text', options: { motif: '([' } };
    assert.deepEqual(Engine.validerMotifs([casse], { X: 'abc' }), []);
  });
});
