/**
 * L'accueil d'Atlas hors de Grist — le rendu des ecrans decrits par `hote.js`.
 *
 * Ce module ne decide de rien : il affiche ce que `ecranInitial` a choisi et
 * rend la main a Atlas des qu'une scene est ouverte. Toute la logique — quel
 * ecran, quelle configuration est valable, comment presenter une date — vit
 * dans `hote.js`, ou elle se teste sans navigateur.
 *
 * Il se pose en plein ecran PAR-DESSUS l'interface d'Atlas, qui existe deja dans
 * la page mais n'a pas encore demarre. Une fois la scene choisie, le voile est
 * retire et `init()` prend le relais.
 */

import { capacites, creerClient } from './data-client.js?v=1.11.0';
import { installerAdaptateur } from './grist-adapter.js?v=1.11.0';
import { habillerHorsLigne, stockageParDefaut, scenesPreparees } from './hors-ligne.js?v=1.11.0';
import { listerScenesAtlas, lireMiniature } from './decouverte.js?v=1.11.0';
import {
  ClientLocal, estIdLocal, idDepuisDocument, idDocumentLocal, lireSceneLocale, scenesLocales, creerSceneLocale,
  supprimerSceneLocale, resumerScene, cleEnvoi,
} from './scene-locale.js?v=1.11.0';
import { listerEspacesEditables, nomParDefaut, sceneNeuve, planEnvoi, journalVide, envoyerScene } from './creer-document.js?v=1.11.0';
import {
  ECRANS, ecranInitial, validerConfig, lireConfig, ecrireConfig, changerConnexion,
  depuis, situer, peutChangerDeScene, quitterScene,
  memoriserScenes, lireScenesMemorisees, offreApplication, phrasePreparation, phraseProgres,
  libelleRole, trierScenes, filtrerScenes, lirePrefsListe, ecrirePrefsListe, TRIS, FILTRES,
} from './hote.js?v=1.11.0';

export const VERSION = '1.0.0';

const CSS = `
.hote { position: fixed; inset: 0; z-index: 9000; overflow-y: auto;
  background: var(--bg, #F4EFE3); color: var(--text, #2D2820);
  font-family: var(--sans, system-ui, sans-serif); }
.hote-boite { max-width: 30rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem;
  display: flex; flex-direction: column; gap: 1.1rem; }
.hote-marque { display: flex; align-items: center; gap: .55rem;
  font-family: var(--serif, Georgia, serif); font-size: 1.35rem;
  color: var(--ink, #1F1B14); margin-bottom: .3rem; }
.hote h2 { font-family: var(--serif, Georgia, serif); font-weight: 500;
  font-size: 1.5rem; line-height: 1.2; margin: 0; color: var(--ink, #1F1B14); }
.hote p { margin: 0; font-size: .95rem; line-height: 1.55; color: var(--muted, #7A6F5E); }
.hote label { display: block; font-size: .8rem; letter-spacing: .04em;
  text-transform: uppercase; color: var(--muted, #7A6F5E); margin-bottom: .35rem; }
.hote input { width: 100%; padding: .8rem .9rem; font-size: 1rem; font-family: inherit;
  color: var(--ink, #1F1B14); background: var(--surface, #fff);
  border: 1px solid var(--hairline-strong, #C9C0A8); border-radius: 8px; }
.hote input:focus { outline: 2px solid var(--accent, #C44536); outline-offset: 1px; }
.hote-btn { width: 100%; padding: .85rem 1rem; font-size: 1rem; font-family: inherit;
  font-weight: 600; color: #fff; background: var(--ink, #1F1B14);
  border: 0; border-radius: 8px; cursor: pointer; }
.hote-btn:disabled { opacity: .55; cursor: default; }
.hote-btn { display: block; text-align: center; text-decoration: none; box-sizing: border-box; }
.hote-btn.creux { color: var(--ink, #1F1B14); background: none;
  border: 1px solid var(--hairline-strong, #C9C0A8); font-weight: 500; }
.hote p a { color: var(--accent, #C44536); text-underline-offset: 2px; }
.hote-lien { background: none; border: 0; padding: .35rem 0; font: inherit;
  font-size: .87rem; color: var(--accent, #C44536); cursor: pointer; text-align: left; }
.hote-avis { padding: .75rem .9rem; border-radius: 8px; font-size: .9rem; line-height: 1.5;
  background: var(--accent-soft, #F5E9DC); border-left: 3px solid var(--accent, #C44536);
  color: var(--ink, #1F1B14); }
.hote-liste { display: flex; flex-direction: column; gap: .5rem; }
.hote-scene { display: block; width: 100%; text-align: left; cursor: pointer;
  padding: .85rem .95rem; font: inherit; color: var(--ink, #1F1B14);
  background: var(--surface, #fff); border: 1px solid var(--hairline, #E2DBC8);
  border-radius: 10px; }
.hote-scene:hover, .hote-scene:focus-visible { border-color: var(--accent, #C44536); }
.hote-scene[data-memorisee] { opacity: .72; }
.hote-scene { display: flex; align-items: center; gap: .8rem; }
.hote-scene b { display: block; font-weight: 600; font-size: 1rem; margin-bottom: .15rem; }
.hote-scene-texte { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.hote-scene .hote-sous { font-size: .8rem; color: var(--muted, #7A6F5E); }
.hote-mini { flex: 0 0 auto; width: 4.6rem; height: 3.1rem; border-radius: 6px; overflow: hidden;
  background: var(--accent-soft, #F5E9DC) center / cover no-repeat; display: grid; place-items: center;
  font-family: var(--serif, Georgia, serif); font-size: 1.3rem; color: var(--accent, #C44536);
  border: 1px solid var(--hairline, #E2DBC8); }
.hote-badges { display: flex; flex-wrap: wrap; gap: .3rem; margin-top: .3rem; }
.hote-badges i { font-style: normal; font-size: .68rem; letter-spacing: .03em; padding: .08rem .45rem; border-radius: 999px;
  background: var(--surface-muted, #FAF6EB); color: var(--muted, #7A6F5E); border: 1px solid var(--hairline, #E2DBC8); }
.hote-badges i.pret { color: var(--accent2, #2E4E54); border-color: var(--accent2, #2E4E54); }
.hote-outils { display: flex; gap: .5rem; }
.hote-outils input { flex: 1; min-width: 0; }
.hote-outils select { flex: 0 0 auto; padding: .8rem .6rem; font: inherit; font-size: .9rem; color: var(--ink, #1F1B14);
  background: var(--surface, #fff); border: 1px solid var(--hairline-strong, #C9C0A8); border-radius: 8px; }
.hote-champ { display: flex; flex-direction: column; gap: .35rem; }
.hote-champ[hidden] { display: none; }
.hote-champ select { width: 100%; padding: .8rem .9rem; font: inherit; font-size: 1rem; color: var(--ink, #1F1B14);
  background: var(--surface, #fff); border: 1px solid var(--hairline-strong, #C9C0A8); border-radius: 8px; }
.hote-etapes { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: .35rem; font-size: .9rem; }
.hote-etapes li { display: flex; gap: .55rem; align-items: baseline; color: var(--muted, #7A6F5E); }
.hote-etapes li::before { content: '○'; }
.hote-etapes li.fait { color: var(--ink, #1F1B14); }
.hote-etapes li.fait::before { content: '●'; color: var(--accent2, #2E4E54); }
.hote-etapes li.en-cours { color: var(--ink, #1F1B14); font-weight: 600; }
.hote-etapes li.en-cours::before { content: '◐'; color: var(--accent, #C44536); }
.hote-resume { font-size: .88rem; color: var(--muted, #7A6F5E); }
.hote-puces { display: flex; flex-wrap: wrap; gap: .4rem; }
.hote-puces button { font: inherit; font-size: .8rem; padding: .35rem .7rem; border-radius: 999px; cursor: pointer;
  color: var(--ink, #1F1B14); background: none; border: 1px solid var(--hairline-strong, #C9C0A8); }
.hote-puces button[aria-pressed="true"] { color: #fff; background: var(--ink, #1F1B14); border-color: var(--ink, #1F1B14); }
.hote-puces button:focus-visible { outline: 2px solid var(--accent, #C44536); outline-offset: 2px; }
.hote-progres { font-size: .85rem; color: var(--muted, #7A6F5E);
  font-family: var(--mono, monospace); }
.hote-courante { padding: .9rem 1rem; border-radius: 10px;
  background: var(--surface, #fff); border: 1px solid var(--hairline, #E2DBC8); }
.hote-courante b { display: block; font-size: 1.05rem; color: var(--ink, #1F1B14); }
.hote-courante span { font-size: .8rem; color: var(--muted, #7A6F5E); }
.hote-menu { display: flex; flex-direction: column; gap: .4rem; }
.hote-menu button { display: flex; align-items: center; gap: .75rem;
  width: 100%; padding: .9rem .8rem; font: inherit; font-size: 1rem;
  color: var(--ink, #1F1B14); background: none; border: 0; border-radius: 10px;
  text-align: left; cursor: pointer; }
.hote-menu button:active { background: var(--surface-muted, #FAF6EB); }
.hote-menu button[hidden] { display: none; }
.hote-menu button small { display: block; font-size: .78rem; color: var(--muted, #7A6F5E); }
.hote-sous-titre { margin: .6rem .8rem 0; font-size: .72rem; letter-spacing: .06em; text-transform: uppercase; color: var(--muted, #7A6F5E); }
.hote-ic { flex: 0 0 auto; color: var(--muted, #7A6F5E); }
.hote-version { font-family: var(--mono, monospace); font-size: .78rem;
  color: var(--muted, #7A6F5E); opacity: .8; }
`;

