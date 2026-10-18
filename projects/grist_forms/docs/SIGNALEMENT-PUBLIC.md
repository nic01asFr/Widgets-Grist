# Signalement public sans connexion — brouillon FormDef + ACL

Cas : une personne non connectée signale un problème à un arrêt de bus.
Elle arrive par un lien ou un QR code qui porte une clé de lien unique par arrêt.

**À valider par Nicolas avant tout test** sur un document jetable.

---

## 1. Modèle de données recommandé

Table `Signalements` (à créer dans le document Grist) :

| Colonne | Type Grist | Notes |
|---|---|---|
| `cle_lien` | Text | Clé de l'arrêt (issue du ?cle_=) — jamais saisie |
| `Arret` | Text | Libellé affiché (pré-rempli, lecture seule) |
| `Categorie` | Choice | Liste fermée |
| `Description` | Text | Textarea optionnelle |
| `Photo` | Attachments | Optionnelle ; 1 fichier max |
| `Horodatage` | DateTime | Rempli par le moteur (`meta.timestampCol`) |

Pas de colonne `Actif` dans ce modèle : la révocation se fait en retirant la clé
du QR code ou en changeant la règle ACL pour l'arrêt concerné.

---

## 2. FormDef

```json
{
  "manifest_version": "1.0.0",
  "id": "signalement-arret-bus",
  "title": "Signaler un problème",
  "tableId": "Signalements",
  "composeMode": "ensureSchema",
  "successMessage": "Merci pour votre signalement.",
  "branding": {
    "organisation": "Votre service de mobilité",
    "organisationDetail": "Formulaire public — vos données sont anonymes"
  },
  "accueil": {
    "titre": "Signaler un problème à cet arrêt",
    "texte": "Ce formulaire est anonyme. Il prend **moins d'une minute**. Votre signalement est transmis directement au service en charge.",
    "dureeMinutes": 1,
    "bouton": "Signaler"
  },
  "meta": {
    "timestampCol": "Horodatage"
  },
  "choices": {
    "Categorie": [
      "Propreté",
      "Éclairage",
      "Affichage ou information",
      "Abri ou mobilier",
      "Accessibilité",
      "Sécurité",
      "Autre"
    ]
  },
  "sections": [
    {
      "id": "context",
      "label": "L'arrêt concerné",
      "fields": [
        {
          "colId": "cle_lien",
          "label": "Clé de lien",
          "type": "Text",
          "widget": "hidden",
          "defaultFromLink": "cle",
          "required": true
        },
        {
          "colId": "Arret",
          "label": "Arrêt",
          "type": "Text",
          "widget": "text",
          "readonly": true,
          "defaultFromLink": "arret"
        }
      ]
    },
    {
      "id": "probleme",
      "label": "Le problème",
      "fields": [
        {
          "colId": "Categorie",
          "label": "De quoi s'agit-il ?",
          "type": "Choice",
          "widget": "radio",
          "required": true,
          "options": {
            "choices": "Categorie"
          }
        },
        {
          "colId": "Description",
          "label": "Décrivez si vous le souhaitez",
          "type": "Text",
          "widget": "textarea",
          "options": {
            "placeholder": "Graffiti sur le vitre, panneau cassé…",
            "maxlength": 500
          }
        }
      ]
    },
    {
      "id": "photo",
      "label": "Photo (optionnelle)",
      "fields": [
        {
          "colId": "Photo",
          "label": "Une photo du problème",
          "type": "Attachments",
          "widget": "file",
          "options": {
            "accept": "image/*",
            "maxFiles": 1,
            "maxSizeMB": 5,
            "preprocess": {
              "maxPx": 1600,
              "quality": 0.82,
              "stripExif": true
            }
          }
        }
      ]
    }
  ]
}
```

**Notes sur ce FormDef**

- `widget: "hidden"` + `defaultFromLink: "cle"` — le champ `cle_lien` est
  rempli automatiquement depuis le paramètre `?cle_=` de l'URL. Il n'est pas
  affiché mais il est écrit dans la ligne. Ce widget (`hidden`) n'existe pas
  encore dans le moteur — voir §5.
- `widget: "text"` + `readonly: true` + `defaultFromLink: "arret"` — le libellé
  de l'arrêt est pré-rempli depuis `?arret_=` et affiché en lecture seule.
- `preprocess` sur le champ `Photo` — voir §4 (réduction côté navigateur).

---

## 3. Règles ACL Grist

Rôle public sur le document : **Éditeur** (nécessaire pour que canEdit=true
permette POST /attachments).

### Table `Signalements` — règles par défaut (remplacent le rôle de base)

Toutes les règles sont en Python-like (syntaxe Grist ACL, interface « Règles »).

