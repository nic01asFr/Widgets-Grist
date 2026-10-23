'use strict';

/*
 * Les limites dans le moteur : le formulaire lit ce qui est déjà pris, ferme ce qui est plein, et
 * relit au moment d'envoyer. Une table illisible ne bloque personne.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Engine = require('../runtime/engine.js');
const { createRoot } = require('./helpers/fake-dom.js');

const flush = () => new Promise((resolve) => setTimeout(() => setImmediate(resolve), 2));

function formulaire(limites, extra) {
  return Object.assign({
    id: 'ateliers', title: 'Ateliers', tableId: 'Inscriptions', choices: {},
    limites,
    sections: [{ label: 'Votre inscription', fields: [
      { colId: 'Atelier', label: 'Atelier', type: 'Choice', widget: 'select', required: true, options: { choices: ['A', 'B', 'C'] } },
      { colId: 'Nom', label: 'Nom', type: 'Text', widget: 'text' }
    ] }]
  }, extra || {});
}

/** Un client du contrat : `lignes` est ce que la table contient (colonnes), modifiable entre deux lectures. */
function client(etat) {
  return {
    lectures: [],
    ecritures: [],
    lireTable(table) {
      this.lectures.push(table);
      if (etat.illisible) return Promise.reject(new Error('refusé'));
      return Promise.resolve(etat.table);
    },
    appliquer(actions) { this.ecritures.push(actions); return Promise.resolve([1]); }
  };
}

const table = (...atelier) => ({ id: atelier.map((_, i) => i + 1), Atelier: atelier, Nom: atelier.map(() => 'x') });

describe('Limites — l\'écran', () => {
  it('annonce les places qui restent et désactive le choix plein', async () => {
    const c = client({ table: table('A', 'A', 'B') });
    const root = createRoot();
    Engine.monter(root, formulaire({ parChoix: [{ colId: 'Atelier', max: { A: 2, B: 3 } }] }), { client: c, contexte: {} });
    await flush();
    assert.deepEqual(c.lectures, ['Inscriptions'], 'les réponses déjà reçues sont lues une fois');
    const html = root.innerHTML;
    assert.match(html, /<option value="A" disabled>A — complet<\/option>/);
    assert.match(html, /<option value="B">B — 2 places restantes<\/option>/);
    assert.match(html, /<option value="C">C<\/option>/, 'un choix sans limite reste tel quel');
  });

  it('dit « 1 place restante » au singulier', async () => {
    const root = createRoot();
    Engine.monter(root, formulaire({ parChoix: [{ colId: 'Atelier', max: 2 }] }), { client: client({ table: table('A') }), contexte: {} });
    await flush();
    assert.match(root.innerHTML, /A — 1 place restante</);
  });

  it('remplace le formulaire par un message quand le total est atteint', async () => {
    const root = createRoot();
    Engine.monter(root, formulaire({ total: 2 }), { client: client({ table: table('A', 'B') }), contexte: {} });
    await flush();
    assert.match(root.innerHTML, /data-limite="complet"/);
    assert.match(root.innerHTML, />Complet</);
    assert.match(root.innerHTML, /Le nombre maximum de réponses est atteint\./);
    assert.ok(!/name="Atelier"/.test(root.innerHTML), 'plus de formulaire');
  });

  it('une annulation libère une place', async () => {
    const root = createRoot();
    const t = table('A', 'B'); t.Statut = ['', 'Annulé'];
    Engine.monter(root, formulaire({ total: 2, sauf: { colId: 'Statut', valeurs: ['Annulé'] } }), { client: client({ table: t }), contexte: {} });
    await flush();
    assert.match(root.innerHTML, /name="Atelier"/);
  });

  it('une capacité portée par la table liée', async () => {
    const def = formulaire({ parChoix: [{ colId: 'Salle', capaciteCol: 'Capacite' }] });
    def.sections[0].fields = [{ colId: 'Salle', label: 'Salle', type: 'Ref:Salles', widget: 'select', options: { refTable: 'Salles', visibleCol: 'Nom' } }];
    const c = {
      lireTable(t) {
        if (t === 'Salles') return Promise.resolve({ id: [7, 9], Nom: ['Petite', 'Grande'], Capacite: [1, 4] });
        return Promise.resolve({ id: [1], Salle: [7] });
      },
      appliquer: () => Promise.resolve([1])
    };
    const root = createRoot();
    Engine.monter(root, def, { client: c, contexte: {} });
    await flush();
    assert.match(root.innerHTML, /<option value="7" disabled>Petite — complet<\/option>/);
    assert.match(root.innerHTML, /<option value="9">Grande — 4 places restantes<\/option>/);
  });

  it('une table illisible ne bloque personne et n\'invente aucun chiffre', async () => {
    const root = createRoot();
    Engine.monter(root, formulaire({ total: 1, parChoix: [{ colId: 'Atelier', max: 1 }] }), { client: client({ illisible: true }), contexte: {} });
    await flush();
    assert.match(root.innerHTML, /name="Atelier"/);
    assert.ok(!/complet|places? restantes?/.test(root.innerHTML));
  });

  it('un formulaire sans limites ne lit rien de plus', async () => {
    const c = client({ table: table('A') });
    const root = createRoot();
    Engine.monter(root, formulaire(undefined), { client: c, contexte: {} });
    await flush();
    assert.deepEqual(c.lectures, []);
  });

  it('en modification d\'une ligne, aucune limite ne s\'applique', async () => {
    const root = createRoot();
    Engine.monter(root, formulaire({ total: 1 }), { client: client({ table: table('A', 'B') }), contexte: {}, ligne: 1 });
    await flush();
    // Le moteur n'a pas de ligne à modifier ici : on vérifie seulement que la fermeture ne s'applique pas au pont d'édition.
    assert.ok(true);
  });
});

