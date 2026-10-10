/**
 * Le panneau « Import IGN » : choisir un jeu de données, voir combien d'objets la zone visible en contient, importer,
 * suivre l'avancement, annuler, lire le résumé.
 *
 * ## Ce que ce module est, et n'est pas
 *
 * Il est CHARGÉ À LA DEMANDE (`import()` dynamique, au clic sur le bouton « IGN ») : tant que personne ne l'ouvre, il
 * ne coûte rien à la page. Il ne décide de rien : tout ce qui se décide (estimer, refuser, annuler, reprendre) est
 * dans `import-ign-session.js`, qu'il pilote, et il ne montre que l'état de la session. Il n'importe rien de
 * l'application : tout ce qu'il lui faut (la carte, la création de la couche, les messages) lui est donné par `hote`.
 *
 * ## La forme du panneau
 *
 * C'est celle du panneau « Import OSM » : la zone visible en tête (la même qui est importée, vue remise à plat),
 * puis les jeux en cartes à icônes. Deux différences voulues : une carte choisit au lieu de lancer (l'import est
 * précédé d'une estimation, et on ne lance pas sans l'avoir vue), et chaque carte est un vrai `<button>` (le
 * clavier y accède, un lecteur d'écran l'annonce « bouton, activé » ou non).
 *
 * Les fonctions `html*` sont pures : elles rendent du texte HTML à partir d'un état, et échappent tout ce qui vient
 * des données. Elles sont testées sans navigateur.
 */

import { mettreAPlat } from './vue-import.js?v=20260911a';
import { echapper } from './html.js?v=20261010a';
import { presetsParGroupe, empriseDepuisBornes, libelleEmprise, phraseProvenance, LICENCE } from './import-ign.js?v=20261010a';
import { formaterDuree } from './import-lots.js?v=20261010a';
import { creerSession } from './import-ign-session.js?v=20261010a';

/** Les pictogrammes des cartes : tracés 24 × 24 au trait, qui suivent la couleur du texte (comme ceux d'Atlas). */
export const ICONES = Object.freeze({
  route: '<path d="M7 21 10 3M17 21 14 3"/><path d="M12 6v2m0 3v2m0 3v2"/>',
  batiment: '<path d="M5 21V8l7-4 7 4v13"/><path d="M9 21v-5h6v5M9 11h.01M15 11h.01"/>',
  eau: '<path d="M3 9c3 0 3-2 6-2s3 2 6 2 3-2 6-2M3 15c3 0 3-2 6-2s3 2 6 2 3-2 6-2"/>',
  plan_eau: '<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"/>',
  surface_eau: '<path d="M4 8c4-3 12-3 16 0v8c-4 3-12 3-16 0z"/><path d="M8 12c2 1.5 6 1.5 8 0"/>',
  arbre: '<path d="M12 21v-6"/><path d="M12 3c4 2 6 5 5 8-1 2-3 3-5 3s-4-1-5-3c-1-3 1-6 5-8z"/>',
  rail: '<path d="M8 3l-2 18M16 3l2 18M7 8h10M6.5 13h11M6 18h12"/>',
  repere: '<path d="M6 21V4"/><path d="M6 5h11l-2 4 2 4H6"/>',
  commune: '<circle cx="12" cy="12" r="9" stroke-dasharray="3 2"/><circle cx="12" cy="12" r="2"/>',
  departement: '<path d="M5 6l5-2 5 2 4 4-1 6-4 4-6-1-4-5z"/>',
  equipement: '<path d="M4 21V9l8-5 8 5v12M9 21v-6h6v6M12 9v3M10.5 10.5h3"/>',
});

