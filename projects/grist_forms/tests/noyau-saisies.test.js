/*
 * noyau-saisies.js — la part logique des saisies mobiles. Les vecteurs de `fixtures/noyau-saisies/` sont la
 * copie neutre que le kit rejoue ; les cas de comportement (réessai, annulation, fuite de clé, normaliseur
 * injecté) sont écrits ici.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Noyau = require('../shared/noyau-saisies.js');

function vecteurs(nom) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'noyau-saisies', nom), 'utf8'));
}

/** Ce que le banc met derrière `__appeler` : une fonction, comme l'hôte la fournirait. */
function peuplerHote(hote) {
  if (!hote || !hote.services) return hote;
  const copie = JSON.parse(JSON.stringify(hote));
  Object.keys(copie.services).forEach((nom) => {
    if (copie.services[nom].__appeler) { delete copie.services[nom].__appeler; copie.services[nom].appeler = async () => ({}); }
  });
  return copie;
}

function sousEnsemble(obtenu, attendu, quoi) {
  Object.keys(attendu).forEach((k) => assert.deepEqual(obtenu[k], attendu[k], quoi + ' : ' + k));
}

describe('vocabulaire fermé', () => {
  it('sept genres, ceux du kit', () => {
    assert.deepEqual(Array.from(Noyau.GENRES), ['reseau', 'droits', 'limite', 'forme', 'delai', 'vide', 'annulee']);
  });
  it('cinq capacités, deux services, cinq gestes, quatre états', () => {
    assert.deepEqual(Array.from(Noyau.CAPACITES), ['camera', 'micro', 'position', 'orientation', 'scanner']);
    assert.deepEqual(Array.from(Noyau.SERVICES), ['transcrire', 'extraire']);
    assert.deepEqual(Array.from(Noyau.GESTES), ['voix', 'audio', 'scan', 'photo', 'position']);
    assert.deepEqual(Array.from(Noyau.ETATS_SUGGESTION), ['propose', 'acceptee', 'modifiee', 'refusee']);
  });
  it('droits et forme ne se réessaient jamais ; reseau, delai, limite, vide oui ; annulee n\'est pas un échec à réessayer', () => {
    ['reseau', 'delai', 'limite', 'vide'].forEach((g) => assert.equal(Noyau.reessayable(g), true, g));
    ['droits', 'forme', 'annulee', 'inconnu'].forEach((g) => assert.equal(Noyau.reessayable(g), false, g));
  });
  it('la politique par défaut est celle que le kit a mesurée', () => {
    assert.equal(Noyau.POLITIQUE_DEFAUT.essais, 4);
    assert.deepEqual(Array.from(Noyau.POLITIQUE_DEFAUT.attentes), [500, 1500, 4000]);
    assert.equal(Noyau.POLITIQUE_DEFAUT.plafondAttenteS, 30);
  });
});

