/**
 * Les étapes du récit ont une clé stable, et le récit s'écrit par clé.
 *
 * `Atlas_Story` s'effaçait entièrement puis se réécrivait à chaque sauvegarde :
 * deux personnes qui éditaient le même récit s'effaçaient l'une l'autre, et
 * l'identifiant de ligne changeait à chaque fois — rien ne pouvait désigner « cette
 * étape-là » (un contexte, une progression, une zone qui la propose).
 *
 * ## Ce que fait la clé
 *
 * - `cle` naît avec l'étape et ne change plus : ni au déplacement, ni à la
 *   réécriture. Une étape copiée en reçoit une nouvelle.
 * - Une ligne qui n'en a pas (table écrite avant, ou par un autre outil) reçoit
 *   `h-<rang>` : **déterministe**, pour que deux lecteurs qui migrent en même temps
 *   donnent la même clé à la même ligne.
 *
 * ## Écrire par clé, en trois points
 *
 * Un récit local n'est pas la vérité du document : un autre éditeur a pu ajouter,
 * changer ou retirer des étapes depuis la lecture. On compare donc trois choses :
 * ce qu'on a lu (`base`), ce qu'on a maintenant (`locales`), ce que le document
 * contient (`lignes`). Règles :
 *
 * - on n'écrit que ce que NOUS avons changé depuis la lecture ;
 * - on ne retire que ce que NOUS avions et n'avons plus ;
 * - une étape que nous n'avons jamais lue (ajoutée par un autre) n'est jamais
 *   touchée ;
 * - une étape qu'un autre a modifiée et que nous n'avons pas touchée garde sa
 *   modification ; si nous l'avons retirée, elle reste (sa modification est plus
 *   récente que notre lecture) ;
 * - changée ici ET ailleurs : la nôtre l'emporte (dernier qui enregistre).
 *
 * Ce module ne touche ni au DOM, ni à Grist.
 */

export const TABLE_RECIT = 'Atlas_Story';

/** Une clé neuve, qui ne figure pas dans `existantes`. */
export function creerCle(existantes = new Set(), alea = Math.random) {
  for (let essai = 0; essai < 50; essai++) {
    const cle = 'e-' + Math.floor(alea() * 36 ** 8).toString(36).padStart(8, '0');
    if (!existantes.has(cle)) return cle;
  }
  // Pratiquement inatteignable ; mais jamais de boucle sans fin.
  let n = existantes.size + 1;
  while (existantes.has('e-' + n)) n++;
  return 'e-' + n;
}

/** La clé que reçoit une ligne ancienne : déterministe, d'après son rang. */
export function cleHeritee(rang) {
  return `h-${Number(rang) || 0}`;
}

/**
 * Donne une clé à chaque étape qui n'en a pas, et une nouvelle à celles qui la
 * partagent (une étape copiée). Modifie les étapes, rend le même tableau.
 */
export function assurerCles(recit, alea = Math.random) {
  const vues = new Set();
  const tout = new Set((recit || []).map((s) => s?.cle).filter(Boolean));
  for (const s of recit || []) {
    if (!s) continue;
    if (!s.cle || vues.has(s.cle)) {
      s.cle = creerCle(new Set([...tout, ...vues]), alea);
      tout.add(s.cle);
    }
    vues.add(s.cle);
  }
  return recit;
}

/** Ce qui fait la différence entre deux versions d'une étape. */
export function signature({ step, title, text, stateJson }) {
  return JSON.stringify([Number(step) || 0, title || '', text || '', stateJson || '{}']);
}

/** Les champs qu'une étape écrit dans `Atlas_Story`. */
function champs(etape, rang) {
  return {
    Step: rang,
    Title: etape.title || '',
    Description: etape.text || '',
    StateJSON: JSON.stringify(etape.state || {}),
  };
}

function signatureDeChamps(c) {
  return signature({ step: c.Step, title: c.Title, text: c.Description, stateJson: c.StateJSON });
}

/**
 * Lit les lignes brutes de la table : une étape par clé, dans l'ordre du récit.
 *
 * @param {Array<{id:number, cle?:string, step?:number, title?:string, text?:string, stateJson?:string}>} lignes
 * @returns {{ lignes: Array, doublons: number[], sansCle: number }}
 *   `lignes` : une par clé (la plus récente si plusieurs), triées par rang puis par id ;
 *   `doublons` : les ids des lignes écartées ; `sansCle` : combien ont reçu `h-<rang>`.
 */
export function lireLignesRecit(lignes) {
  const parCle = new Map();
  const doublons = [];
  let sansCle = 0;
  (lignes || []).forEach((l, i) => {
    const step = Number(l.step) || (i + 1);
    const cle = l.cle || cleHeritee(step);
    if (!l.cle) sansCle++;
    const prec = parCle.get(cle);
    const ligne = { ...l, step, cle, cleEcrite: !!l.cle };
    if (!prec) { parCle.set(cle, ligne); return; }
    // La plus récente garde la clé ; l'autre est un reliquat.
    if ((ligne.id ?? 0) >= (prec.id ?? 0)) { doublons.push(prec.id); parCle.set(cle, ligne); } else doublons.push(ligne.id);
  });
  const triees = [...parCle.values()].sort((a, b) => a.step - b.step || (a.id ?? 0) - (b.id ?? 0));
  return { lignes: triees, doublons, sansCle };
}