/**
 * Pose UN avis, en remplacant le precedent.
 *
 * `prepend` a chaque tentative empilait les bandeaux : trois essais donnaient
 * trois messages identiques, qui repoussaient la marque et la liste hors de
 * l'ecran. Un seul avis a la fois, toujours au meme endroit.
 */
function poserAvis(boite, texte) {
  boite.querySelectorAll('.hote-avis[data-avis]').forEach((e) => e.remove());
  const el = document.createElement('div');
  el.className = 'hote-avis';
  el.dataset.avis = '1';
  el.textContent = texte;
  const apres = boite.querySelector('h2');
  if (apres) apres.after(el); else boite.prepend(el);
  return el;
}

/**
 * Traduit l'echec d'une requete.
 *
 * « Failed to fetch » ne dit rien a personne, et surtout pas la verite : en
 * navigateur, la requete n'est meme pas partie — l'instance refuse l'en-tete
 * `Authorization` au controle prealable. Une cle invalide, elle, donnerait un
 * 401 avec un corps lisible.
 */
function expliquer(e, caps) {
  const msg = String(e?.message || e || '');
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return caps && !caps.decouverte
      ? "Cette instance n'accepte pas les requêtes signées depuis un navigateur. "
        + "Installez l'application pour ouvrir vos scènes."
      : 'Instance injoignable — vérifiez la connexion réseau.';
  }
  if (/401|invalid api key/i.test(msg)) return 'Clé refusée par l’instance. Vérifiez-la dans votre profil Grist.';
  if (/403/.test(msg)) return 'Accès refusé à ce document.';
  if (/404/.test(msg)) return 'Document introuvable — il a peut-être été supprimé.';
  return msg;
}

/**
 * Quelle version de l'application tourne, si elle le dit.
 *
 * Le paquet installe porte une meta posee au moment de la vendorisation. Le
 * widget Grist n'en a pas, et n'en a pas besoin : il est servi en ligne, il est
 * donc toujours a jour. Dans l'application, c'est le seul repere — sans lui on
 * teste une ancienne APK en croyant l'avoir mise a jour.
 */
function versionInstallee(doc) {
  return doc.querySelector('meta[name="atlas-version"]')?.content?.trim() || '';
}

const echapper = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Les icones du menu, au trait comme partout ailleurs dans Atlas.
 *
 * C'etaient des emoji. Sur Android ils sortent en Noto couleur, a une taille
 * que la page ne controle pas : trois pastilles bariolees dans une interface
 * qui n'en a aucune. Un trait de 1,6 px suit la couleur du texte et se comporte
 * en toute densite.
 */
const trait = (d) => `<svg class="hote-ic" width="20" height="20" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true">${d}</svg>`;

const IC = {
  scenes: trait('<path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H3z"/>'),
  // Une cle couchee : anneau a gauche, tige horizontale, deux dents dessous.
  // La precedente montait en diagonale depuis un anneau qu'elle traversait, et
  // ses deux traits en croix se lisaient comme un symbole de genre.
  cle: trait('<circle cx="7" cy="12" r="4"/><path d="M11 12h10M15 12v2.5M18 12v3.5"/>'),
  retour: trait('<path d="M19 12H5m6-7-7 7 7 7"/>'),
  synchro: trait('<path d="M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8"/><path d="M18.5 2v4h-4M5.5 22v-4h4"/>'),
  crayon: trait('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>'),
  hors: trait('<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M12 8v6m0 0-2.5-2.5M12 14l2.5-2.5"/>'),
  corbeille: trait('<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7"/><path d="M10 11v6m4-6v6"/>'),
};

