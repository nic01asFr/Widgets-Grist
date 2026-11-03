/**
 * L'outil de contrôle d'une copie du paquet web (tools/controle-copie.mjs) : il doit accepter un paquet intact et refuser chaque altération, avec le bon verdict.
 * La partie navigateur (--navigateur) se lance à la main ou avec ATLAS_TEST_NAVIGATEUR=1 : elle demande un Chrome ou un Edge installé.
 * node --test projects/Atlas/tests/controle-copie.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { controlerFichiers, controlerNavigateur, creerServeur, blocsEnLigne, politiqueDe, fermeture, sansHotesExternes } from '../tools/controle-copie.mjs';

const require = createRequire(import.meta.url);
const ICI = path.dirname(fileURLToPath(import.meta.url));
const OUTIL = path.join(ICI, '..', 'tools', 'controle-copie.mjs');
const { ecrire } = require('../../../scripts/paquet-atlas.js');
const sha256 = (o) => crypto.createHash('sha256').update(o).digest('hex');

/** Un paquet « carte seule » neuf dans un dossier temporaire. */
function paquet() {
  const sortie = fs.mkdtempSync(path.join(os.tmpdir(), 'controle-copie-'));
  const { dossier } = ecrire({ sortie, profil: 'bi', commit: 'essai' });
  return { dossier, nettoyer: () => fs.rmSync(sortie, { recursive: true, force: true }) };
}
/** Recalcule PAQUET.json après une modification voulue, pour que SEUL le contrôle visé échoue. */
function rescellerManifeste(dossier) {
  const m = JSON.parse(fs.readFileSync(path.join(dossier, 'PAQUET.json'), 'utf8'));
  m.fichiers = m.fichiers.filter((x) => fs.existsSync(path.join(dossier, x.chemin))).map((x) => { const o = fs.readFileSync(path.join(dossier, x.chemin)); return { chemin: x.chemin, octets: o.length, sha256: sha256(o) }; });
  fs.writeFileSync(path.join(dossier, 'PAQUET.json'), JSON.stringify(m, null, 2));
}
const verdict = (r, id) => r.verdicts.find((v) => v.id === id);

test('un paquet intact est conforme : tous les contrôles sur les fichiers réussissent, sans avertissement', () => {
  const { dossier, nettoyer } = paquet();
  try {
    const r = controlerFichiers(dossier);
    assert.deepEqual(r.verdicts.filter((v) => v.niveau !== 'ok'), [], JSON.stringify(r.verdicts.filter((v) => v.niveau !== 'ok')));
    for (const id of ['manifeste', 'empreintes', 'non-listes', 'client', 'licence', 'cdn', 'fermeture', 'csp', 'precache']) assert.ok(verdict(r, id), id);
    assert.equal(r.manifeste.profil, 'bi');
  } finally { nettoyer(); }
});

test('le paquet carte seule emporte l\'outil de contrôle, identique à celui du dépôt', () => {
  const { dossier, nettoyer } = paquet();
  try { assert.equal(fs.readFileSync(path.join(dossier, 'controle-copie.mjs'), 'utf8'), fs.readFileSync(OUTIL, 'utf8')); } finally { nettoyer(); }
});

test('un fichier modifié, ou absent, est refusé par l\'empreinte', () => {
  const { dossier, nettoyer } = paquet();
  try {
    fs.appendFileSync(path.join(dossier, 'lib/bi/pont.js'), '\n// altéré');   // taille différente
    const memeTaille = path.join(dossier, 'lib/bi/voile.js'), texte = fs.readFileSync(memeTaille, 'utf8');
    fs.writeFileSync(memeTaille, texte.replace(/e/, 'E'));                       // même taille, un octet change
    fs.rmSync(path.join(dossier, 'lib/bi/legende.js'));
    const v = verdict(controlerFichiers(dossier), 'empreintes');
    assert.equal(v.niveau, 'echec'); assert.match(v.texte, /3 fichier\(s\)/);
    assert.match(v.texte, /lib\/bi\/pont\.js \(\d+ octets, \d+ attendus\)/); assert.match(v.texte, /lib\/bi\/voile\.js \(empreinte différente\)/); assert.match(v.texte, /lib\/bi\/legende\.js \(absent\)/);
  } finally { nettoyer(); }
});

