-- Phase 5.5 - Commerce configurable, CMS global et indexes de performance.
-- Deja applique sur le projet Supabase ChronoTrade le 2026-08-08.

alter table public.products drop constraint if exists products_product_type_check;
alter table public.products add constraint products_product_type_check check (product_type = any (array[
  'direct','personalise','sur_mesure','resource','playbook','template','course','app','audit','pack','agent_ai','automation','service','motion','freebie'
]::text[]));

alter table public.products drop constraint if exists products_delivery_type_check;
alter table public.products add constraint products_delivery_type_check check (delivery_type = any (array[
  'manual','questionnaire','download','access','digital_file','manual_audit','app_access','quote_service','free_digital','secure_link','formation','agent','automation','bundle'
]::text[]));

create index if not exists idx_admin_activity_log_actor_id on public.admin_activity_log(actor_id);
create index if not exists idx_entitlements_order_id on public.entitlements(order_id);
create index if not exists idx_entitlements_product_id on public.entitlements(product_id);
create index if not exists idx_ideas_user_id on public.ideas(user_id);
create index if not exists idx_orders_or_projects_promotion_id on public.orders_or_projects(promotion_id);
create index if not exists idx_product_reviews_order_id on public.product_reviews(order_id);
create index if not exists idx_product_reviews_user_id on public.product_reviews(user_id);
create index if not exists idx_products_category_id on public.products(category_id);
create index if not exists idx_promotion_redemptions_order_id on public.promotion_redemptions(order_id);
create index if not exists idx_promotion_redemptions_product_id on public.promotion_redemptions(product_id);
create index if not exists idx_promotion_redemptions_user_id on public.promotion_redemptions(user_id);
create index if not exists idx_promotions_product_id on public.promotions(product_id);
create index if not exists idx_promotions_user_id on public.promotions(user_id);
create index if not exists idx_scheduled_emails_product_id on public.scheduled_emails(product_id);
create index if not exists idx_scheduled_emails_user_id on public.scheduled_emails(user_id);
create index if not exists idx_subscriptions_plan_id on public.subscriptions(plan_id);
