import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CLE_LIAISON, ligneLiaison, lireLiaison, origineLisible } from '../lib/pg-liaisons.js';
import { htmlDirectes, htmlApercu } from '../lib/vue-import-pg.js';

const spec = { url: 'https://pg.exemple.fr', connexion: 'demo', schema: 'bati', table: 'batiment', couleur: '#1f77b4', libelle: 'bati.batiment' };

describe('pg-liaisons — la ligne enregistrée', () => {
  it('une ligne Maquette_Layers valide : GeoJSON « {} » jamais vide, aucune entité, aucun jeton', () => {
    const l = ligneLiaison(spec);
    assert.equal(l.GeoJSON, '{}');
    assert.deepEqual(Object.keys(l).sort(), ['Color', 'GeoJSON', 'GeomType', 'Name', 'StyleJSON', 'Visible']);
    assert.deepEqual(JSON.parse(l.StyleJSON), { [CLE_LIAISON]: { url: spec.url, connexion: 'demo', schema: 'bati', table: 'batiment' } });
    assert.doesNotMatch(JSON.stringify(l), /jeton|token|bearer|authorization/i);
  });

  it('aller-retour : ce qui est écrit se relit à l’identique', () => {
    const style = JSON.parse(ligneLiaison(spec).StyleJSON);
    assert.deepEqual(lireLiaison(style), { url: spec.url, connexion: 'demo', schema: 'bati', table: 'batiment' });
  });
});

describe('pg-liaisons — la lecture d’un document (donnée non fiable)', () => {
  const ok = { url: 'https://pg.exemple.fr/', connexion: 'demo', schema: 'bati', table: 'batiment' };

  it('ce qui n’est pas une liaison n’en est pas une', () => {
    for (const style of [null, undefined, {}, { mode: 'mapbox' }, 'texte', 3, { _pg: null }, { _pg: 'x' }]) {
      assert.equal(lireLiaison(style), null);
    }
  });

  it('une liaison incomplète ou mal typée est refusée', () => {
    for (const champ of ['url', 'connexion', 'schema', 'table']) {
      assert.equal(lireLiaison({ _pg: { ...ok, [champ]: '' } }), null, champ);
      assert.equal(lireLiaison({ _pg: { ...ok, [champ]: 12 } }), null, champ);
      const sans = { ...ok }; delete sans[champ];
      assert.equal(lireLiaison({ _pg: sans }), null, champ);
    }
  });

  it('une adresse non https (hors localhost) est refusée dès la lecture : le jeton ne partirait jamais en clair', () => {
    assert.equal(lireLiaison({ _pg: { ...ok, url: 'http://pg.exemple.fr' } }), null);
    assert.equal(lireLiaison({ _pg: { ...ok, url: 'ftp://pg.exemple.fr' } }), null);
    assert.equal(lireLiaison({ _pg: { ...ok, url: 'pas une adresse' } }), null);
    assert.notEqual(lireLiaison({ _pg: { ...ok, url: 'http://localhost:8000' } }), null);
    assert.equal(lireLiaison({ _pg: ok }).url, 'https://pg.exemple.fr', 'la barre finale est retirée');
  });

  it('origineLisible ne montre que l’hôte', () => {
    assert.equal(origineLisible('https://pg.exemple.fr:8443/v1/x?y=1'), 'pg.exemple.fr:8443');
    assert.equal(origineLisible('n’importe quoi'), 'n’importe quoi');
  });
});

