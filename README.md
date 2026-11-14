# SAFARY

SAFARY V1 — réseau social avec interface sombre, accents fuchsia/violet, messagerie privée et stories.

## Stack de départ
- Frontend : React + TypeScript + Vite
- Backend : Supabase (Auth, PostgreSQL, Storage et Realtime)
- Icônes : Lucide React

Cette stack est la base technique de démarrage. Les limites de fichiers, règles de durée des stories et options de confidentialité restent à valider.

## Démarrage local
1. Installer Node.js LTS.
2. Exécuter npm install.
3. Copier .env.example vers .env.
4. Renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY depuis le projet Supabase.
5. Exécuter npm run dev.

## Base de données
Exécuter supabase/migrations/0001_initial_schema.sql dans le SQL Editor Supabase ou avec Supabase CLI.

## Scripts
- npm run dev : serveur local
- npm run typecheck : vérification TypeScript
- npm run build : compilation de production

## État
Ce commit pose le socle frontend, la navigation initiale et le schéma SQL avec RLS. Les données visibles dans l'interface sont des exemples visuels. L'authentification, les messages réels, les médias et les stories seront raccordés dans les étapes suivantes.

Ne jamais exposer la clé service_role dans le navigateur. Utiliser uniquement la clé publique anon/publishable côté frontend avec RLS activé.
