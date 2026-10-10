/**
 * La conduite d'un import IGN, sans écran : choisir un jeu, estimer, importer, annuler, reprendre.
 *
 * ## Pourquoi une session à part
 *
 * Le panneau (`vue-import-ign.js`) ne fait que montrer un état et transmettre des clics. Tout ce qui décide — quand
 * estimer, ce qui est refusé, ce qui se passe quand la zone bouge pendant l'estimation, ce que devient un import
 * annulé — vit ici, avec le réseau, la carte et la création de la couche **injectés**. Les tests le conduisent donc
 * de bout en bout, avec un faux service, sans navigateur.
 *
 * ## Les phases
 *
 *     choix ──choisir──▶ estimation ──▶ pret ──importer──▶ import ──▶ termine
 *                             │           │                   │  └──▶ annule ──reprendre──▶ import
 *                             └──▶ refuse (vide, trop gros)   └──────▶ erreur ──reprendre──▶ import
 *                             └──▶ erreur (service) ──reessayer──▶ estimation
 *
 * - **estimation** : `resultType=hits` sur la zone visible, sans rien télécharger ;
 * - **pret** : l'import est permis (au plus 50 000 objets), avec un avertissement au-dessus de 5 000 ;
 * - **refuse** : zone vide, trop grande ou trop chargée : on dit pourquoi et on dit de zoomer ;
 * - **import** : les pages arrivent une à une ; la zone importée est celle de l'estimation, figée ;
 * - **annule** / **erreur** : tout ce qui a été lu est gardé en mémoire, `reprendre` repart du rang suivant.
 *
 * La zone qui bouge pendant une estimation annule l'estimation en cours et en lance une nouvelle ; une réponse
 * arrivée trop tard (jeton périmé) est ignorée.
 */

import { presetDe, estimer, pagesDe, normaliserEntite, cleDeEntite, decisionImport, estimerDuree, messageErreurImport, verifierEmprise } from './import-ign.js?v=1.16.2';
import { evaluerVolume, importerParPages, nouvelEtatImport } from './import-lots.js?v=1.16.2';
import { creerCoucheIgn } from './import-ign-couche.js?v=1.16.2';

const memeEmprise = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === 4 && a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

/**
 * @param {object} hote ce que l'application fournit
 * @param {Function} hote.fetch
 * @param {() => number[]} hote.emprise la zone visible, `[ouest, sud, est, nord]`
 * @param {() => Promise<number[]>} [hote.emprisePourImport] la zone, après remise à plat de la vue ; défaut : `emprise`
 * @param {Function} hote.creerCouche `makeLayer` d'Atlas
 * @param {(couche: object) => void} hote.ajouterCouche `finalizeNewLayer` d'Atlas
 * @param {() => number} [hote.maintenant]
 * @param {Function} [hote.attendre] pause entre deux pages (tests : instantanée)
 * @param {(etat: object) => void} [hote.surChangement] appelé à chaque changement d'état
 */
