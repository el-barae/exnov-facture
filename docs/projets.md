# Suivi des projets de génie civil

Ouvrir **Projets** dans la navigation ou directement `/projets`.

## Créer et retrouver une mission

**Nouveau projet** demande le nom de la mission et le maître d’ouvrage. La localisation et la référence sont facultatives. Le menu à gauche conserve les projets créés, permet de rechercher par nom, client, référence ou site, et de filtrer les projets en cours ou terminés. Aucun projet fictif n’est ajouté automatiquement.

À la création, choisir si le chiffrage BDP fait partie de la mission. Le volet **Documents requis par étape** permet d’adapter les justificatifs aux besoins réels. Une note de calcul, par exemple, peut être rendue facultative. Après la première validation, le parcours et ses exigences sont verrouillés ; reprendre la première étape permet de les modifier. Le nom, le client, le site et la référence restent modifiables.

## Workflow

| Étape | Pièces obligatoires par défaut |
| --- | --- |
| Accord & devis | Devis accepté |
| Visite du site | Aucune ; photos facultatives |
| Diagnostic | Rapport de diagnostic |
| Chiffrage BDP, si applicable | BDP validé ; BDP estimatif facultatif |
| Études techniques | Note de calcul |
| CPS & plans | CPS **et** plans, deux catégories distinctes |
| Validation du MO | Accord ou PV de validation du maître d’ouvrage |
| Facturation | Facture |
| Clôture du projet | Confirmation de la fin de la mission |

Les neuf cartes se consultent par groupes de trois avec les flèches ou les indicateurs sous le parcours. Le groupe de l’étape en cours est affiché à l’ouverture du projet. Sur mobile, les trois cartes du groupe sont empilées. Le chiffrage BDP reste affiché comme non applicable s’il est exclu de la mission ; huit validations suffisent alors.

- **Jaune** : étape actuelle. Un clic la valide si les pièces requises sont déjà présentes. Sinon, une fenêtre indique les pièces manquantes ; les joindre puis cliquer sur **Valider l’étape**.
- **Vert** : étape validée. Un clic permet de consulter sa date et ses documents.
- **Gris** : étape à venir. Ses documents peuvent être préparés, mais la validation reste bloquée tant que les étapes précédentes ne sont pas terminées.
- **Non applicable** : chiffrage exclu du périmètre. Cette étape ne compte pas dans le pourcentage.

La carte **Clôture du projet** ouvre une fenêtre avec le bouton **Valider la fin du projet**. La facturation seule ne termine plus le dossier : cette dernière validation est nécessaire pour atteindre 100 %, y compris pour les dossiers déjà arrivés à la facturation avant cet ajout.

La validation signifie que l’utilisateur confirme l’avancement. L’application vérifie la présence des fichiers dans la bonne catégorie ; elle n’analyse pas leur contenu et ne certifie pas leur conformité technique. L’étape Facturation suit l’émission de la facture, sans attester son paiement. Le suivi ne gère pas les échéances de facturation intermédiaires.

## Tâches et étapes en mode équipe

Chaque tâche appartient toujours à un projet. Sur une carte d’étape, l’administrateur ou le gérant clique sur **Ajouter une tâche** : le formulaire s’ouvre dans une fenêtre avec le projet et l’étape déjà renseignés. Il choisit le collaborateur, les consignes et l’échéance éventuelle.

Le compteur de chaque carte ouvre les tâches de cette étape. Les responsables peuvent les modifier ou les déplacer vers une autre étape ; les techniciens y actualisent leur propre avancement et déposent leur travail. Le lien **Tâches sans étape** donne accès aux anciennes tâches générales et permet de les rattacher. Il n’y a plus de panneau séparé « Tâches du projet ».

Plusieurs tâches peuvent être menées en parallèle, y compris sur des étapes différentes ; terminer une tâche ne valide pas automatiquement l’étape du workflow.

Seules les étapes du parcours sont proposées. Pour retirer le chiffrage BDP du parcours, il faut d’abord rattacher ses tâches à une autre étape ou les rendre générales.

## Documents et corrections

La section **Documents du projet** permet de joindre des pièces avant leur étape. Choisir la bonne catégorie : le workflow réutilise les fichiers déjà enregistrés et ne les redemande pas. Les ateliers proposent aussi **Enregistrer dans ce projet** : le fichier généré est ajouté directement au dossier, dans sa catégorie, sans téléchargement ni ajout manuel.

Les fenêtres **Accord & devis**, **Diagnostic**, **CPS & plans** et **Facturation** proposent un bouton **Générer** ouvrant l’atelier correspondant avec le projet destinataire sélectionné :

- **Facture et devis** : client, référence et intitulé préremplis ; enregistrement en **PDF**.
- **Rapport IA** : demande préremplie avec le nom, le client, le site et la référence ; enregistrement du rapport généré en **PDF**. L’exemple de mise en page reste réservé au téléchargement.
- **CPS IA** : même contexte dans la demande ; enregistrement en **Word modifiable**.
- **Plan 2D** : nouveau dessin au nom du projet ; enregistrement en **JSON modifiable** par défaut, ou en **DXF** avec les calques visibles. Les documents Plans au format JSON proposent **Modifier dans Plans 2D**, puis **Enregistrer les modifications dans ce projet** met à jour le même document. **Voir le projet** revient au dossier d’origine. Les brouillons de plans sont séparés par document.

Le bouton **Voir le projet** revient au bon dossier, même si un autre projet a été sélectionné entre-temps. Depuis un atelier ouvert indépendamment, choisir le **Projet destinataire** avant d’enregistrer ; ce choix rattache le document courant sans en modifier le contenu. **Ouvrir sans projet** retrouve le brouillon de l’atelier indépendant.

