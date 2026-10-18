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
/**
 * Un événement `error` de MapLibre est-il un échec de TUILE qui dit quelque chose du réseau ? Une police de caractères (glyphes) qui répond 502 ou 404 fait
 * échouer toutes les tuiles qui en ont besoin (MapLibre 5.6.1 : l'événement porte alors `sourceId` et `tile`, comme une vraie panne de tuile), sans que
 * le réseau soit perdu : ce n'est pas une raison de passer hors ligne. Mesuré le 18/10/2026 avec un serveur de polices qui répond 502.
 */
export function estEchecDeTuile(ev) {
  if (!ev || !ev.sourceId || !ev.tile) return false;
  const e = ev.error || {};
  const texte = String(e.url || '') + ' ' + String(e.message || '');
  return !/\/fonts\/|glyph/i.test(texte);
}
/** Fond à utiliser selon l'état de connexion : le fond demandé s'il est utilisable hors ligne, sinon « uni ». */
export function fondPourConnexion(fondDemande, horsLigne) { return horsLigne && !FONDS_HORS_LIGNE.includes(fondDemande) ? 'uni' : fondDemande; }
/** Un niveau administratif est-il disponible sans réseau ? */
export const niveauHorsLigne = (niveau) => NIVEAUX_HORS_LIGNE.includes(niveau);
