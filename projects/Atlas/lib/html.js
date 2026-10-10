/**
 * Échapper et filtrer le HTML venu du document.
 *
 * Atlas rend dans son interface des textes que le document porte : titre et
 * consigne d'une étape de récit, nom d'une couche, résultat d'un géocodeur. Le
 * widget a l'accès complet au document, et l'application garde sa clé d'API sur
 * l'appareil : un script injecté dans un de ces textes lirait l'un et l'autre.
 *
 * Deux gestes, jamais mélangés :
 * - `echapper` pour tout ce qui est du texte — c'est le cas par défaut ;
 * - `assainirTexte` pour le seul cas où l'auteur a le droit de mettre en forme
 *   (la consigne d'une étape) : une liste blanche de balises et d'attributs, le
 *   reste est écrit comme du texte, jamais exécuté.
 *
 * Constaté à l'audit du 02/10/2026 : `${s.text}` partait tel quel dans
 * `#story-present`, y compris pour un récit chargé par `?scene=`, c'est-à-dire
 * écrit par quelqu'un sans aucun droit sur le document.
 */

const ENTITES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Le texte, rendu inoffensif dans du HTML et dans une valeur d'attribut. */
export function echapper(valeur) {
  return String(valeur ?? '').replace(/[&<>"']/g, (c) => ENTITES[c]);
}

/**
 * Une valeur placée dans une chaîne JavaScript d'un attribut `onclick`
 * (`onclick="A.f('…')"`) : `'`, `"`, `\` et les retours à la ligne ouvriraient la
 * chaîne ou l'attribut. Le résultat est sûr dans les deux contextes.
 */
export function chaineJs(valeur) {
  return echapper(String(valeur ?? '').replace(/\\/g, '\\\\').replace(/[\r\n\u2028\u2029]+/g, ' '))
    .replace(/&#39;/g, '\\&#39;');
}

/** Balises admises et leurs attributs : de quoi mettre une consigne en forme, rien d'actif. */
const BALISES = Object.freeze({
  b: [], strong: [], i: [], em: [], u: [], s: [], small: [], br: [], hr: [],
  p: [], div: [], span: [], blockquote: [], code: [],
  ul: [], ol: [], li: [],
  h3: [], h4: [], h5: [],
  a: ['href', 'title'],
  img: ['src', 'alt', 'title', 'width', 'height'],
});

/** Les balises sans fermeture. */
const VIDES = new Set(['br', 'hr', 'img']);

/** Dont le contenu n'est jamais du texte à montrer : on l'enlève entier. */
const A_ENLEVER = ['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math'];

/** Un lien ou une image ne sort pas du web : ni `javascript:`, ni `data:`, ni `vbscript:`. */
function urlSure(valeur, { image = false } = {}) {
  // Les caractères de contrôle sont ôtés de l'adresse rendue ; pour reconnaître
  // le SCHÉMA, on retire en plus tout espace (un navigateur ignore les espaces
  // et tabulations au milieu de `java script:`). L'adresse rendue garde ses
  // espaces internes : `https://x.org/a b` ne devient pas `…/ab`.
  const v = String(valeur ?? '').replace(/[\u0000-\u001f\u007f-\u009f]+/g, '').trim();
  if (!v) return null;
  const schema = v.replace(/\s+/g, '');
  if (/^https:\/\//i.test(schema)) return v;
  if (!image && /^(http:\/\/|mailto:|tel:)/i.test(schema)) return v;
  return null;
}

/** Les attributs d'une balise, lus sans jamais rien exécuter. */
function lireAttributs(source) {
  const out = {};
  const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(source))) {
    const nom = m[1].toLowerCase();
    if (!(nom in out)) out[nom] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return out;
}

/**
 * Le HTML d'une consigne, réduit à la liste blanche.
 *
 * Construit à neuf à partir de balises reconnues : ce qui n'est pas dans la
 * liste devient du texte échappé, et les attributs sont reconstruits un à un
 * (aucun `on…`, aucun `style`, aucune adresse qui exécute).
 *
 * @param {string} html
 * @param {{ balises?: string[]|null }} [options] `balises` : sous-ensemble de la liste blanche ; une
 *   balise qui n'en fait pas partie disparaît (son contenu reste). `null` : toute la liste.
 * @returns {string} du HTML sûr
 */
export function assainirTexte(html, { balises = null } = {}) {
  let s = String(html ?? '');
  // Commentaires et blocs actifs : retirés avec leur contenu.
  s = s.replace(/<!--[\s\S]*?(?:-->|$)/g, '');
  for (const nom of A_ENLEVER) {
    s = s.replace(new RegExp(`<${nom}\\b[\\s\\S]*?(?:<\\/${nom}\\s*>|$)`, 'gi'), '');
  }
  const ouvertes = [];
  let out = '';
  let i = 0;
  while (i < s.length) {
    const debut = s.indexOf('<', i);
    if (debut === -1) { out += texteSimple(s.slice(i)); break; }
    out += texteSimple(s.slice(i, debut));
    // Comme un navigateur : une balise commence juste après `<` par une lettre
    // ou `/`. « a < b » reste du texte, et ne devient pas la balise <b>.
    if (!/[a-zA-Z/]/.test(s[debut + 1] ?? '')) { out += '&lt;'; i = debut + 1; continue; }
    const fin = s.indexOf('>', debut);
    if (fin === -1) { out += echapper(s.slice(debut)); break; }
    const interieur = s.slice(debut + 1, fin);
    i = fin + 1;
    // Une « balise » de plusieurs milliers de caractères n'en est pas une, et
    // les expressions ci-dessous deviennent quadratiques sur une longue série
    // d'espaces (mesuré : 40 000 espaces, 650 ms) : c'est du texte.
    if (interieur.length > 2000) { out += echapper(`<${interieur}>`); continue; }
    const ferme = /^\s*\/\s*([a-zA-Z][a-zA-Z0-9-]*)\s*$/.exec(interieur);
    const ouvre = /^\s*([a-zA-Z][a-zA-Z0-9-]*)([\s\S]*?)\/?\s*$/.exec(interieur);
    if (ferme) {
      const nom = ferme[1].toLowerCase();
      const k = ouvertes.lastIndexOf(nom);
      if (k !== -1) {
        // Referme ce qui reste ouvert au-dessus : le résultat est toujours bien formé.
        while (ouvertes.length > k) out += `</${ouvertes.pop()}>`;
      }
      continue;
    }
    if (!ouvre) { out += echapper(`<${interieur}>`); continue; }
    const nom = ouvre[1].toLowerCase();
    if (!(nom in BALISES) || (balises && !balises.includes(nom))) continue;   // balise inconnue ou non retenue : on garde son contenu, pas la balise
    const attrs = lireAttributs(ouvre[2]);
    let rendu = `<${nom}`;
    for (const permis of BALISES[nom]) {
      if (!(permis in attrs)) continue;
      let v = attrs[permis];
      if (permis === 'href') { v = urlSure(v); if (v == null) continue; }
      else if (permis === 'src') { v = urlSure(v, { image: true }); if (v == null) continue; }
      else if (permis === 'width' || permis === 'height') { if (!/^\d{1,4}$/.test(v) || Number(v) > 2000) continue; }
      rendu += ` ${permis}="${echapper(v)}"`;
    }
    if (nom === 'img' && !/ src="/.test(rendu)) continue;   // une image sans source sûre n'existe pas
    // Une image distante dit à son serveur qui la lit : pas de référent.
    if (nom === 'img') rendu += ' referrerpolicy="no-referrer" loading="lazy"';
    if (nom === 'a') rendu += ' target="_blank" rel="noopener noreferrer"';
    rendu += '>';
    out += rendu;
    if (!VIDES.has(nom)) ouvertes.push(nom);
  }
  while (ouvertes.length) out += `</${ouvertes.pop()}>`;
  return out;
}

/** Du texte entre deux balises : les `&` déjà écrits comme entités restent lisibles, le reste est échappé. */
function texteSimple(texte) {
  return echapper(texte).replace(/&amp;(lt|gt|quot|amp|nbsp|eacute|egrave|agrave|ecirc|ccedil|laquo|raquo|hellip|ndash|mdash|copy|reg|trade|middot|deg|#\d+|#x[0-9a-f]+);/gi, '&$1;');
}

