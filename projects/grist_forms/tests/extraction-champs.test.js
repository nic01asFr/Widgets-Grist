/*
 * La lecture d'un texte : un champ `voix` dont le texte, lu par le service d'extraction de l'hôte, propose des valeurs
 * aux autres champs. Une proposition n'est jamais une valeur : elle se montre à côté du champ, la personne l'utilise,
 * la corrige ou l'ignore, et seul ce geste écrit. Ce qui n'a pas pu être retenu se dit, avec la valeur lue.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../runtime/engine.js');
const { createRoot } = require('./helpers/fake-dom.js');

const flush = () => new Promise((resolve) => setTimeout(() => setImmediate(resolve), 5));
async function laisser(n) { for (let i = 0; i < (n || 4); i++) await flush(); }

const CONSIGNE = 'Relève le lieu, l\'urgence, la date de visite et le nombre de désordres.';
function def(optionsVoix, extra) {
  return Object.assign({
    manifest_version: '1.0.0', id: 'x', title: 'X', tableId: 'T', composeMode: 'bind', choices: {},
    sections: [{ id: 's', label: 'S', fields: [
      { colId: 'constat', label: 'Constat', type: 'Text', widget: 'voix', options: optionsVoix === undefined ? { extraction: { consigne: CONSIGNE, champs: ['lieu', 'urgence', 'visite', 'nb'] } } : optionsVoix },
      { colId: 'lieu', label: 'Lieu', type: 'Text', widget: 'text' },
      { colId: 'urgence', label: 'Urgence', type: 'Choice', widget: 'radio', options: { choices: ['1', '2', '3'], libelles: { 1: 'Faible', 2: 'Moyenne', 3: 'Forte' } } },
      { colId: 'visite', label: 'Date de visite', type: 'Date', widget: 'date' },
      { colId: 'nb', label: 'Nombre de désordres', type: 'Int', widget: 'number' }
    ] }]
  }, extra || {});
}

/** Un normaliseur de banc, qui suit le contrat de celui du moteur de lecture (valeurs, anomalies, null pour non lu). */
function normaliserBanc(brut, champs) {
  const valeurs = {}; const anomalies = [];
  champs.forEach((c) => {
    const v = brut[c.nom];
    if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) { valeurs[c.nom] = null; return; }
    if (c.type === 'entier') {
      const n = Number(v);
      if (!Number.isInteger(n)) { anomalies.push({ champ: c.nom, quoi: 'nombre illisible', brut: v, grave: true }); valeurs[c.nom] = null; } else valeurs[c.nom] = n;
    } else if (c.type === 'choix') {
      if ((c.choix || []).includes(v)) valeurs[c.nom] = v;
      else { anomalies.push({ champ: c.nom, quoi: 'hors de la liste déclarée', brut: v, grave: true }); valeurs[c.nom] = null; }
    } else if (c.type === 'date') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) valeurs[c.nom] = v;
      else { anomalies.push({ champ: c.nom, quoi: 'date illisible', brut: v, grave: true }); valeurs[c.nom] = null; }
    } else valeurs[c.nom] = String(v).trim();
  });
  return { valeurs, anomalies };
}

function hoteLecture(reponse, o) {
  o = o || {};
  const appels = [];
  const hote = {
    contrat: 'hote-capacites-0.1', nom: 'application-test', capacites: {},
    services: { extraire: { sortant: o.sortant || 'tiers', nom: o.nom || 'api.exemple.test', appeler: async (entree, opt) => { appels.push({ entree, opt }); return typeof reponse === 'function' ? reponse() : reponse; } } }
  };
  return { hote, appels };
}

function monter(hote, options, optionsVoix) {
  const root = createRoot();
  const h = Engine.monter(root, def(optionsVoix), Object.assign({ hote, normaliseur: normaliserBanc }, options || {}));
  return { root, h };
}
const lire = (root) => root.querySelector('[data-voix-action="extraire"]');
const carte = (root, colId) => root.querySelector('[data-suggestion="' + colId + '"]');
const geste = (root, colId, action) => carte(root, colId).querySelector('[data-suggestion-action="' + action + '"]');