const MARQUE = `<div class="hote-marque">
  <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M4 24 16 6l12 18-12 4z" fill="#C44536"/><path d="M16 6v22" stroke="#F4EFE3" stroke-width="1.2"/>
  </svg><span>Atlas</span></div>`;

/**
 * Affiche l'accueil et ne rend la main que lorsqu'une scene est ouverte.
 *
 * @returns {Promise<boolean>} `true` si Atlas peut demarrer, `false` si l'hote
 *   garde l'ecran (rien a proposer, ou l'utilisateur n'a pas encore choisi).
 */
export async function accueillir({ portee = globalThis, document: doc = document } = {}) {
  const caps = capacites(portee);
  const stockage = (() => { try { return portee.localStorage; } catch (_) { return null; } })();
  let config = lireConfig(stockage);

  const ecran = ecranInitial(caps, config);
  if (ecran === ECRANS.WIDGET) return true;   // dans Grist : l'hote n'a rien a faire

  const style = doc.createElement('style');
  style.textContent = CSS;
  doc.head.appendChild(style);

  const voile = doc.createElement('div');
  voile.className = 'hote';
  voile.innerHTML = '<div class="hote-boite"></div>';
  doc.body.appendChild(voile);
  const boite = voile.querySelector('.hote-boite');

  const fermer = () => { voile.remove(); style.remove(); };

  // Navigateur : la connexion echouerait, mais Atlas reste utilisable en local.
  // On explique, et on laisse continuer — barrer la route serait une regression.
  if (ecran === ECRANS.LOCAL) {
    return new Promise((resoudre) => {
      montrerLocal(boite, caps, () => { fermer(); resoudre(true); }, portee);
    });
  }

  // Une scene deja retenue : on ouvre sans rien demander. C'est le cas courant,
  // l'application ayant vocation a s'ouvrir sur le dernier projet consulte.
  if (ecran === ECRANS.ATLAS) {
    const pret = await ouvrirScene(config, portee, boite);
    if (pret) { fermer(); return true; }
    config = { ...config, docId: '' };   // scene devenue illisible : on repropose la liste
  }

  return new Promise((resoudre) => {
    const versConnexion = (message) => montrerConnexion(boite, config, message, (c) => {
      config = c;
      ecrireConfig(stockage, config);
      versScenes();
    });

    const choisir = async (scene) => {
      const conf = { ...config, docId: scene.id };
      const pret = await ouvrirScene(conf, portee, boite);
      if (!pret) return;
      ecrireConfig(stockage, conf);
      // Dire tout de suite quelle scene s'ouvre : le chargement dure, et une
      // carte vide intitulee « Nouveau projet » se lit comme un echec.
      try { portee.__atlasAnnoncerOuverture?.(scene.nom); } catch (_) { /* sans importance */ }
      fermer();
      resoudre(true);
    };

    const versScenes = () => montrerScenes(boite, config, portee, {
      stockage,
      onChoix: choisir,
      onNouvelle: () => montrerNouvelleScene(boite, config, portee, { stockage, onRetour: versScenes, onOuvre: choisir }),
      // Rien n'est efface : l'ancienne connexion tient jusqu'a ce qu'une
      // nouvelle la remplace, et l'ecran s'ouvre pre-rempli.
      onChanger: () => versConnexion(),
    });

    if (ecran === ECRANS.CONNEXION) versConnexion();
    else versScenes();
  });
}

/* ------------------------------------------------------------------ */

function montrerLocal(boite, caps, onContinuer, portee = globalThis) {
  const offre = offreApplication(caps, portee?.navigator?.userAgent);
  // Sur le telephone, l'application est la reponse a ce que l'ecran vient
  // d'annoncer : elle passe donc devant, et « continuer » devient le second
  // choix. Sur un ordinateur elle ne s'installe pas — on la nomme, sans plus.
  const app = !offre.proposer ? ''
    : offre.direct
      ? `<a class="hote-btn" id="h-apk" href="${offre.url}">Télécharger l’application</a>
         <p>Elle seule peut présenter votre clé à l’instance : c’est ce qui vous
            rendra vos scènes, et le travail hors ligne.</p>`
      : `<p>Sur Android, <a href="${offre.url}">l’application Atlas</a> retrouve vos
            scènes et travaille hors ligne. Sur ordinateur, ouvrez Atlas depuis un
            document Grist.</p>`;
  boite.innerHTML = `${MARQUE}
    <h2>Vos scènes Grist sont hors de portée ici</h2>
    <p>${echapper(caps.raison || '')}</p>
    ${app}
    <button class="hote-btn${offre.direct ? ' creux' : ''}" id="h-local">Continuer sans se connecter</button>
    <p>Vous pourrez charger un fichier, importer depuis OpenStreetMap et
       travailler localement — sans enregistrer dans Grist.</p>`;
  boite.querySelector('#h-local').onclick = onContinuer;
}

function montrerConnexion(boite, config, message, onValider) {
  boite.innerHTML = `${MARQUE}
    <h2>Se connecter</h2>
    <p>L’adresse de votre instance Grist et votre clé API. Elles sont conservées
       sur cet appareil : vous ne les saisirez qu’une fois.</p>
    ${message ? `<div class="hote-avis">${echapper(message)}</div>` : ''}
    <div>
      <label for="h-base">Adresse de l’instance</label>
      <input id="h-base" inputmode="url" autocapitalize="off" autocorrect="off"
             spellcheck="false" placeholder="grist.numerique.gouv.fr"
             value="${echapper(config?.baseUrl || '')}">
    </div>
    <div>
      <label for="h-cle">Clé API</label>
      <input id="h-cle" type="password" autocapitalize="off" autocorrect="off"
             spellcheck="false" placeholder="collez votre clé"
             value="${echapper(config?.jeton || '')}">
    </div>
    <button class="hote-btn" id="h-ok">Se connecter</button>
    <p>La clé se copie depuis votre profil Grist, rubrique « Clé API ».</p>`;

  const valider = () => {
    const r = validerConfig({
      baseUrl: boite.querySelector('#h-base').value,
      jeton: boite.querySelector('#h-cle').value,
    });
    if (!r.ok) return montrerConnexion(boite, config, r.message, onValider);
    onValider(r.config);
  };
  boite.querySelector('#h-ok').onclick = valider;
  boite.querySelector('#h-cle').onkeydown = (e) => { if (e.key === 'Enter') valider(); };
}