```
# LECTURE
# Un visiteur voit seulement ses propres lignes (clé de lien correspond)
# Un utilisateur connecté voit tout (admin / gestionnaire)
ALLOW READ IF user.IsLoggedIn OR rec.cle_lien == user.LinkKey.cle

# CRÉATION
# Autorisée seulement si :
#   (a) la clé de lien dans l'URL est non vide
#   (b) la ligne qu'on crée porte CETTE clé (pas une autre)
# newRec est disponible dans les règles CREATE — c'est la valeur écrite
ALLOW CREATE IF newRec.cle_lien == user.LinkKey.cle AND user.LinkKey.cle != ""

# MODIFICATION
# Interdite pour les visiteurs non connectés
# (on ne peut pas modifier un signalement qu'on a déjà soumis)
ALLOW UPDATE IF user.IsLoggedIn

# SUPPRESSION
# Interdite à tout visiteur ; connecté seulement
DENY DELETE IF NOT user.IsLoggedIn
```

**Point clé résolu** : lors d'un INSERT, `newRec.cle_lien` contient la valeur
que le formulaire écrit dans la colonne. Si le formulaire écrit toujours
`user.LinkKey.cle` dans ce champ (via `defaultFromLink: "cle"`), la règle
`newRec.cle_lien == user.LinkKey.cle` est satisfaite. Si quelqu'un forge une
requête sans la clé, `user.LinkKey.cle` vaut `""` et la règle ALLOW est fausse
→ INSERT refusé.

**Point à tester** : est-ce que Grist évalue bien `newRec` dans les règles
CREATE pour un visiteur public Éditeur ? **Non mesuré.** C'est le test à faire
sur le document jetable.

### Colonnes protégées

Pour empêcher qu'un visiteur écrive n'importe quoi dans `cle_lien` :

```
# Colonne cle_lien — seule la règle de création la laisse passer
# Après création, personne ne peut la changer (sauf admin)
DENY UPDATE [cle_lien] IF NOT user.IsLoggedIn
```

---

## 4. Réduction photo côté navigateur

À ajouter dans `attachments.js` (fonction `preprocessImage` appelée avant
`uploadFiles`) :

```javascript
// Réduction + suppression EXIF par réencodage sur canvas.
// Pas de lib externe : drawImage ne copie pas les métadonnées EXIF.
function preprocessImage(file, opts) {
  opts = opts || {};
  var maxPx  = opts.maxPx   || 1600;
  var quality = opts.quality != null ? opts.quality : 0.82;
  var mime   = 'image/jpeg';

  return new Promise(function (resolve, reject) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      var w = img.naturalWidth, h = img.naturalHeight;
      if (w <= maxPx && h <= maxPx && file.type === mime) {
        // Pas de redimensionnement, mais on réencode quand même pour supprimer EXIF
      }
      var scale = Math.min(1, maxPx / Math.max(w, h));
      var cw = Math.round(w * scale), ch = Math.round(h * scale);
      var canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
      canvas.toBlob(function (blob) {
        if (!blob) { reject(new Error('Réencodage image échoué.')); return; }
        // Nom sans extension d'origine → .jpg
        var name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
        resolve(new File([blob], name, { type: mime }));
      }, mime, quality);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error('Lecture image échouée.'));
    };
    img.src = url;
  });
}
```

- **GPS retiré** : `drawImage` ne copie pas les métadonnées EXIF, donc les
  coordonnées GPS sont supprimées sans lib Exif.
- **Taille bornée** : 1600 px sur le grand côté → < 1 Mo typique sur un
  JPEG q=0.82.
- **Intégration** : appeler `preprocessImage` dans `resolveAttachmentFields`
  avant `uploadFiles`, seulement si `field.options.preprocess` est défini.

---

## 5. Ce qui manque dans le moteur

| Besoin | État |
|---|---|
| `widget: "hidden"` + `defaultFromLink` | **Absent** — à implémenter |
| `widget: "text"` + `readonly` + `defaultFromLink` | Partiel (readonly existe, defaultFromLink non) |
| `preprocessImage` dans `attachments.js` | **Absent** — brouillon ci-dessus |
| Test newRec dans ACL Grist (CREATE, visiteur public Éditeur) | **Non mesuré** |

---

## 6. Architecture du lien QR

Le QR code ou le lien partagé par l'opérateur porte :

```
https://docs.getgrist.com/doc/<DOCID>/p/<PAGEID>?cle_=<cle-arret>&arret_=Arrêt%20Victor%20Hugo
```

La clé `cle_=` est lue par Grist comme `user.LinkKey.cle` dans les ACL.
Le paramètre `arret_=` est lu comme `user.LinkKey.arret` et pré-remplit le
champ `Arret` (lecture seule).

**Générateur de liens** : une table `Arrets` dans le même document, avec une
colonne `lien` calculée : `f"https://…?cle_={cle_arret}&arret_={nom_arret}"`.
L'opérateur y scanne le QR en consultant cette colonne.

---

## 7. Ce qui est en attente de l'accord de Nicolas

1. Rôle public Éditeur sur un document jetable
2. Test règle `newRec.cle_lien == user.LinkKey.cle` en CREATE
3. Test upload pièce jointe (POST /attachments) par un visiteur public Éditeur
4. Test lecture de la photo par un autre visiteur (sans la clé) — doit rendre 403

Sans ce test, aucun code n'est mergé ni publié.
