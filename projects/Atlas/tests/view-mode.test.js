/**
 * Tests mode lecture Atlas.
 * node --test "projects/Atlas/tests/view-mode.test.js"
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAtlasMode,
  accessIntentFromMode,
  canWrite,
  shouldEnableLight3d,
  parseNo3dParam,
  parseNavbarParam,
  resolveAccess,
  isWriteAclError,
  probeCanWriteDoc,
  resolveProbeTableId,
} from '../lib/view-mode.js';

describe('parseAtlasMode', () => {
  it('détecte view / lecture / read', () => {
    assert.equal(parseAtlasMode('?mode=view'), 'view');
    assert.equal(parseAtlasMode('mode=lecture'), 'view');
    assert.equal(parseAtlasMode('?mode=READ'), 'view');
  });

  it('détecte edit', () => {
    assert.equal(parseAtlasMode('?mode=edit'), 'edit');
    assert.equal(parseAtlasMode('?mode=edition'), 'edit');
  });

  it('défaut auto', () => {
    assert.equal(parseAtlasMode(''), 'auto');
    assert.equal(parseAtlasMode('?foo=1'), 'auto');
  });
});

describe('accessIntentFromMode', () => {
  it('view → read table forcé', () => {
    const i = accessIntentFromMode('view');
    assert.equal(i.viewModeForced, true);
    assert.equal(i.requiredAccess, 'read table');
    assert.equal(i.preferFull, false);
  });

  it('edit / auto → full', () => {
    assert.equal(accessIntentFromMode('edit').requiredAccess, 'full');
    assert.equal(accessIntentFromMode('auto').requiredAccess, 'full');
    assert.equal(accessIntentFromMode('auto').viewModeForced, false);
  });
});

describe('canWrite', () => {
  it('interdit en view', () => {
    assert.equal(canWrite(true), false);
    assert.equal(canWrite(false), true);
  });
});

describe('isWriteAclError / probeCanWriteDoc', () => {
  it('détecte messages ACL viewer', () => {
    assert.equal(isWriteAclError(new Error('Cannot modify data in a document when access is view-only')), true);
    assert.equal(isWriteAclError(new Error('Permission denied')), true);
    assert.equal(isWriteAclError(new Error('Row 999 not found')), false);
  });

  it('resolveProbeTableId préfère une table métier', async () => {
    const id = await resolveProbeTableId({
      listTables: async () => ['_Grist_DocInfo_', 'Apiary', 'SceneManifest'],
    });
    assert.equal(id, 'SceneManifest');
  });

  it('probe: ACL → false', async () => {
    const docApi = {
      listTables: async () => ['SceneManifest'],
      applyUserActions: async () => { throw new Error('access is view-only'); },
    };
    assert.equal(await probeCanWriteDoc(docApi), false);
  });

  it('probe: row missing → true (éditeur)', async () => {
    const docApi = {
      listTables: async () => ['SceneManifest'],
      applyUserActions: async () => { throw new Error('Row not found'); },
    };
    assert.equal(await probeCanWriteDoc(docApi), true);
  });

  it('probe: erreur metadata / doute → true (pas bloquer admin)', async () => {
    const docApi = {
      listTables: async () => ['Apiary'],
      applyUserActions: async () => { throw new Error('Cannot yet be used on metadata tables'); },
    };
    assert.equal(await probeCanWriteDoc(docApi), true);
  });
});

describe('shouldEnableLight3d / parseNo3dParam', () => {
  it('no3d force light3d', () => {
    assert.equal(parseNo3dParam('?no3d=1'), true);
    assert.equal(shouldEnableLight3d({ no3dParam: true }), true);
  });

  it('mobile + peu de cœurs', () => {
    assert.equal(shouldEnableLight3d({
      isNarrow: true,
      hardwareConcurrency: 4,
    }), true);
  });

  it('bureau édition : pas light3d par défaut', () => {
    assert.equal(shouldEnableLight3d({
      viewMode: false,
      isNarrow: false,
      hardwareConcurrency: 8,
    }), false);
  });
});

describe('parseNavbarParam — la barre du haut', () => {
  it('est là par défaut', () => {
    assert.equal(parseNavbarParam(''), true);
    assert.equal(parseNavbarParam('?mode=view'), true);
    assert.equal(parseNavbarParam(), true);
  });

  it('ne disparaît que sur une demande explicite', () => {
    for (const v of ['false', 'FALSE', '0', 'no', 'non', ' false ']) {
      assert.equal(parseNavbarParam('?navbar=' + v.trim()), false, v);
    }
  });

  it('et reste sur tout le reste', () => {
    // Se tromper vers le bas masquerait la recherche, le badge de droits et le
    // bouton « Récit » — sans que rien ne dise pourquoi.
    for (const v of ['true', '1', 'yes', '', 'oui', 'faux', 'xyz']) {
      assert.equal(parseNavbarParam('?navbar=' + v), true, JSON.stringify(v));
    }
  });

  it('cohabite avec les autres paramètres', () => {
    assert.equal(parseNavbarParam('?mode=view&navbar=false&no3d=1'), false);
    assert.equal(parseNo3dParam('?mode=view&navbar=false&no3d=1'), true);
  });
});

describe('« probe » veut dire : aucun hôte Grist', () => {
  it('sans rien de transmis, le motif est « probe »', () => {
    // C'est le seul signal qui distingue « Atlas ouvert seul » de « Atlas dans
    // un document » : Grist pose toujours `access` et `readonly` sur l'iframe.
    assert.equal(resolveAccess({ search: '' }).reason, 'probe');
    assert.equal(resolveAccess({ search: '?no3d=1&navbar=false' }).reason, 'probe');
  });

  it('et il devient « grist-full-a-sonder » dès que Grist parle', () => {
    assert.equal(resolveAccess({ search: '?access=full&readonly=false' }).reason, 'grist-full-a-sonder');
  });

  it('ce qui décide si le repli en lecture a un sens', () => {
    // `initGrist` ne se replie en lecture QUE si Grist a parlé : sans hôte il
    // n'y a rien à lire, et basculer la page autonome en lecture lui retirait
    // le rail que sa porte d'accueil promet. Regression vue le 08/09/2026.
    const autonome = resolveAccess({ search: '' });
    assert.equal(autonome.viewMode, false);
    assert.equal(autonome.reason === 'probe', true, 'le repli doit être refusé ici');
  });
});
