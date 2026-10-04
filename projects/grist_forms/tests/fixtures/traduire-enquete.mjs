// Traduit l'enquête du 4ᵉ en FormDef, en vérifiant chaque colonne contre le schéma réel.
import fs from 'node:fs';
import path from 'node:path';

const racine = 'C:/Users/Omen/Desktop/LAVAL/Github Repositories/Widgets Grist/projects/grist_forms/tests/fixtures';
const schema = JSON.parse(fs.readFileSync(path.join(racine, 'enquete-4e.schema.json'), 'utf8'));
const parCol = Object.fromEntries(schema.colonnes.map((c) => [c.colId, c]));

const manques = [];
const col = (colId) => {
  if (!parCol[colId]) { manques.push(colId); return { colId, type: 'Text', label: colId }; }
  return parCol[colId];
};

// ── conditions du questionnaire d'origine ─────────────────────────────────
const habitant = { field: 'A3_Position', operator: 'contains', value: 'Habitant du quartier' };
const aVoiture = { op: 'and', rules: [
  { field: 'B1_NbVoitures', operator: 'truthy' },
  { field: 'B1_NbVoitures', operator: '!=', value: 'Pas de voiture' },
] };
const estMotard = { field: 'B4_MotoScooter', operator: '==', value: true };
const gate = (colId) => ({ field: colId, operator: '==', value: true });

// ── fabriques de champs ───────────────────────────────────────────────────
function base(colId, widget, extra = {}) {
  const c = col(colId);
  return { colId, label: c.label || colId, type: c.type, widget, required: false, ...extra };
}
function choix(colId, widget, extra = {}) {
  const c = col(colId);
  const f = base(colId, widget, extra);
  f.options = { choices: c.choix || [], ...(extra.options || {}) };
  return f;
}
// « Oui / non » n'est pas un type dérivé : la colonne reste `Bool`, seule la
// présentation change (deux boutons plutôt qu'une case). Un dérivé ne se
// justifierait que s'il changeait le rangement — en `Choice`, pour distinguer
// « non posé » de « non ». Ce n'est pas le cas ici : on se branche sur
// l'existant.
function ouiNon(colId, extra = {}) {
  return base(colId, 'ouinon', extra);
}
function echelle(colId, echelleId, matrice, condition) {
  const f = base(colId, 'echelle');
  f.kind = 'echelle';
  f.options = { echelle: echelleId, matrice };
  if (condition) f.condition = condition;
  return f;
}
function matrice(colIds, echelleId, matriceId, condition) {
  return colIds.map((c) => echelle(c, echelleId, matriceId, condition));
}

