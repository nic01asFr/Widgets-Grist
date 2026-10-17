/**
 * L'atelier de style (demos/hote-atelier/index.html) : un formulaire qui fabrique une charte, la pose sur la carte et affiche le code à copier.
 * Ce que le test garde : la page est du JavaScript valide (le gabarit du code à copier contient des balises de script), les chartes d'exemple sont fictives et lisibles,
 * le code produit est l'intégration déclarative documentée, rien n'est chargé d'une adresse choisie par la personne.
 * node --test projects/Atlas/tests/demo-atelier.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DEMO = path.join(ICI, '..', 'demos', 'hote-atelier');
const html = fs.readFileSync(path.join(DEMO, 'index.html'), 'utf8');
const module_ = /<script type="module">([\s\S]*?)\n<\/script>\s*<\/body>/.exec(html);
const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('la page est du JavaScript valide : les balises de script du gabarit sont échappées, un seul script de module', () => {
  assert.ok(module_, 'script de module introuvable');
  assert.doesNotThrow(() => new Function('return (async () => {' + module_[1].replace(/^import .*$/m, '') + '\n})'), 'syntaxe du module');
  assert.equal((html.replace(module_[1], '').match(/<script type="module"/g) || []).length, 1, 'un seul script de module dans la page (le gabarit du code est du texte)');
  assert.ok(module_[1].split('<' + String.fromCharCode(92) + '/script>').length - 1 >= 3, 'le gabarit du code échappe la fermeture des scripts');
});

test('cinq chartes d’exemple fictives, lisibles : texte 4,5:1 et couleur principale 3:1 sur leur fond ; aucun système réel nommé', () => {
  const m = /const PRESETS = \[[\s\S]*?\n\];/.exec(module_[1]); assert.ok(m, 'chartes introuvables');
  const ctx = {}; vm.runInNewContext(m[0] + '\nglobalThis.P = PRESETS;', ctx); const presets = ctx.P;
  assert.equal(presets.length, 5);
  for (const p of presets) {
    for (const k of ['principal', 'secondaire', 'fond', 'encre']) assert.match(p.graines[k], /^#[0-9a-f]{6}$/, p.id + ' ' + k);
    assert.ok(contraste(p.graines.encre, p.graines.fond) >= 4.5, p.id + ' : texte'); assert.ok(contraste(p.graines.principal, p.graines.fond) >= 3, p.id + ' : couleur principale');
  }
  assert.doesNotMatch(html, /dsfr|marianne|material design|bootstrap|carbon|fluent|polaris|ant design/i);
});

test('le code à copier est l’intégration déclarative documentée : un module, une balise, des blocs JSON data-atlas ; aucune adresse choisie par la personne n’est chargée', () => {
  for (const motif of ['atlas-bi-element.js', '<atlas-bi src=', 'data-atlas="charte"', 'data-atlas="donnees"', 'Sans manifeste, Atlas déduit la carte de vos données']) assert.ok(module_[1].includes(motif), motif);
  assert.match(module_[1], /const URL_PUBLIEE = 'https:\/\/nic01asfr\.github\.io\/Widgets-Grist\/atlas\/'/);
  assert.doesNotMatch(module_[1], /fetch\(/, 'la page ne lit aucune adresse');
  assert.match(module_[1], /type: 'application\/json'/); assert.match(module_[1], /replace\(\/\[<>\]\/g, ''\)/, 'le nom d’une charte importée est nettoyé');
});

test('la charte fabriquée ne contient que des clés du format atlas-charte/0.1 et des couleurs hexadécimales choisies par la personne', () => {
  const m = /function charteDepuisEtat\(\) \{[\s\S]*?\n\}\n/.exec(module_[1]); assert.ok(m);
  for (const cle of ['version', 'graines', 'donnees', 'sequentielles', 'divergente', 'qualitative', 'fond', 'intensites', 'vegetation', 'texte', 'famille', 'tailles']) assert.ok(m[0].includes(cle), cle);
  assert.match(m[0], /atlas-charte\/0\.1/);
});

test('les couleurs de marque sont aussi mesurées sur le fond (ce que la charte ne mesure pas)', () => {
  assert.match(module_[1], /function controlesMarque\(\)/); assert.match(module_[1], /\['principal', 'La couleur principale', 3\]/); assert.match(module_[1], /\['encre', 'Le texte', 4\.5\]/);
});
