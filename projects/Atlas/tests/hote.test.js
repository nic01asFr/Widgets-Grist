import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ECRANS, CLE_STOCKAGE, ecranInitial, estConfigComplete, normaliserConfig,
  validerConfig, lireConfig, ecrireConfig, oublier, depuis, situer,
  peutChangerDeScene, quitterScene,
  memoriserScenes, lireScenesMemorisees, oublierScenes, CLE_SCENES, PEREMPTION_MS,
  offreApplication, estAndroid, changerConnexion,
} from '../lib/hote.js';

const stockageFactice = () => {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
    _m: m,
  };
};
const caps = (o = {}) => ({ mode: 'rest', lecture: true, ecriture: true, decouverte: true, raison: null, ...o });

/* ---------- quel ecran ---------- */

test('dans Grist, l’hote ne s’affiche pas', () => {
  assert.equal(ecranInitial(caps({ mode: 'grist' }), null), ECRANS.WIDGET);
});

test('sans configuration, on demande instance et cle', () => {
  assert.equal(ecranInitial(caps(), null), ECRANS.CONNEXION);
  assert.equal(ecranInitial(caps(), { baseUrl: 'https://x.fr' }), ECRANS.CONNEXION);
});

test('configure sans document : on choisit une scene', () => {
  assert.equal(ecranInitial(caps(), { baseUrl: 'https://x.fr', jeton: 'K' }), ECRANS.SCENES);
});

test('une scene deja choisie ouvre Atlas directement', () => {
  assert.equal(ecranInitial(caps(), { baseUrl: 'https://x.fr', jeton: 'K', docId: 'D' }), ECRANS.ATLAS);
});

test('en navigateur, on explique sans barrer la route', () => {
  // L'instance rejette `Authorization` au controle prealable : demander la cle
  // ferait echouer l'utilisateur sur une manoeuvre impossible. Mais Atlas hors
  // Grist reste utile — fichiers, OSM, sauvegarde locale — donc on n'interdit
  // rien, on oriente.
  const e = ecranInitial(caps({ decouverte: false, ecriture: false, raison: 'CORS' }), null);
  assert.equal(e, ECRANS.LOCAL);
});

/* ---------- ce que l’utilisateur tape ---------- */

test('une adresse sans protocole est completee', () => {
  // Sans schema, l'adresse serait lue comme un chemin relatif et echouerait
  // sans rien expliquer.
  assert.equal(
    normaliserConfig({ baseUrl: 'grist.numerique.gouv.fr' }).baseUrl,
    'https://grist.numerique.gouv.fr',
  );
});

test('espaces et barres finales sont absorbes', () => {
  const c = normaliserConfig({ baseUrl: '  https://x.fr///  ', jeton: '  K  ' });
  assert.equal(c.baseUrl, 'https://x.fr');
  assert.equal(c.jeton, 'K');
});

test('http explicite est respecte', () => {
  // Instance locale ou reseau interne : ne pas forcer https.
  assert.equal(normaliserConfig({ baseUrl: 'http://192.168.1.10:8484' }).baseUrl, 'http://192.168.1.10:8484');
});

test('ce qui manque est dit clairement', () => {
  assert.match(validerConfig({}).message, /adresse/i);
  assert.match(validerConfig({ baseUrl: 'x.fr' }).message, /cle API/i);
  assert.equal(validerConfig({ baseUrl: 'x.fr', jeton: 'K' }).ok, true);
});

test('estConfigComplete ignore le document', () => {
  assert.equal(estConfigComplete({ baseUrl: 'https://x.fr', jeton: 'K' }), true);
  assert.equal(estConfigComplete({ baseUrl: '  ', jeton: 'K' }), false);
});

/* ---------- memoire de l’appareil ---------- */

test('la cle est ecrite une fois, relue ensuite', () => {
  const s = stockageFactice();
  ecrireConfig(s, { baseUrl: 'x.fr', jeton: 'K', docId: 'D' });
  const c = lireConfig(s);
  assert.equal(c.baseUrl, 'https://x.fr');
  assert.equal(c.jeton, 'K');
  assert.equal(c.docId, 'D');
});

