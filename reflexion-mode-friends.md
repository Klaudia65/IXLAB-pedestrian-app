# Réflexion — mode *friends* : représenter les préférences, et choisir quand il n'y a pas d'overlap

> Note de travail, 13 août 2026. Lue sur le code réel : `group.jsx`, `social.jsx`,
> `theme.jsx` (`mergeTasteVectors`, `activeJoiningFriends`), `realmap.jsx`
> (`mergeTargetWithGroup`, `rankByVibe`).
> Deux questions posées : (1) comment représenter les préférences de chacun —
> garder les bandes ou simplifier avec couleurs/boutons ? (2) les deux choix
> « chacun place un arrêt » / « compromis au milieu » sont-ils déjà possibles, et
> suffit-il de les rendre plus clairs ?
> Réponse courte : **non, un seul des deux existe, et l'autre ne peut pas exister
> au niveau où l'écran travaille aujourd'hui.** Détail ci-dessous.

---

## Partie 1 — Diagnostic de l'écran actuel

### 1.1 Le point bloquant : la réconciliation ne change rien au résultat

C'est le problème à régler avant toute question d'esthétique.

Dans `group.jsx`, l'état `nudges` n'est lu qu'à deux endroits : le rendu de la
barre (`AxisRow`) et le compteur du badge (`openCount`). Le vecteur qui produit
réellement les rues est calculé indépendamment :

```js
const groupVec = React.useMemo(
  () => window.mergeTasteVectors(people.map(p => p.vec)), [data]);   // ← pas de `nudges`
```

Et la carte fait la même chose de son côté (`mergeTargetWithGroup` dans
`realmap.jsx`) : moyenne des vecteurs bruts, sans jamais consulter l'état de
négociation.

Conséquence : on peut appuyer sur **tous** les boutons `Nudge X →` sans déplacer
une seule rue dans la liste ni sur la carte. L'écran de réconciliation est un
théâtre — il raconte une négociation qui n'a aucun effet en aval.

Pourquoi c'est grave au-delà de l'UI : la RQ1 mesure *ce que les individus
abandonnent pour arriver à un accord*. Si l'accord ne modifie pas le parcours, la
concession est nulle par construction et il n'y a rien à mesurer. Le geste doit
avoir des conséquences pour que la mesure existe.

**À faire :** `groupVec` doit être calculé à partir des plages **effectives**
(post-nudge), pas des vecteurs bruts — et la même valeur doit alimenter la carte,
via un vecteur de groupe publié une seule fois (`window.groupTarget()`) que
`realmap.jsx` consomme au lieu de refaire sa propre moyenne.

### 1.2 L'« overlap » affiché est une conséquence d'une constante, pas d'une préférence

```js
const BAND = 0.14;   // demi-largeur fabriquée autour du point de chacun
```

Le profil d'une personne est un **point** par axe. Pour réutiliser une logique
d'intersection d'intervalles, on lui fabrique une tolérance de ±0,14. Donc le
nombre de conflits annoncés (« 2 need a nudge ») est réglable par une constante
arbitraire : à 0,25 le groupe est presque toujours d'accord, à 0,05 presque
jamais. Ce n'est pas défendable dans le papier tel quel.

Deux sorties possibles :

