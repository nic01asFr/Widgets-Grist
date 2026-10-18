/*
 * referentiel.test.js — désigner une adresse qui existe, plutôt que l'inventer.
 *
 * Aucun de ces essais n'interroge le réseau : la source est un faux `fetch`
 * qui rend, à l'octet près, la forme de réponse relevée sur le service de la
 * Géoplateforme le 18/10/2026. Ce que le module décide seul — normaliser,
 * attendre, refuser — se vérifie ici ; la liste de suggestions, elle, se
 * vérifie dans un navigateur.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Ref = require('../shared/referentiel.js');

/** Une proposition telle que le service la rend (un `Feature` GeoJSON). */
function feature(extra) {
  const base = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [2.290084, 49.897442] },
    properties: {
      label: '8 Boulevard du Port 80000 Amiens', postcode: '80000', city: 'Amiens',
      citycode: '80021', banId: 'abc-123', id: '80021_1234_00008', type: 'housenumber',
      score: 0.6, street: 'Boulevard du Port', housenumber: '8',
      // Lambert-93, PAS des degrés : ne doit jamais devenir une latitude.
      x: 649000.5, y: 6980000.2
    }
  };
  return Object.assign({}, base, extra || {});
}

function faussesReponses(corps, options) {
  const o = Object.assign({ ok: true, status: 200 }, options || {});
  return () => Promise.resolve({
    ok: o.ok, status: o.status, json: () => Promise.resolve(corps)
  });
}

describe('une proposition de la BAN', () => {
  it('se ramène aux sens qu’on sait écrire', () => {
    const s = Ref.normaliserSuggestion(feature());
    assert.equal(s.libelle, '8 Boulevard du Port 80000 Amiens');
    assert.equal(s.codePostal, '80000');
    assert.equal(s.commune, 'Amiens');
    assert.equal(s.insee, '80021');
    assert.equal(s.identifiant, 'abc-123');
    assert.equal(s.type, 'housenumber');
  });

  it('prend les coordonnées de la géométrie, jamais de x et y qui sont en Lambert-93', () => {
    const s = Ref.normaliserSuggestion(feature());
    assert.equal(s.longitude, 2.290084);
    assert.equal(s.latitude, 49.897442);
    assert.notEqual(s.latitude, 6980000.2, 'x et y sont projetés, pas géographiques');
  });

  it('garde le code INSEE en texte : un zéro de tête est une information', () => {
    const f = feature();
    f.properties.citycode = '01004';
    assert.equal(Ref.normaliserSuggestion(f).insee, '01004');
  });

  it('retombe sur l’identifiant de la voie quand il n’y a pas de banId', () => {
    const f = feature();
    delete f.properties.banId;
    assert.equal(Ref.normaliserSuggestion(f).identifiant, '80021_1234_00008');
  });

  it('une proposition sans libellé ne vaut rien', () => {
    const f = feature();
    f.properties.label = '   ';
    assert.equal(Ref.normaliserSuggestion(f), null);
    assert.equal(Ref.normaliserSuggestion(null), null);
  });

  it('sans géométrie, les coordonnées restent vides plutôt que fausses', () => {
    const f = feature();
    delete f.geometry;
    const s = Ref.normaliserSuggestion(f);
    assert.equal(s.latitude, null);
    assert.equal(s.longitude, null);
    assert.equal(s.libelle, '8 Boulevard du Port 80000 Amiens', 'le reste demeure');
  });
});

describe('l’adresse de la requête', () => {
  it('vise la Géoplateforme, pas l’ancienne adresse dont l’extinction est passée', () => {
    const url = Ref.construireUrl('ban', '8 bd du port');
    assert.ok(url.startsWith('https://data.geopf.fr/geocodage/search?'), url);
    assert.ok(!url.includes('api-adresse.data.gouv.fr'));
  });

  it('encode la saisie, demande la complétion et borne la liste', () => {
    const u = new URL(Ref.construireUrl('ban', '  8 bd   du port & co '));
    assert.equal(u.searchParams.get('q'), '8 bd du port & co', 'blancs nettoyés, esperluette protégée');
    assert.equal(u.searchParams.get('autocomplete'), '1');
    assert.equal(u.searchParams.get('limit'), '5');
  });
});

