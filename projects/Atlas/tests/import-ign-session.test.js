import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { creerSession } from '../lib/import-ign-session.js';
import { appliquerStyle, creerCoucheIgn } from '../lib/import-ign-couche.js';
import { PRESETS, styleDeCouche } from '../lib/import-ign.js';

const lireFixture = (nom) => readFileSync(fileURLToPath(new URL(`./fixtures/import-ign/${nom}`, import.meta.url)), 'utf8');
const batiment = JSON.parse(lireFixture('batiment.json')).features[0];
const route = JSON.parse(lireFixture('troncon_de_route.json')).features[0];
const hitsXml = (n) => lireFixture('hits-batiment.xml').replace(/numberMatched="\d+"/, `numberMatched="${n}"`);

const reponse = (status, texte) => ({ ok: status < 400, status, text: async () => texte, headers: { get: () => null } });

/**
 * Un WFS factice : `total` objets d'un modèle réel, de `cleabs` distincts, servis par pages comme le service.
 * `pannes` : { page: n° de requête (1 = la première) → comportement }.
 */
function serviceFactice({ total, modele = batiment, jusqua = Infinity, retard = null }) {
  const appels = [];
  const f = async (adresse, opts = {}) => {
    appels.push(adresse);
    if (retard) await retard(appels.length, opts);
    if (opts.signal?.aborted) throw Object.assign(new Error('abandon'), { name: 'AbortError' });
    const q = new URL(adresse).searchParams;
    if (q.get('RESULTTYPE') === 'hits') return reponse(200, hitsXml(total));
    const debut = Number(q.get('STARTINDEX'));
    const count = Number(q.get('COUNT'));
    const features = [];
    for (let i = debut; i < Math.min(total, debut + count); i++) {
      features.push({ ...modele, id: `x.${i}`, properties: { ...modele.properties, cleabs: `OBJ${String(i).padStart(8, '0')}` } });
    }
    if (appels.length > jusqua) return reponse(503, 'indisponible');
    return reponse(200, JSON.stringify({ type: 'FeatureCollection', features, numberMatched: total, numberReturned: features.length }));
  };
  f.appels = appels;
  return f;
}

/** Une couche factice qui a la forme de ce que `makeLayer` rend. */
function creerCoucheFactice(nom, geom, geojson) {
  return {
    id: 'layer-1', name: nom, color: '#123456', geometryType: geom, source: 'import', geojson,
    style: { mode: 'mapbox', symbolization: {
      color: { mode: 'single', field: null, value: '#123456', palette: 'Tableau10', categories: [], defaultColor: '#999999' },
      size: { mode: 'single', field: null, value: 12, outputRange: [4, 24], method: 'linear' },
      label: { enabled: false, field: null }, opacity: null,
    } },
  };
}

const EMPRISE = [5.37, 43.293, 5.38, 43.3];

function hoteDe(service, extra = {}) {
  const ajoutees = [];
  const changements = [];
  let emprise = EMPRISE;
  const hote = {
    fetch: service, emprise: () => emprise, creerCouche: creerCoucheFactice, ajouterCouche: (c) => ajoutees.push(c),
    attendre: async () => {}, surChangement: (e) => changements.push(e.phase), ...extra,
  };
  return { hote, ajoutees, changements, deplacer: (e) => { emprise = e; } };
}

