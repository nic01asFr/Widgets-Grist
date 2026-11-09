/*
 * noyau-saisies.mjs — la sortie ESM du noyau, engendrée depuis la source UMD. Le kit la copie : elle doit être
 * à jour, pure, déterministe, et se comporter comme la source.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Umd = require('../shared/noyau-saisies.js');
const { fabriquer, SORTIE } = require('../outils/generer-noyau-esm.js');

function vecteurs(nom) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'noyau-saisies', nom), 'utf8'));
}

describe('sortie ESM du noyau', () => {
  // Une extraction Windows peut convertir les fins de ligne : on compare le contenu, pas la conversion du poste.
  const contenu = fs.existsSync(SORTIE) ? fs.readFileSync(SORTIE, 'utf8').replace(/\r\n/g, '\n') : '';

  it('est à jour : engendrée depuis la source, rien retouché à la main', () => {
    assert.equal(contenu, fabriquer(), 'relancer : node projects/grist_forms/outils/generer-noyau-esm.js');
  });
  it('est déterministe : fins de ligne LF, aucune date', () => {
    assert.ok(!fabriquer().includes('\r'), 'le générateur doit produire des fins de ligne LF');
    assert.doesNotMatch(contenu, /\b20\d\d-\d\d-\d\d\b/);
    assert.equal(fabriquer(), fabriquer());
  });
  it('est de l\'ESM pur : aucun import, aucun require, aucun effet de bord à l\'import', () => {
    const code = contenu.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(code, /^\s*import\s/m);
    assert.doesNotMatch(code, /\brequire\s*\(/);
    assert.doesNotMatch(code, /\bmodule\.exports\b/);
    assert.doesNotMatch(code, /\bdefine\.amd\b/);
    assert.ok(/^export const \{/m.test(contenu));
  });
  it('garde la bannière de licence d\'une ligne', () => {
    assert.match(contenu.split('\n')[0], /Licence MIT/);
  });
  it('ne porte ni nom d\'organisation ni adresse ni clé', () => {
    assert.doesNotMatch(contenu, /https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i);
    assert.doesNotMatch(contenu, /\bsk-[A-Za-z0-9]/);
  });

  it('expose les mêmes noms que l\'enveloppe UMD', async () => {
    const Esm = await import(require('node:url').pathToFileURL(SORTIE).href);
    assert.deepEqual(Object.keys(Esm).sort(), Object.keys(Umd).sort());
  });
  it('se comporte comme la source sur les vecteurs communs', async () => {
    const Esm = await import(require('node:url').pathToFileURL(SORTIE).href);
    vecteurs('statuts.vecteurs.json').cas.forEach((c) => {
      assert.equal(Esm.genreDepuisStatut(c.statut), Umd.genreDepuisStatut(c.statut), String(c.statut));
    });
    vecteurs('resolution.vecteurs.json').cas.forEach((c) => {
      assert.deepEqual(Esm.resoudreSaisie(c.entree.champ, null, c.entree.refus), Umd.resoudreSaisie(c.entree.champ, null, c.entree.refus), c.nom);
    });
    vecteurs('assainir.vecteurs.json').cas.forEach((c) => {
      assert.equal(Esm.assainirMessage(c.message, c.secrets), Umd.assainirMessage(c.message, c.secrets), c.nom);
    });
    vecteurs('limites.vecteurs.json').cas.forEach((c) => {
      assert.deepEqual(Esm.controlerLimites(c.entree.piece, c.entree.limites), Umd.controlerLimites(c.entree.piece, c.entree.limites), c.nom);
    });
    assert.deepEqual(Array.from(Esm.GENRES), Array.from(Umd.GENRES));
  });
  it('un appel de service se comporte de même (asynchrone, réessai)', async () => {
    const Esm = await import(require('node:url').pathToFileURL(SORTIE).href);
    const attentes = [];
    let n = 0;
    const service = { appeler: async () => { n += 1; return n < 3 ? { statut: 503 } : { statut: 200, valeurs: { a: 1 } }; } };
    const r = await Esm.appelerService(service, null, { attendre: async (ms) => { attentes.push(ms); } });
    assert.equal(r.ok, true);
    assert.equal(r.tentatives, 3);
    assert.deepEqual(attentes, [500, 1500]);
  });
});
