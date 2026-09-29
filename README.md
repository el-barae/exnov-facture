# Exnov workspace

Application de génération de **factures et devis** avec Next.js 16 (App Router), TypeScript et Tailwind CSS. Formulaire en français, aperçu A4 paginé en direct, exports PDF et Word, avec un espace équipe : comptes e-mail/mot de passe, quatre rôles, projets et tâches dans **PostgreSQL Neon**, documents dans **Google Drive partagé**. La démonstration locale reste disponible sur activation explicite.

L’espace **Rapports IA**, accessible depuis le header, ajoute un chat avec photos, la rédaction et les révisions via **Claude Sonnet 4.6 sur AWS Bedrock**, un aperçu EXNOV paginé et l’export PDF. Voir [le guide de configuration et d’utilisation](docs/rapports-ia.md). Les variables à remplir sont dans `.env.example` ; la facturation fonctionne indépendamment de Bedrock.

L’espace **Projets**, accessible dans la navigation et à `/projets`, suit les missions de génie civil : projets à gauche, workflow interactif, documents requis, avancement et historique. Les ateliers peuvent enregistrer directement leurs factures/devis PDF, rapports PDF, CPS Word et plans JSON/DXF dans le dossier choisi, avec préremplissage depuis un projet. En mode équipe, les dossiers sont centralisés dans Neon et les fichiers dans Drive ; chaque API contrôle les droits du collaborateur. En démonstration, les données restent dans IndexedDB. Les anciens dossiers locaux peuvent être importés sans supprimer leurs originaux. Voir [le guide du suivi des projets](docs/projets.md).

L’espace **CPS IA**, accessible dans la navigation et à `/cps`, génère un cahier des prescriptions spéciales à partir d’un logo et d’une description du projet. Il reprend la structure des quatre CPS de référence, propose un aperçu et des révisions par consigne, puis exporte un **Word modifiable** avec sommaire, clauses, prescriptions techniques, ouvrages, bordereau des prix et signatures. Il utilise la même configuration Bedrock que les rapports. Voir [le guide CPS](docs/cps-ia.md). Vérification navigateur : `npm run test:cps` avec le serveur démarré.

L’espace **Plans 2D**, accessible depuis la navigation ou `/plans`, propose un éditeur de plans simple : murs avec épaisseur, portes et fenêtres liées, bibliothèque de symboles, pièces avec surfaces en m², lignes, rectangles, cercles, textes, cotes liées aux murs, panneaux repliables, calques, aimantation de 10 cm, mode orthogonal, déplacement, zoom et annuler/rétablir. En équipe, les brouillons de la bibliothèque restent en mémoire pendant la session ; **Enregistrer dans ce projet** partage le plan et permet de le retrouver après rechargement. En démonstration, la bibliothèque utilise le stockage du navigateur. Les exports **PDF à l’échelle avec cartouche EXNOV** (A4/A3), **SVG** et **DXF en mètres** contiennent les calques visibles ; l’export **JSON** conserve tout le plan pour le réimporter et le modifier. L’exemple et chaque nouveau plan créent un document distinct. L’étape « CPS & plans » des projets ouvre aussi cet atelier ; **Enregistrer dans ce projet** ajoute un JSON modifiable (ou un DXF au choix). Depuis les documents du projet, **Modifier dans Plans 2D** rouvre le JSON ; **Enregistrer les modifications dans ce projet** actualise la même pièce sans doublon, avec protection contre les conflits entre onglets. Le dessin manuel fonctionne sans configuration IA. Le bouton **Assistant IA** permet de demander une création ou une modification en français, avec aperçu avant application et annulation possible. Il réutilise la configuration AWS Bedrock des rapports ; la consigne, la conversation et le plan courant sont transmis uniquement à l’envoi de la demande. Voir [le guide des plans](docs/plans.md). Vérification navigateur : `npm run test:plans`, `npm run test:plans-architecture` et `npm run test:plans-ai` avec le serveur démarré (réponses IA simulées pour le dernier).

## Démarrage

Prérequis : **Node.js 22** et npm.

Installer les dépendances avec `npm ci`, puis suivre le [guide équipe Neon et Drive](docs/equipe-neon.md) pour renseigner `.env.local`, appliquer les migrations et créer le premier administrateur :

