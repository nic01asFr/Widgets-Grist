// Le profil « carte seule » du paquet web d'Atlas : ce qu'il contient, ce qu'il écarte, la politique de sécurité de contenu et la liste de précache qu'il génère.
// node --test scripts/paquet-atlas-bi.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const bi = require('./paquet-atlas-bi.js');
const { fichiersDuPaquet, construireManifeste, ecrire, ecrireTous, texteNotes, PROFILS, EXTRAS, EXTRAS_BI } = require('./paquet-atlas.js');

const RACINE = path.join(__dirname, '..');
const SOURCE = path.join(RACINE, 'published', 'atlas');
const sha256 = (o) => crypto.createHash('sha256').update(o).digest('hex');

/** Une petite source de paquet, dans un dossier temporaire : le test ne dépend pas de l'état de `published/`. */
function sourceFactice(fichiers) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'paquet-bi-'));
  for (const [f, texte] of Object.entries(fichiers)) { fs.mkdirSync(path.dirname(path.join(dossier, f)), { recursive: true }); fs.writeFileSync(path.join(dossier, f), texte); }
  return dossier;
}

test('le profil carte seule porte la page maigre, l\'élément de l\'hôte, MapLibre, les contours de repli, le client et les licences, sans l\'application ni les modèles 3D', () => {
  const f = fichiersDuPaquet(SOURCE, RACINE, 'bi');
  for (const attendu of ['bi.html', 'lib/bi/entree.js', 'lib/bi/bi-runtime.js', 'lib/bi/atlas-bi-element.js', 'lib/bi/client-hote.js', 'lib/bi/ui/zone.js', 'lib/bi/donnees/departements-leger.json',
    'vendor/maplibre-gl/maplibre-gl.js', 'vendor/maplibre-gl/maplibre-gl.css', 'vendor/LICENCES.txt', 'package.json', 'LICENSE', 'controle-copie.mjs']) assert.ok(f.includes(attendu), 'attendu : ' + attendu);
  for (const exclu of ['index.html', 'app.js', 'lib/hote-ui.js']) assert.ok(!f.includes(exclu), 'à écarter : ' + exclu);
  assert.ok(!f.some((x) => /^(models|objets|demos)\//.test(x) || /^vendor\/(three|terra-draw|suncalc|geotiff|grist_forms|polices)/.test(x)), 'ni modèles, ni démonstrations, ni dépendances de l\'application');
  assert.deepEqual(f, [...f].sort(), 'liste triée : le manifeste est reproductible');
  const octets = f.reduce((n, x) => n + (EXTRAS_BI[x] || EXTRAS[x] ? fs.statSync(path.join(RACINE, EXTRAS_BI[x] || EXTRAS[x])).size : fs.statSync(path.join(SOURCE, x)).size), 0);
  assert.ok(octets < 3 * 1048576, 'la carte seule tient en moins de 3 Mo : ' + (octets / 1048576).toFixed(2));
});

test('la fermeture est complète : toute référence relative d\'un fichier du profil qui existe dans le paquet complet est dans le profil', () => {
  const profil = new Set(fichiersDuPaquet(SOURCE, RACINE, 'bi'));
  const manquants = [];
  for (const f of profil) {
    if (!/\.(js|html)$/.test(f) || f === 'LICENSE') continue;
    const texte = fs.readFileSync(path.join(SOURCE, f), 'utf8');
    for (const motif of [/(?:src|href)="(\.{1,2}\/[^"#]+)"/g, /(?:from\s*|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g]) {
      for (const m of texte.matchAll(motif)) {
        const cible = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1].split('?')[0]));
        if (!cible.startsWith('..') && fs.existsSync(path.join(SOURCE, cible)) && fs.statSync(path.join(SOURCE, cible)).isFile() && !profil.has(cible)) manquants.push(f + ' -> ' + cible);
      }
    }
  }
  assert.deepEqual(manquants, []);
});

test('une page qui réclame un fichier absent est un paquet cassé : le calcul le dit au lieu de l\'omettre', () => {
  const source = sourceFactice({ 'bi.html': '<script src="./lib/absent.js"></script><link href="./vendor/maplibre-gl/maplibre-gl.css" rel="stylesheet" />', 'vendor/maplibre-gl/maplibre-gl.css': '', 'lib/bi/atlas-bi-element.js': '' });
  try { assert.throws(() => bi.fichiersProfilBi(source), /absents du paquet.*bi\.html -> lib\/absent\.js/); } finally { fs.rmSync(source, { recursive: true, force: true }); }
});