export function creerSession(hote) {
  const maintenant = hote.maintenant || (() => Date.now());
  let jeton = 0;
  let estimationCtl = null;
  let importCtl = null;
  let reprise = null;     // { etat, emprise, jeu, dureeMs } : de quoi reprendre un import interrompu
  let dureeCumulMs = 0;

  const e = {
    phase: 'choix',
    etape: null,          // 'estimation' | 'import' : où l'erreur s'est produite
    jeu: null,
    emprise: null,
    estimation: null,     // { n, evaluation, decision, dureeEstimeeS }
    erreur: null,         // { code, message }
    progression: null,
    resultat: null,
    reprenable: false,
  };

  const notifier = () => { if (hote.surChangement) hote.surChangement(session.etat()); };
  const poser = (patch) => { Object.assign(e, patch); notifier(); };

  async function lancerEstimation() {
    if (!e.jeu || !e.emprise) return;
    estimationCtl?.abort();
    const ctl = new AbortController();
    estimationCtl = ctl;
    const monJeton = ++jeton;
    const jeu = e.jeu;
    const emprise = e.emprise;
    poser({ phase: 'estimation', estimation: null, erreur: null, etape: null });
    try {
      verifierEmprise(jeu, emprise);
      const n = await estimer(jeu, emprise, { fetch: hote.fetch, signal: ctl.signal });
      if (monJeton !== jeton) return;
      const evaluation = evaluerVolume(n);
      const decision = decisionImport(evaluation);
      poser({
        phase: decision.ok ? 'pret' : 'refuse',
        estimation: { n, evaluation, decision, dureeEstimeeS: estimerDuree(n, jeu.page) },
      });
    } catch (err) {
      if (monJeton !== jeton || err?.code === 'annule') return;
      if (err?.code === 'emprise_trop_grande') {
        poser({ phase: 'refuse', estimation: null, erreur: { code: err.code, message: messageErreurImport(err) } });
      } else {
        poser({ phase: 'erreur', etape: 'estimation', erreur: { code: err?.code || 'inconnue', message: messageErreurImport(err) } });
      }
    }
  }

  async function conduireImport(jeu, emprise, etat, total) {
    const ctl = new AbortController();
    importCtl = ctl;
    const debutSegment = maintenant();
    poser({ phase: 'import', erreur: null, etape: null, reprenable: false, progression: { fait: etat.curseur, total, pct: total ? Math.min(100, (etat.curseur / total) * 100) : null, resteS: null, refuses: etat.rapport.resume().refuses } });
    const pages = pagesDe(jeu, emprise, { fetch: hote.fetch, signal: ctl.signal, debut: etat.curseur, attendre: hote.attendre });
    const r = await importerParPages({
      pages, etat, total, signal: ctl.signal, maintenant,
      traiter: (f) => normaliserEntite(jeu, f), cle: cleDeEntite,
      plafond: total ? Math.max(Math.ceil(total * 1.5), total + 500) : Infinity,
      onProgression: (p) => poser({ progression: { fait: p.fait, total, pct: p.pct, resteS: p.resteS, refuses: p.refuses } }),
    });
    importCtl = null;
    dureeCumulMs += maintenant() - debutSegment;
    if (r.statut === 'annule') {
      reprise = { etat, emprise, jeu };
      poser({ phase: 'annule', reprenable: true, erreur: null });
      return;
    }
    if (r.statut === 'erreur') {
      reprise = { etat, emprise, jeu };
      poser({ phase: 'erreur', etape: 'import', reprenable: true, erreur: { code: r.erreur?.code || 'inconnue', message: messageErreurImport(r.erreur) } });
      return;
    }
    reprise = null;
    let couche = null;
    if (r.acceptees.length) {
      couche = creerCoucheIgn({ preset: jeu, entites: r.acceptees, emprise, estimes: total, creerCouche: hote.creerCouche });
      hote.ajouterCouche(couche);
    }
    poser({
      phase: 'termine', reprenable: false,
      resultat: {
        importes: r.acceptees.length, estimes: total, refuses: r.rapport.refuses, doublons: r.rapport.doublons, motifs: r.rapport.motifs,
        dureeMs: dureeCumulMs, couche: couche ? { id: couche.id, name: couche.name } : null,
        provenance: couche?.style?.provenance || null,
      },
    });
  }

  const session = {
    /** Une copie de l'état, que la vue peut lire sans le modifier. */
    etat() { return JSON.parse(JSON.stringify(e)); },

    /** Choisit un jeu et estime son volume sur la zone visible. */
    async choisir(id) {
      if (e.phase === 'import') return;
      reprise = null;
      dureeCumulMs = 0;
      poser({ jeu: presetDe(id), emprise: hote.emprise(), resultat: null, progression: null, reprenable: false });
      await lancerEstimation();
    },

    /** La zone visible a bougé : on estime de nouveau, sauf pendant un import (la zone importée est figée). */
    async majEmprise(emprise) {
      if (e.phase === 'import') return;
      if (memeEmprise(emprise, e.emprise)) return;
      e.emprise = emprise;
      if (!e.jeu || e.phase === 'termine' || e.phase === 'annule' || (e.phase === 'erreur' && e.etape === 'import')) { notifier(); return; }
      await lancerEstimation();
    },

    /** Relance l'estimation après une erreur du service. */
    async reessayer() {
      if (e.phase === 'erreur' && e.etape === 'estimation') await lancerEstimation();
    },

    /** Lance l'import de la zone estimée. */
    async importer() {
      if (e.phase !== 'pret' || !e.jeu) return;
      const jeu = e.jeu;
      // L'emprise peut changer quand la vue est remise à plat : on la relit, et on réestime si elle a bougé.
      const lue = hote.emprisePourImport ? await hote.emprisePourImport() : hote.emprise();
      if (!memeEmprise(lue, e.emprise)) {
        e.emprise = lue;
        await lancerEstimation();
        if (e.phase !== 'pret') return;
      }
      estimationCtl?.abort();
      jeton++;
      reprise = null;
      dureeCumulMs = 0;
      await conduireImport(jeu, e.emprise, nouvelEtatImport(), e.estimation.n);
    },

    /** Interrompt l'import en cours : ce qui est lu reste en mémoire pour une reprise. */
    annuler() { importCtl?.abort(); },

    /** Reprend un import annulé ou tombé en erreur, au rang suivant, sur la même zone. */
    async reprendre() {
      if (!reprise || (e.phase !== 'annule' && !(e.phase === 'erreur' && e.etape === 'import'))) return;
      const { etat, emprise, jeu } = reprise;
      await conduireImport(jeu, emprise, etat, e.estimation?.n ?? null);
    },

    /** Abandonne ce qui a été lu et revient au choix du jeu. */
    reinitialiser() {
      importCtl?.abort();
      estimationCtl?.abort();
      jeton++;
      reprise = null;
      dureeCumulMs = 0;
      poser({ phase: 'choix', etape: null, jeu: null, estimation: null, erreur: null, progression: null, resultat: null, reprenable: false });
    },

    /** La session est close (panneau fermé) : rien ne doit plus partir. */
    fermer() {
      estimationCtl?.abort();
      jeton++;
    },
  };
  return session;
}
