/**
 * Les 142 vecteurs de lecture du kit (`tests/fixtures/themedef-lecteur.vecteurs.json`, des données sans code ; copie de celui du kit, repris avec le rejeu de Form Builder),
 * rejoués sur le lecteur d'Atlas (`lib/charte/themedef-lecteur.js`). Règle de référence : « un même document donne le même résultat dans tous les widgets ».
 * On compare ce qui décide de la sûreté : le thème est-il appliqué, avec quelles valeurs, et quelles paires échouent. Les écarts voulus sont NOMMÉS ; le test exige que la liste soit
 * exacte : un nouvel écart échoue, un écart corrigé aussi. C'est la même liste que celle de Form Builder.
 * node --test projects/Atlas/tests/themedef-lecteur-vecteurs.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../lib/charte/themedef-lecteur.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const V = JSON.parse(fs.readFileSync(path.join(ICI, 'fixtures', 'themedef-lecteur.vecteurs.json'), 'utf8'));

/** Les écarts connus et voulus. Aucun ne rend un thème illisible. */
const ECARTS_CONNUS = {
  // Sans valeurs résolues (ou sans le mode demandé), le lecteur de référence rend `non-compile` et n'applique rien. Atlas, lui, donne les GRAINES du document à sa charte (il calcule
  // le reste : rampes, états, plan, contrastes mesurés) et le dit (`source: 'graines'`). Form Builder fait de même avec un aperçu dérivé des graines.
  'sans-resolu': 'graines du document', 'sans-resolu-sombre': 'graines du document', 'resolu-objet-vide': 'graines du document', 'resolu-texte': 'graines du document',
  'resolu-modes-tableau': 'graines du document', 'resolu-mode-clair-seul-lu-en-sombre': 'graines du document', 'resolu-valeurs-tableau': 'graines du document',
  'resolu-null': 'graines du document', 'resolu-modes-null': 'graines du document', 'resolu-mode-null': 'graines du document', 'resolu-valeurs-null': 'graines du document',
  'sombre-explicite-lu-en-clair-sans-resolu': 'graines du document', 'sombre-explicite-contraste': 'graines du document (le sombre explicite est lu depuis les graines)',
  // Le mode est toujours « clair » ou « sombre » chez nous (préférence du système ou de Grist) : un mode invalide ne se présente pas, il est lu en clair.
  'mode-invalide-auto': 'mode toujours valide chez nous', 'mode-invalide-majuscule': 'mode toujours valide chez nous',
};

const contenuDe = (v) => (v.remplir ? JSON.parse(JSON.stringify(v.contenu).replace('{{REMPLIR}}', v.remplir.caractere.repeat(v.remplir.fois))) : v.contenu);
/** Un contenu de vecteur (lignes, colonnes, null, texte…) comme `fetchTable` de Grist le rendrait. */
function colonnesDe(c) {
  if (!Array.isArray(c)) return c;
  const o = { id: [], cle: [], themedef: [], actif: [], version: [] };
  c.forEach((l) => Object.keys(o).forEach((k) => o[k].push(l[k])));
  return o;
}
const lireVecteur = (v) => L.lireTable(colonnesDe(contenuDe(v)), { mode: v.mode === undefined ? 'clair' : v.mode });
const lectures = V.lectures.filter((v) => !ECARTS_CONNUS[v.id]);

test('les 142 vecteurs : le fichier est celui qu on croit', () => {
  assert.equal(V.format, 'themedef-lecteur-vecteurs/1.0');
  assert.equal(V.lectures.length, 142); assert.equal(V.paires.length, 22); assert.equal(V.cles.length, 26);
  assert.deepEqual([...L.CLES].sort(), [...V.cles].sort());
  assert.deepEqual(L.PAIRES.map(([a, b]) => a + '|' + b), V.paires.map((p) => p.a + '|' + p.b), 'les 22 paires sont celles du kit');
  for (const p of V.paires) assert.equal(p.seuil, ['bord-champ', 'focus', 'attention-filet'].includes(p.a) ? 3 : 4.5, p.id);
});

test('l accord est total, sauf les écarts connus et voulus (liste exacte)', () => {
  const desaccords = {};
  for (const v of V.lectures) { const r = lireVecteur(v); if (r.applique !== v.attendu.applique) desaccords[v.id] = v.attendu.applique ? 'attendu appliqué, refusé : ' + r.raison : 'attendu refusé, appliqué'; }
  assert.deepEqual(Object.keys(desaccords).sort(), Object.keys(ECARTS_CONNUS).sort(), 'ids en désaccord : ' + JSON.stringify(desaccords, null, 1));
});

