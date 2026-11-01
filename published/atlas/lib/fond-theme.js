/**
 * Le fond « Thème » de l'application : le fond de carte (OpenMapTiles, celui de Liberty) repeint en aplats avec les couleurs de la charte (celle du document, de l'instance Grist, ou à
 * défaut celle d'Atlas, qui existe toujours). Module pur : il reçoit la liste des couches du style et les jetons du plan (`themeRuntime(charte).plan`), il rend ce qu'il faut peindre.
 *
 * Les règles de classement et de peinture sont celles du composant (`lib/bi/fond-plan.js`) : eau, végétation, bâti, voirie et noms de lieux en aplats, ce qui n'oriente pas
 * (points d'intérêt, pictogrammes, relief ombré) est masqué. Une différence propre à l'application : le BÂTI EN VOLUME du fond (`fill-extrusion`) est gardé et pris de la couleur du bâti
 * du thème, au lieu d'être masqué, car la maquette 3D est l'usage même d'Atlas ; sa visibilité reste celle du réglage « Bâti du fond de carte ».
 * Les couches de symboles (noms) ne changent de visibilité que pour être masquées : le réglage « Étiquettes » garde la main sur celles qui restent.
 */
import { classerOMT, peinture, PLAN_DEFAUT } from './bi/fond-plan.js';

export const VERSION = '1.0.0';
export const ID_FOND = 'theme';

/** Une couche du fond de carte (et non une couche d'Atlas) : l'arrière-plan, la source vectorielle du style, le relief ombré. */
export const estCoucheDuFond = (l) => !!l && (l.type === 'background' || l.source === 'openmaptiles' || l.source === 'ne2_shaded');

/**
 * @param {{id:string, type:string, source?:string, 'source-layer'?:string}[]} couches  les couches du style
 * @param {object} jetons  le plan de la charte (fond, eau, vert, bati, route, filet, texte, …)
 * @returns {{id:string, visibilite: 'none'|null, paint: Record<string, any>}[]}  `visibilite` : `'none'` pour masquer, `null` pour ne pas y toucher
 */
export function peintureFondTheme(couches, jetons = PLAN_DEFAUT) {
  const J = { ...PLAN_DEFAUT, ...jetons };
  const rendu = [];
  for (const l of couches || []) {
    if (!estCoucheDuFond(l)) continue;
    const sl = l['source-layer'] || null;
    if (sl === 'building' && l.type === 'fill-extrusion') { rendu.push({ id: l.id, visibilite: null, paint: { 'fill-extrusion-color': J.bati } }); continue; }
    const { role } = classerOMT({ id: l.id, type: l.type, 'source-layer': sl });
    const p = peinture(role, l.type, J);
    if (!p) continue;
    if (p.visibility === 'none') { rendu.push({ id: l.id, visibilite: 'none', paint: {} }); continue; }
    rendu.push({ id: l.id, visibilite: l.type === 'symbol' ? null : 'visible', paint: p.paint });
  }
  return rendu;
}

/**
 * Un style MapLibre (JSON) déjà peint avec le plan : pour créer la carte, ou remplacer son style, SANS image intermédiaire aux couleurs d'origine. Ne modifie pas le style reçu.
 * Les couches de données et le reste du style (sources, sprite, glyphes) sont gardés tels quels.
 */
export function themerStyle(style, jetons = PLAN_DEFAUT) {
  if (!style || !Array.isArray(style.layers)) return style;
  const parId = new Map(peintureFondTheme(style.layers, jetons).map((r) => [r.id, r]));
  const layers = style.layers.map((l) => {
    const r = parId.get(l.id);
    if (!r) return l;
    const copie = { ...l, paint: { ...(l.paint || {}), ...r.paint } };
    if (r.visibilite === 'none') copie.layout = { ...(l.layout || {}), visibility: 'none' };
    else if (r.visibilite === 'visible') copie.layout = { ...(l.layout || {}), visibility: 'visible' };
    return copie;
  });
  return { ...style, layers };
}
