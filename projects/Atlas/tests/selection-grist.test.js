/**
 * La ligne sélectionnée dans Grist retrouvée sur la carte : identifiant de ligne, couche liée à la table, entité portant `_row_id`.
 * node --test projects/Atlas/tests/selection-grist.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { idLigne, retrouverEntite } from '../lib/selection-grist.js';

const entite = (rowId, x = 5.3) => ({ type: 'Feature', properties: { _row_id: rowId }, geometry: { type: 'Point', coordinates: [x, 43.3] } });
const couche = (id, sourceTable, ids, extra = {}) => ({ id, sourceTable, geojson: { type: 'FeatureCollection', features: ids.map((i) => entite(i)) }, ...extra });

test('idLigne : un entier positif ; rien pour une ligne vide, en création ou mal formée', () => {
  assert.equal(idLigne({ id: 12, titre: 'x' }), 12);
  for (const mauvais of [null, undefined, {}, { id: 0 }, { id: -1 }, { id: 'new' }, { id: '12' }, { id: NaN }, { id: Infinity }, 'x', 12]) assert.equal(idLigne(mauvais), null, JSON.stringify(mauvais));
});

test('retrouverEntite : la couche liée à la table, le rang de l entité qui porte la ligne', () => {
  const couches = [couche('a', 'Tasks', [3, 7, 9])];
  const r = retrouverEntite(couches, 'Tasks', 7);
  assert.equal(r.layer.id, 'a'); assert.equal(r.idx, 1);
});

test('retrouverEntite : une autre table, une ligne absente ou des arguments vides ne trouvent rien (jamais d exception)', () => {
  const couches = [couche('a', 'Tasks', [3, 7])];
  assert.equal(retrouverEntite(couches, 'Autre', 7), null, 'la table du widget n est pas celle de la couche');
  assert.equal(retrouverEntite(couches, 'Tasks', 99), null, 'ligne sans localisation');
  assert.equal(retrouverEntite(couches, null, 7), null);
  assert.equal(retrouverEntite(couches, 'Tasks', null), null);
  assert.equal(retrouverEntite(null, 'Tasks', 7), null);
  assert.equal(retrouverEntite([{ id: 'x', sourceTable: 'Tasks' }, null, { id: 'y', sourceTable: 'Tasks', geojson: {} }], 'Tasks', 7), null);
});

test('retrouverEntite : une couche sans lien à une table (importée, dessinée) n est jamais prise pour une ligne', () => {
  const libre = { id: 'l', geojson: { features: [entite(7)] } };
  assert.equal(retrouverEntite([libre], 'Tasks', 7), null);
});

test('retrouverEntite : la même table montrée deux fois, la couche visible passe avant la masquée', () => {
  const masquee = couche('m', 'Tasks', [7], { visible: false });
  const visible = couche('v', 'Tasks', [7], { visible: true });
  assert.equal(retrouverEntite([masquee, visible], 'Tasks', 7).layer.id, 'v');
  assert.equal(retrouverEntite([masquee], 'Tasks', 7).layer.id, 'm', 'seule couche : on la prend quand même');
});

test('câblage : onRecord se branche après grist.ready, et seulement quand l API le fournit (hors Grist, l adaptateur REST n en a pas)', () => {
  const ICI = path.dirname(fileURLToPath(import.meta.url));
  const app = fs.readFileSync(path.join(ICI, '..', 'app_v7.js'), 'utf8');
  const iReady = app.indexOf('grist.ready({ requiredAccess: acc.requiredAccess });');
  const iBranche = app.indexOf('brancherSelectionGrist();', iReady);
  assert.ok(iReady > 0 && iBranche > iReady, 'brancherSelectionGrist() doit suivre grist.ready()');
  assert.match(app, /typeof grist\.onRecord !== 'function'/, 'garde : pas d onRecord, pas de branchement');
  const adaptateur = fs.readFileSync(path.join(ICI, '..', 'lib', 'grist-adapter.js'), 'utf8');
  assert.ok(!/onRecord/.test(adaptateur), 'l adaptateur REST ne simule pas la sélection de ligne');
});
