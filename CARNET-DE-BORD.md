# Carnet de bord — IXLAB pedestrian app

> **À quoi sert ce fichier.** C'est *ton* tableau de bord personnel : où on en est, comment la
> stack technique s'emboîte, et les choix qu'on doit trancher ensemble. Il n'est **pas** lu
> automatiquement par Claude (seuls `MEMORY.md` et `CLAUDE.md` le sont). Je ne le consulte ou
> ne le mets à jour que si tu me le demandes. Dis-moi « mets à jour le carnet » quand tu veux
> que je le resynchronise avec l'état réel du code.
>
> Dernière synchro avec le code : **2026-07-10**.

---

## 1. Le projet en une phrase

Une **web app** (utilisable au téléphone, mais pas une app native) qui pousse les piétons —
**seul, en couple, ou en groupe** — à explorer leur quartier via une expérience personnalisée.
Terrain pilote : **Ikseon-dong (익선동), Séoul**. Contexte : recherche HCI à l'IXLAB, pas un
produit commercial.

Deux questions de recherche : (1) comment concevoir une navigation piétonne personnalisée **et**
qui réconcilie les préférences de plusieurs personnes ? (2) comment la rendre adaptative en solo /
couple / groupe ?

---

## 2. État global (feux de circulation)

| Brique | État | Commentaire |
|---|---|---|
| Prototype UI (React CDN) | 🟢 existe | `web/frontend/seoul-walk.html` : onboarding + écrans map/social |
| Design system | 🟢 existe | `web/design_system/` (couleurs, typo, composants, palette hanok) |
| Base de données géo (PostGIS) | 🟢 en place | table `pois`, index GiST, tourne en Docker |
| Collecte de données OSM | 🟢 fonctionne | 1120 POI stockés au 1er run (zone pilote) |
| API backend (FastAPI `/pois`) | 🟡 tourne via Docker | endpoint prêt ; à valider de bout en bout |
| Carte réelle branchée aux vraies données | 🟡 en test | `map-with-pois-test.html` lit `/pois` en live |
| Choix du fournisseur de carte (A/B/C) | 🔴 à trancher | voir §5 |
| Routing piéton (itinéraire calculé) | 🔴 pas commencé | T-map ou OpenRouteService |
| Autres collecteurs (LOCALDATA, TourAPI…) | 🔴 pas commencé | OSM est le seul en place |
| Score de découverte réel (heatmap) | 🔴 fictif | points inventés pour la démo |

Légende : 🟢 fait · 🟡 en cours / à valider · 🔴 à faire.

---

## 3. Comment tout s'emboîte (le flux de données)

Le cœur du système, c'est une seule idée : **on récolte des lieux une fois (hors-ligne), on les
range dans une base géographique, puis la carte va piocher dedans à la demande.**

```
 SOURCES              COLLECTE (hors-ligne)         STOCKAGE           SERVICE            AFFICHAGE
                                                                                                  
 OpenStreetMap  ──►  osm_collector.py         ──►  PostGIS      ──►  FastAPI /pois  ──►  MapLibre
 (Overpass API)      classe en 5 familles          table `pois`      requête bbox        (carte web)
                     upsert_pois()                  + index GiST      → GeoJSON
 (plus tard :                                                                            
  Kakao, TourAPI,                              ┌─  export_geojson.py  (pont statique alternatif,
  LOCALDATA…)                                  └─  écrit pois.geojson si l'API ne tourne pas)
```

Deux détails importants à avoir en tête :

- **Deux « mondes » Python séparés, exprès.**
  - Le *collecteur hors-ligne* (`backend/offline/`) est un **script batch synchrone** : il utilise
    `psycopg` (v3). On le lance à la main de temps en temps pour remplir la base.
  - L'*API en ligne* (`backend/app/`) est **asynchrone** : FastAPI + SQLAlchemy async + `asyncpg`.
    Elle répond en temps réel à la carte.
  - Les deux parlent à **la même base PostGIS**, mais ne partagent pas le même code de connexion.
    C'est normal : un batch et un serveur web n'ont pas les mêmes contraintes.

