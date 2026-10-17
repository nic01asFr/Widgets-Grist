/**
 * Hygiène du dépôt : le contrôle d'indexation (scripts/hygiene-atlas.js) refuse ce qui ne doit pas partir, et ce qu'Atlas publie reste propre.
 * Les termes interdits ne sont pas écrits ici : le test en invente un.
 * node --test projects/Atlas/tests/hygiene-depot.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { controler, AVERTIR_OCTETS, REFUSER_OCTETS } = require('../../../scripts/hygiene-atlas.js');
const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const fichier = (chemin, texte = '', octets = texte.length) => ({ chemin, octets, texte });

test('un fichier propre passe, sans refus ni avertissement', () => {
  const r = controler([fichier('projects/Atlas/lib/exemple.js', 'export const a = 1;\n')]);
  assert.deepEqual(r.erreurs, []); assert.deepEqual(r.avertissements, []);
});

test('les dossiers d\'essai, captures, caches et fichiers d\'environnement sont refusés', () => {
  for (const chemin of ['projects/Atlas/essais-flux/README.md', 'projects/Atlas/docs/captures/a.png', 'x/resultats-rejouer/profil-edge/Default/Cache/Cache_Data/f_01', 'projects/Atlas/node_modules/a/b.js', '.env.local', 'cle.pem', 'sauvegarde.zip']) {
    assert.equal(controler([fichier(chemin)]).erreurs.length >= 1, true, chemin);
  }
  assert.equal(controler([fichier('projects/Atlas/lib/essais.js')]).erreurs.length, 0, 'un nom qui contient « essais » sans être un dossier essais-* passe');
});

test('le poids : avertissement au-dessus de 1 Mo, refus au-dessus de 5 Mo', () => {
  assert.equal(controler([fichier('a.glb', '', AVERTIR_OCTETS + 1)]).avertissements.length, 1);
  assert.equal(controler([fichier('a.glb', '', AVERTIR_OCTETS + 1)]).erreurs.length, 0);
  assert.match(controler([fichier('a.glb', '', REFUSER_OCTETS + 1)]).erreurs[0], /au-dessus de 5 Mo/);
});

test('un chemin absolu de poste, un secret en clair ou une clé privée sont refusés', () => {
  assert.match(controler([fichier('a.js', "const p = 'C:\\\\Users\\\\quelquun\\\\bureau';")]).erreurs[0], /chemin absolu/);
  assert.match(controler([fichier('a.js', "const p = '/home/quelquun/projet/';")]).erreurs[0], /chemin absolu/);
  assert.match(controler([fichier('a.js', "const token = 'abcdefghijklmnopqrstuvwxyz0123456789';")]).erreurs[0], /secret/);
  assert.match(controler([fichier('a.pem.txt', '-----BEGIN RSA PRIVATE KEY-----\nMII')]).erreurs[0], /clé privée/);
  assert.equal(controler([fichier('vendor/x.js', "C:\\Users\\quelquun\\a")]).erreurs.length, 0, 'les bibliothèques tierces ne sont pas lues');
});

test('les termes interdits sont lus de l\'extérieur, sans casse, avec le numéro de ligne ; sans termes, rien n\'est refusé', () => {
  const f = fichier('a.md', 'Bonjour\nmerci à l\'ÉQUIPE Zorglub pour ceci');
  assert.match(controler([f], { termes: ['zorglub'] }).erreurs[0], /terme interdit \(ligne 2\)/);
  assert.equal(controler([f], { termes: [] }).erreurs.length, 0);
  assert.equal(controler([f], { termes: ['', '  '] }).erreurs.length, 0, 'une ligne vide n\'interdit pas tout');
});

test('une adresse de messagerie est signalée, sauf les adresses sans réponse', () => {
  assert.equal(controler([fichier('a.md', 'écrire à prenom.nom@exemple.fr')]).avertissements.length, 1);
  assert.equal(controler([fichier('a.md', 'noreply@anthropic.com')]).avertissements.length, 0);
});

test('ce que git suit sous published/atlas est propre : pas de chemin de poste, de secret, d\'essai ni de fichier hors plafond', () => {
  let chemins;
  try { chemins = execFileSync('git', ['ls-files', '-z', 'published/atlas'], { cwd: racine, encoding: 'utf8' }).split('\0').filter(Boolean); } catch { return; }
  if (!chemins.length) return;
  const fichiers = chemins.filter((c) => fs.existsSync(path.join(racine, c))).map((c) => {
    const octets = fs.statSync(path.join(racine, c)).size;
    return { chemin: c, octets, texte: /\.(json|geojson|js|mjs|html|css|md|svg)$/i.test(c) && octets < 2 * 1024 * 1024 ? fs.readFileSync(path.join(racine, c), 'utf8') : undefined };
  });
  assert.deepEqual(controler(fichiers).erreurs, []);
});
