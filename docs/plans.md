# Atelier Plans 2D

Ouvrir **Plans 2D** dans la navigation, ou `/plans` une fois connecté. **Nouveau plan** ouvre un dessin vide ; **Exemple** crée un petit logement modifiable. Les autres plans restent disponibles dans **Mes plans**.

## Dessiner et modifier

Toutes les coordonnées, longueurs et épaisseurs sont en **mètres**. Les coordonnées X augmentent vers la droite et Y vers le bas dans l’éditeur.

- **Mur (W)** : deux clics pour ses extrémités ; régler l’épaisseur dans les propriétés (0,20 m par défaut).
- **Ligne (L)**, **rectangle (R)** et **cercle (C)** : deux clics, respectivement les extrémités, les coins opposés ou le centre puis le rayon.
- **Porte (O)** et **fenêtre (F)** : régler la largeur dans la bibliothèque, puis cliquer sur un mur. L’ouverture découpe réellement le mur et suit ses déplacements. Ses propriétés permettent de régler la largeur et la position sur le mur, et d’inverser le sens d’une porte.
- **Cote (D)** : cliquer les deux extrémités d’un mur pour le coter automatiquement, ou sélectionner un mur et utiliser **Coter ce mur**. Ces cotes suivent les déplacements et changements de longueur du mur. Le décalage est réglable ; **Détacher la cote** en fait une mesure indépendante. Deux points libres créent une cote indépendante.
- **Pièce (P)** : cliquer les sommets du contour intérieur, puis **Entrée**, double-clic ou **Terminer la pièce**. Au moins trois sommets sont nécessaires ; les contours croisés sont refusés. Saisir le nom avant le tracé ou dans les propriétés. La surface se calcule automatiquement en m². Un rectangle existant peut être **converti en pièce**.
- **Symbole (B)** : choisir lit, canapé, table, lavabo, WC, escalier ou flèche du nord dans la bibliothèque, puis cliquer dans le dessin. Taille et rotation se règlent dans les propriétés.
- **Texte (T)** : saisir l’annotation dans les propriétés, puis cliquer pour la placer.
- **Sélection (V)** : cliquer un objet pour éditer ses coordonnées ; glisser pour le déplacer. Suppr efface la sélection.
- **Main (H)** : glisser pour déplacer la vue. La molette zoome au curseur ; les boutons +/− et « Cadrer le plan » ajustent aussi la vue.

L’**aimant de 10 cm** aligne les points sur la grille, même si celle-ci est masquée. **Ortho**, ou Maj pendant un tracé de segment, impose une direction horizontale ou verticale. Échap abandonne le tracé en cours. **Ctrl/Cmd + Z** annule ; **Ctrl/Cmd + Maj + Z** ou **Ctrl/Cmd + Y** rétablit. L’historique garde les 50 dernières modifications du plan ouvert et est réinitialisé au changement de plan.

Les boutons **Outils** et **Panneaux** masquent les colonnes latérales pour agrandir la zone de dessin. Les titres **Propriétés**, **Bibliothèque**, **Surfaces des pièces** et **Calques** permettent aussi de replier chaque panneau. Les libellés de l’atelier ont une taille minimale de 12 px.

Le panneau **Surfaces des pièces** liste les surfaces et leur somme. Les contours sont indépendants des murs : déplacer un mur ne redessine pas une pièce. Modifier les sommets de la pièce actualise son aire ; dessiner des contours intérieurs distincts évite le double comptage. Les pièces masquées sont incluses dans le total, avec une indication dans la liste.

Supprimer un mur supprime aussi ses ouvertures et cotes liées, en une étape annulable. Une modification est refusée si elle toucherait un objet dépendant verrouillé ou masqué. Une ouverture plus large que son mur est refusée ; sa position est limitée pour qu’elle reste entièrement sur le mur.

Les **calques** regroupent les objets et contrôlent leur couleur, leur visibilité et leur verrouillage. Les objets masqués ou verrouillés ne peuvent pas être modifiés. Choisir un calque visible et déverrouillé avant de dessiner.