describe('import-ign-session — estimer avant d’importer', () => {
  it('choisir un jeu estime la zone visible sans télécharger un seul objet', async () => {
    const service = serviceFactice({ total: 2178 });
    const { hote } = hoteDe(service);
    const s = creerSession(hote);
    await s.choisir('batiments');
    const e = s.etat();
    assert.equal(e.phase, 'pret');
    assert.equal(e.jeu.id, 'batiments');
    assert.equal(e.estimation.n, 2178);
    assert.equal(e.estimation.decision.ok, true);
    assert.ok(e.estimation.dureeEstimeeS > 0);
    assert.equal(service.appels.length, 1);
    assert.match(service.appels[0], /RESULTTYPE=hits/);
  });

  it('plus de 5 000 objets : permis, avec avertissement ; plus de 50 000 : refusé, il faut zoomer', async () => {
    const a = creerSession(hoteDe(serviceFactice({ total: 12000 })).hote);
    await a.choisir('batiments');
    assert.equal(a.etat().phase, 'pret');
    assert.equal(a.etat().estimation.evaluation.niveau, 'avertir');
    const b = creerSession(hoteDe(serviceFactice({ total: 577215 })).hote);
    await b.choisir('batiments');
    assert.equal(b.etat().phase, 'refuse');
    assert.match(b.etat().estimation.decision.message, /Zoomez/);
    await b.importer();
    assert.equal(b.etat().phase, 'refuse', 'un import refusé ne part pas');
  });

  it('zone vide : refusée avec son message', async () => {
    const s = creerSession(hoteDe(serviceFactice({ total: 0 })).hote);
    await s.choisir('routes');
    assert.equal(s.etat().phase, 'refuse');
    assert.match(s.etat().estimation.decision.message, /Aucun objet/);
  });

  it('zone trop grande pour le jeu : refusée AVANT toute requête, en nommant le jeu', async () => {
    const service = serviceFactice({ total: 5 });
    const h = hoteDe(service);
    h.deplacer([5, 43, 6, 44]);
    const s = creerSession(h.hote);
    await s.choisir('batiments');
    assert.equal(s.etat().phase, 'refuse');
    assert.match(s.etat().erreur.message, /Bâtiments/);
    assert.equal(service.appels.length, 0);
  });

  it('le service répond en erreur (XML) : phase erreur, message en français, on peut réessayer', async () => {
    let panne = true;
    const f = async (adresse) => {
      if (panne) return reponse(400, lireFixture('exception-couche-inconnue.xml'));
      return reponse(200, hitsXml(40));
    };
    const s = creerSession(hoteDe(f).hote);
    await s.choisir('routes');
    let e = s.etat();
    assert.equal(e.phase, 'erreur');
    assert.equal(e.etape, 'estimation');
    assert.equal(e.erreur.code, 'exception_ogc');
    assert.match(e.erreur.message, /service de l’IGN a refusé/);
    panne = false;
    await s.reessayer();
    e = s.etat();
    assert.equal(e.phase, 'pret');
    assert.equal(e.estimation.n, 40);
  });

  it('la zone qui bouge relance l’estimation ; une réponse arrivée trop tard est ignorée', async () => {
    const reponses = [];
    const f = async (adresse) => new Promise((resolve) => {
      const n = reponses.length + 1;
      reponses.push(() => resolve(reponse(200, hitsXml(n === 1 ? 111 : 222))));
    });
    const h = hoteDe(f);
    const s = creerSession(h.hote);
    const p1 = s.choisir('routes');
    await Promise.resolve();
    const p2 = s.majEmprise([5.38, 43.3, 5.39, 43.31]);
    await Promise.resolve();
    assert.equal(reponses.length, 2);
    reponses[1]();    // la seconde répond d'abord
    await p2;
    reponses[0]();    // la première, périmée, arrive après
    await p1;
    const e = s.etat();
    assert.equal(e.estimation.n, 222);
    assert.equal(e.phase, 'pret');
  });

  it('la même zone ne relance rien', async () => {
    const service = serviceFactice({ total: 10 });
    const s = creerSession(hoteDe(service).hote);
    await s.choisir('routes');
    await s.majEmprise([...EMPRISE]);
    assert.equal(service.appels.length, 1);
  });
});

