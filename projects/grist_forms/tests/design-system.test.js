'use strict';

/*
 * Saisir un design system : du catalogue au formulaire, du formulaire au document, et les règles croisées.
 *
 * Le catalogue d'une organisation n'est pas dans ce dépôt. Les essais de bout en bout sur un vrai catalogue se
 * lancent avec `DSDEF_DIR=<dossier des jetons>` (deux fichiers : le catalogue et une instance) ; sans elle, ils sont
 * passés, et tout le reste tourne sur un catalogue d'essai écrit ici.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../runtime/engine.js');
const D = require('../shared/design-system.js');
const { createRoot } = require('./helpers/fake-dom.js');

const flush = () => new Promise((resolve) => setTimeout(() => setImmediate(resolve), 10));

const champ = (id, type, extra) => Object.assign({
  id, module: id.split('.')[0], niveau: 0, obligation: 'facultatif', type, label: id, aide: 'Aide de ' + id, contraintes: {}, themedef: null, ds: null, sensible: false, si: null
}, extra || {});

const catalogue = () => ({
  _format: 'dsdef-catalogue/0.1',
  niveaux: [{ niveau: 0, nom: 'Graines' }, { niveau: 1, nom: 'Suite' }],
  modules: [{ id: 'identite', nom: 'Identité', aide: 'Qui.' }, { id: 'couleurs', nom: 'Couleurs', aide: 'Quoi.' }, { id: 'modes', nom: 'Modes' },
    { id: 'exigences', nom: 'Exigences' }, { id: 'typographie', nom: 'Typo' }, { id: 'visualisation', nom: 'Séries' }, { id: 'interaction', nom: 'Interaction' }],
  regles: [],
  champs: [
    champ('identite.id', 'texte', { obligation: 'requis', contraintes: { pattern: '^[a-z][a-z0-9-]{0,39}$' } }),
    champ('identite.nom', 'texte', { obligation: 'requis', contraintes: { maxLength: 80 } }),
    champ('couleurs.principal', 'couleur', { obligation: 'requis', contraintes: { pattern: '^#[0-9A-Fa-f]{6}$' } }),
    champ('couleurs.fond', 'couleur', { obligation: 'recommande' }),
    champ('couleurs.encre', 'couleur', { obligation: 'recommande' }),
    champ('couleurs.neutres[].nom', 'texte', { niveau: 1, contraintes: { maxLength: 40 } }),
    champ('couleurs.neutres[].valeur', 'couleur', { niveau: 1 }),
    champ('modes.sombre', 'enum', { obligation: 'requis', contraintes: { enum: ['aucun', 'derive', 'explicite'], defaut: 'derive' } }),
    champ('couleurs.sombre.principal', 'couleur', { niveau: 1, si: 'modes.sombre=explicite' }),
    champ('exigences.contrasteTexte', 'nombre', { obligation: 'requis', contraintes: { min: 4.5, max: 21, defaut: 4.5 } }),
    champ('exigences.classesMax', 'entier', { contraintes: { min: 3, max: 8, defaut: 5 } }),
    champ('typographie.graisses', 'liste', { niveau: 1, contraintes: { items: 'entier', min: 100, max: 900 } }),
    champ('typographie.familles[].role', 'enum', { niveau: 1, contraintes: { enum: ['titre', 'texte'] } }),
    champ('typographie.familles[].nom', 'texte', { niveau: 1, obligation: 'requis' }),
    champ('typographie.familles[].variantes', 'liste', { niveau: 1, contraintes: { items: 'texte' } }),
    champ('visualisation.categorielle', 'liste', { niveau: 1, contraintes: { items: 'couleur', min: 3, max: 8 }, aide: '3 à 8 couleurs séparées par des virgules.' }),
    champ('interaction.etats', 'liste', { niveau: 1, contraintes: { items: 'enum', enum: ['survol', 'actif', 'focus'] } }),
    champ('interaction.mouvement.respecteMouvementReduit', 'booleen', { obligation: 'recommande', contraintes: { const: true } })
  ]
});

describe('Design system : le catalogue en formulaire', () => {
  it('un catalogue qui n\'en est pas un est refusé, avec une phrase', () => {
    assert.throws(() => D.construire({}), /catalogue de design system/);
    assert.throws(() => D.construire({ _format: 'dsdef-catalogue/0.1', champs: [], modules: [] }), /aucun champ/);
    const double = catalogue();
    double.champs.push(champ('identite.id', 'texte'));
    assert.throws(() => D.construire(double), /en double/);
  });

  it('une étape par module, et seulement les champs du niveau demandé', () => {
    const n0 = D.construire(catalogue(), { niveau: 0 });
    assert.deepEqual(n0.formdef.sections.map((s) => s.id), ['m_identite', 'm_couleurs', 'm_modes', 'm_exigences', 'm_interaction']);
    const n1 = D.construire(catalogue(), { niveau: 1 });
    assert.ok(n1.formdef.sections.length > n0.formdef.sections.length);
    assert.ok(n1.plan.champs.length > n0.plan.champs.length);
  });

  it('un identifiant que l hôte renseigne lui-même ne se pose pas en question', () => {
    const { plan } = D.construire(catalogue(), { niveau: 0, ecarter: ['identite.id'] });
    assert.ok(!plan.champs.some((e) => e.id === 'identite.id'));
    assert.ok(plan.champs.some((e) => e.id === 'identite.nom'));
  });

  it('chaque type devient la bonne question', () => {
    const { formdef } = D.construire(catalogue(), { niveau: 1 });
    const q = {};
    formdef.sections.forEach((s) => s.fields.forEach((f) => { q[f.colId] = f; }));
    assert.equal(q.identite_id.widget, 'text');
    assert.equal(q.identite_id.required, true);
    assert.equal(q.identite_id.options.motif, '^[a-z][a-z0-9-]{0,39}$');
    assert.equal(q.identite_nom.options.motif, '^[\\s\\S]{0,80}$', 'une longueur maximale devient un motif');
    assert.equal(q.couleurs_principal.widget, 'couleur');
    assert.equal(q.modes_sombre.widget, 'radio', 'trois choix : des boutons');
    assert.deepEqual(formdef.choices.modes_sombre, ['aucun', 'derive', 'explicite']);
    assert.deepEqual(q.modes_sombre.options.depart, { source: 'valeur', valeur: 'derive' });
    assert.equal(q.exigences_contrasteTexte.type, 'Numeric');
    assert.equal(q.exigences_contrasteTexte.options.min, 4.5);
    assert.equal(q.exigences_classesMax.type, 'Int');
    assert.equal(q.interaction_mouvement_respecteMouvementReduit.widget, 'ouinon');
    assert.equal(q.interaction_mouvement_respecteMouvementReduit.options.depart.valeur, true);
    assert.match(q.couleurs_fond.description, /Recommandé\.$/);
  });

  it('les listes : une ligne par valeur, des cases, ou une ligne de nombres', () => {
    const { formdef, plan } = D.construire(catalogue(), { niveau: 1 });
    const q = {};
    formdef.sections.forEach((s) => s.fields.forEach((f) => { q[f.colId] = f; }));
    assert.equal(q.visualisation_categorielle.widget, 'groupe');
    assert.equal(q.visualisation_categorielle.options.champs[0].widget, 'couleur');
    assert.ok(!/virgules/.test(q.visualisation_categorielle.description), 'plus de virgules à écrire');
    assert.equal(q.interaction_etats.widget, 'multiselect');
    assert.deepEqual(formdef.choices.interaction_etats, ['survol', 'actif', 'focus']);
    assert.equal(q.typographie_graisses.widget, 'text');
    assert.match(q.typographie_graisses.options.motif, /\[0-9\]\+/);
    assert.equal(plan.champs.filter((e) => e.kind === 'groupe-objets').length, 2);
  });

  it('un groupe d\'objets réunit ses lignes, avec ses choix et sa liste sur une ligne', () => {
    const { formdef, plan } = D.construire(catalogue(), { niveau: 1 });
    const g = formdef.sections.reduce((acc, s) => acc.concat(s.fields), []).filter((f) => f.colId === 'typographie_familles')[0];
    assert.equal(g.widget, 'groupe');
    assert.deepEqual(g.options.champs.map((c) => c.colId), ['role', 'nom', 'variantes']);
    assert.deepEqual(g.options.champs[0].options.choices, ['titre', 'texte']);
    assert.equal(g.options.champs[1].required, true);
    const entree = plan.champs.filter((e) => e.colId === 'typographie_familles')[0];
    assert.deepEqual(entree.sous.map((s) => s.kind), ['enum', 'texte', 'csv']);
  });

  it('une condition suit sa question ; elle disparaît avec elle quand le niveau ne l\'inclut pas', () => {
    const n1 = D.construire(catalogue(), { niveau: 1 });
    const sombre = n1.formdef.sections.reduce((a, s) => a.concat(s.fields), []).filter((f) => f.colId === 'couleurs_sombre_principal')[0];
    assert.deepEqual(sombre.condition, { field: 'modes_sombre', operator: '==', value: 'explicite' });
    const cat = catalogue();
    cat.champs = cat.champs.filter((c) => c.id !== 'modes.sombre');
    const r = D.construire(cat, { niveau: 1 });
    assert.ok(r.avertissements.some((a) => /dépend d’une question absente/.test(a)));
  });

  it('le formulaire produit respecte le schéma FormDef publié', () => {
    const { valider } = require('../../../scripts/valider-schema.js');
    const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'runtime', 'formdef.schema.json'), 'utf8'));
    for (const niveau of [0, 1]) {
      const { formdef } = D.construire(catalogue(), { niveau });
      const erreurs = valider(formdef, schema, schema);
      assert.deepEqual(erreurs, [], 'niveau ' + niveau);
    }
  });
});

describe('Design system : réponses et document', () => {
  const plan = () => D.construire(catalogue(), { niveau: 1 }).plan;

  it('les réponses font un document ; une réponse vide n\'écrit rien', () => {
    const doc = D.assembler(plan(), {
      identite_id: 'mon-ds', identite_nom: '', couleurs_principal: ' #3D4F63 ', modes_sombre: 'derive', exigences_contrasteTexte: 4.5,
      typographie_graisses: '400, 700', interaction_etats: ['L', 'survol', 'focus'], interaction_mouvement_respecteMouvementReduit: true,
      typographie_familles: JSON.stringify([{ role: 'titre', nom: 'Sérif', variantes: 'gras, italique' }]),
      visualisation_categorielle: JSON.stringify([{ valeur: '#111111' }, { valeur: '#222222' }])
    });
    assert.equal(doc.dsdef, '0.1');
    assert.equal(doc.identite.id, 'mon-ds');
    assert.ok(!('nom' in doc.identite), 'vide : rien');
    assert.equal(doc.couleurs.principal, '#3D4F63');
    assert.deepEqual(doc.typographie.graisses, [400, 700]);
    assert.deepEqual(doc.interaction.etats, ['survol', 'focus']);
    assert.deepEqual(doc.typographie.familles, [{ role: 'titre', nom: 'Sérif', variantes: ['gras', 'italique'] }]);
    assert.deepEqual(doc.visualisation.categorielle, ['#111111', '#222222']);
    assert.equal(doc.interaction.mouvement.respecteMouvementReduit, true);
  });

  it('un document se relit dans le formulaire, puis se rassemble à l\'identique', () => {
    const doc = {
      dsdef: '0.1', identite: { id: 'ds', nom: 'Mon DS' }, couleurs: { principal: '#112233', neutres: [{ nom: 'gris', valeur: '#888888' }] },
      modes: { sombre: 'aucun' }, typographie: { graisses: [300, 500], familles: [{ role: 'texte', nom: 'Sans', variantes: ['gras'] }] },
      visualisation: { categorielle: ['#0a0a0a', '#1b1b1b', '#2c2c2c'] }, interaction: { etats: ['actif'] }
    };
    const valeurs = D.aplatir(plan(), doc);
    assert.equal(valeurs.typographie_graisses, '300, 500');
    assert.deepEqual(valeurs.visualisation_categorielle, [{ valeur: '#0a0a0a' }, { valeur: '#1b1b1b' }, { valeur: '#2c2c2c' }]);
    // le moteur envoie les groupes en JSON : on simule ce passage
    const envoye = {};
    Object.keys(valeurs).forEach((k) => { envoye[k] = Array.isArray(valeurs[k]) && typeof valeurs[k][0] === 'object' ? JSON.stringify(valeurs[k]) : valeurs[k]; });
    const refait = D.assembler(plan(), envoye);
    assert.deepEqual(refait, doc);
  });

  it('un nom dangereux ne remonte pas dans l\'objet', () => {
    const p = { champs: [{ colId: 'x', id: '__proto__.polluee', kind: 'texte' }] };
    D.assembler(p, { x: 'oui' });
    assert.equal({}.polluee, undefined);
  });

  it('jusqu\'au bout dans le moteur : le catalogue d\'essai se remplit, s\'envoie, se rassemble', async () => {
    const { formdef, plan: pl } = D.construire(catalogue(), { niveau: 1 });
    const racine = createRoot();
    let recu = null;
    const client = {
      lireTable: () => Promise.resolve({ id: [] }),
      appliquer: (actions) => { recu = {}; Object.keys(actions[0][3]).forEach((k) => { recu[k] = actions[0][3][k][0]; }); return Promise.resolve([1]); }
    };
    const doc0 = { dsdef: '0.1', identite: { id: 'ds', nom: 'Mon DS' }, couleurs: { principal: '#112233', fond: '#ffffff', encre: '#000000' },
      modes: { sombre: 'derive' }, exigences: { contrasteTexte: 4.5 }, typographie: { familles: [{ role: 'titre', nom: 'Sérif' }], graisses: [400] },
      visualisation: { categorielle: ['#111111', '#222222', '#333333'] }, interaction: { etats: ['survol'], mouvement: { respecteMouvementReduit: true } } };
    const m = Engine.monter(racine, formdef, { client, valeurs: D.aplatir(pl, doc0) });
    await flush();
    for (let i = 0; i < 30 && !recu; i++) {
      const suivant = racine.querySelector('[data-action="next"]');
      const envoi = racine.querySelector('[data-action="submit"]');
      const bouton = suivant || envoi;
      if (!bouton) break;
      bouton.dispatchEvent('click');
      await flush();
      await flush();
    }
    m.demonter();
    assert.ok(recu, 'le formulaire est parti');
    const doc = D.assembler(pl, recu);
    assert.equal(doc.identite.nom, 'Mon DS');
    assert.deepEqual(doc.typographie.familles, [{ role: 'titre', nom: 'Sérif' }]);
    assert.deepEqual(doc.visualisation.categorielle, ['#111111', '#222222', '#333333']);
    assert.deepEqual(doc.interaction.etats, ['survol']);
  });

  it('le catalogue minimal fourni se remplit sans rien importer', () => {
    const { formdef, plan: pl } = D.construire(D.CATALOGUE_MINIMAL, { niveau: 0 });
    assert.equal(pl.champs.length, 10);
    assert.ok(formdef.sections.length >= 3);
    const doc = D.assembler(pl, { identite_id: 'x', identite_nom: 'X', identite_statut: 'brouillon', couleurs_principal: '#336699', modes_sombre: 'derive', exigences_contrasteTexte: 4.5, exigences_contrasteMinimal: 3 });
    const p = D.projeterThemeDef(doc);
    assert.equal(p.themedef.version, 'themedef-1.0');
    assert.deepEqual(p.themedef.graines, { principal: '#336699' });
    assert.deepEqual(p.themedef.exigences, { contrasteTexte: 4.5, contrasteComposant: 3 });
  });
});

describe('Design system : les règles croisées', () => {
  const regles = (doc) => D.controler(doc).map((c) => c.regle + ':' + c.gravite);

  it('un brouillon incomplet n\'a aucun constat : une règle sans ses données est sautée', () => {
    assert.deepEqual(D.controler({ dsdef: '0.1', identite: { id: 'x' } }), []);
  });

  it('C1 : le texte sur le fond', () => {
    assert.deepEqual(regles({ couleurs: { encre: '#000000', fond: '#ffffff' } }), []);
    assert.deepEqual(regles({ couleurs: { encre: '#777777', fond: '#ffffff' } }), ['C1:erreur']);
    assert.deepEqual(regles({ couleurs: { encre: '#777777', fond: '#ffffff' }, exigences: { contrasteTexte: 3 } }), [], 'selon le seuil du document');
  });

  it('C2 : l\'avertissement s\'accepte quand l\'écart est déclaré, sinon G1 le réclame', () => {
    const doc = { couleurs: { principal: '#ef7757', fond: '#ffffff' } };
    assert.deepEqual(regles(doc), ['C2:avertissement', 'G1:erreur']);
    doc.gouvernance = { ecarts: [{ id: 'orange', regle: 'c2', raison: 'r', mitigation: 'm' }] };
    assert.deepEqual(regles(doc), ['C2:avertissement']);
    assert.equal(D.controler(doc)[0].declare, true);
  });

  it('C3 : les états, un par un', () => {
    const doc = { couleurs: { fond: '#ffffff', etats: { succes: '#18753c', attention: '#ffe600', erreur: '#ce0500' } } };
    const c = D.controler(doc).filter((x) => x.regle === 'C3');
    assert.equal(c.length, 1);
    assert.deepEqual(c[0].champs, ['couleurs.etats.attention', 'couleurs.fond']);
  });

  it('C4 : deux couleurs trop proches', () => {
    assert.deepEqual(regles({ couleurs: { principal: '#336699', secondaire: '#346a9a' } }), ['C4:erreur']);
    assert.deepEqual(regles({ couleurs: { principal: '#336699', secondaire: '#ef7757' } }), []);
  });

  it('M1 : un mode sombre explicite a ses trois couleurs, qui passent C1', () => {
    assert.deepEqual(regles({ modes: { sombre: 'explicite' }, couleurs: { sombre: { principal: '#aabbcc' } } }), ['M1:erreur']);
    const manque = D.controler({ modes: { sombre: 'explicite' }, couleurs: { sombre: { principal: '#aabbcc' } } })[0];
    assert.deepEqual(manque.champs, ['couleurs.sombre.encre', 'couleurs.sombre.fond']);
    assert.deepEqual(regles({ modes: { sombre: 'explicite' }, couleurs: { sombre: { principal: '#aabbcc', encre: '#ffffff', fond: '#000000' } } }), []);
    assert.deepEqual(regles({ modes: { sombre: 'explicite' }, couleurs: { sombre: { principal: '#aabbcc', encre: '#555555', fond: '#444444' } } }), ['M1:erreur']);
    assert.deepEqual(regles({ modes: { sombre: 'derive' }, couleurs: {} }), []);
  });

  it('I1 à I3, V1, V2, T1', () => {
    assert.deepEqual(regles({ interaction: { cibleMinPx: 20, focus: { contrasteMin: 2 }, mouvement: { respecteMouvementReduit: false } } }), ['I1:erreur', 'I2:erreur', 'I3:erreur']);
    assert.deepEqual(regles({ interaction: { cibleMinPx: 44, focus: { contrasteMin: 3 } } }), []);
    const six = ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'];
    assert.deepEqual(regles({ visualisation: { categorielle: six } }), ['V1:avertissement', 'G1:erreur']);
    assert.deepEqual(regles({ visualisation: { categorielle: six, motifsSiDaltonisme: true } }), []);
    assert.deepEqual(regles({ visualisation: { divergente: ['#111111', '#222222', '#333333', '#444444'] } }), ['V2:erreur']);
    assert.deepEqual(regles({ visualisation: { divergente: ['#111111', '#222222', '#333333'] } }), []);
    assert.deepEqual(regles({ typographie: { echelle: { base: 14 } } }), ['T1:avertissement', 'G1:erreur']);
  });

  it('seul un constat « erreur » empêche de proposer', () => {
    const constats = D.controler({ couleurs: { principal: '#ef7757', fond: '#ffffff', encre: '#777777' } });
    assert.deepEqual(D.bloquants(constats).map((c) => c.regle), ['C1', 'G1']);
  });

  it('les mesures : contraste WCAG et écart perceptif', () => {
    assert.equal(Math.round(D.contraste('#000000', '#ffffff') * 10) / 10, 21);
    assert.equal(D.contraste('bleu', '#ffffff'), null);
    assert.ok(D.ecart('#000000', '#ffffff') > 90);
    assert.equal(D.ecart('#336699', '#336699'), 0);
  });
});

describe('Design system : ThemeDef, table et empreinte', () => {
  it('la projection ne garde que ce que ThemeDef 1.0 porte, sans resolu', () => {
    const p = D.projeterThemeDef({
      identite: { nom: 'Mon DS' }, couleurs: { principal: '#112233', secondaire: '#445566', encre: '#000000', fond: '#ffffff', etats: { erreur: '#ce0500' } },
      modes: { sombre: 'explicite' }, exigences: { contrasteTexte: 7, contrasteMinimal: 3, classesMax: 5 }
    });
    assert.deepEqual(Object.keys(p.themedef).sort(), ['exigences', 'graines', 'modes', 'nom', 'version']);
    assert.equal(p.themedef.modes.sombre, 'derive');
    assert.equal(p.themedef.exigences.contrasteTexte, 7);
    assert.ok(p.remarques.some((r) => /explicite/.test(r)));
    assert.ok(!('resolu' in p.themedef));
    assert.ok(D.projeterThemeDef({ identite: { nom: 'x' } }).remarques.some((r) => /principale/.test(r)));
  });

  it('la ligne de table : jamais active, bornée', () => {
    const ligne = D.ligneDeDocument({ dsdef: '0.1', identite: { nom: 'Mon DS' } }, 'mon-ds', 'brouillon', 1);
    assert.equal(ligne.actif, false);
    assert.equal(ligne.statut, 'brouillon');
    assert.equal(ligne.version, 'dsdef-0.1');
    assert.equal(ligne.nom, 'Mon DS');
    assert.deepEqual(JSON.parse(ligne.dsdef).identite, { nom: 'Mon DS' });
    assert.throws(() => D.ligneDeDocument({ x: 'a'.repeat(500000) }, 'k', 'brouillon', 0), /dépasse/);
    assert.deepEqual(D.COLONNES.map((c) => c.id), ['cle', 'nom', 'statut', 'niveau', 'dsdef', 'actif', 'version', 'maj', 'hash']);
  });

  it('la clé d\'une ligne se tire d\'un nom', () => {
    assert.equal(D.cleDepuisNom('Design système Été 2026'), 'design-systeme-ete-2026');
    assert.match(D.cleDepuisNom('2026'), /^[a-z][a-z0-9-]{0,39}$/);
    assert.match(D.cleDepuisNom('   '), /^[a-z][a-z0-9-]{0,39}$/);
    assert.ok(D.cleDepuisNom('x'.repeat(100)).length <= 40);
  });

  it('la forme canonique et l\'empreinte ne dépendent pas de l\'ordre des clés', async () => {
    assert.equal(D.canonique({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
    const a = await D.empreinte({ a: 1, b: 2 });
    const b = await D.empreinte({ b: 2, a: 1 });
    assert.match(a, /^sha256-[A-Za-z0-9+/]+=*$/);
    assert.equal(a, b);
    assert.notEqual(a, await D.empreinte({ a: 1, b: 3 }));
  });
});

// ── Un vrai catalogue, s'il est là ────────────────────────────────────────────

const DOSSIER = process.env.DSDEF_DIR;
const dispo = DOSSIER && fs.existsSync(path.join(DOSSIER, 'designsystemdef.catalogue.json'));

describe('Design system : un vrai catalogue, de bout en bout', { skip: !dispo && 'DSDEF_DIR non renseignée' }, () => {
  const lireJson = (f) => JSON.parse(fs.readFileSync(path.join(DOSSIER, f), 'utf8'));
  const decoder = (s) => (typeof s === 'string' ? s.split('&amp;').join('&').split('&#39;').join('\'').split('&quot;').join('"') : s);

  function egal(a, b, chemin, diffs) {
    if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) { diffs.push(chemin); return; }
    if (a && typeof a === 'object') { new Set(Object.keys(a).concat(Object.keys(b))).forEach((k) => egal(a[k], b[k], chemin + '.' + k, diffs)); } else if (a !== decoder(b)) diffs.push(chemin);
  }

  for (const niveau of [0, 1, 2, 3]) {
    it('niveau ' + niveau + ' : l\'instance remplit le formulaire, part, et se retrouve à l\'identique', async () => {
      const cat = lireJson('designsystemdef.catalogue.json');
      const inst = lireJson(fs.readdirSync(DOSSIER).filter((f) => /^designsystemdef..+.json$/.test(f) && !/catalogue|schema/.test(f))[0]);
      const { formdef, plan } = D.construire(cat, { niveau });
      const racine = createRoot();
      let recu = null;
      const client = {
        lireTable: () => Promise.resolve({ id: [] }),
        appliquer: (actions) => { recu = {}; Object.keys(actions[0][3]).forEach((k) => { recu[k] = actions[0][3][k][0]; }); return Promise.resolve([1]); }
      };
      const m = Engine.monter(racine, formdef, { client, valeurs: D.aplatir(plan, inst) });
      await flush();
      for (let i = 0; i < 40 && !recu; i++) {
        const bouton = racine.querySelector('[data-action="commencer"]') || racine.querySelector('[data-action="next"]') || racine.querySelector('[data-action="submit"]');
        if (!bouton) break;
        bouton.dispatchEvent('click');
        await flush();
        await flush();
      }
      m.demonter();
      assert.ok(recu, 'le formulaire est parti sans rien refuser');
      const doc = D.assembler(plan, recu);
      const attendu = { dsdef: inst.dsdef };
      plan.champs.forEach((e) => {
        const ch = e.id.split('.');
        const v = ch.reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), inst);
        if (v === undefined) return;
        let c = attendu;
        ch.slice(0, -1).forEach((k) => { c[k] = c[k] || {}; c = c[k]; });
        c[ch[ch.length - 1]] = v;
      });
      const ecarts = [];
      egal(attendu, doc, '', ecarts);
      assert.deepEqual(ecarts, [], 'rien ne se perd entre l\'instance et le document');
    });
  }

  it('toute question du catalogue est couverte au niveau 3, chacune une fois', () => {
    const cat = lireJson('designsystemdef.catalogue.json');
    const { plan } = D.construire(cat, { niveau: 3 });
    const couverts = new Set();
    plan.champs.forEach((e) => {
      if (e.kind === 'groupe-objets') e.sous.forEach((s) => couverts.add(e.id + '[].' + s.id));
      else couverts.add(e.id);
    });
    cat.champs.forEach((f) => assert.ok(couverts.has(f.id), f.id + ' absent du formulaire'));
    assert.equal(couverts.size, cat.champs.length);
  });
});
