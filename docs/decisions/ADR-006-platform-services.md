# ADR-006 : Services Plateforme, Observabilité, Analytics, Stockage, PDF, Notifications et GDPR

## Statut
Accepté (Milestone 4B)

## Contexte
La plateforme SaaS Factory requiert un ensemble de services d'infrastructure et de conformité réutilisables, compatibles avec l'environnement serveur Cloudflare Workers / Node.js SSR :
1. **Observabilité & Suivi des Erreurs (Sentry)** : Capture des exceptions et messages d'erreur sans fuite de secrets ou de données sensibles.
2. **Analytics Serveur (PostHog)** : Envoi asynchrone sécurisé d'événements produit et d'identifications utilisateur.
3. **Stockage d'Objets (Supabase Storage)** : Gestion des fichiers et pièces jointes avec isolation stricte des chemins par utilisateur et protection anti-traversée (`path traversal`).
4. **Génération PDF Portable (pdf-lib)** : Moteur de rendu PDF 100% JavaScript en mémoire, sans accès au système de fichiers local ni processus externe.
5. **Notifications & Ordonnancement** : Gestion d'état robuste (`pending`, `scheduled`, `processing`, `sent`, `failed`, `cancelled`) et idempotence des alertes.
6. **Cycle de Vie du Compte & Conformité GDPR** : Export des données personnelles et suppression ordonnée des comptes multi-fournisseurs.

## Décisions

### 1. ObservabilityService & Adaptateur Sentry (`@sentry/cloudflare`)
- Frontière `IObservabilityService` / `IObservabilityAdapter` protégeant l'application d'un couplage direct avec le SDK Sentry.
- Règle de sécurité : Nettoyage et assainissement systématique des contextes (`sanitizeContext`) pour expurger les mots de passe, tokens Bearer, clés secrètes Stripe/Resend, chaînes de connexion PostgreSQL et données bancaires.
- Rendu & Télémétrie : Intégration de l'adaptateur via `@sentry/cloudflare` utilisant le transport d'envoi HTTP natif et l'analyseur de pile d'appels (`nodeStackLineParser`) pour la transmission effective des événements et la conservation des stack traces.
- En cas d'absence de configuration (DSN absent ou vide), l'adaptateur opère en mode no-op sécurisé (renvoie `null` pour les événements, aucun appel réseau, aucun identifiant synthétique fabriqué).

### 2. AnalyticsService & Adaptateur PostHog (Workers-native via HTTP `fetch`)
- Frontière `IAnalyticsService` / `IAnalyticsAdapter` pour `track`, `identify`, `page`, `flush` et `shutdown`.
- Implémentation native Cloudflare Workers : Envoi asynchrone d'événements produit via des requêtes HTTP POST directes (API `fetch` standard) à l'endpoint `/capture/` de PostHog, sans dépendance vers le paquet Node.js legacy (`posthog-node`).
- Transmissibilité sans temporisateur d'arrière-plan : Évite le déclenchement de timers persistants incompatibles avec le modèle d'exécution événementiel des Cloudflare Workers.
- Assainissement strict des propriétés (`sanitizeProperties`) interdisant toute fuite d'identifiants sensibles.

### 3. StorageService & Adaptateur Supabase Storage
- Frontière `IStorageService` / `IStorageAdapter` normalisant les résultats en `StorageResult<T>` (`{ data, error }`).
- Validation stricte des chemins (`validateStoragePath`) : interdiction formelle des séquences relatives (`..`, `./`), validation des caractères autorisés, et normalisation des séparateurs.
- Isolation des chemins par utilisateur via la méthode d'assistance `getUserScopedPath(userId, fileName)`.

### 4. PdfService (Moteur de rendu portable en mémoire)
- Implémenté avec `pdf-lib`, sans dépendance système native ni accès au système de fichiers (`fs`).
- Rendu vectoriel structuré (textes, en-têtes, tableaux, séparateurs, métadonnées documentaires).
- Sortie sous forme de flux binaire `Uint8Array` vérifié par son en-tête magique `%PDF-`.

### 5. NotificationService & Cycle d'état
- Adossé à la table PostgreSQL `notifications` requêtée via Drizzle ORM et Cloudflare Hyperdrive.
- Machine à états déterministe (`isValidTransition`) :
  - `pending` / `scheduled` → `processing`, `cancelled`
  - `processing` → `sent`, `failed`
  - `failed` → `processing` (retry), `cancelled`
  - États terminaux protégés (`sent`, `cancelled`) levant `NotificationStateError` en cas de tentative de modification illégale.

### 6. GdprService (Export de données & Suppression de compte)
- **Export de données (`exportUserData`)** : Collecte structurée des profils, abonnements, entitlements et notifications pour l'utilisateur authentifié.
- **Suppression ordonnée (`deleteUserAccount`)** :
  1. Suppression des notifications associées.
  2. Révocation / suppression des entitlements.
  3. Suppression des abonnements (les données comptables et factures Stripe sont conservées selon les obligations légales de conservation financière).
  4. Création d'une entrée de journal d'audit de suppression (`auditLogs`).
  5. Suppression du profil PostgreSQL.
  6. Nettoyage des fichiers du stockage utilisateur.
  7. Suppression du compte d'authentification (`authAdminClient.deleteUser`).
  8. Retour d'un reçu structuré `AccountDeletionReceipt`.