async function lireTexte(root, texte) {
  root.querySelector('[name="constat"]').value = texte === undefined ? 'Fissure au pont nord, urgence forte' : texte;
  lire(root).dispatchEvent('click');
  await laisser(6);
}

const COMPLET = { valeurs: { lieu: 'Pont nord', urgence: '3', visite: '2026-11-09', nb: 2 }, anomalies: [] };

describe('la lecture n\'est offerte que si tout est là', () => {
  it('consigne, champs, service d\'extraction et normaliseur : le bouton « Remplir les champs »', () => {
    const { hote } = hoteLecture(COMPLET);
    const { root } = monter(hote);
    assert.ok(lire(root));
    assert.match(root.innerHTML, /Remplir les champs/);
    assert.match(root.innerHTML, /<textarea/);
  });
  it('sans hôte : rien ne change', () => {
    assert.equal(lire(monter(undefined).root), null);
  });
  it('sans service d\'extraction', () => {
    const { hote } = hoteLecture(COMPLET); delete hote.services.extraire;
    assert.equal(lire(monter(hote).root), null);
  });
  it('sans normaliseur : une sortie de modèle n\'entre jamais sans être vérifiée, la lecture n\'est pas offerte', () => {
    const { hote } = hoteLecture(COMPLET);
    assert.equal(lire(monter(hote, { normaliseur: undefined }).root), null);
  });
  it('sans consigne, ou sans champs visés', () => {
    const { hote } = hoteLecture(COMPLET);
    assert.equal(lire(monter(hote, {}, { extraction: { champs: ['lieu'] } }).root), null);
    assert.equal(lire(monter(hote, {}, { extraction: { consigne: CONSIGNE } }).root), null);
    assert.equal(lire(monter(hote, {}, {}).root), null);
  });
  it('des champs visés qui n\'existent pas ne comptent pas', () => {
    const { hote } = hoteLecture(COMPLET);
    assert.equal(lire(monter(hote, {}, { extraction: { consigne: CONSIGNE, champs: ['inexistant'] } }).root), null);
  });
  it('le champ ne se vise pas lui-même', async () => {
    const { hote, appels } = hoteLecture(COMPLET);
    const { root } = monter(hote, {}, { extraction: { consigne: CONSIGNE, champs: ['constat', 'lieu'] } });
    await lireTexte(root);
    assert.deepEqual(appels[0].entree.champs, ['lieu']);
  });
  it('la consigne et les champs du formulaire servent de valeur par défaut, le champ les surcharge', async () => {
    const { hote, appels } = hoteLecture(COMPLET);
    const root = createRoot();
    Engine.monter(root, Object.assign(def({}), { extraction: { consigne: 'Consigne du formulaire.', champs: ['lieu'] } }), { hote, normaliseur: normaliserBanc });
    assert.ok(lire(root), 'la valeur par défaut du formulaire suffit');
    await lireTexte(root);
    assert.equal(appels[0].entree.consigne, 'Consigne du formulaire.');
    const root2 = createRoot();
    Engine.monter(root2, Object.assign(def({ extraction: { consigne: 'Consigne du champ.' } }), { extraction: { consigne: 'Consigne du formulaire.', champs: ['lieu', 'nb'] } }), { hote, normaliseur: normaliserBanc });
    await lireTexte(root2);
    assert.equal(appels[1].entree.consigne, 'Consigne du champ.', 'la consigne du champ l\'emporte');
    assert.deepEqual(appels[1].entree.champs, ['lieu', 'nb'], 'les champs viennent du formulaire à défaut');
  });
  it('l\'avertissement d\'envoi nomme le service, jamais l\'adresse ni la clé', () => {
    const { hote } = hoteLecture(COMPLET, { nom: 'https://api.exemple.test/v1/lire?cle=zzz' });
    const html = monter(hote).root.innerHTML;
    assert.match(html, /envoyé à api\.exemple\.test, hors de cet appareil/);
    assert.doesNotMatch(html, /v1\/lire|cle=zzz|https:/);
  });
  it('un service qui reste sur l\'appareil : aucun avertissement', () => {
    const { hote } = hoteLecture(COMPLET, { sortant: 'local' });
    assert.doesNotMatch(monter(hote).root.innerHTML, /hors de cet appareil/);
  });
});

