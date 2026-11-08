/**
 * Le panneau « Synchroniser » : comparer une copie Grist avec sa table PostgreSQL, trancher les conflits, simuler, appliquer.
 *
 * CHARGÉ À LA DEMANDE (depuis le panneau PG). Les fonctions `html*` sont pures (testées sans navigateur, tout est échappé) ;
 * `ouvrirSynchro` les pilote.
 *
 * ## Ce que la personne voit, dans l'ordre
 * 1. **Comparer** : lit Grist, PostgreSQL et la mémoire de la dernière synchronisation. Rien n'est écrit. Seul le jeton de LECTURE sert.
 * 2. Le résumé des écarts, puis chaque **conflit** avec trois choix : « PostgreSQL gagne », « Grist gagne », « Ignorer ». Il n'y a
 *    pas de choix par défaut, et « Appliquer » reste grisé tant qu'un conflit n'a pas de choix. Les boutons « Tout … » sont des
 *    gestes explicites, jamais une règle.
 * 3. **Simuler** la poussée : la passerelle fait tous ses contrôles puis annule tout. Demande le jeton d'ÉCRITURE de la personne.
 * 4. **Appliquer** : après une confirmation qui dit combien de lignes partent de chaque côté.
 * 5. Le compte rendu : ce qui est passé, ce qui a été refusé et pourquoi.
 */

import { echapper } from './html.js?v=20261010a';
import { NATURES_CONFLIT, planifier, resumer } from './pg-sync.js?v=20261109a';
import { comparer, appliquer, simulerPoussee, ErreurSync } from './pg-sync-session.js?v=20261109a';
import { texteErreur, creerClientPg } from './pg-passerelle.js?v=20261109a';
import { origineLisible } from './pg-liaisons.js?v=20261109a';

const nombre = (n) => Number(n).toLocaleString('fr-FR').replace(/ | /g, ' ');
const pluriel = (n, un, plusieurs) => (n > 1 ? plusieurs : un);
const STYLE_ALERTE = 'margin:8px 0;padding:8px 10px;font-size:12.5px;line-height:1.4;border-left:3px solid #d9a21b;background:rgba(217,162,27,.12);border-radius:4px';
const STYLE_REFUS = 'margin:8px 0;padding:8px 10px;font-size:12.5px;line-height:1.4;border-left:3px solid #c0392b;background:rgba(192,57,43,.1);border-radius:4px';
const STYLE_OK = 'margin:8px 0;padding:8px 10px;font-size:12.5px;line-height:1.4;border-left:3px solid #2e8b57;background:rgba(46,139,87,.1);border-radius:4px';
const LIGNES_MAX = 30;

/** Les copies du document, avec un bouton pour chacune. */
export function htmlCopies(copies) {
  if (!copies.length) return '';
  return `<div class="section" style="margin-top:12px"><div class="range-info"><strong>Copies synchronisables</strong></div>${copies.map((c) => `
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin:8px 0">
      <span style="font-size:12.5px;min-width:0;flex:1 1 140px;overflow-wrap:anywhere">${echapper(c.tableGrist)}<br>
        <span class="range-info">${echapper(c.config.schema)}.${echapper(c.config.table)} · ${echapper(origineLisible(c.config.url))}</span></span>
      <button type="button" class="btn" data-sync="${echapper(String(c.rowId))}" aria-label="Synchroniser ${echapper(c.tableGrist)}">Synchroniser</button>
    </div>`).join('')}</div>`;
}

