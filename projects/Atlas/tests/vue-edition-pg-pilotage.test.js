/**
 * Le panneau « Modifier » PILOTÉ (et non seulement ses fragments HTML) : un faux DOM minimal, une fausse passerelle.
 * Couvre ce que l'essai réel a montré : une erreur de saisie d'avant ne reste pas affichée après un succès ; un document en
 * lecture seule n'écrit rien, même si on force le clic.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirEdition } from '../lib/vue-edition-pg.js';

const decl = { schema: 'public', table: 'interventions', cle: ['id'], colonnes: ['type', 'cout', 'geom'], geometrie: 'geom', suppression: 'etat:actif', operations: ['inserer', 'modifier', 'desactiver', 'reactiver'] };
const meta = { colonnes: [{ nom: 'id', type_grist: 'Int' }, { nom: 'type', type_grist: 'Text' }, { nom: 'cout', type_grist: 'Numeric' }] };

/** Un faux DOM : juste ce que le panneau touche. Les champs sont retrouvés dans le HTML produit. */
function fauxDom() {
  const ecouteurs = {};
  const racine = {
    isConnected: true,
    _html: '',
    saisies: {},
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html; },
    addEventListener(nom, f) { ecouteurs[nom] = f; },
    contains() { return true; },
    querySelectorAll(sel) {
      if (sel === '[data-champ]') return [...this._html.matchAll(/data-champ="([^"]+)"/g)].map((m) => ({ dataset: { champ: m[1] }, value: this.saisies[m[1]] ?? '' }));
      if (sel === '[data-cle]') return [{ dataset: { cle: 'id' }, value: this.saisies.id ?? '' }];
      return [];
    },
  };
  const corps = {
    set innerHTML(v) { this._h = v; },
    querySelector() { return racine; },
    contains() { return true; },
  };
  const clic = (act) => ecouteurs.click({ target: { closest: () => ({ dataset: { act } }) } });
  return { racine, corps, clic };
}

const attendre = () => new Promise((r) => setTimeout(r, 5));

describe('vue-edition-pg : pilotage', () => {
  let fetchInitial;
  let ecritures;
  let version;
  let lectures;
  beforeEach(() => {
    fetchInitial = globalThis.fetch;
    ecritures = [];
    version = 3;
    lectures = 0;
    globalThis.fetch = async (adresse, opts) => {
      const corps = JSON.parse(opts.body);
      ecritures.push({ adresse, corps });
      version += 1;
      return { status: 200, ok: true, json: async () => ({ resultats: [{ statut: 'ok', version }] }) };
    };
  });
  afterEach(() => { globalThis.fetch = fetchInitial; });

  function monter({ lectureSeule = false } = {}) {
    const dom = fauxDom();
    const clientLecture = {
      async commande() {
        lectures += 1;
        return { lignes: [{ cle: { id: 7 }, version, actif: true, valeurs: { type: 'entretien', cout: 5 } }] };
      },
    };
    const hote = {
      carte: { getLayer: () => null, on() {}, off() {}, getCenter: () => ({ lng: 3, lat: 43 }) },
      corps: dom.corps, titre() {}, annoncer() {}, lectureSeule: () => lectureSeule,
    };
    const entree = {
      libelle: 'public.interventions', url: 'https://pg.example.org',
      params: { connexion: 'm', schema: 'public', table: 'interventions' },
      couche: { relire() {}, ids: { point: 'p', ligne: 'l', surface: 's' } },
    };
    const acces = { entetes: () => ({}), apres401: async () => false };
    ouvrirEdition({ hote, entree, decl, meta, clientLecture, accesEcriture: acces, typeGeometrie: 'Point', retour() {} });
    return dom;
  }

  async function ouvrirLaLigne(dom) {
    dom.racine.saisies.id = '7';
    dom.clic('ouvrir-cle');
    await attendre();
  }

  it('une erreur de saisie ne reste pas affichée après un succès (désactiver)', async () => {
    const dom = monter();
    await ouvrirLaLigne(dom);
    assert.match(dom.racine.innerHTML, /Entité id = 7/);

    dom.racine.saisies.cout = 'abc';
    dom.clic('enregistrer');
    await attendre();
    assert.match(dom.racine.innerHTML, /cout : un nombre est attendu/);
    assert.equal(ecritures.length, 0, 'une saisie illisible n’écrit rien');

    dom.clic('desactiver');
    await attendre();
    assert.equal(ecritures.length, 1);
    assert.match(dom.racine.innerHTML, /Enregistré dans PostgreSQL/);
    assert.doesNotMatch(dom.racine.innerHTML, /un nombre est attendu/, 'l’erreur d’avant ne s’applique plus à ce qu’on voit');
    assert.doesNotMatch(dom.racine.innerHTML, /value="abc"/);
  });

  it('l’écriture porte la version lue et ne contient que ce qui a changé', async () => {
    const dom = monter();
    await ouvrirLaLigne(dom);
    dom.racine.saisies.type = 'entretien';
    dom.racine.saisies.cout = '9,5';
    dom.clic('enregistrer');
    await attendre();
    assert.equal(ecritures.length, 1);
    const op = ecritures[0].corps.operations[0];
    assert.deepEqual(op, { op: 'modifier', cle: { id: 7 }, valeurs: { cout: 9.5 }, version_attendue: 3 });
    assert.equal(ecritures[0].corps.atomique, true);
  });

  it('document en lecture seule : aucun appel d’écriture, même si le clic est forcé', async () => {
    const dom = monter({ lectureSeule: true });
    await ouvrirLaLigne(dom);
    assert.match(dom.racine.innerHTML, /lecture seule/);
    dom.racine.saisies.cout = '99';
    dom.clic('enregistrer');
    dom.clic('desactiver');
    dom.clic('reactiver');
    dom.clic('supprimer');
    dom.clic('nouvelle');
    await attendre();
    assert.equal(ecritures.length, 0);
  });

  it('un conflit garde la saisie, dit que rien n’a été écrit et ne propose aucun forçage', async () => {
    globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => ({ resultats: [{ statut: 'conflit', version_actuelle: 9, valeurs_actuelles: { cout: 12 } }] }) });
    const dom = monter();
    await ouvrirLaLigne(dom);
    dom.racine.saisies.cout = '20';
    dom.clic('enregistrer');
    await attendre();
    assert.match(dom.racine.innerHTML, /Rien n’a été écrit/);
    assert.match(dom.racine.innerHTML, /value="20"/);
    assert.doesNotMatch(dom.racine.innerHTML, /forcer|écraser/i);
  });
});
