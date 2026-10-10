import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SOURCES_IMPORT, boutonsSourcesImport, entreesPaletteSources } from '../lib/sources-import.js';

const echapper = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const icone = (n) => `<svg data-i="${n}"></svg>`;
const app = readFileSync(fileURLToPath(new URL('../app_v7.js', import.meta.url)), 'utf8');

describe('sources-import — le registre', () => {
  it('OpenStreetMap d’abord, comme avant, puis l’IGN', () => {
    assert.deepEqual(SOURCES_IMPORT.map((s) => s.id), ['osm', 'ign']);
  });

  it('chaque source est complète, et son ouverture existe dans A (app_v7.js)', () => {
    for (const s of SOURCES_IMPORT) {
      for (const k of ['id', 'nom', 'libelle', 'icone', 'titre', 'ouvrir']) assert.ok(typeof s[k] === 'string' && s[k], `${s.id}.${k}`);
      assert.match(app, new RegExp(`\\b${s.ouvrir}\\b\\s*[,:]`), `A.${s.ouvrir} introuvable dans app_v7.js`);
    }
  });

  it('les boutons appellent A.<ouvrir>() et portent un titre et un libellé', () => {
    const h = boutonsSourcesImport(icone, echapper);
    assert.match(h, /onclick="A\.openOSM\(\)" title="Importer depuis OpenStreetMap">.*OSM<\/button>/);
    assert.match(h, /onclick="A\.openIGN\(\)" title="Importer des données de l’IGN[^"]*">.*IGN<\/button>/);
    assert.equal((h.match(/<button/g) || []).length, SOURCES_IMPORT.length);
  });

  it('les icônes sont celles que l’application sait dessiner (globe, carte)', () => {
    const noms = new Set(SOURCES_IMPORT.map((s) => s.icone));
    for (const n of noms) assert.match(app, new RegExp(`^    ${n}:`, 'm'), `IC.${n}`);
  });

  it('la palette propose « Importer depuis OSM » comme avant, et l’IGN', () => {
    const lancees = [];
    const e = entreesPaletteSources({ icone, lancer: (s) => lancees.push(s.id) });
    assert.deepEqual(e.map((x) => x.label), ['Importer depuis OSM', 'Importer depuis IGN']);
    assert.ok(e.every((x) => x.kind === 'action'));
    e[1].run();
    assert.deepEqual(lancees, ['ign']);
  });

  it('une source ajoutée au registre a son bouton sans autre changement', () => {
    const plus = [...SOURCES_IMPORT, { id: 'x', nom: 'Autre', libelle: 'Autre', icone: 'carte', titre: 't', ouvrir: 'openAutre' }];
    assert.match(boutonsSourcesImport(icone, echapper, plus), /A\.openAutre\(\)/);
  });

  it('échappe titres et libellés', () => {
    const h = boutonsSourcesImport(icone, echapper, [{ id: 'x', nom: 'x', libelle: '<b>', icone: 'carte', titre: '"><i>', ouvrir: 'openX' }]);
    assert.doesNotMatch(h, /<b>|<i>/);
  });
});
