'use strict';

/*
 * L'écran « Qui voit les réponses ? » : le compositeur ne pose rien sans confirmation, ne lit que ce qu'il
 * faut, et ne passe jamais par les règles d'un autre formulaire. Le texte du compositeur est lu comme une source.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'builder.html'), 'utf8');
const corps = (nom) => {
  const d = SOURCE.indexOf('function ' + nom + '(');
  assert.ok(d > 0, nom);
  let p = 0, i = SOURCE.indexOf('{', d);
  for (; i < SOURCE.length; i++) { if (SOURCE[i] === '{') p++; if (SOURCE[i] === '}') { p--; if (p === 0) break; } }
  return SOURCE.slice(d, i + 1);
};

describe('Compositeur — qui voit les réponses', () => {
  it('le script du compositeur est du JavaScript valide (une chaîne coupée par un saut de ligne casse tout l\'écran)', () => {
    const scripts = [...SOURCE.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    assert.ok(scripts.length > 0);
    scripts.forEach((s) => assert.doesNotThrow(() => new Function(s)));
  });

  it('« Mettre à jour les règles » change en place, sans retirer ni reposer', () => {
    const f = corps('accesMettreAJour');
    assert.match(f, /actionsMiseAJour/);
    assert.match(f, /confirm\(/, 'rien ne part sans confirmation');
    assert.ok(!/actionsRetrait|actionsPose/.test(f), 'jamais de retrait ni de nouvelle pose : le document reste protégé');
    assert.match(SOURCE, /onclick="App\.accesMettreAJour\(\)"/);
  });

  it('le module est chargé et l\'écran est dans l\'étape « Mettre en ligne »', () => {
    assert.match(SOURCE, /<script src="shared\/acces\.js"><\/script>/);
    assert.match(corps('renderPublishStep'), /\$\{renderAccesBloc\(\)\}/);
    assert.match(SOURCE, /onAcces, accesLire, accesAppliquer, accesMettreAJour, accesRetirer, accesCopier/);
  });

  it('rien n\'est posé sans une confirmation, et jamais sans avoir lu ce qui existe', () => {
    const f = corps('accesAppliquer');
    assert.ok(f.indexOf('a.lu') > 0 && f.indexOf('a.lu') < f.indexOf('GristBridge.applyUserActions'), 'lecture d\'abord');
    assert.ok(f.indexOf('confirm(') > 0 && f.indexOf('confirm(') < f.indexOf('GristBridge.applyUserActions'), 'confirmation avant l\'écriture');
    assert.match(f, /Les propriétaires du document gardent tous les droits/);
    assert.match(f, /A\.actionsPose\(plan\.regles, a\.existant\)/, 'le plan refuse de croiser des règles étrangères');
  });

  it('retirer demande aussi confirmation, et ne retire que les règles du formulaire', () => {
    const f = corps('accesRetirer');
    assert.ok(f.indexOf('confirm(') > 0 && f.indexOf('confirm(') < f.indexOf('GristBridge.applyUserActions'));
    assert.match(f, /A\.actionsRetrait\(def, a\.existant\)/);
    assert.match(f, /Les autres règles du document ne sont pas touchées/);
  });

  it('en mode démo, rien n\'est écrit', () => {
    ['accesAppliquer', 'accesRetirer'].forEach((nom) => {
      const f = corps(nom);
      assert.ok(f.indexOf('S.isDemo') > 0 && f.indexOf('S.isDemo') < f.indexOf('GristBridge.applyUserActions'), nom);
    });
  });

  it('lire les règles ne modifie rien', () => {
    const f = corps('accesLire');
    assert.ok(!/applyUserActions/.test(f));
    assert.match(f, /loadTable\('_grist_ACLResources'\)/);
    assert.match(f, /loadTable\('_grist_ACLRules'\)/);
  });

  it('le défaut est le réglage qui n\'expose rien, et le reste du document n\'est caché que sur demande', () => {
    const f = corps('etatAcces');
    assert.match(f, /mode: 'ajout-seul'/);
    assert.match(f, /defautRefus: false/);
  });

  it('les trois façons de partager sont comparées, et la page hors de Grist est recommandée sans compte', () => {
    assert.match(SOURCE, /Trois façons de partager/);
    assert.match(SOURCE, /la page hors de Grist<\/strong> est la façon de partager un lien sans rien montrer des autres réponses/);
  });
});
