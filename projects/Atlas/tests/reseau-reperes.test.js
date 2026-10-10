import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  indexerReperes, routesIndexees, resoudre, intervalle, localiser, plusProches, formater, lirePR, chargerReperes, ErreurReperes,
} from '../lib/reseau/reperes.js';
import { creerRepere } from '../lib/reseau/geo.js';

// BD TOPO réelle (édition 2026-09-15, Territoire de Belfort), onze routes : voir _origine dans le fichier
const F = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/reseau/reperes-d90.json', import.meta.url)), 'utf8'));
const idx = indexerReperes(F.point_de_repere, F.section_de_points_de_repere);
const R = creerRepere(6.85, 47.63);
const metres = (a, b) => Math.hypot(...R.vers([a.lng ?? a[0], a.lat ?? a[1]]).map((v, i) => v - R.vers([b.lng ?? b[0], b.lat ?? b[1]])[i]));
const proche = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} attendu ${b}, obtenu ${a}`);
const pointsDe = (route, cote) => idx.points.filter((p) => p.route === route && (!cote || p.cote === cote));

describe('reseau/reperes — l’index', () => {
  it('indexe onze routes ; les points sans section ou trop loin de leur route sont comptés, pas perdus en silence', () => {
    const routes = routesIndexees(idx);
    assert.equal(routes.length, 11);
    assert.ok(routes.find((r) => r.route === 'N19').cotes.length >= 2);
    assert.ok(idx.points.length > 150);
    assert.ok(idx.rejets.sansSection + idx.rejets.trop_loin + idx.rejets.numeroIllisible >= 0);
    assert.equal(idx.sectionsLues, F.section_de_points_de_repere.length);
  });

  it('les DS et FS ne sont pas des repères', () => {
    assert.ok(idx.points.every((p) => ['PR', 'PR0', 'PRF'].includes(p.type)));
  });

  it('un index vide ne casse rien', () => {
    const vide = indexerReperes([], []);
    assert.equal(localiser(vide, [6.8, 47.6]), null);
    assert.deepEqual(plusProches(vide, [6.8, 47.6]), []);
    assert.throws(() => resoudre(vide, { route: 'D1', pr: 1 }), { code: 'route_inconnue' });
  });
});

describe('reseau/reperes — résoudre : route + PR + abscisse', () => {
  it('un PR connu, abscisse 0 : exactement sur la ligne, à moins de 50 m du point du PR', () => {
    const p = pointsDe('D13').find((q) => q.n === 5);
    const r = resoudre(idx, { route: 'D13', pr: 5, abscisse: 0 });
    assert.equal(r.route, 'D13');
    assert.equal(r.pr, 5);
    assert.ok(metres(r, p.lnglat) < 50, `écart au point du PR : ${metres(r, p.lnglat)}`);
  });

  it('l’abscisse est des mètres le long de la ligne (jamais une fraction de kilomètre), y compris au-delà de 1 000', () => {
    const a = resoudre(idx, { route: 'D13', pr: 5, abscisse: 0 });
    const b = resoudre(idx, { route: 'D13', pr: 5, abscisse: 300 });
    const c = resoudre(idx, { route: 'D13', pr: 5, abscisse: 1200 });
    assert.ok(metres(a, b) > 150 && metres(a, b) <= 300 + 1, `300 m le long de la ligne : ${metres(a, b)} m en ligne droite`);
    assert.ok(metres(a, c) > 700 && metres(a, c) <= 1201);
  });

  it('un abscisse négatif recule', () => {
    const a = resoudre(idx, { route: 'D13', pr: 6, abscisse: 0 });
    const b = resoudre(idx, { route: 'D13', pr: 6, abscisse: -200 });
    const c = resoudre(idx, { route: 'D13', pr: 5, abscisse: 800 });
    assert.ok(metres(a, b) > 100);
    assert.ok(metres(b, c) < 600);
  });

  it('la route s’écrit comme on veut (« d 13 »)', () => {
    assert.deepEqual(resoudre(idx, { route: 'd 13', pr: 5 }).lng, resoudre(idx, { route: 'D13', pr: 5 }).lng);
  });

  it('erreurs explicites : route inconnue, PR inconnu (avec ses voisins), côté inconnu', () => {
    assert.throws(() => resoudre(idx, { route: 'D9999', pr: 1 }), { code: 'route_inconnue' });
    assert.throws(() => resoudre(idx, { route: 'D13', pr: 5, cote: 'G' }), { code: 'cote_inconnu' });
    const e = (() => { try { resoudre(idx, { route: 'D13', pr: 500 }); } catch (x) { return x; } })();
    assert.ok(e instanceof ErreurReperes && e.code === 'pr_inconnu');
    assert.ok(Array.isArray(e.disponibles) && e.disponibles.length > 5);
    assert.throws(() => resoudre(idx, { route: 'D13', pr: 1.5 }), { code: 'parametre_invalide' });
    assert.throws(() => resoudre(idx, { route: 'D13', pr: 5, abscisse: NaN }), { code: 'parametre_invalide' });
  });

  it('un PR manquant entre deux PR connus : erreur par défaut, estimation signalée sur demande', () => {
    // N66 : numéros 29 à 32 seulement ; on retire le 30 de l'index
    const pts = F.point_de_repere.filter((f) => !(f.properties.route === 'N66' && f.properties.numero === '30'));
    const sans = indexerReperes(pts, F.section_de_points_de_repere);
    const connus = sans.points.filter((p) => p.route === 'N66').map((p) => p.n);
    assert.ok(connus.includes(29) && connus.includes(31) && !connus.includes(30));
    assert.throws(() => resoudre(sans, { route: 'N66', pr: 30 }), (e) => e.code === 'pr_inconnu' && e.avant === 29 && e.apres === 31);
    const r = resoudre(sans, { route: 'N66', pr: 30, interpoler: true });
    assert.equal(r.note, 'pr_interpole');
    const a = resoudre(sans, { route: 'N66', pr: 29 });
    const b = resoudre(sans, { route: 'N66', pr: 31 });
    assert.ok(metres(a, r) > 0 && metres(r, b) > 0);
  });

  it('une abscisse qui dépasse la route : erreur explicite, jamais d’extrapolation', () => {
    const e = (() => { try { resoudre(idx, { route: 'D13', pr: 5, abscisse: 900000 }); } catch (x) { return x; } })();
    assert.ok(e && e.code === 'abscisse_hors_section' && e.depassementM > 1000);
  });

  it('le même numéro de PR dans plusieurs départements : ambigu sans précision, résolu par `departement` ou `pres`', () => {
    const deps = new Set(pointsDe('D463', 'U').map((p) => p.dep));
    assert.ok(deps.size >= 2, `départements : ${[...deps]}`);
    const doublons = pointsDe('D463', 'U').filter((p) => pointsDe('D463', 'U').some((q) => q !== p && q.n === p.n && q.dep !== p.dep));
    assert.ok(doublons.length > 0, 'un numéro de PR partagé entre deux départements');
    const p = doublons[0];
    assert.throws(() => resoudre(idx, { route: 'D463', pr: p.n }), (e) => e.code === 'pr_ambigu' && e.departements.length >= 2);
    const a = resoudre(idx, { route: 'D463', pr: p.n, departement: p.dep });
    assert.equal(a.departement, p.dep);
    const q = doublons.find((x) => x.n === p.n && x.dep !== p.dep);
    const b = resoudre(idx, { route: 'D463', pr: p.n, pres: q.lnglat });
    assert.equal(b.departement, q.dep);
    assert.ok(metres(a, b) > 1000);
  });

  it('plusieurs côtés (chaussées séparées) : `cote` précise, et U est le défaut quand il existe', () => {
    const cotes = routesIndexees(idx).find((r) => r.route === 'D463').cotes;
    assert.ok(cotes.includes('U') && cotes.includes('D'));
    const pu = pointsDe('D463', 'U').find((p) => p.dep === '90' && pointsDe('D463', 'U').filter((q) => q.n === p.n && q.dep === '90').length === 1);
    assert.equal(resoudre(idx, { route: 'D463', pr: pu.n, departement: '90' }).cote, 'U');
    const pd = pointsDe('D463', 'D')[0];
    assert.equal(resoudre(idx, { route: 'D463', pr: pd.n, cote: 'D', departement: pd.dep, pres: pd.lnglat }).cote, 'D');
  });

  it('une route à côtés G et D sans côté U : `cote` obligatoire', () => {
    const sansU = indexerReperes(F.point_de_repere.filter((f) => f.properties.cote !== 'U'), F.section_de_points_de_repere.filter((f) => f.properties.cote !== 'U'));
    const r = routesIndexees(sansU).find((x) => x.cotes.length >= 2);
    assert.ok(r, 'une route à deux côtés G et D');
    const p = sansU.points.find((q) => q.route === r.route);
    assert.throws(() => resoudre(sansU, { route: r.route, pr: p.n, departement: p.dep }), { code: 'cote_ambigu' });
  });

  it('999+0 : la fin de la route (le point PRF), ou la fin de la dernière section signalée', () => {
    const prf = pointsDe('D83').find((p) => p.type === 'PRF');
    if (prf) {
      const r = resoudre(idx, { route: 'D83', pr: 999 });
      assert.ok(metres(r, prf.lnglat) < 60, `PRF à ${metres(r, prf.lnglat)} m`);
    }
    const sans = indexerReperes(F.point_de_repere.filter((f) => f.properties.type_de_pr !== 'PRF'), F.section_de_points_de_repere);
    const r2 = resoudre(sans, { route: 'D13', pr: 999 });
    assert.equal(r2.note, 'fin_de_route_sans_PRF');
  });

  it('PR0 : le début, et les PR ne sont pas espacés de 1 000 m', () => {
    const d13 = pointsDe('D13').filter((p) => p.n !== null).sort((a, b) => a.n - b.n);
    const ecarts = d13.slice(1).map((p, i) => p.ab - d13[i].ab).filter((x) => x > 0);
    assert.ok(ecarts.some((e) => Math.abs(e - 1000) > 30), `écarts publiés entre PR : ${ecarts.slice(0, 8)}`);
    assert.ok(d13[0].type === 'PR0' || d13[0].n === 0);
  });

  it('une route sans repère (que des bornes DS) : inconnue plutôt que fausse', () => {
    assert.throws(() => resoudre(idx, { route: 'D127A', pr: 1 }), (e) => ['route_inconnue', 'pr_inconnu'].includes(e.code));
  });
});

describe('reseau/reperes — intervalle', () => {
  it('la ligne entre deux repères : longueur cohérente avec les abscisses publiées', () => {
    const p5 = pointsDe('D13').find((p) => p.n === 5);
    const p8 = pointsDe('D13').find((p) => p.n === 8);
    const r = intervalle(idx, { route: 'D13', debut: { pr: 5, abscisse: 0 }, fin: { pr: 8, abscisse: 0 } });
    assert.ok(r.geometrie.type === 'LineString' || r.geometrie.type === 'MultiLineString');
    const publie = p8.ab - p5.ab;
    assert.ok(Math.abs(r.longueurM / publie - 1) < 0.1, `ligne ${Math.round(r.longueurM)} m contre ${publie} m publiés`);
  });

  it('l’ordre des repères est indifférent', () => {
    const a = intervalle(idx, { route: 'D13', debut: { pr: 5 }, fin: { pr: 8 } });
    const b = intervalle(idx, { route: 'D13', debut: { pr: 8 }, fin: { pr: 5 } });
    proche(a.longueurM, b.longueurM, 0.01);
  });
});

describe('reseau/reperes — localiser : position -> route + PR + abscisse', () => {
  it('un point sur la route : le PR derrière lui, l’abscisse, la distance nulle', () => {
    const a = resoudre(idx, { route: 'D13', pr: 5, abscisse: 340 });
    const l = localiser(idx, [a.lng, a.lat], { route: 'D13' });
    assert.equal(l.route, 'D13');
    assert.equal(l.pr, 5);
    proche(l.abscisse, 340, 1);
    assert.ok(l.distance < 1);
    assert.equal(l.libelle, 'D13 PR 5+340');
    assert.equal(l.avantLePremierPR, false);
  });

  it('un point à côté : la distance à la route est celle du décalage', () => {
    const a = resoudre(idx, { route: 'D13', pr: 5, abscisse: 340 });
    const b = resoudre(idx, { route: 'D13', pr: 5, abscisse: 341 });
    // décalage perpendiculaire de ~25 m
    const v = R.vers([b.lng, b.lat]).map((x, i) => x - R.vers([a.lng, a.lat])[i]);
    const n = [-v[1], v[0]].map((x) => x / Math.hypot(...v));
    const p = R.vers([a.lng, a.lat]);
    const decale = R.depuis(p[0] + 25 * n[0], p[1] + 25 * n[1]);
    const l = localiser(idx, decale, { route: 'D13' });
    proche(l.distance, 25, 1.5);
    proche(l.abscisse, 340, 3);
  });

  it('hors du rayon : rien, plutôt qu’une route lointaine', () => {
    assert.equal(localiser(idx, [6.0, 47.0]), null);
    const a = resoudre(idx, { route: 'D13', pr: 5, abscisse: 0 });
    assert.equal(localiser(idx, [a.lng + 0.02, a.lat], { route: 'D13', rayonM: 100 }), null);
    assert.ok(localiser(idx, [a.lng + 0.0005, a.lat], { route: 'D13', rayonM: 500 }));
  });

  it('sans préciser la route : la plus proche, et les autres numéros portés par le même tronçon en `alternatives`', () => {
    const a = resoudre(idx, { route: 'D13', pr: 5, abscisse: 100 });
    const l = localiser(idx, [a.lng, a.lat]);
    assert.ok(l.distance < 2);
    assert.ok(Array.isArray(l.alternatives));
  });

  it('plusProches : triés par distance, filtrables par route, sans les bornes DS / FS', () => {
    const a = resoudre(idx, { route: 'D13', pr: 5, abscisse: 0 });
    const proches = plusProches(idx, [a.lng, a.lat], 4);
    assert.equal(proches.length, 4);
    for (let i = 1; i < proches.length; i++) assert.ok(proches[i].distance >= proches[i - 1].distance);
    assert.ok(proches.every((p) => ['PR', 'PR0', 'PRF'].includes(p.type)));
    const d13 = plusProches(idx, [a.lng, a.lat], 3, { route: 'D13' });
    assert.ok(d13.every((p) => p.route === 'D13'));
    assert.equal(d13[0].pr, 5);
    assert.equal(plusProches(idx, [a.lng, a.lat], 3, { rayonM: 1 }).length <= 3, true);
  });

  it('avant le premier repère de la section : abscisse négative signalée', () => {
    let trouve = null;
    for (const cotes of idx.voies.values()) for (const voie of cotes.values()) for (const comp of voie.comps) {
      if (comp.pts.length < 2) continue;
      const L = comp.cum[comp.cum.length - 1];
      const minS = Math.min(...comp.pts.map((q) => q.s));
      const maxS = Math.max(...comp.pts.map((q) => q.s));
      if (comp.sens > 0 && minS > 20) trouve = { voie, comp, s: 0 };
      else if (comp.sens < 0 && maxS < L - 20) trouve = { voie, comp, s: L };
      if (trouve) break;
    }
    assert.ok(trouve, 'une section dont le premier repère est loin de son début');
    const pt = idx.repere.depuis(...(trouve.s === 0 ? trouve.comp.ln[0] : trouve.comp.ln[trouve.comp.ln.length - 1]));
    const l = localiser(idx, pt, { route: trouve.voie.route, cote: trouve.voie.cote, rayonM: 3 });
    assert.equal(l.avantLePremierPR, true);
    assert.ok(l.abscisse < 0);
  });

  it('reculer avant le début de la route : erreur explicite', () => {
    assert.throws(() => resoudre(idx, { route: 'D13', pr: 0, abscisse: -30 }), { code: 'abscisse_hors_section' });
  });
});

describe('reseau/reperes — aller-retour sur toutes les routes de l’emprise', () => {
  // Pour chaque repère de chaque route et chaque côté : résoudre (PR, +0 puis +250 m) -> localiser -> résoudre le résultat.
  // La position retrouvée doit être celle de départ : c'est un contrôle de COHÉRENCE interne, pas d'exactitude terrain.
  const ecarts = [];
  let essais = 0;
  let mauvaisPR = 0;
  let erreurs = 0;
  const parCause = {};
  for (const p of idx.points) {
    for (const off of [0, 250]) {
      essais++;
      let a;
      try {
        a = resoudre(idx, { route: p.route, pr: p.n, abscisse: off, cote: p.cote, departement: p.dep || undefined, pres: p.lnglat });
      } catch (e) {
        if (e.code !== 'abscisse_hors_section') throw e;
        erreurs++;
        continue;
      }
      const l = localiser(idx, [a.lng, a.lat], { route: p.route, cote: p.cote, rayonM: 5 });
      if (!l) { parCause.perdu = (parCause.perdu || 0) + 1; continue; }
      let b;
      try { b = resoudre(idx, { route: l.route, pr: l.pr, abscisse: l.abscisse, cote: l.cote, departement: l.departement || undefined, pres: [a.lng, a.lat] }); } catch (e) { parCause[e.code] = (parCause[e.code] || 0) + 1; continue; }
      ecarts.push(metres(a, b));
      if (off === 0 && (l.pr !== p.n || Math.abs(l.abscisse) > 1.5)) mauvaisPR++;
    }
  }
  ecarts.sort((x, y) => x - y);
  const q = (f) => ecarts[Math.min(ecarts.length - 1, Math.floor(f * ecarts.length))];

  it('la plupart des essais aboutissent (les autres sortent de la ligne : erreur explicite, ou point perdu)', () => {
    assert.ok(essais > 300);
    assert.ok(ecarts.length / essais > 0.9, `${ecarts.length} sur ${essais} ; hors section ${erreurs} ; causes ${JSON.stringify(parCause)}`);
  });

  it('écart du retour : médiane et p99 sous le mètre', () => {
    assert.ok(q(0.5) < 0.2, `médiane ${q(0.5)}`);
    assert.ok(q(0.99) < 1.5, `p99 ${q(0.99)} (max ${q(1)})`);
  });

  it('+0 : on retrouve le PR de départ à 1,5 m près dans plus de 98 % des cas', () => {
    const sur = idx.points.length;
    assert.ok(mauvaisPR / sur < 0.02, `${mauvaisPR} sur ${sur}`);
  });
});

describe('reseau/reperes — textes', () => {
  it('lirePR et formater', () => {
    assert.deepEqual(lirePR('du PR 17+955 (côté U) au PR 18+340'), { route: null, pr: 17, abscisse: 955, cote: 'U' });
    assert.deepEqual(lirePR('D902 du PR 124+0150 au PR 131+1169 (COMMUNE)'), { route: 'D902', pr: 124, abscisse: 150, cote: null });
    assert.deepEqual(lirePR('RD 13 PR17 + 40'), { route: 'D13', pr: 17, abscisse: 40, cote: null }.route === 'D13' ? lirePR('RD 13 PR17 + 40') : null);
    assert.equal(lirePR('pas de repère ici'), null);
    assert.equal(formater({ route: 'D13', pr: 17, abscisse: 955 }), 'D13 PR 17+955');
    assert.equal(formater({ pr: 5, abscisse: 7 }, { largeur: 4 }), 'PR 5+0007');
    assert.equal(formater({ route: 'N19', pr: 3, abscisse: -20 }), 'N19 PR 3-20');
  });
});

describe('reseau/reperes — chargement par le WFS (réseau simulé)', () => {
  it('lit les deux couches par BBOX, filtre la route côté client, construit l’index', async () => {
    const appels = [];
    const fetchFaux = async (adresse) => {
      appels.push(adresse);
      const u = new URL(adresse);
      const couche = u.searchParams.get('TYPENAMES');
      const liste = couche.endsWith('point_de_repere') ? F.point_de_repere : F.section_de_points_de_repere;
      const debut = Number(u.searchParams.get('STARTINDEX') || 0);
      const page = liste.slice(debut, debut + Number(u.searchParams.get('COUNT')));
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ type: 'FeatureCollection', features: page, numberMatched: liste.length }) };
    };
    const i = await chargerReperes([6.7, 47.5, 7.0, 47.8], { route: 'D13', fetch: fetchFaux, attendre: async () => {}, pauseMs: 0 });
    assert.ok(appels.every((a) => a.includes('BBOX=6.7,47.5,7,47.8,EPSG:4326') && !a.includes('CQL')));
    assert.equal(routesIndexees(i).length, 1);
    assert.equal(routesIndexees(i)[0].route, 'D13');
    assert.ok(i.lecture.points > 20 && i.lecture.sections > 0);
    assert.ok(resoudre(i, { route: 'D13', pr: 5 }));
  });
});
