# Projet: grist_forms (Form Builder)

## Contexte
Essence formulaires Grist — compose FormDef, persist table Formulaires, publish vue intra-doc.
Façade **questionnaire** pour user non formé ; moteur technique (`bind` / `ensureSchema`) en coulisse.

## Spec
- v1 : `docs/superpowers/specs/2026-07-26-grist-forms-builder-design.md`
- Phase 2 (SM + Attachments) : `docs/superpowers/specs/2026-07-26-grist-forms-phase2-design.md`
- Contexte & audience : `docs/superpowers/specs/2026-07-26-grist-forms-context-audience-design.md`

## Architecture

```
projects/grist_forms/
├── builder.html          # UI 4 étapes + wizard + templates
├── runtime/
│   ├── engine.js         # Preview + runtime (conditions, cascade, editRowId)
│   ├── formdef.schema.json
│   └── survey-manifest.schema.json
├── shared/
│   ├── dsfr-like.css
│   ├── ux.js
│   ├── grist-bridge.js
│   ├── types.js
│   ├── attachments.js
│   ├── session-context.js   # Probe widget / session / groupes audience
│   ├── audience-setup.js    # Auto formule user.Email (trigger nouvelles lignes)
│   ├── survey-project.js
│   ├── ensure-schema.js
│   ├── audience-setup.js    # Auto formule user.Email (trigger nouvelles lignes)
│   ├── formulaires-table.js
│   └── publish.js
├── tests/
├── docs/MANUAL_TEST.md
└── docs/PUBLICATION.md
```

## État — **v1 + phase 2 + audience** (2026-07-27)

`node --test projects/grist_forms/tests/*.test.js` → **82 tests verts**

### Livré
- Wizard Créer / Brancher ; templates (Satisfaction = chemin recontact)
- Binding complet + `visibleCol` méta
- Chemins d’étapes + conditions champ (ET/OU, opérateurs FR, infobulles `?`)
- **Contexte & audience** :
  - `session-context.js` : `inGristWidget`, `isLoggedIn`, `userEmail`, `groups`
  - Conditions `source: context | audience | field`
  - Accueil : case « Réserver des questions… » + table email/groupe (détection auto, selects par type)
  - **Reconnaître la personne connectée** : coche → `audience-setup.js` applique `ModifyColumn` (formule `user.Email`, trigger nouvelles lignes)
- Cascade Ref→Ref ; filtre dynamique Choice/Text→Ref ; filtre Ref→même table (`parentResolve: refRow` + `parentValueColumn`)
- Publish intra-doc ; Survey Manifest ; Attachments (upload depuis une vue custom : vérifié le 18/09/2026)
- UX : slides Accueil/Fin, branding, placeholders, libellés inline

### Validation live
Checklist : `docs/MANUAL_TEST.md` §4–5. Guide publication : `docs/PUBLICATION.md`.

### Publication GitHub Pages

```bash
npm run promote:grist-forms   # projects/ → published/grist_forms/
npm run manifest
```

Widget catalogue : `grist_forms/builder.html` (accès **full**).

### Hors scope / différé
- Géo, **BlockNote**, collab ; goto explicite entre étapes
- Promote `published/` : sur demande

### Piste future (étude séparée)
Binding BlockNote formulaires (offre de service) : **cadré** — voir `docs/superpowers/specs/2026-07-29-form-binding-blocknote-cerema-design.md` et `.wikichat/knowledge/grist-forms-blocknote-binding-axis.md`. Ce projet = référence technique (`FormDef`, `ensureSchema`, publish, survey-project.js) ; blocs BlockNote dans cerema-offre-de-service / qgis-sspcloud.

### Attachments depuis une vue custom — ça passe (18/09/2026)

La note différée disait : « `POST …/attachments` depuis vue custom hors origine →
CORS ». **C'était faux.** Mesuré dans un widget servi depuis une autre origine,
avec un jeton `readOnly: false` : sans `X-Requested-With`, la protection CSRF de
Grist rend un 401 **sans en-têtes CORS**, que le navigateur masque en
`net::ERR_FAILED` — exactement comme un refus d'origine. Avec l'en-tête, la pièce
jointe est créée. C'est le comportement par défaut d'`uploadFiles` (voir
`simpleUpload`), et c'est ce que fait SURFAC²E.

**Le moteur n'envoie plus forcément lui-même.** `deps.uploadFile(fichier)` —
transmis par `bridge.uploadFile` — laisse l'hôte verser le fichier et rendre les
ids. C'est le seul chemin praticable hors navigateur : l'application de terrain
émet par le client HTTP natif de Capacitor, où aucune règle d'origine ne
s'applique. Sans ce point d'entrée, il aurait fallu dupliquer le moteur.

**Un champ fichier laissé vide ne vide plus la colonne.** `resolveAttachmentFields`
écrasait par `null` toute valeur qu'il ne savait pas lire — dont le chemin d'une
photo posé par QField sur une colonne texte. Enregistrer la fiche sans toucher à
la photo effaçait donc la donnée. Une valeur illisible est maintenant laissée
telle quelle.

## Audience — rappel UX

| UI (Accueil) | Rôle |
|--------------|------|
| Réserver des questions… | Active `audience.mode=bind` |
| Table / colonnes email & groupe | Liste personnes pour conditions |
| Reconnaître la personne connectée | `audience.probe=true` + formule auto sur colonne email |

Conditions ≠ ACL : masquage UX seulement ; droits réels = règles Grist.

## Ouverture

```bash
npm run serve:dev
# → http://localhost:3001/grist_forms/builder.html
```

Widget Grist → cette URL, accès **full**. E2E auto : `?e2e=1` uniquement.
