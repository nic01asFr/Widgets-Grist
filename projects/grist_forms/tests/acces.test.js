'use strict';

/*
 * Qui voit les réponses : les règles d'accès qu'un formulaire demande. Le module ne parle pas à Grist ;
 * on vérifie ici ce qu'il propose, l'ordre qu'il respecte (mesuré en réel : Grist refuse une règle placée
 * après une règle sans condition) et qu'il ne touche jamais à une règle étrangère.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const A = require('../shared/acces.js');

const champ = (colId, type, extra) => Object.assign({ colId, type: type || 'Text', widget: 'text' }, extra || {});
const def = (extra) => Object.assign({
  id: 'ateliers', title: 'Ateliers', tableId: 'Inscriptions',
  sections: [{ label: 'S', fields: [champ('Atelier', 'Choice'), champ('Nom'), champ('Courriel', 'Text', { options: { validation: { format: 'courriel' } } })] }]
}, extra || {});

const lire = (regles) => regles.map((r) => [r.tableId, r.colIds, r.permissionsText, r.aclFormula]);

describe('Accès — tout le monde voit tout', () => {
  it('ne pose aucune règle et le dit', () => {
    const p = A.planRegles(def(), { mode: 'ouvert' });
    assert.equal(p.ok, true);
    assert.deepEqual(p.regles, []);
    assert.match(p.avertissements.join(' '), /toute personne qui ouvre le document/);
  });
});

describe('Accès — les participants ajoutent, sans rien lire', () => {
  it('garde les droits aux propriétaires, laisse ajouter, refuse tout le reste', () => {
    const p = A.planRegles(def(), { mode: 'ajout-seul' });
    assert.equal(p.ok, true);
    assert.deepEqual(lire(p.regles), [
      ['Inscriptions', '*', '+CRUDS', 'user.Access == OWNER'],
      ['Inscriptions', '*', '+C-RUDS', '']
    ]);
  });

  it('les colonnes qui servent à compter les places restent lisibles, AVANT la table (le plus précis d\'abord)', () => {
    const p = A.planRegles(def({ limites: { total: 20, parChoix: [{ colId: 'Atelier', max: 12 }], sauf: { colId: 'Statut', valeurs: ['Annulé'] } } }), { mode: 'ajout-seul' });
    assert.deepEqual(lire(p.regles)[0], ['Inscriptions', 'Atelier,Statut', '+R', '']);
    assert.equal(p.regles[1].colIds, '*');
    assert.match(p.resume.join(' '), /Restent lisibles pour compter les places : Atelier, Statut \(sans noms ni courriels\)/);
    assert.ok(!p.regles.some((r) => /Nom|Courriel/.test(r.colIds)), 'ni noms ni courriels');
  });

  it('les tables liées sont lisibles en lecture seule, avec un avertissement', () => {
    const d = def();
    d.sections[0].fields.push(champ('Salle', 'Ref:Salles'));
    const p = A.planRegles(d, { mode: 'ajout-seul' });
    assert.deepEqual(lire(p.regles).filter((r) => r[0] === 'Salles'), [
      ['Salles', '*', '+CRUDS', 'user.Access == OWNER'],
      ['Salles', '*', '+R-CUDS', '']
    ]);
    assert.match(p.avertissements.join(' '), /tables liées \(Salles\)/);
    assert.deepEqual(A.tablesLiees(d), ['Salles']);
  });

  it('une table liée peut aussi se dire par refTable ; la table des réponses n\'est pas une table liée', () => {
    const d = def();
    d.sections[0].fields.push(champ('A', 'Ref', { options: { refTable: 'Ateliers' } }), champ('B', 'Ref:Inscriptions'));
    assert.deepEqual(A.tablesLiees(d), ['Ateliers']);
  });

  it('cacher le reste du document : un refus par défaut, après tout le reste', () => {
    const p = A.planRegles(def(), { mode: 'ajout-seul', defautRefus: true });
    const l = lire(p.regles);
    assert.deepEqual(l.slice(-2), [['*', '*', '+CRUDS', 'user.Access == OWNER'], ['*', '*', '-CRUDS', '']]);
    assert.match(p.resume.join(' '), /Tout le reste du document est caché/);
    assert.ok(!/restent visibles de tout éditeur/.test(p.avertissements.join(' ')));
  });

  it('sans refus par défaut, il avertit que le reste du document reste visible', () => {
    const p = A.planRegles(def(), { mode: 'ajout-seul' });
    assert.match(p.avertissements.join(' '), /autres tables et pages du document restent visibles de tout éditeur/);
  });
});

describe('Accès — chacun voit sa propre réponse', () => {
  it('reconnaît la personne à son courriel, avant la règle qui clôt la table', () => {
    const p = A.planRegles(def(), { mode: 'propres' });
    assert.equal(p.ok, true);
    assert.deepEqual(lire(p.regles), [
      ['Inscriptions', '*', '+CRUDS', 'user.Access == OWNER'],
      ['Inscriptions', '*', '+R', 'user.Email and rec.Courriel == user.Email'],
      ['Inscriptions', '*', '+C-RUDS', '']
    ]);
    assert.match(p.avertissements.join(' '), /personne connectée à Grist/);
  });

  it('exige une question courriel : sans elle, personne ne serait reconnu', () => {
    const d = def();
    d.sections[0].fields = [champ('Nom')];
    const p = A.planRegles(d, { mode: 'propres' });
    assert.equal(p.ok, false);
    assert.match(p.erreurs.join(' '), /question « Courriel »/);
    assert.deepEqual(p.regles.filter((r) => /rec\./.test(r.aclFormula)), []);
  });

  it('prend la colonne de courriel de `meta.emailCol` quand aucune question n\'en porte le format', () => {
    const d = def({ meta: { emailCol: 'Mel' } });
    d.sections[0].fields = [champ('Nom')];
    assert.equal(A.planRegles(d, { mode: 'propres' }).regles[1].aclFormula, 'user.Email and rec.Mel == user.Email');
  });
});

describe('Accès — qui garde les droits', () => {
  it('les propriétaires, et des personnes désignées par leur courriel', () => {
    const p = A.planRegles(def(), { mode: 'ajout-seul', gestionnaires: ['Alice@Exemple.FR', ' bob@exemple.fr '] });
    assert.equal(p.regles[0].aclFormula, "user.Access == OWNER or user.Email in ['alice@exemple.fr', 'bob@exemple.fr']");
  });

  it('refuse un courriel qui pourrait sortir de la formule (apostrophe, guillemet, crochet, virgule)', () => {
    ["a'b@exemple.fr", 'a"b@exemple.fr', 'a]b@exemple.fr', 'a,b@exemple.fr', 'a\\b@exemple.fr', 'pas-un-courriel', "x@y.fr'] or True or ['"].forEach((e) => {
      const p = A.planRegles(def(), { mode: 'ajout-seul', gestionnaires: [e] });
      assert.equal(p.ok, false, e);
      assert.deepEqual(p.regles, [], e);
    });
  });

  it('un réglage inconnu, ou pas de table des réponses, est une erreur', () => {
    assert.equal(A.planRegles(def(), { mode: 'tous' }).ok, false);
    assert.equal(A.planRegles({ id: 'x' }, { mode: 'ajout-seul' }).ok, false);
    assert.equal(A.planRegles({ id: 'x', tableId: 'T; drop' }, { mode: 'ajout-seul' }).ok, false);
  });
});

describe('Accès — l\'ordre que Grist accepte', () => {
  it('aucune règle ne suit une règle sans condition dans la même ressource, pour tous les réglages', () => {
    const d = def({ limites: { total: 5, parChoix: [{ colId: 'Atelier', max: 3 }] } });
    d.sections[0].fields.push(champ('Salle', 'Ref:Salles'));
    ['ajout-seul', 'propres'].forEach((mode) => [false, true].forEach((defautRefus) => {
      const p = A.planRegles(d, { mode, defautRefus, gestionnaires: ['a@exemple.fr'] });
      assert.equal(p.ok, true, mode);
      assert.deepEqual(A.ordreInvalide(p.regles), [], mode + ' refus=' + defautRefus);
    }));
  });

  it('le garde-fou reconnaît ce que Grist a refusé en réel (« +C » puis « -RUDS » sans condition)', () => {
    const fautes = A.ordreInvalide([
      { tableId: 'T', colIds: '*', aclFormula: 'user.Access == OWNER', permissionsText: '+CRUDS' },
      { tableId: 'T', colIds: '*', aclFormula: '', permissionsText: '+C' },
      { tableId: 'T', colIds: '*', aclFormula: '', permissionsText: '-RUDS' }
    ]);
    assert.equal(fautes.length, 1);
    assert.match(fautes[0], /suit une règle sans condition/);
  });

  it('les colonnes précises viennent avant la table, la table avant le défaut', () => {
    const p = A.planRegles(def({ limites: { total: 5, parChoix: [{ colId: 'Atelier', max: 3 }] } }), { mode: 'ajout-seul', defautRefus: true });
    const ordre = p.regles.map((r) => (r.tableId === '*' ? 3 : r.colIds === '*' ? 2 : 1));
    assert.deepEqual(ordre, [...ordre].sort((a, b) => a - b));
  });
});

describe('Accès — poser, sans toucher à ce qui existe', () => {
  const ressources = [{ id: 1, tableId: '', colIds: '' }, { id: 2, tableId: '*', colIds: '*' }];
  const regles = [{ id: 1, resource: 1, rulePos: null, memo: '', aclFormula: '', permissionsText: '' }];

  it('des lignes nouvelles, des ressources numérotées après les existantes, un mémo pour les retrouver', () => {
    const p = A.planRegles(def({ limites: { total: 5, parChoix: [{ colId: 'Atelier', max: 3 }] } }), { mode: 'ajout-seul' });
    const a = A.actionsPose(p.regles, { ressources, regles });
    assert.equal(a.ok, true);
    assert.deepEqual(a.actions.filter((x) => x[1] === '_grist_ACLResources').map((x) => [x[0], x[2], x[3].tableId, x[3].colIds]),
      [['AddRecord', 3, 'Inscriptions', 'Atelier'], ['AddRecord', 4, 'Inscriptions', '*']]);
    const r = a.actions.filter((x) => x[1] === '_grist_ACLRules');
    assert.deepEqual(r.map((x) => x[2]), [2, 3, 4], 'ids après les existants');
    assert.deepEqual(r.map((x) => x[3].rulePos), [1, 2, 3], 'positions croissantes, dans l\'ordre d\'évaluation');
    assert.ok(r.every((x) => x[3].memo === 'form-builder:ateliers'));
    assert.deepEqual(r.map((x) => x[3].resource), [3, 4, 4]);
  });

  it('réutilise une ressource qui existe déjà au lieu d\'en créer une seconde', () => {
    const p = A.planRegles(def(), { mode: 'ajout-seul', defautRefus: true });
    const a = A.actionsPose(p.regles, { ressources, regles });
    assert.ok(!a.actions.some((x) => x[1] === '_grist_ACLResources' && x[3].tableId === '*'), 'la ressource */* existe');
    assert.ok(a.actions.some((x) => x[1] === '_grist_ACLRules' && x[3].resource === 2), 'les règles par défaut s\'y rattachent');
  });

  it('refuse de croiser des règles étrangères sur la même table : jamais de modification en silence', () => {
    const p = A.planRegles(def(), { mode: 'ajout-seul' });
    const etrangeres = { ressources: [...ressources, { id: 3, tableId: 'Inscriptions', colIds: '*' }], regles: [...regles, { id: 2, resource: 3, rulePos: 1, memo: 'a-la-main', aclFormula: 'user.Access == OWNER', permissionsText: '+CRUDS' }] };
    const a = A.actionsPose(p.regles, etrangeres);
    assert.equal(a.ok, false);
    assert.match(a.erreurs.join(' '), /règles d’accès existent déjà pour « Inscriptions »/);
    assert.deepEqual(a.actions, []);
  });

  it('refuse de poser deux fois les mêmes règles', () => {
    const p = A.planRegles(def(), { mode: 'ajout-seul' });
    const deja = { ressources: [...ressources, { id: 3, tableId: 'Inscriptions', colIds: '*' }], regles: [...regles, { id: 2, resource: 3, rulePos: 1, memo: 'form-builder:ateliers', aclFormula: '', permissionsText: '+CRUDS' }] };
    const a = A.actionsPose(p.regles, deja);
    assert.equal(a.ok, false);
    assert.match(a.erreurs.join(' '), /déjà posées/);
  });

  it('sans règle à poser (tout le monde voit tout), aucune action', () => {
    assert.deepEqual(A.actionsPose([], { ressources, regles }), { ok: true, erreurs: [], infos: [], actions: [] });
  });
});

