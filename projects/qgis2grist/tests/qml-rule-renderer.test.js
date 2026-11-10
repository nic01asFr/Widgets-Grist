/**
 * parseQmlStyle — ruleRenderer QML (filtres + normalisation)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

function decodeQgsEntities(s) {
  return String(s || '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseQgsFilter(filter) {
  const f = decodeQgsEntities(filter).trim();
  if (!f) return { kind: 'else' };
  const rangeMatch = f.match(/"([^"]+)"\s*>=\s*([-\d.]+)\s+AND\s+"\1"\s*(?:<|<=)\s*([-\d.]+)/i);
  if (rangeMatch) {
    return { kind: 'range', field: rangeMatch[1], lower: parseFloat(rangeMatch[2]), upper: parseFloat(rangeMatch[3]) };
  }
  const eqMatch = f.match(/"([^"]+)"\s*=\s*'((?:\\'|[^'])*)'/);
  if (eqMatch) return { kind: 'eq', field: eqMatch[1], value: eqMatch[2].replace(/\\'/g, "'") };
  const eqNum = f.match(/"([^"]+)"\s*=\s*([-\d.]+)/);
  if (eqNum) return { kind: 'eq', field: eqNum[1], value: eqNum[2] };
  return { kind: 'expr', filter: f };
}

function normalizeRulesToStyle(rules) {
  const eqRules = rules.filter(r => r.kind === 'eq' && r.field);
  if (eqRules.length >= 2 && eqRules.every(r => r.field === eqRules[0].field)) {
    return {
      type: 'categorizedSymbol',
      field: eqRules[0].field,
      categories: eqRules.map(r => ({ value: r.value, label: r.label || r.value, color: r.color })),
    };
  }
  const rangeRules = rules.filter(r => r.kind === 'range' && r.field);
  if (rangeRules.length >= 2 && rangeRules.every(r => r.field === rangeRules[0].field)) {
    return {
      type: 'graduatedSymbol',
      field: rangeRules[0].field,
      categories: rangeRules.map(r => ({
        lower: r.lower, upper: r.upper,
        value: r.label || `${r.lower}–${r.upper}`,
        label: r.label || `${r.lower}–${r.upper}`,
        color: r.color,
      })),
    };
  }
  return null;
}

describe('parseQgsFilter', () => {
  it('filtre égalité QGIS', () => {
    const r = parseQgsFilter('&quot;sens_de_circulation&quot; = \'Double sens\'');
    assert.equal(r.kind, 'eq');
    assert.equal(r.field, 'sens_de_circulation');
    assert.equal(r.value, 'Double sens');
  });

  it('filtre intervalle QGIS', () => {
    const r = parseQgsFilter('&quot;hauteur&quot; >= 0 AND &quot;hauteur&quot; &lt; 5');
    assert.equal(r.kind, 'range');
    assert.equal(r.field, 'hauteur');
    assert.equal(r.lower, 0);
    assert.equal(r.upper, 5);
  });
});

describe('normalizeRulesToStyle', () => {
  it('rules égalité → categorizedSymbol', () => {
    const rules = [
      { kind: 'eq', field: 'sens_de_circulation', value: 'Sens unique', label: 'Sens unique', color: '#ff0000' },
      { kind: 'eq', field: 'sens_de_circulation', value: 'Double sens', label: 'Double sens', color: '#00ff00' },
    ];
    const style = normalizeRulesToStyle(rules);
    assert.equal(style.type, 'categorizedSymbol');
    assert.equal(style.field, 'sens_de_circulation');
    assert.equal(style.categories.length, 2);
    assert.equal(style.categories[1].color, '#00ff00');
  });

  it('rules intervalles → graduatedSymbol', () => {
    const rules = [
      { kind: 'range', field: 'hauteur', lower: 0, upper: 5, label: '0-5 m', color: '#cccccc' },
      { kind: 'range', field: 'hauteur', lower: 5, upper: 25, label: '5-25 m', color: '#666666' },
    ];
    const style = normalizeRulesToStyle(rules);
    assert.equal(style.type, 'graduatedSymbol');
    assert.equal(style.field, 'hauteur');
    assert.equal(style.categories[0].upper, 5);
  });
});
