# SEO — ce qui ne va pas

Defect list only, French-first. Audited on production 2026-09-20.
Everything not listed here was checked and is fine.

**État au 2026-09-20.** §1, §2, §3, §5, §7 et §9 sont implémentés côté code
(back, front, manager, migration `1789800000000_shape_length_gender`);
`npm run check` passe dans les deux dépôts. Restent §4, §6, §8 et §10.

**La donnée est convertie, entièrement.** Le script
`product-copy-placeholder` de catalog source convertit trois choses : le
libellé de la puce en `$shape.title`, la forme attributive en `$shape.attributive` (celle
qu'emploie une phrase avec le pluriel de « ongles » : `Uñas almendradas`,
`Unhas quadradas`, `Amandelvormige nepnagels`, « ongles carrés »), et les
tournures déclarées dans `data-shape-rewrite.json` (`em formato amendoado`,
« en forme d'amande » dont l'élision casse sur « de carré », `Almond-shaped
nails`, les formulations thaïes). Sa détection est volontairement
inter-langues : la copie emprunte (« formato ballerina » en portugais,
« Unghie coffin » en italien, « rounded-square nagels » en néerlandais), et ne
vérifier chaque valeur que contre les mots de sa propre langue les ratait
toutes.

Les 68 valeurs qu'aucune substitution ne pouvait traiter ont été réécrites à
la main, dans les sept langues : celles dont la forme était le sujet de la
phrase (les adjectifs derrière s'accordent avec elle) et celles de cinq sets
dont la copie nommait une autre forme que leur dossier. Ce dernier cas est
précisément ce que le placeholder supprime : la classification qui fait foi
est le dossier, et la phrase n'a plus à nommer de forme du tout.

Bilan : **490 valeurs littérales, il en reste 0**, sur 110 sets et 7 langues.
Le script sort en `1` tant qu'il en reste une, donc une régression ne peut plus
passer inaperçue.

Les accords sont posés aussi : **180 valeurs** portent leurs marqueurs
`$g{masculin|féminin}` en français, espagnol, italien et portugais, écrits à la
main. Les phrases construites sur `$shape.attributive` après « ongles » /
« uñas » / « nagels » n'en ont pas besoin, l'accord tombant sur ce nom porteur.
L'anglais et le néerlandais ne marquent pas ces mots, le thaï ne marque rien.

Rien n'atteint le site avant un import (`npm run library -- seed --update`,
autorisation explicite requise).

---

## 1. Deux descriptions différentes pour la même URL

`seoDocument.ts` (back, SSR) sert `item.desc` brut. `productSeoDescription`
(front, `utils/productSeo.ts`) construit `desc` + occasion + formes + couleurs
+ `t.product.seoDescSuffix`, et `Seo.tsx` écrase la balise servie à
l'hydratation. Le crawler reçoit une chaîne, la page en affiche une autre.

**Fix** — une seule fonction d'assemblage, appelée par les deux rendus de
`/creations/*`. C'est elle qui portera aussi l'enrichissement du §3.

---

## 2. Le mot de forme est figé dans un champ partagé par plusieurs formes

`desc.fr` commence par la forme : « **Amande** brillante violette, ponctuée… ».
Or le modèle porte plusieurs formes par set (`products.shape`, `product_shapes`,
`photosByShapeLength`, et le sélecteur de forme de `ProductPage`). Le jour où un
set existe en amande **et** en ballerine, la même phrase affirme « Amande » sur
les deux — description fausse, et balise `<meta>` fausse.

Dans la bibliothèque actuelle chaque set n'a qu'une forme
(`product/library/*/modal/<shape>/`), donc le défaut est latent, pas encore
visible. Il se déclenche au premier set multi-formes.

**Fix — placeholders résolus au rendu.**

Le générateur écrit `$shape.title` (et `$length.title` quand la longueur est nommée) au lieu
du mot littéral ; le rendu substitue la forme courante — celle choisie dans le
sélecteur côté front, la forme canonique (première clé, même convention que
`firstPhotoUrl`) côté SSR et pour la balise `<meta>`.

