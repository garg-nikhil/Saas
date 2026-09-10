# ADR-005 : Services Commerciaux, Entitlements, Facturation et E-mail

## Statut
Accepté (Milestone 4A)

## Contexte
Le socle SaaS Factory a besoin de services métier et transactionnels réutilisables :
1. **Entitlements** : Vérification des fonctionnalités activées par compte/profil selon les forfaits souscrits.
2. **Facturation (Billing)** : Gestion des abonnements, checkout sessions, customer portal, et ingestion des webhooks Stripe.
3. **E-mail Transactionnel** : Envoi de messages (notifications, vérifications, alertes) via Resend avec découplage strict du fournisseur.

## Décisions

### 1. EntitlementService
- Résolution basée sur `profileId` vérifié côté serveur.
- Stockage direct dans la table PostgreSQL `entitlements` gérée par Drizzle ORM via Cloudflare Hyperdrive.
- Fallback sécurisé : toute fonctionnalité non accordée ou inconnue renvoie `false`.
- Aucune dépendance externe ni appel réseau tiers pour la vérification des droits.

### 2. BillingService & Adaptateur Stripe
- Frontière abstraite `IBillingService` découplant l'application du SDK `stripe`.
- Traitement asynchrone des webhooks Stripe (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`).
- Maintien d'un journal d'idempotence des événements (`webhook_events`) pour garantir l'unicité de traitement.
- Les routes applicatives consomment exclusivement `IBillingService`.

### 3. EmailService & Adaptateur Resend
- Frontière `IEmailService` et `IEmailAdapter`.
- Adaptateur `ResendEmailAdapter` isolé, validant les entrées, normalisant les erreurs en `{ data, error }` sans lancer d'exceptions non gérées.
- Journalisation sécurisée : interdiction de consigner les corps de message ou les identifiants sensibles.
