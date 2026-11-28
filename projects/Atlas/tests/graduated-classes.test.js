import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classBounds, graduatedStops, recolorStops,
  expressionCouleurDeclarative, colorFnFromDeclarative,
  applyGraduatedColorsToFeatures,
} from '../lib/declarative-style.js';
// L'evaluateur du sous-ensemble MapLibre est partage : deux copies divergeraient,
// et c'est justement une divergence qu'on cherche a exclure ici.
import { evaluer } from './aide-expressions.js';

const VERTS = ['#e5f5e0', '#a1d99b', '#41ab5d', '#238b45', '#005a32'];
const BLEUS = ['#deebf7', '#9ecae1', '#4292c6', '#2171b5', '#084594'];

/* ---------- bornes ---------- */

test('linéaire : des classes d’égale largeur', () => {
  const b = classBounds(0, 100, 4, 'linear');
  assert.deepEqual(b.map((x) => [x.lower, x.upper]), [[0, 25], [25, 50], [50, 75], [75, 100]]);
});

test('log : les petites valeurs sont resserrées', () => {
  // Cas réel CRESO : nb_bat va de 1 à 134, l'immense majorité des mailles en
  // ayant 1 ou 2. En linéaire, tout tombe dans la première classe.
  const b = classBounds(1, 134, 5, 'log');
  assert.ok(b[0].upper < 5, `première classe trop large : ${b[0].upper}`);
  assert.ok(b[4].lower > 40, `dernière classe trop basse : ${b[4].lower}`);
});

test('racine : intermédiaire entre linéaire et log', () => {
  const lin = classBounds(1, 134, 5, 'linear')[0].upper;
  const sqrt = classBounds(1, 134, 5, 'sqrt')[0].upper;
  const log = classBounds(1, 134, 5, 'log')[0].upper;
  assert.ok(log < sqrt && sqrt < lin, `attendu log < sqrt < linéaire, obtenu ${log} ${sqrt} ${lin}`);
});

test('les bornes extrêmes collent aux valeurs réelles', () => {
  // Sans cela, une entité au minimum ou au maximum tomberait hors classe et
  // prendrait la couleur de repli.
  for (const m of ['linear', 'log', 'sqrt']) {
    const b = classBounds(1, 134, 5, m);
    assert.equal(b[0].lower, 1, m);
    assert.equal(b[b.length - 1].upper, 134, m);
  }
});

test('les classes sont contiguës, sans trou ni recouvrement', () => {
  const b = classBounds(1, 134, 5, 'log');
  for (let i = 1; i < b.length; i++) assert.equal(b[i].lower, b[i - 1].upper);
});

test('cas dégénérés', () => {
  assert.deepEqual(classBounds(5, 5, 4, 'linear'), [{ lower: 5, upper: 5 }]);
  assert.deepEqual(classBounds(NaN, 10, 4), []);
  assert.equal(classBounds(0, 10, 0).length, 1);
});

/* ---------- recoloriage ---------- */

test('changer de palette ne touche pas au découpage', () => {
  // C'est le défaut observé : la légende passait au bleu, la carte restait
  // verte, parce que le rendu lisait la couleur des classes existantes.
  const avant = graduatedStops(1, 134, VERTS, 'log');
  const apres = recolorStops(avant, BLEUS);
  assert.deepEqual(apres.map((s) => s.color), BLEUS);
  assert.deepEqual(
    apres.map((s) => [s.lower, s.upper]),
    avant.map((s) => [s.lower, s.upper]),
    'les bornes doivent survivre au changement de palette',
  );
});

test('recoloriage avec un nombre de couleurs différent', () => {
  const stops = graduatedStops(0, 100, VERTS, 'linear'); // 5 classes
  const out = recolorStops(stops, ['#000', '#fff']);     // 2 couleurs
  assert.equal(out.length, 5, 'le nombre de classes ne change pas');
  assert.equal(out[0].color, '#000');
  assert.equal(out[4].color, '#fff');
});

test('recoloriage sans palette : rien ne change', () => {
  const stops = graduatedStops(0, 100, VERTS, 'linear');
  assert.deepEqual(recolorStops(stops, []), stops);
  assert.deepEqual(recolorStops(stops, null), stops);
});

test('recoloriage d’une liste vide', () => {
  assert.deepEqual(recolorStops([], BLEUS), []);
  assert.deepEqual(recolorStops(null, BLEUS), []);
});

/* ---------- classes complètes ---------- */

test('autant de classes que de couleurs dans la palette', () => {
  assert.equal(graduatedStops(1, 134, VERTS, 'log').length, VERTS.length);
});

test('chaque classe porte bornes, couleur et opacité', () => {
  const [s] = graduatedStops(1, 134, BLEUS, 'linear');
  assert.equal(typeof s.lower, 'number');
  assert.equal(typeof s.upper, 'number');
  assert.equal(s.color, BLEUS[0]);
  assert.equal(s.opacity, 1);
});