test('un script module en ligne dans la page est lu comme un fichier : ses imports entrent dans la fermeture', () => {
  const source = sourceFactice({ 'bi.html': '<script type="module">import { a } from \'./lib/a.js?v=1\';</script>', 'lib/a.js': 'import { b } from \'./b.js\';\nexport const a = 1;', 'lib/b.js': 'export const b = 2;', 'lib/bi/atlas-bi-element.js': '', 'lib/inutile.js': '' });
  try {
    const { fichiers } = bi.fermeture(source);
    assert.deepEqual(fichiers.filter((x) => x.startsWith('lib/') && !x.startsWith('lib/bi/')), ['lib/a.js', 'lib/b.js']);
  } finally { fs.rmSync(source, { recursive: true, force: true }); }
});

test('une référence à un fichier absent dans le CODE (exemple en commentaire) est ignorée, elle ne casse pas le paquet', () => {
  const source = sourceFactice({ 'bi.html': '', 'lib/bi/atlas-bi-element.js': '// exemple : import { x } from \'./inexistant.js\'\nexport const y = 1;' });
  try { assert.doesNotThrow(() => bi.fichiersProfilBi(source)); } finally { fs.rmSync(source, { recursive: true, force: true }); }
});

test('politique de sécurité de contenu : une page sans bloc en ligne tient sous script-src \'self\', sans empreinte et sans unsafe-inline', () => {
  const p = bi.politiqueCsp('<html><script src="./a.js"></script><link rel="stylesheet" href="./a.css"></html>');
  assert.match(p, /(?:^|; )script-src 'self'(?:;|$)/); assert.match(p, /(?:^|; )style-src 'self'(?:;|$)/);
  assert.ok(!/unsafe-inline|unsafe-eval|sha256-|\*/.test(p), p);
  for (const d of ["default-src 'none'", 'img-src \'self\' data: blob: https://tiles.openfreemap.org', "worker-src blob: 'self'", "frame-ancestors 'self'", "object-src 'none'", "base-uri 'self'"]) assert.ok(p.includes(d), d);
});

test('politique de sécurité de contenu : un bloc en ligne entre par son empreinte exacte (script et style), jamais par unsafe-inline', () => {
  const script = 'window.x = 1;', style = 'body { margin: 0; }';
  const html = `<script>${script}</script><script src="./a.js"></script><style>${style}</style>`;
  const empreinte = (t) => "'sha256-" + crypto.createHash('sha256').update(t).digest('base64') + "'";
  const p = bi.politiqueCsp(html);
  assert.ok(p.includes("script-src 'self' " + empreinte(script)), p); assert.ok(p.includes("style-src 'self' " + empreinte(style)), p);
  assert.ok(!p.includes('unsafe-inline'));
  assert.deepEqual(bi.blocsEnLigne(html).scripts, [script], 'un script avec src n\'est pas un bloc en ligne');
});

test('politique de sécurité de contenu : sans feuilles construites, les styles portent unsafe-inline et le texte le dit ; avec, non', () => {
  assert.match(bi.politiqueCsp('', { feuillesConstruites: false }), /style-src 'self' 'unsafe-inline'/);
  assert.ok(!bi.politiqueCsp('', { feuillesConstruites: true }).includes('unsafe-inline'));
  assert.match(bi.texteCsp({ version: '9.9.9', html: '', feuillesConstruites: false }), /crée des <style> en ligne/);
  assert.match(bi.texteCsp({ version: '9.9.9', html: '', feuillesConstruites: true }), /construites \(adoptedStyleSheets\)/);
});

test('politique de sécurité de contenu : sans feuilles construites, unsafe-inline tient SEUL lieu d’empreinte pour les styles (une empreinte le ferait ignorer par le navigateur)', () => {
  const style = 'body { margin: 0; }', html = `<style>${style}</style><script src="./a.js"></script>`;
  const sans = bi.politiqueCsp(html, { feuillesConstruites: false }), avec = bi.politiqueCsp(html, { feuillesConstruites: true });
  const styleSans = sans.split('; ').find((d) => d.startsWith('style-src')), styleAvec = avec.split('; ').find((d) => d.startsWith('style-src'));
  assert.equal(styleSans, "style-src 'self' 'unsafe-inline'"); assert.ok(!/sha256-/.test(styleSans));
  assert.ok(/sha256-/.test(styleAvec) && !styleAvec.includes('unsafe-inline'));
  const texte = bi.texteCsp({ version: '9.9.9', html, feuillesConstruites: false });
  assert.ok(!/bi\.html porte 1 style/.test(texte), 'le texte ne promet pas une empreinte que la politique n’a pas');
});