describe('Accès — retirer, sans toucher à ce qui n\'est pas à nous', () => {
  const memo = 'form-builder:ateliers';
  const existant = {
    ressources: [{ id: 1, tableId: '', colIds: '' }, { id: 2, tableId: '*', colIds: '*' }, { id: 3, tableId: 'Inscriptions', colIds: 'Atelier' }, { id: 4, tableId: 'Inscriptions', colIds: '*' }],
    regles: [
      { id: 1, resource: 1, memo: '' },
      { id: 2, resource: 2, memo: 'a-la-main', aclFormula: 'user.Access == OWNER', permissionsText: '+CRUDS' },
      { id: 3, resource: 3, memo }, { id: 4, resource: 4, memo }, { id: 5, resource: 4, memo },
      { id: 6, resource: 2, memo }
    ]
  };

  it('retire les règles qui portent le mémo, et les ressources que plus rien n\'utilise', () => {
    const a = A.actionsRetrait(def(), existant);
    assert.deepEqual(a.filter((x) => x[1] === '_grist_ACLRules').map((x) => x[2]), [3, 4, 5, 6]);
    assert.deepEqual(a.filter((x) => x[1] === '_grist_ACLResources').map((x) => x[2]).sort(), [3, 4]);
  });

  it('ne retire jamais la ressource de base du document, ni une ressource que d\'autres règles utilisent', () => {
    const a = A.actionsRetrait(def(), existant);
    assert.ok(!a.some((x) => x[1] === '_grist_ACLResources' && (x[2] === 1 || x[2] === 2)));
    assert.ok(!a.some((x) => x[1] === '_grist_ACLRules' && x[2] === 2), 'la règle à la main reste');
  });

  it('un autre formulaire n\'est pas touché', () => {
    assert.deepEqual(A.actionsRetrait(def({ id: 'autre' }), existant), []);
  });

  it('retrouve le réglage posé à partir des règles', () => {
    assert.equal(A.modePose(def(), { regles: [] }), null);
    assert.equal(A.modePose(def(), { regles: [{ memo, aclFormula: 'user.Access == OWNER' }, { memo, aclFormula: '' }] }), 'ajout-seul');
    assert.equal(A.modePose(def(), { regles: [{ memo, aclFormula: 'user.Email and rec.Courriel == user.Email' }] }), 'propres');
  });
});

