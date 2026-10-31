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
export function fermeture(entree, { dynamiques = true } = {}) {
  const vus = new Set();
  const pile = [entree];
  while (pile.length) {
    const f = pile.pop();
    if (vus.has(f)) continue;
    vus.add(f);
    const src = lire(f).toString('utf8');
    const motif = dynamiques ? /(?:from\s*|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"?]+)(?:\?[^'"]*)?['"]/g : /(?:from\s*|import\s+)['"](\.{1,2}\/[^'"?]+)(?:\?[^'"]*)?['"]/g;
    for (const m of src.matchAll(motif)) {
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
  ['page (index.html)', ['index.html'], 170_000, 36_000],                                                // 156 478 / 33 196
  ['client hôte en un fichier', ['lib/bi/client-hote.js'], 16_400, 6_100],   // 1.35.0 : 15 586 octets (contrat 0.4 : règle de version, 4 commandes) ; plafond relevé avec la raison dans le commit                              // 14 770 / 5 463 (octets exacts, empreinte épinglée par les hôtes)
  ['page maigre du composant (bi.html)', ['bi.html'], 8_000, 3_200],                                    // 5 759 octets : la page de l'application en fait 157 909 // 1.30.0 : 490 Ko bruts (environnement.js, soleil.js, terrain-base.js : chargés À LA DEMANDE, la fermeture les compte, la page seule non) ; plafonds 475 -> 505 Ko bruts, 172 -> 185 Ko gzip
  ['page maigre : fermeture de lib/bi/entree.js (tout ce que `?bi=1` charge en plus de MapLibre)', fermeture('lib/bi/entree.js'), 549_000, 197_000],   // 1.35.0 : 510,6 Ko (contrat 0.4 dont batiments.js, chargé à la demande mais compté dans la fermeture) ;   // 403 907 / 145 934 (42 fichiers) ; avant 1.21.0, `?bi=1` chargeait AUSSI app.js, 86 modules d'application et three.js (~3,4 Mo de plus) // 1.23.0 : 411 Ko ; +7 Ko = lib/bi/canevas.js, chargé À LA DEMANDE par montage.js (profil complet seulement) mais compté par la fermeture ; le composant nu ne le télécharge jamais ; gzip 148,7 Ko
  ['composant : fermeture de montage.js (mode ?bi=1)', fermeture('lib/bi/montage.js'), 540_000, 192_000],   // 1.35.0 : 501,4 Ko (contrat 0.4) ;   // 395 356 / 141 528 au 16/10/2026 (38 fichiers ; 1.19.0 : bulle, marges, interface de la charte, inférence et description chargées à la demande comprises) // 1.23.0 : 403 Ko (canevas.js, voir ci-dessus) // 1.23.1 : 144,7 Ko gzip (STYLE_AUCUN_FOND et le refus des fonds dépendants du style de base) // 1.30.0 : 480,8 Ko bruts (idem) ; plafonds 465 -> 495 Ko bruts, 168 -> 181 Ko gzip
  ['élément <atlas-bi> et son client', fermeture('lib/bi/atlas-bi-element.js'), 122_000, 46_000],   // 1.35.0 : 112,8 Ko (client 2, describe.js, pont.js) ;      // 109 102 / 40 995 au 16/10/2026 (10 fichiers) ; describe.js, inference.js et herite.js sont chargés À LA DEMANDE (la fermeture compte aussi les imports dynamiques)
  ['lib/bi (tous les modules)', dossierJs('lib/bi'), 448_000, 160_000],   // 1.35.0 : 415,7 Ko (contrat 0.4 : batiments.js 8,4 Ko, caméra, vue plane, clic ; client 2) ;                                 // 314 205 / 115 839 au 16/10/2026 (1.20.0 : herite.js) // 1.23.0 : 329 Ko / 122,2 Ko gzip (canevas.js) ; 1.24.0 : 333 Ko (couches de dalles 3D dans canevas.js) ; 1.25.0 : 124,3 Ko gzip (garde-fou des marges, clics et surlignage) // 1.28.2 : 132,0 Ko gzip (diagnostic du repli, police de caractères exclue du repli) ; plafond 135 -> 136 Ko // 1.28.4 : 374,8 Ko bruts (valider-manifeste.js, module pur chargé par les serveurs des hôtes, pas par la page) ; plafonds 372 -> 384 Ko bruts, 136 -> 139 Ko gzip (137,1 mesurés) ; 1.29.0 : 377,5 Ko bruts (volume des polygones, étiquette des points), plafonds 384 -> 392 Ko bruts, 139 -> 141 Ko gzip // 1.30.0 : 392,1 Ko bruts (environnement.js) ; plafonds 392 -> 404 Ko bruts, 144 -> 148 Ko gzip
  ['lib/charte (tous les modules)', dossierJs('lib/charte'), 118_000, 44_000],                           // 88 047 / 31 820 // 1.28.4 : 100,5 Ko bruts (depuis-kit.js, depuis-themedef.js : thème du document, pas encore chargés par le composant) ; plafonds 93 -> 104 Ko bruts, 33,5 -> 38 Ko gzip (37,1 mesurés) ; 1.29.1 : 104,7 Ko (application.js, l'identité de l'hôte sur l'application), plafonds 104 -> 109 Ko bruts, 38 -> 40 Ko gzip // 1.31.0 : 40,4 Ko gzip (theme-document.js : lecture de Theme_document) ; plafonds 109 -> 115 Ko bruts, 40 -> 43 Ko gzip
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
  assert.ok(noyau.length <= 47, `le noyau compte ${noyau.length} fichiers (plafond 47 depuis la 1.35.0 : batiments.js, importé à la demande ; mesuré : 43 en 1.26.0 : les modules d'interface et les tables liées)`);
});

test('poids : la garde mord (un module qui grossit de 50 Ko fait dépasser le plafond du noyau)', () => {
  const t = total(fermeture('lib/bi/montage.js'));
  const [, , plafondBrut] = BUDGETS.find(([nom]) => nom.startsWith('composant'));
  assert.ok(t.brut + 50 * 1024 > plafondBrut, 'la marge est inférieure à 50 Ko : un ajout de cette taille serait vu');
});

test("poids : l'interface optionnelle (lib/bi/ui/) n'est JAMAIS chargée d'emblée : seulement par import() quand la scène la déclare", () => {
  for (const entree of ['lib/bi/entree.js', 'lib/bi/montage.js']) {
    const statique = fermeture(entree, { dynamiques: false });
    assert.deepEqual(statique.filter((f) => f.startsWith('lib/bi/ui/')), [], entree + ' : un module d\'interface est importé statiquement');
    assert.ok(fermeture(entree).filter((f) => f.startsWith('lib/bi/ui/')).length === 3, entree + ' : la zone, la légende et le temps sont atteignables par import()');
  }
  const ui = total(dossierJs('lib/bi/ui'));
  assert.ok(ui.gz <= 7_500, 'les trois modules d\'interface pèsent ' + ko(ui.gz) + ' gzip (plafond 7,3 Ko ; 6,4 Ko mesurés avec la légende ciblable) : une interface optionnelle reste petite');
});
