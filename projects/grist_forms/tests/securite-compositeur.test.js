'use strict';

/*
 * Le compositeur pose des titres, des libellés et des noms dans des attributs HTML et dans des gestionnaires en
 * ligne : un guillemet dans un titre (« Enquête "Mobilités" ») ne doit ni casser l'écran ni en sortir.
 * Le script du compositeur est lu comme une source et ses fonctions d'échappement sont évaluées seules.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'builder.html'), 'utf8');

const extraire = (nom) => {
  const d = SOURCE.indexOf('function ' + nom + '(');
  assert.ok(d > 0, nom + ' introuvable');
  let p = 0, i = SOURCE.indexOf('{', d);
  for (; i < SOURCE.length; i++) { if (SOURCE[i] === '{') p++; if (SOURCE[i] === '}') { p--; if (p === 0) break; } }
  return SOURCE.slice(d, i + 1);
};
// eslint-disable-next-line no-new-func
const { esc, escJs } = new Function(extraire('esc') + '\n' + extraire('escJs') + '\nreturn { esc, escJs };')();

describe('Compositeur — échappement', () => {
  it('esc échappe aussi les guillemets : un titre ne sort pas de son attribut', () => {
    const attaque = 'x" autofocus onfocus="alert(1)';
    const html = '<input value="' + esc(attaque) + '">';
    assert.ok(!/value="x"/.test(html));
    assert.equal((html.match(/"/g) || []).length, 2, 'les deux seuls guillemets sont ceux de l\'attribut');
    assert.equal(esc('Enquête "Mobilités"'), 'Enquête &quot;Mobilités&quot;');
    assert.equal(esc("l'été <b>&"), 'l&#39;été &lt;b&gt;&amp;');
    assert.equal(esc(null), '');
  });

  it('escJs : une apostrophe ne ferme pas la chaîne JavaScript d\'un gestionnaire', () => {
    const attaque = "a');alert(1);('";
    const valeur = escJs(attaque);
    // Ce que voit le moteur JavaScript une fois l'attribut décodé par le navigateur.
    const decode = valeur.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const appels = [];
    // eslint-disable-next-line no-new-func
    new Function('App', "App.f('" + decode + "', 1)")({ f: (...a) => appels.push(a) });
    assert.deepEqual(appels, [[attaque, 1]], 'un seul appel, avec la valeur d\'origine');
  });

  it('les gestionnaires qui reçoivent du texte passent par escJs', () => {
    assert.ok(!/\('\$\{esc\(/.test(SOURCE), 'plus de \'${esc(…)}\' dans une apostrophe de gestionnaire');
  });
});