describe('interroger la source', () => {
  it('rend les propositions normalisées', async () => {
    const res = await Ref.rechercher('8 bd du port', {
      fetch: faussesReponses({ type: 'FeatureCollection', features: [feature()] })
    });
    assert.equal(res.length, 1);
    assert.equal(res[0].codePostal, '80000');
  });

  it('ne dérange pas le service en dessous de son minimum', async () => {
    let appels = 0;
    const res = await Ref.rechercher('ab', { fetch: () => { appels++; return Promise.reject(new Error('non')); } });
    assert.deepEqual(res, []);
    assert.equal(appels, 0, 'un seul caractère donne HTTP 400 : on n’envoie rien de si court');
  });

  it('compte le minimum sans les blancs superflus', async () => {
    let appels = 0;
    await Ref.rechercher('   a   b   ', { fetch: () => { appels++; return Promise.resolve({ ok: true, status: 200, json: () => ({ features: [] }) }); } });
    assert.equal(appels, 1, '« a b » fait 3 caractères une fois nettoyé');
  });

  it('n’en garde jamais plus que la source n’en donne', async () => {
    const beaucoup = Array.from({ length: 12 }, (_, i) => {
      const f = feature();
      f.properties.label = 'Adresse ' + i;
      return f;
    });
    const res = await Ref.rechercher('adresse', { fetch: faussesReponses({ features: beaucoup }) });
    assert.equal(res.length, 5);
  });

  it('écarte ce qui n’a pas de libellé, sans faire échouer le reste', async () => {
    const vide = feature();
    vide.properties.label = '';
    const res = await Ref.rechercher('adresse', { fetch: faussesReponses({ features: [vide, feature()] }) });
    assert.equal(res.length, 1);
  });

  it('un refus de limite (429) se reconnaît comme tel', async () => {
    await assert.rejects(
      Ref.rechercher('8 bd du port', { fetch: faussesReponses({}, { ok: false, status: 429 }) }),
      (e) => e.code === 'limite' && e.statut === 429
    );
  });

  it('une autre réponse en échec dit son code HTTP', async () => {
    await assert.rejects(
      Ref.rechercher('8 bd du port', { fetch: faussesReponses({}, { ok: false, status: 502 }) }),
      (e) => e.code === 'http' && e.statut === 502
    );
  });

  it('un réseau qui échoue devient une erreur du module, pas une exception brute', async () => {
    await assert.rejects(
      Ref.rechercher('8 bd du port', { fetch: () => Promise.reject(new TypeError('Failed to fetch')) }),
      (e) => e instanceof Ref.ErreurReferentiel && e.code === 'reseau'
    );
  });

  it('une source inconnue est refusée, sans appel réseau', async () => {
    let appels = 0;
    await assert.rejects(
      Ref.rechercher('abc', { source: 'inconnue', fetch: () => { appels++; } }),
      (e) => e.code === 'source'
    );
    assert.equal(appels, 0);
  });

  it('une recherche annulée par une plus récente ne rend pas de résultat', async () => {
    const controleur = new AbortController();
    // Comme le vrai `fetch` : un signal déjà annulé rejette tout de suite, un
    // signal annulé ensuite rejette à ce moment-là. L'appel part après un tour
    // de boucle, donc l'annulation d'ici arrive AVANT lui.
    const suspendu = (url, init) => new Promise((_, rejeter) => {
      const annule = () => rejeter(Object.assign(new Error('annulé'), { name: 'AbortError' }));
      if (init.signal.aborted) annule();
      else init.signal.addEventListener('abort', annule);
    });
    const attente = Ref.rechercher('8 bd du port', { fetch: suspendu, controleur });
    controleur.abort();
    await assert.rejects(attente, (e) => e.code === 'reseau');
  });
});

