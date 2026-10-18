/**
 * La fiche d'Atlas, telle qu'elle est publiee : un parcours d'usage dont chaque image existe et se decrit, rendu sans ecart.
 * node --test scripts/generate-vitrine-atlas.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const V = require('./generate-vitrine.js');

const W = (id, url, extra = {}) => ({ widgetId: id, name: id, url, ...extra });
const BASE = 'https://s.io/r/';

/** Ce que la generation dit sur la sortie d'erreur, sans polluer le rapport de test. */
function ecouter(fn) {
  const dits = [];
  const orig = console.error;
  console.error = (...a) => dits.push(a.join(' '));
  try { return { html: fn(), dits }; } finally { console.error = orig; }
}

const ATLAS = path.join(__dirname, '..', 'published', 'atlas', 'vitrine.json');
const IMAGES = path.join(__dirname, '..', 'published', 'w', 'atlas');
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));

function toutesLesImages(parcours) {
  const l = [];
  for (const s of parcours.sections || []) {
    if (s.demo) l.push(s.demo);
    for (const c of s.chapitres || []) {
      if (c.figure) l.push(c.figure);
      for (const d of c.diapositives || []) l.push(d);
    }
  }
  return l;
}

test('la fiche d\'Atlas est un parcours : chaque image existe, a son texte alternatif, et aucun bloc par fonction n\'est laisse sans rendu', () => {
  const pc = atlas.produit.parcours;
  assert.ok(pc, 'Atlas declare un parcours');
  const images = toutesLesImages(pc);
  assert.ok(images.length >= 25, `trop peu d'images (${images.length})`);
  for (const i of images) {
    assert.ok(fs.existsSync(path.join(IMAGES, i.image)), `image absente : w/atlas/${i.image}`);
    assert.ok(i.alt && i.alt.length > 10, `texte alternatif trop court : ${i.image}`);
  }
  for (const k of ['contextes', 'sequence', 'facons', 'chiffres', 'demonstration', 'accroche']) {
    assert.ok(!(k in atlas.produit), `${k} ne serait pas rendu : a retirer de la fiche`);
  }
});

test('la page d\'Atlas est generee sans ecart : trois carrousels, un sommaire, trois demonstrations, aucune erreur', () => {
  // La fiche telle qu'elle est publiee, rendue sans rien ecrire sous `published/` : generer() reecrirait toutes les pages.
  const a = { id: 'atlas', widgets: [W('atlas', 'https://nic01asfr.github.io/Widgets-Grist/atlas/')], presentation: atlas };
  const { html, dits } = ecouter(() => V.rendreProjet(a, Date.now(), BASE));
  assert.deepEqual(dits, [], `la generation a signale : ${dits.join(' | ')}`);
  assert.equal((html.match(/<section class="carrousel"/g) || []).length, 3);
  assert.equal((html.match(/class="diapo/g) || []).length, 23);
  assert.equal((html.match(/data-widget=/g) || []).length, 4, 'le cas Longchamp, l\'atelier, Rennes et l\'orage');
  assert.match(html, /<nav class="ancres"/);
  assert.match(html, /href="#composant"/);
  assert.match(html, /Toutes les versions \(\d+\)/);
  assert.doesNotMatch(html, /undefined|\[object/);
});

test('aucune adresse de la page d\'Atlas ne nomme une organisation ni un poste de travail', () => {
  const brut = fs.readFileSync(ATLAS, 'utf8');
  assert.doesNotMatch(brut, /C:\\\\Users|\/Users\/|127\.0\.0\.1|localhost/);
});

test('le guide d\'integration d\'Atlas existe, sa page est generee, et ses liens relatifs menent a des pages publiees', () => {
  const annexes = atlas.produit.annexes || [];
  const guide = annexes.find((a) => a.id === 'integrer');
  assert.ok(guide, 'Atlas declare une annexe « integrer »');
  const p = { id: 'atlas', widgets: [W('atlas', 'https://nic01asfr.github.io/Widgets-Grist/atlas/')], presentation: atlas };
  const { html, dits } = ecouter(() => V.rendreAnnexe(p, guide, BASE));
  assert.deepEqual(dits, []);
  assert.match(html, /&lt;atlas-bi/, 'la balise est montree, echappee');
  assert.ok(!/<atlas-bi /.test(html), 'la balise n\'est pas interpretee');
  const dossier = path.join(__dirname, '..', 'published', 'w', 'atlas', 'integrer');
  for (const b of guide.blocs) for (const l of b.liens || []) {
    if (/^https?:/.test(l.url)) continue;
    assert.ok(fs.existsSync(path.join(dossier, l.url.split(/[?#]/)[0])), 'lien relatif mort : ' + l.url);
  }
  const chapitre = JSON.stringify(atlas.produit.parcours);
  assert.ok(chapitre.includes('"url":"integrer/"'), 'la page principale mene au guide');
});
