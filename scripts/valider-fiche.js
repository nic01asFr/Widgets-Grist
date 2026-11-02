/**
 * Une fiche de capacités dit-elle vrai ?
 *
 * Le schéma `docs/fiche-capacites-0.1.schema.json` fixe la forme ; le validateur du dépôt (`valider-schema.js`) n'en lit qu'une part
 * (pas de pattern, d'unicité, de dépendance). Les règles de la spécification (docs/WIDGETS-AUTO-DESCRIPTIFS.md, §3 à §6) sont donc
 * vérifiées ici, en clair :
 *   - aucun verbe n'est passé sous silence : couvert par au moins une commande, ou déclaré dans `non_couverts`, jamais les deux ;
 *   - une commande n'apparaît qu'une fois et porte le préfixe du widget ;
 *   - un contrat du catalogue existe à cette version dans published/schemas/index.json ;
 *   - un contrat hors catalogue porte son empreinte, et n'est pas déjà au catalogue (sinon la fiche ment).
 *
 * Usage :
 *   const { validerFiche } = require('./valider-fiche.js');
 *   node scripts/valider-fiche.js <fiche.json>
 */

const fs = require('fs');
const path = require('path');
const { valider } = require('./valider-schema.js');

const RACINE = path.join(__dirname, '..');
const VERBES = ['presenter', 'configurer', 'creer', 'editer', 'structurer', 'personnaliser', 'publier', 'exploiter', 'recolter', 'traiter'];

const lire = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

function chargerSchema() { return lire(path.join(RACINE, 'docs', 'fiche-capacites-0.1.schema.json')); }
function chargerCatalogue() { return lire(path.join(RACINE, 'published', 'schemas', 'index.json')).contrats; }

/** @returns {string[]} les écarts ; vide si la fiche est juste */
function validerFiche(fiche, { schema = chargerSchema(), catalogue = chargerCatalogue() } = {}) {
  const ecarts = valider(fiche, schema, schema).map((e) => (typeof e === 'string' ? e : JSON.stringify(e)));
  if (ecarts.length) return ecarts;

  if (!/^[a-z][a-z0-9-]*$/.test(fiche.widget)) ecarts.push(`widget : « ${fiche.widget} » n'est pas un identifiant`);
  if (!/^[0-9]+[.][0-9]+[.][0-9]+$/.test(fiche.version)) ecarts.push(`version : « ${fiche.version} » n'est pas x.y.z`);

  const vues = new Map();
  for (const [verbe, noms] of Object.entries(fiche.verbes)) {
    for (const nom of noms) {
      if (!new RegExp(`^${fiche.widget.replace(/-/g, '_')}_[a-z0-9_]+$`).test(nom)) ecarts.push(`commande « ${nom} » : le préfixe « ${fiche.widget}_ » est exigé`);
      if (vues.has(nom)) ecarts.push(`commande « ${nom} » : listée sous « ${vues.get(nom)} » et « ${verbe} »`);
      vues.set(nom, verbe);
    }
    if (!noms.length) ecarts.push(`verbe « ${verbe} » : liste vide (le retirer de verbes, le déclarer dans non_couverts)`);
  }

  const declares = new Set(fiche.non_couverts);
  if (declares.size !== fiche.non_couverts.length) ecarts.push('non_couverts : verbe en double');
  for (const v of VERBES) {
    const couvert = (fiche.verbes[v] || []).length > 0;
    if (couvert && declares.has(v)) ecarts.push(`verbe « ${v} » : couvert et déclaré non couvert`);
    if (!couvert && !declares.has(v)) ecarts.push(`verbe « ${v} » : ni couvert ni déclaré dans non_couverts (passé sous silence)`);
  }

  for (const sens of ['produit', 'lit']) {
    for (const c of fiche.contrats[sens]) {
      const dansCatalogue = catalogue.find((k) => k.nom === c.nom && k.version === c.version);
      if (c.catalogue && !dansCatalogue) ecarts.push(`contrats.${sens} « ${c.nom} ${c.version} » : déclaré au catalogue, absent de published/schemas/index.json`);
      if (!c.catalogue) {
        if (!c.empreinte) ecarts.push(`contrats.${sens} « ${c.nom} ${c.version} » : hors catalogue, l'empreinte est obligatoire`);
        else if (!/^sha256:[0-9a-f]{8,}$/.test(c.empreinte)) ecarts.push(`contrats.${sens} « ${c.nom} ${c.version} » : empreinte illisible`);
        if (dansCatalogue) ecarts.push(`contrats.${sens} « ${c.nom} ${c.version} » : déclaré hors catalogue alors qu'il y figure`);
      }
    }
  }
  return ecarts;
}

if (require.main === module) {
  const f = process.argv[2];
  if (!f) { console.error('Usage : node scripts/valider-fiche.js <fiche.json>'); process.exit(2); }
  const ecarts = validerFiche(lire(f));
  if (ecarts.length) { ecarts.forEach((e) => console.error('- ' + e)); process.exit(1); }
  console.log('fiche juste');
}

module.exports = { validerFiche, VERBES };