```
Stocké   $shape.title brillante violette, ponctuée d'ongles lavande ornés de fleurs
         violettes et de strass argentés.
Rendu    Amande brillante violette, ponctuée d'ongles lavande ornés de fleurs
         violettes et de strass argentés.
```

La syntaxe `$…` est déjà celle de `data-common.json` (`$medium`, `$long`,
`$short`) : même convention, rien de nouveau à apprendre. Le label localisé de
la forme vient de `data-common.json` / `shapes.label`, donc la substitution
marche dans les sept langues sans retraduire le champ.

**Le vocabulaire de formes doit porter son genre.** « $shape.title brillante » ne
marche pas avec « stiletto ». L'accord ne peut pas être deviné à la
substitution ni contourné par une tournure neutre imposée au prompt : le genre
est une propriété du mot, et il change d'une langue à l'autre (« amande » est
féminin en français, `almond` n'a pas de genre en anglais, « mandorla » est
féminin en italien, « amandelvorm » est de genre commun en néerlandais). Il se
déclare donc à côté du label, par langue, dans le vocabulaire de formes
(`data-common.json` / `shapes.label`), et la substitution accorde ce qui suit.
Même chose pour les longueurs.

`alt` contient lui aussi le mot de forme (« Pieces en forme d'amande ») et
suit la même règle.

---

## 3. La description ne nomme jamais le produit — à corriger sur `/creations`, pas en base

`products."desc"`, généré par `prepare-library.mjs` (prompt ~l.1346, règles de
champ l.1362). Exemple live `EZ-TY-739` :

> Amande brillante violette, ponctuée d'ongles lavande ornés de fleurs
> violettes et de strass argentés.

Aucune occurrence de « pieces », « press-on » ou « capsules » : 77 meta
descriptions qui ne contiennent pas le nom du produit. (Le champ `alt`, lui, dit
bien « Pieces en forme d'amande » — c'est `desc` le seul champ qui ne le
fait pas.) Et ~100–115 caractères pour ~155 de largeur SERP utile : un tiers du
snippet jeté.

**Fix — l'enrichissement se fait au rendu de `/creations/*`, le champ stocké
reste propre.** `desc` est partagé avec les cartes de la galerie : y injecter le
terme commercial polluerait l'UI. L'assemblage du §1 préfixe donc le nom du
produit et la forme courante sur les pages créations uniquement :

```
Stocké      $shape.title brillante violette, ponctuée d'ongles lavande ornés de
            fleurs violettes et de strass argentés.
Galerie     Amande brillante violette, ponctuée d'ongles lavande ornés de
            fleurs violettes et de strass argentés.
/creations  Pieces artisanales amande : brillante violette, ponctuée d'ongles
            lavande ornés de fleurs violettes et de strass argentés. Set
            réutilisable peint main. (≈ 165 car.)
```

Alterner les amorces (« Pieces artisanales … », « Capsules press-on … ») pour
que 77 snippets ne commencent pas par les mêmes mots, et couper à ~165 car.

> À vérifier : `/fr/gallery` est aujourd'hui servie en `index, follow` et
> présente dans `sitemap.xml` — seules les variantes filtrées `/gallery?` sont
> en `Disallow`. Si l'intention est qu'elle ne soit pas indexée, c'est un écart
> à corriger à part ; la règle ci-dessus (enrichir `/creations` seulement) tient
> dans les deux cas.

---

## 4. Une phrase + un prix = page mince, ×539 URLs

`desc` sert simultanément de meta description, de `Product.description` JSON-LD
**et** d'unique paragraphe de la page (`ProductPage.tsx:312`, `<article>` du
SSR).

**Fix** — `desc-long`, nouveau `PartialTrilingual` nullable, 70–110 mots, pour
le corps de page uniquement. Trois paragraphes : (1) le set en un coup d'œil —
forme(s), longueur, finition, couleurs, groupes de décor ; (2) la fabrication —
technique visible sur la photo, atelier ; (3) le port — occasion, formes et
longueurs disponibles, tailles, ce qui est livré avec. Mêmes placeholders
`$shape.title`/`$length.title` qu'au §2.