describe('vue — liaisons enregistrées', () => {
  it('une liaison à afficher montre son origine, un œil pour l’afficher et un menu (jamais « masquer »)', () => {
    const h = htmlDirectes([{ id: 'liaison-4', libelle: 'bati.batiment', couleur: '#d62728', etat: 'à afficher', visible: false, enregistree: true, origine: 'pg.exemple.fr' }]);
    assert.match(h, /data-pg-bascule="liaison-4"[^>]*aria-pressed="false"/);
    assert.match(h, /Afficher bati\.batiment sur la carte/);
    assert.match(h, /data-pg-menu="liaison-4"/);
    assert.match(h, /gardée/);
    assert.match(h, /pg\.exemple\.fr/);
    assert.match(h, /masquee/);
  });

  it('une couche affichée : l’œil la masque (aria-pressed vrai) et son état est dit', () => {
    const h = htmlDirectes([{ id: 'a', libelle: 'x.y', couleur: '#000', etat: '3 entités', visible: true, enregistree: true, origine: 'h' }]);
    assert.match(h, /data-pg-bascule="a"[^>]*aria-pressed="true"/);
    assert.match(h, /Masquer x\.y sur la carte/);
    assert.match(h, /3 entités/);
    assert.doesNotMatch(h, /masquee/);
  });

  it('une couche de session : pas de pastille « gardée » (elle ne survit pas à la page)', () => {
    const h = htmlDirectes([{ id: 'a', libelle: 'x.y', couleur: '#000', etat: '3 entités', visible: true }]);
    assert.doesNotMatch(h, /gardée/);
    assert.match(h, /data-pg-menu="a"/);
  });

  it('une liste vide ne rend rien', () => {
    assert.equal(htmlDirectes([]), '');
  });

  it('tout ce qui vient du document est échappé', () => {
    const h = htmlDirectes([{ id: 'l"><i>', libelle: '<b>x</b>', couleur: 'red"onmouseover="x', etat: '<script>', visible: false, enregistree: true, origine: '<u>h</u>' }]);
    assert.doesNotMatch(h, /<b>|<i>|<script>|<u>/);
    assert.doesNotMatch(h, /onmouseover="x/);
  });

  it('« Afficher et garder » n’est proposé que si le document peut l’accueillir', () => {
    const base = { table: { schema: 'a', table: 'b' }, phase: 'pret', couche: { nb_entites: 1, avertissements: [] }, plan: { ok: true }, nom: 'B' };
    assert.match(htmlApercu({ ...base, peutEnregistrer: true }), /data-act="direct-enregistre"/);
    assert.doesNotMatch(htmlApercu({ ...base, peutEnregistrer: false }), /direct-enregistre/);
    assert.doesNotMatch(htmlApercu(base), /direct-enregistre/);
  });
});

describe('le chargement ne contacte jamais une passerelle', () => {
  const lire = (f) => readFileSync(fileURLToPath(new URL(`../${f}`, import.meta.url)), 'utf8');

  it('loadLayersFromGrist met la liaison de côté sans l’activer ni la monter', () => {
    const app = lire('app_v7.js');
    const debut = app.indexOf('async function loadLayersFromGrist');
    const fin = app.indexOf('/** Vrai une fois `Maquette_Layers` connue', debut);
    const corps = app.slice(debut, fin);
    assert.match(corps, /lireLiaison\(style\)/);
    assert.match(corps, /STATE\.liaisonsPg\.push\(/);
    assert.doesNotMatch(corps, /creerCoucheDirecte|creerClientPg|ouvrirImportPg|pg-direct|vue-import-pg|fetch\(['"`]https?/);
  });

  it('ouvrir le panneau PG ne contacte une passerelle que par l’adresse du DOCUMENT ; sinon, connexion à la demande', () => {
    const vue = lire('lib/vue-import-pg.js');
    assert.doesNotMatch(vue, /if \(etat\.url\) connecter\(/, 'une adresse du navigateur ne connecte jamais toute seule');
    // Les gestes de la personne : le bouton, et la touche Entrée dans le champ d'adresse.
    assert.equal((vue.match(/connecter\(\)/g) || []).length, 2, 'bouton + touche Entrée');
    // La seule voie automatique : l'adresse enregistrée dans le document (`demarrage` la distingue de celle que le navigateur a retenue).
    const autos = vue.match(/connecter\(\{ automatique: true \}\)/g) || [];
    assert.equal(autos.length, 1);
    assert.match(vue, /if \(depart\.connexionAuto\) connecter\(\{ automatique: true \}\)/);
    const rendu = lire('lib/vue-pg-rendu.js');
    assert.match(rendu, /data-act="connecter"/);
  });

  it('le module de liaisons n’écrit ni ne lit rien de lui-même', () => {
    const s = lire('lib/pg-liaisons.js');
    assert.doesNotMatch(s, /fetch\(|applyUserActions|docApi|localStorage|sessionStorage/);
  });
});
