'use strict';

/*
 * Revue de sécurité du 31/10/2026 : ce que le propriétaire d'un document écrit dans un formulaire (ou ce qu'un
 * import y met) ne doit jamais sortir de son rôle de texte ou de nom de colonne.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Publish = require('../shared/publish.js');
const Limites = require('../shared/limites.js');
const Externe = require('../shared/externe.js');

describe('Page figée : rien d\'un libellé ne ferme la balise script', () => {
  const piege = 'L </script><img src=x onerror=alert(2)> fin';
  const def = {
    id: 'f', title: 'a</title><img src=x onerror=alert(1)>', tableId: 'T',
    sections: [{ id: 's', label: piege, fields: [{ colId: 'N', label: piege, type: 'Text', widget: 'text' }] }]
  };

  it('le formulaire est écrit sans « < » ni « > » bruts dans le script', () => {
    const doc = Publish.buildRuntimeDocument(def, {});
    const { html, js } = Publish.splitHtmlJs(doc);
    assert.ok(!/<img src=x/.test(html), 'rien de l\'injection ne reste dans le HTML');
    assert.ok(js.includes('window.__FORM_DEF__ = '), 'le script n\'est pas tronqué');
    assert.match(js, /\\u003c\/script\\u003e/, 'le libellé est conservé, échappé');
  });

  it('le titre de la page est échappé', () => {
    const doc = Publish.buildRuntimeDocument(def, {});
    assert.ok(!/<title>[^<]*<img/.test(doc));
    assert.match(doc, /<title>a&lt;\/title&gt;&lt;img/);
  });

  it('un module embarqué qui contient « </script » ne casse pas la page', () => {
    const doc = Publish.buildRuntimeDocument({ id: 'f', title: 'T', tableId: 'T', sections: [] }, { engineJs: '// fin </script> ?\nvar a = 1;' });
    const { js } = Publish.splitHtmlJs(doc);
    assert.ok(js.includes('window.__FORM_DEF__'), 'la suite du script est présente');
    assert.ok(js.includes('var a = 1;'));
  });
});

describe('Formule Python de « Place » : un nom de colonne, jamais du code', () => {
  const piege = "x if __import__('os').getcwd() else 1";

  it('normaliser refuse une capaciteCol qui n\'est pas un nom de colonne', () => {
    const r = Limites.normaliser({ parChoix: [{ colId: 'Atelier', capaciteCol: piege }] });
    assert.ok(r.erreurs.length >= 1);
    assert.match(r.erreurs.join(' '), /capaciteCol/);
    assert.ok(!r.limites || !(r.limites.parChoix || []).length);
  });

  it('une limite qui n\'a pas passé normaliser n\'écrit pas non plus de code dans la formule', () => {
    const f = Limites.formulePlace({ placeCol: 'Place', parChoix: [{ colId: 'Atelier', capaciteCol: piege }] }, 'Inscriptions');
    assert.ok(!f || !/__import__/.test(f));
  });

  it('un nom de colonne valide passe', () => {
    const r = Limites.normaliser({ parChoix: [{ colId: 'Atelier', capaciteCol: 'Capacite' }] });
    assert.deepEqual(r.erreurs, []);
    assert.match(Limites.formulePlace(r.limites, 'Inscriptions'), /r\.Atelier\.Capacite/);
  });

  it('un choix ou une valeur avec retour à la ligne reste sur une ligne Python', () => {
    const f = Limites.formulePlace({ placeCol: 'Place', total: 5, sauf: { colId: 'Statut', valeurs: ['a\nb', 'c\rd'] } }, 'T');
    assert.ok(f.includes("'a\\nb'") && f.includes("'c\\rd'"));
    assert.ok(!/'a\nb'/.test(f));
  });
});

describe('Formule « Motifs » : la règle du lieu est linéaire', () => {
  it('ne contient plus l\'enchaînement de deux « \\s* » séparés par un « Z? » facultatif', () => {
    const def = {
      id: 'f', title: 'F', tableId: 'Signalements', composeMode: 'ensureSchema',
      sections: [{ id: 's', label: 'S', fields: [{ colId: 'Lieu', label: 'Lieu', type: 'Text', widget: 'geo', kind: 'geometrie', options: { geometrie: 'Point' } }] }]
    };
    const f = Externe.formuleMotifs(def, 'Signalements').formule;
    assert.ok(/POINT/.test(f), 'la règle du lieu est bien générée');
    assert.ok(!/Z\?\\s\*/.test(f), 'plus de « Z?\\s* » (quadratique sur des milliers d\'espaces)');
  });
});
