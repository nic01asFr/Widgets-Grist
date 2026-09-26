/**
 * Le sous-ensemble d'expressions MapLibre qu'Atlas produit — évalué ici.
 *
 * Écrit plutôt que de tirer MapLibre en dépendance de test : le dépôt n'en a
 * aucune, et l'enjeu n'est pas de réimplémenter le moteur mais de vérifier
 * qu'une entité tombe du bon côté. Les règles reproduites sont celles de la
 * spécification :
 *
 * - `coalesce` rend la première valeur **non nulle** ;
 * - `to-number` essaie chaque argument jusqu'à une conversion réussie : `null`
 *   vaut 0, le reste passe par `Number()` — donc `''` vaut **0** et « 3,5 »
 *   échoue. L'évaluateur refusait `''` : il ne classait pas comme MapLibre, et
 *   l'écart des deux filtres sur `''` passait inaperçu (D4 du 24/09/2026) ;
 * - `==`, `!=`, `<`… à deux arguments dont aucun n'est une expression, et `in`
 *   dont la clé est un texte sans tableau à côté, sont la forme **historique**
 *   des filtres (`["==", clé, valeur]`). MapLibre les lit comme telle et refuse
 *   `["==", 1, 0]` (« string expected, number found ») en gardant le filtre
 *   précédent. L'évaluateur l'acceptait, et le bouton « Aucun » restait sans
 *   effet sur une couche distante sous des tests verts (D2) : il lève désormais ;
 * - `case` rend la première sortie dont la condition est vraie ;
 * - `step` change de sortie à chaque seuil atteint, en `>=`.
 *
 * Un opérateur non couvert **lève** au lieu de rendre une valeur : un
 * évaluateur qui devine serait pire qu'aucun, puisqu'il validerait des
 * expressions qu'il ne comprend pas.
 */
export function evaluer(expr, props, lie = {}) {
  if (!Array.isArray(expr)) return expr;
  const [op, ...args] = expr;
  const ev = (e) => evaluer(e, props, lie);
  refuserFormeHistorique(expr);

  if (op === 'literal') return args[0];
  if (op === 'get') return props[args[0]] ?? null;
  if (op === 'var') return lie[args[0]];
  if (op === 'let') {
    const porte = { ...lie };
    for (let i = 0; i < args.length - 1; i += 2) porte[args[i]] = evaluer(args[i + 1], props, lie);
    return evaluer(args[args.length - 1], props, porte);
  }
  if (op === 'coalesce') {
    for (const a of args) { const v = ev(a); if (v !== null && v !== undefined) return v; }
    return null;
  }
  if (op === 'to-number') {
    // Comme MapLibre : `null` vaut 0, le reste passe par `Number()`.
    for (const a of args) {
      const v = ev(a);
      if (v === null || v === undefined) return 0;
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
    throw new Error('to-number : aucune conversion possible');
  }
  if (op === 'typeof') {
    const v = ev(args[0]);
    if (v === null || v === undefined) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }
  if (op === 'number' || op === 'string') {
    // Assertion de type : la première valeur du bon type, sinon une erreur.
    for (const a of args) { const v = ev(a); if (typeof v === op) return v; }
    throw new Error(`${op} : type inattendu`);
  }
  if (op === 'index-of') {
    const aiguille = ev(args[0]);
    const botte = ev(args[1]);
    return Array.isArray(botte) ? botte.indexOf(aiguille) : String(botte).indexOf(String(aiguille));
  }
  if (op === 'slice') {
    const v = ev(args[0]);
    return args.length > 2 ? v.slice(ev(args[1]), ev(args[2])) : v.slice(ev(args[1]));
  }
  if (op === 'concat') return args.map((a) => { const v = ev(a); return v == null ? '' : String(v); }).join('');
  if (op === '+') return args.reduce((s, a) => s + ev(a), 0);
  if (op === 'to-string') { const v = ev(args[0]); return v == null ? '' : String(v); }
  if (op === 'downcase') return String(ev(args[0])).toLowerCase();
  if (op === 'in') {
    const aiguille = ev(args[0]);
    const botte = ev(args[1]);
    return Array.isArray(botte) ? botte.includes(aiguille) : String(botte).includes(String(aiguille));
  }
  if (op === 'all') return args.every((a) => !!ev(a));
  if (op === 'any') return args.some((a) => !!ev(a));
  if (op === '!') return !ev(args[0]);
  if (op === '==') return ev(args[0]) === ev(args[1]);
  if (op === '!=') return ev(args[0]) !== ev(args[1]);
  if (op === '<') return ev(args[0]) < ev(args[1]);
  if (op === '<=') return ev(args[0]) <= ev(args[1]);
  if (op === '>') return ev(args[0]) > ev(args[1]);
  if (op === '>=') return ev(args[0]) >= ev(args[1]);
  if (op === 'case') {
    for (let i = 0; i < args.length - 1; i += 2) if (ev(args[i])) return ev(args[i + 1]);
    return ev(args[args.length - 1]);
  }
  if (op === 'step') {
    const v = ev(args[0]);
    let sortie = args[1];
    for (let i = 2; i < args.length; i += 2) { if (v >= args[i]) sortie = args[i + 1]; else break; }
    return sortie;
  }
  if (op === 'match') {
    const v = ev(args[0]);
    for (let i = 1; i < args.length - 1; i += 2) {
      const cles = Array.isArray(args[i]) ? args[i] : [args[i]];
      if (cles.includes(v)) return args[i + 1];
    }
    return args[args.length - 1];
  }
  throw new Error(`opérateur non couvert par l’évaluateur de test : ${op}`);
}

const COMPARAISONS = new Set(['==', '!=', '<', '<=', '>', '>=']);

/**
 * Lève sur la forme historique d'un filtre, que MapLibre refuse ou lit
 * autrement qu'Atlas ne l'entend. Même règle que `isExpressionFilter` de la
 * spécification de style.
 */
function refuserFormeHistorique(expr) {
  const [op, a, b] = expr;
  if (COMPARAISONS.has(op) && expr.length === 3 && !Array.isArray(a) && !Array.isArray(b)) {
    throw new Error(`forme historique refusée par MapLibre : ${JSON.stringify(expr)}`);
  }
  if (op === 'in' && expr.length >= 3 && typeof a === 'string' && !Array.isArray(b)) {
    throw new Error(`forme historique refusée par MapLibre : ${JSON.stringify(expr)}`);
  }
  if (op === '!in' || op === '!has' || op === 'none') {
    throw new Error(`forme historique refusée par MapLibre : ${JSON.stringify(expr)}`);
  }
}
