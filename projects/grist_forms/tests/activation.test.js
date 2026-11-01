'use strict';

/**
 * L'activation d'un ThemeDef dans `Theme_document` : `shared/activation.js` est une COPIE du kit (lot TD-3a), jamais une bascule
 * réécrite ici. Ces tests rejouent les 57 vecteurs d'activation du kit (`tests/fixtures/`, des données sans code) avec le SHA-256 de Node
 * ET avec le SHA-256 pur embarqué (celui qu'un navigateur utilisera), puis posent les règles que le bouton de la page doit tenir.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../shared/activation.js');
const V = require('./fixtures/themedef-activation.vecteurs.json');

const hashNode = (texte) => crypto.createHash('sha256').update(texte, 'utf8').digest('hex');
const pairs = (liste) => (liste || []).map((x) => x.chemin + '|' + x.code).sort();

for (const [nom, hash] of [['SHA-256 de Node', hashNode], ['SHA-256 pur embarqué', A.hashSha256]]) {
  describe('Activation : les 57 vecteurs du kit, avec le ' + nom, () => {
    it('le fichier de vecteurs est celui qu\'on croit', () => {
      assert.equal(V.format, 'themedef-activation-vecteurs/1.0');
      assert.equal(V.table, 'Theme_document');
      assert.equal(V.activations.length, 57);
    });

    for (const v of V.activations) {
      it(v.id + ' : ' + v.titre, () => {
        const r = A.lotActivation(v.existantes, v.nouvelle, { maintenant: v.maintenant, hash });
        assert.equal(r.ok, v.attendu.ok);
        assert.deepEqual(r.erreurs.map((e) => e.code).sort(), [...v.attendu.erreurs].sort());
        assert.deepEqual(r.actions, v.attendu.actions);
        assert.deepEqual(pairs(r.avertissements), pairs(v.attendu.avertissements));
        assert.deepEqual(pairs(r.ignore), pairs(v.attendu.ignore));
      });
    }
  });
}

describe('Activation : le SHA-256 pur donne celui de Node', () => {
  it('sur des textes de toutes tailles et des caractères à plusieurs octets', () => {
    const textes = ['', 'a', 'abc', 'Mon thème — é ü 日本', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(63), 'x'.repeat(64), 'x'.repeat(65), 'x'.repeat(16384)];
    for (const t of textes) assert.equal(A.hashSha256(t), hashNode(t), JSON.stringify(t.slice(0, 20)) + ' (' + t.length + ')');
  });
});

describe('Activation : les règles que le bouton tient', () => {
  const theme = { version: 'themedef-1.0', nom: 'Forêt', graines: { principal: '#0b6e4f', secondaire: '#f4a259' }, modes: { sombre: 'derive' } };
  const opts = { maintenant: 1793500000123, hash: A.hashSha256 };
  const ligne = (id, cle, actif) => ({ id, cle, actif, themedef: JSON.stringify(theme), maj: 1, version: 'themedef-1.0', hash: 'x' });

  it('un thème refusé n\'ouvre AUCUNE action : l\'ancien thème actif n\'est jamais désactivé', () => {
    const r = A.lotActivation([ligne(1, 'ancien', true)], { cle: 'nouveau', themedef: '{"version":"themedef-9"}' }, opts);
    assert.equal(r.ok, false);
    assert.deepEqual(r.actions, []);
  });

  it('un seul lot : toutes les lignes actives sont désactivées, la cible est active, rien n\'est supprimé', () => {
    const r = A.lotActivation([ligne(1, 'a', true), ligne(2, 'b', true), ligne(3, 'c', false)], { cle: 'nouveau', themedef: theme }, opts);
    assert.equal(r.ok, true);
    assert.deepEqual(r.actions.slice(0, 2), [['UpdateRecord', 'Theme_document', 1, { actif: false }], ['UpdateRecord', 'Theme_document', 2, { actif: false }]]);
    assert.equal(r.actions[2][0], 'AddRecord');
    assert.equal(r.actions[2][3].actif, true);
    assert.ok(r.actions.every((a) => ['UpdateRecord', 'AddRecord'].indexOf(a[0]) !== -1), 'jamais RemoveRecord ni création de table');
  });

  it('table absente = refus : la fonction ne crée jamais la table', () => {
    const r = A.lotActivation(null, { cle: 'nouveau', themedef: theme }, opts);
    assert.equal(r.ok, false);
    assert.ok(r.erreurs.some((e) => e.code === 'table-absente'));
    assert.ok(r.actions.every((a) => a[0] !== 'AddTable'));
  });

  it('le thème est écrit tel que donné, avec une empreinte du document sans resolu ni hash', () => {
    const avec = Object.assign({}, theme, { hash: 'sha256-n-importe-quoi', resolu: { modes: {} } });
    const a = A.lotActivation([], { cle: 'x', themedef: theme }, opts);
    const b = A.lotActivation([], { cle: 'x', themedef: avec }, opts);
    assert.equal(a.actions[0][3].hash, b.actions[0][3].hash, 'le document n\'entre pas dans sa propre empreinte');
    assert.match(a.actions[0][3].hash, /^sha256-[A-Za-z0-9+/]{43}=$/);
  });

  it('la copie est autonome : aucune API de plateforme, rien d\'importé', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'shared', 'activation.js'), 'utf8');
    assert.ok(!/^\s*(import|export)\s/m.test(source));
    assert.ok(!/\brequire\(|fetch\(|XMLHttpRequest|localStorage|document\./.test(source.replace(/\/\*[\s\S]*?\*\//g, '')));
    assert.match(source, /COPIE du kit/);
    assert.match(source, /jetons\/themedef\/lib\/activation\.mjs sha256:[0-9a-f]{16}/);
  });
});
