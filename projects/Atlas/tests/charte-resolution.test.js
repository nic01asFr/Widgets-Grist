// Résolution : fusion des quatre niveaux, dérivation depuis les graines, préférence de contraste élevé, jetons, idempotence.
// node --test tests/charte-resolution.test.js   (aucun accès réseau, aucune dépendance)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as R from '../lib/charte/resolution.js';
import * as S from '../lib/charte/schema.js';
import * as C from '../lib/charte/couleurs.js';
import { CHARTE_ATLAS as ATLAS, CHARTE_CONTRASTE_ELEVE as ELEVE } from '../lib/charte/defauts.js';
import { sequentielleDepuis, divergenteEntre, planDepuis } from '../lib/charte/derivation.js';
import { validerSchema } from './aide-json-schema.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const fixture = (n) => JSON.parse(readFileSync(join(ICI, 'fixtures/charte/' + n + '.json'), 'utf8'));
const SCHEMA = JSON.parse(readFileSync(join(ICI, '../lib/charte/charte.schema.json'), 'utf8'));
const SECTIONS = ['version', 'nom', 'graines', 'jetons', 'donnees', 'fond', 'marqueurs', 'texte', 'exigences'];

// ---------------------------------------------------------------------------------------------------------------- niveau 1 et 2
test('sans hôte : la charte « atlas », complète, avec le plan calculé ; rien d\'appliqué ni de dérivé', () => {
  const r = R.resoudre({});
  for (const k of SECTIONS) assert.ok(k in r.charte, k);
  assert.deepEqual({ ...r.charte, fond: { ...r.charte.fond, plan: undefined }, jetons: undefined }, { ...ATLAS, fond: { ...ATLAS.fond, plan: undefined }, jetons: undefined });
  assert.deepEqual(r.charte.fond.plan, planDepuis({ principal: ATLAS.fond.principal, fond: '#ffffff', encre: ATLAS.graines.encre, intensites: ATLAS.fond.intensites }));
  assert.deepEqual(r.applique, []); assert.deepEqual(r.derive, []); assert.deepEqual(r.ignore, []);
  assert.equal(R.resoudre({ hote: null }).charte.nom, 'Atlas'); assert.deepEqual(R.resoudre({ hote: {} }).charte, r.charte);
});

test('charte nommée : `base` choisit « contraste-eleve » ; une base inconnue est écartée et signalée', () => {
  const r = R.resoudre({ hote: { base: 'contraste-eleve' } });
  assert.equal(r.charte.graines.encre, '#000000'); assert.deepEqual(r.charte.donnees.qualitative, ELEVE.donnees.qualitative); assert.deepEqual(r.applique, ['base']);
  const x = R.resoudre({ hote: { base: 'inconnue' } }); assert.equal(x.charte.nom, 'Atlas'); assert.ok(x.ignore.some((i) => i.chemin === 'base'));
});

// ---------------------------------------------------------------------------------------------------------------- niveau 3 : l'hôte, dérivation
test('hôte avec une seule graine : séquentielle, qualitative, plan et traits dérivés ; la divergente bleu-orange d\'Atlas reste', () => {
  const r = R.resoudre({ hote: { graines: { principal: '#1b6b7a' } } });
  assert.deepEqual(r.applique, ['graines.principal']);
  assert.deepEqual(r.charte.donnees.sequentielles.principale, sequentielleDepuis({ ...ATLAS.graines, principal: '#1b6b7a' }, 9));
  assert.equal(r.charte.donnees.qualitative[0], '#1b6b7a'); assert.equal(r.charte.fond.principal, '#1b6b7a');
  assert.deepEqual(r.charte.donnees.divergente, [...ATLAS.donnees.divergente], 'une seule graine : pas de divergente calculée');
  assert.deepEqual(r.charte.donnees.sequentielles.continue, [...ATLAS.donnees.sequentielles.continue], 'les autres rampes nommées restent');
  assert.ok(r.derive.includes('donnees.sequentielles.principale') && r.derive.includes('donnees.qualitative') && r.derive.includes('fond.principal') && r.derive.includes('fond.plan'));
  assert.ok(!r.derive.includes('donnees.divergente')); assert.ok(!r.derive.includes('donnees.sansDonnee'), 'fond et encre inchangés');
});

test('hôte avec principal et secondaire : divergente calculée entre les deux, qualitative qui commence par eux', () => {
  const g = fixture('neutre').graines, r = R.resoudre({ hote: { graines: g } });
  assert.deepEqual(r.charte.donnees.divergente, divergenteEntre(g.principal, g.secondaire, g, 3)); assert.ok(r.derive.includes('donnees.divergente'));
  assert.deepEqual(r.charte.donnees.qualitative.slice(0, 2), [g.principal, g.secondaire]);
  assert.deepEqual(r.charte.donnees.sequentielles.principale, sequentielleDepuis(g, 9)); assert.equal(r.charte.donnees.sansDonnee, '#8f8f8f'); assert.equal(r.charte.marqueurs.contour, g.encre);
});

