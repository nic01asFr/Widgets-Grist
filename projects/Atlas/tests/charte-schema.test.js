// Schéma de la charte : assainissement, validation, valeurs hostiles, schéma JSON.
// node --test tests/charte-schema.test.js   (aucun accès réseau, aucune dépendance)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as S from '../lib/charte/schema.js';
import { CHARTE_ATLAS, CHARTE_CONTRASTE_ELEVE } from '../lib/charte/defauts.js';
import { FONDS, PLAN_DEFAUT } from '../lib/bi/fond-plan.js';
import { FORMES as FORMES_BI } from '../lib/bi/icones-etats.js';
import { INTENSITES_PLAN } from '../lib/charte/derivation.js';
import { validerSchema } from './aide-json-schema.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const lire = (f) => JSON.parse(readFileSync(join(ICI, f), 'utf8'));
const fixture = (n) => lire('fixtures/charte/' + n + '.json');
const SCHEMA = lire('../lib/charte/charte.schema.json');

// ---------------------------------------------------------------------------------------------------------------- cohérence avec le reste d'Atlas
test('listes sûres : modes de fond, jetons du plan et formes sont ceux du composant BI', () => {
  assert.deepEqual([...S.MODES_FOND].sort(), Object.keys(FONDS).sort());
  assert.deepEqual([...S.JETONS_PLAN].sort(), Object.keys(PLAN_DEFAUT).sort());
  assert.deepEqual([...S.FORMES], [...FORMES_BI]);
  assert.deepEqual([...S.INTENSITES_PLAN].sort(), Object.keys(INTENSITES_PLAN).sort());
  assert.equal(S.VERSION_CHARTE, 'atlas-charte/0.1');
});

test('familles de police : une liste sûre de piles système, sans police distante ni pile libre', () => {
  for (const [id, pile] of Object.entries(S.FAMILLES_POLICE)) { assert.match(id, /^[a-z]+$/); assert.ok(!/url|http|@import|;|\{|\}|<|>/i.test(pile), pile); }
  assert.equal(S.pilePolice('serif'), S.FAMILLES_POLICE.serif); assert.equal(S.pilePolice('Comic Sans MS, url(x)'), S.FAMILLES_POLICE.systeme); assert.equal(S.pilePolice(undefined), S.FAMILLES_POLICE.systeme);
});

// ---------------------------------------------------------------------------------------------------------------- exemples valides
test('chartes d\'exemple et chartes nommées : rien n\'est écarté, couleurs normalisées', () => {
  for (const nom of ['neutre', 'sombre', 'complete']) { const r = S.assainir(fixture(nom)); assert.deepEqual(r.ignore, [], nom); assert.equal(r.charte.version, S.VERSION_CHARTE); }
  for (const c of [CHARTE_ATLAS, CHARTE_CONTRASTE_ELEVE]) { const r = S.assainir(JSON.parse(JSON.stringify(c))); assert.deepEqual(r.ignore, [], c.nom); assert.deepEqual(r.charte, JSON.parse(JSON.stringify(c)), c.nom); }
  const c = S.assainir(fixture('complete')).charte;
  assert.equal(c.jetons.surbrillance, '#e6b31a', 'hsl(45, 80%, 50%) normalisé (CSS : rgb(230, 179, 26))');
  assert.equal(c.jetons.voile, '#201a2680'); assert.equal(c.donnees.contour, '#ffffffcc');
});

test('idempotence : assainir une charte assainie ne change rien', () => {
  for (const nom of ['neutre', 'sombre', 'complete', 'theme-03', 'hostile']) {
    const a = S.assainir(fixture(nom)).charte, b = S.assainir(a).charte;
    assert.deepEqual(b, a, nom); assert.deepEqual(S.assainir(b).ignore, [], nom + ' : la sortie assainie ne contient plus rien d\'invalide');
  }
});

