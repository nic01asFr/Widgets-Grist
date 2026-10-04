/*
 * synthese-vue.test.js — la mise en page ne calcule rien.
 *
 * Si un chiffre est faux, il l'était avant d'arriver ici. Ce qui se vérifie :
 * que l'effectif accompagne toujours le pourcentage, et que rien de ce qu'une
 * personne a écrit ne s'échappe en HTML.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Vue = require('../shared/synthese-vue.js');
const S = require('../shared/synthese.js');

describe('un temps de remplissage se lit', () => {
  it('en minutes et secondes', () => {
    assert.equal(Vue.duree(420), '7′00″');
    assert.equal(Vue.duree(65), '1′05″');
    assert.equal(Vue.duree(null), '—');
  });
});

describe('une barre dit toujours son effectif', () => {
  it('le pourcentage ne va jamais sans son n', () => {
    const html = Vue.barre('Agréables', 0.7, 'satisfaction', 4);
    assert.ok(html.includes('70 %'));
    assert.ok(html.includes('n = 4'), 'sans effectif, un pourcentage ment');
  });
});

describe('un classement se lit en points, pas en pourcentage', () => {
  it('écrit le score, et compte les citations sous le libellé', () => {
    const html = Vue.barre('Sébastopol', 1, 'preference', null, '3 citations, 2 fois en tête', '8 pts');
    assert.ok(html.includes('8 pts'));
    assert.ok(!html.includes('100 %'), 'un score pondéré n’est pas une part');
    assert.ok(!html.includes('n = '), 'l’effectif ne s’invente pas ici');
  });
});

describe('la synthèse rendue', () => {
  const def = {
    manifest_version: '1.0.0', id: 'e', title: 'Mon enquête', tableId: 'R', composeMode: 'bind',
    choices: {}, echelles: { a: { min: 1, max: 5 } },
    sections: [{ id: 's', label: 'Étape', fields: [
      { colId: 'Q', label: 'Agréables', type: 'Int', widget: 'echelle',
        options: { echelle: 'a', polarite: 'satisfaction' } },
      { colId: 'T', label: 'Remarques', type: 'Text', widget: 'textarea' },
    ] }],
  };

  it('dit qu’il n’y a rien, plutôt que de montrer des zéros', () => {
    const html = Vue.rendre(S.construire(def, []), def);
    assert.ok(html.includes('Aucune réponse'));
    assert.ok(!html.includes('fr-ressort'), 'pas de classement sans données');
  });

  it('porte le titre du formulaire et les chiffres de tête', () => {
    const html = Vue.rendre(S.construire(def, [{ Q: 5, T: 'Bien' }]), def);
    assert.ok(html.includes('Mon enquête'));
    assert.ok(html.includes('Réponses'));
    assert.ok(html.includes('Ce qui va bien'), 'la polarité range la question');
  });

  it('n’échappe pas ce qu’une personne a écrit', () => {
    const html = Vue.rendre(S.construire(def, [{ Q: 3, T: '<img src=x onerror=alert(1)>' }]), def);
    assert.ok(!html.includes('<img'), 'le verbatim est échappé');
    assert.ok(html.includes('&lt;img'));
  });

  it('le dit quand aucune échelle ne porte de sens', () => {
    const sansPol = JSON.parse(JSON.stringify(def));
    delete sansPol.sections[0].fields[0].options.polarite;
    const html = Vue.rendre(S.construire(sansPol, [{ Q: 4 }]), sansPol);
    assert.ok(html.includes('indication de sens'), 'on explique pourquoi rien ne ressort');
  });
});
