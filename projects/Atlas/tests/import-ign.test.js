import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PRESETS, PRODUITS, LICENCE, listerPresets, presetsParGroupe, presetDe, empriseDepuisBornes, libelleEmprise, verifierEmprise,
  estimer, pagesDe, normaliserGeometrie, normaliserEntite, cleDeEntite, derniereModification, metadonneesCouche,
  phraseProvenance, styleDeCouche, messageErreurImport, decisionImport, estimerDuree,
} from '../lib/import-ign.js';
import { ErreurWfs } from '../lib/reseau/wfs-bdtopo.js';
import { evaluerVolume } from '../lib/import-lots.js';

const dossier = (nom) => fileURLToPath(new URL(`./fixtures/import-ign/${nom}`, import.meta.url));
const lire = (nom) => readFileSync(dossier(nom), 'utf8');
const fixture = (nom) => JSON.parse(lire(`${nom}.json`));

/** Pour chaque jeu, l'extrait réel du service (relevé le 10/10/2026) qui prouve ses noms de couche et d'attributs. */
const FIXTURES = {
  routes: 'troncon_de_route', batiments: 'batiment', cours_d_eau: 'cours_d_eau', plans_d_eau: 'plan_d_eau',
  surfaces_en_eau: 'surface_hydrographique', vegetation: 'zone_de_vegetation', voies_ferrees: 'troncon_de_voie_ferree',
  reperes: 'point_de_repere', communes: 'commune', departements: 'departement', equipements_services: 'zone_d_activite_ou_d_interet',
};

/** Attributs que certaines couches n'ont pas : les couches d'Admin Express n'ont pas de date de modification. */
const ABSENTS_ADMIS = { communes: ['date_modification'], departements: ['date_modification'] };

const emprise = [5.37, 43.293, 5.38, 43.3];

describe('import-ign — le catalogue est vérifié contre des réponses réelles', () => {
  it('chaque jeu a un extrait réel, et chacun des extraits est un jeu', () => {
    assert.deepEqual(Object.keys(FIXTURES).sort(), Object.keys(PRESETS).sort());
  });

  for (const [id, nom] of Object.entries(FIXTURES)) {
    it(`${id} : couche, attributs et géométrie correspondent à ce que le service a rendu`, () => {
      const p = PRESETS[id];
      const f = fixture(nom);
      assert.ok(f.features.length >= 1, 'extrait vide');
      assert.ok(p.couche.endsWith(`:${nom}`), `couche ${p.couche} / extrait ${nom}`);
      const connus = new Set(Object.keys(f.features[0].properties));
      const manquants = p.attributs.filter((a) => !connus.has(a) && !(ABSENTS_ADMIS[id] || []).includes(a));
      assert.deepEqual(manquants, [], `attributs inconnus du service : ${manquants.join(', ')}`);
      assert.ok(p.attributs.includes('cleabs'), 'cleabs (identifiant stable) doit être gardé');
      // La famille annoncée est celle du service, à « Multi » près.
      for (const e of f.features) assert.ok([p.famille, `Multi${p.famille}`].includes(e.geometry.type), `${e.geometry.type} pour ${p.famille}`);
    });
  }

  it('un jeu qui a une date de modification dans le service la garde (mise à jour future)', () => {
    for (const [id, p] of Object.entries(PRESETS)) {
      if (ABSENTS_ADMIS[id]) continue;
      assert.ok(p.attributs.includes('date_modification'), `${id} : date_modification non gardée`);
    }
  });

  it('chaque jeu est complet : identifiant, libellé, icône, groupe, produit connu, page et côté raisonnables', () => {
    for (const p of listerPresets()) {
      assert.equal(PRESETS[p.id], p);
      for (const k of ['libelle', 'icone', 'groupe', 'description', 'couche', 'famille', 'nomCouche', 'ordreDeGrandeur']) {
        assert.ok(typeof p[k] === 'string' && p[k].length > 2, `${p.id}.${k}`);
      }
      assert.ok(PRODUITS[p.produit], `${p.id} : produit ${p.produit}`);
      assert.ok(['Point', 'LineString', 'Polygon'].includes(p.famille));
      assert.ok(p.page >= 1 && p.page <= 5000, `${p.id} : page ${p.page}`);
      assert.ok(p.coteMaxDeg > 0 && p.coteMaxDeg <= 1, `${p.id} : côté ${p.coteMaxDeg}`);
      assert.ok(Array.isArray(p.avertissements));
    }
  });

  it('il y a de quoi faire tout ce que la mission demande', () => {
    const ids = Object.keys(PRESETS);
    for (const attendu of ['routes', 'batiments', 'cours_d_eau', 'plans_d_eau', 'vegetation', 'voies_ferrees', 'reperes', 'communes', 'departements', 'equipements_services']) {
      assert.ok(ids.includes(attendu), attendu);
    }
  });

  it('les limites administratives viennent d’Admin Express, le reste de la BD TOPO', () => {
    assert.match(PRESETS.communes.couche, /^ADMINEXPRESS-COG-CARTO\.LATEST:commune$/);
    assert.match(PRESETS.departements.couche, /^ADMINEXPRESS-COG-CARTO\.LATEST:departement$/);
    for (const id of ['routes', 'batiments', 'vegetation']) assert.match(PRESETS[id].couche, /^BDTOPO_V3:/);
  });

  it('presetsParGroupe garde l’ordre du catalogue et ne perd aucun jeu', () => {
    const g = presetsParGroupe();
    assert.equal(g.flatMap((x) => x.jeux).length, listerPresets().length);
    assert.deepEqual(g.map((x) => x.groupe), [...new Set(listerPresets().map((p) => p.groupe))]);
  });

  it('presetDe : un jeu inconnu est une erreur claire', () => {
    assert.equal(presetDe('routes'), PRESETS.routes);
    assert.throws(() => presetDe('nexistepas'), { code: 'parametre_invalide' });
  });
});

