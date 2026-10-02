/**
 * La bulle d'un objet — ce qu'on voit en touchant un objet sur la carte.
 *
 * Elle remplace le popup de douze champs en texte, quand la couche la
 * configure : un titre, des photos, des pastilles d'état (couleurs de la
 * symbologie), quelques champs, la dernière visite (table liée), et des
 * actions (nouvelle visite, voir la fiche, itinéraire). Constaté le 01/10/2026
 * sur un document de suivi d'ouvrages : une carte maison écrite à la main
 * faisait exactement cela, en 42 Ko de code.
 *
 * Ce module est pur : il propose une configuration à partir du schéma, et
 * construit le **contenu** de la bulle (un modèle de vue) ; l'appelant le met
 * en page et charge les photos.
 */

const TECHNIQUE = /^(_|id$|manualSort$|gristHelper|Historique|x$|y$|wkt$|geometry|geom$)|(^|_)(lat|latitude|lon|lng|long|longitude)(_|$)|latitude|longitude/i;
const TITRE = /^(nom|name|titre|title|libelle|libell[ée]|intitul[ée]|nom_complet)$/i;
const NB_CHAMPS = 4;

/** Les identifiants de pièces jointes d'une cellule : `['L', 3, 7]`, `[3, 7]` ou `3`. */
export function idsPiecesJointes(v) {
  if (Array.isArray(v)) return v.filter((x) => Number.isInteger(x) && x > 0);
  if (Number.isInteger(v) && v > 0) return [v];
  // Atlas range une liste Grist en texte (« 1, 2 ») et la garde sous `_l_<champ>`.
  if (typeof v === 'string' && /^\s*\d+(\s*,\s*\d+)*\s*$/.test(v)) return v.split(',').map((x) => Number(x.trim()));
  return [];
}

/**
 * Une configuration de départ, à partir du schéma : ce qu'on proposerait à
 * l'équipe avant qu'elle ne retouche quoi que ce soit.
 *
 * @param {Array<{colId:string,type?:string,isFormula?:boolean,label?:string}>} colonnes  colonnes de la table
 * @param {{ pastilles?: string[], lien?: {table:string, via:string, date?:string}|null }} o
 */
export function bulleParDefaut(colonnes, { pastilles = [], lien = null } = {}) {
  const cs = (colonnes || []).filter((c) => c && c.colId && !TECHNIQUE.test(c.colId));
  const titre = (cs.find((c) => TITRE.test(c.colId)) || cs.find((c) => !c.type || c.type === 'Text'))?.colId || null;
  const photos = cs.filter((c) => c.type === 'Attachments').map((c) => c.colId);
  const exclus = new Set([titre, ...photos, ...pastilles]);
  const champs = cs
    .filter((c) => !exclus.has(c.colId) && c.type !== 'Attachments' && !/^RefList:/.test(c.type || ''))
    .slice(0, NB_CHAMPS)
    .map((c) => c.colId);
  return {
    actif: true,
    titre,
    photos,
    pastilles: [...pastilles],
    champs,
    lien: lien || null,
    actions: { fiche: true, visite: !!lien, itineraire: true },
  };
}

/**
 * La colonne de date d'une table liée — la plus probable pour « dernière
 * visite » : une `Date`/`DateTime`, de préférence nommée date, réalisé, visite.
 */
export function colonneDate(colonnes) {
  const ds = (colonnes || []).filter((c) => /^Date(Time)?/.test(c.type || ''));
  return (ds.find((c) => /date|r[ée]alis|visite|inspection|passage/i.test(c.colId)) || ds[0])?.colId || null;
}

/** La ligne liée la plus récente d'un objet (`via` = sa référence, `date` = la colonne). */
export function derniereLigneLiee(lignes, via, rowId, date) {
  let meilleure = null;
  for (const l of lignes || []) {
    const ref = Array.isArray(l[via]) ? l[via][1] : l[via];
    if (Number(ref) !== Number(rowId)) continue;
    const d = Number(l[date]);
    if (!meilleure || (Number.isFinite(d) && d > Number(meilleure[date] || -Infinity))) meilleure = l;
  }
  return meilleure;
}

