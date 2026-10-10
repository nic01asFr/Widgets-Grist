/**
 * Le rendu du trafic : lissage entre deux pas du moteur, cap par le plus court chemin, fondu à l'apparition et à la disparition,
 * niveau de détail selon le zoom, et la boucle de dessin de `creerTrafic`.
 * node --test projects/Atlas/tests/trafic-rendu.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  creerInterpolateur, angleInterpole, niveauDeDetail, visibles,
  DUREE_PAS_MS, DUREE_ENTREE_MS, DUREE_SORTIE_MS, SAUT_MAX_M, ZOOM_MIN, ZOOM_3D,
} from '../lib/trafic-rendu.js';
import { creerTrafic, versMetres, versLngLat, positions } from '../lib/trafic-couche.js';
import { carteSimulee } from './aide-carte-bi.js';

const require = createRequire(import.meta.url);
const S = require('./aide-trafic-reseau.js');

const proche = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} différent de ${b}`);

test('angleInterpole : le plus court chemin, sans passer par l\'autre côté du cercle', () => {
  proche(angleInterpole(350, 10, 0.5), 0);
  proche(angleInterpole(10, 350, 0.5), 0);
  proche(angleInterpole(0, 90, 0.5), 45);
  proche(angleInterpole(90, 90, 0.7), 90);
  proche(angleInterpole(0, 180, 0), 0);
  assert.ok(angleInterpole(0, NaN, 0.5) >= 0, 'un cap illisible ne donne pas NaN');
});

test('interpolateur : la position glisse du pas précédent au pas courant', () => {
  const it = creerInterpolateur();
  it.pousser(1000, [{ id: 1, x: 0, y: 0, cap: 90 }]);
  it.pousser(1000 + DUREE_PAS_MS, [{ id: 1, x: 10, y: 0, cap: 90 }]);
  const t0 = 1000 + DUREE_PAS_MS;
  proche(it.echantillonner(t0)[0].x, 0);
  proche(it.echantillonner(t0 + DUREE_PAS_MS / 2)[0].x, 5);
  proche(it.echantillonner(t0 + DUREE_PAS_MS)[0].x, 10);
  proche(it.echantillonner(t0 + 10 * DUREE_PAS_MS)[0].x, 10, 1e-9);   // le temps passé au-delà d'un pas ne dépasse pas la position
});

test('interpolateur : un saut plus grand que le seuil n\'est pas interpolé (le véhicule est posé)', () => {
  const it = creerInterpolateur();
  it.pousser(0, [{ id: 7, x: 0, y: 0, cap: 0 }]);
  it.pousser(200, [{ id: 7, x: SAUT_MAX_M + 5, y: 0, cap: 0 }]);
  proche(it.echantillonner(200)[0].x, SAUT_MAX_M + 5);
  proche(it.echantillonner(300)[0].x, SAUT_MAX_M + 5);
});

test('interpolateur : le cap tourne par le plus court chemin entre deux pas', () => {
  const it = creerInterpolateur();
  it.pousser(0, [{ id: 1, x: 0, y: 0, cap: 350 }]);
  it.pousser(200, [{ id: 1, x: 1, y: 0, cap: 10 }]);
  proche(it.echantillonner(300)[0].cap, 0);
});

test('interpolateur : fondu à l\'apparition', () => {
  const it = creerInterpolateur();
  it.pousser(0, [{ id: 1, x: 0, y: 0, cap: 0 }]);
  proche(it.echantillonner(0)[0].o, 0);
  proche(it.echantillonner(DUREE_ENTREE_MS / 2)[0].o, 0.5);
  proche(it.echantillonner(DUREE_ENTREE_MS * 3)[0].o, 1);
});

test('interpolateur : fondu à la disparition, puis le véhicule est oublié', () => {
  const it = creerInterpolateur();
  it.pousser(0, [{ id: 1, x: 0, y: 0, cap: 0 }, { id: 2, x: 5, y: 5, cap: 0 }]);
  it.pousser(2000, [{ id: 2, x: 5, y: 5, cap: 0 }]);
  const mi = it.echantillonner(2000 + DUREE_SORTIE_MS / 2);
  assert.equal(mi.length, 2);
  proche(mi.find((v) => v.id === 1).o, 0.5);
  assert.equal(mi.find((v) => v.id === 2).o, 1);
  const fin = it.echantillonner(2000 + DUREE_SORTIE_MS + 1);
  assert.deepEqual(fin.map((v) => v.id), [2]);
  assert.equal(it.taille, 1);
});

test('interpolateur : tousSortent efface tout en fondu', () => {
  const it = creerInterpolateur();
  it.pousser(0, [{ id: 1, x: 0, y: 0, cap: 0 }, { id: 2, x: 5, y: 5, cap: 0 }]);
  it.tousSortent(5000);
  assert.equal(it.echantillonner(5000 + DUREE_SORTIE_MS + 5).length, 0);
  assert.equal(it.taille, 0);
});

test('niveauDeDetail : rien en dessous du zoom minimal, des points ensuite, de la 3D de près si elle est disponible', () => {
  assert.equal(niveauDeDetail(ZOOM_MIN - 0.5, { avec3d: true }), 'aucun');
  assert.equal(niveauDeDetail(ZOOM_MIN), 'points');
  assert.equal(niveauDeDetail(ZOOM_3D + 1, { avec3d: false }), 'points');
  assert.equal(niveauDeDetail(ZOOM_3D - 0.1, { avec3d: true }), 'points');
  assert.equal(niveauDeDetail(ZOOM_3D, { avec3d: true }), '3d');
  assert.equal(niveauDeDetail(NaN), 'points', 'un zoom inconnu ne cache pas le trafic');
});

test('visibles : seuls les véhicules de la boîte (et de sa marge) restent', () => {
  const v = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 1000, y: 0 }, { x: -30, y: 50 }];
  const r = visibles(v, { x0: -10, y0: -10, x1: 120, y1: 120 }, 40);
  assert.deepEqual(r.map((a) => a.x), [0, 100, -30]);
  assert.equal(visibles(v, null).length, 4, 'sans boîte, tout reste');
});

test('versMetres est l\'inverse de versLngLat', () => {
  const c = [5.3946, 43.3047];
  const [x, y] = versMetres(c, ...versLngLat(c, 123.4, -56.7));
  proche(x, 123.4, 1e-6); proche(y, -56.7, 1e-6);
});

// ---- la boucle de dessin de creerTrafic ----

function banc({ zoom = 15, avec3d = false } = {}) {
  const carte = carteSimulee();
  carte.getZoom = () => zoom;
  let repeints = 0; carte.triggerRepaint = () => { repeints++; };
  let t = 0, nImages = 0; const dessins = [];
  const rendu3d = { disponible: () => avec3d, maj: (l) => dessins.push(l), effacer: () => dessins.push('efface') };
  let pasMoteur = null, image = null, fins = 0;
  const trafic = creerTrafic({ carte, entites: S.grille({ nv: 2 }), densite: 8, graine: 5, rendu3d, surFin: () => { fins++; },
    planifier: (f) => { pasMoteur = f; return 1; }, annuler: () => { pasMoteur = null; },
    planifierImage: (f) => { image = f; nImages++; return nImages; }, annulerImage: () => { image = null; }, maintenant: () => t });
  const avancer = (ms) => { t += ms; if (image) { const f = image; image = null; f(); } };
  return { carte, trafic, rendu3d, dessins, avancer, pas: () => pasMoteur && pasMoteur(), horloge: () => t, repeints: () => repeints, fins: () => fins,
    source: () => carte.sources.get('atlas-trafic') };
}

test('boucle de dessin : le dessin avance entre deux pas du moteur, sans nouveau calcul', () => {
  const b = banc();
  b.trafic.demarrer();
  b.avancer(700);   // les véhicules sont montés en fondu
  b.pas();          // un pas du moteur à t = 700
  b.avancer(0);
  const avant = b.source().data.features.map((f) => f.geometry.coordinates.join());
  b.avancer(100);   // à mi-pas, sans pas du moteur : la position change quand même
  const milieu = b.source().data.features.map((f) => f.geometry.coordinates.join());
  assert.notDeepEqual(milieu, avant, 'les véhicules glissent entre deux pas');
  assert.equal(b.trafic.etat().temps, Math.round(b.trafic._sim.t), 'aucun pas du moteur de plus');
  assert.ok(b.trafic.etat().images >= 2);
});

test('boucle de dessin : à l\'apparition, les véhicules ont une opacité qui monte de 0 à 1', () => {
  const b = banc();
  b.trafic.demarrer();
  b.avancer(31);
  const o0 = b.source().data.features.map((f) => f.properties.o);
  assert.ok(o0.every((o) => o >= 0 && o < 0.2), 'presque transparents au départ');
  b.avancer(DUREE_ENTREE_MS);
  assert.ok(b.source().data.features.every((f) => f.properties.o === 1));
});

test('boucle de dessin : sous le zoom minimal, rien n\'est dessiné mais le moteur continue', () => {
  const b = banc({ zoom: ZOOM_MIN - 1 });
  b.trafic.demarrer();
  b.avancer(100);
  assert.equal(b.source().data.features.length, 0);
  const t0 = b.trafic._sim.t; b.pas(); assert.ok(b.trafic._sim.t > t0, 'le temps simulé avance');
  assert.equal(b.trafic.etat().rendu, 'aucun');
});

test('boucle de dessin : de près, les véhicules passent au rendu 3D et les points sont vidés', () => {
  const b = banc({ zoom: ZOOM_3D + 1, avec3d: true });
  b.trafic.demarrer();
  b.avancer(700);
  assert.equal(b.trafic.etat().rendu, '3d');
  const liste = b.dessins.filter((d) => Array.isArray(d)).pop();
  assert.ok(liste && liste.length > 0);
  assert.ok(liste[0].lnglat.every(Number.isFinite) && Number.isFinite(liste[0].cap) && liste[0].o > 0);
  assert.equal(b.source().data.features.length, 0, 'plus de points quand la 3D est montrée');
  assert.ok(b.repeints() > 0, 'la carte est redessinée à chaque image 3D');
});

test('boucle de dessin : la 3D indisponible garde les points, même de près', () => {
  const b = banc({ zoom: ZOOM_3D + 2, avec3d: false });
  b.trafic.demarrer(); b.avancer(700);
  assert.equal(b.trafic.etat().rendu, 'points');
  assert.ok(b.source().data.features.length > 0);
});

test('boucle de dessin : seuls les véhicules de la fenêtre visible sont envoyés', () => {
  const b = banc();
  b.trafic.demarrer(); b.avancer(700);
  const tous = b.source().data.features.length;
  assert.ok(tous > 5);
  const [lng, lat] = versLngLat(b.trafic._centre, 3000, 3000);   // une fenêtre loin du réseau
  b.carte.getBounds = () => ({ getWest: () => lng - 0.001, getEast: () => lng + 0.001, getSouth: () => lat - 0.001, getNorth: () => lat + 0.001 });
  b.avancer(100);
  assert.equal(b.source().data.features.length, 0, 'rien dans la fenêtre : rien n\'est envoyé');
});

test('arreter({ doucement }) : les véhicules s\'effacent en fondu, puis la couche est retirée', () => {
  const b = banc();
  b.trafic.demarrer(); b.avancer(700);
  const e = b.trafic.arreter({ doucement: true });
  assert.equal(e.actif, false, 'le trafic est arrêté tout de suite');
  assert.equal(b.carte.sources.size, 1, 'mais la couche est encore là pendant le fondu');
  b.avancer(DUREE_SORTIE_MS / 2);
  assert.ok(b.source().data.features.every((f) => f.properties.o < 1));
  b.avancer(DUREE_SORTIE_MS);
  b.avancer(50);
  assert.equal(b.carte.sources.size, 0, 'couche retirée à la fin du fondu');
  assert.equal(b.carte.calques.length, 0);
  assert.equal(b.fins(), 1, 'surFin appelée une fois');
});

test('arreter() sans douceur retire tout sur-le-champ et efface la 3D', () => {
  const b = banc({ zoom: ZOOM_3D + 1, avec3d: true });
  b.trafic.demarrer(); b.avancer(700);
  b.trafic.arreter();
  assert.equal(b.carte.sources.size, 0);
  assert.equal(b.dessins[b.dessins.length - 1], 'efface');
  assert.equal(b.fins(), 1);
});

test('changement de fond de carte : la source et la couche emportées par setStyle sont reposées au chargement du nouveau style', () => {
  const b = banc();
  b.trafic.demarrer(); b.avancer(700);
  assert.equal(b.carte.sources.size, 1);
  b.carte.removeLayer('atlas-trafic'); b.carte.removeSource('atlas-trafic');   // ce que fait setStyle
  assert.equal(b.carte.sources.size, 0);
  b.carte.emit('style.load', {});
  assert.equal(b.carte.sources.size, 1, 'source reposée');
  assert.ok(b.carte.calques.some((l) => l.id === 'atlas-trafic'), 'couche reposée');
  b.avancer(100);
  assert.ok(b.source().data.features.length > 0, 'et les véhicules y sont dessinés');
});

test('changement de fond de carte sans évènement : le prochain dessin repose la couche', () => {
  const b = banc();
  b.trafic.demarrer(); b.avancer(700);
  b.carte.removeLayer('atlas-trafic'); b.carte.removeSource('atlas-trafic');
  b.avancer(100);
  assert.equal(b.carte.sources.size, 1);
  b.avancer(100);
  assert.ok(b.source().data.features.length > 0);
});

test('un trafic arrêté ne se repose pas au chargement d’un style', () => {
  const b = banc();
  b.trafic.demarrer(); b.avancer(700);
  b.trafic.arreter();
  b.carte.emit('style.load', {});
  assert.equal(b.carte.sources.size, 0);
});

test('positions : un véhicule sans position est ignoré, les autres gardent leur identifiant et leur classe', () => {
  const sim = { agents: [{ id: 3, pl: true }, { id: 4 }, { id: 5 }], position: (a) => (a.id === 4 ? null : [1, 2, 45]) };
  assert.deepEqual(positions(sim), [{ id: 3, x: 1, y: 2, cap: 45, pl: true }, { id: 5, x: 1, y: 2, cap: 45, pl: false }]);
});
