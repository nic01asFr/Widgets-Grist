import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lireTout, LIMITE_PAGE, LIMITE_TOTALE } from '../lib/pg-lecture.js';

const cible = { connexion: 'm', schema: 'public', table: 'notes' };

/** Une passerelle à pagination : `n` lignes, pages de `limite`, `suivant` tant qu'il en reste. */
function passerelle(n, { paginee = true } = {}) {
  const appels = [];
  return {
    appels,
    async commande(nom, corps) {
      appels.push({ nom, corps });
      const debut = corps.decalage || 0;
      const fin = Math.min(n, debut + corps.limite);
      const lignes = Array.from({ length: fin - debut }, (_, i) => ({ cle: { id: debut + i + 1 }, valeurs: {}, version: 1 }));
      const tronque = n > fin;
      return { lignes, nb_lignes: lignes.length, tronque, ...(paginee ? { decalage: debut, suivant: tronque ? fin : null } : {}) };
    },
  };
}

describe('pg-lecture : lire toute une table par pages', () => {
  it('une table qui tient en une page se lit comme avant : un appel, sans decalage', async () => {
    const p = passerelle(7);
    const r = await lireTout(p, cible, { page: 10 });
    assert.equal(r.nb_lignes, 7);
    assert.equal(r.tronque, false);
    assert.equal(p.appels.length, 1);
    assert.equal('decalage' in p.appels[0].corps, false, 'une passerelle plus ancienne ne connaît pas ce paramètre');
    assert.equal(p.appels[0].corps.limite, 10);
  });

  it('enchaîne les pages dans l’ordre, sans doublon ni trou', async () => {
    const p = passerelle(25);
    const r = await lireTout(p, cible, { page: 10 });
    assert.equal(r.nb_lignes, 25);
    assert.equal(r.pages, 3);
    assert.deepEqual(r.lignes.map((l) => l.cle.id), Array.from({ length: 25 }, (_, i) => i + 1));
    assert.deepEqual(p.appels.map((a) => a.corps.decalage), [undefined, 10, 20]);
    assert.equal(r.tronque, false);
  });

  it('une passerelle sans pagination s’arrête à la première page et le dit (tronqué)', async () => {
    const p = passerelle(25, { paginee: false });
    const r = await lireTout(p, cible, { page: 10 });
    assert.equal(r.tronque, true);
    assert.equal(r.nb_lignes, 10);
    assert.equal(p.appels.length, 1);
  });

  it('au-delà du total permis, s’arrête et le dit : jamais une lecture partielle prise pour complète', async () => {
    const p = passerelle(100);
    const r = await lireTout(p, cible, { page: 10, total: 30 });
    assert.equal(r.tronque, true);
    assert.equal(r.nb_lignes, 30);
  });

  it('un `suivant` qui ne progresse pas n’enferme pas dans une boucle', async () => {
    let n = 0;
    const p = { async commande() { n += 1; if (n > 5) throw new Error('boucle'); return { lignes: [{ cle: { id: n } }], tronque: true, suivant: 0 }; } };
    const r = await lireTout(p, cible, { page: 1 });
    assert.equal(r.tronque, true);
    assert.equal(n, 1);
  });

  it('une erreur de la passerelle remonte telle quelle, jamais avalée', async () => {
    const p = { async commande() { throw new Error('Passerelle injoignable'); } };
    await assert.rejects(lireTout(p, cible), /injoignable/);
  });

  it('les limites par défaut : une page au plafond de la passerelle, 50 000 lignes au plus', () => {
    assert.equal(LIMITE_PAGE, 10000);
    assert.equal(LIMITE_TOTALE, 50000);
  });
});