describe('import-ign — l’emprise', () => {
  it('depuis les bornes d’une carte MapLibre, arrondie au mètre', () => {
    const b = { getWest: () => 5.370004, getSouth: () => 43.2930049, getEast: () => 5.38, getNorth: () => 43.3 };
    assert.deepEqual(empriseDepuisBornes(b), [5.37, 43.293, 5.38, 43.3]);
    assert.deepEqual(empriseDepuisBornes([5.1234567, 43, 5.2, 43.1]), [5.12346, 43, 5.2, 43.1]);
    assert.throws(() => empriseDepuisBornes({}), { code: 'emprise_invalide' });
    assert.throws(() => empriseDepuisBornes(null), { code: 'emprise_invalide' });
  });

  it('se lit comme dans le panneau OpenStreetMap : sud, ouest → nord, est', () => {
    assert.equal(libelleEmprise(emprise), '43.2930, 5.3700 → 43.3000, 5.3800');
  });

  it('jamais de requête sans emprise', () => {
    assert.throws(() => verifierEmprise(PRESETS.routes, null), { code: 'emprise_invalide' });
    assert.throws(() => pagesDe(PRESETS.routes, undefined), { code: 'emprise_invalide' });
  });

  it('refuse une zone trop grande pour le jeu, avant toute requête', async () => {
    const jamais = async () => { throw new Error('aucune requête attendue'); };
    await assert.rejects(estimer(PRESETS.batiments, [5, 43, 6, 44], { fetch: jamais }), { code: 'emprise_trop_grande' });
    // un jeu rare (limites de communes) accepte jusqu’à un degré
    assert.doesNotThrow(() => verifierEmprise(PRESETS.communes, [5, 43, 6, 44]));
    assert.throws(() => verifierEmprise(PRESETS.communes, [5, 43, 6.2, 44]), { code: 'emprise_trop_grande' });
  });

  it('estimer interroge le décompte (resultType=hits) avec la bonne couche et l’emprise en BBOX', async () => {
    const appels = [];
    const f = async (adresse) => { appels.push(adresse); return { ok: true, status: 200, text: async () => lire('hits-batiment.xml'), headers: { get: () => null } }; };
    assert.equal(await estimer(PRESETS.batiments, emprise, { fetch: f }), 2178);
    const u = new URL(appels[0]);
    assert.equal(u.searchParams.get('RESULTTYPE'), 'hits');
    assert.equal(u.searchParams.get('TYPENAMES'), 'BDTOPO_V3:batiment');
    assert.equal(u.searchParams.get('BBOX'), '5.37,43.293,5.38,43.3,EPSG:4326');
    assert.equal(u.searchParams.get('CQL_FILTER'), null);
  });

  it('une erreur XML du service est remontée telle quelle, en clair', async () => {
    const f = async () => ({ ok: false, status: 400, text: async () => lire('exception-couche-inconnue.xml'), headers: { get: () => null } });
    await assert.rejects(estimer(PRESETS.routes, emprise, { fetch: f }), (e) => e.code === 'exception_ogc' && /unknown/.test(e.message));
  });
});

