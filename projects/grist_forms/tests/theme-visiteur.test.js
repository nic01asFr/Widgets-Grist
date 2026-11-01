'use strict';

/**
 * Le thème du visiteur (hors Grist) : ce que le socle garantit, indépendamment de toute page. Cadrage : docs/CADRAGE-THEME-VISITEUR.md.
 * Aucun navigateur : un faux stockage (qu'on peut faire tomber en panne) et de fausses fenêtres.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const V = require('../shared/theme-visiteur.js');
const T = require('../shared/themedef.js');

/** Un faux stockage, avec les pannes que connaissent les navigateurs : refus d'écrire (quota), refus de lire, absence. */
function faux(pannes) {
  pannes = pannes || {};
  const m = new Map();
  return {
    m,
    getItem(k) { if (pannes.lecture) throw new Error('SecurityError'); return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { if (pannes.ecriture) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
    removeItem(k) { if (pannes.suppression) throw new Error('SecurityError'); m.delete(k); }
  };
}

const theme = (extra) => Object.assign({
  version: 'themedef-1.0', nom: 'Forêt d’automne',
  graines: { principal: '#0b6e4f', secondaire: '#f4a259', fond: '#fdfaf3' }, modes: { sombre: 'derive' }
}, extra || {});

const fenetre = (search, extra) => Object.assign({
  location: { search },
  document: { documentElement: { hasAttribute: () => false } }
}, extra || {});

beforeEach(() => { V.oublierMemoire(); });

describe('Thème du visiteur : la clé', () => {
  it('est unique, préfixée par le nom du dépôt, et versionnée', () => {
    assert.equal(V.CLE, 'widgets-grist:theme-visiteur');
    assert.ok(V.CLE.startsWith('widgets-grist:'), 'l’origine est partagée avec tout le reste : un préfixe de dépôt');
    assert.equal(V.VERSION, 1);
    assert.equal(V.TAILLE_MAX, 16384);
  });
});

describe('Thème du visiteur : écrire et relire', () => {
  it('garde un thème valide sous la clé, au format { v, themedef, maj en secondes }', () => {
    const s = faux();
    const r = V.ecrire(theme(), { stockage: s, maintenant: 1793500000123 });
    assert.deepEqual(r, { ok: true, persiste: true });
    const brut = JSON.parse(s.m.get(V.CLE));
    assert.equal(brut.v, 1);
    assert.equal(brut.maj, 1793500000, 'maj en SECONDES, comme Theme_document');
    assert.equal(brut.themedef.nom, 'Forêt d’automne');
    assert.deepEqual([...s.m.keys()], [V.CLE], 'une seule clé, rien d’autre');
  });

  it('le relit revalidé, et dit d’où il vient', () => {
    const s = faux();
    V.ecrire(theme(), { stockage: s, maintenant: 5000 });
    const l = V.lire({ stockage: s });
    assert.equal(l.themedef.nom, 'Forêt d’automne');
    assert.equal(l.maj, 5);
    assert.equal(l.source, 'stockage');
    assert.equal(V.diagnostic({ stockage: s }).etat, 'ok');
  });

  it('accepte aussi le thème donné en texte', () => {
    const s = faux();
    assert.equal(V.ecrire(JSON.stringify(theme()), { stockage: s }).ok, true);
    assert.equal(V.lire({ stockage: s }).themedef.graines.principal, '#0b6e4f');
  });

  it('ne garde que ce que le format connaît : une clé inconnue ne passe pas', () => {
    const s = faux();
    V.ecrire(theme({ resolu: { modes: {} }, hash: 'x', extra: '<script>' }), { stockage: s });
    const garde = JSON.parse(s.m.get(V.CLE)).themedef;
    assert.ok(!('extra' in garde) && !('resolu' in garde) && !('hash' in garde));
  });
});

describe('Thème du visiteur : un thème refusé ne touche à rien', () => {
  const refus = {
    'version inconnue': theme({ version: 'themedef-9.0' }),
    'sans couleur principale': { version: 'themedef-1.0', nom: 'Vide' },
    'couleur non stricte': theme({ graines: { principal: '#0b6' } }),
    'couleur en rgb()': theme({ graines: { principal: 'rgb(11,110,79)' } }),
    'pas un objet': 'pas un thème',
    'tableau': [],
    'nul': null
  };
  for (const [nom, t] of Object.entries(refus)) {
    it(nom + ' : refusé, rien d’écrit, le thème précédent reste', () => {
      const s = faux();
      V.ecrire(theme({ nom: 'Précédent' }), { stockage: s });
      const avant = s.m.get(V.CLE);
      const r = V.ecrire(t, { stockage: s });
      assert.equal(r.ok, false);
      assert.equal(typeof r.erreur, 'string');
      assert.equal(s.m.get(V.CLE), avant, 'le précédent est intact');
      assert.equal(V.lire({ stockage: s }).themedef.nom, 'Précédent');
    });
  }

  it('un thème de plus de 16 Ko est refusé (en octets, pas en caractères)', () => {
    const s = faux();
    const gros = theme({ nom: 'é'.repeat(9000) });
    assert.equal(V.ecrire(gros, { stockage: s }).ok, false);
    assert.equal(s.m.size, 0);
  });
});

describe('Thème du visiteur : ce qui est dans le stockage est une donnée non fiable', () => {
  const etats = {
    'JSON cassé': ['{pas du json', 'illisible'],
    'pas un objet': ['"texte"', 'illisible'],
    'un tableau': ['[]', 'illisible'],
    'autre version du format': [JSON.stringify({ v: 2, themedef: theme(), maj: 1 }), 'version'],
    'sans version': [JSON.stringify({ themedef: theme(), maj: 1 }), 'version'],
    'thème périmé ou trafiqué': [JSON.stringify({ v: 1, themedef: theme({ version: 'themedef-0.1' }), maj: 1 }), 'theme-refuse'],
    'couleur hostile': [JSON.stringify({ v: 1, themedef: theme({ graines: { principal: 'red; background:url(//x)' } }), maj: 1 }), 'theme-refuse'],
    'énorme': ['x'.repeat(40000), 'illisible']
  };
  for (const [nom, [brut, etat]] of Object.entries(etats)) {
    it(nom + ' : ignoré (' + etat + '), jamais appliqué, jamais réparé en silence', () => {
      const s = faux();
      s.m.set(V.CLE, brut);
      assert.equal(V.lire({ stockage: s }), null);
      assert.equal(V.diagnostic({ stockage: s }).etat, etat);
      assert.equal(s.m.get(V.CLE), brut, 'lire ne réécrit rien');
    });
  }

  it('rien dans le stockage : absent', () => {
    assert.equal(V.lire({ stockage: faux() }), null);
    assert.equal(V.diagnostic({ stockage: faux() }).etat, 'absent');
  });
});

describe('Thème du visiteur : quand le stockage manque, rien ne casse et on le dit', () => {
  it('pas de stockage du tout : le thème tient en mémoire, persiste = faux', () => {
    const r = V.ecrire(theme(), { stockage: null });
    assert.deepEqual(r, { ok: true, persiste: false });
    const l = V.lire({ stockage: null });
    assert.equal(l.source, 'memoire');
    assert.equal(l.themedef.nom, 'Forêt d’automne');
  });

  it('écriture refusée (quota, navigation privée) : ok mais persiste = faux, relu depuis la mémoire', () => {
    const s = faux({ ecriture: true });
    const r = V.ecrire(theme(), { stockage: s });
    assert.equal(r.ok, true);
    assert.equal(r.persiste, false, 'jamais « enregistré » quand ça ne l’est pas');
    assert.equal(s.m.size, 0);
    assert.equal(V.lire({ stockage: s }).source, 'memoire');
  });

  it('lecture refusée : pas d’exception, la mémoire de la page tient lieu', () => {
    const s = faux({ lecture: true });
    V.ecrire(theme(), { stockage: faux({ ecriture: true }) });
    assert.doesNotThrow(() => V.lire({ stockage: s }));
    assert.equal(V.lire({ stockage: s }).source, 'memoire');
    V.oublierMemoire();
    assert.equal(V.lire({ stockage: s }), null);
  });

  it('une écriture réussie rend la main au stockage : la mémoire ne masque pas une clé effacée ailleurs', () => {
    const s = faux();
    V.ecrire(theme(), { stockage: s });
    s.m.delete(V.CLE);
    assert.equal(V.lire({ stockage: s }), null, 'la clé a été effacée (autre onglet, réglage du navigateur) : absent');
  });

  it('effacer vide la clé et la mémoire, et ne lève jamais', () => {
    const s = faux();
    V.ecrire(theme(), { stockage: s });
    V.effacer({ stockage: s });
    assert.equal(s.m.size, 0);
    assert.equal(V.lire({ stockage: s }), null);
    V.ecrire(theme(), { stockage: null });
    V.effacer({ stockage: null });
    assert.equal(V.lire({ stockage: null }), null);
    assert.doesNotThrow(() => V.effacer({ stockage: faux({ suppression: true }) }));
  });
});

describe('Thème du visiteur : seulement là où la page l’a demandé, et jamais dans Grist', () => {
  it('actif avec ?vitrine=1 hors Grist', () => {
    assert.equal(V.actif(fenetre('?vitrine=1')), true);
    assert.equal(V.actif(fenetre('?cas=consultation&vitrine=1')), true);
  });

  it('inactif sans la demande de la page', () => {
    for (const q of ['', '?', '?cas=consultation', '?vitrine=0', '?vitrine=', '?vitrine=true', '?vitrine=11', '?Vitrine=1']) {
      assert.equal(V.actif(fenetre(q)), false, q);
    }
  });

  it('inactif dans Grist, même si l’adresse porte vitrine=1', () => {
    assert.equal(V.actif(fenetre('?vitrine=1&access=full&readonly=false&culture=fr-FR')), false, 'adresse de widget Grist');
    assert.equal(V.actif(fenetre('?vitrine=1&readonly=true')), false);
    const dansGrist = fenetre('?vitrine=1', { document: { documentElement: { hasAttribute: (n) => n === 'data-grist-widget' } } });
    assert.equal(V.actif(dansGrist), false, 'grist-plugin-api.js a posé son marqueur');
  });

  it('inactif quand on ne sait pas : pas de fenêtre, pas d’adresse, une erreur', () => {
    assert.equal(V.actif(null), false);
    assert.equal(V.actif({}), false);
    assert.equal(V.actif({ location: null }), false);
    assert.equal(V.actif({ get location() { throw new Error('x'); } }), false);
  });
});

describe('Thème du visiteur : les six variables de la vitrine', () => {
  it('rend exactement les six variables, en #rrggbb strict', () => {
    const v = V.varsVitrine(theme(), 'clair');
    assert.deepEqual(Object.keys(v).sort(), ['--accent', '--encre', '--filet', '--papier', '--plume', '--surface']);
    for (const valeur of Object.values(v)) assert.match(valeur, /^#[0-9a-f]{6}$/);
  });

  it('le papier est le fond du thème, l’accent est son action', () => {
    const v = V.varsVitrine(theme({ graines: { principal: '#0b6e4f', fond: '#fdfaf3' } }), 'clair');
    assert.equal(v['--papier'], '#fdfaf3');
    assert.equal(v['--accent'], '#0b6e4f');
  });

  it('le sombre est un autre jeu de couleurs, lisible', () => {
    const clair = V.varsVitrine(theme(), 'clair');
    const sombre = V.varsVitrine(theme(), 'sombre');
    assert.notEqual(clair['--papier'], sombre['--papier']);
    assert.ok(T.contraste(sombre['--encre'], sombre['--papier']) >= 4.5, 'texte sombre lisible');
    assert.ok(T.contraste(sombre['--accent'], sombre['--papier']) >= 3, 'accent visible en sombre');
  });

  it('un thème qui ferait un texte illisible est redressé, jamais appliqué tel quel', () => {
    const v = V.varsVitrine(theme({ graines: { principal: '#fdfaf3', encre: '#fefefe', fond: '#ffffff' } }), 'clair');
    assert.ok(T.contraste(v['--encre'], v['--papier']) >= 3, 'texte lisible malgré une encre quasi blanche');
    assert.ok(T.contraste(v['--accent'], v['--papier']) >= 3, 'accent visible malgré un principal quasi blanc');
  });

  it('un thème refusé ne donne rien (null), pas des variables à moitié', () => {
    assert.equal(V.varsVitrine({ version: 'themedef-1.0' }, 'clair'), null);
    assert.equal(V.varsVitrine(null, 'clair'), null);
    assert.equal(V.varsVitrine('pas json', 'clair'), null);
  });

  it('un mode inconnu retombe sur le clair', () => {
    assert.deepEqual(V.varsVitrine(theme(), 'sepia'), V.varsVitrine(theme(), 'clair'));
  });
});

describe('Thème du visiteur : l’export en fichier', () => {
  it('rend un fichier que n’importe quel lecteur ThemeDef relit à l’identique', () => {
    const e = V.exporter(theme());
    assert.equal(e.nom, 'foret-d-automne.themedef.json');
    assert.ok(e.texte.endsWith('\n'));
    const relu = T.lireThemeDef(e.texte);
    assert.equal(relu.ok, true);
    assert.deepEqual(relu.themedef, V.valider(theme()).themedef);
  });

  it('un nom vide ou exotique donne un nom de fichier sûr', () => {
    assert.equal(V.exporter(theme({ nom: '日本語' })).nom, 'theme.themedef.json');
    assert.match(V.exporter(theme({ nom: '../../etc/passwd' })).nom, /^[a-z0-9-]+\.themedef\.json$/);
  });

  it('un thème refusé ne s’exporte pas', () => {
    assert.equal(V.exporter({ version: 'themedef-9' }), null);
  });
});

describe('Thème du visiteur : ce qu’on ne croit pas', () => {
  it('un resolu fabriqué est écarté : le thème se recalcule depuis ses graines et reste lisible', () => {
    const hostile = theme({ resolu: { modes: { clair: { valeurs: { fond: '#ffffff', texte: '#ffffff', 'texte-2': '#ffffff', action: '#ffffff', surface: '#ffffff', bord: '#ffffff' } } } } });
    const s = faux();
    assert.equal(V.ecrire(hostile, { stockage: s }).ok, true);
    assert.ok(!('resolu' in JSON.parse(s.m.get(V.CLE)).themedef), 'jamais gardé');
    const v = V.varsVitrine(hostile, 'clair');
    assert.ok(v && T.contraste(v['--encre'], v['--papier']) >= 4.5, 'lisible malgré le resolu hostile');
  });

  it('un resolu déjà dans le stockage (écrit par autre chose) n’est pas appliqué non plus', () => {
    const s = faux();
    s.m.set(V.CLE, JSON.stringify({ v: 1, maj: 1, themedef: theme({ resolu: { modes: { clair: { valeurs: { texte: '#ffffff', fond: '#ffffff' } } } } }) }));
    const l = V.lire({ stockage: s });
    assert.ok(l && !('resolu' in l.themedef));
    const v = V.varsVitrine(l.themedef, 'clair');
    assert.ok(T.contraste(v['--encre'], v['--papier']) >= 4.5);
  });

  it('des surcharges qui rendraient le texte illisible : le thème est refusé pour la vitrine, pas appliqué à moitié', () => {
    const t = theme({ surcharges: { clair: { texte: '#fdfaf3', fond: '#fdfaf3' } } });
    assert.equal(V.varsVitrine(t, 'clair'), null);
  });

  it('les clés inconnues, y compris dans les graines, ne sont jamais gardées', () => {
    const v = V.valider(theme({ graines: { principal: '#0b6e4f', ok: '#00ff00', proto: '<x>' }, __proto__x: 1, hash: 'h', extra: 'y' }));
    assert.equal(v.ok, true);
    assert.deepEqual(Object.keys(v.themedef.graines).sort(), ['principal']);
    for (const k of Object.keys(v.themedef)) assert.ok(['version', 'nom', 'graines', 'police', 'modes', 'surcharges', 'exigences'].includes(k), k);
  });
});

describe('Thème du visiteur : les six variables sont gardées déjà calculées, pour chaque mode', () => {
  it('le contenu porte vitrine.clair et vitrine.sombre, deux jeux complets et lisibles', () => {
    const s = faux();
    V.ecrire(theme(), { stockage: s });
    const c = JSON.parse(s.m.get(V.CLE));
    assert.equal(c.v, 1, 'ajout sans changer de version : un lecteur qui l’ignore lit comme avant');
    for (const mode of ['clair', 'sombre']) {
      assert.deepEqual(Object.keys(c.vitrine[mode]).sort(), ['--accent', '--encre', '--filet', '--papier', '--plume', '--surface'], mode);
      assert.ok(T.contraste(c.vitrine[mode]['--encre'], c.vitrine[mode]['--papier']) >= 4.5, mode + ' : texte lisible');
    }
    assert.notEqual(c.vitrine.clair['--papier'], c.vitrine.sombre['--papier']);
  });

  it('un thème sans sombre (« aucun ») n’a pas de jeu sombre : la page garde son rendu', () => {
    const s = faux();
    V.ecrire(theme({ modes: { sombre: 'aucun' } }), { stockage: s });
    const c = JSON.parse(s.m.get(V.CLE));
    assert.ok(c.vitrine.clair);
    assert.equal(c.vitrine.sombre, null);
  });

  it('un thème dont les surcharges rendent un mode illisible n’a pas de jeu pour ce mode', () => {
    const s = faux();
    assert.equal(V.ecrire(theme({ surcharges: { clair: { texte: '#fdfaf3', fond: '#fdfaf3' } } }), { stockage: s }).ok, true, 'le thème reste valide');
    const c = JSON.parse(s.m.get(V.CLE));
    assert.equal(c.vitrine.clair, null);
    assert.ok(c.vitrine.sombre);
  });

  it('relire ne dépend pas du cache : lire recalcule la validité depuis le thème', () => {
    const s = faux();
    s.m.set(V.CLE, JSON.stringify({ v: 1, maj: 1, themedef: theme(), vitrine: { clair: { '--papier': '#ffffff' }, sombre: null } }));
    assert.equal(V.lire({ stockage: s }).themedef.nom, 'Forêt d’automne');
  });
});
