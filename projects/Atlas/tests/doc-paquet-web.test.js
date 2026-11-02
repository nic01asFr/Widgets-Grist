/**
 * Le guide d'exploitation décrit le paquet web figé : ce qu'il dit doit rester VRAI. Ces gardes relient le texte au code, pour que la page ne vieillisse pas en silence :
 * les fichiers cités sont ceux que le paquet carte seule porte, la politique donnée en exemple est celle que le générateur produit, la table « quel paquet pour quel contrat »
 * a une ligne pour le contrat courant, les niveaux de l'événement `error` sont ceux du garde d'amorçage.
 * node --test projects/Atlas/tests/doc-paquet-web.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ICI = path.dirname(fileURLToPath(import.meta.url));
const ATLAS = path.join(ICI, '..');
const RACINE = path.join(ATLAS, '..', '..');
const lire = (rel) => fs.readFileSync(path.join(ATLAS, rel), 'utf8').replace(/\r\n/g, '\n');
const GUIDE = lire('docs/EXPLOITATION-EXTERNE-BI.md');
const bi = require('../../../scripts/paquet-atlas-bi.js');
const { fichiersDuPaquet, fichiersGeneres, versionContrat } = require('../../../scripts/paquet-atlas.js');

/** La section « Le paquet web figé » du guide, jusqu'à la suivante. */
const SECTION = (() => { const d = GUIDE.indexOf('### Le paquet web figé'); const f = GUIDE.indexOf('### Adresse publique'); assert.ok(d > 0 && f > d, 'section du paquet web figé trouvée'); return GUIDE.slice(d, f); })();

test('le guide cite chaque fichier propre au paquet carte seule, et chacun existe dans le profil produit', () => {
  const profil = new Set([...fichiersDuPaquet(path.join(RACINE, 'published', 'atlas'), RACINE, 'bi'), ...Object.keys(fichiersGeneres({ profil: 'bi' }))]);
  for (const f of ['PAQUET.json', 'LICENSE', 'CSP.txt', 'PRECACHE.json', 'controle-copie.mjs']) {
    assert.ok(SECTION.includes('`' + f + '`') || SECTION.includes(f), 'le guide cite ' + f);
    assert.ok(profil.has(f) || f === 'PAQUET.json', f + ' est dans le paquet carte seule');
  }
});

test('le guide décrit les options de l\'outil de contrôle, et elles existent dans l\'outil', () => {
  const outil = lire('tools/controle-copie.mjs');
  for (const option of ['--navigateur', '--serveur', '--json']) { assert.ok(SECTION.includes(option), 'le guide cite ' + option); assert.ok(outil.includes(option), "l'outil connaît " + option); }
});

test('la politique de sécurité de contenu du guide est celle que le générateur produit pour une page sans bloc en ligne', () => {
  const bloc = [...SECTION.matchAll(/```\n([\s\S]*?)\n```/g)].map((m) => m[1]).find((t) => t.includes("default-src 'none'"));
  assert.ok(bloc, 'exemple de politique dans le guide');
  assert.equal(bloc.replace(/\s+/g, ' ').trim(), bi.politiqueCsp('<html></html>', { feuillesConstruites: true }));
});

test('la table « quel paquet pour quel contrat » a une ligne pour le contrat courant : changer de contrat oblige à la mettre à jour', () => {
  const contrat = versionContrat(RACINE);
  assert.match(contrat, /^\d+\.\d+$/);
  const lignes = SECTION.split('\n').filter((l) => /^\| /.test(l) && /\| \d+\.\d+ \|/.test(l));
  assert.ok(lignes.some((l) => l.includes('| ' + contrat + ' |')), 'ligne du contrat ' + contrat + ' dans la table ; lignes : ' + lignes.length);
  const client = /VERSION_CLIENT = (\d+)/.exec(fs.readFileSync(path.join(ATLAS, 'lib', 'bi', 'client-hote.js'), 'utf8'))[1];
  assert.ok(lignes.some((l) => l.includes('| ' + contrat + ' |') && l.includes('| ' + client + ' ')), 'la ligne du contrat ' + contrat + ' dit le client ' + client);
});

test('les niveaux de l\'événement error décrits par le guide sont ceux du garde d\'amorçage', () => {
  const garde = lire('lib/bi/amorcage.js');
  assert.match(garde, /prevenir\(causes\.length \? 'dependance' : 'delai', m, causes\.length \? 'fatal' : 'avertissement'\)/);
  assert.match(GUIDE, /`niveau` vaut `'fatal'` pour `dependance`/); assert.match(GUIDE, /`'avertissement'` pour `delai`/);
  assert.ok(!/niveau: 'fatal' \}`, envoyé/.test(GUIDE), 'plus de « toujours fatal »');
  assert.match(GUIDE, /\*\*`connecter\(\)` n'échoue pas à la réception de l'événement\*\*/);
});

test('le guide donne les hôtes externes des fonds, tels que le code les déclare', () => {
  const fonds = lire('lib/fonds-base.js') + lire('lib/bi/fond.js');
  for (const hote of ['tiles.openfreemap.org', 'data.geopf.fr']) { assert.ok(fonds.includes(hote), 'le code déclare ' + hote); assert.ok(SECTION.includes(hote), 'le guide cite ' + hote); }
  assert.ok(!fonds.includes('demotiles.maplibre.org'), 'le code n’appelle plus de serveur de démonstration pour les polices');
  assert.match(SECTION, /polices de la carte \(Noto Sans Regular, latin[^)]*\) sont \*\*dans la copie\*\*/, 'le guide dit que les polices sont dans la copie');
});

test('le paquet hors ligne (données) renvoie au paquet web (code), et inversement : deux paquets, deux contenus', () => {
  assert.match(lire('docs/PAQUET-HORS-LIGNE.md'), /Deux paquets, deux contenus/);
  assert.match(SECTION, /Ne pas confondre.*paquet hors ligne/);
});