// ── le questionnaire ──────────────────────────────────────────────────────
const sections = [
  { id: 'A', label: 'Vous et le quartier', fields: [
    { ...choix('A1_Sexe', 'radio'), required: true },
    { ...choix('A2_Age', 'radio'), required: true },
    { ...choix('A3_Position', 'multiselect'), required: true,
      description: 'Plusieurs réponses possibles' },
    { ...choix('A4_Anciennete', 'radio'), required: true, condition: habitant },
  ] },

  { id: 'B', label: 'Vos déplacements', condition: habitant, fields: [
    { ...choix('B1_NbVoitures', 'radio'), required: true },
    { ...choix('B2_LieuStationnement', 'radio'), required: true, condition: aVoiture },
    { ...ouiNon('B3_Velo'), required: true },
    { ...ouiNon('B4_MotoScooter'), required: true },
    choix('B5_ModeTravail', 'multiselect'),
    choix('B6_ModeAutres', 'multiselect'),
  ] },

  { id: 'C', label: 'Les espaces publics du quartier', fields: [
    ...matrice(['C1_EP_Agreables', 'C2_EP_Adaptes', 'C3_EP_Accessibles', 'C4_EP_Entretenus', 'C5_EP_Securite'],
      'accord', 'c_perception'),
    { ...choix('C7_MoinsSatisfaction', 'multiselect'), kind: 'choix_autre',
      options: { choices: col('C7_MoinsSatisfaction').choix,
        colonnes: { valeur: 'C7_MoinsSatisfaction', autre: 'C7_Autre' }, valeurAutre: 'Autre' } },
  ] },

  { id: 'D', label: 'Vos priorités d’amélioration', fields: [
    { ...choix('D1_Ameliorations', 'multiselect'),
      description: 'Choisissez jusqu’à 5 propositions',
      options: { choices: col('D1_Ameliorations').choix, maxSelected: 5 } },
    base('D2_Autre', 'text'),
  ] },

  { id: 'E', label: 'Les lieux à traiter en priorité', fields: [
    { colId: 'E_Lieux_prioritaires', label: 'Vos trois lieux prioritaires', kind: 'classement',
      type: 'Choice', widget: 'classement', required: false,
      options: {
        choices: col('E1_Prio1').choix,
        colonnes: { rangs: ['E1_Prio1', 'E2_Prio2', 'E3_Prio3'], autre: 'E4_Autre' },
        rangs: 3, valeurAutre: 'Autre',
      } },
  ] },

  { id: 'F', label: 'Le stationnement', condition: habitant, fields: [
    choix('F1_Pratiques', 'radio'),
    ...matrice(['F2a_AjouterPlaces', 'F2b_LimiterDuree', 'F2c_PasDePotentiel',
      'F2d_ReserverResidents', 'F2e_SupprimerPlaces', 'F2f_MieuxSanctionner'], 'accord', 'f_stationnement'),
    ...matrice(['F4_Moto_Facile'], 'accord', 'f_moto', estMotard),
  ] },

  { id: 'G', label: 'La circulation', fields: [
    ...matrice(['G1_VitessesConvenables', 'G2_VitessesExcessives', 'G3_TraverseesSures'], 'accord', 'g_vitesses'),
    { ...base('G_Geometries', 'geo'), kind: 'geometrie',
      label: 'Les endroits concernés',
      options: { geometrie: 'MultiPoint', colonnes: { geometrie: 'G_Geometries' }, saisies: ['carte'] } },
    base('G2_RuesConcernees', 'text'),
  ] },

  { id: 'H', label: 'Les transports en commun', fields: [
    { ...ouiNon('H0_ConcerneTC'), label: 'Avez-vous un avis sur les transports en commun du quartier ?' },
    { ...ouiNon('H1_ConnaitOffre'), condition: gate('H0_ConcerneTC') },
    { ...ouiNon('H2_ConnaitParkingRelais'), condition: gate('H0_ConcerneTC') },
    ...matrice(['H3_AccesArrets', 'H4_Horaires'], 'accord', 'h_bus', gate('H0_ConcerneTC')),
  ] },

  { id: 'I', label: 'Le vélo', fields: [
    { ...ouiNon('I0_ConcerneVelo'), label: 'Avez-vous un avis sur le vélo dans le quartier ?' },
    ...matrice(['I1_ArceauxSuffisance'], 'arceaux', 'i_arceaux', gate('I0_ConcerneVelo')),
    ...matrice(['I4_VelosMalGares'], 'accord', 'i_cohabitation', gate('I0_ConcerneVelo')),
    { ...choix('I5_RapportVelo', 'radio'), condition: gate('I0_ConcerneVelo') },
  ] },

  { id: 'J', label: 'Les abords d’école', fields: [
    { ...ouiNon('J0_ConcerneEcoles'), label: 'Êtes-vous concerné(e) par les abords d’école ?' },
    ...matrice(['J1_AccesConflictuels', 'J2_PrioriteEcoles'], 'accord', 'j_ecoles', gate('J0_ConcerneEcoles')),
  ] },

  { id: 'K', label: 'La chaleur', fields: [
    { ...ouiNon('K0_ConcerneChaleur'), label: 'Avez-vous un avis sur la chaleur dans l’espace public ?' },
    ...matrice(['K1_TropChaud', 'K2_ManqueOmbrage', 'K3_EspacesFrais'], 'accord', 'k_chaleur', gate('K0_ConcerneChaleur')),
  ] },

  { id: 'L', label: 'La végétalisation', fields: [
    { ...ouiNon('L0_ConcerneVegetal'), label: 'Avez-vous un avis sur la végétalisation du quartier ?' },
    ...matrice(['L1_Satisfait', 'L2_PlusArbres', 'L3_SupprStatPourArbres', 'L4_ArbustesPlantes', 'L5_PlusParcs'],
      'accord', 'l_vegetalisation', gate('L0_ConcerneVegetal')),
  ] },

  { id: 'M', label: 'Quels modes privilégier ?', fields: [
    ...matrice(['M1_Mode_Voiture', 'M2_Mode_Bus', 'M3_Mode_Velo', 'M4_Mode_Trottinette',
      'M5_Mode_Pieton', 'M6_Mode_2RM'], 'priorite', 'm_modes'),
  ] },

  { id: 'N', label: 'Pour finir', fields: [
    { ...base('N1_Remarques', 'textarea'), description: 'Champ libre — facultatif' },
  ] },
];

