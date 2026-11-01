/**
 * Lisibilité de ce qui est réellement POSÉ sur l'interface (pas seulement de ce que le contrat dérive) : pour chaque thème d'instance connu, en clair et en sombre, les jetons que la chaîne
 * ThemeDef -> application pose tiennent leurs paires (texte 4,5:1 sur le fond et sur les surfaces, accent 4,5:1 sur le fond et la surface). Aucun état illisible, quelle que soit l'instance.
 * node --test projects/Atlas/tests/theme-instance-lisibilite.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { themeDeLInstance } from '../lib/charte/theme-instance.js';
import { charteDepuisThemeDef } from '../lib/charte/depuis-themedef.js';
import { habillageApplication } from '../lib/charte/theme-document.js';
import { contraste } from '../lib/charte/couleurs.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const V = JSON.parse(fs.readFileSync(path.join(ICI, 'fixtures', 'themedef-instance.vecteurs.json'), 'utf8'));
const CLAIR = { appearance: 'light', name: 'GristLight', colors: { 'control-primary-bg': '#16b378', 'primary-muted': '#009058', 'primary-dim': '#007548', 'page-bg': '#f7f7f7', 'text': '#262633' } };
const SOMBRE = { appearance: 'dark', name: 'GristDark', colors: { 'control-primary-bg': '#157a54', 'primary-muted': '#1da270', 'primary-dim': '#157a54', 'link': '#17b378', 'control-fg': '#17b378', 'primary': '#17b378', 'page-bg': '#262633', 'text': '#efefef' } };
const DINUM = { appearance: 'light', name: 'numerique.gouv', colors: { 'control-primary-bg': '#3E5DE7', 'page-bg': '#F6F8F9', 'text': '#222631' } };

/** Ce que l'application pose pour ce thème d'instance, comme `appliquerThemeInstance`. */
function pose(theme) {
  const t = themeDeLInstance(theme);
  if (!t.themedef) return { t, variables: null };
  const r = charteDepuisThemeDef(t.themedef, { mode: t.sombre ? 'sombre' : 'clair' });
  return { t, variables: r.charte ? habillageApplication({ charte: r.charte }).variables : null };
}

const CAS = [['GristLight', CLAIR], ['GristDark', SOMBRE], ['numerique.gouv', DINUM]];
for (const c of V.cas) if (c.entree && c.entree.vars && c.entree.apparence && /^v\d/.test(c.id)) CAS.push([c.id, { appearance: c.entree.apparence === 'sombre' ? 'dark' : 'light', name: c.id, colors: c.entree.vars }]);

for (const [nom, theme] of CAS) {
  test('thème d\'instance « ' + nom + ' » : ce qui est posé tient ses paires de lisibilité (ou rien n\'est posé)', () => {
    const { variables } = pose(theme);
    if (!variables) return;   // refus entier : l'application garde ses jetons d'origine, rien d'illisible
    const v = (k) => variables[k];
    const surfaces = ['--bg', '--surface'].filter((k) => /^#[0-9a-f]{6}$/i.test(v(k) || ''));
    for (const s of surfaces) {
      for (const fg of ['--ink', '--accent']) if (/^#[0-9a-f]{6}$/i.test(v(fg) || '')) assert.ok(contraste(v(fg), v(s)) >= 4.5, nom + ' : ' + fg + ' ' + v(fg) + ' sur ' + s + ' ' + v(s) + ' = ' + contraste(v(fg), v(s)).toFixed(2));
    }
    if (/^#[0-9a-f]{6}$/i.test(v('--muted') || '') && surfaces.includes('--bg')) assert.ok(contraste(v('--muted'), v('--bg')) >= 4.5, nom + ' : --muted ' + v('--muted') + ' sur le fond = ' + contraste(v('--muted'), v('--bg')).toFixed(2));
  });
}
