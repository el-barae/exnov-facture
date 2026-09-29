# Espace équipe avec Neon

L’espace équipe utilise **PostgreSQL Neon** pour les comptes, les projets, les tâches et les références de documents. Les fichiers sont enregistrés dans le **Google Drive partagé de l’entreprise**. **Better Auth** gère la connexion par e-mail et mot de passe et les sessions par cookies. Les autorisations sont vérifiées dans les routes serveur à chaque opération.

## Rôles

| Action | Administrateur | Gérant / Chef de projets | Technicien | Technicien Pro |
| --- | --- | --- | --- | --- |
| Créer des comptes, changer un rôle, désactiver un membre | Oui | Non | Non | Non |
| Créer et gérer les projets, valider les étapes | Oui | Oui | Non | Non |
| Affecter les tâches et modifier leurs consignes | Oui | Oui | Non | Non |
| Voir les projets | Tous | Tous | Projets avec une tâche affectée | Projets avec une tâche affectée |
| Mettre à jour l’avancement des tâches | Toutes | Toutes | Ses tâches | Ses tâches |
| Déposer des livrables | Tous les projets | Tous les projets | Projets affectés | Projets affectés |
| Factures et devis | Oui | Oui | Non | Non |
| Utiliser l’IA | Oui | Oui | Non | Oui |

Une affectation donne au technicien accès au dossier du projet et à ses documents autorisés. Il voit uniquement les tâches qui lui sont affectées. Le rôle Pro ajoute l’accès à l’IA ; il ne donne pas le droit de gérer les comptes ou de réaffecter les tâches. L’application correspond à une seule équipe EXNOV.

## 1. Créer la base Neon

Dans Neon, créer un projet et une base pour Exnov workspace. Séparer les bases de développement et de production. Récupérer deux chaînes de connexion à la **même base** :

- `DATABASE_URL` : connexion avec pooling pour l’application ; le nom d’hôte contient généralement `-pooler`.
- `DATABASE_DIRECT_URL` : connexion directe pour les migrations et l’administration.

