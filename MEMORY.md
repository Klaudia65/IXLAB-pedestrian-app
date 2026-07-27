# MEMORY.md

> Faits durables du projet, relus automatiquement à chaque session (avec CLAUDE.md).
> Le contexte détaillé / l'état de la stack vit dans CARNET-DE-BORD.md (non auto-lu).

## Objectif de recherche (contexte HCI, IXLAB — pas un produit commercial)
Web app qui pousse les piétons (seul / couple / groupe) à explorer leur quartier
via une expérience personnalisée. Terrain pilote : Ikseon-dong / Jongno, Séoul.

### Questions de recherche (peuvent évoluer)
- RQ1 — Comment concevoir une navigation piétonne personnalisée **qui réconcilie
  les préférences de plusieurs personnes** ?
- RQ2 — Comment la rendre **adaptative** selon le cadre solo / couple / groupe ?
- RQ3 (évaluation) —
  - L'agent arrive-t-il à déterminer un **profil** spécifique par utilisateur ?
  - L'app **motive-t-elle à explorer** ?
  - Le **mode "Background"** modifie-t-il le comportement d'exploration ?

## Faits issus de l'user study
- Les gens déclarent vouloir marcher **~38 min en moyenne avant de s'arrêter**
  → cible de durée de parcours (soft target, à personnaliser), pas un plafond dur.

## Repères de conception (état de la réflexion, 2026-07-24)
- **Sliders de vibe** : 6 axes dans [-1,+1]. Chaque axe peut être **exclu** (toggle
  `off`) → l'exclusion, pas le milieu du curseur, gère le "ça m'est égal".
- **Ranker** (realmap.jsx `rankByVibe`) : distance euclidienne rue↔cible sur les
  axes actifs ; tri par nb d'axes renseignés puis par proximité. Sensibilité forte
  car scores rank-normalisés (uniformes) + normalisations incohérentes entre axes.
- **Mode "Background"** = mode ambiant "wander freely" (map.jsx, brume/radar),
  opposé aux modes route dirigée (follow / modify). C'est une condition d'étude.
- **Routing / isochrone** : pas encore implémenté (graphe walk_graph.graphml dispo).