test('hôte avec fond et encre seulement : traits et « sans donnée » dérivés, rampes inchangées', () => {
  const r = R.resoudre({ hote: { graines: { fond: '#fafaf5', encre: '#101010' } } });
  assert.ok(['donnees.sansDonnee', 'donnees.selection', 'donnees.halo', 'donnees.survol', 'donnees.contour', 'marqueurs.contour'].every((c) => r.derive.includes(c)));
  assert.equal(r.charte.donnees.halo, '#fafaf5'); assert.equal(r.charte.donnees.selection, '#101010');
  assert.ok(C.contraste(r.charte.donnees.sansDonnee, '#fafaf5') >= 3.2);
});

test('ce que l\'hôte donne explicitement l\'emporte sur la dérivation, et n\'est jamais dérivé', () => {
  const r = R.resoudre({ hote: { graines: { principal: '#1b6b7a' }, donnees: { qualitative: ['#111111', '#eeeeee', '#888888'], sequentielles: { principale: ['#ffffff', '#000000'] }, sansDonnee: '#999999' } } });
  assert.deepEqual(r.charte.donnees.qualitative, ['#111111', '#eeeeee', '#888888']); assert.deepEqual(r.charte.donnees.sequentielles.principale, ['#ffffff', '#000000']); assert.equal(r.charte.donnees.sansDonnee, '#999999');
  for (const c of ['donnees.qualitative', 'donnees.sequentielles.principale', 'donnees.sansDonnee']) { assert.ok(r.applique.includes(c), c); assert.ok(!r.derive.includes(c), c); }
});

test('rampes nommées de l\'hôte : ajoutées à celles d\'Atlas, la rampe par défaut peut être changée ; une rampe par défaut absente est corrigée et signalée', () => {
  const ok = R.resoudre({ hote: { donnees: { sequentielles: { equipe: ['#ffffff', '#0b3d5c'] }, sequentielleDefaut: 'equipe' } } });
  assert.deepEqual(Object.keys(ok.charte.donnees.sequentielles).sort(), ['continue', 'equipe', 'principale']); assert.equal(ok.charte.donnees.sequentielleDefaut, 'equipe');
  const ko = R.resoudre({ hote: { donnees: { sequentielleDefaut: 'fantome' } } });
  assert.equal(ko.charte.donnees.sequentielleDefaut, 'principale'); assert.ok(ko.avertissements.some((a) => a.code === 'palette-defaut-absente'));
});

test('graines dégénérées : la dérivation impossible est signalée, la valeur de la charte « atlas » est conservée', () => {
  const r = R.resoudre({ hote: { graines: { fond: '#777777', encre: '#777777' } } });
  const a = r.avertissements.find((x) => x.code === 'derivation-impossible'); assert.ok(a); assert.equal(a.niveau, 'attention'); assert.deepEqual(r.charte.donnees.sequentielles.principale, [...ATLAS.donnees.sequentielles.principale]);
});

test('fond sombre fictif : rampes et traits dérivés dans le bon sens, avertissement d\'états au besoin, charte utilisable', () => {
  const r = R.resoudre({ hote: fixture('sombre') });
  const L = r.charte.donnees.sequentielles.principale.map(C.clarte); assert.ok(L.every((x, i) => i === 0 || x > L[i - 1]));
  assert.equal(r.charte.donnees.selection, '#eef1f5'); assert.equal(r.charte.fond.plan.fond, '#12161c'); assert.equal(r.charte.fond.plan.texte, '#eef1f5');
  assert.equal(r.avertissements.filter((a) => a.code === 'contraste-texte').length, 0);
  assert.equal(r.charte.fond.mode, 'uni');
});

// ---------------------------------------------------------------------------------------------------------------- niveau 4 : couche
test('surcharge de couche : s\'ajoute à l\'hôte et l\'emporte ; `verifier: false` saute les mesures', () => {
  const hote = { graines: { principal: '#1b6b7a' }, jetons: { a: '#111111', b: '#222222' } };
  const r = R.resoudre({ hote, couche: { jetons: { b: '#333333', c: '#444444' }, donnees: { qualitative: ['#123456', '#abcdef'] } } });
  assert.deepEqual(r.charte.jetons, { a: '#111111', b: '#333333', c: '#444444' }); assert.deepEqual(r.charte.donnees.qualitative, ['#123456', '#abcdef']); assert.ok(r.applique.includes('jetons.c'));
  const rapide = R.resoudre({ hote, couche: { jetons: { c: '#444444' } }, verifier: false }); assert.equal(rapide.mesures, null); assert.deepEqual(rapide.avertissements, []);
  assert.deepEqual(R.resoudre({ hote, couche: null }).charte, R.resoudre({ hote }).charte);
});