Conserver les paramètres TLS fournis par Neon. Une connexion directe est recommandée pour les migrations, `pg_dump` et `pg_restore`. [Documentation Neon](https://neon.com/docs/connect/connection-pooling)

Le rôle PostgreSQL de l’application reste privé côté serveur. Pour la production, utiliser un rôle d’exécution limité aux opérations sur les tables et séquences nécessaires, et un rôle de migration distinct avec les droits de création. Les rôles applicatifs `admin`, `manager`, `technician` et `technician_pro` vivent dans `team_members` ; ce ne sont pas des identifiants PostgreSQL à donner aux collaborateurs.

## 2. Configurer les secrets

Créer `.env.local` à partir de `.env.example` puis compléter :

```dotenv
DATABASE_URL="postgresql://...-pooler.../exnov_workspace?sslmode=require"
DATABASE_DIRECT_URL="postgresql://.../exnov_workspace?sslmode=require"
BETTER_AUTH_URL="http://localhost:3000"
BETTER_AUTH_SECRET="remplacer-par-un-secret-aleatoire"
EXNOV_DEMO_MODE="false"
TEAM_AI_DAILY_LIMIT="50"
```

Générer le secret avec `openssl rand -base64 48`. Il doit contenir au moins 32 caractères. Ne jamais préfixer ces variables par `NEXT_PUBLIC_`, les mettre dans Git ou les partager avec les techniciens. En production, `BETTER_AUTH_URL` doit être l’origine HTTPS exacte de l’application, sans chemin ni paramètres. Le navigateur doit utiliser cette même origine ; `localhost` et `127.0.0.1` sont distincts.

Les secrets AWS restent nécessaires pour l’IA, suivant [le guide Bedrock](rapports-ia.md). Le quota quotidien par membre est vérifié en base avant l’appel au fournisseur ; une tentative admise consomme une unité même si le fournisseur échoue.

## 3. Appliquer les migrations

```bash
npm ci
npm run db:migrate
```

La commande crée ou met à jour les tables Better Auth, puis applique les fichiers SQL de `db/migrations` dans une transaction. Les migrations applicatives sont enregistrées avec une empreinte SHA-256 dans `app_schema_migrations`. Créer un nouveau fichier SQL pour faire évoluer un schéma déjà déployé.

Les commandes utilisent `DATABASE_DIRECT_URL` lorsqu’elle est renseignée. Les migrations restent une étape explicite de déploiement ; un démarrage de serveur ne modifie pas automatiquement le schéma.

## 4. Créer le premier administrateur

Ajouter temporairement à `.env.local` :

```dotenv
EXNOV_ADMIN_NAME="Administrateur EXNOV"
EXNOV_ADMIN_EMAIL="votre-adresse-professionnelle"
EXNOV_ADMIN_PASSWORD="un-mot-de-passe-unique-de-12-caracteres-minimum"
```

```bash
npm run db:bootstrap
```

La commande fonctionne uniquement tant que l’équipe n’a aucun membre. Le compte, son mot de passe haché et le rôle administrateur sont créés dans la même transaction. Deux exécutions simultanées ne peuvent pas créer deux premiers administrateurs. Retirer ensuite les variables `EXNOV_ADMIN_*` de la configuration.

Démarrer `npm run dev`, se connecter et ouvrir **Équipe** pour créer les collaborateurs. Les mots de passe ont une longueur de 12 à 128 caractères. Une réinitialisation administrée invalide les sessions du compte concerné. Il n’existe pas d’inscription publique ; aucune adresse saisie sur la page de connexion ne crée de compte. La récupération automatique par e-mail demande encore un service d’envoi d’e-mails.

## 5. Travailler sur les projets

Le gérant crée un projet, ajoute une tâche, choisit un collaborateur et peut définir une échéance. Le technicien se connecte depuis son propre poste, ouvre ses tâches depuis une carte du workflow, actualise son avancement et dépose les documents dans le dossier. Les révisions empêchent qu’une sauvegarde écrase une modification plus récente sans avertissement.

Chaque tâche reste liée au projet. Le bouton **Ajouter une tâche** sur une carte du workflow ouvre un formulaire rattaché à cette étape ; le compteur de la carte ouvre la liste correspondante. Les anciennes tâches sans étape sont accessibles par **Tâches sans étape** et peuvent être rattachées depuis leur formulaire de modification. Les tâches existantes restent générales. Ce rattachement est stocké dans les données JSON des tâches : aucune migration SQL supplémentaire n’est nécessaire.

Les anciens dossiers du navigateur doivent être importés depuis le navigateur qui les contient. L’import conserve les originaux locaux. Vérifier le nombre de pièces et ouvrir les documents transférés avant d’effacer une copie locale.

Les ateliers conservent encore certains brouillons et préférences dans le navigateur. Un document devient partagé après son enregistrement dans un projet. La numérotation des factures et devis n’est pas encore un compteur transactionnel partagé ; définir une procédure de numérotation avant une émission simultanée par plusieurs personnes.

## 6. Configurer Google Drive partagé

1. Dans Google Cloud, créer un projet et activer **Google Drive API**.
2. Créer un **compte de service dédié à Exnov workspace**, puis une clé JSON. Conserver ce fichier dans votre gestionnaire de secrets, en dehors du dépôt.
3. Dans Google Workspace, créer un Drive partagé EXNOV dédié aux documents de l’application, puis un dossier Exnov workspace. Ajouter l’adresse du compte de service comme **Gestionnaire de contenu** de ce Drive partagé, selon les règles de partage de votre organisation.
4. Copier l’identifiant du dossier, visible à la fin de son URL Drive, dans `GOOGLE_DRIVE_FOLDER_ID`.
5. Depuis la clé JSON, copier `client_email` et `private_key` dans les variables serveur ci-dessous.

```dotenv
GOOGLE_SERVICE_ACCOUNT_EMAIL="exnov-workspace@votre-projet.iam.gserviceaccount.com"
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_FOLDER_ID="identifiant-du-dossier-exnov-workspace"
```

Les retours à la ligne réels et les séquences `\n` sont acceptés pour la clé. Une délégation à l’ensemble du domaine Google Workspace n’est pas utilisée. Les collaborateurs se connectent à Exnov workspace avec leur e-mail et leur mot de passe ; ils n’ont pas à connecter un compte Google. [Comptes de service Google](https://developers.google.com/identity/protocols/oauth2/service-account)

L’application vérifie que le dossier appartient à un Drive partagé avant d’envoyer un fichier. Un dossier personnel « Mon Drive » partagé avec le compte de service n’est pas accepté. L’API utilise `supportsAllDrives=true`. [Prise en charge des Drives partagés](https://developers.google.com/workspace/drive/api/guides/enable-shareddrives)

Le compte de service demande la portée OAuth `drive` pour accéder au dossier préexistant configuré par l’administrateur. Son accès effectif dépend des droits accordés à ce compte. Lui donner accès uniquement au Drive dédié à Exnov workspace. La portée `drive.file` vise les fichiers créés ou sélectionnés avec l’application ; ce flux serveur n’utilise pas de sélecteur Google Picker. [Portées Drive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)

Les droits Exnov workspace protègent les accès par l’application. Une personne ayant accès au Drive directement conserve les droits que Google lui accorde. Ne pas donner aux techniciens un accès direct global au Drive si leurs documents doivent être filtrés par affectation dans Exnov workspace.

Chaque document est déposé dans le dossier configuré, avec les propriétés privées `exnovDocumentId` et `exnovProjectId`. Neon conserve l’identifiant Drive et l’empreinte du contenu. La limite est de 20 Mio par pièce. Les blocs en cours de transfert sont temporairement conservés en base jusqu’à la fin ou à l’expiration du dépôt ; les fichiers définitifs sont dans Drive. Un Drive non configuré bloque l’enregistrement, sans bascule vers un stockage permanent PostgreSQL.

Un remplacement crée un nouveau fichier Drive, puis actualise la référence en base. La suppression d’un document et le nettoyage des anciens fichiers utilisent la **corbeille Drive**. Ne pas déplacer manuellement les fichiers hors du dossier configuré : l’application vérifie leur dossier et leurs propriétés avant de les lire ou de les supprimer.

Un arrêt du serveur entre le transfert et l’enregistrement de la référence peut laisser un fichier orphelin dans Drive. Les propriétés `exnovDocumentId` et `exnovProjectId` servent à le rapprocher des références présentes dans Neon. Vérifier les écarts avant de supprimer un fichier. Les échecs de nettoyage après validation en base sont conservés dans la file de nettoyage ; planifier `npm run files:cleanup` sur l’infrastructure d’exploitation.

## Sauvegarder Neon et Drive

Configurer la fenêtre de restauration Neon selon l’offre retenue. La restauration à un instant passé s’applique aux branches racines et à l’historique encore disponible ; elle remet toutes les bases de cette branche dans l’état choisi. [Restauration Neon](https://neon.com/docs/postgres/backup-restore/branch-restore)

Prévoir aussi une sauvegarde régulière hors du projet Neon, chiffrée et avec une rétention définie. Exemple d’export complet, avec les secrets fournis par le gestionnaire de secrets du service planifié :

```bash
pg_dump --dbname="$DATABASE_DIRECT_URL" --format=custom --no-owner --file=exnov.dump
```

Le fichier inclut les références de documents, les comptes et les sessions. Les fichiers définitifs Drive ne sont pas inclus : prévoir une sauvegarde indépendante du Drive partagé, avec la correspondance entre identifiants de fichiers et documents Exnov workspace. La corbeille Drive ne remplace pas cette sauvegarde. Chiffrer les exports, les stocker dans un emplacement privé et contrôler le succès des travaux planifiés. Cette commande n’installe pas une planification de sauvegarde.

Tester une restauration dans une base vide et isolée :

```bash
pg_restore --dbname="$RESTORE_DATABASE_URL" --no-owner --no-acl --single-transaction exnov.dump
```

Utiliser une connexion directe et une version des outils PostgreSQL compatible avec la base. Vérifier la connexion, les rôles, les tâches et les références Drive. Restaurer aussi les fichiers Drive nécessaires, en tenant compte des identifiants enregistrés dans Neon, puis ouvrir quelques documents. Invalider les anciennes sessions restaurées avant une remise en service. Refaire cet exercice régulièrement et après une évolution du stockage. [Export et restauration PostgreSQL chez Neon](https://neon.com/docs/import/migrate-from-postgres)

## Taille des transferts sur Vercel

Vercel limite les corps de requête et les réponses non diffusées en continu à 4,5 Mo. Les dépôts utilisent donc des blocs de 1 Mio. Les téléchargements de documents et de plans JSON utilisent une réponse en streaming, sans en-tête `Content-Length` ; Vercel indique que cette limite de réponse ne s’applique pas au streaming. Le serveur contrôle les droits et vérifie le fichier avant de l’émettre. La limite applicative reste de 20 Mio par pièce. [Limite des corps et streaming sur Vercel](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions)

## Déploiement et vérification

Renseigner les variables serveur dans l’hébergement, appliquer les migrations, créer l’administrateur sur la base visée puis déployer l’application. Le build peut s’effectuer sans connexion à Neon ; l’espace équipe affiche une configuration manquante jusqu’à la saisie des secrets.

Les écritures exigent l’origine de confiance, les sessions sont vérifiées en base et les permissions sont recalculées depuis `team_members`. Les comptes désactivés ne peuvent pas créer de nouvelle session. Les protections de l’interface complètent ces contrôles serveur. Le déploiement doit écraser les en-têtes d’adresse IP entrants avec l’adresse réelle du client pour que la limitation des tentatives de connexion reste fiable.

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:team
```

`test:team` lance une base PostgreSQL temporaire locale et un serveur de test ; il vérifie les rôles et les appels HTTP sans utiliser de compte Neon ni appeler le fournisseur IA. Les échanges OAuth et Drive y sont simulés ; effectuer également un dépôt et un téléchargement avec le Drive réel après sa configuration.

## Démonstration locale

`EXNOV_DEMO_MODE=true` active explicitement l’ancienne démonstration et son stockage dans le navigateur. Cette option désactive la protection des API historiques pour les essais locaux. La laisser absente ou à `false` sur un déploiement professionnel. Une configuration Neon manquante n’active jamais la démonstration automatiquement.

Références d’implémentation : [Better Auth avec Next.js](https://better-auth.com/docs/integrations/next), [schéma et migrations Better Auth](https://better-auth.com/docs/concepts/database), [limitation des tentatives](https://better-auth.com/docs/concepts/rate-limit).

## Diagnostic des délais de connexion

Une erreur `ETIMEDOUT` vers le port `5432` indique qu’une connexion réseau à PostgreSQL n’a pas abouti. Un `ENETUNREACH` sur une adresse IPv6 indique que le réseau local ne fournit pas de route vers cette adresse. Une erreur réseau ne prouve pas que le mot de passe est incorrect.

Les hôtes `*.neon.tech` utilisent automatiquement le pilote officiel `@neondatabase/serverless`, en WebSocket sécurisé sur le port 443. La chaîne `DATABASE_URL` reste une URL PostgreSQL : ne pas remplacer son port par 443. Les transactions interactives et Better Auth utilisent le même pool. Aucun changement des identifiants ni migration des données n’est nécessaire. [Pilote officiel Neon](https://github.com/neondatabase/serverless)

Le pilote PostgreSQL TCP reste utilisé pour les autres hôtes, notamment les tests locaux. Le délai global de connexion reste de 10 secondes. Une coupure d’une connexion inactive est gérée par le pool ; une transaction interrompue n’est pas rejouée automatiquement.

Si la connexion Neon échoue encore, vérifier l’accès aux WebSockets sécurisés sur le port 443, l’état du projet Neon et les restrictions IP éventuelles. Après une mise à jour des dépendances ou de la configuration, redémarrer `npm run dev`. Les outils externes `pg_dump` et `pg_restore` utilisent toujours une connexion PostgreSQL TCP : ce changement de pilote ne modifie pas leur fonctionnement.
