/**
 * Visuel `etats` : une légende avec un compte PAR ÉTAT (et non « Sites : 55 »), des couleurs de marqueur illisibles ou des jetons inconnus DITS (au lieu d'un
 * marqueur noir sans explication), et un fond uni ou un plan qui SUIT la charte quand elle change après lui.
 * Retours d'appkit (16/10/2026) sur le composant 1.20.
 * node --test projects/Atlas/tests/bi-etats-legende-couleurs.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { legendeEtats } from '../lib/bi/legende.js';
import { ajouterIcones, GRIS_REPLI } from '../lib/bi/icones-etats.js';
import { carteSimulee, point } from './aide-carte-bi.js';

/** Un canevas simulé : suffisant pour fabriquer des icônes sans navigateur. */
function poserCanevas() {
  globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() {
    const etat = {};
    const cible = { getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }) };
    return new Proxy(cible, { get: (t, k) => (k in t ? t[k] : (k in etat ? etat[k] : () => {})), set: (t, k, v) => { etat[k] = v; return true; } });
  } };
}
const sansCanevas = () => { delete globalThis.OffscreenCanvas; };
const ETATS = { ok: { forme: 'cercle', fill: '#1e8e3e' }, attente: { forme: 'carre', fill: 'jeton:etat-attente', libelle: 'En attente' }, ko: { forme: 'losange', fill: '#c5221f' } };
const feats = (...etats) => etats.map((e, i) => point(5.3 + i / 100, 43.3, e === undefined ? {} : { etat: e }, i + 1));
const scene = (etats = ETATS) => ({ layers: [{ id: 'sites', name: 'Sites', geometry_type: 'point', visuel: { type: 'etats', champEtat: 'etat', etats } }] });

test('légende des états : une classe par état déclaré, dans l\'ordre, avec couleur, forme, libellé et compte ; les autres à part', () => {
  const r = legendeEtats({ champEtat: 'etat', etats: ETATS }, feats('ok', 'ok', 'ko', 'inconnu', undefined), (c) => (c === 'jeton:etat-attente' ? '#e8a200' : c));
  assert.equal(r.type, 'etats'); assert.equal(r.champ, 'etat'); assert.equal(r.total, 5); assert.equal(r.sansValeur, 2);
  assert.deepEqual(r.classes.map((c) => [c.cle, c.libelle, c.couleur, c.forme, c.compte]), [
    ['ok', 'ok', '#1e8e3e', 'cercle', 2], ['attente', 'En attente', '#e8a200', 'carre', 0], ['ko', 'ko', '#c5221f', 'losange', 1], ['__sans__', '(sans état)', '#9a9a9a', undefined, 2]]);
  assert.deepEqual(legendeEtats({ etats: {} }, []).classes, [], 'sans état déclaré, sans entité : rien');
});

test('getLegend d\'un visuel etats : un compte par état, les jetons de la charte résolus', async () => {
  poserCanevas();
  try {
    const rt = attacher(carteSimulee());
    rt.api.setTheme({ version: 'atlas-charte/0.1', jetons: { 'etat-attente': '#e8a200' } });
    await rt.api.setScene(scene(), { sites: feats('ok', 'ok', 'attente', 'ko') });
    const l = rt.api.getLegend('sites');
    assert.equal(l.type, 'etats'); assert.equal(l.layer, 'sites'); assert.equal(l.titre, 'Sites'); assert.equal(l.total, 4);
    assert.deepEqual(l.classes.map((c) => [c.cle, c.couleur, c.compte]), [['ok', '#1e8e3e', 2], ['attente', '#e8a200', 1], ['ko', '#c5221f', 1]]);
  } finally { sansCanevas(); }
});

test('couleur de marqueur illisible ou jeton absent : gris de repli ET explication dans _avertissements, jamais un marqueur noir muet', async () => {
  poserCanevas();
  try {
    const rt = attacher(carteSimulee());
    const r = await rt.api.setScene(scene({ ok: { forme: 'cercle', fill: 'etat-ok' }, attente: { forme: 'carre', fill: 'jeton:inexistant' }, ko: { forme: 'losange', fill: 'var(--rouge)', stroke: 'rgb(0, 0, 0)' }, bon: { forme: 'triangle', fill: '#336699' } }), { sites: feats('ok', 'ko') });
    assert.equal(r.sites, 2); const a = r._avertissements.sites.join(' | ');
    assert.match(a, /visuel\.etats\.ok\.fill : « etat-ok » n'est pas une couleur lisible/); assert.match(a, /visuel\.etats\.attente\.fill : le jeton « inexistant » n'existe pas/);
    assert.match(a, /visuel\.etats\.ko\.fill : « var\(--rouge\) »/); assert.ok(!/bon|stroke/.test(a), 'une couleur valide n\'est pas signalée : ' + a);
    assert.equal(GRIS_REPLI, '#808080');
  } finally { sansCanevas(); }
});

test('ajouterIcones : sans canevas réel, la couleur de repli est le gris et chaque refus est noté', () => {
  poserCanevas();
  try {
    const notes = [], images = new Map();
    const carte = { hasImage: (i) => images.has(i), addImage: (i, img) => images.set(i, img), removeImage: (i) => images.delete(i) };
    const ids = ajouterIcones(carte, { a: { forme: 'cercle', fill: 'rouge-vif' }, b: { forme: 'cercle', fill: '#abcdef' } }, { jetons: {}, noter: (m) => notes.push(m) });
    assert.deepEqual(Object.keys(ids), ['a', 'b']); assert.equal(notes.length, 1); assert.match(notes[0], /rouge-vif/);
  } finally { sansCanevas(); }
});

test("un fond uni posé par l'hôte suit la charte donnée APRÈS lui (thème sombre) ; le fond « atlas » par défaut n'est pas touché", async () => {
  const carte = carteSimulee(); carte.calques.push({ id: 'background', type: 'background', paint: {} });
  const poses = []; carte.setPaintProperty = (id, k, v) => poses.push([id, k, v]);
  const rt = attacher(carte);
  await rt.api.setFond('uni');
  const fondAvant = poses.filter((p) => p[1] === 'background-color').pop();
  assert.ok(fondAvant, 'le fond uni a peint le fond de la carte'); assert.equal(fondAvant[2], '#ffffff');
  rt.api.setTheme({ version: 'atlas-charte/0.1', graines: { fond: '#101820', encre: '#f0f0f0' } });
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(poses.filter((p) => p[1] === 'background-color').pop()[2], '#101820', 'le fond uni a suivi la charte sombre');
  const carte2 = carteSimulee(); carte2.calques.push({ id: 'background', type: 'background', paint: {} }); const poses2 = []; carte2.setPaintProperty = (id, k, v) => poses2.push([id, k, v]);
  const rt2 = attacher(carte2); await rt2.api.setFond('atlas'); const avant2 = poses2.length;
  rt2.api.setTheme({ version: 'atlas-charte/0.1', graines: { fond: '#101820' } }); await new Promise((r) => setTimeout(r, 40));
  assert.equal(poses2.length, avant2, "le fond « atlas » ne dépend pas de la charte : rien n'est rejoué");
});
