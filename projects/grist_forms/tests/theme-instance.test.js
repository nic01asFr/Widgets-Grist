'use strict';

/**
 * Le thème de l'instance Grist : la fonction pure `shared/theme-instance.js` est une COPIE MÉCANIQUE du contrat du kit
 * (docs/THEMEDEF-INSTANCE-GRIST.md). Ces tests gardent la copie : mêmes empreintes que celles inscrites dans l'en-tête, et les 32 vecteurs du kit
 * rejoués un à un, à l'identique (la sortie complète, champ par champ).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const I = require('../shared/theme-instance.js');
const FICHIER = fs.readFileSync(path.join(__dirname, '..', 'shared', 'theme-instance.js'), 'utf8');
const BRUT = fs.readFileSync(path.join(__dirname, 'fixtures', 'themedef-instance.vecteurs.json'));
const VEC = JSON.parse(BRUT.toString('utf8'));

describe('Thème de l\'instance : la copie du kit est intacte', () => {
  it('les vecteurs sont ceux de l\'empreinte inscrite dans l\'en-tête de la copie', () => {
    const inscrite = /vecteurs sha256 ([0-9a-f]{64})/.exec(FICHIER);
    assert.ok(inscrite, 'l\'en-tête donne l\'empreinte des vecteurs');
    assert.equal(crypto.createHash('sha256').update(BRUT).digest('hex'), inscrite[1]);
  });

  it('la copie n\'importe rien et ne touche ni au DOM ni au réseau', () => {
    assert.ok(!/^\s*import\s/m.test(FICHIER) && !/\brequire\(/.test(FICHIER.replace(/typeof module[^\n]*\n[^\n]*/, '')));
    assert.ok(!/document\.|window\.|fetch\(|XMLHttpRequest|localStorage/.test(FICHIER.replace(/\/\*[\s\S]*?\*\//g, '')));
  });

  it('expose la fonction et les constantes du contrat, et rien d\'autre en plus', () => {
    assert.deepEqual(Object.keys(I).sort(), ['CANDIDATS_ACTION', 'CLES_INSTANCE', 'FONDS_DERIVES', 'LONGUEUR_PILE', 'SEUIL_INSTANCE', 'SURFACE_SOMBRE', 'VERSION_THEMEDEF_INSTANCE', 'contrasteInstance', 'hexSur', 'pileSure', 'themeInstance']);
  });
});

describe('Thème de l\'instance : les 32 vecteurs du kit, rejoués à l\'identique', () => {
  it('le fichier porte 32 cas et la version attendue', () => {
    assert.equal(VEC.format, 'themedef-instance-vecteurs/1.0');
    assert.equal(VEC.cas.length, 32);
  });

  for (const c of VEC.cas) {
    it(c.id, () => {
      assert.deepEqual(I.themeInstance(c.entree), c.attendu);
    });
  }

  it('l\'ordre des candidates d\'action est celui des constantes du kit', () => {
    assert.deepEqual([...I.CANDIDATS_ACTION], VEC.constantes.candidats);
    assert.deepEqual([...I.CLES_INSTANCE], VEC.constantes.cles);
  });
});

describe('Thème de l\'instance : les instances réelles mesurées', () => {
  const reel = (id) => VEC.cas.find((c) => c.id === id);

  it('GristLight : l\'action est primary-dim #007548, une couleur propre de Grist', () => {
    const r = I.themeInstance(reel('v1-clair-mesure').entree);
    assert.equal(r.themedef.graines.principal, '#007548');
    assert.equal(r.fond, '#f7f7f7');
    assert.equal(r.texte, '#262633');
  });

  it('une instance à palette propre : l\'action #3e5de7 est reprise telle quelle (5,02:1), sans redressement', () => {
    const r = I.themeInstance(reel('v3-palette-propre-clair').entree);
    assert.equal(r.themedef.graines.principal, '#3e5de7');
    assert.ok(!r.notes.some((n) => n.code === 'action-redressee'));
  });

  it('en sombre, le ThemeDef ne porte que la principale ; fond, texte et pile sont rendus à part', () => {
    for (const id of ['v2-sombre-code-source', 'v14-sombre-a-part']) {
      const r = I.themeInstance(reel(id).entree);
      assert.deepEqual(Object.keys(r.themedef.graines), ['principal'], id);
      assert.ok('fond' in r && 'texte' in r && 'pile' in r, id);
    }
  });

  it('une entrée vide ne donne aucun thème, sans bruit', () => {
    assert.deepEqual(I.themeInstance({}), { themedef: null, mode: null, notes: [], fond: null, texte: null, pile: null, surface: null, surfaceDouce: null });
  });
});
