/**
 * Le client de pg-gateway : appeler une commande, lire l'erreur qui revient.
 *
 * Module pur : `fetch` et l'accès (jeton) sont injectés.
 *
 * Une panne réseau et un refus CORS sont indiscernables depuis un navigateur : le message cite les deux (échec silencieux n°2,
 * « une adresse morte »). Toute erreur de la passerelle porte `cote` (requete, base, serveur, modele) : on le dit à la personne,
 * pour qu'elle sache où chercher.
 */

export const COTES = Object.freeze({
  requete: 'votre demande', base: 'la base de données', serveur: 'la passerelle', modele: 'le modèle de langue',
});

/** Une erreur de passerelle, lisible : le message, de quel côté elle vient, le code pour les tests. */
export class ErreurPasserelle extends Error {
  constructor(message, { code = 'passerelle', cote = null, statut = null } = {}) {
    super(message);
    this.name = 'ErreurPasserelle';
    this.code = code;
    this.cote = cote;
    this.statut = statut;
  }
}

/** « message (côté la base de données) » : le texte montré à la personne. */
export function texteErreur(e) {
  if (!e) return 'Erreur inconnue.';
  const cote = e.cote && COTES[e.cote] ? ` (côté ${COTES[e.cote]})` : '';
  return `${e.message || String(e)}${cote}`;
}

/**
 * @param {object} o
 * @param {string} o.url  l'adresse de la passerelle, sans « /v1 »
 * @param {{entetes: (url:string)=>object, apres401: (url:string, avaitEntete:boolean)=>Promise<boolean>}} o.acces
 * @param {typeof fetch} [o.fetchImpl]
 */
export function creerClientPg({ url, acces, fetchImpl = (...a) => fetch(...a) }) {
  const base = String(url || '').replace(/\/+$/, '');

  async function envoyer(methode, chemin, corps) {
    if (!base) throw new ErreurPasserelle('L’adresse de la passerelle n’est pas renseignée.', { code: 'url_absente', cote: 'requete' });
    const adresse = base + chemin;
    for (let essai = 0; ; essai++) {
      const entetes = acces.entetes(adresse);
      let rep;
      try {
        rep = await fetchImpl(adresse, {
          method: methode,
          credentials: 'omit',
          headers: { ...(corps !== undefined ? { 'Content-Type': 'application/json' } : {}), ...entetes },
          ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}),
        });
      } catch (e) {
        throw new ErreurPasserelle(
          'Passerelle injoignable : réseau, adresse erronée, ou origine de ce document absente de CORS_ORIGINES.',
          { code: 'injoignable', cote: 'serveur' },
        );
      }
      if (rep.status === 401 && essai === 0 && await acces.apres401(adresse, 'Authorization' in entetes)) continue;
      let donnees;
      try { donnees = await rep.json(); } catch {
        throw new ErreurPasserelle(`Réponse illisible de la passerelle (HTTP ${rep.status}).`, { code: 'illisible', cote: 'serveur', statut: rep.status });
      }
      if (!rep.ok) {
        const e = donnees && donnees.erreur;
        throw new ErreurPasserelle(
          (e && e.message) || `La passerelle a répondu HTTP ${rep.status}.`,
          { code: (e && e.code) || 'http_' + rep.status, cote: (e && e.cote) || null, statut: rep.status },
        );
      }
      return donnees;
    }
  }

  const commande = (nom, corps = {}) => envoyer('POST', '/v1/' + nom, corps);

  return {
    commande,
    connexions: () => commande('pg_gateway_connexions'),
    schema: (connexion, rafraichir = false) => commande('pg_gateway_schema', { connexion, ...(rafraichir ? { rafraichir: true } : {}) }),
    /** @param {{connexion:string, schema:string, table:string, bbox?:number[], limite?:number}} e */
    couche: (e) => commande('pg_gateway_couche', e),
  };
}

/** La zone visible d'une carte MapLibre, en [ouest, sud, est, nord] bornés au monde. */
export function bboxDepuisBornes(bornes) {
  const ouest = Math.max(-180, bornes.getWest());
  const est = Math.min(180, bornes.getEast());
  const sud = Math.max(-90, bornes.getSouth());
  const nord = Math.min(90, bornes.getNorth());
  return [ouest, sud, est, nord].map((v) => Math.round(v * 1e6) / 1e6);
}
