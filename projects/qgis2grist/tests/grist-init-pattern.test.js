const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('index_v2 — pattern init Grist', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index_v2.html'), 'utf8');

  it('appelle grist.ready() synchrone avant probeGrist', () => {
    const readyIdx = html.indexOf("grist.ready({ requiredAccess: 'full' });");
    const probeIdx = html.indexOf('_gristAvailable = await probeGrist()');
    assert.ok(readyIdx > 0, 'grist.ready synchrone absent');
    assert.ok(probeIdx > readyIdx, 'probeGrist doit suivre grist.ready');
  });

  it('probeGrist ne ré-enveloppe pas grist.ready dans Promise.resolve', () => {
    const fn = html.match(/async function probeGrist\(\)[\s\S]*?\n\}/)?.[0] || '';
    assert.ok(!fn.includes('Promise.resolve(grist.ready'), 'anti-pattern Promise.resolve(grist.ready) détecté');
    assert.ok(fn.includes('listTables'), 'probeGrist doit tester listTables');
  });

  it('le catch init ne force pas _gristAvailable à false', () => {
    const initCatch = html.match(/Init failed:[\s\S]*?setState\('drop'\)/)?.[0] || '';
    assert.ok(!initCatch.includes('_gristAvailable = false'));
  });
});
