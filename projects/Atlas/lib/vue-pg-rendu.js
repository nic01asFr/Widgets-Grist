/**
 * Le rendu du panneau « Base PostgreSQL » : du texte HTML à partir d'un état, rien d'autre (module pur, tout est échappé).
 *
 * Deux endroits, comme ailleurs dans Atlas :
 *  - à GAUCHE (le module) : l'état de la connexion, les tables posées sur la carte, les tables de la base, les copies. Des lignes
 *    de même forme que les couches (`layer-item`) et que les tables du document (`table-item`) ;
 *  - à DROITE (l'inspecteur) : la fiche de connexion (adresse, accès) et la fiche d'une table (ce qu'on peut en faire).
 *
 * Un seul vocabulaire, du plus simple au plus engageant :
 *  - « Afficher sur la carte » : lecture seule, relue à chaque déplacement, rien n'est écrit dans le document ;
 *  - « Copier dans le document » : un instantané de la zone visible, dans une nouvelle table Grist ;
 *  - « Copier et synchroniser » : toute la table, qu'on compare ensuite avec PostgreSQL et qu'on peut renvoyer.
 */
import { echapper } from './html.js?v=20261010a';
import { origineLisible } from './pg-liaisons.js?v=20261109a';

export const nombre = (n) => Number(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
const pluriel = (n, un, plusieurs) => (Number(n) > 1 ? plusieurs : un);

const STYLE_ALERTE = 'margin:8px 0;padding:8px 10px;font-size:12.5px;line-height:1.4;border-left:3px solid #d9a21b;background:rgba(217,162,27,.12);border-radius:4px';
const STYLE_REFUS = 'margin:8px 0;padding:8px 10px;font-size:12.5px;line-height:1.4;border-left:3px solid #c0392b;background:rgba(192,57,43,.1);border-radius:4px';
const alerte = (texte) => `<div style="${STYLE_ALERTE}" role="alert">${echapper(texte)}</div>`;
const refus = (texte) => `<div style="${STYLE_REFUS}" role="alert">${echapper(texte)}</div>`;

/** Les vues et tables que PostGIS publie lui-même : jamais ce qu'on vient chercher. */
const TABLES_SYSTEME = new Set(['geometry_columns', 'geography_columns', 'spatial_ref_sys', 'raster_columns', 'raster_overviews']);

/** Les tables géographiques d'abord : c'est ce qu'on vient chercher. */
export function listerTables(schema, filtre = '', modifiables = null) {
  const f = String(filtre || '').trim().toLowerCase();
  const sortie = [];
  for (const sc of (schema && schema.schemas) || []) {
    for (const t of sc.tables) {
      if (TABLES_SYSTEME.has(t.nom) && !(t.geometries || []).length) continue;
      if (f && !`${sc.nom}.${t.nom}`.toLowerCase().includes(f)) continue;
      sortie.push({ schema: sc.nom, table: t.nom, geo: (t.geometries || []).length > 0, modifiable: !!modifiables && modifiables.has(`${sc.nom}.${t.nom}`), lignes: t.lignes_estimees, commentaire: t.commentaire });
    }
  }
  return sortie.sort((a, b) => (b.geo - a.geo) || `${a.schema}.${a.table}`.localeCompare(`${b.schema}.${b.table}`));
}

const titreSection = (texte, aide = '') => `<div class="section-title">${echapper(texte)}${aide ? ` <span class="range-info" style="text-transform:none;letter-spacing:0">${echapper(aide)}</span>` : ''}</div>`;

// ---------------------------------------------------------------------------------------------------------------- GAUCHE

/**
 * L'état de la connexion, en tête du panneau : « connecté à quoi », et la porte vers les réglages (à droite).
 * @param {{connecte:boolean, url:string, libelle?:string, nbTables?:number, enCours?:boolean}} e
 */
export function htmlBase(e) {
  const lieu = e.url ? origineLisible(e.url) : '';
  let titre; let meta;
  if (e.enCours) { titre = 'Connexion…'; meta = lieu; }
  else if (e.connecte) {
    titre = 'Connecté';
    meta = [e.libelle, `${nombre(e.nbTables || 0)} table${pluriel(e.nbTables, '', 's')}`, lieu].filter(Boolean).join(' · ');
  } else {
    titre = 'Non connecté';
    meta = lieu || 'Renseignez l’adresse de la passerelle dans les réglages.';
  }
  const boutons = !e.connecte && !e.enCours && e.url
    ? '<button type="button" class="btn btn-primary" data-act="connecter">Se connecter</button><button type="button" class="btn btn-soft" data-act="reglages">Réglages</button>'
    : '<button type="button" class="btn btn-soft" data-act="reglages" title="Adresse, accès, base de données">Réglages</button>';
  return `<div class="pg-base">
    <span class="pg-pastille${e.connecte ? ' ok' : ''}" aria-hidden="true"></span>
    <div class="layer-name">${echapper(titre)}</div>
    <div class="pg-base-actions">${boutons}</div>
    <div class="layer-meta pg-base-meta" title="${echapper(meta)}">${echapper(meta)}</div>
  </div>`;
}

/**
 * « Sur la carte » : les tables posées sur la carte et celles qu'on a gardées dans le document. Même ligne qu'une couche :
 * l'œil montre ou masque, le menu porte le reste. L'origine de la passerelle est toujours dans la ligne : une liaison lue dans
 * un document est une donnée, on ne l'active qu'en sachant vers où partira l'identité.
 * @param {{id:string, libelle:string, couleur?:string, etat:string, visible:boolean, enregistree?:boolean, origine?:string}[]} liste
 * @param {{icone?:(nom:string, taille?:number)=>string}} [o]
 */
export function htmlDirectes(liste, { icone = () => '' } = {}) {
  if (!liste.length) return '';
  const lignes = liste.map((d) => {
    const portee = d.enregistree ? '<span class="badge-saved" title="La liaison est gardée dans le document (jamais l’identité ni le jeton)">gardée</span>' : '';
    const oeil = d.visible ? icone('oeil') || '👁' : icone('oeilBarre') || '–';
    return `<div class="layer-item pg-ligne${d.visible ? '' : ' masquee'}" role="listitem" data-pg-ligne="${echapper(d.id)}">
      <button type="button" class="layer-vis${d.visible ? ' on' : ''}" data-pg-bascule="${echapper(d.id)}" aria-pressed="${d.visible ? 'true' : 'false'}"
        aria-label="${d.visible ? 'Masquer' : 'Afficher'} ${echapper(d.libelle)} sur la carte" title="${d.visible ? 'Masquer' : 'Afficher'} sur la carte">${oeil}</button>
      <span class="layer-swatch" style="background:${echapper(d.couleur || '#888')}"></span>
      <div class="layer-info">
        <div class="layer-name" title="${echapper(d.libelle)}">${echapper(d.libelle)}</div>
        <div class="layer-meta"><span>${echapper(d.etat)}</span>${portee}${d.origine ? `<span title="Passerelle">${echapper(d.origine)}</span>` : ''}</div>
      </div>
      <button type="button" class="layer-act" data-pg-menu="${echapper(d.id)}" aria-haspopup="menu" aria-label="Autres actions pour ${echapper(d.libelle)}" title="Autres actions">${icone('plusieurs') || '⋯'}</button>
    </div>`;
  }).join('');
  return `<div class="section">${titreSection('Sur la carte', `${liste.length}`)}<div class="layer-list" role="list">${lignes}</div></div>`;
}

/**
 * « Mémorisées, introuvables » : les tables que le document se rappelle mais que cette base ne montre pas (renommées, supprimées, ou non accessibles pour
 * la personne). Elles restent dans la liste du document tant qu'on ne les retire pas ; le bouton ne touche ni la table, ni la base.
 * @param {{schema:string, table:string}[]} manquantes
 */
export function htmlManquantes(manquantes) {
  if (!manquantes || !manquantes.length) return '';
  const lignes = manquantes.map((m) => {
    const nom = `${m.schema}.${m.table}`;
    return `<div class="layer-item pg-ligne masquee" role="listitem">
      <div class="layer-info">
        <div class="layer-name" title="${echapper(nom)}">${echapper(nom)}</div>
        <div class="layer-meta"><span>introuvable ou non accessible pour vous</span></div>
      </div>
      <button type="button" class="btn btn-soft" data-pg-oublier="${echapper(nom)}" title="Retirer cette table de la liste du document (la table PostgreSQL n’est pas touchée)">Retirer de la liste</button>
    </div>`;
  }).join('');
  return `<div class="section">${titreSection('Mémorisées, introuvables', `${manquantes.length}`)}<div class="layer-list" role="list">${lignes}</div></div>`;
}

/**
 * Les lignes des tables de la base : une par table, comme « Tables du document ». Une table sans carte et non modifiable n'a
 * rien à offrir ici : elle est grisée plutôt que cachée (on voit qu'elle existe).
 */
export function htmlTables(tables, choisie) {
  if (!tables.length) return '<div class="range-info">Aucune table à afficher.</div>';
  const lignes = tables.map((t) => {
    const actif = !!choisie && choisie.schema === t.schema && choisie.table === t.table;
    const meta = [t.schema, t.geo ? 'géographique' : 'sans carte', t.modifiable ? 'modifiable' : null].filter(Boolean).join(' · ');
    const titre = [t.geo ? 'géographique' : 'sans géométrie', t.modifiable ? 'modifiable' : null, t.lignes != null ? `~${nombre(t.lignes)} lignes` : null, t.commentaire].filter(Boolean).join(' — ');
    return `<button type="button" class="table-item pg-table${actif ? ' actif' : ''}" data-table="${echapper(t.schema)}.${echapper(t.table)}"
      aria-pressed="${actif ? 'true' : 'false'}" title="${echapper(titre)}" ${t.geo || t.modifiable ? '' : 'disabled'}>
      <span class="table-nom"><span>${echapper(t.table)}</span><span class="layer-meta"><span>${echapper(meta)}</span></span></span>
      ${t.lignes != null ? `<span class="table-compte">~${nombre(t.lignes)}</span>` : ''}
    </button>`;
  }).join('');
  return `<div class="table-liste">${lignes}</div>`;
}

/**
 * Le bloc « Tables de la base » : son titre, la recherche (posée UNE fois : on ne la redessine pas en tapant, sinon le curseur
 * sauterait) et la zone des lignes `#pg-lignes`, seule redessinée quand le filtre ou le choix change.
 */
export function htmlBlocTables({ tables, choisie, filtre = '', total }) {
  return `<div class="section">${titreSection('Tables de la base', total != null ? `${total}` : '')}
    <input id="pg-filtre" class="input" type="search" value="${echapper(filtre)}" placeholder="Chercher une table" aria-label="Chercher une table" autocomplete="off" style="margin-bottom:6px">
    <div id="pg-lignes">${htmlTables(tables, choisie)}</div></div>`;
}

// ----------------------------------------------------------------------------------------------------------------- DROITE

/**
 * La fiche de connexion : l'adresse, la façon dont on est reconnu, la base de données.
 * @param {{url:string, connecte:boolean, enCours?:boolean, erreur?:string, modeAcces?:('grist'|'jeton'|null), connexions?:{alias:string,libelle?:string}[], connexion?:string}} e
 * @returns {{tete:string, corps:string}}
 */
export function htmlFicheConnexion(e) {
  const tete = `<div class="insp-eyebrow">Base PostgreSQL</div>
    <div class="insp-title">Connexion</div>
    <div class="insp-sub">${e.connecte ? 'Connecté' : e.enCours ? 'Connexion…' : 'Non connecté'}</div>`;
  const acces = e.modeAcces === 'grist'
    ? 'Vous êtes reconnu par Grist : aucun jeton à saisir. Vos droits viennent de l’annuaire du document.'
    : e.modeAcces === 'jeton'
      ? 'Accès par jeton, saisi une fois et gardé dans cette page seulement (jamais dans le document).'
      : 'Cette passerelle n’a demandé aucun jeton.';
  const base = e.connecte && (e.connexions || []).length
    ? `<div class="section">${titreSection('Base de données')}
        ${e.connexions.length > 1
    ? `<select id="pg-connexion" class="input" aria-label="Base de données">${e.connexions.map((c) => `<option value="${echapper(c.alias)}"${c.alias === e.connexion ? ' selected' : ''}>${echapper(c.libelle || c.alias)}</option>`).join('')}</select>`
    : `<div class="range-info">${echapper((e.connexions[0].libelle) || e.connexions[0].alias)}</div>`}
      </div>` : '';
  const corps = `<div class="section">
      <label class="section-title" for="pg-url">Adresse de la passerelle</label>
      <input id="pg-url" class="input" type="url" value="${echapper(e.url)}" placeholder="https://pg-gateway.exemple.fr" autocomplete="off" spellcheck="false">
      <div class="range-info" style="margin:6px 0 8px">L’adresse donnée par la personne qui administre la base. Seule l’adresse est mémorisée.</div>
      <button type="button" class="btn btn-primary btn-full" data-act="connecter" ${e.enCours ? 'disabled' : ''}>${e.connecte ? 'Se reconnecter' : 'Se connecter'}</button>
      ${e.erreur ? refus(e.erreur) : ''}
    </div>
    ${e.connecte ? `<div class="section">${titreSection('Votre accès')}<div class="range-info" role="status">${echapper(acces)}</div></div>` : ''}
    ${base}`;
  return { tete, corps };
}

/** Un choix de la fiche d'une table : un titre, une phrase qui dit ce qui se passe, le ou les boutons. */
function choix(titre, phrase, contenu) {
  return `<div class="pg-choix"><div class="pg-choix-titre">${echapper(titre)}</div><div class="range-info">${echapper(phrase)}</div>${contenu}</div>`;
}

/**
 * Le corps de la fiche d'une table : ce qu'on peut en faire, de l'aperçu à la copie synchronisée.
 * @returns {string}
 */
export function htmlApercu(etat) {
  if (!etat.table) return '<div class="range-info">Choisissez une table dans la liste de gauche.</div>';
  if (etat.phase === 'lecture') return '<div class="range-info" role="status" aria-live="polite">Lecture de la zone visible…</div>';
  if (etat.phase === 'erreur') {
    return `${refus(etat.erreur)}<button type="button" class="btn btn-soft btn-full" data-act="relire">Réessayer</button>`;
  }
  if (etat.phase === 'import') return `<div class="range-info" role="status" aria-live="polite">Copie en cours… ${echapper(etat.avancement || '')}</div>`;
  if (etat.phase === 'termine') {
    return `<div class="range-info" role="status"><strong>${nombre(etat.resultat.nb)} entité${etat.resultat.nb > 1 ? 's' : ''} copiée${etat.resultat.nb > 1 ? 's' : ''}</strong>
      dans la table « ${echapper(etat.resultat.tableId)} » du document.</div>`;
  }
  const bloqueDoc = etat.lectureSeule || etat.sansDocument;
  const messagesDoc = [
    etat.lectureSeule ? alerte('Ce document est ouvert en lecture seule : les copies dans le document sont désactivées.') : '',
    etat.sansDocument ? alerte('Atlas n’est pas ouvert dans un document Grist : on peut afficher la table, pas la copier.') : '',
  ].join('');
  const sync = etat.modifiable
    ? choix('Copier et synchroniser', 'Toute la table, que la passerelle déclare modifiable. Vous la comparez ensuite avec PostgreSQL et vous pouvez renvoyer vos changements.',
      `<button type="button" class="btn btn-soft btn-full" data-act="importer-sync" ${bloqueDoc ? 'disabled' : ''}>Copier et synchroniser</button>`)
    : '';
  if (!etat.couche && etat.phase === 'pret') {
    return `<div class="range-info" role="status">Table sans géométrie : elle ne se place pas sur la carte.</div>${messagesDoc}${sync}`;
  }
  const c = etat.couche;
  const n = c ? c.nb_entites : 0;
  const sansDoublon = (a) => !(c && c.tronque && /^Résultat tronqué/.test(a));
  const avert = [...((c && c.avertissements) || [])].filter(sansDoublon).map(alerte).join('');
  const plan = etat.plan;
  const refusPlan = plan && !plan.ok ? refus(plan.erreur) : '';
  const bloqueCopie = !plan || !plan.ok || bloqueDoc;
  return `<div class="range-info" role="status" aria-live="polite"><strong>${nombre(n)}</strong> entité${n > 1 ? 's' : ''} dans la zone visible de la carte.</div>
    ${avert}
    ${etat.surCarte
    ? `<div class="range-info" role="status"><strong>Cette table est sur la carte</strong> (lecture seule, relue à chaque déplacement).${etat.peutEnregistrer ? ' Le menu de sa ligne, à gauche, la garde dans le document ou la retire.' : ''}</div>`
    : choix('Afficher sur la carte', 'Lecture seule, relue à chaque déplacement de la carte. Rien n’est écrit dans le document.',
      `<button type="button" class="btn btn-primary btn-full" data-act="direct">Afficher sur la carte</button>
      ${etat.peutEnregistrer ? '<button type="button" class="btn-lien" data-act="direct-enregistre" style="margin-top:6px" title="La liaison (adresse, table ; jamais l’identité ni le jeton) est gardée dans le document : elle reviendra à la prochaine ouverture.">Afficher et garder dans le document</button>' : ''}`)}
    ${choix('Copier dans le document', 'Un instantané de la zone visible, dans une nouvelle table Grist.',
    `${messagesDoc}${refusPlan}<label class="input-label" for="pg-nom">Nom de la table</label>
      <input id="pg-nom" class="input" type="text" value="${echapper(etat.nom || '')}" autocomplete="off" style="margin-bottom:8px">
      <button type="button" class="btn btn-soft btn-full" data-act="importer" ${bloqueCopie ? 'disabled' : ''}>Copier dans le document</button>`)}
    ${sync}`;
}

/**
 * La fiche d'une table (en-tête et corps).
 * @param {object} etat  l'état du panneau (`table`, `schema`, `phase`, …)
 * @param {{schema:string, table:string, lignes?:number, geo?:boolean, modifiable?:boolean}|null} info
 * @returns {{tete:string, corps:string}}
 */
export function htmlFicheTable(etat, info) {
  const t = etat.table;
  const sous = info ? [info.geo ? 'géographique' : 'sans carte', info.modifiable ? 'modifiable' : null, info.lignes != null ? `~${nombre(info.lignes)} lignes` : null].filter(Boolean).join(' · ') : '';
  return {
    tete: `<div class="insp-eyebrow">Base PostgreSQL · ${echapper(t ? t.schema : '')}</div>
      <div class="insp-title">${echapper(t ? t.table : 'Table')}</div>
      <div class="insp-sub">${echapper(sous)}</div>`,
    corps: htmlApercu(etat),
  };
}

/**
 * La section « Base PostgreSQL » du panneau COUCHES : une ligne par couche posée sur la carte, au même dessin que les autres couches
 * (œil, pastille, nom, zoom, menu), pour tout gérer au même endroit. Les actions sont `A.pgBascule`, `A.pgZoom`, `A.pgMenu`.
 * @param {{id:string, libelle:string, couleur?:string, visible:boolean, etat?:string, enregistree?:boolean, origine?:string}[]} items
 * @param {{icone?: (nom:string, taille?:number) => string}} [o]
 */
export function htmlCouchesPgPanneau(items, { icone = () => '' } = {}) {
  if (!items || !items.length) return '';
  const lignes = items.map((c) => {
    const id = echapper(c.id);
    const nom = echapper(c.libelle);
    return `<div class="layer-item" data-pg="${id}">
      <span class="layer-vis ${c.visible ? 'on' : ''}" role="button" tabindex="0" aria-pressed="${c.visible ? 'true' : 'false'}"
        aria-label="${c.visible ? 'Masquer' : 'Afficher'} ${nom}" onclick="A.pgBascule('${id}', event)">${icone(c.visible ? 'oeil' : 'oeilBarre')}</span>
      <span class="layer-swatch" style="background:${echapper(c.couleur || '#d62728')}"></span>
      <div class="layer-info">
        <div class="layer-name" title="${nom}">${nom}</div>
        <div class="layer-meta"><span>${echapper(c.etat || '')}</span><span style="background:var(--muted);color:#fff;padding:1px 4px;border-radius:3px;font-size:8.5px" title="Lue directement dans PostgreSQL${c.origine ? ' (' + echapper(c.origine) + ')' : ''}, relue à chaque déplacement de la carte">PostgreSQL${c.mode === 'tuiles' ? ' · tuiles' : ''}</span>${c.enregistree ? '<span style="background:var(--green);color:#fff;padding:1px 4px;border-radius:3px;font-size:8.5px" title="Gardée dans le document : elle reviendra à la prochaine ouverture">gardée</span>' : ''}</div>
      </div>
      <button class="layer-act layer-act-zoom" onclick="A.pgZoom('${id}', event)" title="Zoomer sur ce qui est chargé" aria-label="Zoomer sur ${nom}">${icone('cible')}</button>
      <button class="layer-act" onclick="A.pgMenu('${id}', event)" title="Autres actions" aria-label="Autres actions pour ${nom}" aria-haspopup="menu">${icone('plusieurs')}</button>
    </div>`;
  }).join('');
  return `<div class="section-title">Base PostgreSQL <span class="range-info" style="text-transform:none;letter-spacing:0">en direct</span></div>
    <div class="layer-list" id="pg-couches">${lignes}</div>`;
}
