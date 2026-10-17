/**
 * La légende de la carte BI, en module optionnel : une pastille de couleur, un libellé et un compte par classe, pour chaque couche visible, d’après `getLegend`.
 * Déclarée par la scène : `interface: { legende: true }` ou `{ legende: { position: 'bas-gauche', repliee: false } }`.
 *
 * Elle AFFICHE et ne filtre rien : avec `cible: true`, une classe devient un bouton (à bascule) dont le clic est DIT à l’hôte (événement `classe`) ; c’est lui, qui a les
 * contrôles, qui filtre ou cible. Sur une carte étroite (téléphone) elle se range en bas, repliée, comme une feuille. Texte seul (`textContent`), thémée par les
 * variables de la charte, repliable au clavier, annoncée comme une région nommée. Module sans dépendance : le DOM et la zone sont injectés.
 */
const STYLE_ID = 'atlas-bi-legende-style';
export const FEUILLE = `
.atlas-bi-legende { min-width: 140px; max-width: 260px; max-height: 50vh; overflow: auto; }
.atlas-bi-legende-tete { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; border: 0; background: transparent; padding: 0; cursor: pointer; font-weight: 600; text-align: left; }
.atlas-bi-legende-corps { margin-top: 6px; }
.atlas-bi-legende-couche + .atlas-bi-legende-couche { margin-top: 8px; padding-top: 6px; border-top: 1px solid var(--atlas-bord, #d8d6d2); }
.atlas-bi-legende-titre { font-weight: 600; color: var(--atlas-discret, #6b6760); font-size: var(--atlas-taille-petit, 12px); margin-bottom: 3px; overflow-wrap: anywhere; }
.atlas-bi-legende-classe { display: flex; align-items: center; gap: 8px; padding: 1px 0; }
button.atlas-bi-legende-classe { width: 100%; border: 0; background: transparent; text-align: left; cursor: pointer; border-radius: 4px; padding: 2px 4px; margin: 0 -4px; }
button.atlas-bi-legende-classe:hover { background: var(--atlas-survol, #efede9); }
button.atlas-bi-legende-classe[aria-pressed="true"] { background: var(--atlas-survol, #efede9); font-weight: 600; box-shadow: inset 3px 0 0 var(--atlas-accent, #c44536); }
.atlas-bi-legende.feuille { width: 100%; max-width: none; border-radius: 10px 10px 0 0; }
.atlas-bi-legende-pastille { flex: none; width: 12px; height: 12px; border-radius: 3px; border: 1px solid rgba(0,0,0,.25); }
.atlas-bi-legende-pastille.cercle { border-radius: 50%; }
.atlas-bi-legende-libelle { flex: 1; overflow-wrap: anywhere; }
.atlas-bi-legende-compte { color: var(--atlas-discret, #6b6760); font-variant-numeric: tabular-nums; }
`;
const FORMES_ROND = ['cercle', 'rond', 'disque'];

