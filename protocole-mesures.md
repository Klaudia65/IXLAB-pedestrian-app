# Protocole de mesure — étude de terrain unique

> **v2.** Remplace la v1. Changements : S2 (élicitation) retirée — répondue par l'étude
> formative · S5 (sous-navigation) retirée — voir `protocole-under-navigation.md`, à reprendre
> plus tard · S1, S3, S4 fusionnées en **une seule étude de terrain**, ~20 participants,
> **une marche solo + une marche en groupe** par personne.
> S'appuie sur la télémétrie existante (`backend/sql/study.sql`).

---

## 0. Ce que deux marches permettent — et ce qu'elles ne permettent pas

À poser d'emblée, parce que la contrainte « 1 marche solo + 1 marche groupe » décide de la
formulation des contributions, pas seulement du planning.

| RQ | Ce qu'on peut affirmer | Ce qu'on ne peut pas |
|---|---|---|
| **RQ1 Représentation** | Que des piétons **sur place** reconnaissent le caractère décrit (fort, écologique) | Que le pipeline corrèle avec une référence humaine — **20 personnes ne suffisent pas** : l'unité statistique ici est le *segment*, pas la personne. → annexe en ligne, §4.2 |
| **RQ3 Réconciliation** | Quelle agrégation les groupes **choisissent** et jugent juste ; ce que chacun abandonne | Comparer l'**expérience vécue** de deux agrégations : une seule marche de groupe, donc une seule agrégation marchée |
| **RQ4 Comportement** | Comment on explore avec une navigation expérientielle ; comparaison à une navigation dirigée **si** on ajoute la jambe de transit (§6.1) | Isoler *la personnalisation* de *l'app* — cela demanderait un troisième bras (yoked). Traité en corrélationnel à la place (§6.3) |

Deux ajouts hors-marche rendent l'étude défendable sans allonger le terrain :

1. **Une annexe en ligne** pour RQ1 (questionnaire photo, 15 min, 60–80 personnes, aucune
   marche). C'est ce qui sauve la corrélation pipeline ↔ humain.
2. **Une jambe de transit** de 10 min au début de la session solo, faite avec l'app de
   navigation habituelle du participant. Ce n'est pas une marche d'étude de plus : c'est le
   trajet pour rejoindre la zone, simplement journalisé. Elle donne la référence
   « navigation traditionnelle » de RQ4 quasi gratuitement.

Si l'un des deux saute, la RQ correspondante doit être **reformulée**, pas maintenue telle
quelle : RQ1 devient « les piétons reconnaissent-ils… » sans la partie inférence, RQ4 devient
descriptive (« comment explore-t-on avec… ») et perd le « compared to traditional navigation
apps ».

---

## 1. Plan

**Participants.** N = 21 en **7 triades d'amis** (recruter 8 triades, une servira de marge :
si un membre se désiste, la triade entière est perdue).

**Pourquoi des triades et pas des paires** — tu ne savais pas trancher, voici l'argument. À
deux, la réconciliation dégénère presque toujours en déférence : l'un cède, et le résultat
mesure une relation, pas une agrégation. À trois apparaît la seule configuration qui rend le
problème réel — **un membre minoritaire** — et c'est exactement là que les stratégies
d'agrégation cessent de produire le même parcours. À quatre ce serait encore mieux, mais on
tomberait à 5 groupes.

**Le critère qui décide vraiment** est logistique : peux-tu trouver 7 trios d'amis, dont aucun
ne réside ou ne travaille à Jongno-gu, disponibles deux fois la même semaine ? Si non, bascule
sur **10 dyades (N = 20)** et assume dans le papier que tu étudies le cadre *couple*, pas le
cadre *groupe* — c'est une limite de portée, pas un défaut.

**Critères d'exclusion** (repris de `protocole-under-navigation.md`) : résider ou travailler à
Jongno-gu, ou y marcher plus d'une fois par mois. Sur terrain connu, la mémoire remplace le
système et « segments jamais parcourus » ne mesure plus rien.

