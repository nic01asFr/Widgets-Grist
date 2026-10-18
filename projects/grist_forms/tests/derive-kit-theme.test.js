'use strict';

/*
 * Test de derive : la liste fermee de shared/theme.js, le manifeste du generateur du kit et les
 * quatre fichiers publics disent la meme chose. Les fixtures sont des copies (avec leurs empreintes) ;
 * si le generateur est present dans l'arbre, on les compare a la source.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const Theme = require('../shared/theme.js');

const FIXTURES = path.join(__dirname, 'fixtures', 'kit-theme');
const SOURCE = path.resolve(__dirname, '..', '..', '..', '..', '..', 'projects', 'appkit', 'kit', 'jetons', 'export-kit', 'dist');
const lire = (dossier, nom) => JSON.parse(fs.readFileSync(path.join(dossier, nom), 'utf8'));
const FICHIERS = ['neutre', 'grist'].flatMap((p) => ['clair', 'sombre'].map((m) => `theme-formulaire.${p}.${m}.json`));

function canonique(v) {
  if (Array.isArray(v)) return '[' + v.map(canonique).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonique(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

describe('Derive kit-theme/0.1 — manifeste du generateur', () => {
  const manifeste = lire(FIXTURES, 'kit-theme-0.1.manifest.json');

  it('le manifeste dit kit-theme/0.1 et porte les 26 cles du module', () => {
    assert.equal(manifeste.version, Theme.VERSION);
    assert.deepEqual([...manifeste.cles].sort(), [...Theme.CLES].sort());
    assert.equal(manifeste.cles.length, 26);
  });
});

describe('Derive kit-theme/0.1 — fichiers par paquet et par mode', () => {
  FICHIERS.forEach((nom) => {
    it(`${nom} : enveloppe kit-theme-fichier/0.1, valeurs acceptees 26/26 sans rejet`, () => {
      const f = lire(FIXTURES, nom);
      assert.equal(f.version, 'kit-theme-fichier/0.1');
      assert.deepEqual(Object.keys(f.valeurs).sort(), [...Theme.CLES].sort());
      const r = Theme.valider(f.valeurs);
      assert.equal(Object.keys(r.applique).length, 26);
      assert.deepEqual(r.ignore, []);
      assert.ok(Array.isArray(f.derive), 'derive est un tableau');
      assert.deepEqual([...f.derive], [...f.derive].sort(), 'derive est trie');
    });

    it(`${nom} : l'enveloppe entiere n'est pas un theme (rien ne serait pose)`, () => {
      const r = Theme.valider(lire(FIXTURES, nom));
      assert.deepEqual(r.applique, {});
    });

    it(`${nom} : l'empreinte est celle de { mode, police, valeurs } en JSON canonique`, () => {
      const f = lire(FIXTURES, nom);
      const h = 'sha256-' + crypto.createHash('sha256').update(canonique({ mode: f.mode, police: f.police, valeurs: f.valeurs }) + '\n', 'utf8').digest('base64');
      assert.equal(f.empreinte, h);
    });
  });
});

describe('Derive kit-theme/0.1 — copie des fixtures et source', { skip: !fs.existsSync(SOURCE) && 'generateur absent de l\'arbre' }, () => {
  ['kit-theme-0.1.manifest.json', ...FICHIERS].forEach((nom) => {
    it(`${nom} : la fixture est identique a la sortie du generateur`, () => {
      assert.deepEqual(lire(FIXTURES, nom), lire(SOURCE, nom), 'fixture perimee : recopier la sortie du generateur');
    });
  });
});