- **Le « pont GeoJSON » est un plan B.** `export_geojson.py` sert à afficher les données *sans*
  faire tourner l'API (il écrit un fichier statique que la carte lit directement). Aujourd'hui on
  a réussi à faire tourner l'API via Docker, donc le chemin principal est **carte → API `/pois` →
  PostGIS** en live (`map-with-pois-test.html`). Le pont reste utile comme secours.

---

## 4. La stack, brique par brique

### 4.1 Base de données — PostGIS
- **Ce que c'est :** PostgreSQL + l'extension **PostGIS** (le géo). Image Docker `postgis/postgis:16-3.4`.
- **Pourquoi :** PostGIS sait répondre vite à « donne-moi tous les lieux visibles dans ce
  rectangle de carte ». C'est la requête clé de l'app.
- **Table `pois`** (`backend/sql/init.sql`) : `place_id` (identifiant unique par source, ex.
  `osm:n123`), `name`, `category` (1 des 5 familles), `subcategory`, `geom` (un point WGS84 /
  SRID 4326), `source`, plus des colonnes prêtes pour plus tard : `attributes_vector FLOAT[]`,
  `sentiment_score`, `review_count`.
- **Index `GiST` sur `geom`** : c'est lui qui rend la recherche « dans ce rectangle » instantanée.
- **5 familles de lieux :** `nature`, `culture`, `food`, `social`, `urban_texture`.

### 4.2 Collecte hors-ligne — `backend/offline/`
- **`scrapers/osm_collector.py`** : interroge **OpenStreetMap via l'API Overpass** (gratuit, sans
  clé) sur la zone pilote, traduit les tags OSM vers nos 5 familles (`classify()`), puis insère.
  Lancement : `python -m offline.scrapers.osm_collector --store` (sans `--store` = essai à blanc).
- **`db.py`** : connexion partagée (psycopg3) + `upsert_pois()` qui fait un *upsert*
  (`ON CONFLICT (place_id)`) : relancer la collecte met à jour au lieu de dupliquer.
- **`export_geojson.py`** : exporte la table en `web/frontend/pois.geojson` (le pont statique).
- **Pourquoi OSM d'abord :** licence ODbL → on a le droit de **stocker** les données. Kakao/Naver
  viendront plus tard, seulement pour enrichir (« notabilité », avis), car leurs CGU sont plus
  restrictives sur le stockage.

### 4.3 API en ligne — `backend/app/`
- **`main.py`** : deux routes.
  - `GET /health` → check simple.
  - `GET /pois?west&south&east&north&category` → renvoie une **FeatureCollection GeoJSON** des POI
    dans le rectangle demandé. Le filtre `category` est optionnel. La requête utilise
    `geom && ST_MakeEnvelope(...)` (test « les rectangles se chevauchent », accéléré par l'index).
- **`database.py`** : moteur SQLAlchemy async, vérifie la connexion PostGIS au démarrage.
- **`config.py`** : lit la config depuis `.env` / variables d'env (`DATABASE_URL`, `DEBUG`,
  `VECTOR_DIM`).
- **CORS grand ouvert** (`allow_origins=["*"]`) : uniquement pour le dev, à restreindre en prod.

### 4.4 Docker — ce qui a débloqué l'API
- **Le problème :** le venv local est en **Python 3.14**, et `asyncpg`/`numpy` n'ont pas encore de
  « wheels » pour 3.14 → l'API ne s'installait pas en local.
- **La solution :** `backend/Dockerfile` construit l'image sur **Python 3.12** (qui a les wheels).
  `docker-compose.yml` lance **deux services** sur un réseau privé : `db` (PostGIS) et `api`
  (FastAPI, `--reload`, code monté en volume donc les éditions rechargent sans rebuild).
- **Ports :** PostGIS exposé sur `localhost:5432` (pour que le collecteur y accède depuis ton PC),
  API sur `localhost:8000`. Dans le réseau Docker, l'API joint la base via le nom `db`.
- **À retenir :** le collecteur hors-ligne tourne **sur ton PC** (Python 3.14, psycopg) et écrit
  dans la base Docker ; l'API tourne **dans Docker** (Python 3.12). Cohabitation volontaire.

