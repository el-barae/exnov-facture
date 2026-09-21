# Préparer ou modifier le modèle dans Microsoft Word

Le fichier `templates/facture-exnov.docx` est **déjà prêt**. Pour garder la répétition du pied de page et le remplacement automatique des PNG, il est préférable d’éditer une copie de ce fichier, puis de la remettre au même chemin. Le fichier original fourni n’a pas été modifié.

Activez **Accueil → ¶** pour voir les paragraphes, puis **Disposition du tableau → Afficher le quadrillage**. Les balises sont du texte ordinaire, entre accolades simples ; n’insérez pas de champ de fusion Word. Saisissez chaque balise d’un seul geste, sans retour à la ligne à l’intérieur. Désactivez le suivi des modifications et acceptez les révisions avant d’enregistrer en `.docx`.

## Champs en dehors du tableau

| Emplacement | Texte à saisir dans Word |
| --- | --- |
| Numéro, en haut à gauche | `FACTURE Nº {numero}` |
| Date, juste en dessous | `DATE {date}` |
| Sous le mot POUR | `{destinataire}` |
| Référence client | `{#reference}` dans un paragraphe seul, puis `REFERENCE: {reference}`, puis `{/reference}` dans un paragraphe seul |
| Première ligne fusionnée du tableau | `{projet}` |
| Paragraphe sous les totaux | `Arrêté la présente facture à la somme de :` |
| Montant en lettres, paragraphe suivant | `{montantEnLettres}.` |

Conservez « Nous vous remercions de votre confiance » et « Signature » comme textes fixes. La balise `{montantEnLettres}` **contient déjà Dirhams et, si nécessaire, les centimes**. N’ajoutez pas « Dirhams » après elle. Vous pouvez réunir les deux paragraphes en `Arrêté la présente facture à la somme de : {montantEnLettres}.` si vous souhaitez abandonner la disposition sur deux lignes du modèle.

La référence vide (y compris des espaces seuls) supprime son paragraphe entier. La case « Afficher TOTAL A PAYER », cochée par défaut, commande uniquement la ligne de total du document ; les calculs et le montant en lettres restent identiques.

La date arrive déjà au format `jj/mm/aaaa`, le destinataire en majuscules et les montants au format `11 000,00`. Word ne réalise aucun calcul supplémentaire.

## Ligne de prestations répétée

Dans votre fichier original, conservez **une seule ligne de prestation exemple** sous les six intitulés de colonnes. Supprimez les autres prestations d’exemple, sans supprimer les lignes de totaux. Remplacez le contenu des six cellules par :

| N° Prix | Désignation des prestations | Unité | Quantité | Prix unitaire en Dirhams hors TVA | Prix Total |
| --- | --- | --- | --- | --- | --- |
| `{#lignes}{numeroPrix}` | `{designation}` | `{unite}` | `{quantite}` | `{prixUnitaire}` | `{prixTotal}{/lignes}` |

Les marqueurs **`{#lignes}` et `{/lignes}` appartiennent à la même ligne de tableau mais à des cellules différentes**. Docxtemplater répète la ligne entière pour chaque prestation. N’utilisez pas la balise seule `{lignes}` : il s’agit d’une liste, qui nécessite une boucle. Les retours à la ligne dans la désignation sont conservés.

## Totaux et retenues conditionnelles

Conservez les cinq premières colonnes fusionnées pour le libellé, et la dernière cellule pour le montant :

| Cellule de libellé fusionnée | Dernière cellule |
| --- | --- |
| `MONTANT TOTAL HT:` | `{totalHT}` |
| `MONTANT TVA (TAUX = {tauxTVA} %)` | `{tva}` |
| `MONTANT TOTAL TTC` | `{ttc}` |
| `{#appliquerRasIS}A DEDUIRE RAS IS {tauxRasIS}% DU MONTANT TOTAL HT` | `{rasIS}{/appliquerRasIS}` |
| `{#appliquerRasTVA}A DEDUIRE RAS TVA {tauxRasTVA}% DU MONTANT DE LA T.V.A` | `{rasTVA}{/appliquerRasTVA}` |
| `{#afficherTotalAPayer}TOTAL A PAYER` | `{totalAPayer}{/afficherTotalAPayer}` |

Les conditions suivent le même principe que la boucle : ouverture dans la première cellule et fermeture dans la dernière. Ainsi la **ligne entière disparaît** lorsque la case est décochée. Les valeurs `{rasIS}` et `{rasTVA}` incluent déjà le signe moins ; n’en ajoutez pas dans Word.

## Société, en-tête et pied de page

Le modèle fourni possède un en-tête et un pied de page Word répétés, avec ces champs alimentés par `src/config/company.ts` :

| Zone | Balises |
| --- | --- |
| Nom et activité | `{societe}` — `{activite}` |
| Sous-titres | `{sousTitre1}`, `{sousTitre2}`, `{sousTitre3}` |
| Raison sociale du pied de page | `{piedDePage}` |
| Contacts | `{telephone}`, `{email}`, `{site}` |
| Identifiants | `N° RC: {rc}`, `N° ICE: {ice}`, `N° TP: {tp}`, `N° RIB: {rib}` |

Si vous repartez du document original, son faux pied de page est un ensemble d’objets ancrés dans le corps et ses identifiants sont intégrés dans des images. Supprimez ces anciens objets et reconstruisez cette zone dans **Insertion → Pied de page** avec les textes et balises ci-dessus. Sinon, les anciennes mentions risquent de rester visibles et le pied ne se répétera pas. Le modèle préparé résout déjà ce problème.

Les PNG du modèle livré ont des relations fixes vers `word/media/exnov-logo.png` et `word/media/exnov-watermark.png`. Le serveur remplace ces fichiers à chaque export. Pour changer les images, remplacez les PNG dans `public/`, **pas les objets image dans Word**. Word peut renommer les médias après une modification importante : si vous reconstruisez vous-même l’en-tête, vérifiez les chemins internes et adaptez `src/lib/server/word.ts`. Les images remplacées dans un modèle arbitraire ne sont pas découvertes automatiquement.

## Mise en page et pagination

- Format A4 ; marges latérales de 10,8 mm ; zone supérieure réservée à l’en-tête ; zone inférieure réservée au pied de page.
- Conservez le tableau en largeur fixe et les largeurs de colonnes originales. Évitez « Ajuster automatiquement au contenu ».
- Sélectionnez les deux premières lignes (projet et titres de colonnes) puis **Répéter les lignes d’en-tête**.
- Dans les propriétés des lignes de prestation, évitez une hauteur « Exactement » : utilisez « Au moins », afin que les textes longs restent visibles.
- Conservez les paragraphes solidaires dans les totaux et la clôture pour limiter les ruptures au milieu des sommes.
- Les fontes du modèle livré sont **Carlito** et **Noto Sans**, livrées dans `public/fonts/`.

Après modification, lancer `npm test` puis exporter l’exemple et une facture longue avec `npm run test:e2e`. Une modification de mise en page dans Word ne modifie pas automatiquement le HTML/PDF : répercuter les changements souhaités dans `src/lib/document/styles.ts` et `html.ts`.