describe('import-ign — la géométrie', () => {
  it('retire l’altitude des positions et arrondit au centimètre', () => {
    const r = normaliserGeometrie({ type: 'LineString', coordinates: [[5.379214431, 43.297483312, 9.6], [5.37911701, 43.29786974, 9.8]] }, 'LineString');
    assert.deepEqual(r.geometry, { type: 'LineString', coordinates: [[5.3792144, 43.2974833], [5.379117, 43.2978697]] });
  });

  it('un MultiLineString d’une partie devient une ligne ; de plusieurs parties, il reste UN objet', () => {
    const une = normaliserGeometrie({ type: 'MultiLineString', coordinates: [[[1, 2, 5], [1, 3, 6]]] }, 'LineString');
    assert.equal(une.geometry.type, 'LineString');
    assert.deepEqual(une.geometry.coordinates, [[1, 2], [1, 3]]);
    const deux = normaliserGeometrie({ type: 'MultiLineString', coordinates: [[[1, 2], [1, 3]], [[4, 5], [4, 6]]] }, 'LineString');
    assert.equal(deux.geometry.type, 'MultiLineString');
    assert.equal(deux.geometry.coordinates.length, 2);
  });

  it('un MultiPolygon d’un polygone devient un polygone, l’altitude de chaque sommet est retirée', () => {
    const anneau = [[1, 1, 4], [1, 2, 4], [2, 2, 4], [1, 1, 4]];
    const r = normaliserGeometrie({ type: 'MultiPolygon', coordinates: [[anneau]] }, 'Polygon');
    assert.equal(r.geometry.type, 'Polygon');
    assert.deepEqual(r.geometry.coordinates, [[[1, 1], [1, 2], [2, 2], [1, 1]]]);
  });

  it('refuse, avec son motif : autre famille, vide, anneau ouvert, ligne d’un point, position hors du globe', () => {
    const motif = (g, famille) => normaliserGeometrie(g, famille).refus?.code;
    assert.equal(motif({ type: 'Point', coordinates: [1, 2] }, 'Polygon'), 'geometrie_autre_famille');
    assert.equal(motif({ type: 'GeometryCollection', coordinates: [] }, 'Polygon'), 'geometrie_autre_famille');
    assert.equal(motif(null, 'Polygon'), 'geometrie_absente');
    assert.equal(motif({ type: 'MultiPolygon', coordinates: [] }, 'Polygon'), 'geometrie_absente');
    assert.equal(motif({ type: 'Polygon', coordinates: [[[1, 1], [1, 2], [2, 2], [3, 3]]] }, 'Polygon'), 'geometrie_invalide');
    assert.equal(motif({ type: 'LineString', coordinates: [[1, 1]] }, 'LineString'), 'geometrie_invalide');
    assert.equal(motif({ type: 'LineString', coordinates: [[1, 1], [200, 5]] }, 'LineString'), 'geometrie_invalide');
    assert.equal(motif({ type: 'LineString', coordinates: [[1, 1], [NaN, 5]] }, 'LineString'), 'geometrie_invalide');
  });

  it('un point reste un point', () => {
    assert.deepEqual(normaliserGeometrie({ type: 'Point', coordinates: [4.4, 44.4, 120] }, 'Point').geometry, { type: 'Point', coordinates: [4.4, 44.4] });
  });
});

