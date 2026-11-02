/**
 * Les interfaces d'un widget disent-elles la même chose ? (docs/WIDGETS-AUTO-DESCRIPTIFS.md, §7)
 *
 * Un widget branche ses interfaces sur un adaptateur ; la parité se vérifie contre le registre, seule source :
 *
 *   {
 *     registre: { commandes: [{ nom, nature, exemples: [{ entree }] }], appeler(nom, entree) -> { ok, sortie|erreur } },
 *     cli:      (nom, entree) -> { code, sortie }      // sortie : le JSON imprimé, déjà lu
 *     listeCli: () -> [nom]                            // ce que « --liste » imprime
 *     fiche:    { verbes: { <verbe>: [nom] } }
 *   }
 *
 * Ne sont comparées que les commandes de nature `pure` : une commande `exige-la-page` n'est pas exécutable par le CLI, la fiche le dit.
 * @returns {string[]} les écarts ; vide si les interfaces concordent
 */

const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function verifierParite({ registre, cli, listeCli, fiche }) {
  const ecarts = [];
  const purs = registre.commandes.filter((c) => c.nature === 'pure').map((c) => c.nom).sort();
  const nomsRegistre = registre.commandes.map((c) => c.nom).sort();

  const nomsFiche = Object.values(fiche.verbes).flat().sort();
  if (!egal(nomsFiche, nomsRegistre)) ecarts.push(`fiche et registre ne listent pas les mêmes commandes : ${JSON.stringify(nomsFiche)} / ${JSON.stringify(nomsRegistre)}`);

  const nomsCli = listeCli().slice().sort();
  if (!egal(nomsCli, purs)) ecarts.push(`le CLI doit lister exactement les commandes pures : ${JSON.stringify(nomsCli)} / ${JSON.stringify(purs)}`);

  for (const c of registre.commandes.filter((k) => k.nature === 'pure')) {
    for (const [i, ex] of (c.exemples || []).entries()) {
      const direct = registre.appeler(c.nom, ex.entree);
      const parCli = cli(c.nom, ex.entree);
      const attendu = direct.ok ? direct.sortie : direct.erreur;
      if ((direct.ok ? 0 : 1) !== parCli.code) ecarts.push(`${c.nom} exemple ${i} : code de sortie ${parCli.code}, attendu ${direct.ok ? 0 : 1}`);
      else if (!egal(attendu, parCli.sortie)) ecarts.push(`${c.nom} exemple ${i} : le CLI ne rend pas la sortie du registre`);
    }
  }

  const inconnu = cli('__commande_inconnue__', {});
  if (inconnu.code !== 1) ecarts.push(`commande inconnue : code ${inconnu.code}, attendu 1`);
  return ecarts;
}

module.exports = { verifierParite };
