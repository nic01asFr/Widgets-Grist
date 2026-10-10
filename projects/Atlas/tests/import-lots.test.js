import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEUILS_IMPORT, evaluerVolume, creerSuivi, formaterDuree, creerRapport, nouvelEtatImport, importerParPages,
} from '../lib/import-lots.js';

/** Un itérable asynchrone de pages de `taille` objets numérotés `{n, cle}`. */
async function* pagesDe(total, taille, { echecApres = null, signal = null, annulerApresPage = null, depuis = 0 } = {}) {
  let page = 0;
  for (let debut = depuis; debut < total; debut += taille) {
    if (echecApres !== null && page === echecApres) throw Object.assign(new Error('panne'), { code: 'reseau' });
    const features = [];
    for (let i = debut; i < Math.min(total, debut + taille); i++) features.push({ n: i, cle: `K${i}` });
    page++;
    // l'annulation survient pendant la lecture de la page : elle est vue dès que la page est traitée
    if (annulerApresPage !== null && page === annulerApresPage && signal) signal.aborted = true;
    yield { features, debut };
  }
}
const accepte = (e) => ({ entite: e });
const cle = (e) => e.cle;

describe('import-lots — les seuils', () => {
  it('5 000 pour avertir, 50 000 pour refuser', () => {
    assert.deepEqual(SEUILS_IMPORT, { avertir: 5000, refuser: 50000 });
    assert.equal(evaluerVolume(5000).niveau, 'ok');
    assert.equal(evaluerVolume(5001).niveau, 'avertir');
    assert.equal(evaluerVolume(50000).niveau, 'avertir');
    assert.equal(evaluerVolume(50001).niveau, 'refuser');
  });

  it('dit « zoomez » au refus, et le nombre avec ses séparateurs', () => {
    const r = evaluerVolume(577215);
    assert.match(r.message, /577 215/);
    assert.match(r.message, /Zoomez/);
    assert.match(evaluerVolume(1).message, /1 objet\./);
    assert.match(evaluerVolume(2).message, /2 objets\./);
  });

  it('vide et inconnu sont des cas à part ; des seuils propres à la source sont possibles', () => {
    assert.equal(evaluerVolume(0).niveau, 'vide');
    assert.equal(evaluerVolume(NaN).niveau, 'inconnu');
    assert.equal(evaluerVolume(null).niveau, 'inconnu');
    assert.equal(evaluerVolume(-3).niveau, 'inconnu');
    assert.equal(evaluerVolume(150, { seuils: { avertir: 100, refuser: 200 } }).niveau, 'avertir');
  });
});

describe('import-lots — le suivi', () => {
  it('pourcentage, débit lissé et reste estimé, avec une horloge injectée', () => {
    let t = 0;
    const suivi = creerSuivi({ total: 1000, maintenant: () => t });
    t = 1000; suivi.tick(250);
    let e = suivi.etat();
    assert.equal(e.fait, 250);
    assert.equal(e.pct, 25);
    assert.equal(e.debit, 250);
    assert.equal(e.resteS, 3);
    t = 2000; suivi.tick(500);
    e = suivi.etat();
    assert.ok(e.debit > 250 && e.debit < 500, 'moyenne mobile : entre les deux débits');
    assert.equal(e.fait, 750);
  });

  it('sans total : pas de pourcentage ni de reste', () => {
    const suivi = creerSuivi({ maintenant: () => 0 });
    suivi.tick(10);
    const e = suivi.etat();
    assert.equal(e.pct, null);
    assert.equal(e.resteS, null);
  });

  it('formaterDuree', () => {
    assert.equal(formaterDuree(null), 'estimation en cours');
    assert.equal(formaterDuree(2), 'moins de 5 s');
    assert.equal(formaterDuree(42), '40 s');
    assert.equal(formaterDuree(150), '2 min 30 s');
    assert.equal(formaterDuree(120), '2 min');
    assert.equal(formaterDuree(3900), '1 h 5 min');
  });
});

describe('import-lots — le rapport des refus', () => {
  it('compte par motif, garde cinq exemples de rang, trie par nombre', () => {
    const r = creerRapport();
    for (let i = 0; i < 8; i++) r.refuser(i, 'geometrie_invalide', 'illisible');
    r.refuser(20, 'identifiant_absent', 'sans clé');
    r.doublon(); r.doublon();
    const s = r.resume();
    assert.equal(s.refuses, 9);
    assert.equal(s.doublons, 2);
    assert.equal(s.motifs[0].code, 'geometrie_invalide');
    assert.equal(s.motifs[0].n, 8);
    assert.deepEqual(s.motifs[0].exemples, [0, 1, 2, 3, 4]);
    assert.equal(s.motifs[1].n, 1);
  });

  it('un résumé est une copie : le modifier ne touche pas le rapport', () => {
    const r = creerRapport();
    r.refuser(1, 'x', 'y');
    r.resume().motifs[0].exemples.push(99);
    assert.deepEqual(r.resume().motifs[0].exemples, [1]);
  });
});