test('oublier efface vraiment', () => {
  // Une cle de portee compte doit pouvoir partir aussi simplement qu'elle est venue.
  const s = stockageFactice();
  ecrireConfig(s, { baseUrl: 'x.fr', jeton: 'K' });
  oublier(s);
  assert.equal(lireConfig(s), null);
  assert.equal(s._m.has(CLE_STOCKAGE), false);
});

test('un stockage illisible ou absent ne fait pas planter', () => {
  assert.equal(lireConfig(null), null);
  assert.equal(lireConfig({ getItem: () => 'pas du json' }), null);
  assert.equal(ecrireConfig(null, {}), false);
});

/* ---------- presentation ---------- */

test('la fraicheur se lit d’un coup d’oeil', () => {
  const T = Date.parse('2026-08-20T12:00:00Z');
  const q = (iso) => depuis(iso, T);
  assert.equal(q('2026-08-20T11:59:30Z'), 'a l’instant');
  assert.equal(q('2026-08-20T11:20:00Z'), 'il y a 40 min');
  assert.equal(q('2026-08-20T07:00:00Z'), 'il y a 5 h');
  assert.equal(q('2026-08-17T12:00:00Z'), 'il y a 3 j');
  assert.equal(q('2026-06-20T12:00:00Z'), 'il y a 2 mois');
  assert.equal(q('2024-08-20T12:00:00Z'), 'il y a 2 ans');
});

test('une date absente ou illisible ne montre rien', () => {
  assert.equal(depuis(null), '');
  assert.equal(depuis('hier'), '');
});

test('la situation tolere ce qui manque', () => {
  assert.equal(situer({ org: 'Cerema', espace: 'Etudes' }), 'Cerema · Etudes');
  assert.equal(situer({ org: 'Cerema' }), 'Cerema');
  assert.equal(situer({}), '');
});

/* ---------- changer de scene ---------- */

test('le nom du projet ne ramene nulle part dans le widget', () => {
  // Un widget n'a rien au-dessus de sa scene : le fil d'Ariane y reste inerte.
  assert.equal(peutChangerDeScene(caps({ mode: 'grist' }), { baseUrl: 'https://x.fr', jeton: 'K' }), false);
});

test('ni dans un navigateur sans compte', () => {
  // Sans decouverte, il n'existe aucune liste ou revenir.
  assert.equal(peutChangerDeScene(caps({ decouverte: false }), { baseUrl: 'https://x.fr', jeton: 'K' }), false);
});

test('mais oui dans l application connectee', () => {
  assert.equal(peutChangerDeScene(caps(), { baseUrl: 'https://x.fr', jeton: 'K', docId: 'D' }), true);
});

test('quitter une scene garde l instance et la cle', () => {
  // Redemander la connexion a chaque changement de projet serait absurde :
  // seule la scene change.
  const st = stockageFactice();
  ecrireConfig(st, { baseUrl: 'x.fr', jeton: 'K', docId: 'D1' });
  quitterScene(st, lireConfig(st));
  const apres = lireConfig(st);
  assert.equal(apres.baseUrl, 'https://x.fr');
  assert.equal(apres.jeton, 'K');
  assert.equal(apres.docId, '');
});

test('apres avoir quitte, l accueil rouvre sur la liste', () => {
  const st = stockageFactice();
  ecrireConfig(st, { baseUrl: 'x.fr', jeton: 'K', docId: 'D1' });
  quitterScene(st, lireConfig(st));
  assert.equal(ecranInitial(caps(), lireConfig(st)), ECRANS.SCENES);
});

test('un stockage defaillant le dit, au lieu de recharger sur la meme scene', () => {
  assert.equal(quitterScene(null, { baseUrl: 'x.fr', jeton: 'K', docId: 'D' }), false);
});

/* ---------- retrouver ses projets au retour ---------- */

const SCENES = [
  { id: 'a', nom: 'CRESO', org: 'Cerema', espace: 'Etudes', maj: '2026-08-20T10:00:00Z' },
  { id: 'b', nom: 'Bees', org: 'Cerema', espace: 'Bac', maj: '2026-08-01T10:00:00Z' },
];

test('la liste trouvee se retrouve a l ouverture suivante', () => {
  // Sonder tout un compte prend plusieurs secondes : reafficher une page vide a
  // chaque lancement punirait ceux qui ont beaucoup de documents.
  const st = stockageFactice();
  memoriserScenes(st, SCENES, Date.parse('2026-08-20T12:00:00Z'));
  const m = lireScenesMemorisees(st, Date.parse('2026-08-20T12:30:00Z'));
  assert.equal(m.scenes.length, 2);
  assert.equal(m.scenes[0].nom, 'CRESO');
  assert.equal(m.perime, false);
});