async function montrerScenes(boite, config, portee, { onChoix, onChanger, onNouvelle, stockage }) {
  const prefs = lirePrefsListe(stockage);
  let texte = '';
  boite.innerHTML = `${MARQUE}
    <h2>Vos scènes</h2>
    ${onNouvelle ? '<button class="hote-btn creux" id="h-nouvelle">＋ Nouvelle scène</button>' : ''}
    <div class="hote-outils">
      <input type="search" id="h-filtre" placeholder="Rechercher une scène…" aria-label="Rechercher une scène" autocomplete="off">
      <select id="h-tri" aria-label="Trier les scènes">${TRIS.map((x) => `<option value="${x.id}"${x.id === prefs.tri ? ' selected' : ''}>${echapper(x.libelle)}</option>`).join('')}</select>
    </div>
    <div class="hote-puces" id="h-puces" role="group" aria-label="Filtrer par rôle"></div>
    <div class="hote-progres" id="h-progres"></div>
    <div class="hote-liste" id="h-liste"></div>
    <button class="hote-lien" id="h-changer">Changer d’instance ou de clé</button>`;

  const liste = boite.querySelector('#h-liste');
  const progres = boite.querySelector('#h-progres');
  const puces = boite.querySelector('#h-puces');
  boite.querySelector('#h-changer').onclick = onChanger;
  const nouvelle = boite.querySelector('#h-nouvelle');
  if (nouvelle) nouvelle.onclick = onNouvelle;

  // Ce que l'appareil sait déjà : les scènes ouvrables sans réseau, et les miniatures vues la dernière fois.
  const idb = stockageParDefaut(portee).stockage;
  const prets = await scenesPreparees(idb, config.baseUrl);
  // Les scènes faites sur l'appareil : toujours là, avec ou sans réseau, et ouvrables sans lui.
  const locales = await scenesLocales(idb);
  const cleMini = (id) => `mini:${config.baseUrl}|${id}`;
  const minis = new Map();   // id → { data, maj }

  /** Les scènes à l'écran : la mémoire d'abord, puis ce que le compte confirme. */
  const scenes = new Map();
  for (const s of locales) {
    const id = idDocumentLocal(s.id);
    scenes.set(id, { id, nom: s.nom, org: '', espace: 'Sur cet appareil', maj: new Date(s.modifieLe || s.creeLe).toISOString(), acces: '', locale: true });
    prets.set(id, true);
  }

  const carte = (scene) => {
    const b = document.createElement('button');
    b.className = 'hote-scene';
    b.dataset.scene = scene.id;
    if (scene.memorisee) b.dataset.memorisee = '1';
    const sous = [situer(scene), depuis(scene.maj)].filter(Boolean).join(' — ');
    const role = libelleRole(scene.acces);
    const mini = minis.get(scene.id)?.data;
    const initiale = echapper((scene.nom || '?').trim().charAt(0).toUpperCase());
    b.innerHTML = `<span class="hote-mini" aria-hidden="true">${mini ? '' : initiale}</span>
      <span class="hote-scene-texte"><b>${echapper(scene.nom || 'Sans titre')}</b>
        ${sous ? `<span class="hote-sous">${echapper(sous)}</span>` : ''}
        <span class="hote-badges">${scene.locale ? '<i class="pret">Sur cet appareil</i><i>À envoyer</i>' : ''}${role ? `<i>${echapper(role)}</i>` : ''}${prets.has(scene.id) && !scene.locale ? '<i class="pret">Disponible hors ligne</i>' : ''}</span></span>`;
    if (mini) b.querySelector('.hote-mini').style.backgroundImage = `url("${mini.replace(/"/g, '%22')}")`;
    b.onclick = () => onChoix(scene);
    return b;
  };

  let rendu = false;
  const rendre = () => {
    rendu = false;
    const tous = [...scenes.values()];
    puces.innerHTML = FILTRES.map((f) => {
      const n = filtrerScenes(tous, { acces: f.id, prets }).length;
      return `<button type="button" data-filtre="${f.id}" aria-pressed="${f.id === prefs.acces}"${f.id !== 'tous' && !n ? ' disabled' : ''}>${echapper(f.libelle)}${f.id === 'tous' || n ? ` · ${n}` : ''}</button>`;
    }).join('');
    const vues = trierScenes(filtrerScenes(tous, { acces: prefs.acces, texte, prets }), prefs.tri);
    liste.replaceChildren(...vues.map(carte));
    if (!vues.length && tous.length) {
      const v = document.createElement('div');
      v.className = 'hote-avis';
      v.textContent = 'Aucune scène ne correspond à cette recherche.';
      liste.appendChild(v);
    }
  };
  /** Un rendu par image : le balayage d'un compte fourni rappelle l'affichage à chaque scène trouvée. */
  const planifier = () => {
    if (rendu) return;
    rendu = true;
    (portee.requestAnimationFrame || ((f) => setTimeout(f, 16)))(rendre);
  };

  puces.onclick = (e) => {
    const f = e.target.closest('[data-filtre]');
    if (!f || f.disabled) return;
    prefs.acces = f.dataset.filtre;
    ecrirePrefsListe(stockage, prefs);
    rendre();
  };
  boite.querySelector('#h-tri').onchange = (e) => { prefs.tri = e.target.value; ecrirePrefsListe(stockage, prefs); rendre(); };
  boite.querySelector('#h-filtre').oninput = (e) => { texte = e.target.value; rendre(); };

  // 1. Ce qu'on avait trouvé la dernière fois — affiché TOUT DE SUITE.
  //    Sonder un compte prend plusieurs secondes ; revoir une page vide à chaque
  //    ouverture serait une punition pour qui a beaucoup de documents.
  const memoire = lireScenesMemorisees(stockage);
  if (memoire) {
    for (const s of memoire.scenes) {
      scenes.set(s.id, { ...s, memorisee: true });
      try { const m = await idb.get('divers', cleMini(s.id)); if (m?.data) minis.set(s.id, m); } catch (_) { /* sans miniature */ }
    }
    progres.textContent = memoire.perime
      ? `Liste mémorisée ${depuis(new Date(memoire.quand).toISOString())} — vérification…`
      : `${memoire.scenes.length} scène${memoire.scenes.length > 1 ? 's' : ''} — vérification…`;
  } else {
    progres.textContent = 'Recherche…';
  }
  rendre();

  // Les miniatures se lisent par petits lots : une requête par scène, jamais toutes d'un coup.
  const file = [];
  let enCours = 0;
  const lireSuivante = async () => {
    if (enCours >= 3 || !file.length) return;
    const scene = file.shift();
    enCours++;
    try {
      const data = await lireMiniature(scene.id, config.baseUrl, config.jeton, portee.fetch?.bind(portee));
      const m = { data, maj: scene.maj || '' };
      minis.set(scene.id, m);
      await idb.put('divers', cleMini(scene.id), m).catch(() => {});
      planifier();
    } finally { enCours--; lireSuivante(); }
  };
  const demanderMiniature = (scene) => {
    const vue = minis.get(scene.id);
    if (vue && vue.maj === (scene.maj || '')) return;   // à jour : rien à relire
    file.push(scene);
    lireSuivante();
  };

  // 2. Puis on vérifie auprès du compte, sans faire disparaître ce qui est là.
  const trouvees = [];
  try {
    await listerScenesAtlas(config.baseUrl, config.jeton, {
      fetchFn: portee.fetch?.bind(portee),
      // L'inventaire précède le sondage, et il peut durer : sur un compte à
      // plusieurs organisations, l'écran restait sur « Recherche… » sans que
      // rien ne dise si l'instance répondait. Chaque étape s'annonce donc.
      onEtape: (e) => {
        if (e.phase === 'organisations') {
          progres.textContent = e.total == null
            ? 'Connexion au compte…'
            : `${e.total} organisation${e.total > 1 ? 's' : ''} — inventaire des documents…`;
        } else if (e.phase === 'espaces') {
          progres.textContent = `Inventaire ${e.fait} / ${e.total} — ${e.docs} document${e.docs > 1 ? 's' : ''}`;
        } else if (e.phase === 'documents') {
          progres.textContent = e.total
            ? `${e.total} documents à examiner…`
            : 'Aucun document accessible avec cette clé.';
        }
      },
      onTrouve: (scene) => {
        trouvees.push(scene);
        scenes.set(scene.id, scene);
        demanderMiniature(scene);
        planifier();
      },
      // L'avancement se compte en documents sondés : sur un compte fourni, la
      // recherche dure, et une page muette laisserait croire à une panne.
      onProgres: (fait, total) => {
        progres.textContent = fait < total
          ? `${fait} / ${total} documents examinés — ${trouvees.length} scène${trouvees.length > 1 ? 's' : ''}`
          : '';
      },
    });

    // 3. Ce que la mémoire annonçait et qui n'existe plus : on le retire, sans
    //    quoi la liste garderait indéfiniment des projets supprimés ou perdus.
    const vivantes = new Set(trouvees.map((s) => s.id));
    for (const [id, s] of [...scenes]) if (s.memorisee && !vivantes.has(id)) scenes.delete(id);

    memoriserScenes(stockage, trouvees);
    progres.textContent = trouvees.length
      ? `${trouvees.length} scène${trouvees.length > 1 ? 's' : ''}`
      : '';
    rendre();
    if (!trouvees.length) {
      liste.innerHTML = `<div class="hote-avis">Aucune scène Atlas trouvée sur ce compte.
        Une scène est un document contenant un import qgis2grist, des préférences
        de couches ou un récit.</div>`;
    }
  } catch (e) {
    // Hors ligne ou instance injoignable : la liste mémorisée reste à l'écran,
    // annoncée pour ce qu'elle est. La faire disparaître priverait de tout.
    progres.textContent = '';
    const cause = expliquer(e, capacites(portee));
    poserAvis(boite, scenes.size
      ? `${cause} Liste mémorisée ${depuis(new Date(memoire.quand).toISOString())}.`
      : cause);
  }
}