/** Le résumé des écarts, en phrases. */
export function htmlResume(resume) {
  const l = [];
  l.push(`<li><strong>${nombre(resume.identiques)}</strong> ligne${pluriel(resume.identiques, '', 's')} identique${pluriel(resume.identiques, '', 's')}</li>`);
  if (resume.aPousser) {
    const d = [];
    if (resume.insertions) d.push(`${nombre(resume.insertions)} insertion${pluriel(resume.insertions, '', 's')}`);
    if (resume.modifications) d.push(`${nombre(resume.modifications)} modification${pluriel(resume.modifications, '', 's')}`);
    if (resume.desactivations) d.push(`${nombre(resume.desactivations)} suppression${pluriel(resume.desactivations, '', 's')}/désactivation${pluriel(resume.desactivations, '', 's')}`);
    l.push(`<li><strong>${nombre(resume.aPousser)}</strong> à envoyer vers PostgreSQL (${d.join(', ')})</li>`);
  }
  if (resume.aTirer) l.push(`<li><strong>${nombre(resume.aTirer)}</strong> à recevoir de PostgreSQL dans Grist</li>`);
  if (resume.conflits) l.push(`<li><strong>${nombre(resume.conflits)}</strong> conflit${pluriel(resume.conflits, '', 's')} : à trancher ci-dessous</li>`);
  if (resume.impossibles) l.push(`<li>${nombre(resume.impossibles)} suppression${pluriel(resume.impossibles, '', 's')} impossible${pluriel(resume.impossibles, '', 's')} (la table n'autorise pas la suppression : les lignes restent dans PostgreSQL)</li>`);
  return `<ul style="margin:6px 0 6px 18px;padding:0;font-size:12.5px;line-height:1.6">${l.join('')}</ul>`;
}

const LIBELLES_CHOIX = Object.freeze([['pg', 'PostgreSQL gagne'], ['grist', 'Grist gagne'], ['ignorer', 'Ignorer pour l’instant']]);

/** Les conflits, un bloc chacun, avec ses trois choix et AUCUN choix coché d'avance. */
export function htmlConflits(conflits, choix = {}) {
  if (!conflits.length) return '';
  const montres = conflits.slice(0, LIGNES_MAX);
  const reste = conflits.length - montres.length;
  return `<div class="section" style="margin-top:8px"><div class="range-info"><strong>Conflits</strong> — aucune règle automatique : choisissez.</div>
    <div style="margin:6px 0"><button type="button" class="btn btn-soft" data-tout="pg">Tout : PostgreSQL gagne</button>
      <button type="button" class="btn btn-soft" data-tout="grist">Tout : Grist gagne</button>
      <button type="button" class="btn btn-soft" data-tout="ignorer">Tout ignorer</button></div>
    ${montres.map((c) => `
    <fieldset style="margin:8px 0;padding:6px 8px;border:1px solid rgba(128,128,128,.4);border-radius:4px">
      <legend style="font-size:12px">Ligne ${echapper(Object.entries(c.cle || {}).map(([k, v]) => `${k} = ${v}`).join(', '))}</legend>
      <div class="range-info">${echapper(NATURES_CONFLIT[c.nature] || c.nature)}</div>
      ${LIBELLES_CHOIX.map(([v, libelle]) => `<label style="display:block;font-size:12.5px"><input type="radio" name="${echapper(c.id)}" value="${v}" data-conflit="${echapper(c.id)}"${choix[c.id] === v ? ' checked' : ''}> ${libelle}</label>`).join('')}
    </fieldset>`).join('')}
    ${reste > 0 ? `<div class="range-info">… et ${nombre(reste)} autre${pluriel(reste, '', 's')} conflit${pluriel(reste, '', 's')} : utilisez « Tout … » pour les traiter ensemble, ou appliquez par étapes.</div>` : ''}
  </div>`;
}

