/**
 * Le panneau « Modifier » d'une couche PostgreSQL en direct : on touche une entité de la carte, on corrige ses valeurs, on les
 * enregistre DANS POSTGRESQL (`pg_gateway_ecrire`). Rien n'est écrit dans Grist : ni table, ni ligne.
 *
 * CHARGÉ À LA DEMANDE (depuis le panneau PG). Les fonctions `html*` sont pures (tout est échappé) ; `ouvrirEdition` les pilote.
 *
 * ## Ce que la personne vit
 * 1. « Modifier » sur une couche en direct dont la table est DÉCLARÉE modifiable. Sinon : le panneau dit pourquoi, il n'ouvre rien.
 * 2. Elle touche une entité : la ligne est relue (avec sa version) et ses colonnes modifiables sont proposées.
 * 3. « Enregistrer » n'envoie QUE ce qui a changé, avec la version lue. Le jeton d'ÉCRITURE n'est demandé qu'ici : c'est lui qui dit
 *    QUI écrit (le journal de la base l'inscrit).
 * 4. Un conflit (quelqu'un a écrit entre-temps) est montré avec les valeurs actuelles ; il n'y a pas de « forcer ».
 * 5. Un document en lecture seule n'édite pas : les champs sont en lecture seule.
 *
 * Limites assumées : la géométrie et la clé ne se modifient pas ici ; une nouvelle entité ponctuelle est posée au centre de la
 * carte ; les lignes et surfaces ne se créent pas encore depuis ce panneau.
 */

import { echapper } from './html.js?v=20261010a';
import { creerClientPg, texteErreur } from './pg-passerelle.js?v=20261109a';
import {
  champsEditables, texteDeValeur, valeursModifiees, operationModifier, operationInserer, operationEtat, pointGeoJSON,
  droitsFiche, insertionPossible, interpreter, cleDeFeature,
} from './pg-edition.js?v=20261109a';

const STYLE_REFUS = 'margin:8px 0;padding:8px 10px;font-size:12.5px;line-height:1.4;border-left:3px solid #c0392b;background:rgba(192,57,43,.1);border-radius:4px';
const STYLE_OK = 'margin:8px 0;padding:8px 10px;font-size:12.5px;line-height:1.4;border-left:3px solid #2e8b57;background:rgba(46,139,87,.1);border-radius:4px';
const STYLE_ALERTE = 'margin:8px 0;padding:8px 10px;font-size:12.5px;line-height:1.4;border-left:3px solid #d9a21b;background:rgba(217,162,27,.12);border-radius:4px';

const libelleCle = (cle) => Object.entries(cle || {}).map(([k, v]) => `${k} = ${v}`).join(', ');

/** Un champ de saisie, selon le type Grist de la colonne. */
function htmlChamp(c, erreur, lectureSeule, saisie) {
  const id = `pg-ed-${c.nom}`;
  // ce que la personne a tapé reste affiché après une erreur ou un conflit : on ne lui reprend pas sa saisie
  const valeur = saisie !== undefined && saisie !== null ? String(saisie) : texteDeValeur(c.valeur, c.type);
  const ro = lectureSeule ? ' readonly' : '';
  let champ;
  if (c.type === 'Bool') {
    const v = saisie !== undefined && saisie !== null ? String(saisie) : (c.valeur === true ? 'oui' : c.valeur === false ? 'non' : '');
    champ = `<select id="${echapper(id)}" data-champ="${echapper(c.nom)}"${lectureSeule ? ' disabled' : ''} style="width:100%">
      ${[['', '(vide)'], ['oui', 'oui'], ['non', 'non']].map(([val, lib]) => `<option value="${val}"${v === val ? ' selected' : ''}>${lib}</option>`).join('')}</select>`;
  } else {
    const type = c.type === 'Date' ? 'date' : (c.type === 'Int' || c.type === 'Numeric') ? 'text' : 'text';
    champ = `<input id="${echapper(id)}" data-champ="${echapper(c.nom)}" type="${type}" inputmode="${c.type === 'Int' ? 'numeric' : c.type === 'Numeric' ? 'decimal' : 'text'}" value="${echapper(valeur)}"${ro} style="width:100%"${erreur ? ' aria-invalid="true"' : ''}>`;
  }
  return `<div style="margin:8px 0"><label class="range-info" for="${echapper(id)}">${echapper(c.nom)}${c.type !== 'Text' ? ` <span style="opacity:.7">(${echapper(c.type)})</span>` : ''}</label>
    ${champ}${erreur ? `<div style="${STYLE_REFUS}" role="alert">${echapper(c.nom)} : ${echapper(erreur)}</div>` : ''}</div>`;
}

