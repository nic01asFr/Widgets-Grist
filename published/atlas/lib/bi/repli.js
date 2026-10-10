/**
 * Repli hors ligne : détection de la perte de réseau (logique pure) et règles de repli.
 *
 * Hors ligne, seul le fond uni (et les jeux embarqués : pays, régions, départements) fonctionne. Les fonds « Atlas », « plan »,
 * « plan IGN » et « photographie » lisent des tuiles distantes ; les communes viennent du service des contours.
 */
export const VERSION = '1.0.0';
export const FONDS_HORS_LIGNE = Object.freeze(['uni']);
export const NIVEAUX_HORS_LIGNE = Object.freeze(['pays', 'region', 'departement']);

/**
 * Surveille les échecs de chargement de tuiles : `seuil` échecs dans une fenêtre de `fenetreMs` déclenchent le repli.
 * Un succès efface la série (une panne isolée d'une tuile n'est pas une perte de réseau).
 */
export function creerSurveillance({ seuil = 4, fenetreMs = 8000, maintenant = () => Date.now() } = {}) {
  let echecs = [];
  return {
    echec() { const t = maintenant(); echecs = echecs.filter((x) => t - x <= fenetreMs); echecs.push(t); return echecs.length >= seuil; },
    succes() { echecs = []; },
    compte: () => echecs.length,
  };
}
/** Fond à utiliser selon l'état de connexion : le fond demandé s'il est utilisable hors ligne, sinon « uni ». */
export function fondPourConnexion(fondDemande, horsLigne) { return horsLigne && !FONDS_HORS_LIGNE.includes(fondDemande) ? 'uni' : fondDemande; }
/** Un niveau administratif est-il disponible sans réseau ? */
export const niveauHorsLigne = (niveau) => NIVEAUX_HORS_LIGNE.includes(niveau);
