/**
 * Dans un document Grist, le thème (celui du document, sinon celui de l'instance) se lit et s'applique AVANT la scène et les couches :
 * avant, `chargerThemeDocument()` venait après les couches, l'histoire et les formulaires, et l'interface comme les couches se dessinaient
 * aux couleurs d'origine d'Atlas avant de changer. La lecture part juste après `grist.ready()`, en parallèle des droits et du jeton, et
 * s'attend avant le premier chargement de données. Ce test garde l'ORDRE ; le rendu se vérifie dans un vrai Grist.
 * node --test projects/Atlas/tests/demarrage-theme-avant-donnees.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(ICI, '..', 'app_v7.js'), 'utf8').replace(/\r\n/g, '\n');

function corps(nom) {
  const debut = app.indexOf(`async function ${nom}(`);
  assert.ok(debut >= 0, `${nom} introuvable`);
  const fin = app.indexOf('\n}\n', debut);
  return app.slice(debut, fin);
}

const init = corps('initGrist');
const pos = (motif) => { const i = init.indexOf(motif); assert.ok(i >= 0, `absent d'initGrist : ${motif}`); return i; };

test('le thème est lancé juste après grist.ready, avant les droits et le jeton', () => {
  assert.ok(pos('grist.ready(') < pos('chargerThemeDocument()'));
  assert.ok(pos('chargerThemeDocument()') < pos('getAccessToken'));
  assert.ok(pos('chargerThemeDocument()') < pos('sonderEcritureDoc'));
});

test('il est attendu avant le premier chargement de données (scène, couches)', () => {
  const attente = pos('await themePret');
  assert.ok(attente < pos('loadFromSceneManifest()'));
  assert.ok(attente < pos('initGristTables()'));
  assert.ok(attente < pos('loadLayersFromGrist()'));
});

test('il n\'est plus relu après les formulaires : un seul appel au démarrage', () => {
  assert.equal(init.split('chargerThemeDocument()').length - 1, 1);
  assert.ok(!/await chargerFormulaires\(\);\s*await chargerThemeDocument\(\)/.test(init));
});

test('une lecture de thème qui échoue ne bloque ni ne fait échouer le démarrage', () => {
  assert.match(init, /const themePret = chargerThemeDocument\(\)\.catch\(/);
});

test('le changement de préférence de contraste relit toujours le thème (appel hors démarrage conservé)', () => {
  assert.match(app, /addEventListener\('change', \(\) => \{ void chargerThemeDocument\(\); \}\)/);
});