test('quatre niveaux : le plus fort gagne clé par clé (défaut < nommée < hôte < couche)', () => {
  const r = R.resoudre({ hote: { base: 'contraste-eleve', graines: { encre: '#202020' }, texte: { famille: 'mono' } }, couche: { texte: { famille: 'serif' } } });
  assert.equal(r.charte.graines.fond, ELEVE.graines.fond, 'nommée sur défaut'); assert.equal(r.charte.graines.encre, '#202020', 'hôte sur nommée'); assert.equal(r.charte.texte.famille, 'serif', 'couche sur hôte');
  assert.equal(r.charte.texte.tailles.legende, ELEVE.texte.tailles.legende, 'le reste vient de la nommée');
});

// ---------------------------------------------------------------------------------------------------------------- préférence
test('préférence « contraste élevé » : l\'emporte sur l\'hôte pour les données, l\'encre, le fond, les états et les exigences — et l\'indique', () => {
  const hote = { graines: { principal: '#7a3e9d', secondaire: '#d9a21b', encre: '#555555', fond: '#f0f0f0' }, donnees: { qualitative: ['#ffff00', '#ffffaa'] }, texte: { famille: 'serif' }, jetons: { titre: '#7a3e9d' } };
  const r = R.resoudre({ hote, preferences: { contrasteEleve: true } });
  assert.equal(r.a11y.preference.contrasteEleve, true); assert.equal(r.a11y.preference.appliquee, true); assert.deepEqual(r.a11y.preference.remplace, [...R.CHEMINS_CONTRASTE_ELEVE]);
  assert.equal(r.charte.graines.encre, '#000000'); assert.equal(r.charte.graines.fond, '#ffffff'); assert.deepEqual(r.charte.donnees, JSON.parse(JSON.stringify(ELEVE.donnees))); assert.deepEqual(r.charte.exigences, ELEVE.exigences);
  assert.equal(r.charte.graines.principal, '#7a3e9d', 'l\'identité de l\'hôte reste'); assert.equal(r.charte.texte.famille, 'serif'); assert.equal(r.charte.jetons.titre, '#7a3e9d');
  assert.ok(!r.applique.includes('graines.encre') && !r.applique.includes('donnees.qualitative'), 'ce qui a été remplacé n\'est pas « appliqué »'); assert.ok(r.applique.includes('graines.principal'));
  assert.ok(r.avertissements.some((a) => a.code === 'preference-contraste-elevee')); assert.ok(C.contraste(r.charte.graines.encre, r.charte.fond.plan.fond) >= 7);
  assert.equal(r.charte.fond.plan.fond, '#ffffff', 'le plan est recalculé avec le fond de la préférence');
});

test('préférence : sans effet sur une charte déjà « contraste-eleve », sans préférence rien ne change, et la couche ne la contourne pas', () => {
  const deja = R.resoudre({ hote: { base: 'contraste-eleve' }, preferences: { contrasteEleve: true } });
  assert.equal(deja.a11y.preference.appliquee, false); assert.equal(deja.a11y.preference.raison, 'charte-deja-contrastee');
  const sans = R.resoudre({ hote: fixture('neutre'), preferences: { contrasteEleve: false } }); assert.equal(sans.a11y.preference.appliquee, false); assert.deepEqual(sans.a11y.preference.remplace, []);
  const couche = R.resoudre({ hote: fixture('neutre'), couche: { donnees: { qualitative: ['#ffff00', '#ffffaa'] } }, preferences: { contrasteEleve: true } });
  assert.deepEqual(couche.charte.donnees.qualitative, [...ELEVE.donnees.qualitative]);
});

