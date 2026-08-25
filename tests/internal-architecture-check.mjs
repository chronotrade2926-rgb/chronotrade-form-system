import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workspace = resolve(root, "../../..");
const publicV2 = join(workspace, "ChronoTrade/SitesWeb/chronotrade-public-v2");
const serverPath = join(root, "server.js");
const server = readFileSync(serverPath, "utf8");

const checks = [];

function check(label, condition, details = "") {
  checks.push({ label, ok: Boolean(condition), details });
}

function includesAll(label, text, items) {
  const missing = items.filter((item) => !text.includes(item));
  check(label, missing.length === 0, missing.length ? `Manquant: ${missing.join(", ")}` : "");
}

const canonicalEvents = [
  "landing_view",
  "problem_started",
  "problem_submitted",
  "problem_understood",
  "clarification_requested",
  "free_plan_generated",
  "free_plan_viewed",
  "feedback_positive",
  "feedback_negative",
  "signup_started",
  "signup_completed",
  "return_visit",
  "second_problem",
  "solution_viewed",
  "credits_used",
  "topup_viewed",
  "checkout_started",
  "purchase_completed",
  "repeat_purchase",
  "resolved",
  "partially_resolved",
  "unresolved"
];

includesAll("analytics canonical events", server, canonicalEvents);
includesAll("analytics legacy aliases", server, ["home_viewed: \"landing_view\"", "need_started: \"problem_started\"", "problem_resolved: \"resolved\""]);
includesAll("problem engine fields", server, [
  "primary_problem",
  "secondary_problems",
  "desired_outcome",
  "constraints",
  "estimated_complexity",
  "solution_tags",
  "suggested_questions",
  "needs_clarification",
  "safe_to_process",
  "user_facing_suggestion",
  "narrative_state",
  "question_selector"
]);

includesAll("adaptive free plan", server, [
  "contextualFreePlan",
  "adaptStepToInteractionProfile",
  "refinePlanWithConversationMemory",
  "euroAmountsFromText",
  "D'apres les montants donnes",
  "Il reste donc environ",
  "Ne repartez pas sur ce qui a deja ete teste",
  "publicFreePlan(analysis, matches, need)"
]);

includesAll("contextual language model instructions", server, [
  "Contextualise toujours l'analyse",
  "Le plan gratuit doit etre specifique au cas ecrit",
  "Ne donne jamais une reponse pre-faite",
  "Distingue faits explicites, hypotheses et inconnus"
]);

const analysisIndex = server.indexOf("const analysisInsert = await supabaseInsert(\"need_analysis\"");
const matchingIndex = server.indexOf("const matches = analysis.safe_to_process ? await matchNeedSolutions");
check("diagnostic before matcher", analysisIndex > -1 && matchingIndex > analysisIndex, `analysis=${analysisIndex}, matcher=${matchingIndex}`);

includesAll("usage gate cycle", server, [
  "reserveUsageCredits",
  "settleUsageReservation",
  "releaseUsageReservation",
  "usage_reservations",
  "usage_settle",
  "options.chargeWallet === true",
  "not_billable"
]);

includesAll("weekly deep dive quota", server, [
  "FREE_WEEKLY_DEEP_DIVES",
  "weeklyDeepDiveWindow",
  "freeDeepDiveStatus",
  "subscriptionDeepDiveStatus",
  "deepDiveEntitlementStatus",
  "need_deep_dive",
  "free_weekly_deep_dive",
  "subscription_deep_dive",
  "subscription_depth",
  "free_deep_dive_exhausted",
  "/message"
]);

includesAll("deep dive consumption order", server, [
  "next_source",
  "free_weekly",
  "subscription_depth",
  "wallet_credits",
  "chargeWallet: consumesWalletCredits",
  "wallet_required"
]);

includesAll("cost guard", server, [
  "checkCostGuardBeforeAi",
  "AI_DAILY_COST_LIMIT_USD",
  "AI_KILL_SWITCH",
  "AI_REQUEST_COST_LIMIT_USD",
  "AI_USER_HOURLY_COST_LIMIT_USD",
  "AI_USER_DAILY_COST_LIMIT_USD",
  "AI_MONTHLY_COST_LIMIT_USD",
  "AI_GLOBAL_COST_LIMIT_USD",
  "AI_CIRCUIT_BREAKER_FAILURES",
  "ai_cost_guard_blocked",
  "cost_guard"
]);

includesAll("profit guard", server, [
  "validateProfitGuard",
  "PROFIT_GUARD_ENABLED",
  "PROFIT_GUARD_MIN_MARGIN_CENTS",
  "PROFIT_GUARD_MIN_MARGIN_RATE",
  "estimated_cost_cents",
  "minimum_price_cents"
]);

includesAll("production fallback guard", server, [
  "IS_PRODUCTION",
  "ALLOW_LOCAL_JSON_FALLBACK",
  "canUseLocalJsonFallback",
  "CHRONOTRADE_ALLOW_LOCAL_JSON_FALLBACK"
]);