describe('import-ign — les objets, sur les extraits réels', () => {
  for (const [id, nom] of Object.entries(FIXTURES)) {
    it(`${id} : tout objet réel est gardé, avec son cleabs, sans altitude, avec seulement les attributs du jeu`, () => {
      const p = PRESETS[id];
      for (const f of fixture(nom).features) {
        const r = normaliserEntite(p, f);
        assert.ok(r.entite, `refusé : ${JSON.stringify(r.refus)}`);
        assert.equal(r.entite.type, 'Feature');
        assert.equal(r.entite.properties.cleabs, f.properties.cleabs);
        assert.equal(r.entite.id, undefined, 'l’identifiant du service ne doit pas être repris');
        for (const k of Object.keys(r.entite.properties)) assert.ok(p.attributs.includes(k), k);
        for (const v of Object.values(r.entite.properties)) assert.ok(v !== null && v !== '');
        // aucune altitude
        const aplatir = (c) => (typeof c[0] === 'number' ? [c] : c.flatMap(aplatir));
        for (const pos of aplatir(r.entite.geometry.coordinates)) assert.equal(pos.length, 2);
      }
    });
  }

  it('routes : cleabs et date_modification gardés, les attributs de sens et de voies aussi', () => {
    const f = fixture('troncon_de_route').features[0];
    const e = normaliserEntite(PRESETS.routes, f).entite;
    assert.equal(e.properties.cleabs, 'TRONROUT0000000040959830');
    assert.equal(e.properties.date_modification, '2023-09-09T09:15:02.959Z');
    assert.equal(e.properties.sens_de_circulation, 'Sens direct');
    assert.equal(e.properties.nombre_de_voies, 1);
    assert.equal(e.properties.importance, '5');
    assert.equal(e.geometry.type, 'LineString');
    assert.equal(e.properties.alias_gauche, undefined);
  });

  it('bâtiments : hauteur gardée ; un MultiPolygon d’une partie devient un polygone', () => {
    const f = fixture('batiment').features[0];
    assert.equal(f.geometry.type, 'MultiPolygon');
    const e = normaliserEntite(PRESETS.batiments, f).entite;
    assert.equal(e.properties.hauteur, 6.6);
    assert.equal(e.geometry.type, 'Polygon');
  });

  it('cours d’eau : la géométrie reste une ligne par cours d’eau', () => {
    const f = fixture('cours_d_eau').features[0];
    const e = normaliserEntite(PRESETS.cours_d_eau, f).entite;
    assert.ok(['LineString', 'MultiLineString'].includes(e.geometry.type));
    assert.equal(e.properties.toponyme, "l'Ibie");
  });

  it('communes : nom, code INSEE et population gardés', () => {
    const e = normaliserEntite(PRESETS.communes, fixture('commune').features[0]).entite;
    assert.equal(e.properties.nom_officiel, 'Marseille');
    assert.equal(e.properties.code_insee, '13055');
    assert.equal(e.properties.population, 886040);
  });

  it('refuse un objet sans cleabs, ou sans géométrie, avec son motif', () => {
    const f = fixture('batiment').features[0];
    assert.equal(normaliserEntite(PRESETS.batiments, { ...f, properties: { ...f.properties, cleabs: null } }).refus.code, 'identifiant_absent');
    assert.equal(normaliserEntite(PRESETS.batiments, { ...f, geometry: null }).refus.code, 'geometrie_absente');
    assert.equal(normaliserEntite(PRESETS.routes, f).refus.code, 'geometrie_autre_famille');
    assert.equal(normaliserEntite(PRESETS.routes, undefined).refus.code, 'identifiant_absent');
  });

  it('la clé est cleabs, et la dernière modification vue en est déduite', () => {
    const es = fixture('troncon_de_route').features.map((f) => normaliserEntite(PRESETS.routes, f).entite);
    assert.equal(cleDeEntite(es[0]), es[0].properties.cleabs);
    const max = derniereModification(es);
    assert.ok(es.every((e) => e.properties.date_modification <= max));
    assert.equal(derniereModification([]), null);
    assert.equal(derniereModification(fixture('commune').features.map((f) => normaliserEntite(PRESETS.communes, f).entite)), null);
  });
});

