/**
 * Budgets de poids : ce qu'Atlas publie ne grossit plus sans qu'on le décide.
 *
 * Les plafonds sont l'état mesuré à la 1.16.6 (15/10/2026) plus environ 5 % de marge : un plafond de NON-RÉGRESSION, pas un objectif. Les objectifs
 * (noyau du composant sous 1 Mo gzip une fois `grist-plugin-api.js` retiré, puis la minification) sont dans
 * `projects/Atlas/essais-bi/mesures-base/PLAN-D-ACTION.md` ; chaque gain se traduit ici par un plafond ABAISSÉ dans le même commit.
 * Pour relever un plafond : le dire dans le message du commit, avec la raison.
 * node --test projects/Atlas/tests/budgets-poids.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'published', 'atlas');
const lire = (f) => fs.readFileSync(path.join(PUB, f));
const gz = (b) => zlib.gzipSync(b, { level: 9 }).length;
const ko = (n) => `${(n / 1024).toFixed(1)} Ko`;

/** Les fichiers JS d'un dossier de `published/atlas`, sans descendre. */
function dossierJs(d) {
  return fs.readdirSync(path.join(PUB, d)).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`);
}

/** Les modules atteints depuis `entree` par des imports relatifs (statiques ou dynamiques), `entree` comprise. */
export function fermeture(entree) {
  const vus = new Set();
  const pile = [entree];
  while (pile.length) {
    const f = pile.pop();
    if (vus.has(f)) continue;
    vus.add(f);
    const src = lire(f).toString('utf8');
    for (const m of src.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"?]+)(?:\?[^'"]*)?['"]/g)) {
      const cible = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1]));
      if (fs.existsSync(path.join(PUB, cible))) pile.push(cible);
    }
  }
  return [...vus];
}

const total = (fichiers) => {
  let brut = 0, comp = 0;
  for (const f of fichiers) { const b = lire(f); brut += b.length; comp += gz(b); }
  return { brut, gz: comp, n: fichiers.length };
};

// [description, fichiers, plafond brut (octets), plafond gzip (octets)] ; mesures du 15/10/2026 entre parenthèses
const BUDGETS = [
  ['application complète (app.js)', ['app.js'], 1_040_000, 300_000],                                  // 992 153 / 284 850
  ['page (index.html)', ['index.html'], 165_000, 35_000],                                                // 156 478 / 33 196
  ['client hôte en un fichier', ['lib/bi/client-hote.js'], 15_500, 5_800],                              // 14 770 / 5 463 (octets exacts, empreinte épinglée par les hôtes)
  ['composant : fermeture de montage.js (mode ?bi=1)', fermeture('lib/bi/montage.js'), 410_000, 148_000],   // 395 356 / 141 528 au 16/10/2026 (38 fichiers ; 1.19.0 : bulle, marges, interface de la charte, inférence et description chargées à la demande comprises)
  ['élément <atlas-bi> et son client', fermeture('lib/bi/atlas-bi-element.js'), 100_000, 38_000],      // 94 190 / 35 201 au 16/10/2026 (9 fichiers) ; 1.18.0 : inference.js 12,6 Ko, comme describe.js, chargés À LA DEMANDE (la fermeture compte aussi les imports dynamiques : le poids au premier chargement est celui de l'élément, du client, du pont, de la charte et de declaratif.js)
  ['lib/bi (tous les modules)', dossierJs('lib/bi'), 315_000, 116_000],                                 // 301 802 / 111 065 au 16/10/2026 (1.19.0 : bulle.js, marges.js, evenements-ext.js)
  ['lib/charte (tous les modules)', dossierJs('lib/charte'), 93_000, 33_500],                           // 88 047 / 31 820
];

for (const [nom, fichiers, plafondBrut, plafondGz] of BUDGETS) {
  test(`poids : ${nom} reste sous son plafond`, () => {
    const t = total(fichiers);
    assert.ok(t.brut <= plafondBrut, `${nom} : ${ko(t.brut)} bruts pour un plafond de ${ko(plafondBrut)} (${t.n} fichier(s))`);
    assert.ok(t.gz <= plafondGz, `${nom} : ${ko(t.gz)} gzip pour un plafond de ${ko(plafondGz)} (${t.n} fichier(s))`);
  });
}

test('poids : le noyau du composant ne tire pas l\'application complète', () => {
  const noyau = fermeture('lib/bi/montage.js');
  assert.ok(!noyau.includes('app.js'), 'montage.js ne doit pas importer app.js');
  assert.ok(noyau.length <= 40, `le noyau compte ${noyau.length} fichiers (plafond 40, mesuré : 34)`);
});

test('poids : la garde mord (un module qui grossit de 50 Ko fait dépasser le plafond du noyau)', () => {
  const t = total(fermeture('lib/bi/montage.js'));
  const [, , plafondBrut] = BUDGETS.find(([nom]) => nom.startsWith('composant'));
  assert.ok(t.brut + 50 * 1024 > plafondBrut, 'la marge est inférieure à 50 Ko : un ajout de cette taille serait vu');
});