```bash
npm run db:migrate
npm run db:bootstrap
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000) et se connecter avec le compte créé. L’administrateur ajoute ensuite les collaborateurs depuis **Équipe**.

| Rôle | Accès |
| --- | --- |
| Administrateur | Comptes, rôles, projets et IA |
| Gérant / Chef de projets | Création et suivi des projets, affectation des tâches, IA |
| Technicien | Projets auxquels il est affecté, ses tâches, dépôt de documents techniques |
| Technicien Pro | Accès technicien et outils IA |

Sans configuration, un écran de préparation s’affiche et les API restent fermées. Pour essayer seulement la démonstration locale : `EXNOV_DEMO_MODE=true npm run dev`. Dans ce mode explicite, un e-mail valide et un mot de passe quelconque ouvrent les projets locaux ; aucun compte réel n’est créé. Ne pas activer ce mode sur l’espace professionnel.

Ouvrir ensuite **Factures / Devis** dans la navigation. Le bouton **Charger l’exemple** reprend les prestations de la facture nº 13 Dar Taliba : 11 000,00 DH HT, 2 200,00 DH TVA, 13 200,00 DH TTC, retenues de 550,00 et 1 650,00 DH, soit **11 000,00 DH à payer**.

Sous Linux x64, le Chromium inclus suffit. Sur macOS, Windows ou une machine où le binaire Linux ne fonctionne pas, installer Chrome et renseigner son chemin dans `.env.local` :

```dotenv
# Exemple macOS ; adaptez à votre installation.
CHROME_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

Sous Windows, utiliser par exemple `C:/Program Files/Google/Chrome/Application/chrome.exe`. Aucun Chrome local ni variable d’environnement n’est requis sur Vercel.

## Apparence

Le bouton lune/soleil de l’en-tête et de la connexion permet de basculer entre les modes clair et sombre. Au premier accès, l’application suit le thème du système. Un choix manuel est mémorisé dans ce navigateur (`exnov.theme.v1`) et partagé entre les onglets, même après déconnexion. Les aperçus de documents et les exports conservent leur présentation sur papier blanc.

Vérification navigateur : `npm run test:theme` avec le serveur démarré.

## Personnalisation

- **Société et identifiants** : `src/config/company.ts`. Compléter `rc`, `ice`, `tp` et `rib`. Ils restent vides en attendant ; les identifiants présents dans les anciennes images du modèle ne sont pas recopiés.
- **Logo de l’interface et de la connexion** : `public/logo.png`.
- **Logo des documents** : remplacer `public/logo-exnov.png` par votre PNG définitif. Le fichier livré est un logo provisoire recomposé à partir d’éléments du modèle. Conserver de préférence les proportions du bloc, ou utiliser une image avec marges transparentes.
- **Filigrane** : remplacer `public/watermark-exnov.png`. Le fichier livré est extrait du Word, déjà transparent à environ 7 %. `watermarkOpacity: 1` conserve cette transparence. Pour un nouveau PNG opaque, régler cette valeur à `0.07`.
- Les deux exports utilisent les mêmes PNG et la même configuration. Les images du Word sont remplacées directement dans le ZIP du document, sans module commercial.
- **Modèle Word prêt à utiliser** : `templates/facture-exnov.docx`. Il est déjà balisé ; aucune préparation supplémentaire n’est nécessaire pour les boutons de téléchargement.
- **Modification dans Word** : voir [le guide des balises](docs/template-word.md).

Après un changement de code, de configuration, de modèle ou d’images, redéployer le projet sur Vercel.

## Factures et devis

Le champ **Type de document** permet de choisir Facture ou Devis. Les deux utilisent la même mise en page, les mêmes calculs et options, et le même modèle Word. Le titre devient `FACTURE Nº` ou `DEVIS Nº`, la formule en lettres est adaptée, et les fichiers portent le préfixe `Facture-EXNOV-` ou `Devis-EXNOV-`. Les retenues restent modifiables dans les deux modes.

Changer de type conserve la saisie et propose un numéro propre au type choisi. Les numéros de facture et de devis sont indépendants ; les numéros modifiés pendant la session sont conservés lors des allers-retours. Les anciens appels API sans `typeDocument` restent traités comme des factures. Les deux routes existantes `/api/factures/pdf` et `/api/factures/word` acceptent les deux types.

## Conservation des documents

En mode équipe, **Enregistrer dans ce projet** conserve les fichiers dans le Drive partagé et leurs références dans Neon. Les téléchargements passent par le serveur, qui vérifie le rôle et l’affectation au projet. Un fichier est limité à 20 Mo (5 Mo pour les plans JSON modifiables). Le transfert passe par des blocs temporaires dans Neon, supprimés après enregistrement dans Drive. Les changements simultanés sont protégés par des révisions.

Les brouillons des ateliers restent en mémoire pendant la session et disparaissent au rechargement ou à la déconnexion. Enregistrer un document dans un projet ou le télécharger avant de quitter. Les préférences de facturation sont également limitées à la session en équipe : **la numérotation des factures/devis n’est pas encore un compteur partagé**. Elle doit être coordonnée avant une émission simultanée par plusieurs collaborateurs.

