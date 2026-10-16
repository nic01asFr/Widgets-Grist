/**
 * Élément web optionnel `<atlas-bi>` : la carte BI d'Atlas dans une page hôte, sans écrire le câblage de l'iframe.
 *
 *     <script type="module" src="https://atlas.example/lib/bi/atlas-bi-element.js"></script>
 *     <atlas-bi src="https://atlas.example/index.html" hote="https://hote.example" style="height:480px"></atlas-bi>
 *
 *     const carte = document.querySelector('atlas-bi');
 *     await carte.setScene(manifeste, donnees);              // chaque commande du contrat est une méthode (promesse)
 *     carte.addEventListener('atlas-bi-select', (e) => e.detail.charge.featureId);
 *
 * Attributs :
 *  - `src`  : adresse d'Atlas (obligatoire). `bi=1`, `navbar=false`, `mode=view` et `hote` y sont ajoutés s'ils manquent ;
 *  - `hote` : origine de la page hôte, déclarée au composant (défaut : l'origine de la page). Elle doit être EXACTE ;
 *  - `ratio-max` : plafond du ratio de pixels de la carte (1 à 4, ajouté à l'adresse comme `ratio=`) ; sur un écran à fort ratio, `1` ou `2` rend la carte
 *    plusieurs fois plus fluide pour une netteté peu différente. Absent : le ratio de l'appareil ;
 *  - `manifeste`, `donnees`, `charte`, `fond` : configuration DÉCLARATIVE, sans code. `manifeste`, `donnees` et `charte` sont l'adresse d'un fichier JSON lu par
 *    votre page (ou un bloc `<script type="application/json" data-atlas="manifeste|donnees|charte">` dans l'élément) ; `fond` vaut `atlas`, `voile`, `uni`,
 *    `plan`, `plan-ign` ou `photo`. Appliqués à la connexion (charte, fond, puis scène) et à chaque changement de l'attribut ; voir `lib/bi/declaratif.js` ;
 *  - `delai`: délai maximal d'une commande, en millisecondes (défaut 10 000) ;
 *  - `delai-connexion` : attente du composant à la connexion, en millisecondes (défaut 30 000 : un démarrage à froid prend 15 à 45 s sur un réseau lent ;
 *    le défaut du client en un fichier, 8 000, est trop court pour cela : passez `delaiConnexion: 30000` à `creerClient`) ;
 *  - `evenements-api` : présent -> reçoit aussi les événements provoqués par vos propres commandes (défaut : gestes de
 *    l'utilisateur seulement, ce qui évite les boucles).
 *
 * Événements (CustomEvent, `detail = { charge, origine, version }`) : `atlas-bi-pret`, `atlas-bi-configure` (la configuration déclarative est appliquée : `detail = { charge: { charte, fond, scene } }`), puis `atlas-bi-<type>` pour chaque
 * événement du composant (`select`, `hover`, `filter`, `camera`, `time`, `edit`, `layer`, `drill`, `error`…).
 * Les commandes attendent la connexion : on peut appeler `setScene` dès que l'élément existe ; si la connexion échoue, elles
 * rejettent avec une `ErreurBi` (propriété `code`) et l'événement `atlas-bi-erreur` est émis.
 */
import { creerClient, transportFenetre, ErreurBi } from './client.js';
import { COMMANDES } from './pont.js';
import { TOUS_LES_EVENEMENTS as EVENEMENTS } from './evenements-ext.js';
import { ATTRIBUTS_DECLARATIFS, lireConfiguration, estVide, appliquerConfiguration } from './declaratif.js';

/** URL de l'iframe : paramètres du mode composant ajoutés sans écraser ceux de l'hôte. Pure, testable. */
export function urlComposant(src, hote, base, ratioMax) {
  const u = new URL(src, base);
  // `javascript:` s'exécuterait dans la page hôte, `data:` / `blob:` / `file:` donnent une origine opaque (« null ») : http(s) seulement
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new ErreurBi('commande', '<atlas-bi> : src doit être une adresse http(s) (reçu ' + u.protocol + ')');
  if (!u.searchParams.has('bi')) u.searchParams.set('bi', '1');
  if (!u.searchParams.has('navbar')) u.searchParams.set('navbar', 'false');
  if (!u.searchParams.has('mode')) u.searchParams.set('mode', 'view');
  if (ratioMax && !u.searchParams.has('ratio')) u.searchParams.set('ratio', String(ratioMax));
  if (hote && !u.searchParams.getAll('hote').includes(hote)) u.searchParams.append('hote', hote);
  return u;
}

const Base = typeof HTMLElement !== 'undefined' ? HTMLElement : class {};

export class AtlasBi extends Base {
  static get observedAttributes() { return ['src', 'hote', 'delai', 'delai-connexion', ...ATTRIBUTS_DECLARATIFS]; }

  constructor() { super(); this._client = null; this._cadre = null; this._pret = null; this._retraits = []; this._generation = 0; this._configure = null; }

  connectedCallback() { this._monter(); }
  disconnectedCallback() { this._demonter(); }
  // À la mise à niveau de l'élément, le navigateur signale d'abord chaque attribut présent, puis `connectedCallback` : ne remonter
  // que ce qui l'est déjà, sinon deux iframes naissent.
  attributeChangedCallback(nom, ancien, nouveau) {
    if (!this._cadre || ancien === nouveau) return;
    // Un attribut déclaratif reconfigure la carte sans remonter l'iframe ; les autres (adresse, hôte, délais) la remontent.
    if (ATTRIBUTS_DECLARATIFS.includes(nom)) { this.reconfigurer().catch(() => {}); return; }
    this._demonter(); this._monter();
  }

