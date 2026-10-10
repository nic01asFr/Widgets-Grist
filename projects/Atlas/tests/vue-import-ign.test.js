import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ICONES, htmlGrille, htmlDetail, htmlProgression, texteProgression } from '../lib/vue-import-ign.js';
import { PRESETS, presetsParGroupe, listerPresets, metadonneesCouche } from '../lib/import-ign.js';
import { evaluerVolume } from '../lib/import-lots.js';
import { decisionImport } from '../lib/import-ign.js';

const estimation = (n) => { const evaluation = evaluerVolume(n); return { n, evaluation, decision: decisionImport(evaluation), dureeEstimeeS: 3 }; };
const etat = (patch) => ({
  phase: 'choix', etape: null, jeu: null, emprise: null, estimation: null, erreur: null, progression: null, resultat: null, reprenable: false, ...patch,
});

describe('vue-import-ign — les cartes', () => {
  const html = htmlGrille(presetsParGroupe(), 'batiments');

  it('chaque jeu est une carte-bouton, avec son pictogramme et son libellé', () => {
    for (const p of listerPresets()) {
      assert.match(html, new RegExp(`data-jeu="${p.id}"`), p.id);
      assert.ok(ICONES[p.icone], `icône ${p.icone} du jeu ${p.id}`);
    }
    assert.equal((html.match(/<button type="button" class="model-card ign-carte/g) || []).length, listerPresets().length);
    assert.doesNotMatch(html, /onclick=/, 'pas de gestionnaire en ligne : la délégation d’événements suffit');
  });

  it('la carte choisie est marquée pour le clavier et les lecteurs d’écran', () => {
    assert.match(html, /data-jeu="batiments"\s+aria-pressed="true"/);
    assert.match(html, /data-jeu="routes"\s+aria-pressed="false"/);
    assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  });

  it('les cartes sont groupées avec un nom de groupe annoncé', () => {
    for (const g of presetsParGroupe()) assert.match(html, new RegExp(`role="group" aria-label="${g.groupe}"`));
  });

  it('rien n’est choisi : aucune carte n’est pressée', () => {
    assert.equal((htmlGrille(presetsParGroupe(), null).match(/aria-pressed="true"/g) || []).length, 0);
  });
});

describe('vue-import-ign — le bas du panneau, phase par phase', () => {
  const jeu = PRESETS.batiments;

  it('avant tout choix : une consigne, rien à cliquer', () => {
    const h = htmlDetail(etat());
    assert.match(h, /Choisissez un jeu/);
    assert.doesNotMatch(h, /data-act/);
  });

  it('estimation en cours : un statut annoncé, pas de bouton', () => {
    const h = htmlDetail(etat({ phase: 'estimation', jeu }));
    assert.match(h, /role="status"/);
    assert.match(h, /Estimation/);
    assert.doesNotMatch(h, /data-act/);
    assert.match(h, /Bâtiments/);
  });

  it('prêt : le nombre d’objets, la durée attendue, le bouton Importer qui dit combien', () => {
    const h = htmlDetail(etat({ phase: 'pret', jeu, estimation: estimation(2178) }));
    assert.match(h, /2 178 objets/);
    assert.match(h, /Durée attendue : environ/);
    assert.match(h, /data-act="importer"[^>]*>Importer 2 178 objets</);
    assert.doesNotMatch(h, /disabled/);
    assert.doesNotMatch(h, /role="alert"/);
  });

  it('prêt avec un gros volume : l’avertissement est annoncé', () => {
    const h = htmlDetail(etat({ phase: 'pret', jeu, estimation: estimation(12000) }));
    assert.match(h, /role="alert"/);
    assert.match(h, /Importer 12 000 objets/);
  });

  it('refusé : le motif est dit, il faut zoomer, le bouton est inactif', () => {
    const h = htmlDetail(etat({ phase: 'refuse', jeu, estimation: estimation(577215) }));
    assert.match(h, /role="alert"/);
    assert.match(h, /577 215/);
    assert.match(h, /Zoomez/);
    assert.match(h, /data-act="importer"[^>]*disabled/);
  });

  it('refusé pour une zone trop grande : le message de l’erreur est dit', () => {
    const h = htmlDetail(etat({ phase: 'refuse', jeu, erreur: { code: 'emprise_trop_grande', message: 'Zone trop grande pour « Bâtiments » : zoomez.' } }));
    assert.match(h, /Zone trop grande/);
  });

  it('erreur du service à l’estimation : on peut réessayer', () => {
    const h = htmlDetail(etat({ phase: 'erreur', etape: 'estimation', jeu, erreur: { code: 'exception_ogc', message: 'Le service de l’IGN a refusé la requête : x' } }));
    assert.match(h, /service de l’IGN a refusé/);
    assert.match(h, /data-act="reessayer"/);
    assert.doesNotMatch(h, /data-act="reprendre"/);
  });

  it('import en cours : barre de progression exposée, Annuler', () => {
    const h = htmlDetail(etat({ phase: 'import', jeu, progression: { fait: 1200, total: 2178, pct: 55.1, resteS: 4, refuses: 0 } }));
    assert.match(h, /role="progressbar"/);
    assert.match(h, /aria-valuenow="55"/);
    assert.match(h, /width:55%/);
    assert.match(h, /1 200<\/strong> sur 2 178 objets lus/);
    assert.match(h, /reste environ/);
    assert.match(h, /data-act="annuler"/);
  });

  it('progression sans total : pas de valeur annoncée, pas de pourcentage inventé', () => {
    const h = htmlProgression(etat({ progression: { fait: 10, total: null, pct: null, resteS: null, refuses: 0 } }));
    assert.doesNotMatch(h, /aria-valuenow/);
    assert.match(h, /width:0%/);
  });

  it('texteProgression : accorde les refus', () => {
    assert.match(texteProgression({ fait: 3, total: 10, pct: 30, resteS: null, refuses: 1 }), /1 refusé$/);
    assert.match(texteProgression({ fait: 3, total: 10, pct: 30, resteS: null, refuses: 2 }), /2 refusés$/);
    assert.doesNotMatch(texteProgression({ fait: 3, total: 10, pct: 30, resteS: null, refuses: 0 }), /refus/);
  });

  it('annulé : aucune couche créée, ce qui est gardé est dit, on peut reprendre ou abandonner', () => {
    const h = htmlDetail(etat({ phase: 'annule', jeu, reprenable: true, progression: { fait: 2000, total: 4500, pct: 44, resteS: null, refuses: 0 } }));
    assert.match(h, /aucune couche n’a été créée/);
    assert.match(h, /2 000 objets lus/);
    assert.match(h, /data-act="reprendre"/);
    assert.match(h, /data-act="abandonner"/);
  });

  it('panne en cours d’import : le message, la reprise', () => {
    const h = htmlDetail(etat({ phase: 'erreur', etape: 'import', jeu, reprenable: true, erreur: { code: 'http', message: 'Le service de l’IGN est momentanément indisponible (503) : réessayez dans un moment.' }, progression: { fait: 2000, total: 4500, pct: 44, resteS: null, refuses: 0 } }));
    assert.match(h, /indisponible/);
    assert.match(h, /gardés en mémoire/);
    assert.match(h, /data-act="reprendre"/);
  });

  const resultat = (patch = {}) => ({
    importes: 2178, estimes: 2178, refuses: 0, doublons: 0, motifs: [], dureeMs: 3200, couche: { id: 'l1', name: 'Bâtiments IGN' },
    provenance: metadonneesCouche(jeu, { emprise: [5.37, 43.293, 5.38, 43.3], importes: 2178, estimes: 2178 }), ...patch,
  });

  it('terminé : le résumé dit le nombre importé, refusé, la durée, la couche, la provenance et la licence', () => {
    const h = htmlDetail(etat({ phase: 'termine', jeu, resultat: resultat() }));
    assert.match(h, /id="ign-resume" tabindex="-1">2 178 objets importés</);
    assert.match(h, /Couche « Bâtiments IGN » créée/);
    assert.match(h, /0 refusé/);
    assert.match(h, /3,2 s/);
    assert.match(h, /Source : IGN, BD TOPO®/);
    assert.match(h, /Licence Ouverte 2\.0/);
    assert.match(h, /<a href="https:\/\/github\.com\/etalab[^"]+" target="_blank" rel="noopener noreferrer">Conditions de licence</);
    assert.match(h, /retard/);
    assert.doesNotMatch(h, /annonçait/, 'estimation et import concordent : rien à signaler');
  });

  it('terminé avec des refus : la liste des motifs, avec les rangs', () => {
    const h = htmlDetail(etat({
      phase: 'termine', jeu,
      resultat: resultat({ importes: 2160, refuses: 8, motifs: [{ code: 'geometrie_invalide', message: 'Géométrie illisible', n: 8, exemples: [3, 9, 12, 40, 41] }] }),
    }));
    assert.match(h, /<summary>8 objets refusés<\/summary>/);
    assert.match(h, /Géométrie illisible — 8 objets \(rangs 3, 9, 12, 40, 41, …\)/);
    assert.match(h, /en annonçait 2 178 ; 2 168 sont arrivés/);
  });

  it('terminé sans aucun objet gardé : pas de couche annoncée', () => {
    const h = htmlDetail(etat({ phase: 'termine', jeu, resultat: resultat({ importes: 0, couche: null, provenance: null }) }));
    assert.match(h, /Aucun objet gardé/);
    assert.match(h, /Aucune couche créée/);
  });

  it('tout ce qui vient des données ou du service est échappé', () => {
    const h = htmlDetail(etat({
      phase: 'erreur', etape: 'estimation', jeu: { ...jeu, libelle: '<b>x</b>', avertissements: ['<img src=x onerror=y>'] },
      erreur: { code: 'exception_ogc', message: '<script>alert(1)</script>' },
    }));
    assert.doesNotMatch(h, /<script|<img|<b>x/);
    assert.match(h, /&lt;script&gt;/);
    const r = htmlDetail(etat({ phase: 'termine', jeu, resultat: resultat({ couche: { id: 'l', name: '"><svg onload=x>' }, motifs: [{ code: 'x', message: '<i>m</i>', n: 1, exemples: [1] }], refuses: 1 }) }));
    assert.doesNotMatch(r, /<svg onload|<i>m/);
  });

  it('les boutons ne portent aucun gestionnaire en ligne', () => {
    for (const phase of ['pret', 'refuse', 'import', 'annule', 'termine']) {
      const h = htmlDetail(etat({ phase, jeu, estimation: estimation(100), progression: { fait: 1, total: 2, pct: 50, resteS: 1, refuses: 0 }, resultat: resultat() }));
      assert.doesNotMatch(h, /onclick=/, phase);
    }
  });
});
