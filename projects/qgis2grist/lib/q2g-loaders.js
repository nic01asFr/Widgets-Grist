/**
 * Q2GLoaders - chargeurs de bibliotheques tierces (sql.js, proj4, JSZip).
 *
 * SEUL module navigateur de la famille q2g-* : il injecte des balises <script>
 * (par defaut depuis cdnjs). Chaque chargeur accepte :
 *   - une instance deja chargee/initialisee (Atlas embarque ses copies) ;
 *   - une URL de base ou une URL de script explicite ;
 *   - un document alternatif (tests, iframes).
 * Les resultats sont mis en cache par instance de chargeurs.
 *
 * Usage :
 *   Q2GLoaders.loadSqlJs()                       // comportement historique (cdnjs)
 *   const L = Q2GLoaders.create({
 *     sqlJs: { baseUrl: './vendor/sql.js/' },    // sql-wasm.js + sql-wasm.wasm
 *     proj4: { instance: proj4 },
 *     jszip: { url: './vendor/jszip.min.js' },
 *   });
 *   await L.loadJSZip();
 *
 * Options de create(opts) :
 *   document         document utilise pour injecter les <script> (defaut : global)
 *   sqlJs.instance   module sql.js deja initialise (avec .Database)
 *   sqlJs.initSqlJs  fonction initSqlJs deja disponible
 *   sqlJs.baseUrl    dossier contenant sql-wasm.js et sql-wasm.wasm (avec / final ou non)
 *   proj4.instance   fonction proj4 deja chargee
 *   proj4.url        URL complete de proj4.js
 *   jszip.instance   constructeur JSZip deja charge
 *   jszip.url        URL complete de jszip.min.js
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Q2GLoaders = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const SQLJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/';
  const PROJ4_URL  = 'https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.9.0/proj4.js';
  const JSZIP_URL  = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

  function withSlash(u) { return /\/$/.test(u) ? u : u + '/'; }

  function create(opts) {
    const o = opts || {};
    const sq = o.sqlJs || {};
    const pj = o.proj4 || {};
    const jz = o.jszip || {};
    let _sqlJsModule = null;
    let _proj4 = null;
    let _jszip = null;

    function doc() { return o.document || root.document || null; }

    // Injecte un <script src> ; resout a true au chargement, false en erreur.
    function injectScript(src) {
      return new Promise((resolve) => {
        const d = doc();
        if (!d) { resolve(false); return; }
        const s = d.createElement('script');
        s.src = src;
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        (d.head || d.documentElement).appendChild(s);
      });
    }

    // sql.js : instance fournie > initSqlJs fourni/global > injection du script.
    async function loadSqlJs() {
      if (_sqlJsModule) return _sqlJsModule;
      if (sq.instance) { _sqlJsModule = sq.instance; return _sqlJsModule; }
      const base = withSlash(sq.baseUrl || SQLJS_BASE);
      const init = async (fn) => fn({ locateFile: f => base + f });
      let fn = sq.initSqlJs || (typeof root.initSqlJs !== 'undefined' ? root.initSqlJs : null);
      if (fn) { _sqlJsModule = await init(fn); return _sqlJsModule; }
      const ok = await injectScript(base + 'sql-wasm.js');
      if (!ok) throw new Error('Chargement de sql.js impossible (' + base + 'sql-wasm.js)');
      fn = root.initSqlJs;
      if (typeof fn !== 'function') throw new Error('initSqlJs introuvable apres chargement');
      _sqlJsModule = await init(fn);
      return _sqlJsModule;
    }

    // proj4 : degradation gracieuse (renvoie null si indisponible).
    async function loadProj4() {
      if (_proj4) return _proj4;
      if (pj.instance) { _proj4 = pj.instance; return _proj4; }
      if (typeof root.proj4 !== 'undefined') { _proj4 = root.proj4; return _proj4; }
      const ok = await injectScript(pj.url || PROJ4_URL);
      _proj4 = ok && typeof root.proj4 !== 'undefined' ? root.proj4 : null;
      return _proj4;
    }

    // JSZip : renvoie le constructeur, ou null si indisponible.
    async function loadJSZip() {
      if (_jszip) return _jszip;
      if (jz.instance) { _jszip = jz.instance; return _jszip; }
      if (typeof root.JSZip !== 'undefined') { _jszip = root.JSZip; return _jszip; }
      const ok = await injectScript(jz.url || JSZIP_URL);
      _jszip = ok && typeof root.JSZip !== 'undefined' ? root.JSZip : null;
      return _jszip;
    }

    return { loadSqlJs, loadProj4, loadJSZip };
  }

  const def = create({});
  return Object.assign({ create, SQLJS_BASE, PROJ4_URL, JSZIP_URL }, def);
});
