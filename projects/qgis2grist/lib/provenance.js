/**
 * Provenance import — Source Strate lite (D8) + chaîne minimale (BINDING §7.3).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Q2G = root.Q2G || {};
    Object.assign(root.Q2G, factory());
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PLATFORM_ID = 'widgets-grist-qgis2grist';
  const DEFAULT_CLASSIFICATION = 'internal';
  const DEFAULT_CORPUS = 'qgis-import';

  function currentMillesime(date) {
    return String((date || new Date()).getFullYear());
  }

  /** Entrée Source Strate lite (CADRAGE D8). */
  function buildSourceStrateLite(fileName, opts) {
    opts = opts || {};
    return {
      corpus: opts.corpus || DEFAULT_CORPUS,
      ref_id: opts.ref_id ?? null,
      millesime: opts.millesime || currentMillesime(),
      authority: opts.authority || fileName || 'unknown',
      licence: opts.licence || opts.license || 'unknown',
      statut: opts.statut || 'a_verifier',
    };
  }

  /** Étape de provenance plateforme (BINDING §7.3). */
  function buildProvenanceStep(opts) {
    opts = opts || {};
    return {
      platform_id: opts.platform_id || PLATFORM_ID,
      ingested_at: opts.ingested_at || new Date().toISOString(),
      via: opts.via ?? null,
    };
  }

  /** Bloc source + provenance (BINDING §7.3). */
  function buildSourceInfo(fileName, opts) {
    opts = opts || {};
    const millesime = opts.millesime || currentMillesime();
    return {
      source: {
        referential: opts.referential || 'qgis2grist',
        millesime,
        authority: opts.authority || fileName || 'unknown',
        license: opts.licence || opts.license || 'unknown',
        classification: opts.classification || DEFAULT_CLASSIFICATION,
      },
      provenance: [buildProvenanceStep(opts)],
    };
  }

  /**
   * Provenance complète d'un import qgis2grist.
   * @param {Record<string, object>} importedLayerData
   * @param {string} fileName
   * @param {object} [meta] - meta BigQgisMCP / options
   */
  function buildImportProvenance(importedLayerData, fileName, meta) {
    meta = meta || {};
    const ingestedAt = meta.imported_at || new Date().toISOString();
    const millesime = meta.millesime || currentMillesime();
    const classification = meta.classification || DEFAULT_CLASSIFICATION;
    const authority = meta.title || fileName || 'unknown';

    const sources = [
      buildSourceStrateLite(fileName, {
        authority,
        millesime,
        corpus: meta.corpus,
        ref_id: meta.ref_id,
        licence: meta.licence,
        statut: meta.statut,
      }),
    ];

    for (const [tableName, layer] of Object.entries(importedLayerData || {})) {
      sources.push(buildSourceStrateLite(fileName, {
        authority: (layer.displayName || tableName) + ' ← ' + fileName,
        ref_id: tableName,
        millesime,
      }));
    }

    return {
      sources,
      provenance: [buildProvenanceStep({ ingested_at: ingestedAt })],
      source_info: buildSourceInfo(fileName, {
        authority,
        millesime,
        classification,
        ingested_at: ingestedAt,
      }),
      imported_at: ingestedAt,
      classification,
    };
  }

  /** Texte court pour affichage UI (bandeau source carte). */
  function formatProvenanceLabel(provBundle) {
    if (!provBundle?.sources?.length) return '';
    const s = provBundle.sources[0];
    const parts = [s.authority];
    if (s.millesime) parts.push('millésime ' + s.millesime);
    if (s.statut && s.statut !== 'a_verifier') parts.push(s.statut);
    return parts.join(' · ');
  }

  return {
    PLATFORM_ID,
    DEFAULT_CLASSIFICATION,
    DEFAULT_CORPUS,
    buildSourceStrateLite,
    buildProvenanceStep,
    buildSourceInfo,
    buildImportProvenance,
    formatProvenanceLabel,
  };
});
