'use strict';

/*
 * Le statut après l'envoi sur le chemin RÉEL d'une page publiée : le moteur envoie par `GristBridge.addRow`,
 * qui rend la table à jour (pas l'identifiant). Sans `idCree`, le formulaire ne saurait pas laquelle est sa ligne
 * et ne dirait jamais rien — ce que les essais par le client de l'hôte ne montraient pas.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const Engine = require('../runtime/engine.js');
const GristBridge = require('../shared/grist-bridge.js');
const Contrat = require('../shared/client-contrat.js');
const { createRoot } = require('./helpers/fake-dom.js');

const flush = () => new Promise((resolve) => setTimeout(() => setImmediate(resolve), 2));

/** Un faux `grist.docApi` : une table en colonnes, des ids qui s'incrémentent, une colonne Place que « la formule » remplit. */
function fauxDocApi(placePourLaNouvelle) {
  const t = { id: [1, 2], Atelier: ['A', 'B'], Nom: ['x', 'y'], Place: ['Confirmé', 'Confirmé'] };
  let seq = 2;
  return {
    table: t,
    async fetchTable() { return JSON.parse(JSON.stringify(t)); },
    async applyUserActions(actions) {
      const retValues = [];
      actions.forEach(([nom, , , cols]) => {
        if (nom !== 'BulkAddRecord') return;
        seq += 1;
        t.id.push(seq);
        Object.keys(cols).forEach((c) => t[c].push(cols[c][0]));
        t.Place.push(placePourLaNouvelle);
        retValues.push([seq]);
      });
      return { actionNum: 1, retValues };
    }
  };
}

const formulaire = () => ({
  id: 'f', title: 'F', tableId: 'Inscriptions', choices: {},
  limites: { placeCol: 'Place', unique: { colId: 'Nom' } },
  sections: [{ label: 'S', fields: [
    { colId: 'Atelier', label: 'Atelier', type: 'Choice', widget: 'select', required: true, options: { choices: ['A', 'B', 'C'] } },
    { colId: 'Nom', label: 'Nom', type: 'Text', widget: 'text' }
  ] }]
});

describe('GristBridge.addRow — dit quelle ligne il vient d\'ajouter', () => {
  beforeEach(() => { global.window = { grist: { docApi: null } }; });
  afterEach(() => { delete global.window; });

  it('rend la table à jour, avec idCree non énumérable', async () => {
    const api = fauxDocApi('Confirmé');
    global.window.grist.docApi = api;
    const rows = await GristBridge.addRow('Inscriptions', { Atelier: 'C', Nom: 'z' });
    assert.equal(rows.length, 3, 'la table à jour, comme avant');
    assert.equal(rows[2].id, 3);
    assert.equal(rows.idCree, 3);
    assert.deepEqual(Object.keys(rows), ['0', '1', '2'], 'idCree ne se voit pas en parcourant le tableau');
    assert.deepEqual(JSON.parse(JSON.stringify(rows)).length, 3);
  });

  it('sans identifiant dans la réponse de Grist : pas d\'idCree, mais la table est rendue', async () => {
    const api = fauxDocApi('Confirmé');
    const vraie = api.applyUserActions;
    api.applyUserActions = async (a) => { await vraie(a); return undefined; };
    global.window.grist.docApi = api;
    const rows = await GristBridge.addRow('Inscriptions', { Atelier: 'C', Nom: 'z' });
    assert.equal(rows.length, 3);
    assert.equal(rows.idCree, undefined);
  });
});

describe('Le moteur branché sur GristBridge, comme une page publiée', () => {
  beforeEach(() => { global.window = { grist: { docApi: null } }; });
  afterEach(() => { delete global.window; });

  const envoyer = async (place) => {
    global.window.grist.docApi = fauxDocApi(place);
    const root = createRoot();
    Engine.mount(root, formulaire(), {
      addRow: GristBridge.addRow,
      loadTable: GristBridge.loadTable,
      skipProbe: true
    });
    await flush();
    root.querySelector('[name="Atelier"]').value = 'C';
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush(); await flush(); await flush(); await flush();
    return root;
  };

  it('« Confirmé » : la phrase s\'affiche', async () => {
    const root = await envoyer('Confirmé');
    assert.match(root.innerHTML, /data-statut="retenue"/);
  });

  it('« Liste d\'attente » : la phrase s\'affiche, c\'est bien la ligne ajoutée qui est lue (pas la première)', async () => {
    const root = await envoyer("Liste d'attente");
    assert.match(root.innerHTML, /data-statut="attente"/, 'les lignes 1 et 2 sont « Confirmé » : lire une autre ligne se verrait');
  });

  it('« Doublon »', async () => {
    const root = await envoyer('Doublon');
    assert.match(root.innerHTML, /data-statut="doublon"/);
  });
});

describe('versPont.addRow — même promesse pour un hôte', () => {
  it('porte aussi idCree', async () => {
    const tables = { T: { id: [1], nom: ['a'] } };
    const client = {
      lireTable: async (t) => JSON.parse(JSON.stringify(tables[t])),
      appliquer: async (actions) => {
        tables.T.id.push(7); tables.T.nom.push(actions[0][3].nom[0]);
        return { retValues: [[7]] };
      }
    };
    const rows = await Contrat.versPont(client).addRow('T', { nom: 'b' });
    assert.equal(rows.idCree, 7);
    assert.deepEqual(rows.map((r) => r.id), [1, 7]);
  });
});