test('palette vide : aucune classe plutôt qu’un rendu faux', () => {
  assert.deepEqual(graduatedStops(1, 134, [], 'log'), []);
});


/* ---------- la symbologie dite a MapLibre, sans detenir les entites ---------- */

test('single : la couleur, sans expression inutile', () => {
  assert.equal(expressionCouleurDeclarative({ kind: 'single', color: '#123456' }), '#123456');
  assert.equal(expressionCouleurDeclarative(null), null, 'sans declaratif, rien a dire');
});

test('categorized : une catégorie numérique (3) se compare à son libellé texte (« 3 ») — une tuile vectorielle rend des entiers', () => {
  const decl = { kind: 'categorized', field: 'categorie', stops: [{ value: 3, color: '#ff0000' }, { value: '4', color: '#00ff00' }] };
  const e = expressionCouleurDeclarative(decl, '#808080');
  assert.deepEqual(e[1], ['to-string', ['get', 'categorie']]);
  assert.equal(e[2], '3', 'le libellé numérique est écrit en texte : le match compare du texte à du texte');
  assert.equal(e[4], '4');
  assert.equal(e.at(-1), '#808080');
});

test('categorized : un match sur le champ, valeur et libelle acceptes', () => {
  const decl = {
    kind: 'categorized', field: 'bee_species',
    stops: [
      { value: 'Apis Mellifera Mellifera', label: 'European honey bee', color: '#de7300' },
      { value: 'Buckfast', color: '#1f78b4' },
    ],
  };
  const e = expressionCouleurDeclarative(decl, '#808080');
  assert.equal(e[0], 'match');
  assert.deepEqual(e[1], ['to-string', ['get', 'bee_species']], 'la propriété se compare en texte, comme les libellés');
  // Une categorie designee par sa valeur OU son libelle : les deux doivent peindre pareil.
  assert.deepEqual(e[2], ['Apis Mellifera Mellifera', 'European honey bee']);
  assert.equal(e[3], '#de7300');
  assert.equal(e[4], 'Buckfast', 'une seule valeur reste scalaire');
  assert.equal(e[5], '#1f78b4');
  assert.equal(e[e.length - 1], '#808080', 'et une valeur par defaut ferme le match');
});

test('graduated : les classes triees, hautes inclusives, hors-classe au repli', () => {
  const decl = {
    kind: 'graduated', field: 'lg_route_m',
    stops: [
      { lower: 800, upper: 2000, color: '#238b45' },
      { lower: 0, upper: 50, color: '#f7fcf5' },
      { lower: 50, upper: 200, color: '#c7e9c0' },
    ],
  };
  const e = expressionCouleurDeclarative(decl, '#808080');
  assert.equal(e[0], 'let', 'la valeur n’est convertie qu’une fois par entite');
  // Les stops arrivent dans le desordre : l'expression doit les trier, sinon
  // une valeur serait rattachee a la premiere classe declaree, pas a la sienne.
  assert.equal(evaluer(e, { lg_route_m: 30 }), '#f7fcf5');
  assert.equal(evaluer(e, { lg_route_m: 120 }), '#c7e9c0');
  assert.equal(evaluer(e, { lg_route_m: 1500 }), '#238b45');

  // La borne partagee appartient a la classe du dessous, comme dans QGIS.
  assert.equal(evaluer(e, { lg_route_m: 50 }), '#f7fcf5');
  assert.equal(evaluer(e, { lg_route_m: 200 }), '#c7e9c0');

  // Sous la premiere borne, au-dessus de la derniere, et dans le trou entre
  // 200 et 800 : hors classification.
  assert.equal(evaluer(e, { lg_route_m: -1 }), '#808080');
  assert.equal(evaluer(e, { lg_route_m: 5000 }), '#808080');
  assert.equal(evaluer(e, { lg_route_m: 500 }), '#808080', 'un trou dans la classification');
});

test('une valeur hors classification prend le repli, pas la classe la plus basse', () => {
  // Mesure sur la scene de Sete : 400 batiments, 399 avec une hauteur de 1,4 a
  // 20,2 m, et un seul portant la chaine 'NULL'. Peint comme la classe basse,
  // il se lirait comme un batiment bas — une donnee absente deguisee en mesure.
  const decl = {
    kind: 'graduated', field: 'hauteur',
    stops: [{ lower: 0, upper: 5, color: '#f7fcf5' },
            { lower: 5, upper: 10, color: '#74c476' },
            { lower: 10, upper: 25, color: '#00441b' }],
  };
  const e = expressionCouleurDeclarative(decl, '#FF00FF');
  const peindre = (props) => evaluer(e, props);
  assert.equal(e[0], 'let', 'la valeur n’est convertie qu’une fois par entite');

  assert.equal(peindre({ hauteur: 3 }), '#f7fcf5');
  assert.equal(peindre({ hauteur: 7 }), '#74c476');
  assert.equal(peindre({ hauteur: 20.2 }), '#00441b');
  assert.equal(peindre({ hauteur: '12.5' }), '#00441b', 'un nombre en texte reste un nombre');

  assert.equal(peindre({ hauteur: 'NULL' }), '#FF00FF', 'la chaine NULL n’est pas une hauteur');
  assert.equal(peindre({ nature: 'Indifferenciee' }), '#FF00FF', 'attribut absent');
  assert.equal(peindre({ hauteur: null }), '#FF00FF', 'attribut a null');
  assert.equal(peindre({ hauteur: -3 }), '#FF00FF', 'sous la premiere borne : hors classification');
});

