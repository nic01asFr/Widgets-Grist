const { describe, it } = require('node:test');

const assert = require('node:assert/strict');

const F = require('../lib/qgis-form-to-formdef.js');



describe('layerToFormDef', () => {

  const layer = {

    displayName: 'Apiary',

    name: 'Apiary',

    geomType: 'Point',

    hasData: true,

    _formFieldOrder: ['beekeeper', 'nbr_of_boxes', 'bee_species', 'picture'],

    fields: [

      { name: 'beekeeper', label: 'Apiculteur', gType: 'Text' },

      { name: 'nbr_of_boxes', label: 'Ruches', gType: 'Int' },

      { name: 'bee_species', label: 'Espèce', gType: 'Choice', widgetOptions: '{"choices":["A","B"]}' },

      { name: 'picture', label: 'Photo', gType: 'Text', _externalResource: true },

      { name: 'latitude', gType: 'Numeric' },

      { name: 'longitude', gType: 'Numeric' },

    ],

  };



  it('produit FormDef bind avec ordre QGIS', () => {

    const def = F.layerToFormDef(layer, 'Apiary', {});

    assert.equal(def.composeMode, 'bind');

    assert.equal(def.tableId, 'Apiary');

    assert.equal(def.sections[0].fields[0].colId, 'beekeeper');

    assert.equal(def.sections[0].fields[2].type, 'Choice');

    // La colonne est restee du texte : le formulaire dit le texte. Promettre
    // un champ fichier ici ecrirait `"[1]"` dans la colonne, et aurait
    // d'abord efface le chemin de la photo pose par QField.
    assert.equal(def.sections[0].fields[3].type, 'Text');
    assert.equal(def.sections[0].fields[3].widget, 'text');

    assert.ok(!def.sections[0].fields.some(x => x.colId === 'latitude'));
  });

  it('une vraie colonne Attachments donne un champ fichier', () => {
    // C'est le cas ou l'envoi a un sens : la colonne recoit des identifiants
    // de pieces jointes, et Atlas sait les y verser.
    const avecPJ = { ...layer, fields: [...layer.fields, { name: 'cliche', label: 'Cliche', gType: 'Attachments' }] };
    const champ = F.layerToFormDef(avecPJ, 'Apiary', {}).sections[0].fields.find(x => x.colId === 'cliche');
    assert.equal(champ.type, 'Attachments');
    assert.equal(champ.widget, 'file');

  });



  it('normalise Ref:Table en type Ref avec visibleCol', () => {

    const imported = {

      Apiary: {

        displayName: 'Apiary',

        _formFieldOrder: ['beekeeper'],

        fields: [{ name: 'beekeeper', label: 'Apiculteur', gType: 'Text' }],

      },

    };

    const pollen = {

      displayName: 'Pollen',

      _formFieldOrder: ['percentage', 'apiary_uuid'],

      fields: [

        { name: 'percentage', gType: 'Int' },

        { name: 'apiary_uuid', gType: 'Ref:Apiary', _refTargetTable: 'Apiary', label: 'Rucher' },

      ],

    };

    const def = F.layerToFormDef(pollen, 'Pollen_Consumption', {}, imported);

    const ref = def.sections[0].fields.find(f => f.colId === 'apiary_uuid');

    assert.equal(ref.type, 'Ref');

    assert.equal(ref.options.refTable, 'Apiary');

    assert.equal(ref.options.visibleCol, 'beekeeper');

  });



  it('masque champs GPS QField et *_id si *_uuid Ref', () => {

    const layerGps = {

      displayName: 'Tracks',

      _formFieldOrder: ['x', 'y', 'horizontal_accuracy', 'note'],

      fields: [

        { name: 'x', gType: 'Numeric' },

        { name: 'y', gType: 'Numeric' },

        { name: 'horizontal_accuracy', gType: 'Numeric' },

        { name: 'note', gType: 'Text' },

      ],

    };

    const defGps = F.layerToFormDef(layerGps, 'Tracks', {});

    assert.ok(!defGps.sections[0].fields.some(f => f.colId === 'x'));

    assert.ok(defGps.sections[0].fields.some(f => f.colId === 'note'));



    const layerDup = {

      displayName: 'Pollen',

      _formFieldOrder: ['apiary_uuid', 'apiary_id'],

      fields: [

        { name: 'apiary_uuid', gType: 'Ref:Apiary', _refTargetTable: 'Apiary' },

        { name: 'apiary_id', gType: 'Int' },

      ],

    };

    const defDup = F.layerToFormDef(layerDup, 'Pollen', {});

    assert.ok(defDup.sections[0].fields.some(f => f.colId === 'apiary_uuid'));

    assert.ok(!defDup.sections[0].fields.some(f => f.colId === 'apiary_id'));

  });

});



describe('isTerrainFormCandidate', () => {

  it('exclut basemap', () => {

    assert.equal(F.isTerrainFormCandidate({

      displayName: 'buildings', hasData: true, geomType: 'Polygon',

      _formFieldOrder: ['a'],

      fields: [{ name: 'a', gType: 'Text' }],

    }), false);

  });



  it('exclut couche géo sans layout QField', () => {

    assert.equal(F.isTerrainFormCandidate({

      displayName: 'Batiments 4eme', hasData: true, geomType: 'Polygon',

      _formFieldOrder: [],

      fields: [{ name: 'a', gType: 'Text' }],

    }), false);

  });



  it('accepte couche métier Point avec layout', () => {

    assert.equal(F.isTerrainFormCandidate({

      displayName: 'Apiary', hasData: true, geomType: 'Point',

      _formFieldOrder: ['beekeeper'],

      fields: [{ name: 'beekeeper', gType: 'Text' }],

    }), true);

  });

});



