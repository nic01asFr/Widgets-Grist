'use strict';

/*
 * Régler une question en cliquant dessus, pas seulement sur la petite roue. Le compositeur est un
 * fichier HTML : on en lit la source et on exécute les deux fonctions de sélection avec un faux
 * événement, sans navigateur.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'builder.html'), 'utf8');

/** Extrait une fonction du compositeur et l'exécute avec des doublures de ce qu'elle touche. */
function charger(nom, doublures) {
  const debut = SOURCE.indexOf('function ' + nom + '(');
  assert.ok(debut > 0, nom + ' existe');
  let profondeur = 0, i = SOURCE.indexOf('{', debut);
  const depart = i;
  for (; i < SOURCE.length; i++) {
    if (SOURCE[i] === '{') profondeur++;
    if (SOURCE[i] === '}') { profondeur--; if (profondeur === 0) break; }
  }
  const corps = SOURCE.slice(debut, i + 1);
  const cles = Object.keys(doublures);
  return new Function(...cles, corps + '; return ' + nom + ';')(...cles.map((k) => doublures[k]));
}

describe('Un clic sur la carte d\'une question la règle', () => {
  const evenement = (cible, courant) => ({ target: cible, currentTarget: courant || cible, key: undefined, preventDefault() { this.vu = true; } });
  const cible = (tags) => ({ closest(sel) { return tags.some((t) => sel.split(',').map((s) => s.trim()).includes(t)) ? {} : null; } });

  it('ouvre la question visée', () => {
    const ouverts = [];
    const f = charger('choisirSurClic', { selectionEst: () => false, choisir: (...a) => ouverts.push(a) });
    f(evenement(cible([])), 2, 1);
    assert.deepEqual(ouverts, [['question', 2, 1]]);
  });

  it('laisse leur geste aux boutons, listes et liens de la barre', () => {
    const ouverts = [];
    const f = charger('choisirSurClic', { selectionEst: () => false, choisir: (...a) => ouverts.push(a) });
    ['button', 'select', 'a', 'input', 'textarea', 'label'].forEach((t) => f(evenement(cible([t])), 0, 0));
    assert.deepEqual(ouverts, []);
  });

  it('ne rouvre pas une question déjà ouverte (ni défilement perdu, ni focus des réglages)', () => {
    const ouverts = [];
    const f = charger('choisirSurClic', { selectionEst: () => true, choisir: (...a) => ouverts.push(a) });
    f(evenement(cible([])), 0, 0);
    assert.deepEqual(ouverts, []);
  });

  it('s\'ouvre aussi au clavier, par Entrée ou Espace sur la carte elle-même', () => {
    const ouverts = [];
    const f = charger('choisirAuClavier', { selectionEst: () => false, choisir: (...a) => ouverts.push(a) });
    const carte = {};
    ['Enter', ' '].forEach((key) => f({ target: carte, currentTarget: carte, key, preventDefault() {} }, 1, 3));
    assert.deepEqual(ouverts, [['question', 1, 3], ['question', 1, 3]]);
    f({ target: {}, currentTarget: carte, key: 'Enter', preventDefault() {} }, 1, 3);
    f({ target: carte, currentTarget: carte, key: 'a', preventDefault() {} }, 1, 3);
    assert.equal(ouverts.length, 2, 'ni un bouton contenu, ni une autre touche');
  });

  it('la carte porte le geste, un nom et son état pour les lecteurs d\'écran', () => {
    const carte = SOURCE.slice(SOURCE.indexOf('<div class="champ-bloc${ouvert'), SOURCE.indexOf('<div class="champ-bloc__barre">'));
    assert.match(carte, /role="group"/);
    assert.match(carte, /tabindex="0"/);
    assert.match(carte, /aria-label="Question \$\{fi \+ 1\} : /);
    assert.match(carte, /aria-current="true"/);
    assert.match(carte, /onclick="App\.choisirSurClic\(event, \$\{si\}, \$\{fi\}\)"/);
    assert.match(carte, /onkeydown="App\.choisirAuClavier\(event, \$\{si\}, \$\{fi\}\)"/);
    assert.match(SOURCE, /App\.choisir\('question', \$\{si\}, \$\{fi\}\)">⚙<\/button>/, 'la roue reste');
  });
});
