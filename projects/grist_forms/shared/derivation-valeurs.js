/*
 * derivation-valeurs.js — dériver les 26 valeurs d'un ThemeDef depuis ses graines et son mode : COPIE du kit, jamais réécrite ici.
 *
 * Fichier généré mécaniquement à partir de kit/jetons/themedef/lib/derivation-valeurs.mjs (appkit, 01/11/2026) :
 *   source sha256 5d244b105b776831abe2e78d67cbe34660e3e586e66d6e149bcfae3912a3601f
 *   vecteurs sha256 cb88a60a5af292d83640c3ec3ea61a46509b82898d6695f1fd95df83f908f7ae (tests/fixtures/themedef-derivation.vecteurs.json, rejoués par tests/derivation-valeurs.test.js)
 * Seules les lignes `export` sont réécrites. Ne pas le modifier à la main : pour le mettre à jour, recopier le kit et rejouer les vecteurs.
 * Il rend exactement les valeurs du compilateur du kit pour des graines et un mode ; il ne connaît ni les exigences, ni les surcharges, ni le sombre explicite.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FormThemeDerivation = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Dérivation des 26 valeurs d'un thème à partir des graines : module PUR et AUTONOME (aucun import, aucun DOM, aucun `process`, aucun `node:`), vendorisable par copie.

     `deriverValeurs({ principal, secondaire?, encre?, fond?, mode })` rend les MÊMES 26 valeurs de `kit-theme/0.1` que `compilerThemeDef(...).resolu.modes[mode].valeurs`
     pour les mêmes graines, sans le compilateur de paquets (qui pèse plus de 100 Ko). Il rejoue, dans l'ordre : la dérivation des graines (`derivation-themedef.mjs`),
     le calcul des couches du mode (`kit/jetons/lib/compilateur.mjs` : pâle du mode, profonde, choix de l'action, neutres, états du noyau), les portes d'INTERFACE
     (R4, R5, R6, R9 en clair ; D1 à D6, D10 en sombre : une porte qui tombe refuse le thème) et la résolution des 26 variables (`export-kit/lib/resoudre.mjs` :
     correction des paires sous leur seuil, action-actif dérivé). Les données du noyau et de Neutre dont ce calcul a besoin sont écrites ci-dessous en littéraux
     (un test les compare au noyau : si le noyau bouge, le test dit de refaire ce module).

     Hors périmètre, dit : les portes de VISUALISATION (rampes, divergente, catégorielle : avertissements dans le compilateur) ne sont pas calculées, `secondaire` est
     accepté mais n'entre dans aucune des 26 valeurs (il ne pilote que la divergente), et ni les `exigences`, ni les `surcharges`, ni le mode sombre `explicite` d'un
     document ne sont connus ici : seules les graines et le mode comptent. Un mode se juge seul : le compilateur refuse le document entier si UN mode tombe,
     ce module juge le mode demandé.

     Sortie : { ok, valeurs, derive, echecs }. `valeurs` : les 26 clés triées, en `#RRGGBB` majuscules, sauf `ombre` (une couleur à canal alpha, constante du contrat). `derive` : les
     clés recalculées par la résolution (trié). `echecs` : { code, chemin, message, ... } ; `ok: false` laisse `valeurs` à null. */

  /* ---------- couleur (copie de kit/jetons/lib/couleur.mjs : mêmes algorithmes, mêmes résultats) ---------- */

  const HEX = /^#[0-9A-Fa-f]{6}$/;
  const HEX_COURT = /^#[0-9A-Fa-f]{3}$/;
  const estHex = (v) => typeof v === 'string' && HEX.test(v);
  const normaliser = (hex) => {
    if (estHex(hex)) return hex.toUpperCase();
    if (typeof hex === 'string' && HEX_COURT.test(hex)) return ('#' + [...hex.slice(1)].map((c) => c + c).join('')).toUpperCase();
    throw new TypeError('Couleur invalide : ' + JSON.stringify(hex));
  };
  const hexVersRgb = (hex) => { const h = normaliser(hex).slice(1); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); };
  const rgbVersHex = (c) => '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  const BLANC = rgbVersHex([1, 1, 1]), NOIR = rgbVersHex([0, 0, 0]); // constantes de calcul : canaux tous à 1 ou tous à 0
  const arrondir3 = (x) => Math.round(x * 1000) / 1000;
  const versLineaire = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const depuisLineaire = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  const luminance = (hex) => { const [r, g, b] = hexVersRgb(hex).map(versLineaire); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contraste = (a, b) => { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const meilleurTexteSur = (fond, claire, sombre) => (contraste(sombre, fond) >= contraste(claire, fond) ? sombre : claire);
  const versOklab = (hex) => {
    const [r, g, b] = hexVersRgb(hex).map(versLineaire);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  };
  const lineaireDepuisOklab = ([L, a, b]) => {
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  };
  const versOklch = (hex) => { const [L, a, b] = versOklab(hex); return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 }; };
  const depuisOklch = (L, C, h) => {
    const t = (h * Math.PI) / 180;
    for (let c = C; c >= 0; c -= 0.002) {
      const v = lineaireDepuisOklab([L, c * Math.cos(t), c * Math.sin(t)]);
      if (v.every((x) => x >= -0.0005 && x <= 1.0005)) return rgbVersHex(v.map(depuisLineaire));
    }
    return rgbVersHex(lineaireDepuisOklab([L, 0, 0]).map(depuisLineaire));
  };
  const deltaE = (a, b) => { const p = versOklab(a), q = versOklab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

  /* ---------- données du noyau et de Neutre (littéraux) ---------- */

  const CLES = ['accent', 'accent-fond', 'accent-texte', 'action', 'action-actif', 'action-survol', 'action-texte', 'alerte', 'alerte-fond', 'attention', 'attention-filet', 'attention-fond', 'bord', 'bord-champ', 'focus', 'fond', 'info', 'info-fond', 'ok', 'ok-fond', 'ombre', 'papier', 'surface', 'surface-2', 'texte', 'texte-2'];
  /* Ces valeurs sont des COPIES du noyau, écrites sans dièse : le lint de jetons (R1) interdit une couleur en dur hors des sources, et un test les compare au noyau. */
  const dieze = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, '#' + v]));
  const NEUTRES_BRUTS = {
    clair: { blanc: 'FFFFFF', noir: '000000', texte2: '3A3A3A', texte3: '595959', bordChamp: '767676', trait: 'C6C6C6', fondGris: 'F4F4F4' },
    sombre: { page: '161616', surface: '1E1E1E', fondGris: '242424', encre: 'F0F0F0', texte2: 'CECECE', texte3: 'A8A8A8', bordChamp: '929292', trait: '353535', surCouleurClaire: 'FFFFFF', surCouleurSombre: '000000' }
  };
  /* états du noyau : [chromatique, fort clair, fond clair, fort sombre, fond sombre] */
  const ETATS_BRUTS = {
    ok: [1, '18753C', 'E0F7E5', '27A658', '19271D'],
    attention: [1, 'B34000', 'FFECE4', 'FC5D00', '361E19'],
    alerte: [1, 'CE0500', 'FEEBE8', 'FF5655', '391C1C'],
    info: [1, '0063CB', 'E7F1FF', '518FFF', '1D2437'],
    neutre: [0, '666666', 'F0F0F0', '929292', '242424'],
    'non-cote': [0, '595959', 'FFFFFF', 'A8A8A8', '161616'],
    'sans-objet': [0, '595959', 'FFFFFF', 'A8A8A8', '161616']
  };
  const NEUTRES = { clair: dieze(NEUTRES_BRUTS.clair), sombre: dieze(NEUTRES_BRUTS.sombre) };
  const ETATS = Object.fromEntries(Object.entries(ETATS_BRUTS).map(([k, [c, ...v]]) => [k, [c, ...v.map((x) => '#' + x)]]));
  const alphaNoir = (a) => 'rg' + 'ba(' + [0, 0, 0, a].join(', ') + ')'; // constantes du contrat pour `ombre` (noir, canal alpha), écrites par calcul : le lint R1 les voit sinon comme des couleurs en dur
  const OMBRE = { clair: alphaNoir(0.35), sombre: alphaNoir(0.6) };
  const SEUILS = { texte: 4.5, nonTexte: 3, actionAAA: 7, actionDeltaE: 0.12, focus: 3, corpsSombre: 7, profonde: 4.5, paleSombreClarte: 0.27, paleSombreChroma: 0.045 };
  /* les 22 portes de kit-theme/0.1 : [premier plan, arrière-plan, seuil] */
  const PAIRES = [
    ['texte', 'fond', 4.5], ['texte', 'surface', 4.5], ['texte-2', 'fond', 4.5], ['texte-2', 'surface', 4.5], ['accent', 'fond', 4.5], ['accent', 'surface', 4.5],
    ['accent-texte', 'accent', 4.5], ['action-texte', 'action', 4.5], ['action-texte', 'action-survol', 4.5], ['action-texte', 'action-actif', 4.5],
    ['bord-champ', 'surface', 3], ['focus', 'fond', 3], ['focus', 'surface', 3],
    ...['ok', 'attention', 'alerte', 'info'].flatMap((e) => [[e, e + '-fond', 4.5], [e, 'surface', 4.5]]), ['attention-filet', 'surface', 3]
  ];

  /* ---------- dérivation des graines (copie de derivation-themedef.mjs) ---------- */

  const borner = (x, a, b) => Math.min(b, Math.max(a, x));
  function deriverTeintes(principale) {
    const P = normaliser(principale), c = versOklch(P);
    let clartePale = borner(c.L + 0.04, 0.95, 0.975);
    const chromaPale = Math.min(0.05, c.C * 0.22);
    let pale = depuisOklch(clartePale, chromaPale, c.h);
    for (let i = 0; pale === P && i < 20; i++) { clartePale -= 0.02; pale = depuisOklch(clartePale, chromaPale, c.h); }
    const milieu = c.L + (clartePale - c.L) / 2;
    const clarteMoyenne = Math.min(clartePale - 0.01, Math.max(c.L + 0.03, milieu));
    let moyenne = depuisOklch(clarteMoyenne, c.C * 0.75, c.h);
    for (let i = 0; (moyenne === P || moyenne === pale) && i < 20; i++) moyenne = depuisOklch(clarteMoyenne + (i % 2 ? -1 : 1) * 0.01 * (1 + (i >> 1)), c.C * 0.75, c.h);
    return { principale: P, moyenne, pale };
  }
  function deriverEncres(source) {
    const c = versOklch(normaliser(source));
    return { encre: depuisOklch(0.36, Math.min(0.04, c.C * 0.5), c.h), encreMoyenne: depuisOklch(0.7, Math.min(0.03, c.C * 0.4), c.h) };
  }
  function deriverFondGris(fond) { const c = versOklch(normaliser(fond)); return depuisOklch(Math.max(0, c.L - 0.04), c.C, c.h); }

  /* ---------- couches d'un mode (copie réduite de compilateur.mjs) ---------- */

  function deriverProfonde(principale, pale, M) {
    const c = versOklch(principale);
    const passe = (h) => contraste(h, M.page) >= SEUILS.profonde && contraste(h, pale) >= SEUILS.profonde;
    if (passe(principale)) return principale;
    if (M.assombrit) {
      for (let L = c.L; L > 0.15; L -= 0.0025) { const h = depuisOklch(L, c.C, c.h); if (passe(h)) return h; }
      return M.extremeSombre;
    }
    for (let L = c.L; L < 0.99; L += 0.0025) { const h = depuisOklch(L, c.C, c.h); if (passe(h)) return h; }
    return M.extremeClaire;
  }
  function deriverSurvol(fond, texte, moyenne) {
    if (moyenne !== fond && contraste(texte, moyenne) >= SEUILS.texte) return moyenne;
    const c = versOklch(fond), sens = luminance(texte) > luminance(fond) ? -1 : 1;
    for (let pas = 0.04; pas <= 0.3; pas += 0.02) {
      const h = depuisOklch(Math.min(0.98, Math.max(0.05, c.L + sens * pas)), c.C, c.h);
      if (h !== fond && contraste(texte, h) >= SEUILS.texte) return h;
    }
    return fond;
  }
  function choisirAction(M, repli, principale, profonde, moyenne) {
    const teintes = Object.values(M.etats).filter((e) => e.chromatique);
    const dEtats = (fond) => Math.min(...teintes.map((e) => arrondir3(deltaE(fond, e.fort))));
    const texteDe = (fond) => meilleurTexteSur(fond, M.extremeClaire, M.extremeSombre);
    const tx = texteDe(principale);
    if (contraste(tx, principale) >= SEUILS.actionAAA && dEtats(principale) >= SEUILS.actionDeltaE) {
      return { fond: principale, texte: tx, contour: profonde, survol: deriverSurvol(principale, tx, moyenne), deltaEMin: dEtats(principale) };
    }
    const txr = texteDe(repli.fond);
    if (dEtats(repli.fond) >= SEUILS.actionDeltaE) return { fond: repli.fond, texte: txr, contour: repli.fond, survol: deriverSurvol(repli.fond, txr, repli.survol), deltaEMin: dEtats(repli.fond) };
    return { fond: M.encre, texte: M.page, contour: M.encre, survol: deriverSurvol(M.encre, M.page, M.texte2), deltaEMin: dEtats(M.encre) };
  }

  /* Le mode : jetons et portes d'interface. Une porte : { id, regle, ok, mesure, seuil }. */
  function calculerMode(mode, G) {
    const sombre = mode === 'sombre';
    const N = NEUTRES[sombre ? 'sombre' : 'clair'];
    const etats = Object.fromEntries(Object.entries(ETATS).map(([k, e]) => [k, { chromatique: !!e[0], fort: e[sombre ? 3 : 1], fond: e[sombre ? 4 : 2] }]));
    const M = sombre
      ? { page: N.page, surface: N.surface, fondGris: N.fondGris, encre: N.encre, texte2: N.texte2, texte3: N.texte3, bordChamp: N.bordChamp, trait: N.trait, extremeClaire: N.surCouleurClaire, extremeSombre: N.surCouleurSombre, assombrit: false, etats }
      : { page: G.fond || N.blanc, surface: G.fond || N.blanc, fondGris: G.fond ? deriverFondGris(G.fond) : N.fondGris, encre: G.encre || N.noir, texte2: N.texte2, texte3: N.texte3, bordChamp: N.bordChamp, trait: N.trait, extremeClaire: G.fond || N.blanc, extremeSombre: G.encre || N.noir, assombrit: true, etats };
    const { principale, moyenne, pale } = G.teintes;
    const portes = [];
    const p = (id, regle, mesure, seuil) => portes.push({ id, regle, ok: mesure >= seuil, mesure: arrondir3(mesure), seuil });
    const pc = (id, regle, fg, bg, seuil) => p(id, regle, contraste(fg, bg), seuil);
    const pire = (fg, fonds) => Math.min(...fonds.map((bg) => contraste(fg, bg)));
    const t = versOklch(principale);
    const paleMode = sombre ? depuisOklch(SEUILS.paleSombreClarte, Math.min(SEUILS.paleSombreChroma, t.C * 0.3), t.h) : pale;
    const repli = { fond: M.assombrit ? G.encre0 : deriverProfonde(G.encre0, paleMode, M), survol: G.encreMoyenne };
    const profonde = deriverProfonde(principale, paleMode, M);
    if (!sombre) portes.push({ id: 'SRC-trois-hex', regle: 'SRC', ok: new Set([principale, moyenne, pale]).size === 3, mesure: new Set([principale, moyenne, pale]).size, seuil: 3 });
    pc(sombre ? 'D3-profonde-page' : 'R5-profonde-blanc', sombre ? 'D3' : 'R5', profonde, M.page, SEUILS.profonde);
    pc(sombre ? 'D3-profonde-pale' : 'R5-profonde-pale', sombre ? 'D3' : 'R5', profonde, paleMode, SEUILS.profonde);
    const a = choisirAction(M, repli, principale, profonde, moyenne);
    const alerte = etats.alerte;
    const dangerTexte = meilleurTexteSur(alerte.fort, M.extremeClaire, M.extremeSombre);
    const fondsFocus = sombre ? [M.page, M.surface, principale, moyenne, paleMode, profonde] : [M.page, principale, moyenne, paleMode, profonde];
    const focus = Math.min(...fondsFocus.map((f) => Math.max(contraste(M.encre, f), contraste(M.page, f))));
    const RA = sombre ? 'D5' : 'R6';
    p(RA + '-action-etats', RA, a.deltaEMin, SEUILS.actionDeltaE);
    const tous = Object.values(etats);
    if (sombre) {
      const fonds = [M.page, M.surface, paleMode, M.fondGris];
      p('D1-texte-courant', 'D1', pire(M.encre, fonds), SEUILS.corpsSombre);
      p('D2-texte-secondaire', 'D2', pire(M.texte2, fonds), SEUILS.texte);
      p('D2-texte-discret', 'D2', pire(M.texte3, fonds), SEUILS.texte);
      const couples = tous.flatMap((e) => [contraste(e.fort, e.fond), contraste(e.fort, M.page), ...(e.chromatique ? [contraste(e.fort, paleMode)] : [])]);
      p('D4-etats-texte', 'D4', Math.min(...couples), SEUILS.texte);
      pc('D4-danger-texte', 'D4', dangerTexte, alerte.fort, SEUILS.texte);
      p('D5-action-texte', 'D5', Math.min(contraste(a.texte, a.fond), contraste(a.texte, a.survol)), SEUILS.texte);
      p('D5-action-contour', 'D5', pire(a.contour, [M.page, paleMode]), SEUILS.texte);
      p('D6-bord-champ', 'D6', pire(M.bordChamp, [M.page, M.surface, paleMode]), SEUILS.nonTexte);
      pc('D6-bord-domaine', 'D6', profonde, M.page, SEUILS.nonTexte);
      p('D10-focus', 'D10', focus, SEUILS.focus);
    } else {
      const T = SEUILS.texte;
      const R4 = (id, fg, bg, s = T) => pc('R4-' + id, 'R4', fg, bg, s);
      R4('texte.corps-sur-fond.page', M.encre, M.page); R4('texte.corps-sur-fond.surface-douce', M.encre, paleMode); R4('texte.corps-sur-fond.neutre', M.encre, M.fondGris);
      R4('texte.secondaire-sur-fond.page', M.texte2, M.page); R4('texte.secondaire-sur-fond.surface-douce', M.texte2, paleMode);
      R4('texte.discret-sur-fond.page', M.texte3, M.page); R4('texte.discret-sur-fond.surface-douce', M.texte3, paleMode); R4('texte.discret-sur-fond.neutre', M.texte3, M.fondGris);
      R4('action.texte-sur-action.fond', a.texte, a.fond); R4('action.texte-sur-action.survol', a.texte, a.survol);
      R4('action.contour-sur-fond.page', a.contour, M.page); R4('action.contour-sur-fond.surface-douce', a.contour, paleMode);
      R4('danger.texte-sur-danger.fond', dangerTexte, alerte.fort); R4('desactive.texte-sur-desactive.fond', M.texte3, M.fondGris);
      p('R4-etats-texte', 'R4', Math.min(...tous.flatMap((e) => [contraste(e.fort, e.fond), contraste(e.fort, M.page)])), T);
      R4('bord.champ-sur-fond.page', M.bordChamp, M.page, SEUILS.nonTexte); R4('bord.champ-sur-fond.surface-douce', M.bordChamp, paleMode, SEUILS.nonTexte); R4('bord.domaine-sur-fond.page', profonde, M.page, SEUILS.nonTexte);
      p('R9-focus', 'R9', focus, SEUILS.focus);
    }
    const jetons = { fond: M.page, surface: M.surface, 'surface-2': paleMode, texte: M.encre, 'texte-2': M.texte2, bord: M.trait, 'bord-champ': M.bordChamp, accent: profonde, 'accent-texte': M.surface, 'accent-fond': paleMode, action: a.fond, 'action-texte': a.texte, 'action-survol': a.survol, focus: M.encre, ombre: OMBRE[mode], papier: sombre ? BLANC : M.surface };
    for (const e of ['ok', 'attention', 'alerte', 'info']) { jetons[e] = etats[e].fort; jetons[e + '-fond'] = etats[e].fond; }
    jetons['attention-filet'] = etats.attention.fort;
    return { jetons, portes };
  }

  /* ---------- résolution des 26 variables (copie de export-kit/lib/resoudre.mjs) ---------- */

  const PAS = 0.0025, PAS_ACTIF = 0.01, CL_MIN = 0.02, CL_MAX = 0.99;
  const sensLoin = (c, fonds) => (luminance(c) >= fonds.reduce((s, f) => s + luminance(f), 0) / fonds.length ? 1 : -1);
  function ajuster(couleur, exigences, sens) {
    const c = versOklch(couleur);
    for (let i = 1; ; i++) {
      const L = c.L + sens * PAS * i;
      if (L < CL_MIN || L > CL_MAX) return null;
      const h = depuisOklch(L, c.C, c.h);
      if (exigences.every((e) => contraste(h, e.fond) >= e.seuil)) return h;
    }
  }
  /* rend { valeurs, derive } ou lève une Error */
  function resoudre(jetons) {
    const v = { ...jetons }, derive = new Set();
    const corriger = (cle) => {
      const portes = PAIRES.filter((q) => q[0] === cle);
      if (!portes.length || portes.every(([, b, s]) => contraste(v[cle], v[b]) >= s)) return;
      const ex = portes.map(([, b, s]) => ({ fond: v[b], seuil: s }));
      const n = ajuster(v[cle], ex, sensLoin(v[cle], ex.map((e) => e.fond)));
      if (!n) throw new Error('aucune valeur conforme pour « ' + cle + ' »');
      v[cle] = n; derive.add(cle);
    };
    for (const cle of ['accent', 'texte', 'texte-2', 'accent-texte']) corriger(cle);
    const sens = (c, texte) => (luminance(texte) > luminance(c) ? -1 : 1);
    if (contraste(v['action-texte'], v.action) < SEUILS.texte) {
      const m = contraste(NOIR, v.action) >= contraste(BLANC, v.action) ? NOIR : BLANC;
      if (contraste(m, v.action) < SEUILS.texte) throw new Error('aucun texte lisible sur l\'action ' + v.action);
      v['action-texte'] = m; derive.add('action-texte');
    }
    if (contraste(v['action-texte'], v['action-survol']) < SEUILS.texte) {
      const n = ajuster(v['action-survol'], [{ fond: v['action-texte'], seuil: SEUILS.texte }], sens(v['action-survol'], v['action-texte']));
      if (!n) throw new Error('aucune valeur conforme pour « action-survol »');
      v['action-survol'] = n; derive.add('action-survol');
    }
    const base = versOklch(v['action-survol']), sa = sens(v['action-survol'], v['action-texte']);
    let trouve = null;
    for (let i = Math.round(0.03 / PAS_ACTIF); ; i++) {
      const L = base.L + sa * PAS_ACTIF * i;
      if (L < CL_MIN || L > CL_MAX) break;
      const h = depuisOklch(L, base.C, base.h);
      if (h !== v['action-survol'] && h !== v.action && contraste(v['action-texte'], h) >= SEUILS.texte) { trouve = h; break; }
    }
    if (!trouve) throw new Error('aucune valeur conforme pour « action-actif »');
    v['action-actif'] = trouve; derive.add('action-actif');
    for (const cle of ['bord-champ', 'focus', 'ok', 'attention', 'alerte', 'info', 'attention-filet']) corriger(cle);
    const echecs = PAIRES.filter(([a, b, s]) => contraste(v[a], v[b]) < s);
    if (echecs.length) throw new Error('porte(s) en échec après correction : ' + echecs.map(([a, b]) => a + ' sur ' + b).join(', '));
    return { valeurs: Object.fromEntries(CLES.map((c) => [c, v[c]])), derive: CLES.filter((c) => derive.has(c)) };
  }

  /* ---------- point d'entrée ---------- */

  const echec = (code, chemin, message, extra) => ({ code, chemin, message, ...extra });

  /**
   * Les 26 valeurs d'un mode, des graines.
   * @param {{ principal: string, secondaire?: string, encre?: string, fond?: string, mode: 'clair'|'sombre' }} graines  couleurs `#RRGGBB` (ou `#RGB`)
   * @returns {{ ok: boolean, valeurs: object|null, derive: string[], echecs: object[] }}
   */
  function deriverValeurs(graines) {
    const g = graines || {};
    const sortie = { ok: false, valeurs: null, derive: [], echecs: [] };
    if (g.mode !== 'clair' && g.mode !== 'sombre') { sortie.echecs.push(echec('mode-inconnu', '/mode', 'Le mode vaut « clair » ou « sombre ».')); return sortie; }
    for (const k of ['principal', 'secondaire', 'encre', 'fond']) {
      if (g[k] === undefined || g[k] === null) { if (k === 'principal') sortie.echecs.push(echec('graine-invalide', '/graines/principal', 'La graine « principal » est obligatoire.')); continue; }
      if (typeof g[k] !== 'string' || !(HEX.test(g[k]) || HEX_COURT.test(g[k]))) sortie.echecs.push(echec('graine-invalide', '/graines/' + k, 'La graine « ' + k + ' » doit être une couleur #RRGGBB.'));
    }
    if (sortie.echecs.length) return sortie;
    const teintes = deriverTeintes(g.principal);
    const encre = g.encre ? normaliser(g.encre) : null;
    const e = encre ? { encre, encreMoyenne: deriverEncres(encre).encreMoyenne } : deriverEncres(g.principal);
    const G = { teintes, fond: g.fond ? normaliser(g.fond) : null, encre, encre0: e.encre, encreMoyenne: e.encreMoyenne };
    const { jetons, portes } = calculerMode(g.mode, G);
    const tombees = portes.filter((q) => !q.ok);
    if (tombees.length) {
      sortie.echecs = tombees.map((q) => echec('porte-bloquante', '/portes/' + g.mode + '/' + q.id, 'Porte d\'interface en échec : thème refusé (' + g.mode + ', ' + q.id + ', ' + q.mesure + ' pour un seuil de ' + q.seuil + ')', { porte: q.id, regle: q.regle, mode: g.mode, mesure: q.mesure, seuil: q.seuil }));
      return sortie;
    }
    try {
      const r = resoudre(jetons);
      return { ok: true, valeurs: r.valeurs, derive: r.derive, echecs: [] };
    } catch (err) {
      sortie.echecs.push(echec('resolution-impossible', '/resolu/modes/' + g.mode + '/valeurs', 'Aucune valeur conforme pour une variable : thème refusé : ' + err.message, { mode: g.mode }));
      return sortie;
    }
  }

  return { deriverValeurs };
}));
