# Verification interne V1 - Memoire, persistance et economie

Date : 2026-08-21

## Memoire : local vs persistant

| Donnee | Stockage temporaire | Stockage persistant | Source de verite |
| --- | --- | --- | --- |
| Brouillon de probleme invite | localStorage/session navigateur | Aucun tant que non soumis | Navigateur, temporaire |
| Probleme soumis invite | JSON local uniquement en test/dev si Supabase absent | `needs` quand Supabase est disponible | Supabase en prod |
| Probleme utilisateur connecte | Cache UI/localStorage possible | `needs`, rattache a `user_id` | Supabase |
| Conversation / contexte structure | Cache UI possible | `needs.metadata`, `need_analysis`, `need_events`, `need_clarifications` | Supabase |
| Preferences / memoire autorisee | localStorage comme cache de confort | tables profil/preferences utilisateur, demandes de confidentialite | Supabase |
| Resultats et plans affiches | DOM/localStorage possible pour reprise courte | `need_analysis`, `needs.metadata.reasoning_state`, `need_events` | Supabase |
| Historique de besoins | Cache UI possible | `needs`, `need_events`, `need_feedback` | Supabase |
| Feedback / outcome | Aucun cache durable requis | `need_feedback`, `need_events`, `site_events` | Supabase |
| Wallet et credits | Affichage header/cache court | `wallet_ledger`, `user_wallets`, `usage_events`, `usage_reservations` | Backend + Supabase |
| Abonnements | Affichage UI | `subscriptions`, webhooks Stripe, ledger d'allocation | Stripe + backend + Supabase |
| Produits et solutions | Cache catalogue possible | `products`, `product_plans`, `solutions`, `need_solution_matches` | Supabase |

## Fallback JSON local

Le fallback JSON local est reserve aux tests et au developpement local. En production, il ne doit pas masquer une persistance Supabase indisponible.

- Autorise automatiquement hors production.
- Autorisable explicitement avec `CHRONOTRADE_ALLOW_LOCAL_JSON_FALLBACK=true`.
- En production sans opt-in explicite, une erreur Supabase reste visible.

## Economie gratuit / credits / abonnement

Ordre attendu :

1. Invite : une experience decouverte complete.
2. Puis compte requis pour continuer et sauvegarder durablement.
3. A la premiere ouverture wallet, bonus de bienvenue via reference idempotente `welcome:{userId}:v1`.
4. Quota gratuit mensuel du compte : `CHRONOTRADE_FREE_MONTHLY_CREDITS`.
5. Allocation abonnement eventuelle : `subscription_allowance`.
6. Credits wallet achetes : `credit_purchase`.

Ordre de consommation trace dans les reservations :

1. `free_entitlement`
2. `subscription_entitlement`
3. `wallet_credits`

Le quota gratuit reste distinct de l'abonnement : il est ajoute dans le calcul de disponibilite et ne disparait pas quand un abonnement est actif.

## Wallet

Les trois origines restent distinctes dans le ledger :

- `promotional` : bonus de bienvenue et credits promotionnels.
- `subscription` : allocation d'abonnement.
- `purchased` : credits achetes via Stripe.

Le ledger conserve `entry_type`, `external_reference`, `amount_credits`, `amount_cents`, `stripe_session_id`, `stripe_invoice_id`, `credit_bucket` et `credit_origin`.

## Profit Guard

Si un produit ou un plan contient un cout previsionnel (`estimated_cost_cents` ou `cost_cents`), la creation/synchronisation Stripe est bloquee si :

`prix < cout previsionnel + marge de securite`

Variables configurables :

- `CHRONOTRADE_PROFIT_GUARD_ENABLED`
- `CHRONOTRADE_PROFIT_GUARD_MIN_MARGIN_CENTS`
- `CHRONOTRADE_PROFIT_GUARD_MIN_MARGIN_RATE`

## Feedback et apprentissage

Les retours suivent la chaine :

`problem_id -> action -> solution -> outcome -> feedback`

Le lien est conserve par `need_feedback`, `need_events` et `site_events`. Les champs non garantis par schema sont conserves dans `metadata` pour ne pas casser la compatibilite.

ChronoTrade n'auto-modifie jamais le prompt de production depuis une conversation utilisateur. Le pipeline attendu reste :

`donnees -> feedback -> patterns/clusters -> recommandation d'amelioration -> validation humaine -> nouvelle prompt_version active`

