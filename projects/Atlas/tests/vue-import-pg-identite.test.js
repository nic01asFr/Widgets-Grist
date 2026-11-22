import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { confirmerIdentite } from '../lib/vue-import-pg.js';

/** Un faux document : juste de quoi construire la boîte, la poser, cliquer et appuyer sur une touche. */
function fauxDocument() {
  const ecouteurs = { document: {} };
  const fabrique = (tag) => {
    const e = {
      tag, enfants: [], textContent: '', style: {}, ecouteurs: {}, attributs: {}, retire: false, focus() { fauxDocument.focus = e; },
      setAttribute(k, v) { e.attributs[k] = v; },
      append(...n) { e.enfants.push(...n); },
      addEventListener(t, f) { e.ecouteurs[t] = f; },
      remove() { e.retire = true; },
    };
    return e;
  };
  const doc = {
    body: fabrique('body'),
    createElement: fabrique,
    addEventListener(t, f) { ecouteurs.document[t] = f; },
    removeEventListener(t) { delete ecouteurs.document[t]; },
    ecouteurs,
  };
  return doc;
}
const trouver = (e, texte) => {
  if (e.textContent === texte) return e;
  for (const f of e.enfants) { const r = trouver(f, texte); if (r) return r; }
  return null;
};

describe('confirmerIdentite — la question avant d’envoyer le jeton du document', () => {
  it('nomme la passerelle, et « Autoriser » est la seule voie qui rend true', async () => {
    const doc = fauxDocument();
    const p = confirmerIdentite(doc, { origine: 'https://pg.exemple.fr' });
    const fond = doc.body.enfants[0];
    assert.equal(fond.attributs['aria-modal'], 'true');
    assert.ok(JSON.stringify(fond, (k, v) => (k === 'ecouteurs' ? undefined : v)).includes('https://pg.exemple.fr'), 'l’adresse est affichée');
    trouver(fond, 'Autoriser').ecouteurs.click();
    assert.equal(await p, true);
    assert.equal(fond.retire, true, 'la boîte est retirée');
    assert.deepEqual(doc.ecouteurs.document, {}, 'l’écouteur du clavier est retiré');
  });

  it('« Refuser » rend false', async () => {
    const doc = fauxDocument();
    const p = confirmerIdentite(doc, { origine: 'https://pg.exemple.fr' });
    trouver(doc.body.enfants[0], 'Refuser').ecouteurs.click();
    assert.equal(await p, false);
  });

  it('Échap refuse, et le focus de départ est sur « Refuser » (une touche Entrée distraite n’envoie rien)', async () => {
    const doc = fauxDocument();
    const p = confirmerIdentite(doc, { origine: 'https://pg.exemple.fr' });
    assert.equal(fauxDocument.focus, trouver(doc.body.enfants[0], 'Refuser'));
    let empeche = false;
    doc.ecouteurs.document.keydown({ key: 'Escape', preventDefault() { empeche = true; } });
    assert.equal(await p, false);
    assert.equal(empeche, true);
  });
});
