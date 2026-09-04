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

import { capacites, creerClient } from './data-client.js?v=1.5.1';
import { installerAdaptateur } from './grist-adapter.js?v=1.5.1';
import { listerScenesAtlas } from './decouverte.js?v=1.5.1';
import {
  ECRANS, ecranInitial, validerConfig, lireConfig, ecrireConfig, changerConnexion,
  depuis, situer, peutChangerDeScene, quitterScene,
  memoriserScenes, lireScenesMemorisees, offreApplication,
} from './hote.js?v=1.5.1';

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
.hote-scene b { display: block; font-weight: 600; font-size: 1rem; margin-bottom: .15rem; }
.hote-scene span { font-size: .8rem; color: var(--muted, #7A6F5E); }
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
.hote-menu button small { display: block; font-size: .78rem; color: var(--muted, #7A6F5E); }
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
  cle: trait('<circle cx="8" cy="16" r="4.5"/><path d="M11.2 12.8 20 4m-2.5 2.5 2.5 2.5m-5-5 2.5 2.5"/>'),
  retour: trait('<path d="M19 12H5m6-7-7 7 7 7"/>'),
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

    const versScenes = () => montrerScenes(boite, config, portee, {
      stockage,
      onChoix: async (scene) => {
        const conf = { ...config, docId: scene.id };
        const pret = await ouvrirScene(conf, portee, boite);
        if (!pret) return;
        ecrireConfig(stockage, conf);
        // Dire tout de suite quelle scene s'ouvre : le chargement dure, et une
        // carte vide intitulee « Nouveau projet » se lit comme un echec.
        try { portee.__atlasAnnoncerOuverture?.(scene.nom); } catch (_) { /* sans importance */ }
        fermer();
        resoudre(true);
      },
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

async function montrerScenes(boite, config, portee, { onChoix, onChanger, stockage }) {
  boite.innerHTML = `${MARQUE}
    <h2>Vos scènes</h2>
    <div class="hote-progres" id="h-progres"></div>
    <div class="hote-liste" id="h-liste"></div>
    <button class="hote-lien" id="h-changer">Changer d’instance ou de clé</button>`;

  const liste = boite.querySelector('#h-liste');
  const progres = boite.querySelector('#h-progres');
  boite.querySelector('#h-changer').onclick = onChanger;

  const carte = (scene, memorisee) => {
    const b = document.createElement('button');
    b.className = 'hote-scene';
    b.dataset.scene = scene.id;
    const sous = [situer(scene), depuis(scene.maj)].filter(Boolean).join(' — ');
    b.innerHTML = `<b>${echapper(scene.nom || 'Sans titre')}</b>
      ${sous ? `<span>${echapper(sous)}</span>` : ''}`;
    b.onclick = () => onChoix(scene);
    if (memorisee) b.dataset.memorisee = '1';
    return b;
  };

  // 1. Ce qu'on avait trouve la derniere fois — affiche TOUT DE SUITE.
  //    Sonder un compte prend plusieurs secondes ; revoir une page vide a chaque
  //    ouverture serait une punition pour qui a beaucoup de documents.
  const memoire = lireScenesMemorisees(stockage);
  const vues = new Set();
  if (memoire) {
    for (const s of memoire.scenes) { vues.add(s.id); liste.appendChild(carte(s, true)); }
    progres.textContent = memoire.perime
      ? `Liste mémorisée ${depuis(new Date(memoire.quand).toISOString())} — vérification…`
      : `${memoire.scenes.length} scène${memoire.scenes.length > 1 ? 's' : ''} — vérification…`;
  } else {
    progres.textContent = 'Recherche…';
  }

  // 2. Puis on verifie aupres du compte, sans faire disparaitre ce qui est la.
  const trouvees = [];
  try {
    await listerScenesAtlas(config.baseUrl, config.jeton, {
      fetchFn: portee.fetch?.bind(portee),
      onTrouve: (scene) => {
        trouvees.push(scene);
        const deja = liste.querySelector(`[data-scene="${CSS.escape(scene.id)}"]`);
        if (deja) { deja.replaceWith(carte(scene, false)); return; }
        liste.appendChild(carte(scene, false));
      },
      // L'avancement se compte en documents sondes : sur un compte fourni, la
      // recherche dure, et une page muette laisserait croire a une panne.
      onProgres: (fait, total) => {
        progres.textContent = fait < total
          ? `${fait} / ${total} documents examinés — ${trouvees.length} scène${trouvees.length > 1 ? 's' : ''}`
          : '';
      },
    });

    // 3. Ce que la memoire annoncait et qui n'existe plus : on le retire, sans
    //    quoi la liste garderait indefiniment des projets supprimes ou perdus.
    const vivantes = new Set(trouvees.map((s) => s.id));
    for (const b of [...liste.querySelectorAll('[data-memorisee]')]) {
      if (!vivantes.has(b.dataset.scene)) b.remove();
    }

    memoriserScenes(stockage, trouvees);
    progres.textContent = trouvees.length
      ? `${trouvees.length} scène${trouvees.length > 1 ? 's' : ''}`
      : '';
    if (!trouvees.length) {
      liste.innerHTML = `<div class="hote-avis">Aucune scène Atlas trouvée sur ce compte.
        Une scène est un document contenant un import qgis2grist, des préférences
        de couches ou un récit.</div>`;
    }
  } catch (e) {
    // Hors ligne ou instance injoignable : la liste memorisee reste a l'ecran,
    // annoncee pour ce qu'elle est. La faire disparaitre priverait de tout.
    progres.textContent = '';
    const cause = expliquer(e, capacites(portee));
    poserAvis(boite, vues.size
      ? `${cause} Liste mémorisée ${depuis(new Date(memoire.quand).toISOString())}.`
      : cause);
  }
}

/**
 * Branche Atlas sur une scene : cree le client, verifie qu'elle repond, puis
 * installe l'adaptateur. La verification evite d'ouvrir sur un ecran vide quand
 * le document a ete supprime ou les droits retires depuis la derniere fois.
 */
async function ouvrirScene(config, portee, boite) {
  try {
    const client = await creerClient({
      mode: 'rest', baseUrl: config.baseUrl, docId: config.docId, jeton: config.jeton,
      fetch: portee.fetch?.bind(portee),
    });
    await client.listTables();
    installerAdaptateur(client, {}, portee);
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
 */
export function ouvrirMenuPrincipal({
  portee = globalThis, document: doc = document, scene = null, modifie = false,
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
  const situation = scene ? [situer(scene), depuis(scene.maj)].filter(Boolean).join(' — ') : '';
  const version = versionInstallee(doc);

  boite.innerHTML = `${MARQUE}
    ${scene ? `<div class="hote-courante">
      <b>${echapper(scene.nom || 'Scène en cours')}</b>
      ${situation ? `<span>${echapper(situation)}</span>` : ''}
    </div>` : ''}
    <div class="hote-menu">
      ${changeable ? `<button id="m-scenes">${IC.scenes}<span>Changer de scène<small>${
        modifie ? 'Des modifications ne sont pas enregistrées' : 'Revenir à la liste de vos projets'
      }</small></span></button>` : ''}
      ${changeable ? `<button id="m-connexion">${IC.cle}<span>Instance et clé<small>${
        echapper(config?.baseUrl || '')}</small></span></button>` : ''}
      <button id="m-fermer">${IC.retour}<span>Revenir à la carte</span></button>
    </div>
    ${version ? `<p class="hote-version">Version ${echapper(version)}</p>` : ''}`;

  boite.querySelector('#m-fermer').onclick = fermer;

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
