/**
 * Client de donnees a double mode — la seule piece qui sait ou tourne Atlas.
 *
 * UNE interface, DEUX implementations :
 *   - « grist » : Atlas est un widget dans un document (API plugin, doc vivant)
 *   - « rest »  : Atlas est une application autonome (API REST + cle d'acces)
 *
 * Regle : aucun autre module n'appelle `grist.docApi` en direct. C'est ce qui
 * permet au meme code de servir dans les deux mondes.
 *
 * CORS — mesure sur grist.numerique.gouv.fr, et decisif pour l'enveloppe :
 * l'instance repond `Access-Control-Allow-Headers: Content-Type,
 * X-Requested-With`. L'en-tete `Authorization` n'y figure pas, et c'est le seul
 * moyen de presenter une cle API (`?auth=` attend un jeton signe, pas une cle —
 * verifie : « Broken token » contre « invalid API key »). Depuis un navigateur,
 * une requete authentifiee est donc refusee au controle prealable.
 *
 * Consequence : le mode REST authentifie ne fonctionne QUE hors navigateur —
 * dans l'APK, ou le client HTTP natif de Capacitor emet les requetes. En PWA,
 * il reste la lecture anonyme, qui suffit aux documents partages en lecture
 * (verifie : `/tables`, `/records` et `/sql` repondent 200 sans jeton ; `/apply`
 * repond 403 et `/orgs` renvoie une liste vide).
 */

export const VERSION = '1.0.0';

/**
 * Ou tourne-t-on ?
 *
 * La presence de `grist.docApi` NE SUFFIT PAS, contrairement a ce que fait
 * SURFAC²E : Atlas charge `grist-plugin-api.js` depuis son HTML, et ce script
 * installe `window.grist` meme hors de tout document. Verifie en ouvrant Atlas
 * dans un onglet — l'objet est la, et ses appels echouent ensuite en
 * « RPC_UNKNOWN_FORWARD_DEST ». S'y fier ferait croire a un widget partout.
 *
 * Le second critere est l'encadrement : un widget vit TOUJOURS dans une iframe,
 * une application ouverte seule n'en a jamais. La comparaison ne lit aucune
 * propriete de la fenetre parente, donc elle ne bute pas sur l'isolation
 * d'origine ; si elle echouait tout de meme, on se sait encadre.
 */
export function detecterMode(portee = globalThis) {
  // Une page de presentation encadre aussi le widget, et le widget n'a aucun
  // moyen de la distinguer d'un document : meme iframe, meme script de plugin
  // charge. Sans ce parametre, l'apercu de la vitrine partirait interroger un
  // document qui n'existe pas.
  if (estVitrine(portee)) return 'rest';
  const g = portee?.grist;
  if (!g || !g.docApi) return 'rest';
  return estEncadre(portee) ? 'grist' : 'rest';
}

/** La page qui nous encadre est-elle une vitrine, et non un document ? */
export function estVitrine(portee = globalThis) {
  try {
    return new URLSearchParams(portee.location?.search || '').get('vitrine') === '1';
  } catch (_) { return false; }
}

/** Sommes-nous dans une iframe ? En cas de doute, oui. */
export function estEncadre(portee = globalThis) {
  try {
    if (portee.self === undefined || portee.top === undefined) return false;
    return portee.self !== portee.top;
  } catch (_) { return true; }
}

/**
 * L'en-tete `Authorization` peut-il partir d'ici ?
 *
 * Vrai seulement quand les requetes ne passent pas par le moteur web : APK
 * Capacitor avec `CapacitorHttp` actif, qui remplace `fetch` par le client
 * natif. Sans ce drapeau, un `fetch()` dans la WebView reste soumis a CORS —
 * c'est le piege de l'empaquetage.
 */
export function peutSAuthentifier(portee = globalThis) {
  const cap = portee?.Capacitor;
  if (!cap) return false;
  if (typeof cap.isNativePlatform === 'function') return cap.isNativePlatform();
  return !!cap.isNative;
}

/** Capacites du mode courant, pour que l'interface n'offre pas l'impossible. */
export function capacites(portee = globalThis) {
  const mode = detecterMode(portee);
  const vitrine = estVitrine(portee);
  if (mode === 'grist') {
    return { mode, vitrine, lecture: true, ecriture: true, decouverte: false, raison: null };
  }
  if (peutSAuthentifier(portee)) {
    return { mode, vitrine, lecture: true, ecriture: true, decouverte: true, raison: null };
  }
  return {
    mode, vitrine, lecture: true, ecriture: false, decouverte: false,
    raison: "Sans application installée, l'instance refuse les requêtes signées : "
          + 'seules les scènes partagées en lecture sont accessibles.',
  };
}

/* ------------------------------------------------------------------ */
/* Pieces jointes — un seul POST, deux facons de s'y presenter         */
/* ------------------------------------------------------------------ */

