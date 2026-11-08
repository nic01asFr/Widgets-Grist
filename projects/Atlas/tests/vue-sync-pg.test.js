import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { htmlCopies, htmlResume, htmlConflits, htmlRapport, htmlSynchro } from '../lib/vue-sync-pg.js';

const copie = { rowId: 3, tableGrist: 'Interventions', config: { schema: 'metier', table: 'interventions', url: 'https://pg.example.org' } };
const conflit = { id: 'c1', nature: 'modifie_des_deux_cotes', cle: { pg_id: 7 } };
const resume0 = { identiques: 5, aPousser: 0, aTirer: 0, conflits: 0, impossibles: 0, insertions: 0, modifications: 0, desactivations: 0 };
const plan = (o = {}) => ({ pret: true, sansChoix: [], push: [], pull: [], ignores: [], ...o });
const ecarts = (o = {}) => ({ doublons: [], conflits: [], ...o });

describe('vue-sync-pg : fragments HTML', () => {
  it('htmlCopies : vide sans copie, un bouton par copie, tout échappé', () => {
    assert.equal(htmlCopies([]), '');
    const h = htmlCopies([{ ...copie, tableGrist: '<b>x</b>' }]);
    assert.match(h, /data-sync="3"/);
    assert.doesNotMatch(h, /<b>x/);
  });

  it('htmlResume : accorde au pluriel et cite les conflits', () => {
    const h = htmlResume({ ...resume0, identiques: 1, aPousser: 2, insertions: 2, aTirer: 1, conflits: 3 });
    assert.match(h, /1<\/strong> ligne identique/);
    assert.match(h, /3<\/strong> conflits/);
  });

  it('htmlConflits : jamais de choix coché d’avance, trois choix par conflit', () => {
    const h = htmlConflits([conflit]);
    assert.doesNotMatch(h, /checked/);
    assert.equal((h.match(/type="radio"/g) || []).length, 3);
    assert.match(htmlConflits([conflit], { c1: 'grist' }), /value="grist" data-conflit="c1" checked/);
    assert.equal(htmlConflits([]), '');
  });

  it('htmlRapport : simulation, refus et interruption sont dits', () => {
    assert.match(htmlRapport({ ok: 2, conflits: 0, refus: 0 }, true), /Simulation \(rien n(&#39;|')a été conservé\)/);
    const h = htmlRapport({ poussees: { ok: 1, conflits: 1, refus: 0 }, tirees: { inserees: 0, modifiees: 0, supprimees: 0 }, ignores: 0,
      echecs: [{ action: 'modifier', cle: { pg_id: 1 }, statut: 'conflit', message: '<script>' }], interrompu: 'passerelle injoignable' });
    assert.match(h, /Interrompu : passerelle injoignable/);
    assert.doesNotMatch(h, /<script>/);
  });
});

describe('vue-sync-pg : htmlSynchro', () => {
  it('repos : seul Comparer est proposé, rien n’est écrit', () => {
    const h = htmlSynchro({ copie, phase: 'repos' });
    assert.match(h, /data-act="comparer"/);
    assert.doesNotMatch(h, /data-act="appliquer"/);
  });

  it('erreur : le message est montré en alerte', () => {
    assert.match(htmlSynchro({ copie, phase: 'erreur', erreur: 'base injoignable' }), /role="alert">base injoignable/);
  });

  it('conflit sans choix : Appliquer et Simuler sont grisés', () => {
    const h = htmlSynchro({ copie, phase: 'compare', resume: { ...resume0, conflits: 1 }, ecarts: ecarts({ conflits: [conflit] }),
      plan: plan({ pret: false, sansChoix: ['c1'] }), choix: {} });
    assert.match(h, /data-act="appliquer"[^>]*disabled/);
    assert.match(h, /1 conflit sans choix/);
  });

  it('plan prêt : Appliquer actif ; en lecture seule : grisé et dit pourquoi', () => {
    const base = { copie, phase: 'compare', resume: { ...resume0, aPousser: 1, modifications: 1 }, ecarts: ecarts(), plan: plan({ push: [{}] }) };
    assert.doesNotMatch(htmlSynchro(base), /data-act="appliquer"[^>]*disabled/);
    const ro = htmlSynchro({ ...base, lectureSeule: true });
    assert.match(ro, /data-act="appliquer"[^>]*disabled/);
    assert.match(ro, /lecture seule/);
  });

  it('tout identique : le dit, sans boutons d’action', () => {
    const h = htmlSynchro({ copie, phase: 'compare', resume: resume0, ecarts: ecarts(), plan: plan() });
    assert.match(h, /Tout est synchronisé/);
    assert.doesNotMatch(h, /data-act="appliquer"/);
    assert.match(h, /data-act="detacher"/);
  });

  it('clés en double : bloquant et annoncé', () => {
    const h = htmlSynchro({ copie, phase: 'compare', resume: resume0, ecarts: ecarts({ doublons: [{ cle: { pg_id: 1 } }] }), plan: plan({ pret: false }) });
    assert.match(h, /apparaissent plusieurs fois/);
  });
});

describe('vue-sync-pg : correctifs de l’essai réel', () => {
  it('une simulation interrompue ne montre pas de compteurs à zéro', () => {
    const h = htmlRapport({ ok: 0, conflits: 0, refus: 0, interrompu: 'jeton refusé' }, true);
    assert.match(h, /Simulation interrompue/);
    assert.doesNotMatch(h, /0 envoi/);
    assert.match(h, /Interrompu : jeton refusé/);
  });

  it('la liste des copies passe à la ligne au lieu de déborder', () => {
    assert.match(htmlCopies([copie]), /flex-wrap:wrap/);
  });
});