/** Les valeurs actuelles montrées après un conflit. */
export function htmlConflitEdition(conflit, champs) {
  const lignes = champs.map((c) => `<li>${echapper(c.nom)} : <strong>${echapper(texteDeValeur((conflit.valeurs || {})[c.nom], c.type) || '(vide)')}</strong></li>`).join('');
  return `<div style="${STYLE_ALERTE}" role="alert"><strong>Conflit.</strong> Valeurs actuelles dans PostgreSQL :
    <ul style="margin:6px 0 0 18px;padding:0">${lignes}</ul></div>`;
}

/**
 * Le panneau pour un état donné.
 * @param {{libelle:string, decl:object, phase:'choix'|'ligne'|'nouvelle'|'erreur', ligne?:object, champs?:object[], erreurs?:object,
 *   resultat?:{ok:boolean,message:string,conflit?:object}, occupe?:boolean, lectureSeule?:boolean, erreur?:string, insertion?:{ok:boolean,raison?:string}}} e
 */
export function htmlEdition(e) {
  const droits = droitsFiche(e.decl);
  const tete = `<div class="range-info"><strong>${echapper(e.libelle)}</strong> — modification directe dans PostgreSQL</div>`;
  const ro = e.lectureSeule
    ? `<div style="${STYLE_ALERTE}" role="status">Document en lecture seule : la modification est désactivée.</div>` : '';
  const resultat = e.resultat
    ? `<div style="${e.resultat.ok ? STYLE_OK : STYLE_REFUS}" role="${e.resultat.ok ? 'status' : 'alert'}">${echapper(e.resultat.message)}</div>${e.resultat.conflit ? htmlConflitEdition(e.resultat.conflit, e.champs || []) : ''}` : '';
  const nouvelle = e.insertion && e.insertion.ok && !e.lectureSeule
    ? `<button type="button" class="btn btn-soft btn-full" data-act="nouvelle" ${e.occupe ? 'disabled' : ''}>Nouvelle entité${e.decl.geometrie ? ' (au centre de la carte)' : ''}</button>`
    : (e.insertion && !e.insertion.ok ? `<div class="range-info">${echapper(e.insertion.raison)}</div>` : '');
  const bas = `<div style="margin-top:12px"><button type="button" class="btn btn-soft btn-full" data-act="fermer">← Terminer la modification</button></div>`;

  if (e.phase === 'erreur') return `${tete}${ro}<div style="${STYLE_REFUS}" role="alert">${echapper(e.erreur || 'Erreur')}</div>${nouvelle}${bas}`;
  if (e.phase === 'choix') {
    return `${tete}${ro}<div class="range-info" style="margin:8px 0" role="status">Touchez une entité de la couche sur la carte pour la modifier.</div>${resultat}${nouvelle}${bas}`;
  }
  const champs = (e.champs || []).map((c) => htmlChamp(c, (e.erreurs || {})[c.nom], e.lectureSeule || !droits.modifier && e.phase === 'ligne', (e.saisies || {})[c.nom])).join('');
  const actif = e.ligne && e.ligne.actif !== false;
  const etatOps = e.phase === 'ligne' && !e.lectureSeule ? [
    droits.desactiver && actif ? `<button type="button" class="btn btn-soft" data-act="desactiver" ${e.occupe ? 'disabled' : ''}>Désactiver</button>` : '',
    droits.reactiver && !actif ? `<button type="button" class="btn btn-soft" data-act="reactiver" ${e.occupe ? 'disabled' : ''}>Réactiver</button>` : '',
    droits.supprimer ? `<button type="button" class="btn btn-soft" data-act="supprimer" ${e.occupe ? 'disabled' : ''}>Supprimer</button>` : '',
  ].join('') : '';
  const titre = e.phase === 'nouvelle' ? 'Nouvelle entité' : `Entité ${echapper(libelleCle(e.ligne && e.ligne.cle))}${e.ligne && e.ligne.actif === false ? ' (désactivée)' : ''}`;
  const peutEnregistrer = !e.lectureSeule && (e.phase === 'nouvelle' || droits.modifier);
  return `${tete}${ro}<div style="margin-top:8px"><strong>${titre}</strong></div>${champs}
    ${peutEnregistrer ? `<button type="button" class="btn btn-primary btn-full" data-act="enregistrer" ${e.occupe ? 'disabled' : ''}>${e.phase === 'nouvelle' ? 'Créer dans PostgreSQL' : 'Enregistrer dans PostgreSQL'}</button>` : ''}
    ${etatOps ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${etatOps}</div>` : ''}
    ${resultat}
    ${e.resultat && e.resultat.statut === 'conflit' ? `<button type="button" class="btn btn-soft btn-full" data-act="relire">Relire la ligne</button>` : ''}
    ${nouvelle}${bas}`;
}

const idempotence = () => (globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : `edition-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * Pilote le panneau.
 *
 * @param {object} h
 * @param {object} h.hote  `{carte, corps, titre, annoncer, lectureSeule}`
 * @param {{couche: {relire: Function, ids: object}, libelle: string, url: string, params: {connexion:string, schema:string, table:string}}} h.entree
 * @param {object} h.decl  l'entrée de `pg_gateway_tables_modifiables` de cette table
 * @param {object} h.meta  la réponse de `pg_gateway_table` (types Grist)
 * @param {{commande: Function}} h.clientLecture
 * @param {object} h.accesEcriture  l'accès (jeton d'écriture) de la page
 * @param {(layerType?:string)=>string} [h.typeGeometrie]
 * @param {() => void} h.retour
 */
