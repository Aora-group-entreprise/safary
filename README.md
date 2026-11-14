# SAFARY V1

Réseau social SAFARY — les 7 écrans convenus : Messages, Discussion, Création de Story, Profil, Paramètres, Authentification et Visualisation de Story. Le périmètre reste volontairement limité à ces écrans.

## Stack
- React 18, TypeScript et Vite
- Supabase Auth (téléphone + mot de passe), PostgreSQL et Realtime
- Supabase Storage privé pour les Stories

## Fonctionnalités connectées
- Inscription/connexion par numéro de téléphone et mot de passe, puis vérification SMS si activée dans Supabase Auth.
- Création automatique du profil et des préférences lors de la création d'un compte.
- Recherche des membres par nom utilisateur et démarrage d'une conversation privée.
- Historique des messages persisté dans PostgreSQL et écoute des nouveaux messages via Realtime.
- Stories photo/vidéo avec légende, URL signée privée, vues et suppression par le propriétaire.
- Expiration serveur après 48 heures.
- Modification du profil, statut en ligne, notifications et déconnexion.

## Configuration locale
1. Installer Node.js LTS.
2. Exécuter `npm install`.
3. Copier `.env.example` vers `.env`.
4. Renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`. Le projet SAFARY possède déjà une configuration publique de secours dans le client web ; ces variables permettent de remplacer la cible pour les environnements de déploiement. La valeur de la deuxième variable doit être une clé publique Supabase (publishable ou legacy anon), jamais une clé `service_role`/secret.
5. Exécuter `npm run dev`.
6. Vérifier `npm run typecheck` puis `npm run build`.

## Base Supabase
Les migrations sont versionnées dans `supabase/migrations` et ont été appliquées au projet `safary` :
1. `0001_initial_schema.sql` — tables, RLS, profils, conversations et publication Realtime.
2. `0002_story_retention.sql` — bucket privé et durée de vie de 48 h.
3. `0003_supporting_indexes.sql` — index supplémentaires.
4. `0004_story_cleanup_schedule.sql` — secret stocké dans Vault et nettoyage automatique toutes les heures via pg_cron + pg_net.
5. `0005_private_conversation_rpc.sql` — isole la fonction privilégiée de création de conversation dans le schéma privé.

Les profils sont visibles aux membres connectés pour permettre la recherche. Ne place aucune donnée privée dans la table `profiles`. Les conversations et messages sont limités aux membres par RLS. La fonction `create_direct_conversation` est volontairement SECURITY DEFINER : elle vérifie `auth.uid()`, refuse un destinataire absent ou identique et crée les deux adhésions atomiquement. Les clients ne disposent d'aucun droit d'insertion direct dans `conversation_members`.

## Stories : nettoyage
La base impose l'expiration exacte à 48 heures et masque immédiatement les Stories expirées. La fonction Edge `cleanup-expired-stories` est déployée. Le secret aléatoire est créé et conservé dans Supabase Vault ; pg_cron + pg_net appellent automatiquement la fonction chaque heure. La fonction utilise les variables serveur intégrées de Supabase et vérifie le secret côté serveur. Aucun secret de nettoyage n'est exposé au navigateur.

## Configuration Auth requise
Dans le dashboard Supabase, activer le fournisseur Phone et configurer un fournisseur SMS ainsi que les règles de vérification souhaitées. Sans fournisseur SMS configuré, l'inscription avec confirmation par SMS ne pourra pas aboutir. Configurer aussi les limites anti-abus et les modèles SMS avant une ouverture publique.

## État et limites
Les principaux parcours V1 sont désormais connectés au backend, mais une CI verte ne remplace pas les tests de bout en bout avec deux vrais comptes et deux appareils. Les vocaux, pièces jointes de messages, notifications push, modération, blocage/signalement et publication mobile ne font pas partie du parcours fonctionnel livré dans cette version. Ne pas annoncer l'application comme prête pour une ouverture publique avant ces tests et la configuration SMS/cron.
