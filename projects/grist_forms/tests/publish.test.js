const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../shared/publish.js');

it('moves inline script to js', () => {
  const { html, js } = P.splitHtmlJs('<div>x</div><script>grist.ready({requiredAccess:"full"});</script>');
  assert.ok(!/<script>/i.test(html) || /src=/i.test(html));
  assert.ok(js.includes('grist.ready'));
});

it('keeps external <script src=...> tags in html', () => {
  const { html, js } = P.splitHtmlJs(
    '<script src="https://docs.getgrist.com/grist-plugin-api.js"></script><script>var x=1;</script>'
  );
  assert.ok(html.includes('src="https://docs.getgrist.com/grist-plugin-api.js"'));
  assert.ok(!html.includes('var x=1'));
  assert.ok(js.includes('var x=1'));
});

it('runtime html embeds form id', () => {
  const doc = P.buildRuntimeDocument({ id: 'demo', title: 'T', tableId: 'T', sections: [], choices: {} }, {
    engineJs: '/*engine*/',
    typesJs: '/*types*/',
    attachmentsJs: '/*att*/',
    bridgeJs: '/*bridge*/'
  });
  assert.ok(doc.includes('demo'));
  assert.ok(doc.includes('/*engine*/'));
  assert.ok(doc.includes('/*att*/'));
});

it('runtime html embeds session-context when provided', () => {
  const doc = P.buildRuntimeDocument({ id: 'demo', title: 'T', tableId: 'Contacts', sections: [], choices: {} }, {
    engineJs: '/*engine*/',
    typesJs: '/*types*/',
    bridgeJs: '/*bridge*/',
    sessionContextJs: '/*session*/'
  });
  assert.ok(doc.includes('/*session*/'));
});

it('runtime html embeds bridge, types and DSFR-like structure (no CDN)', () => {
  const doc = P.buildRuntimeDocument({ id: 'demo', title: 'T', tableId: 'Contacts', sections: [], choices: {} }, {
    engineJs: '/*engine*/',
    typesJs: '/*types*/',
    bridgeJs: '/*bridge*/'
  });
  assert.ok(doc.includes('/*bridge*/'));
  assert.ok(doc.includes('/*types*/'));
  assert.ok(doc.includes('fr-container'));
  assert.ok(doc.includes('Engine.mount'));
  assert.ok(doc.includes('GristBridge.addRow'));
  assert.ok(!doc.includes('GouvernementFR/dsfr'));
  assert.ok(!doc.includes('cdn.jsdelivr.net'));
  assert.ok(doc.includes('<style>'));
  assert.ok(doc.includes('--blue-france'));
});

it('builds customView options as outer JSON string with nested customView JSON string', () => {
  const optionsStr = P.buildCustomViewOptions({ html: '<div>form</div>', js: 'var a=1;' });
  assert.equal(typeof optionsStr, 'string');
  const outer = JSON.parse(optionsStr);
  assert.equal(outer.zebraStripes, false);
  assert.equal(typeof outer.customView, 'string');
  const inner = JSON.parse(outer.customView);
  assert.equal(inner.widgetId, '@berhalak/custom-widget-builder');
  assert.equal(inner.access, 'full');
  assert.equal(inner.widgetOptions._html, '<div>form</div>');
  assert.equal(inner.widgetOptions._js, 'var a=1;');
});

it('uses builder fallback url when no custom builderDef given', () => {
  const optionsStr = P.buildCustomViewOptions({ html: '<div/>', js: '' });
  const inner = JSON.parse(JSON.parse(optionsStr).customView);
  assert.equal(inner.widgetDef.url, 'https://gristgouv.github.io/gristlabs-widgets/custom-widget-builder/index.html');
});

it('respects a custom builderDef', () => {
  const builderDef = { widgetId: '@org/custom', url: 'https://example.test/widget' };
  const optionsStr = P.buildCustomViewOptions({ html: '<div/>', js: '', builderDef });
  const inner = JSON.parse(JSON.parse(optionsStr).customView);
  assert.equal(inner.widgetId, '@org/custom');
  assert.equal(inner.widgetDef.url, 'https://example.test/widget');
});

it('runtime html includes runtime-e2e upload hook', () => {
  const doc = P.buildRuntimeDocument({
    id: 'demo', title: 'T', tableId: 'Contacts',
    sections: [{ fields: [{ colId: 'Piece_jointe', type: 'Attachments', label: 'PJ' }] }],
    choices: {}
  }, {
    engineJs: '/*engine*/',
    typesJs: '/*types*/',
    attachmentsJs: '/*att*/',
    bridgeJs: '/*bridge*/'
  });
  assert.ok(doc.includes('grist-forms-runtime-e2e'));
  assert.ok(doc.includes('runRuntimeE2EUpload'));
  assert.ok(doc.includes('grist-forms-runtime-ready'));
});

it('plans CreateViewSection for a custom page bound to tableRef', () => {
  const actions = P.planCreateCustomPage(5, 'Remplir le formulaire');
  assert.equal(actions.length, 1);
  assert.equal(actions[0][0], 'CreateViewSection');
  assert.equal(actions[0][1], 5);
  assert.equal(actions[0][3], 'custom');
  assert.equal(actions[0][5], 'Remplir le formulaire');
});

it('la vue publiee ajoute une ligne par defaut, sans suivre le curseur', () => {
  const doc = P.buildRuntimeDocument({ id: 'f', title: 'F', tableId: 'T', sections: [] }, {});
  assert.ok(doc.includes('editerLigneSelectionnee'), 'la correction de ligne est conditionnee');
  // Sans l'option, aucun ecouteur de curseur n'est pose : le formulaire cree.
  const avantCondition = doc.slice(0, doc.indexOf('editerLigneSelectionnee'));
  assert.ok(!avantCondition.includes('grist.onRecord'), 'onRecord ne doit pas etre pose hors de la condition');
});

it('la vue publiee en correction amorce le formulaire avec la ligne', () => {
  const doc = P.buildRuntimeDocument({ id: 'f', title: 'F', tableId: 'T', editerLigneSelectionnee: true, sections: [] }, {});
  assert.ok(doc.includes('FormEngine.valuesFromRecord'), 'les valeurs de la ligne entrent dans le formulaire');
  assert.ok(doc.includes('onNewRecord'), 'la ligne vierge revient a la creation');
});