test('CSP.txt : un en-tête HTTP prêt à copier, avec les notes qui servent à l\'adapter (hôte, fonds IGN, polices du fond « aucun »)', () => {
  const t = bi.texteCsp({ version: '9.9.9', html: '', feuillesConstruites: true });
  assert.match(t, /^# Politique de sécurité de contenu recommandée pour bi\.html \(Atlas 9\.9\.9/);
  assert.match(t, /\nContent-Security-Policy: default-src 'none'; .*frame-ancestors 'self'.*\n$/);
  for (const note of ['EN-TÊTE HTTP', 'data.geopf.fr', 'lib/bi/polices', "n'a aucun script en ligne"]) assert.ok(t.includes(note), note);
  assert.ok(!t.includes('demotiles.maplibre.org'), 'plus de serveur de démonstration à autoriser');
});

test('PRECACHE.json : les fichiers de la page maigre, sans l\'élément de l\'hôte ni le client, et la consigne d\'ignorer la query', () => {
  const l = bi.listePrecache({ version: '9.9.9', contrat: '0.7', source: SOURCE });
  assert.equal(l.format, 'atlas-precache/1'); assert.equal(l.page, 'bi.html'); assert.equal(l.ignorerQuery, true); assert.match(l.note, /ignoreSearch/);
  for (const attendu of ['bi.html', 'lib/bi/entree.js', 'vendor/maplibre-gl/maplibre-gl.js', 'vendor/maplibre-gl/maplibre-gl.css', 'lib/bi/donnees/pays-leger.json']) assert.ok(l.fichiers.includes(attendu), attendu);
  for (const exclu of ['lib/bi/client-hote.js', 'LICENSE', 'package.json', 'index.html', 'app.js', 'lib/bi/atlas-bi-element.js']) assert.ok(!l.fichiers.includes(exclu), exclu);
  assert.deepEqual(l.fichiers, [...l.fichiers].sort());
});

test('le manifeste du profil carte seule se nomme, liste les fichiers générés avec leur empreinte, et reste reproductible', () => {
  const m = construireManifeste({ profil: 'bi', commit: 'abc1234', genere: '2026-11-02T00:00:00.000Z' });
  assert.equal(m.nom, 'atlas-web-bi'); assert.equal(m.profil, 'bi'); assert.match(m.note, /carte seule/);
  for (const f of ['LICENSE', 'CSP.txt', 'PRECACHE.json', 'bi.html']) assert.ok(m.fichiers.some((x) => x.chemin === f), f);
  assert.deepEqual(m.fichiers.map((x) => x.chemin), m.fichiers.map((x) => x.chemin).sort(), 'fichiers générés compris, triés');
  assert.equal(JSON.stringify(construireManifeste({ profil: 'bi', commit: 'abc1234', genere: '2026-11-02T00:00:00.000Z' })), JSON.stringify(m));
  assert.equal(construireManifeste({ commit: 'abc1234', genere: '2026-11-02T00:00:00.000Z' }).profil, 'complet');
});

test('PAQUET.json dit les bibliothèques tierces emportées, avec leur version et l’empreinte SHA-384 de chaque fichier : un hôte qui a sa propre copie de MapLibre voit s’il peut la servir à la place', () => {
  const m = construireManifeste({ profil: 'bi', commit: 'abc1234', genere: '2026-11-02T00:00:00.000Z' });
  assert.deepEqual(Object.keys(m.dependances), ['maplibre-gl'], 'la carte seule n\'emporte que MapLibre');
  const ml = m.dependances['maplibre-gl'];
  assert.match(ml.version, /^\d+\.\d+\.\d+$/);
  const verrou = JSON.parse(fs.readFileSync(path.join(SOURCE, 'vendor', 'verrou-externe.json'), 'utf8')).fichiers;
  assert.ok(verrou['maplibre-gl/maplibre-gl.js'].origine.includes('maplibre-gl@' + ml.version));
  for (const f of ml.fichiers) {
    const octets = fs.readFileSync(path.join(SOURCE, f.chemin));
    assert.equal(f.integrite, 'sha384-' + crypto.createHash('sha384').update(octets).digest('base64'), f.chemin);
    assert.equal(f.octets, octets.length, f.chemin);
  }
  assert.deepEqual(ml.fichiers.map((f) => f.chemin), ['vendor/maplibre-gl/maplibre-gl.css', 'vendor/maplibre-gl/maplibre-gl.js']);
  const complet = construireManifeste({ commit: 'abc1234', genere: '2026-11-02T00:00:00.000Z' });
  assert.ok(Object.keys(complet.dependances).length > 3 && complet.dependances['maplibre-gl'] && complet.dependances.three, 'le paquet complet porte aussi three.js et les autres');
  assert.deepEqual(complet.dependances['maplibre-gl'], ml, 'même MapLibre dans les deux profils');
});

test('les textes des feuilles d’interface extraits par analyse sont EXACTEMENT les valeurs des constantes FEUILLE des modules (donc l’empreinte que le navigateur calcule)', async () => {
  const { pathToFileURL } = require('url');
  const racine = path.join(RACINE, 'projects', 'Atlas');
  const valeurs = [];
  for (const f of bi.FEUILLES) valeurs.push((await import(pathToFileURL(path.join(racine, f)).href)).FEUILLE);
  assert.deepEqual(bi.textesDesFeuilles(racine), valeurs);
  assert.equal(valeurs.length, 4);
});

test('CSP.txt : les empreintes des feuilles d’interface entrent dans style-src pour les navigateurs sans feuilles construites, sans unsafe-inline', () => {
  const feuilles = ['.a { color: red; }', '.b { top: 0; }'];
  const empreinte = (t) => "'sha256-" + crypto.createHash('sha256').update(t, 'utf8').digest('base64') + "'";
  const p = bi.politiqueCsp('<html></html>', { feuillesConstruites: true, feuilles });
  const style = p.split('; ').find((d) => d.startsWith('style-src'));
  assert.equal(style, "style-src 'self' " + feuilles.map(empreinte).join(' '));
  assert.ok(!p.includes('unsafe-inline'));
  assert.equal(bi.politiqueCsp('<html></html>', { feuillesConstruites: true }).split('; ').find((d) => d.startsWith('style-src')), "style-src 'self'", 'sans feuilles données : inchangé');
  assert.equal(bi.politiqueCsp('', { feuillesConstruites: true, feuilles: [feuilles[0], feuilles[0]] }).split("'sha256-").length, 2, 'une empreinte identique n’est écrite qu’une fois');
  assert.match(bi.texteCsp({ version: '9.9.9', html: '', feuillesConstruites: true, feuilles }), /Safari avant 16\.4, Firefox avant 101\), style-src porte aussi les empreintes des 2 feuilles/);
  assert.ok(!/Safari avant 16/.test(bi.texteCsp({ version: '9.9.9', html: '', feuillesConstruites: true })), 'pas de phrase sans empreintes');
});

