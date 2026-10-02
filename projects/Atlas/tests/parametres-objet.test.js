import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ORIGINES, libelleOrigine, descripteursDuType, lireValeur, validerSaisie, ecartDeBande,
  resoudreParametre, resoudreTout, proprietesEffectives, appliquerComportement,
  parametresDeCoucheValides, parametresDObjetValides, avecReglageDeCouche, avecLiaison, champPropose,
} from '../lib/parametres-objet.js';
import { lireCatalogue, resoudreObjet } from '../lib/catalogue-objets.js';
import { etatPointLumineux } from '../lib/eclairage-profil.js';

const CAT = lireCatalogue(
  JSON.parse(readFileSync(new URL('../objets/catalog.json', import.meta.url), 'utf8')),
  'https://exemple.test/objets/catalog.json',
);
const type = (id) => CAT.types.find((t) => t.id === id);
const desc = (typeId, id) => descripteursDuType(type(typeId)).find((d) => d.id === id);

// ---------------------------------------------------------------------------
// Le schéma d'un type
// ---------------------------------------------------------------------------

test('chaque type d eclairage du catalogue recoit le schema de sa famille', () => {
  for (const t of CAT.types) {
    const ids = descripteursDuType(t).map((d) => d.id);
    assert.deepEqual(ids, ['statut', 'puissance', 'temperatureCouleur', 'hauteurFeu', 'azimut', 'comportement',
      'allumageSoir', 'extinctionMatin', 'valideDe', 'valideJusque'], t.id);
  }
});

test('une famille sans schema n a pas de parametres, sans erreur', () => {
  assert.deepEqual(descripteursDuType({ id: 'platane', family: 'vegetation' }), []);
  assert.deepEqual(descripteursDuType(null), []);
  assert.deepEqual(descripteursDuType(undefined), []);
});

test('la hauteur de feu par defaut est celle que le type declare, et dit que c est le catalogue', () => {
  assert.deepEqual(desc('applique_facade', 'hauteurFeu').defaut, { valeur: 5.5, origine: 'catalogue', explication: 'hauteur par défaut du type' });
  assert.equal(desc('axial_suspendu', 'hauteurFeu').defaut.valeur, 7.25);
  assert.equal(desc('projecteur_facade', 'hauteurFeu').defaut.valeur, 4);
  // le mat n'a pas de hauteur par defaut dans son bloc lighting : sa classe de hauteur par defaut (h6) la donne
  assert.equal(desc('mat_crosse', 'hauteurFeu').defaut.valeur, 6);
  assert.equal(desc('mat_crosse', 'hauteurFeu').defaut.origine, 'catalogue');
});

test('la bande de hauteur de feu vient de pix2hdr, par type', () => {
  assert.deepEqual(desc('mat_crosse', 'hauteurFeu').bande, [3.5, 10]);
  assert.deepEqual(desc('applique_facade', 'hauteurFeu').bande, [3, 8]);
  assert.equal(desc('encastre_sol', 'hauteurFeu').bande, undefined, 'bande nulle : rien a signaler');
});

test('la puissance par defaut est le milieu de la bande de la classe, et le dit', () => {
  const p = desc('mat_crosse', 'puissance');
  assert.deepEqual(p.bande, [15, 60]);
  assert.equal(p.defaut.valeur, 38);
  assert.equal(p.defaut.origine, 'regle');
  assert.match(p.defaut.explication, /milieu de la bande 15–60 W \(rue de desserte\)/);
  assert.equal(desc('projecteur_facade', 'puissance').defaut.valeur, 80);
  assert.match(desc('applique_facade', 'puissance').defaut.explication, /faute de bande propre aux appliques/);
});

test('la temperature de couleur par defaut est le plafond de l arrete, et le dit', () => {
  const t = desc('mat_crosse', 'temperatureCouleur');
  assert.equal(t.defaut.valeur, 3000);
  assert.equal(t.defaut.origine, 'regle');
  assert.match(t.defaut.explication, /arrêté du 27 décembre 2018/);
});

test('aucune valeur n est posee sans source : l orientation n a pas de defaut', () => {
  assert.equal(desc('mat_crosse', 'azimut').defaut, undefined);
  assert.equal(desc('mat_crosse', 'valideDe').defaut, undefined);
});

