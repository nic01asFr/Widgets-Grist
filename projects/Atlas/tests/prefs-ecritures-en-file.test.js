import test from 'node:test';
import assert from 'node:assert/strict';
import { saveLayerPref } from '../lib/grist-sync.js';

// Un faux document qui dit « la table n'existe pas » tant qu'une AddTable n'est
// pas terminée, comme Grist : sans file, N appels simultanés créent N tables.
function fauxDocument() {
  const tables = new Set();
  const journal = [];
  let ligneSuivante = 1;
  return {
    journal,
    async listTables() { await new Promise((r) => setTimeout(r, 5)); return [...tables]; },
    async applyUserActions(actions) {
      await new Promise((r) => setTimeout(r, 5));
      const [a] = actions;
      journal.push(`${a[0]} ${a[1]}`);
      if (a[0] === 'AddTable') {
        let nom = a[1];
        for (let n = 2; tables.has(nom); n++) nom = `${a[1]}${n}`;
        tables.add(nom);
        return { retValues: [{ table_id: nom }] };
      }
      return { retValues: [ligneSuivante++] };
    },
  };
}

const couche = (n) => ({ id: `c${n}`, sourceTable: `T${n}`, source: 'grist-table', name: `T${n}`, visible: true, style: {} });

test('des enregistrements simultanés ne créent qu’une table de préférences', async () => {
  const doc = fauxDocument();
  await Promise.all([1, 2, 3, 4, 5].map((n) => saveLayerPref(doc, couche(n))));
  assert.equal(doc.journal.filter((j) => j.startsWith('AddTable')).length, 1, doc.journal.join(' | '));
  assert.equal(doc.journal.filter((j) => j.startsWith('AddRecord')).length, 5);
});

test('deux enregistrements rapprochés de la même couche ne font qu’une ligne', async () => {
  const doc = fauxDocument();
  const c = couche(1);
  await Promise.all([saveLayerPref(doc, c), saveLayerPref(doc, c)]);
  assert.equal(doc.journal.filter((j) => j.startsWith('AddRecord')).length, 1, doc.journal.join(' | '));
  assert.equal(doc.journal.filter((j) => j.startsWith('UpdateRecord')).length, 1);
});

test('un échec est rendu à son appelant sans bloquer les suivants', async () => {
  const doc = fauxDocument();
  const vrai = doc.applyUserActions.bind(doc);
  let appel = 0;
  doc.applyUserActions = async (a) => { if (++appel === 1) throw new Error('Blocked by table update access rules'); return vrai(a); };
  const [premier, second] = await Promise.allSettled([saveLayerPref(doc, couche(1)), saveLayerPref(doc, couche(2))]);
  assert.equal(premier.status, 'rejected');
  assert.match(String(premier.reason.message), /Blocked/);
  assert.equal(second.status, 'fulfilled');
});
