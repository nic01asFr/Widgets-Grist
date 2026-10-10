/**
 * L'attribution d'une source de carte est du texte et des liens, jamais une balise active.
 * node --test projects/Atlas/tests/attribution.test.js
 *
 * Défaut D1 de l'audit du 09/10/2026 : `?scene=` fait écrire l'attribution d'une couche de
 * tuiles dans le DOM par MapLibre (`innerHTML`) ; un `<iframe srcdoc>` y exécutait un script.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attributionSure, ATTRIBUTION_MAX } from '../lib/attribution.js';
import { coucheTuilesRaster } from '../lib/scene-loader.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(ICI, '..');

/** Ce que MapLibre 5.6 laisse passer, et que l'audit a vu s'exécuter ou charger une ressource. */
const VECTEURS = [
  `<iframe srcdoc="<script>top.x=1</script>"></iframe>`,
  `<form action="https://evil.example/x"><input name=a></form>`,
  `<base href="https://evil.example/">`,
  `<link rel=stylesheet href="https://evil.example/c.css">`,
  `<meta http-equiv=refresh content="0;url=https://evil.example/">`,
  `<object data="https://evil.example/o"></object>`,
  `<embed src="https://evil.example/e">`,
  `<a href="https://evil.example" style="position:fixed;inset:0">x</a>`,
  `<img src=x onerror="top.x=1">`,
  `<a href="javascript:top.x=1">x</a>`,
  `<a href="  JaVa\tScRiPt:top.x=1">x</a>`,
  `<a href="data:text/html,<script>top.x=1</script>">x</a>`,
  `<script>top.x=1</script>`,
  `<svg onload=top.x=1><circle/></svg>`,
  `<style>*{display:none}</style>`,
  `<a href="https://ok.example" onclick="top.x=1">x</a>`,
  `<b onmouseover="top.x=1">x</b>`,
];

describe('attributionSure : ce qui est dangereux ne sort jamais', () => {
  for (const v of VECTEURS) {
    it(`neutralise ${v.slice(0, 50)}`, () => {
      const r = attributionSure(v) ?? '';
      assert.doesNotMatch(r, /<(?!\/?(?:a|b|strong|i|em)\b)/i, `balise non admise dans : ${r}`);
      assert.doesNotMatch(r, /\son\w+\s*=/i, `gestionnaire d'événement dans : ${r}`);
      assert.doesNotMatch(r, /javascript:|data:|vbscript:/i, `schéma actif dans : ${r}`);
      assert.doesNotMatch(r, /\sstyle\s*=/i, `style dans : ${r}`);
      assert.doesNotMatch(r, /srcdoc|<iframe|<form|<base|<link|<meta|<object|<embed|<script|<style|<svg|<img/i);
    });
  }

  it('le texte d’une balise retirée reste lisible, comme du texte', () => {
    assert.equal(attributionSure('<script>top.x=1</script>Source'), 'Source');
    assert.equal(attributionSure('<iframe srcdoc="x"></iframe>Source'), 'Source');
  });
});

describe('attributionSure : les attributions légitimes s’affichent toujours', () => {
  it('un texte simple, avec © et caractères accentués, passe tel quel', () => {
    assert.equal(attributionSure('© IGN / Géoplateforme'), '© IGN / Géoplateforme');
    assert.equal(attributionSure('Terrain: Mapzen / AWS'), 'Terrain: Mapzen / AWS');
  });

  it('un lien http(s) est gardé, ouvert dans un autre onglet sans référent', () => {
    assert.equal(
      attributionSure('© <a href="https://www.openstreetmap.org/copyright">Contributeurs OpenStreetMap</a>'),
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">Contributeurs OpenStreetMap</a>',
    );
    assert.match(attributionSure(`<a href='http://exemple.org/x?a=1&b=2'>x</a>`), /^<a href="http:\/\/exemple\.org\/x\?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">x<\/a>$/);
  });

  it('l’entité &copy; et &amp; restent lisibles', () => {
    assert.equal(attributionSure('&copy; Fonds &amp; données'), '&copy; Fonds &amp; données');
  });

  it('une mise en forme minimale passe', () => {
    assert.equal(attributionSure('<b>Ville</b> / <em>Région</em>'), '<b>Ville</b> / <em>Région</em>');
  });

  it('un texte avec « < » reste du texte', () => {
    assert.equal(attributionSure('a < b'), 'a &lt; b');
  });
});