test('feuilles d’interface : un module absent (version ancienne) est ignoré ; une constante absente ou interpolée est refusée, jamais devinée', () => {
  const source = sourceFactice({ 'lib/bi/ui/zone.js': 'export const FEUILLE = `.z { top: 0; }`;', 'lib/bi/ui/legende.js': 'export const FEUILLE = `.l {\n  left: 0;\n}`;' });
  try { assert.deepEqual(bi.textesDesFeuilles(source), ['.z { top: 0; }', '.l {\n  left: 0;\n}'], 'temps et bulle absents : ignorés'); } finally { fs.rmSync(source, { recursive: true, force: true }); }
  const sans = sourceFactice({ 'lib/bi/ui/zone.js': 'const AUTRE = 1;' });
  try { assert.throws(() => bi.textesDesFeuilles(sans), /constante FEUILLE introuvable/); } finally { fs.rmSync(sans, { recursive: true, force: true }); }
  const interpole = sourceFactice({ 'lib/bi/ui/zone.js': 'const X = "1px"; export const FEUILLE = `.z { top: ${X}; }`;' });
  try { assert.throws(() => bi.textesDesFeuilles(interpole), /interpolée/); } finally { fs.rmSync(interpole, { recursive: true, force: true }); }
});

test('fichiersGeneres : sur une version qui construit ses feuilles, CSP.txt porte leurs empreintes ; sur une version ancienne, unsafe-inline seul', () => {
  const base = { 'package.json': '{"version":"9.9.9"}', 'bi.html': '<html><script src="./lib/bi/demarrer.js"></script></html>', 'lib/bi/demarrer.js': '', 'lib/bi/atlas-bi-element.js': '' };
  const neuve = sourceFactice({ ...base, 'lib/bi/ui/feuille.js': '', 'lib/bi/ui/zone.js': 'export const FEUILLE = `.z { top: 0; }`;' });
  const ancienne = sourceFactice(base);
  try {
    const { fichiersGeneres } = require('./paquet-atlas.js');
    const csp = (source) => fichiersGeneres({ source, racine: RACINE, profil: 'bi' })['CSP.txt'];
    assert.match(csp(neuve), /style-src 'self' 'sha256-[A-Za-z0-9+/]+=*'; /); assert.ok(!/unsafe-inline/.test(csp(neuve).split('\n').find((l) => l.startsWith('Content-Security-Policy'))));
    assert.match(csp(ancienne), /style-src 'self' 'unsafe-inline'; /);
  } finally { fs.rmSync(neuve, { recursive: true, force: true }); fs.rmSync(ancienne, { recursive: true, force: true }); }
});