test('l’expression graduee survit a un aller-retour JSON', () => {
  // Elle est reenregistree dans Atlas_LayerPrefs et dans l'export de scene.
  // Un repere non fini (-Infinity) s'y ecrit `null`, que to-number convertit
  // en 0 : au rechargement, toutes les entites muettes tomberaient dans la
  // classe qui contient zero. Le defaut ne se verrait qu'a la seconde ouverture.
  const decl = {
    kind: 'graduated', field: 'h',
    stops: [{ lower: 0, upper: 10, color: '#111111' },
            { lower: 10, upper: 100, color: '#222222' }],
  };
  const e = expressionCouleurDeclarative(decl, '#FF00FF');
  const apres = JSON.parse(JSON.stringify(e));
  assert.deepEqual(apres, e, 'aucune valeur non representable en JSON');
  assert.equal(evaluer(apres, { h: 'NULL' }), '#FF00FF');
  assert.equal(evaluer(apres, { h: 0 }), '#111111', 'zero reste dans sa classe');
  assert.ok(JSON.stringify(e).indexOf('null') === -1, 'aucun repere perdu a la serialisation');
});

test('l’expression peint comme la fonction : les deux ne doivent pas diverger', () => {
  // colorFnFromDeclarative peint entite par entite, l'expression laisse
  // MapLibre le faire. Un ecart entre les deux donnerait deux Atlas selon
  // l'origine de la couche — exactement ce qu'on veut eviter.
  const decl = {
    kind: 'categorized', field: 'type',
    stops: [{ value: 'a', color: '#aa0000' }, { value: 'b', color: '#00bb00' }],
  };
  const fn = colorFnFromDeclarative(decl, '#808080');
  const e = expressionCouleurDeclarative(decl, '#808080');
  const parMatch = (v) => {
    for (let i = 2; i < e.length - 1; i += 2) {
      const cles = Array.isArray(e[i]) ? e[i] : [e[i]];
      if (cles.includes(v)) return e[i + 1];
    }
    return e[e.length - 1];
  };
  for (const v of ['a', 'b', 'inconnu']) {
    assert.equal(parMatch(v), fn({ type: v }), `divergence sur « ${v} »`);
  }
});

test('un declaratif inexploitable ne rend rien, plutot qu’une expression fausse', () => {
  assert.equal(expressionCouleurDeclarative({ kind: 'categorized', field: 'x', stops: [] }), null);
  assert.equal(expressionCouleurDeclarative({ kind: 'categorized', stops: [{ value: 'a', color: '#f00' }] }), null,
    'sans champ, on ne peut pas interroger l’entite');
  assert.equal(expressionCouleurDeclarative({ kind: 'graduated', field: 'v', stops: [{ color: '#f00' }] }), null,
    'des bornes non numeriques ne font pas un step');
});

test('gradue : l’expression et la peinture par entite classent pareil', () => {
  // `applyGraduatedColorsToFeatures` pose `_fill_color` sur chaque entite ;
  // `layerPaintColor` fait passer cette valeur AVANT l'expression. Les deux
  // chemins servent donc la meme couche selon qu'elle est peinte ou non, et
  // un ecart donnerait deux couleurs pour la meme donnee — le genre de defaut
  // qu'on attribue a la donnee plutot qu'au code.
  // Bornes prises sur les scenes reelles : contigues, la haute de l'une egale
  // la basse de la suivante. C'est la que les deux chemins peuvent diverger.
  const stops = [{ lower: 0, upper: 5, color: '#f7fcf5' },
                 { lower: 5, upper: 10, color: '#74c476' },
                 { lower: 10, upper: 25, color: '#00441b' }];
  const valeurs = [0, 3, 5, 9.9, 10, 20.2, -3, 'NULL', null, undefined, '7'];
  const layer = {
    _declarative: { kind: 'graduated', field: 'hauteur', stops },
    style: { symbolization: { color: { mode: 'graduated', field: 'hauteur', defaultColor: '#FF00FF' } } },
    geojson: { features: valeurs.map((v) => ({ properties: v === undefined ? {} : { hauteur: v } })) },
  };
  applyGraduatedColorsToFeatures(layer, []);

  const e = expressionCouleurDeclarative(layer._declarative, '#FF00FF');
  layer.geojson.features.forEach((f, i) => {
    assert.equal(evaluer(e, f.properties), f.properties._fill_color,
      `divergence sur ${JSON.stringify(valeurs[i])}`);
  });
});
