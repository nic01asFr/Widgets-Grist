/**
 * Liaison du composant carte BI avec l'hôte : paramètres d'URL, liste blanche d'origines, annonce `ready`, montage.
 * Et garde du mode `?bi=1` dans app_v7.js : sans le paramètre, Atlas reste strictement ce qu'il était.
 * node --test tests/bi-liaison.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { biDemande, normaliserOrigine, lireHotes, configurationPage, installerPont, monter } from '../lib/bi/liaison.js';
import { attacher } from '../lib/bi/bi-runtime.js';
import { carteSimulee, reseau } from './aide-carte-bi.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');   // le depot peut etre extrait en CRLF
const appSource = lire(path.join(racine, 'app_v7.js'));
const htmlSource = lire(path.join(racine, 'index_v7.html'));

test('biDemande : seul ?bi=1 (ou true) active le mode', () => {
  assert.equal(biDemande('?bi=1'), true); assert.equal(biDemande('bi=true&x=2'), true); assert.equal(biDemande('?x=1&bi=1'), true);
  for (const s of ['', '?', '?bi=0', '?bi=', '?bi=yes', '?abi=1', '?bi=10', '?mode=view', undefined, null]) assert.equal(biDemande(s), false, String(s));
});

test('app_v7.js : le motif inline MODE_BI donne les mêmes réponses que biDemande', () => {
  const m = /const MODE_BI = typeof location !== 'undefined' && (\/.+\/)\.test\(location\.search\);/.exec(appSource);
  assert.ok(m, 'MODE_BI présent');
  const motif = new RegExp(m[1].slice(1, -1));
  for (const s of ['?bi=1', '?bi=true', '?x=1&bi=1', '?bi=1&x=2', '?bi=0', '?bi=', '?abi=1', '?bi=10', '?mode=view', '', '?scene=x&bi=1', '?xbi=1', '?bi=yes']) {
    assert.equal(motif.test(s), biDemande(s), s);
  }
});

test('normaliserOrigine : origine http(s) exacte, jamais de joker, de chemin ni d\'identifiants', () => {
  assert.equal(normaliserOrigine('https://hote.example'), 'https://hote.example'); assert.equal(normaliserOrigine(' https://hote.example/ '), 'https://hote.example');
  assert.equal(normaliserOrigine('http://localhost:3016'), 'http://localhost:3016'); assert.equal(normaliserOrigine('HTTPS://Hote.Example:443'), 'https://hote.example');
  for (const x of ['*', 'https://*.example', 'null', '', 'hote.example', 'ftp://h.example', 'https://h.example/chemin', 'https://h.example?x=1', 'https://u:p@h.example', 'javascript:alert(1)', 42, null, undefined]) assert.equal(normaliserOrigine(x), null, String(x));
});

test('lireHotes : ?hote= répétable, doublons fusionnés, rejets signalés', () => {
  const r = lireHotes('?bi=1&hote=https://a.example&hote=https://b.example:8443&hote=https://a.example&hote=*&hote=https://c.example/x');
  assert.deepEqual(r.hotes, ['https://a.example', 'https://b.example:8443']); assert.equal(r.source, 'url'); assert.deepEqual(r.rejetees, ['*', 'https://c.example/x']);
  assert.deepEqual(lireHotes('?bi=1'), { hotes: [], source: 'aucune', rejetees: [] });
});

test('lireHotes : la configuration de la page fait seule autorité quand elle déclare un hôte', () => {
  const r = lireHotes('?hote=https://pirate.example', { hotes: ['https://hote.example'] });
  assert.deepEqual(r.hotes, ['https://hote.example']); assert.equal(r.source, 'configuration');
  assert.equal(lireHotes('?hote=https://a.example', { hotes: ['*'] }).source, 'url', 'une configuration invalide ne verrouille rien');
  const cfg = configurationPage({ ATLAS_BI: { hotes: ['https://a.example'] } }, { querySelector: () => ({ content: 'https://b.example, https://c.example' }) });
  assert.deepEqual(cfg.hotes, ['https://a.example', 'https://b.example', 'https://c.example']);
  assert.deepEqual(configurationPage({}, { querySelector: () => null }).hotes, []);
});

test('installerPont : « ready » ne part qu\'aux origines déclarées, avec une targetOrigin précise', () => {
  const r = reseau(); const rt = attacher(carteSimulee());
  const l = installerPont(rt, { cible: r.hoteVuDeAtlas, fenetre: r.atlas, autorisees: ['https://hote.test', 'https://autre.test', '*', 'https://x.test/chemin'] });
  assert.deepEqual(l.hotes, ['https://hote.test', 'https://autre.test']);
  l.annoncer();
  assert.deepEqual(r.journal.map((j) => j.targetOrigin), ['https://hote.test', 'https://autre.test']);
  assert.deepEqual(r.joker, []);
  const m = r.journal[0].msg; assert.equal(m.type, 'ready'); assert.equal(m.charge.runtime, true); assert.deepEqual(m.charge.versions, ['0.2', '0.3']);
});

test('installerPont : aucun hôte déclaré -> rien n\'est émis, rien n\'est accepté', async () => {
  const r = reseau(); const rt = attacher(carteSimulee());
  const l = installerPont(rt, { cible: r.hoteVuDeAtlas, fenetre: r.atlas, autorisees: [] });
  l.annoncer(); rt._interne.emettre('select', { layer: null, featureId: null }, 'utilisateur');
  assert.equal(r.journal.length, 0);
  r.atlasVuDeLHote.postMessage({ source: 'hote-bi', version: '0.3', id: '1', cmd: 'ping', args: [] }, 'https://atlas.test');
  await new Promise((res) => setTimeout(res, 10));
  assert.equal(r.journal.filter((j) => j.de === 'https://atlas.test').length, 0, 'aucune réponse');
  assert.equal(l.refus.n, 1);
});

test('installerPont : seule la fenêtre parente est écoutée, et les réponses suivent l\'origine qui a parlé', async () => {
  const r = reseau(); const rt = attacher(carteSimulee());
  const l = installerPont(rt, { cible: r.hoteVuDeAtlas, fenetre: r.atlas, autorisees: ['https://hote.test', 'https://autre.test'] });
  const tiers = { postMessage() {} };
  for (const f of [...r.atlas.ecouteurs]) f({ data: { source: 'hote-bi', version: '0.3', id: 'z', cmd: 'ping', args: [] }, origin: 'https://hote.test', source: tiers });
  await new Promise((res) => setTimeout(res, 5));
  assert.equal(r.journal.length, 0, 'un message d\'une autre fenêtre est ignoré même d\'une origine déclarée');
  r.atlasVuDeLHote.postMessage({ source: 'hote-bi', version: '0.3', id: 'p', cmd: 'ping', args: [] }, 'https://atlas.test');
  await new Promise((res) => setTimeout(res, 10));
  assert.deepEqual(r.journal.filter((j) => j.de === 'https://atlas.test').map((j) => j.targetOrigin), ['https://hote.test'], 'réponse à l\'origine qui a parlé, pas à toutes');
  l.desinstaller(); assert.equal(r.atlas.ecouteurs.size, 0);
});

test('monter : attache le runtime, installe le clavier, annonce aux seuls hôtes déclarés, avertit sans hôte', () => {
  const r = reseau(); const carte = carteSimulee(); const avertissements = [];
  r.atlas.location.search = '?bi=1&hote=https://hote.test&hote=*';
  const m = monter({ carte, fenetre: r.atlas, document: null, search: r.atlas.location.search, journal: { warn: (t) => avertissements.push(t) } });
  assert.deepEqual(m.hotes, ['https://hote.test']); assert.equal(m.source, 'url'); assert.equal(r.atlas.__bi, m.rt);
  assert.match(avertissements[0], /refusée/); assert.deepEqual(r.journal.map((j) => j.targetOrigin), ['https://hote.test']); assert.equal(r.journal[0].msg.charge.hotes, 'url');
  const r2 = reseau(); const w2 = []; monter({ carte: carteSimulee(), fenetre: r2.atlas, document: null, search: '?bi=1', journal: { warn: (t) => w2.push(t) } });
  assert.match(w2[0], /aucun hôte déclaré/); assert.equal(r2.journal.length, 0);
});

// ---- le crochet dans app_v7.js : sans ?bi=1, rien ne change ----
test('app_v7.js : aucun import statique de lib/bi ; le seul chargement est un import dynamique gardé par le mode', () => {
  assert.equal(/^\s*import\b[^;]*['"][^'"]*lib\/bi\//m.test(appSource), false, 'aucun import statique de lib/bi/');
  const dyn = [...appSource.matchAll(/import\(\s*['"]([^'"]*lib\/bi\/[^'"]+)['"]\s*\)/g)];
  assert.equal(dyn.length, 1); assert.match(dyn[0][1], /^\.\/lib\/bi\/montage\.js\?v=/);
  const corps = /async function demarrerBi\(\) \{([\s\S]*?)\n\}\n/.exec(appSource);
  assert.ok(corps && corps[1].includes(dyn[0][0]), 'l\'import dynamique est dans demarrerBi');
});

test('app_v7.js : chaque usage de MODE_BI est une garde — ses branches sont les seules qui diffèrent', () => {
  const lignes = appSource.split('\n').map((t, i) => ({ t, n: i + 1 })).filter((x) => /\bMODE_BI\b/.test(x.t) && !/^\s*(\/\/|\*|\/\*)/.test(x.t));
  const attendues = [
    /^const MODE_BI = typeof location/,
    /parseNavbarParam\(typeof location !== 'undefined' \? location\.search : ''\) && !MODE_BI;$/,
    /if \(!MODE_BI\) probeLocalModels\(\);/,
    /!sceneDemandee && !MODE_BI && !CONFIG\.grist\.ready/,
    /if \(!MODE_BI\) setInterval\(\(\) => \{/,
    /return MODE_BI \? demarrerBi\(\) : init\(\);/,
    /if \(MODE_BI\) return demarrerBi\(\);/,
    /^if \(MODE_BI\) return;$/,
  ];
  assert.equal(lignes.length, attendues.length, 'usages : ' + lignes.map((x) => x.n + ':' + x.t.trim()).join(' | '));
  for (const re of attendues) assert.ok(lignes.some((x) => re.test(x.t.trim())), String(re));
});

test('app_v7.js : demarrerBi ne s\'atteint que par MODE_BI, et ne touche ni Grist ni l\'accueil', () => {
  assert.equal((appSource.match(/demarrerBi\(\)/g) || []).length, 3, 'définition + deux appels gardés');
  const corps = /async function demarrerBi\(\) \{([\s\S]*?)\n\}\n/.exec(appSource)[1];
  assert.match(corps, /classList\.add\('mode-bi'\)/); assert.match(corps, /CONFIG\.viewMode = true/);
  assert.equal(/initGrist|accueillir|grist\./.test(corps), false);
  const initGrist = /async function initGrist\(\) \{([\s\S]*?)if \(typeof grist === 'undefined'\)/.exec(appSource)[1];
  assert.match(initGrist, /if \(MODE_BI\) return;/, "initGrist rend la main avant grist.ready() en mode composant");
});

test('index_v7.html : tout le habillage du mode BI est sous body.mode-bi (sans la classe, aucune règle ne s\'applique)', () => {
  const bloc = /\?bi=1[\s\S]*?\{ display: none !important; \}/.exec(htmlSource);
  assert.ok(bloc, 'bloc CSS du mode BI');
  const selecteurs = bloc[0].split('*/')[1].replace(/\{ display: none !important; \}/, '').split(',').map((x) => x.trim()).filter(Boolean);
  assert.ok(selecteurs.length >= 20);
  for (const s of selecteurs) assert.match(s, /^body\.mode-bi /, s);
  const attrib = selecteurs.filter((s) => /attrib|bottom-right/.test(s));
  assert.deepEqual(attrib, [], 'l\'attribution de la carte reste affichée');
});

test('promotion : scripts/promote-atlas.js copie lib/bi', () => {
  const promo = lire(path.join(racine, '..', '..', 'scripts', 'promote-atlas.js'));
  assert.match(promo, /lib', 'bi'|lib\/bi|'bi'/);
});
