# Choix de design — IXLAB pedestrian app

> Journal des décisions de design et de leur justification.
> Format : **Décision → Pourquoi → Ancrage** (étude formative / littérature / question de recherche).
> But : servir de base à la section « Design » du papier. Règle d'or — chaque choix
> d'interface doit descendre *visiblement* d'une raison, pas d'un goût.

---

## 1. Personnalisation par *sliders de vibe* (et non par mots)
**Décision.** Recueillir les préférences via 6 axes de vibe continus dans [-1,+1],
plutôt que par description textuelle libre ou choix de mots-clés.
**Pourquoi.** L'étude formative comparait plusieurs modalités d'expression de préférence
(sliders / descriptions par mots / autre) ; les sliders l'ont emporté : effort faible,
expression de l'*intensité* d'une préférence, et surtout des valeurs *comparables et
agrégeables* entre plusieurs personnes — un axe numérique se moyenne, une phrase libre non.
C'est précisément ce qui rend la réconciliation de groupe *calculable* (RQ1).
**Ancrage.** Étude formative (modalités) · `realmap.jsx` (`rankByVibe`) · MEMORY.md.

## 2. « Ça m'est égal » géré par *exclusion*, pas par le milieu du curseur
**Décision.** L'indifférence sur un axe est un toggle `off` (l'axe sort du calcul),
distinct de la position centrale 0 du slider.
**Pourquoi.** Le milieu d'un curseur est ambigu : 0 peut vouloir dire « neutre, entre les
deux » *ou* « je m'en fiche ». Séparer l'*intensité* (la position) de la *pertinence*
(on/off) désambiguïse le profil individuel et nettoie l'agrégation de groupe : on ne moyenne
que les axes qui comptent réellement pour les gens.
**Ancrage.** MEMORY.md (repères de conception). *Micro-décision publiable en soi.*

## 3. Onboarding par *choix d'images* (swipe)
**Décision.** L'amorçage des préférences se fait en réagissant à des images (swipe),
plutôt qu'en choisissant des mots.
**Pourquoi.** Choisir une image est plus rapide, plus intuitif et moins coûteux
cognitivement que choisir des mots. C'est aussi *neutre linguistiquement* — crucial pour des
utilisateurs internationaux à Séoul, et pour éviter l'ambiguïté culturelle des mots de vibe.
Une photo de ruelle déclenche une réaction esthétique/affective directe, là où un mot abstrait
exige une traduction mentale.
**Ancrage.** `swipe.jsx`, `swipe-data.js`, `assets/photos/swipe/` · étude formative.
**Fil rouge visuel.** L'image traverse toute l'expérience : onboarding (swipe) → anticipation
en marche (POV street-level aux embranchements). L'app « parle en images » — candidat au
*geste signature*.

## 4. Représenter les rues par la *perception* et les *chemins préférés des locaux*
**Décision.** La carte représente les rues par leur *caractère vécu* et le signal
« aimée des locaux » (fil rouge), et non par catégorie commerciale ou hiérarchie routière.
**Pourquoi.** L'exploration porte sur la qualité *ressentie* d'un lieu, pas sur sa fonction.
Le « préféré des locaux » est un proxy d'authenticité / de valeur de découverte qu'une carte
de catégories de POI ne peut pas montrer. On distingue les vraies phrases d'ambiance
(`llm`, ~22 % des rues) des templates commerçants, avec un seuil de notoriété (Wikidata/Wikipédia).
**Ancrage.** Pipeline street-character · `brief-carte-rues-locaux.md` · skill street-character.

## 5. Cadre *social* : ajouter des amis, sortie de groupe
**Décision.** Permettre d'ajouter des amis et de composer une sortie à plusieurs ;
l'exploration est pensée comme sociale (solo / couple / groupe).
**Pourquoi.** Dans la vraie vie l'exploration est souvent sociale, et le cadre social change
à la fois la *motivation* (on explore plus, et autrement, à plusieurs) et le *problème de
design* (réconcilier des préférences). C'est le pilier qui génère RQ1 (réconciliation) et RQ2
(adaptation solo/couple/groupe) ; la présence d'amis est aussi un levier de motivation à
explorer (RQ3).
**Ancrage.** `group.jsx`, `social.jsx` · RQ1 / RQ2 / RQ3.

---

## Autres choix repérés (à valider / compléter)

## 6. Mode « Background » (flânerie ambiante) — *mode à part entière ET condition d'étude*
**Décision.** Offrir un mode non-dirigé (brume/radar, « wander freely ») en plus des modes
route dirigée (follow / modify).
**Pourquoi.** Soutient l'exploration libre *et* sert de manipulation propre pour l'étude :
même quartier, même profil, on ne fait varier qu'une chose (dirigé vs ambiant) et on observe
si le comportement change. Penser le Background comme *condition* et pas comme feature est le
bon réflexe méthodologique.
**Ancrage.** `map.jsx` (brume/radar) · MEMORY.md · RQ3.

## 7. Durée cible ~38 min — *soft target* personnalisable
**Décision.** Les parcours visent ~38 min, sans plafond dur.
**Pourquoi.** Chiffre *issu de l'user study* (durée moyenne déclarée avant de s'arrêter),
traité comme cible souple pour respecter l'autonomie et la fatigue réelle plutôt que comme
une contrainte. Bon exemple de « design ancré dans la donnée formative ».
**Ancrage.** MEMORY.md (faits user study) · logique de parcours `realmap.jsx`.

## 8. Proposer *plusieurs options* de parcours, pas l'itinéraire optimal unique
**Décision.** Le routeur propose des parcours distincts (« other options »), pas *le* chemin
optimal unique.
**Pourquoi.** Une app d'exploration ne doit pas être déterministe ; la variété et le choix
préservent l'agentivité et la re-visitabilité — à l'opposé du « one true route » des apps de
navigation. Cohérent avec la posture anti-navigation.
**Ancrage.** `realmap.jsx` (tirage RCL parmi les meilleurs candidats, dédoublonnage des routes).

## 9. Carte à *identité visuelle propre* (palette hanok) — un arbitrage assumé
**Décision.** Fond de carte stylé maison (MapLibre + palette hanok) plutôt qu'un rendu
Kakao/Google générique.
**Pourquoi.** L'esthétique fait partie de l'ambiance d'exploration (ton lent, contemplatif)
et rend le prototype reconnaissable. *Tension assumée* : ce choix se paie sur la qualité des
données de ruelles de Séoul (cf. arbitrage A/B/C du carnet) — à documenter comme un compromis
pesé, pas comme un impensé.
**Ancrage.** Design system · CARNET-DE-BORD §5.

## 10. *Sous-navigation* volontaire pendant la marche (piste à trancher)
**Décision (proposée).** Pendant la marche : localisation minimale et non-directive
(position + tracé mis en valeur, pas d'instructions turn-by-turn).
**Pourquoi.** Le guidage pas-à-pas supprime justement le comportement d'exploration qu'on
veut observer (littérature sur le GPS qui dégrade l'apprentissage spatial). « Sous-naviguer »
est la traduction en interface de la posture anti-navigation.
**Statut.** Discuté, pas encore implémenté.

---

## Fil conducteur
La plupart de ces choix descendent d'une même posture :
**cultiver une incertitude productive et l'engagement sensoriel, plutôt que minimiser
l'effort vers une destination.** C'est ce fil qui doit relier les décisions entre elles
dans le papier — chaque décision est une déclinaison locale de cette prise de position.