**Zones.** Deux sous-zones **disjointes** de Jongno (~800 m de côté), appariées en densité de
rues de caractère. Contrebalancées **au niveau de la triade** : 4 triades font solo en Z1 /
groupe en Z2, 3 triades l'inverse. Sans ça, la marche de groupe se fait sur un terrain déjà
appris en solo.

**Ordre solo → groupe : fixe, jamais contrebalancé.** Ce n'est pas un oubli, c'est une
dépendance logique : le parcours de groupe se calcule à partir des profils individuels, et le
sacrifice de chacun se mesure **par rapport à sa propre marche solo, réellement vécue**. C'est
le gain principal du plan fusionné — le « what do individuals give up » cesse d'être une
distance dans un espace vectoriel et devient une comparaison entre deux marches faites par la
même personne.

*Menace induite, à écrire :* la marche de groupe est toujours la seconde, donc l'effet social
est confondu avec la familiarité du prototype. Atténuation : le contraste central de RQ3 (entre
agrégations) vit **entièrement à l'intérieur de la session 2** et n'est donc pas touché ; seule
la comparaison solo↔groupe est descriptive, et doit être présentée comme telle.

**Créneau** 14 h–17 h (les scores de vibe sont calés sur 14 h ; l'axe `quiet_lively` bascule à
19 h).

---

## 2. Chronogramme

### Session 1 — solo, ~70 min, individuel

| min | Étape | Ce qu'on mesure |
|---|---|---|
| 0–8 | Accueil, consentement, code participant | — |
| 8–18 | Onboarding dans l'app (swipe + sliders) → profil | `profile_snapshot`, `slider_change`, % d'axes mis *off* |
| 18–30 | **Jambe de transit** : rejoindre le point de départ avec sa propre app de navigation habituelle (~10 min) | Trace GPS, écran allumé, arrêts → référence RQ4 |
| 30–32 | 3 items sur la jambe de transit + consigne neutre | plaisir, attention, découverte |
| 32–47 | **Marche solo personnalisée** (~15 min) | Toute la §6.2 + 3–4 sondes in-situ sur segments d'ancrage |
| 47–57 | Questionnaire post-marche + croquis de mémoire + tâche de pointage | expérience, connaissance spatiale |
| 57–70 | **Bloc reconnaissance assis** : 8 segments parcourus, avec contrôle placebo | RQ1, §4.1 |

### Session 2 — groupe de 3, ~70 min, même semaine

| min | Étape | Ce qu'on mesure |
|---|---|---|
| 0–8 | Formation du groupe dans l'app, vérification des profils | divergence intra-groupe |
| 8–20 | **Étape carte** : 3 parcours candidats non étiquetés → **classement privé** sur son téléphone, sans se parler → puis discussion et **choix collectif** (audio enregistré) | RQ3, mesure principale |
| 20–35 | **Marche de groupe** (~15 min) sur le parcours choisi | comportement en groupe, sondes in-situ |
| 35–43 | Questionnaire individuel **privé** (justice, sacrifice, expérience) | RQ3 |
| 43–50 | **Révélation** : on montre à chacun ce que les deux autres parcours lui auraient donné, personne par personne → re-mesure de la justice perçue | RQ3, le moment le plus informatif |
| 50–70 | Entretiens individuels **séparés** (~6 min) puis court débrief collectif | qualitatif |

---

## 3. Le manipulation check, avant tout le reste

`align_i(r)` = similarité moyenne, pondérée par la longueur des segments, entre le vecteur de
préférence de `i` et le profil de vibe des segments **effectivement parcourus**.

On doit observer : `align_i(marche solo) > align_i(marche groupe) > align_i(jambe de transit)`.

Si l'inégalité de gauche ne tient pas, il n'y a pas eu de personnalisation et **aucun autre
résultat n'est rapportable**. Si celle de droite ne tient pas, la jambe de transit n'est pas une
référence valide. C'est le premier calcul à faire sur les données du pilote, pas à la fin.

---

## 4. RQ1 — Représentation

> *Can the experiential character of a street be inferred at street-segment resolution from open
> and user-generated text, well enough that pedestrians recognize it?*

La RQ contient deux affirmations qui ne se mesurent pas au même endroit. Les séparer est ce qui
permet de tenir avec 20 participants.

