import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStoryControlsToLayer,
  captureSelectControlValues,
  shouldCaptureControl,
} from '../lib/controls.js';

// Une couche de `n` catégories, chacune portée par un objet : plus que les 40
// choix qu'une liste de cases sait montrer (`MAX_VALEURS_LISTE`).
function coucheDeCategories(n) {
  const features = [];
  for (let i = 0; i < n; i++) {
    // La catégorie `i` porte `n - i` objets : l'ordre par fréquence est connu,
    // et les dernières sont les plus rares.
    for (let k = 0; k < n - i; k++) features.push({ properties: { type: `T${String(i).padStart(2, '0')}` } });
  }
  return {
    id: 'ouvrages',
    sourceTable: 'Ouvrages',
    geojson: { type: 'FeatureCollection', features },
    controls: [{ field: 'type', type: 'select', active: true }],
  };
}

describe('capture d’une étape — filtres par cases au-delà de 40 valeurs', () => {
  it('une catégorie rare cochée reste dans l’étape', () => {
    const couche = coucheDeCategories(55);
    const rare = 'T54';   // la 55e : bien au-delà des 40 plus fréquentes
    couche.controls[0].values = ['T00', rare];
    const capture = captureSelectControlValues(couche, couche.controls[0]);
    assert.deepEqual(capture.sort(), ['T00', rare]);
  });

  it('tout coché sauf une valeur rare est bien un filtre partiel', () => {
    const couche = coucheDeCategories(55);
    const toutes = [];
    for (let i = 0; i < 55; i++) toutes.push(`T${String(i).padStart(2, '0')}`);
    couche.controls[0].values = toutes.filter((v) => v !== 'T54');
    assert.equal(shouldCaptureControl(couche, couche.controls[0]), true,
      'sans plafond, la valeur décochée compte : le filtre n’est pas « tout »');
  });

  it('rejouer l’étape rend la sélection entière', () => {
    const couche = coucheDeCategories(55);
    applyStoryControlsToLayer(couche, [{ field: 'type', type: 'select', values: ['T00', 'T54'] }]);
    assert.deepEqual([...couche.controls[0].values].sort(), ['T00', 'T54']);
  });

  it('l’étape rejouée ne partage pas son tableau avec le contrôle', () => {
    const couche = {
      id: 'a', geojson: { type: 'FeatureCollection', features: [{ properties: { n: 1 } }] },
      controls: [{ field: 'n', type: 'range', active: true, min: 0, max: 5 }],
    };
    const etape = [{ field: 'n', type: 'range', min: 1, max: 2, values: [1, 2] }];
    applyStoryControlsToLayer(couche, etape);
    couche.controls[0].values.push(3);
    assert.deepEqual(etape[0].values, [1, 2]);
  });
});
