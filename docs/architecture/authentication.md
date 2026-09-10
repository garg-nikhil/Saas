# Architecture d'Authentification — SaaS Factory (Milestone 3)

## 1. Vue d'ensemble

Le système d'authentification de SaaS Factory fournit une fondation d'identité et de session sécurisée, réutilisable pour *Planning Infirmier* et l'ensemble des futurs produits SaaS de l'usine.

Principes fondamentaux :
- **Fournisseur d'identité initial** : Supabase Auth est le fournisseur d'identité initial.
- **Frontière d'abstraction interne** : Le code applicatif (loaders, actions, composants React Router) dépend exclusivement du contrat d'interface `IAuthService`, sans couplage direct aux SDKs de Supabase.
- **SSR sur Cloudflare Workers** : Gestion des cookies de session via `@supabase/ssr` en environnement edge compatible Node.js (`nodejs_compat`).
- **Validation stricte côté serveur** : L'autorisation repose sur une identité vérifiée côté serveur via `getUser()`, et non sur les données non vérifiées de `getSession()`.
- **Intégrité des données applicatives** : Maintien strict de la chaîne de données validée en Milestone 2 :
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
- **Politiques RLS (Row-Level Security) : Différées (Deferred)** car l'architecture Hyperdrive actuelle mutualise les connexions sous un rôle PostgreSQL fixe sans propager automatiquement `auth.uid()` dans la session de transaction.

---

## 2. Frontière d'authentification interne (`IAuthService`)

### Rationale du découplage

Une dépendance directe du code applicatif à `@supabase/supabase-js` ou `@supabase/ssr` lierait de manière irréversible les produits SaaS à un seul fournisseur. Si des impératifs d'infrastructure, de souveraineté ou de conformité imposent une migration vers Cloudflare Access, Better-Auth, Auth0 ou un annuaire d'entreprise, cette transition doit s'opérer par l'écriture d'un nouvel adaptateur sans modification des routes, formulaires ou loaders métier.

### Flux architectural

```
Application (React Router loaders, actions & UI)
    ↓
IAuthService (Types de domaine : AuthUser, AuthSession, AuthResult)
    ↓
SupabaseAuthService (Adaptateur d'infrastructure)
    ↓
Supabase Auth (@supabase/ssr & API Auth)
```

### Contrat d'interface (`apps/foundation/app/auth/types.ts`)

```typescript
export interface IAuthService {
  getCurrentUser(): Promise<AuthUser | null>;
  getCurrentSession(): Promise<AuthSession | null>;
  signUp(input: SignUpInput): Promise<AuthResult<{ user: AuthUser | null; session: AuthSession | null }>>;
  signIn(input: SignInInput): Promise<AuthResult<{ user: AuthUser; session: AuthSession }>>;
  signOut(): Promise<AuthResult<void>>;
  requestPasswordReset(input: ResetPasswordInput): Promise<AuthResult<void>>;
  updatePassword(input: UpdatePasswordInput): Promise<AuthResult<void>>;
}
```

---

## 3. Modèle de Session et Sécurité des Cookies SSR

### Modèle de Session

```
Supabase Auth access token + refresh token
        ↓
SSR-managed secure cookies
        ↓
server-side Supabase Auth validation
```

### Propriétés de Sécurité des Cookies

Les cookies de session sont gérés par `@supabase/ssr` avec les attributs suivants :
- **Non chiffrés de manière indépendante** : Les cookies contiennent des jetons JWT signés par Supabase Auth (access token) et des jetons de rafraîchissement (refresh token). Ils ne sont pas présentés comme "chiffrés" car ils reposent sur la signature cryptographique standard des JWT et le chiffrement du canal de transport TLS (HTTPS).
- **Secure** : L'attribut `Secure` est activé en production et sur toute connexion HTTPS.
- **SameSite** : `SameSite=Lax` par défaut pour protéger contre les attaques CSRF tout en permettant les flux de navigation entrants légitimes.
- **Path** : `Path=/` pour couvrir l'ensemble du domaine applicatif.
- **HttpOnly** : Géré de manière appropriée par `@supabase/ssr` pour restreindre l'accès script côté client aux jetons de rafraîchissement.
- **Pas de localStorage** : L'autorisation côté serveur ne fait jamais confiance au `localStorage` du navigateur. Tous les flux d'autorisation et de validation de session s'exécutent côté serveur via les en-têtes `Cookie` de la requête HTTP.
- **Flux SSR compatible PKCE** : Prise en charge des flux PKCE pour l'échange de codes et la récupération de compte.
- **Gestion du rafraîchissement des jetons** : `@supabase/ssr` détecte l'expiration des jetons d'accès et utilise le jeton de rafraîchissement pour régénérer la session, émettant de nouveaux en-têtes `Set-Cookie` via le collecteur `responseHeaders`.

---

## 4. Validation de l'Identité Côté Serveur (Server-Side Identity Validation)

### Pourquoi `getUser()` et NON `getSession()` seul ?

Dans `@supabase/ssr`, `client.auth.getSession()` lit et décode localement le cookie de session sans contacter l'autorité d'authentification Supabase. Un cookie falsifié, révoqué ou expiré pourrait être lu par `getSession()` si les signatures locales ne sont pas vérifiées par le serveur central d'authentification.