test('un type qui declare ses parametres l emporte sur le schema integre, parametre par parametre', () => {
  const t = {
    ...type('mat_crosse'),
    parameters: [
      { id: 'puissance', kind: 'number', libelle: 'Puissance nominale', unite: 'W', min: 0, max: 500, defaut: { valeur: 90, origine: 'catalogue', explication: 'valeur du fabricant' } },
      { id: 'indiceRendu', kind: 'number', libelle: 'IRC', groupe: 'source', min: 0, max: 100 },
    ],
  };
  const d = descripteursDuType(t);
  assert.equal(d.find((x) => x.id === 'puissance').defaut.valeur, 90);
  assert.equal(d.find((x) => x.id === 'puissance').libelle, 'Puissance nominale');
  assert.ok(d.find((x) => x.id === 'indiceRendu'), 'un parametre inconnu d Atlas est ajoute');
  assert.ok(d.find((x) => x.id === 'hauteurFeu'), 'les autres restent');
  assert.deepEqual(d.find((x) => x.id === 'indiceRendu').alias, ['indiceRendu']);
});

// ---------------------------------------------------------------------------
// Lire et valider
// ---------------------------------------------------------------------------

test('un nombre se lit avec une virgule decimale, une longueur a la maniere d OSM', () => {
  assert.equal(lireValeur(desc('mat_crosse', 'puissance'), '70'), 70);
  assert.equal(lireValeur(desc('mat_crosse', 'puissance'), '70,5'), 70.5);
  assert.equal(lireValeur(desc('mat_crosse', 'hauteurFeu'), '8 m'), 8);
  assert.equal(lireValeur(desc('mat_crosse', 'hauteurFeu'), '7,5'), 7.5);
  assert.equal(lireValeur(desc('mat_crosse', 'hauteurFeu'), '12 ft'), undefined, 'les pieds ne sont pas pris pour des metres');
});

test('ce qui est vide ou illisible n est pas une valeur', () => {
  const p = desc('mat_crosse', 'puissance');
  for (const v of [null, undefined, '', '  ', NaN, 'abc']) assert.equal(lireValeur(p, v), undefined, String(v));
});

test('un choix doit etre dans la liste, une heure au format EclExt, une date lisible', () => {
  assert.equal(lireValeur(desc('mat_crosse', 'statut'), 'functional'), 'functional');
  assert.equal(lireValeur(desc('mat_crosse', 'statut'), 'en panne'), undefined);
  assert.equal(lireValeur(desc('mat_crosse', 'allumageSoir'), '-15CS'), '-15CS');
  assert.equal(lireValeur(desc('mat_crosse', 'allumageSoir'), '21:36HL'), '21:36HL');
  assert.equal(lireValeur(desc('mat_crosse', 'allumageSoir'), '25:00'), undefined);
  assert.equal(lireValeur(desc('mat_crosse', 'valideDe'), '2024-05-01'), '2024-05-01');
  assert.equal(lireValeur(desc('mat_crosse', 'valideDe'), 1714521600), '2024-05-01', 'secondes Grist');
});

test('la saisie refuse hors des bornes dures et signale hors de l usuel', () => {
  const p = desc('mat_crosse', 'puissance');
  assert.deepEqual(validerSaisie(p, '40'), { ok: true, valeur: 40, ecartBande: null });
  assert.equal(validerSaisie(p, '5000').ok, false);
  assert.match(validerSaisie(p, '5000').erreur, /au plus 1000 W/);
  assert.match(validerSaisie(p, '-3').erreur, /au moins 0 W/);
  assert.equal(validerSaisie(p, 'abc').erreur, 'un nombre est attendu');
  // 120 W : possible, mais hors de la bande 15-60 W d'une rue de desserte → signalé, pas refusé
  const grand = validerSaisie(p, '120');
  assert.equal(grand.ok, true);
  assert.match(grand.ecartBande, /hors de l’usuel \(15–60 W\)/);
});

test('une heure illisible est refusee avec son motif', () => {
  const r = validerSaisie(desc('mat_crosse', 'allumageSoir'), '25:99');
  assert.equal(r.ok, false);
  assert.ok(r.erreur.length > 3);
});

test('ecartDeBande : sans bande ou dans la bande, rien a dire', () => {
  assert.equal(ecartDeBande({ unite: 'W' }, 5), null);
  assert.equal(ecartDeBande({ bande: [1, 3] }, 2), null);
  assert.equal(ecartDeBande({ bande: [1, 3] }, 'x'), null);
  assert.match(ecartDeBande({ bande: [1, 3] }, 4), /hors de l’usuel/);
});

// ---------------------------------------------------------------------------
// La resolution : l'ordre, et d'où vient la valeur
// ---------------------------------------------------------------------------

