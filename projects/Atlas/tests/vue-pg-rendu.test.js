import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  htmlBase, htmlBlocTables, htmlTables, htmlFicheConnexion, htmlFicheTable, htmlApercu, listerTables,
  htmlCouchesPgPanneau,
} from '../lib/vue-pg-rendu.js';

const SCHEMA = {
  schemas: [{
    nom: 'public',
    tables: [
      { nom: 'batiment', geometries: [{}], lignes_estimees: 1200 },
      { nom: 'note', geometries: [] },
      { nom: 'spatial_ref_sys', geometries: [] },
    ],
  }],
};

describe('vue-pg-rendu — l’état de la connexion (à gauche)', () => {
  it('connecté : le libellé de la base, le nombre de tables et l’adresse, avec « Réglages »', () => {
    const h = htmlBase({ connecte: true, url: 'https://pg.exemple.fr:8443/v1', libelle: 'Base métier', nbTables: 4 });
    assert.match(h, /Connecté/);
    assert.match(h, /Base métier · 4 tables · pg\.exemple\.fr:8443/);
    assert.match(h, /data-act="reglages"/);
    assert.doesNotMatch(h, /data-act="connecter"/);
    assert.match(h, /pg-pastille ok/);
  });

  it('une seule table : pas de pluriel', () => {
    assert.match(htmlBase({ connecte: true, url: 'https://h', nbTables: 1 }), /1 table(?!s)/);
  });

  it('pas connecté, adresse connue : « Se connecter » est proposé à côté de « Réglages »', () => {
    const h = htmlBase({ connecte: false, url: 'https://pg.exemple.fr' });
    assert.match(h, /Non connecté/);
    assert.match(h, /data-act="connecter"/);
    assert.match(h, /data-act="reglages"/);
    assert.doesNotMatch(h, /pg-pastille ok/);
  });

  it('pas d’adresse : on dit où la renseigner, sans bouton « Se connecter »', () => {
    const h = htmlBase({ connecte: false, url: '' });
    assert.match(h, /Renseignez l’adresse de la passerelle dans les réglages/);
    assert.doesNotMatch(h, /data-act="connecter"/);
  });

  it('connexion en cours : dite, et rien à cliquer pour se reconnecter', () => {
    const h = htmlBase({ connecte: false, enCours: true, url: 'https://pg.exemple.fr' });
    assert.match(h, /Connexion…/);
    assert.doesNotMatch(h, /data-act="connecter"/);
  });

  it('tout est échappé', () => {
    const h = htmlBase({ connecte: true, url: 'https://x', libelle: '<img src=x onerror=1>', nbTables: 2 });
    assert.doesNotMatch(h, /<img/);
  });
});

