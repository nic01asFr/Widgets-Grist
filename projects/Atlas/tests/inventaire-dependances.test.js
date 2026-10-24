/**
 * L'inventaire des dépendances (docs/INVENTAIRE-DEPENDANCES.md) est exact :
 *  - chaque bibliothèque et chaque police du manifeste d'embarquement y figure, avec sa version et sa licence ;
 *  - chaque hôte externe cité dans le code publié y figure, ou est un identifiant sans réseau (exemples de documentation, espaces de noms).
 * node --test projects/Atlas/tests/inventaire-dependances.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const atlas = path.join(ici, '..');
const publie = path.join(ici, '..', '..', '..', 'published', 'atlas');
const doc = fs.readFileSync(path.join(atlas, 'docs', 'INVENTAIRE-DEPENDANCES.md'), 'utf8');
const manifeste = JSON.parse(fs.readFileSync(path.join(atlas, 'vendor-externe.json'), 'utf8'));

/** Hôtes qui ne sont pas des services : exemples de documentation, espaces de noms, identifiants de schéma. */
const SANS_RESEAU = [/\.example$/, /^localhost$/, /^www\.opengis\.net$/, /^www\.topografix\.com$/, /^json-schema\.org$/, /^x\.org$/, /^www\.w3\.org$/];   // www.w3.org : l'espace de noms XML du SVG (toast.js), un identifiant, jamais une adresse jointe

test('chaque bibliothèque embarquée figure dans l\'inventaire avec sa version et sa licence', () => {
  assert.ok(manifeste.bibliotheques.length >= 6);
  for (const b of manifeste.bibliotheques) {
    const ligne = doc.split('\n').find((l) => l.startsWith('| ' + b.id + ' |'));
    assert.ok(ligne, `bibliothèque absente de l'inventaire : ${b.id}`);
    assert.ok(ligne.includes(b.version), `${b.id} : version ${b.version} absente de la ligne`);
    assert.ok(ligne.includes(b.licence), `${b.id} : licence ${b.licence} absente de la ligne`);
  }
});

test('les polices embarquées figurent dans l\'inventaire', () => {
  const familles = (manifeste.polices.licences || []).map((l) => l.famille);
  assert.ok(familles.length >= 2);
  for (const f of familles) assert.ok(doc.includes(f), `police absente de l'inventaire : ${f}`);
  assert.ok(doc.includes('JetBrains Mono'));
});

function fichiersJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'vendor' ? [] : fichiersJs(p);
    return /\.(js|html)$/.test(e.name) ? [p] : [];
  });
}

test('chaque hôte externe cité dans le code publié est dans l\'inventaire ou n\'est pas un service', () => {
  const hotes = new Set();
  for (const f of [path.join(publie, 'index.html'), path.join(publie, 'app.js'), ...fichiersJs(path.join(publie, 'lib'))]) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)) hotes.add(m[1].replace(/\.$/, ''));
  }
  assert.ok(hotes.size > 5, 'le balayage doit trouver des hôtes');
  const inconnus = [...hotes].filter((h) => !SANS_RESEAU.some((re) => re.test(h)) && !doc.includes(h));
  assert.deepEqual(inconnus, [], 'hôtes externes absents de docs/INVENTAIRE-DEPENDANCES.md : ' + inconnus.join(', '));
});

test('le verrou d\'empreintes couvre les fichiers embarqués listés par le manifeste', () => {
  const verrou = JSON.parse(fs.readFileSync(path.join(publie, 'vendor', 'verrou-externe.json'), 'utf8'));
  const attendus = manifeste.bibliotheques.flatMap((b) => b.fichiers.map((f) => f.vers));
  for (const v of attendus) assert.ok(verrou.fichiers[v], `fichier sans empreinte dans le verrou : ${v}`);
});