/** Une couleur est-elle sûre à écrire dans un style ? Un hexadécimal, `rgb()`/`hsl()` ou un nom simple ; rien d’autre ne passe (pas d’url(), pas de `;`). */
export function couleurSure(c) {
  return typeof c === 'string' && /^(#[0-9a-fA-F]{3,8}|(rgb|hsl)a?\([0-9.,%\s/-]{3,40}\)|[a-zA-Z]{3,20})$/.test(c.trim()) ? c.trim() : '#808080';
}

/**
 * @param {{ document?: Document, zone: object, fournir: () => object[], position?: string, repliee?: boolean, cible?: boolean, surClasse?: Function }} o
 *   `fournir()` rend, pour chaque couche visible : `{ layer, titre, classes: [{ cle, libelle, couleur, compte, forme? }] }` ; `repliee` : replié au départ (par défaut : oui sur une carte étroite) ;
 *   `cible` : les classes sont des boutons ; `surClasse(layer, cle, libelle, active)` est appelée au clic (bascule : un second clic désélectionne)
 */
export function creerLegende({ document: doc = globalThis.document, zone, fournir, position = 'bas-gauche', repliee, cible = false, surClasse = () => {} }) {
  const etroit = typeof zone.etroit === 'function' && zone.etroit();
  if (repliee === undefined) repliee = etroit;   // sur un téléphone, la légende ne couvre pas la carte tant qu’on ne la demande pas
  if (doc.head && !doc.getElementById(STYLE_ID)) { const s = doc.createElement('style'); s.id = STYLE_ID; s.textContent = FEUILLE; doc.head.appendChild(s); }
  const racine = doc.createElement('section'); racine.className = 'atlas-bi-ui-carte atlas-bi-legende'; racine.setAttribute('aria-label', 'Légende');
  const tete = doc.createElement('button'); tete.type = 'button'; tete.className = 'atlas-bi-legende-tete'; tete.setAttribute('aria-expanded', String(!repliee));
  const titre = doc.createElement('span'); titre.textContent = 'Légende'; const fleche = doc.createElement('span'); fleche.setAttribute('aria-hidden', 'true');
  tete.appendChild(titre); tete.appendChild(fleche); racine.appendChild(tete);
  const corps = doc.createElement('div'); corps.className = 'atlas-bi-legende-corps'; racine.appendChild(corps);
  let ouverte = !repliee;
  const montrer = () => { fleche.textContent = ouverte ? '▾' : '▸'; tete.setAttribute('aria-expanded', String(ouverte)); corps.style.display = ouverte ? '' : 'none'; };
  tete.addEventListener('click', () => { ouverte = !ouverte; montrer(); });
  if (etroit) racine.className += ' feuille';
  zone.coin(etroit ? 'bas-centre' : position).appendChild(racine); montrer();
  const actives = new Map();   // couche -> classe ciblée

  /** Redessine d’après les légendes courantes ; la légende disparaît quand aucune couche visible n’a de classe à montrer. */
  function rafraichir() {
    const legendes = (fournir() || []).filter((l) => l && Array.isArray(l.classes) && l.classes.length);
    corps.textContent = '';
    for (const l of legendes) {
      const bloc = doc.createElement('div'); bloc.className = 'atlas-bi-legende-couche';
      if (legendes.length > 1 || l.titre) { const t = doc.createElement('div'); t.className = 'atlas-bi-legende-titre'; t.textContent = String(l.titre || l.layer || ''); bloc.appendChild(t); }
      for (const c of l.classes) {
        const li = doc.createElement(cible ? 'button' : 'div'); li.className = 'atlas-bi-legende-classe';
        if (cible) {
          li.type = 'button'; li.setAttribute('aria-pressed', String(actives.get(l.layer) === c.cle));
          li.addEventListener('click', () => { const active = actives.get(l.layer) !== c.cle; if (active) actives.set(l.layer, c.cle); else actives.delete(l.layer); surClasse(l.layer, c.cle, String(c.libelle ?? c.cle ?? ''), active); rafraichir(); });
        }
        const p = doc.createElement('span'); p.className = 'atlas-bi-legende-pastille' + (FORMES_ROND.includes(c.forme) ? ' cercle' : ''); p.style.background = couleurSure(c.couleur); p.setAttribute('aria-hidden', 'true');
        const lb = doc.createElement('span'); lb.className = 'atlas-bi-legende-libelle'; lb.textContent = String(c.libelle ?? c.cle ?? '');
        li.appendChild(p); li.appendChild(lb);
        if (Number.isFinite(c.compte)) { const n = doc.createElement('span'); n.className = 'atlas-bi-legende-compte'; n.textContent = String(c.compte); li.appendChild(n); }
        bloc.appendChild(li);
      }
      corps.appendChild(bloc);
    }
    racine.style.display = legendes.length ? '' : 'none';
    return legendes.length;
  }
  return { racine, rafraichir, replier: (v) => { ouverte = !v; montrer(); }, estOuverte: () => ouverte, detruire() { if (racine.parentNode && racine.parentNode.removeChild) racine.parentNode.removeChild(racine); } };
}
