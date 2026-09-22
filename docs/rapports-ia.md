# Rapports IA EXNOV

Le sélecteur du header passe de **Factures / Devis** à **Rapports IA** sans perdre la saisie de la session. Le chat accepte une demande et jusqu’à six photos, puis permet de réviser le rapport par conversation. Le PDF A4 reprend exactement les composants d’en-tête, de pied de page, de polices et de filigrane des factures. Le corps du rapport utilise des titres numérotés, paragraphes, listes et photos légendées aux couleurs EXNOV.

## Configuration AWS

Copier les variables de `.env.example` dans `.env.local` (ou `.env`, également lu par Next.js), puis les compléter :

```dotenv
AWS_REGION=us-east-1
AWS_BEARER_TOKEN_BEDROCK=VOTRE_CLE_API_BEDROCK
BEDROCK_MODEL_ID=global.moonshotai.kimi-k3
```

Créer une **clé API Amazon Bedrock** dans la console du compte AWS qui sera facturé. Elle doit autoriser l’invocation du modèle et de son profil d’inférence. Il s’agit d’une clé Bedrock, et non d’un couple `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` ni d’une clé Moonshot. Cette version utilise l’authentification Bearer de Bedrock ; elle n’utilise pas la chaîne d’identifiants IAM du SDK AWS.

Le profil `global.moonshotai.kimi-k3` permet l’inférence interrégionale mondiale. `us.moonshotai.kimi-k3` est l’alternative limitée à la géographie US depuis les régions d’appel compatibles. Choisir la région et le profil autorisés par votre compte et vos contraintes de localisation.

Redémarrer `npm run dev` après modification. Sur Vercel, renseigner ces mêmes variables dans les paramètres du projet et redéployer. Aucune de ces variables ne doit être préfixée par `NEXT_PUBLIC_`. Ne jamais committer les secrets.

Sans configuration, la rédaction affiche un message explicatif. **Voir un exemple** et son export PDF fonctionnent sans appel AWS. L’interface et les tests ne basculent jamais silencieusement vers un faux modèle.

## Utilisation

1. Choisir **Rapports IA** dans le header.
2. Décrire le projet, le destinataire, la date, les constats et le type de rapport souhaité.
3. Ajouter des photos JPG, PNG ou WebP si nécessaire, puis cliquer sur **Envoyer**.
4. Relire l’aperçu. Demander des modifications dans le même chat : ajouter une conclusion, déplacer une photo, préciser une observation, etc.
5. Télécharger le rapport PDF. **Nouveau rapport** efface la conversation et les images de la session.

Une réponse peut demander une précision avant de produire un rapport. L’annulation ou l’échec d’une requête conserve la demande et la dernière version. Retirer une photo la retire aussi du document. Les images restent disponibles pour les demandes suivantes. La rédaction peut prendre quelques minutes, notamment lors de la première compilation du schéma structuré par Bedrock.

## Données, limites et hébergement

- Les demandes, le rapport courant et toutes les photos jointes sont envoyés à AWS Bedrock à chaque demande. Les appels sont facturés sur votre compte AWS.
- L’application ne sauvegarde ni conversation ni rapport en base de données ou dans `localStorage`. Les données restent dans l’état de la page ; un rechargement les efface. Le PDF téléchargé reste sur votre appareil. Les éventuels journaux d’invocation configurés sur votre compte AWS suivent vos réglages AWS.
- Six photos maximum par rapport, 12 Mo maximum par fichier original. Les photos sont converties en JPEG, redimensionnées à 1 600 pixels maximum et compressées sous 400 Ko avant envoi. Le PDF utilise ces versions optimisées.
- Une demande peut contenir 6 000 caractères. Une conversation est limitée à 20 demandes. Un rapport comporte jusqu’à 20 sections et 60 pages, dans la limite de longueur du modèle. Une réponse tronquée ou invalide est refusée et la dernière version est conservée.
- Le serveur limite le corps JSON à 3,8 Mo, contrôle les types d’images et valide les références des photos. Le contenu textuel est échappé et le navigateur PDF bloque les requêtes externes.
- `/api/rapports/chat` utilise Node.js et une durée déclarée de 180 secondes ; le délai AWS est de 170 secondes. `/api/rapports/pdf` déclare 60 secondes. L’offre d’hébergement doit autoriser ces durées. L’appel n’est pas diffusé en streaming ; un indicateur et une commande d’annulation sont affichés.
- Comme la facturation existante, cette version ne comporte pas d’authentification applicative. Pour un déploiement privé, activer une protection d’accès de l’hébergeur. Avant un accès public, ajouter authentification et quotas persistants par utilisateur pour maîtriser les dépenses AWS.

Le modèle rédige des constats et propositions à relire. Les instructions lui demandent de signaler les informations manquantes, de distinguer faits et hypothèses, et de ne pas inventer de mesures ou de validations techniques.

## Architecture et vérification

- `src/lib/server/bedrock.ts` appelle l’API Chat Completions de **Bedrock Runtime** et demande une sortie JSON structurée. Le modèle est configurable ; un autre modèle doit accepter les images et ce format de réponse.
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

Références : [Kimi K3 sur Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-moonshot-ai-kimi-k3.html), [API Chat Completions](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.html), [sorties structurées](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html).