includesAll("wallet provenance buckets", server, [
  "credit_bucket: \"promotional\"",
  "credit_origin: \"welcome_bonus\"",
  "credit_bucket: \"subscription\"",
  "credit_origin: \"subscription_allowance\"",
  "credit_bucket: \"purchased\"",
  "credit_origin: \"stripe_credit_purchase\""
]);

includesAll("stripe idempotence and subscriptions", server, [
  "recordStripeEventStart",
  "duplicate: true",
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "customer.subscription.created",
  "invoice.payment_succeeded"
]);

includesAll("admin backend guards", server, [
  "requireSupabaseSuperAdmin",
  "/api/admin/resolve/analytics",
  "/api/admin/security/summary",
  "/api/admin/products/sync-stripe",
  "/api/admin/products/resolve-alerts"
]);

includesAll("privacy account controls backend", server, [
  "/api/privacy/request",
  "delete_account",
  "rectification",
  "export",
  "privacy_requests"
]);

includesAll("resolve fallback local", server, [
  "saveLocalResolveNeed",
  "local_json_fallback",
  "resolve-needs.json"
]);

includesAll("learning pipeline separation", server, [
  "ai_prompt_versions",
  "prompt_version_id",
  "need_analysis_corrections",
  "human_validated",
  "NEEDS_HUMAN_REVIEW"
]);

const expectedSql = [
  "supabase_phase_5_18_resolve_core.sql",
  "supabase_phase_5_21_ai_need_analysis.sql",
  "supabase_phase_5_22_resolve_completion_privacy.sql",
  "supabase_phase_5_23_need_conversion_events.sql",
  "supabase_phase_5_24_need_ux_quality.sql",
  "supabase_phase_b_wallet_usagegate.sql",
  "supabase_phase_b_live_security_advisor_hardening.sql",
  "supabase_phase_5_30_private_product_storage_limits.sql"
];
check("sql architecture files present", expectedSql.every((file) => existsSync(join(root, file))), expectedSql.filter((file) => !existsSync(join(root, file))).join(", "));

const platformJs = readFileSync(join(publicV2, "assets/platform.js"), "utf8");
const v2Js = readFileSync(join(publicV2, "assets/v2.js"), "utf8");
const profileHtml = readFileSync(join(publicV2, "dashboard/profil/index.html"), "utf8");
includesAll("profile data and memory UX", profileHtml + platformJs, [
  "data-clear-local-memory",
  "data-profile-privacy-request",
  "delete_account",
  "chronotrade_interaction_profile"
]);
includesAll("frontend wallet and admin UX", platformJs, [
  "chronotradeCreditShortcut",
  "renderDashboardWalletBilling",
  "Meilleur equilibre",
  "subscription_deep_dives",
  "credits achetes",
  "Gestion admin",
  "bouchonnetflorent@gmail.com"
]);

const frontendPublic = platformJs + v2Js + readFileSync(join(publicV2, "assets/supabase-config.js"), "utf8");
check("no service role in active frontend", !/service_role|SUPABASE_SERVICE_ROLE|STRIPE_SECRET|OPENAI_API_KEY|MICROSOFT_CLIENT_SECRET/i.test(frontendPublic));

includesAll("v2 structured answer UX", v2Js, [
  "renderNeedFeedback",
  "renderNeedConversation",
  "submitNeedMessage",
  "data-v2-need-message",
  "v2-delayed-feedback",
  "problem_understood",
  "free_plan_generated",
  "clarification_requested"
]);

check(
  "frontend does not force catalogue product",
  !v2Js.includes("matches.unshift(auditExpressMatch"),
  "Analyse Express ne doit pas etre injectee cote frontend apres analyse."
);

includesAll("wallet realtime refresh", v2Js + readFileSync(join(publicV2, "assets/site-nav.js"), "utf8"), [
  "chronotrade:wallet-updated",
  "freeDeepDives",
  "subscriptionDeepDives",
  "entitlements",
  "site-credit-pill-v1"
]);

includesAll("super admin commerce audit", v2Js, [
  "renderCommerceAudit",
  "wallet_ledger",
  "stripe_events",
  "Audit credits, abonnements et Stripe",
  "stripe_session_id",
  "stripe_invoice_id"
]);

includesAll("feedback outcome chain", platformJs + v2Js, [
  "need_feedback",
  "need_id",
  "resolution_result",
  "match_acceptance_result",
  "feedback_stage",
  "solution_id",
  "action_taken",
  "feedback_positive",
  "feedback_negative",
  "partially_resolved",
  "unresolved"
]);

const failed = checks.filter((item) => !item.ok);
console.table(checks.map((item) => ({ check: item.label, ok: item.ok ? "YES" : "NO", details: item.details })));
if (failed.length) {
  console.error(`\n${failed.length}/${checks.length} controles d'architecture en echec.`);
  process.exitCode = 1;
} else {
  console.log(`\n${checks.length}/${checks.length} controles d'architecture OK.`);
}
