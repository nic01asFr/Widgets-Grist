'use strict';

/**
 * Les 142 vecteurs de lecture du kit (`kit/jetons/themedef/vecteurs/themedef-lecteur.vecteurs.json`, des données sans code), rejoués sur le lecteur de
 * Form Builder (`shared/themedef.js`). Règle de référence : docs/THEMEDEF-SPEC.md §5, arbitrage du 01/11/2026 : « un même document donne le même résultat
 * dans tous les widgets ».
 *
 * On compare ce qui décide de la sûreté : le thème est-il appliqué (`applique`), et avec quelles valeurs. Les écarts voulus sont NOMMÉS ci-dessous, avec leur
 * raison ; le test exige que la liste soit exacte : un nouvel écart échoue, un écart corrigé aussi (il faut alors le retirer de la liste).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../shared/themedef.js');
const V = require('./fixtures/themedef-lecteur.vecteurs.json');

/** Les écarts connus et voulus. Aucun ne rend un thème illisible. */
const ECARTS_CONNUS = {
  // Form Builder dérive un APERÇU depuis les graines quand le `resolu` manque ou n'est pas un objet (c'est ce qui fait marcher les thèmes saisis dans la page
  // design system) ; le lecteur de référence rend `non-compile` et n'applique rien. L'aperçu redresse tout texte ou bouton illisible (≥ 3:1) et le dit.
  'sans-resolu': 'aperçu depuis les graines',
  'sans-resolu-sombre': 'aperçu depuis les graines',
  'resolu-objet-vide': 'aperçu depuis les graines',
  'resolu-texte': 'aperçu depuis les graines',
  'resolu-modes-tableau': 'aperçu depuis les graines',
  'resolu-mode-clair-seul-lu-en-sombre': 'aperçu depuis les graines',
  'resolu-valeurs-tableau': 'aperçu depuis les graines',
  'resolu-null': 'aperçu depuis les graines',
  'resolu-modes-null': 'aperçu depuis les graines',
  'resolu-mode-null': 'aperçu depuis les graines',
  'resolu-valeurs-null': 'aperçu depuis les graines',
  'sombre-explicite-lu-en-clair-sans-resolu': 'aperçu depuis les graines',
  'sombre-explicite-contraste': 'aperçu depuis les graines (le sombre explicite est dérivé des graines)',
  // Le mode est toujours « clair » ou « sombre » dans Form Builder (il vient de la préférence du système ou de Grist) : un mode invalide ne se présente pas.
  'mode-invalide-auto': 'mode toujours valide chez nous',
  'mode-invalide-majuscule': 'mode toujours valide chez nous'
};

function contenuDe(v) {
  if (!v.remplir) return v.contenu;
  return JSON.parse(JSON.stringify(v.contenu).replace('{{REMPLIR}}', v.remplir.caractere.repeat(v.remplir.fois)));
}

/** Présente un contenu de vecteur (lignes, colonnes, null, texte…) comme le ferait `docApi` de Grist. */
function apiDe(c) {
  const estTable = Array.isArray(c) || (c !== null && typeof c === 'object');
  let colonnes = null;
  if (Array.isArray(c)) {
    colonnes = { id: [], cle: [], themedef: [], actif: [], version: [] };
    c.forEach((l) => Object.keys(colonnes).forEach((k) => colonnes[k].push(l[k])));
  } else if (c !== null && typeof c === 'object') colonnes = c;
  return { listTables: async () => (estTable ? ['Theme_document'] : []), fetchTable: async () => colonnes };
}

const court = (nom) => (nom.indexOf('--kit-') === 0 ? nom.slice(6) : nom);

