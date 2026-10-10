/**
 * Accès officiel à la carte (lib/acces-carte.js) et son câblage dans app_v7.js.
 * node --test projects/Atlas/tests/acces-carte.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exposerCarte, signalerCartePrete, attendreCarte, EVENEMENT_CARTE_PRETE } from '../lib/acces-carte.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Une cible minimale : addEventListener / removeEventListener / dispatchEvent. */
function fausseFenetre() {
  const ecouteurs = new Map();
  return {
    CustomEvent,
    addEventListener(t, f) { (ecouteurs.get(t) || ecouteurs.set(t, new Set()).get(t)).add(f); },
    removeEventListener(t, f) { ecouteurs.get(t)?.delete(f); },
    dispatchEvent(e) { for (const f of [...(ecouteurs.get(e.type) || [])]) f(e); return true; },
    nb: (t) => ecouteurs.get(t)?.size || 0,
  };
}

describe('acces-carte — contrat', () => {
  it('le nom de l\'événement est stable', () => assert.equal(EVENEMENT_CARTE_PRETE, 'atlas:carte-prete'));

  it('exposerCarte pose __atlasCarte et laisse la carte « non prête »', () => {
    const w = fausseFenetre(); const carte = {};
    assert.equal(exposerCarte(w, carte), true);
    assert.equal(w.__atlasCarte, carte);
    assert.equal(w.__atlasCartePrete, false);
  });

  it('exposerCarte refuse une cible ou une carte absente', () => {
    assert.equal(exposerCarte(null, {}), false);
    assert.equal(exposerCarte({}, null), false);
  });

  it('signalerCartePrete émet une seule fois, avec la carte dans detail', () => {
    const w = fausseFenetre(); const carte = {}; exposerCarte(w, carte);
    const recus = []; w.addEventListener(EVENEMENT_CARTE_PRETE, (e) => recus.push(e.detail.carte));
    assert.equal(signalerCartePrete(w, carte), true);
    assert.equal(signalerCartePrete(w, carte), false);
    assert.deepEqual(recus, [carte]);
    assert.equal(w.__atlasCartePrete, true);
  });

  it('un écouteur qui lève ne casse pas le signal', () => {
    const w = { __atlasCartePrete: false, CustomEvent, dispatchEvent() { throw new Error('écouteur'); } };
    assert.doesNotThrow(() => signalerCartePrete(w, {}));
  });
});

describe('acces-carte — attendreCarte', () => {
  it('résout tout de suite si la carte est déjà prête', async () => {
    const w = fausseFenetre(); const carte = {}; exposerCarte(w, carte); signalerCartePrete(w, carte);
    assert.equal(await attendreCarte(w), carte);
  });

  it('résout à l\'événement et nettoie son écouteur', async () => {
    const w = fausseFenetre(); const carte = {}; exposerCarte(w, carte);
    const p = attendreCarte(w, { delai: 5000 });
    assert.equal(w.nb(EVENEMENT_CARTE_PRETE), 1);
    signalerCartePrete(w, carte);
    assert.equal(await p, carte);
    assert.equal(w.nb(EVENEMENT_CARTE_PRETE), 0);
  });

  it('rejette après le délai maximal', async () => {
    const w = fausseFenetre(); exposerCarte(w, {});
    await assert.rejects(attendreCarte(w, { delai: 20 }), /indisponible/);
    assert.equal(w.nb(EVENEMENT_CARTE_PRETE), 0);
  });
});

describe('acces-carte — attente sans limite (cadre non rendu)', () => {
  it('delai: Infinity ou 0 : ne rejette jamais, résout quand la carte devient prête', async () => {
    for (const delai of [Infinity, 0]) {
      const w = fausseFenetre(); const carte = {}; exposerCarte(w, carte);
      let fini = false;
      const p = attendreCarte(w, { delai }).then((c) => { fini = true; return c; });
      await new Promise((r) => setTimeout(r, 60));
      assert.equal(fini, false, "pas de rejet ni de résolution tant que la carte n'est pas prête (delai " + delai + ')');
      signalerCartePrete(w, carte);
      assert.equal(await p, carte);
    }
  });

  it("le point d'entrée du composant BI attend la carte sans limite", () => {
    const src = fs.readFileSync(path.join(racine, 'lib', 'bi', 'montage.js'), 'utf8');
    assert.match(src, /attendreCarte\(fenetre, \{ delai: Infinity \}\)/);
  });
});

