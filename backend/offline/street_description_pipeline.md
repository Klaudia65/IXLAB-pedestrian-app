# Pipeline de description de rue — condensation LLM ancrée

> Spec d'implémentation à destination de Claude Code.
> Objectif : remplacer le champ `description` (aujourd'hui dominé à ~92 % par des
> ledes administratifs Wikipédia « commence à X, finit à Y ») par une phrase
> d'ambiance courte, **ancrée strictement dans du texte source réel**, calculée
> hors-ligne et figée dans un cache.
> Ne PAS régénérer à chaque build. Ne PAS appeler le LLM sur une rue sans texte de « vibe ».

---

## 0. État actuel (diagnostic, à ne pas casser)

- `backend/offline/street_character.py` assemble, par nom de rue :
  - `text_by_name[name]` = lede Wikipédia ko (via `fetch_wikipedia`) + snippets blog
    (via `load_blog_texts`, cache `cache/blog-text-{zone}.json`), concaténés.
  - `fingerprints[name]` → `why` (top-4 mots-clés TF-IDF) — **tourne sur le même
    texte que ci-dessus**, donc recopie le lede administratif (d'où les répétitions
    type « 시작하여, 시작하여 »).
  - `conf_by_name[name]` → `confidence`.
- L'export `backend/offline/export_street_character_geojson.py` écrit
  `web/frontend/street-character-jongno.geojson` avec `properties.description = text_by_name[name] or None`.
- Le popup `web/frontend/street-character-jongno.html` affiche `p.description`
  tronqué à 180 caractères.
- Chiffres actuels : 677 rues, 337 avec description dont **309 ledes administratifs**,
  26 avec identité wiki réelle, 609 avec commerces.

Le champ `description` reste le point d'insertion : on change **ce qu'on y met**,
pas le reste de la chaîne.

---

## 1. Vue d'ensemble de la pipeline

```
sources brutes par rue
   │
   ▼
[1] ROUTAGE  ──► Tier A (texte de vibe)  │  Tier B (admin/catégories)  │  Tier C (rien)
   │                     │                          │                       │
   ▼                     ▼                          ▼                       ▼
[2] NETTOYAGE      [3] CONDENSATION LLM      [5] GABARIT catégories       (pas de phrase)
   (Tier A only)      (1 appel / rue)           (déterministe, 0 LLM)
                         │
                         ▼
                   [4] CACHE figé (desc-llm-{zone}.json, clé = hash source)
                         │
                         ▼
                   [6] fix du champ `why`  ──►  [7] EXPORT geojson  ──►  [8] QA
```

Point d'architecture central : le LLM ne s'exécute que sur le Tier A, une seule
fois par contenu source, et **son résultat est mis en cache par hash du texte
source**. Tant que le texte source ne change pas, aucun nouvel appel, aucune
dérive de formulation, build déterministe.

---

## 2. [1] Routage — classer la source de chaque rue

Pour chaque nom de rue, déterminer le tier à partir des sources disponibles :

- **Tier A — texte de vibe** : il existe soit un snippet blog (`blog-text-{zone}.json`),
  soit au moins **une phrase descriptive** dans le lede Wikipédia qui n'est PAS
  purement administrative.
- **Tier B — sans vibe** : seulement un lede administratif et/ou des catégories de
  commerces, aucun texte descriptif exploitable.
- **Tier C — rien** : ni texte, ni commerces.

Détecteur de phrase administrative (à appliquer phrase par phrase, pas au lede entier) :
une phrase est « administrative » si elle matche des motifs d'itinéraire/bornage, ex.
`…에서 시작하여 …에서 끝나는 도로`, `…를/을 잇는 도로`, ou une phrase dont le seul
contenu est `…도로이다` avec des toponymes de bornage et aucun adjectif d'ambiance.

> Important : on découpe le lede wiki en phrases et on **jette seulement la/les
> phrases de bornage**, on garde les autres. Ex. 동호로 : jeter « …옥수동 490-7에서
> …잇는 도로이다 », mais **garder** « 도로명은 한강변을 일컫는 옛말인 동호에서 따왔다 »
> (étymologie = vraie identité). Une rue qui, après ce filtre, garde ≥ 1 phrase
> descriptive passe en Tier A ; sinon elle retombe en Tier B.

Sortie de l'étape : `tier[name]` ∈ {A, B, C} + `vibe_text[name]` (texte source
retenu pour le Tier A).

---

## 3. [2] Nettoyage du texte source (Tier A uniquement)

Avant le LLM, pré-nettoyer `vibe_text[name]` pour réduire le bruit et les tokens :

- Retirer : horaires (`영업시간`, `11:30~22:00`, `라스트오더`), téléphones,
  adresses précises et n° de lot, mentions parking (`주차불가/주차가능`),
  prix, hashtags `#…`, URLs, « n번출구에서 237m ».
- Dédupliquer les snippets quasi identiques.
- Concaténer les snippets restants + phrases wiki descriptives.
- Plafonner la longueur (ex. top-N snippets ou ~1500 caractères) pour borner le coût.

Ce pré-nettoyage est du regex léger : il n'a pas besoin d'être parfait, il aide juste
le LLM. Le nettoyage sémantique final, c'est le LLM qui le fait.

---

## 4. [3] Condensation LLM — 1 appel par rue Tier A

Un appel par rue Tier A. Modèle de classe légère (type Haiku) suffit.

Paramètres : température 0.1–0.2, `max_tokens` court (~120).