const puiss = () => desc('mat_crosse', 'puissance');

test('sans rien d autre, le defaut parle, avec son origine et son explication', () => {
  const r = resoudreParametre(puiss(), { props: {}, typeId: 'mat_crosse' });
  assert.equal(r.valeur, 38);
  assert.equal(r.origine, 'regle');
  assert.match(r.explication, /milieu de la bande/);
});

test('le defaut du catalogue est dit « catalogue », pas « regle »', () => {
  const r = resoudreParametre(desc('applique_facade', 'hauteurFeu'), { props: {}, typeId: 'applique_facade' });
  assert.deepEqual([r.valeur, r.origine], [5.5, 'catalogue']);
});

test('le reglage de la couche l emporte sur le defaut', () => {
  const couche = { valeurs: { '*': { puissance: 45 } } };
  const r = resoudreParametre(puiss(), { props: {}, couche, typeId: 'mat_crosse' });
  assert.deepEqual([r.valeur, r.origine], [45, 'couche']);
});

test('le reglage d un type l emporte sur celui de « tous » dans la couche', () => {
  const couche = { valeurs: { '*': { puissance: 45 }, mat_crosse: { puissance: 70 } } };
  assert.equal(resoudreParametre(puiss(), { props: {}, couche, typeId: 'mat_crosse' }).valeur, 70);
  assert.equal(resoudreParametre(puiss(), { props: {}, couche, typeId: 'applique_facade' }).valeur, 45);
});

test('un champ de l objet l emporte sur la couche, et dit lequel', () => {
  const couche = { valeurs: { '*': { puissance: 45 } } };
  const r = resoudreParametre(puiss(), { props: { puissance: 90 }, couche, typeId: 'mat_crosse' });
  assert.deepEqual([r.valeur, r.origine, r.champ], [90, 'champ', 'puissance']);
});

test('un nom de champ reconnu est lu : height donne la hauteur de feu, avec son nom', () => {
  const h = desc('mat_crosse', 'hauteurFeu');
  const r = resoudreParametre(h, { props: { highway: 'street_lamp', height: '8 m' }, typeId: 'mat_crosse' });
  assert.deepEqual([r.valeur, r.origine, r.champ], [8, 'champ', 'height']);
});

test('les noms de champ se reconnaissent sans tenir compte de la casse', () => {
  const r = resoudreParametre(puiss(), { props: { Puissance: 55 }, typeId: 'mat_crosse' });
  assert.deepEqual([r.valeur, r.champ], [55, 'Puissance']);
});

test('un champ lie explicitement est lu a la place du nom et des alias', () => {
  const couche = { liaisons: { puissance: 'watts_nominaux' } };
  const props = { puissance: 10, watts_nominaux: 77 };
  const r = resoudreParametre(puiss(), { props, couche, typeId: 'mat_crosse' });
  assert.deepEqual([r.valeur, r.champ], [77, 'watts_nominaux']);
});

test('un champ lie qui est vide ne se rabat pas sur un alias : lier est une decision', () => {
  const couche = { liaisons: { puissance: 'watts_nominaux' }, valeurs: { '*': { puissance: 45 } } };
  const props = { puissance: 10, watts_nominaux: '' };
  const r = resoudreParametre(puiss(), { props, couche, typeId: 'mat_crosse' });
  assert.deepEqual([r.valeur, r.origine], [45, 'couche']);
});

test('un champ illisible est ignore, la valeur retombe sur le niveau suivant', () => {
  const r = resoudreParametre(puiss(), { props: { puissance: 'beaucoup' }, typeId: 'mat_crosse' });
  assert.equal(r.origine, 'regle');
});

test('un reglage pose sur l objet l emporte sur tout, y compris un champ', () => {
  const couche = { valeurs: { '*': { puissance: 45 } } };
  const r = resoudreParametre(puiss(), { props: { puissance: 90 }, params: { puissance: 20 }, couche, typeId: 'mat_crosse' });
  assert.deepEqual([r.valeur, r.origine], [20, 'objet']);
});

test('sans valeur ni defaut, l origine est « aucune » et la valeur nulle', () => {
  const r = resoudreParametre(desc('mat_crosse', 'azimut'), { props: {}, typeId: 'mat_crosse' });
  assert.deepEqual([r.valeur, r.origine], [null, 'aucune']);
});

test('l ecart a l usuel accompagne la valeur resolue, d ou qu elle vienne', () => {
  const r = resoudreParametre(puiss(), { props: { puissance: 150 }, typeId: 'mat_crosse' });
  assert.match(r.ecartBande, /hors de l’usuel/);
});