### 4.1 Reconnaissance — sur le terrain (les 21 participants)

**Segments d'ancrage.** Contraindre le routeur pour que **toute** marche solo passe par 6
segments d'ancrage communs (pris dans un jeu de 12, tirés selon la zone). Sans cette
contrainte, les parcours personnalisés divergent et aucun segment n'est vu par assez de monde
pour calculer un accord.

**(a) En marche — sonde d'un geste.** À l'entrée d'un segment d'ancrage, une carte apparaît
avec la description générée et **un seul item** : « cette description correspond à ce que je
vois » (1–7, ou trois boutons pouce). Une seule question, sinon on transforme la marche en
questionnaire ambulant.

**(b) Assis, en fin de session (~12 min).** Sur 8 segments qu'ils viennent de parcourir, avec
photo :

| Code | Item (1–7) |
|---|---|
| R1 | Cette description correspond à ce que j'ai vu. |
| R2 | Cette description m'aurait aidé·e à choisir cette rue sans y être allé·e. |
| R3 | Cette description pourrait s'appliquer à n'importe quelle rue du quartier. *(inversé)* |

**Contrôle placebo — non négociable.** Sur 2 des 8 segments, afficher la description **d'un
autre segment**. Si R1 ne chute pas nettement sur ces deux-là (Wilcoxon apparié, appariés vs
mal-appariés), les participants acquiescent à tout et l'ensemble du bloc est sans valeur. C'est
le test qui protège toute la RQ1 : à faire tourner dès le pilote.

**Sorties.** R1 moyen par segment · accord inter-juges Krippendorff α (ordinal) sur les 12
segments d'ancrage, avec ~10 juges chacun · écart apparié/mal-apparié · % d'abstention.

> α **par axe** est déjà un résultat en soi. Si `raw_polished` obtient α = .28 quand
> `quiet_lively` atteint .61, la conclusion publiable est : *tous les axes expérientiels ne sont
> pas inter-subjectivement stables à la résolution du segment* — et les axes instables ne
> devraient jamais servir d'argument dans une agrégation de groupe (§5).

### 4.2 Inférence — annexe en ligne, sans marche (60–80 personnes)

**L'unité statistique de la corrélation pipeline ↔ humain est le segment, pas la personne.**
21 participants marchant 12 segments donnent n = 12 : un ρ de .50 y a un intervalle de
confiance qui va de −.10 à .83, c'est-à-dire aucune conclusion. Il faut **40 segments minimum**,
et pour les coter il n'est pas nécessaire de marcher.

