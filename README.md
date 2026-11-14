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
4. Créer le projet Supabase puis renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
5. Exécuter les migrations SQL dans l'ordre : `0001_initial_schema.sql`, puis `0002_story_retention.sql`.
6. Lancer `npm run dev`.

## Conservation des Stories
- Durée de vie : 48 heures exactement à partir de la création.
- Le trigger SQL impose `expires_at = created_at + 48 hours`.
- Le bucket Storage est privé, avec limite initiale de 50 Mo par fichier.
- L'application doit filtrer les stories expirées.
- Pour effacer physiquement les médias expirés, déployer `supabase/functions/cleanup-expired-stories` et planifier son exécution toutes les heures ou chaque jour.
- Définir les secrets Edge Function `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` et `CRON_SECRET`. Le planificateur doit envoyer l'en-tête `x-cron-secret`.
- Important : tant que la fonction de nettoyage n'est pas déployée et planifiée, les stories expirées sont masquées mais leurs fichiers peuvent encore occuper le stockage.

La clé `service_role` ne doit jamais être placée dans le frontend.

## État actuel
Le frontend contient les 7 écrans de la V1 et le flux de sélection/publication de Story. La connexion Auth, les données de profil, les conversations persistantes, les messages en temps réel, les fichiers et les vocaux restent à intégrer et tester avec le projet Supabase réel. Les conversations actuellement affichées sont des exemples visuels.