test('les origines et leurs libelles sont fermes', () => {
  assert.deepEqual([...ORIGINES], ['objet', 'champ', 'couche', 'catalogue', 'regle']);
  assert.equal(libelleOrigine('champ', 'height'), 'champ « height »');
  assert.equal(libelleOrigine('regle'), 'règle d’Atlas, à vérifier');
  assert.equal(libelleOrigine('aucune'), 'non renseigné');
});

test('resoudreTout ne garde que ce qui a une valeur', () => {
  const { valeurs, provenance } = resoudreTout(descripteursDuType(type('mat_crosse')), { props: {}, typeId: 'mat_crosse' });
  assert.equal(valeurs.azimut, undefined);
  assert.equal(valeurs.puissance, 38);
  assert.equal(provenance.azimut.origine, 'aucune');
});

// ---------------------------------------------------------------------------
// Les proprietes effectives : ce que les calculs lisent
// ---------------------------------------------------------------------------

test('les proprietes effectives remettent aux calculs la puissance et la couleur par defaut', () => {
  const props = { highway: 'street_lamp' };
  const { props: eff } = proprietesEffectives(props, descripteursDuType(type('mat_crosse')), { typeId: 'mat_crosse' });
  assert.equal(eff.puissance, 38);
  assert.equal(eff.temperatureCouleur, 3000);
  assert.equal(eff.highway, 'street_lamp');
  assert.equal(props.puissance, undefined, 'l objet d origine n est jamais modifie');
});

test('ce qui ne sert qu a l affichage n est pas injecte : l hypothese d allumage reste dite par l etat', () => {
  const { props: eff } = proprietesEffectives({}, descripteursDuType(type('mat_crosse')), { typeId: 'mat_crosse' });
  assert.equal(eff.allumageSoir, undefined);
  assert.equal(eff.extinctionMatin, undefined);
  assert.equal(eff.statut, undefined);
  assert.equal(eff.comportement, undefined);
});

test('un champ lie sous un autre nom arrive aux calculs sous le nom canonique', () => {
  const couche = { liaisons: { hauteurFeu: 'h_lampe' } };
  const { props: eff, provenance } = proprietesEffectives({ h_lampe: '9,5' }, descripteursDuType(type('applique_facade')), { couche, typeId: 'applique_facade' });
  assert.equal(eff.hauteurFeu, 9.5);
  assert.equal(provenance.hauteurFeu.champ, 'h_lampe');
});

test('un point OSM allume avec les valeurs par regle : la grandeur photometrique existe', () => {
  const osm = { highway: 'street_lamp', _osmId: 'node/1' };
  const { props: eff } = proprietesEffectives(osm, descripteursDuType(type('mat_crosse')), { typeId: 'mat_crosse' });
  // Un soleil de substitution : coucher 7 h apres midi, lever 18 h apres midi (le lendemain 6 h).
  const soleil = (midi) => ({ coucher: midi + 7 * 3600e3, lever: midi + 18 * 3600e3 });
  const ctx = { lat: 43.3, lon: 5.4, fuseau: 'Europe/Paris', soleil };
  const nuit = Date.UTC(2026, 9, 2, 19, 0);   // 21 h locale, bien apres le coucher
  const etat = etatPointLumineux(eff, null, [], nuit, ctx);
  assert.equal(etat.allume, true);
  assert.equal(etat.temperatureCouleur, 3000);
  assert.ok(etat.hypotheses.length > 0, 'l allumage au coucher reste une hypothese dite');
});

test('un defaut de hauteur de feu choisit la classe de hauteur du mat', () => {
  const couche = { valeurs: { mat_crosse: { hauteurFeu: 8 } } };
  const { props: eff } = proprietesEffectives({}, descripteursDuType(type('mat_crosse')), { couche, typeId: 'mat_crosse' });
  const r = resoudreObjet(CAT, { source: 'osm', nom: 'x' }, { geometry: { type: 'Point', coordinates: [5.4, 43.3] }, properties: eff }, { typeId: 'mat_crosse', lod: 0 });
  assert.equal(r.asset.keys.height_class, 'h8');
});

// ---------------------------------------------------------------------------
// Le comportement jour / nuit
// ---------------------------------------------------------------------------

const etatAllume = { allume: true, facteurFlux: 1, facteurPuissance: 1, temperatureCouleur: 3000, plages: [], hypotheses: ['x'], raison: 'allumé' };
const etatEteint = { allume: false, facteurFlux: 0, facteurPuissance: 0, temperatureCouleur: 3000, plages: [], hypotheses: [], raison: 'hors des heures d’allumage' };

