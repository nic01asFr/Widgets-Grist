'use strict';

/**
 * Le geste « appliquer ce thème au document » : ce qui se décide avant d'écrire. Aucun document, aucune page : on prépare, on juge, on relit.
 * La bascule elle-même (désactiver l'ancien, activer le nouveau) est celle du kit, rejouée dans activation.test.js.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../shared/activation-geste.js');
const A = require('../shared/activation.js');

const theme = (extra) => Object.assign({ version: 'themedef-1.0', nom: 'Forêt', graines: { principal: '#0b6e4f', secondaire: '#f4a259' }, modes: { sombre: 'derive' } }, extra || {});
const ligne = (id, cle, actif, td) => ({ id, cle, actif, themedef: JSON.stringify(td || theme({ nom: 'Ancien ' + cle })), maj: 1, version: 'themedef-1.0', hash: 'x' });
const MAINTENANT = 1793500000123;

describe('Geste : la clé de ligne', () => {
  it('tirée d\'un nom : minuscules, sans accent, tirets, toujours une clé valide', () => {
    assert.equal(G.cleDe('Forêt d\'automne'), 'foret-d-automne');
    assert.equal(G.cleDe('  Mon Thème  '), 'mon-theme');
    assert.equal(G.cleDe('2026 Charte'), 'ds-2026-charte');
    assert.equal(G.cleDe(''), 'theme');
    assert.equal(G.cleDe(null), 'theme');
    assert.equal(G.cleDe('日本語'), 'theme');
    const longue = G.cleDe('a'.repeat(80));
    assert.ok(longue.length <= 40);
    ['Forêt', 'x'.repeat(100), '---', '9', 'É'].forEach((t) => assert.match(G.cleDe(t), /^[a-z][a-z0-9-]{0,39}$/, t));
  });
});

describe('Geste : préparer l\'activation', () => {
  it('table lue, thème valide : prêt, avec le lot du kit et ce qu\'il remplace', () => {
    const p = G.preparer({ themedef: theme(), cle: 'foret', lignes: [ligne(1, 'ancien', true), ligne(2, 'autre', false)], maintenant: MAINTENANT });
    assert.equal(p.etat, 'pret');
    assert.equal(p.nom, 'Forêt');
    assert.equal(p.miseAJour, false);
    assert.deepEqual(p.remplace, [{ id: 1, cle: 'ancien', nom: 'Ancien ancien' }]);
    assert.deepEqual(p.actions[0], ['UpdateRecord', 'Theme_document', 1, { actif: false }]);
    assert.equal(p.actions[1][0], 'AddRecord');
    assert.equal(p.actions[1][3].cle, 'foret');
    assert.equal(p.actions[1][3].actif, true);
    assert.equal(p.actions.length, 2);
  });

  it('la clé est tirée du nom quand on n\'en donne pas', () => {
    assert.equal(G.preparer({ themedef: theme(), lignes: [], maintenant: MAINTENANT }).cle, 'foret');
  });

  it('une clé qui existe déjà est mise à jour, sans doublon, et n\'est pas « remplacée »', () => {
    const p = G.preparer({ themedef: theme(), cle: 'foret', lignes: [ligne(1, 'foret', true), ligne(2, 'autre', true)], maintenant: MAINTENANT });
    assert.equal(p.miseAJour, true);
    assert.deepEqual(p.remplace.map((r) => r.cle), ['autre']);
    assert.equal(p.actions.filter((a) => a[0] === 'AddRecord').length, 0);
  });

  it('table absente : on demande de la créer, après avoir jugé le thème, et rien n\'est écrit', () => {
    const p = G.preparer({ themedef: theme(), cle: 'foret', lignes: null, maintenant: MAINTENANT });
    assert.equal(p.etat, 'table-a-creer');
    assert.deepEqual(p.remplace, []);
    assert.ok(p.actions.every((a) => a[0] !== 'AddTable'), 'la création de la table n\'est pas dans le lot : c\'est un geste à part, confirmé');
  });

  it('un thème refusé : AUCUNE action, et on ne propose pas de créer la table pour lui', () => {
    const casse = theme({ version: 'themedef-9' });
    const sur = G.preparer({ themedef: casse, cle: 'foret', lignes: [ligne(1, 'ancien', true)], maintenant: MAINTENANT });
    assert.equal(sur.etat, 'refus');
    assert.deepEqual(sur.actions, []);
    assert.ok(sur.phrases.length >= 1 && sur.phrases.every((x) => typeof x === 'string' && x.length > 0));
    const sans = G.preparer({ themedef: casse, cle: 'foret', lignes: null, maintenant: MAINTENANT });
    assert.equal(sans.etat, 'refus', 'refusé avant même de parler de la table');
    assert.deepEqual(sans.actions, []);
  });

  it('un thème sans couleur principale est refusé en français', () => {
    const p = G.preparer({ themedef: { version: 'themedef-1.0', nom: 'Vide' }, cle: 'vide', lignes: [], maintenant: MAINTENANT });
    assert.equal(p.etat, 'refus');
    assert.match(p.phrases.join(' '), /principal/);
  });

  it('ce que le validateur écarte est dit, pas caché', () => {
    const p = G.preparer({ themedef: theme({ police: 'comic', resolu: {}, hash: 'z' }), cle: 'foret', lignes: [], maintenant: MAINTENANT });
    assert.equal(p.etat, 'pret');
    assert.ok(p.ecarts.some((e) => /police/.test(e)));
    assert.ok(p.ecarts.some((e) => /résolues/.test(e)));
  });

  it('une clé invalide est refusée (jamais corrigée en silence)', () => {
    const p = G.preparer({ themedef: theme(), cle: 'Forêt Noire', lignes: [], maintenant: MAINTENANT });
    assert.equal(p.etat, 'refus');
    assert.deepEqual(p.actions, []);
  });

  it('les lignes du kit passent telles quelles : une table pleine refuse l\'ajout', () => {
    const lignes = []; for (let i = 1; i <= 50; i++) lignes.push(ligne(i, 't' + i, false));
    const p = G.preparer({ themedef: theme(), cle: 'foret', lignes, maintenant: MAINTENANT });
    assert.equal(p.etat, 'refus');
    assert.match(p.phrases.join(' '), /50 lignes/);
  });
});

describe('Geste : retirer le thème du document', () => {
  it('met actif à faux sur toutes les lignes actives, en un lot, sans rien supprimer', () => {
    const r = G.retrait([ligne(1, 'a', true), ligne(2, 'b', false), ligne(3, 'c', true)]);
    assert.deepEqual(r.actions, [['UpdateRecord', 'Theme_document', 1, { actif: false }], ['UpdateRecord', 'Theme_document', 3, { actif: false }]]);
    assert.deepEqual(r.retire.map((x) => x.cle), ['a', 'c']);
  });

  it('rien d\'actif ou pas de table : aucune action', () => {
    assert.deepEqual(G.retrait([ligne(1, 'a', false)]).actions, []);
    assert.deepEqual(G.retrait(null).actions, []);
    assert.deepEqual(G.retrait(undefined).actions, []);
  });

  it('une ligne sans identifiant valide n\'est pas touchée', () => {
    assert.deepEqual(G.retrait([{ cle: 'a', actif: true }, { id: 0, cle: 'b', actif: true }, { id: 1.5, cle: 'c', actif: true }]).actions, []);
  });
});

describe('Geste : relire ce que les lecteurs verront', () => {
  it('une seule ligne active et lisible : appliqué, avec son nom', () => {
    assert.deepEqual(G.relire([ligne(1, 'a', false), ligne(2, 'foret', true, theme())]), { raison: 'applique', cle: 'foret', nom: 'Forêt' });
  });

  it('plusieurs actives (deux écrivains en même temps) : les lecteurs n\'appliquent RIEN, et on le dit', () => {
    assert.equal(G.relire([ligne(1, 'a', true), ligne(2, 'b', true)]).raison, 'plusieurs-actifs');
  });

  it('aucune active, une table vide, absente : rien n\'est appliqué', () => {
    assert.equal(G.relire([ligne(1, 'a', false)]).raison, 'aucun-actif');
    assert.equal(G.relire([]).raison, 'aucun-actif');
    assert.equal(G.relire(null).raison, 'aucun-actif');
  });

  it('une ligne active illisible : invalide', () => {
    assert.equal(G.relire([{ id: 1, cle: 'a', actif: true, themedef: '{pas du json' }]).raison, 'invalide');
  });
});

describe('Geste : de bout en bout sur une table simulée', () => {
  /** Applique un lot du kit à une table en mémoire, comme Grist le ferait. */
  function appliquer(table, actions) {
    for (const [op, , id, champs] of actions) {
      if (op === 'AddRecord') table.push(Object.assign({ id: table.reduce((m, l) => Math.max(m, l.id), 0) + 1 }, champs));
      else if (op === 'UpdateRecord') Object.assign(table.find((l) => l.id === id), champs);
      else throw new Error('action inattendue : ' + op);
    }
  }

  it('deux thèmes activés l\'un après l\'autre : un seul reste actif, relu par la règle des lecteurs', () => {
    const table = [];
    appliquer(table, G.preparer({ themedef: theme({ nom: 'Premier' }), cle: 'premier', lignes: table, maintenant: MAINTENANT }).actions);
    assert.deepEqual(G.relire(table), { raison: 'applique', cle: 'premier', nom: 'Premier' });
    appliquer(table, G.preparer({ themedef: theme({ nom: 'Second' }), cle: 'second', lignes: table, maintenant: MAINTENANT + 1000 }).actions);
    assert.deepEqual(G.relire(table), { raison: 'applique', cle: 'second', nom: 'Second' });
    assert.equal(table.filter((l) => l.actif === true).length, 1);
    assert.equal(table.length, 2, 'l\'ancien n\'est pas supprimé : il est seulement désactivé');
  });

  it('réactiver une clé existante la met à jour sans doublon', () => {
    const table = [];
    appliquer(table, G.preparer({ themedef: theme({ nom: 'A' }), cle: 'a', lignes: table, maintenant: MAINTENANT }).actions);
    appliquer(table, G.preparer({ themedef: theme({ nom: 'B' }), cle: 'b', lignes: table, maintenant: MAINTENANT }).actions);
    appliquer(table, G.preparer({ themedef: theme({ nom: 'A deux' }), cle: 'a', lignes: table, maintenant: MAINTENANT }).actions);
    assert.equal(table.length, 2);
    assert.deepEqual(G.relire(table), { raison: 'applique', cle: 'a', nom: 'A deux' });
  });

  it('retirer puis relire : plus rien d\'appliqué, les lignes restent', () => {
    const table = [];
    appliquer(table, G.preparer({ themedef: theme(), cle: 'foret', lignes: table, maintenant: MAINTENANT }).actions);
    appliquer(table, G.retrait(table).actions);
    assert.equal(G.relire(table).raison, 'aucun-actif');
    assert.equal(table.length, 1);
  });

  it('la ligne écrite est lue telle quelle par le lecteur du moteur (même format que les autres lecteurs)', () => {
    const table = [];
    appliquer(table, G.preparer({ themedef: theme(), cle: 'foret', lignes: table, maintenant: MAINTENANT }).actions);
    const T = require('../shared/themedef.js');
    const colonnes = { id: [], cle: [], themedef: [], actif: [], maj: [], version: [], hash: [] };
    table.forEach((l) => Object.keys(colonnes).forEach((k) => colonnes[k].push(l[k])));
    const lu = T.lignesDeTable(colonnes);
    assert.equal(T.choisirActif(lu).ligne.cle, 'foret');
    assert.equal(T.lireThemeDef(lu[0].themedef).ok, true);
    assert.equal(lu[0].maj, 1793500000, 'maj en secondes');
    assert.match(lu[0].hash, /^sha256-/);
  });

  it('les colonnes déclarées sont celles de la spécification', () => {
    assert.deepEqual(G.COLONNES.map((c) => c.id), ['cle', 'themedef', 'actif', 'maj', 'version', 'hash']);
    assert.deepEqual(G.COLONNES.map((c) => c.type), ['Text', 'Text', 'Bool', 'Numeric', 'Text', 'Text']);
    assert.equal(G.TABLE, A.TABLE);
  });
});