/**
 * Verse un fichier dans les pieces jointes d'un document. Rend les ids obtenus.
 *
 * La requete n'emporte AUCUN en-tete ajoute : ni `Content-Type` (le corps est
 * un `FormData`, le navigateur pose lui-meme la frontiere de lot), ni
 * `X-Requested-With`. C'est ce qui la garde « simple » au sens du navigateur,
 * donc sans controle prealable — le seul chemin praticable depuis l'origine
 * d'un widget, ou l'instance ne repond pas au preflight qu'un en-tete
 * declencherait.
 *
 * @param {string} url      adresse complete du point `/attachments`
 * @param {File|Blob} fichier
 * @param {{entetes?: object, fetch?: Function}} [o]
 */
export async function posterPieceJointe(url, fichier, o = {}) {
  const f = o.fetch || ((...a) => globalThis.fetch(...a));
  const corps = new FormData();
  corps.append('upload', fichier, fichier.name || 'fichier');
  let r;
  try {
    r = await f(url, { method: 'POST', body: corps, headers: o.entetes || undefined });
  } catch (e) {
    // Une requete bloquee par la regle d'origine ne rend pas de reponse : le
    // navigateur leve un `TypeError` sans rien dire de plus. « Failed to
    // fetch », affiche tel quel sous le bouton, envoie chercher une panne de
    // reseau alors que le reseau va bien. On nomme la cause, et ce qui marche.
    if (e instanceof TypeError) {
      throw new Error(o.natif
        ? 'Envoi impossible : le document est injoignable (réseau ou adresse).'
        : "Envoi refusé par la règle d'origine du navigateur. Depuis l'application "
          + 'de terrain, qui émet hors du navigateur, la photo passe.');
    }
    throw e;
  }
  if (!r.ok) {
    const texte = await r.text().catch(() => '');
    throw new Error(`HTTP ${r.status}${texte ? ' — ' + texte.slice(0, 160) : ''}`);
  }
  const rendu = await r.json();
  return Array.isArray(rendu) ? rendu : [rendu];
}

/**
 * Verse un fichier, quel que soit l'endroit d'ou Atlas tourne.
 *
 * Deux presentations, parce qu'il n'y a pas d'identite commune : dans un
 * widget, un jeton signe delivre par le document hote ; dans l'application, la
 * cle d'API en en-tete — ce qu'aucun navigateur ne laisse passer, et que le
 * client HTTP natif de Capacitor emet sans s'en soucier.
 *
 * @param {object} docApi  `grist.docApi`, reel ou adapte
 * @param {File|Blob} fichier
 * @returns {Promise<number[]>} les ids de pieces jointes
 */
export async function televerserPieceJointe(docApi, fichier) {
  if (!fichier) throw new Error('Aucun fichier à envoyer');
  // L'adaptateur de l'application sait se presenter : on le laisse faire.
  if (typeof docApi?.televerserPieceJointe === 'function') {
    return docApi.televerserPieceJointe(fichier);
  }
  if (typeof docApi?.getAccessToken !== 'function') {
    throw new Error("Envoi de fichier indisponible : pas d'accès au document");
  }
  const jeton = await docApi.getAccessToken({ readOnly: false });
  if (!jeton?.baseUrl || !jeton?.token) {
    throw new Error('Envoi de fichier refusé : jeton de document indisponible');
  }
  return posterPieceJointe(
    `${jeton.baseUrl}/attachments?auth=${encodeURIComponent(jeton.token)}`,
    fichier,
  );
}

/* ------------------------------------------------------------------ */
/* Mode widget — l'API plugin fait tout                                */
/* ------------------------------------------------------------------ */

class ClientGrist {
  constructor(portee = globalThis) { this.mode = 'grist'; this._g = portee.grist; }
  async init() { return this; }
  get docApi() { return this._g.docApi; }
  listTables() { return this._g.docApi.listTables(); }
  fetchTable(table) { return this._g.docApi.fetchTable(table); }
  applyUserActions(actions) { return this._g.docApi.applyUserActions(actions); }
  televerserPieceJointe(fichier) { return televerserPieceJointe(this._g.docApi, fichier); }
}

/* ------------------------------------------------------------------ */
/* Mode autonome — API REST                                            */
/* ------------------------------------------------------------------ */

class ClientRest {
  /**
   * @param {{baseUrl: string, docId: string, jeton?: string, fetch?: Function}} o
   */
  constructor(o = {}) {
    this.mode = 'rest';
    this.baseUrl = String(o.baseUrl || '').replace(/\/+$/, '');
    this.docId = o.docId || '';
    this.jeton = o.jeton || '';
    this._fetch = o.fetch || ((...a) => globalThis.fetch(...a));
  }

  async init() { return this; }

  _entetes() {
    const h = { 'Content-Type': 'application/json' };
    // Sans jeton, la requete reste « simple » et passe partout ; avec, elle
    // n'aboutit que la ou aucun controle prealable ne s'applique.
    if (this.jeton) h.Authorization = 'Bearer ' + this.jeton;
    return h;
  }

  _url(chemin) { return `${this.baseUrl}/api/docs/${this.docId}${chemin}`; }

  async _json(url, options) {
    const r = await this._fetch(url, options);
    if (!r.ok) {
      const corps = await r.text().catch(() => '');
      throw new Error(`HTTP ${r.status}${corps ? ' — ' + corps.slice(0, 160) : ''}`);
    }
    return r.json();
  }

