/**
 * Durcissement : une balise meta CSP interdit <base>, <object>/<embed> et les formulaires vers l'extérieur.
 * node --test projects/Atlas/tests/csp-meta.test.js
 *
 * GitHub Pages n'envoie aucun en-tête de sécurité. Une balise meta honore `base-uri`, `object-src` et
 * `form-action` (pas `frame-ancestors`, `report-uri` ni `sandbox`). On n'y met aucun `script-src` : les
 * gestionnaires `onclick="A.…"` et l'import map en ligne en ont besoin (audit D1, 09/10/2026).
 *
 * Le test vérifie la balise, et que la page et les scripts qu'elle charge n'emploient aucun de ces éléments :
 * sinon la directive casserait une fonction réelle.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJETS = path.join(RACINE, '..');
const HTML = fs.readFileSync(path.join(RACINE, 'index_v7.html'), 'utf8');

/** Le HTML sans ses commentaires : un commentaire n'est pas un élément. */
const sansCommentairesHtml = (s) => s.replace(/<!--[\s\S]*?-->/g, '');

function directives(contenu) {
  const out = new Map();
  for (const part of contenu.split(';').map((p) => p.trim()).filter(Boolean)) {
    const [nom, ...valeurs] = part.split(/\s+/);
    out.set(nom.toLowerCase(), valeurs);
  }
  return out;
}

describe('balise meta Content-Security-Policy de index_v7.html', () => {
  const metas = [...sansCommentairesHtml(HTML).matchAll(/<meta\s+http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/gi)];

  it('il y en a une, et une seule', () => {
    assert.equal(metas.length, 1);
  });

  it('elle pose base-uri, object-src et form-action, et rien d’autre', () => {
    const contenu = /content\s*=\s*"([^"]*)"/i.exec(metas[0][0])[1];
    const d = directives(contenu);
    assert.deepEqual(d.get('base-uri'), ["'self'"]);
    assert.deepEqual(d.get('object-src'), ["'none'"]);
    assert.deepEqual(d.get('form-action'), ["'self'"]);
    assert.deepEqual([...d.keys()].sort(), ['base-uri', 'form-action', 'object-src']);
  });

  it('elle n’emploie aucune directive ignorée par une balise meta, ni script-src', () => {
    const contenu = /content\s*=\s*"([^"]*)"/i.exec(metas[0][0])[1];
    assert.doesNotMatch(contenu, /frame-ancestors|report-uri|sandbox|script-src|default-src/i);
  });

  it('elle précède tout script, feuille de style et lien de la page', () => {
    const tete = sansCommentairesHtml(HTML);
    const posMeta = tete.search(/<meta\s+http-equiv\s*=\s*["']Content-Security-Policy/i);
    const premier = tete.search(/<(script|link|style|base)\b/i);
    assert.ok(posMeta > 0 && premier > posMeta, 'la balise doit venir avant le premier <script>/<link>');
  });
});

/* ------------------------------------------------------------------ */
/* Atlas n'emploie aucun des éléments que la directive interdit.       */
/* ------------------------------------------------------------------ */

/** Les scripts de la page : app_v7.js, lib/ et le moteur de formulaire de grist_forms. */
function sourcesChargees() {
  const fichiers = [path.join(RACINE, 'app_v7.js')];
  for (const f of fs.readdirSync(path.join(RACINE, 'lib'))) if (f.endsWith('.js')) fichiers.push(path.join(RACINE, 'lib', f));
  for (const rel of [...HTML.matchAll(/<script[^>]+src="(\.\.\/grist_forms\/[^"?]+)/g)].map((m) => m[1])) {
    fichiers.push(path.join(RACINE, rel));
  }
  return fichiers.map((f) => ({ f: path.relative(PROJETS, f).replace(/\\/g, '/'), src: fs.readFileSync(f, 'utf8') }));
}

/** Le JavaScript sans ses commentaires : « <base> » dans une explication n'est pas un élément. */
const sansCommentairesJs = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"`\\])(\/\/[^\n]*)/g, (m, avant, c) => avant + ' '.repeat(c.length));

describe('Atlas n’emploie ni <base>, ni <object>, ni <embed>, ni formulaire vers l’extérieur', () => {
  it('la page elle-même', () => {
    const h = sansCommentairesHtml(HTML);
    assert.doesNotMatch(h, /<(base|object|embed)\b/i);
    assert.doesNotMatch(h, /<form\b[^>]*\baction\s*=/i);
  });

  it('les scripts chargés par la page', () => {
    const sources = sourcesChargees();
    assert.ok(sources.some((s) => s.f.includes('grist_forms/runtime/engine.js')), 'le moteur de formulaire doit être balayé');
    const fautes = [];
    for (const { f, src } of sources) {
      const code = sansCommentairesJs(src);
      code.split('\n').forEach((ligne, i) => {
        if (/<(base|object|embed)[\s>]/i.test(ligne)) fautes.push(`${f}:${i + 1} élément interdit : ${ligne.trim().slice(0, 90)}`);
        if (/<form\b[^>]*\baction\s*=/i.test(ligne)) fautes.push(`${f}:${i + 1} formulaire avec action : ${ligne.trim().slice(0, 90)}`);
        if (/createElement\(\s*['"`](base|object|embed|form)['"`]/.test(ligne)) fautes.push(`${f}:${i + 1} élément créé : ${ligne.trim().slice(0, 90)}`);
        if (/\.(action|formAction)\s*=[^=]|setAttribute\(\s*['"`](action|formaction)['"`]/i.test(ligne)) fautes.push(`${f}:${i + 1} action posée : ${ligne.trim().slice(0, 90)}`);
        if (/\.submit\(\)/.test(ligne) && /form/i.test(ligne)) fautes.push(`${f}:${i + 1} envoi de formulaire : ${ligne.trim().slice(0, 90)}`);
      });
    }
    assert.deepEqual(fautes, [], fautes.join('\n'));
  });

  it('les formulaires du moteur n’ont pas d’action : ils s’envoient en JavaScript, vers le document', () => {
    const engine = fs.readFileSync(path.join(PROJETS, 'grist_forms/runtime/engine.js'), 'utf8');
    const formes = [...engine.matchAll(/<form\b[^>]*>/g)].map((m) => m[0]);
    assert.ok(formes.length >= 1);
    for (const f of formes) assert.doesNotMatch(f, /\baction\s*=/);
  });
});
