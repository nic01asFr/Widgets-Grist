'use strict';

/*
 * L'ordre entre deux questions et l'heure seule, jugés dans Grist : la formule
 * `Motifs` est exécutée en Python (voir `externe.test.js`).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const Externe = require('../shared/externe.js');

function pythonDisponible() {
  const r = spawnSync('python', ['-I', '-c', 'print(1)'], { encoding: 'utf8' });
  return r.status === 0;
}

function motifsPython(formule, lignes) {
  const corps = formule.split('\n').map((l) => '    ' + l).join('\n');
  const source = [
    'import json, sys',
    'class Ligne:',
    '    pass',
    'def fabriquer(d):',
    '    l = Ligne()',
    '    for k, v in d.items():',
    '        setattr(l, k, v)',
    '    return l',
    'def _f(row):',
    corps.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, 'row.$1'),
    'lignes = json.loads(sys.stdin.read())',
    'print(json.dumps([_f(fabriquer(d)) for d in lignes]))'
  ].join('\n');
  const r = spawnSync('python', ['-I', '-c', source], { input: JSON.stringify(lignes), encoding: 'utf8' });
  if (r.status !== 0) throw new Error('Python a échoué :\n' + r.stderr);
  return JSON.parse(r.stdout);
}

describe('Externe — l’ordre entre deux questions, jugé dans Grist', { skip: !pythonDisponible() && 'Python indisponible' }, () => {
  const def = {
    id: 'p', title: 'Période', tableId: 'Periodes', composeMode: 'ensureSchema',
    sections: [{ label: 'S', fields: [
      { colId: 'Debut', label: 'Début', type: 'Date', widget: 'date' },
      { colId: 'Fin', label: 'Fin', type: 'Date', widget: 'date', options: { apres: 'Debut' } },
      { colId: 'De', label: 'De', type: 'Text', widget: 'heure' },
      { colId: 'A', label: 'À', type: 'Text', widget: 'heure', options: { apres: 'De' } }
    ] }]
  };
  const base = { Recu: 'R', Premier: true, Debut: '2026-10-05', Fin: '2026-10-09', De: '09:00', A: '10:30' };
  const m = motifsPython(Externe.formuleMotifs(def, 'Periodes').formule, [
    base,
    Object.assign({}, base, { Fin: '2026-10-01' }),
    Object.assign({}, base, { Fin: '' }),
    Object.assign({}, base, { A: '08:00' }),
    Object.assign({}, base, { De: 'midi' })
  ]);

  it('une période en règle n’a aucun motif', () => assert.equal(m[0], ''));
  it('une fin avant son début est dite', () => assert.match(m[1], /Fin : avant « Debut »/));
  it('une fin vide ne contredit rien', () => assert.equal(m[2], ''));
  it('une heure de fin avant son début est dite', () => assert.match(m[3], /À : avant « De »/));
  it('une heure illisible est dite, sans que la question le demande', () => assert.match(m[4], /De : ce n’est pas une heure/));
});