Contrat de prompt (à adapter, mais garder ces contraintes) :

- Rôle : « À partir UNIQUEMENT du texte fourni, écris **une seule phrase** décrivant
  l'ambiance de cette rue **pour un piéton**. »
- Interdits explicites : n'invente aucun fait absent du texte ; pas de nom de
  commerce, d'horaire, de prix ni d'adresse ; pas de superlatif que le texte ne
  justifie pas ; si le texte est trop mince pour une phrase honnête, renvoyer une
  chaîne vide.
- Langue de sortie : **paramètre `output_lang`** (voir §9). Défaut = français (l'UI
  est en français) ; option coréen ou bilingue.
- Format de sortie : JSON strict
  ```json
  { "sentence": "…", "grounded": true, "lang": "fr" }
  ```
  `grounded:false` ou `sentence:""` ⇒ la rue bascule sur le repli Tier B.

Garde-fous post-génération (rejeter et retomber en Tier B si) :
- la sortie contient des chiffres d'horaire, `http`, un `#hashtag` ;
- elle dépasse ~2 phrases / longueur max ;
- (optionnel) elle introduit un nom propre absent du texte source.

---

## 5. [4] Cache figé — déterminisme et non-régénération

Nouveau fichier : `backend/cache/desc-llm-{zone}.json`, clé = nom de rue :

```json
{
  "서순라길": {
    "source_hash": "sha1(vibe_text nettoyé)",
    "sentence": "Ruelle longeant le mur de pierre de Jongmyo, calme et ombragée…",
    "lang": "fr",
    "model": "…",
    "generated_at": "2026-07-23T…"
  }
}
```

Règle de régénération : appeler le LLM **seulement si** `source_hash` a changé (texte
source nouveau/modifié) ou si l'entrée est absente. Sinon, réutiliser la phrase en
cache. Conséquence : coût one-shot (~26 rues wiki + rues avec blog, quelques
centaines d'appels max), builds reproductibles, pas de dérive de formulation.
À l'exécution de l'app : zéro appel LLM, on sert le texte figé.

---

## 6. [5] Repli Tier B — gabarit catégories (déterministe, sans LLM)

Pour les rues Tier B, générer une phrase par gabarit à partir des commerces
(`commerce_count`, catégories) — 0 LLM, 0 hallucination. Ex. (fr) :

> « Rue {piétonne|carrossable} bordée de {5 restaurants de baekban, une librairie
> et un fleuriste}. »

Localiser selon `output_lang`. Gérer singulier/pluriel et le cas « commerces mais
catégories vides ». Tier C : pas de phrase (le popup montre déjà walkability +
puces de catégories).

---

## 7. [6] Corriger le champ `why` (fingerprint)

Le `why` doit cesser de recopier le lede administratif. Deux options, choisir (a) :

- (a) recommandé — calculer le TF-IDF **sur le corpus nettoyé du §3** (texte de vibe
  seulement), pas sur `text_by_name` qui inclut l'admin ;
- (b) minimal — mettre `why = null` pour toute rue qui n'est pas Tier A.

---

## 8. [7] Export & branchement UI

Dans `export_street_character_geojson.py`, définir `properties.description` ainsi :

```
description = desc_llm_cache[name].sentence        # Tier A
           OR template_from_categories(name)       # Tier B
           OR None                                 # Tier C
```

Ajouter `properties.description_source` ∈ {`llm`, `template`, `none`} (debug + UI).

Dans `street-character-jongno.html` : avec une sortie d'1 phrase, la troncature à
180 caractères devient inutile — afficher la phrase entière. Optionnel : nuancer
visuellement selon `description_source` (ex. italique discret pour `template`).

---

## 9. Paramètres de config à exposer

- `output_lang` : `fr` (défaut) | `ko` | `bilingual`. Décide la langue de la phrase
  condensée ET des gabarits. (Décision produit : l'UI est en français mais les noms
  de rue restent en coréen — trancher avant de lancer le batch.)
- `model`, `temperature`, `max_tokens`.
- `zone` (slug, ex. `jongno`) pour généraliser au-delà du pilote.
- `min_source_chars` : longueur mini de texte de vibe sous laquelle on force Tier B.

---

## 10. [8] Validation / QA (à faire tourner après le batch)

- Imprimer, pour un échantillon de N rues Tier A : `vibe_text source` → `sentence` générée, côte à côte.
- Assertion : aucune rue avec `description_source = llm` dont la source était admin-only (fuite de routage).
- Vérifier qu'aucune phrase LLM ne contient horaire / URL / hashtag (garde-fous §4).
- Relecture manuelle d'un échantillon pour l'hallucination / sur-généralisation
  (ex. « un café sympa » → « quartier réputé pour ses cafés » = à rejeter).
- Compter la couverture avant/après : nb de descriptions utiles (non-admin) gagnées.

---

## 11. Ordre d'implémentation suggéré

1. Détecteur de phrase administrative + découpage en phrases (§2) — testable seul.
2. Routage A/B/C + `vibe_text` (§2).
3. Nettoyage regex (§3).
4. Cache `desc-llm-{zone}.json` + logique de hash/skip (§5), d'abord avec un LLM mocké.
5. Appel LLM réel + garde-fous (§4).
6. Gabarit Tier B (§6).
7. Fix `why` (§7).
8. Branchement export + HTML (§8).
9. QA (§10).

> Rappel projet (CLAUDE.md) : commentaires de code en anglais.