Contrainte dure : **aucune phrase identique d'un set à l'autre.** Toute ligne
fixe (« Livré avec son kit de pose… ») va dans le template de page, hors du
champ, sinon 77 pages partagent un paragraphe et c'est du boilerplate.

Faits utilisables sans rien inventer : `data-static.json` (prix, formes /
longueurs / tailles dispo), `data-common.json` (vocabulaire forme et longueur),
les photos, les codes occasion/couleur déjà produits. Rien d'autre. Interdictions
actuelles conservées telles quelles : pas d'adresse au lecteur, pas de
vouvoiement, aucun motif inventé (`product-copy-style.mjs`).

Rendu : `desc` reste en meta/OG ; `desc-long` alimente le corps
(`seoDocument.ts` et `ProductPage.tsx:312`) et `Product.description` quand il
existe. Migration : une colonne jsonb nullable, même forme que `alt`
(`1787370000000_product_alt.js` est le précédent).

---

## 5. Le `<title>` produit ne porte aucun terme de recherche

`Rayures dorées 3D · Shop` — le nom du set seul ne peut ranker que
sur lui-même.

**Fix** — ajouter le terme au rendu, pas en base (le titre affiché reste joli) :

```
{titre} — pieces artisanales {$shape.title} · Shop
→ Rayures dorées 3D — pieces artisanales stiletto · Shop
```

Deux endroits, deux lignes : `productSeoDocument` et le `fullTitle` de
`Seo.tsx`. Sous ~60 car. ; si ça déborde, le mot de forme saute en premier.
En page, `<h1>` reste le nom du set (il doit correspondre à ce que le visiteur
voit), un `<h2>` porte le terme : « Pieces artisanales stiletto longs, faits
main ».

---

## 6. Zéro page de catégorie

`robots.txt` interdit `/gallery?` et rien ne le remplace : toute la dimension
facette du catalogue est invisible. C'est le plus gros trou de couverture —
tout le mid-tail français n'a aucune URL (*pieces amande*, *mariage*,
*courts*, *rouges*, *french*).

**Fix** — des familles d'URL rendues par le relais qui sert déjà `/gallery`
(`gallerySeoDocument` est le gabarit à généraliser), **dans les sept langues**,
et **entièrement dérivées de la base** : aucune liste de slugs écrite à la main
nulle part, sinon elle diverge du catalogue au premier set importé.

| Famille | Source | Slug |
| --- | --- | --- |
| Forme | `shapes` (clé + label par langue) | slugifié depuis le label de la langue |
| Longueur | `shape_lengths` | idem |
| Couleur | `colors` | idem |
| Occasion | `products.occasion`, valeurs distinctes | idem |

C'est exactement ce que `listFilterOptions` (`filterOptionsQuery.ts`) calcule
déjà pour les filtres de la galerie : le jeu d'URL de catégorie est la même
requête, plus un slug. L'occasion reste du texte libre par set, dédupliqué comme
aujourd'hui ; ce qu'il lui faut en plus est un slug stable et réversible
(slugification du label, collision résolue par suffixe), pas un vocabulaire
figé. Une occasion qui disparaît de la base fait disparaître sa page — c'est le
comportement voulu.

Chaque page : `<h1>` avec le terme, **120–200 mots d'intro par catégorie et par
langue**, la grille des sets en vraies ancres, un bloc FAQ de 3–4 questions, une
rangée de liens vers les catégories sœurs. JSON-LD `CollectionPage` + `ItemList`
+ `BreadcrumbList`, motif déjà présent dans `gallerySeoDocument`. `hreflang`
entre les sept versions d'une même catégorie, comme partout ailleurs.

L'intro est le seul contenu qui ne se dérive pas de la base. Elle s'écrit donc
par catégorie existante au moment où la catégorie franchit le seuil ci-dessous,
et le rendu ne publie que les catégories qui en ont une.

**Règle de seuil** — publier une catégorie à partir de 5 sets ; en dessous,
`noindex` et hors sitemap, piloté par le compte, pas à la main. Les familles
couleur et occasion seront creuses au début : la règle les allume toute seule
quand le catalogue grossit.

---

## 7. Les pages produit ne lient que vers `/gallery`

Une seule ancre sortante dans l'`<article>` SSR. Le crawler reçoit une liste
plate de 77 sans aucun regroupement thématique.