test('quand le thème est appliqué depuis un resolu, les valeurs sont exactement celles du kit (26 sur 26)', () => {
  let compares = 0;
  for (const v of lectures) {
    if (!v.attendu.applique || v.attendu.source !== 'resolu') continue;
    const r = lireVecteur(v);
    assert.ok(r.applique, v.id + ' : appliqué'); assert.equal(r.source, 'resolu', v.id);
    for (const [k, attendu] of Object.entries(v.attendu.valeurs)) assert.equal(String(r.vars[k]).toLowerCase(), String(attendu).toLowerCase(), v.id + ' : ' + k);
    compares++;
  }
  assert.ok(compares >= 8, 'assez de vecteurs comparés (' + compares + ')');
});

test('chaque refus du kit pour contraste ou resolu incomplet est un refus chez nous, jamais un thème illisible appliqué', () => {
  let refus = 0;
  for (const v of lectures) {
    const codes = (v.attendu.avertissements || []).map((a) => a.code);
    if (v.attendu.applique || !(codes.includes('contraste-insuffisant') || codes.includes('resolu-incomplet'))) continue;
    const r = lireVecteur(v);
    assert.equal(r.applique, false, v.id + ' : refusé');
    assert.ok(['contraste-insuffisant', 'resolu-incomplet'].includes(r.raison), v.id + ' : ' + r.raison);
    refus++;
  }
  assert.ok(refus >= 30, 'assez de refus vérifiés (' + refus + ')');
});

test('les paires qui échouent sont celles du kit, avec la même mesure tronquée', () => {
  let compares = 0;
  for (const v of lectures) {
    if (!v.attendu.paires || !v.attendu.paires.length) continue;
    const r = lireVecteur(v);
    if (r.raison !== 'contraste-insuffisant') continue;
    assert.deepEqual(r.avertissements.map((a) => a.paire).sort(), [...v.attendu.paires].sort(), v.id);
    // Tolérance d'un centième : le fichier du kit écrit 1,9 là où son propre lecteur rend 1,91 (1,9197 tronqué), pour « surcharge-hex-court-echec ».
    for (const a of r.avertissements) if (a.paire in v.attendu.mesures) assert.ok(Math.abs(a.mesure - v.attendu.mesures[a.paire]) < 0.011, v.id + ' ' + a.paire + ' : ' + a.mesure + ' pour ' + v.attendu.mesures[a.paire]);
    compares++;
  }
  assert.ok(compares >= 15, 'assez de refus comparés (' + compares + ')');
});

test('les colonnes de la table : une colonne qui n est pas un tableau est ignorée, la plus longue donne la longueur, la colonne version est tolérée vide', () => {
  const td = JSON.stringify({ version: 'themedef-1.0', graines: { principal: '#0b6e4f' } });
  const ligne = (extra) => ({ id: [1], cle: ['neutre'], themedef: [td], actif: [true], ...extra });
  assert.equal(L.lireTable(ligne({ cle: 'neutre' })).applique, false);
  const r = L.lireTable({ id: [1], cle: ['a', 'neutre'], themedef: ['', td], actif: [false, true] });
  assert.ok(r.applique, 'la deuxième ligne, sans identifiant, se lit'); assert.equal(r.ligne, 'neutre');
  for (const v of [undefined, null, '', 'themedef-1.0']) assert.ok(L.lireTable(ligne({ version: [v] })).applique, JSON.stringify(v) + ' toléré');
  for (const v of ['themedef-2.0', 'x', 1, 0, false]) { const q = L.lireTable(ligne({ version: [v] })); assert.equal(q.applique, false); assert.equal(q.raison, 'version-inconnue', JSON.stringify(v)); }
});

test('un thème qui ne fournit pas de sombre n applique rien en sombre, sans bruit ; le clair s applique toujours', () => {
  const td = JSON.stringify({ version: 'themedef-1.0', graines: { principal: '#0b6e4f' }, modes: { sombre: 'aucun' } });
  const cols = { id: [1], cle: ['neutre'], themedef: [td], actif: [true] };
  const sombre = L.lireTable(cols, { mode: 'sombre' });
  assert.equal(sombre.applique, false); assert.equal(sombre.raison, 'sans-mode-sombre'); assert.deepEqual(sombre.avertissements, []);
  assert.ok(L.lireTable(cols, { mode: 'clair' }).applique);
});
