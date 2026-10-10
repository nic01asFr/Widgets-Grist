import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { provenanceDe, attributionDe, htmlProvenance } from '../lib/provenance-couche.js';
import { optionsSourceGeojson, SOURCE_GEOJSON_MAXZOOM } from '../lib/terrain-base.js';
import { PRESETS, metadonneesCouche } from '../lib/import-ign.js';

const echapper = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const couche = (provenance) => ({ style: { provenance } });
const vraie = metadonneesCouche(PRESETS.routes, {
  emprise: [5.37, 43.293, 5.38, 43.3], importes: 3,
  entites: [{ properties: { date_modification: '2026-04-10T14:24:51.050Z' } }], date: new Date('2026-10-10T12:00:00Z'),
});

describe('provenance-couche — la lecture', () => {
  it('rend la provenance d’une couche qui en porte une, null sinon', () => {
    assert.equal(provenanceDe(couche(vraie)), vraie);
    assert.equal(provenanceDe({}), null);
    assert.equal(provenanceDe(null), null);
    assert.equal(provenanceDe(couche('texte')), null);
    assert.equal(provenanceDe(couche([1])), null);
  });
});

describe('provenance-couche — l’attribution de la carte', () => {
  it('rend la mention de source de la provenance IGN', () => {
    assert.equal(attributionDe(couche(vraie)), '© IGN — BD TOPO® (Licence Ouverte 2.0)');
  });

  it('rien sans provenance', () => {
    assert.equal(attributionDe({}), null);
    assert.equal(attributionDe(couche({})), null);
    assert.equal(attributionDe(couche({ attribution: 12 })), null);
    assert.equal(attributionDe(couche({ attribution: '   ' })), null);
  });

  it('une provenance venue d’un fichier ne peut pas écrire du HTML dans la carte (MapLibre passe par innerHTML)', () => {
    const pieges = [
      '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
      '<a href="javascript:alert(1)" onclick="x()">IGN</a>',
      '"><img src=x onerror=alert(1)>',
      'IGN &lt;b&gt; `x` \\u003c',
    ];
    for (const a of pieges) {
      const sortie = attributionDe(couche({ attribution: a }));
      assert.doesNotMatch(sortie ?? '', /[<>&"'`\\]/, a);
    }
  });

  it('coupe ce qui n’est plus une mention', () => {
    assert.equal(attributionDe(couche({ attribution: 'x'.repeat(5000) })).length, 200);
  });

  it('ne lit pas `_attribution` : ce champ vient des scènes et reste hors de ce chemin', () => {
    assert.equal(attributionDe({ _attribution: '© autre' }), null);
  });
});

describe('provenance-couche — les informations de la couche', () => {
  it('source, jeu, licence, édition, et le lien vers les conditions de licence', () => {
    const h = htmlProvenance(couche(vraie), echapper);
    assert.match(h, /Source : IGN · BD TOPO®/);
    assert.match(h, /Licence Ouverte 2\.0/);
    assert.match(h, /édition 2026-06-15/);
    assert.match(h, /<a href="https:\/\/github\.com\/etalab\/licence-ouverte\/blob\/master\/LO\.md" target="_blank" rel="noopener noreferrer">Conditions de licence<\/a>/);
    assert.match(h, /cartes\.gouv\.fr\/cgu/);
    assert.match(h, /retard/);
  });

  it('une couche sans provenance n’ajoute rien ; sans échappement fourni, rien non plus', () => {
    assert.equal(htmlProvenance({}, echapper), '');
    assert.equal(htmlProvenance(couche(vraie)), '');
    assert.equal(htmlProvenance(couche({ jeu: 'x' }), echapper), '');
  });

  it('échappe tout ; un lien qui n’est pas en https n’est pas écrit', () => {
    const hostile = couche({
      source: '<script>x</script>', jeu: '"><b>', licence: { nom: '<i>', url: 'javascript:alert(1)', conditions: 'http://exemple.org/' },
      edition: { annoncee: '<u>' }, avertissementEdition: '<img src=x onerror=y>',
    });
    const h = htmlProvenance(hostile, echapper);
    assert.doesNotMatch(h, /<script|<img|<b>|<i>|<u>|javascript:|href="http:/);
    assert.doesNotMatch(h, /onerror=y>/);
    assert.doesNotMatch(h, /<a /);
  });

  it('un lien dont l’adresse porte un guillemet ou un espace est refusé', () => {
    const h = htmlProvenance(couche({ source: 'IGN', licence: { url: 'https://exemple.org/" onclick="x' } }), echapper);
    assert.doesNotMatch(h, /<a /);
  });

  it('Admin Express : pas d’édition annoncée, la dernière modification vue la remplace quand elle existe', () => {
    const a = metadonneesCouche(PRESETS.communes, { emprise: [5, 43, 5.1, 43.1], importes: 1 });
    assert.doesNotMatch(htmlProvenance(couche(a), echapper), / · édition /);
    const b = htmlProvenance(couche(vraie), echapper);
    assert.match(b, / · édition 2026-06-15/);
    const c = metadonneesCouche(PRESETS.communes, { emprise: [5, 43, 5.1, 43.1], importes: 1, entites: [{ properties: { date_modification: '2026-01-02T00:00:00Z' } }] });
    assert.match(htmlProvenance(couche(c), echapper), /modifié jusqu’au 2026-01-02/);
  });
});

describe('terrain-base — la source GeoJSON et son attribution', () => {
  const data = { type: 'FeatureCollection', features: [] };
  it('sans attribution, rien ne change', () => {
    assert.deepEqual(optionsSourceGeojson(data), { type: 'geojson', data, maxzoom: SOURCE_GEOJSON_MAXZOOM });
    assert.deepEqual(optionsSourceGeojson(data, null), { type: 'geojson', data, maxzoom: SOURCE_GEOJSON_MAXZOOM });
  });
  it('avec une attribution, la source la déclare', () => {
    assert.equal(optionsSourceGeojson(data, '© IGN').attribution, '© IGN');
  });
});
