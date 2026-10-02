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
  peutProposerBasculeLectureEdition,
  prochainEtatBasculeLectureEdition,
  titreBasculeLectureEdition,
  shouldEnableLight3d,
  parseNo3dParam,
  parseNavbarParam,
  barreRetiree,
  resolveAccess,
  pastilleRecitRequise,
  isWriteAclError,
  probeCanWriteDoc,
  sonderEcritureDoc,
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

describe('bascule session lecture ↔ édition', () => {
  it('proposée seulement si écriture réelle + document ouvert', () => {
    assert.equal(peutProposerBasculeLectureEdition({
      peutSaisir: true, gristReady: true,
    }), true);
    // Sonde OK en édition, ou ?mode=view avec full (peutSaisir reste vrai).
    assert.equal(peutProposerBasculeLectureEdition({
      peutSaisir: true, gristReady: true, sceneExterne: null,
    }), true);
  });

  it('refusée en lecture forcée, hors document, ou scène externe', () => {
    assert.equal(peutProposerBasculeLectureEdition({
      peutSaisir: false, gristReady: true,
    }), false, 'échec de sonde / grist-readonly');
    assert.equal(peutProposerBasculeLectureEdition({
      peutSaisir: true, gristReady: false,
    }), false, 'pas de docApi');
    assert.equal(peutProposerBasculeLectureEdition({
      peutSaisir: true, gristReady: true, sceneExterne: { title: 'x' },
    }), false, '?scene=');
    assert.equal(peutProposerBasculeLectureEdition({}), false);
  });

  it('ne dépend pas du chrome actuel (viewMode)', () => {
    // L'essayage pose viewMode sans retirer peutSaisir : la bascule reste.
    assert.equal(peutProposerBasculeLectureEdition({
      peutSaisir: true, gristReady: true,
    }), true);
  });

  it('alterne le chrome sans toucher au droit', () => {
    assert.deepEqual(prochainEtatBasculeLectureEdition({ viewMode: false }), { viewMode: true });
    assert.deepEqual(prochainEtatBasculeLectureEdition({ viewMode: true }), { viewMode: false });
    // assertCanWrite suit viewMode : lecture d'essayage refuse, retour accepte.
    assert.equal(canWrite(prochainEtatBasculeLectureEdition({ viewMode: false }).viewMode), false);
    assert.equal(canWrite(prochainEtatBasculeLectureEdition({ viewMode: true }).viewMode), true);
  });

  it('titres d’infobulle explicites', () => {
    assert.equal(titreBasculeLectureEdition({ viewMode: false }), 'Passer en lecture');
    assert.equal(titreBasculeLectureEdition({ viewMode: true }), 'Revenir à l\'édition');
  });

  it('mode-view + full : droit d’édition réel (signal peutSaisir)', () => {
    // resolveAccess garde requiredAccess full quand Grist a accordé full.
    const acc = resolveAccess({ search: '?mode=view&access=full&readonly=false' });
    assert.equal(acc.reason, 'mode-view');
    assert.equal(acc.requiredAccess, 'full');
    assert.equal(acc.viewMode, true);
    // initGrist pose alors peutSaisir = true → bascule disponible.
    assert.equal(peutProposerBasculeLectureEdition({
      peutSaisir: acc.reason === 'mode-view' && acc.requiredAccess === 'full',
      gristReady: true,
    }), true);
  });

  it('grist-readonly : pas de retour', () => {
    const acc = resolveAccess({ search: '?access=read%20table&readonly=true' });
    assert.equal(acc.reason, 'grist-readonly');
    assert.equal(peutProposerBasculeLectureEdition({
      peutSaisir: false, gristReady: true,
    }), false);
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

describe('barreRetiree — qui retire la barre du haut', () => {
  it('l’application la retire en lecture, et la rend en édition', () => {
    assert.equal(barreRetiree({ application: true, lecture: true }), true);
    assert.equal(barreRetiree({ application: true, lecture: false }), false);
  });

  it('le widget la garde en lecture : rien au-dessus de lui ne la remplace', () => {
    assert.equal(barreRetiree({ application: false, lecture: true }), false);
    assert.equal(barreRetiree({}), false);
  });

  it('?navbar=false la retire partout, lecture ou non', () => {
    for (const application of [true, false]) {
      for (const lecture of [true, false]) {
        assert.equal(barreRetiree({ navbarParam: false, application, lecture }), true);
      }
    }
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

describe('pastilleRecitRequise — le récit garde une entrée sans barre', () => {
  const base = { barreAbsente: true, lecture: true, nbEtapes: 8, enPresentation: false };

  it('paraît dans la configuration de la vitrine, récit fermé', () => {
    // `?scene=` + `?navbar=false` : le bouton de la barre est parti, le rail
    // aussi. Sans la pastille, fermer le récit le rendait inatteignable.
    assert.equal(pastilleRecitRequise(base), true);
  });

  it('se retire pendant la lecture — la bulle porte déjà la navigation', () => {
    assert.equal(pastilleRecitRequise({ ...base, enPresentation: true }), false);
  });

  it('seule entrée du récit : avec ou sans barre, même pastille', () => {
    // Le bouton « Récit » de la barre du haut est retiré : la pastille ne
    // dépend plus de la présence de la barre.
    assert.equal(pastilleRecitRequise({ ...base, barreAbsente: false }), true);
  });

  it('ne double pas le module Récit du rail, en édition', () => {
    assert.equal(pastilleRecitRequise({ ...base, lecture: false }), false);
  });

  it('même pastille sur mobile — le bouton flottant est retiré', () => {
    assert.equal(pastilleRecitRequise({ ...base, mobile: true }), true);
  });

  it('ne promet rien quand il n’y a rien à lire', () => {
    assert.equal(pastilleRecitRequise({ ...base, nbEtapes: 0 }), false);
    assert.equal(pastilleRecitRequise({ ...base, nbEtapes: undefined }), false);
    assert.equal(pastilleRecitRequise(), false);
  });
});

describe('sonderEcritureDoc — ce que la sonde prouve, et sur quelle table', () => {
  const api = (erreur, tables = ['Atlas_LayerPrefs', 'Visites']) => ({
    listTables: async () => tables,
    applyUserActions: async () => { if (erreur) throw new Error(erreur); },
  });

  it('un refus de droits : non écrivable, certain, et la table sondée est nommée', async () => {
    const r = await sonderEcritureDoc(api('Blocked by table update access rules'));
    assert.deepEqual(r, { ecrivable: false, table: 'Atlas_LayerPrefs', certain: true });
  });

  it('une ligne absente : écrivable, certain', async () => {
    assert.deepEqual(await sonderEcritureDoc(api('Row 999999999 not found')), { ecrivable: true, table: 'Atlas_LayerPrefs', certain: true });
  });

  it('un doute reste écrivable mais n’est pas une preuve', async () => {
    const r = await sonderEcritureDoc(api('Failed to fetch'));
    assert.equal(r.ecrivable, true);
    assert.equal(r.certain, false);
  });

  it('sans document : non écrivable, sans table', async () => {
    assert.deepEqual(await sonderEcritureDoc(null), { ecrivable: false, table: null, certain: true });
  });
});