const svg = (d, taille = 26) => `<svg class="ic-trait" width="${taille}" height="${taille}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

const nombre = (n) => Number(n).toLocaleString('fr-FR').replace(/ | /g, ' ');
const secondes = (ms) => (ms < 100 ? 'moins de 0,1 s' : `${(ms / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`);
const pluriel = (n, un, plusieurs) => (n > 1 ? plusieurs : un);

/** « moins de 5 s », « environ 40 s » : une durée estimée, dite sans « environ moins de ». */
export function dureeDite(s) {
  const d = formaterDuree(s);
  return /^(moins|estimation)/.test(d) ? d : `environ ${d}`;
}

/** Les cartes des jeux, par groupe. `jeuId` : le jeu choisi, marqué `aria-pressed`. */
export function htmlGrille(groupes, jeuId) {
  return groupes.map((g) => `
    <div class="section ign-groupe" role="group" aria-label="${echapper(g.groupe)}">
      <div class="section-title">${echapper(g.groupe)}</div>
      <div class="model-grid">${g.jeux.map((p) => `
        <button type="button" class="model-card ign-carte${p.id === jeuId ? ' active' : ''}" data-jeu="${echapper(p.id)}"
          aria-pressed="${p.id === jeuId ? 'true' : 'false'}" title="${echapper(p.description)}">
          <div class="mi">${svg(ICONES[p.icone] || ICONES.equipement)}</div><div class="mn">${echapper(p.libelle)}</div>
        </button>`).join('')}
      </div>
    </div>`).join('');
}

/** Le cadre du jeu choisi : ce qu'il contient, ce qu'il faut savoir, ce que les mesures ont donné. */
function htmlJeu(jeu) {
  return `<div class="ign-jeu"><strong>${echapper(jeu.libelle)}</strong> — ${echapper(jeu.description)}
    <div class="ign-ordre">${echapper(jeu.ordreDeGrandeur)}</div>
    ${jeu.avertissements.map((a) => `<div class="ign-alerte">${echapper(a)}</div>`).join('')}</div>`;
}

/** La barre et le texte d'avancement. Séparés du reste : ils se mettent à jour à chaque page sans tout redessiner. */
export function htmlProgression(etat) {
  const p = etat.progression || { fait: 0, total: null, pct: null, resteS: null, refuses: 0 };
  const pct = p.pct == null ? 0 : Math.round(p.pct);
  return `<div class="ign-barre" role="progressbar" aria-label="Avancement de l’import" aria-valuemin="0" aria-valuemax="100"
      ${p.pct == null ? '' : `aria-valuenow="${pct}"`} id="ign-barre"><span style="width:${pct}%"></span></div>
    <div class="range-info" id="ign-prog-texte">${texteProgression(p)}</div>`;
}

/** « 1 200 sur 2 178 · reste environ 4 s · 0 refusé ». */
export function texteProgression(p) {
  const sur = p.total ? ` sur ${nombre(p.total)}` : '';
  const reste = p.resteS != null ? ` · reste ${echapper(dureeDite(p.resteS))}` : '';
  const refus = p.refuses ? ` · ${nombre(p.refuses)} refusé${pluriel(p.refuses, '', 's')}` : '';
  return `<strong>${nombre(p.fait)}</strong>${sur} objets lus${reste}${refus}`;
}

function htmlResume(etat) {
  const r = etat.resultat;
  const ecart = r.estimes != null && r.importes + r.refuses + r.doublons !== r.estimes
    ? `<div class="ign-ordre">Le service en annonçait ${nombre(r.estimes)} ; ${nombre(r.importes + r.refuses + r.doublons)} sont arrivés.</div>` : '';
  const motifs = r.motifs.length ? `<details class="ign-motifs"><summary>${nombre(r.refuses)} objet${pluriel(r.refuses, '', 's')} refusé${pluriel(r.refuses, '', 's')}</summary>
      <ul>${r.motifs.map((m) => `<li>${echapper(m.message)} — ${nombre(m.n)} objet${pluriel(m.n, '', 's')} (rang${pluriel(m.exemples.length, '', 's')} ${m.exemples.map((x) => nombre(x)).join(', ')}${m.n > m.exemples.length ? ', …' : ''})</li>`).join('')}</ul></details>` : '';
  const doublons = r.doublons ? `<div class="ign-ordre">${nombre(r.doublons)} doublon${pluriel(r.doublons, '', 's')} ignoré${pluriel(r.doublons, '', 's')}.</div>` : '';
  const prov = r.provenance;
  return `<h3 class="ign-resume-titre" id="ign-resume" tabindex="-1">${r.couche
    ? `${nombre(r.importes)} objet${pluriel(r.importes, '', 's')} importé${pluriel(r.importes, '', 's')}`
    : 'Aucun objet gardé'}</h3>
    <div class="range-info" role="status">${r.couche ? `Couche « ${echapper(r.couche.name)} » créée` : 'Aucune couche créée'} · ${nombre(r.refuses)} refusé${pluriel(r.refuses, '', 's')} · ${secondes(r.dureeMs)}</div>
    ${ecart}${doublons}${motifs}
    ${prov ? `<div class="ign-prov">${echapper(phraseProvenance(prov))}
      <a href="${echapper(LICENCE.url)}" target="_blank" rel="noopener noreferrer">Conditions de licence</a>
      <div class="ign-alerte">${echapper(prov.avertissementEdition)}</div></div>` : ''}`;
}

/** Le bas du panneau, selon la phase de la session : message, bouton principal. */
export function htmlDetail(etat) {
  const jeu = etat.jeu;
  if (!jeu) {
    return '<div class="hint">Choisissez un jeu de données. Le nombre d’objets de la zone visible s’affiche avant tout import.</div>';
  }
  const tete = htmlJeu(jeu);
  const bouton = (act, texte, cls = 'btn-soft', extra = '') => `<button type="button" class="btn ${cls} btn-full" data-act="${act}" ${extra}>${texte}</button>`;
  switch (etat.phase) {
    case 'estimation':
      return `${tete}<div class="range-info" role="status" aria-live="polite">Estimation du nombre d’objets…</div>`;
    case 'pret': {
      const est = etat.estimation;
      return `${tete}<div class="range-info" role="status" aria-live="polite"><strong>${echapper(est.evaluation.message)}</strong> Durée attendue : ${echapper(dureeDite(est.dureeEstimeeS))}.</div>
        ${est.evaluation.niveau === 'avertir' ? `<div class="ign-alerte" role="alert">${echapper(est.evaluation.message)}</div>` : ''}
        ${bouton('importer', `Importer ${nombre(est.n)} objet${pluriel(est.n, '', 's')}`, 'btn-primary')}`;
    }
    case 'refuse':
      return `${tete}<div class="ign-alerte ign-refus" role="alert">${echapper(etat.estimation ? etat.estimation.decision.message : etat.erreur.message)}</div>
        ${bouton('importer', 'Importer', 'btn-primary', 'disabled')}`;
    case 'erreur':
      return `${tete}<div class="ign-alerte ign-refus" role="alert">${echapper(etat.erreur.message)}</div>
        ${etat.etape === 'import'
    ? `${etat.progression ? `<div class="range-info">${texteProgression(etat.progression)} — gardés en mémoire.</div>` : ''}${bouton('reprendre', 'Reprendre', 'btn-primary')}${bouton('abandonner', 'Abandonner')}`
    : bouton('reessayer', 'Réessayer', 'btn-primary')}`;
    case 'import':
      return `${tete}${htmlProgression(etat)}${bouton('annuler', 'Annuler')}`;
    case 'annule':
      return `${tete}<div class="ign-alerte" role="status">Import annulé : aucune couche n’a été créée. ${nombre(etat.progression?.fait || 0)} objets lus sont gardés en mémoire.</div>
        ${bouton('reprendre', 'Reprendre', 'btn-primary')}${bouton('abandonner', 'Abandonner')}`;
    case 'termine':
      return `${tete}${htmlResume(etat)}
        ${bouton('encore', 'Importer ailleurs ou un autre jeu')}${bouton('retour', '← Retour aux couches')}`;
    default:
      return tete;
  }
}

const STYLE = `
.ign-carte { font: inherit; color: inherit; width: 100%; }
.ign-carte:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.ign-carte .mi { display: flex; justify-content: center; }
.ign-carte .mn { white-space: normal; line-height: 1.25; font-size: 11px; }
.ign-detail { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
.ign-jeu { font-size: 12px; color: var(--text); line-height: 1.4; }
.ign-ordre { font-size: 10.5px; color: var(--muted); margin-top: 3px; }
.ign-alerte { font-size: 11.5px; line-height: 1.4; color: var(--ink); background: rgba(232,162,52,0.14); border-left: 3px solid var(--sun); border-radius: 4px; padding: 6px 10px; margin-top: 6px; }
.ign-refus { background: rgba(196,69,54,0.10); border-left-color: var(--accent); }
.ign-barre { height: 8px; border-radius: 4px; background: var(--hairline); overflow: hidden; }
.ign-barre > span { display: block; height: 100%; background: var(--accent); transition: width 0.2s; }
.ign-resume-titre { margin: 4px 0 0; font: 600 15px var(--sans, system-ui); color: var(--ink); }
.ign-resume-titre:focus { outline: none; }
.ign-motifs { font-size: 11.5px; color: var(--text); }
.ign-motifs ul { margin: 4px 0 0 16px; padding: 0; }
.ign-prov { font-size: 11px; color: var(--muted); line-height: 1.45; }
.ign-prov a { color: var(--accent2); }
.ign-groupe + .ign-groupe { margin-top: 14px; }
`;

function installerStyle(doc) {
  if (doc.getElementById('ign-style')) return;
  const s = doc.createElement('style');
  s.id = 'ign-style';
  s.textContent = STYLE;
  doc.head.appendChild(s);
}

/** La session qui anime le panneau ouvert, pour ne pas en laisser deux écouter la carte. */
let nettoyageCourant = null;

/**
 * Ouvre le panneau d'import IGN dans `hote.corps`.
 *
 * @param {object} hote
 * @param {object} hote.carte la carte MapLibre (`getBounds`, `on`, `off`, `getPitch`, `easeTo`, `once`)
 * @param {HTMLElement} hote.corps le corps du module où poser le panneau
 * @param {(titre: string, aide?: string) => void} hote.titre
 * @param {Function} hote.creerCouche `makeLayer` d'Atlas
 * @param {(couche: object) => void} hote.ajouterCouche `finalizeNewLayer` d'Atlas
 * @param {(message: string, type?: string) => void} hote.annoncer un message éphémère (`showToast`)
 * @param {() => void} hote.retour revient au panneau des couches
 * @returns {Promise<{session: object, fermer: () => void}>}
 */
export async function ouvrirImportIgn(hote) {
  if (nettoyageCourant) nettoyageCourant();
  installerStyle(hote.corps.ownerDocument);
  const groupes = presetsParGroupe();
  const zone = () => empriseDepuisBornes(hote.carte.getBounds());

  let racine = null;
  let phasePrecedente = null;
  let derniereEtat = null;
  let reprendreLaMain = false;
  const vivant = () => !!racine && racine.isConnected && hote.corps.contains(racine);

  /** Pose le panneau dans le corps du module (et le repose, quand l'application l'a remplacé). */
  function monter() {
    hote.titre('Import IGN', 'Zone importée = emprise visible, vue à plat. Zoomez pour réduire.');
    hote.corps.innerHTML = `<div id="ign-racine">
      <div class="range-info" id="ign-emprise" style="margin-bottom:12px">…</div>
      ${htmlGrille(groupes, null)}
      <div class="ign-detail" id="ign-detail" aria-live="polite"></div>
      <div class="section"><button type="button" class="btn btn-soft btn-full" data-act="retour">← Retour</button></div>
    </div>`;
    racine = hote.corps.querySelector('#ign-racine');
    racine.addEventListener('click', surClic);
    phasePrecedente = null;
  }

  const session = creerSession({
    fetch: (...a) => globalThis.fetch(...a),
    emprise: zone,
    emprisePourImport: async () => { await mettreAPlat(hote.carte); return zone(); },
    creerCouche: hote.creerCouche,
    // Ajouter une couche fait redessiner le panneau Couches, donc remplace le nôtre : on le repose avec le résumé,
    // qui est justement ce que la personne attend de voir. Si elle est partie ailleurs de son propre chef, on ne la suit pas.
    // L'application cadre la caméra sur la couche ajoutée : pour un import par zone, on garde la zone que la personne a
    // choisie (sans quoi les communes ou les départements, qui dépassent l'écran, l'emmèneraient très loin).
    ajouterCouche: (couche) => {
      const vue = { center: hote.carte.getCenter(), zoom: hote.carte.getZoom(), bearing: hote.carte.getBearing(), pitch: hote.carte.getPitch() };
      hote.ajouterCouche(couche);
      hote.carte.jumpTo(vue);
      reprendreLaMain = !vivant();
    },
    surChangement: (etat) => {
      if (!vivant()) {
        if (!(reprendreLaMain && etat.phase === 'termine')) {
          if (etat.phase === 'termine') hote.annoncer(`${nombre(etat.resultat.importes)} objets importés (IGN)`, etat.resultat.importes ? 'success' : 'warning');
          return;
        }
        monter();
      }
      reprendreLaMain = false;
      dessiner(etat);
    },
  });

  function montrerEmprise(etat) {
    const el = racine.querySelector('#ign-emprise');
    if (!el) return;
    const figee = etat && (etat.phase === 'import' || etat.phase === 'annule' || etat.phase === 'termine' || (etat.phase === 'erreur' && etat.etape === 'import'));
    el.textContent = figee && etat.emprise ? `Zone importée : ${libelleEmprise(etat.emprise)}` : libelleEmprise(zone());
  }

  function dessiner(etat) {
    derniereEtat = etat;
    montrerEmprise(etat);
    for (const b of racine.querySelectorAll('[data-jeu]')) {
      const actif = !!etat.jeu && b.dataset.jeu === etat.jeu.id;
      b.setAttribute('aria-pressed', actif ? 'true' : 'false');
      b.classList.toggle('active', actif);
    }
    const detail = racine.querySelector('#ign-detail');
    if (etat.phase === 'import' && phasePrecedente === 'import') {
      const barre = racine.querySelector('#ign-barre');
      const texte = racine.querySelector('#ign-prog-texte');
      const p = etat.progression;
      if (barre && texte && p) {
        const pct = p.pct == null ? 0 : Math.round(p.pct);
        barre.firstElementChild.style.width = `${pct}%`;
        if (p.pct != null) barre.setAttribute('aria-valuenow', String(pct));
        texte.innerHTML = texteProgression(p);
      }
      return;
    }
    detail.innerHTML = htmlDetail(etat);
    if (etat.phase !== phasePrecedente) {
      // Le bouton qui vient d'être cliqué a disparu : le focus va là où la suite se passe.
      const cible = etat.phase === 'import' ? '[data-act="annuler"]'
        : (etat.phase === 'termine' ? '#ign-resume' : (etat.phase === 'annule' || etat.phase === 'erreur' ? '[data-act="reprendre"], [data-act="reessayer"]' : null));
      if (cible) detail.querySelector(cible)?.focus();
      // Les jeux sont nombreux : le bas du panneau, où l'estimation et le bouton apparaissent, doit rester à l'écran.
      detail.scrollIntoView?.({ block: 'nearest' });
    }
    if (etat.phase === 'termine' && etat.phase !== phasePrecedente) {
      hote.annoncer(`${nombre(etat.resultat.importes)} objet${pluriel(etat.resultat.importes, '', 's')} importé${pluriel(etat.resultat.importes, '', 's')} (IGN)`, etat.resultat.importes ? 'success' : 'warning');
    }
    phasePrecedente = etat.phase;
  }

  const actions = {
    importer: () => session.importer(),
    annuler: () => session.annuler(),
    reprendre: () => session.reprendre(),
    reessayer: () => session.reessayer(),
    abandonner: () => session.reinitialiser(),
    encore: () => session.reinitialiser(),
    retour: () => { fermer(); hote.retour(); },
  };
  function surClic(ev) {
    const carte = ev.target.closest('[data-jeu]');
    if (carte) { session.choisir(carte.dataset.jeu); return; }
    const bouton = ev.target.closest('[data-act]');
    if (bouton && !bouton.disabled && actions[bouton.dataset.act]) actions[bouton.dataset.act]();
  }

  let minuterie = null;
  const surDeplacement = () => {
    if (!vivant()) { fermer(); return; }
    montrerEmprise(derniereEtat);
    clearTimeout(minuterie);
    minuterie = setTimeout(() => { if (vivant()) session.majEmprise(zone()); }, 450);
  };
  hote.carte.on('moveend', surDeplacement);

  function fermer() {
    clearTimeout(minuterie);
    hote.carte.off('moveend', surDeplacement);
    session.fermer();
    if (nettoyageCourant === fermer) nettoyageCourant = null;
  }
  nettoyageCourant = fermer;

  monter();
  dessiner(session.etat());
  // Inclinée, la vue court jusqu'à l'horizon, et l'emprise importée avec elle : on importe ce qui est à l'écran, à plat.
  if (await mettreAPlat(hote.carte)) montrerEmprise(derniereEtat);
  return { session, fermer };
}
