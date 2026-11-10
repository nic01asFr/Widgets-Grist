'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { creerGardeExclusive } = require('../lib/q2g-garde.js');

const attente = () => { let ok; const p = new Promise((r) => { ok = r; }); return { p, ok }; };

test('garde : un double appel ne lance la tache qu une fois, le second est refuse', async () => {
  const g = creerGardeExclusive();
  const a = attente();
  let lancees = 0;
  let occupe = 0;
  const r1 = g.executer(async () => { lancees++; await a.p; return 'fini'; }, { surOccupe: () => occupe++ });
  assert.equal(g.actif(), true);
  const r2 = g.executer(async () => { lancees++; }, { surOccupe: () => occupe++ });
  assert.equal(r2, null);
  assert.equal(lancees, 1);
  assert.equal(occupe, 1);
  a.ok();
  assert.equal(await r1, 'fini');
  assert.equal(g.actif(), false);
});

test('garde : relachee apres la fin, un nouvel appel est accepte', async () => {
  const g = creerGardeExclusive();
  await g.executer(async () => 1);
  assert.equal(await g.executer(async () => 2), 2);
});

test('garde : relachee aussi quand la tache leve (rejet ou exception synchrone), surDebut et surFin toujours appeles', async () => {
  const g = creerGardeExclusive();
  const journal = [];
  const rappels = { surDebut: () => journal.push('debut'), surFin: () => journal.push('fin') };
  await assert.rejects(g.executer(async () => { throw new Error('boum'); }, rappels), /boum/);
  assert.equal(g.actif(), false);
  await assert.rejects(g.executer(() => { throw new Error('sync'); }, rappels), /sync/);
  assert.equal(g.actif(), false);
  assert.deepEqual(journal, ['debut', 'fin', 'debut', 'fin']);
  assert.equal(await g.executer(async () => 'ok'), 'ok');
});

test('garde : un rappel qui leve ne bloque pas la garde', async () => {
  const g = creerGardeExclusive();
  await g.executer(async () => 1, { surDebut: () => { throw new Error('x'); }, surFin: () => { throw new Error('y'); } });
  assert.equal(g.actif(), false);
});

test('garde : des appels simultanes (rafale de clics) ne laissent passer que le premier', async () => {
  const g = creerGardeExclusive();
  const a = attente();
  let n = 0;
  const rs = [1, 2, 3, 4, 5].map(() => g.executer(async () => { n++; await a.p; }));
  assert.equal(rs.filter((r) => r !== null).length, 1);
  a.ok();
  await Promise.all(rs.filter(Boolean));
  assert.equal(n, 1);
});

test('index_v2.html : startImport passe par la garde et desactive le bouton', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index_v2.html'), 'utf8');
  assert.ok(html.includes('src="lib/q2g-garde.js'));
  assert.ok(/function startImport\(\)\s*\{[\s\S]*?_gardeImport\.executer\(/.test(html));
  assert.ok(html.includes('async function demarrerImport()'), 'le corps de l import est dans demarrerImport');
  assert.ok(/id="import-btn" onclick="startImport\(\)"/.test(html), 'le bouton appelle toujours startImport');
});
