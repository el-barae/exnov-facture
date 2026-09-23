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

- **Jaune** : étape actuelle. Un clic la valide si les pièces requises sont déjà présentes. Sinon, une fenêtre indique les pièces manquantes ; les joindre puis cliquer sur **Valider l’étape**.
- **Vert** : étape validée. Un clic permet de consulter sa date et ses documents.
- **Gris** : étape à venir. Ses documents peuvent être préparés, mais la validation reste bloquée tant que les étapes précédentes ne sont pas terminées.
- **Non applicable** : chiffrage exclu du périmètre. Cette étape ne compte pas dans le pourcentage.

La validation signifie que l’utilisateur confirme l’avancement. L’application vérifie la présence des fichiers dans la bonne catégorie ; elle n’analyse pas leur contenu et ne certifie pas leur conformité technique. L’étape Facturation suit l’émission de la facture, sans attester son paiement. Le suivi ne gère pas les échéances de facturation intermédiaires.

## Documents et corrections

La section **Documents du projet** permet de joindre des pièces avant leur étape. Choisir la bonne catégorie : le workflow réutilise les fichiers déjà enregistrés et ne les redemande pas. Les exports produits dans les espaces Factures et Rapports doivent être téléchargés puis joints au projet ; ils ne sont pas associés automatiquement.

Formats acceptés : PDF, DOC/DOCX, XLS/XLSX, CSV, PNG/JPG/JPEG/WebP, DWG/DXF et ZIP. Limites : **20 Mo par fichier**, **200 documents par projet**, sous réserve de l’espace disponible dans le navigateur. Les fichiers vides ou de format non pris en charge sont refusés. Chaque document peut être téléchargé dans son format d’origine.

Pour corriger l’avancement, ouvrir une étape validée puis **Reprendre à cette étape** et confirmer. Cette validation et les suivantes sont annulées ; les documents et l’historique sont conservés. Une pièce obligatoire justifiant une validation ne peut être retirée sans ajout d’un remplacement de même catégorie ou reprise de l’étape.

## Conservation des données

Les dossiers et fichiers sont conservés localement dans la base IndexedDB `exnov.projets.v1`, dans deux collections : `projects` (informations, exigences, validations, historique et références des documents) et `files` (fichiers binaires). Un fichier et sa référence sont enregistrés dans une seule transaction ; une erreur d’écriture ne valide pas l’opération.

Les données persistent après rechargement et fermeture de l’application, dans le même navigateur et pour la même origine (protocole, hôte et port). Les onglets de cette origine se mettent à jour entre eux. Une vérification de révision refuse les modifications fondées sur un dossier devenu obsolète.

**Il n’existe pas de sauvegarde serveur ou de synchronisation entre appareils.** Effacer les données du site supprime les dossiers et leurs fichiers. Conserver une copie des documents importants ; un navigateur privé ou un stockage plein peut empêcher leur conservation. Si le stockage ne s’ouvre pas, un message et un bouton de nouvelle tentative sont affichés.

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
```

Utiliser `TEST_BASE_URL=http://127.0.0.1:3010 npm run test:projects` pour un autre serveur. Le test crée ses dossiers dans un profil Chromium temporaire, sans modifier les projets du navigateur habituel. Les fichiers et captures de vérification sont placés dans `test-results/projets/`, ignoré par Git.