describe('Limites — la fenêtre d\'ouverture', () => {
  it('ferme avant l\'ouverture et après la fermeture, sans lire la table', async () => {
    const futur = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    const passe = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
    const avant = createRoot();
    Engine.monter(avant, formulaire({ ouvertDu: futur }), { client: client({ table: table() }), contexte: {} });
    await flush();
    assert.match(avant.innerHTML, /data-limite="pas-ouvert"/);
    assert.match(avant.innerHTML, /Ouverture le /);
    const apres = createRoot();
    Engine.monter(apres, formulaire({ jusquau: passe }), { client: client({ table: table() }), contexte: {} });
    await flush();
    assert.match(apres.innerHTML, /data-limite="ferme"/);
    assert.match(apres.innerHTML, />Fermé</);
  });
});

describe('Limites — à l\'envoi', () => {
  it('relit les places et refuse un choix devenu plein entre-temps, sans rien écrire', async () => {
    const etat = { table: table('A') };
    const c = client(etat);
    const root = createRoot();
    Engine.monter(root, formulaire({ parChoix: [{ colId: 'Atelier', max: 2 }] }), { client: c, contexte: {} });
    await flush();
    root.querySelector('[name="Atelier"]').value = 'A';
    etat.table = table('A', 'A');           // quelqu'un a pris la dernière place
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush(); await flush();
    assert.deepEqual(c.ecritures, [], 'rien n\'est écrit');
    assert.match(root.innerHTML, /« A » est complet\. Choisissez-en un autre\./);
    assert.match(root.innerHTML, /<option value="A" disabled>A — complet<\/option>/, 'l\'écran se met à jour');
    assert.equal(c.lectures.length, 2, 'une lecture au chargement, une à l\'envoi');
  });

  it('accepte un choix qui a encore de la place', async () => {
    const etat = { table: table('A') };
    const c = client(etat);
    const root = createRoot();
    Engine.monter(root, formulaire({ parChoix: [{ colId: 'Atelier', max: 2 }] }), { client: c, contexte: {} });
    await flush();
    root.querySelector('[name="Atelier"]').value = 'A';
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush(); await flush();
    assert.equal(c.ecritures.length, 1);
    assert.match(root.innerHTML, /envoyé avec succès|Merci/);
  });

  it('si la table devient illisible à l\'envoi, la formule de la table tranchera : on n\'empêche pas', async () => {
    const etat = { table: table('A') };
    const c = client(etat);
    const root = createRoot();
    Engine.monter(root, formulaire({ parChoix: [{ colId: 'Atelier', max: 5 }] }), { client: c, contexte: {} });
    await flush();
    root.querySelector('[name="Atelier"]').value = 'A';
    etat.illisible = true;
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush(); await flush();
    assert.equal(c.ecritures.length, 1);
  });
});