describe('import-lots — importer par pages', () => {
  it('garde tout ce qui est accepté, page après page, avec la progression', async () => {
    const progres = [];
    const r = await importerParPages({ pages: pagesDe(250, 100), traiter: accepte, total: 250, onProgression: (p) => progres.push(p) });
    assert.equal(r.statut, 'termine');
    assert.equal(r.acceptees.length, 250);
    assert.equal(r.etat.curseur, 250);
    assert.equal(progres.length, 3);
    assert.deepEqual(progres.map((p) => p.fait), [100, 200, 250]);
    assert.equal(progres.at(-1).pct, 100);
    assert.equal(r.erreur, null);
    assert.equal(r.rapport.refuses, 0);
  });

  it('rapporte les objets refusés avec leur rang dans la source, et ne les garde pas', async () => {
    const traiter = (e, rang) => (e.n % 50 === 7 ? { refus: { code: 'geometrie_invalide', message: 'illisible' } } : accepte(e, rang));
    const r = await importerParPages({ pages: pagesDe(200, 80), traiter });
    assert.equal(r.acceptees.length, 196);
    assert.equal(r.rapport.refuses, 4);
    assert.deepEqual(r.rapport.motifs[0].exemples, [7, 57, 107, 157]);
  });

  it('retire les doublons par clé et les compte à part', async () => {
    const pages = (async function* () {
      yield { features: [{ cle: 'A' }, { cle: 'B' }] };
      yield { features: [{ cle: 'B' }, { cle: 'C' }] };
    })();
    const r = await importerParPages({ pages, traiter: accepte, cle });
    assert.deepEqual(r.acceptees.map((e) => e.cle), ['A', 'B', 'C']);
    assert.equal(r.rapport.doublons, 1);
    assert.equal(r.rapport.refuses, 0);
  });

  it('s’annule entre deux pages et rend ce qui était lu', async () => {
    const signal = { aborted: false };
    const r = await importerParPages({ pages: pagesDe(500, 100, { signal, annulerApresPage: 2 }), traiter: accepte, signal });
    assert.equal(r.statut, 'annule');
    assert.equal(r.acceptees.length, 200);
    assert.equal(r.etat.curseur, 200);
  });

  it('déjà annulé au départ : rien n’est lu', async () => {
    let lu = false;
    const pages = (async function* () { lu = true; yield { features: [] }; })();
    const r = await importerParPages({ pages, traiter: accepte, signal: { aborted: true } });
    assert.equal(r.statut, 'annule');
    assert.equal(lu, false);
  });

  it('une source qui s’interrompt (code annule) donne le même résultat qu’un signal', async () => {
    const pages = (async function* () {
      yield { features: [{ cle: 'A' }] };
      throw Object.assign(new Error('Lecture annulée.'), { code: 'annule' });
    })();
    const r = await importerParPages({ pages, traiter: accepte, cle });
    assert.equal(r.statut, 'annule');
    assert.equal(r.acceptees.length, 1);
  });

  it('une panne en cours de route n’efface rien, et se reprend où elle s’est arrêtée', async () => {
    const etat = nouvelEtatImport();
    const r1 = await importerParPages({ pages: pagesDe(300, 100, { echecApres: 2 }), traiter: accepte, cle, etat });
    assert.equal(r1.statut, 'erreur');
    assert.equal(r1.erreur.code, 'reseau');
    assert.equal(r1.acceptees.length, 200);
    assert.equal(etat.curseur, 200);
    // reprise : la source relit à partir du curseur, le MÊME état est repassé
    const r2 = await importerParPages({ pages: pagesDe(300, 100, { depuis: etat.curseur }), traiter: accepte, cle, etat });
    assert.equal(r2.statut, 'termine');
    assert.equal(r2.acceptees.length, 300);
    assert.equal(new Set(r2.acceptees.map((e) => e.cle)).size, 300);
    assert.equal(r2.rapport.doublons, 0);
  });

  it('une reprise qui relit une page déjà lue ne garde pas deux fois les mêmes objets', async () => {
    const etat = nouvelEtatImport();
    await importerParPages({ pages: pagesDe(200, 100, { echecApres: 1 }), traiter: accepte, cle, etat });
    const r = await importerParPages({ pages: pagesDe(200, 100, { depuis: 0 }), traiter: accepte, cle, etat });
    assert.equal(r.acceptees.length, 200);
    assert.equal(r.rapport.doublons, 100);
  });

  it('une source hors de contrôle (plus d’objets que le plafond) interrompt l’import', async () => {
    const r = await importerParPages({ pages: pagesDe(1000, 100), traiter: accepte, plafond: 300 });
    assert.equal(r.statut, 'erreur');
    assert.equal(r.erreur.code, 'trop_d_objets');
    assert.ok(r.etat.curseur <= 400);
  });

  it('la durée est mesurée avec l’horloge injectée', async () => {
    let t = 1000;
    const r = await importerParPages({ pages: pagesDe(10, 5), traiter: accepte, maintenant: () => (t += 500) });
    assert.ok(r.dureeMs >= 1000);
  });
});
