# SAFARY V1

Réseau social SAFARY — les 7 écrans convenus : Messages, Discussion, Création de Story, Profil, Paramètres, Authentification et Visualisation de Story.

## Stack

- React 18, TypeScript et Vite
- Cloudflare Workers + Static Assets pour servir le site et le proxy API sur le même domaine
- Supabase PostgreSQL, Storage, Edge Functions et Realtime
- GitHub Actions pour le déploiement automatique depuis `main`

## Architecture de production

Le navigateur utilise exclusivement le même domaine pour le site et les services Supabase :

- `/` — application React
- `/api/health` — état du Worker SAFARY
- `/api/rest/v1/*` — PostgreSQL / PostgREST
- `/api/storage/v1/*` — Supabase Storage
- `/api/functions/v1/*` — Supabase Edge Functions
- `/api/realtime/v1/*` — Supabase Realtime (y compris WebSocket)

Le Worker ne contient aucune clé `service_role`. Il transmet la clé publique envoyée par le client et laisse les contrôles RLS de Supabase appliquer les autorisations. Les clés privées restent exclusivement côté serveur Supabase.

## Déploiement Cloudflare

1. Créer ou sélectionner un compte Cloudflare.
2. Dans GitHub > Settings > Secrets and variables > Actions, ajouter :
   - `CLOUDFLARE_API_TOKEN` — token avec les droits de déploiement Workers.
   - `CLOUDFLARE_ACCOUNT_ID` — identifiant du compte Cloudflare.
3. Vérifier que le dépôt utilise la branche `main`.
4. Chaque push sur `main` lance le workflow `.github/workflows/cloudflare-deploy.yml`.
5. Le workflow installe les dépendances, construit `dist/` puis exécute `wrangler deploy`.
6. Dans Cloudflare, rattacher le domaine personnalisé au Worker `safary` après le premier déploiement.

Le projet Cloudflare est configuré dans `wrangler.jsonc`. L'URL Supabase non secrète y est déclarée dans `vars.SUPABASE_URL`. Aucun secret Supabase n'est requis par le proxy.

## Développement local

1. Installer Node.js 22 ou plus récent.
2. Exécuter `npm install`.
3. Copier `.env.example` vers `.env` et renseigner la clé publique Supabase si elle doit être remplacée.
4. Lancer `npm run dev`.

Vite proxifie localement `/api/*` vers le projet Supabase. Pour tester le Worker et les assets ensemble, exécuter `npm run dev:worker`.

## Commandes

- `npm run typecheck` — vérification TypeScript de l'application.
- `npm run build` — build de production.
- `npm run dev:worker` — build puis lancement local Wrangler.
- `npm run deploy` — build puis déploiement Cloudflare.

## Backend Supabase

Les migrations versionnées dans `supabase/migrations` sont déjà appliquées au projet SAFARY. Les tables principales incluent les comptes, sessions, profils, conversations, membres, messages, pièces jointes, Stories, vues et préférences. Les politiques RLS sont activées.

Les fonctions Edge actives sont `safary-auth` et `cleanup-expired-stories`. Le nettoyage des Stories expirées est planifié côté Supabase. L'authentification SAFARY utilise ses sessions applicatives personnalisées ; aucune clé privilégiée ne doit être exposée au navigateur.

## Vérifications avant ouverture

Le déploiement de l'infrastructure ne signifie pas que les tests fonctionnels sont terminés. Avant toute ouverture publique, tester sur deux comptes et deux appareils : inscription, reconnexion après rechargement, profil, recherche, conversation, messages, fichiers, Stories, expiration, déconnexion et accès refusé aux données privées. Vérifier aussi le flux Realtime/WebSocket sur le domaine Cloudflare.