/** Remplit un choix d'espaces ; dit pourquoi quand il n'y en a pas. Rend les espaces, ou `null` si le compte est injoignable. */
async function chargerEspaces(select, info, config, portee) {
  info.textContent = 'Recherche des espaces où l’on peut créer…';
  try {
    const espaces = await listerEspacesEditables(config.baseUrl, config.jeton, { fetchFn: portee.fetch?.bind(portee) });
    select.innerHTML = espaces.map((e) => `<option value="${echapper(String(e.id))}">${echapper([e.org, e.nom].filter(Boolean).join(' — '))}</option>`).join('');
    info.textContent = espaces.length ? '' : 'Aucun espace où vous puissiez créer un document avec cette clé : demandez un rôle d’éditeur, ou travaillez sur l’appareil.';
    return espaces;
  } catch (e) {
    select.innerHTML = '';
    info.textContent = `Pas de réseau pour chercher les espaces (${expliquer(e, capacites(portee))}).`;
    return null;
  }
}

/** Une ligne par étape, qui se coche à mesure ; `dire(e)` reçoit l'avancement de `envoyerScene`. */
function suiviEtapes(conteneur, plan) {
  conteneur.innerHTML = plan.map((e) => `<li data-etape="${echapper(e.id.split(':')[0])}${e.table ? ':' + echapper(e.table) : ''}">${echapper(e.libelle)}</li>`).join('');
  const li = (id) => conteneur.querySelector(`[data-etape="${id.replace(/"/g, '')}"]`);
  return (e) => {
    const cle = e.phase === 'donnees' ? `donnees:${e.etape}` : e.phase;
    const ordre = ['document', 'photos', 'tables', 'donnees'];
    for (const n of conteneur.querySelectorAll('li')) {
      const phase = n.dataset.etape.split(':')[0];
      if (ordre.indexOf(phase) < ordre.indexOf(e.phase)) { n.className = 'fait'; }
    }
    const cible = li(cle);
    if (cible) cible.className = e.fait >= e.total ? 'fait' : 'en-cours';
  };
}

/**
 * « Nouvelle scène » : un nom, et où elle vit — dans un document Grist neuf (il faut le réseau et un espace où l'on peut écrire)
 * ou **sur l'appareil seulement** (elle se fait sans réseau, et s'envoie plus tard).
 */