export function ouvrirEdition({ hote, entree, decl, meta, clientLecture, accesEcriture, typeGeometrie = null, retour }) {
  const { carte } = hote;
  const p = entree.params;
  const clientEcriture = creerClientPg({ url: entree.url, acces: accesEcriture });
  const lectureSeule = !!hote.lectureSeule();
  const etat = {
    libelle: entree.libelle, decl, phase: 'choix', ligne: null, champs: [], erreurs: {}, resultat: null, occupe: false, lectureSeule,
    insertion: insertionPossible(decl, typeGeometrie),
  };
  const ids = entree.couche.ids;
  const couches = [ids.point, ids.ligne, ids.surface];
  let racine = null;
  let ferme = false;

  const vivant = () => !ferme && !!racine && racine.isConnected && hote.corps.contains(racine);
  function dessiner() {
    if (!vivant()) return;
    racine.innerHTML = htmlEdition(etat);
  }
  function monter() {
    hote.titre('Modifier dans PostgreSQL', `${entree.libelle}`);
    hote.corps.innerHTML = '<div id="pg-edition"></div>';
    racine = hote.corps.querySelector('#pg-edition');
    racine.addEventListener('click', surClic);
    dessiner();
  }

  function surToucher(e) {
    if (!vivant() || etat.occupe) return;
    const f = (e.features || [])[0];
    if (!f) return;
    const cle = cleDeFeature(decl, f);
    if (!cle) {
      etat.phase = 'erreur';
      etat.erreur = `Cette entité n'expose pas sa clé (${decl.cle.join(', ')}) : elle ne peut pas être modifiée depuis la carte.`;
      dessiner();
      return;
    }
    ouvrirLigne(cle);
  }
  const poser = () => {
    for (const c of couches) if (carte.getLayer(c)) carte.on('click', c, surToucher);
  };
  function nettoyer() {
    ferme = true;
    for (const c of couches) carte.off('click', c, surToucher);
  }

  async function ouvrirLigne(cle) {
    etat.occupe = true; etat.resultat = null; etat.erreurs = {}; etat.saisies = null;
    dessiner();
    try {
      const r = await clientLecture.commande('pg_gateway_lire', { connexion: p.connexion, schema: p.schema, table: p.table, cles: [cle] });
      const ligne = (r.lignes || [])[0];
      if (!ligne) {
        etat.phase = 'erreur'; etat.erreur = `La ligne ${libelleCle(cle)} n'existe plus dans PostgreSQL.`;
      } else {
        etat.ligne = ligne;
        etat.champs = champsEditables({ decl, table: meta, valeurs: ligne.valeurs });
        etat.phase = 'ligne';
      }
    } catch (e) {
      etat.phase = 'erreur'; etat.erreur = `Lecture impossible : ${texteErreur(e)}`;
    }
    etat.occupe = false;
    dessiner();
  }

  function saisies() {
    const sortie = {};
    for (const el of racine.querySelectorAll('[data-champ]')) sortie[el.dataset.champ] = el.value;
    return sortie;
  }

  async function ecrire(operation) {
    etat.occupe = true; etat.resultat = null;
    dessiner();
    let r;
    try {
      const rep = await clientEcriture.commande('pg_gateway_ecrire', {
        connexion: p.connexion, schema: p.schema, table: p.table, operations: [operation], atomique: true, cle_idempotence: idempotence(),
      });
      r = interpreter(rep);
    } catch (e) {
      r = { ok: false, statut: 'erreur', message: `Écriture impossible : ${texteErreur(e)}` };
    }
    etat.resultat = r;
    etat.occupe = false;
    if (r.ok) {
      hote.annoncer(r.message, 'success');
      entree.couche.relire(); // la carte montre ce qui est maintenant dans PostgreSQL
    }
    return r;
  }

  async function enregistrer() {
    if (etat.lectureSeule || etat.occupe) return;
    etat.saisies = saisies();
    const lu = valeursModifiees(etat.champs, etat.saisies);
    etat.erreurs = lu.erreurs;
    if (Object.keys(lu.erreurs).length) { etat.resultat = { ok: false, message: 'Corrigez les champs signalés.' }; dessiner(); return; }
    if (etat.phase === 'nouvelle') {
      const valeurs = { ...lu.valeurs };
      if (decl.geometrie) { const c = carte.getCenter(); valeurs[decl.geometrie] = pointGeoJSON(c.lng, c.lat); }
      const r = await ecrire(operationInserer(valeurs));
      if (r.ok) { etat.phase = 'choix'; etat.ligne = null; etat.champs = []; }
      dessiner();
      return;
    }
    if (!Object.keys(lu.valeurs).length) { etat.resultat = { ok: false, message: 'Rien n’a changé : rien à enregistrer.' }; dessiner(); return; }
    const r = await ecrire(operationModifier(etat.ligne.cle, etat.ligne.version, lu.valeurs));
    if (r.ok) await ouvrirLigneSansEffacer(etat.ligne.cle, r); else dessiner();
  }

  // Après un succès, on relit la ligne (nouvelle version) et on garde le message.
  async function ouvrirLigneSansEffacer(cle, resultat) {
    try {
      const r = await clientLecture.commande('pg_gateway_lire', { connexion: p.connexion, schema: p.schema, table: p.table, cles: [cle] });
      const ligne = (r.lignes || [])[0];
      if (ligne) { etat.ligne = ligne; etat.champs = champsEditables({ decl, table: meta, valeurs: ligne.valeurs }); }
    } catch { /* la ligne affichée reste : on le dira à la prochaine action */ }
    etat.resultat = resultat;
    etat.saisies = null; // la ligne vient d'être relue : on montre ce qui est dans PostgreSQL
    dessiner();
  }

  async function changerEtat(op) {
    if (etat.lectureSeule || etat.occupe || !etat.ligne) return;
    if (op === 'supprimer' && !window.confirm(`Supprimer définitivement la ligne ${libelleCle(etat.ligne.cle)} de PostgreSQL ?\n\nCette suppression est réelle.`)) return;
    const r = await ecrire(operationEtat(op, etat.ligne.cle, etat.ligne.version));
    if (r.ok && op === 'supprimer') { etat.phase = 'choix'; etat.ligne = null; etat.champs = []; dessiner(); return; }
    if (r.ok) await ouvrirLigneSansEffacer(etat.ligne.cle, r); else dessiner();
  }

  function nouvelle() {
    if (etat.lectureSeule || !etat.insertion.ok) return;
    etat.phase = 'nouvelle'; etat.ligne = null; etat.resultat = null; etat.erreurs = {}; etat.saisies = null;
    etat.champs = champsEditables({ decl, table: meta, valeurs: {} });
    dessiner();
  }

  function fermer() { nettoyer(); retour(); }

  function surClic(e) {
    const b = e.target.closest('[data-act]');
    if (!b || !racine.contains(b)) return;
    const a = b.dataset.act;
    if (a === 'fermer') fermer();
    else if (a === 'enregistrer') enregistrer();
    else if (a === 'nouvelle') nouvelle();
    else if (a === 'desactiver' || a === 'reactiver' || a === 'supprimer') changerEtat(a);
    else if (a === 'relire' && etat.ligne) ouvrirLigne(etat.ligne.cle);
  }

  monter();
  poser();
  return { fermer };
}
