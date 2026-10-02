/**
 * Tests Atlas v7 — ordre d'affichage deterministe.
 * node --test projects/Atlas/tests/layer-order.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  layerGfxIds, orderedGfxIds, moveSequence, SYSTEM_TOP_IDS,
  displayOrder, moveLayerInStack, insertionIndex, sortByRank, dropIndex, reorderByDrop,
  ancreAuDessus,
} from '../lib/layer-order.js';

/** Carte factice : enregistre les deplacements et simule la pile MapLibre. */
function fausseCarte(idsPresents) {
  const pile = [...idsPresents];
  return {
    pile,
    getLayer: (id) => (pile.includes(id) ? { id } : undefined),
    moveLayer(id) {
      const i = pile.indexOf(id);
      if (i === -1) throw new Error(`moveLayer sur couche absente : ${id}`);
      pile.splice(i, 1);
      pile.push(id); // sans destination = au sommet
    },
  };
}

const couche = (id) => ({ id });

describe('layerGfxIds', () => {
  it('habillages du bas vers le haut', () => {
    assert.deepEqual(layerGfxIds(couche('c1')),
      ['c1', 'c1-outline', 'c1-pts', 'c1-icon', 'c1-label']);
  });

  it('etiquette au-dessus du remplissage — jamais l\'inverse', () => {
    const ids = layerGfxIds(couche('c1'));
    assert.ok(ids.indexOf('c1-label') > ids.indexOf('c1'));
    assert.ok(ids.indexOf('c1-outline') > ids.indexOf('c1'));
  });

  it('couche sans id : rien', () => {
    assert.deepEqual(layerGfxIds(null), []);
    assert.deepEqual(layerGfxIds({}), []);
  });
});

describe('orderedGfxIds', () => {
  it('les couches systeme terminent au sommet', () => {
    const seq = orderedGfxIds([couche('a'), couche('b')]);
    assert.deepEqual(seq.slice(-SYSTEM_TOP_IDS.length), SYSTEM_TOP_IDS);
  });
});

describe('moveSequence — filtrage', () => {
  it('ecarte ce qui n\'est pas monte (couche differee, contour absent)', () => {
    const presents = new Set(['a', 'a-label', 'sel-hl-ring']);
    assert.deepEqual(moveSequence([couche('a'), couche('differee')], (id) => presents.has(id)),
      ['a', 'a-label', 'sel-hl-ring']);
  });

  it('sans predicat, tout passe', () => {
    assert.equal(moveSequence([couche('a')]).length, 5 + SYSTEM_TOP_IDS.length, 'cinq habillages, icone comprise');
  });
});

describe('application sur une carte — invariants', () => {
  const appliquer = (map, layers) => {
    for (const id of moveSequence(layers, (i) => !!map.getLayer(i))) map.moveLayer(id);
  };

  it('NON-REGRESSION DU SENS : la derniere couche du tableau reste au-dessus', () => {
    // Interdit d'inverser la superposition des scenes existantes.
    const map = fausseCarte(['grille', 'routes', 'sites']);
    appliquer(map, [couche('grille'), couche('routes'), couche('sites')]);
    assert.deepEqual(map.pile, ['grille', 'routes', 'sites']);
    assert.equal(map.pile[map.pile.length - 1], 'sites', 'la derniere du tableau est peinte en dernier');
  });

  it('la surbrillance de selection reste au-dessus des donnees', () => {
    // sel-hl-ring est creee une fois, au sommet : sans ce rattrapage elle
    // passerait sous les donnees et la selection deviendrait invisible.
    const map = fausseCarte(['sel-hl-ring', 'a', 'b']);
    appliquer(map, [couche('a'), couche('b')]);
    assert.equal(map.pile[map.pile.length - 1], 'sel-hl-ring');
  });

  it('STABILITE : masquer puis reafficher ne change pas l\'ordre (I4)', () => {
    const layers = [couche('a'), couche('b'), couche('c')];
    const map = fausseCarte(['a', 'b', 'c']);
    appliquer(map, layers);
    const avant = [...map.pile];
    // Remontage de « a » : MapLibre la remet au sommet…
    map.moveLayer('a');
    assert.notDeepEqual(map.pile, avant, 'le remontage doit bien perturber la pile');
    appliquer(map, layers); // …et l'ordre est retabli
    assert.deepEqual(map.pile, avant);
  });

  it('idempotence : reappliquer ne bouge rien', () => {
    const layers = [couche('a'), couche('b')];
    const map = fausseCarte(['a', 'b', 'sel-hl-ring']);
    appliquer(map, layers);
    const p1 = [...map.pile];
    appliquer(map, layers);
    assert.deepEqual(map.pile, p1);
  });

  it('aucun appel sur une couche absente', () => {
    const map = fausseCarte(['a']);
    // moveLayer leve si l'id est absent : le filtrage doit l'empecher.
    assert.doesNotThrow(() => appliquer(map, [couche('a'), couche('jamais-montee')]));
  });

  it('les habillages suivent leur couche, en bloc', () => {
    const map = fausseCarte(['a', 'a-label', 'b', 'b-label']);
    appliquer(map, [couche('a'), couche('b')]);
    assert.deepEqual(map.pile, ['a', 'a-label', 'b', 'b-label']);
  });
});