test('un fichier hors manifeste est un avertissement, pas un échec ; PAQUET.json absent ou illisible est un échec net', () => {
  const { dossier, nettoyer } = paquet();
  try {
    fs.writeFileSync(path.join(dossier, 'config-locale.json'), '{}');
    const r = controlerFichiers(dossier);
    assert.equal(verdict(r, 'non-listes').niveau, 'avertissement'); assert.match(verdict(r, 'non-listes').texte, /config-locale\.json/);
    fs.writeFileSync(path.join(dossier, 'PAQUET.json'), '{ pas du json');
    assert.match(verdict(controlerFichiers(dossier), 'manifeste').texte, /illisible/);
    fs.rmSync(path.join(dossier, 'PAQUET.json'));
    const sans = controlerFichiers(dossier);
    assert.equal(sans.verdicts.length, 1); assert.equal(sans.verdicts[0].niveau, 'echec'); assert.match(sans.verdicts[0].texte, /n'est pas un paquet web d'Atlas/);
  } finally { nettoyer(); }
});

test('le client des hôtes altéré est refusé par son empreinte SHA-384, même si le manifeste est rescellé', () => {
  const { dossier, nettoyer } = paquet();
  try {
    fs.appendFileSync(path.join(dossier, 'lib/bi/client-hote.js'), '\n// altéré'); rescellerManifeste(dossier);
    const r = controlerFichiers(dossier);
    assert.equal(verdict(r, 'empreintes').niveau, 'ok'); assert.equal(verdict(r, 'client').niveau, 'echec'); assert.match(verdict(r, 'client').texte, /sha384-/);
  } finally { nettoyer(); }
});

test('sans LICENSE : échec (MIT impose l\'avis dans chaque copie)', () => {
  const { dossier, nettoyer } = paquet();
  try { fs.rmSync(path.join(dossier, 'LICENSE')); rescellerManifeste(dossier); const v = verdict(controlerFichiers(dossier), 'licence'); assert.equal(v.niveau, 'echec'); assert.match(v.texte, /MIT/); } finally { nettoyer(); }
});

test('bi.html qui appelle un CDN, ou réclame un fichier absent : échecs distincts', () => {
  const { dossier, nettoyer } = paquet();
  try {
    const f = path.join(dossier, 'bi.html');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('</head>', '<script src="https://unpkg.com/x@1/x.js"></script><script src="./lib/inexistant.js"></script></head>'));
    rescellerManifeste(dossier);
    const r = controlerFichiers(dossier);
    assert.equal(verdict(r, 'cdn').niveau, 'echec'); assert.match(verdict(r, 'cdn').texte, /unpkg\.com/);
    assert.equal(verdict(r, 'fermeture').niveau, 'echec'); assert.match(verdict(r, 'fermeture').texte, /bi\.html -> lib\/inexistant\.js/);
  } finally { nettoyer(); }
});

test('CSP.txt : un script en ligne ajouté à bi.html sans empreinte dans la politique est refusé ; unsafe-eval l\'est aussi', () => {
  const { dossier, nettoyer } = paquet();
  try {
    const f = path.join(dossier, 'bi.html');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('</head>', '<script>window.x = 1;</script></head>')); rescellerManifeste(dossier);
    const v = verdict(controlerFichiers(dossier), 'csp');
    assert.equal(v.niveau, 'echec'); assert.match(v.texte, /script en ligne 'sha256-/);
    const csp = path.join(dossier, 'CSP.txt');
    fs.writeFileSync(csp, fs.readFileSync(csp, 'utf8').replace("script-src 'self'", "script-src 'self' 'unsafe-eval'")); rescellerManifeste(dossier);
    assert.equal(verdict(controlerFichiers(dossier), 'csp').niveau, 'echec');
    fs.rmSync(csp); rescellerManifeste(dossier);
    assert.equal(verdict(controlerFichiers(dossier), 'csp').niveau, 'avertissement', 'sans CSP.txt la politique n\'est pas vérifiée : on le dit');
  } finally { nettoyer(); }
});

test('CSP.txt qui associe une empreinte et unsafe-inline dans une même directive : échec (le navigateur ignorerait unsafe-inline)', () => {
  const { dossier, nettoyer } = paquet();
  try {
    const csp = path.join(dossier, 'CSP.txt');
    fs.writeFileSync(csp, fs.readFileSync(csp, 'utf8').replace(/(Content-Security-Policy:[^\n]*?)style-src 'self'/, "$1style-src 'self' 'sha256-AAAA' 'unsafe-inline'")); rescellerManifeste(dossier);
    const v = verdict(controlerFichiers(dossier), 'csp');
    assert.equal(v.niveau, 'echec'); assert.match(v.texte, /ignore alors 'unsafe-inline'/);
  } finally { nettoyer(); }
});

