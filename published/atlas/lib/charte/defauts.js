/**
 * Chartes nommées embarquées : « atlas » (le défaut, neutre et accessible) et « contraste-eleve ». Données seules, aucune logique.
 *
 * Atlas n'embarque JAMAIS la charte d'une organisation : ce sont les seules chartes livrées. Une charte d'hôte arrive par `setTheme` ;
 * ce qu'elle ne dit pas se calcule depuis ses graines (derivation.js) ou, à défaut, se lit ici.
 *
 * Choix de la charte « atlas » (voir docs/CONTRAT-CHARTE-ATLAS.md, « Choix retenus ») :
 *  - qualitative : Okabe et Ito (2008), conçue pour rester lisible en daltonisme ; mise dans un ordre où les k premières restent
 *    distinctes (CIEDE2000 >= 11, pire cas sur la vision normale et les trois daltonismes), le noir en dernier ;
 *  - séquentielle « principale » : UNE teinte, celle de l'accent de l'interface d'Atlas (`--accent: #C44536` dans index_v7.html), calculée par
 *    `sequentielleDepuis` depuis ce seul accent, l'encre de l'interface (`--ink: #1F1B14`) et le blanc ; séquentielle « continue » : Viridis ;
 *  - divergente : bleu et orange (Okabe-Ito « vermillon » et « bleu »), JAMAIS rouge et vert ; calculée par `divergenteEntre` ;
 *  - états : succès, alerte, erreur, information, tous à plus de 4,5:1 sur le fond ; la FORME du marqueur porte la distinction, pas la couleur seule.
 */
import { VERSION_CHARTE } from './schema.js';
import { INTENSITES_PLAN } from './derivation.js';

export const VERSION = '1.0.0';

/** Okabe et Ito (2008), valeurs publiées, dans leur ordre d'origine. */
export const OKABE_ITO = Object.freeze({
  noir: '#000000', orange: '#e69f00', cielBleu: '#56b4e9', vertBleute: '#009e73', jaune: '#f0e442', bleu: '#0072b2', vermillon: '#d55e00', pourpreRouge: '#cc79a7',
});
/** Okabe-Ito dans l'ordre d'Atlas : bleu, orange, vert, pourpre, ciel, vermillon, jaune, noir. */
export const QUALITATIVE_ATLAS = Object.freeze([OKABE_ITO.bleu, OKABE_ITO.orange, OKABE_ITO.vertBleute, OKABE_ITO.pourpreRouge, OKABE_ITO.cielBleu, OKABE_ITO.vermillon, OKABE_ITO.jaune, OKABE_ITO.noir]);
/** Viridis (van der Walt et Smith), 7 échantillons : valeur faible = sombre, valeur forte = clair. Identique à la palette « Viridis » historique d'Atlas. */
export const VIRIDIS = Object.freeze(['#440154', '#3e4a89', '#26828e', '#35b779', '#6ece58', '#b5de2b', '#fde725']);

const fige = (o) => { if (o && typeof o === 'object') { for (const v of Object.values(o)) fige(v); Object.freeze(o); } return o; };

export const CHARTE_ATLAS = fige({
  version: VERSION_CHARTE,
  nom: 'Atlas',
  graines: { principal: '#c44536', secondaire: '#2e4e54', encre: '#1f1b14', fond: '#ffffff', succes: '#1e6b3e', alerte: '#8a5a00', erreur: '#b3261e', information: '#1f5f99' },
  donnees: {
    sequentielles: {
      principale: ['#f8e9e7', '#f4ccc4', '#edafa3', '#e49283', '#d97463', '#cc5646', '#b34132', '#8c382b', '#692e23'],
      continue: [...VIRIDIS],
    },
    sequentielleDefaut: 'principale',
    divergente: ['#b15104', '#e17b3c', '#f0b594', '#efefef', '#b2c4db', '#7199c7', '#0072b2'],
    qualitative: [...QUALITATIVE_ATLAS],
    sansDonnee: '#918f8c', selection: '#1f1b14', halo: '#ffffff', survol: '#57544f', contour: '#ffffff',
  },
  fond: { mode: 'atlas', principal: '#2e4e54', intensites: { ...INTENSITES_PLAN }, vegetation: 'monochrome' },
  marqueurs: { formes: { succes: 'cercle', alerte: 'triangle', erreur: 'losange', information: 'carre' }, contour: '#1f1b14' },
  texte: { famille: 'systeme', tailles: { legende: 13, etiquette: 12 } },
  exigences: { contrasteMinimal: 3, contrasteTexte: 4.5, ecartMinimal: 6, classesMax: 5 },
});

/**
 * Charte « contraste-eleve » : texte et traits noirs sur blanc, états à plus de 7:1, rampes sans ton pâle (première classe à 3:1 du fond),
 * qualitative de couleurs sombres (4,5:1 au moins sur le fond), plan plus appuyé. Remplace, pour la personne qui l'a demandé, la charte de l'hôte
 * sur le contraste et le daltonisme (voir `resoudre`, niveau « préférence »).
 */
export const CHARTE_CONTRASTE_ELEVE = fige({
  version: VERSION_CHARTE,
  nom: 'Contraste élevé',
  graines: { principal: '#a8321f', secondaire: '#0b3d5c', encre: '#000000', fond: '#ffffff', succes: '#0b5a2a', alerte: '#6b4700', erreur: '#9c1c14', information: '#0b4f8a' },
  donnees: {
    sequentielles: {
      principale: ['#e8705c', '#da5e49', '#cb4b37', '#bc3824', '#a72c1c', '#8d2518', '#771d14', '#5f160f', '#4a0f08'],
      continue: [...VIRIDIS],
    },
    sequentielleDefaut: 'principale',
    divergente: ['#b34f00', '#d6804c', '#e7b69a', '#ededed', '#b1c2da', '#7098c6', '#0172b2'],
    qualitative: ['#0072b2', '#c05500', '#000000', '#722e57', '#950000', '#1c35b7', '#00623b'],
    sansDonnee: '#757575', selection: '#000000', halo: '#ffffff', survol: '#404040', contour: '#000000',
  },
  fond: { mode: 'atlas', principal: '#0b3d5c', intensites: { vert: 0.1, bati: 0.2, eau: 0.38, filet: 0.55, limite: 0.8 }, vegetation: 'monochrome' },
  marqueurs: { formes: { succes: 'cercle', alerte: 'triangle', erreur: 'losange', information: 'carre' }, contour: '#000000' },
  texte: { famille: 'lisible', tailles: { legende: 15, etiquette: 14 } },
  exigences: { contrasteMinimal: 3, contrasteTexte: 7, ecartMinimal: 6, classesMax: 5 },
});

export const CHARTES_NOMMEES = Object.freeze({ atlas: CHARTE_ATLAS, 'contraste-eleve': CHARTE_CONTRASTE_ELEVE });
export const CHARTE_PAR_DEFAUT = 'atlas';
