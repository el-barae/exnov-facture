# EXNOV — Factures, devis et rapports IA

Application de génération de **factures et devis** avec Next.js 16 (App Router), TypeScript et Tailwind CSS. Formulaire en français, aperçu A4 paginé en direct, exports PDF et Word, sans compte ni base de données.

L’espace **Rapports IA**, accessible depuis le header, ajoute un chat avec photos, la rédaction et les révisions via **Kimi K3 sur AWS Bedrock**, un aperçu EXNOV paginé et l’export PDF. Voir [le guide de configuration et d’utilisation](docs/rapports-ia.md). Les variables à remplir sont dans `.env.example` ; la facturation fonctionne indépendamment de Bedrock.

## Démarrage

Prérequis : **Node.js 22** et npm.

```bash
npm ci
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000). Le bouton **Charger l’exemple** reprend les prestations de la facture nº 13 Dar Taliba : 11 000,00 DH HT, 2 200,00 DH TVA, 13 200,00 DH TTC, retenues de 550,00 et 1 650,00 DH, soit **11 000,00 DH à payer**.

Sous Linux x64, le Chromium inclus suffit. Sur macOS, Windows ou une machine où le binaire Linux ne fonctionne pas, installer Chrome et renseigner son chemin dans `.env.local` :

```dotenv
# Exemple macOS ; adaptez à votre installation.
CHROME_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

Sous Windows, utiliser par exemple `C:/Program Files/Google/Chrome/Application/chrome.exe`. Aucun Chrome local ni variable d’environnement n’est requis sur Vercel.

## Personnalisation

- **Société et identifiants** : `src/config/company.ts`. Compléter `rc`, `ice`, `tp` et `rib`. Ils restent vides en attendant ; les identifiants présents dans les anciennes images du modèle ne sont pas recopiés.
- **Logo** : remplacer `public/logo-exnov.png` par votre PNG définitif. Le fichier livré est un logo provisoire recomposé à partir d’éléments du modèle. Conserver de préférence les proportions du bloc, ou utiliser une image avec marges transparentes.
- **Filigrane** : remplacer `public/watermark-exnov.png`. Le fichier livré est extrait du Word, déjà transparent à environ 7 %. `watermarkOpacity: 1` conserve cette transparence. Pour un nouveau PNG opaque, régler cette valeur à `0.07`.
- Les deux exports utilisent les mêmes PNG et la même configuration. Les images du Word sont remplacées directement dans le ZIP du document, sans module commercial.
- **Modèle Word prêt à utiliser** : `templates/facture-exnov.docx`. Il est déjà balisé ; aucune préparation supplémentaire n’est nécessaire pour les boutons de téléchargement.
- **Modification dans Word** : voir [le guide des balises](docs/template-word.md).

Après un changement de code, de configuration, de modèle ou d’images, redéployer le projet sur Vercel.

## Factures et devis

Le champ **Type de document** permet de choisir Facture ou Devis. Les deux utilisent la même mise en page, les mêmes calculs et options, et le même modèle Word. Le titre devient `FACTURE Nº` ou `DEVIS Nº`, la formule en lettres est adaptée, et les fichiers portent le préfixe `Facture-EXNOV-` ou `Devis-EXNOV-`. Les retenues restent modifiables dans les deux modes.

Changer de type conserve la saisie et propose un numéro propre au type choisi. Les numéros de facture et de devis sont indépendants ; les numéros modifiés pendant la session sont conservés lors des allers-retours. Les anciens appels API sans `typeDocument` restent traités comme des factures. Les deux routes existantes `/api/factures/pdf` et `/api/factures/word` acceptent les deux types.

## Utilisation et sauvegarde locale

Le premier numéro proposé est 1, modifiable. Un téléchargement réussi mémorise le numéro utilisé. Télécharger le même document en PDF puis en Word conserve le même numéro. Un rechargement propose le dernier numéro utilisé + 1 ; **Nouvelle facture** propose le numéro suivant et conserve le client.

La seule clé `localStorage`, `exnov.facturation.v1`, contient `dernierNumero` (factures), `dernierNumeroDevis` (devis, après un premier export) et `client` (`destinataire`, `reference`). Les dernières informations client sont mémorisées pendant la saisie. Aucune date, prestation, somme ou facture n’est enregistrée. Une saisie non exportée disparaît donc au rechargement. La numérotation est propre au navigateur, sans synchronisation entre appareils. Si le stockage local est bloqué, la création et les exports fonctionnent avec un message explicatif.

Les données sont envoyées à la fonction Vercel uniquement au clic sur un téléchargement, traitées en mémoire, puis renvoyées comme fichier. L’application ne sauvegarde pas les factures côté serveur et n’en journalise pas le contenu.

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
4. Déployer. La facturation ne nécessite aucune clé API ni base de données. Pour les rapports IA, configurer les variables AWS décrites dans [le guide](docs/rapports-ia.md) et protéger l’accès au déploiement. Ne pas définir `CHROME_EXECUTABLE_PATH` sur Vercel.
5. Charger l’exemple, télécharger les deux formats et vérifier vos mentions de société.

Les routes tournent dans le runtime Node.js (pas Edge), avec une durée maximale déclarée de 60 s pour le PDF et 30 s pour Word. `next.config.ts` conserve Chromium hors du bundle et inclut explicitement son binaire, les polices, les images et le modèle dans les fonctions concernées. Ne pas configurer `output: "export"` : les exports nécessitent les fonctions serveur Next.js.

Ce dépôt est préparé pour Vercel ; les vérifications décrites ci-dessous se font localement en production. Le déploiement sur votre compte Vercel reste à effectuer.

## Vérification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run start
```

Dans un second terminal, avec le serveur démarré :

```bash
npm run test:e2e
```

Ce test lance Chromium, teste les deux routes et les boutons réels, les erreurs de validation, une facture de 28 prestations, la restauration du numéro et du client, et l’absence de débordement sur mobile. Les PDF, Word et captures sont placés dans `test-results/` (exclu de Git). Pour un autre port : `TEST_BASE_URL=http://localhost:3001 npm run test:e2e`.

Les tests unitaires couvrent l’exemple, les quatre combinaisons de retenues, l’arrondi au centime, les dates invalides, les accords français, l’échappement HTML et la suppression réelle des lignes RAS dans le Word.

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
