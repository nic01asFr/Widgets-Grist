/**
 * Faire croire a Atlas qu'il est dans Grist.
 *
 * Atlas n'utilise que six points d'entree de l'API plugin :
 *
 *     grist.ready(options)
 *     grist.docApi.listTables()
 *     grist.docApi.fetchTable(table)
 *     grist.docApi.applyUserActions(actions)
 *     grist.docApi.getAccessToken(options)
 *     grist.user / grist.userId
 *
 * Il en fournit un septieme, qui n'existe pas dans l'API plugin :
 * `docApi.televerserPieceJointe(fichier)`. Verser une photo depuis un
 * formulaire demande de se presenter, et la facon de le faire n'est pas la
 * meme des deux cotes — le point d'entree est donc ici, ou l'on sait ou l'on
 * tourne, et non dans le moteur de formulaire.
 *
 * Plutot que de reecrire 5 400 lignes pour les faire passer par un client, on
 * pose un objet `grist` de meme forme, adosse au client REST. Atlas demarre
 * alors sans savoir qu'il tourne hors d'un document — et le widget, lui, n'est
 * pas touche : c'est ce qui rend le portage sans risque pour l'existant.
 *
 * Ce que l'adaptateur NE fournit pas, faute d'equivalent hors widget :
 *   - `getAccessToken` : le jeton signe n'est delivre qu'a un widget. Atlas s'en
 *     sert pour lire l'identifiant de l'utilisateur ; hors Grist, l'identite
 *     vient de la cle, et la fonction rend `null` sans lever.
 *   - le rafraichissement pousse par le document. En autonome, on relit.
 */

export const VERSION = '1.0.0';

/**
 * @param {{listTables, fetchTable, applyUserActions}} client — un ClientRest
 * @param {{userId?: number|null, user?: object|null}} [identite]
 * @returns {object} un objet de la forme de l'API plugin
 */
export function adapterEnGrist(client, identite = {}) {
  if (!client) throw new Error('adapterEnGrist : client requis');
  return {
    /**
     * Sans document hote, il n'y a personne a qui annoncer sa disponibilite ni
     * de qui obtenir des droits : `ready` n'a plus qu'a ne rien faire. Elle est
     * conservee parce qu'Atlas l'appelle, et qu'une absence leverait.
     */
    ready() { /* rien a annoncer hors d'un document */ },

    docApi: {
      listTables: () => client.listTables(),
      fetchTable: (table) => client.fetchTable(table),
      applyUserActions: (actions) => client.applyUserActions(actions),
      // Le jeton signe est un service du document hote : hors widget, il n'existe
      // pas. On rend `null` plutot que de lever — l'appelant sait deja le traiter,
      // puisqu'un widget en lecture seule peut se le voir refuser.
      getAccessToken: async () => null,
      /**
       * Verser une piece jointe, en revanche, reste possible : le client sait
       * se presenter avec la cle. Sans ce relais, un formulaire portant une
       * photo echouerait dans l'application — la seule ou l'envoi passe, le
       * navigateur refusant l'en-tete d'authentification au controle prealable.
       */
      televerserPieceJointe: (fichier) => {
        if (typeof client.televerserPieceJointe !== 'function') {
          throw new Error('Envoi de fichier indisponible : client sans pièces jointes');
        }
        return client.televerserPieceJointe(fichier);
      },
    },

    userId: identite.userId ?? null,
    user: identite.user ?? null,

    /** Repere de diagnostic : savoir d'un coup d'oeil qu'on n'est pas dans Grist. */
    _adaptateur: VERSION,
  };
}

/**
 * Installe l'adaptateur dans la portee globale, la ou Atlas ira le chercher.
 *
 * Doit etre appele AVANT le chargement d'`app_v7.js` : la detection de mode a
 * lieu au demarrage, et un adaptateur pose apres coup ne serait jamais vu.
 */
export function installerAdaptateur(client, identite = {}, portee = globalThis) {
  if (portee.grist && portee.grist.docApi && !portee.grist._adaptateur) {
    // Un vrai Grist est deja la : ne jamais le remplacer.
    return portee.grist;
  }
  portee.grist = adapterEnGrist(client, identite);
  return portee.grist;
}
