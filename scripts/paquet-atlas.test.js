// Le paquet web figé d'Atlas : ce qu'il contient, ce qu'il écarte, ses empreintes, ses notes de version.
// node --test scripts/paquet-atlas.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { fichiersDuPaquet, construireManifeste, notesDeVersion, versionContrat, ecrire } = require('./paquet-atlas.js');

const RACINE = path.join(__dirname, '..');
const SOURCE = path.join(RACINE, 'published', 'atlas');

test('le paquet porte la page maigre, l\'application, le client et les dépendances, sans la vitrine ni les démonstrations', () => {
  const f = fichiersDuPaquet();
  for (const attendu of ['bi.html', 'index.html', 'app.js', 'package.json', 'lib/bi/client-hote.js', 'lib/bi/bi-runtime.js', 'vendor/maplibre-gl/maplibre-gl.js']) assert.ok(f.includes(attendu), attendu);
  assert.ok(f.some((x) => x.startsWith('models/')) && f.some((x) => x.startsWith('objets/')));
  for (const exclu of f.filter((x) => /^demos\/|^vitrine\.json$|\.(jpg|png)$/i.test(x))) assert.fail('à écarter : ' + exclu);
  assert.ok(!f.some((x) => /^essai/.test(x)), 'une page d\'essai ne part jamais');
  assert.deepEqual(f, [...f].sort(), 'liste triée : le manifeste est reproductible');
});

test('le manifeste dit la version, le contrat, le client et son empreinte, et l\'empreinte de chaque fichier', () => {
  const m = construireManifeste({ commit: 'abc1234', genere: '2026-10-25T00:00:00.000Z' });
  const pkg = JSON.parse(fs.readFileSync(path.join(SOURCE, 'package.json'), 'utf8'));
  assert.equal(m.nom, 'atlas-web'); assert.equal(m.version, pkg.version); assert.equal(m.contrat, '0.3'); assert.equal(m.commit, 'abc1234');
  assert.equal(m.client.fichier, 'lib/bi/client-hote.js'); assert.ok(Number.isInteger(m.client.versionClient));
  const attendu = 'sha384-' + crypto.createHash('sha384').update(fs.readFileSync(path.join(SOURCE, 'lib/bi/client-hote.js'))).digest('base64');
  assert.equal(m.client.empreinte, attendu);
  assert.ok(m.fichiers.length > 100);
  const f = m.fichiers.find((x) => x.chemin === 'bi.html');
  assert.equal(f.sha256, crypto.createHash('sha256').update(fs.readFileSync(path.join(SOURCE, 'bi.html'))).digest('hex')); assert.equal(f.octets, fs.statSync(path.join(SOURCE, 'bi.html')).size);
  assert.equal(JSON.stringify(construireManifeste({ commit: 'abc1234', genere: '2026-10-25T00:00:00.000Z' })), JSON.stringify(m), 'reproductible à date et commit donnés');
});

test('l\'empreinte du client est celle que le guide d\'exploitation donne aux hôtes', () => {
  const doc = fs.readFileSync(path.join(RACINE, 'projects', 'Atlas', 'CHANGELOG.md'), 'utf8');
  const donnee = /Empreinte du client \| `(sha384-[^`]+)`/.exec(doc);
  assert.ok(donnee, 'empreinte documentée');
  assert.equal(construireManifeste().client.empreinte, donnee[1]);
});

test('les notes de version sont celles du journal ; une version inconnue n\'en a pas', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(SOURCE, 'package.json'), 'utf8'));
  const n = notesDeVersion(pkg.version);
  assert.ok(n && n.startsWith('## ' + pkg.version + ' —') && !/^## \d+\.\d+\.\d+ —/m.test(n.slice(5)), 'une seule section');
  assert.equal(notesDeVersion('0.0.1'), null); assert.equal(versionContrat(), '0.3');
});

test('ecrire : le dossier du paquet (avec PAQUET.json) et les notes de la release', () => {
  const sortie = fs.mkdtempSync(path.join(os.tmpdir(), 'paquet-atlas-'));
  try {
    const { dossier, manifeste } = ecrire({ sortie, commit: 'abc1234' });
    assert.equal(path.basename(dossier), 'atlas-web-' + manifeste.version);
    assert.ok(fs.existsSync(path.join(dossier, 'bi.html'))); assert.ok(!fs.existsSync(path.join(dossier, 'demos')));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dossier, 'PAQUET.json'), 'utf8')).fichiers.length, manifeste.fichiers.length);
    for (const f of manifeste.fichiers.slice(0, 20)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dossier, f.chemin))).digest('hex'), f.sha256);
    const notes = fs.readFileSync(path.join(sortie, 'NOTES.md'), 'utf8');
    assert.match(notes, new RegExp('Paquet web d\'Atlas ' + manifeste.version.replace(/\./g, '\\.'))); assert.match(notes, /sha384-/); assert.match(notes, /Ce que contient cette version/);
  } finally { fs.rmSync(sortie, { recursive: true, force: true }); }
});