describe('reordonnancement — vocabulaire de l\'utilisateur', () => {
  const scene = () => [couche('grille'), couche('routes'), couche('sites')];

  it('la liste du panneau presente le dessus en premier', () => {
    // STATE.layers[last] est peint au-dessus : l'affichage l'inverse.
    assert.deepEqual(displayOrder(scene()).map((l) => l.id), ['sites', 'routes', 'grille']);
  });

  it('« monter » avance vers la fin du tableau (donc vers le dessus)', () => {
    const apres = moveLayerInStack(scene(), 'grille', 'up');
    assert.deepEqual(apres.map((l) => l.id), ['routes', 'grille', 'sites']);
  });

  it('« descendre » recule dans le tableau', () => {
    const apres = moveLayerInStack(scene(), 'sites', 'down');
    assert.deepEqual(apres.map((l) => l.id), ['grille', 'sites', 'routes']);
  });

  it('aux bornes : rien ne bouge, rien ne sort du tableau', () => {
    assert.deepEqual(moveLayerInStack(scene(), 'sites', 'up').map((l) => l.id),
      ['grille', 'routes', 'sites']);
    assert.deepEqual(moveLayerInStack(scene(), 'grille', 'down').map((l) => l.id),
      ['grille', 'routes', 'sites']);
  });

  it('couche inconnue ou liste vide : sans effet', () => {
    assert.deepEqual(moveLayerInStack(scene(), 'absente', 'up').map((l) => l.id),
      ['grille', 'routes', 'sites']);
    assert.deepEqual(moveLayerInStack([], 'x', 'up'), []);
  });

});

describe('insertion par geometrie', () => {
  const geo = (id, geometryType) => ({ id, geometryType });

  it('un bati importe apres un reseau passe SOUS lui', () => {
    // Cas vecu a l'etape 9 du recit : 38 848 batiments recouvraient la voirie.
    const scene = [geo('routes', 'LineString'), geo('sites', 'Point')];
    assert.equal(insertionIndex(scene, 'Polygon'), 0);
  });

  it('une ligne se place au-dessus des surfaces, sous les points', () => {
    const scene = [geo('grille', 'Polygon'), geo('sites', 'Point')];
    assert.equal(insertionIndex(scene, 'LineString'), 1);
  });

  it('un point va au sommet', () => {
    const scene = [geo('grille', 'Polygon'), geo('routes', 'LineString')];
    assert.equal(insertionIndex(scene, 'Point'), 2);
  });

  it('scene vide, ou geometrie inconnue traitee comme un point', () => {
    assert.equal(insertionIndex([], 'Polygon'), 0);
    assert.equal(insertionIndex([geo('a', 'Polygon')], 'Bizarre'), 1);
  });
});

describe('tri par rang enregistre', () => {
  const t = (sourceTable) => ({ id: `l-${sourceTable}`, sourceTable });

  it('applique les rangs des preferences', () => {
    const layers = [t('A'), t('B'), t('C')];
    const tri = sortByRank(layers, { A: 2, B: 0, C: 1 });
    assert.deepEqual(tri.map((l) => l.sourceTable), ['B', 'C', 'A']);
  });

  it('une couche sans rang garde sa place, apres celles qui en ont un', () => {
    // Document anterieur a la fonctionnalite : il doit s'ouvrir a l'identique.
    const layers = [t('A'), t('B'), t('C')];
    assert.deepEqual(sortByRank(layers, { B: 0 }).map((l) => l.sourceTable), ['B', 'A', 'C']);
    assert.deepEqual(sortByRank(layers, {}).map((l) => l.sourceTable), ['A', 'B', 'C']);
  });

  it('accepte une Map et retombe sur l\'id', () => {
    const layers = [t('A'), t('B')];
    assert.deepEqual(sortByRank(layers, new Map([['B', 0], ['A', 1]])).map((l) => l.sourceTable),
      ['B', 'A']);
    assert.deepEqual(sortByRank([{ id: 'x' }, { id: 'y' }], { y: 0, x: 1 }).map((l) => l.id),
      ['y', 'x']);
  });
});

