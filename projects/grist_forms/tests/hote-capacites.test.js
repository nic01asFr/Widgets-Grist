/*
 * hote-capacites.js — le contrat d'hôte, et la règle qui compte le plus : aucun secret dedans.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Hote = require('../shared/hote-capacites.js');

const appeler = async () => ({});
function hoteValide() {
  return {
    contrat: 'hote-capacites-0.1',
    nom: 'application-mobile',
    capacites: { camera: true, micro: true, position: true, orientation: false, scanner: true },
    services: {
      transcrire: { sortant: 'tiers', nom: 'api.exemple.test', appeler },
      extraire: { sortant: 'local', appeler }
    },
    limites: { audioSecondes: 120, photoOctets: 10485760 }
  };
}

describe('validerHote : ce qui est conforme', () => {
  it('un hôte complet', () => {
    const r = Hote.validerHote(hoteValide());
    assert.deepEqual(r, { conforme: true, ecarts: [] });
  });
  it('absent = rien : undefined et null sont conformes, comme aujourd\'hui', () => {
    assert.equal(Hote.validerHote(undefined).conforme, true);
    assert.equal(Hote.validerHote(null).conforme, true);
  });
  it('un hôte minimal : le contrat seul', () => {
    assert.equal(Hote.validerHote({ contrat: 'hote-capacites-0.1' }).conforme, true);
  });
  it('les capacités à faux sont permises : un hôte dit aussi ce qu\'il n\'a pas', () => {
    assert.equal(Hote.validerHote({ contrat: Hote.CONTRAT, capacites: { micro: false } }).conforme, true);
  });
});

describe('validerHote : ce qui ne l\'est pas', () => {
  function ecartsDe(modif) { const h = hoteValide(); modif(h); return Hote.validerHote(h).ecarts.join(' | '); }

  it('ce n\'est pas un objet', () => {
    assert.equal(Hote.validerHote('x').conforme, false);
    assert.equal(Hote.validerHote([]).conforme, false);
    assert.equal(Hote.validerHote(3).conforme, false);
  });
  it('contrat absent ou d\'une autre version', () => {
    assert.match(ecartsDe((h) => { delete h.contrat; }), /hote\.contrat/);
    assert.match(ecartsDe((h) => { h.contrat = 'hote-capacites-9.9'; }), /hote\.contrat/);
  });
  it('capacité inconnue ou non booléenne', () => {
    assert.match(ecartsDe((h) => { h.capacites.telepathie = true; }), /capacites\.telepathie : capacité inconnue/);
    assert.match(ecartsDe((h) => { h.capacites.micro = 'oui'; }), /capacites\.micro : vrai ou faux/);
    assert.match(ecartsDe((h) => { h.capacites = 'tout'; }), /hote\.capacites : un objet/);
  });
  it('service inconnu, sans fonction, au sortant incorrect', () => {
    assert.match(ecartsDe((h) => { h.services.deviner = { appeler }; }), /services\.deviner : service inconnu/);
    assert.match(ecartsDe((h) => { delete h.services.transcrire.appeler; }), /transcrire\.appeler : une fonction/);
    assert.match(ecartsDe((h) => { h.services.transcrire.sortant = 'peut-etre'; }), /transcrire\.sortant/);
    assert.match(ecartsDe((h) => { h.services.extraire = 'oui'; }), /services\.extraire : un objet/);
  });
  it('limite inconnue, négative, nulle ou non numérique', () => {
    assert.match(ecartsDe((h) => { h.limites.videoSecondes = 5; }), /limites\.videoSecondes : limite inconnue/);
    assert.match(ecartsDe((h) => { h.limites.photoOctets = -1; }), /photoOctets : nombre positif/);
    assert.match(ecartsDe((h) => { h.limites.audioSecondes = 0; }), /audioSecondes : nombre positif/);
    assert.match(ecartsDe((h) => { h.limites.audioSecondes = 'long'; }), /audioSecondes : nombre positif/);
    assert.match(ecartsDe((h) => { h.limites.audioSecondes = Infinity; }), /audioSecondes : nombre positif/);
  });
  it('propriété inconnue du contrat', () => {
    assert.match(ecartsDe((h) => { h.couleur = 'rouge'; }), /hote\.couleur : propriété inconnue/);
  });
});

describe('AUCUN SECRET dans le contrat d\'hôte', () => {
  const interdites = ['cle', 'clé', 'apiKey', 'api_key', 'api-key', 'token', 'jeton', 'secret', 'password', 'motDePasse', 'authorization',
    'bearer', 'url', 'uri', 'adresse', 'endpoint', 'baseUrl', 'base_url', 'modele', 'model', 'instance', 'docId', 'documentId'];

  interdites.forEach((nom) => {
    it('la clé « ' + nom + ' » est refusée à la racine de l\'hôte', () => {
      const h = hoteValide(); h[nom] = 'valeur';
      const r = Hote.validerHote(h);
      assert.equal(r.conforme, false);
      assert.match(r.ecarts.join(' '), new RegExp('hote\\.' + nom));
      // Refusée comme SECRET, pas seulement comme propriété inconnue : c'est ce message-là qui compte.
      assert.match(r.ecarts.join(' '), /ni clé, ni jeton, ni adresse, ni nom de modèle/);
    });
  });
  it('« url » et « uri » imbriquées dans un service sont refusées comme secrets', () => {
    const h = hoteValide(); h.services.transcrire.url = 'https://x.example'; h.services.extraire.uri = 'x';
    const e = Hote.validerHote(h).ecarts.join(' | ');
    assert.match(e, /services\.transcrire\.url : un contrat d'hôte ne porte ni clé/);
    assert.match(e, /services\.extraire\.uri : un contrat d'hôte ne porte ni clé/);
  });
  it('refusée dans un service, où l\'hôte serait tenté de la mettre', () => {
    const h = hoteValide(); h.services.transcrire.cle = 'sk-test-123'; h.services.extraire.adresse = 'https://x.example';
    const e = Hote.validerHote(h).ecarts.join(' | ');
    assert.match(e, /services\.transcrire\.cle/);
    assert.match(e, /services\.extraire\.adresse/);
  });
  it('refusée dans les capacités et dans les limites', () => {
    const h = hoteValide(); h.capacites.token = true; h.limites.modele = 4;
    const e = Hote.validerHote(h).ecarts.join(' | ');
    assert.match(e, /capacites\.token/);
    assert.match(e, /limites\.modele/);
  });
  it('refusée à n\'importe quelle profondeur', () => {
    const h = hoteValide(); h.services.transcrire.reglages = { avance: { apiKey: 'zzz' } };
    assert.match(Hote.validerHote(h).ecarts.join(' | '), /reglages\.avance\.apiKey/);
  });
  it('insensible à la casse', () => {
    const h = hoteValide(); h.APIKEY = 'x'; h.Token = 'y';
    const e = Hote.validerHote(h).ecarts.join(' | ');
    assert.match(e, /hote\.APIKEY/);
    assert.match(e, /hote\.Token/);
  });
  it('un objet circulaire ne fait ni boucler ni lever', () => {
    const h = hoteValide(); h.services.transcrire.boucle = h;
    assert.doesNotThrow(() => Hote.validerHote(h));
  });
  it('le nom d\'hôte d\'un service est permis : c\'est le nom, pas l\'adresse', () => {
    const h = hoteValide();
    assert.equal(Hote.validerHote(h).conforme, true);
    assert.equal(h.services.transcrire.nom, 'api.exemple.test');
  });
});

describe('declaration : la part qu\'on peut journaliser ou publier', () => {
  it('sans fonction, sans clé', () => {
    const h = hoteValide(); h.services.transcrire.cle = 'sk-test-123'; h.jeton = 'abc';
    const d = Hote.declaration(h);
    const texte = JSON.stringify(d);
    assert.ok(!texte.includes('sk-test-123'));
    assert.ok(!texte.includes('abc'));
    assert.ok(!texte.includes('appeler'));
    assert.deepEqual(d.capacites, hoteValide().capacites);
    assert.deepEqual(d.services.transcrire, { sortant: 'tiers', nom: 'api.exemple.test' });
  });
  it('les capacités et limites inconnues ou secrètes sont écartées de la déclaration', () => {
    const h = hoteValide();
    h.capacites.token = true; h.capacites.telepathie = true; h.limites.modele = 4; h.limites.videoSecondes = 9;
    const d = Hote.declaration(h);
    assert.deepEqual(Object.keys(d.capacites).sort(), Object.keys(hoteValide().capacites).sort());
    assert.deepEqual(Object.keys(d.limites).sort(), ['audioSecondes', 'photoOctets']);
  });
  it('un service sans indication de sortie est déclaré tiers, par prudence', () => {
    const d = Hote.declaration({ contrat: Hote.CONTRAT, services: { extraire: { appeler } } });
    assert.equal(d.services.extraire.sortant, 'tiers');
  });
  it('un hôte qui n\'est pas un objet : null', () => {
    assert.equal(Hote.declaration(undefined), null);
    assert.equal(Hote.declaration('x'), null);
  });
  it('la déclaration d\'un hôte conforme est sérialisable en JSON', () => {
    assert.doesNotThrow(() => JSON.stringify(Hote.declaration(hoteValide())));
  });
});

describe('le vocabulaire est celui du noyau', () => {
  const Noyau = require('../shared/noyau-saisies.js');
  it('mêmes capacités, mêmes services : un seul vocabulaire dans l\'écosystème', () => {
    assert.deepEqual(Hote.CAPACITES, Array.from(Noyau.CAPACITES));
    assert.deepEqual(Hote.SERVICES, Array.from(Noyau.SERVICES));
  });
  it('un hôte conforme est accepté tel quel par resoudreSaisie', () => {
    const r = Noyau.resoudreSaisie({ widget: 'photo' }, hoteValide());
    assert.equal(r.mode, 'direct');
  });
});
