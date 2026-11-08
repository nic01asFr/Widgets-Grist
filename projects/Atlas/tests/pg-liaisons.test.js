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
  it('une liaison à activer montre son origine, « Activer » et « Supprimer » (jamais « Retirer »)', () => {
    const h = htmlDirectes([{ id: 'liaison-4', libelle: 'bati.batiment', couleur: '#d62728', etat: 'à activer', active: false, enregistree: true, origine: 'pg.exemple.fr' }]);
    assert.match(h, /data-activer="liaison-4"/);
    assert.match(h, /data-supprimer="liaison-4"/);
    assert.doesNotMatch(h, /data-retirer/);
    assert.match(h, /enregistrée dans le document/);
    assert.match(h, /pg\.exemple\.fr/);
  });

  it('une couche active enregistrée : « Retirer » (de la carte) et « Supprimer » (du document)', () => {
    const h = htmlDirectes([{ id: 'a', libelle: 'x.y', couleur: '#000', etat: '3 entités', active: true, enregistree: true, origine: 'h' }]);
    assert.match(h, /data-retirer="a"/);
    assert.match(h, /data-supprimer="a"/);
  });

  it('une couche de session : « Retirer » seulement, et on dit qu’elle ne dure pas', () => {
    const h = htmlDirectes([{ id: 'a', libelle: 'x.y', couleur: '#000', etat: '3 entités' }]);
    assert.match(h, /data-retirer="a"/);
    assert.doesNotMatch(h, /data-supprimer/);
    assert.match(h, /cette session seulement/);
  });

  it('tout ce qui vient du document est échappé', () => {
    const h = htmlDirectes([{ id: 'l"><i>', libelle: '<b>x</b>', couleur: 'red"onmouseover="x', etat: '<script>', active: false, enregistree: true, origine: '<u>h</u>' }]);
    assert.doesNotMatch(h, /<b>|<i>|<script>|<u>/);
    assert.doesNotMatch(h, /onmouseover="x/);
  });

  it('« Lier et enregistrer » n’est proposé que si le document peut l’accueillir', () => {
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

  it('ouvrir le panneau PG ne contacte pas la passerelle : connexion à la demande', () => {
    const vue = lire('lib/vue-import-pg.js');
    assert.doesNotMatch(vue, /if \(etat\.url\) connecter\(\)/);
    assert.match(vue, /Cliquez sur « Se connecter »/);
    // la seule façon d'atteindre connecter() est le bouton
    assert.equal((vue.match(/connecter\(\)/g) || []).length, 2, 'définition + clic');
  });

  it('le module de liaisons n’écrit ni ne lit rien de lui-même', () => {
    const s = lire('lib/pg-liaisons.js');
    assert.doesNotMatch(s, /fetch\(|applyUserActions|docApi|localStorage|sessionStorage/);
  });
});