describe('import-ign — la provenance', () => {
  const entites = fixture('troncon_de_route').features.map((f) => normaliserEntite(PRESETS.routes, f).entite);
  const m = metadonneesCouche(PRESETS.routes, { emprise, importes: entites.length, estimes: 459, entites, date: new Date('2026-10-10T12:00:00Z') });

  it('dit la source, le jeu, la licence et l’attribution à afficher', () => {
    assert.equal(m.source, 'IGN');
    assert.equal(m.jeu, 'BD TOPO®');
    assert.equal(m.licence.nom, 'Licence Ouverte 2.0');
    assert.match(m.licence.url, /^https:\/\//);
    assert.match(m.mention, /IGN/);
    assert.match(m.mention, /Licence Ouverte 2\.0/);
    assert.equal(m.cle, 'cleabs');
    assert.equal(m.champDateModification, 'date_modification');
    assert.equal(m.importeLe, '2026-10-10T12:00:00.000Z');
    assert.deepEqual(m.emprise, emprise);
    assert.equal(m.importes, entites.length);
    assert.equal(m.estimes, 459);
  });

  it('avertit du retard d’édition du WFS et date l’édition', () => {
    assert.match(m.avertissementEdition, /retard/);
    assert.equal(m.edition.annoncee, '2026-06-15');
    assert.ok(m.edition.derniereModificationVue);
    assert.match(phraseProvenance(m), /édition annoncée par le service : 2026-06-15/);
    assert.match(phraseProvenance(m), /Licence Ouverte 2\.0/);
  });

  it('Admin Express : pas de champ de modification, pas d’édition inventée', () => {
    const a = metadonneesCouche(PRESETS.communes, { emprise, importes: 1 });
    assert.equal(a.jeu, 'ADMIN EXPRESS');
    assert.equal(a.champDateModification, null);
    assert.equal(a.edition.annoncee, null);
    assert.match(phraseProvenance(a), /dernière édition publiée/);
  });

  it('l’attribution est du texte : aucune balise, aucun guillemet, aucune esperluette (elle part dans innerHTML)', () => {
    for (const prod of Object.values(PRODUITS)) assert.doesNotMatch(prod.mention, /[<>&"'`]/);
    assert.ok(LICENCE.conditions.startsWith('https://'));
  });

  it('la provenance se sérialise (elle voyage avec le projet)', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(m)), m);
  });
});