describe('Accès — un document partagé avec le public', () => {
  it('cache le reste du document d\'office : sinon un anonyme pourrait modifier la structure des autres tables', () => {
    const p = A.planRegles(def(), { mode: 'ajout-seul', public: true });
    assert.equal(p.ok, true);
    const dernieres = lire(p.regles).slice(-2);
    assert.deepEqual(dernieres[1], ['*', '*', '-CRUDS', '']);
    assert.match(p.resume.join(' '), /Tout le reste du document est caché/);
  });

  it('prévient que personne n\'est identifié, et que le partage public est l\'affaire du propriétaire', () => {
    const w = A.planRegles(def(), { mode: 'ajout-seul', public: true }).avertissements.join(' ');
    assert.match(w, /personne n’est identifié/);
    assert.match(w, /Form Builder n’y touche pas/);
  });

  it('prévient d\'un téléversement de pièce jointe sans garde', () => {
    const d = def();
    d.sections[0].fields.push(champ('Photo', 'Attachments', { widget: 'file' }));
    assert.match(A.planRegles(d, { mode: 'ajout-seul', public: true }).avertissements.join(' '), /sans que les règles s’appliquent/);
    assert.doesNotMatch(A.planRegles(def(), { mode: 'ajout-seul', public: true }).avertissements.join(' '), /pièce jointe/);
  });

  it('sans accès public, le reste du document n\'est pas touché par défaut', () => {
    const l = lire(A.planRegles(def(), { mode: 'ajout-seul' }).regles);
    assert.ok(!l.some((r) => r[0] === '*'));
  });
});