describe('rangs partiels — le piege du tri', () => {
  const t = (sourceTable) => ({ id: `l-${sourceTable}`, sourceTable });

  it('un rang partiel relegue les couches sans rang au-dessus', () => {
    // Comportement mesure en Grist reel : apres un deplacement, seules les
    // couches echangees portaient un rang. Au rechargement, les autres
    // remontaient au sommet et la scene s'inversait.
    const layers = [t('A'), t('B'), t('C'), t('D')];
    const partiel = sortByRank(layers, { C: 2, D: 3 });
    assert.deepEqual(partiel.map((l) => l.sourceTable), ['C', 'D', 'A', 'B'],
      'A et B, sans rang, passent apres C et D — donc au-dessus');
  });

  it('des rangs complets restituent l\'ordre exact', () => {
    // D'ou la regle : un reordonnancement enregistre TOUS les rangs.
    const layers = [t('A'), t('B'), t('C'), t('D')];
    const complet = sortByRank(layers, { A: 0, B: 1, C: 2, D: 3 });
    assert.deepEqual(complet.map((l) => l.sourceTable), ['A', 'B', 'C', 'D']);
    const permute = sortByRank(layers, { A: 3, B: 0, C: 1, D: 2 });
    assert.deepEqual(permute.map((l) => l.sourceTable), ['B', 'C', 'D', 'A']);
  });
});

describe('glisser-deposer — calcul de la cible', () => {
  // Trois lignes de 40 px : [0-40], [40-80], [80-120]
  const rects = [{ top: 0, bottom: 40 }, { top: 40, bottom: 80 }, { top: 80, bottom: 120 }];

  it('la moitie de la ligne decide, pas son bord', () => {
    // Comparer aux bords ferait osciller la cible au moindre tremblement.
    assert.equal(dropIndex(rects, 5), 0);
    assert.equal(dropIndex(rects, 19), 0);
    assert.equal(dropIndex(rects, 21), 1);
    assert.equal(dropIndex(rects, 59), 1);
    assert.equal(dropIndex(rects, 61), 2);
  });

  it('sous la derniere ligne : depot en fin de liste', () => {
    assert.equal(dropIndex(rects, 200), 3);
  });

  it('liste vide', () => {
    assert.equal(dropIndex([], 50), 0);
    assert.equal(dropIndex(null, 50), 0);
  });
});

describe('glisser-deposer — reordonnancement', () => {
  // STATE.layers : [grille, routes, sites] ; affiche : [sites, routes, grille]
  const scene = () => [couche('grille'), couche('routes'), couche('sites')];
  const vue = (layers) => displayOrder(layers).map((l) => l.id);

  it('descendre la premiere ligne affichee jusqu\'en bas', () => {
    const apres = reorderByDrop(scene(), 0, 3);
    assert.deepEqual(vue(apres), ['routes', 'grille', 'sites']);
  });

  it('remonter la derniere ligne affichee tout en haut', () => {
    const apres = reorderByDrop(scene(), 2, 0);
    assert.deepEqual(vue(apres), ['grille', 'sites', 'routes']);
  });

  it('deposer sur soi-meme ne change rien', () => {
    assert.deepEqual(vue(reorderByDrop(scene(), 1, 1)), ['sites', 'routes', 'grille']);
    assert.deepEqual(vue(reorderByDrop(scene(), 1, 2)), ['sites', 'routes', 'grille']);
  });

  it('indices hors bornes : sans effet', () => {
    assert.deepEqual(vue(reorderByDrop(scene(), -1, 1)), ['sites', 'routes', 'grille']);
    assert.deepEqual(vue(reorderByDrop(scene(), 5, 1)), ['sites', 'routes', 'grille']);
  });

  it('la semantique interne est preservee : le dernier reste peint au-dessus', () => {
    const apres = reorderByDrop(scene(), 0, 3);
    assert.equal(apres[apres.length - 1].id, vue(apres)[0]);
  });
});

describe('ancreAuDessus — une couche restylée reprend sa place', () => {
  const pile = ['fond', 'a', 'a-outline', 'b', 'b-label', 'atlas-trajet-line', 'sel-hl-fill'];

  it('le voisin du dessus, habillages de la couche exclus', () => {
    assert.equal(ancreAuDessus(pile, couche('a')), 'b');
    assert.equal(ancreAuDessus(pile, couche('b')), 'atlas-trajet-line');
  });

  it('rien au-dessus, ou couche absente : pas d ancre', () => {
    assert.equal(ancreAuDessus(['x', 'a', 'a-label'], couche('a')), null);
    assert.equal(ancreAuDessus(pile, couche('z')), null);
    assert.equal(ancreAuDessus([], couche('a')), null);
    assert.equal(ancreAuDessus(pile, {}), null);
  });

  it('le repli en points et l etiquette comptent dans le groupe', () => {
    assert.equal(ancreAuDessus(['a', 'a-pts', 'a-label', 'b'], couche('a')), 'b');
  });

  it('retirer puis reposer sous l ancre rend la pile d origine', () => {
    const avant = ['fond', 'a', 'a-outline', 'b', 'b-label'];
    const ancre = ancreAuDessus(avant, couche('a'));
    const pileCarte = avant.filter((id) => !id.startsWith('a'));
    pileCarte.push('a', 'a-outline');                      // recréées au sommet
    for (const id of ['a', 'a-outline']) {                 // moveLayer(id, ancre)
      pileCarte.splice(pileCarte.indexOf(id), 1);
      pileCarte.splice(pileCarte.indexOf(ancre), 0, id);
    }
    assert.deepEqual(pileCarte, avant);
  });
});