En démonstration, la facturation utilise `localStorage` (`exnov.facturation.v1`) pour les derniers numéros et le client. Les fichiers des projets restent dans IndexedDB (`exnov.projets.v1`), sur le navigateur utilisé. Le bouton **Retrouver mes dossiers locaux**, disponible aux responsables dans l’espace équipe, permet de transférer ces dossiers tout en gardant leurs copies locales.

Le [guide équipe](docs/equipe-neon.md) décrit les sauvegardes de Neon et de Drive ainsi que les essais de restauration. La configuration et la planification des sauvegardes sur vos comptes restent à effectuer.

## Calculs

`src/lib/invoice.ts` est la source commune des calculs, du formatage et de la validation. `decimal.js` évite les erreurs de multiplication en virgule flottante. Arrondi commercial à deux décimales : chaque prix de ligne d’abord, somme HT ensuite, puis TVA et chaque retenue. Le TTC est HT + TVA ; le total à payer soustrait uniquement les retenues actives. Les lignes RAS désactivées disparaissent des deux fichiers. La case « Afficher TOTAL A PAYER », cochée par défaut, permet de masquer cette ligne dans l’aperçu et les exports, sans modifier les calculs ni le montant en lettres. Une référence vide ou composée uniquement d’espaces masque aussi le libellé « REFERENCE: ».

Le montant en lettres porte sur le **total à payer**, inclut les centimes et la devise une seule fois : `Onze Mille Dirhams`, `Onze Dirhams Et Un Centime`. Les taux sont les paramètres de calcul demandés, modifiables ; aucun régime fiscal n’est déduit automatiquement.

Limites explicites : 100 prestations, 2 000 caractères par désignation, 1 500 pour le projet, 500 pour le destinataire, 4 décimales pour les quantités, 2 pour les prix et taux. Montant HT inférieur à un milliard de dirhams. Les routes revalident les données et recalculent les sommes ; elles n’acceptent pas des totaux calculés par le client.

## PDF, aperçu et Word

Le composant `ApercuFacture` charge le HTML produit par `src/lib/document/html.ts` dans une iframe isolée. La route PDF produit **exactement le même HTML et CSS**, avec les images et polices embarquées en base64, puis l’imprime avec Puppeteer et `@sparticuz/chromium`. Les polices sont chargées avant la mesure des lignes. La pagination conserve les totaux et la clôture ensemble, répète le tableau et le pied de page, et répartit une désignation exceptionnellement longue sur plusieurs pages. Le contenu utilisateur est échappé ; le navigateur PDF n’effectue aucune requête externe.

Le Word est produit par **docxtemplater + pizzip**, à partir du fichier joint adapté. Les styles, les bordures, les fusions, les largeurs de colonnes et les libellés du tableau original sont conservés. Les colonnes de section et les objets flottants de l’ancien document sont remplacés par une disposition extensible, avec de vrais en-tête et pied de page répétés.

Le document conserve les bandes or/anthracite, le filigrane, le bloc destinataire à droite et la signature sans image. Les montants sont espacés conformément à la demande, et le pied de page est alimenté par la configuration. **Le logo reste provisoire en attendant vos images.** L’aperçu et le PDF partagent leur moteur de rendu ; Word utilise son propre moteur de pagination. Le rendu Word peut donc légèrement varier suivant Word/LibreOffice et les polices installées : une identité pixel par pixel entre ces moteurs n’est pas garantie.

Les polices libres **Carlito** et **Noto Sans** sont livrées avec leurs licences dans `public/fonts/`. Installer ces trois fichiers TTF sur les postes qui ouvrent les Word réduit les différences de substitution typographique. Aucun service externe de polices n’est utilisé. Aucun composant de l’application ne dépend de LibreOffice.

## Déploiement Vercel

1. Créer un dépôt GitHub et y pousser les sources, **`package-lock.json`, `public/` et `templates/facture-exnov.docx` inclus**. Ne pas pousser `node_modules/`, `.next/` ni `.env.local`.
2. Dans Vercel, choisir **Add New → Project**, importer le dépôt et laisser le preset **Next.js**.
3. Utiliser **Node.js 22.x**. Commande de build : `npm run build` ; répertoire de sortie : valeur Next.js par défaut.
4. Renseigner les variables serveur Neon, Better Auth et Google Drive selon le [guide équipe](docs/equipe-neon.md), appliquer les migrations et créer l’administrateur. `BETTER_AUTH_URL` doit correspondre au domaine HTTPS du déploiement. Laisser `EXNOV_DEMO_MODE` absent ou à `false`. Pour l’IA, ajouter les variables AWS du [guide](docs/rapports-ia.md). Ne pas définir `CHROME_EXECUTABLE_PATH` sur Vercel.
5. Charger l’exemple, télécharger les deux formats et vérifier vos mentions de société.

