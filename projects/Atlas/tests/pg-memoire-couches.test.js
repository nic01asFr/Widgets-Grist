import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLE_COUCHES, lireCouches, repartir, listeAEnregistrer } from '../lib/pg-memoire-couches.js';

const A = { url: 'http://localhost:8080', connexion: 'base', schema: 'metier', table: 'gros', couleur: '#d62728', visible: true };
const B = { url: 'http://localhost:8080', connexion: 'base', schema: 'metier', table: 'zones', couleur: '#1f77b4', visible: false };

describe('pg-memoire-couches — lire', () => {
  it('rien d’enregistré : aucune couche, aucun refus', () => {
    for (const v of [undefined, null, '', '  ']) assert.deepEqual(lireCouches(v), { couches: [], refus: null, ignorees: 0 });
  });

  it('une liste valide est relue telle quelle', () => {
    const r = lireCouches(JSON.stringify([A, B]));
    assert.deepEqual(r.couches, [A, B]);
    assert.equal(r.refus, null);
  });

  it('une valeur illisible ou qui n’est pas une liste est refusée, dite (jamais devinée)', () => {
    assert.match(lireCouches('pas du json').refus, /illisible/);
    assert.match(lireCouches('{"a":1}').refus, /n’est pas une liste/);
    assert.deepEqual(lireCouches('{"a":1}').couches, []);
  });

  it('les entrées incomplètes, doublonnées ou de mauvais type sont écartées et comptées', () => {
    const r = lireCouches(JSON.stringify([A, A, { url: 'x' }, null, 'texte', { ...B, table: '' }]));
    assert.equal(r.couches.length, 1);
    assert.equal(r.ignorees, 5);
  });

  it('une couleur douteuse devient « aucune » (jamais injectée), la visibilité vaut vrai par défaut', () => {
    const r = lireCouches(JSON.stringify([{ ...A, couleur: 'red;background:url(x)', visible: undefined }]));
    assert.equal(r.couches[0].couleur, null);
    assert.equal(r.couches[0].visible, true);
  });

  it('l’adresse est lue sans barre finale', () => {
    assert.equal(lireCouches(JSON.stringify([{ ...A, url: 'http://localhost:8080/' }])).couches[0].url, 'http://localhost:8080');
  });
});

describe('pg-memoire-couches — répartir et écrire', () => {
  it('seules les tables de CETTE adresse et de CETTE connexion sont remises', () => {
    const autre = { ...A, url: 'https://autre.example', table: 'x' };
    const autreBase = { ...A, connexion: 'autre', table: 'y' };
    const r = repartir([A, B, autre, autreBase], { url: 'http://localhost:8080/', connexion: 'base' });
    assert.deepEqual(r.ici, [A, B]);
    assert.deepEqual(r.ailleurs, [autre, autreBase]);
  });

  it('la liste écrite garde l’ordre de la carte, puis les manquantes, puis les autres adresses, sans doublon', () => {
    const manquante = { ...A, table: 'disparue' };
    const autre = { ...A, url: 'https://autre.example' };
    const valeur = JSON.parse(listeAEnregistrer({ posees: [B, A], manquantes: [manquante, A], ailleurs: [autre] }));
    assert.deepEqual(valeur.map((c) => `${c.url}|${c.table}`), ['http://localhost:8080|zones', 'http://localhost:8080|gros', 'http://localhost:8080|disparue', 'https://autre.example|gros']);
  });

  it('la liste écrite ne porte que ces six champs : ni entité, ni jeton', () => {
    const valeur = JSON.parse(listeAEnregistrer({ posees: [{ ...A, jeton: 'secret', geojson: {} }] }));
    assert.deepEqual(Object.keys(valeur[0]).sort(), ['connexion', 'couleur', 'schema', 'table', 'url', 'visible']);
  });

  it('écrire puis relire redonne la même liste', () => {
    assert.deepEqual(lireCouches(listeAEnregistrer({ posees: [A, B] })).couches, [A, B]);
  });
});

