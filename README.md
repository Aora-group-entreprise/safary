# SAFARY V1

Application sociale SAFARY — périmètre V1 limité aux 7 écrans définis : Messages, Discussion, Création de Story, Profil, Paramètres, Authentification et Visualisation de Story.

## Stack
- Frontend : React + TypeScript + Vite
- Backend / Auth / PostgreSQL / Realtime : Supabase
- Médias temporaires : Supabase Storage privé

## Installation locale
1. Installer Node.js LTS.
2. Lancer `npm install`.
3. Copier `.env.example` vers `.env`.
4. Renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (clé publique/publishable uniquement).
5. Exécuter les migrations SQL dans l'ordre : `0001_initial_schema.sql`, puis `0002_story_retention.sql`.
6. Lancer `npm run dev`.

## Sécurité de la base
- Toutes les tables applicatives ont RLS activé.
- Les clients authentifiés ne peuvent pas s'ajouter directement à une conversation. La création d'une conversation privée passe par `rpc('create_direct_conversation', { p_other_user })`, qui crée la conversation et ses deux adhésions dans une seule transaction.
- Les politiques d'accès aux messages vérifient l'appartenance à la conversation sans récursion RLS.
- Le bucket `stories` reste privé. Les médias ne sont lisibles que si un enregistrement Story correspondant existe et n'a pas expiré (ou s'il appartient au demandeur).
- Les profils sont lisibles par les utilisateurs connectés : ne stocke jamais de données privées dans `profiles`.
- Les droits Data API sont accordés explicitement à `authenticated`; aucune permission applicative n'est accordée à `anon`.
- Ne jamais placer une clé `service_role` ou une clé secrète dans le frontend.

## Conservation des Stories
- Durée de vie : 48 heures exactement à partir de la création, imposée par un trigger SQL.
- Bucket Storage privé, limite initiale de 50 Mo par fichier et types MIME autorisés explicitement.
- Les Stories expirées sont immédiatement masquées par les politiques SQL/Storage.
- Pour supprimer aussi les fichiers, déployer `supabase/functions/cleanup-expired-stories` puis configurer les secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` et `CRON_SECRET`.
- Planifier un appel POST régulier à la fonction avec l'en-tête `x-cron-secret`. Vérifier les journaux et la réponse `failed` pour repérer les suppressions à reprendre.
- Tant que la fonction n'est pas déployée et planifiée, les fichiers des Stories expirées peuvent continuer à occuper le stockage.

## Vérifications
- `npm run typecheck`
- `npm run build`
- Tester les politiques avec deux comptes distincts : un utilisateur ne doit jamais lire les messages d'une conversation dont il n'est pas membre, ni lire les médias expirés d'un autre compte.
- Vérifier le déclenchement de la fonction de nettoyage sur un environnement de test avant de la planifier en production.

## État fonctionnel actuel
Cette version corrige le blocage TypeScript de la publication de Story et renforce les migrations SQL et la fonction de nettoyage. Les conversations, messages, profils, authentification et écrans de paramètres visibles dans l'interface restent encore en partie des maquettes locales : ils ne constituent pas encore une messagerie persistante complète.