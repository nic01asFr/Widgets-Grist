/**
 * Câblage DOM de la navigation clavier : écoute les touches sur le conteneur de la carte, déplace un « focus » d'élément en élément,
 * annonce dans une zone `role="status"` (lecteurs d'écran) et émet les mêmes événements `hover` / `select` qu'une souris.
 */
import { actionPourTouche, pas, ordreUnites, phraseUnite, phrasePoint, AIDE } from './clavier.js';
import { formaterNombre } from './echelles.js';

/**
 * @param {object} rt  retour de attacher() (api, _couches, _interne)
 * @param {{conteneur:EventTarget, document?:Document}} o  conteneur : élément qui reçoit les touches (le conteneur de la carte)
 * @returns {{desinstaller:Function, etat:Function, annoncer:Function}}
 */
export function installerClavier(rt, { conteneur, document: doc = globalThis.document } = {}) {
  const { couches, interne } = { couches: rt._couches, interne: rt._interne };
  const e = { index: -1, codes: null, couche: null, rows: null, zone: null };
  const invalider = () => { e.codes = null; e.rows = null; };
  for (const t of ['statistique', 'layer', 'filter', 'drill']) rt.on(t, invalider);

  function zone() {
    if (e.zone || !doc || !doc.body) return e.zone;
    const z = doc.createElement('div'); z.setAttribute('role', 'status'); z.setAttribute('aria-live', 'polite'); z.id = 'bi-annonce';
    z.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap'; doc.body.appendChild(z); return (e.zone = z);
  }
  const annoncer = (t) => { const z = zone(); if (z) z.textContent = t; e.derniere = t; return t; };

  /** Couche parcourue : la dernière couche administrative visible, sinon la dernière couche visible dotée d'une clé. */
  function cible() {
    const vis = [...couches.values()].filter((c) => c.visible);
    return [...vis].reverse().find((c) => c.admin) || [...vis].reverse().find((c) => c.def.cle) || vis[vis.length - 1] || null;
  }
  function charger() {
    const c = cible(); if (!c) return null;
    if (e.couche !== c) { e.couche = c; e.index = -1; invalider(); }
    if (!e.codes) {
      if (c.admin) { e.rows = rt.api.getRows(c.id, {}).lignes; e.codes = ordreUnites(e.rows); }
      else { e.rows = c.vue.map((f) => ({ code: f.id, props: f.properties })); e.codes = e.rows.map((r) => r.code); }
    }
    return c;
  }
  // La clé métier d'une entité : le code d'une unité administrative, ou la propriété que la couche déclare par `cle`.
  const cleDe = (c, id) => (c.admin ? id : (c.def.cle ? c.parId.get(id)?.properties?.[c.def.cle] : undefined));
  const poserFocus = (c, id, actif) => { try { rt._map.setFeatureState({ source: 'bi-src-' + c.id, id }, c.admin ? { hover: actif } : { highlight: actif }); } catch (err) { /* source absente */ } };
  function aller(action) {
    const c = charger(); if (!c) return annoncer('Aucune couche à parcourir.');
    if (!e.codes.length) return annoncer('Aucun élément dans ' + c.def.name + '.');
    if (e.index >= 0) poserFocus(c, e.codes[e.index], false);
    e.index = pas(e.index, e.codes.length, action); const id = e.codes[e.index]; poserFocus(c, id, true);
    const r = e.rows[e.index]; let texte;
    if (c.admin) { const m = c.admin.modele; const u = m && m.parUnite.get(id); texte = phraseUnite(r, { rang: r.rang, total: m ? m.renseignees : null, classe: u ? u.classe : null, nClasses: m ? m.classes.length : null, unite: m ? m.unite : '', fmt: (v) => formaterNombre(v) }); }
    else texte = phrasePoint(r.props, { rang: e.index + 1, total: e.codes.length });
    annoncer(texte); interne.emettre('hover', { layer: c.id, featureId: id, key: cleDe(c, id), ...(c.admin ? interne.infos(c, id) : {}), clavier: true }, 'utilisateur');
    return texte;
  }
  function selectionner() {
    const c = e.couche; if (!c || e.index < 0) return annoncer('Aucun élément en focus : n pour commencer.');
    const id = e.codes[e.index]; interne.poserSelection(c, id);
    interne.emettre('select', { layer: c.id, featureId: id, key: cleDe(c, id), ...(c.admin ? interne.infos(c, id) : {}), clavier: true }, 'utilisateur');
    return annoncer('Sélectionné : ' + (c.admin ? (c.parId.get(id)?.properties?.nom || id) : id) + '.');
  }
  function agir(action) {
    switch (action) {
      case 'suivant': case 'precedent': case 'debut': case 'fin': case 'saut-avant': case 'saut-arriere': return aller(action);
      case 'selectionner': return selectionner();
      case 'deselectionner': interne.poserSelection(null, null); interne.emettre('select', { layer: null, featureId: null, clavier: true }, 'utilisateur'); return annoncer('Sélection effacée.');
      case 'cadrer': { const c = e.couche; if (!c || e.index < 0) return annoncer('Aucun élément en focus.'); rt.api.fitTo([e.codes[e.index]]); return annoncer('Vue cadrée.'); }
      case 'descendre': { const c = e.couche; if (!c || !c.admin || e.index < 0) return annoncer('Descente impossible ici.'); rt.api.drillDown(c.id, e.codes[e.index], { origine: 'utilisateur' }).then((r) => annoncer('Niveau ' + r.niveau + ' : ' + r.n + ' unités.'), (err) => annoncer(err.message)); return 'en cours'; }
      case 'remonter': { const r = rt.api.drillUp({ origine: 'utilisateur' }); return annoncer(r ? 'Retour au niveau ' + r.niveau + '.' : 'Déjà au niveau le plus haut.'); }
      case 'aide': return annoncer(AIDE);
      default: return null;
    }
  }
  const surTouche = (evt) => { const a = actionPourTouche(evt); if (!a) return; if (evt.preventDefault) evt.preventDefault(); agir(a); };
  conteneur.addEventListener('keydown', surTouche);
  if (conteneur.setAttribute) { conteneur.setAttribute('aria-keyshortcuts', 'n p Home End PageUp PageDown Enter Escape f d u ?'); }
  return { desinstaller: () => conteneur.removeEventListener('keydown', surTouche), etat: () => ({ index: e.index, courante: e.codes && e.codes[e.index], couche: e.couche && e.couche.id, derniere: e.derniere }), annoncer, agir };
}