- **Format** : comparaisons forcées par paires, méthode Place Pulse 2.0 — mais sur **tes** axes,
  pas les siens (safe/lively/boring/wealthy/depressing/beautiful sont d'autres construits).
  « Laquelle de ces deux rues est la plus ___ ? » avec l'option « je ne peux pas dire ».
- **Réduire à 3 axes.** Avec ce volume on ne valide pas six axes. Choisir les trois sur lesquels
  le pipeline est le plus fourni (probablement `quiet_lively`, `touristy_local`,
  `historic_contemporary`) et le dire comme une limite explicite.
- **Volume** : 40 segments × 3 axes, ~40 paires par personne × 70 personnes ≈ 2 800
  comparaisons. Agrégation Bradley–Terry ou TrueSkill → score latent + IC par (segment, axe).
- **Corrélation principale** : Spearman ρ entre score texte et score latent humain, par axe.
  Cible ρ ≥ .45, **avec son IC bootstrap** — au-delà de .7 sur ce type de données, se méfier.
- **Test de résolution** (le « at street-segment resolution » de la RQ) : recalculer ρ au niveau
  segment, puis rue nommée, puis dong. Si ρ ne se dégrade pas en agrégeant, la résolution
  segment n'apporte rien et il faut l'écrire.
- **Ablation par provenance** : ρ pour les rues à phrase `llm` (~22 %) vs templates commerçants
  vs Wikidata seul → répond au « from open **and** user-generated text ».
- **Baseline à battre**, sinon la contribution n'est pas lisible : (a) hasard, (b) attributs OSM
  seuls (type de voie, densité commerciale, part de chaînes), (c) CLIP zero-shot sur les mêmes
  photos. Le texte doit battre (b).

> **Chemin critique.** Cette annexe demande ~2 photos par segment sur 40 segments, soit ~80
> images. Tu en as 29 pour 20 rues (`out/mapillary_check/`, 22 orientées). La collecte photo est
> ce qui bloque RQ1, et elle ne dépend pas du code.

### 4.3 Qualitatif

- **Description libre avant affichage**, sur 3 des segments d'ancrage : « décrivez cette rue en
  une phrase, à voix haute. » Codage ouvert du vocabulaire spontané → c'est la méthode qui
  révèle les **axes manquants** (sécurité nocturne, ombre, bruit, pente, odeurs, présence de
  sièges). Souvent le retour le plus utile de toute l'étude pour la suite du projet.
- **Entretien ciblé sur les désaccords seulement** : sur les segments où R1 est bas, remonter la
  cause. Trois catégories à coder a priori : *mauvais attribut* / *bon attribut, mauvaise
  intensité* / *décalage temporel*.

---

## 5. RQ3 — Réconciliation de groupe (version simplifiée)

> *Which aggregation do groups accept as fair, and what do individuals give up to get there?*

**La simplification.** La v1 faisait marcher plusieurs agrégations. Ici, la comparaison entre
stratégies se joue **sur la carte, avant la marche** — et c'est légitime, parce que la variable
dépendante que nomme la RQ est *l'acceptation*, pas la satisfaction post-hoc. Le choix collectif
**est** la mesure.

**Trois parcours candidats**, non étiquetés, générés pour les profils réels du groupe :

| | Stratégie | Comportement |
|---|---|---|
| S1 | **Moyenne** | moyenne des vecteurs sur les axes actifs — efficace, peut abandonner un minoritaire |
| S2 | **Moindre misère** | maximise la satisfaction du membre le moins bien servi |
| S3 | **Tour de rôle** | chaque tiers du parcours honore l'axe prioritaire d'une personne — équité *visible* |

*(Spécification à trancher côté code : les membres n'ont pas les mêmes axes actifs à cause du
toggle* off *. Définir le vecteur de groupe sur l'**union** des axes actifs, pondérée par le
nombre de membres pour qui l'axe compte.)*

### 5.1 Quantitatif

**Étape carte — la mesure principale.**

- **Classement privé** des 3 parcours, sur son propre téléphone, **avant toute discussion**.
- Puis **choix collectif** après discussion.
- **Conformisme** = écart entre classement privé et choix collectif, par personne. C'est
  gratuit et ça révèle qui cède.

**Justice et acceptation** (1–7, en privé, après la marche puis après la révélation) :

| Code | Item |
|---|---|
| F1 | Ce parcours est juste envers tout le monde dans le groupe. |
| F2 | Mes préférences ont été prises en compte. |
| F3 | J'ai dû renoncer à ce que je voulais. |
| F4 | Ce parcours favorise quelqu'un en particulier. |
| F5 | Comparé à ma marche solo, celle-ci m'a convenu autant. |

F5 n'existe que grâce au plan fusionné : le participant a réellement marché son optimum.

**Sacrifice objectif — à calculer, jamais à demander :**

`Δ_i = align_i(marche solo) − align_i(marche de groupe)`

Et par stratégie, à l'étape carte, les métriques d'équité : **min_i u_i** · **écart max–min** ·
**Gini** · **Σ u_i** (efficacité). Le graphique central du papier : acceptation en ordonnée,
équité en abscisse, un point par stratégie.

**Les deux tests qui portent la contribution :**

1. **F3 (sacrifice perçu) vs Δ_i (sacrifice objectif)** — corrélation. Si elle est faible, la
   justice perçue ne suit pas la justice calculée, et le problème de conception se déplace : il
   ne s'agit pas de mieux agréger mais de **rendre visible** l'agrégation. Résultat de design,
   pas d'algorithme.
2. **Classement privé vs Δ_i à l'étape carte** — les gens classent-ils en tête le parcours qui
   les sert objectivement le mieux ? Si non, ils ne savent pas lire leur propre intérêt sur une
   carte, et toute l'interface de choix de groupe est à repenser. Conclusion nette dans les deux
   sens, n = 21.

**La révélation (min 43–50)** est le moment le plus informatif de la session : re-mesurer F1 et
F3 après avoir montré à chacun ce que les deux autres parcours lui auraient donné. Le
déplacement pré→post révélation mesure directement l'effet de la **transparence** sur la justice
perçue — sans condition supplémentaire.

**Recrutement stratifié.** Une pré-mesure des profils (à l'inscription, 5 min) permet de viser
la moitié des triades à **profils divergents**. Sur des groupes homogènes, les trois stratégies
produisent le même parcours et l'étude ne mesure rien. C'est le point le plus facile à rater.

**Analyse.** Modèles mixtes (individu niché dans triade) sur F1–F5 et Δ_i ; Wilcoxon apparié
pour le pré/post révélation. Le **choix collectif** (7 observations) est **descriptif** — on
rapporte des effectifs et la discussion, pas un test.

### 5.2 Qualitatif — c'est ici que porte le poids

Avec 7 groupes, le quantitatif de groupe est faible et le qualitatif est la contribution. Le
prévoir comme tel dès le départ, pas comme un supplément.

- **Enregistrement de la discussion de choix** → analyse interactionnelle : qui concède, comment
  la concession est justifiée (« toi tu marches plus », « la dernière fois c'était moi »), la
  justice est-elle invoquée explicitement, des règles de tour de rôle apparaissent-elles
  spontanément ?
- **Entretiens individuels séparés**, hors présence des amis. Personne ne dit « j'ai détesté »
  devant ses amis : sans cette séparation, la mesure de sacrifice s'effondre.
- **Typologie de ce qu'on cède** (codage) : un axe ? un lieu ? un rythme ? le rôle de celui qui
  décide ? Cette typologie est une contribution qualitative à part entière.
- Analyse thématique réflexive (Braun & Clarke), double codage d'un tiers du corpus.

### 5.3 La limite à écrire noir sur blanc

Une seule agrégation est marchée, et c'est celle que le groupe a choisie. On ne peut donc pas
comparer l'**expérience vécue** de deux stratégies, et la stratégie marchée est auto-sélectionnée.
Si les 7 groupes choisissent la même, la marche de groupe devient une condition unique — ce qui
est en soi un résultat (« les groupes convergent vers l'équité visible »), à condition de l'avoir
annoncé plutôt que subi.

---

## 6. RQ4 — Effet comportemental

> *Does personalized pedestrian navigation based on experiential criteria alter exploration
> behavior and the experience of walking, compared to traditional navigation apps?*

### 6.1 La référence « navigation traditionnelle » : la jambe de transit

Sans troisième marche, la comparaison n'existe que si on journalise un déplacement fait avec une
app de navigation ordinaire. La jambe de transit du début de session 1 le fait sans allonger le
terrain : le participant rejoint le point de départ (~10 min) avec **son** app habituelle
(Naver / Kakao / Google), l'app d'étude tournant en arrière-plan pour la trace.

**Asymétrie assumée, et à écrire** : c'est un trajet utilitaire, pas une promenade. La
comparaison porte donc sur *navigation dirigée vers une destination* vs *navigation
expérientielle* — ce qui est exactement le contraste que nomme la RQ, mais il faut le formuler
ainsi et ne pas prétendre à des conditions appariées en motivation. Les mesures d'expérience
sur cette jambe se limitent à 3 items ; les mesures **comportementales**, elles, sont
pleinement comparables.

### 6.2 Comportement (GPS + télémétrie, déjà collectables)

Tout se dérive de `gps_point` joint spatialement à `osm_network` — le schéma a été conçu pour ça.

| Famille | Mesure |
|---|---|
| Étendue | segments distincts · rues nommées distinctes (normalisés par la durée) |
| Écart au plus court | ratio de détour = longueur parcourue / distance géodésique origine→fin |
| Forme | sinuosité · virages non prescrits · blocs distincts traversés · aire de l'enveloppe convexe |
| Dispersion | entropie spatiale de la trace (cellules 50 m) |
| Retours | taux de re-parcours du même segment |
| Arrêts | nb et durée des arrêts > 20 s, **et score de vibe du segment où l'on s'arrête** |
| Tête levée | ratio écran allumé / durée de marche · nb de réveils d'écran — proxy fort de l'attention au monde, devrait être maximal sur la jambe de transit |
| Autonomie | marche terminée par l'utilisateur vs par le budget temps |

Deux précautions : exclure **à l'analyse, jamais à la collecte** les points d'`accuracy_m` > 30 m
(les ruelles de Jongno dégradent le GPS) ; normaliser toute mesure d'étendue par la durée, sinon
on mesure surtout qui marche vite.

### 6.3 Ce qui remplace le bras yoked

Sans troisième marche, « app » et « personnalisation » restent confondus. Une preuve
corrélationnelle, gratuite, le compense partiellement : **à travers les 21 participants,
l'ampleur de l'effet comportemental corrèle-t-elle avec `align_i` ?** Si ceux dont le parcours
correspondait mieux à leur profil ont plus exploré et plus apprécié, c'est un argument pour la
personnalisation *en tant que telle*, sans marche supplémentaire. Corrélationnel, donc à
présenter comme tel — mais bien plus fort que rien.

### 6.4 Expérience de la marche

Après la marche solo et après la marche de groupe (≤ 5 min, sinon attrition) :

- **Affect** : 3 items d'affect positif + 1 item de plaisir global (PANAS-court si tu veux
  l'ancrage).
- **Restauration** : PRS courte, sous-échelles *fascination* et *being-away* (4–6 items) —
  cohérent avec la posture contemplative de `choix-de-design.md`.
- **Découverte** : « j'ai vu des endroits que je n'aurais pas trouvés seul·e » · « j'ai eu envie
  de m'arrêter » · « je reviendrais dans ce quartier ».
- **Charge** : 2 items NASA-TLX (exigence mentale, frustration).
- **Recommandation** : 4 items ResQue (adéquation perçue, confiance, intention de réutilisation).

**Connaissance spatiale** — le secondaire le plus solide et le plus citable, puisqu'il rejoint la
littérature « le GPS dégrade l'apprentissage spatial » invoquée dans `choix-de-design.md §10` :

- **Croquis de mémoire** après chaque marche (5 min, papier), coté en aveugle : repères,
  segments, exactitude topologique. Deux codeurs, accord rapporté.
- **Tâche de pointage** depuis le point d'arrivée vers 3 repères connus → erreur angulaire
  absolue (°). 2 minutes, très robuste.
- **Rappel libre à J+1** par message : « citez tout ce dont vous vous souvenez de la marche
  d'hier » → nombre d'éléments distincts. Coût quasi nul, très discriminant.

### 6.5 Qualitatif

- **Entretien de rappel sur la trace** : rejouer la trace GPS sur la carte et remonter le fil —
  « pourquoi avoir tourné ici ? », « que se passait-il là ? ». C'est la méthode qui explique les
  chiffres du §6.2 ; sans elle, on a des courbes sans causes.
- **Photo-élicitation** : 3 photos par marche de « ce qui vous a arrêté·e » → relances
  d'entretien, codables, et elles illustrent le papier.

---

## 7. Ajouts à la télémétrie

Le schéma existant couvre presque tout. Les manques réels :

```sql
-- Bras, zone, appariement de groupe
ALTER TABLE session ADD COLUMN IF NOT EXISTS leg      VARCHAR(16);  -- 'transit'|'solo'|'group'
ALTER TABLE session ADD COLUMN IF NOT EXISTS zone_id  VARCHAR(12);

-- Réponses aux échelles, pour éviter un tableur parallèle qu'on finit par perdre
CREATE TABLE IF NOT EXISTS survey_response (
    id SERIAL PRIMARY KEY,
    session_id     INTEGER REFERENCES session(id) ON DELETE CASCADE,
    participant_id INTEGER REFERENCES participant(id) ON DELETE CASCADE,
    instrument VARCHAR(24),   -- 'recognition'|'fairness'|'prs'|'tlx'|'resque'
    item_code  VARCHAR(12),   -- 'R1'|'F3'|...
    phase      VARCHAR(12),   -- 'pre'|'post'|'reveal'  <- indispensable pour le pré/post révélation
    value      DOUBLE PRECISION,
    ts TIMESTAMPTZ DEFAULT NOW()
);

-- Quelle stratégie a produit quel parcours candidat (RQ3)
ALTER TABLE recommended_route ADD COLUMN IF NOT EXISTS strategy        VARCHAR(24);
ALTER TABLE recommended_route ADD COLUMN IF NOT EXISTS member_profiles JSONB;
ALTER TABLE recommended_route ADD COLUMN IF NOT EXISTS utility_by_member JSONB;  -- u_i pré-calculé
```

Et via `logEvent` (table `app_event` déjà générique, aucune migration) :

| `event_type` | Payload |
|---|---|
| `anchor_probe` | `{segment_id, value, lng, lat, t_since_start_s}` — sonde in-situ RQ1 |
| `screen_state` | `{on: true\|false}` → permet le ratio écran/marche |
| `private_rank` | `{order:[route_id,...]}` — classement privé avant discussion |
| `group_choice` | `{route_id, strategy, discussion_s}` |
| `reveal_shown` | `{route_id, member_utilities}` |
| `pairwise_choice` | `{axis, left_id, right_id, chosen, rt_ms}` — annexe en ligne |

---

## 8. Plan d'analyse et garde-fous

- **Un seul test principal par RQ**, figé avant collecte et pré-enregistré sur OSF (hypothèses,
  test, N, règle d'arrêt). RQ1 : écart apparié vs mal-apparié sur R1. RQ3 : F1 entre les trois
  stratégies au classement privé. RQ4 : segments distincts parcourus, marche solo vs jambe de
  transit. Tout le reste est secondaire et corrigé (Holm), ou exploratoire et étiqueté comme tel.
- **Non-paramétrique par défaut** (Friedman, Wilcoxon apparié) : N petit, échelles ordinales.
  Modèles mixtes pour tout ce qui est niché dans les triades.
- **Rapporter tailles d'effet et IC**, pas seulement les p. Avec N = 21, un résultat nul n'est
  pas une absence d'effet — l'écrire explicitement plutôt que le laisser entendre.
- **Pilote : une triade complète**, procédure entière, non analysée. Vérifie dans cet ordre de
  risque : (1) la précision GPS réelle en ruelle, (2) que le contrôle placebo de §4.1 fonctionne,
  (3) la traduction coréenne des items — puis rétro-traduction, (4) la durée réelle des deux
  sessions.
- **Menaces spécifiques à ce plan** : ordre solo→groupe fixe (§1) · stratégie marchée
  auto-sélectionnée (§5.3) · jambe de transit utilitaire vs marche de loisir (§6.1) · un seul
  quartier, une seule ville. À écrire comme limites, pas à masquer.

---

## 9. Arbitrages restants

1. **Triades ou dyades** — décidé par le recrutement, pas par la méthode (§1). À tester tout de
   suite : peux-tu réunir 7 trios d'amis non-résidents de Jongno, deux fois la même semaine ?
2. **La jambe de transit survit-elle ?** Si non, RQ4 devient descriptive et le titre doit perdre
   « compared to traditional navigation apps ».
3. **L'annexe en ligne survit-elle ?** Si non, RQ1 perd la partie « inferred from text » et se
   réduit à la reconnaissance. C'est encore une contribution, mais une autre.
4. **Les 3 axes retenus** pour l'annexe (§4.2) — à choisir d'après la couverture réelle du
   pipeline, pas d'après leur intérêt théorique.
5. **La collecte photo** (~80 images pour 40 segments) : chemin critique de RQ1, indépendant du
   code, à lancer maintenant.
6. **Le routing piéton**, toujours non implémenté (`CARNET-DE-BORD` §5 choix n°2) : sans lui, ni
   les parcours solo personnalisés ni les trois candidats de groupe n'existent. C'est le
   bloquant n°1 de toute l'étude.