const formDef = {
  manifest_version: '1.0.0',
  id: 'enquete-espaces-publics-4e',
  title: 'Espaces publics du 4ᵉ — Chartreux / La Blancarde',
  description: 'Traduction en FormDef du questionnaire écrit à la main (document e1j5ym1Bd5ec). Branché sur les colonnes existantes : aucune création, aucun retypage.',
  classification: 'cerema_internal',
  successMessage: 'Merci pour votre contribution !',
  tableId: 'Reponses',
  composeMode: 'bind',
  meta: { timestampCol: 'Horodatage', durationCol: 'DureeSecondes' },
  echelles: {
    accord: { min: 1, max: 5, libelles: ['Pas du tout d’accord', 'Tout à fait d’accord'], nonConcerne: true },
    arceaux: { min: 1, max: 5, libelles: ['Très insuffisant', 'Très suffisant'], nonConcerne: true },
    priorite: { min: 1, max: 5, libelles: ['Surtout pas', 'En priorité'], nonConcerne: false },
  },
  sections,
  choices: {},
};

if (manques.length) {
  console.error('Colonnes absentes du schéma réel : ' + manques.join(', '));
  process.exit(1);
}

fs.writeFileSync(path.join(racine, 'enquete-4e.formdef.json'), JSON.stringify(formDef, null, 2) + '\n', 'utf8');

// ── couverture : ce que le moteur d'aujourd'hui sait rendre ───────────────
const WIDGETS_MOTEUR = ['text', 'textarea', 'number', 'checkbox', 'date', 'datetime', 'select', 'radio', 'multiselect', 'likert', 'file'];
const champs = sections.flatMap((s) => s.fields);
const compte = { rendus: 0, partiels: 0, manquants: 0 };
const parManque = {};
for (const f of champs) {
  if (f.kind) {
    compte.manquants++;
    (parManque[f.kind] = parManque[f.kind] || []).push(f.colId);
  } else if (!WIDGETS_MOTEUR.includes(f.widget)) {
    compte.manquants++;
    (parManque['widget:' + f.widget] = parManque['widget:' + f.widget] || []).push(f.colId);
  } else if (f.options && f.options.maxSelected) {
    compte.partiels++;
    (parManque['option:maxSelected'] = parManque['option:maxSelected'] || []).push(f.colId);
  } else {
    compte.rendus++;
  }
}
const colonnesCouvertes = new Set();
for (const f of champs) {
  if (f.options && f.options.colonnes) {
    Object.values(f.options.colonnes).flat().forEach((c) => colonnesCouvertes.add(c));
  } else colonnesCouvertes.add(f.colId);
}
['Horodatage', 'DureeSecondes'].forEach((c) => colonnesCouvertes.add(c));
const oubliees = schema.colonnes.map((c) => c.colId).filter((c) => !colonnesCouvertes.has(c));

console.log('Questions         :', champs.length);
console.log('Colonnes couvertes:', colonnesCouvertes.size, '/', schema.colonnes.length, oubliees.length ? '— oubliées : ' + oubliees.join(', ') : '— aucune oubliée');
console.log('Rendues aujourd’hui:', compte.rendus, '| partielles:', compte.partiels, '| manquantes:', compte.manquants);
console.log('Ce qui manque :');
for (const [quoi, cols] of Object.entries(parManque).sort((a, b) => b[1].length - a[1].length)) {
  console.log('  ' + quoi.padEnd(22) + cols.length.toString().padStart(3) + '  ' + cols.slice(0, 3).join(', ') + (cols.length > 3 ? '…' : ''));
}