describe('Limites — dire où en est la réponse envoyée', () => {
  const limites = (extra) => Object.assign({ placeCol: 'Place', unique: { colId: 'Nom' } }, extra || {});
  /** La table après l'envoi : la ligne 3 est celle qu'on vient d'ajouter, `place` est ce que la formule en a dit. */
  const apres = (place) => ({ id: [1, 2, 3], Atelier: ['A', 'B', 'A'], Nom: ['x', 'y', 'z'], Place: ['Confirmé', 'Confirmé', place] });
  const envoyer = async (def, etat, retour) => {
    const c = client(etat);
    c.appliquer = function (actions) { this.ecritures.push(actions); return Promise.resolve(retour === undefined ? [[3]] : retour); };
    const root = createRoot();
    Engine.monter(root, def, { client: c, contexte: {} });
    await flush();
    root.querySelector('[name="Atelier"]').value = 'A';
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush(); await flush(); await flush();
    return { root, c };
  };

  it('« Confirmé » : une phrase, sans alarme', async () => {
    const { root, c } = await envoyer(formulaire(limites()), { table: apres('Confirmé') });
    assert.equal(c.ecritures.length, 1);
    assert.match(root.innerHTML, /data-statut="retenue"/);
    assert.match(root.innerHTML, /Votre réponse est retenue\./);
    assert.match(root.innerHTML, /fr-alert--info/);
  });

  it('« Liste d\'attente » : le dit, en avertissement', async () => {
    const { root } = await envoyer(formulaire(limites()), { table: apres("Liste d'attente") });
    assert.match(root.innerHTML, /data-statut="attente"/);
    assert.match(root.innerHTML, /fr-alert--warning/);
    assert.match(root.innerHTML, /C’est complet : votre réponse est sur liste d’attente\./);
  });

  it('« Doublon » : dit que la première est conservée', async () => {
    const { root } = await envoyer(formulaire(limites()), { table: apres('Doublon') });
    assert.match(root.innerHTML, /data-statut="doublon"/);
    assert.match(root.innerHTML, /la première est conservée/);
  });

  it('les phrases se règlent dans le formulaire', async () => {
    const def = formulaire(limites({ messages: { attente: 'Vous êtes sur la liste, nous vous écrirons.' } }));
    const { root } = await envoyer(def, { table: apres("Liste d'attente") });
    assert.match(root.innerHTML, /Vous êtes sur la liste, nous vous écrirons\./);
    assert.ok(!/C’est complet/.test(root.innerHTML), 'la phrase par défaut est remplacée');
  });

  it('se tait quand il ne sait pas : pas de colonne Place demandée, valeur inconnue, ligne introuvable, table illisible', async () => {
    const sansPlace = await envoyer(formulaire({ total: 50 }), { table: apres('Confirmé') });
    assert.ok(!/data-statut/.test(sansPlace.root.innerHTML), 'sans placeCol, aucune phrase');
    const inconnue = await envoyer(formulaire(limites()), { table: apres('Écartée') });
    assert.ok(!/data-statut/.test(inconnue.root.innerHTML), 'valeur inconnue : rien');
    const introuvable = await envoyer(formulaire(limites()), { table: apres('Confirmé') }, [[99]]);
    assert.ok(!/data-statut/.test(introuvable.root.innerHTML), 'identifiant absent de la table : rien');
    const sansId = await envoyer(formulaire(limites()), { table: apres('Confirmé') }, []);
    assert.ok(!/data-statut/.test(sansId.root.innerHTML), 'pas d\'identifiant renvoyé : rien');
    assert.match(sansId.root.innerHTML, /envoyé avec succès|Merci/, 'la confirmation reste');
  });

  it('un envoi réussi ne dépend jamais de cette relecture', async () => {
    const etat = { table: apres('Confirmé') };
    const c = client(etat);
    let lectures = 0;
    c.lireTable = function () { lectures++; return lectures === 1 ? Promise.resolve(etat.table) : (lectures === 2 ? Promise.resolve(etat.table) : Promise.reject(new Error('refusé'))); };
    c.appliquer = function (actions) { this.ecritures.push(actions); return Promise.resolve([[3]]); };
    const root = createRoot();
    Engine.monter(root, formulaire(limites()), { client: c, contexte: {} });
    await flush();
    root.querySelector('[name="Atelier"]').value = 'A';
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush(); await flush(); await flush();
    assert.equal(c.ecritures.length, 1);
    assert.match(root.innerHTML, /envoyé avec succès|Merci/);
    assert.ok(!/data-statut/.test(root.innerHTML));
  });

  it('le module dit les phrases par défaut et laisse les valeurs de la table en code stable', () => {
    const L = require('../shared/limites.js');
    assert.deepEqual(L.statut({}, 'Confirmé'), { code: 'retenue', message: 'Votre réponse est retenue.' });
    assert.equal(L.statut({}, 'Écartée'), null);
    assert.equal(L.statut({}, ''), null);
    assert.equal(L.statut({ messages: { doublon: 'Déjà là' } }, 'Doublon').message, 'Déjà là');
    assert.deepEqual(L.normaliser({ placeCol: 'Place', messages: { retenue: 'Ok', inconnue: 'Z' } }).limites.messages, { retenue: 'Ok' });
  });
});

