// Validateur JSON Schema minimal pour les tests (aucune dépendance) : le sous-ensemble employé par lib/charte/charte.schema.json.
// type, enum, const, pattern, minLength, maxLength, minimum, maximum, minItems, maxItems, maxProperties, properties, additionalProperties,
// required, items, propertyNames, anyOf, not, $ref local (« #/$defs/nom »).

const typeDe = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : Number.isInteger(v) ? 'integer' : typeof v);

/** @returns {string[]} les erreurs, avec le chemin de la valeur fautive ; vide si la valeur est valide */
export function validerSchema(schema, valeur, racine = schema, chemin = '$') {
  const err = [];
  const s = schema.$ref ? resoudre(racine, schema.$ref) : schema;
  const t = typeDe(valeur);
  if (s.type) {
    const ok = s.type === 'number' ? (t === 'number' || t === 'integer') : s.type === t;
    if (!ok) return [`${chemin} : type ${t} au lieu de ${s.type}`];
  }
  if ('const' in s && valeur !== s.const) err.push(`${chemin} : valeur ${JSON.stringify(valeur)} différente de ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.includes(valeur)) err.push(`${chemin} : ${JSON.stringify(valeur)} hors de la liste`);
  if (s.not && validerSchema(s.not, valeur, racine, chemin).length === 0) err.push(`${chemin} : valeur interdite`);
  if (s.anyOf && !s.anyOf.some((x) => validerSchema(x, valeur, racine, chemin).length === 0)) err.push(`${chemin} : aucune alternative ne convient`);
  if (typeof valeur === 'string') {
    if (s.pattern && !new RegExp(s.pattern).test(valeur)) err.push(`${chemin} : ne correspond pas au motif`);
    if (s.minLength !== undefined && valeur.length < s.minLength) err.push(`${chemin} : trop courte`);
    if (s.maxLength !== undefined && valeur.length > s.maxLength) err.push(`${chemin} : trop longue`);
  }
  if (typeof valeur === 'number') {
    if (s.minimum !== undefined && valeur < s.minimum) err.push(`${chemin} : sous le minimum`);
    if (s.maximum !== undefined && valeur > s.maximum) err.push(`${chemin} : au-dessus du maximum`);
  }
  if (Array.isArray(valeur)) {
    if (s.minItems !== undefined && valeur.length < s.minItems) err.push(`${chemin} : trop peu d'éléments`);
    if (s.maxItems !== undefined && valeur.length > s.maxItems) err.push(`${chemin} : trop d'éléments`);
    if (s.items) valeur.forEach((x, i) => err.push(...validerSchema(s.items, x, racine, `${chemin}[${i}]`)));
  }
  if (t === 'object') {
    const cles = Object.keys(valeur);
    if (s.maxProperties !== undefined && cles.length > s.maxProperties) err.push(`${chemin} : trop de propriétés`);
    for (const r of s.required || []) if (!(r in valeur)) err.push(`${chemin} : propriété ${r} manquante`);
    if (s.propertyNames) for (const k of cles) err.push(...validerSchema(s.propertyNames, k, racine, `${chemin}<${k}>`));
    for (const k of cles) {
      const sous = s.properties && s.properties[k];
      if (sous) err.push(...validerSchema(sous, valeur[k], racine, `${chemin}.${k}`));
      else if (s.additionalProperties === false) err.push(`${chemin} : propriété ${k} inconnue`);
      else if (s.additionalProperties && typeof s.additionalProperties === 'object') err.push(...validerSchema(s.additionalProperties, valeur[k], racine, `${chemin}.${k}`));
    }
  }
  return err;
}

function resoudre(racine, ref) {
  if (!ref.startsWith('#/')) throw new Error('référence non locale : ' + ref);
  return ref.slice(2).split('/').reduce((x, k) => x[k], racine);
}
