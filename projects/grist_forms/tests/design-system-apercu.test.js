'use strict';

/*
 * Le design system se montre pendant qu'on le saisit : le thème d'aperçu dont le formulaire s'habille, l'illustration de
 * chaque module, et les fichiers qu'on dépose. Rien de ce que la personne tape n'arrive tel quel dans la page.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const D = require('../shared/design-system.js');
const A = require('../shared/design-system-apercu.js');
const Theme = require('../shared/theme.js');

const doc = (extra) => Object.assign({
  dsdef: '0.1', identite: { id: 'ds', nom: 'Mon DS', version: '1.0.0', statut: 'brouillon' },
  couleurs: { principal: '#ef7757', secondaire: '#292574', encre: '#161616', fond: '#ffffff', etats: { succes: '#18753c', erreur: '#ce0500' },
    neutres: [{ nom: 'gris', valeur: '#e7e7e7' }], identites: [{ id: 'a', nom: 'Aménagement', plein: '#292574', intermediaire: '#8e84ae', clair: '#e7e4ef', secondaire: '#ef7757' }] },
  modes: { sombre: 'derive' }, exigences: { contrasteTexte: 4.5, contrasteMinimal: 3 },
  typographie: { familles: [{ role: 'titre', nom: 'Marianne', repli: 'Arial, sans-serif' }], echelle: { base: 16, ratio: 1.25 } },
  forme: { rayons: [{ nom: 'petit', valeur: '4px' }], ombres: [{ nom: 'doux', valeur: '0 1px 4px rgba(0, 0, 0, 0.3)' }], traits: { epaisseur: 1 } },
  espacement: { unite: 4, echelle: [1, 2, 4, 8] },
  grille: { colonnes: 12, gouttiere: 16, pointsRupture: [{ nom: 'm', largeur: 768 }] },
  supports: { formats: [{ nom: 'A4', largeur: '210mm', hauteur: '297mm' }] },
  interaction: { cibleMinPx: 44, focus: { epaisseurPx: 2 }, etats: ['survol', 'focus'], mouvement: { dureeCourteMs: 150, dureeLongueMs: 400 } },
  visualisation: { categorielle: ['#111111', '#222222', '#333333'] },
  composants: [{ nom: 'bouton', variantes: ['plein', 'contour'] }],
  editorial: { slogan: 'Agir', voix: 'Claire et directe.' }, accessibilite: { niveauCible: 'WCAG-2.2-AA', respectPreferences: ['mouvement-reduit'] },
  gouvernance: { ecarts: [{ id: 'orange', regle: 'C2', raison: 'Marque.' }] }
}, extra || {});

describe('Aperçu : le thème dont le formulaire s\'habille', () => {
  it('donne les 26 variables du contrat, toutes admises par le juge du moteur', () => {
    for (const mode of ['clair', 'sombre']) {
      const { vars } = A.themeVars(doc(), mode);
      const rapport = Theme.valider(vars);
      assert.equal(Object.keys(rapport.applique).length, 26, mode);
      assert.deepEqual(rapport.ignore, [], mode);
    }
  });

  it('garde la personne lisible : texte, bouton et champ restent au-dessus des seuils', () => {
    for (const d of [doc(), doc({ couleurs: { principal: '#ffff00', fond: '#ffffff', encre: '#fefefe' } }), doc({ couleurs: { principal: '#000000', fond: '#000000', encre: '#010101' } })]) {
      for (const mode of ['clair', 'sombre']) {
        const v = A.themeVars(d, mode).vars;
        assert.ok(D.contraste(v.texte, v.surface) >= 3, 'texte sur surface');
        assert.ok(D.contraste(v.action, v.surface) >= 3, 'action sur surface');
        assert.ok(D.contraste(v['action-texte'], v.action) >= 4.5, 'texte du bouton');
        assert.ok(D.contraste(v['bord-champ'], v.surface) >= 3, 'bord de champ');
      }
    }
  });

  it('dit ce qu\'il a redressé, sans le faire en silence', () => {
    const r = A.themeVars(doc({ couleurs: { principal: '#ffff00', fond: '#ffffff', encre: '#fefefe' } }), 'clair');
    assert.equal(r.remarques.length, 2);
    assert.match(r.remarques[0], /texte est trop proche/);
    assert.match(r.remarques[1], /principale/);
    assert.deepEqual(A.themeVars(doc({ couleurs: { principal: '#3d4f63', fond: '#ffffff', encre: '#161616' } }), 'clair').remarques, []);
    assert.equal(A.themeVars(doc(), 'clair').remarques.length, 1, 'l orange de marque, 2,82:1 sur blanc, est redressé pour le bouton et le dit');
  });

  it('une secondaire trop claire pour des titres est foncée, et le dit', () => {
    const r = A.themeVars(doc({ couleurs: { principal: '#0b6e4f', secondaire: '#f4a259', encre: '#1b1b1b', fond: '#fdfaf3' } }), 'clair');
    assert.ok(D.contraste(r.vars.accent, r.vars.surface) >= 3);
    assert.ok(r.remarques.some((x) => /secondaire/.test(x)));
  });

  it('la couleur choisie se voit : la principale est celle du bouton quand elle est lisible', () => {
    assert.equal(A.themeVars(doc({ couleurs: { principal: '#3d4f63', fond: '#ffffff' } }), 'clair').vars.action, '#3d4f63');
  });

  it('le mode sombre : dérivé, explicite (les trois couleurs du document), ou absent', () => {
    assert.deepEqual(A.modesDisponibles(doc({ modes: { sombre: 'aucun' } })), ['clair']);
    assert.deepEqual(A.modesDisponibles(doc()), ['clair', 'sombre']);
    const e = A.themeVars(doc({ modes: { sombre: 'explicite' }, couleurs: { principal: '#112233', fond: '#ffffff', sombre: { principal: '#aabbcc', encre: '#eeeeee', fond: '#101820' } } }), 'sombre').vars;
    assert.equal(e.fond, '#101820');
    assert.equal(e.texte, '#eeeeee');
    const d = A.themeVars(doc(), 'sombre').vars;
    assert.equal(d.fond, '#161616');
  });

  it('une valeur qui n\'est pas #RRGGBB ne passe jamais : le défaut reste', () => {
    const v = A.themeVars(doc({ couleurs: { principal: 'red;background:url(x)', encre: 'javascript:1', fond: '#GGGGGG' } }), 'clair').vars;
    Object.keys(v).forEach((k) => assert.match(v[k], /^(#[0-9a-f]{6}|rgba\(0, 0, 0, 0\.25\))$/, k));
  });

  it('forme et tailles : seulement ce que le document dit, toujours bornées', () => {
    assert.deepEqual(A.reglagesForme({}), {});
    assert.deepEqual(A.reglagesForme(doc()), { '--radius': '4px', '--cible': '44px', '--texte': '1rem' });
    assert.deepEqual(A.reglagesForme({ forme: { rayons: [{ valeur: 'calc(1px)' }] }, interaction: { cibleMinPx: 500 }, typographie: { echelle: { base: 3 } } }), {});
  });
});

describe('Aperçu : l\'illustration d\'un module', () => {
  it('chaque module connu se montre quand le document a de quoi', () => {
    for (const m of A.MODULES) {
      const h = A.apercuHtml(m, doc());
      assert.ok(h.length > 0, m);
      assert.match(h, new RegExp('data-module="' + m + '"'));
    }
    assert.equal(A.apercuHtml('inconnu', doc()), '');
    assert.equal(A.apercuHtml('constructor', doc()), '', 'un nom de module n\'est pas une propriété');
    assert.equal(A.apercuHtml('couleurs', {}), '', 'rien à montrer encore : rien');
  });

  it('les contrastes se mesurent sous les yeux, avec le seuil du document', () => {
    const h = A.apercuHtml('couleurs', doc({ couleurs: { principal: '#ef7757', encre: '#161616', fond: '#ffffff' } }));
    assert.match(h, /texte sur le fond/);
    assert.match(h, /principale sur le fond/);
    assert.match(h, /sous le seuil de 3,00:1|sous le seuil de 3:1/);
  });

  it('le texte qu\'on écrit est échappé', () => {
    const h = A.apercuHtml('identite', doc({ identite: { nom: '<img src=x onerror=alert(1)>', id: 'x"y' } }));
    assert.ok(!h.includes('<img'));
    assert.match(h, /&lt;img/);
    const g = A.apercuHtml('gouvernance', doc({ gouvernance: { ecarts: [{ regle: '<b>', raison: '"><script>1</script>' }] } }));
    assert.ok(!g.includes('<script'));
  });

  it('une couleur, une longueur, une ombre ou un nom de police qui sortirait du cadre n\'est pas posé en style', () => {
    const h = A.apercuHtml('forme', doc({ forme: { rayons: [{ nom: 'x', valeur: '4px;background:url(//e)' }, { nom: 'ok', valeur: '8px' }], ombres: [{ nom: 'mauvaise', valeur: '0 0 0 red;position:fixed' }, { nom: 'bonne', valeur: '0 2px 6px rgba(0, 0, 0, 0.2)' }] } }));
    assert.ok(!/url\(/.test(h));
    assert.ok(!/position:fixed/.test(h));
    assert.match(h, /border-radius:8px/);
    assert.match(h, /box-shadow:0 2px 6px rgba\(0, 0, 0, 0\.2\)/);
    const t = A.apercuHtml('typographie', doc({ typographie: { familles: [{ role: 'titre', nom: "Mon';x:'", repli: 'a;b' }, { role: 'texte', nom: 'Spectral', repli: 'serif' }] } }));
    assert.ok(!t.includes("Mon';"));
    assert.match(t, /font-family:'Spectral',serif/);
    const c = A.apercuHtml('couleurs', doc({ couleurs: { principal: '#ff0000;x', secondaire: '#00ff00', fond: '#ffffff' } }));
    assert.ok(!/#ff0000;x/.test(c));
    assert.match(c, /background:#00ff00/);
  });

  it('les supports se dessinent à l\'échelle, les durées et espacements en barres bornées', () => {
    const s = A.apercuHtml('supports', doc());
    assert.match(s, /width:64px;height:90px|width:63px;height:90px/);
    const e = A.apercuHtml('espacement', doc({ espacement: { unite: 16, echelle: [64, 1] } }));
    assert.match(e, /width:400px/, 'borné');
  });

  it('le mode sombre se montre à côté du clair, ou pas du tout', () => {
    assert.equal((A.apercuHtml('modes', doc()).match(/ds-mini"/g) || []).length, 2);
    assert.equal((A.apercuHtml('modes', doc({ modes: { sombre: 'aucun' } })).match(/ds-mini"/g) || []).length, 1);
  });
});

describe('Fichiers : reconnaître, fusionner, repartir d\'un ThemeDef', () => {
  const plan = () => D.construire(D.CATALOGUE_MINIMAL, { niveau: 0 }).plan;

  it('chaque fichier est reconnu à son contenu', () => {
    assert.equal(D.typeDeFichier({ _format: 'dsdef-catalogue/0.1', champs: [] }), 'catalogue');
    assert.equal(D.typeDeFichier({ version: 'themedef-1.0', graines: { principal: '#112233' } }), 'themedef');
    assert.equal(D.typeDeFichier({ dsdef: '0.1', identite: {} }), 'document');
    assert.equal(D.typeDeFichier({ autre: 1 }), null);
    assert.equal(D.typeDeFichier([]), null);
    assert.equal(D.typeDeFichier(null), null);
    assert.equal(D.typeDeFichier('texte'), null);
  });

  it('un ThemeDef donne le début d\'un design system', () => {
    const d = D.depuisThemeDef({ version: 'themedef-1.0', nom: 'Mon thème', graines: { principal: '#112233', fond: 'pas-une-couleur' }, modes: { sombre: 'derive' }, exigences: { contrasteTexte: 7, contrasteComposant: 3 } });
    assert.equal(d.dsdef, '0.1');
    assert.equal(d.identite.nom, 'Mon thème');
    assert.equal(d.identite.id, 'mon-theme');
    assert.deepEqual(d.couleurs, { principal: '#112233' });
    assert.equal(d.modes.sombre, 'derive');
    assert.deepEqual(d.exigences, { contrasteTexte: 7, contrasteMinimal: 3 });
    assert.deepEqual(D.depuisThemeDef({}), { dsdef: '0.1' });
  });

  it('fusionner : ce que le formulaire dit prime, le reste est gardé, une question vidée disparaît', () => {
    const ancien = { dsdef: '0.1', identite: { id: 'ds', nom: 'Ancien' }, couleurs: { principal: '#111111', fond: '#ffffff' }, typographie: { echelle: { base: 18 } }, _provenance: { de: 'fichier' } };
    const nouveau = { dsdef: '0.1', identite: { id: 'ds', nom: 'Nouveau' }, couleurs: { principal: '#222222' } };
    const r = D.fusionner(plan(), ancien, nouveau);
    assert.equal(r.identite.nom, 'Nouveau');
    assert.equal(r.couleurs.principal, '#222222');
    assert.ok(!('fond' in r.couleurs), 'vidé dans le formulaire : retiré');
    assert.deepEqual(r.typographie, { echelle: { base: 18 } }, 'hors du formulaire : gardé');
    assert.deepEqual(r._provenance, { de: 'fichier' });
    assert.equal(ancien.identite.nom, 'Ancien', 'l\'original n\'est pas touché');
  });

  it('fusionner : un objet que le retrait laisse vide disparaît aussi', () => {
    const r = D.fusionner(plan(), { dsdef: '0.1', couleurs: { principal: '#111111' } }, { dsdef: '0.1' });
    assert.ok(!('couleurs' in r));
  });

  it('un niveau plus bas n\'efface rien de ce qu\'un niveau plus haut avait renseigné', () => {
    const haut = D.construire({ _format: 'dsdef-catalogue/0.1', niveaux: [], regles: [], modules: [{ id: 'a', nom: 'A' }],
      champs: [
        { id: 'a.x', module: 'a', niveau: 0, obligation: 'facultatif', type: 'texte', label: 'X', aide: '', contraintes: {} },
        { id: 'a.y', module: 'a', niveau: 1, obligation: 'facultatif', type: 'texte', label: 'Y', aide: '', contraintes: {} }
      ] }, { niveau: 0 });
    const r = D.fusionner(haut.plan, { dsdef: '0.1', a: { x: 'un', y: 'deux' } }, { dsdef: '0.1', a: { x: 'trois' } });
    assert.deepEqual(r.a, { x: 'trois', y: 'deux' });
  });
});