describe('vue-pg-rendu — les tables de la base (à gauche)', () => {
  it('les tables système et les tables sans carte non modifiables ne sont pas des choix : grisées ou absentes', () => {
    const tables = listerTables(SCHEMA);
    assert.deepEqual(tables.map((t) => t.table), ['batiment', 'note']);
    const h = htmlTables(tables, null);
    assert.match(h, /data-table="public\.batiment"/);
    assert.match(h, /data-table="public\.note"[^>]*disabled/);
    assert.doesNotMatch(h, /data-table="public\.batiment"[^>]*disabled/);
    assert.match(h, /~1 200/);
    assert.match(h, /sans carte/);
  });

  it('la table choisie est marquée (aria-pressed, classe) ', () => {
    const h = htmlTables(listerTables(SCHEMA), { schema: 'public', table: 'batiment' });
    assert.match(h, /pg-table actif"[^>]*data-table="public\.batiment"[^>]*aria-pressed="true"/);
  });

  it('le bloc porte la recherche UNE fois, hors de la zone des lignes (la taper ne la redessine pas)', () => {
    const h = htmlBlocTables({ tables: listerTables(SCHEMA), choisie: null, filtre: 'bat', total: 2 });
    const dedans = h.slice(h.indexOf('id="pg-lignes"'));
    assert.match(h, /id="pg-filtre"[^>]*value="bat"/);
    assert.doesNotMatch(dedans, /pg-filtre/);
    assert.match(h, /Tables de la base/);
  });

  it('aucune table : on le dit', () => {
    assert.match(htmlTables([], null), /Aucune table à afficher/);
  });

  it('les noms de tables sont échappés', () => {
    const h = htmlTables([{ schema: 's"><i>', table: '<b>t</b>', geo: true, modifiable: false }], null);
    assert.doesNotMatch(h, /<b>|<i>/);
  });
});

describe('vue-pg-rendu — la fiche de connexion (à droite)', () => {
  const base = { url: 'https://pg.exemple.fr', connecte: false };

  it('l’adresse, le bouton, et l’aide ; rien sur l’accès ni sur la base tant qu’on n’est pas connecté', () => {
    const { tete, corps } = htmlFicheConnexion(base);
    assert.match(tete, /Connexion/);
    assert.match(tete, /Non connecté/);
    assert.match(corps, /id="pg-url"[^>]*value="https:\/\/pg\.exemple\.fr"/);
    assert.match(corps, /data-act="connecter"[^>]*>Se connecter/);
    assert.doesNotMatch(corps, /Votre accès/);
    assert.doesNotMatch(corps, /Base de données/);
  });

  it('connecté en identité Grist : « aucun jeton à saisir »', () => {
    const { corps } = htmlFicheConnexion({ ...base, connecte: true, modeAcces: 'grist', connexions: [{ alias: 'demo', libelle: 'Démo' }], connexion: 'demo' });
    assert.match(corps, /reconnu par Grist : aucun jeton à saisir/);
    assert.match(corps, /Se reconnecter/);
  });

  it('connecté avec un jeton : il est dit gardé dans la page seulement', () => {
    const { corps } = htmlFicheConnexion({ ...base, connecte: true, modeAcces: 'jeton', connexions: [{ alias: 'a' }], connexion: 'a' });
    assert.match(corps, /jeton, saisi une fois et gardé dans cette page seulement/);
  });

  it('sans jeton demandé : on le dit aussi', () => {
    const { corps } = htmlFicheConnexion({ ...base, connecte: true, modeAcces: null, connexions: [{ alias: 'a' }], connexion: 'a' });
    assert.match(corps, /n’a demandé aucun jeton/);
  });

  it('plusieurs bases : un choix ; une seule : un libellé', () => {
    const deux = htmlFicheConnexion({ ...base, connecte: true, connexions: [{ alias: 'a', libelle: 'A' }, { alias: 'b', libelle: 'B' }], connexion: 'b' }).corps;
    assert.match(deux, /id="pg-connexion"/);
    assert.match(deux, /value="b" selected/);
    const une = htmlFicheConnexion({ ...base, connecte: true, connexions: [{ alias: 'a', libelle: 'Ma base' }], connexion: 'a' }).corps;
    assert.doesNotMatch(une, /id="pg-connexion"/);
    assert.match(une, /Ma base/);
  });

  it('une erreur de connexion est montrée en alerte, avec sa cause', () => {
    const { corps } = htmlFicheConnexion({ ...base, erreur: 'Non connecté : jeton refusé (côté votre demande)' });
    assert.match(corps, /role="alert"[^>]*>Non connecté : jeton refusé \(côté votre demande\)/);
  });

  it('pendant la connexion le bouton est inactif', () => {
    assert.match(htmlFicheConnexion({ ...base, enCours: true }).corps, /data-act="connecter" disabled/);
  });

  it('l’adresse saisie est échappée', () => {
    const { corps } = htmlFicheConnexion({ ...base, url: '"><script>x</script>' });
    assert.doesNotMatch(corps, /<script>/);
  });
});

describe('vue-pg-rendu — la fiche d’une table (à droite)', () => {
  const info = { schema: 'public', table: 'batiment', geo: true, modifiable: true, lignes: 1200 };
  const pret = { table: { schema: 'public', table: 'batiment' }, phase: 'pret', couche: { nb_entites: 3, avertissements: [] }, plan: { ok: true }, nom: 'Bâtiments', peutEnregistrer: true, modifiable: { cle: ['id'] } };

  it('l’en-tête dit la table, son schéma, ce qu’elle est', () => {
    const { tete } = htmlFicheTable(pret, info);
    assert.match(tete, /Base PostgreSQL · public/);
    assert.match(tete, /batiment/);
    assert.match(tete, /géographique · modifiable · ~1 200 lignes/);
  });

  it('trois choix, du plus simple au plus engageant, chacun avec sa phrase', () => {
    const { corps } = htmlFicheTable(pret, info);
    const i1 = corps.indexOf('Afficher sur la carte');
    const i2 = corps.indexOf('Copier dans le document');
    const i3 = corps.indexOf('Copier et synchroniser');
    assert.ok(i1 > -1 && i1 < i2 && i2 < i3, 'ordre : afficher, copier, synchroniser');
    assert.match(corps, /Rien n’est écrit dans le document/);
    assert.match(corps, /3<\/strong> entités dans la zone visible/);
    assert.match(corps, /data-act="direct"/);
    assert.match(corps, /data-act="direct-enregistre"[^>]*>Afficher et garder dans le document/);
    assert.match(corps, /data-act="importer"/);
    assert.match(corps, /data-act="importer-sync"/);
  });

  it('une table déjà sur la carte le dit, sans reproposer « Afficher » ; copier et synchroniser restent', () => {
    const { corps } = htmlFicheTable({ ...pret, surCarte: true }, info);
    assert.match(corps, /Cette table est sur la carte/);
    assert.doesNotMatch(corps, /data-act="direct"/);
    assert.doesNotMatch(corps, /data-act="direct-enregistre"/);
    assert.match(corps, /data-act="importer"/);
    assert.match(corps, /data-act="importer-sync"/);
  });

  it('une table non modifiable n’offre pas la synchronisation', () => {
    const { corps } = htmlFicheTable({ ...pret, modifiable: null }, { ...info, modifiable: false });
    assert.doesNotMatch(corps, /importer-sync/);
    assert.doesNotMatch(corps, /Copier et synchroniser/);
  });

  it('document en lecture seule : on peut afficher, pas copier, et on le dit', () => {
    const corps = htmlApercu({ ...pret, lectureSeule: true });
    assert.match(corps, /lecture seule/);
    assert.match(corps, /data-act="importer" disabled/);
    assert.match(corps, /data-act="importer-sync" disabled/);
    assert.doesNotMatch(corps, /data-act="direct"[^>]*disabled/);
  });

  it('table sans carte : jamais « Afficher sur la carte »', () => {
    const corps = htmlApercu({ table: { schema: 'public', table: 'note' }, phase: 'pret', couche: null, modifiable: { cle: ['id'] } });
    assert.match(corps, /Table sans géométrie/);
    assert.doesNotMatch(corps, /data-act="direct"/);
    assert.match(corps, /importer-sync/);
  });

  it('les états de passage sont dits : lecture, copie, terminé, erreur', () => {
    assert.match(htmlApercu({ ...pret, phase: 'lecture' }), /Lecture de la zone visible/);
    assert.match(htmlApercu({ ...pret, phase: 'import', avancement: '12 lignes…' }), /Copie en cours… 12 lignes…/);
    assert.match(htmlApercu({ ...pret, phase: 'termine', resultat: { nb: 1, tableId: 'Bat' } }), /1 entité copiée[\s\S]*« Bat »/);
    const e = htmlApercu({ ...pret, phase: 'erreur', erreur: '<script>x</script> (côté la base)' });
    assert.doesNotMatch(e, /<script>/);
    assert.match(e, /data-act="relire"/);
  });

  it('aucune table choisie : on invite à en choisir une', () => {
    assert.match(htmlApercu({ table: null }), /Choisissez une table dans la liste de gauche/);
  });
});

describe('vue-pg-rendu — la section « Base PostgreSQL » du panneau Couches', () => {
  const icone = (nom) => `[${nom}]`;
  const items = [
    { id: 'base-metier-batiment', libelle: 'metier.batiment', couleur: '#d62728', visible: true, etat: '12 entités', enregistree: false, origine: 'pg.exemple.fr' },
    { id: 'base-metier-route', libelle: 'metier.route', couleur: '#1f77b4', visible: false, etat: 'masquée', enregistree: true, origine: 'pg.exemple.fr' },
  ];

  it('rien à montrer : rien du tout, pas même un titre', () => {
    assert.equal(htmlCouchesPgPanneau([], { icone }), '');
    assert.equal(htmlCouchesPgPanneau(undefined, { icone }), '');
  });

  it('une ligne par couche, au dessin des autres couches : œil, pastille, nom, zoom, menu', () => {
    const h = htmlCouchesPgPanneau(items, { icone });
    assert.match(h, /Base PostgreSQL/);
    assert.equal((h.match(/class="layer-item"/g) || []).length, 2);
    assert.match(h, /layer-vis on[^>]*aria-pressed="true"[^>]*onclick="A\.pgBascule\('base-metier-batiment', event\)"/);
    assert.match(h, /layer-swatch" style="background:#d62728"/);
    assert.match(h, /A\.pgZoom\('base-metier-batiment', event\)/);
    assert.match(h, /A\.pgMenu\('base-metier-batiment', event\)/);
    assert.match(h, /aria-haspopup="menu"/);
    assert.ok(h.indexOf('[oeil]') > -1 && h.indexOf('[cible]') > -1 && h.indexOf('[plusieurs]') > -1);
  });

  it('une couche masquée a l’œil barré, et dit « Afficher » ; une couche gardée le dit', () => {
    const h = htmlCouchesPgPanneau(items, { icone });
    assert.match(h, /aria-pressed="false"[^>]*aria-label="Afficher metier\.route"/);
    assert.match(h, /\[oeilBarre\]/);
    assert.equal((h.match(/>gardée</g) || []).length, 1, 'seule la couche gardée porte « gardée »');
    assert.equal((h.match(/>PostgreSQL</g) || []).length, 2, 'chaque ligne dit d’où elle vient');
  });

  it('un nom, une origine ou une couleur hostiles ne sortent jamais du texte', () => {
    const h = htmlCouchesPgPanneau([{ id: "a'b", libelle: '<img src=x onerror=alert(1)>', couleur: '"><script>x</script>', visible: true, etat: '<b>', origine: '<i>', enregistree: false }], { icone });
    assert.doesNotMatch(h, /<img src=x|<script>|<b>|<i>/);
    assert.doesNotMatch(h, /pgBascule\('a'b'/, 'l’identifiant ne casse pas la chaîne de l’attribut');
  });
});
