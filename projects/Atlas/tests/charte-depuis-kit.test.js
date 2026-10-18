// Thème du kit -> graines de la charte d'Atlas : correspondance, mode, entrée non fiable, résolution sans rien écarter.
// Les fixtures sont des COPIES des fichiers `kit-theme-fichier/0.1` du générateur du kit (empreinte comprise) : si le kit change, le test de
// correspondance des noms le dit ; recopier alors son dossier `dist/`.
// node --test tests/charte-depuis-kit.test.js   (aucun accès réseau, aucune dépendance)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as K from '../lib/charte/depuis-kit.js';
import { resoudre } from '../lib/charte/resolution.js';
import { VERSION_CHARTE } from '../lib/charte/schema.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const lire = (n) => JSON.parse(readFileSync(join(ICI, 'fixtures/kit-theme', n), 'utf8'));
const fichier = (paquet, mode) => lire(`theme-formulaire.${paquet}.${mode}.json`);
const COMBINAISONS = [['neutre', 'clair'], ['neutre', 'sombre'], ['grist', 'clair'], ['grist', 'sombre']];

test('les variables lues existent toutes dans le manifeste du kit (dérive des noms)', () => {
  const cles = new Set(lire('kit-theme-0.1.manifest.json').cles);
  assert.equal(cles.size, 26);
  for (const cle of Object.keys(K.CORRESPONDANCE)) assert.ok(cles.has(cle), cle);
});

test('correspondance : accent, fond, texte et les quatre états ; le croisement alerte/attention est tenu', () => {
  for (const [p, m] of COMBINAISONS) {
    const f = fichier(p, m), v = f.valeurs;
    const { charte, ignore } = K.charteDepuisKit(f);
    assert.deepEqual(ignore, [], p + m);
    assert.equal(charte.version, VERSION_CHARTE);
    const g = charte.graines;
    assert.equal(g.principal, v.accent.toLowerCase());
    assert.equal(g.fond, v.fond.toLowerCase());
    assert.equal(g.encre, v.texte.toLowerCase());
    assert.equal(g.succes, v.ok.toLowerCase());
    assert.equal(g.alerte, v.attention.toLowerCase(), 'l\'ORANGE du kit est l\'alerte d\'Atlas');
    assert.equal(g.erreur, v.alerte.toLowerCase(), 'le ROUGE du kit est l\'erreur d\'Atlas');
    assert.equal(g.information, v.info.toLowerCase());
    assert.equal('secondaire' in g, false, 'le kit n\'a pas de couleur secondaire : Atlas la calcule');
    assert.deepEqual(charte.texte, { famille: f.police });
  }
});

test('l\'enveloppe entière et son seul champ `valeurs` donnent les mêmes graines ; sans enveloppe, la police n\'est pas posée', () => {
  const f = fichier('grist', 'clair');
  const a = K.charteDepuisKit(f).charte, b = K.charteDepuisKit(f.valeurs).charte;
  assert.deepEqual(b.graines, a.graines);
  assert.equal('texte' in b, false);
});

test('le mode se traduit PAR FICHIER : clair et sombre donnent des graines différentes', () => {
  const clair = K.charteDepuisKit(fichier('grist', 'clair')).charte.graines;
  const sombre = K.charteDepuisKit(fichier('grist', 'sombre')).charte.graines;
  assert.notEqual(clair.fond, sombre.fond); assert.notEqual(clair.encre, sombre.encre);
});

test('résolution : rien n\'est ignoré, les graines sont appliquées, le plan et les rampes sont calculés (halo, lavis et plan hors thème)', () => {
  for (const [p, m] of COMBINAISONS) {
    const { charte } = K.charteDepuisKit(fichier(p, m));
    const r = resoudre({ hote: charte });
    assert.deepEqual(r.ignore, [], p + m);
    for (const g of ['principal', 'fond', 'encre', 'succes', 'alerte', 'erreur', 'information']) assert.ok(r.applique.includes('graines.' + g), g);
    for (const d of ['fond.plan', 'donnees.halo', 'donnees.qualitative', 'donnees.sequentielles.principale']) assert.ok(r.derive.includes(d), d);
    assert.equal(r.applique.some((c) => c.startsWith('fond.') || c === 'donnees.halo'), false, 'le thème du document ne fixe ni plan, ni halo, ni lavis');
    assert.match(r.charte.fond.plan.fond, /^#[0-9a-f]{6}$/i);
  }
});

test('entrée non fiable : couleur illisible, translucide, police hors liste, type inattendu, version inconnue', () => {
  const sale = { version: 'autre/9', police: 'Comic Sans', valeurs: { accent: 'url(http://x)', fond: 'rgba(0,0,0,0.3)', texte: '#111111', ok: 12, attention: 'var(--x)', alerte: '#ff0000' } };
  const { charte, ignore } = K.charteDepuisKit(sale);
  assert.deepEqual(charte.graines, { encre: '#111111', erreur: '#ff0000' });
  assert.equal('texte' in charte, false);
  const codes = ignore.map((i) => i.chemin + ':' + i.code).sort();
  assert.deepEqual(codes, ['police:police-non-listee', 'valeurs.accent:couleur-invalide', 'valeurs.attention:couleur-invalide', 'valeurs.fond:alpha-non-admis', 'valeurs.ok:couleur-invalide', 'version:version-inconnue']);
  for (const mauvais of [null, undefined, 'x', 42, [], { valeurs: 'x' }, { valeurs: [] }]) {
    const r = K.charteDepuisKit(mauvais); assert.equal(r.charte, null); assert.ok(r.ignore.length >= 1);
  }
  assert.equal(K.charteDepuisKit({}).charte, null, 'un objet sans aucune variable connue ne pose rien');
});

test('la charte rendue se sérialise sans perte et ne porte aucune clé étrangère', () => {
  const { charte } = K.charteDepuisKit(fichier('neutre', 'clair'));
  assert.deepEqual(JSON.parse(JSON.stringify(charte)), charte);
  assert.deepEqual(Object.keys(charte).sort(), ['graines', 'nom', 'texte', 'version']);
});
