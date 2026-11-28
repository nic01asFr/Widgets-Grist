import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lireAdresseDocument, demarrage, adresseAEnregistrer, OPTION_ADRESSE } from '../lib/pg-adresse.js';

describe('pg-adresse — l’adresse enregistrée dans le document', () => {
  it('rien d’enregistré : aucune adresse, aucun message', () => {
    assert.deepEqual(lireAdresseDocument(undefined), { url: '', refus: null });
    assert.deepEqual(lireAdresseDocument(null), { url: '', refus: null });
    assert.deepEqual(lireAdresseDocument({}), { url: '', refus: null });
    assert.deepEqual(lireAdresseDocument({ [OPTION_ADRESSE]: '' }), { url: '', refus: null });
  });

  it('une adresse https est lue, nettoyée (espaces, barre finale)', () => {
    assert.deepEqual(lireAdresseDocument({ pgAdresse: '  https://atlas-pg.exemple.fr/ ' }), { url: 'https://atlas-pg.exemple.fr', refus: null });
    assert.deepEqual(lireAdresseDocument({ pgAdresse: 'http://localhost:8080' }), { url: 'http://localhost:8080', refus: null });
  });

  it('une adresse non sûre est ignorée ET dite : on ne la tente pas', () => {
    const r = lireAdresseDocument({ pgAdresse: 'http://serveur.exemple.fr' });
    assert.equal(r.url, '');
    assert.match(r.refus, /ignorée.*https/);
    assert.match(lireAdresseDocument({ pgAdresse: 'pas une adresse' }).refus, /ignorée/);
    assert.match(lireAdresseDocument({ pgAdresse: '   ' }).refus, /illisible/);
    assert.match(lireAdresseDocument({ pgAdresse: 42 }).refus, /illisible/);
  });

  it('une option qui ressemble à un jeton ou à autre chose qu’une adresse n’est jamais reprise', () => {
    assert.equal(lireAdresseDocument({ pgAdresse: { token: 'x' } }).url, '');
    assert.equal(lireAdresseDocument({ pgJeton: 'https://x.exemple.fr' }).url, '', 'seule la clé pgAdresse compte');
  });
});

describe('pg-adresse — l’ouverture du panneau', () => {
  it('l’adresse du document décide et connecte tout seul', () => {
    assert.deepEqual(demarrage({ adresseDocument: 'https://a.exemple.fr', adresseNavigateur: 'https://b.exemple.fr' }),
      { url: 'https://a.exemple.fr', connexionAuto: true, source: 'document' });
  });

  it('l’adresse retenue par le navigateur préremplit le champ, sans connexion sans geste', () => {
    assert.deepEqual(demarrage({ adresseNavigateur: 'https://b.exemple.fr/' }), { url: 'https://b.exemple.fr', connexionAuto: false, source: 'navigateur' });
  });

  it('rien du tout : le champ est vide, rien ne se connecte', () => {
    assert.deepEqual(demarrage({}), { url: '', connexionAuto: false, source: null });
    assert.deepEqual(demarrage(), { url: '', connexionAuto: false, source: null });
  });
});

describe('pg-adresse — enregistrer dans le document', () => {
  const ok = { saisie: 'https://a.exemple.fr/', adresseDocument: '', peutEcrire: true };

  it('une adresse neuve, saisie par quelqu’un qui peut écrire, s’enregistre (nettoyée)', () => {
    assert.equal(adresseAEnregistrer(ok), 'https://a.exemple.fr');
  });

  it('rien à enregistrer : même adresse, lecture seule, vide, non sûre', () => {
    assert.equal(adresseAEnregistrer({ ...ok, adresseDocument: 'https://a.exemple.fr' }), null, 'déjà enregistrée');
    assert.equal(adresseAEnregistrer({ ...ok, peutEcrire: false }), null, 'en lecture seule on ne change pas ce que voient les autres');
    assert.equal(adresseAEnregistrer({ ...ok, saisie: '  ' }), null);
    assert.equal(adresseAEnregistrer({ ...ok, saisie: 'http://serveur.exemple.fr' }), null, 'jamais une adresse non sûre');
    assert.equal(adresseAEnregistrer(), null);
  });

  it('une autre adresse remplace celle du document', () => {
    assert.equal(adresseAEnregistrer({ ...ok, adresseDocument: 'https://ancienne.exemple.fr' }), 'https://a.exemple.fr');
  });
});
