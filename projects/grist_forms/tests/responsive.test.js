'use strict';

/*
 * Toutes les tailles d'ecran, de 320 px a un grand ecran.
 *
 * Ce fichier garde les protections ECRITES dans la feuille de style ; il ne
 * mesure pas une page. La mesure (largeur de la page, cibles de 44 px) demande
 * un navigateur : la recette est dans docs/ECRANS.md.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'shared', 'dsfr-like.css'), 'utf8');
const demo = fs.readFileSync(path.join(__dirname, '..', 'demo', 'index.html'), 'utf8');

/** Le corps de la derniere regle dont le selecteur contient `sel`. */
function regle(sel) {
  const re = new RegExp('(^|\\n|\\})\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g');
  let dernier = null; let m;
  while ((m = re.exec(css))) dernier = m[2];
  return dernier;
}

describe('Ecrans etroits — protections de la feuille de style', () => {
  it('le canevas de dessin est hors du flux : sa largeur en pixels ne fait pas la largeur de la page', () => {
    assert.match(regle('.fr-dessin__toile') || '', /position:\s*absolute/);
  });

  it('les textes reserves aux lecteurs d\'ecran sont retenus par leur cadre defilant', () => {
    assert.match(regle('.fr-rangs__cadre') || '', /position:\s*relative/);
  });

  it('la grille de classement se resserre sur un telephone sans passer sous 44 px par case', () => {
    const blocs = [...css.matchAll(/@media \(max-width: 30rem\) \{([\s\S]*?)\n\}/g)].map((x) => x[1]);
    const m = blocs.filter((b) => /\.fr-rangs__case/.test(b)).pop();
    assert.ok(m, 'une regle pour les ecrans etroits');
    const case_ = /\.fr-rangs__case[^{]*\{\s*width:\s*([\d.]+)rem/.exec(m);
    assert.ok(case_, 'largeur de case declaree');
    assert.ok(Number(case_[1]) * 16 >= 44, 'case de ' + Number(case_[1]) * 16 + ' px');
  });

  it('la pastille de couleur du dessin a une zone sensible d\'au moins 44 px', () => {
    const apres = regle('.fr-dessin__couleur::after') || '';
    const inset = /inset:\s*-([\d.]+)rem/.exec(apres);
    assert.ok(inset, 'zone etendue');
    // 2 rem de rond moins 2 px de bord de chaque cote : le pseudo-element part du bord interieur (mesure : 45,6 px).
    const total = 2 * 16 - 2 * 2 + 2 * Number(inset[1]) * 16;
    assert.ok(total >= 44, 'zone de ' + total.toFixed(1) + ' px');
  });

  it('le champ de fichier natif a une hauteur de cible tactile', () => {
    assert.match(css, /input\[type="file"\][^{]*\{[^}]*min-height:\s*var\(--cible,\s*2\.75rem\)/);
    assert.match(css, /::file-selector-button[^{]*\{[^}]*min-height/);
  });

  it('la demonstration ne laisse pas son contenu elargir la grille de la page', () => {
    assert.match(demo, /grid-template-columns:\s*var\(--demo-rail\)\s*minmax\(0,\s*1fr\)/);
    assert.match(demo, /@media \(max-width: 52rem\)[^}]*minmax\(0,\s*1fr\)/);
    assert.match(demo, /\.demo__scene\s*\{[^}]*min-width:\s*0/);
  });

  it('le formulaire annonce sa largeur d\'appareil', () => {
    assert.match(demo, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  });
});