À l'inverse, `client.auth.getUser()` envoie le jeton au serveur d'authentification Supabase (ou valide cryptographiquement les revendications avec révocation), garantissant :
1. Que l'utilisateur existe toujours en base d'authentification.
2. Que la session n'a pas été invalidée ou révoquée.
3. Que l'identité retournée (`user.id`) est formellement authentifiée.

### Chaîne d'autorisation

```
request cookies
    ↓
Supabase SSR client
    ↓
getUser()
    ↓
verified authenticated identity (AuthUser)
    ↓
requireAuth()
    ↓
application authorization (Drizzle queries filtered by profiles.userId = user.id)
```

La fonction `requireAuth(request, env)` garantit :
- L'appel obligatoire à `authService.getCurrentUser()`.
- La redirection automatique vers `/login` avec conservation de l'URL cible (`redirectTo`) si l'utilisateur n'est pas vérifié.
- La mise à disposition du contexte `user` certifié pour l'ensemble des loaders et actions.

---

## 5. Cartographie d'Identité et Synchronisation des Profils

### Cartographie

```
Supabase Auth (auth.users)
    user.id (UUID certifié)
         │
         ▼
PostgreSQL (public.profiles)
    user_id (varchar(255) UNIQUE NOT NULL)
         │
         ▼
    profile_id (UUID PK)
    ├── subscriptions (profile_id FK)
    ├── entitlements (profile_id FK)
    ├── audit_logs (profile_id FK)
    └── notifications (profile_id FK)
```

### Synchronisation idempotente (`syncUserProfile`)

La synchronisation des profils s'exécute de manière transactionnelle via Drizzle ORM et Hyperdrive :
1. Elle accepte uniquement une identité `user: AuthUser` issue du contexte serveur certifié (`requireAuth`). Aucun paramètre `userId` provenant du navigateur ou du corps de la requête n'est accepté.
2. La table `profiles` possède une contrainte `UNIQUE` stricte sur la colonne `user_id`.
3. L'insertion utilise la clause `onConflictDoNothing({ target: profiles.userId })`, neutralisant tout risque de création de profil en double en cas de requêtes concurrentes.

---

## 6. Décision Architecturale RLS : Différée (Deferred)

### Statut : **Deferred** (Différée)

### Rationale technique

1. **Architecture Hyperdrive** : Cloudflare Hyperdrive maintient un pool de connexions mutualisées vers PostgreSQL en utilisant les identifiants d'un rôle unique (`postgres` ou rôle applicatif dédié).
2. **Non-propagation de `auth.uid()`** : Les politiques RLS natives de PostgreSQL évaluant `auth.uid()` exigent que le contexte de session de transaction soit explicitement défini pour chaque connexion (`SET LOCAL request.jwt.claim.sub = '...'`), ou que les requêtes transitent par l'API PostgREST de Supabase.
3. **Interdiction de l'API Supabase DB** : L'accès direct aux tables via l'API REST de Supabase est proscrit par le mandat d'architecture (`Drizzle ORM → pg.Client → Cloudflare Hyperdrive → PostgreSQL`).
4. **Mécanisme d'autorisation d'autorité** :
   - Le contrôle d'accès au niveau applicatif (Application-Level Ownership) est actuellement le mécanisme d'autorité exclusif.
   - Tous les loaders et actions Drizzle filtrent impérativement sur `eq(profiles.userId, user.id)`.
   - Les identifiants provenant des paramètres de route ou du client sont strictement ignorés pour l'attribution de propriété.
5. **Réévaluation future** : La mise en place de RLS au niveau base de données pourra être réexaminée ultérieurement si une infrastructure de propagation de contexte par transaction est formellement validée avec Hyperdrive.

---

## 7. Sécurité des Redirections et Protection contre les Attaques

### Protection contre les redirections ouvertes (`getSafeRedirectUrl`)

Le paramètre `redirectTo` est soumis à une validation stricte :
- Seuls les chemins relatifs internes commençant par `/` sont autorisés.
- Les URLs externes absolues (`https://evil.example`), les chemins relatifs au protocole (`//evil.example`), les faux chemins avec antislash (`/\evil.example`) et les schémas JavaScript (`javascript:alert(1)`) sont systématiquement rejetés et remplacés par l'URL par défaut (`/app`).

### Prévention de l'énumération des utilisateurs

- La route `/login` renvoie un message d'erreur générique en cas d'identifiants incorrects.
- La route `/forgot-password` renvoie systématiquement une réponse positive identique, que l'adresse email existe ou non en base.

### Confidentialité des secrets et des jetons

- `SUPABASE_SERVICE_ROLE_KEY` n'est pas injecté dans les variables publiques de `wrangler.jsonc` et n'apparaît dans aucun bundle client.
- `DATABASE_URL` n'est pas disponible dans le runtime Cloudflare Worker (`client.ts` valide son absence).
- Aucun mot de passe, jeton d'accès, jeton de rafraîchissement ou jeton de récupération n'est journalisé dans les logs de l'application.
