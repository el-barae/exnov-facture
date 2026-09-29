# Rapports IA EXNOV

Le sélecteur du header passe de **Factures / Devis** à **Rapports IA** sans perdre la saisie de la session. Le chat accepte une demande et jusqu’à six photos, puis permet de réviser le rapport par conversation. Le PDF A4 reprend exactement les composants d’en-tête, de pied de page, de polices et de filigrane des factures. Le document comprend une page de garde avec les informations de mission, une synthèse, des sections numérotées, des constats techniques, des photos légendées et un tableau de suivi des actions aux couleurs EXNOV.

## Configuration AWS

Copier les variables de `.env.example` dans `.env.local` (ou `.env`, également lu par Next.js), puis les compléter :

```dotenv
AWS_REGION=us-east-1
AWS_BEARER_TOKEN_BEDROCK=VOTRE_CLE_API_BEDROCK
BEDROCK_MODEL_ID=global.anthropic.claude-sonnet-4-6
```

Créer une **clé API Amazon Bedrock** dans la console du compte AWS qui sera facturé. Elle doit autoriser l’invocation du modèle et de son profil d’inférence. Il s’agit d’une clé Bedrock, et non d’un couple `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` ni d’une clé Anthropic. Cette version utilise l’authentification Bearer de Bedrock ; elle n’utilise pas la chaîne d’identifiants IAM du SDK AWS.

Le profil `global.anthropic.claude-sonnet-4-6` permet l’inférence interrégionale mondiale. `eu.anthropic.claude-sonnet-4-6` est l’alternative limitée à la géographie européenne depuis les régions d’appel compatibles. Choisir la région et le profil autorisés par votre compte et vos contraintes de localisation.

Redémarrer `npm run dev` après modification. Sur Vercel, renseigner ces mêmes variables dans les paramètres du projet et redéployer. Aucune de ces variables ne doit être préfixée par `NEXT_PUBLIC_`. Ne jamais committer les secrets.

Sans configuration, la rédaction affiche un message explicatif. **Voir un exemple** et son export PDF fonctionnent sans appel AWS. L’interface et les tests ne basculent jamais silencieusement vers un faux modèle.

## Utilisation

1. Choisir **Rapports IA** dans le header.
2. Choisir une trame (visite de chantier, avancement, diagnostic ou visite préalable à la réception), puis compléter les données connues. Une demande libre reste possible. Préciser le projet, la localisation, le destinataire, les dates, le périmètre et les constats.
3. Ajouter des photos JPG, PNG ou WebP si nécessaire, puis cliquer sur **Envoyer**.
4. Relire l’aperçu. Demander des modifications dans le même chat : ajouter une conclusion, déplacer une photo, préciser une observation, etc.
5. Télécharger le rapport PDF. **Nouveau rapport** efface la conversation et les images de la session.

## Structure des rapports de génie civil

- **Page de garde** : titre, projet, destinataire, référence, date du rapport, localisation, date de visite, version, rédacteur et vérificateur. Les données manquantes restent à renseigner ; les noms affichés ne constituent pas une signature ou une validation.
- **Synthèse** : état de la mission, constats déterminants, décisions attendues et limites des informations.
- **Sommaire** : ajouté à partir de cinq sections, avec les numéros réels des pages du PDF.
- **Corps du rapport** : organisé selon la mission et les consignes. Un suivi de chantier peut présenter le contexte, les documents disponibles, l’avancement par lot, les constats, les vérifications attendues et la conclusion. Un diagnostic ou une visite de réception suit une structure adaptée.
- **Constats techniques** : localisation, observation, origine de l’information, analyse et recommandation, présentées séparément. Une information communiquée ou une hypothèse ne devient pas un constat visuel.
- **Photos** : figures numérotées et légendées à proximité de la section concernée.
- **Plan d’actions** : localisation, action, responsable, échéance, priorité et état du suivi. Les valeurs inconnues restent à confirmer ; aucune action n’est déclarée terminée sans information explicite.

Les suggestions de révision permettent de développer les constats, préciser les actions ou raccourcir le rapport. Elles préparent une demande modifiable avant envoi. Les anciens rapports sans ces nouveaux champs restent acceptés et exportables.

Une réponse peut demander une précision avant de produire un rapport. L’annulation ou l’échec d’une requête conserve la demande et la dernière version. Retirer une photo la retire aussi du document. Les images restent disponibles pour les demandes suivantes. La rédaction peut prendre quelques minutes. Le chronomètre indique le temps écoulé ; il ne déclenche aucun appel supplémentaire. Le rapport utilise un outil de restitution non strict pour éviter la compilation initiale d’une grammaire JSON par Bedrock. La réponse est toujours validée intégralement avec Zod avant affichage.

## Données, limites et hébergement

