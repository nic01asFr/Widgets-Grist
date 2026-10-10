/**
 * Les textes qu'une scène, un catalogue ou une adresse apportent ne deviennent jamais du HTML de l'interface.
 * node --test projects/Atlas/tests/securite-interface.test.js
 *
 * Audit du 09-10/10/2026 : une chaîne venue de `?scene=` (nom de couche, étiquette de contrôle, valeur
 * d'attribut), d'un catalogue de modèles (`?models=`) ou de l'adresse elle-même était écrite dans l'interface
 * par `innerHTML` sans passer par `echapper`. `app_v7.js` est un module du navigateur, qu'on ne charge pas ici :
 * on vérifie donc le texte du source, site par site, puis par un balayage qui échoue si une de ces expressions
 * revient brute dans un gabarit HTML.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = fs.readFileSync(path.join(RACINE, 'app_v7.js'), 'utf8');

/**
 * Chaque site corrigé : ce qui s'écrivait (brut) et ce qui s'écrit (sûr).
 * `n` : nombre d'occurrences attendues du texte sûr.
 */
const SITES = [
  { site: 'liste des modèles — <option> (bibliothèque et catalogue)', n: 2,
    brut: '<option value="${mm.id}" ${selId === mm.id ? \'selected\' : \'\'}>${mm.icon} ${mm.name}</option>',
    sur: '<option value="${echapper(mm.id)}" ${selId === mm.id ? \'selected\' : \'\'}>${mm.icon} ${echapper(mm.name)}</option>' },
  { site: 'module Lieu — nom du projet (value="")', n: 1,
    brut: 'value="${STATE.projectName}"', sur: 'value="${echapper(STATE.projectName)}"' },
  { site: 'module Lieu — nom du lieu', n: 1,
    brut: '${L.name || \'Non défini\'}', sur: '${echapper(L.name || \'Non défini\')}' },
  { site: 'contrôles du lecteur — libellé', n: 1,
    brut: '<span class="tlabel">${vc.label}</span>', sur: '<span class="tlabel">${echapper(vc.label)}</span>' },
  { site: 'contrôles du lecteur — identifiant dans onclick', n: 1,
    brut: "A.setViewerExposed('${vc.id}', ${!on})", sur: "A.setViewerExposed('${chaineJs(vc.id)}', ${!on})" },
  { site: 'contrôles du lecteur — aria-label', n: 1,
    brut: 'aria-label="Exposer ${vc.label || vc.id} en lecture"', sur: 'aria-label="Exposer ${echapper(vc.label || vc.id)} en lecture"' },
  { site: 'module Modèles — adresse de la base (?models=)', n: 1,
    brut: 'style="word-break:break-all">${MODEL_LIBRARY.baseUrl}</div>', sur: 'style="word-break:break-all">${echapper(MODEL_LIBRARY.baseUrl)}</div>' },
  { site: 'module Modèles — champ de saisie de la base (?models=)', n: 1,
    brut: 'value="${MODEL_LIBRARY.baseRoot}"', sur: 'value="${echapper(MODEL_LIBRARY.baseRoot)}"' },
  { site: 'sélecteur de champ — nom du champ', n: 1,
    brut: '<option value="${f.id}" ${current === f.id ? \'selected\' : \'\'}>${f.id} (${typeAffiche(layer, f)})</option>',
    sur: '<option value="${echapper(f.id)}" ${current === f.id ? \'selected\' : \'\'}>${echapper(f.id)} (${typeAffiche(layer, f)})</option>' },
  { site: 'pastille de modèle — champ source', n: 1,
    brut: 'label = `par champ « ${mm.field} »`;', sur: 'label = `par champ « ${echapper(mm.field)} »`;' },
  { site: 'pastille de modèle — nom du fichier', n: 1,
    brut: 'label = layer.style.custom.filename;', sur: 'label = echapper(layer.style.custom.filename);' },
  { site: 'catégories de couleur — valeur dans onclick', n: 1,
    brut: "onclick=\"A.pickCatColor('${layer.id}','${String(v.value).replace(/'/g, \"\\\\'\")}', this)\"",
    sur: "onclick=\"A.pickCatColor('${layer.id}','${chaineJs(v.value)}', this)\"" },
  { site: 'modèle par valeur — valeur affichée', n: 1,
    brut: '<span class="cat-value" title="${v.value}">${v.value}</span>',
    sur: '<span class="cat-value" title="${echapper(v.value)}">${echapper(v.value)}</span>' },
  { site: 'modèle par valeur — valeur dans onchange', n: 1,
    brut: "onchange=\"A.setModelCategory('${layer.id}','${String(v.value).replace(/'/g, \"\\\\'\")}', this.value)\"",
    sur: "onchange=\"A.setModelCategory('${layer.id}','${chaineJs(v.value)}', this.value)\"" },
  { site: 'attributs de l’objet — valeur', n: 1,
    brut: "const esc = String(val).replace(/\"/g, '&quot;').replace(/'/g, '&#39;');", sur: 'const esc = echapper(val);' },
  { site: 'attributs de l’objet — libellé du champ', n: 2,
    brut: '<label class="input-label">${f.label || f.id}</label>', sur: '<label class="input-label">${echapper(f.label || f.id)}</label>' },
  { site: 'attributs de l’objet — nom du champ dans onchange', n: 1,
    brut: "A.setFeatureAttr('${layer.id}', '${f.id.replace(/'/g, \"\\\\'\")}', this.value)",
    sur: "A.setFeatureAttr('${layer.id}', '${chaineJs(f.id)}', this.value)" },
  { site: 'fiche — nom de la couche (en-tête)', n: 1,
    brut: '${count > 1 ? `${count} objets` : layer.name}</div>', sur: '${count > 1 ? `${count} objets` : echapper(layer.name)}</div>' },
  { site: 'fiche — nom de l’objet (titre)', n: 1,
    brut: "${count > 1 ? 'Sélection multiple' : label}</div>", sur: "${count > 1 ? 'Sélection multiple' : echapper(label)}</div>" },
  { site: 'modèle d’une couche — choix dans la grille (onclick et nom)', n: 1,
    brut: 'onclick="A.pickModel(\'${layer.id}\',\'${mm.id}\')"><div class="mi">${mm.icon}</div><div class="mn">${mm.name}</div></div>',
    sur: 'onclick="A.pickModel(\'${layer.id}\',\'${chaineJs(mm.id)}\')"><div class="mi">${mm.icon}</div><div class="mn">${echapper(mm.name)}</div></div>' },
  { site: 'modèle d’un type du catalogue — identifiant dans onclick', n: 1,
    brut: 'onclick="A.pickModel(\'${layer.id}\',\'${mm.id}\')"><div class="mi">${mm.icon}</div><div class="mn">${escapeHtml(mm.name)}</div></div>',
    sur: 'onclick="A.pickModel(\'${layer.id}\',\'${chaineJs(mm.id)}\')"><div class="mi">${mm.icon}</div><div class="mn">${escapeHtml(mm.name)}</div></div>' },
  { site: 'symbologie — couleur unique', n: 2,
    brut: 'value="${c.value || layer.color}"', sur: 'value="${echapper(c.value || layer.color)}"' },
];

