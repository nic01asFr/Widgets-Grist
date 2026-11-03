/**
 * Un validateur JSON Schema juste assez complet.
 *
 * Le dépôt tient à n'avoir aucune dépendance de build, et on n'utilise qu'une
 * part réduite de draft-07 : type, required, enum, const, properties, items,
 * oneOf, $ref local, bornes numériques.
 *
 * Il vit à part parce qu'il sert au-delà des tests — éprouver une scène reçue
 * d'un producteur tiers, par exemple, sans exécuter la suite de tests.
 *
 * Usage :
 *   const { valider } = require('./valider-schema.js');
 *   const ecarts = valider(donnee, schema, schema);   // [] = conforme
 *
 * En ligne de commande :
 *   node scripts/valider-schema.js <schema.json> <donnee.json>
 */

function resoudre(ref, racine) {
  if (!ref.startsWith('#/')) throw new Error('référence externe non gérée : ' + ref);
  return ref.slice(2).split('/').reduce((o, k) => o && o[k], racine);
}

const typeDe = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/** Retourne la liste des écarts. Vide = conforme. */
function valider(valeur, schema, racine, chemin = '') {
  if (!schema || schema === true) return [];
  const ecarts = [];
  const ou = (m) => ecarts.push(`${chemin || '(racine)'} : ${m}`);

  if (schema.$ref) return valider(valeur, resoudre(schema.$ref, racine), racine, chemin);

  if (schema.const !== undefined && valeur !== schema.const) {
    ou(`attendu ${JSON.stringify(schema.const)}, reçu ${JSON.stringify(valeur)}`);
  }

  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(valeur))) {
    ou(`valeur hors énumération : ${JSON.stringify(valeur)}`);
  }

  if (schema.type) {
    const attendus = [].concat(schema.type);
    const t = typeDe(valeur);
    // Un entier est un nombre ; l'inverse n'est vrai que s'il n'a pas de décimale.
    const ok = attendus.some((a) => a === t
      || (a === 'integer' && t === 'number' && Number.isInteger(valeur))
      || (a === 'number' && t === 'number'));
    if (!ok) ou(`type ${t}, attendu ${attendus.join(' ou ')}`);
  }

  if (schema.oneOf) {
    const passants = schema.oneOf.filter((s) => valider(valeur, s, racine, chemin).length === 0);
    if (passants.length !== 1) {
      ou(`oneOf : ${passants.length} branche(s) satisfaite(s), une seule attendue`);
    }
  }

  if (typeDe(valeur) === 'object') {
    for (const requis of schema.required || []) {
      if (!(requis in valeur)) ou(`propriété requise absente : ${requis}`);
    }
    for (const [cle, sousSchema] of Object.entries(schema.properties || {})) {
      if (cle in valeur) {
        ecarts.push(...valider(valeur[cle], sousSchema, racine, chemin ? `${chemin}.${cle}` : cle));
      }
    }
    if (schema.additionalProperties === false) {
      for (const cle of Object.keys(valeur)) {
        if (!(schema.properties || {})[cle]) ou(`propriété non déclarée : ${cle}`);
      }
    }
  }

  if (typeDe(valeur) === 'array' && schema.items) {
    valeur.forEach((v, i) => {
      ecarts.push(...valider(v, schema.items, racine, `${chemin}[${i}]`));
    });
    if (schema.minItems != null && valeur.length < schema.minItems) ou('trop peu d’éléments');
    if (schema.maxItems != null && valeur.length > schema.maxItems) ou('trop d’éléments');
  }

  if (typeDe(valeur) === 'number') {
    if (schema.minimum != null && valeur < schema.minimum) ou(`${valeur} < ${schema.minimum}`);
    if (schema.maximum != null && valeur > schema.maximum) ou(`${valeur} > ${schema.maximum}`);
  }

  return ecarts;
}

// Servi aussi au navigateur (page WebMCP de Form Builder) : sans `module`, il s'expose en `ValiderSchema`.
if (typeof module === 'object' && module.exports) module.exports = { valider };
else (typeof self !== 'undefined' ? self : this).ValiderSchema = { valider };

if (typeof require !== 'undefined' && typeof module === 'object' && require.main === module) {
  const fs = require('fs');
  const [schemaPath, donneePath] = process.argv.slice(2);
  if (!schemaPath || !donneePath) {
    console.error('Usage : node scripts/valider-schema.js <schema.json> <donnee.json>');
    process.exit(1);
  }
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  let donnee = JSON.parse(fs.readFileSync(donneePath, 'utf8'));
  donnee = donnee.scene || donnee.manifest || donnee;
  const ecarts = valider(donnee, schema, schema);
  if (!ecarts.length) {
    console.log('conforme — aucun écart');
  } else {
    console.log(`${ecarts.length} écart(s) :`);
    for (const e of ecarts) console.log('  ' + e);
    process.exit(1);
  }
}
