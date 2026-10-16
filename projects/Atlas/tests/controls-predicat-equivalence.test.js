/**
 * `buildControlPredicate` (lib/controls.js) : la version rapide (calculs hors du parcours des entités) classe EXACTEMENT comme l'ancienne.
 * L'ancienne est gardée ici comme oracle, recopiée à l'identique (état du 15/10/2026, avant le correctif de performance : 808 ms pour 100 000
 * entités et trois contrôles, contre ~23 ms). Les scénarios sont tirés au hasard (graine fixe) : sélections simples et multiples, listes Grist,
 * texte, bornes numériques et temporelles, valeurs absentes ou illisibles, `requireValue`, et des contrôles modifiés entre deux appels du
 * MÊME prédicat (un prédicat gardé en cache doit voir les changements, comme avant).
 * node --test projects/Atlas/tests/controls-predicat-equivalence.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildControlPredicate, valeursDeCellule, normaliserTexte, nombreDe, valeurTemporelle } from '../lib/controls.js';
import { resolveFeaturePropertyKey } from '../lib/declarative-style.js';

// ---- L'oracle : l'ancienne implémentation, telle quelle ----
function predicatAncien(layer) {
  const ctrls = (layer.controls || []).filter((c) => c.active);
  if (!ctrls.length) return null;
  return (f) => {
    const p = f.properties || {};
    for (const c of ctrls) {
      const propKey = resolveFeaturePropertyKey(layer, c.field);
      if (c.type === 'select') {
        // Actif sans sélection posée : pas de restriction. Sélection vide
        // posée : rien ne passe — c'est ce qu'on a demandé.
        if (!Array.isArray(c.values)) continue;
        if (!c.values.length) return false;
        const choix = c.variant === 'select_single' ? c.values.slice(0, 1) : c.values;
        const retenus = new Set(choix.map((v) => String(v ?? '').toLowerCase()));
        // Une liste Grist passe si l'un de ses choix est retenu ; un objet sans
        // valeur passe si « (sans valeur) » — `''` — l'est.
        const vals = valeursDeCellule(p, propKey);
        if (!(vals.length ? vals : ['']).some((v) => retenus.has(v.toLowerCase()))) return false;
        continue;
      }
      if (c.type === 'text') {
        const q = normaliserTexte(c.texte).trim();
        if (!q) continue;
        if (!normaliserTexte(valeursDeCellule(p, propKey).join(' ')).includes(q)) return false;
        continue;
      }
      const raw = p[propKey];
      // `requireValue` : une entité dépourvue de la donnée filtrée est écartée
      // au lieu d'être laissée passer. Indispensable quand l'attribut n'est
      // renseigné que sur une partie des objets — sinon les entités muettes
      // dominent la carte thématique. Absent par défaut : les filtres
      // existants gardent leur tolérance.
      const n = c.type === 'time' ? valeurTemporelle(raw, c.unite) : nombreDe(raw);
      if (Number.isNaN(n)) {
        if (c.requireValue) return false;
        continue;
      }
      const variant = c.variant || (c.type === 'time' ? 'time_lte' : 'range_between');
      const avecMin = variant !== 'time_lte' && variant !== 'range_max';
      const avecMax = variant !== 'range_min';
      if (avecMax && Number.isFinite(c.max) && n > c.max) return false;
      if (avecMin && Number.isFinite(c.min) && n < c.min) return false;
    }
    return true;
  };
}

// ---- Données et scénarios aléatoires ----
let graine = 20261015;
const alea = () => { graine = (graine * 1664525 + 1013904223) % 4294967296; return graine / 4294967296; };
const choisir = (l) => l[Math.floor(alea() * l.length)];
const CATS = ['Route', 'Chemin', 'Sentier', 'École', 'Mairie', 'Église'];

function entites(n) {
  return Array.from({ length: n }, (_, i) => {
    const p = { id: i + 1 };
    if (alea() < 0.9) p.cat = choisir(CATS);
    if (alea() < 0.5) p.tags = ['L', ...Array.from({ length: Math.floor(alea() * 3) }, () => choisir(CATS))].slice(0, 3);
    const r = alea();
    p.valeur = r < 0.7 ? Math.floor(alea() * 1000) : r < 0.8 ? String(Math.floor(alea() * 1000)) + ',5' : r < 0.9 ? 'n/a' : null;
    p.date = alea() < 0.8 ? new Date(Date.UTC(2020 + Math.floor(alea() * 6), Math.floor(alea() * 12), 1 + Math.floor(alea() * 28))).toISOString().slice(0, 10) : (alea() < 0.5 ? Math.floor(alea() * 2e9) : '');
    p.nom = alea() < 0.95 ? `${choisir(['Rue', 'Allée', 'Place', 'Chemin'])} ${choisir(['de la Gare', 'Victor Hugo', 'des Écoles', 'du Parc', 'Émile Zola'])} ${i}` : undefined;
    return { type: 'Feature', id: i + 1, properties: p, geometry: { type: 'Point', coordinates: [5 + alea(), 43 + alea()] } };
  });
}

function controleAleatoire() {
  const t = choisir(['select', 'select', 'text', 'range', 'time']);
  const id = 'c' + Math.floor(alea() * 1e6);
  if (t === 'select') {
    const champ = choisir(['cat', 'tags']);
    const k = Math.floor(alea() * 4);
    return { id, type: 'select', field: champ, active: true, variant: choisir([undefined, 'select_multi', 'select_single']),
      ...(alea() < 0.15 ? {} : { values: Array.from({ length: k }, () => choisir(CATS.concat(['route', 'ÉCOLE', '']))) }) };
  }
  if (t === 'text') return { id, type: 'text', field: 'nom', active: true, texte: choisir(['', 'rue', 'ÉCOLES', 'victor', 'zzz', ' parc ']) };
  if (t === 'range') {
    const min = alea() < 0.7 ? Math.floor(alea() * 600) : undefined, max = alea() < 0.7 ? 300 + Math.floor(alea() * 700) : undefined;
    return { id, type: 'range', field: 'valeur', active: true, min, max, variant: choisir([undefined, 'range_between', 'range_min', 'range_max']), requireValue: alea() < 0.4 };
  }
  return { id, type: 'time', field: 'date', active: true, min: alea() < 0.6 ? Date.UTC(2021, 0, 1) : undefined, max: alea() < 0.6 ? Date.UTC(2024, 0, 1) : undefined,
    variant: choisir([undefined, 'time_lte', 'range_between', 'range_min']), requireValue: alea() < 0.4, unite: choisir([undefined, 'ms', 's']) };
}

const memes = (a, b, feats) => feats.map((f) => (a(f) ? '1' : '0')).join('') === feats.map((f) => (b(f) ? '1' : '0')).join('');

test('équivalence : 400 scénarios aléatoires de 1 à 4 contrôles sur 150 entités', () => {
  let vrais = 0, faux = 0;
  for (let s = 0; s < 400; s++) {
    const feats = entites(150);
    const controles = Array.from({ length: 1 + Math.floor(alea() * 4) }, controleAleatoire);
    if (alea() < 0.1) controles.push({ ...controleAleatoire(), active: false });
    const layer = { id: 'l', geojson: { type: 'FeatureCollection', features: feats }, controls: controles, _fields: [{ name: 'cat' }, { name: 'tags' }, { name: 'valeur' }, { name: 'date' }, { name: 'nom' }] };
    const a = predicatAncien(layer), b = buildControlPredicate(layer);
    assert.equal(a === null, b === null, 'même nullité (aucun contrôle actif)');
    if (!a) continue;
    assert.ok(memes(a, b, feats), 'écart de classement au scénario ' + s + ' : ' + JSON.stringify(controles));
    if (feats.filter(a).length === 0) faux++; else vrais++;
  }
  assert.ok(vrais > 100 && faux > 20, `les scénarios couvrent des cas qui passent (${vrais}) et des cas vides (${faux})`);
});

test('un prédicat gardé voit les contrôles modifiés entre deux appels (comme l\'ancien)', () => {
  for (let s = 0; s < 120; s++) {
    const feats = entites(80);
    const c = { id: 'c', type: 'select', field: 'cat', active: true, values: ['Route'] };
    const layer = { id: 'l', geojson: { type: 'FeatureCollection', features: feats }, controls: [c, { id: 't', type: 'text', field: 'nom', active: true, texte: 'rue' }, { id: 'r', type: 'range', field: 'valeur', active: true, min: 100, max: 800 }] };
    const a = predicatAncien(layer), b = buildControlPredicate(layer);
    assert.ok(memes(a, b, feats));
    c.values = [choisir(CATS), choisir(CATS)];
    assert.ok(memes(a, b, feats), 'valeurs remplacées');
    c.values.push('Mairie');
    assert.ok(memes(a, b, feats), 'valeur ajoutée en place');
    layer.controls[1].texte = choisir(['école', 'parc', '']);
    assert.ok(memes(a, b, feats), 'texte modifié');
    layer.controls[2].min = Math.floor(alea() * 500); layer.controls[2].max = 500 + Math.floor(alea() * 400);
    assert.ok(memes(a, b, feats), 'bornes modifiées');
    c.variant = 'select_single';
    assert.ok(memes(a, b, feats), 'variante modifiée');
    c.values = [];
    assert.ok(memes(a, b, feats), 'sélection vidée : rien ne passe');
    layer.geojson = { type: 'FeatureCollection', features: entites(60) };
    assert.ok(memes(a, b, layer.geojson.features), 'entités remplacées');
  }
});

test('la version rapide est nettement plus rapide que l\'ancienne (100 000 entités, trois contrôles)', () => {
  const feats = entites(100000);
  const layer = { id: 'l', geojson: { type: 'FeatureCollection', features: feats }, controls: [
    { id: 'a', type: 'select', field: 'cat', active: true, values: ['Route', 'Chemin'] },
    { id: 'b', type: 'range', field: 'valeur', active: true, min: 100, max: 800 },
    { id: 'c', type: 'text', field: 'nom', active: true, texte: 'rue' }] };
  // meilleure de trois mesures : un à-coup du ramasse-miettes ou de la machine partagée ne fait pas échouer un test de rapport
  const temps = (f) => { let meilleur = Infinity, n = 0; for (let i = 0; i < 3; i++) { const s = performance.now(); n = feats.filter(f).length; meilleur = Math.min(meilleur, performance.now() - s); } return [meilleur, n]; };
  const [tn, nn] = temps(buildControlPredicate(layer));
  const [ta, na] = temps(predicatAncien(layer));
  assert.equal(nn, na, 'même nombre d\'entités retenues');
  assert.ok(tn * 5 < ta, `rapide ${tn.toFixed(0)} ms, ancien ${ta.toFixed(0)} ms : au moins 5 fois plus rapide attendu`);
});