describe('TABLE_GESTES : la seule table widget, capacité, repli, type', () => {
  it('cinq lignes, chacune complète', () => {
    assert.deepEqual(Object.keys(Noyau.TABLE_GESTES).sort(), ['audio', 'geo', 'photo', 'scan', 'voix']);
    Object.keys(Noyau.TABLE_GESTES).forEach((w) => {
      const l = Noyau.TABLE_GESTES[w];
      assert.ok(Noyau.GESTES.includes(l.geste), w + ' : geste');
      assert.ok(Noyau.CAPACITES.includes(l.capacite), w + ' : capacité');
      assert.ok(typeof l.repli === 'string' && l.repli, w + ' : repli');
    });
  });
  it('le type Grist écrit : texte pour voix et scan, pièces jointes pour audio et photo, aucun pour geo', () => {
    const t = Noyau.TABLE_GESTES;
    assert.deepEqual([t.voix.type, t.scan.type, t.audio.type, t.photo.type, t.geo.type], ['Text', 'Text', 'Attachments', 'Attachments', null]);
  });
  it('gelée : personne ne la modifie en route', () => {
    assert.throws(() => { 'use strict'; Noyau.TABLE_GESTES.voix.repli = 'autre'; }, TypeError);
    assert.throws(() => { 'use strict'; Noyau.TABLE_GESTES.pirate = {}; }, TypeError);
  });
  it('ligneDuWidget ne rend jamais une propriété héritée', () => {
    ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'].forEach((w) => assert.equal(Noyau.ligneDuWidget(w), null, w));
    assert.equal(Noyau.ligneDuWidget(undefined), null);
    assert.equal(Noyau.ligneDuWidget(12), null);
    assert.equal(Noyau.ligneDuWidget('voix').geste, 'voix');
  });
  it('un widget nommé comme une propriété du prototype n\'est pas un geste', () => {
    ['constructor', 'toString', '__proto__'].forEach((w) => {
      const r = Noyau.resoudreSaisie({ widget: w }, { capacites: { micro: true, camera: true } });
      assert.equal(r.geste, null, w);
      assert.equal(r.raison, 'aucun-geste', w);
    });
  });
  it('la résolution lit la table : une ligne modifiée dans une copie change le résultat', () => {
    // Preuve qu'il n'y a pas de seconde table cachée dans resoudreSaisie : les replis qu'elle rend sont ceux de la table.
    Object.keys(Noyau.TABLE_GESTES).forEach((w) => {
      const r = Noyau.resoudreSaisie({ widget: w }, null);
      assert.equal(r.widgetRepli, Noyau.TABLE_GESTES[w].repli, w);
      assert.equal(r.capacite, Noyau.TABLE_GESTES[w].capacite, w);
      assert.equal(r.geste, Noyau.TABLE_GESTES[w].geste, w);
    });
  });
});

describe('resoudreSaisie', () => {
  vecteurs('resolution.vecteurs.json').cas.forEach((c) => {
    it(c.nom, () => {
      const r = Noyau.resoudreSaisie(c.entree.champ, peuplerHote(c.entree.hote), c.entree.refus);
      sousEnsemble(r, c.attendu, c.nom);
    });
  });
  it('un champ ou un hôte qui n\'est pas un objet ne fait pas lever', () => {
    assert.doesNotThrow(() => Noyau.resoudreSaisie(null, null, null));
    assert.doesNotThrow(() => Noyau.resoudreSaisie('x', 12, 'micro'));
    assert.equal(Noyau.resoudreSaisie(undefined).mode, 'direct');
  });
});

describe('genreDepuisStatut', () => {
  vecteurs('statuts.vecteurs.json').cas.forEach((c) => {
    it('statut ' + JSON.stringify(c.statut) + ' -> ' + c.genre, () => {
      assert.equal(Noyau.genreDepuisStatut(c.statut), c.genre);
    });
  });
});