describe('buildTerrainPack', () => {

  it('génère un pack multi-formulaires', () => {

    const pack = F.buildTerrainPack({

      Apiary: {

        displayName: 'Apiary', hasData: true, geomType: 'Point',

        _formFieldOrder: ['beekeeper'],

        fields: [{ name: 'beekeeper', gType: 'Text' }],

      },

      buildings: {

        displayName: 'buildings', hasData: true, geomType: 'Polygon',

        _formFieldOrder: ['label'],

        fields: [{ name: 'label', gType: 'Text' }],

      },

    }, {});

    assert.equal(pack.forms.length, 1);

    assert.equal(pack.primaryTableId, 'Apiary');

  });

});

describe('Ref vers une couche non importee', () => {
  const parent = { name: 'Parent', displayName: 'Parent', geomType: 'None', hasData: true, fields: [{ name: 'code', gType: 'Text' }] };
  const enfant = {
    name: 'Enfant', displayName: 'Enfant', geomType: 'Point', hasData: true, _formFieldOrder: ['nom', 'pos', 'type'],
    fields: [
      { name: 'nom', gType: 'Text' },
      { name: 'pos', label: 'Position', gType: 'Ref:Absente', _refTargetTable: 'Absente', _refTargetField: 'code' },
      { name: 'type', label: 'Type', gType: 'Ref:Parent', _refTargetTable: 'Parent', _refTargetField: 'code' },
    ],
  };
  const importees = { Enfant: enfant, Parent: parent };

  it('un champ dont la table cible est absente devient un champ texte, comme la colonne importee', () => {
    const fd = F.layerToFormDef(enfant, 'Enfant', { Enfant: 'Enfant', Parent: 'Parent' }, importees);
    const pos = fd.sections[0].fields.find((x) => x.colId === 'pos');
    assert.equal(pos.widget, 'text');
    assert.equal(pos.type, 'Text');
    assert.equal(pos.options, undefined);
  });

  it('une Ref vers une couche importee reste une liste deroulante avec sa table', () => {
    const fd = F.layerToFormDef(enfant, 'Enfant', { Enfant: 'Enfant', Parent: 'Parent' }, importees);
    const type = fd.sections[0].fields.find((x) => x.colId === 'type');
    assert.equal(type.widget, 'select');
    assert.equal(type.options.refTable, 'Parent');
  });

  it('sans information sur les couches importees, rien n est degrade', () => {
    const fd = F.layerToFormDef(enfant, 'Enfant', {}, undefined);
    assert.equal(fd.sections[0].fields.find((x) => x.colId === 'pos').widget, 'select');
  });
});

describe('colonne d affichage d une liste deroulante', () => {
  const parentQgep = {
    name: 'Vl_fonction', displayName: 'vl_fonction', geomType: 'None', hasData: true,
    fields: [{ name: 'fid', gType: 'Text' }, { name: 'code', gType: 'Text' }, { name: 'value_en', gType: 'Text' }, { name: 'value_fr', gType: 'Text' }],
    features: [{ properties: { fid: null, code: '4532', value_en: 'drop', value_fr: 'chute' } }, { properties: { fid: null, code: '5344', value_en: 'other', value_fr: 'autre' } }],
  };
  const enfant = { name: 'Regard', displayName: 'Regard', geomType: 'Point', hasData: true, _formFieldOrder: ['fonction'],
    fields: [{ name: 'fonction', gType: 'Ref:Vl_fonction', _refTargetTable: 'Vl_fonction', _refTargetField: 'code' }] };
  const importees = { Regard: enfant, Vl_fonction: parentQgep };

  it('prend un libelle lisible qui porte des valeurs, pas la colonne fid vide', () => {
    const fd = F.layerToFormDef(enfant, 'Regard', { Regard: 'Regard', Vl_fonction: 'Vl_fonction' }, importees);
    assert.equal(fd.sections[0].fields[0].options.visibleCol, 'value_fr');
  });

  it('sans entites chargees (apres import, la memoire est liberee), prend quand meme le libelle connu et jamais fid', () => {
    const sansDonnees = Object.assign({}, parentQgep, { features: [] });
    const fd = F.layerToFormDef(enfant, 'Regard', { Regard: 'Regard', Vl_fonction: 'Vl_fonction' }, { Regard: enfant, Vl_fonction: sansDonnees });
    assert.equal(fd.sections[0].fields[0].options.visibleCol, 'value_fr');
  });

  it('sans entites et sans colonne de libelle connue, prend la premiere colonne texte non technique (pas fid)', () => {
    const parent = { name: 'Vl_x', displayName: 'vl_x', geomType: 'None', hasData: true, features: [],
      fields: [{ name: 'fid', gType: 'Text' }, { name: 'code', gType: 'Text' }, { name: 'intitule_court', gType: 'Text' }] };
    const enf = Object.assign({}, enfant, { fields: [{ name: 'fonction', gType: 'Ref:Vl_x', _refTargetTable: 'Vl_x', _refTargetField: 'code' }] });
    const fd = F.layerToFormDef(enf, 'Regard', { Regard: 'Regard', Vl_x: 'Vl_x' }, { Regard: enf, Vl_x: parent });
    assert.equal(fd.sections[0].fields[0].options.visibleCol, 'code');
  });

  it('une colonne de libelle vide est ecartee au profit d une colonne qui porte des valeurs', () => {
    const parent = Object.assign({}, parentQgep, { features: [{ properties: { fid: null, code: '1', value_en: 'x', value_fr: '' } }] });
    const fd = F.layerToFormDef(enfant, 'Regard', { Regard: 'Regard', Vl_fonction: 'Vl_fonction' }, { Regard: enfant, Vl_fonction: parent });
    assert.equal(fd.sections[0].fields[0].options.visibleCol, 'value_en');
  });
});
