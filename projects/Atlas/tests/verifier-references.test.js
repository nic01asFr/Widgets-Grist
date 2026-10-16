/**
 * L'analyseur de références (`tools/verifier-references.mjs`) : il doit voir une vraie disparition, et ne pas en inventer.
 * Faux positifs corrigés le 15/10/2026 : texte français dans un gabarit imbriqué (« 3 type(s) »), `/*` d'une expression régulière
 * (`/\/*$/`) pris pour un commentaire, paramètres déstructurés, valeurs par défaut de paramètre, global `performance`.
 * node --test projects/Atlas/tests/verifier-references.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUTIL = join(dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'verifier-references.mjs');

function verifier(source) {
  const dossier = mkdtempSync(join(tmpdir(), 'refs-'));
  try {
    const fichier = join(dossier, 'essai.js');
    writeFileSync(fichier, source);
    const r = spawnSync(process.execPath, [OUTIL, fichier], { encoding: 'utf8' });
    return { code: r.status, sortie: (r.stdout || '') + (r.stderr || '') };
  } finally { rmSync(dossier, { recursive: true, force: true }); }
}

test('application réelle : tout appel a sa définition', () => {
  const r = spawnSync(process.execPath, [OUTIL], { encoding: 'utf8' });
  assert.equal(r.status, 0, (r.stdout || '') + (r.stderr || ''));
});

test('une fonction appelée mais jamais définie est signalée', () => {
  const r = verifier('function a() { return b(); }\na();\n');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /appelée mais jamais définie\s+b\(\)/);
});

test('une lecture de propriété sur un nom jamais déclaré est signalée', () => {
  const r = verifier('function a() { return inconnu.valeur; }\na();\n');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /lue mais jamais définie\s+inconnu/);
});

test('pas de faux positif : texte français dans un gabarit imbriqué', () => {
  const r = verifier('const n = 3;\nconst h = `<p>${n ? `${n} type(s) sur ${n} reconnu(s)` : \'\'}</p>`;\nh;\n');
  assert.equal(r.code, 0, r.sortie);
});

test('pas de faux positif : une expression régulière qui contient /* ne commence pas un commentaire', () => {
  const r = verifier('async function charger(url) { return String(url).replace(/\\/*$/, \'/\'); }\ncharger("a");\n');
  assert.equal(r.code, 0, r.sortie);
  const r2 = verifier('function f() { return /\\/*$/.test("x"); }\n/* un vrai commentaire avec g() */\nf();\n');
  assert.equal(r2.code, 0, r2.sortie);
});

test('pas de faux positif : paramètres déstructurés et valeurs par défaut', () => {
  const r = verifier('const p = Promise.all([1, 2]).then(([td, ad]) => td + ad.x);\nfunction g(s, opts = {}) { return opts.a; }\ng(1); p;\n');
  assert.equal(r.code, 0, r.sortie);
});

test('pas de faux positif : globaux du navigateur', () => {
  const r = verifier('const t = performance.now();\nt;\n');
  assert.equal(r.code, 0, r.sortie);
});

test('un appel inline A.nom() qui n\'existe pas sur A est signalé', () => {
  const r = verifier('const A = {\n  ouvrir() {},\n};\nconst h = `<button onclick="A.fermer()">x</button>`;\nh; A;\n};\n'.replace('};\n};', '};'));
  assert.equal(r.code, 1);
  assert.match(r.sortie, /A\.fermer\(\) n'existe pas/);
});
