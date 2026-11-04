# Skills - Patterns de développement Grist

Ce dossier contient les **patterns de code réutilisables** pour le développement de widgets Grist.

## Pour les agents IA

**Avant de coder un widget Grist, consulter ces fichiers pour utiliser les patterns standards.**

## Index des skills

| Fichier | Contenu |
|---------|---------|
| [schema.md](schema.md) | ⭐ **Création schéma complet** : tables, colonnes, labels, refs, choices |
| [grist-api.md](grist-api.md) | API Grist CRUD : ready, fetchTable, applyUserActions |
| [../docs/WIDGETS-AUTO-DESCRIPTIFS.md](../docs/WIDGETS-AUTO-DESCRIPTIFS.md) | **Proposition** : widgets auto-descriptifs (skill, MCP, CLI, WebMCP, vitrine) depuis un noyau pur et un registre de commandes |
| [data-conversion.md](data-conversion.md) | Conversion colonaire → objets, dates, RefList |
| [inter-widget.md](inter-widget.md) | Communication entre widgets : sélection, options, events |
| [bridge.md](bridge.md) | GristBridge pour iframes sandboxées |
| [patterns.md](patterns.md) | Patterns UI : modales, filtres, toasts, **respect des droits** |
| [vitrine.md](vitrine.md) | ⭐ **Publier** : package.json, vitrine.json, manifeste, forum |
| [echecs-silencieux.md](echecs-silencieux.md) | ⚠️ **Les trois formes d'échec muet** et ce qui les évite |

## Usage rapide

### Widget minimal
```html
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <script src="https://docs.getgrist.com/grist-plugin-api.js"></script>
</head>
<body>
    <div id="app">Chargement...</div>
    <script>
        // Voir skills/grist-api.md pour les patterns complets
        grist.ready({ requiredAccess: 'read table' });
        grist.onRecords(records => {
            // records est en format colonaire, voir data-conversion.md
        });
    </script>
</body>
</html>
```

## Sources

Patterns extraits de :
- `projects/tasks_app/` — TaskFlow (Kanban, Gantt, Calendar)
- `projects/widget_app/` — Artefactory (IDE no-code)
- [nic01asfr/grist-widgets](https://github.com/nic01asfr/grist-widgets) — Geo-map, Cluster Quest
- [nic01asfr/grist-navigation-widgets](https://github.com/nic01asfr/grist-navigation-widgets) — Navigation multi-widgets
- [nic01asfr/Grist-App-Nest](https://github.com/nic01asfr/Grist-App-Nest) — Dashboard dynamique