describe('attributionSure : bornes', () => {
  it('rien à afficher : null', () => {
    for (const v of [undefined, null, '', '   ', {}, [], '<script>x</script>', '<iframe></iframe>']) {
      assert.equal(attributionSure(v), null, JSON.stringify(v));
    }
  });

  it('un nombre ou un booléen devient du texte', () => {
    assert.equal(attributionSure(2026), '2026');
  });

  it('est tronquée avant l’analyse et ne laisse pas de balise ouverte', () => {
    const r = attributionSure('x'.repeat(ATTRIBUTION_MAX - 5) + '<a href="https://exemple.org/long">lien</a>');
    assert.ok(r.length < ATTRIBUTION_MAX + 80, `longueur ${r.length}`);
    assert.doesNotMatch(r, /<a [^>]*$/);
  });

  it('est idempotente : l’appliquer deux fois ne change rien', () => {
    for (const v of [...VECTEURS, '© <a href="https://exemple.org">x &amp; y</a>', '&copy; IGN', 'a < b']) {
      const une = attributionSure(v);
      assert.equal(attributionSure(une), une, v);
    }
  });
});

describe('site 1 — scene-loader : l’attribution d’une couche raster d’une scène', () => {
  const origine = { valeur: 'https://tuiles.exemple.org/{z}/{x}/{y}.png' };

  it('D1 : un <iframe srcdoc> dans `attribution` n’atteint pas la couche', () => {
    const c = coucheTuilesRaster({ id: 't', attribution: VECTEURS[0] + 'Source' }, origine);
    assert.equal(c._attribution, 'Source');
    assert.doesNotMatch(c._attribution, /[<>]/);
  });

  it('`credits` est assaini comme `attribution`', () => {
    const c = coucheTuilesRaster({ id: 't', credits: `<img src=x onerror="top.x=1">Crédit` }, origine);
    assert.equal(c._attribution, 'Crédit');
  });

  it('une attribution à liens légitimes est conservée', () => {
    const c = coucheTuilesRaster({ id: 't', attribution: '© <a href="https://exemple.org">Exemple</a>' }, origine);
    assert.equal(c._attribution, '© <a href="https://exemple.org" target="_blank" rel="noopener noreferrer">Exemple</a>');
  });

  it('sans attribution : null', () => {
    assert.equal(coucheTuilesRaster({ id: 't' }, origine)._attribution, null);
    assert.equal(coucheTuilesRaster({ id: 't', attribution: '<iframe></iframe>' }, origine)._attribution, null);
  });
});

/* ------------------------------------------------------------------ */
/* Balayage de source : aucune attribution n'atteint MapLibre sans passer par attributionSure. */
/* ------------------------------------------------------------------ */

function sources() {
  const fichiers = [path.join(RACINE, 'app_v7.js')];
  const lib = path.join(RACINE, 'lib');
  for (const f of fs.readdirSync(lib)) if (f.endsWith('.js')) fichiers.push(path.join(lib, f));
  return fichiers.map((f) => ({ f: path.relative(RACINE, f).replace(/\\/g, '/'), src: sansCommentaires(fs.readFileSync(f, 'utf8')) }));
}

/** Une valeur littérale sans balise : ce qu'on écrit à la main dans le code est de confiance. */
const LITTERAL_SANS_BALISE = /^(?:\d+|'[^'<>\\]*'|"[^"<>\\]*"|`[^`<>\\$]*`)$/;

