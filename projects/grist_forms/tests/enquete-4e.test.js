const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const def = require('./fixtures/enquete-4e.formdef.json');
const schema = require('./fixtures/enquete-4e.schema.json');
const schemaFormDef = require('../runtime/formdef.schema.json');

/**
 * L'enquête du 4ᵉ, traduite en FormDef, sert d'épreuve au catalogue des saisies.
 *
 * Elle existe, elle a tourné, elle a des réponses : c'est elle qui dit ce qui
 * manque au moteur, et dans quelles proportions — pas nous. Tant qu'elle ne se
 * rend pas entièrement, le catalogue est incomplet.
 *
 * Le schéma à côté (`enquete-4e.schema.json`) est relevé sur le document réel
 * (`e1j5ym1Bd5ec`, 04/10/2026). La traduction se branche dessus : aucune
 * colonne créée, aucune retypée — les deux réponses déjà saisies doivent rester
 * lisibles.
 */

const parCol = Object.fromEntries(schema.colonnes.map((c) => [c.colId, c]));
const champs = def.sections.flatMap((s) => s.fields);

/** Les colonnes qu'un champ occupe : la sienne, ou celles de son gabarit. */
function colonnesDuChamp(f) {
  if (f.options && f.options.colonnes) return Object.values(f.options.colonnes).flat();
  return [f.colId];
}

describe('enquête du 4ᵉ — la traduction se branche sur les colonnes réelles', () => {
  it('ne vise que des colonnes qui existent', () => {
    const inconnues = champs.flatMap(colonnesDuChamp).filter((c) => !parCol[c]);
    assert.deepEqual(inconnues, []);
  });

  it('respecte le type de chaque colonne', () => {
    const ecarts = [];
    for (const f of champs) {
      if (f.options && f.options.colonnes) continue;   // gabarits vérifiés à part
      const col = parCol[f.colId];
      if (col.type !== f.type) ecarts.push(`${f.colId} : ${f.type} ≠ ${col.type}`);
    }
    assert.deepEqual(ecarts, []);
  });

  it('reprend les choix déclarés dans Grist, sans en inventer', () => {
    const ecarts = [];
    for (const f of champs) {
      const col = parCol[f.colId];
      if (!col || !col.choix || !f.options || !f.options.choices) continue;
      assert.deepEqual(f.options.choices, col.choix, f.colId);
      if (f.options.choices.length !== col.choix.length) ecarts.push(f.colId);
    }
    assert.deepEqual(ecarts, []);
  });

  it('ne laisse aucune colonne de côté', () => {
    const couvertes = new Set(champs.flatMap(colonnesDuChamp));
    [def.meta.timestampCol, def.meta.durationCol].forEach((c) => couvertes.add(c));
    const oubliees = schema.colonnes.map((c) => c.colId).filter((c) => !couvertes.has(c));
    assert.deepEqual(oubliees, []);
  });

  it('ne pose aucune condition sur une colonne inconnue', () => {
    const regles = [];
    const visiter = (c) => {
      if (!c) return;
      if (c.rules) return c.rules.forEach(visiter);
      if (c.field && (!c.source || c.source === 'field')) regles.push(c.field);
    };
    def.sections.forEach((s) => { visiter(s.condition); s.fields.forEach((f) => visiter(f.condition)); });
    assert.deepEqual(regles.filter((c) => !parCol[c]), []);
    assert.ok(regles.length >= 10, 'le questionnaire est fait de chemins : on les attend');
  });

  it('reste en mode liaison : rien à créer dans un document qui porte déjà des réponses', () => {
    assert.equal(def.composeMode, 'bind');
    assert.equal(def.tableId, schema.tableId);
  });
});

describe('enquête du 4ᵉ — ce que le moteur sait rendre aujourd’hui', () => {
  const WIDGETS_MOTEUR = ['text', 'textarea', 'number', 'checkbox', 'date', 'datetime',
    'select', 'radio', 'multiselect', 'likert', 'file'];

  /** Ce qui empêche un champ d'être rendu tel quel, ou `null`. */
  function manque(f) {
    if (f.kind) return f.kind;
    if (!WIDGETS_MOTEUR.includes(f.widget)) return 'widget:' + f.widget;
    if (f.options && f.options.maxSelected) return 'option:maxSelected';
    return null;
  }

  it('l’écart est exactement celui que le registre annonce', () => {
    const parManque = {};
    for (const f of champs) {
      const m = manque(f);
      if (m) parManque[m] = (parManque[m] || 0) + 1;
    }
    // Le jour où l'une de ces lignes tombe à zéro, c'est que le lot est livré :
    // ce test doit alors être mis à jour, et c'est voulu.
    assert.deepEqual(parManque, {
      echelle: 35,
      'widget:ouinon': 9,
      choix_autre: 1,
      classement: 1,
      'option:maxSelected': 1,
      geometrie: 1,
    });
    const rendus = champs.filter((f) => !manque(f)).length;
    assert.equal(rendus, 13);
    assert.equal(champs.length, 61);
  });

  it('l’échelle pèse plus de la moitié du questionnaire', () => {
    const echelles = champs.filter((f) => f.kind === 'echelle');
    assert.ok(echelles.length > champs.length / 2);
    // Trois échelles distinctes, chacune avec ses libellés d'extrémité.
    assert.deepEqual(Object.keys(def.echelles).sort(), ['accord', 'arceaux', 'priorite']);
    for (const e of echelles) assert.ok(def.echelles[e.options.echelle], e.colId);
  });

  it('les échelles sont groupées en matrices, qui sont une mise en page', () => {
    const matrices = new Set(champs.filter((f) => f.kind === 'echelle').map((f) => f.options.matrice));
    assert.equal(matrices.size, 11);
  });
});

describe('enquête du 4ᵉ — la traduction reste dans le contrat', () => {
  const connuesRacine = new Set(Object.keys(schemaFormDef.properties).concat(['meta', 'echelles']));
  const connuesChamp = new Set(Object.keys(schemaFormDef.definitions.field.properties).concat(['kind', 'aide']));

  it('n’ajoute à la racine que ce que le registre déclare', () => {
    const inconnues = Object.keys(def).filter((k) => !connuesRacine.has(k));
    assert.deepEqual(inconnues, [], 'à déclarer dans formdef.schema.json avant d’implémenter');
  });

  it('n’ajoute à un champ que `kind` et `aide`', () => {
    const inconnues = new Set();
    champs.forEach((f) => Object.keys(f).forEach((k) => { if (!connuesChamp.has(k)) inconnues.add(k); }));
    assert.deepEqual([...inconnues], []);
  });
});
