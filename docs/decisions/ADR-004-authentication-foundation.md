# ADR-004 : Fondation d'Authentification et Découplage Fournisseur

## Statut
Accepté (Milestone 3)

## Contexte
La plateforme SaaS Factory doit fournir un socle d'authentification réutilisable pour *Planning Infirmier* et ses futurs dérivés verticaux.
Ce socle doit supporter :
1. L'exécution sur Cloudflare Workers (environnement compatible Node.js SSR avec le flag `nodejs_compat`).
2. L'authentification par session/cookie sécurisée côté serveur sans recours au `localStorage`.
3. L'intégration de Supabase Auth comme premier fournisseur d'identité sans pour autant coupler le code applicatif à l'écosystème Supabase.
4. Le respect absolu de la fondation base de données validée en Milestone 2 (`Drizzle ORM → pg.Client → Cloudflare Hyperdrive → PostgreSQL`).
5. La synchronisation automatique du profil utilisateur (`profiles.user_id` lié à `auth.users.id`).

## Décisions

### 1. Fournisseur d'identité initial et Frontière interne (`IAuthService`)
- Supabase Auth est le fournisseur d'identité initial.
- Une frontière d'abstraction interne `IAuthService` et des types de domaine (`AuthUser`, `AuthSession`, `AuthResult`) sont définis dans `apps/foundation/app/auth/types.ts`.
- Les routes React Router v8 (`/login`, `/signup`, `/app`, `/logout`, `/forgot-password`, `/reset-password`) interagissent exclusivement avec `IAuthService`.
- Aucune route ni composant UI n'importe directement de SDK Supabase.
- L'adaptateur `SupabaseAuthService` implémente `IAuthService` en utilisant `@supabase/ssr`.

### 2. Modèle de session et Sécurité des Cookies SSR
- Le modèle de session repose sur :
  ```
  Supabase Auth access token + refresh token
          ↓
  SSR-managed secure cookies
          ↓
  server-side Supabase Auth validation
  ```
- Les cookies ne sont pas qualifiés d'"encodés" ou de "chiffrés" de manière indépendante : ils contiennent les jetons JWT signés et jetons de rafraîchissement émis par Supabase Auth.
- Attributs de sécurité : `Secure` en HTTPS/production, `SameSite=Lax`, `Path=/`, `HttpOnly` géré par le SDK.
- Aucun jeton dans le `localStorage` n'est utilisé comme source d'autorisation côté serveur.

### 3. Validation de l'Identité Côté Serveur (Server-Side Identity Validation)
- L'autorisation côté serveur repose impérativement sur une identité vérifiée via `getUser()` (dans `authService.getCurrentUser()`), et non sur les données de session non vérifiées de `getSession()`.
- `requireAuth()` appelle `getCurrentUser()`, garantissant la validation cryptographique par le serveur d'authentification avant d'autoriser l'accès aux routes protégées.

### 4. Maintien de l'architecture Base de Données
- Supabase est utilisé **uniquement** pour l'authentification (identité, sessions, réinitialisation de mot de passe).
- Aucune API de base de données Supabase (PostgREST, `@supabase/postgrest-js`, `supabase.from()`) n'est utilisée pour interroger les tables applicatives.
- Toutes les données applicatives appartiennent à la chaîne :
  ```
  verified user.id
      ↓
  profiles.user_id
      ↓
  Drizzle ORM
      ↓
  pg.Client
      ↓
  Cloudflare Hyperdrive
      ↓
  PostgreSQL
  ```

### 5. Cartographie d'identité et Synchronisation idempotente
- L'identifiant utilisateur vérifié émis par Supabase (`user.id`) sert de référence unique dans la colonne `profiles.user_id` (PostgreSQL).
- La fonction `syncUserProfile` garantit une insertion idempotente (`onConflictDoNothing({ target: profiles.userId })`) pour éviter toute création en doublon lors de requêtes concurrentes.
- L'identifiant utilisateur provient exclusivement du contexte certifié `requireAuth`, et jamais des paramètres de requête du client.

### 6. RLS (Row-Level Security) : Différée (Deferred)
- **Statut : Deferred (Différée)**.
- **Rationale** : Cloudflare Hyperdrive mutualise les connexions PostgreSQL sous un rôle fixe (`postgres`). L'évaluation native de `auth.uid()` dans les politiques RLS exigerait une injection par transaction (`SET LOCAL request.jwt.claim.sub = '...'`) ou l'usage de l'API PostgREST Supabase (proscrite).
- **Autorité** : Les vérifications de propriété au niveau applicatif (Application-level ownership checks) constituent actuellement le mécanisme d'autorisation d'autorité exclusif (requêtes Drizzle filtrées par `eq(profiles.userId, user.id)`).
- **Évolution future** : L'implémentation de RLS pourra être réexaminée ultérieurement si une infrastructure de propagation de session compatible avec Hyperdrive est formellement établie.

## Conséquences

### Positives
- **Portabilité maximale** : Remplacer Supabase Auth par un autre fournisseur nécessite uniquement une nouvelle implémentation de `IAuthService`.
- **Sécurité SSR certifiée** : Validation par `getUser()` au niveau du serveur sans faire confiance aux données brutes du client.
- **Prévention de l'énumération** : Les routes de connexion et de réinitialisation renvoient des messages génériques neutralisant les attaques par énumération d'utilisateurs.
- **Protection contre les redirections ouvertes** : `getSafeRedirectUrl` neutralise tous les vecteurs de redirection malveillants.
