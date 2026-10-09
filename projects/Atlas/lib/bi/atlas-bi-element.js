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
 *  - `delai`: délai maximal d'une commande, en millisecondes (défaut 10 000) ;
 *  - `evenements-api` : présent -> reçoit aussi les événements provoqués par vos propres commandes (défaut : gestes de
 *    l'utilisateur seulement, ce qui évite les boucles).
 *
 * Événements (CustomEvent, `detail = { charge, origine, version }`) : `atlas-bi-pret`, puis `atlas-bi-<type>` pour chaque
 * événement du composant (`select`, `hover`, `filter`, `camera`, `time`, `edit`, `layer`, `drill`, `error`…).
 * Les commandes attendent la connexion : on peut appeler `setScene` dès que l'élément existe ; si la connexion échoue, elles
 * rejettent avec une `ErreurBi` (propriété `code`) et l'événement `atlas-bi-erreur` est émis.
 */
import { creerClient, transportFenetre, ErreurBi } from './client.js';
import { COMMANDES, EVENEMENTS } from './pont.js';

/** URL de l'iframe : paramètres du mode composant ajoutés sans écraser ceux de l'hôte. Pure, testable. */
export function urlComposant(src, hote, base) {
  const u = new URL(src, base);
  // `javascript:` s'exécuterait dans la page hôte, `data:` / `blob:` / `file:` donnent une origine opaque (« null ») : http(s) seulement
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new ErreurBi('commande', '<atlas-bi> : src doit être une adresse http(s) (reçu ' + u.protocol + ')');
  if (!u.searchParams.has('bi')) u.searchParams.set('bi', '1');
  if (!u.searchParams.has('navbar')) u.searchParams.set('navbar', 'false');
  if (!u.searchParams.has('mode')) u.searchParams.set('mode', 'view');
  if (hote && !u.searchParams.getAll('hote').includes(hote)) u.searchParams.append('hote', hote);
  return u;
}

const Base = typeof HTMLElement !== 'undefined' ? HTMLElement : class {};

export class AtlasBi extends Base {
  static get observedAttributes() { return ['src', 'hote', 'delai']; }

  constructor() { super(); this._client = null; this._cadre = null; this._pret = null; this._retraits = []; }

  connectedCallback() { this._monter(); }
  disconnectedCallback() { this._demonter(); }
  // À la mise à niveau de l'élément, le navigateur signale d'abord chaque attribut présent, puis `connectedCallback` : ne remonter
  // que ce qui l'est déjà, sinon deux iframes naissent.
  attributeChangedCallback(nom, ancien, nouveau) { if (this._cadre && ancien !== nouveau) { this._demonter(); this._monter(); } }

  /** Promesse de la connexion établie (version négociée). */
  get pret() { return this._pret || Promise.reject(new ErreurBi('deconnecte', "l'élément n'est pas dans la page")); }
  get client() { return this._client; }

  _emettre(type, detail) { this.dispatchEvent(new CustomEvent('atlas-bi-' + type, { detail })); }

  _monter() {
    if (this._cadre) return;
    const src = this.getAttribute('src');
    if (!src) { this._pret = Promise.reject(new ErreurBi('commande', '<atlas-bi> : attribut src manquant')); this._pret.catch(() => {}); return; }
    const hote = this.getAttribute('hote') || (typeof location !== 'undefined' ? location.origin : '');
    if (!hote || hote === 'null') { this._pret = Promise.reject(new ErreurBi('origine', "<atlas-bi> : l'origine de la page est opaque (file://) ; héberger la page ou fournir l'attribut hote")); this._pret.catch(() => {}); return; }
    let url;
    try { url = urlComposant(src, hote, typeof location !== 'undefined' ? location.href : undefined); }
    catch (e) { this._pret = Promise.reject(e instanceof ErreurBi ? e : new ErreurBi('commande', '<atlas-bi> : src illisible')); this._pret.catch(() => {}); return; }
    const cadre = document.createElement('iframe');
    cadre.title = this.getAttribute('title') || 'Carte';
    cadre.setAttribute('allow', 'fullscreen');
    cadre.style.cssText = 'border:0;width:100%;height:100%;display:block';
    this.style.display = this.style.display || 'block';
    this.appendChild(cadre); this._cadre = cadre;
    const delai = Number(this.getAttribute('delai')) || 10000;
    const client = creerClient({ delai, transport: transportFenetre({ fenetre: window, cadre, origineComposant: url.origin }) });
    this._client = client;
    const tout = this.hasAttribute('evenements-api') ? 'tout' : 'utilisateur';
    for (const type of EVENEMENTS) this._retraits.push(client.on(type, (charge, meta) => this._emettre(type, { charge, ...meta }), { origine: tout }));
    cadre.src = url.href;
    this._pret = client.connecter().then((info) => { this._emettre('pret', info); return info; }, (e) => { this._emettre('erreur', { erreur: e }); throw e; });
    this._pret.catch(() => {});
  }

  _demonter() {
    for (const r of this._retraits) r(); this._retraits = [];
    if (this._client) this._client.deconnecter();
    if (this._cadre) this._cadre.remove();
    this._client = null; this._cadre = null;
  }
}
// Une méthode par commande du contrat : l'appel attend la connexion.
for (const cmd of Object.keys(COMMANDES)) {
  Object.defineProperty(AtlasBi.prototype, cmd, { value: function (...args) { return this.pret.then(() => this._client.appeler(cmd, ...args)); }, writable: true, configurable: true });
}

if (typeof customElements !== 'undefined' && !customElements.get('atlas-bi')) customElements.define('atlas-bi', AtlasBi);