describe('garde-fous du branchement : mémoire des couches PostgreSQL', () => {
  const app = readFileSync(new URL('../app_v7.js', import.meta.url), 'utf8');
  const vue = readFileSync(new URL('../lib/vue-import-pg.js', import.meta.url), 'utf8');

  it('la clé est la même côté application et côté module, dans Atlas_Config', () => {
    assert.equal(CLE_COUCHES, 'pgCouches');
    assert.match(app, /ecrireCleConfigPg\('pgCouches', valeur\)/);
    assert.match(app, /indexOf\('pgCouches'\)/);
  });

  it('au démarrage : seulement avec l’adresse du document et une liste non vide, sans attendre, en passant par le panneau (confirmation d’identité)', () => {
    const f = app.slice(app.indexOf('async function remettreCouchesPg'), app.indexOf('function finalizeNewLayer'));
    assert.match(f, /if \(!options \|\| !options\.pgAdresse\) return;/);
    assert.match(f, /A\.openPG\(\{ restauration: true \}\)/);
    assert.match(app, /\n\s+remettreCouchesPg\(\);/, 'lancée sans await : le démarrage n’attend pas la confirmation');
  });

  it('rien n’est écrit tant que la liste du document n’a pas été lue ; une écriture à la fois ; jamais en lecture seule', () => {
    const f = vue.slice(vue.indexOf('function persister()'), vue.indexOf('function persister()') + 900);
    assert.match(f, /!memoireCouches\.prete/);
    assert.match(f, /hote\.lectureSeule\(\)/);
    assert.match(f, /memoireCouches\.file = memoireCouches\.file\.then/);
    assert.match(f, /d\.gristId == null/, 'les liaisons gardées ont leur propre ligne');
  });

  it('chaque ajout, retrait et changement de visibilité écrit la liste', () => {
    for (const repere of ["poserVisibilite(d, visible) {", 'export function retirerCoucheParAtlas', 'export function retirerCouchePg', 'directes.set(id, entree);', 'function retirer(id)']) {
      const i = vue.indexOf(repere);
      assert.ok(i > 0, repere);
      assert.match(vue.slice(i, i + 900), /persister\(\);/, repere);
    }
  });

  it('l’œil et « Tout masquer » de la liste commune préviennent la vue PostgreSQL : visibilité mémorisée, lectures arrêtées', () => {
    const un = app.slice(app.indexOf('    toggleLayer(id, e) {'), app.indexOf('    toggleAllLayers(v) {'));
    const tous = app.slice(app.indexOf('    toggleAllLayers(v) {'), app.indexOf('    zoomLayer(id, e) {'));
    assert.match(un, /STATE\.pgVue\.visibiliteChangeeParAtlas\(l\.id, l\.visible\)/);
    assert.match(tous, /STATE\.pgVue\.visibiliteChangeeParAtlas\(l\.id, v\)/);
    const f = vue.slice(vue.indexOf('export function visibiliteChangeeParAtlas'), vue.indexOf('export function retirerCoucheParAtlas'));
    assert.match(f, /poserVisibilite\(d, visible !== false\)/);
    assert.match(f, /d\.visible !== false\) !== \(visible !== false\)/, 'sans effet si l’état est déjà le bon (pas de boucle)');
  });

  it('une liste illisible n’est pas écrasée, une table introuvable reste dans la liste et est dite', () => {
    const f = vue.slice(vue.indexOf('async function restaurerCouches'), vue.indexOf('/** Une adresse qui vient de servir'));
    assert.match(f, /if \(lue\.refus\) \{ hote\.annoncer\(.*Elle n’est pas écrasée.*; return; \}/);
    assert.ok(f.indexOf('lue.refus') < f.indexOf('memoireCouches.prete = true'), 'prete reste faux si la liste est illisible');
    assert.match(f, /memoireCouches\.manquantes\.push\(e\)/);
    assert.match(f, /Elle reste dans la liste de ce document/);
  });
});