## Sauvegarde et fichiers

En mode équipe, les brouillons de **Mes plans** restent en mémoire et sont effacés au rechargement ou au changement de compte. **Enregistrer dans ce projet** conserve un JSON modifiable dans Drive, lié au dossier Neon ; exporter le JSON permet aussi de garder une copie personnelle.

En démonstration, les plans sont enregistrés automatiquement dans `localStorage` (`exnov.plans.v1.document.<id>` et `exnov.plans.v1.active`). Ils sont propres à ce navigateur, sans synchronisation serveur ni séparation entre les comptes de démonstration. Si un autre onglet a modifié le même plan, la sauvegarde refuse d’écraser sa version : exportez les changements locaux en JSON, puis rechargez et réimportez la copie pour conserver les deux versions. En cas de stockage inaccessible ou plein, l’interface indique l’échec ; exporter le plan en JSON avant de fermer l’onglet.

- **JSON** : sauvegarde complète avec objets et calques, à conserver ou transférer. **Importer JSON** ouvre toujours une nouvelle copie sans remplacer un dessin existant.
- **PDF à l’échelle** : formats A4/A3, portrait/paysage et échelles 1:20, 1:50, 1:100, 1:200, 1:500. Le cartouche EXNOV contient le plan, le projet, le client, la référence, l’auteur, la date et l’échelle. Depuis un projet, ses informations sont préremplies. Le dessin conserve une échelle physique exacte (1 m = 10 mm au 1:100). Si la feuille est trop petite, choisir un autre format ou une échelle plus petite : aucun ajustement automatique n’est appliqué. Imprimer à **100 % / taille réelle**, sans ajustement à la page.
- **SVG** : dessin vectoriel des calques visibles sur fond blanc.
- **DXF** : géométrie 2D en mètres pour un logiciel CAO. Les cotes sont exportées comme traits et texte, les murs comme contours. L’axe Y est inversé à l’export pour préserver l’orientation dans les logiciels CAO.

Cette première version couvre le dessin 2D simple ; elle ne lit pas les fichiers DWG/DXF, ne produit pas de modèle 3D et ne réalise pas de calcul structurel. Les ouvertures et cotes peuvent être liées à un mur ; les pièces restent des contours explicites. Les liaisons éditables sont conservées en JSON, tandis que PDF/SVG/DXF contiennent leur représentation géométrique.

Les imports sont validés : version 1, références de calques et identifiants cohérents, nombres finis, au plus 5 Mo, 5 000 objets et 32 calques. Les fichiers incorrects laissent le plan courant intact.

## Enregistrer dans un projet

Depuis l’étape **CPS & plans**, **Créer un plan 2D** ouvre un dessin au nom du projet. **Enregistrer dans ce projet** ajoute par défaut un **JSON modifiable**. Le sélecteur de format permet aussi d’ajouter un **DXF** des calques visibles. Depuis l’atelier indépendant, choisir d’abord le projet destinataire. Un nouveau plan vide ne peut pas être joint.

Dans **Projets**, ajouter un JSON exporté par Plans 2D sous la catégorie **Plans**, puis cliquer **Modifier dans Plans 2D**. Le même bouton figure dans les pièces de l’étape CPS & plans. Le fichier est validé avant ouverture (5 Mo maximum). Les autres JSON, DXF et PDF restent téléchargeables.

L’atelier affiche le projet et le nom du document lié. **Enregistrer les modifications dans ce projet** remplace le contenu du JSON existant, avec le même identifiant et sans doublon ; l’activité du dossier est mise à jour. **Voir le projet** revient à ce dossier. Les brouillons sont séparés par document et par projet, même si plusieurs fichiers contiennent le même identifiant de plan. Le lien de l’atelier permet de rouvrir le document enregistré après un rechargement.