  async listTables() {
    const d = await this._json(this._url('/tables'), { headers: this._entetes() });
    return (d.tables || []).map((t) => t.id);
  }

  /**
   * Rend les donnees au format colonnaire de l'API plugin — `{id: [], col: []}` —
   * et non la liste d'enregistrements que rend l'API REST. Sans cette
   * conversion, tout le code de lecture d'Atlas serait a doubler.
   *
   * > **Les tables de metadonnees ne passent pas par la meme porte.**
   * > `_grist_Tables` et `_grist_Tables_column` decrivent le document ; l'API
   * > plugin les sert comme n'importe quelle table, l'API REST **non** — son
   * > point `/records` ne connait que les tables de l'utilisateur. Sans ce
   * > detour, `chargerSchema` rend un schema VIDE dans l'application : plus de
   * > formulaire deduit (« Attributs »), plus de formulaire lie, et la fiche
   * > d'un objet parait n'en proposer aucun. Rien ne le signale — c'est une
   * > lecture qui echoue, pas une fonction absente.
   * >
   * > Le point `/sql`, lui, les sert. Il ne sait que lire, ce qui suffit :
   * > Atlas ne modifie jamais ces tables.
   */
  async fetchTable(table) {
    if (String(table).startsWith('_grist_')) return this._fetchMeta(table);
    const d = await this._json(
      `${this.baseUrl}/api/docs/${this.docId}/tables/${encodeURIComponent(table)}/records`,
      { headers: this._entetes() },
    );
    return recordsVersColonnes(d.records || []);
  }

  /** Une table de metadonnees, lue en SQL puis rendue au format colonnaire. */
  async _fetchMeta(table) {
    // Le nom vient d'une constante du code, jamais d'une saisie ; la garde est
    // la pour que cela reste vrai si un appelant change un jour.
    if (!/^_grist_[A-Za-z0-9_]+$/.test(table)) throw new Error(`Table système inattendue : ${table}`);
    const d = await this._json(
      `${this.baseUrl}/api/docs/${this.docId}/sql?q=${encodeURIComponent(`select * from ${table}`)}`,
      { headers: this._entetes() },
    );
    // `select *` rend `id` parmi les champs, alors que le format colonnaire le
    // porte a part : le laisser la remplirait la colonne deux fois.
    const lignes = (d.records || []).map((r) => {
      const { id, ...champs } = r.fields || {};
      return { id, fields: champs };
    });
    return recordsVersColonnes(lignes);
  }

  async applyUserActions(actions) {
    return this._json(this._url('/apply'), {
      method: 'POST', headers: this._entetes(), body: JSON.stringify(actions),
    });
  }

  /**
   * Verse un fichier dans les pieces jointes du document.
   *
   * Seule la cle porte l'identite ici — il n'y a pas de jeton signe hors
   * widget. L'en-tete `Authorization` ne franchit pas un moteur web ; cette
   * requete n'aboutit donc que dans l'application, ou elle part du client HTTP
   * natif. Sans cle, l'instance refuse : on le dit avant d'essayer, plutot que
   * de laisser l'echec ressembler a une panne de reseau.
   *
   * `Content-Type` est volontairement absent : le corps est un `FormData`.
   */
  async televerserPieceJointe(fichier) {
    if (!fichier) throw new Error('Aucun fichier à envoyer');
    if (!this.jeton) {
      throw new Error("Envoi de fichier impossible sans clé d'accès au document");
    }
    return posterPieceJointe(this._url('/attachments'), fichier, {
      entetes: { Authorization: 'Bearer ' + this.jeton },
      fetch: this._fetch,
      // Hors navigateur, un echec n'est pas une regle d'origine : c'est le
      // reseau ou l'adresse. Le message doit le dire, sinon on cherche une
      // cause qui n'existe pas ici.
      natif: true,
    });
  }
}

/**
 * `[{id, fields}]` → `{id: [...], colonne: [...]}`.
 *
 * Les colonnes sont l'union de tous les enregistrements : une valeur absente
 * devient `null` plutot que de decaler la colonne, sinon les lignes ne
 * correspondraient plus entre elles.
 */
export function recordsVersColonnes(records) {
  const out = { id: [] };
  const champs = new Set();
  for (const r of records) for (const k of Object.keys(r.fields || {})) champs.add(k);
  for (const c of champs) out[c] = [];
  for (const r of records) {
    out.id.push(r.id);
    for (const c of champs) out[c].push(r.fields?.[c] ?? null);
  }
  return out;
}

/**
 * @param {{mode?: 'grist'|'rest', baseUrl?, docId?, jeton?, portee?, fetch?}} o
 */
export async function creerClient(o = {}) {
  const portee = o.portee || globalThis;
  const mode = o.mode || detecterMode(portee);
  const client = (mode === 'grist') ? new ClientGrist(portee) : new ClientRest(o);
  await client.init();
  client.version = VERSION;
  return client;
}

export { ClientGrist, ClientRest };
