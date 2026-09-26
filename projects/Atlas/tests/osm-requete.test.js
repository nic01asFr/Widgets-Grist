import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { identiteAtlas, enTetesOsm, messageRefusOsm, PAGE_ATLAS } from '../lib/osm-requete.js';

describe('enTetesOsm — se présenter à OpenStreetMap', () => {
  it('l’application nomme Atlas et dit où le trouver', () => {
    const h = enTetesOsm({ application: true, version: 'e9571dd · 2026-09-26' });
    assert.equal(h['User-Agent'], `Atlas/e9571dd (+${PAGE_ATLAS})`);
  });

  it('le navigateur n’en pose aucun : son Referer suffit, et l’en-tête y serait refusé', () => {
    assert.deepEqual(enTetesOsm({ application: false, version: 'x' }), {});
  });

  it('garde les en-têtes de la requête', () => {
    const h = enTetesOsm({ application: true, base: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    assert.equal(h['Content-Type'], 'application/x-www-form-urlencoded');
    assert.ok(h['User-Agent'].startsWith('Atlas/'));
  });

  it('reste un en-tête HTTP valide, quelle que soit la version', () => {
    for (const v of ['', null, undefined, 'é·ü', '  1.9.0  ', 'source']) {
      const ua = identiteAtlas(v);
      assert.match(ua, /^[\x20-\x7e]+$/, JSON.stringify(v));
      assert.match(ua, /^Atlas\/\S+ \(\+https:/);
    }
    assert.equal(identiteAtlas('é·ü'), `Atlas/app (+${PAGE_ATLAS})`);
  });
});

describe('messageRefusOsm — un refus dit sa cause', () => {
  it('406 et 403 : le service n’a pas su qui appelait', () => {
    assert.match(messageRefusOsm(406), /pas présenté/);
    assert.match(messageRefusOsm(403), /pas présenté/);
  });
  it('429 et 504 se règlent en attendant', () => {
    assert.match(messageRefusOsm(429), /réessayez/);
    assert.match(messageRefusOsm(504), /surchargé/);
  });
  it('le reste garde son code', () => {
    assert.equal(messageRefusOsm(500), 'HTTP 500');
  });
});