**Fix** — 6–8 ancres « sets similaires » (même occasion, même forme, même
couleur dominante) + liens vers les catégories du §6 + vers `/sizes` et
`/pose`. C'est le gain le moins cher du lot.

---

## 8. Aucun contenu informationnel

Le site ne répond qu'à « je veux acheter des pieces ». Les questions
posées en amont — et celles que les moteurs de réponse citent — n'ont pas de
page.

**Fix** — `/<lang>/conseils/<slug>`, 700–1200 mots, rédigé en français puis
traduit dans les sept langues comme le reste des pages statiques :

1. Combien de temps tiennent des pieces artisanales ?
2. Comment enlever ses pieces sans abîmer l'ongle naturel
3. Pieces réutilisables : combien de fois peut-on les reporter ?
4. Quelle forme d'ongle choisir selon sa main ?
5. Press-on, gel ou capsules en salon : que choisir ?
6. Bien préparer ses ongles avant la pose
7. Pieces pour un mariage : longueur, forme et tenue

Contenu statique sans dépendance catalogue : entre dans `PRERENDERED_PATHS` et
le prerender existant, même chemin que `/pose` et `/sizes`. JSON-LD `Article` +
`FAQPage` (le helper FAQ existe dans `pageSeo.ts`). Chaque article lie vers 3–5
catégories du §6 — sinon ce sont sept pages orphelines. `/capsules` devient le
hub de la famille forme.

---

## 9. Le titre de `/home` rate le terme principal

« Pieces faits main » n'a pas *press-on*, qui est pourtant le terme le
plus recherché et déjà présent dans `homeDesc`.

**Fix** — « Pieces artisanales faits main en France », et vérifier que le
`<h1>` porte le terme aussi.

---

## 10. `Offer` incomplet

Les balises OG `product:price:amount` / `product:price:currency` (plus
`product:availability`) manquaient : posées, ce sont des faits déjà connus de
la page.

`priceValidUntil`, `hasMerchantReturnPolicy` et `shippingDetails` restent
absentes, délibérément. Search Console les réclame, mais aucune des trois n'est
un fait que le code peut lire :

- `priceValidUntil` demanderait une date de fin que la table des prix ne porte
  pas. Inventer une date, c'est déclarer faux.
- `hasMerchantReturnPolicy` est une déclaration juridique. Les CGV distinguent
  trois cas (erreur de notre fait, demande motivée à la charge du client, sets
  sur mesure non repris) et posent que le changement d'avis n'est pas un motif
  de retour, pour raison d'hygiène. Aucune des catégories schema.org ne dit
  cela telle quelle, et choisir `MerchantReturnNotPermitted` engagerait la
  boutique sur un point de droit de la vente à distance. C'est une décision à
  prendre avec les CGV sous les yeux, pas un balisage à deviner.
- `shippingDetails` dépend du panier (transporteur choisi, franco de port), pas
  du produit : une valeur par set serait fausse la moitié du temps.

---

## 11. Pas d'`AggregateRating` faute d'avis réels

`AggregateRating` est le seul rich result qui bouge visiblement le CTR d'une
boutique, et il manque. `entry-server.tsx` explique déjà, à raison, pourquoi le
markup ne doit pas précéder les avis : des étoiles non adossées à de vrais avis
collectés valent une action manuelle. Le déblocage passe donc par des avis
réels, stockés et affichés — pas par du markup.

---

## Ordre

| # | Chantier |
| --- | --- |
| P0 | §1 — unifier les deux descriptions, une fonction d'assemblage |
| P1 | §2 placeholders `$shape.title` · §3 enrichissement sur `/creations` · §5 titre · §7 liens internes |
| P2 | §4 `desc-long` · §6 catégories + vocabulaire occasion (migration) |
| P3 | §8 cluster `/fr/conseils/*` |
| P4 | §10 `Offer` · §11 avis (gated sur des avis réels) |

Mesure : Search Console sur les 539 (combien réellement indexées, pas
soumises), position sur « pieces artisanales » et sur une requête mid-tail par
famille et par langue, pages catégorie segmentées des pages produit.
