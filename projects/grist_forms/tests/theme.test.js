/*
 * Le thème : la feuille de style ne code plus une couleur sans la passer par
 * une variable `--kit-*` dont le repli est la valeur d'avant.
 *
 * On ne peut pas rendre la feuille sans navigateur ; on lit donc le texte :
 *  - aucune couleur littérale hors d'un `var(--kit-…, repli)` — sauf là où l'on
 *    DÉFINIT une variable (les blocs :root, qui portent les valeurs d'avant) ;
 *  - aucune variable `--kit-*` n'est définie par la feuille elle-même : une
 *    définition écraserait le repli et changerait le rendu par défaut ;
 *  - résolue sans thème (chaque `var(--kit-x, repli)` remplacé par son repli),
 *    la feuille ne laisse aucune référence `--kit-` ;
 *  - les variables utilisées et celles que docs/THEME-KIT.md documente sont les mêmes.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CSS = fs.readFileSync(path.join(__dirname, '../shared/dsfr-like.css'), 'utf8').replace(/\r\n/g, '\n');
const DOC = fs.readFileSync(path.join(__dirname, '../docs/THEME-KIT.md'), 'utf8');

const estDefinition = (ligne) => /^\s*--[\w-]+\s*:/.test(ligne);
// Une couleur littérale : #rgb, #rrggbb, #rrggbbaa, ou une fonction de couleur.
const COULEUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g;
const MOTS_COULEUR = /:\s*[^;{}]*\b(?:white|black|red|green|blue|gray|grey|yellow|orange|purple|silver|navy|teal|maroon)\b/i;

/** Retire les commentaires CSS, en gardant les sauts de ligne. */
function sansCommentaires(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/** Position de la parenthèse fermante qui répond à celle ouverte à `ouvrante`. */
function fermante(texte, ouvrante) {
  let prof = 0;
  for (let i = ouvrante; i < texte.length; i++) {
    if (texte[i] === '(') prof++;
    else if (texte[i] === ')') { prof--; if (prof === 0) return i; }
  }
  return -1;
}

/** Les intervalles couverts par un `var(--kit-…)`, repli compris. */
function zonesKit(texte) {
  const zones = [];
  let i = -1;
  while ((i = texte.indexOf('var(--kit-', i + 1)) !== -1) {
    const fin = fermante(texte, i + 3);
    zones.push([i, fin]);
  }
  return zones;
}

describe('dsfr-like.css — le thème', () => {
  const nu = sansCommentaires(CSS);
  const lignes = nu.split('\n');

  it('aucune couleur littérale hors d’un var(--kit-…, repli) ou d’une définition de variable', () => {
    const fautes = [];
    const zones = zonesKit(nu);
    let offset = 0;
    lignes.forEach((ligne, n) => {
      if (!estDefinition(ligne)) {
        let m;
        COULEUR.lastIndex = 0;
        while ((m = COULEUR.exec(ligne)) !== null) {
          const pos = offset + m.index;
          if (!zones.some(([a, b]) => pos > a && pos < b)) {
            fautes.push(`ligne ${n + 1} : « ${m[0]} » hors d'un var(--kit-…) : ${ligne.trim()}`);
          }
        }
        if (MOTS_COULEUR.test(ligne) && !zonesKit(ligne).length) {
          fautes.push(`ligne ${n + 1} : couleur nommée en dur : ${ligne.trim()}`);
        }
      }
      offset += ligne.length + 1;
    });
    assert.deepEqual(fautes, [], fautes.join('\n'));
  });

  it('la feuille ne définit aucune variable --kit-* : le repli doit rester celui d’avant', () => {
    const definies = lignes.filter((l) => /^\s*--kit-[\w-]+\s*:/.test(l));
    assert.deepEqual(definies, []);
  });

  it('sans thème, chaque var(--kit-x, repli) se résout en son repli et rien de --kit- ne reste', () => {
    let out = nu;
    let garde = 0;
    for (;;) {
      const i = out.indexOf('var(--kit-');
      if (i === -1) break;
      if (++garde > 5000) throw new Error('boucle');
      const fin = fermante(out, i + 3);
      assert.notEqual(fin, -1, 'parenthèse non fermée');
      const interieur = out.slice(i + 4, fin);
      // la virgule de tête, au premier niveau
      let prof = 0, virgule = -1;
      for (let k = 0; k < interieur.length; k++) {
        if (interieur[k] === '(') prof++;
        else if (interieur[k] === ')') prof--;
        else if (interieur[k] === ',' && prof === 0) { virgule = k; break; }
      }
      assert.notEqual(virgule, -1, 'un var(--kit-…) sans repli changerait le rendu par défaut : ' + interieur);
      const repli = interieur.slice(virgule + 1).trim();
      assert.ok(repli.length > 0, 'repli vide : ' + interieur);
      out = out.slice(0, i) + repli + out.slice(fin + 1);
    }
    assert.ok(!/--kit-/.test(out));
  });

  it('chaque variable utilisée est documentée dans THEME-KIT.md, et inversement', () => {
    const utilisees = new Set((nu.match(/var\(--kit-[a-z0-9-]+/g) || []).map((s) => s.slice(4)));
    // Les variables documentées : première colonne du tableau, entre accents graves.
    const documentees = new Set();
    DOC.split('\n').filter((l) => /^\|\s*`--kit-/.test(l)).forEach((l) => {
      const cellule = l.split('|')[1];
      (cellule.match(/--kit-[a-z0-9-]+/g) || []).forEach((v) => documentees.add(v));
    });
    assert.deepEqual([...utilisees].filter((v) => !documentees.has(v)), [], 'utilisées mais non documentées');
    assert.deepEqual([...documentees].filter((v) => !utilisees.has(v)), [], 'documentées mais jamais utilisées');
    assert.ok(utilisees.size >= 20, 'le thème couvre accent, texte, fond, surface, bord, focus et les états');
  });

  it('couvre les variables que le kit attend : accent, accent-texte, fond, surface, texte, texte-2, bord, focus, états', () => {
    const attendues = ['accent', 'accent-texte', 'fond', 'surface', 'texte', 'texte-2', 'bord', 'focus']
      .concat(['ok', 'attention', 'alerte', 'info'].reduce((a, e) => a.concat([e, e + '-fond']), []));
    attendues.forEach((nom) => {
      assert.ok(new RegExp('var\\(--kit-' + nom + '[,)]').test(nu), '--kit-' + nom + ' absente de la feuille');
    });
  });

  it('les définitions d’origine sont intactes : le repli existe toujours', () => {
    ['--blue-france', '--blue-france-hover', '--blue-france-active', '--success', '--error', '--warning',
      '--info', '--grey-1000', '--grey-975', '--grey-950', '--grey-925', '--grey-900', '--grey-625',
      '--grey-425', '--grey-200'].forEach((v) => {
      assert.ok(new RegExp('^\\s*' + v + '\\s*:', 'm').test(nu), v + ' n’est plus définie');
    });
    // et le mode sombre de Grist continue de les surcharger
    assert.ok(/data-grist-theme="dark"[\s\S]*--blue-france:\s*#9aa2ff/.test(nu));
  });
});