describe('Geste : relire dit ce que les LECTEURS feront, pas seulement ce que la table contient', () => {
  const resoluKit = () => JSON.parse(require('./fixtures/themedef-lecteur.vecteurs.json').lectures.find((x) => x.id === 'active-valide-clair').contenu[0].themedef).resolu;
  const ligneAvec = (themedef) => [{ id: 1, cle: 'foret', actif: true, themedef: JSON.stringify(themedef) }];

  it('un thème bien compilé par le kit est appliqué', () => {
    assert.equal(G.relire(ligneAvec(theme({ resolu: resoluKit() }))).raison, 'applique');
  });

  it('un resolu fabriqué (texte et fond identiques) est dans la table mais REFUSÉ par les lecteurs : on ne dit pas « appliqué »', () => {
    const resolu = resoluKit();
    resolu.modes.clair.valeurs.texte = '#ffffff';
    resolu.modes.clair.valeurs.fond = '#ffffff';
    const r = G.relire(ligneAvec(theme({ resolu })));
    assert.equal(r.raison, 'contraste-insuffisant');
    assert.equal(r.mode, 'clair');
    assert.equal(r.nom, 'Forêt');
    assert.ok(r.avertissements.some((a) => a.paire === 'texte-sur-fond'));
  });

  it('un resolu incomplet est refusé de même', () => {
    const resolu = resoluKit();
    delete resolu.modes.clair.valeurs.action;
    assert.equal(G.relire(ligneAvec(theme({ resolu }))).raison, 'resolu-incomplet');
  });

  it('un thème sans resolu, depuis ses graines, reste appliqué (l’aperçu de Form Builder)', () => {
    assert.equal(G.relire(ligneAvec(theme())).raison, 'applique');
  });
});