test('PRECACHE.json qui liste un fichier absent : échec', () => {
  const { dossier, nettoyer } = paquet();
  try {
    const f = path.join(dossier, 'PRECACHE.json'), p = JSON.parse(fs.readFileSync(f, 'utf8')); p.fichiers.push('lib/fantome.js');
    fs.writeFileSync(f, JSON.stringify(p)); rescellerManifeste(dossier);
    const v = verdict(controlerFichiers(dossier), 'precache'); assert.equal(v.niveau, 'echec'); assert.match(v.texte, /lib\/fantome\.js/);
  } finally { nettoyer(); }
});

test('outils purs : blocs en ligne, politique d\'un CSP.txt, fermeture des références', () => {
  assert.deepEqual(blocsEnLigne('<script>a()</script><script src="./b.js"></script><style>x{}</style>'), { scripts: ['a()'], styles: ['x{}'] });
  assert.equal(politiqueDe('# note\nContent-Security-Policy: default-src \'none\'\n'), "default-src 'none'");
  assert.equal(politiqueDe('rien'), null);
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fermeture-'));
  try {
    fs.mkdirSync(path.join(d, 'lib'));
    fs.writeFileSync(path.join(d, 'bi.html'), '<script type="module">import { a } from \'./lib/a.js?v=1\';</script><link href="./absent.css" rel="stylesheet">');
    fs.writeFileSync(path.join(d, 'lib/a.js'), 'import { b } from \'./b.js\'; // exemple : import { z } from \'./fantome.js\'');
    fs.writeFileSync(path.join(d, 'lib/b.js'), '');
    const r = fermeture(d, ['bi.html']);
    assert.deepEqual(r.fichiers, ['bi.html', 'lib/a.js', 'lib/b.js']); assert.deepEqual(r.absents, ['bi.html -> absent.css'], 'un import cité en commentaire dans le code n\'est pas un manque');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('la ligne de commande : code 0 pour une copie conforme, 1 pour une copie altérée, sortie JSON exploitable', () => {
  const { dossier, nettoyer } = paquet();
  try {
    const bon = spawnSync(process.execPath, [OUTIL, dossier, '--json'], { encoding: 'utf8' });
    assert.equal(bon.status, 0, bon.stderr); const j = JSON.parse(bon.stdout);
    assert.equal(j.conforme, true); assert.equal(j.echecs, 0); assert.ok(j.verdicts.length >= 9);
    fs.appendFileSync(path.join(dossier, 'lib/bi/pont.js'), '\n// altéré');
    const mauvais = spawnSync(process.execPath, [OUTIL, dossier], { encoding: 'utf8' });
    assert.equal(mauvais.status, 1); assert.match(mauvais.stdout, /ÉCHEC +1 fichier\(s\)/); assert.match(mauvais.stdout, /Copie NON conforme/);
    assert.equal(spawnSync(process.execPath, [OUTIL, path.join(dossier, 'nexiste-pas')], { encoding: 'utf8' }).status, 2);
    assert.equal(spawnSync(process.execPath, [OUTIL, '--aide'], { encoding: 'utf8' }).status, 2, 'sans dossier : l\'usage, code 2');
  } finally { nettoyer(); }
});

function requete(port, chemin, { methode = 'GET', corps = null } = {}) {
  return new Promise((resoudre, rejeter) => {
    const r = http.request({ host: '127.0.0.1', port, path: chemin, method: methode }, (rep) => { let t = ''; rep.on('data', (d) => (t += d)); rep.on('end', () => resoudre({ statut: rep.statusCode, entetes: rep.headers, texte: t })); });
    r.on('error', rejeter); if (corps) r.write(corps); r.end();
  });
}

test('le serveur de contrôle : la politique en en-tête de bi.html avec son point de collecte, les violations et les fichiers introuvables comptés, le résultat attendu', async () => {
  const { dossier, nettoyer } = paquet();
  const politique = "default-src 'none'; script-src 'self'";
  const { serveur, etat, pret } = creerServeur(dossier, { politique });
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
  const port = serveur.address().port;
  try {
    const bi = await requete(port, '/bi.html'); assert.equal(bi.statut, 200);
    assert.equal(bi.entetes['content-security-policy'], politique + '; report-uri /__csp');
    assert.equal((await requete(port, '/lib/bi/pont.js')).entetes['content-security-policy'], undefined, 'la politique ne s\'applique qu\'à bi.html');
    assert.equal((await requete(port, '/controle.html')).statut, 200);
    await requete(port, '/__csp', { methode: 'POST', corps: JSON.stringify({ 'csp-report': { 'violated-directive': 'connect-src', 'blocked-uri': 'https://x.example' } }) });
    assert.deepEqual(etat.violations, [{ directive: 'connect-src', bloque: 'https://x.example', document: undefined }]);
    assert.equal((await requete(port, '/lib/absent.js')).statut, 404); assert.equal((await requete(port, '/vendor/maplibre-gl/maplibre-gl.js.map')).statut, 404);
    assert.deepEqual(etat.introuvables, ['lib/absent.js'], 'un .map absent n\'est pas un manque');
    assert.equal((await requete(port, '/../../etc/passwd')).statut, 404, 'pas de sortie du dossier');
    await requete(port, '/__resultat', { methode: 'POST', corps: JSON.stringify({ etapes: [{ nom: 'x', ok: true }] }) });
    assert.deepEqual((await pret).etapes, [{ nom: 'x', ok: true }]);
  } finally { serveur.closeAllConnections(); await new Promise((r) => serveur.close(r)); nettoyer(); }
});

test('sans CSP.txt ni Chrome à trouver : le contrôle navigateur le dit au lieu de planter', async () => {
  const { dossier, nettoyer } = paquet();
  try {
    const r = await controlerNavigateur(dossier, { navigateur: true, chrome: path.join(dossier, 'inexistant.exe'), delai: 1 });
    // si un Chrome ou un Edge est installé, il est trouvé par les chemins usuels ; on ne teste que le cas où aucun ne l'est
    if (r.verdicts.some((v) => v.id === 'navigateur')) assert.match(r.verdicts[0].texte, /aucun Chrome ni Edge/);
  } finally { nettoyer(); }
});

test('SCÉNARIO COMPLET dans un navigateur sans fenêtre (ATLAS_TEST_NAVIGATEUR=1) : connexion, scène, légende, temps, couche administrative, aucune violation de CSP.txt', { skip: process.env.ATLAS_TEST_NAVIGATEUR !== '1' }, async () => {
  const { dossier, nettoyer } = paquet();
  try {
    const r = await controlerNavigateur(dossier, { navigateur: true, delai: 90 });
    const echecs = r.verdicts.filter((v) => v.niveau === 'echec');
    assert.deepEqual(echecs, [], JSON.stringify(echecs));
    for (const e of ['connexion', 'scene', 'legende', 'temps', 'couche-administrative', 'geometries', 'camera']) assert.ok(r.verdicts.some((v) => v.id === 'etape-' + e && v.niveau === 'ok'), e);
  } finally { nettoyer(); }
});

test('sansHotesExternes : la même politique, sans aucun hôte externe dans img-src, connect-src et font-src, le reste intact', () => {
  const p = "default-src 'none'; script-src 'self'; img-src 'self' data: blob: https://tiles.openfreemap.org; connect-src 'self' https://tiles.openfreemap.org https://data.geopf.fr; font-src 'self' data:; frame-ancestors 'self'";
  assert.equal(sansHotesExternes(p), "default-src 'none'; script-src 'self'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'self'");
  assert.equal(sansHotesExternes(sansHotesExternes(p)), sansHotesExternes(p), 'idempotente');
});

test('la page de contrôle vérifie que les points sont DESSINÉS (une carte blanche réussit toutes les autres étapes) et sait demander base=aucune', () => {
  const source = fs.readFileSync(OUTIL, 'utf8');
  assert.match(source, /etape\('rendu'/); assert.match(source, /queryRenderedFeatures/); assert.match(source, /aucun point dessiné/);
  assert.match(source, /--base-aucune/); assert.match(source, /&base=aucune/);
});

const POLICES_PUBLIEES = fs.existsSync(path.join(ICI, '..', '..', '..', 'published', 'atlas', 'lib', 'bi', 'polices'));
test('SANS AUCUN HÔTE EXTERNE (base=aucune, texte compris) dans un navigateur sans fenêtre : les points sont dessinés (ATLAS_TEST_NAVIGATEUR=1, polices promues)', { skip: process.env.ATLAS_TEST_NAVIGATEUR !== '1' || !POLICES_PUBLIEES }, async () => {
  const { dossier, nettoyer } = paquet();
  try {
    const r = await controlerNavigateur(dossier, { navigateur: true, delai: 90, baseAucune: true });
    const echecs = r.verdicts.filter((v) => v.niveau === 'echec'); assert.deepEqual(echecs, [], JSON.stringify(echecs));
    assert.ok(r.verdicts.some((v) => v.id === 'etape-rendu' && v.niveau === 'ok'), 'rendu des points');
    assert.ok(r.verdicts.some((v) => v.id === 'csp-violations' && /aucun hôte externe autorisé/.test(v.texte)));
  } finally { nettoyer(); }
});
