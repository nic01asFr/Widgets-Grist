const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Att = require('../shared/attachments.js');

describe('FormAttachments', () => {
  it('normalizeUploadResponse — id, array, objet', () => {
    assert.deepEqual(Att.normalizeUploadResponse(42), [42]);
    assert.deepEqual(Att.normalizeUploadResponse([1, 2]), [1, 2]);
    assert.deepEqual(Att.normalizeUploadResponse({ id: 9 }), [9]);
    assert.deepEqual(Att.normalizeUploadResponse({ ids: [3, 4] }), [3, 4]);
  });

  it('uploadFiles concatène les ids via fetch mock', async () => {
    const calls = [];
    const files = [
      new File(['a'], 'a.pdf', { type: 'application/pdf' }),
      new File(['b'], 'b.pdf', { type: 'application/pdf' })
    ];
    const ids = await Att.uploadFiles(files, {
      getAccessToken: async () => ({ baseUrl: 'https://g/doc', token: 'tok' }),
      fetch: async (url, opts) => {
        calls.push({ url, hasBody: !!opts.body });
        return {
          ok: true,
          json: async () => [calls.length + 10]
        };
      }
    });
    assert.deepEqual(ids, [11, 12]);
    assert.equal(calls.length, 2);
    assert.ok(calls[0].url.includes('auth=tok'));
  });

  it('simpleUpload (option H) : fetch sans en-tête X-Requested-With', async () => {
    const headersSeen = [];
    const files = [new File(['a'], 'h.txt', { type: 'text/plain' })];
    await Att.uploadFiles(files, {
      getAccessToken: async () => ({ baseUrl: 'https://g/doc', token: 'tok' }),
      simpleUpload: true,
      fetch: async (url, opts) => {
        headersSeen.push(opts.headers || {});
        return { ok: true, json: async () => [99] };
      }
    });
    assert.equal(headersSeen.length, 1);
    assert.equal(headersSeen[0]['X-Requested-With'], undefined);
    assert.equal(headersSeen[0].accept, 'application/json');
  });

  it('simpleUpload false : fetch avec X-Requested-With', async () => {
    const headersSeen = [];
    const files = [new File(['a'], 'b.txt', { type: 'text/plain' })];
    await Att.uploadFiles(files, {
      getAccessToken: async () => ({ baseUrl: 'https://g/doc', token: 'tok' }),
      simpleUpload: false,
      fetch: async (url, opts) => {
        headersSeen.push(opts.headers || {});
        return { ok: true, json: async () => [88] };
      }
    });
    assert.equal(headersSeen[0]['X-Requested-With'], 'XMLHttpRequest');
  });

  it('resolveAttachmentFields remplace File-like par ids', async () => {
    const values = {
      Piece: [new File(['x'], 'x.png', { type: 'image/png' })]
    };
    await Att.resolveAttachmentFields({
      sections: [{
        fields: [{ colId: 'Piece', label: 'Pièce', type: 'Attachments', widget: 'file' }]
      }]
    }, values, {
      getAccessToken: async () => ({ baseUrl: 'https://g', token: 't' }),
      fetch: async () => ({ ok: true, json: async () => [77] })
    });
    assert.deepEqual(values.Piece, [77]);
  });
  it("l'hote peut envoyer lui-meme (uploadFile), sans jeton de document", async () => {
    const envoyes = [];
    const files = [new File(['a'], 'photo.jpg', { type: 'image/jpeg' })];
    const ids = await Att.uploadFiles(files, {
      uploadFile: async (fichier) => { envoyes.push(fichier.name); return [51]; },
    });
    assert.deepEqual(ids, [51]);
    assert.deepEqual(envoyes, ['photo.jpg']);
  });

  it('uploadFile prime sur le jeton, et une reponse vide leve', async () => {
    const files = [new File(['a'], 'p.jpg', { type: 'image/jpeg' })];
    await assert.rejects(
      Att.uploadFiles(files, {
        uploadFile: async () => [],
        getAccessToken: () => { throw new Error('ne doit pas etre appele'); },
      }),
      /Reponse upload inattendue|Réponse upload inattendue/,
    );
  });

  it("resolveAttachmentFields passe par uploadFile quand l'hote en fournit un", async () => {
    const values = { photo: [new File(['x'], 'x.jpg', { type: 'image/jpeg' })] };
    await Att.resolveAttachmentFields({
      sections: [{ fields: [{ colId: 'photo', label: 'Photo', type: 'Attachments', widget: 'file' }] }],
    }, values, { uploadFile: async () => 64 });
    assert.deepEqual(values.photo, [64]);
  });

  it('sans fichier choisi, une valeur illisible est laissee telle quelle', async () => {
    // Cas reel : colonne restee en texte, portant le chemin d'une photo QField.
    const values = { photo: 'DCIM/batiment_12.jpg' };
    await Att.resolveAttachmentFields({
      sections: [{ fields: [{ colId: 'photo', label: 'Photo', type: 'Attachments', widget: 'file' }] }],
    }, values, {});
    assert.equal(values.photo, 'DCIM/batiment_12.jpg');
  });

  it('sans fichier choisi, des ids existants sont conserves et un champ vide reste vide', async () => {
    const values = { avec: ['L', 7, 8], sans: null };
    await Att.resolveAttachmentFields({
      sections: [{ fields: [
        { colId: 'avec', label: 'Avec', type: 'Attachments', widget: 'file' },
        { colId: 'sans', label: 'Sans', type: 'Attachments', widget: 'file' },
      ] }],
    }, values, {});
    assert.deepEqual(values.avec, [7, 8]);
    assert.equal(values.sans, null);
  });
});