/** Le compte rendu d'une application ou d'une simulation. */
export function htmlRapport(r, simulation = false) {
  const p = r.poussees || r;
  const lignes = [];
  // Une simulation interrompue n'a rien vérifié : ses compteurs à zéro se liraient comme « tout va bien ».
  if (simulation && r.interrompu) lignes.push('Simulation interrompue : rien n’a été vérifié.');
  else if (simulation) lignes.push(`Simulation (rien n'a été conservé) : ${nombre(p.ok)} envoi${pluriel(p.ok, '', 's')} passerai${pluriel(p.ok, 't', 'ent')}, ${nombre(p.conflits)} conflit${pluriel(p.conflits, '', 's')}, ${nombre(p.refus)} refus.`);
  else {
    lignes.push(`Envoyé vers PostgreSQL : ${nombre(p.ok)} ligne${pluriel(p.ok, '', 's')}${p.conflits ? `, ${nombre(p.conflits)} conflit${pluriel(p.conflits, '', 's')}` : ''}${p.refus ? `, ${nombre(p.refus)} refusée${pluriel(p.refus, '', 's')}` : ''}.`);
    const t = r.tirees || { inserees: 0, modifiees: 0, supprimees: 0 };
    lignes.push(`Reçu dans Grist : ${nombre(t.inserees)} ajoutée${pluriel(t.inserees, '', 's')}, ${nombre(t.modifiees)} modifiée${pluriel(t.modifiees, '', 's')}, ${nombre(t.supprimees)} supprimée${pluriel(t.supprimees, '', 's')}.`);
    if (r.ignores) lignes.push(`${nombre(r.ignores)} conflit${pluriel(r.ignores, '', 's')} ignoré${pluriel(r.ignores, '', 's')} : à retrouver à la prochaine comparaison.`);
  }
  const echecs = (r.echecs || []).slice(0, LIGNES_MAX);
  const bon = (p.conflits || 0) + (p.refus || 0) === 0 && !r.interrompu;
  return `<div style="${bon ? STYLE_OK : STYLE_ALERTE}" role="status">${lignes.map((x) => `<div>${echapper(x)}</div>`).join('')}
    ${r.interrompu ? `<div style="${STYLE_REFUS}" role="alert">Interrompu : ${echapper(r.interrompu)}</div>` : ''}
    ${echecs.length ? `<ul style="margin:6px 0 0 18px;padding:0">${echecs.map((e) => `<li>${echapper(e.action || '')} ${echapper(JSON.stringify(e.cle ?? ''))} : ${echapper(e.statut || '')}${e.code ? ` (${echapper(e.code)})` : ''}${e.message ? ` — ${echapper(e.message)}` : ''}</li>`).join('')}</ul>` : ''}
  </div>`;
}

/**
 * Le panneau entier, pour un état donné.
 *
 * @param {{copie: {tableGrist: string, config: object}, phase: string, resume?: object, ecarts?: object, choix?: object, plan?: object,
 *   rapport?: object, simulation?: object, erreur?: string, lectureSeule?: boolean}} e
 */
export function htmlSynchro(e) {
  const c = e.copie.config;
  const tete = `<div class="range-info"><strong>${echapper(e.copie.tableGrist)}</strong> ⇄ ${echapper(c.schema)}.${echapper(c.table)}<br>
    Passerelle : ${echapper(origineLisible(c.url))}</div>`;
  const comparer_ = `<button type="button" class="btn btn-soft btn-full" data-act="comparer" ${e.phase === 'lecture' ? 'disabled' : ''}>${e.resume ? 'Comparer à nouveau' : 'Comparer'}</button>`;
  if (e.phase === 'repos') {
    return `${tete}<div class="range-info" style="margin:8px 0">Comparer lit la table Grist, la table PostgreSQL et la mémoire de la dernière synchronisation. <strong>Rien n'est écrit.</strong></div>${comparer_}`;
  }
  if (e.phase === 'lecture') return `${tete}<div class="range-info" role="status" aria-live="polite">Lecture des deux côtés…</div>`;
  if (e.phase === 'erreur') return `${tete}<div style="${STYLE_REFUS}" role="alert">${echapper(e.erreur || 'Erreur')}</div>${comparer_}`;

  const resume = e.resume;
  const rien = !resume.aPousser && !resume.aTirer && !resume.conflits && !resume.impossibles && !(e.ecarts && e.ecarts.doublons.length);
  const doublons = e.ecarts && e.ecarts.doublons.length
    ? `<div style="${STYLE_REFUS}" role="alert">${nombre(e.ecarts.doublons.length)} clé${pluriel(e.ecarts.doublons.length, '', 's')} apparaissent plusieurs fois dans Grist (${echapper(e.ecarts.doublons.slice(0, 5).map((d) => JSON.stringify(d.cle)).join(', '))}) : corrigez-les avant de synchroniser.</div>` : '';
  const plan = e.plan || { pret: false, sansChoix: [], push: [], pull: [] };
  const aFaire = plan.push.length + plan.pull.length;
  const raison = e.lectureSeule ? 'Document en lecture seule : l’application écrirait dans Grist.' : !plan.pret ? (e.ecarts.doublons.length ? 'Des clés en double bloquent la synchronisation.' : `${nombre(plan.sansChoix.length)} conflit${pluriel(plan.sansChoix.length, '', 's')} sans choix.`) : !aFaire ? 'Rien à appliquer.' : '';
  const actions = rien ? '' : `
    <div style="margin:8px 0">
      <button type="button" class="btn btn-soft btn-full" data-act="simuler" ${plan.pret && plan.push.length ? '' : 'disabled'} title="Mêmes contrôles que l'application, rien n'est conservé. Demande votre jeton d'écriture.">Simuler l'envoi vers PostgreSQL</button>
      <button type="button" class="btn btn-primary btn-full" data-act="appliquer" style="margin-top:6px" ${plan.pret && aFaire && !e.lectureSeule ? '' : 'disabled'}>Appliquer</button>
      ${raison ? `<div class="range-info" role="status">${echapper(raison)}</div>` : ''}
    </div>`;
  return `${tete}${comparer_}
    ${rien ? `<div style="${STYLE_OK}" role="status">Tout est synchronisé : ${nombre(resume.identiques)} ligne${pluriel(resume.identiques, '', 's')} identique${pluriel(resume.identiques, '', 's')}.</div>` : htmlResume(resume)}
    ${doublons}${htmlConflits(e.ecarts.conflits, e.choix)}${actions}
    ${e.simulation ? htmlRapport(e.simulation, true) : ''}${e.rapport ? htmlRapport(e.rapport) : ''}
    <div style="margin-top:12px"><button type="button" class="btn btn-soft" data-act="detacher" title="Oublie la configuration et la mémoire de cette copie ; la table Grist reste.">Détacher cette copie</button></div>`;
}

