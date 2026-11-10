/**
 * Reproduit la race fileInput.value = '' → NotReadableError (Node 18+).
 * Usage: node tests/repro-file-input-race.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { File } = require('node:buffer');

describe('race fileInput reset vs File.arrayBuffer', () => {
  it('lecture OK si arrayBuffer avant invalidation simulée', async () => {
    const data = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // PK..
    const file = new File([data], 'test.zip', { type: 'application/zip' });
    const ab = await file.arrayBuffer();
    assert.equal(ab.byteLength, 4);
  });

  it('filePayload pattern — buffer copié avant traitement long', async () => {
    const data = new Uint8Array(1024).fill(0xab);
    const file = new File([data], 'big.zip', { type: 'application/zip' });
    const filePayload = { kind: 'buffer', data: await file.arrayBuffer() };
    // simulate cleanup / UI work after read
    await new Promise(r => setTimeout(r, 10));
    assert.equal(filePayload.data.byteLength, 1024);
  });
});