test('on ne garde que ce qui sert a afficher et a ouvrir', () => {
  // Les donnees d une scene n ont rien a faire dans le stockage de l appareil.
  const st = stockageFactice();
  memoriserScenes(st, [{ ...SCENES[0], geojson: { enorme: true }, jeton: 'secret' }]);
  const gardees = Object.keys(lireScenesMemorisees(st).scenes[0]).sort();
  assert.deepEqual(gardees, ['acces', 'espace', 'id', 'maj', 'nom', 'org']);
});

test('une liste trop vieille est signalee comme telle', () => {
  // C est un souvenir, pas l etat du compte : un projet cree depuis n y est
  // pas, un projet supprime y est encore.
  const st = stockageFactice();
  const t0 = Date.parse('2026-08-01T12:00:00Z');
  memoriserScenes(st, SCENES, t0);
  assert.equal(lireScenesMemorisees(st, t0 + PEREMPTION_MS - 1000).perime, false);
  assert.equal(lireScenesMemorisees(st, t0 + PEREMPTION_MS + 1000).perime, true);
});

test('une entree sans identifiant est ecartee : elle ne s ouvrirait pas', () => {
  const st = stockageFactice();
  memoriserScenes(st, [SCENES[0], { nom: 'orpheline' }]);
  assert.deepEqual(lireScenesMemorisees(st).scenes.map((s) => s.id), ['a']);
});

test('rien de memorise, ou memoire illisible : on repart de zero', () => {
  assert.equal(lireScenesMemorisees(stockageFactice()), null);
  assert.equal(lireScenesMemorisees({ getItem: () => 'pas du json' }), null);
  assert.equal(lireScenesMemorisees(null), null);
  const vide = stockageFactice();
  memoriserScenes(vide, []);
  assert.equal(lireScenesMemorisees(vide), null, 'une liste vide ne vaut pas une memoire');
});