test('selon le soleil : l etat calcule, tel quel', () => {
  assert.equal(appliquerComportement('soleil', etatEteint), etatEteint);
  assert.equal(appliquerComportement(undefined, etatAllume), etatAllume);
  assert.equal(appliquerComportement(null, etatAllume), etatAllume);
});

test('toujours allume force l allumage et le dit', () => {
  const e = appliquerComportement('toujours', etatEteint, { temperatureCouleur: 2700 });
  assert.equal(e.allume, true);
  assert.equal(e.facteurFlux, 1);
  assert.equal(e.temperatureCouleur, 2700);
  assert.equal(e.raison, 'réglé : toujours allumé');
  assert.deepEqual(e.hypotheses, []);
});

test('toujours allume n allume pas un point hors service ni hors validite', () => {
  const horsService = { ...etatEteint, raison: 'statut decommissioned' };
  const horsValidite = { ...etatEteint, raison: 'hors de la période de validité du matériel' };
  assert.equal(appliquerComportement('toujours', horsService), horsService);
  assert.equal(appliquerComportement('toujours', horsValidite), horsValidite);
});

test('toujours eteint force l extinction et le dit', () => {
  const e = appliquerComportement('jamais', etatAllume);
  assert.equal(e.allume, false);
  assert.equal(e.facteurPuissance, 0);
  assert.equal(e.raison, 'réglé : toujours éteint');
});

// ---------------------------------------------------------------------------
// Ce qui s'enregistre
// ---------------------------------------------------------------------------

test('un reglage de couche mal forme ne survit pas, un bien forme est garde', () => {
  assert.equal(parametresDeCoucheValides(null), null);
  assert.equal(parametresDeCoucheValides([]), null);
  assert.equal(parametresDeCoucheValides({ valeurs: 'x', liaisons: 3 }), null);
  const brut = {
    valeurs: { '*': { puissance: 45, statut: '', objet: { a: 1 }, ok: true }, '': { a: 1 }, mat_crosse: [1], applique_facade: { hauteurFeu: 'x'.repeat(500) } },
    liaisons: { puissance: 'watts', vide: '  ', mauvais: 12 },
    autre: 'ignore',
  };
  assert.deepEqual(parametresDeCoucheValides(brut), {
    valeurs: { '*': { puissance: 45, ok: true } },
    liaisons: { puissance: 'watts' },
  });
});

test('les reglages d un objet sont un objet plat de scalaires', () => {
  assert.equal(parametresDObjetValides(null), null);
  assert.equal(parametresDObjetValides('x'), null);
  assert.deepEqual(parametresDObjetValides({ puissance: 20, statut: 'functional', x: {}, y: '', z: NaN }), { puissance: 20, statut: 'functional' });
  assert.equal(parametresDObjetValides({}), null);
});

test('poser puis retirer un reglage de couche ne modifie pas l original', () => {
  const avant = { valeurs: { '*': { puissance: 45 } }, liaisons: {} };
  const copie = JSON.stringify(avant);
  const apres = avecReglageDeCouche(avant, 'mat_crosse', 'puissance', 70);
  assert.equal(JSON.stringify(avant), copie);
  assert.deepEqual(apres.valeurs, { '*': { puissance: 45 }, mat_crosse: { puissance: 70 } });
  const retire = avecReglageDeCouche(apres, 'mat_crosse', 'puissance', '');
  assert.deepEqual(retire.valeurs, { '*': { puissance: 45 } });
  assert.equal(avecReglageDeCouche(retire, '*', 'puissance', null), null, 'plus rien : plus de reglage');
});

test('lier puis delier un champ', () => {
  const lie = avecLiaison(null, 'puissance', 'watts');
  assert.deepEqual(lie, { valeurs: {}, liaisons: { puissance: 'watts' } });
  assert.equal(avecLiaison(lie, 'puissance', ''), null);
});

test('on propose le champ qui porte le nom du parametre ou un alias, jamais au hasard', () => {
  const p = desc('mat_crosse', 'hauteurFeu');
  assert.equal(champPropose(p, ['nom', 'height', 'ref']), 'height');
  assert.equal(champPropose(p, [{ name: 'Hauteur_Feu' }]), 'Hauteur_Feu');
  assert.equal(champPropose(p, ['nom', 'ref']), null);
  assert.equal(champPropose(p, []), null);
  assert.equal(champPropose(p, null), null);
});