### 4.5 Frontend — la carte
- **Moteur retenu pour le prototype stylé : MapLibre GL JS** (chargé par `<script>` CDN, pas de
  build system). Fond vectoriel **OpenFreeMap** (gratuit, sans clé), repeint dans la palette hanok
  du design system.
- **`web/frontend/map-compare.html`** : page de comparaison **Kakao vs MapLibre** côte à côte
  (mêmes cafés réels posés sur les deux) — sert à décider du fournisseur.
- **`web/frontend/map-with-pois-test.html`** : la carte MapLibre qui **appelle l'API `/pois` en
  live** à chaque déplacement (`moveend`) et affiche les POI par famille. C'est le prototype du
  chemin de données complet.
- **Modèle mental d'une carte = 3 briques indépendantes :** *Affichage* (les tuiles) · *Localisation*
  (le GPS du navigateur, `navigator.geolocation`, gratuit) · *Routing* (calcul d'itinéraire). On
  peut mélanger les fournisseurs entre ces trois briques.

---

## 5. Décisions ouvertes — à trancher ensemble

### Choix n°1 — Fournisseur de carte (le plus important)
| Option | Affichage + POI | Routing piéton | Force | Faiblesse |
|---|---|---|---|---|
| **A** (recommandée pour la Corée) | Kakao Map | T-map API | Meilleures données Séoul (ruelles, POI) ; tu as déjà un compte Kakao dev | Style peu personnalisable |
| **B** | MapLibre + tuiles vecteur | OpenRouteService | **Liberté totale de design** (palette hanok) | Données ruelles/POI de Séoul plus faibles |
| **C (hybride)** | MapLibre pour l'affichage stylé + données Corée à côté | à définir | Le meilleur des deux | Afficher des POI Kakao sur MapLibre = **zone grise des CGU Kakao** en prod |

> Point de discussion : le design (identité visuelle forte via le design system) pousse vers B/C,
> mais la qualité des données piétonnes de Séoul pousse vers A. À arbitrer selon ce qui compte le
> plus pour l'étude utilisateur.

### Choix n°2 — Routing piéton
Pas encore commencé. T-map (excellent en Corée) vs OpenRouteService (open, stylable). Dépend du choix n°1.

### Choix n°3 — Score de découverte réel
La heatmap « potentiel de découverte » est aujourd'hui alimentée par des points **fictifs**. À
remplacer par un vrai score dérivé des données (avis, notabilité, `attributes_vector`).

---

## 6. Prochaines étapes possibles

1. **Valider le chemin complet en live** : `docker compose up` → collecte `--store` → ouvrir
   `map-with-pois-test.html` et vérifier que les vrais POI s'affichent depuis l'API.
2. **Ajouter des collecteurs** : données publiques Corée (LOCALDATA, Seoul Open Data, TourAPI,
   VWorld) avec reprojection EPSG:5179 → 4326 ; puis Kakao pour la « notabilité ».
3. **Dédoublonnage inter-sources** (même lieu vu par OSM + Kakao) : proximité spatiale ~20-30 m + nom.
4. **NLP KoBERT** sur les blogs Naver → indicateurs sémantiques → `attributes_vector`.
5. **Trancher A/B/C**, puis brancher le **routing piéton**.
6. Remplacer la heatmap fictive par un vrai score.

---

## 7. Journal

> Ajoute ici les décisions et jalons au fil de l'eau (date — quoi — pourquoi).

- **2026-07-06** — Pipeline OSM opérationnel : 1120 POI stockés pour la zone pilote Ikseon-dong
  (food 884, culture 169, social 33, urban_texture 23, nature 11).
- **2026-07-06** — Page de comparaison Kakao vs MapLibre fonctionnelle ; MapLibre stylé (palette
  hanok, tuiles OpenFreeMap) ; heatmaps fictives sur les deux moteurs.
- **~2026-07-10** — Backend passé sous Docker (Python 3.12) : contourne le blocage Python 3.14 et
  fait enfin tourner l'API FastAPI `/pois`. Nouveau test carte live `map-with-pois-test.html`.
  *(Fichiers Docker et `offline/` encore non commités — pense à `git add`.)*