describe('phrase', () => {
  it('une phrase pour chacun des sept genres, jamais vide', () => {
    Noyau.GENRES.forEach((g) => assert.ok(Noyau.phrase(g).length > 10, g));
  });
  it('vide se dit « rien reconnu », pas comme une panne', () => {
    assert.match(Noyau.phrase('vide'), /Rien n'a été reconnu/);
    assert.doesNotMatch(Noyau.phrase('vide'), /ne répond pas|refuse|trop de demandes/);
  });
  it('le sujet nomme le service et prend la majuscule en tête de phrase', () => {
    assert.match(Noyau.phrase('reseau', { sujet: 'le service de lecture' }), /^Le service de lecture ne répond pas/);
    assert.match(Noyau.phrase('droits', { sujet: 'le service de transcription' }), /^Le service de transcription refuse/);
  });
  it('l\'objet remplace « cette demande » dans le cas forme', () => {
    assert.match(Noyau.phrase('forme', { objet: 'ce document' }), /n'a pas pu traiter ce document/);
    assert.match(Noyau.phrase('forme'), /n'a pas pu traiter cette demande/);
  });
  it('un genre inconnu retombe sur la phrase de forme', () => {
    assert.match(Noyau.phrase('nimportequoi'), /n'a pas pu traiter/);
  });
});

describe('assainirMessage : aucun message ne porte de clé, de jeton ni d\'adresse', () => {
  vecteurs('assainir.vecteurs.json').cas.forEach((c) => {
    it(c.nom, () => {
      const s = Noyau.assainirMessage(c.message, c.secrets);
      c.absent.forEach((x) => assert.ok(!s.includes(x), 'ne doit pas contenir « ' + x + ' » : ' + s));
      if (c.egal !== undefined) assert.equal(s, c.egal);
    });
  });
  it('ne lève jamais, quelle que soit l\'entrée', () => {
    [undefined, null, 0, {}, [], '', 'x'].forEach((m) => assert.doesNotThrow(() => Noyau.assainirMessage(m, [null, 5, '', 'ab'])));
  });
  it('un secret trop court pour être sûr (moins de 3 caractères) n\'est pas cherché', () => {
    assert.equal(Noyau.assainirMessage('ok ab ok', ['ab']), 'ok ab ok');
  });
});

describe('avertissementSortant', () => {
  it('rien à dire d\'un service qui reste sur l\'appareil', () => {
    assert.equal(Noyau.avertissementSortant({ sortant: 'local' }), null);
  });
  it('tiers : on nomme le service par son nom d\'hôte, jamais l\'adresse entière', () => {
    const a = Noyau.avertissementSortant({ sortant: 'tiers', nom: 'https://api.exemple.test/v1/chat?cle=zzz' });
    assert.equal(a.cle, 'donnees-quittent-appareil');
    assert.equal(a.service, 'api.exemple.test');
    assert.match(a.phrase, /api\.exemple\.test/);
    assert.doesNotMatch(a.phrase, /v1|chat|zzz|https/);
  });
  it('indication absente : traité comme tiers, sans nom', () => {
    const a = Noyau.avertissementSortant({});
    assert.equal(a.service, null);
    assert.match(a.phrase, /un service tiers/);
  });
  it('un service qui n\'existe pas ne fait pas lever', () => {
    assert.ok(Noyau.avertissementSortant(undefined));
  });
});

describe('appelerService : typé, réessayable, annulable', () => {
  /** Une attente injectée qui ne fait qu'enregistrer ce qu'on lui a demandé. */
  function attenteEnregistree() {
    const faites = [];
    const f = async (ms) => { faites.push(ms); };
    f.faites = faites;
    return f;
  }
  function service(scenario) {
    let i = 0;
    return { appeler: async () => { const s = scenario[Math.min(i, scenario.length - 1)]; i += 1; if (s instanceof Error) throw s; return s; } };
  }

  it('réussite au premier essai', async () => {
    const r = await Noyau.appelerService(service([{ texte: 'bonjour' }]), 'audio', { attendre: attenteEnregistree() });
    assert.deepEqual(r, { ok: true, valeur: { texte: 'bonjour' }, tentatives: 1 });
  });
  it('un service du contrat peut rendre { ok: true, valeur }', async () => {
    const r = await Noyau.appelerService(service([{ ok: true, valeur: 42 }]), null, {});
    assert.equal(r.valeur, 42);
  });
  it('un échec réessayable est réessayé avec les attentes mesurées du kit, puis réussit', async () => {
    const attendre = attenteEnregistree();
    const r = await Noyau.appelerService(service([{ statut: 503 }, { statut: 503 }, { statut: 200, valeurs: { a: 1 } }]), null, { attendre });
    assert.equal(r.ok, true);
    assert.equal(r.tentatives, 3);
    assert.deepEqual(attendre.faites, [500, 1500]);
  });
  it('4 essais au total, le premier compris : on s\'arrête là avec le dernier genre', async () => {
    const attendre = attenteEnregistree();
    const r = await Noyau.appelerService(service([{ statut: 502 }]), null, { attendre });
    assert.equal(r.ok, false);
    assert.equal(r.tentatives, 4);
    assert.equal(r.erreur.genre, 'reseau');
    assert.deepEqual(attendre.faites, [500, 1500, 4000]);
  });
  it('droits et forme ne se réessaient JAMAIS', async () => {
    for (const statut of [401, 403, 400, 422, 404]) {
      const attendre = attenteEnregistree();
      const r = await Noyau.appelerService(service([{ statut }]), null, { attendre });
      assert.equal(r.tentatives, 1, 'statut ' + statut);
      assert.equal(attendre.faites.length, 0, 'statut ' + statut);
    }
  });
  it('vide est marqué par le transport, se réessaie, et n\'est jamais déduit du corps', async () => {
    const r1 = await Noyau.appelerService(service([{ statut: 200, vide: true }, { statut: 200, valeurs: { a: 1 } }]), null, { attendre: attenteEnregistree() });
    assert.equal(r1.ok, true);
    assert.equal(r1.tentatives, 2);
    // Un corps qui a l'air vide mais que le transport ne marque pas vide reste une réussite.
    const r2 = await Noyau.appelerService(service([{ statut: 200, valeurs: {} }]), null, { attendre: attenteEnregistree() });
    assert.equal(r2.ok, true);
  });
  it('sans attente injectée : un seul essai, jamais de réessai sans délai', async () => {
    const r = await Noyau.appelerService(service([{ statut: 503 }]), null, {});
    assert.equal(r.tentatives, 1);
    assert.equal(r.erreur.genre, 'reseau');
  });
  it('une exception est un reseau ; AbortError est annulee et ne se réessaie pas', async () => {
    const r1 = await Noyau.appelerService(service([new Error('boum')]), null, { attendre: attenteEnregistree(), politique: { essais: 1 } });
    assert.equal(r1.erreur.genre, 'reseau');
    const abandon = Object.assign(new Error('annulée'), { name: 'AbortError' });
    const attendre = attenteEnregistree();
    const r2 = await Noyau.appelerService(service([abandon]), null, { attendre });
    assert.equal(r2.erreur.genre, 'annulee');
    assert.equal(r2.tentatives, 1);
    assert.equal(attendre.faites.length, 0);
  });
  it('un signal déjà levé : annulee, aucun appel', async () => {
    let appels = 0;
    const s = { appeler: async () => { appels += 1; return {}; } };
    const r = await Noyau.appelerService(s, null, { signal: { aborted: true } });
    assert.equal(r.erreur.genre, 'annulee');
    assert.equal(appels, 0);
  });
  it('un signal levé pendant l\'attente interrompt le réessai', async () => {
    const attendre = async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); };
    const r = await Noyau.appelerService(service([{ statut: 503 }]), null, { attendre });
    assert.equal(r.erreur.genre, 'annulee');
  });
  it('reessayerApres demandé par le service est vécu, jusqu\'au plafond de 30 s', async () => {
    const attendre = attenteEnregistree();
    const r = await Noyau.appelerService(service([{ statut: 429, reessayerApres: 7 }, { statut: 200, valeurs: {} }]), null, { attendre });
    assert.equal(r.ok, true);
    assert.deepEqual(attendre.faites, [7000]);
  });
  it('au-delà de 30 s, on ne bloque pas la personne : limite rendue avec le délai conseillé', async () => {
    const attendre = attenteEnregistree();
    const r = await Noyau.appelerService(service([{ statut: 429, reessayerApres: 120 }]), null, { attendre });
    assert.equal(r.ok, false);
    assert.equal(r.erreur.genre, 'limite');
    assert.equal(r.erreur.reessayerApres, 120);
    assert.equal(r.tentatives, 1);
    assert.equal(attendre.faites.length, 0);
  });
  it('l\'erreur porte le statut quand il y en a un, et rien d\'autre que le contrat', async () => {
    const r = await Noyau.appelerService(service([{ statut: 403, message: 'non' }]), null, {});
    assert.equal(r.erreur.statut, 403);
    assert.deepEqual(Object.keys(r.erreur).sort(), ['genre', 'message', 'statut']);
  });
  it('un service qui rend { erreur: { genre } } du contrat est repris tel quel', async () => {
    const r = await Noyau.appelerService(service([{ ok: false, erreur: { genre: 'droits', message: 'refus' } }]), null, {});
    assert.equal(r.erreur.genre, 'droits');
  });
  it('un genre inconnu rendu par un service devient forme : le vocabulaire reste fermé', async () => {
    const r = await Noyau.appelerService(service([{ erreur: { genre: 'catastrophe' } }]), null, {});
    assert.equal(r.erreur.genre, 'forme');
  });
  it('un service absent ou sans fonction : forme, aucun appel, ne lève pas', async () => {
    assert.equal((await Noyau.appelerService(undefined, null, {})).erreur.genre, 'forme');
    assert.equal((await Noyau.appelerService({}, null, {})).erreur.genre, 'forme');
  });
  it('un retour vide (null) n\'est pas une réussite', async () => {
    const r = await Noyau.appelerService(service([null]), null, { attendre: attenteEnregistree() });
    assert.equal(r.ok, false);
    assert.equal(r.erreur.genre, 'forme');
  });

  it('AUCUNE FUITE : la clé et l\'adresse saisies ne ressortent d\'aucune erreur, quelle qu\'en soit la forme', async () => {
    const cle = 'sk-test-0123456789abcdefghij';
    const adresse = 'https://llm.exemple.test/v1/chat';
    const secrets = [cle, adresse];
    const formes = [
      new Error('401 Unauthorized for ' + adresse + ' with key ' + cle),
      { statut: 500, message: 'upstream ' + adresse + ' Bearer ' + cle },
      { erreur: { genre: 'reseau', message: 'ECONNRESET ' + adresse } },
      { statut: 429, message: 'key=' + cle, reessayerApres: 1 }
    ];
    for (const forme of formes) {
      const r = await Noyau.appelerService(service([forme]), null, { secrets, politique: { essais: 1 } });
      const texte = JSON.stringify(r);
      assert.ok(!texte.includes(cle), 'la clé a fui : ' + texte);
      assert.ok(!texte.includes('llm.exemple.test'), 'l\'adresse a fui : ' + texte);
    }
  });
  it('un message vide reçoit la phrase du genre, avec le sujet', async () => {
    const r = await Noyau.appelerService(service([{ statut: 401 }]), null, { sujet: 'le service de transcription' });
    assert.match(r.erreur.message, /^Le service de transcription refuse l'accès/);
  });
});

describe('verifierValeurs : délègue au normaliseur injecté', () => {
  /** Un normaliseur de banc qui enregistre la déclaration qu'on lui a traduite. */
  function normaliseurEnregistre(valeursRendues, anomaliesRendues) {
    const f = (brut, champs) => { f.vu = { brut, champs }; return { valeurs: valeursRendues || {}, anomalies: anomaliesRendues || [] }; };
    return f;
  }

  it('traduit les types du FormDef vers la déclaration du moteur de lecture', () => {
    const norm = normaliseurEnregistre({});
    Noyau.verifierValeurs({}, [
      { colId: 'a', type: 'Text' }, { colId: 'b', type: 'Int' }, { colId: 'c', type: 'Numeric' },
      { colId: 'd', type: 'Bool' }, { colId: 'e', type: 'Date' },
      { colId: 'f', type: 'Choice', options: { choices: ['x', 'y'] } }
    ], norm);
    assert.deepEqual(norm.vu.champs, [
      { nom: 'a', type: 'texte' }, { nom: 'b', type: 'entier' }, { nom: 'c', type: 'reel' },
      { nom: 'd', type: 'booleen' }, { nom: 'e', type: 'date' }, { nom: 'f', type: 'choix', choix: ['x', 'y'] }
    ]);
  });
  it('un Choice sans liste donne une liste vide : l\'anomalie est celle du normaliseur', () => {
    const norm = normaliseurEnregistre({});
    Noyau.verifierValeurs({}, [{ colId: 'f', type: 'Choice' }], norm);
    assert.deepEqual(norm.vu.champs, [{ nom: 'f', type: 'choix', choix: [] }]);
  });
  it('les types que le normaliseur ne couvre pas deviennent une anomalie, valeur brute à l\'appui', () => {
    const norm = normaliseurEnregistre({});
    const r = Noyau.verifierValeurs({ dt: '2026-11-09T10:00', tags: ['a'], ref: 3, pj: [1] }, [
      { colId: 'dt', type: 'DateTime' }, { colId: 'tags', type: 'ChoiceList' },
      { colId: 'ref', type: 'Ref:Projects' }, { colId: 'pj', type: 'Attachments' }
    ], norm);
    assert.equal(r.anomalies.length, 4);
    r.anomalies.forEach((a) => { assert.equal(a.quoi, 'type non pris en charge'); assert.equal(a.grave, true); });
    assert.equal(r.anomalies[0].brut, '2026-11-09T10:00');
    assert.deepEqual(r.valeurs, { dt: null, tags: null, ref: null, pj: null });
    assert.deepEqual(norm.vu.champs, []);
  });
  it('un type non couvert sans valeur lue : anomalie sans brut (rien à montrer)', () => {
    const r = Noyau.verifierValeurs({}, [{ colId: 'ref', type: 'Ref:Projects' }], normaliseurEnregistre({}));
    assert.equal(r.anomalies.length, 1);
    assert.equal('brut' in r.anomalies[0], false);
  });
  it('un champ que le formulaire ne vise pas n\'est pas écarté en silence', () => {
    const r = Noyau.verifierValeurs({ lieu: 'x', intrus: 'y' }, [{ colId: 'lieu', type: 'Text' }], normaliseurEnregistre({ lieu: 'x' }));
    const a = r.anomalies.find((x) => x.champ === 'intrus');
    assert.equal(a.quoi, 'champ non visé');
    assert.equal(a.brut, 'y');
    assert.equal(a.grave, false);
  });
  it('rend les valeurs et les anomalies du normaliseur, sans les altérer', () => {
    const anomalie = { champ: 'n', quoi: 'nombre illisible', brut: 'abc', grave: true };
    const r = Noyau.verifierValeurs({ n: 'abc' }, [{ colId: 'n', type: 'Int' }], normaliseurEnregistre({ n: null }, [anomalie]));
    assert.deepEqual(r.valeurs, { n: null });
    assert.deepEqual(r.anomalies, [anomalie]);
  });
  it('null n\'est pas [] ni \'\' : un champ non lu reste null', () => {
    const r = Noyau.verifierValeurs({}, [{ colId: 'a', type: 'Text' }], normaliseurEnregistre({ a: null }));
    assert.equal(r.valeurs.a, null);
  });
  it('sans normaliseur injecté : erreur de programmation, pas un échec attendu', () => {
    assert.throws(() => Noyau.verifierValeurs({}, [], undefined), TypeError);
  });
  it('entrées absentes ou mal formées : ne lève pas', () => {
    assert.doesNotThrow(() => Noyau.verifierValeurs(null, null, normaliseurEnregistre({})));
    assert.doesNotThrow(() => Noyau.verifierValeurs('x', [null, 3, {}], normaliseurEnregistre({})));
  });

  // Le vrai normaliseur du moteur de lecture documentaire, quand il est joignable : il vit sur une branche
  // qui n'est pas fusionnée dans main, on dépend de son CONTRAT et non de son chemin.
  const chemin = path.join(__dirname, '..', '..', 'lecture_documentaire', 'shared', 'champs.js');
  const reel = fs.existsSync(chemin) ? require(chemin) : null;
  it('avec le vrai normaliseur : valeur illisible gardée en anomalie, hors liste, null conservé', { skip: reel ? false : 'module de lecture documentaire absent de cette branche' }, () => {
    const r = Noyau.verifierValeurs(
      { n: '12,5', d: '3 mars 2026', c: 'z', t: 'texte lu', b: 'peut-être' },
      [{ colId: 'n', type: 'Numeric' }, { colId: 'd', type: 'Date' }, { colId: 'c', type: 'Choice', options: { choices: ['a', 'b'] } },
        { colId: 't', type: 'Text' }, { colId: 'b', type: 'Bool' }, { colId: 'absent', type: 'Text' }],
      reel.normaliser
    );
    assert.equal(r.valeurs.n, 12.5);
    assert.equal(r.valeurs.d, '2026-03-03');
    assert.equal(r.valeurs.c, null);
    assert.equal(r.valeurs.t, 'texte lu');
    assert.equal(r.valeurs.b, null);
    assert.equal(r.valeurs.absent, null, 'un champ absent donne null, jamais une valeur par défaut');
    const horsListe = r.anomalies.find((a) => a.champ === 'c');
    assert.equal(horsListe.brut, 'z');
    assert.ok(r.anomalies.find((a) => a.champ === 'b'));
  });
});

describe('proposer et appliquerDecision', () => {
  const v = vecteurs('suggestions.vecteurs.json');
  v.proposer.forEach((c) => {
    it('proposer : ' + c.nom, () => {
      const r = Noyau.proposer(c.entree.colId, c.entree.proposee, c.entree.actuelle);
      if (c.attendu === null) assert.equal(r, null);
      else sousEnsemble(r, c.attendu, c.nom);
    });
  });
  v.decisions.forEach((c) => {
    it('décision : ' + c.nom, () => {
      const s = Noyau.proposer(c.suggestion.colId, c.suggestion.proposee, c.suggestion.actuelle);
      const r = Noyau.appliquerDecision(s, c.decision);
      assert.equal(r.suggestion.etat, c.attendu.etat);
      assert.deepEqual(r.ecrire, c.attendu.ecrire);
      assert.equal(r.ignoree, c.attendu.ignoree);
    });
  });
  it('une décision est FINALE : on ne change pas d\'avis par un second appel', () => {
    const s = Noyau.proposer('lieu', 'Pont nord', null);
    const acceptee = Noyau.appliquerDecision(s, { type: 'accepter' });
    const encore = Noyau.appliquerDecision(acceptee.suggestion, { type: 'refuser' });
    assert.equal(encore.ignoree, true);
    assert.equal(encore.ecrire, null);
    assert.equal(encore.suggestion.etat, 'acceptee');
  });
  it('une nouvelle extraction ne fait que proposer : elle n\'écrit jamais, même sur un champ décidé', () => {
    const s1 = Noyau.proposer('lieu', 'Pont nord', null);
    const acceptee = Noyau.appliquerDecision(s1, { type: 'accepter' });
    assert.deepEqual(acceptee.ecrire, { colId: 'lieu', valeur: 'Pont nord' });
    // Le champ vaut maintenant « Pont nord » ; une seconde extraction propose autre chose.
    const s2 = Noyau.proposer('lieu', 'Pont sud', 'Pont nord');
    assert.equal(s2.etat, 'propose');
    assert.equal(s2.ecrase, true);
    assert.equal(s2.actuelle, 'Pont nord');
  });
  it('le noyau n\'écrit rien : il rend ce que l\'hôte doit écrire', () => {
    const r = Noyau.appliquerDecision(Noyau.proposer('a', 1, null), { type: 'accepter' });
    assert.deepEqual(Object.keys(r).sort(), ['ecrire', 'ignoree', 'suggestion']);
  });
  it('entrées mal formées : ignorées, ne lèvent pas', () => {
    assert.equal(Noyau.appliquerDecision(null, null).ignoree, true);
    assert.equal(Noyau.appliquerDecision({ etat: 'propose' }, 'accepter').ignoree, true);
  });
});

describe('controlerLimites', () => {
  vecteurs('limites.vecteurs.json').cas.forEach((c) => {
    it(c.nom, () => {
      const r = Noyau.controlerLimites(c.entree.piece, c.entree.limites);
      assert.equal(r.ok, c.attendu.ok);
      if (c.attendu.genre) assert.equal(r.erreur.genre, c.attendu.genre);
      if (!r.ok) assert.ok(r.erreur.message.length > 10);
    });
  });
});

describe('le noyau reste pur', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'shared', 'noyau-saisies.js'), 'utf8');
  // On retire les commentaires : ils parlent de ce que le module ne fait pas.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  it('aucun import, aucun réseau, aucune horloge, aucun minuteur, aucun DOM', () => {
    ['require(', 'import ', 'fetch(', 'XMLHttpRequest', 'setTimeout', 'setInterval', 'Date.now', 'new Date', 'document.', 'localStorage', 'sessionStorage', 'navigator.']
      .forEach((interdit) => {
        // `require` n'apparaît que dans l'enveloppe UMD, sous `module.exports`.
        if (interdit === 'require(') return assert.ok(!code.includes('require('), 'require( trouvé');
        assert.ok(!code.includes(interdit), 'interdit dans le noyau : ' + interdit);
      });
  });
  it('aucun motif de clé ou d\'adresse écrit dans le code du noyau', () => {
    assert.doesNotMatch(code, /\bsk-[A-Za-z0-9]/);
    assert.doesNotMatch(code, /https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i);
  });
  it('la licence tient sur une ligne en tête du fichier', () => {
    assert.match(source.split('\n')[0], /Licence MIT/);
  });
  it('l\'enveloppe est UMD : le module se charge sous Node et expose les mêmes noms', () => {
    ['resoudreSaisie', 'appelerService', 'verifierValeurs', 'appliquerDecision', 'controlerLimites', 'genreDepuisStatut', 'phrase', 'assainirMessage', 'avertissementSortant']
      .forEach((nom) => assert.equal(typeof Noyau[nom], 'function', nom));
  });
});
