import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app_v7.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index_v7.html', import.meta.url), 'utf8');

function bloc(nom) {
  const debut = app.indexOf(`const ${nom} = {`);
  const m = debut < 0 ? null : [null, app.slice(debut, app.indexOf('\n};', debut))];
  assert.ok(m, `${nom} introuvable`);
  return m[1];
}

test('les consignes de saisie et de modification pour le doigt ne parlent ni de clic, ni de souris, ni de clavier', () => {
  for (const nom of ['CONSIGNES_SAISIE_DOIGT', 'CONSIGNES_MODIFICATION_DOIGT']) {
    const t = bloc(nom);
    assert.doesNotMatch(t, /liquez|\bclic\b|\bAlt\b|Entrée|clic droit/i, `${nom} : texte de souris ou de clavier`);
  }
});

test('la consigne de modification au doigt ne promet pas un retrait de sommet qu\'Atlas ne sait pas offrir au toucher', () => {
  assert.doesNotMatch(bloc('CONSIGNES_MODIFICATION_DOIGT'), /retirer|supprim/i);
});

test('la légende dit « touchez pour cibler » au doigt', () => {
  assert.match(html, /@media \(pointer: coarse\) \{\s*\.legend:has\(\.legend-clickable\) \.legend-head \.t::after \{ content: " · touchez pour cibler"/);
});