Les routes tournent dans le runtime Node.js (pas Edge), avec une durée maximale déclarée de 60 s pour le PDF et 30 s pour Word. `next.config.ts` conserve Chromium hors du bundle et inclut explicitement son binaire, les polices, les images et le modèle dans les fonctions concernées. Ne pas configurer `output: "export"` : les exports nécessitent les fonctions serveur Next.js.

Ce dépôt est préparé pour Vercel ; les vérifications décrites ci-dessous se font localement en production. Le déploiement sur votre compte Vercel reste à effectuer.

## Vérification

```bash
npm run lint
npm run typecheck
npm test
npm run test:team
npm run build
EXNOV_DEMO_MODE=true npm run start
```

`npm run test:team` démarre une base PostgreSQL éphémère PGlite et un serveur Next.js : il vérifie comptes, sessions, rôles, tâches et droits des fichiers avec une API Google Drive simulée. Il n’utilise aucun identifiant Neon ou Google réel.

Les parcours navigateur historiques utilisent le **mode démonstration** explicite. Le parcours `npm run test:login` vérifie la connexion, l’arrivée sur les projets, le logo, la persistance de session, la déconnexion et le mobile. Les autres parcours passent également par le formulaire de connexion.

Dans un second terminal, avec le serveur démarré :

```bash
npm run test:e2e
```

Ce test lance Chromium, teste les deux routes et les boutons réels, les erreurs de validation, une facture de 28 prestations, la restauration du numéro et du client, et l’absence de débordement sur mobile. Les PDF, Word et captures sont placés dans `test-results/` (exclu de Git). Pour un autre port : `TEST_BASE_URL=http://localhost:3001 npm run test:e2e`.

Les tests unitaires couvrent l’exemple, les quatre combinaisons de retenues, l’arrondi au centime, les dates invalides, les accords français, l’échappement HTML et la suppression réelle des lignes RAS dans le Word.

Le suivi des projets dispose aussi de tests métier et d’un parcours navigateur : `npm run test:projects` (serveur démarré, `TEST_BASE_URL` facultatif). Ce parcours vérifie la création, le blocage des étapes prématurées, les pièces obligatoires, la sauvegarde des fichiers après rechargement, les échanges entre onglets, la reprise d’une étape, l’isolation des projets et l’affichage mobile. Les captures sont dans `test-results/projets/`.

## Organisation

```text
src/app/                  Pages, styles et routes POST /api/factures/{pdf,word}
src/components/           AtelierFacture, FormulaireFacture, TableauPrestations, ApercuFacture
src/config/company.ts    Mentions fixes et identifiants de la société
src/lib/invoice.ts        Types, schéma, calculs, formatage et exemple
src/lib/words.ts          Nombres et montants en lettres françaises
src/lib/storage.ts        Dernier numéro et dernières informations client
src/lib/document/        HTML, CSS A4 et pagination communs aperçu/PDF
src/lib/server/          Générateurs et validation des requêtes
public/                  PNG et polices locales
templates/               Modèle Word déjà balisé
docs/template-word.md    Préparation et modification manuelle dans Word
scripts/                 Vérification navigateur et adaptation ponctuelle du modèle
tests/                   Tests des calculs et des documents
```

Le script facultatif `scripts/prepare-template.py` documente l’adaptation initiale depuis votre fichier original. Il nécessite Python et `lxml` uniquement si vous souhaitez la reproduire ; il n’est exécuté ni à l’installation ni au build ni sur Vercel. **Ne pas le relancer après des modifications manuelles du template**, car il le remplace.

Références techniques : [inclusion des fichiers dans Next.js](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [Chromium pour fonctions serverless](https://github.com/Sparticuz/chromium), [balises et boucles docxtemplater](https://docxtemplater.com/docs/tag-types/).

Le parcours `npm run test:project-documents` vérifie les exports réels PDF/Word/DXF vers les projets, les cinq catégories, le préremplissage, les brouillons séparés, les erreurs de génération et de stockage, la destination pendant la navigation, la persistance et le mobile. Les réponses IA y sont simulées ; aucun appel AWS n’est effectué. `npm run test:project-plans` vérifie l’ouverture des JSON depuis un projet, leur mise à jour, l’isolation des brouillons et les conflits.