// ---------------------------------------------------------------------------------------------------------------- ignoré, version, fusion
test('valeurs invalides : écartées, signalées une fois dans `ignore` et dans `avertissements`, la charte reste utilisable', () => {
  const r = R.resoudre({ hote: fixture('hostile') });
  assert.ok(r.ignore.length > 20); const v = r.avertissements.filter((a) => a.code === 'valeur-ignoree'); assert.ok(v.length > 10);
  for (const a of v) { assert.equal(a.niveau, 'attention'); assert.equal(typeof a.mesure.raison, 'string'); assert.ok(a.conseil.length > 10); }
  assert.ok(r.avertissements.some((a) => a.code === 'cle-inconnue' && a.niveau === 'info'));
  for (const k of SECTIONS) assert.ok(k in r.charte, k);
  assert.ok(!/url\(|var\(|javascript|<script|expression|calc\(/i.test(JSON.stringify(r.charte)), 'rien de dangereux dans la charte résolue');
  assert.equal(r.charte.fond.principal, '#1b6b7a'); assert.deepEqual(r.charte.donnees.sequentielles.ok, ['#ffffff', '#000000']);
});

test('version : une version de charte inconnue est ignorée avec un avertissement', () => {
  const r = R.resoudre({ hote: { version: 'atlas-charte/0.2', graines: { principal: '#1b6b7a' } } });
  assert.ok(r.avertissements.some((a) => a.code === 'version-inconnue')); assert.deepEqual(r.applique, []); assert.equal(r.charte.graines.principal, ATLAS.graines.principal);
  assert.deepEqual(R.resoudre({ hote: { version: 'atlas-charte/0.1' } }).ignore, []);
});

test('fusion : objets fusionnés clé à clé, listes remplacées, entrées jamais modifiées', () => {
  const a = { x: { y: 1, z: [1, 2] }, w: 1 }, b = { x: { z: [3] }, v: 2 }, ac = JSON.stringify(a), bc = JSON.stringify(b);
  assert.deepEqual(R.fusionner(a, b), { x: { y: 1, z: [3] }, w: 1, v: 2 }); assert.equal(JSON.stringify(a), ac); assert.equal(JSON.stringify(b), bc);
  assert.deepEqual(R.fusionner({ a: 1 }, undefined), { a: 1 }); assert.deepEqual(R.fusionner(undefined, { a: 1 }), { a: 1 });
});

// ---------------------------------------------------------------------------------------------------------------- idempotence
test('idempotence : résoudre une charte déjà résolue redonne la même charte, sans rien dériver', () => {
  for (const hote of [{}, fixture('neutre'), fixture('sombre'), fixture('complete'), { graines: { principal: '#1b6b7a' } }]) {
    const a = R.resoudre({ hote }), b = R.resoudre({ hote: a.charte });
    assert.deepEqual(b.charte, a.charte, JSON.stringify(hote).slice(0, 60)); assert.deepEqual(b.derive.filter((d) => d !== 'fond.plan'), [], 'rien à dériver la seconde fois');
    assert.deepEqual(b.ignore, []);
  }
});

test('charte résolue : conforme au schéma JSON, aucune entrée modifiée, toutes les couleurs normalisées', () => {
  for (const nom of ['neutre', 'sombre', 'complete']) {
    const hote = fixture(nom), copie = JSON.stringify(hote), r = R.resoudre({ hote });
    assert.equal(JSON.stringify(hote), copie, 'entrée intacte'); assert.deepEqual(validerSchema(SCHEMA, r.charte), [], nom); assert.deepEqual(S.assainir(r.charte).ignore, [], nom);
  }
  const defaut = R.resoudre({}).charte; assert.deepEqual(validerSchema(SCHEMA, defaut), []); assert.ok(Object.isFrozen(ATLAS), 'la charte embarquée n\'est pas modifiable'); defaut.graines.principal = '#000000'; assert.equal(ATLAS.graines.principal, '#c44536');
});

// ---------------------------------------------------------------------------------------------------------------- jetons
test('jetons : les graines (jeton:principal, jeton:fond, jeton:succes…) puis ceux de la charte ; inconnu = gris neutre', () => {
  const r = R.resoudre({ hote: { graines: { principal: '#1b6b7a' }, jetons: { site: '#336699', principal: '#000001' } } }), j = R.jetonsDe(r.charte);
  assert.equal(j.fond, '#ffffff'); assert.equal(j.succes, ATLAS.graines.succes); assert.equal(j.site, '#336699'); assert.equal(j.principal, '#000001', 'un jeton de la charte l\'emporte sur la graine du même nom');
  assert.equal(R.resoudreJeton('jeton:site', j), '#336699'); assert.equal(R.resoudreJeton('jeton:inconnu', j), '#808080'); assert.equal(R.resoudreJeton('jeton:inconnu', j, '#111111'), '#111111');
  assert.equal(R.resoudreJeton('#ff0000', j), '#ff0000'); assert.equal(R.resoudreJeton(12, j), 12); assert.equal(R.resoudreJeton(null, j), null);
});

test('jetons : un nom hérité d\'Object.prototype ou un format voisin ne résout rien', () => {
  const j = { a: '#111111' };
  for (const v of ['jeton:constructor', 'jeton:__proto__', 'jeton:toString', 'jeton:hasOwnProperty']) assert.equal(R.resoudreJeton(v, j), '#808080', v);
  for (const v of ['jeton:', 'jeton:a b', 'JETON:a', ' jeton:a', 'jeton:a;x', 'jeton:' + 'a'.repeat(41)]) assert.equal(R.resoudreJeton(v, j), v, v);
});