La sauvegarde automatique dans **Mes plans** est limitée à la session en équipe et au navigateur en démonstration ; elle ne remplace pas l’enregistrement explicite dans le projet. Au rechargement du lien, la version enregistrée dans le projet est ouverte. Si le JSON a été modifié dans un autre onglet, l’enregistrement refuse d’écraser sa nouvelle version. **Recharger la version du projet** ouvre cette version (Annuler retrouve le tracé précédent) ; **Enregistrer une copie JSON** conserve une pièce distincte. Un fichier supprimé n’est jamais recréé implicitement. Nouveau plan, Exemple et Importer JSON ouvrent un dessin indépendant du document précédemment lié.

## Assistant IA

En mode équipe, l’assistant est réservé aux administrateurs, gérants/chefs de projets et techniciens Pro. Le technicien standard peut dessiner et enregistrer ses plans manuellement. Un technicien modifie directement seulement les fichiers qu’il a déposés ; il peut enregistrer une nouvelle copie d’un autre plan. Les droits sont contrôlés côté serveur.

Le bouton **Assistant IA** ouvre une conversation pour créer un plan ou modifier le dessin courant à partir d’une consigne en français. Préciser les dimensions en mètres et les pièces attendues, par exemple : « Dessine un studio de 6 m sur 4 m avec un séjour et une salle d’eau ». Sélectionner un objet avant d’envoyer une demande permet de le désigner dans la conversation.

L’assistant présente un aperçu et une explication. **Appliquer au plan** remplace le contenu du plan ouvert et enregistre une seule étape dans l’historique : **Annuler** et **Rétablir** restent disponibles. **Ignorer la proposition** conserve le dessin. Une demande ambiguë peut recevoir une question de précision sans modification. Une erreur ou une annulation laisse le plan intact ; la consigne reste disponible pour réessayer. Les réponses arrivant après une annulation, une fermeture ou un changement de plan ne sont pas appliquées. Une proposition devient inapplicable si le dessin a changé depuis son envoi : relancer la demande avec le plan actualisé.

L’assistant connaît les ouvertures liées aux murs, les cotes liées, les contours de pièces et les symboles de la bibliothèque. Les objets des calques masqués ou verrouillés et les ouvertures de leurs murs sont protégés. L’assistant accepte des plans d’au plus **200 objets** ; cette limite concerne l’IA, tandis que l’éditeur et les imports conservent leur limite de **5 000 objets**. Les propositions restent des dessins 2D à vérifier : l’assistant ne réalise pas de calcul structurel.

Les demandes passent par `/api/plans/generate` et le fournisseur Amazon Bedrock déjà utilisé par l’application. Configurer côté serveur `AWS_REGION`, `AWS_BEARER_TOKEN_BEDROCK` et, pour choisir un autre modèle compatible, `BEDROCK_MODEL_ID`. Aucun identifiant fournisseur n’est envoyé au navigateur. À chaque envoi, la consigne, l’historique récent de conversation, le plan courant (y compris ses calques et annotations) et l’identifiant de l’objet sélectionné sont transmis au service IA. Les plans suivent les règles de conservation décrites ci-dessus ; la conversation est temporaire et repart à zéro en changeant de plan ou en fermant l’assistant.

`npm run test:plans-ai`, avec le serveur démarré, vérifie le parcours de l’assistant avec des réponses simulées : aucun appel IA réel n’est effectué. Le test couvre les propositions, l’application et l’historique, les clarifications, les erreurs, les annulations, les modifications concurrentes, les calques protégés et l’affichage mobile. `TEST_BASE_URL` permet de choisir l’adresse du serveur.

## Vérification

`npm run test:project-plans` vérifie le parcours Projets → Plans → mise à jour JSON, les conflits, les erreurs de stockage et les brouillons séparés.

`npm test` couvre la géométrie, les relations architecturales, les surfaces, les protections de calques, la validation et les exports. `npm run test:plans-architecture` vérifie les ouvertures, les cotes liées, les pièces, les symboles, les panneaux repliables et le téléchargement PDF réel dans le navigateur. `npm run test:plans`, avec le serveur démarré, teste les interactions réelles, la sauvegarde, les imports/exports et l’affichage mobile. `TEST_BASE_URL` permet de choisir une autre adresse que `http://localhost:3000`.
