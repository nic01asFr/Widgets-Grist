/**
 * `decrire()` (lib/bi/describe.js) : la description d'Atlas ne peut pas diverger du contrat qui s'exécute.
 * Les listes viennent de pont.js ; le test échoue si un texte manque, est en trop, ou si un exemple n'est pas accepté par le contrat.
 * node --test projects/Atlas/tests/bi-describe.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { COMMANDES, CAPACITES, VERSION, validerArguments } from '../lib/bi/pont.js';
import { TOUS_LES_EVENEMENTS as EVENEMENTS } from '../lib/bi/evenements-ext.js';
import { decrire, TEXTES_COMMANDES, TEXTES_EVENEMENTS, EXEMPLES, GUIDE } from '../lib/bi/describe.js';
import { carteSimulee } from './aide-carte-bi.js';

const d = decrire();

test('chaque commande du pont est décrite, et seulement elles', () => {
  assert.deepEqual(d.commandes.map((c) => c.nom), Object.keys(COMMANDES));
  assert.deepEqual(Object.keys(TEXTES_COMMANDES).sort(), Object.keys(COMMANDES).sort(), 'texte manquant ou en trop');
  for (const c of d.commandes) {
    assert.ok(c.description.length > 10, c.nom + ' : description');
    assert.ok(c.resultat, c.nom + ' : résultat');
    assert.equal(c.arguments.length, COMMANDES[c.nom].length, c.nom + ' : nombre d\'arguments');
    assert.ok(['0.2', '0.3', '0.4', '0.5', '0.6'].includes(c.depuis));
  }
});

test("chaque événement du composant (ceux du pont et ceux qui s'y sont ajoutés) est décrit, et seulement eux", () => {
  assert.deepEqual(d.evenements.map((e) => e.nom), [...EVENEMENTS]);
  assert.deepEqual(Object.keys(TEXTES_EVENEMENTS).sort(), [...EVENEMENTS].sort());
  for (const e of d.evenements) assert.ok(e.description && e.charge, e.nom);
});

test('contrat et capacités lus dans le pont', () => {
  assert.equal(d.contrat.version, VERSION);
  assert.deepEqual(d.contrat.capacites, [...CAPACITES]);
  for (const c of d.commandes) assert.ok(CAPACITES.includes(c.capacite), c.nom + ' : capacité ' + c.capacite);
});

test('la description est du JSON pur (aller-retour sans perte) et ne renvoie que des textes courts', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(d)), d);
  assert.ok(GUIDE.length >= 8 && GUIDE.length <= 14, 'un guide court');
  assert.ok(JSON.stringify(d).length < 40000, 'taille de la description');
});

test('les exemples sont acceptés par le contrat et le manifeste de points se monte', async () => {
  for (const [nom, ex] of Object.entries(EXEMPLES)) {
    if (!ex.manifeste) continue;
    assert.equal(validerArguments('setScene', ex.donnees ? [ex.manifeste, ex.donnees] : [ex.manifeste]), null, nom + ' : arguments de setScene');
  }
  const rt = attacher(carteSimulee());
  const r = await rt.api.setScene(EXEMPLES.points.manifeste, EXEMPLES.points.donnees);
  assert.deepEqual(r, { sites: 1 });
  const b = EXEMPLES.bulle; const r2 = await attacher(carteSimulee()).api.setScene(b.manifeste, b.donnees);
  assert.deepEqual(r2, { sites: 1 }); assert.equal(r2._avertissements, undefined, "l'exemple de bulle est une bulle valide");
  assert.equal(r._erreurs, undefined);
});

test('AtlasBi.decrire() rend la même description, chargée à la demande', async () => {
  globalThis.HTMLElement = class {};
  globalThis.customElements = { get: () => undefined, define() {} };
  const { AtlasBi } = await import('../lib/bi/atlas-bi-element.js');
  assert.deepEqual(await AtlasBi.decrire(), d);
});

test('chaque attribut déclaratif annoncé existe dans l\'élément', async () => {
  const { DECLARATIFS } = await import('../lib/bi/declaratif.js');
  assert.deepEqual(d.declaratif.attributs, [...DECLARATIFS]);
  assert.ok(d.declaratif.evenementsDom.includes('atlas-bi-configure'));
});
