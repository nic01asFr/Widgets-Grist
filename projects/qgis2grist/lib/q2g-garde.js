/**
 * Q2GGarde - garde d'exclusion pour les gestes qui ne doivent pas se chevaucher (import, publication).
 *
 * Module pur (aucun DOM). Un double clic sur « Importer » lancait deux imports concurrents : tables en double
 * (_1, _2), lignes en double, SceneManifest en double. La garde laisse passer un seul appel a la fois ;
 * les suivants sont refuses tant que le premier n'est pas termine (reussi ou en erreur).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Q2GGarde = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * @returns {{
   *   executer: function(function(): *, {surOccupe?: function(), surDebut?: function(), surFin?: function()}=): (Promise<*>|null),
   *   actif: function(): boolean
   * }}
   *   `executer(tache, rappels)` : lance `tache` si rien n'est en cours et rend sa promesse ; sinon appelle `surOccupe` et rend null.
   *   `surDebut` est appele avant la tache, `surFin` apres (succes comme echec, toujours). L'etat est libere meme si la tache leve.
   */
  function creerGardeExclusive() {
    let enCours = false;
    return {
      actif: () => enCours,
      executer(tache, rappels) {
        const r = rappels || {};
        if (enCours) {
          if (typeof r.surOccupe === 'function') { try { r.surOccupe(); } catch (_) { /* rien */ } }
          return null;
        }
        enCours = true;
        if (typeof r.surDebut === 'function') { try { r.surDebut(); } catch (_) { /* rien */ } }
        let promesse;
        try { promesse = Promise.resolve(tache()); } catch (e) { promesse = Promise.reject(e); }
        return promesse.finally(() => {
          enCours = false;
          if (typeof r.surFin === 'function') { try { r.surFin(); } catch (_) { /* rien */ } }
        });
      },
    };
  }

  return { creerGardeExclusive };
});