function confirmation(plan, ecarts) {
  const envoi = plan.push.length;
  const recu = plan.pull.length;
  return `Appliquer la synchronisation ?\n\n• ${envoi} ligne${pluriel(envoi, '', 's')} écrite${pluriel(envoi, '', 's')} dans PostgreSQL (avec votre jeton d'écriture)\n• ${recu} ligne${pluriel(recu, '', 's')} écrite${pluriel(recu, '', 's')} dans Grist\n• ${plan.ignores.length} conflit${pluriel(plan.ignores.length, '', 's')} ignoré${pluriel(plan.ignores.length, '', 's')}\n\nLes lignes modifiées entre-temps dans PostgreSQL ne seront pas écrasées (un conflit sera rapporté).`;
}

/**
 * Pilote le panneau.
 *
 * @param {object} h
 * @param {object} h.hote  `{corps, titre, annoncer, docApi, lectureSeule}`
 * @param {{rowId: number, tableGrist: string, config: object}} h.copie
 * @param {{commande: Function}} h.clientLecture  client de la passerelle avec le jeton de lecture
 * @param {object} h.accesEcriture  `creerAccesPg(...)` pour le jeton d'ÉCRITURE (mémoire de la page, autre boîte de saisie)
 * @param {() => void} h.retour
 * @param {Function} [h.detacher]  `detacherCopie`, injecté
 */