describe('sites de l’interface où une chaîne externe était écrite brute', () => {
  for (const { site, brut, sur, n } of SITES) {
    it(site, () => {
      assert.equal(APP.split(sur).length - 1, n, `forme sûre attendue ${n} fois`);
      assert.equal(APP.split(brut).length - 1, 0, 'la forme brute est revenue');
    });
  }
});

/* ------------------------------------------------------------------ */
/* Balayage : ces expressions ne reviennent pas brutes dans un gabarit HTML. */
/* ------------------------------------------------------------------ */

/**
 * Ce que la scène, le catalogue, l'adresse ou les données apportent. Dans un gabarit, une telle expression
 * s'écrit `echapper(…)` (texte, attribut) ou `chaineJs(…)` (dans un onclick), jamais seule dans `${…}`.
 */
const EXTERNES = [
  'layer.name', 'l.name', 'STATE.projectName', 'L.name', 'vc.label', 'vc.id', 'f.label', 'mm.name', 'mm.id',
  'v.value', 'f.id', 'o.nom', 'MODEL_LIBRARY.baseUrl', 'MODEL_LIBRARY.baseRoot', 'mm.field',
  'layer.style.custom.filename', 'f.label || f.id', 'vc.label || vc.id',
];

/**
 * Les lignes où l'expression ne part pas dans du HTML : un message (`showToast` pose du texte), la console, une
 * boîte de dialogue, une propriété `title` ou un `label` de commande (rendu avec `escapeHtml`).
 */
const NON_HTML = /showToast|confirm\(|console\.|showLoading|setAttribute|\blabel: `|\.title = |toLowerCase\(\)/;

/**
 * Les lignes où le nom vient d'une table écrite dans le code, pas d'un document ni d'une scène : variantes de
 * contrôle, formats d'export, clé de regroupement (jamais écrite dans le DOM).
 */
const CONSTANTES = /const option = \(v\) =>|data-export=|const cle = `/;

/** Les `${expr}` nus : l'expression est seule dans l'accolade. */
function interpolationsNues(ligne) {
  const sorties = [];
  const re = /\$\{\s*([^{}]+?)\s*\}/g;
  let m;
  while ((m = re.exec(ligne))) sorties.push(m[1]);
  return sorties;
}

describe('balayage de app_v7.js', () => {
  it('aucune chaîne externe n’est interpolée brute dans un gabarit HTML', () => {
    const fautes = [];
    APP.split(/\r?\n/).forEach((ligne, i) => {
      if (NON_HTML.test(ligne) || CONSTANTES.test(ligne)) return;
      for (const expr of interpolationsNues(ligne)) {
        if (EXTERNES.includes(expr)) fautes.push(`app_v7.js:${i + 1}  \${${expr}}  ${ligne.trim().slice(0, 100)}`);
      }
    });
    assert.deepEqual(fautes, [], 'à écrire avec echapper() ou chaineJs() :\n' + fautes.join('\n'));
  });

  it('le balayage sait voir une faute (témoin)', () => {
    assert.deepEqual(interpolationsNues('<b>${layer.name}</b> ${echapper(l.name)} ${count}'), ['layer.name', 'echapper(l.name)', 'count']);
    assert.ok(EXTERNES.includes('layer.name'));
  });

  it('showToast, la sortie par laquelle passent les noms de couche, n’écrit pas de HTML (voir toast.test.js)', () => {
    assert.match(APP, /import \{ creerToast \} from '\.\/lib\/toast\.js/);
  });
});