describe('acces-carte — câblage dans app_v7.js (source-scan)', () => {
  const src = fs.readFileSync(path.join(racine, 'app_v7.js'), 'utf8');

  it('importe le module et pose le point d\'accès à côté du handle de débogage', () => {
    assert.match(src, /import \{ exposerCarte, signalerCartePrete(?:, styleDeBaseIllisible)? \} from '\.\/lib\/acces-carte\.js\?v=[^']+';/);
    assert.match(src, /window\.__atlasMap = map;[^\n]*\n[^\n]*\n\s*try \{ exposerCarte\(window, map\);/, 'exposerCarte suit la pose de __atlasMap');
  });

  it('garde l\'ancien handle __atlasMap tant qu\'il existe', () => {
    assert.match(src, /window\.__atlasMap = map;/);
  });

  it('signale la carte prête à la fin d\'onStyleReady, une seule fois dans le fichier', () => {
    assert.equal((src.match(/signalerCartePrete\(window, map\)/g) || []).length, 1);
    const debut = src.indexOf('function onStyleReady()');
    const fin = src.indexOf('function saveMapCamera()');
    assert.ok(debut > 0 && fin > debut);
    assert.ok(src.slice(debut, fin).includes('signalerCartePrete(window, map)'), 'dans onStyleReady');
  });
});

describe('acces-carte — style de base illisible (fond de secours)', async () => {
  const { styleDeBaseIllisible } = await import('../lib/acces-carte.js');
  const URL_STYLE = 'https://tiles.example/styles/liberty';
  const err = (message, extra = {}) => ({ error: { message, ...(extra.error || {}) }, ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'error')) });

  it('le reseau manque : oui (comme avant)', () => {
    assert.equal(styleDeBaseIllisible(err('Failed to fetch'), URL_STYLE), true);
    assert.equal(styleDeBaseIllisible(err('NetworkError when attempting to fetch resource'), URL_STYLE), true);
    assert.equal(styleDeBaseIllisible({ error: { message: '', status: 0 } }, URL_STYLE), true);
  });
  it('le serveur du style repond une erreur HTTP (404, 503) : oui — sinon la carte n\'est jamais prete et le composant BI reste muet', () => {
    assert.equal(styleDeBaseIllisible({ error: { message: 'AJAXError: Not Found (404): ' + URL_STYLE, status: 404, url: URL_STYLE } }, URL_STYLE), true);
    assert.equal(styleDeBaseIllisible({ error: { message: 'AJAXError: Service Unavailable (503): ' + URL_STYLE, status: 503, url: URL_STYLE } }, URL_STYLE), true);
  });
  it('le TileJSON d\'une source repond une erreur HTTP : oui', () => {
    assert.equal(styleDeBaseIllisible({ sourceId: 'openmaptiles', error: { message: 'AJAXError: Not Found (404): https://tiles.example/planet', status: 404, url: 'https://tiles.example/planet' } }, URL_STYLE), true);
  });
  it('une tuile, un sprite ou une police manquants : non (la carte se charge sans)', () => {
    assert.equal(styleDeBaseIllisible({ sourceId: 'openmaptiles', tile: { z: 5 }, error: { message: 'AJAXError: Service Unavailable (503): t.pbf', status: 503, url: 'https://tiles.example/planet/5/1/1.pbf' } }, URL_STYLE), false);
    assert.equal(styleDeBaseIllisible({ error: { message: 'AJAXError: Not Found (404): sprite', status: 404, url: 'https://tiles.example/sprites/ofm.json' } }, URL_STYLE), false);
    assert.equal(styleDeBaseIllisible({ error: { message: 'AJAXError: Not Found (404): glyphes', status: 404, url: 'https://tiles.example/fonts/Noto/0-255.pbf' } }, URL_STYLE), false);
  });
  it('sans adresse de style connue, une erreur HTTP du style (sans source) n\'est pas presumee fatale', () => {
    assert.equal(styleDeBaseIllisible({ error: { message: 'AJAXError: Not Found (404)', status: 404, url: 'https://x/y' } }, null), false);
  });
  it('entrees degenerees : jamais d\'exception', () => {
    for (const e of [undefined, null, {}, { error: null }, { error: {} }, { error: { message: 5 } }]) assert.equal(styleDeBaseIllisible(e, URL_STYLE), false);
  });
  it('app_v7.js s\'en sert avant de basculer sur l\'aplat, et un style sans adresse (IGN raster) reste couvert', () => {
    const src = fs.readFileSync(path.join(racine, 'app_v7.js'), 'utf8');
    assert.match(src, /import \{[^}]*styleDeBaseIllisible[^}]*\} from '\.\/lib\/acces-carte\.js\?v=/);
    assert.match(src, /map\.on\('error', \(e\) => \{\s*if \(_fondDeRepli \|\| _styleUsable\) return;\s*if \(!styleDeBaseIllisible\(e, _bm\.url \|\| null\)\) return;/);
  });
});