describe('import-ign-session — importer', () => {
  it('importe tout, crée UNE couche stylée avec sa provenance, et dit ce qui a été fait', async () => {
    const service = serviceFactice({ total: 4500 });
    const h = hoteDe(service);
    const s = creerSession(h.hote);
    await s.choisir('batiments');
    await s.importer();
    const e = s.etat();
    assert.equal(e.phase, 'termine');
    assert.equal(e.resultat.importes, 4500);
    assert.equal(e.resultat.estimes, 4500);
    assert.equal(e.resultat.refuses, 0);
    assert.equal(e.resultat.doublons, 0);
    assert.ok(e.resultat.dureeMs >= 0);
    assert.equal(h.ajoutees.length, 1);
    const couche = h.ajoutees[0];
    assert.equal(couche.name, 'Bâtiments IGN');
    assert.equal(couche.geometryType, 'Polygon');
    assert.equal(couche.geojson.features.length, 4500);
    assert.equal(couche.style.polygonMode, 'extruded');
    assert.equal(couche.heightField, 'hauteur');
    assert.equal(couche.style.heightField, 'hauteur');
    assert.equal(couche.style.provenance.source, 'IGN');
    assert.equal(couche.style.provenance.importes, 4500);
    assert.equal(couche.style.provenance.estimes, 4500);
    // pages de 2000 : 3 pages de données + 1 décompte
    assert.equal(service.appels.length, 4);
  });

  it('suit la progression page après page', async () => {
    const s = creerSession(hoteDe(serviceFactice({ total: 4500 })).hote);
    const vues = [];
    const h = hoteDe(serviceFactice({ total: 4500 }), { surChangement: (e) => { if (e.phase === 'import' && e.progression) vues.push(e.progression.fait); } });
    const t = creerSession(h.hote);
    await t.choisir('batiments');
    await t.importer();
    assert.deepEqual(vues.filter((v, i, a) => a.indexOf(v) === i), [0, 2000, 4000, 4500]);
    assert.ok(s);
  });

  it('les objets refusés sont comptés avec leur motif, et la couche garde les autres', async () => {
    const mauvais = { ...batiment, geometry: { type: 'Point', coordinates: [5.37, 43.29] } };
    let n = 0;
    const base = serviceFactice({ total: 10 });
    const f = async (adresse, o) => {
      const r = await base(adresse, o);
      if (new URL(adresse).searchParams.get('RESULTTYPE') === 'hits') return r;
      const j = JSON.parse(await r.text());
      j.features = j.features.map((x, i) => (i % 5 === 0 ? { ...mauvais, id: x.id, properties: x.properties } : x));
      n++;
      return reponse(200, JSON.stringify(j));
    };
    const h = hoteDe(f);
    const s = creerSession(h.hote);
    await s.choisir('batiments');
    await s.importer();
    const e = s.etat();
    assert.equal(e.phase, 'termine');
    assert.equal(e.resultat.importes, 8);
    assert.equal(e.resultat.refuses, 2);
    assert.equal(e.resultat.motifs[0].code, 'geometrie_autre_famille');
    assert.deepEqual(e.resultat.motifs[0].exemples, [0, 5]);
    assert.equal(n, 1);
  });

  it('aucun objet gardé : pas de couche vide', async () => {
    const mauvais = { ...batiment, geometry: null };
    const f = async (adresse) => {
      if (new URL(adresse).searchParams.get('RESULTTYPE') === 'hits') return reponse(200, hitsXml(2));
      return reponse(200, JSON.stringify({ type: 'FeatureCollection', numberMatched: 2, features: [mauvais, { ...mauvais, properties: { ...mauvais.properties, cleabs: 'B2' } }] }));
    };
    const h = hoteDe(f);
    const s = creerSession(h.hote);
    await s.choisir('batiments');
    await s.importer();
    assert.equal(s.etat().phase, 'termine');
    assert.equal(s.etat().resultat.importes, 0);
    assert.equal(s.etat().resultat.couche, null);
    assert.equal(h.ajoutees.length, 0);
  });

  it('la zone est relue à plat avant l’import ; si elle a changé, on réestime avant de partir', async () => {
    const service = serviceFactice({ total: 100, modele: route });
    const aplati = [5.371, 43.2935, 5.379, 43.2995];
    const h = hoteDe(service, { emprisePourImport: async () => aplati });
    const s = creerSession(h.hote);
    await s.choisir('routes');
    await s.importer();
    assert.equal(s.etat().phase, 'termine');
    const hits = service.appels.filter((a) => /RESULTTYPE=hits/.test(a));
    assert.equal(hits.length, 2, 'estimé deux fois');
    const donnees = service.appels.find((a) => /COUNT=/.test(a));
    assert.match(donnees, /BBOX=5\.371,43\.2935,5\.379,43\.2995/);
    assert.deepEqual(h.ajoutees[0].style.provenance.emprise, aplati);
  });

  it('la zone qui bouge pendant l’import ne change pas la zone importée', async () => {
    const service = serviceFactice({ total: 5000 });
    const h = hoteDe(service);
    const s = creerSession(h.hote);
    await s.choisir('batiments');
    const p = s.importer();
    await Promise.resolve(); await Promise.resolve();
    await s.majEmprise([5.5, 43.5, 5.51, 43.51]);
    await p;
    assert.equal(s.etat().phase, 'termine');
    assert.deepEqual(h.ajoutees[0].style.provenance.emprise, EMPRISE);
    assert.equal(service.appels.filter((a) => /RESULTTYPE=hits/.test(a)).length, 1);
  });
});