test('un profil inconnu est refusé', () => {
  assert.throws(() => fichiersDuPaquet(SOURCE, RACINE, 'mini'), /profil inconnu/);
  assert.throws(() => construireManifeste({ profil: 'mini' }), /profil inconnu/);
  assert.deepEqual(PROFILS, ['complet', 'bi']);
});

test('ecrire (carte seule) : le dossier atlas-web-bi-<version>, les fichiers générés écrits tels que le manifeste les a comptés, et des notes', () => {
  const sortie = fs.mkdtempSync(path.join(os.tmpdir(), 'paquet-bi-ecrit-'));
  try {
    const { dossier, manifeste } = ecrire({ sortie, commit: 'abc1234', profil: 'bi' });
    assert.equal(path.basename(dossier), 'atlas-web-bi-' + manifeste.version);
    for (const f of manifeste.fichiers) assert.equal(sha256(fs.readFileSync(path.join(dossier, f.chemin))), f.sha256, f.chemin);
    assert.ok(fs.existsSync(path.join(dossier, 'PAQUET.json')) && !fs.existsSync(path.join(dossier, 'app.js')) && !fs.existsSync(path.join(dossier, 'models')));
    assert.match(fs.readFileSync(path.join(dossier, 'CSP.txt'), 'utf8'), /\nContent-Security-Policy: /);
    assert.ok(JSON.parse(fs.readFileSync(path.join(dossier, 'PRECACHE.json'), 'utf8')).fichiers.includes('bi.html'));
    assert.match(fs.readFileSync(path.join(sortie, 'NOTES.md'), 'utf8'), /atlas-web-bi-/);
  } finally { fs.rmSync(sortie, { recursive: true, force: true }); }
});

test('ecrireTous : les deux profils côte à côte et des notes communes qui nomment les deux archives, la licence et la réserve sur les polices', () => {
  const sortie = fs.mkdtempSync(path.join(os.tmpdir(), 'paquet-tous-'));
  try {
    const ecrits = ecrireTous({ sortie, commit: 'abc1234' });
    assert.deepEqual(ecrits.map((x) => path.basename(x.dossier)).sort(), ['atlas-web-' + ecrits[0].manifeste.version, 'atlas-web-bi-' + ecrits[0].manifeste.version].sort());
    const v = ecrits[0].manifeste.version, notes = fs.readFileSync(path.join(sortie, 'NOTES.md'), 'utf8');
    for (const attendu of ['atlas-web-' + v + '.zip', 'atlas-web-bi-' + v + '.zip', 'LICENSE', 'lib/bi/polices', 'CSP.txt']) assert.ok(notes.includes(attendu), attendu);
    assert.ok(!notes.includes('demotiles.maplibre.org'));
  } finally { fs.rmSync(sortie, { recursive: true, force: true }); }
});

test('texteNotes : un seul paquet, les notes restent celles d\'un paquet', () => {
  const m = construireManifeste({ commit: 'abc1234', genere: '2026-11-02T00:00:00.000Z' });
  const t = texteNotes([m], null);
  assert.match(t, /^Paquet web d'Atlas /); assert.ok(!t.includes('CSP.txt'), 'pas de CSP.txt pour le profil complet');
});