function montrerNouvelleScene(boite, config, portee, { stockage, onRetour, onOuvre }) {
  const { stockage: idb, durable } = stockageParDefaut(portee);
  const enLigne = portee.navigator?.onLine !== false;
  let cible = enLigne ? 'grist' : 'local';
  boite.innerHTML = `${MARQUE}
    <h2>Nouvelle scène</h2>
    <div class="hote-champ"><label for="n-nom">Nom</label><input id="n-nom" value="${echapper(nomParDefaut())}" autocomplete="off"></div>
    <div class="hote-puces" id="n-cible" role="group" aria-label="Où créer la scène">
      <button type="button" data-cible="grist" aria-pressed="${cible === 'grist'}">Dans Grist</button>
      <button type="button" data-cible="local" aria-pressed="${cible === 'local'}"${durable ? '' : ' disabled'}>Sur cet appareil</button>
    </div>
    <p id="n-aide"></p>
    <div class="hote-champ" id="n-espace-champ"><label for="n-espace">Espace</label><select id="n-espace"></select></div>
    <div class="hote-progres" id="n-info"></div>
    <ul class="hote-etapes" id="n-etapes"></ul>
    <button class="hote-btn" id="n-creer">Créer la scène</button>
    <button class="hote-lien" id="n-retour">Retour</button>`;
  const q = (s) => boite.querySelector(s);
  const aide = q('#n-aide');
  const info = q('#n-info');
  const select = q('#n-espace');
  const creer = q('#n-creer');
  q('#n-retour').onclick = onRetour;
  let espaces = null;

  const majCible = () => {
    for (const b of boite.querySelectorAll('[data-cible]')) b.setAttribute('aria-pressed', String(b.dataset.cible === cible));
    q('#n-espace-champ').hidden = cible !== 'grist';
    aide.textContent = cible === 'grist'
      ? 'Un document Grist neuf, que vous retrouvez avec vos autres scènes et qui se partage comme eux.'
      : durable
        ? 'La scène reste sur cet appareil : on peut la composer sans réseau, puis l’envoyer dans un document Grist quand on en a un.'
        : 'Le stockage de cet appareil est indisponible : une scène locale serait perdue à la fermeture.';
    creer.disabled = cible === 'grist' && (!espaces || !espaces.length);
  };
  boite.querySelector('#n-cible').onclick = (e) => {
    const b = e.target.closest('[data-cible]');
    if (!b || b.disabled) return;
    cible = b.dataset.cible;
    majCible();
  };
  majCible();
  if (enLigne) chargerEspaces(select, info, config, portee).then((e) => { espaces = e; majCible(); });
  else { info.textContent = 'Pas de réseau : la scène sera créée sur l’appareil.'; }

  creer.onclick = async () => {
    const nom = (q('#n-nom').value || '').trim() || nomParDefaut();
    creer.disabled = true;
    try {
      if (cible === 'local') {
        const s = await creerSceneLocale(idb, { nom });
        try { portee.localStorage?.setItem('atlas_nouvelle_scene', idDocumentLocal(s.id)); } catch (_) { /* sans importance */ }
        await onOuvre({ id: idDocumentLocal(s.id), nom });
        return;
      }
      const scene = sceneNeuve({ nom });
      const plan = planEnvoi(scene);
      const dire = suiviEtapes(q('#n-etapes'), plan);
      info.textContent = 'Création du document…';
      const cle = `nouvelle:${Date.now()}`;
      const res = await envoyerScene({
        scene, baseUrl: config.baseUrl, jeton: config.jeton, espaceId: select.value, nom,
        fetchFn: portee.fetch?.bind(portee),
        creerClient: (o) => creerClient({ mode: 'rest', ...o }),
        ecrireJournal: (j) => idb.put('divers', cleEnvoi(cle), j).catch(() => {}),
        onEtape: dire,
      });
      await idb.delete('divers', cleEnvoi(cle)).catch(() => {});
      try { portee.localStorage?.setItem('atlas_nouvelle_scene', res.docId); } catch (_) { /* sans importance */ }
      await onOuvre({ id: res.docId, nom });
    } catch (e) {
      info.textContent = `Échec : ${expliquer(e, capacites(portee))}`;
      creer.disabled = false;
    }
  };
}

/**
 * « Envoyer vers Grist » : verse la scène faite sur l'appareil dans un document neuf. Le journal se garde à chaque étape :
 * un envoi interrompu se reprend où il s'est arrêté, sans document doublé. Une fois la scène envoyée, la locale est retirée et
 * l'application s'ouvre sur le document Grist.
 */
function montrerEnvoi(boite, config, portee, { client, stockage, onRetour }) {
  const { stockage: idb } = stockageParDefaut(portee);
  const scene = client.scene;
  const res = resumerScene(scene);
  const plan = planEnvoi(scene);
  boite.innerHTML = `${MARQUE}
    <h2>Envoyer vers Grist</h2>
    <p class="hote-resume">${res.tables.length} table${res.tables.length > 1 ? 's' : ''} · ${res.lignes} ligne${res.lignes > 1 ? 's' : ''}${res.photos ? ` · ${res.photos} photo${res.photos > 1 ? 's' : ''}` : ''}.
      Un document Grist neuf est créé, la scène y est versée, puis l’application s’y ouvre. La scène de l’appareil n’est retirée qu’une fois tout arrivé.</p>
    <div class="hote-champ"><label for="e-nom">Nom du document</label><input id="e-nom" value="${echapper(scene.nom)}" autocomplete="off"></div>
    <div class="hote-champ"><label for="e-espace">Espace</label><select id="e-espace"></select></div>
    <div class="hote-progres" id="e-info"></div>
    <ul class="hote-etapes" id="e-etapes"></ul>
    <button class="hote-btn" id="e-envoyer">Envoyer</button>
    <button class="hote-lien" id="e-retour">Retour</button>`;
  const q = (s) => boite.querySelector(s);
  const info = q('#e-info');
  const select = q('#e-espace');
  const bouton = q('#e-envoyer');
  q('#e-retour').onclick = onRetour;
  let espaces = null;
  chargerEspaces(select, info, config, portee).then((e) => { espaces = e; bouton.disabled = !e || !e.length; });
  const dire = suiviEtapes(q('#e-etapes'), plan);
  // Un envoi déjà commencé se reprend : on le dit, et le document créé n'est pas recréé.
  idb.get('divers', cleEnvoi(scene.id)).then((j) => { if (j?.docId) info.textContent = 'Un envoi interrompu sera repris là où il s’est arrêté.'; }).catch(() => {});

  bouton.onclick = async () => {
    bouton.disabled = true;
    try {
      const journal = (await idb.get('divers', cleEnvoi(scene.id))) || journalVide();
      const rendu = await envoyerScene({
        scene, piecesJointes: () => client.piecesJointes(), baseUrl: config.baseUrl, jeton: config.jeton,
        espaceId: select.value, nom: (q('#e-nom').value || '').trim() || scene.nom, fetchFn: portee.fetch?.bind(portee),
        creerClient: (o) => creerClient({ mode: 'rest', ...o }), journal,
        ecrireJournal: (j) => idb.put('divers', cleEnvoi(scene.id), j).catch(() => {}),
        onEtape: dire,
      });
      info.textContent = 'Envoyée. Ouverture du document Grist…';
      await supprimerSceneLocale(idb, scene.id);
      if (!ecrireConfig(stockage, { ...config, docId: rendu.docId })) throw new Error('le stockage de l’appareil est indisponible');
      portee.location.reload();
    } catch (e) {
      info.textContent = `Échec : ${expliquer(e, capacites(portee))} — l’envoi se reprendra où il s’est arrêté.`;
      bouton.disabled = false;
      bouton.textContent = 'Reprendre l’envoi';
    }
  };
}