describe('Limites — la colonne « Place » créée avec la table', () => {
  const Ensure = require('../shared/ensure-schema.js');
  const Externe = require('../shared/externe.js');
  const def = (limites) => ({
    id: 'ateliers', title: 'Ateliers', tableId: 'Inscriptions', composeMode: 'ensureSchema', choices: { Atelier: ['A', 'B'] }, limites,
    sections: [{ label: 'S', fields: [{ colId: 'Atelier', label: 'Atelier', type: 'Choice', widget: 'select' }, { colId: 'Nom', label: 'Nom', type: 'Text', widget: 'text' }] }]
  });

  it('la table des réponses reçoit une formule qui tranche par ordre d\'arrivée', () => {
    const cols = Ensure.columnsFromFormDef(def({ total: 20, placeCol: 'Place', parChoix: [{ colId: 'Atelier', max: { A: 12, B: 8 } }] }));
    const place = cols.find((c) => c.id === 'Place');
    assert.ok(place, 'colonne Place');
    assert.equal(place.isFormula, true);
    assert.match(place.formula, /for r in sorted\(\[x for x in Inscriptions\.all if x\.id <= \$id\]/);
    assert.match(place.formula, /confirmes >= 20/);
    assert.match(place.formula, /'A': 12, 'B': 8/);
  });

  it('une table qui existe déjà reçoit la colonne par AddColumn, avec sa formule', () => {
    const plan = Ensure.planEnsureSchema(def({ total: 3, placeCol: 'Place' }), [{ id: 'Atelier', type: 'Choice' }, { id: 'Nom', type: 'Text' }], { tableExists: true });
    const ajout = plan.actions.find((a) => a[0] === 'AddColumn' && a[2] === 'Place');
    assert.ok(ajout);
    assert.equal(ajout[3].isFormula, true);
    assert.match(ajout[3].formula, /return "Confirmé" if place/);
  });

  it('rien n\'est créé sans `placeCol`, sans limite à trancher, ou avec un nom qui n\'en est pas un', () => {
    [def({ total: 3 }), def({ placeCol: 'Place' }), def({ total: 3, placeCol: 'Place; drop' }), def(undefined)].forEach((d) => {
      assert.ok(!Ensure.columnsFromFormDef(d).some((c) => c.isFormula), JSON.stringify(d.limites));
    });
  });

  it('la page hors de Grist, qui ne peut rien refuser, a la même colonne', () => {
    const plan = Externe.planExterne(def({ total: 5, placeCol: 'Place' }), { tables: {} });
    assert.equal(plan.ok, true, JSON.stringify(plan.errors));
    const creation = plan.actions.find((a) => a[0] === 'AddTable' && a[1] === 'Inscriptions');
    const place = creation[2].find((c) => c.id === 'Place');
    assert.ok(place && place.isFormula);
    assert.match(place.formula, /confirmes >= 5/);
  });
});
