// Composant carte BI : un contrôle de type `text` se pose par `setFilter(id, { texte })` (forme du contrat de l'hôte) ou par une chaîne.
// node --test tests/bi-filtre-texte.test.js   (aucun accès réseau)
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { carteSimulee, point } from './aide-carte-bi.js';

const MANIFESTE = { layers: [{ id: 'sites', name: 'Sites', geometry_type: 'point', cle: 'ref', controls: [{ id: 'f-nom', field: 'nom', type: 'text' }] }] };
const DONNEES = { sites: [point(5.1, 43.2, { nom: 'Site Nord', ref: 'A' }, 1), point(5.2, 43.3, { nom: 'Site Sud', ref: 'B' }, 2), point(5.3, 43.4, { nom: 'Halles du nord', ref: 'C' }, 3)] };

async function composant() {
  const rt = attacher(carteSimulee());
  await rt.api.setScene(MANIFESTE, DONNEES);
  return rt;
}

test('filtre texte : la forme { texte } de l\'hôte filtre, sans tenir compte de la casse', async () => {
  const rt = await composant();
  assert.equal(rt.api.setFilter('f-nom', { texte: 'nord' }).compte, 2);
  assert.equal(rt.api.setFilter('f-nom', { texte: 'SUD' }).compte, 1);
});

test('filtre texte : une chaîne simple reste acceptée, un texte vide ou null ne restreint rien', async () => {
  const rt = await composant();
  assert.equal(rt.api.setFilter('f-nom', 'sud').compte, 1);
  assert.equal(rt.api.setFilter('f-nom', { texte: '' }).compte, 3);
  assert.equal(rt.api.setFilter('f-nom', { texte: 'nord' }).compte, 2);
  assert.equal(rt.api.setFilter('f-nom', null).compte, 3);
});
