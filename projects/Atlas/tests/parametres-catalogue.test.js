/**
 * Le schéma des paramètres porté par le catalogue (`type.parameters[]`).
 *
 * node --test projects/Atlas/tests/parametres-catalogue.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lireCatalogue } from '../lib/catalogue-objets.js';
import { descripteursDuType, normaliserParametreDuCatalogue, resoudreParametre } from '../lib/parametres-objet.js';

const CAT = lireCatalogue(
  JSON.parse(readFileSync(new URL('../objets/catalog.json', import.meta.url), 'utf8')),
  'https://exemple.test/objets/catalog.json',
);
const mat = CAT.types.find((t) => t.id === 'mat_crosse');

test('un parametre declare par le catalogue, en cles anglaises, devient un descripteur d Atlas', () => {
  const d = normaliserParametreDuCatalogue({
    id: 'age_class', kind: 'choice', label: 'Classe d’âge', group: 'source', help: 'Jeune, adulte ou vieux',
    choices: [{ value: 'young', label: 'Jeune' }, { value: 'adult', label: 'Adulte' }, { value: 'old' }],
    default: { value: 'adult', origin: 'catalogue', explanation: 'âge par défaut du type' }, aliases: ['age'], inject: true,
  });
  assert.equal(d.libelle, 'Classe d’âge');
  assert.equal(d.groupe, 'source');
  assert.deepEqual(d.choix, [{ value: 'young', label: 'Jeune' }, { value: 'adult', label: 'Adulte' }, { value: 'old', label: 'old' }]);
  assert.deepEqual(d.defaut, { valeur: 'adult', origine: 'catalogue', explication: 'âge par défaut du type' });
  assert.deepEqual(d.alias, ['age']);
  assert.equal(d.injecter, true);
  assert.equal(d.aide, 'Jeune, adulte ou vieux');
});

test('les cles d Atlas sont acceptees aussi, et les bornes passent', () => {
  const d = normaliserParametreDuCatalogue({ id: 'hauteur', kind: 'number', libelle: 'Hauteur', unite: 'm', min: 0, max: 50, pas: 0.5, bande: [3, 12] });
  assert.deepEqual([d.libelle, d.unite, d.min, d.max, d.pas, d.bande], ['Hauteur', 'm', 0, 50, 0.5, [3, 12]]);
  assert.deepEqual(normaliserParametreDuCatalogue({ id: 'x', kind: 'number', usual: [1, 2] }).bande, [1, 2]);
});

test('un parametre sans id ou sans type est ecarte sans erreur', () => {
  for (const p of [null, undefined, 'x', {}, { id: 'a' }, { kind: 'number' }]) assert.equal(normaliserParametreDuCatalogue(p), null);
});

test('un type de vegetation qui declare ses parametres les voit resolus, sans schema integre', () => {
  const platane = {
    id: 'platanus', family: 'vegetation', name: 'Platane',
    parameters: [
      { id: 'age_class', kind: 'choice', label: 'Classe d’âge', choices: [{ value: 'young', label: 'Jeune' }, { value: 'adult', label: 'Adulte' }], default: { value: 'adult', origin: 'catalogue' } },
      { id: 'circonference', kind: 'number', label: 'Circonférence', unit: 'm', min: 0, max: 20, aliases: ['circumference'] },
    ],
  };
  const d = descripteursDuType(platane);
  assert.deepEqual(d.map((x) => x.id), ['age_class', 'circonference']);
  const age = d.find((x) => x.id === 'age_class');
  assert.equal(resoudreParametre(age, { props: {} }).origine, 'catalogue');
  assert.equal(resoudreParametre(age, { props: { age_class: 'young' } }).valeur, 'young');
  const c = d.find((x) => x.id === 'circonference');
  const r = resoudreParametre(c, { props: { circumference: '1,8' } });
  assert.deepEqual([r.valeur, r.champ], [1.8, 'circumference']);
});

test('un type d eclairage qui declare un parametre remplace celui du schema integre', () => {
  const t = { ...mat, parameters: [{ id: 'puissance', kind: 'number', label: 'Puissance du fabricant', unit: 'W', default: { value: 90, origin: 'catalogue' } }] };
  const p = descripteursDuType(t).find((x) => x.id === 'puissance');
  assert.equal(p.libelle, 'Puissance du fabricant');
  assert.equal(p.defaut.valeur, 90);
  assert.equal(p.groupe, 'source', 'le groupe du schema integre est conserve');
});

test('un catalogue plus riche que le schema integre reste affichable : les parametres en plus sont ajoutes', () => {
  const t = { ...mat, parameters: [{ id: 'indiceRendu', kind: 'number', label: 'Indice de rendu des couleurs', min: 0, max: 100 }] };
  const ids = descripteursDuType(t).map((x) => x.id);
  assert.ok(ids.includes('indiceRendu'));
  assert.ok(ids.includes('puissance'));
});