/** Pour l'application : ouvre l'écran d'envoi de la scène locale en cours, sans passer par le menu. */
export function ouvrirEnvoi({ portee = globalThis, document: doc = document } = {}) {
  const client = portee.grist?._horsLigne;
  if (!client?.local) return null;
  const stockage = (() => { try { return portee.localStorage; } catch (_) { return null; } })();
  const config = lireConfig(stockage);
  const style = doc.createElement('style');
  style.textContent = CSS;
  doc.head.appendChild(style);
  const voile = doc.createElement('div');
  voile.className = 'hote';
  voile.innerHTML = '<div class="hote-boite"></div>';
  doc.body.appendChild(voile);
  const fermer = () => { voile.remove(); style.remove(); };
  montrerEnvoi(voile.querySelector('.hote-boite'), config, portee, { client, stockage, onRetour: fermer });
  return fermer;
}

/**
 * Branche Atlas sur une scene : cree le client, verifie qu'elle repond, puis
 * installe l'adaptateur. La verification evite d'ouvrir sur un ecran vide quand
 * le document a ete supprime ou les droits retires depuis la derniere fois.
 */
async function ouvrirScene(config, portee, boite) {
  try {
    // Une scène faite sur l'appareil : son « document » est local, rien à lire au réseau.
    if (estIdLocal(config.docId)) {
      const { stockage } = stockageParDefaut(portee);
      const scene = await lireSceneLocale(stockage, idDepuisDocument(config.docId));
      if (!scene) throw new Error('Cette scène locale n’est plus sur l’appareil.');
      installerAdaptateur(new ClientLocal({ stockage, scene }), { userId: null, user: null }, portee);
      return true;
    }
    const brut = await creerClient({
      mode: 'rest', baseUrl: config.baseUrl, docId: config.docId, jeton: config.jeton,
      fetch: portee.fetch?.bind(portee),
    });
    // Sans réseau, la scène s'ouvre depuis l'appareil ; les relevés sont gardés et partent au retour du réseau.
    const client = habillerHorsLigne(brut, { portee });
    await client.listTables();
    // Qui est connecté : de quoi préremplir « moi » dans un formulaire. Sans réponse, on s'en passe.
    let profil = null;
    try { profil = await client.profil?.(); } catch (_) { profil = null; }
    installerAdaptateur(client, { userId: profil?.id ?? null, user: profil && (profil.email || profil.name) ? profil : null }, portee);
    return true;
  } catch (e) {
    if (boite) poserAvis(boite, expliquer(e, capacites(portee)));
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Le menu principal — l'accueil de l'application                      */
/* ------------------------------------------------------------------ */

/**
 * Ouvert depuis la marque « Atlas », en haut a gauche.
 *
 * C'est l'hote qui reprend la main : la scene courante, le moyen d'en changer,
 * la connexion. Les modules a venir — la saisie sur formulaire, par exemple —
 * s'accrochent ici, sans toucher a la carte.
 *
 * Changer de scene RECHARGE la page. Atlas porte trop d'etat — couches, recit,
 * cache d'altitude, scene three.js, sources MapLibre — pour qu'un nettoyage a
 * chaud soit sur : il resterait des traces de l'ancienne scene dans la nouvelle.
 * Le rechargement ne peut pas se tromper, et la configuration etant deja sur
 * l'appareil, l'accueil rouvre directement sur la liste.
 *
 * `edition` : en lecture, quand la personne peut écrire, le moyen d'y revenir
 * (`{ libelle, action }`). La barre du haut, qui portait cette bascule, est
 * retirée en lecture dans l'application : sans cette entrée, on ne sortirait
 * plus de la lecture qu'en rouvrant la scène.
 */
/** L'état de la synchronisation, en une phrase : ce qu'on veut savoir avant de quitter le terrain. */
export function phraseSynchro(e) {
  if (!e) return '';
  const parts = [];
  parts.push(e.enLigne ? 'En ligne' : 'Hors réseau');
  if (e.enAttente) parts.push(`${e.enAttente} en attente`);
  const aVerifier = (e.refusees || 0) + (e.incertaines || 0);
  if (aVerifier) parts.push(`${aVerifier} à vérifier`);
  if (!e.enAttente && !aVerifier) parts.push('tout est parti');
  if (e.derniereSynchro) parts.push('dernier envoi ' + new Date(e.derniereSynchro).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }));
  return parts.join(' · ') + (e.enAttente && e.enLigne ? ' — toucher pour envoyer' : '');
}