export function ouvrirSynchro({ hote, copie, clientLecture, accesEcriture, retour, detacher }) {
  const e = { copie, phase: 'repos', choix: {}, lectureSeule: !!hote.lectureSeule() };
  let racine = null;
  let etats = null;
  const clientEcriture = creerClientPg({ url: copie.config.url, acces: accesEcriture });

  const vivant = () => !!racine && racine.isConnected && hote.corps.contains(racine);
  function monter() {
    hote.titre('Synchroniser', 'Comparer, trancher les conflits, appliquer.');
    hote.corps.innerHTML = `<div id="sync-racine"><div id="sync-contenu" aria-live="polite"></div>
      <div class="section"><button type="button" class="btn btn-soft btn-full" data-act="retour">← Retour</button></div></div>`;
    racine = hote.corps.querySelector('#sync-racine');
    racine.addEventListener('click', surClic);
    racine.addEventListener('change', (ev) => {
      const r = ev.target.closest('[data-conflit]');
      if (r) { e.choix[r.dataset.conflit] = r.value; replanifier(); dessiner(); }
    });
  }
  function dessiner() {
    const z = racine && racine.querySelector('#sync-contenu');
    if (z) z.innerHTML = htmlSynchro(e);
  }
  function replanifier() {
    if (e.ecarts) { e.plan = planifier(copie.config, e.ecarts, e.choix); e.resume = resumer(e.ecarts, e.plan); }
  }

  async function comparerMaintenant() {
    e.phase = 'lecture'; e.rapport = null; e.simulation = null;
    dessiner();
    try {
      const { etats: lus, ecarts } = await comparer({ docApi: hote.docApi(), config: copie.config, client: clientLecture });
      etats = lus; e.ecarts = ecarts;
      // les choix déjà faits survivent à une nouvelle comparaison seulement pour les conflits qui existent encore
      const ids = new Set(ecarts.conflits.map((c) => c.id));
      e.choix = Object.fromEntries(Object.entries(e.choix).filter(([k]) => ids.has(k)));
      e.phase = 'compare';
      replanifier();
    } catch (err) {
      e.phase = 'erreur';
      e.erreur = err instanceof ErreurSync ? err.message : texteErreur(err);
    }
    if (vivant()) dessiner();
  }

  async function simuler() {
    if (!e.plan || !e.plan.pret) return;
    try {
      e.simulation = await simulerPoussee({ config: copie.config, clientEcriture, plan: e.plan, etats });
    } catch (err) { e.simulation = { ok: 0, conflits: 0, refus: 0, echecs: [], interrompu: texteErreur(err) }; }
    if (vivant()) dessiner();
  }

  async function appliquerMaintenant() {
    if (!e.plan || !e.plan.pret || e.lectureSeule) return;
    if (!window.confirm(confirmation(e.plan, e.ecarts))) return;
    e.phase = 'lecture'; e.simulation = null;
    dessiner();
    try {
      e.rapport = await appliquer({ docApi: hote.docApi(), config: copie.config, clientEcriture, plan: e.plan, etats, ecarts: e.ecarts });
      hote.annoncer(e.rapport.interrompu ? `Synchronisation interrompue : ${e.rapport.interrompu}` : 'Synchronisation appliquée.', e.rapport.interrompu || e.rapport.echecs.length ? 'warning' : 'success');
      // on recompare pour montrer l'état réel après l'application ; le compte rendu reste affiché
      const rapport = e.rapport;
      await comparerMaintenant();
      e.rapport = rapport;
    } catch (err) {
      e.phase = 'erreur';
      e.erreur = err instanceof ErreurSync ? err.message : texteErreur(err);
    }
    if (vivant()) dessiner();
  }

  async function surClic(ev) {
    const tout = ev.target.closest('[data-tout]');
    if (tout && racine.contains(tout)) {
      for (const c of e.ecarts.conflits) e.choix[c.id] = tout.dataset.tout;
      replanifier(); dessiner();
      return;
    }
    const a = ev.target.closest('[data-act]');
    if (!a || !racine.contains(a)) return;
    const act = a.dataset.act;
    if (act === 'retour') retour();
    else if (act === 'comparer') await comparerMaintenant();
    else if (act === 'simuler') await simuler();
    else if (act === 'appliquer') await appliquerMaintenant();
    else if (act === 'detacher' && detacher) {
      if (!window.confirm(`Détacher « ${copie.tableGrist} » ?\n\nLa table Grist reste ; sa configuration et la mémoire de synchronisation sont supprimées.`)) return;
      try { await detacher({ docApi: hote.docApi(), copie }); hote.annoncer('Copie détachée.', 'success'); retour(); } catch (err) { hote.annoncer(`Détachement impossible : ${err.message || err}`, 'error'); }
    }
  }

  monter();
  dessiner();
  return { etat: e, comparer: comparerMaintenant, simuler, appliquer: appliquerMaintenant };
}