- Les demandes, le rapport courant et toutes les photos jointes sont envoyés à AWS Bedrock à chaque demande. Les appels sont facturés sur votre compte AWS.
- La conversation et le rapport modifiable restent en mémoire pendant la session ; un rechargement les efface. **Enregistrer dans ce projet** conserve le PDF dans Drive en mode équipe, avec sa référence dans Neon ; en démonstration, il reste dans IndexedDB. Le PDF téléchargé reste aussi sur votre appareil. Les éventuels journaux d’invocation configurés sur votre compte AWS suivent vos réglages AWS.
- Six photos maximum par rapport, 12 Mo maximum par fichier original. Les photos sont converties en JPEG, redimensionnées à 1 600 pixels maximum et compressées sous 400 Ko avant envoi. Le PDF utilise ces versions optimisées.
- Une demande peut contenir 12 000 caractères. Une conversation est limitée à 20 demandes. Un rapport comporte jusqu’à 20 sections et 60 pages, dans la limite de longueur du modèle. Une réponse tronquée ou invalide est refusée et la dernière version est conservée.
- Le serveur limite le corps JSON à 3,8 Mo, contrôle les types d’images et valide les références des photos. Le contenu textuel est échappé et le navigateur PDF bloque les requêtes externes.
- `/api/rapports/chat` utilise Node.js et une durée déclarée de 300 secondes, compatible avec Vercel Fluid Compute ; le délai AWS est de 270 secondes et le navigateur attend au maximum 285 secondes. `/api/rapports/pdf` déclare 60 secondes. L’offre d’hébergement doit autoriser ces durées. L’appel n’est pas diffusé en streaming ; un chronomètre et une commande d’annulation sont affichés. Une demande effectue un seul appel Bedrock, sans nouvelle tentative automatique.
- En mode équipe, chaque appel vérifie la session et le rôle côté serveur. L’IA est accessible aux administrateurs, gérants/chefs de projets et techniciens Pro. Un quota quotidien persistant par utilisateur est défini par `TEAM_AI_DAILY_LIMIT` (50 par défaut, partagé entre les outils IA). La démonstration explicite désactive ces protections : voir [la configuration équipe](equipe-neon.md).

Le modèle rédige des constats et propositions à relire ; il ne certifie ni une conformité ni la sécurité d’un ouvrage. Les instructions lui demandent de signaler les informations manquantes, de distinguer faits et hypothèses, et de ne pas inventer de mesures ou de validations techniques.

## Délais et charge sur Vercel

L’inférence est exécutée chez AWS, pas dans la fonction Vercel. La route de chat attend la réponse, puis valide du JSON ; elle ne lance pas Chromium. L’aperçu est préparé dans le navigateur et le PDF est construit uniquement à la demande du téléchargement ou de l’enregistrement dans un projet.

Vercel Fluid Compute facture le CPU actif séparément du temps de mémoire provisionnée : une attente réseau consomme peu de CPU, mais sa durée n’est pas gratuite pour autant. Le correctif ne demande aucune augmentation de CPU ou de mémoire. Le plafond de 16 000 tokens de sortie reste une protection contre les réponses démesurées, pas une longueur à atteindre ; les consignes privilégient une rédaction compacte.

En cas de délai dépassé, l’application conserve le prompt et le dernier rapport et ne relance pas automatiquement AWS. La limite de 270 secondes borne toujours l’attente : elle ne garantit pas que toutes les générations termineront. Après une modification du code, **redéployer sur Vercel** ; changer seulement les variables d’environnement ne met pas à jour ces délais.

Le choix de l’outil non strict évite le délai documenté de compilation des nouveaux schémas stricts. Il conserve la validation locale et le rejet des réponses invalides, mais ne bénéficie plus de la garantie de conformité du décodage contraint AWS. Les erreurs AWS détaillées ne sont pas exposées au navigateur.

Références : [sorties structurées Bedrock et compilation](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html), [limites Vercel](https://vercel.com/docs/functions/limitations), [Fluid Compute](https://vercel.com/docs/fluid-compute).

## Architecture et vérification

- `src/lib/server/bedrock.ts` appelle l’API InvokeModel (format natif Anthropic) de **Bedrock Runtime** et impose un unique outil `submit_report` non strict. Il lit les arguments de cet outil et valide le document ; il n’exécute aucune action extérieure et ne poursuit pas une boucle d’outils. Le profil est configurable ; le modèle doit accepter le format natif Anthropic, les images et les outils forcés. La configuration du modèle est partagée avec CPS IA, qui conserve son propre format de réponse.
- `src/lib/report.ts` définit le contrat partagé, validé avec Zod côté serveur.
- `src/lib/document/brand.ts` contient les éléments de marque communs aux factures et aux rapports.
- `src/lib/document/report.ts` et `report-paginate.ts` construisent et paginent le HTML, commun à l’aperçu et au PDF.
- `src/components/AtelierRapport.tsx` gère la conversation et les pièces jointes en mémoire.

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run start
# Dans un autre terminal :
npm run test:e2e
npm run test:reports
```

Les tests utilisent des réponses Bedrock simulées et ne consomment pas de crédits AWS. Ils couvrent les erreurs, les révisions, les photos et la pagination réelle dans Chromium. Un essai réel avec votre compte reste nécessaire après configuration pour vérifier ses autorisations, quotas et la disponibilité du profil choisi.

Références : [Claude Sonnet 4.6 sur Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-4-6.html), [API Messages Anthropic](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages-request-response.html), [sorties structurées](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html).
