/**
 * Tests scene-prefs Atlas.
 * node --test "projects/Atlas/tests/scene-prefs.test.js"
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  viewerControlsFromPrefsRow, prefsPayloadFromViewerControls,
  reglagesAEnregistrer, reglagesDepuisJSON, REGLAGES_MEMORISES, saveScenePrefs, loadScenePrefs,
} from '../lib/scene-prefs.js';
import { createDefaultViewerControls, setViewerExposed } from '../lib/viewer-controls.js';

describe('scene-prefs payload', () => {
  it('round-trip ViewerJSON', () => {
    const list = createDefaultViewerControls();
    setViewerExposed(list, 'sun', true);
    const payload = prefsPayloadFromViewerControls(list);
    assert.equal(typeof payload.ViewerJSON, 'string');
    const back = viewerControlsFromPrefsRow({ ViewerJSON: [payload.ViewerJSON] }, 0);
    assert.equal(back.find((c) => c.id === 'sun').exposed, true);
  });
});

describe('réglages de scène — ce qui se retrouve en revenant sur le document', () => {
  it('le fond de carte choisi est retenu', () => {
    // Le cas qui motive tout : on choisit un fond, on revient, on le retrouve.
    const gardes = reglagesAEnregistrer({ basemap: 'positron', timeOfDay: 600, shadows: false });
    assert.equal(gardes.basemap, 'positron');
    assert.equal(gardes.timeOfDay, 600);
    assert.equal(gardes.shadows, false, 'un booléen faux est une préférence, pas une absence');
  });

  it('la liste blanche écarte ce qui n’a pas à voyager', () => {
    // `date` est un objet Date : il ne survit pas au JSON tel quel, et une scène
    // rouverte l'an prochain doit montrer la lumière de l'heure choisie, pas
    // celle d'un jour révolu. Les clés inconnues n'entrent pas non plus.
    const gardes = reglagesAEnregistrer({
      basemap: 'liberty', date: new Date(2026, 0, 1), inconnu: 'x', _interne: 1,
    });
    assert.deepEqual(Object.keys(gardes), ['basemap']);
    assert.ok(!REGLAGES_MEMORISES.includes('date'));
  });

  it('une valeur absente ne s’écrit pas, une valeur nulle non plus', () => {
    assert.deepEqual(reglagesAEnregistrer({ basemap: undefined, sky: null }), {});
    assert.deepEqual(reglagesAEnregistrer({}), {});
    assert.deepEqual(reglagesAEnregistrer(null), {});
  });

  it('la relecture filtre aussi, et ne casse pas sur du JSON abîmé', () => {
    // Le filtre au RETOUR compte autant qu'à l'écriture : une préférence posée
    // par une version ultérieure ne doit pas entrer par la porte de derrière.
    assert.deepEqual(reglagesDepuisJSON('{"basemap":"positron","futur":42}'), { basemap: 'positron' });
    assert.deepEqual(reglagesDepuisJSON('pas du json'), {});
    assert.deepEqual(reglagesDepuisJSON('[1,2]'), {}, 'un tableau n’est pas un jeu de réglages');
    assert.deepEqual(reglagesDepuisJSON(''), {});
    assert.deepEqual(reglagesDepuisJSON(null), {});
  });

  it('aller-retour complet : ce qu’on écrit est ce qu’on relit', () => {
    const avant = { basemap: 'positron', terrain3D: true, terrainExaggeration: 2.5, timeOfDay: 1020 };
    const apres = reglagesDepuisJSON(JSON.stringify(reglagesAEnregistrer(avant)));
    assert.deepEqual(apres, avant);
  });

  it('la scène enregistre ses réglages en même temps que ses contrôles', async () => {
    const actions = [];
    const docApi = {
      listTables: async () => ['Atlas_ScenePrefs'],
      fetchTable: async () => ({ id: [], ViewerJSON: [], SettingsJSON: [] }),
      applyUserActions: async (a) => { actions.push(...a); return { retValues: [1] }; },
    };
    await saveScenePrefs(docApi, {
      viewerControls: createDefaultViewerControls(),
      settings: { basemap: 'positron', date: new Date() },
    });
    const ecriture = actions.find((a) => a[0] === 'AddRecord' || a[0] === 'UpdateRecord');
    assert.ok(ecriture, 'une écriture doit partir');
    const data = ecriture.at(-1);
    assert.ok('SettingsJSON' in data, 'les réglages voyagent avec les contrôles');
    assert.equal(JSON.parse(data.SettingsJSON).basemap, 'positron');
    assert.ok(!('date' in JSON.parse(data.SettingsJSON)));
  });

  it('un document d’avant la colonne se la voit ajouter, pas refuser', async () => {
    // Ces documents existent : ils ont `Atlas_ScenePrefs` sans `SettingsJSON`.
    // Sans migration, l'écriture échouerait sur un KeyError — et comme
    // `persistScenePrefs` avale ses erreurs, le fond ne serait jamais retenu
    // sans que rien ne le dise.
    const actions = [];
    const docApi = {
      listTables: async () => ['Atlas_ScenePrefs'],
      fetchTable: async () => ({ id: [1], ViewerJSON: ['[]'] }), // pas de SettingsJSON
      applyUserActions: async (a) => { actions.push(...a); return { retValues: [1] }; },
    };
    await saveScenePrefs(docApi, { viewerControls: createDefaultViewerControls(), settings: { basemap: 'x' } });
    assert.ok(actions.some((a) => a[0] === 'AddColumn' && a[2] === 'SettingsJSON'),
      'la colonne manquante doit être ajoutée');
  });

  it('sans réglages enregistrés, on repart sur les défauts sans erreur', async () => {
    const docApi = {
      listTables: async () => ['Atlas_ScenePrefs'],
      fetchTable: async () => ({ id: [1], ViewerJSON: ['[]'], SettingsJSON: [null] }),
      applyUserActions: async () => ({ retValues: [1] }),
    };
    const prefs = await loadScenePrefs(docApi);
    assert.deepEqual(prefs.settings, {});
    assert.ok(Array.isArray(prefs.viewerControls));
  });
});