describe('la limite d’une requête par seconde', () => {
  it('ne fait pas attendre un premier appel', () => {
    assert.equal(Ref.delaiAvantAppel(0, 5000, 1000), 0);
  });

  it('fait attendre le reste de la seconde', () => {
    assert.equal(Ref.delaiAvantAppel(1000, 1300, 1000), 700);
  });

  it('ne fait plus attendre une fois la seconde écoulée', () => {
    assert.equal(Ref.delaiAvantAppel(1000, 2000, 1000), 0);
    assert.equal(Ref.delaiAvantAppel(1000, 9000, 1000), 0);
  });

  it('est celle que la source annonce', () => {
    assert.equal(Ref.SOURCES.ban.intervalleMs, 1000);
  });
});

describe('parcourir la liste au clavier', () => {
  it('descend, puis reboucle au début', () => {
    assert.equal(Ref.indexSuivant(-1, 3), 0);
    assert.equal(Ref.indexSuivant(0, 3), 1);
    assert.equal(Ref.indexSuivant(2, 3), 0);
  });

  it('remonte, puis reboucle à la fin', () => {
    assert.equal(Ref.indexPrecedent(-1, 3), 2);
    assert.equal(Ref.indexPrecedent(2, 3), 1);
    assert.equal(Ref.indexPrecedent(0, 3), 2);
  });

  it('une liste vide n’a pas d’option courante', () => {
    assert.equal(Ref.indexSuivant(-1, 0), -1);
    assert.equal(Ref.indexPrecedent(-1, 0), -1);
  });
});

describe('ce qu’on dit à qui ne voit pas l’écran', () => {
  it('annonce le nombre d’adresses, au singulier comme au pluriel', () => {
    assert.match(Ref.phraseResultats(1), /^1 adresse proposée/);
    assert.match(Ref.phraseResultats(4), /^4 adresses proposées/);
  });

  it('dit, sans résultat, que la saisie sera gardée telle quelle', () => {
    assert.match(Ref.phraseResultats(0), /enregistrée telle que vous l’avez saisie/);
  });

  it('dit, quand le service ne répond pas, que la saisie reste possible', () => {
    const t = Ref.phraseErreur(new Ref.ErreurReferentiel('reseau', 'x'));
    assert.match(t, /enregistrée telle quelle/);
  });

  it('distingue une limite atteinte d’une panne', () => {
    const t = Ref.phraseErreur(new Ref.ErreurReferentiel('limite', 'x', 429));
    assert.match(t, /patientez/);
    assert.doesNotMatch(t, /ne répond pas/);
  });
});

describe('les sources et leurs sens', () => {
  it('connaît la BAN, et pas ce qu’il n’a pas relevé', () => {
    assert.equal(Ref.sourceConnue('ban'), true);
    assert.equal(Ref.sourceConnue('bdtopo'), false);
    assert.equal(Ref.sourceConnue('constructor'), false, 'un nom hérité n’est pas une source');
  });

  it('donne à chaque sens son type Grist : un code INSEE est du texte, une coordonnée un nombre', () => {
    const a = Ref.annexesDe('ban');
    assert.equal(a.insee.type, 'Text');
    assert.equal(a.codePostal.type, 'Text');
    assert.equal(a.latitude.type, 'Numeric');
    assert.equal(a.longitude.type, 'Numeric');
  });

  it('une source inconnue n’a aucun sens à offrir', () => {
    assert.deepEqual(Ref.annexesDe('inconnue'), {});
  });

  it('chaque sens de la source correspond à un champ de la proposition normalisée', () => {
    const s = Ref.normaliserSuggestion(feature());
    Object.keys(Ref.annexesDe('ban')).forEach((cle) => {
      assert.ok(Object.prototype.hasOwnProperty.call(s, cle), 'la proposition porte « ' + cle + ' »');
    });
  });

  it('porte la mention à afficher à qui répond', () => {
    assert.match(Ref.SOURCES.ban.mention, /Géoplateforme/);
  });
});