describe('lire un texte : ce que le service reçoit', () => {
  it('le texte, la consigne, les champs visés et leur description', async () => {
    const { hote, appels } = hoteLecture(COMPLET);
    const { root } = monter(hote);
    await lireTexte(root, '  Fissure au pont nord  ');
    const e = appels[0].entree;
    assert.equal(e.texte, 'Fissure au pont nord');
    assert.equal(e.consigne, CONSIGNE);
    assert.deepEqual(e.champs, ['lieu', 'urgence', 'visite', 'nb']);
    assert.deepEqual(e.schema.map((c) => c.colId), ['lieu', 'urgence', 'visite', 'nb']);
    assert.deepEqual(e.schema.find((c) => c.colId === 'urgence').options.choices, ['1', '2', '3'], 'les choix permis, par leur valeur');
    assert.equal(e.schema.find((c) => c.colId === 'nb').type, 'Int');
    assert.ok('signal' in appels[0].opt);
  });
  it('texte vide : on le dit, le service n\'est pas appelé', async () => {
    const { hote, appels } = hoteLecture(COMPLET);
    const { root } = monter(hote);
    await lireTexte(root, '   ');
    assert.equal(appels.length, 0);
    assert.match(root.innerHTML, /Écrivez ou dictez d’abord le texte à lire/);
  });
  it('pendant la lecture, le bouton est désactivé : pas de seconde lecture par-dessus', async () => {
    let finir;
    const attente = new Promise((r) => { finir = r; });
    const { hote, appels } = hoteLecture(() => attente.then(() => COMPLET));
    const { root } = monter(hote);
    await lireTexte(root);
    assert.match(root.innerHTML, /Lecture en cours/);
    assert.match(root.innerHTML, /data-voix-action="extraire"[^>]*disabled/);
    lire(root).dispatchEvent('click'); await laisser();
    assert.equal(appels.length, 1);
    finir(); await laisser(6);
    assert.ok(carte(root, 'lieu'));
  });
});

