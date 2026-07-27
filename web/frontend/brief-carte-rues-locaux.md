# Brief — carte « rues préférées des locaux » (fil rouge)

Données : `street-character-jongno.geojson` (pipeline street-character déjà généré,
ne pas re-scraper).

## Objectif
Créer une **NOUVELLE carte dans un nouveau fichier HTML** (ex.
`web/frontend/street-character-locaux-jongno.html`) — ne pas modifier
`street-character-jongno.html`. Cette carte affiche **uniquement** le « fil rouge » :
un tracé pointillé rouge sur les rues à vrai caractère (aimées des locaux), avec nom
+ description, lisible sur mobile. **Aucun autre tracé de rue n'est affiché** (pas de
couche par évidence, pas de tronçons template) — seulement le fond de carte + le fil rouge.

## Données — quoi garder
Ne PAS traiter toutes les rues décrites comme « aimées des locaux ». Distinguer :
- `description_source = "llm"` → vraie phrase d'ambiance = rues à caractère (à afficher).
- `description_source = "template"` → simple template commerçant (« N commerces… ») =
  PAS un signal local. Laisser dans la couche existante, hors fil rouge.
- `description_source = "none"` → rien.

## Filtrage du fil rouge (dans cet ordre)
1. **Partir des rues `llm` uniquement** (~75 tronçons).
2. **Retirer les non-rues** : escaliers, passerelles/데크, galeries souterraines/지하상가,
   pistes cyclables/자전거, couloirs de marché/통로. (Filtrer les noms contenant :
   계단, 데크, 통로, 지하상가, 자전거, 진출입.)
3. **Fusionner les sous-branches dans leur corridor parent** : un seul fil rouge +
   un seul label par corridor. Ex. 돈화문로 = 1 tracé (pas 돈화문로11가길 / 11나길 / 11다길
   séparés). Regrouper par le radical du nom avant le suffixe numérique (`\d+[가나다]?길`).
   → passe de ~70 à ~36 corridors.
4. **Couche headline mobile (~15–20 rues)** : afficher en priorité les corridors
   « connus des locaux » = adossés à Wikipédia/Wikidata (`wikidata` ou `wikipedia`
   non nul) OU `evidence = "both"` OU confiance élevée. Le reste des corridors
   n'apparaît qu'au zoom (ex. minzoom plus élevé).

## Rendu
- **Fond de carte seul + fil rouge** — ne PAS ajouter les couches `chr-line-pieton` /
  `chr-line-marchable` / casing de l'ancienne carte. La carte ne contient qu'une seule
  couche de tracés : le fil rouge.
- **Fil rouge pointillé** (`line-dasharray`, couleur rouge type `#c0392b`), fin et net.
- **Label = nom de la rue** le long du tracé (celui du corridor parent).

## Popup (au clic sur un fil rouge)
- Nom de la rue (corridor).
- La phrase d'ambiance `description` (+ `description_en` si dispo).
- Lien Wikipédia/Wikidata si présent.
- NE PAS afficher le bloc template commerçant sur cette couche.

## Comptage à afficher / garder en tête
- 1267 tronçons / 334 rues uniques au total.
- Par rue unique : 75 (22,5 %) `llm`, 211 (63,2 %) template seul, 48 (14,4 %) rien.
- Le « ~85 % avec description » est trompeur (dominé par les templates commerçants) :
  le vrai chiffre « rues à caractère » est ~22 %, ramené à ~15–20 après regroupement
  + seuil de notoriété. C'est ce chiffre qui doit correspondre aux « rues des locaux ».