describe('Lecteur de thème : les 142 vecteurs de lecture du kit', () => {
  it('le fichier est celui qu’on croit', () => {
    assert.equal(V.format, 'themedef-lecteur-vecteurs/1.0');
    assert.equal(V.lectures.length, 142);
    assert.equal(V.paires.length, 22);
    assert.equal(V.cles.length, 26);
  });

  it('l’accord est total, sauf les écarts connus et voulus (liste exacte)', async () => {
    const desaccords = {};
    for (const v of V.lectures) {
      const r = await T.charger(apiDe(contenuDe(v)), { mode: v.mode === undefined ? 'clair' : v.mode });
      if (!!r.theme !== v.attendu.applique) desaccords[v.id] = v.attendu.applique ? 'attendu appliqué, refusé' : 'attendu refusé, appliqué';
    }
    assert.deepEqual(Object.keys(desaccords).sort(), Object.keys(ECARTS_CONNUS).sort(),
      'ids en désaccord : ' + JSON.stringify(desaccords, null, 1));
  });

  it('quand le thème est appliqué depuis un resolu, les valeurs sont exactement celles du kit (26 sur 26)', async () => {
    let compares = 0;
    for (const v of V.lectures) {
      if (!v.attendu.applique || v.attendu.source !== 'resolu' || ECARTS_CONNUS[v.id]) continue;
      const r = await T.charger(apiDe(contenuDe(v)), { mode: v.mode === undefined ? 'clair' : v.mode });
      assert.ok(r.theme, v.id + ' : appliqué');
      const nous = {};
      Object.keys(r.theme).forEach((k) => { nous[court(k)] = String(r.theme[k]).toLowerCase(); });
      const kit = {};
      Object.keys(v.attendu.valeurs).forEach((k) => { kit[k] = String(v.attendu.valeurs[k]).toLowerCase(); });
      for (const k of Object.keys(kit)) assert.equal(nous[k], kit[k], v.id + ' : ' + k);
      compares++;
    }
    assert.ok(compares >= 8, 'assez de vecteurs comparés (' + compares + ')');
  });

  it('chaque refus du kit pour contraste ou resolu incomplet est un refus chez nous (jamais un thème illisible appliqué)', async () => {
    let refus = 0;
    for (const v of V.lectures) {
      const codes = (v.attendu.avertissements || []).map((a) => a.code);
      if (ECARTS_CONNUS[v.id] || v.attendu.applique || !(codes.includes('contraste-insuffisant') || codes.includes('resolu-incomplet'))) continue;
      const r = await T.charger(apiDe(contenuDe(v)), { mode: v.mode === undefined ? 'clair' : v.mode });
      assert.equal(r.theme, null, v.id + ' : refusé');
      assert.ok(['contraste-insuffisant', 'resolu-incomplet'].includes(r.raison), v.id + ' : ' + r.raison);
      refus++;
    }
    assert.ok(refus >= 30, 'assez de refus vérifiés (' + refus + ')');
  });

  it('les paires qui échouent sont celles du kit, avec la même mesure tronquée', async () => {
    let compares = 0;
    for (const v of V.lectures) {
      if (ECARTS_CONNUS[v.id] || !v.attendu.paires || !v.attendu.paires.length) continue;
      const r = await T.charger(apiDe(contenuDe(v)), { mode: v.mode === undefined ? 'clair' : v.mode });
      if (r.raison !== 'contraste-insuffisant') continue;
      const nous = r.avertissements.map((a) => a.paire).sort();
      assert.deepEqual(nous, [...v.attendu.paires].sort(), v.id);
      // Tolérance d'un centième (0,011, à cause des flottants) : le fichier du kit écrit 1,9 là où son propre lecteur rend 1,91 (1,9197 tronqué), pour « surcharge-hex-court-echec ».
      for (const a of r.avertissements) if (a.paire in v.attendu.mesures) assert.ok(Math.abs(a.mesure - v.attendu.mesures[a.paire]) < 0.011, v.id + ' ' + a.paire + ' : ' + a.mesure + ' pour ' + v.attendu.mesures[a.paire]);
      compares++;
    }
    assert.ok(compares >= 15, 'assez de refus comparés (' + compares + ')');
  });
});

describe('Lecteur de thème : les colonnes de la table', () => {
  const ligne = (extra) => Object.assign({ id: [1], cle: ['neutre'], themedef: [JSON.stringify({ version: 'themedef-1.0', graines: { principal: '#0b6e4f' } })], actif: [true] }, extra);
  const api = (cols) => ({ listTables: async () => ['Theme_document'], fetchTable: async () => cols });

  it('une colonne qui n’est pas un tableau est ignorée', async () => {
    const r = await T.charger(api(ligne({ cle: 'neutre' })), { mode: 'clair' });
    assert.equal(r.theme, null);
  });

  it('la table a la longueur de la plus longue des colonnes lues', async () => {
    const td = JSON.stringify({ version: 'themedef-1.0', graines: { principal: '#0b6e4f' } });
    const r = await T.charger(api({ id: [1], cle: ['a', 'neutre'], themedef: ['', td], actif: [false, true] }), { mode: 'clair' });
    assert.ok(r.theme, 'la deuxième ligne, sans identifiant, se lit');
    assert.equal(r.ligne, 'neutre');
  });

  it('la colonne version : vide ou absente tolérée, toute autre valeur que la nôtre refusée', async () => {
    for (const v of [undefined, null, '', 'themedef-1.0']) {
      const r = await T.charger(api(ligne({ version: [v] })), { mode: 'clair' });
      assert.ok(r.theme, JSON.stringify(v) + ' toléré');
    }
    for (const v of ['themedef-2.0', 'x', 1, 0, false]) {
      const r = await T.charger(api(ligne({ version: [v] })), { mode: 'clair' });
      assert.equal(r.theme, null, JSON.stringify(v) + ' refusé');
      assert.equal(r.raison, 'version-inconnue');
    }
  });

  it('un thème qui ne fournit pas de sombre n’applique rien en sombre, sans bruit', async () => {
    const td = JSON.stringify({ version: 'themedef-1.0', graines: { principal: '#0b6e4f' }, modes: { sombre: 'aucun' } });
    const cols = { id: [1], cle: ['neutre'], themedef: [td], actif: [true] };
    const sombre = await T.charger(api(cols), { mode: 'sombre' });
    assert.equal(sombre.theme, null);
    assert.equal(sombre.raison, 'sans-mode-sombre');
    assert.deepEqual(sombre.avertissements, []);
    assert.ok((await T.charger(api(cols), { mode: 'clair' })).theme, 'le clair s’applique toujours');
  });
});