/** Nombre de lignes liées à un objet. */
export function nombreLignesLiees(lignes, via, rowId) {
  let n = 0;
  for (const l of lignes || []) {
    const ref = Array.isArray(l[via]) ? l[via][1] : l[via];
    if (Number(ref) === Number(rowId)) n++;
  }
  return n;
}

/** Une date Grist (secondes) en « 12/09/2025 ». */
export function dateCourte(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return '';
  const d = new Date(n * 1000);
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/**
 * L'itinéraire jusqu'à l'objet. Dans l'application, `geo:` laisse le
 * téléphone proposer ses applications de navigation ; ailleurs, le
 * calculateur d'OpenStreetMap, sans compte ni clé.
 */
export function lienItineraire(lon, lat, { application = false } = {}) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const la = lat.toFixed(6), lo = lon.toFixed(6);
  return application
    ? `geo:${la},${lo}?q=${la},${lo}`
    : `https://www.openstreetmap.org/directions?to=${la}%2C${lo}#map=17/${la}/${lo}`;
}

/** Noir ou blanc, lisible sur une couleur de fond. */
export function couleurTexte(hex) {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})/i.exec(String(hex || ''));
  if (!m) return '#1a1a1a';
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#1a1a1a' : '#ffffff';
}

const texte = (v) => {
  if (v == null || v === '') return '';
  if (Array.isArray(v)) return v[0] === 'L' ? v.slice(1).join(', ') : v.join(', ');
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  return String(v);
};

/**
 * Le contenu d'une bulle, prêt à mettre en page.
 *
 * @param {object} config   la configuration de la couche (`bulleParDefaut`)
 * @param {object} props    les propriétés de l'objet
 * @param {object} o
 * @param {(champ:string, valeur:any) => {texte:string, couleur?:string}|null} [o.pastille]  libellé et couleur d'une valeur
 * @param {(champ:string) => string} [o.libelleChamp]   le libellé d'une colonne
 * @param {(champ:string, valeur:any) => string} [o.valeur]   le texte d'une valeur (libellé d'un Ref…)
 * @param {{date?:number, texte?:string, nombre?:number}|null} [o.derniere]
 * @param {string|null} [o.itineraire]   le lien, déjà construit
 */
export function modeleBulle(config, props, o = {}) {
  const p = props || {};
  const libelle = o.libelleChamp || ((c) => c);
  const valeur = o.valeur || ((c, v) => texte(v));
  const titre = (config?.titre && valeur(config.titre, p[config.titre])) || '';
  const photos = (config?.photos || []).flatMap((c) => idsPiecesJointes(p[`_l_${c}`] ?? p[c]));
  const pastilles = (config?.pastilles || [])
    .map((c) => {
      if (p[c] == null || p[c] === '') return null;
      const r = o.pastille ? o.pastille(c, p[c]) : null;
      const t = r?.texte || valeur(c, p[c]);
      return t ? { champ: c, libelle: libelle(c), texte: t, couleur: r?.couleur || null, encre: r?.couleur ? couleurTexte(r.couleur) : null } : null;
    })
    .filter(Boolean);
  const lignes = (config?.champs || [])
    .map((c) => ({ champ: c, libelle: libelle(c), valeur: valeur(c, p[c]) }))
    .filter((l) => l.valeur !== '');
  const actions = [];
  const a = config?.actions || {};
  if (a.visite && config?.lien) actions.push({ cle: 'visite', libelle: 'Nouvelle visite' });
  if (a.fiche) actions.push({ cle: 'fiche', libelle: 'Voir la fiche' });
  if (a.itineraire && o.itineraire) actions.push({ cle: 'itineraire', libelle: 'Itinéraire', lien: o.itineraire });
  const d = o.derniere;
  const derniere = config?.lien
    ? (d && (d.date || d.texte)
      ? { texte: [dateCourte(d.date), d.texte].filter(Boolean).join(' · '), nombre: d.nombre ?? null }
      : { texte: 'Aucune visite', nombre: 0 })
    : null;
  return { titre, photos, pastilles, lignes, derniere, actions };
}