L’enregistrement ajoute une pièce et une entrée d’historique, sans valider l’étape. Un devis doit toujours être accepté avant de confirmer l’étape Accord & devis. Enregistrer une version corrigée ajoute un nouveau fichier ; les versions précédentes restent disponibles.

Les brouillons des ateliers restent séparés par projet pendant la session. Changer de dossier puis revenir restaure la saisie ; les brouillons de facture, de rapport et de CPS disparaissent au rechargement ou à la déconnexion. Les fichiers déjà enregistrés dans les projets restent conservés. En mode équipe, les plans non enregistrés dans un projet restent eux aussi limités à la session. En mode démonstration, la bibliothèque de plans est sauvegardée dans le navigateur.

La destination est fixée au clic sur Enregistrer. Si l’utilisateur change de dossier pendant la génération, le fichier rejoint le dossier d’origine. Un échec de génération ou de stockage affiche une erreur et n’ajoute aucune pièce incomplète. Les ajouts concurrents conservent les autres modifications du dossier.

Formats acceptés : PDF, DOC/DOCX, XLS/XLSX, CSV, PNG/JPG/JPEG/WebP, DWG/DXF, JSON et ZIP. Les JSON de catégorie **Plans** sont validés et limités à **5 Mo**. Limites pour les autres pièces : **20 Mo par fichier**, **200 documents par projet**, sous réserve de l’espace de stockage disponible. Les fichiers vides ou de format non pris en charge sont refusés. Chaque document peut être téléchargé dans son format d’origine.

Pour corriger l’avancement, ouvrir une étape validée puis **Reprendre à cette étape** et confirmer. Cette validation et les suivantes sont annulées ; les documents et l’historique sont conservés. Une pièce obligatoire justifiant une validation ne peut être retirée sans ajout d’un remplacement de même catégorie ou reprise de l’étape.

## Conservation des données

En **mode équipe**, les comptes, rôles, dossiers, tâches et références de documents sont conservés dans PostgreSQL sur Neon. Les fichiers du dossier sont conservés dans le Google Drive partagé configuré pour l’application. L’administrateur et les gérants / chefs de projets gèrent les dossiers ; les techniciens accèdent aux projets dans lesquels une tâche leur est affectée. Les téléchargements et modifications sont contrôlés côté serveur. Les documents financiers sont réservés à la gestion.

Les dossiers enregistrés se retrouvent depuis les appareils connectés au même espace. Une vérification de révision refuse les modifications concurrentes qui écraseraient une version plus récente. Les brouillons des ateliers sont propres à la session : enregistrer les documents dans le projet ou les exporter avant de fermer l’onglet ou de se déconnecter.

En **mode démonstration**, les dossiers et fichiers restent dans IndexedDB `exnov.projets.v1`, dans les collections `projects` et `files`. L’ajout d’un fichier et de sa référence constitue une transaction unique. Les données persistent dans le même navigateur et pour la même origine (protocole, hôte et port), avec synchronisation entre ses onglets. Effacer les données du site supprime ces copies locales. Le mode démonstration ne synchronise pas les projets entre appareils.

## Importer les anciens dossiers dans l’équipe

Cette action est disponible pour l’administrateur et les gérants / chefs de projets, en mode équipe.

1. Ouvrir **Projets** dans le navigateur qui contient les dossiers de démonstration.
2. Cliquer sur **Retrouver mes dossiers locaux**. Cette action lit les dossiers de ce navigateur ; elle ne les transfère pas encore.
3. Choisir le dossier à partager, puis cliquer sur **Importer dans l’espace équipe**.
4. Garder l’onglet ouvert pendant le transfert. Le suivi indique les documents importés et la finalisation du dossier.

Après un transfert interrompu, relancer le même import : les documents déjà transférés sont réutilisés. Un dossier dont l’import est terminé n’est pas dupliqué. Les dossiers, documents et fichiers d’origine restent conservés dans le navigateur après l’import. Les modifications ultérieures du dossier local ne sont pas une synchronisation avec l’espace équipe ; poursuivre le travail depuis le projet partagé.

L’import doit être lancé depuis chaque navigateur ou origine qui contient des dossiers à reprendre. Un dossier local ne peut pas être récupéré depuis un autre appareil s’il n’a pas été transféré ou exporté auparavant.

## Vérification

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Avec le serveur démarré :

```bash
npm run test:projects
npm run test:project-documents
node --import tsx scripts/verify-project-import.ts
```

Utiliser `TEST_BASE_URL=http://127.0.0.1:3010 npm run test:projects` pour un autre serveur. Le test crée ses dossiers dans un profil Chromium temporaire, sans modifier les projets du navigateur habituel. Les fichiers et captures de vérification sont placés dans `test-results/projets/`, ignoré par Git.

Les modifications de plans JSON sont enregistrées atomiquement avec leur fichier et ajoutées à l’activité du dossier. Un conflit sur ce document refuse l’écrasement ; les modifications indépendantes des informations du projet sont conservées. `npm run test:project-plans` vérifie ce parcours dans le navigateur.

`verify-project-import.ts` utilise un véritable IndexedDB dans un profil Chromium temporaire et simule les API d’équipe. Il vérifie la lecture volontaire des dossiers locaux, la reprise après un envoi interrompu, l’absence de doublons et la conservation des copies locales.


`TEST_BASE_URL=http://127.0.0.1:3013 npm run test:workflow` vérifie les trois groupes d’étapes, les formulaires de tâches en fenêtre, les quatre rôles, la clôture explicite et les petits écrans. Ce test simule les API d’équipe dans un profil navigateur temporaire ; aucun projet réel n’est modifié. Ses captures sont dans `test-results/workflow/`.
