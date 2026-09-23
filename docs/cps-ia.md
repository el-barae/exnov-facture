# Générateur de CPS Word

L’espace **CPS IA**, dans la navigation et à `/cps`, produit un cahier des prescriptions spéciales à partir d’un logo et d’une description de travaux.

1. Importer le logo (PNG, JPG ou WebP, 12 Mo maximum). Il est facultatif, réduit en PNG dans le navigateur et conserve ses proportions et sa transparence.
2. Choisir une trame, ou laisser l’adaptation automatique : centre culturel, souk, établissement social ou locaux administratifs.
3. Décrire l’opération : objet, maître d’ouvrage, lieu, lots, ouvrages, matériaux, quantités, prix éventuels, délai et conditions particulières.
4. Cliquer sur **Générer mon CPS**. L’aperçu affiche le contenu du document. Une nouvelle consigne permet de **Modifier le CPS**, en transmettant le document courant au modèle.
5. Cliquer sur **Télécharger le CPS Word** pour obtenir un `.docx` éditable dans Word ou LibreOffice. Le logo peut être remplacé après la génération, sans nouvel appel IA.

Le Word contient une couverture, un sommaire avec liens internes, l’identification des parties, les clauses administratives et financières, les prescriptions techniques par lot, la description numérotée des ouvrages, le bordereau des prix, les informations à compléter et les cadres de signature. Les titres structurés permettent la navigation dans Word ; le sommaire est une liste de liens sans numéros de page. Les pages A4 disposent d’en-têtes et de compteurs. Les en-têtes du tableau des prix se répètent sur plusieurs pages. L’aperçu web montre le contenu ; la pagination est celle de Word/LibreOffice.

Les descriptions des ouvrages et les lignes du bordereau proviennent de la même liste, avec une numérotation déterministe. Les totaux sont calculés côté application avec `decimal.js` et arrondi au centime par ligne. Une quantité ou un prix absent ne vaut pas zéro : le montant et les totaux dépendants affichent **[À compléter]**. Le taux de TVA n’est pas présumé.

Les montants sont figés à l’export : si les chiffres sont ensuite modifiés directement dans Word, les totaux doivent être recalculés.

## Références fournies

`src/lib/cps-references.ts` contient les trames éditoriales tirées des quatre documents fournis : centre culturel Ahmed Boukmakh, souk Ghoujine, Dar Talib/Taliba Fahs Anjra et extension des locaux de la division contrôle/perception de Tanger. La structure des 45 articles administratifs communs et les familles de lots guident la rédaction. Les fichiers Word originaux ne sont pas requis au déploiement et ne sont pas copiés dans le dépôt. Ce n’est pas une reproduction intégrale des clauses des documents sources.

Ces références sont traitées comme des données, séparées des instructions. Le modèle reçoit l’instruction de ne pas reprendre les anciens noms, dates, montants ou textes juridiques comme des faits du nouveau marché. Les références réglementaires, conditions financières et caractéristiques non fournies doivent rester à compléter. Le résultat est un projet de CPS à relire et à valider par le responsable du dossier, avec une liste des éléments manquants ; la génération ne vérifie pas automatiquement le droit en vigueur.

## Configuration et limites

Les mêmes variables serveur que pour les rapports sont utilisées : `AWS_REGION`, `AWS_BEARER_TOKEN_BEDROCK`, `BEDROCK_MODEL_ID`. Aucune nouvelle clé n’est nécessaire et aucune clé n’est transmise au navigateur. Le modèle configuré doit prendre en charge les réponses JSON structurées et une sortie de 24 000 tokens. Voir [Rapports IA](rapports-ia.md) pour la configuration AWS et la protection de l’accès au déploiement.

La génération peut prendre plusieurs minutes. La route déclare une durée maximale de 300 secondes, avec un délai AWS de 270 secondes ; l’hébergement doit autoriser cette durée. Une réponse tronquée ou invalide est refusée et le document précédent est conservé. Pour un dossier très volumineux, demander d’abord une version concise puis enrichir les lots par révision, dans la limite de sortie du modèle. L’annulation interrompt l’attente et conserve la consigne et le document précédent ; elle ne garantit pas l’arrêt de la facturation d’une invocation déjà reçue par AWS.

Limites : prompt de 16 000 caractères ; 60 articles administratifs ; 24 lots de 20 articles ; 150 postes ; requêtes limitées à 3,5 Mo. Logo PNG normalisé de 700 Ko maximum. Les routes valident le schéma des textes et les caractéristiques du logo. Le contenu est échappé dans le Word, sans HTML incorporé, macros ni liens externes. Aucune dépendance supplémentaire n’est nécessaire : le package OOXML est assemblé avec `pizzip` déjà présent.

Le texte et le CPS courant sont transmis à AWS lors de la génération. Le logo reste dans le navigateur jusqu’à l’export Word, puis est traité en mémoire côté serveur. Aucun document n’est sauvegardé côté serveur. L’état survit au changement de service dans la page, mais pas à un rechargement : télécharger le Word avant de quitter.

## Vérification

`npm test` couvre la validation, les montants incomplets, les arrondis, les images, le Word, la séparation des instructions et les erreurs AWS simulées. Après `npm run build` et `npm run start`, lancer `npm run test:cps` pour vérifier le parcours navigateur et de vrais exports Word. `TEST_BASE_URL` permet de choisir un autre port.

Les tests navigateur simulent uniquement la génération IA, sans appel AWS payant. Les fichiers et captures sont dans `test-results/cps/`, ignoré par Git. Le Word peut aussi être ouvert ou converti avec LibreOffice pour vérifier le rendu ; LibreOffice n’est pas une dépendance de l’application.