export function ouvrirMenuPrincipal({
  portee = globalThis, document: doc = document, scene = null, modifie = false, edition = null,
} = {}) {
  const caps = capacites(portee);
  const stockage = (() => { try { return portee.localStorage; } catch (_) { return null; } })();
  const config = lireConfig(stockage);

  const style = doc.createElement('style');
  style.textContent = CSS;
  doc.head.appendChild(style);
  const voile = doc.createElement('div');
  voile.className = 'hote';
  voile.innerHTML = '<div class="hote-boite"></div>';
  doc.body.appendChild(voile);
  const boite = voile.querySelector('.hote-boite');
  const fermer = () => { voile.remove(); style.remove(); };

  const changeable = peutChangerDeScene(caps, config);
  // La synchronisation : ce qui est parti, ce qui attend, ce qui a été refusé. Ni dans un widget (Grist la tient),
  // ni sans client hors réseau.
  const hl = portee.grist?._horsLigne || null;
  const local = !!hl?.local;
  const synchro = hl && !local ? hl.etat() : null;
  const situation = scene ? [situer(scene), depuis(scene.maj)].filter(Boolean).join(' — ') : '';
  const version = versionInstallee(doc);
  // Les scènes déjà vues, les plus récentes d'abord : passer de l'une à l'autre sans repasser par la liste entière.
  const memoire = changeable ? lireScenesMemorisees(stockage) : null;
  const recentes = memoire
    ? trierScenes(memoire.scenes.filter((s) => s.id !== config?.docId), 'recent').slice(0, 3)
    : [];

  boite.innerHTML = `${MARQUE}
    ${scene ? `<div class="hote-courante">
      <b>${echapper(scene.nom || 'Scène en cours')}</b>
      ${situation ? `<span>${echapper(situation)}</span>` : ''}
    </div>` : ''}
    <div class="hote-menu">
      ${edition ? `<button id="m-edition">${IC.crayon}<span>${echapper(edition.libelle)}<small>${echapper(edition.aide || 'Les outils d’auteur reviennent sur la carte')}</small></span></button>` : ''}
      ${synchro ? `<button id="m-synchro">${IC.synchro}<span>Synchronisation<small>${echapper(phraseSynchro(synchro))}</small></span></button>` : ''}
      ${local ? `<button id="m-envoyer">${IC.hors}<span>Envoyer vers Grist<small>Scène sur cet appareil seulement : à envoyer dans un document</small></span></button>` : ''}
      ${hl && typeof hl.preparerHorsLigne === 'function' ? `<button id="m-hors">${IC.hors}<span>Disponible hors ligne<small id="m-hors-etat">…</small></span></button>
      <button id="m-hors-liberer" hidden>${IC.corbeille}<span>Libérer l’espace<small>La scène demandera de nouveau le réseau pour s’ouvrir</small></span></button>` : ''}
      ${recentes.length ? `<div class="hote-sous-titre">Scènes récentes</div>${recentes.map((s) => `<button data-recente="${echapper(s.id)}">${IC.scenes}<span>${echapper(s.nom || 'Sans titre')}<small>${echapper([libelleRole(s.acces), depuis(s.maj)].filter(Boolean).join(' — '))}</small></span></button>`).join('')}` : ''}
      ${changeable ? `<button id="m-nouvelle">${IC.crayon}<span>Nouvelle scène<small>Dans Grist, ou sur cet appareil</small></span></button>` : ''}
      ${changeable ? `<button id="m-scenes">${IC.scenes}<span>Changer de scène<small>${
        modifie ? 'Des modifications ne sont pas enregistrées' : 'Revenir à la liste de vos projets'
      }</small></span></button>` : ''}
      ${changeable ? `<button id="m-connexion">${IC.cle}<span>Instance et clé<small>${
        echapper(config?.baseUrl || '')}</small></span></button>` : ''}
      <button id="m-fermer">${IC.retour}<span>Revenir à la carte</span></button>
    </div>
    ${version ? `<p class="hote-version">Version ${echapper(version)}</p>` : ''}`;

  boite.querySelector('#m-fermer').onclick = fermer;

  const sy = boite.querySelector('#m-synchro');
  if (sy) sy.onclick = async () => {
    sy.querySelector('small').textContent = 'Envoi…';
    try { await hl.envoyer(); } catch (_) { /* l'état dit le reste */ }
    sy.querySelector('small').textContent = phraseSynchro(hl.etat());
  };

  // Préparer la scène pour le terrain : tables, métadonnées et photos gardées sur l'appareil, lues au réseau.
  const hors = boite.querySelector('#m-hors');
  if (hors) {
    const etatHors = boite.querySelector('#m-hors-etat');
    const liberer = boite.querySelector('#m-hors-liberer');
    const majHors = async () => {
      const e = await hl.etatHorsLigne().catch(() => null);
      etatHors.textContent = phrasePreparation(e);
      liberer.hidden = !e;
    };
    majHors();
    hors.onclick = async () => {
      hors.disabled = true;
      let erreur = null;
      try { await hl.preparerHorsLigne({ onProgres: (p) => { etatHors.textContent = phraseProgres(p); } }); }
      catch (err) { erreur = err; etatHors.textContent = String(err?.message || err); }
      hors.disabled = false;
      if (!erreur) majHors();
    };
    liberer.onclick = async () => {
      if (!portee.confirm('Libérer l’espace ? La scène demandera de nouveau le réseau pour s’ouvrir.')) return;
      await hl.libererHorsLigne();
      majHors();
    };
  }

  const envoyer = boite.querySelector('#m-envoyer');
  if (envoyer) envoyer.onclick = () => montrerEnvoi(boite, config, portee, { client: hl, stockage, onRetour: () => { fermer(); ouvrirMenuPrincipal({ portee, document: doc, scene, modifie, edition }); } });

  const nouvelle = boite.querySelector('#m-nouvelle');
  if (nouvelle) nouvelle.onclick = () => {
    if (modifie && !portee.confirm('Des modifications ne sont pas enregistrées. Créer une autre scène malgré tout ?')) return;
    montrerNouvelleScene(boite, config, portee, {
      stockage,
      onRetour: () => { fermer(); ouvrirMenuPrincipal({ portee, document: doc, scene, modifie, edition }); },
      // La nouvelle scène devient celle de l'ouverture, et la page repart sur elle.
      onOuvre: async (s) => {
        if (!ecrireConfig(stockage, { ...(config || {}), docId: s.id })) {
          poserAvis(boite, 'Impossible d’ouvrir la scène : le stockage de l’appareil est indisponible.');
          return;
        }
        portee.location.reload();
      },
    });
  };

  const ed = boite.querySelector('#m-edition');
  if (ed) ed.onclick = () => { fermer(); edition.action(); };

  const scenes = boite.querySelector('#m-scenes');
  if (scenes) scenes.onclick = () => {
    // Prevenir AVANT de partir : changer de projet ne doit pas devenir un moyen
    // silencieux de perdre son travail.
    if (modifie && !portee.confirm('Des modifications ne sont pas enregistrées. Changer de scène malgré tout ?')) return;
    if (!quitterScene(stockage, config)) {
      const avis = doc.createElement('div');
      avis.className = 'hote-avis';
      avis.textContent = 'Impossible d’oublier la scène : le stockage de l’appareil est indisponible.';
      boite.prepend(avis);
      return;
    }
    portee.location.reload();
  };

  boite.querySelectorAll('[data-recente]').forEach((b) => {
    b.onclick = () => {
      if (modifie && !portee.confirm('Des modifications ne sont pas enregistrées. Changer de scène malgré tout ?')) return;
      // Même geste que la liste : la scène choisie devient celle de l'ouverture, et la page repart sur elle.
      if (!ecrireConfig(stockage, { ...(config || {}), docId: b.dataset.recente })) {
        poserAvis(boite, 'Impossible de changer de scène : le stockage de l’appareil est indisponible.');
        return;
      }
      portee.location.reload();
    };
  });

  const cx = boite.querySelector('#m-connexion');
  if (cx) cx.onclick = () => {
    if (modifie && !portee.confirm('Des modifications ne sont pas enregistrées. Continuer ?')) return;
    // Pre-rempli, et rien n'est efface avant validation : ouvrir cet ecran par
    // megarde ne doit pas couter une cle a retrouver dans son profil Grist.
    montrerConnexion(boite, config, null, (c) => {
      if (!changerConnexion(stockage, config, c)) {
        poserAvis(boite, 'Impossible d’enregistrer : le stockage de l’appareil est indisponible.');
        return;
      }
      portee.location.reload();
    });
  };

  return fermer;
}