- **assumer** `BAND` comme une tolérance implicite uniforme, et la justifier
  (calibrée sur l'étude formative — quel écart de goût les gens acceptent) ;
- **mieux : la faire déclarer par l'utilisateur.** La brique existe déjà à moitié.
  La décision #2 de `choix-de-design.md` (« ça m'est égal » par exclusion) crée
  déjà deux niveaux, et le code les traite déjà correctement : un axe absent
  reçoit `[0,1]`, soit une flexibilité totale (`group.jsx` l. 67). Il suffit
  d'ajouter un troisième niveau pour obtenir une largeur de bande *signifiante* :

  | niveau déclaré | largeur de bande | sens en négociation |
  |---|---|---|
  | ça m'est égal (toggle off) | pleine largeur `[0,1]` | je ne bloque jamais |
  | j'ai une préférence | ±BAND | je peux bouger |
  | non-négociable | ±0,04 | je ne bouge pas sur cet axe |

  Bénéfices en chaîne : la bande devient une donnée et non un artefact ; le veto
  devient lisible et *borné* (un axe, pas un droit de blocage global) ; et la
  concession devient mesurable proprement (a-t-on bougé sur un axe déclaré
  important, ou sur un axe indifférent ? ce n'est pas la même perte).
  Coût : une interaction de plus dans les sliders. Ça vaut le coup.

### 1.3 Lisibilité : c'est un graphe d'analyste, pas une interface de sortie

Sur un axe : 3 barres de 4 px empilées avec 7 px de décalage, dans 34 px de
hauteur, plus une bande d'accord de 16 px, plus un marqueur losange, plus un
label `OVERLAP` en 8,5 px — sur un téléphone, à six axes, en marchant. Et pour
décoder tout ça il faut faire l'aller-retour avec **deux** légendes (une par
personne, une pour le losange).

Deux détails à corriger même si on garde ce langage :

- l'outlier est rendu à `opacity: 0.45`, ce qui se lit « désactivé / ignoré »
  plutôt que « en désaccord » ;
- `OVERLAP` en 8,5 px est illisible et n'apporte rien : la bande *est* déjà
  l'overlap.

### 1.4 Le `Nudge` est unilatéral, et il fabrique un consentement

Le libellé actuel : **`Nudge Anna →`**, puis après clic **« Anna met the group
halfway »**. Or Anna n'a rien fait — j'ai appuyé sur un bouton depuis mon
téléphone et l'app a écrit qu'elle avait cédé.

Deux problèmes distincts :

- **méthodologique** : si l'app affirme un accord qui n'a pas eu lieu, un
  questionnaire de fairness perçue mesure un artefact de l'interface, pas une
  réconciliation.
- **de cadrage** : « il y a un outlier, et l'outlier doit céder » désigne un
  coupable. C'est un parti pris fort, et ce n'est probablement pas celui qu'on
  veut pour une app d'exploration entre amis.

Correctif de cadrage, sans changer une ligne de maths : nommer l'action côté
**groupe** et non côté personne — `Se retrouver au milieu` plutôt que
`Nudge Anna`, et « le groupe s'est retrouvé au milieu » plutôt que « Anna met the
group halfway ». Même si le calcul déplace surtout une personne, l'interface ne
la désigne pas. (Version plus ambitieuse, si le protocole le permet : le nudge
est une *proposition* qui n'est appliquée qu'après confirmation sur le téléphone
de la personne concernée. Ça rend l'accord réel — et mesurable.)

### 1.5 `group.jsx` et `social.jsx` se recouvrent

Les deux écrans affichent les mêmes avatars, le même blend et la même liste de
rues classées. `social.jsx` ne garde en propre que le toggle solo/friends et les
chips de dérive (`↗ local`). À terme : un seul écran « qui vient + ce que ça
change », et `group.jsx` réservé à la négociation.

---

## Partie 2 — Question 1 : garder les bandes, ou simplifier ?

**Ni l'un ni l'autre. Deux niveaux de lecture, et un changement d'encodage.**

### 2.1 Le changement à faire : l'avatar sur l'axe, à la place de la couleur + légende

Le vrai coût cognitif de l'écran n'est pas le nombre de traits, c'est le
**décodage** : chaque couleur doit être traduite en personne via une légende, six
fois de suite. Or il existe un encodage qui ne demande aucune traduction : mettre
**l'avatar de la personne à sa position sur l'axe**.

```
   quiet ●─────────────────────────────────────────────● lively
              (K)  (M)              ▓▓▓▓▓▓ ← zone d'accord
                                          (A)
```

- zéro légende : l'avatar se nomme lui-même ;
- ça scale de 1 à ~5 personnes (au-delà : empilement `+3`), donc le même
  composant sert le mode solo, couple et groupe → cohérent avec la RQ2 ;
- ça survit au daltonisme, et ça libère les couleurs du DS pour ce qu'elles
  disent vraiment (état de l'axe), au lieu de les dépenser à identifier des gens.

Sur les couleurs par personne : `FRIEND_HUES` contient 6 teintes qui entrent en
collision avec la sémantique du design system — `#8A5BFF` (iris) est déjà
*outing-couple*, `#B84BFF` (mauve) est *outing-friends*. Une même teinte veut
donc dire deux choses selon l'endroit. Argument de plus pour ne pas faire porter
l'identité par la couleur.

### 2.2 Niveau 1 (par défaut) — une ligne par axe, trois états, un mot

Ce qu'on voit en ouvrant l'écran :

```
┌──────────────────────────────────────────────────────┐
│  ● quiet ↔ lively                    d'accord        │
│    ───(K)(M)(A)▓▓▓▓───────────────────────           │
├──────────────────────────────────────────────────────┤
│  ● touristy ↔ local                  à trancher      │
│    ───(K)(M)────────────────◇──────(A)────           │
├──────────────────────────────────────────────────────┤
│  ○ historic ↔ contemporary           ça vous est égal│
└──────────────────────────────────────────────────────┘
```

Trois états seulement, avec les couleurs DS déjà en place :

| état | couleur DS | mot | ce qu'on voit |
|---|---|---|---|
| terrain d'entente | `match` lime `#C9FF46` | « d'accord » | la zone où tout le monde tient |
| à trancher | `alert` orchid `#D238EB` | « à trancher » | le point de rencontre proposé (◇) |
| arbitré | `safe` mint `#A6FFE8` | « réglé » | la zone après décision |
| indifférent | `line` (gris) | « ça vous est égal » | ligne éteinte, repliée |

Les axes où personne n'a d'avis sont **repliés** en bas : aujourd'hui ils
occupent la même place visuelle qu'un vrai conflit alors qu'ils ne demandent
rien.

### 2.3 Niveau 2 (au tap) — le détail actuel

Les bandes par personne, l'intersection calculée, le point de rencontre, et
l'action. **Rien à jeter du travail existant** : il descend d'un niveau. C'est là
que va le monde de la personne curieuse (et c'est ce qu'on montre en démo /
capture pour le papier), pas dans le chemin par défaut.

---

## Partie 3 — Question 2 : les deux choix quand il n'y a pas d'overlap

### 3.1 Ce qui existe, ce qui n'existe pas

| option | statut dans le code |
|---|---|
| **compromis au milieu** | ✅ existe — c'est exactement `reconcile()` : la plage de l'outlier est étendue jusqu'au milieu de ce sur quoi les autres s'accordent. Mais **sans effet en aval** (cf. 1.1). |
| **chacun place au moins un arrêt** | ❌ n'existe nulle part. Aucun arrêt n'a de propriétaire dans le code : les rues sortent d'un `rankByVibe(vecteur moyen)` unique, il n'y a pas de notion de « cet arrêt-là est le choix d'Anna ». |

Donc l'impression que « ces choix sont déjà possibles » est vraie à moitié. Il ne
s'agit pas de clarifier deux options existantes, mais de rendre l'une réellement
opérante et de construire l'autre.

### 3.2 Pourquoi la deuxième option ne peut pas vivre au même endroit que la première

C'est le point qui tranche aussi la question de portée (voir 3.3), donc il mérite
d'être posé nettement. **Les deux stratégies n'opèrent pas sur le même objet.**

- **Le compromis opère sur les axes.** Résultat : tout le monde marche dans une
  version tiède de son goût, en permanence. Personne n'est furieux, personne
  n'est comblé. C'est l'*Additive Utilitarian / Average* de Masthoff (2004) —
  et c'est ce que le code fait déjà partout, y compris en solo→groupe via
  `mergeTasteVectors`.

- **La contribution opère sur les arrêts.** Résultat : chacun a un moment 100 %
  à son goût, et accepte les moments des autres. Personne n'est tiède ; tout le
  monde a un pic et des creux. C'est la stratégie *Fairness* explicite de Barile
  et al. (2023), et le tour de rôle séquentiel de Masthoff (2004).

L'aplatissement est donc *structurel*, pas un réglage d'intensité : dans un cas
la balade est uniformément moyenne, dans l'autre elle est une succession de
moments forts. Et c'est précisément pour ça qu'une balade est un bon terrain :
Masthoff montre que les humains ne raisonnent pas de la même façon sur un item
unique et sur une **séquence** — un parcours à N arrêts est une séquence, un
restaurant ne l'est pas. C'est là que ce projet a quelque chose à dire que la
littérature group-recsys n'a pas déjà dit.

### 3.3 Portée : global, et ce n'est pas un choix libre

La question était : le groupe choisit-il la stratégie une fois pour la sortie, ou
axe par axe ? La réponse tombe de 3.2 : **un choix par axe ne peut pas exprimer
« chacun place un arrêt »**, puisque cette stratégie ne parle pas d'axes. La
portée est imposée par la nature des deux options.

Donc :

- **choix global**, un seul écran, deux boutons, une fois par sortie ;
- **le nudge par axe survit à l'intérieur du mode compromis**, comme réglage
  fin — il n'est pas perdu, il est subordonné.

Deux raisons de plus, qui vont dans le même sens : sur téléphone, en sortie, on
ne prend pas six micro-décisions ; et côté étude, si chaque groupe fabrique son
propre mélange des deux stratégies, il n'y a plus de condition comparable entre
groupes — or c'est la variable indépendante de la RQ1.

### 3.4 Quand proposer le choix

Pas axe par axe. Un seul déclenchement, au niveau de la sortie :

- **au moins un axe sans terrain d'entente** → l'écran de choix apparaît ;
- **aucun conflit** → on saute l'écran : « vous êtes alignés sur tout — on y
  va ». Ne pas faire délibérer un groupe qui est d'accord.

Conséquence à anticiper pour le protocole : les groupes très alignés ne
traverseront pas la condition. Il faudra soit recruter du désaccord (apparier des
profils distants), soit forcer l'écran en condition expérimentale.

### 3.5 L'écran proposé

```
┌──────────────────────────────────────────────────────┐
│  Vous n'êtes pas d'accord sur 2 choses               │
│  touristy ↔ local · quiet ↔ lively                   │
│                                                      │
│  Comment vous décidez ce soir ?                      │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  Se retrouver au milieu                        │  │
│  │  Un parcours entre vos goûts. Personne n'a      │  │
│  │  tout, tout le monde s'y retrouve un peu.       │  │
│  │  ────(K)(M)──▓▓▓──(A)────                      │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  Chacun son arrêt                              │  │
│  │  3 arrêts, un par personne. Le tien est         │  │
│  │  totalement à ton goût ; les autres t'emmènent  │  │
│  │  ailleurs.                                      │  │
│  │  (K)→ ● ── (M)→ ● ── (A)→ ●                    │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Vous pourrez changer en marchant.                   │
└──────────────────────────────────────────────────────┘
```

Trois principes dans ce libellé :

1. **la conséquence, pas le mécanisme.** « Personne n'a tout » / « le tien est
   totalement à ton goût » — on ne dit ni « moyenne » ni « aggregation »,
   l'utilisateur ne choisit pas un algorithme, il choisit une soirée ;
2. **la contrepartie est dite.** Chaque carte dit ce qu'on gagne *et* ce qu'on
   perd. C'est ce qui rend le choix informé, donc la fairness perçue
   interprétable ;
3. **la miniature encode la différence** : une zone commune contre trois pics
   attribués. Elle rejoue exactement le langage visuel de la partie 2.

### 3.6 Ce qu'il faut construire pour « chacun son arrêt »

Ce n'est pas une couche d'affichage, c'est une donnée nouvelle :

- **`owner` par arrêt.** Chaque arrêt du parcours porte un `participant_id`.
- **une passe de sélection à tour de rôle.** Pour chaque personne, dans un ordre
  donné, `rankByVibe(vecteur individuel)` → son meilleur arrêt encore
  disponible, exclu du pool pour les suivants. Le code est presque là :
  `rankByVibe` est déjà appelable avec n'importe quel vecteur, il suffit de
  l'appeler N fois avec les vecteurs individuels au lieu d'une fois avec la
  moyenne.
- **une contrainte de marche.** Les N arrêts doivent former un parcours
  raisonnable (~38 min, décision #7) — donc la sélection n'est pas « le meilleur
  arrêt » mais « le meilleur arrêt à portée du parcours en cours ». C'est la vraie
  difficulté technique de cette option.
- **l'attribution visible en marchant.** « Arrêt 2 · le choix d'Anna » sur la
  carte et dans le fil du parcours. Sans ça la stratégie n'est pas perçue, donc
  elle ne peut pas être jugée équitable — et sur ce point le mode devient
  intéressant socialement : il donne à chacun un moment où il *montre* quelque
  chose aux autres.

### 3.7 Une troisième option — à ne pas ajouter maintenant

Le réflexe suivant sera « et éviter ce que quelqu'un détesterait ? » (least
misery, PolyLens). Recommandation : **ne pas en faire un troisième bouton.** Deux
raisons : trois conditions pour une seule RQ, c'est un plan d'étude qui triple ;
et surtout le least-misery est mieux exprimé comme **contrainte** que comme
stratégie — c'est exactement ce que fait le niveau « non-négociable » de 1.2, qui
s'applique *dans les deux modes*. Un veto borné à un axe, plutôt qu'une troisième
philosophie de décision.

---

## Partie 4 — Ce que ça change pour la mesure (RQ1)

Le dispositif devient mesurable dès que 1.1 est corrigé, et les deux stratégies
produisent des profils de perte **différents par construction** — donc il y a une
hypothèse à tester, pas seulement une préférence à recueillir :

| | compromis | chacun son arrêt |
|---|---|---|
| perte individuelle moyenne | modérée | modérée (probablement comparable) |
| **variance** de la perte le long du parcours | faible | **forte** |
| ce que ça devrait donner | consensus perçu haut, satisfaction tiède | satisfaction plus haute, fairness perçue moins stable |

Hypothèse : à perte moyenne égale, la **distribution** de la perte change le
jugement d'équité. La perte est calculable exactement — l'utilité de `rankByVibe`
pour le vecteur individuel *i* sur le parcours retenu, comparée à son parcours
solo optimal — donc on peut poser le score de fairness perçue *à côté* d'un
chiffre de concession réel. D'après la note de références, c'est justement ce
couplage (métrique formelle de perte + questionnaire de fairness, sur une tâche
de parcours, avec de vrais groupes existants) qu'aucune des six références ne
fait. Le garder comme cible.

Instruments à réutiliser (cf. `group-reconciliation-measurement-references.md`) :
les 3 items de Barile et al. (fairness / consensus / satisfaction) × le
découpage soi / l'autre / le groupe de Lee et al.

---

## Partie 5 — Ordre de travail proposé

1. **Brancher la réconciliation sur le résultat** (1.1). Sans ça, tout le reste
   est décoratif. Un seul vecteur de groupe publié, consommé par `group.jsx` et
   `realmap.jsx`.
2. **Recadrer le libellé du nudge** côté groupe (1.4). Deux chaînes de caractères,
   effet de cadrage important.
3. **Simplifier la ligne d'axe** : avatars sur l'axe, trois états, axes
   indifférents repliés, détail au tap (partie 2).
4. **Ajouter l'écran de choix global** à deux options (3.5), déclenché par ≥1
   conflit.
5. **Construire « chacun son arrêt »** : `owner` par arrêt, sélection à tour de
   rôle sous contrainte de parcours, attribution visible (3.6).
6. **Troisième niveau de préférence** (« non-négociable ») dans les sliders (1.2)
   — utile aux deux modes, et c'est ce qui rend `BAND` défendable dans le papier.
7. Fusionner `social.jsx` et l'en-tête de `group.jsx` (1.5).

Les points 1 à 4 sont petits et se font sur l'existant. Le 5 est le vrai chantier
— et c'est celui qui porte la contribution.

---

## Entrées candidates pour `choix-de-design.md`

*(rédigées au format Décision → Pourquoi → Ancrage du journal)*

### 11. Deux stratégies de réconciliation *nommées*, choisies par le groupe

**Décision.** Quand les goûts ne se recouvrent pas, le groupe choisit
explicitement entre *se retrouver au milieu* (compromis sur les axes) et *chacun
son arrêt* (contribution garantie sur la séquence), une fois pour la sortie.
**Pourquoi.** Les deux stratégies n'opèrent pas sur le même objet — l'une aplatit
les goûts en continu, l'autre les alterne — et produisent donc des profils de
concession structurellement différents à perte moyenne comparable. Les rendre
explicites et mutuellement exclusives transforme la réconciliation en variable
manipulable (RQ1) au lieu d'un réglage caché, et rend le choix lisible pour
l'utilisateur, qui choisit une soirée et non un algorithme.
**Ancrage.** Masthoff (2004) — taxonomie average / fairness, et le résultat clé
sur les *séquences* ; Barile et al. (2023) — stratégie *Fairness* explicite et
échelle fairness/consensus/satisfaction ; `group.jsx`, `realmap.jsx`.

### 12. Identifier les personnes par l'*avatar sur l'axe*, pas par la couleur

**Décision.** Sur les axes de préférence partagés, chaque personne est
représentée par son avatar posé à sa position, et non par une couleur renvoyant à
une légende. Les couleurs du DS sont réservées à l'*état* de l'axe (accord / à
trancher / réglé).
**Pourquoi.** Un encodage par couleur impose un décodage via légende, six fois
par écran, et ne scale pas au-delà de 3–4 personnes ; il entre aussi en collision
avec la sémantique de teintes déjà prise par le design system (iris = couple,
mauve = friends). L'avatar se nomme lui-même : coût de décodage nul, robuste au
daltonisme, et le même composant sert les modes solo, couple et groupe (RQ2).
**Ancrage.** `group.jsx` (`FRIEND_HUES` vs `tokens/colors.css`) · RQ2.

### 13. Trois niveaux de préférence, dont un *non-négociable* borné

**Décision.** Sur chaque axe : « ça m'est égal » / « j'ai une préférence » /
« non-négociable ». La largeur de la plage de tolérance découle du niveau déclaré.
**Pourquoi.** Prolonge la décision #2 (indifférence par exclusion) : au lieu
d'une tolérance uniforme fabriquée par une constante, la flexibilité devient une
donnée déclarée — ce qui rend le taux de conflit affiché défendable, distingue une
concession sur un axe important d'une concession sur un axe indifférent (mesure
de la RQ1), et exprime le *least misery* comme une contrainte bornée à un axe
plutôt que comme une troisième stratégie de décision.
**Ancrage.** `choix-de-design.md` #2 · `group.jsx` (`BAND`) · O'Connor et al.
(2001) pour le least-misery.
