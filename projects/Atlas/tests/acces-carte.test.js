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

describe('acces-carte — câblage dans app_v7.js (source-scan)', () => {
  const src = fs.readFileSync(path.join(racine, 'app_v7.js'), 'utf8');

  it('importe le module et pose le point d\'accès à côté du handle de débogage', () => {
    assert.match(src, /import \{ exposerCarte, signalerCartePrete \} from '\.\/lib\/acces-carte\.js\?v=[^']+';/);
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