describe('une proposition n\'est jamais une valeur', () => {
  it('rien n\'est écrit dans les champs : seulement des cartes à côté d\'eux', async () => {
    const { hote } = hoteLecture(COMPLET);
    const { root, h } = monter(hote);
    await lireTexte(root);
    ['lieu', 'urgence', 'visite', 'nb'].forEach((c) => assert.ok(carte(root, c), 'une proposition pour ' + c));
    const v = h.valeurs();
    ['lieu', 'urgence', 'visite', 'nb'].forEach((c) => assert.ok(v[c] === undefined || v[c] === null || v[c] === '', c + ' ne doit pas être rempli sans geste : ' + JSON.stringify(v[c])));
    assert.match(root.innerHTML, /4 propositions : à vous de choisir/);
  });
  it('la carte montre la valeur lue, par son libellé quand le choix en a un', async () => {
    const { hote } = hoteLecture(COMPLET);
    const { root } = monter(hote);
    await lireTexte(root);
    assert.match(carte(root, 'urgence').querySelector('strong') ? root.innerHTML : '', /<strong>Forte<\/strong>/);
    assert.match(root.innerHTML, /<strong>Pont nord<\/strong>/);
    assert.match(root.innerHTML, /<strong>2<\/strong>/);
  });
  it('Utiliser écrit la valeur proposée, et la carte disparaît', async () => {
    const { hote } = hoteLecture(COMPLET);
    const { root, h } = monter(hote);
    await lireTexte(root);
    geste(root, 'lieu', 'utiliser').dispatchEvent('click'); await laisser();
    assert.equal(h.valeurs().lieu, 'Pont nord');
    assert.equal(carte(root, 'lieu'), null);
    assert.ok(carte(root, 'urgence'), 'les autres propositions attendent leur geste');
    assert.equal(h.valeurs().urgence == null || h.valeurs().urgence === '', true);
  });
  it('Corriger pose la valeur proposée pour que la personne la corrige à la main', async () => {
    const { hote } = hoteLecture(COMPLET);
    const { root, h } = monter(hote);
    await lireTexte(root);
    geste(root, 'nb', 'corriger').dispatchEvent('click'); await laisser();
    assert.equal(h.valeurs().nb, 2);
    assert.equal(carte(root, 'nb'), null);
  });
  it('Ignorer n\'écrit rien, et la carte disparaît', async () => {
    const { hote } = hoteLecture(COMPLET);
    const { root, h } = monter(hote);
    await lireTexte(root);
    geste(root, 'lieu', 'ignorer').dispatchEvent('click'); await laisser();
    assert.ok(!h.valeurs().lieu);
    assert.equal(carte(root, 'lieu'), null);
  });
  it('un champ déjà rempli : la carte dit ce qu\'elle remplacerait, et Ignorer le garde', async () => {
    const { hote } = hoteLecture(COMPLET);
    const root = createRoot();
    const h = Engine.monter(root, def(), { hote, normaliseur: normaliserBanc, valeurs: { lieu: 'Quai sud' } });
    await lireTexte(root);
    assert.match(carte(root, 'lieu').querySelector('strong') ? root.innerHTML : '', /remplacerait : Quai sud/);
    geste(root, 'lieu', 'ignorer').dispatchEvent('click'); await laisser();
    assert.equal(h.valeurs().lieu, 'Quai sud', 'ce que la personne a écrit reste');
  });
  it('une nouvelle lecture ne remplace pas une valeur décidée : elle propose de nouveau', async () => {
    let n = 0;
    const { hote } = hoteLecture(() => (n++ === 0 ? COMPLET : { valeurs: { lieu: 'Pont sud' }, anomalies: [] }));
    const { root, h } = monter(hote);
    await lireTexte(root);
    geste(root, 'lieu', 'utiliser').dispatchEvent('click'); await laisser();
    assert.equal(h.valeurs().lieu, 'Pont nord');
    await lireTexte(root, 'Autre texte');
    assert.equal(h.valeurs().lieu, 'Pont nord', 'la seconde lecture n\'a rien écrit');
    assert.match(root.innerHTML, /remplacerait : Pont nord/);
    geste(root, 'lieu', 'utiliser').dispatchEvent('click'); await laisser();
    assert.equal(h.valeurs().lieu, 'Pont sud');
  });
  it('une seconde lecture remplace les propositions en attente, pas celles des champs non lus cette fois', async () => {
    let n = 0;
    const { hote } = hoteLecture(() => (n++ === 0 ? COMPLET : { valeurs: { lieu: 'Autre pont' }, anomalies: [] }));
    const { root } = monter(hote);
    await lireTexte(root);
    await lireTexte(root, 'Nouveau texte');
    assert.match(root.innerHTML, /<strong>Autre pont<\/strong>/);
    assert.equal(carte(root, 'urgence'), null, 'une valeur non lue cette fois n\'est plus proposée');
  });
  it('une valeur lue contenant une balise est échappée', async () => {
    const { hote } = hoteLecture({ valeurs: { lieu: '<img src=x onerror=alert(1)>' }, anomalies: [] });
    const { root } = monter(hote);
    await lireTexte(root);
    assert.ok(!root.innerHTML.includes('<img'));
  });
});