test('un quota plein ne fait pas echouer l application', () => {
  const plein = { setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.equal(memoriserScenes(plein, SCENES), false);
});

test('oublier la liste sans oublier la connexion', () => {
  const st = stockageFactice();
  ecrireConfig(st, { baseUrl: 'x.fr', jeton: 'K' });
  memoriserScenes(st, SCENES);
  oublierScenes(st);
  assert.equal(lireScenesMemorisees(st), null);
  assert.equal(lireConfig(st).jeton, 'K', 'la connexion survit a l oubli des scenes');
  assert.equal(st._m.has(CLE_SCENES), false);
});

/* ---------- proposer l application la ou elle sert ---------- */

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36';
const BUREAU = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

test('sur le telephone, telecharger l application est l action a offrir', () => {
  // C'est le seul chemin vers ses propres scenes : l'instance refuse la cle au
  // controle prealable tant qu'on passe par le moteur web.
  const o = offreApplication(caps({ decouverte: false }), ANDROID);
  assert.equal(o.proposer, true);
  assert.equal(o.direct, true);
  assert.match(o.url, /\.apk$/);
});

test('sur un ordinateur, on nomme le lien sans en faire l action principale', () => {
  // Un APK ne s y installe pas ; la vraie reponse est d ouvrir Atlas dans Grist.
  const o = offreApplication(caps({ decouverte: false }), BUREAU);
  assert.equal(o.proposer, true);
  assert.equal(o.direct, false);
});

test('dans l application, ou dans Grist, on ne propose rien', () => {
  assert.equal(offreApplication(caps(), ANDROID).proposer, false, 'deja installee');
  assert.equal(offreApplication(caps({ mode: 'grist', decouverte: false }), BUREAU).proposer, false);
  assert.equal(offreApplication(null, ANDROID).proposer, false);
});

test('un agent absent ne fait pas passer pour Android', () => {
  assert.equal(estAndroid(undefined), false);
  assert.equal(estAndroid(ANDROID), true);
});

/* ---------- changer d instance ou de cle ---------- */

test('corriger sa cle ne fait pas perdre la scene ouverte', () => {
  // Meme instance, meme projet : seule la cle change.
  const st = stockageFactice();
  ecrireConfig(st, { baseUrl: 'x.fr', jeton: 'ANCIENNE', docId: 'D1' });
  changerConnexion(st, lireConfig(st), { baseUrl: 'x.fr', jeton: 'NOUVELLE' });
  const c = lireConfig(st);
  assert.equal(c.jeton, 'NOUVELLE');
  assert.equal(c.docId, 'D1');
});

test('changer d instance oublie la scene, qui n existe pas ailleurs', () => {
  const st = stockageFactice();
  ecrireConfig(st, { baseUrl: 'x.fr', jeton: 'K', docId: 'D1' });
  changerConnexion(st, lireConfig(st), { baseUrl: 'autre.fr', jeton: 'K2' });
  const c = lireConfig(st);
  assert.equal(c.baseUrl, 'https://autre.fr');
  assert.equal(c.docId, '', 'la scene precedente n existe pas sur la nouvelle instance');
});

test('tant que rien n est valide, l ancienne connexion tient', () => {
  // C est tout l interet : ouvrir l ecran ne doit rien detruire. Un doigt qui
  // glisse sur « Instance et cle » faisait perdre une cle a rechercher dans son
  // profil Grist, et rendait meme l adresse.
  const st = stockageFactice();
  ecrireConfig(st, { baseUrl: 'x.fr', jeton: 'K', docId: 'D1' });
  assert.equal(lireConfig(st).jeton, 'K');
  assert.equal(estConfigComplete(lireConfig(st)), true);
});

test('une page de presentation ne declenche pas l’accueil', () => {
  // L'apercu d'une vitrine s'ouvrait sur « vos scenes sont hors de portee ici » :
  // une demonstration qui commence par annoncer ce qu'elle ne fera pas.
  assert.equal(ecranInitial(caps({ vitrine: true, decouverte: false }), null), ECRANS.WIDGET);
  assert.equal(ecranInitial(caps({ vitrine: true, decouverte: true }), null), ECRANS.WIDGET,
    'meme dans l’application, une vitrine reste une vitrine');
});

import { libelleOctets, phrasePreparation, phraseProgres } from '../lib/hote.js';

test('libelleOctets : des tailles qu’on lit', () => {
  assert.equal(libelleOctets(840), '840 o');
  assert.equal(libelleOctets(12 * 1024), '12 Ko');
  assert.equal(libelleOctets(3.2 * 1024 * 1024), '3,2 Mo');
  assert.equal(libelleOctets(-1), '');
  assert.equal(libelleOctets(NaN), '');
});

test('phrasePreparation : prête ou non, de quand, de quelle taille, et ce qui manque', () => {
  assert.match(phrasePreparation(null), /Pas encore/);
  const e = {
    date: Date.UTC(2026, 9, 2, 12, 5), octets: 3.2 * 1024 * 1024,
    tables: [{ nom: '_grist_Tables', meta: true }, { nom: 'Ouvrages', meta: false }, { nom: 'Visites', meta: false }],
    photos: { n: 12, ignorees: 2 }, echecs: [{ nom: 'Autre' }],
  };
  const p = phrasePreparation(e);
  assert.match(p, /^Prête le /);
  assert.match(p, /3,2 Mo/);
  assert.match(p, /2 tables/, 'les métadonnées ne comptent pas comme des tables');
  assert.match(p, /12 photos/);
  assert.match(p, /2 photos non gardées/);
  assert.match(p, /1 table illisible/);
  assert.doesNotMatch(phrasePreparation({ date: 1, octets: 10, tables: [{ nom: 'A', meta: false }], photos: { n: 0, ignorees: 0 }, echecs: [] }), /photo|illisible/);
});

test('phraseProgres : l’avancement, borné', () => {
  assert.equal(phraseProgres({ phase: 'tables', fait: 3, total: 9 }), 'Tables 3 / 9…');
  assert.equal(phraseProgres({ phase: 'photos', fait: 4, total: 12 }), 'Photos 4 / 12…');
  assert.equal(phraseProgres({ phase: 'tables', fait: 12, total: 9 }), 'Tables 9 / 9…');
  assert.equal(phraseProgres(null), '');
});

import { libelleRole, trierScenes, filtrerScenes, lirePrefsListe, ecrirePrefsListe, CLE_LISTE, memoriserScenes as memo2, lireScenesMemorisees as lire2 } from '../lib/hote.js';

const SCENES_LISTE = [
  { id: 'a', nom: 'Écluse du Sud', org: 'Équipe', espace: 'Terrain', maj: '2026-09-30T10:00:00Z', acces: 'editors' },
  { id: 'b', nom: 'bassin versant', org: 'Équipe', espace: 'Études', maj: '2026-10-02T08:00:00Z', acces: 'owners' },
  { id: 'c', nom: 'Parc urbain', org: 'Ville', espace: 'Public', maj: '', acces: 'viewers' },
  { id: 'd', nom: 'Ancienne carrière', org: 'Ville', espace: 'Archives', maj: '2025-01-01T00:00:00Z', acces: 'viewers' },
];

test('libelleRole : les rôles de Grist, en français', () => {
  assert.equal(libelleRole('owners'), 'Propriétaire');
  assert.equal(libelleRole('editors'), 'Éditeur');
  assert.equal(libelleRole('viewers'), 'Lecteur');
  assert.equal(libelleRole(''), '');
  assert.equal(libelleRole('autre'), '');
});

test('trierScenes : récentes d’abord (date inconnue en dernier), nom sans souci d’accent ni de casse, organisation puis espace', () => {
  assert.deepEqual(trierScenes(SCENES_LISTE, 'recent').map((s) => s.id), ['b', 'a', 'd', 'c']);
  assert.deepEqual(trierScenes(SCENES_LISTE, 'nom').map((s) => s.id), ['d', 'b', 'a', 'c'], '« Ancienne », « bassin », « Écluse », « Parc »');
  assert.deepEqual(trierScenes(SCENES_LISTE, 'organisation').map((s) => s.id), ['b', 'a', 'd', 'c'], 'Équipe/Études, Équipe/Terrain, Ville/Archives, Ville/Public');
  assert.deepEqual(SCENES_LISTE.map((s) => s.id), ['a', 'b', 'c', 'd'], 'la liste d’origine n’est pas touchée');
});

test('filtrerScenes : par rôle, par texte (accents et casse ignorés), hors ligne', () => {
  assert.deepEqual(filtrerScenes(SCENES_LISTE, { acces: 'viewers' }).map((s) => s.id), ['c', 'd']);
  assert.deepEqual(filtrerScenes(SCENES_LISTE, { texte: 'ecluse' }).map((s) => s.id), ['a']);
  assert.deepEqual(filtrerScenes(SCENES_LISTE, { texte: 'VILLE' }).map((s) => s.id), ['c', 'd'], 'cherche aussi l’organisation');
  assert.deepEqual(filtrerScenes(SCENES_LISTE, { texte: 'etudes' }).map((s) => s.id), ['b'], 'et l’espace');
  assert.deepEqual(filtrerScenes(SCENES_LISTE, { acces: 'hors-ligne', prets: new Set(['d', 'a']) }).map((s) => s.id), ['a', 'd']);
  assert.deepEqual(filtrerScenes(SCENES_LISTE, { acces: 'editors', texte: 'sud' }).map((s) => s.id), ['a']);
  assert.equal(filtrerScenes(SCENES_LISTE, {}).length, 4);
  assert.deepEqual(filtrerScenes(null, {}), []);
});

test('le rôle survit à la mémoire ; le tri et le filtre se retiennent', () => {
  const st = (() => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; })();
  memo2(st, SCENES_LISTE);
  assert.deepEqual(lire2(st).scenes.map((s) => s.acces), ['editors', 'owners', 'viewers', 'viewers']);
  assert.deepEqual(lirePrefsListe(st), { tri: 'recent', acces: 'tous' }, 'rien d’écrit : les défauts');
  ecrirePrefsListe(st, { tri: 'nom', acces: 'viewers' });
  assert.deepEqual(lirePrefsListe(st), { tri: 'nom', acces: 'viewers' });
  st.setItem(CLE_LISTE, JSON.stringify({ tri: 'hologramme', acces: 'x' }));
  assert.deepEqual(lirePrefsListe(st), { tri: 'recent', acces: 'tous' }, 'une valeur inconnue ne passe pas');
  assert.deepEqual(lirePrefsListe(null), { tri: 'recent', acces: 'tous' });
});