  /** Description complète du composant (commandes, événements, limites, exemples, guide), lisible sans iframe ni connexion. Chargée à la demande : ne pèse rien tant qu'on ne la lit pas. Voir `lib/bi/describe.js`. */
  static async decrire() { return (await import('./describe.js')).decrire(); }

  /** Pose (ou retire, avec `null`) la zone utile de la carte : les côtés que l'hôte occupe avec un panneau, en pixels. Persistant : la caméra et les cadrages la respectent. */
  setMarges(marges) { return this.flyTo({ marges }); }

  /** Promesse de la connexion établie (version négociée). */
  get pret() { return this._pret || Promise.reject(new ErreurBi('deconnecte', "l'élément n'est pas dans la page")); }
  get client() { return this._client; }
  /** Promesse de la dernière configuration déclarative appliquée (`{ charte?, fond?, scene? }`), ou `null` si l'élément ne déclare rien. */
  get configure() { return this._configure; }

  /**
   * Relit les attributs et blocs déclaratifs et les applique (charte, fond, scène). Appelée à la connexion et à chaque changement d'un attribut
   * déclaratif ; à appeler soi-même après avoir modifié un bloc `<script data-atlas>`. Un appel plus récent l'emporte sur un appel en cours.
   */
  reconfigurer() {
    const generation = ++this._generation;
    const p = this.pret.then(async () => {
      const lecteur = typeof fetch === 'function' ? (u) => fetch(u, { credentials: 'same-origin' }) : undefined;
      const config = await lireConfiguration(this, { base: typeof location !== 'undefined' ? location.href : undefined, lecteur });
      if (estVide(config)) return null;
      if (generation !== this._generation) return null;   // une configuration plus récente a pris la suite
      const resultat = await appliquerConfiguration((cmd, ...args) => this._client.appeler(cmd, ...args), config);
      if (generation === this._generation) this._emettre('configure', { charge: resultat });
      return resultat;
    });
    p.catch((e) => { if (generation === this._generation) this._emettre('erreur', { erreur: e, etape: e && e.etape }); });
    this._configure = p;
    return p;
  }

  _emettre(type, detail) { this.dispatchEvent(new CustomEvent('atlas-bi-' + type, { detail })); }

  _monter() {
    if (this._cadre) return;
    const src = this.getAttribute('src');
    if (!src) { this._pret = Promise.reject(new ErreurBi('commande', '<atlas-bi> : attribut src manquant')); this._pret.catch(() => {}); return; }
    const hote = this.getAttribute('hote') || (typeof location !== 'undefined' ? location.origin : '');
    if (!hote || hote === 'null') { this._pret = Promise.reject(new ErreurBi('origine', "<atlas-bi> : l'origine de la page est opaque (file://) ; héberger la page ou fournir l'attribut hote")); this._pret.catch(() => {}); return; }
    let url;
    try { url = urlComposant(src, hote, typeof location !== 'undefined' ? location.href : undefined, this.getAttribute('ratio-max')); }
    catch (e) { this._pret = Promise.reject(e instanceof ErreurBi ? e : new ErreurBi('commande', '<atlas-bi> : src illisible')); this._pret.catch(() => {}); return; }
    const cadre = document.createElement('iframe');
    cadre.title = this.getAttribute('title') || 'Carte';
    cadre.setAttribute('allow', 'fullscreen');
    cadre.style.cssText = 'border:0;width:100%;height:100%;display:block';
    this.style.display = this.style.display || 'block';
    this.appendChild(cadre); this._cadre = cadre;
    const delai = Number(this.getAttribute('delai')) || 10000;
    const delaiConnexion = Number(this.getAttribute('delai-connexion')) || 30000;
    const client = creerClient({ delai, delaiConnexion, transport: transportFenetre({ fenetre: window, cadre, origineComposant: url.origin }) });
    this._client = client;
    const tout = this.hasAttribute('evenements-api') ? 'tout' : 'utilisateur';
    for (const type of EVENEMENTS) this._retraits.push(client.on(type, (charge, meta) => this._emettre(type, { charge, ...meta }), { origine: tout }));
    cadre.src = url.href;
    this._pret = client.connecter().then((info) => { this._emettre('pret', info); return info; }, (e) => { this._emettre('erreur', { erreur: e }); throw e; });
    this._pret.catch(() => {});
    this._pret.then(() => this.reconfigurer(), () => {}).catch(() => {});
  }

  _demonter() {
    for (const r of this._retraits) r(); this._retraits = [];
    if (this._client) this._client.deconnecter();
    if (this._cadre) this._cadre.remove();
    this._client = null; this._cadre = null; this._generation++; this._configure = null;
  }
}
// Une méthode par commande du contrat : l'appel attend la connexion.
for (const cmd of Object.keys(COMMANDES)) {
  Object.defineProperty(AtlasBi.prototype, cmd, { value: function (...args) { return this.pret.then(() => this._client.appeler(cmd, ...args)); }, writable: true, configurable: true });
}

if (typeof customElements !== 'undefined' && !customElements.get('atlas-bi')) customElements.define('atlas-bi', AtlasBi);