describe('ce qui n\'a pas pu être retenu se dit, avec la valeur lue', () => {
  it('hors liste, non numérique : pas de carte, une ligne dans la liste', async () => {
    const { hote } = hoteLecture({ valeurs: { lieu: 'Pont', urgence: '9', nb: 'beaucoup' }, anomalies: [] });
    const { root } = monter(hote);
    await lireTexte(root);
    assert.ok(carte(root, 'lieu'));
    assert.equal(carte(root, 'urgence'), null);
    assert.equal(carte(root, 'nb'), null);
    assert.match(root.innerHTML, /Urgence : hors de la liste déclarée \(lu : « 9 »\)/);
    assert.match(root.innerHTML, /Nombre de désordres : nombre illisible \(lu : « beaucoup »\)/);
    assert.match(root.innerHTML, /aria-label="Ce qui n’a pas pu être retenu"/);
  });
  it('un champ que le formulaire ne vise pas n\'est pas écarté en silence', async () => {
    const { hote } = hoteLecture({ valeurs: { lieu: 'Pont', secret: 'x' }, anomalies: [] });
    const { root } = monter(hote);
    await lireTexte(root);
    assert.match(root.innerHTML, /secret : champ non visé \(lu : « x »\)/);
  });
  it('les anomalies que le service rend lui-même s\'ajoutent', async () => {
    const { hote } = hoteLecture({ valeurs: { lieu: 'Pont' }, anomalies: [{ champ: 'visite', quoi: 'date ambiguë', brut: '03/04' }] });
    const { root } = monter(hote);
    await lireTexte(root);
    assert.match(root.innerHTML, /Date de visite : date ambiguë \(lu : « 03\/04 »\)/);
  });
  it('une valeur non lue (null) n\'est ni proposée ni comptée comme lue vide', async () => {
    const { hote } = hoteLecture({ valeurs: { lieu: 'Pont', urgence: null, visite: '', nb: null }, anomalies: [] });
    const { root } = monter(hote);
    await lireTexte(root);
    assert.ok(carte(root, 'lieu'));
    ['urgence', 'visite', 'nb'].forEach((c) => assert.equal(carte(root, c), null, c));
    assert.match(root.innerHTML, /1 proposition : à vous de choisir/);
  });
  it('rien reconnu : dit comme tel, pas comme une panne', async () => {
    const { hote } = hoteLecture({ valeurs: { lieu: null }, anomalies: [] });
    const { root } = monter(hote);
    await lireTexte(root);
    assert.match(root.innerHTML, /Rien n(?:'|&#39;)a été reconnu/);
  });
  it('la valeur brute illisible d\'un type non couvert est dite, pas perdue', async () => {
    const root = createRoot();
    const f = def();
    f.sections[0].fields.push({ colId: 'quand', label: 'Quand', type: 'DateTime', widget: 'datetime' });
    f.sections[0].fields[0].options.extraction.champs.push('quand');
    const { hote } = hoteLecture({ valeurs: { quand: '2026-11-09T10:00' }, anomalies: [] });
    Engine.monter(root, f, { hote, normaliseur: normaliserBanc });
    await lireTexte(root);
    assert.match(root.innerHTML, /Quand : type non pris en charge \(lu : « 2026-11-09T10:00 »\)/);
  });
});

describe('quand la lecture échoue', () => {
  it('droits refusés : phrase du genre, aucune carte, pas de réessai', async () => {
    const { hote, appels } = hoteLecture({ statut: 403 });
    const { root } = monter(hote);
    await lireTexte(root);
    assert.equal(appels.length, 1);
    assert.match(root.innerHTML, /Le service de lecture refuse l(?:'|&#39;)accès/);
    assert.equal(carte(root, 'lieu'), null);
  });
  it('réponse marquée vide par le transport : réessayée (un vide se réessaie), la lecture reste en cours', async () => {
    const { hote, appels } = hoteLecture({ statut: 200, vide: true });
    const { root, h } = monter(hote);
    await lireTexte(root);
    assert.equal(appels.length, 1, 'premier essai, puis attente avant le réessai');
    assert.match(root.innerHTML, /Lecture en cours/);
    h.demonter(); // coupe l'attente des réessais plutôt que d'en attendre six secondes
  });
  it('le normaliseur lève : rien n\'est proposé, c\'est dit et journalisé, sans casser le formulaire', async () => {
    const dits = [];
    Engine.definirJournal((e) => dits.push(e));
    try {
      const { hote } = hoteLecture(COMPLET);
      const { root } = monter(hote, { normaliseur: () => { throw new Error('boum'); } });
      await lireTexte(root);
      assert.match(root.innerHTML, /La lecture n’a rien pu proposer/);
      assert.equal(carte(root, 'lieu'), null);
      assert.equal(dits.length, 1);
    } finally { Engine.definirJournal(); }
  });
  it('AUCUNE clé, adresse ni jeton ne ressort, même si le service les met dans son message', async () => {
    const secret = 'sk-test-0123456789abcdefghij';
    const { hote } = hoteLecture(() => { throw new Error('refus de https://api.exemple.test/v1 avec ' + secret); });
    const { root, h } = monter(hote);
    await lireTexte(root);
    assert.ok(!root.innerHTML.includes(secret));
    assert.ok(!root.innerHTML.includes('https://api.exemple.test/v1'));
    h.demonter();
  });
  it('un service qui rend autre chose qu\'un objet ne propose rien et ne lève pas', async () => {
    const { hote } = hoteLecture('du texte');
    const { root } = monter(hote);
    await lireTexte(root);
    assert.equal(carte(root, 'lieu'), null);
  });
});

describe('démonter pendant la lecture', () => {
  it('le signal du service est levé, et une réponse tardive ne propose rien', async () => {
    let finir;
    const attente = new Promise((r) => { finir = r; });
    const { hote, appels } = hoteLecture(() => attente.then(() => COMPLET));
    const { root, h } = monter(hote);
    await lireTexte(root);
    const signal = appels[0].opt.signal;
    assert.equal(signal.aborted, false);
    h.demonter();
    assert.equal(signal.aborted, true);
    finir(); await laisser(6);
    assert.equal(carte(root, 'lieu'), null);
  });
});

describe('dictée et lecture ensemble', () => {
  it('les deux boutons, et la lecture attend la fin de la dictée', async () => {
    const hote = { contrat: 'hote-capacites-0.1', capacites: { micro: true }, services: {
      transcrire: { sortant: 'tiers', nom: 'a.exemple.test', appeler: async () => ({ texte: 'dicté' }) },
      extraire: { sortant: 'tiers', nom: 'b.exemple.test', appeler: async () => COMPLET }
    } };
    const capteurs = { audio: { demarrer: async () => ({ arreter: async () => ({ blob: { size: 10 }, secondes: 1 }), annuler: () => {} }) } };
    const root = createRoot();
    const h = Engine.monter(root, def(), { hote, normaliseur: normaliserBanc, capteurs });
    assert.ok(root.querySelector('[data-voix-action="basculer"]'));
    assert.ok(lire(root));
    assert.match(root.innerHTML, /envoyé à a\.exemple\.test/);
    assert.match(root.innerHTML, /envoyé à b\.exemple\.test/);
    root.querySelector('[data-voix-action="basculer"]').dispatchEvent('click'); await laisser();
    assert.match(root.innerHTML, /data-voix-action="extraire"[^>]*disabled/, 'pas de lecture pendant la dictée');
    h.demonter(); // libère le micro et le minuteur de la dictée
  });
  it('la lecture seule, sans micro : le texte écrit à la main se lit aussi', async () => {
    const { hote } = hoteLecture(COMPLET);
    const { root } = monter(hote);
    assert.equal(root.querySelector('[data-voix-action="basculer"]'), null);
    await lireTexte(root);
    assert.ok(carte(root, 'lieu'));
  });
});

describe('avec le vrai normaliseur du moteur de lecture documentaire, quand il est joignable', () => {
  const chemin = path.join(__dirname, '..', '..', 'lecture_documentaire', 'shared', 'champs.js');
  const reel = fs.existsSync(chemin) ? require(chemin) : null;
  it('une date en toutes lettres et un nombre en texte deviennent des propositions typées', { skip: reel ? false : 'module de lecture documentaire absent de cette branche' }, async () => {
    const { hote } = hoteLecture({ valeurs: { visite: '3 mars 2026', nb: '2', urgence: '2' }, anomalies: [] });
    const { root, h } = monter(hote, { normaliseur: reel.normaliser });
    await lireTexte(root);
    assert.match(root.innerHTML, /<strong>2026-03-03<\/strong>/);
    geste(root, 'nb', 'utiliser').dispatchEvent('click'); await laisser();
    assert.strictEqual(h.valeurs().nb, 2);
    assert.match(root.innerHTML, /<strong>Moyenne<\/strong>/);
  });
});