describe('Accès — le reste du document déjà fermé', () => {
  const existant = () => ({
    ressources: [{ id: 1, tableId: '', colIds: '' }, { id: 2, tableId: '*', colIds: '*' }],
    regles: [
      { id: 8, resource: 2, rulePos: 7, memo: '', aclFormula: 'user.Access == OWNER', permissionsText: '+CRUDS', tableId: '*' },
      { id: 9, resource: 2, rulePos: 8, memo: '', aclFormula: '', permissionsText: '-CRUDS', tableId: '*' }
    ]
  });

  it('ne double pas une règle qui ferme déjà le reste du document, et ne la touche pas', () => {
    const plan = A.planRegles(def(), { mode: 'ajout-seul', public: true });
    const p = A.actionsPose(plan.regles, existant());
    assert.equal(p.ok, true, p.erreurs.join(' '));
    assert.match(p.infos.join(' '), /déjà fermé/);
    const ajouts = p.actions.filter((a) => a[1] === '_grist_ACLRules').map((a) => a[3].permissionsText);
    assert.deepEqual(ajouts, ['+CRUDS', '+C-RUDS']);
    assert.ok(!p.actions.some((a) => a[0] !== 'AddRecord'), 'rien n’est modifié ni retiré');
  });

  it('garde le refus si des gestionnaires doivent avoir des droits que la règle existante ne leur donne pas', () => {
    const plan = A.planRegles(def(), { mode: 'ajout-seul', public: true, gestionnaires: ['a@x.fr'] });
    const p = A.actionsPose(plan.regles, existant());
    assert.equal(p.ok, false);
    assert.match(p.erreurs.join(' '), /existent déjà/);
  });

  it('une règle de défaut qui ne ferme pas tout n\'est pas prise pour une fermeture', () => {
    const e = existant();
    e.regles[1].permissionsText = '-U';
    const plan = A.planRegles(def(), { mode: 'ajout-seul', public: true });
    assert.equal(A.actionsPose(plan.regles, e).ok, false);
  });
});