describe('import-ign-session — annuler et reprendre', () => {
  it('annuler en cours d’import ne crée aucune couche, garde ce qui est lu, et se reprend sans doublon', async () => {
    const service = serviceFactice({ total: 6000 });
    const h = hoteDe(service);
    let s;
    h.hote.surChangement = (e) => { if (e.phase === 'import' && e.progression?.fait === 2000 && !s._deja) { s._deja = true; s.annuler(); } };
    s = creerSession(h.hote);
    await s.choisir('batiments');
    await s.importer();
    let e = s.etat();
    assert.equal(e.phase, 'annule');
    assert.equal(e.reprenable, true);
    assert.equal(h.ajoutees.length, 0);
    assert.equal(e.progression.fait, 2000);
    await s.reprendre();
    e = s.etat();
    assert.equal(e.phase, 'termine');
    assert.equal(e.resultat.importes, 6000);
    assert.equal(e.resultat.doublons, 0);
    assert.equal(new Set(h.ajoutees[0].geojson.features.map((f) => f.properties.cleabs)).size, 6000);
    // la reprise a demandé la page suivante, pas la première
    const demandes = service.appels.filter((a) => /COUNT=/.test(a)).map((a) => Number(new URL(a).searchParams.get('STARTINDEX')));
    assert.deepEqual(demandes, [0, 2000, 4000]);
  });

  it('une panne en cours d’import n’efface rien et se reprend', async () => {
    const service = serviceFactice({ total: 6000, jusqua: 2 });   // décompte + 1re page, puis 503 jusqu'à épuisement des essais
    const h = hoteDe(service);
    const s = creerSession(h.hote);
    await s.choisir('batiments');
    await s.importer();
    let e = s.etat();
    assert.equal(e.phase, 'erreur');
    assert.equal(e.etape, 'import');
    assert.equal(e.reprenable, true);
    assert.match(e.erreur.message, /indisponible/);
    assert.equal(e.progression.fait, 2000);
    assert.equal(h.ajoutees.length, 0);
    // le service revient
    const bon = serviceFactice({ total: 6000 });
    h.hote.fetch = bon;
    await s.reprendre();
    e = s.etat();
    assert.equal(e.phase, 'termine');
    assert.equal(e.resultat.importes, 6000);
  });

  it('on ne peut pas reprendre ce qui n’a pas été interrompu', async () => {
    const s = creerSession(hoteDe(serviceFactice({ total: 10 })).hote);
    await s.choisir('routes');
    await s.reprendre();
    assert.equal(s.etat().phase, 'pret');
  });

  it('réinitialiser jette ce qui était lu et revient au choix', async () => {
    const service = serviceFactice({ total: 6000 });
    const h = hoteDe(service);
    let s;
    h.hote.surChangement = (e) => { if (e.phase === 'import' && e.progression?.fait === 2000) s.annuler(); };
    s = creerSession(h.hote);
    await s.choisir('batiments');
    await s.importer();
    assert.equal(s.etat().phase, 'annule');
    s.reinitialiser();
    const e = s.etat();
    assert.equal(e.phase, 'choix');
    assert.equal(e.jeu, null);
    assert.equal(e.reprenable, false);
    await s.reprendre();
    assert.equal(s.etat().phase, 'choix');
  });

  it('fermer abandonne l’estimation en cours', async () => {
    let signal = null;
    const f = (adresse, o) => new Promise((resolve, rejet) => { signal = o.signal; o.signal.addEventListener('abort', () => rejet(Object.assign(new Error('x'), { name: 'AbortError' }))); });
    const s = creerSession(hoteDe(f).hote);
    const p = s.choisir('routes');
    await Promise.resolve();
    s.fermer();
    await p;
    assert.equal(signal.aborted, true);
  });
});