// ---------------------------------------------------------------------------------------------------------------- hostile
test('charte hostile : aucune valeur dangereuse ne survit, le reste de la charte reste utilisable', () => {
  const brut = readFileSync(join(ICI, 'fixtures/charte/hostile.json'), 'utf8'), arbre = JSON.parse(brut);
  assert.ok(Object.prototype.hasOwnProperty.call(arbre, '__proto__'), 'le fichier porte bien une clé __proto__ propre');
  const { charte, ignore } = S.assainir(arbre);
  const sortie = JSON.stringify(charte);
  for (const motif of [/url\(/i, /var\(/i, /expression/i, /javascript/i, /<script/i, /<img/i, /<svg/i, /[<>]/, /evil\.example/, /calc\(/i, /currentColor/i, /;/, /passwd/, /Comic/]) assert.ok(!motif.test(sortie), String(motif) + ' dans ' + sortie);
  assert.equal(({}).polluee, undefined); assert.equal(Object.prototype.polluee, undefined); assert.equal(charte.polluee, undefined);
  assert.equal(Object.getPrototypeOf(charte), Object.prototype);
  // ce qui est valide survit
  assert.equal(charte.graines.fond, '#ffffff'); assert.equal(charte.jetons.bon, '#336699'); assert.deepEqual(charte.donnees.sequentielles.ok, ['#ffffff', '#000000']);
  assert.equal(charte.fond.principal, '#1b6b7a'); assert.equal(charte.fond.plan.eau, '#cfe0ea'); assert.equal(charte.donnees.selection, undefined, 'selection translucide refusée (opaque exigé)');
  assert.equal(charte.donnees.survol, '#00000066', 'survol : translucide admis'); assert.equal(charte.marqueurs.formes.alerte, 'triangle'); assert.equal(charte.texte.tailles.etiquette, 12);
  // ce qui est invalide est écarté et signalé
  const chemins = new Set(ignore.map((i) => i.chemin));
  for (const c of ['graines.principal', 'graines.secondaire', 'graines.encre', 'graines.succes', 'graines.alerte', 'graines.erreur', 'graines.information', 'graines.extra', 'jetons.mauvais nom', 'jetons.javascript', 'jetons.image',
    'donnees.sequentielles.casse[1]', 'donnees.sequentielles.trop-courte', 'donnees.sequentielleDefaut', 'donnees.divergente', 'donnees.qualitative[3]', 'donnees.sansDonnee', 'fond.mode', 'fond.vegetation', 'fond.intensites.vert',
    'fond.intensites.bati', 'fond.intensites.eau', 'fond.lavis.couleur', 'fond.lavis.opacite', 'fond.plan.inconnu', 'fond.plan.texte', 'marqueurs.formes.succes', 'marqueurs.formes.danger', 'marqueurs.contour', 'texte.famille', 'texte.tailles.legende',
    'exigences.contrasteMinimal', 'exigences.contrasteTexte', 'exigences.classesMax', 'surcharge']) assert.ok(chemins.has(c), 'non signalé : ' + c + ' — signalés : ' + [...chemins].join(' | '));
  for (const i of ignore) { assert.equal(typeof i.chemin, 'string'); assert.equal(typeof i.code, 'string'); assert.ok(i.valeur.length <= S.LIMITES.valeurAffichee); assert.ok(!/[\u0000-\u001f]/.test(i.valeur)); }
  // le nom est du texte nettoyé de ses chevrons
  assert.ok(!/[<>]/.test(charte.nom)); assert.ok(charte.nom.length <= S.LIMITES.nom);
});

test('charte hostile : palettes personnalisées — identifiant, type, couleur invalides, doublon et usage HTML', () => {
  const { charte, ignore } = S.assainir(fixture('hostile'));
  assert.deepEqual(charte.palettes.map((p) => p.id), ['ok-1']);
  assert.deepEqual(charte.palettes[0].couleurs, ['#ffffff', '#000000']); assert.ok(!charte.palettes[0].usages || charte.palettes[0].usages.every((u) => !/[<>]/.test(u)));
  const codes = ignore.filter((i) => i.chemin.startsWith('palettes')).map((i) => i.code);
  for (const c of ['id-invalide', 'doublon', 'valeur-inconnue', 'couleur-invalide']) assert.ok(codes.includes(c), c + ' absent de ' + codes);
});

test('entrées qui ne sont pas des chartes : tableau, texte, nombre, null, fonction, instance de classe', () => {
  for (const v of [[], 'x', 12, null, undefined, true, () => {}, new Date(), new Map(), Object.create({ graines: { principal: '#fff' } })]) { const r = S.assainir(v); assert.deepEqual(r.charte, {}, String(v)); assert.equal(r.ignore.length, 1); assert.equal(r.ignore[0].code, 'type'); }
  const nul = Object.create(null); nul.nom = 'ok'; assert.equal(S.assainir(nul).charte.nom, 'ok');
});

test('bornes : listes, dictionnaires et chaînes démesurés sont refusés sans parcours coûteux', () => {
  const t0 = Date.now();
  const gros = { jetons: Object.fromEntries(Array.from({ length: S.LIMITES.jetons + 1 }, (_, i) => ['j' + i, '#000000'])) };
  assert.equal(S.assainir(gros).charte.jetons, undefined); assert.equal(S.assainir(gros).ignore[0].code, 'taille');
  assert.equal(S.assainir({ donnees: { qualitative: Array(30).fill('#000000') } }).charte.donnees, undefined);
  assert.equal(S.assainir({ donnees: { divergente: Array(26).fill('#000000') } }).charte.donnees, undefined);
  assert.equal(S.assainir({ nom: 'x'.repeat(100000) }).ignore[0].code, 'taille');
  const profond = {}; let p = profond; for (let i = 0; i < 50; i++) { p.a = {}; p = p.a; }
  assert.equal(S.assainir(profond).ignore[0].code, 'taille');
  const cycle = { graines: {} }; cycle.graines.soi = cycle; assert.equal(S.assainir(cycle).ignore[0].code, 'taille');
  assert.equal(S.verifierTaille({ a: [1, 2, 3] }), null); assert.match(S.verifierTaille(cycle), /profonde/); assert.match(S.verifierTaille(Array(2000).fill(0)), /liste trop longue/);
  assert.match(S.verifierTaille('x'.repeat(5000)), /chaîne trop longue/);
  assert.ok(Date.now() - t0 < 500, 'durée ' + (Date.now() - t0) + ' ms');
});

test('valider : ok seulement si rien n\'est écarté', () => {
  assert.equal(S.valider(fixture('neutre')).ok, true); assert.equal(S.valider({ graines: { principal: 'rouge' } }).ok, false);
  assert.equal(S.versionCompatible(undefined), true); assert.equal(S.versionCompatible('atlas-charte/0.1'), true); assert.equal(S.versionCompatible('atlas-charte/0.2'), false); assert.equal(S.versionCompatible('autre'), false);
});

test('jetons de fond (setFond) : principal, fondUni et jetons du plan ; le reste est écarté', () => {
  const r = S.assainirJetonsFond({ principal: '#1B6B7A', fondUni: 'rgb(244, 247, 252)', eau: '#cfe0ea', bidule: '#000000', texte: 'url(x)', fond: 12 });
  assert.deepEqual(r.jetons, { principal: '#1b6b7a', fondUni: '#f4f7fc', eau: '#cfe0ea' });
  assert.deepEqual(r.ignore.map((i) => i.chemin).sort(), ['bidule', 'fond', 'texte']);
  assert.deepEqual(S.assainirJetonsFond(undefined), { jetons: {}, ignore: [] }); assert.equal(S.assainirJetonsFond('x').ignore[0].code, 'type');
});

test('palette par valeur : identifiant, type, couleurs, nom par défaut', () => {
  const p = S.assainirPalette({ id: 'abc', type: 'sequential', couleurs: ['#FFF', 'rgb(0,0,0)'] });
  assert.deepEqual(p, { id: 'abc', nom: 'abc', type: 'sequential', couleurs: ['#ffffff', '#000000'] });
  assert.equal(S.assainirPalette({ id: 'abc', type: 'divergent', couleurs: ['#fff', '#000'] }), undefined, 'une divergente a 3 couleurs au moins');
  assert.equal(S.assainirPalette({ id: 'a b', type: 'sequential', couleurs: ['#fff', '#000'] }), undefined);
});

test('chemins : feuilles d\'une charte, version exclue', () => {
  assert.deepEqual(S.cheminsDe({ version: 'atlas-charte/0.1', nom: 'x', graines: { principal: '#fff' }, donnees: { sequentielles: { a: ['#fff', '#000'] }, qualitative: ['#fff', '#000'] }, jetons: { j: '#fff' } }),
    ['nom', 'graines.principal', 'donnees.sequentielles.a', 'donnees.qualitative', 'jetons.j']);
});

// ---------------------------------------------------------------------------------------------------------------- schéma JSON
test('schéma JSON : les exemples valides le respectent, l\'exemple hostile non, sa version assainie oui', () => {
  for (const nom of ['neutre', 'sombre', 'complete']) assert.deepEqual(validerSchema(SCHEMA, fixture(nom)), [], nom);
  for (const c of [CHARTE_ATLAS, CHARTE_CONTRASTE_ELEVE]) assert.deepEqual(validerSchema(SCHEMA, JSON.parse(JSON.stringify(c))), [], c.nom);
  assert.ok(validerSchema(SCHEMA, fixture('hostile')).length > 10);
  assert.ok(validerSchema(SCHEMA, fixture('theme-03')).length > 0, 'un thème 0.3 n\'est pas une charte');
  for (const nom of ['neutre', 'sombre', 'complete', 'hostile', 'theme-03']) assert.deepEqual(validerSchema(SCHEMA, S.assainir(fixture(nom)).charte), [], 'sortie assainie de ' + nom);
});

test('schéma JSON : refuse ce que l\'assainissement refuse (couleurs, bornes, listes, noms)', () => {
  const ko = [
    { graines: { principal: 'url(x)' } }, { graines: { principal: '#fffffff' } }, { graines: { principal: 'rgba(0,0,0,0.5)' } }, { graines: { inconnue: '#fff' } }, { version: 'atlas-charte/0.2' },
    { donnees: { qualitative: ['#fff'] } }, { donnees: { divergente: ['#fff', '#000'] } }, { donnees: { sequentielles: { 'a b': ['#fff', '#000'] } } }, { donnees: { sequentielles: { __proto__x: 1 } } },
    { fond: { mode: 'ailleurs' } }, { fond: { intensites: { vert: 2 } } }, { texte: { famille: 'Comic Sans' } }, { texte: { tailles: { legende: 2 } } }, { exigences: { classesMax: 3.5 } }, { exigences: { contrasteMinimal: 0 } },
    { marqueurs: { formes: { succes: 'etoile' } } }, { palettes: [{ id: 'x', type: 'qualitative', couleurs: ['#fff'] }] }, { palettes: [{ id: 'x y', type: 'qualitative', couleurs: ['#fff', '#000'] }] }, { nom: '' },
  ];
  for (const c of ko) { assert.ok(validerSchema(SCHEMA, c).length > 0, JSON.stringify(c)); }
  const ok = [{ graines: { principal: 'rgb(1, 2, 3)' } }, { graines: { principal: 'hsl(120 50% 40%)' } }, { jetons: { a: 'rgba(0,0,0,0.5)' } }, { jetons: { a: '#12345678' } }, { fond: { vegetation: 'monochrome' } }, { fond: { vegetation: '#4f8a4b' } }];
  for (const c of ok) { assert.deepEqual(validerSchema(SCHEMA, c), [], JSON.stringify(c)); assert.deepEqual(S.assainir(c).ignore, [], JSON.stringify(c)); }
});

test('schéma JSON et table de règles décrivent les mêmes clés, bornes et listes', () => {
  const compare = (regle, schema, chemin) => {
    const s = schema.$ref ? schema : schema;
    if (regle.t === 'objet') {
      assert.equal(s.type, 'object', chemin); assert.equal(s.additionalProperties, false, chemin);
      assert.deepEqual(Object.keys(s.properties).filter((k) => k !== 'version' || chemin !== '').sort(), Object.keys(regle.cles).filter((k) => k !== 'version' || chemin !== '').sort(), chemin);
      for (const [k, r] of Object.entries(regle.cles)) if (!(chemin === '' && k === 'version')) compare(r, s.properties[k], chemin + '.' + k);
    } else if (regle.t === 'liste') { assert.equal(s.minItems, regle.min, chemin); assert.equal(s.maxItems, regle.max, chemin); assert.equal(s.items.$ref, '#/$defs/couleurOpaque'); }
    else if (regle.t === 'nombre') { assert.equal(s.minimum, regle.min, chemin); assert.equal(s.maximum, regle.max, chemin); assert.equal(s.type, regle.entier ? 'integer' : 'number', chemin); }
    else if (regle.t === 'enum') assert.deepEqual(s.enum, regle.valeurs, chemin);
    else if (regle.t === 'dict') { assert.equal(s.maxProperties, regle.max, chemin); compare(regle.valeur, s.additionalProperties, chemin + '.*'); }
    else if (regle.t === 'couleur') assert.equal(s.$ref, '#/$defs/couleurOpaque', chemin);
    else if (regle.t === 'couleurAlpha') assert.equal(s.$ref, '#/$defs/couleur', chemin);
    else if (regle.t === 'texte') assert.equal(s.maxLength, regle.max, chemin);
  };
  compare(S.REGLES, SCHEMA, '');
  assert.equal(SCHEMA.properties.version.const, S.VERSION_CHARTE); assert.equal(SCHEMA.properties.palettes.maxItems, S.LIMITES.palettes);
});

test('schéma JSON : le motif de couleur accepte et refuse les mêmes valeurs que l\'analyse', async () => {
  const { analyserCouleur } = await import('../lib/charte/couleurs.js');
  const motif = new RegExp(SCHEMA.$defs.couleur.pattern), opaque = new RegExp(SCHEMA.$defs.couleurOpaque.pattern);
  const corpus = ['#fff', '#ffff', '#ffffff', '#ffffffff', '#ggg', '#12345', 'rgb(1,2,3)', 'RGB(1 2 3)', 'rgba(1,2,3,0.5)', 'rgb(1 2 3 / 50%)', 'hsl(10, 50%, 50%)', 'hsl(10 50% 50% / 0.5)', 'hsla(10, 50%, 50%, 1)', 'url(x)', 'red', 'var(--a)', 'rgb(1,2)', 'rgb(1,2,3,4,5)', '', 'rgb(1, 2, 3);'];
  for (const c of corpus) {
    assert.equal(motif.test(c), analyserCouleur(c) !== null, 'couleur : ' + c);
    const a = analyserCouleur(c); if (opaque.test(c)) assert.ok(a && a.alpha === 1, 'opaque : ' + c);
  }
});
