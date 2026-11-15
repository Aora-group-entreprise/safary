# i-tafa V1

Application sociale i-tafa : Messages, discussions privées, Stories, profils, paramètres et authentification.

## Stack

- React 18, TypeScript et Vite
- Cloudflare Workers + Static Assets
- Cloudflare Durable Objects et WebSockets pour la messagerie temps réel, la synchronisation des boîtes de réception et la présence
- Supabase PostgreSQL, Storage et Edge Functions
- GitHub Actions pour la validation et le déploiement depuis `main`

Supabase Realtime n'est pas utilisé pour la messagerie : le temps réel applicatif est géré par le Worker Cloudflare.

## Architecture

- `/` — application React
- `/api/health` — état du Worker
- `/api/rest/v1/*` — PostgreSQL / PostgREST
- `/api/storage/v1/*` — Supabase Storage
- `/api/functions/v1/*` — Supabase Edge Functions
- `/realtime/chat/:conversationId` — WebSocket d'une conversation
- `/realtime/inbox/:userId` — événements de boîte de réception et présence des contacts
- `/realtime/presence/:userId` — présence et heartbeat

Le Worker ne contient aucune clé `service_role`. Les opérations privilégiées restent côté Edge Functions Supabase. L'application utilise des sessions i-tafa personnalisées et les politiques RLS correspondantes.

## Fonctions actuellement présentes

- Inscription en quatre étapes et connexion par pseudo/mot de passe
- Profils avec photo de profil, couverture et biographie
- Recherche de membres et conversations directes
- Messages texte, fichiers, images et vocaux
- Réactions, suppression pour soi/pour tous et confirmations de lecture
- Stories photo/vidéo de 48 heures, enregistrement des vues et liste des visiteurs pour le propriétaire
- Présence en ligne avec heartbeat et expiration de présence après perte de connexion
- Préférences de présence et notifications du navigateur lorsque l'application reste ouverte en arrière-plan
- Suppression du compte avec confirmation, révocation des sessions et nettoyage des médias associés

Les notifications du navigateur ne sont pas des notifications push garanties lorsque l'application est totalement fermée. Les notifications push en arrière-plan/fermée nécessitent un service push et des clés VAPID configurées. La récupération d'un mot de passe oublié nécessite aussi un moyen de vérification fiable (par exemple une adresse e-mail ou un numéro vérifié) qui n'est pas encore configuré.

## Déploiement Cloudflare

1. Créer ou sélectionner un compte Cloudflare.
2. Créer un API Token avec les droits nécessaires pour déployer Workers.
3. Dans GitHub > Settings > Secrets and variables > Actions, configurer :
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. Vérifier que la branche cible est `main`.
5. Chaque push lance la validation et le workflow de déploiement.
6. Le workflow construit `dist/` et exécute Wrangler.

La validation (TypeScript + build) s’exécute toujours. Le déploiement réel est lancé uniquement si les deux secrets Cloudflare sont présents. Sinon, le workflow se termine avec un avertissement et saute le déploiement : aucun Worker ne peut être déployé sans identifiants Cloudflare. Ne jamais committer ces secrets dans le dépôt.

## Développement local

1. Installer Node.js 22 ou plus récent.
2. Exécuter `npm install`.
3. Copier `.env.example` vers `.env` et renseigner la clé publique Supabase si nécessaire.
4. Lancer `npm run dev`.

Pour tester Worker et assets ensemble, exécuter `npm run dev:worker`.

## Commandes

- `npm run typecheck` — vérification TypeScript
- `npm run build` — build de production
- `npm run dev:worker` — lancement local Wrangler
- `npm run deploy` — build puis déploiement Cloudflare

## Backend Supabase

Les migrations du dossier `supabase/migrations` décrivent le schéma, les politiques RLS, l'authentification personnalisée, le nettoyage des Stories et les confirmations de lecture. Les fonctions Edge actives sont `safary-auth` et `cleanup-expired-stories`.

La migration `0019_idempotent_direct_conversations.sql` fait en sorte qu'une nouvelle discussion avec un membre réutilise la conversation directe existante au lieu d'en créer une deuxième.

## Vérifications avant ouverture

Le build ne remplace pas les tests fonctionnels. Tester avec deux comptes et deux appareils : inscription, reconnexion, édition de profil, recherche, création/réouverture de conversation, messages, pièces jointes, vocaux, réactions, confirmations « Vu », Stories, vues, suppression, présence après coupure réseau et paramètres. Vérifier les autorisations RLS et l'accès aux médias privés.


## Attention — historique des migrations de production

Le projet Supabase actif possède un historique de migrations horodaté dont les noms/versions ne correspondent pas exactement aux préfixes des fichiers SQL actuellement présents dans ce dépôt. La migration d’index `0021_message_metadata_user_indexes.sql` a été appliquée en production et est également versionnée ici. Ne pas lancer `supabase db push`, `db reset` ou une reconstruction de base avant d’avoir réconcilié l’historique complet (notamment les migrations historiques de bascule vers l’authentification SAFARY personnalisée) et testé sur une base de développement.