/**
 * Les actions qui amènent le document là où le récit local le dit, sans écraser
 * ce que d'autres y ont fait.
 *
 * @param {object} o
 * @param {Array<{cle:string,title?:string,text?:string,state?:object}>} o.locales  le récit, dans l'ordre
 * @param {Array<object>} o.lignes   les lignes brutes du document (`id`, `cle`, `step`, `title`, `text`, `stateJson`)
 * @param {Map<string,string>|null} o.base  `cle -> signature` telle qu'à la dernière lecture ou écriture ; `null` = inconnue (rien ne se retire)
 * @param {boolean} [o.colonneCle=true]  la colonne `Cle` existe-t-elle ? Sinon on l'ajoute d'abord.
 * @returns {{ actions: Array<Array>, base: Map<string,string>, ecrit: { ajoutees: number, modifiees: number, retirees: number } }}
 */
export function planifierEcritureRecit({ locales, lignes, base = null, colonneCle = true }) {
  const connu = base instanceof Map ? base : new Map();
  const lues = lireLignesRecit(lignes);
  const parCle = new Map(lues.lignes.map((l) => [l.cle, l]));
  const actions = [];
  const ecrit = { ajoutees: 0, modifiees: 0, retirees: 0 };
  const apres = new Map(connu);
  if (!colonneCle) actions.push(['AddColumn', TABLE_RECIT, 'Cle', { type: 'Text', label: 'Clé' }]);

  const aRetirer = new Set(lues.doublons.filter((id) => id != null));
  const aAjouter = [];
  const cles = new Set();

  (locales || []).forEach((etape, i) => {
    const cle = etape.cle;
    cles.add(cle);
    const rang = i + 1;
    const c = champs(etape, rang);
    const sig = signatureDeChamps(c);
    const ligne = parCle.get(cle);

    if (!ligne) {
      // Absente du document. Retirée là-bas depuis notre lecture, et pas changée
      // ici : on respecte ce retrait. Sinon (nouvelle, ou changée ici) on l'écrit.
      if (connu.has(cle) && connu.get(cle) === sig) { apres.delete(cle); return; }
      aAjouter.push({ cle, ...c });
      apres.set(cle, sig);
      ecrit.ajoutees++;
      return;
    }

    const sigDoc = signature({ step: ligne.step, title: ligne.title, text: ligne.text, stateJson: ligne.stateJson });
    const changeeIci = !connu.has(cle) || connu.get(cle) !== sig;
    if (!changeeIci) {
      // Rien de changé ici : ce que le document porte, un autre l'a voulu.
      if (!ligne.cleEcrite) actions.push(['UpdateRecord', TABLE_RECIT, ligne.id, { Cle: cle }]);
      return;
    }
    if (sigDoc === sig) {
      apres.set(cle, sig);
      if (!ligne.cleEcrite) actions.push(['UpdateRecord', TABLE_RECIT, ligne.id, { Cle: cle }]);
      return;
    }
    const diff = {};
    if (ligne.step !== c.Step) diff.Step = c.Step;
    if ((ligne.title || '') !== c.Title) diff.Title = c.Title;
    if ((ligne.text || '') !== c.Description) diff.Description = c.Description;
    if ((ligne.stateJson || '{}') !== c.StateJSON) diff.StateJSON = c.StateJSON;
    if (!ligne.cleEcrite) diff.Cle = cle;
    actions.push(['UpdateRecord', TABLE_RECIT, ligne.id, diff]);
    apres.set(cle, sig);
    ecrit.modifiees++;
  });

  // Ce que nous avions lu et n'avons plus : nous l'avons retiré. Une étape que
  // nous n'avons jamais lue n'est pas à nous ; une étape qu'un autre a changée
  // depuis reste (sa version est plus récente que notre lecture).
  for (const ligne of lues.lignes) {
    if (cles.has(ligne.cle)) continue;
    if (!connu.has(ligne.cle)) continue;
    const sigDoc = signature({ step: ligne.step, title: ligne.title, text: ligne.text, stateJson: ligne.stateJson });
    if (sigDoc !== connu.get(ligne.cle)) { apres.delete(ligne.cle); continue; }
    aRetirer.add(ligne.id);
    apres.delete(ligne.cle);
    ecrit.retirees++;
  }

  if (aRetirer.size) actions.push(['BulkRemoveRecord', TABLE_RECIT, [...aRetirer]]);
  if (aAjouter.length) {
    actions.push(['BulkAddRecord', TABLE_RECIT, aAjouter.map(() => null), {
      Cle: aAjouter.map((a) => a.cle),
      Step: aAjouter.map((a) => a.Step),
      Title: aAjouter.map((a) => a.Title),
      Description: aAjouter.map((a) => a.Description),
      StateJSON: aAjouter.map((a) => a.StateJSON),
    }]);
  }
  return { actions, base: apres, ecrit };
}

/** La base d'une lecture : `cle -> signature`. */
export function baseDepuisLignes(lignes) {
  const base = new Map();
  for (const l of lireLignesRecit(lignes).lignes) {
    base.set(l.cle, signature({ step: l.step, title: l.title, text: l.text, stateJson: l.stateJson }));
  }
  return base;
}