describe('import-ign-couche — le style posé sur la couche d’Atlas', () => {
  const entites = [
    { type: 'Feature', geometry: route.geometry, properties: { cleabs: 'A', importance: '3' } },
    { type: 'Feature', geometry: route.geometry, properties: { cleabs: 'B', importance: '6' } },
  ];

  it('routes : catégories de couleur par importance, largeur graduée à l’envers (la plus forte est la plus large)', () => {
    const c = creerCoucheIgn({ preset: PRESETS.routes, entites, emprise: EMPRISE, creerCouche: creerCoucheFactice });
    const sym = c.style.symbolization;
    assert.equal(sym.color.mode, 'categorized');
    assert.equal(sym.color.field, 'importance');
    assert.equal(sym.color.categories.length, 6);
    assert.deepEqual(sym.size, { mode: 'graduated', field: 'importance', value: 12, outputRange: [7, 1.5], method: 'linear' });
    assert.equal(c.geometryType, 'LineString');
    assert.equal(c.style.polygonMode, undefined);
  });

  it('une seule importance : largeur fixe, pas de graduation que MapLibre refuserait', () => {
    const c = creerCoucheIgn({ preset: PRESETS.routes, entites: [entites[0]], emprise: EMPRISE, creerCouche: creerCoucheFactice });
    assert.equal(c.style.symbolization.size.mode, 'single');
    assert.ok(c.style.symbolization.size.value > 1.5);
  });

  it('communes : à plat, fond léger, nom en étiquette', () => {
    const c = creerCoucheIgn({ preset: PRESETS.communes, entites: [], emprise: EMPRISE, creerCouche: creerCoucheFactice });
    assert.equal(c.style.polygonMode, 'flat');
    assert.equal(c.style.symbolization.opacity, 0.25);
    assert.equal(c.style.symbolization.label.enabled, true);
    assert.equal(c.style.symbolization.label.field, 'nom_officiel');
    assert.equal(c.color, '#e07a5f');
  });

  it('équipements : une couleur par catégorie présente dans les objets', () => {
    const es = [{ type: 'Feature', geometry: route.geometry, properties: { cleabs: 'A', categorie: 'Santé' } }, { type: 'Feature', geometry: route.geometry, properties: { cleabs: 'B', categorie: 'Culte' } }];
    const c = creerCoucheIgn({ preset: PRESETS.equipements_services, entites: es, emprise: EMPRISE, creerCouche: creerCoucheFactice });
    assert.equal(c.style.symbolization.color.mode, 'categorized');
    assert.equal(c.style.symbolization.color.field, 'categorie');
    assert.deepEqual(c.style.symbolization.color.categories.map((x) => x.value).sort(), ['Culte', 'Santé']);
  });

  it('la provenance voyage avec le style : elle survit à une copie JSON', () => {
    const c = creerCoucheIgn({ preset: PRESETS.routes, entites, emprise: EMPRISE, estimes: 2, creerCouche: creerCoucheFactice });
    const copie = JSON.parse(JSON.stringify(c.style));
    assert.equal(copie.provenance.licence.nom, 'Licence Ouverte 2.0');
    assert.equal(copie.provenance.estimes, 2);
  });

  it('refuse une couche qui n’a pas de symbolisation, plutôt que de la fabriquer de travers', () => {
    assert.throws(() => appliquerStyle({ style: {} }, styleDeCouche(PRESETS.routes, [])), /symbolisation/);
  });
});
