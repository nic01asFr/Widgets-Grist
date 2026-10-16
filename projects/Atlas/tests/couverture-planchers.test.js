/**
 * L'outil de plancher de couverture (`tools/couverture.mjs`) : il lit un rapport lcov et signale tout recul sous un plancher.
 * node --test projects/Atlas/tests/couverture-planchers.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { lire, verifier, PLANCHERS } from '../tools/couverture.mjs';

const lcov = (...fichiers) => fichiers.map(([f, LF, LH]) => `SF:C:/depot/projects/Atlas/${f}\nLF:${LF}\nLH:${LH}\nend_of_record\n`).join('');

test('lire : les fichiers d\'Atlas, hors tests, avec leurs lignes trouvées et couvertes', () => {
  const r = lire(lcov(['lib/bi/a.js', 100, 95], ['tests/a.test.js', 50, 50], ['lib/charte/b.js', 10, 10]));
  assert.deepEqual(r.map((x) => [x.f.slice(x.f.indexOf('projects/')), x.LF, x.LH]), [['projects/Atlas/lib/bi/a.js', 100, 95], ['projects/Atlas/lib/charte/b.js', 10, 10]]);
});

test('lire : les chemins Windows (antislash) sont normalisés', () => {
  const brut = ['SF:C:', 'depot', 'projects', 'Atlas', 'lib', 'bi', 'a.js'].join(String.fromCharCode(92)) + '\nLF:10\nLH:9\nend_of_record\n';
  const r = lire(brut);
  assert.equal(r.length, 1);
  assert.match(r[0].f, /projects\/Atlas\/lib\/bi\/a\.js$/);
});

test('verifier : tout est tenu quand la couverture est haute', () => {
  const f = lire(lcov(['lib/bi/a.js', 100, 99], ['lib/charte/b.js', 100, 100], ['lib/trafic/c.js', 100, 90], ['lib/x.js', 100, 90]));
  assert.deepEqual(verifier(f), []);
});

test('verifier : un fichier de lib/bi sous 85 % est nommé, même si l\'ensemble reste haut', () => {
  const f = lire(lcov(['lib/bi/gros.js', 1000, 1000], ['lib/bi/petit.js', 100, 70], ['lib/charte/b.js', 100, 100], ['lib/trafic/c.js', 100, 90], ['lib/x.js', 100, 90]));
  const m = verifier(f);
  assert.equal(m.length, 1);
  assert.match(m[0], /lib\/bi \(chaque fichier\).*petit\.js à 70\.0 %, plancher 85 %/);
});

test('verifier : le recul de l\'ensemble de lib/charte est signalé', () => {
  const f = lire(lcov(['lib/bi/a.js', 100, 100], ['lib/charte/b.js', 100, 90], ['lib/trafic/c.js', 100, 90], ['lib/x.js', 100, 90]));
  const m = verifier(f);
  assert.ok(m.some((x) => /lib\/charte \(ensemble\) : 90\.0 %/.test(x)), m.join(' | '));
});

test('verifier : un dossier absent du rapport est un manquement (un test qui ne charge plus rien ne passe pas inaperçu)', () => {
  const m = verifier(lire(lcov(['lib/bi/a.js', 100, 100])));
  assert.ok(m.some((x) => /aucun fichier dans le rapport/.test(x)));
});

test('les planchers ne sont pas négligeables', () => {
  for (const p of PLANCHERS) assert.ok((p.groupe ?? p.fichier) >= 70, p.nom);
});
