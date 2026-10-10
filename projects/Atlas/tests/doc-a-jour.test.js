/**
 * La documentation et la vitrine suivent le code : une publication ne part pas avec un résumé de version périmé, une image absente, un journal
 * des versions en retard, une page générée qui ne reflète pas vitrine.json, ou un module que personne n'a décrit.
 * Règle et liste à parcourir : projects/Atlas/CLAUDE.md, « Une fonctionnalité n'est finie que documentée, présentée et testée ».
 *
 * node --test projects/Atlas/tests/doc-a-jour.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const ATLAS = path.resolve(ICI, '..');
const DEPOT = path.resolve(ATLAS, '..', '..');
const lire = (...p) => fs.readFileSync(path.join(DEPOT, ...p), 'utf8');
const PUBLIE = ['published', 'atlas'];

const paquet = JSON.parse(lire(...PUBLIE, 'package.json'));
const VERSION = paquet.version;
const vitrine = JSON.parse(lire(...PUBLIE, 'vitrine.json'));
const changelog = fs.readFileSync(path.join(ATLAS, 'CHANGELOG.md'), 'utf8');
const normal = (s) => s.replace(/\r\n/g, '\n');

test('la version du paquet, la tête du journal de la vitrine et le résumé de statut sont la même version', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(vitrine.journal[0].version, 'v' + VERSION, 'première entrée du journal de la vitrine');
  assert.ok(vitrine.statut.texte.startsWith('Version ' + VERSION + ' :'), 'le résumé « Version X : » de la vitrine dit ' + vitrine.statut.texte.slice(0, 20));
  assert.equal(paquet.grist.version, VERSION, 'la version affichée dans Grist (package.json > grist.version)');
});

test('le journal de la vitrine ne répète aucune version et chaque entrée a un texte', () => {
  const versions = vitrine.journal.map((e) => e.version).filter((v) => /^vd/.test(v));   // les entrées étiquetées « vitrine » ne sont pas des versions
  assert.equal(new Set(versions).size, versions.length, 'une version deux fois : ' + versions.join(', '));
  for (const e of vitrine.journal) assert.ok(e.texte && e.texte.length > 20, 'entrée sans texte : ' + e.version);
});

test('le journal des versions (CHANGELOG.md) commence par la version publiée', () => {
  const titres = [...normal(changelog).matchAll(/^## (\d+\.\d+\.\d+)\b/gm)].map((m) => m[1]);
  assert.ok(titres.length >= 1);
  assert.equal(titres[0], VERSION, 'la première version du CHANGELOG est ' + titres[0]);
  assert.equal(new Set(titres).size, titres.length, 'une version deux fois dans le CHANGELOG');
});

test('le CHANGELOG donne la taille, l\'empreinte et la version du client en un fichier, telles qu\'elles sont (les hôtes les épinglent)', () => {
  const octets = fs.readFileSync(path.join(DEPOT, ...PUBLIE, 'lib', 'bi', 'client-hote.js'));
  const empreinte = 'sha384-' + crypto.createHash('sha384').update(octets).digest('base64');
  assert.ok(changelog.includes(empreinte), 'empreinte du client absente ou périmée dans le CHANGELOG (réelle : ' + empreinte + ')');
  assert.ok(changelog.includes(octets.length.toLocaleString('fr-FR').replace(/ | /g, ' ') + ' octets') || changelog.includes(octets.length + ' octets'), 'taille du client absente ou périmée (réelle : ' + octets.length + ' octets)');
  const version = /export const VERSION_CLIENT\s*=\s*(\d+)/.exec(octets.toString('utf8'));
  assert.ok(version, 'VERSION_CLIENT introuvable dans le client');
  assert.ok(changelog.includes('`VERSION_CLIENT` ' + version[1]), 'VERSION_CLIENT ' + version[1] + ' absente du CHANGELOG');
});

test('la page générée de la vitrine reflète vitrine.json (version en tête, chaque entrée du journal, chaque carte)', () => {
  const page = lire('published', 'w', 'atlas', 'index.html');
  assert.ok(page.includes('<b>v' + VERSION + '</b>'), 'la page ne porte pas l\'entrée v' + VERSION + ' : relancer node scripts/generate-vitrine.js');
  for (const e of vitrine.journal) assert.ok(page.includes('<b>' + e.version + '</b>'), 'entrée du journal absente de la page : ' + e.version);
  for (const c of vitrine.produit.contextes) assert.ok(page.includes(c.titre.replace(/&/g, '&amp;').replace(/’/g, '’')) || page.includes(c.titre), 'carte absente de la page : ' + c.titre);
});

test('toute image citée par la vitrine existe', () => {
  const images = new Set();
  for (const c of vitrine.produit.contextes) for (const i of c.images || []) images.add(i.image);
  if (vitrine.produit.demonstration && vitrine.produit.demonstration.image) images.add(vitrine.produit.demonstration.image);
  assert.ok(images.size >= 10);
  const absentes = [...images].filter((f) => !fs.existsSync(path.join(DEPOT, 'published', 'w', 'atlas', f)));
  assert.deepEqual(absentes, [], 'images citées mais absentes de published/w/atlas/ : ' + absentes.join(', '));
});

test('chaque module de lib/ est décrit dans la carte des modules de CLAUDE.md', () => {
  const doc = normal(fs.readFileSync(path.join(ATLAS, 'CLAUDE.md'), 'utf8'));
  const modules = [];
  const parcourir = (dossier) => {
    for (const e of fs.readdirSync(path.join(ATLAS, 'lib', dossier), { withFileTypes: true })) {
      if (e.isDirectory()) { if (e.name !== 'donnees') parcourir(path.join(dossier, e.name)); } else if (e.name.endsWith('.js')) modules.push(e.name.replace(/\.js$/, ''));
    }
  };
  parcourir('');
  const sansMention = modules.filter((m) => !doc.includes('`' + m + '`'));
  assert.deepEqual(sansMention, [], 'modules de lib/ à ajouter à la carte des modules de CLAUDE.md : ' + sansMention.join(', '));
});

test('la règle de fin de fonctionnalité et le journal des versions sont référencés dans CLAUDE.md', () => {
  const doc = normal(fs.readFileSync(path.join(ATLAS, 'CLAUDE.md'), 'utf8'));
  assert.match(doc, /Une fonctionnalité n'est finie que documentée, présentée et testée/);
  assert.ok(doc.includes('CHANGELOG.md'));
});