/** Le code sans ses commentaires (les lignes gardent leur numéro) : un commentaire n'atteint pas MapLibre. */
function sansCommentaires(src) {
  const blanc = (m) => m.replace(/[^\n]/g, ' ');
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blanc)
    .replace(/(^|[^:'"`\\])(\/\/[^\n]*)/g, (m, avant, commentaire) => avant + blanc(commentaire));
}

/** Les affectations `attribution: …` et `_attribution: …`, avec leur valeur jusqu'à la virgule ou l'accolade. */
function affectations(src) {
  const sorties = [];
  const re = /(?<![\w$.])(_?attribution)\s*:\s*/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    let profondeur = 0;
    let valeur = '';
    let guillemet = null;
    for (; i < src.length; i++) {
      const c = src[i];
      if (guillemet) {
        valeur += c;
        if (c === '\\') { valeur += src[++i] ?? ''; continue; }
        if (c === guillemet) guillemet = null;
        continue;
      }
      if (c === '\'' || c === '"' || c === '`') { guillemet = c; valeur += c; continue; }
      if (c === '(' || c === '[' || c === '{') profondeur++;
      if (c === ')' || c === ']' || c === '}') { if (profondeur === 0) break; profondeur--; }
      if (c === ',' && profondeur === 0) break;
      if (c === '\n' && profondeur === 0) break;
      valeur += c;
    }
    sorties.push({ nom: m[1], valeur: valeur.trim(), ligne: src.slice(0, m.index).split('\n').length });
  }
  return sorties;
}

describe('balayage de source : attribution vers MapLibre', () => {
  it('toute `attribution:` non littérale passe par attributionSure()', () => {
    const fautes = [];
    let vues = 0;
    for (const { f, src } of sources()) {
      for (const a of affectations(src)) {
        vues++;
        if (LITTERAL_SANS_BALISE.test(a.valeur)) continue;
        if (/^attributionSure\(/.test(a.valeur)) continue;
        fautes.push(`${f}:${a.ligne} ${a.nom}: ${a.valeur.slice(0, 80)}`);
      }
    }
    assert.ok(vues >= 5, `le balayage ne voit presque rien (${vues}) : l'expression régulière est cassée`);
    assert.deepEqual(fautes, [], 'attribution posée sans attributionSure() :\n' + fautes.join('\n'));
  });

  it('le balayage sait voir une faute (témoin)', () => {
    const faux = `map.addSource('x', { type: 'raster', attribution: layer._attribution });\n`
      + `const o = { _attribution: ml.attribution || ml.credits || null };`;
    const lues = affectations(faux);
    assert.equal(lues.length, 2);
    assert.ok(lues.every((a) => !LITTERAL_SANS_BALISE.test(a.valeur) && !/^attributionSure\(/.test(a.valeur)));
  });

  it('aucune autre porte vers l’attribution de MapLibre : ni contrôle personnalisé, ni setter', () => {
    const interdits = /\b(customAttribution|setAttribution|AttributionControl|attributionControl\s*:\s*(?!false))/;
    const fautes = [];
    for (const { f, src } of sources()) {
      src.split('\n').forEach((l, i) => { if (interdits.test(l) && !/^\s*(\/\/|\*)/.test(l)) fautes.push(`${f}:${i + 1} ${l.trim()}`); });
    }
    assert.deepEqual(fautes, [], fautes.join('\n'));
  });

  it('app_v7.js importe attributionSure et l’emploie à la pose des sources', () => {
    const app = fs.readFileSync(path.join(RACINE, 'app_v7.js'), 'utf8');
    assert.match(app, /import \{ attributionSure \} from '\.\/lib\/attribution\.js/);
    assert.match(app, /attribution: attributionSure\(layer\._attribution\)/);
    assert.match(app, /attribution: attributionSure\(cfg\.attribution\)/);
  });
});
