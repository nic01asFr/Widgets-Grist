/**
 * La provenance d'une couche : d'où viennent ses données, sous quelle licence.
 *
 * Une couche importée d'une source ouverte (IGN, aujourd'hui) porte sa provenance dans son style
 * (`couche.style.provenance`), qui est ce qu'Atlas enregistre avec le projet et avec l'apparence de la couche : sans
 * cela, la mention de source se perdrait au premier rechargement. Ce module est le seul endroit qui la LIT, pour deux
 * usages :
 *
 * - **l'attribution de la carte** (`attributionDe`) : le texte que MapLibre affiche en bas de la carte tant que la
 *   couche est montée ;
 * - **les informations de la couche** (`htmlProvenance`) : la ligne de source et le lien vers les conditions de
 *   licence, dans l'en-tête de l'inspecteur.
 *
 * ## Une provenance vient d'un fichier, donc elle n'est pas de confiance
 *
 * Un projet ou une scène peut contenir n'importe quelle provenance. MapLibre écrit l'attribution d'une source avec
 * `innerHTML` : `attributionDe` ne rend donc QUE du texte, sans aucun des caractères d'une balise ou d'un attribut.
 * `htmlProvenance` échappe chaque valeur et n'écrit un lien que vers une adresse `https://`. Aucune dépendance : les
 * deux fonctions sont pures, et `echapper` est fourni par l'appelant.
 */

/** Au-delà, ce n'est plus une mention de source. */
const LONGUEUR_MAX = 200;

/** La provenance d'une couche, ou `null`. */
export function provenanceDe(couche) {
  const p = couche?.style?.provenance;
  return p && typeof p === 'object' && !Array.isArray(p) ? p : null;
}

/** Du texte sans balise ni guillemet : ce que MapLibre peut écrire sans risque. */
function texteSur(valeur) {
  if (typeof valeur !== 'string') return null;
  const t = valeur.replace(/[<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, LONGUEUR_MAX);
  return t || null;
}

/**
 * L'attribution à afficher sur la carte pour cette couche, en texte seul, ou `null`.
 * @param {object|null} couche
 */
export function attributionDe(couche) {
  return texteSur(provenanceDe(couche)?.mention);
}

const estHttps = (u) => typeof u === 'string' && /^https:\/\/[^\s"'<>`]+$/.test(u);

/**
 * La ligne de provenance de l'en-tête de l'inspecteur : source, jeu, licence (lien), édition. Rend `''` pour une
 * couche sans provenance.
 *
 * @param {object|null} couche
 * @param {(texte: string) => string} echapper l'échappement HTML d'Atlas (`lib/html.js`)
 */
export function htmlProvenance(couche, echapper) {
  const p = provenanceDe(couche);
  if (!p || typeof echapper !== 'function') return '';
  const source = texteSur(p.source);
  if (!source) return '';
  const jeu = texteSur(p.jeu);
  const licence = p.licence && typeof p.licence === 'object' ? p.licence : {};
  const nomLicence = texteSur(licence.nom);
  const edition = p.edition && typeof p.edition === 'object' ? p.edition : {};
  const dateEdition = texteSur(edition.annoncee);
  const vue = typeof edition.derniereModificationVue === 'string' ? texteSur(edition.derniereModificationVue.slice(0, 10)) : null;
  const morceaux = [`Source : ${echapper(source)}${jeu ? ` · ${echapper(jeu)}` : ''}`];
  if (nomLicence) morceaux.push(echapper(nomLicence));
  if (dateEdition) morceaux.push(`édition ${echapper(dateEdition)}`);
  else if (vue) morceaux.push(`modifié jusqu’au ${echapper(vue)}`);
  const liens = [];
  if (estHttps(licence.url)) liens.push(`<a href="${echapper(licence.url)}" target="_blank" rel="noopener noreferrer">Conditions de licence</a>`);
  if (estHttps(licence.conditions)) liens.push(`<a href="${echapper(licence.conditions)}" target="_blank" rel="noopener noreferrer">Conditions d’utilisation du service</a>`);
  const retard = texteSur(p.avertissementEdition);
  return `<div class="insp-source" style="margin-top:6px;font-size:11px;line-height:1.45;color:var(--muted)">`
    + `${morceaux.join(' · ')}`
    + `${liens.length ? ` — ${liens.join(' · ')}` : ''}`
    + `${retard ? `<div style="margin-top:2px">${echapper(retard)}</div>` : ''}`
    + '</div>';
}