describe('import-ign — le style par défaut', () => {
  const routes = fixture('troncon_de_route').features.map((f) => normaliserEntite(PRESETS.routes, f).entite);

  it('routes : couleur par importance, six catégories ordonnées ; largeur graduée s’il y a plusieurs importances', () => {
    const avec = [{ properties: { importance: '3' } }, { properties: { importance: '6' } }];
    const s = styleDeCouche(PRESETS.routes, avec);
    assert.equal(s.couleur.mode, 'categorized');
    assert.equal(s.couleur.champ, 'importance');
    assert.deepEqual(s.couleur.categories.map((c) => c.value), ['1', '2', '3', '4', '5', '6']);
    assert.equal(new Set(s.couleur.categories.map((c) => c.color)).size, 6);
    assert.deepEqual(s.taille, { mode: 'graduated', champ: 'importance', plage: [7, 1.5] });
    assert.equal(s.polygonMode, null);
    // la plus forte importance est la plus large
    assert.ok(s.taille.plage[0] > s.taille.plage[1]);
  });

  it('routes : une seule importance dans la zone, la largeur devient fixe (Atlas refuserait des bornes égales)', () => {
    const s = styleDeCouche(PRESETS.routes, [{ properties: { importance: '5' } }, { properties: { importance: '5' } }]);
    assert.equal(s.taille.mode, 'single');
    assert.ok(s.taille.valeur > 1.5 && s.taille.valeur < 7);
    assert.equal(styleDeCouche(PRESETS.routes, []).taille.mode, 'single');
    assert.ok(routes.length > 0);
  });

  it('bâtiments : volume extrudé par la hauteur', () => {
    const s = styleDeCouche(PRESETS.batiments, []);
    assert.equal(s.polygonMode, 'extruded');
    assert.equal(s.champHauteur, 'hauteur');
    assert.equal(s.couleur.mode, 'single');
  });

  it('surfaces sans hauteur : à plat ; limites : fond léger avec nom en étiquette', () => {
    assert.equal(styleDeCouche(PRESETS.vegetation, []).polygonMode, 'flat');
    assert.equal(styleDeCouche(PRESETS.vegetation, []).champHauteur, null);
    const c = styleDeCouche(PRESETS.communes, []);
    assert.equal(c.polygonMode, 'flat');
    assert.ok(c.opacite > 0 && c.opacite < 0.5);
    assert.equal(c.etiquette, 'nom_officiel');
  });

  it('équipements : couleur par catégorie, tirée des données (rien d’écrit en dur), la plus fréquente d’abord', () => {
    const es = ['Santé', 'Culte', 'Santé', 'Sport', 'Santé', 'Culte'].map((categorie) => ({ properties: { categorie } }));
    const s = styleDeCouche(PRESETS.equipements_services, es);
    assert.equal(s.couleur.mode, 'categorized');
    assert.equal(s.couleur.champ, 'categorie');
    assert.deepEqual(s.couleur.categories.map((c) => c.value), ['Santé', 'Culte', 'Sport']);
    assert.equal(new Set(s.couleur.categories.map((c) => c.color)).size, 3);
    assert.deepEqual(styleDeCouche(PRESETS.equipements_services, []).couleur.categories, []);
  });

  it('plus de valeurs que de couleurs : la palette tourne, aucune valeur sans couleur', () => {
    const es = Array.from({ length: 25 }, (_, i) => ({ properties: { categorie: 'c' + i } }));
    const s = styleDeCouche(PRESETS.equipements_services, es);
    assert.equal(s.couleur.categories.length, 25);
    assert.ok(s.couleur.categories.every((c) => /^#[0-9a-f]{6}$/.test(c.color)));
  });

  it('points et lignes fixes : une taille, jamais de mode surfacique', () => {
    assert.equal(styleDeCouche(PRESETS.reperes, []).taille.valeur, 6);
    assert.equal(styleDeCouche(PRESETS.reperes, []).polygonMode, null);
    assert.equal(styleDeCouche(PRESETS.voies_ferrees, []).taille.valeur, 3);
  });

  it('tout le catalogue produit un style complet', () => {
    for (const p of listerPresets()) {
      const s = styleDeCouche(p, []);
      assert.ok(s.couleur, p.id);
      assert.ok(p.famille === 'Polygon' ? ['flat', 'extruded'].includes(s.polygonMode) : s.polygonMode === null, p.id);
    }
  });
});

describe('import-ign — les refus et les messages', () => {
  it('au-delà de 50 000 objets : refus qui dit de zoomer ; entre 5 000 et 50 000 : avertissement ; au plus 5 000 : feu vert', () => {
    const refus = decisionImport(evaluerVolume(577215));
    assert.equal(refus.ok, false);
    assert.match(refus.message, /Zoomez/);
    const avert = decisionImport(evaluerVolume(12000));
    assert.equal(avert.ok, true);
    assert.equal(avert.niveau, 'avertir');
    assert.equal(decisionImport(evaluerVolume(2178)).niveau, 'ok');
    assert.equal(decisionImport(evaluerVolume(0)).ok, false);
    assert.equal(decisionImport(evaluerVolume(null)).ok, false);
  });

  it('l’erreur XML du service est dite en français, avec le texte du service', () => {
    const e = new ErreurWfs('exception_ogc', 'Le service WFS refuse la requête (400) : Feature type BDTOPO_V3:x unknown', { status: 400 });
    const m = messageErreurImport(e);
    assert.match(m, /service de l’IGN a refusé/);
    assert.match(m, /Feature type BDTOPO_V3:x unknown/);
    assert.doesNotMatch(m, /\(400\)/);
  });

  it('chaque code d’erreur du client a une phrase, sans « HTTP 500 » nu', () => {
    for (const code of ['emprise_invalide', 'emprise_trop_grande', 'delai', 'reseau', 'http', 'reponse_illisible', 'trop_d_objets', 'annule']) {
      const m = messageErreurImport(new ErreurWfs(code, 'x', { status: 503 }));
      assert.ok(m.length > 10, code);
      assert.doesNotMatch(m, /^HTTP \d+$/);
    }
    assert.match(messageErreurImport(new ErreurWfs('http', 'x', { status: 429 })), /limite/);
    assert.match(messageErreurImport(new Error('autre')), /autre/);
  });

  it('une emprise trop grande pour le jeu a un message qui nomme le jeu', () => {
    try { verifierEmprise(PRESETS.batiments, [0, 40, 1, 41]); assert.fail(); } catch (e) {
      assert.match(messageErreurImport(e), /Bâtiments/);
      assert.match(messageErreurImport(e), /zoomez/i);
    }
  });

  it('estimerDuree : croît avec le volume, 0 sans objet', () => {
    assert.equal(estimerDuree(0, 1000), 0);
    assert.ok(estimerDuree(5000, 1000) > estimerDuree(1000, 1000));
    assert.ok(estimerDuree(2000, 2000) < 5);
  });
});

describe('import-ign — les pages', () => {
  it('pagesDe lit par la taille de page du jeu, triée par cleabs, avec l’emprise', async () => {
    const appels = [];
    const corps = { ...fixture('troncon_de_route'), numberMatched: 2 };
    const f = async (adresse) => {
      appels.push(adresse);
      return { ok: true, status: 200, text: async () => JSON.stringify(corps), headers: { get: () => null } };
    };
    const pages = [];
    for await (const p of pagesDe(PRESETS.routes, emprise, { fetch: f, pauseMs: 0, attendre: async () => {} })) pages.push(p);
    assert.equal(pages.length, 1);
    const u = new URL(appels[0]);
    assert.equal(u.searchParams.get('COUNT'), String(PRESETS.routes.page));
    assert.equal(u.searchParams.get('SORTBY'), 'cleabs');
    assert.equal(u.searchParams.get('BBOX'), '5.37,43.293,5.38,43.3,EPSG:4326');
  });
});

describe('import-ign — la couleur par catégorie se peint (app_v7.js)', () => {
  it('l’expression d’un champ catégorisé ne lève pas sur un texte', () => {
    // `['at', 0, …]` sur une valeur qui n'est pas une liste lève à l'évaluation : MapLibre peint alors la couche de la
    // couleur par défaut, noire, alors que la légende annonce les bonnes couleurs (constaté sur les routes IGN, par importance).
    const app = readFileSync(fileURLToPath(new URL('../app_v7.js', import.meta.url)), 'utf8');
    const m = /function fieldExpr\(field\) \{([\s\S]*?)\n\}/.exec(app);
    assert.ok(m, 'fieldExpr introuvable');
    assert.doesNotMatch(m[1], /\['coalesce', \['at', 0/);
    assert.match(m[1], /\['case', \['==', \['typeof'/);
  });
});
