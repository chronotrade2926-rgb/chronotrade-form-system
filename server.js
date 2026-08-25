import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const dataDir = process.env.DATA_DIR ? normalize(process.env.DATA_DIR) : join(__dirname, "data");
const quotesDir = join(dataDir, "quotes");
const prospectsPath = join(dataDir, "prospects.json");
const outboxPath = join(dataDir, "email-outbox.json");
const followupsPath = join(dataDir, "followups.json");
const ordersPath = join(dataDir, "orders.json");
const productIntakesPath = join(dataDir, "product-intakes.json");
const resolveNeedsPath = join(dataDir, "resolve-needs.json");
const siteEventsPath = join(dataDir, "site-events.json");

const PORT = Number(process.env.PORT || 3030);
const PUBLIC_BASE_URL = cleanUrl(process.env.PUBLIC_BASE_URL || "");
const SITE_ORIGIN = process.env.SITE_ORIGIN || "https://chronotradehub.com";
const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "");
const SUPABASE_REST_URL = SUPABASE_URL ? `${SUPABASE_URL}/rest/v1` : "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_NEED_MODEL = process.env.OPENAI_NEED_MODEL || "gpt-5.6-luna";
const OPENAI_NEED_REASONING_EFFORT = process.env.OPENAI_NEED_REASONING_EFFORT || "low";
const OPENAI_NEED_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_NEED_MAX_OUTPUT_TOKENS || 900);
const MAX_NEED_TEXT_CHARS = Number(process.env.MAX_NEED_TEXT_CHARS || 1800);
const OPENAI_LUNA_INPUT_USD_PER_1M = Number(process.env.OPENAI_LUNA_INPUT_USD_PER_1M || 1);
const OPENAI_LUNA_OUTPUT_USD_PER_1M = Number(process.env.OPENAI_LUNA_OUTPUT_USD_PER_1M || 6);
const AI_NEED_TIMEOUT_MS = Number(process.env.AI_NEED_TIMEOUT_MS || 12000);
const AI_MATCH_THRESHOLD_HIGH = Number(process.env.AI_MATCH_THRESHOLD_HIGH || 0.82);
const AI_MATCH_THRESHOLD_LOW = Number(process.env.AI_MATCH_THRESHOLD_LOW || 0.55);
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || "";
const STRIPE_ANALYSE_EXPRESS_PRICE_ID = process.env.STRIPE_ANALYSE_EXPRESS_PRICE_ID || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const CREDIT_MIN_PURCHASE_EUR = Number(process.env.CHRONOTRADE_CREDIT_MIN_PURCHASE_EUR || 10);
const CREDITS_PER_EUR = Number(process.env.CHRONOTRADE_CREDITS_PER_EUR || 10);
const FREE_MONTHLY_CREDITS = Number(process.env.CHRONOTRADE_FREE_MONTHLY_CREDITS || 100);
const FREE_WEEKLY_DEEP_DIVES = Number(process.env.CHRONOTRADE_FREE_WEEKLY_DEEP_DIVES || 3);
const WELCOME_CREDITS = Number(process.env.CHRONOTRADE_WELCOME_CREDITS || 100);
const USAGE_GATE_ENFORCED = String(process.env.CHRONOTRADE_USAGE_GATE_ENFORCED || "").toLowerCase() === "true";
const USAGE_GATE_NEED_ANALYSIS_CREDITS = Math.max(1, Number(process.env.CHRONOTRADE_USAGE_GATE_NEED_ANALYSIS_CREDITS || 1));
const RESOLVE_SESSION_LIMIT_PER_HOUR = Math.max(1, Number(process.env.CHRONOTRADE_RESOLVE_SESSION_LIMIT_PER_HOUR || 8));
const RESOLVE_IP_LIMIT_PER_HOUR = Math.max(5, Number(process.env.CHRONOTRADE_RESOLVE_IP_LIMIT_PER_HOUR || 40));
const AI_DAILY_COST_LIMIT_USD = Math.max(0, Number(process.env.CHRONOTRADE_AI_DAILY_COST_LIMIT_USD || 5));
const AI_COST_GUARD_ENABLED = String(process.env.CHRONOTRADE_AI_COST_GUARD_ENABLED || "true").toLowerCase() !== "false";
const AI_KILL_SWITCH = String(process.env.CHRONOTRADE_AI_KILL_SWITCH || "").toLowerCase() === "true";
const AI_ESTIMATED_NEED_ANALYSIS_COST_USD = Math.max(0, Number(process.env.CHRONOTRADE_AI_ESTIMATED_NEED_ANALYSIS_COST_USD || 0.03));
const AI_REQUEST_COST_LIMIT_USD = Math.max(0, Number(process.env.CHRONOTRADE_AI_REQUEST_COST_LIMIT_USD || 0.25));
const AI_USER_HOURLY_COST_LIMIT_USD = Math.max(0, Number(process.env.CHRONOTRADE_AI_USER_HOURLY_COST_LIMIT_USD || 0.75));
const AI_USER_DAILY_COST_LIMIT_USD = Math.max(0, Number(process.env.CHRONOTRADE_AI_USER_DAILY_COST_LIMIT_USD || 2));
const AI_MONTHLY_COST_LIMIT_USD = Math.max(0, Number(process.env.CHRONOTRADE_AI_MONTHLY_COST_LIMIT_USD || 80));
const AI_GLOBAL_COST_LIMIT_USD = Math.max(0, Number(process.env.CHRONOTRADE_AI_GLOBAL_COST_LIMIT_USD || 500));
const AI_CIRCUIT_BREAKER_FAILURES = Math.max(1, Number(process.env.CHRONOTRADE_AI_CIRCUIT_BREAKER_FAILURES || 6));
const NODE_ENV = String(process.env.NODE_ENV || "").toLowerCase();
const IS_DEV_OR_TEST = ["test", "development", "dev", "local"].includes(NODE_ENV);
const IS_PRODUCTION = !IS_DEV_OR_TEST && (["production", "prod"].includes(NODE_ENV) || Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID) || SITE_ORIGIN.includes("chronotradehub.com"));
const ALLOW_LOCAL_JSON_FALLBACK = IS_DEV_OR_TEST || String(process.env.CHRONOTRADE_ALLOW_LOCAL_JSON_FALLBACK || "").toLowerCase() === "true";
const PROFIT_GUARD_ENABLED = String(process.env.CHRONOTRADE_PROFIT_GUARD_ENABLED || "true").toLowerCase() !== "false";
const PROFIT_GUARD_MIN_MARGIN_CENTS = Math.max(0, Number(process.env.CHRONOTRADE_PROFIT_GUARD_MIN_MARGIN_CENTS || 200));
const PROFIT_GUARD_MIN_MARGIN_RATE = Math.max(0, Number(process.env.CHRONOTRADE_PROFIT_GUARD_MIN_MARGIN_RATE || 0.25));
const SECURITY_LOG_SALT = process.env.CHRONOTRADE_SECURITY_LOG_SALT || process.env.ADMIN_API_KEY || process.env.STRIPE_WEBHOOK_SECRET || "chronotrade-v1";
const DEFAULT_BILLING_PLANS = [
  { code: "essentiel", name: "Essentiel", price_cents: 2000, currency: "EUR", monthly_credits: 250, deep_dives: 5, features: ["250 credits mensuels", "5 approfondissements inclus", "Quota gratuit conserve", "Historique et alertes sauvegardes"] },
  { code: "pro", name: "Pro", price_cents: 5000, currency: "EUR", monthly_credits: 700, deep_dives: 12, features: ["700 credits mensuels", "12 approfondissements inclus", "Priorite sur les analyses longues", "Meilleur equilibre usage / budget"] },
  { code: "max", name: "Max", price_cents: 10000, currency: "EUR", monthly_credits: 1600, deep_dives: 30, features: ["1600 credits mensuels", "30 approfondissements inclus", "Usage intensif et suivi avance", "Parametres recalibrables selon les couts reels"] }
];
const SUPER_ADMIN_EMAILS = new Set(
  (process.env.CHRONOTRADE_SUPER_ADMIN_EMAILS ||
    "bouchonnetflorent@gmail.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);
const DEFAULT_GOOGLE_BUSINESS_REVIEW_URL = "https://g.page/r/Ca68lNm5PPKMEBI/review";
const DEFAULT_GOOGLE_BUSINESS_PROFILE_URL = "https://www.google.com/search?q=ChronoTrade&stick=H4sIAAAAAAAA_-NgU1I1qDAxMDMzM002Mk00Skw2SrW0MqiwSE4zMk5OskyxtDRJSk5MXcTK7ZxRlJ-XH1KUmJIKAEWe0Vw3AAAA&hl=en-GB&mat=CTspJ23EUm1vElcBa0lj_9drynJWHP_mInqOnE3FOgciqrOI6NsRrc3ucF-NBEohPBpBLGqcJlkTjF8ipfyCty-pMVgqLsuXWbCJDnNJr2HF_ufTz3iVOEM9NnnmWnzK9sA&authuser=1&ved=2ahUKEwipp_6nj4-WAxU_TqQEHdF_FBQQ-MgIegQIDxAh";
const GOOGLE_BUSINESS_REVIEW_URL = normalizeGoogleReviewUrl(process.env.GOOGLE_BUSINESS_REVIEW_URL || DEFAULT_GOOGLE_BUSINESS_REVIEW_URL);
const GOOGLE_BUSINESS_PROFILE_URL = cleanUrl(process.env.GOOGLE_BUSINESS_PROFILE_URL || DEFAULT_GOOGLE_BUSINESS_PROFILE_URL);
const GOOGLE_BUSINESS_ACCOUNT_ID = process.env.GOOGLE_BUSINESS_ACCOUNT_ID || "";
const GOOGLE_BUSINESS_LOCATION_ID = process.env.GOOGLE_BUSINESS_LOCATION_ID || "";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || "";
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "";
let graphTokenCache = null;

function canUseLocalJsonFallback() {
  return ALLOW_LOCAL_JSON_FALLBACK && !SUPABASE_URL && !SUPABASE_SERVICE_ROLE_KEY;
}

const companyProfile = {
  name: "ChronoTrade",
  tagline: "Systemes digitaux pour entrepreneurs ambitieux",
  owner: process.env.OWNER_NAME || "Flo",
  ownerTitle: process.env.OWNER_TITLE || "Fondateur - ChronoTrade",
  email: process.env.OUTLOOK_FROM_EMAIL || "flo.chronotrade@outlook.fr"
};

const statuses = [
  "Nouveau",
  "En cours",
  "Devis a envoyer",
  "Devis envoye",
  "Relance",
  "Gagne",
  "Perdu"
];

const serviceLabels = {
  chronotrade_vision: "ChronoTrade Vision",
  chronotrade_launch: "ChronoTrade Launch",
  site_web: "Site web",
  automatisation_ia: "Automatisation IA",
  branding: "Branding",
  motion: "ChronoTrade Motion",
  application_web: "Application web",
  demande_generale: "Demande generale"
};

const formSchemas = {
  chronotrade_vision: {
    required: ["firstName", "lastName", "email", "currentSituation", "skills", "interests", "goals", "mainBlocker", "budget", "deadline"],
    fields: ["values", "entrepreneurProfile", "opportunities", "recommendedModel", "message"]
  },
  chronotrade_launch: {
    required: ["firstName", "lastName", "email", "company", "projectIdea", "stage", "mainBlocker", "budget", "deadline"],
    fields: ["targetCustomer", "neededAssets", "launchGoal", "message"]
  },
  site_web: {
    required: ["firstName", "lastName", "email", "company", "websiteType", "mainGoal", "budget", "deadline"],
    fields: ["currentWebsite", "pagesNeeded", "features", "brandAssets", "contentReady"]
  },
  automatisation_ia: {
    required: ["firstName", "lastName", "email", "company", "processToAutomate", "toolsUsed", "volume", "budget", "deadline"],
    fields: ["currentPain", "dataSources", "humanValidation", "expectedOutcome"]
  },
  branding: {
    required: ["firstName", "lastName", "email", "company", "brandNeed", "targetAudience", "styleDirection", "budget", "deadline"],
    fields: ["existingBrand", "deliverables", "competitors", "usageChannels"]
  },
  motion: {
    required: ["firstName", "lastName", "email", "motionType", "contentGoal", "platform", "format", "budget", "deadline"],
    fields: ["company", "phone", "brandAssets", "duration", "references", "variants", "message"]
  },
  application_web: {
    required: ["firstName", "lastName", "email", "company", "appGoal", "userTypes", "coreFeatures", "budget", "deadline"],
    fields: ["authNeeded", "paymentsNeeded", "adminNeeded", "integrations", "hostingPreference"]
  },
  demande_generale: {
    required: ["firstName", "lastName", "email", "company", "requestTopic", "message", "budget", "deadline"],
    fields: ["preferredContact", "source"]
  }
};

const commonFields = ["firstName", "lastName", "email", "phone", "company", "budget", "deadline", "message"];

const serviceMinimums = {
  chronotrade_vision: 490,
  chronotrade_launch: 750,
  site_web: 900,
  automatisation_ia: 850,
  branding: 650,
  motion: 149,
  application_web: 2800,
  demande_generale: 600
};

const quotePresets = {
  chronotrade_vision: {
    title: "ChronoTrade Vision",
    duration: "1 a 2 semaines",
    items: [
      ["Diagnostic personnel, forces et blocages", 190],
      ["Exploration des pistes et opportunites adaptees", 240],
      ["Selection d'idees et business model recommande", 290],
      ["Roadmap claire et prochaines etapes", 220]
    ]
  },
  chronotrade_launch: {
    title: "ChronoTrade Launch",
    duration: "1 a 3 semaines",
    items: [
      ["Clarification de l'idee et cadrage du projet", 250],
      ["Positionnement, offre et angle commercial", 350],
      ["Structure de lancement et priorites d'action", 450],
      ["Kit de demarrage digital et recommandations", 300]
    ]
  },
  site_web: {
    title: "Creation site web",
    duration: "2 a 4 semaines",
    items: [
      ["Cadrage, arborescence et direction UX", 250],
      ["Design interface responsive", 450],
      ["Integration site et optimisation mobile", 850],
      ["Formulaire, tracking et mise en ligne", 300]
    ]
  },
  automatisation_ia: {
    title: "Automatisation IA",
    duration: "1 a 3 semaines",
    items: [
      ["Audit du processus et scenario cible", 250],
      ["Construction du workflow automatise", 700],
      ["Connexion outils, tests et securisation", 450],
      ["Documentation courte et prise en main", 200]
    ]
  },
  branding: {
    title: "Branding et identite visuelle",
    duration: "1 a 3 semaines",
    items: [
      ["Audit marque et direction creative", 250],
      ["Logo ou systeme visuel principal", 500],
      ["Palette, typographies et charte rapide", 350],
      ["Declinaisons pour supports digitaux", 250]
    ]
  },
  motion: {
    title: "ChronoTrade Motion",
    duration: "3 a 10 jours selon le format",
    items: [
      ["Cadrage du message, accroche et objectif", 75],
      ["Direction visuelle et rythme de la sequence", 125],
      ["Creation motion, animation ou montage court", 180],
      ["Export optimise pour la plateforme choisie", 70]
    ]
  },
  application_web: {
    title: "Application web sur mesure",
    duration: "4 a 8 semaines",
    items: [
      ["Cadrage fonctionnel et parcours utilisateurs", 450],
      ["Design des ecrans principaux", 900],
      ["Developpement application et back-office", 2600],
      ["Tests, mise en ligne et passation", 650]
    ]
  },
  demande_generale: {
    title: "Accompagnement digital ChronoTrade",
    duration: "A definir apres cadrage",
    items: [
      ["Cadrage du besoin", 250],
      ["Conception de la solution", 450],
      ["Production et integration", 900],
      ["Tests et livraison", 250]
    ]
  }
};

function jsonResponse(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...corsHeaders()
  });
  res.end(payload);
}

function corsHeaders() {
  return {
    "access-control-allow-origin": SITE_ORIGIN,
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "content-type,accept,authorization,x-admin-key,stripe-signature",
    "vary": "Origin"
  };
}

function cleanUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizeGoogleReviewUrl(value) {
  const url = String(value || "").trim() || DEFAULT_GOOGLE_BUSINESS_REVIEW_URL;
  return url
    .replace("Ca68lNm5PPKMEBM", "Ca68lNm5PPKMEBI")
    .replace(/\/review\/?$/i, "")
    .replace(/\/+$/, "") + "/review";
}

function normalizeSupabaseUrl(value) {
  return cleanUrl(value)
    .replace(/\/rest\/v1$/i, "")
    .replace(/\/auth\/v1$/i, "")
    .replace(/\/storage\/v1$/i, "");
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(path, value) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

async function readRequestBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("application/json")) return JSON.parse(raw);
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  if (contentType.includes("multipart/form-data")) {
    const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1] || contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2];
    return parseMultipart(raw, boundary);
  }
  return {};
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function parseMultipart(raw, boundary) {
  if (!boundary) return {};
  const data = {};
  const parts = raw.split(`--${boundary}`);
  for (const part of parts) {
    const name = part.match(/name="([^"]+)"/)?.[1];
    if (!name) continue;
    const value = part.split(/\r?\n\r?\n/).slice(1).join("\n\n").replace(/\r?\n--$/, "").trim();
    if (!value) continue;
    if (data[name]) data[name] = Array.isArray(data[name]) ? [...data[name], value] : [data[name], value];
    else data[name] = value;
  }
  return data;
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanString(value).toLowerCase());
}

function normalizePayload(payload) {
  const normalized = {};
  const keys = new Set([...commonFields, ...Object.keys(payload || {})]);
  for (const key of keys) {
    const value = payload?.[key];
    if (Array.isArray(value)) {
      normalized[key] = value.map(cleanString).filter(Boolean);
    } else {
      normalized[key] = cleanString(value);
    }
  }
  return normalized;
}

function validateLead(service, payload) {
  const schema = formSchemas[service];
  const errors = {};
  if (!schema) {
    errors.service = "Formulaire inconnu.";
    return errors;
  }

  const fields = normalizePayload(payload);
  for (const field of schema.required) {
    if (!fields[field] || (Array.isArray(fields[field]) && fields[field].length === 0)) {
      errors[field] = "Champ obligatoire.";
    }
  }

  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
    errors.email = "Adresse email invalide.";
  }

  if (fields.phone && !/^[0-9+().\-\s]{6,}$/.test(fields.phone)) {
    errors.phone = "Numero de telephone invalide.";
  }

  return errors;
}

function splitName(fullName) {
  const parts = cleanString(fullName).split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() || "",
    lastName: parts.join(" ") || "-"
  };
}

function mapLiveDevisForm(fields) {
  const name = splitName(fields.nom);
  const type = cleanString(fields.type_projet);
  const serviceMap = {
    "Site web": "site_web",
    "Application web/mobile": "application_web",
    "Automatisation IA": "automatisation_ia",
    "Agent IA": "automatisation_ia",
    "Branding / identité visuelle": "branding",
    Autre: "demande_generale"
  };
  const service = serviceMap[type] || "demande_generale";
  const base = {
    ...name,
    email: fields.email,
    phone: fields.telephone,
    company: fields.entreprise || "Non precise",
    budget: fields.budget,
    deadline: fields.delai,
    message: fields.message,
    requestTopic: type || "Demande de devis",
    mainGoal: fields.objectif,
    appGoal: fields.description,
    processToAutomate: fields.description,
    brandNeed: type,
    targetAudience: "A qualifier",
    styleDirection: fields.description,
    websiteType: type || "A qualifier",
    description: fields.description
  };

  if (service === "site_web") base.mainGoal = fields.description;
  if (service === "application_web") {
    base.userTypes = "A qualifier";
    base.coreFeatures = fields.description;
  }
  if (service === "automatisation_ia") {
    base.toolsUsed = "A qualifier";
    base.volume = "A qualifier";
  }
  return { service, answers: base };
}

function mapLiveOsForm(fields) {
  const name = splitName(fields.nom);
  return {
    service: "automatisation_ia",
    answers: {
      ...name,
      email: fields.email,
      phone: fields.telephone,
      company: fields.entreprise,
      processToAutomate: fields.priorite_automatisation || fields.description_activite,
      currentPain: renderList(fields.perte_temps),
      toolsUsed: renderList(fields.outils),
      dataSources: fields.secteur,
      volume: "A qualifier",
      humanValidation: fields.installation_distance,
      expectedOutcome: fields.support_mensuel,
      budget: fields.budget,
      deadline: "Diagnostic sous 48h",
      message: fields.message,
      abonnement_ia: fields.abonnement_ia,
      description_activite: fields.description_activite
    }
  };
}

function mapLiveLaunchForm(fields) {
  const name = splitName(fields.nom);
  return {
    service: "chronotrade_launch",
    answers: {
      ...name,
      email: fields.email,
      phone: fields.telephone,
      company: fields.entreprise || "Projet en creation",
      projectIdea: fields.idee_projet,
      stage: fields.stade_projet,
      mainBlocker: fields.blocage_principal,
      targetCustomer: fields.client_cible,
      neededAssets: renderList(fields.besoins_launch),
      launchGoal: fields.objectif_launch,
      budget: fields.budget,
      deadline: fields.delai,
      message: fields.message,
      requestTopic: "ChronoTrade Launch - Structuration projet"
    }
  };
}

function mapLiveVisionForm(fields) {
  const name = splitName(fields.nom);
  return {
    service: "chronotrade_vision",
    answers: {
      ...name,
      email: fields.email,
      phone: fields.telephone,
      company: fields.entreprise || "Projet a definir",
      currentSituation: fields.situation_actuelle,
      skills: fields.competences,
      interests: fields.centres_interet,
      goals: fields.objectifs,
      mainBlocker: fields.blocages,
      values: fields.valeurs,
      entrepreneurProfile: fields.profil_souhaite,
      opportunities: fields.opportunites,
      recommendedModel: fields.modele_recherche,
      budget: fields.budget,
      deadline: fields.delai,
      message: fields.message,
      requestTopic: "ChronoTrade Vision - Trouver une direction claire"
    }
  };
}

function mapLiveBusinessForm(fields) {
  const name = splitName(fields.nom);
  return {
    service: "demande_generale",
    answers: {
      ...name,
      email: fields.email,
      phone: fields.telephone,
      company: fields.entreprise || "Non precise",
      requestTopic: `ChronoTrade Business - ${fields.besoin || "Demande business"}`,
      message: [
        fields.situation && `Situation : ${fields.situation}`,
        fields.objectif && `Objectif : ${fields.objectif}`,
        fields.urgence && `Urgence : ${fields.urgence}`
      ].filter(Boolean).join("\n"),
      budget: fields.budget,
      deadline: fields.delai,
      sector: fields.secteur,
      companySize: fields.taille,
      need: fields.besoin,
      urgency: fields.urgence
    }
  };
}

function mapLivePartnerForm(fields) {
  const name = splitName(fields.nom);
  return {
    service: "demande_generale",
    answers: {
      ...name,
      email: fields.email,
      phone: fields.telephone,
      company: fields.entreprise || fields.nom || "Candidat partenaire",
      requestTopic: `Candidature partenaire - ${fields.metier || "Profil a qualifier"}`,
      message: [
        fields.presentation && `Presentation : ${fields.presentation}`,
        fields.realisations && `Realisations : ${fields.realisations}`,
        fields.pourquoi && `Motivation : ${fields.pourquoi}`
      ].filter(Boolean).join("\n"),
      budget: "Non applicable - candidature partenaire",
      deadline: "A qualifier",
      location: fields.zone_geo,
      job: fields.metier,
      experience: fields.annees_experience,
      website: fields.site_internet,
      linkedin: fields.linkedin,
      portfolio: fields.portfolio,
      clientTypes: fields.clients_type,
      longTerm: fields.collaboration_long_terme
    }
  };
}

function mapLiveStudioForm(fields) {
  const name = splitName(fields.nom);
  const type = cleanString(fields.type_projet_studio);
  const typeKey = normalizeForScoring(type);
  const serviceMap = {
    "site web": "site_web",
    "landing page": "site_web",
    "refonte": "site_web",
    "application web": "application_web",
    "prototype": "application_web",
    "logo": "branding",
    "charte graphique": "branding",
    "identite visuelle complete": "branding",
    "direction artistique": "branding"
  };
  const service = serviceMap[typeKey] || "demande_generale";
  const base = {
    ...name,
    email: fields.email,
    phone: fields.telephone,
    company: fields.entreprise || "Non precise",
    budget: fields.budget,
    deadline: fields.delai,
    message: fields.message,
    requestTopic: `ChronoTrade Studio - ${type || "Projet studio"}`,
    description: fields.vision_projet,
    currentSituation: fields.situation_actuelle,
    existingWebsite: fields.site_existant,
    imageProblem: fields.probleme_image,
    references: fields.references,
    studioGoal: fields.objectif_studio
  };

  if (service === "site_web") {
    base.websiteType = type || "A qualifier";
    base.mainGoal = fields.objectif_studio || fields.vision_projet;
    base.currentWebsite = fields.site_existant;
    base.features = fields.vision_projet;
    base.pagesNeeded = type === "Landing page" ? "1 page" : "A qualifier";
  } else if (service === "application_web") {
    base.appGoal = fields.objectif_studio || fields.vision_projet;
    base.userTypes = "A qualifier";
    base.coreFeatures = fields.vision_projet;
  } else if (service === "branding") {
    base.brandNeed = type || "Branding";
    base.targetAudience = "A qualifier";
    base.styleDirection = fields.vision_projet || fields.probleme_image;
    base.existingBrand = fields.situation_actuelle;
    base.deliverables = type || "A qualifier";
    base.competitors = fields.references;
  }
  return { service, answers: base };
}

function mapLiveMotionForm(fields) {
  const name = splitName(fields.nom);
  const motionType = cleanString(fields.type_creation || fields.objectif);
  const contentGoal = cleanString(fields.objectif_contenu || fields.message);
  const platform = cleanString(fields.plateforme);
  const format = cleanString(fields.format);
  const pack = cleanString(fields.pack_motion);
  return {
    service: "motion",
    answers: {
      ...name,
      email: fields.email,
      phone: fields.telephone,
      company: fields.entreprise || "Non precise",
      requestTopic: `ChronoTrade Motion - ${motionType || "Creation courte"}`,
      motionType: motionType || "A qualifier",
      contentGoal: contentGoal || "A qualifier",
      platform: platform || "A definir",
      format: format || "A definir",
      brandAssets: fields.elements_marque || "A confirmer",
      duration: fields.duree_souhaitee || "Courte",
      references: fields.references || fields.inspiration,
      variants: fields.variantes || pack || "A definir",
      budget: fields.budget,
      deadline: fields.delai,
      message: [
        pack && `Pack demande : ${pack}`,
        contentGoal && `Objectif : ${contentGoal}`,
        platform && `Plateforme : ${platform}`,
        format && `Format : ${format}`,
        fields.message_complementaire && `Infos complementaires : ${fields.message_complementaire}`
      ].filter(Boolean).join("\n") || fields.message
    }
  };
}

function mapLiveSurMesureForm(fields) {
  const name = splitName(fields.nom);
  const need = cleanString(fields.besoin_principal);
  const description = cleanString(fields.description || fields.message);
  const serviceMap = {
    "site-plateforme": "site_web",
    application: "application_web",
    "ia-automatisation": "automatisation_ia",
    "design-identite": "branding",
    "motion-publicite": "motion",
    "strategie-lancement": "chronotrade_launch",
    "je-ne-sais-pas": "demande_generale",
    autre: "demande_generale"
  };
  const service = serviceMap[need] || "demande_generale";
  const common = {
    ...name,
    email: fields.email,
    phone: fields.telephone,
    company: fields.entreprise || "Non precise",
    budget: fields.budget || "A definir",
    deadline: fields.delai || "A definir",
    message: [
      description && `Description : ${description}`,
      fields.url_actuelle && `URL / reference : ${fields.url_actuelle}`,
      fields.outils_utilises && `Outils utilises : ${fields.outils_utilises}`,
      fields.plateforme_format && `Plateforme / format : ${fields.plateforme_format}`,
      fields.objectif_prioritaire && `Objectif prioritaire : ${fields.objectif_prioritaire}`
    ].filter(Boolean).join("\n") || description,
    requestTopic: `Demande sur mesure - ${need || "A qualifier"}`,
    description
  };

  if (service === "site_web") {
    return { service, answers: { ...common, websiteType: "Site / plateforme", mainGoal: description, currentWebsite: fields.url_actuelle, pagesNeeded: "A qualifier", features: description } };
  }
  if (service === "application_web") {
    return { service, answers: { ...common, appGoal: description, userTypes: "A qualifier", coreFeatures: description, integrations: fields.url_actuelle } };
  }
  if (service === "automatisation_ia") {
    return { service, answers: { ...common, processToAutomate: description, toolsUsed: fields.outils_utilises || "A qualifier", volume: "A qualifier", currentPain: description, expectedOutcome: fields.objectif_prioritaire } };
  }
  if (service === "branding") {
    return { service, answers: { ...common, brandNeed: "Design / identite", targetAudience: "A qualifier", styleDirection: description, existingBrand: fields.url_actuelle, deliverables: "A qualifier" } };
  }
  if (service === "motion") {
    return { service, answers: { ...common, motionType: "Publicite / motion", contentGoal: description, platform: fields.plateforme_format || "A definir", format: fields.plateforme_format || "A definir", brandAssets: fields.url_actuelle || "A confirmer" } };
  }
  if (service === "chronotrade_launch") {
    return { service, answers: { ...common, projectIdea: description, stage: "A qualifier", mainBlocker: fields.objectif_prioritaire || "A qualifier", targetCustomer: "A qualifier", launchGoal: description } };
  }
  return { service, answers: { ...common, requestTopic: `Demande sur mesure - ${need || "A qualifier"}`, message: common.message || "A qualifier" } };
}

function mapLiveFormByKind(kind, fields) {
  const mappers = {
    devis: mapLiveDevisForm,
    "sur-mesure": mapLiveSurMesureForm,
    vision: mapLiveVisionForm,
    launch: mapLiveLaunchForm,
    os: mapLiveOsForm,
    business: mapLiveBusinessForm,
    partner: mapLivePartnerForm,
    studio: mapLiveStudioForm,
    motion: mapLiveMotionForm
  };
  const mapper = mappers[kind];
  if (!mapper) return { service: "", answers: {} };
  return mapper(fields);
}

function renderList(value) {
  return Array.isArray(value) ? value.join(", ") : cleanString(value);
}

function buildSummary(lead) {
  const answers = lead.answers;
  const label = serviceLabels[lead.service] || lead.service;
  const important = Object.entries(answers)
    .filter(([key, value]) => !["firstName", "lastName", "email", "phone"].includes(key) && value && value.length !== 0)
    .map(([key, value]) => {
      const rendered = Array.isArray(value) ? value.join(", ") : value;
      return `- ${humanize(key)} : ${rendered}`;
    })
    .join("\n");

  return [
    `Nouvelle demande ChronoTrade - ${label}`,
    "",
    `Prospect : ${answers.firstName} ${answers.lastName}`,
    `Entreprise : ${answers.company || "Non precisee"}`,
    `Email : ${answers.email}`,
    `Telephone : ${answers.phone || "Non precise"}`,
    `Statut : ${lead.status}`,
    "",
    "Besoin client :",
    important || "- Aucun detail complementaire.",
    "",
    "Prochaine action conseillee : qualifier le besoin, confirmer le perimetre, puis envoyer un devis adapte."
  ].join("\n");
}

function buildReplyEmail(lead) {
  const firstName = lead.answers.firstName;
  const label = serviceLabels[lead.service] || "votre projet";
  return {
    to: lead.answers.email,
    subject: `Votre demande ChronoTrade - ${label}`,
    text: [
      `Bonjour ${firstName},`,
      "",
      `Merci pour votre demande concernant ${label}. J'ai bien recu les informations transmises et je vais analyser votre besoin pour vous proposer une reponse claire et adaptee.`,
      "",
      "Je reviens vers vous rapidement avec les prochaines etapes, les points a confirmer et une proposition si le perimetre est suffisamment precis.",
      "",
      "Bien cordialement,",
      "ChronoTrade"
    ].join("\n")
  };
}

function buildQuoteEmail(lead) {
  const firstName = lead.answers.firstName;
  const label = serviceLabels[lead.service] || "votre projet";
  const quote = lead.quote;
  const quoteLine = lead.quoteUrl
    ? `Lien du devis : ${lead.quoteUrl}`
    : "Le devis detaille est joint/preparable avec le mail.";
  return {
    to: lead.answers.email,
    subject: `Proposition de devis - ${label}`,
    text: [
      `Bonjour ${firstName},`,
      "",
      `Suite a votre demande pour ${label}, j'ai prepare une proposition structuree et adaptee aux elements transmis.`,
      "",
      "Resume de la proposition :",
      `- Offre : ${quote.title}`,
      `- Total estime : ${formatMoney(quote.total)} HT`,
      `- Delai estime : ${quote.duration}`,
      `- Devis : ${quote.number}`,
      `- Valable jusqu'au : ${quote.validUntilLabel}`,
      "",
      quoteLine,
      "",
      "Il reprend le perimetre, les livrables, le planning, les conditions de lancement et les prochaines etapes.",
      "",
      "Si cela vous convient, je peux ajuster le perimetre ou vous envoyer la version finale du devis.",
      "",
      "Bien cordialement,",
      `${companyProfile.owner}`,
      companyProfile.ownerTitle
    ].join("\n")
  };
}

function buildQuoteProposal(lead) {
  const preset = quotePresets[lead.service] || quotePresets.demande_generale;
  const budget = parseBudget(lead.answers.budget);
  const rawTotal = preset.items.reduce((sum, item) => sum + item[1], 0);
  const complexity = assessComplexity(lead);
  const complexityTotal = rawTotal * complexity.multiplier;
  const target = alignTotalWithBudget(complexityTotal, budget, lead.service);
  const ratio = target / rawTotal;
  const items = preset.items.map(([label, amount]) => ({
    label,
    amount: roundToNearest(amount * ratio, 25)
  }));
  const adjustedTotal = items.reduce((sum, item) => sum + item.amount, 0);

  return {
    number: `DEV-${new Date().getFullYear()}-${lead.id.slice(0, 8).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    createdAtLabel: formatDateTime(new Date()),
    validUntil: addDays(new Date(), 15).toISOString(),
    validUntilLabel: formatDate(addDays(new Date(), 15)),
    title: preset.title,
    duration: lead.answers.deadline && lead.answers.deadline !== "A qualifier" ? lead.answers.deadline : preset.duration,
    total: adjustedTotal,
    currency: "EUR",
    budgetRequested: lead.answers.budget || "A definir",
    complexity: complexity.label,
    complexityScore: complexity.score,
    pricingNote: buildPricingNote(budget, adjustedTotal, lead.service, complexity),
    items,
    assumptions: quoteAssumptions(lead),
    nextSteps: [
      "Validation du perimetre exact",
      "Confirmation des acces et contenus disponibles",
      "Paiement de lancement selon conditions",
      "Demarrage production apres validation"
    ]
  };
}

function normalizeForScoring(value) {
  return cleanString(Array.isArray(value) ? value.join(" ") : value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function assessComplexity(lead) {
  const text = normalizeForScoring(Object.values(lead.answers).flat().join(" "));
  let score = 0;
  const markers = [
    "application", "saas", "back-office", "back office", "dashboard", "paiement", "stripe",
    "connexion", "integration", "api", "automatisation", "agent ia", "ia", "notion",
    "crm", "espace client", "compte utilisateur", "authentification", "base de donnees",
    "multi", "sur mesure", "refonte", "e-commerce", "ecommerce", "reservation",
    "calendly", "workflow", "relance", "devis", "support client", "video", "reel",
    "short", "story", "animation", "logo anime", "publicite", "ads", "variantes"
  ];
  for (const marker of markers) if (text.includes(marker)) score += 1;

  if (lead.service === "application_web") score += 5;
  if (lead.service === "automatisation_ia") score += 3;
  if (lead.service === "motion") score += 1;
  if (lead.service === "site_web") score += 1;

  const pageText = normalizeForScoring(lead.answers.pagesNeeded || lead.answers.pageCount || "");
  const pageNumbers = [...pageText.matchAll(/\d+/g)].map((match) => Number(match[0]));
  if (pageNumbers.some((value) => value >= 5)) score += 2;
  if (pageNumbers.some((value) => value >= 10)) score += 3;

  const deadline = normalizeForScoring(lead.answers.deadline);
  if (deadline.includes("urgent") || deadline.includes("des que possible") || deadline.includes("moins de 2")) score += 2;

  const arrayFields = Object.values(lead.answers).filter(Array.isArray).reduce((sum, value) => sum + value.length, 0);
  if (arrayFields >= 4) score += 1;
  if (arrayFields >= 8) score += 2;

  if (score >= 10) return { score, label: "Complexe", multiplier: 1.55 };
  if (score >= 6) return { score, label: "Avance", multiplier: 1.25 };
  if (score >= 3) return { score, label: "Intermediaire", multiplier: 1.08 };
  return { score, label: "Simple", multiplier: 1 };
}

function buildPricingNote(budget, total, service, complexity) {
  const minimum = serviceMinimums[service] || serviceMinimums.demande_generale;
  if (budget.max && budget.max < minimum) {
    return `Budget indique inferieur au minimum realiste pour ce type de projet. Estimation basee sur le perimetre et la complexite ${complexity.label.toLowerCase()}, pas uniquement sur le budget annonce.`;
  }
  if (budget.max && total > budget.max * 1.25) {
    return `Le budget annonce semble sous-estime par rapport au perimetre demande. Le prix propose correspond a une livraison professionnelle et a la complexite ${complexity.label.toLowerCase()} detectee.`;
  }
  return `${budget.note} Complexite estimee : ${complexity.label}.`;
}

function parseBudget(value) {
  const text = cleanString(value)
    .replace(/\s/g, " ")
    .replace(/€/g, " EUR")
    .toLowerCase();
  const nums = [...text.matchAll(/\d[\d\s.]*/g)].map((match) => Number(match[0].replace(/[^\d]/g, "")));
  if (text.includes("moins") && nums[0]) return { min: 0, max: nums[0], note: "Perimetre ajuste pour respecter le budget indique." };
  if (text.includes("plus") && nums[0]) return { min: nums[0], max: nums[0] * 1.6, note: "Budget ouvert : proposition calibree sur un perimetre professionnel." };
  if (nums.length >= 2) return { min: nums[0], max: nums[1], note: "Prix aligne avec la fourchette budget indiquee." };
  if (text.includes("definir") || text.includes("sais pas") || !nums.length) return { min: 800, max: 2500, note: "Budget a confirmer : estimation de cadrage." };
  return { min: nums[0] * 0.8, max: nums[0] * 1.2, note: "Estimation alignee avec le montant communique." };
}

function alignTotalWithBudget(rawTotal, budget, service) {
  const minimum = serviceMinimums[service] || serviceMinimums.demande_generale;
  const realisticTotal = Math.max(rawTotal, minimum);
  if (!budget.max) return realisticTotal;

  const budgetIsTooLow = budget.max < minimum || budget.max < realisticTotal * 0.72;
  if (budgetIsTooLow) return realisticTotal;

  if (realisticTotal > budget.max && realisticTotal <= budget.max * 1.25) {
    return Math.max(minimum, (realisticTotal + budget.max) / 2);
  }

  if (realisticTotal < budget.min) return Math.max(minimum, budget.min);
  return realisticTotal;
}

function roundToNearest(value, step) {
  return Math.max(step, Math.round(value / step) * step);
}

function quoteAssumptions(lead) {
  const answers = lead.answers;
  const base = [
    "Le devis est base sur les informations fournies dans le formulaire.",
    "Les contenus, acces et validations client sont fournis dans des delais raisonnables.",
    "Toute fonctionnalite non mentionnee fera l'objet d'un ajustement de perimetre."
  ];
  if (lead.service === "site_web") base.push("Le tarif inclut une structure responsive et un formulaire de contact.");
  if (lead.service === "chronotrade_vision") base.push("Le tarif inclut une analyse de direction, plusieurs pistes adaptees et une roadmap exploitable.");
  if (lead.service === "automatisation_ia") base.push("Le tarif inclut la construction d'un workflow pilote et ses tests.");
  if (lead.service === "motion") base.push("Le tarif inclut une creation motion courte, un export adapte au format choisi et une base de message a valider.");
  if (lead.service === "application_web") base.push("Le tarif suppose une premiere version exploitable, pas un produit SaaS complet multi-modules.");
  if (answers.message) base.push(`Point client a garder en tete : ${answers.message}`);
  return base;
}

async function writeQuoteHtml(lead) {
  await mkdir(quotesDir, { recursive: true });
  const path = join(quotesDir, `${lead.quote.number}.html`);
  await writeFile(path, renderQuoteHtml(lead), "utf8");
  return path;
}

function renderQuoteHtml(lead) {
  const quote = lead.quote;
  const rows = quote.items.map((item) => `
        <tr>
          <td>${escapeHtml(item.label)}</td>
          <td class="amount">${formatMoney(item.amount)} HT</td>
        </tr>`).join("");
  const assumptions = quote.assumptions.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const nextSteps = quote.nextSteps.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${quote.number} - Devis ChronoTrade</title>
  <style>
    body{margin:0;background:#070711;color:#f7f7fb;font-family:Arial,Helvetica,sans-serif;}
    .page{width:900px;margin:28px auto;background:#0d0d19;border:1px solid rgba(155,98,245,.32);border-radius:18px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.38);}
    .top{background:linear-gradient(135deg,#131326 0%,#201044 58%,#0b0b18 100%);padding:34px 42px 24px;position:relative;}
    .top::after{content:"";display:block;height:4px;background:linear-gradient(90deg,#7b3fe4,#c9a84c,#9b62f5);position:absolute;left:0;right:0;bottom:0;}
    .brand-row{display:flex;justify-content:space-between;gap:28px;align-items:flex-start;}
    .brand{font-size:31px;font-weight:900;letter-spacing:.02em;}
    .muted{color:rgba(255,255,255,.62);font-size:13px;line-height:1.65;}
    .gold{color:#d8b86a;}
    .tag{display:inline-block;color:#d8b86a;font-weight:800;text-transform:uppercase;font-size:12px;letter-spacing:.12em;margin-bottom:8px;}
    .quote-meta{text-align:right;}
    .hero{padding-top:36px;max-width:640px;}
    .hero h1{font-size:32px;line-height:1.15;margin:0 0 12px;color:white;}
    .hero p{color:rgba(255,255,255,.72);font-size:14px;line-height:1.7;margin:0;}
    .banner{background:linear-gradient(90deg,rgba(123,63,228,.16),rgba(201,168,76,.12));border:1px solid rgba(201,168,76,.28);border-radius:12px;padding:14px 16px;margin:22px 0;color:#f6e8bd;font-size:13px;font-weight:700;}
    .content{padding:34px 42px;background:#fff;color:#1f2430;}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:24px;}
    .box{border:1px solid #e4e7ee;border-radius:10px;padding:18px;background:#fafbff;}
    h2{font-size:16px;margin:0 0 12px;color:#141827;text-transform:uppercase;letter-spacing:.04em;}
    p{line-height:1.6;margin:0 0 10px;}
    .pill-row{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0 24px;}
    .pill{background:#f4efff;border:1px solid #dfd1ff;color:#5c2bb8;border-radius:999px;padding:9px 12px;font-size:12px;font-weight:800;}
    table{width:100%;border-collapse:collapse;margin:18px 0 24px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;}
    th{background:#111827;color:#d8b86a;text-align:left;font-size:12px;text-transform:uppercase;padding:14px;border-bottom:1px solid #242a38;}
    td{padding:15px 14px;border-bottom:1px solid #edf0f5;}
    tr:last-child td{border-bottom:none;}
    .amount{text-align:right;font-weight:800;}
    .total{display:flex;justify-content:flex-end;margin:20px 0 28px;}
    .total-card{background:linear-gradient(135deg,#111827,#281454);color:white;border-radius:12px;padding:20px 24px;min-width:300px;border:1px solid rgba(155,98,245,.38);}
    .total-card span{display:block;color:#d8b86a;font-size:12px;text-transform:uppercase;font-weight:800;margin-bottom:6px;}
    .total-card strong{font-size:32px;}
    ul{padding-left:20px;line-height:1.75;margin-top:0;}
    .signature{margin-top:28px;border:1px solid #e5e7eb;border-radius:12px;padding:18px;background:linear-gradient(135deg,#fbfbff,#f7f2ff);}
    .signature-name{font-family:Georgia,serif;font-size:28px;font-style:italic;color:#3b1f75;margin:8px 0 2px;}
    .footer{background:#111827;color:rgba(255,255,255,.68);padding:24px 42px;font-size:12px;line-height:1.65;}
    .footer strong{color:white;}
  </style>
</head>
<body>
  <main class="page">
    <section class="top">
      <div class="brand-row">
        <div>
          <div class="brand">${escapeHtml(companyProfile.name)}</div>
          <div class="muted">${escapeHtml(companyProfile.tagline)}</div>
        </div>
        <div class="quote-meta">
          <div class="tag">Devis commercial</div>
          <div><strong>${quote.number}</strong></div>
          <div class="muted">Cree le ${quote.createdAtLabel}</div>
          <div class="muted">Valable jusqu'au ${quote.validUntilLabel}</div>
        </div>
      </div>
      <div class="hero">
        <h1>Proposition pour ${escapeHtml(lead.answers.company || `${lead.answers.firstName} ${lead.answers.lastName}`)}</h1>
        <p>Une proposition claire, actionnable et calibree selon votre demande, votre budget indique et les informations transmises via ChronoTrade.</p>
      </div>
      <div class="banner">ChronoTrade transforme votre besoin en systeme concret : design, automatisation, execution, suivi.</div>
    </section>
    <section class="content">
      <div class="grid">
        <div class="box">
          <h2>Client</h2>
          <p><strong>${escapeHtml(lead.answers.firstName)} ${escapeHtml(lead.answers.lastName)}</strong></p>
          <p>${escapeHtml(lead.answers.company || "Entreprise non precisee")}</p>
          <p>${escapeHtml(lead.answers.email)}</p>
        </div>
        <div class="box">
          <h2>Projet</h2>
          <p><strong>${escapeHtml(quote.title)}</strong></p>
          <p>Delai estime : ${escapeHtml(quote.duration)}</p>
          <p>Budget indique : ${escapeHtml(quote.budgetRequested)}</p>
        </div>
      </div>
      <div class="pill-row">
        <div class="pill">Prix aligne budget</div>
        <div class="pill">Devis structure</div>
        <div class="pill">Livraison pilote</div>
        <div class="pill">Suivi ChronoTrade</div>
      </div>
      <h2>Detail de la proposition</h2>
      <p>${escapeHtml(quote.pricingNote)}</p>
      <table>
        <thead><tr><th>Poste</th><th class="amount">Montant</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="total">
        <div class="total-card"><span>Total estime HT</span><strong>${formatMoney(quote.total)} HT</strong></div>
      </div>
      <div class="grid">
        <div>
          <h2>Hypotheses</h2>
          <ul>${assumptions}</ul>
        </div>
        <div>
          <h2>Prochaines etapes</h2>
          <ul>${nextSteps}</ul>
        </div>
      </div>
      <div class="signature">
        <div class="muted" style="color:#6b7280;">Signature</div>
        <div class="signature-name">${escapeHtml(companyProfile.owner)}</div>
        <strong>${escapeHtml(companyProfile.ownerTitle)}</strong>
        <p style="margin-top:8px;color:#4b5563;">${escapeHtml(companyProfile.email)}</p>
      </div>
    </section>
    <section class="footer">
      <strong>ChronoTrade</strong> - Devis prepare automatiquement a partir du formulaire du site chronotradehub.com. Le montant final peut etre ajuste apres validation du perimetre exact, des acces, des contenus et des contraintes techniques.
    </section>
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return cleanString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoney(value) {
  return `${Math.round(value).toLocaleString("fr-FR")} EUR`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(date);
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris"
  }).format(date);
}

function buildFollowupEmails(lead) {
  const firstName = lead.answers.firstName;
  const quote = lead.quote;
  const steps = [
    {
      delayDays: 3,
      subject: `Suite a votre devis ChronoTrade - ${quote.title}`,
      text: [
        `Bonjour ${firstName},`,
        "",
        `Je me permets de revenir vers vous concernant le devis ${quote.number} pour ${quote.title}.`,
        "",
        "Avez-vous pu le consulter ? Je peux l'ajuster si vous souhaitez modifier le perimetre, le budget ou le calendrier.",
        "",
        "Bien cordialement,",
        "ChronoTrade"
      ].join("\n")
    },
    {
      delayDays: 7,
      subject: `Relance devis ${quote.number}`,
      text: [
        `Bonjour ${firstName},`,
        "",
        "Je reviens vers vous au sujet de la proposition ChronoTrade envoyee precedemment.",
        "",
        "Si le projet est toujours d'actualite, je peux vous proposer un court point pour valider le perimetre et lancer la suite.",
        "",
        "Bien cordialement,",
        "ChronoTrade"
      ].join("\n")
    },
    {
      delayDays: 14,
      subject: `Dernier suivi - devis ChronoTrade`,
      text: [
        `Bonjour ${firstName},`,
        "",
        "Je fais un dernier suivi concernant votre demande. Sans retour de votre part, je mettrai simplement le dossier en pause.",
        "",
        "Vous pourrez bien sur revenir vers moi quand le moment sera plus adapte.",
        "",
        "Bien cordialement,",
        "ChronoTrade"
      ].join("\n")
    }
  ];
  const now = Date.now();
  return steps.map((step) => ({
    id: randomUUID(),
    leadId: lead.id,
    type: "followup",
    status: "scheduled",
    delayDays: step.delayDays,
    scheduledFor: new Date(now + step.delayDays * 24 * 60 * 60 * 1000).toISOString(),
    to: lead.email,
    subject: step.subject,
    text: step.text
  }));
}

function humanize(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

async function upsertLocalLead(lead) {
  const prospects = await readJson(prospectsPath, []);
  const index = prospects.findIndex((item) => item.email === lead.email && item.service === lead.service);
  if (index >= 0) {
    prospects[index] = {
      ...prospects[index],
      ...lead,
      id: prospects[index].id,
      createdAt: prospects[index].createdAt,
      updatedAt: new Date().toISOString()
    };
    await writeJson(prospectsPath, prospects);
    return prospects[index];
  }

  prospects.unshift(lead);
  await writeJson(prospectsPath, prospects);
  return lead;
}

async function addOutbox(items) {
  const outbox = await readJson(outboxPath, []);
  outbox.unshift(...items);
  await writeJson(outboxPath, outbox);
}

async function saveLocalResolveNeed(payload) {
  const needs = await readJson(resolveNeedsPath, []);
  const now = new Date().toISOString();
  const need = {
    ...payload,
    id: randomUUID(),
    status: payload.status || "NEW",
    created_at: now,
    updated_at: now,
    storage_mode: "local_json_fallback"
  };
  needs.unshift(need);
  await writeJson(resolveNeedsPath, needs.slice(0, 1000));
  return need;
}

async function saveLocalSiteEvent(payload) {
  const events = await readJson(siteEventsPath, []);
  const event = {
    id: randomUUID(),
    ...payload,
    created_at: new Date().toISOString(),
    storage_mode: "local_json_fallback"
  };
  events.unshift(event);
  await writeJson(siteEventsPath, events.slice(0, 2000));
  return event;
}

async function addFollowupsForLead(lead) {
  const followups = await readJson(followupsPath, []);
  if (followups.some((item) => item.leadId === lead.id)) return followups.filter((item) => item.leadId === lead.id);
  const planned = buildFollowupEmails(lead);
  followups.unshift(...planned);
  await writeJson(followupsPath, followups);
  await addOutbox(planned.map((item) => ({ ...item, createdAt: new Date().toISOString() })));
  return planned;
}

async function syncNotion(lead) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_DATABASE_ID) {
    return { enabled: false, message: "Variables Notion absentes." };
  }

  const headers = {
    authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "content-type": "application/json",
    "notion-version": "2022-06-28"
  };

  const query = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_DATABASE_ID}/query`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      filter: {
        and: [
          { property: "Email", email: { equals: lead.email } },
          { property: "Service", select: { equals: serviceLabels[lead.service] || lead.service } }
        ]
      }
    })
  });

  if (!query.ok) {
    return { enabled: true, ok: false, message: await query.text() };
  }

  const matches = await query.json();
  const properties = notionProperties(lead);
  const pageId = matches.results?.[0]?.id;
  const endpoint = pageId ? `https://api.notion.com/v1/pages/${pageId}` : "https://api.notion.com/v1/pages";
  const body = pageId
    ? { properties }
    : { parent: { database_id: process.env.NOTION_DATABASE_ID }, properties };

  const response = await fetch(endpoint, {
    method: pageId ? "PATCH" : "POST",
    headers,
    body: JSON.stringify(body)
  });

  return {
    enabled: true,
    ok: response.ok,
    mode: pageId ? "updated" : "created",
    message: response.ok ? "Synchronisation Notion reussie." : await response.text()
  };
}

async function supabaseInsert(table, payload) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { enabled: false, message: "Variables Supabase absentes." };
  }

  const response = await fetch(`${SUPABASE_REST_URL}/${table}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      prefer: "return=representation"
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return {
    enabled: true,
    ok: response.ok,
    table,
    data,
    message: response.ok ? "Synchronisation Supabase reussie." : text
  };
}

async function supabaseUpsert(table, payload, onConflict) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { enabled: false, message: "Variables Supabase absentes." };
  }

  const url = new URL(`${SUPABASE_REST_URL}/${table}`);
  if (onConflict) url.searchParams.set("on_conflict", onConflict);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return {
    enabled: true,
    ok: response.ok,
    table,
    data,
    message: response.ok ? "Synchronisation Supabase reussie." : text
  };
}

async function supabaseUserIdByEmail(email) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  const url = new URL(`${SUPABASE_REST_URL}/users`);
  url.searchParams.set("select", "id");
  url.searchParams.set("email", `eq.${cleanEmail}`);
  url.searchParams.set("limit", "1");
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      accept: "application/json"
    }
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => []);
  return Array.isArray(data) && data[0]?.id ? data[0].id : null;
}

async function awardUserBadgeByCode(userId, code, details = {}) {
  if (!userId || !code) return { skipped: true, reason: "missing_user_or_code" };
  const badge = await supabaseSelect("badge_catalog", { select: "id,code,label,status", code: `eq.${code}`, limit: "1" });
  const badgeRow = badge.ok && Array.isArray(badge.data) ? badge.data[0] : null;
  if (!badgeRow?.id || badgeRow.status !== "active") return { skipped: true, reason: "badge_unavailable", code };
  return supabaseUpsert("user_badges", {
    user_id: userId,
    badge_id: badgeRow.id,
    source_type: details.sourceType || "system",
    source_id: details.sourceId || null,
    metadata: {
      code,
      label: badgeRow.label,
      ...details
    }
  }, "user_id,badge_id");
}

async function unlockUserCosmetic(userId, cosmeticKey, payload = {}) {
  if (!userId || !cosmeticKey) return { skipped: true, reason: "missing_user_or_cosmetic" };
  return supabaseUpsert("user_cosmetics", {
    user_id: userId,
    cosmetic_type: payload.cosmeticType || "banner",
    code: cosmeticKey,
    cosmetic_key: cosmeticKey,
    label: payload.label || "Style ChronoTrade debloque",
    status: payload.status || "unlocked",
    equipped: Boolean(payload.equipped),
    unlocked_at: payload.unlockedAt || new Date().toISOString(),
    metadata: {
      sourceType: payload.sourceType || "system",
      sourceId: payload.sourceId || null,
      productId: payload.productId || null,
      productSlug: payload.productSlug || null,
      orderId: payload.orderId || null,
      accent: payload.accent || "violet"
    },
    updated_at: new Date().toISOString()
  }, "user_id,cosmetic_key");
}

async function supabaseSelect(table, params = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { enabled: false, ok: false, message: "Variables Supabase absentes." };
  }
  const url = new URL(`${SUPABASE_REST_URL}/${table}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  });
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      accept: "application/json"
    }
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { enabled: true, ok: response.ok, status: response.status, table, data, message: response.ok ? "Lecture Supabase reussie." : text };
}

async function supabaseUpdate(table, payload, filters = {}, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { enabled: false, ok: false, message: "Variables Supabase absentes." };
  }
  const url = new URL(`${SUPABASE_REST_URL}/${table}`);
  Object.entries(filters).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      prefer: options.returnRepresentation === false ? "return=minimal" : "return=representation"
    },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { enabled: true, ok: response.ok, status: response.status, table, data, message: response.ok ? "Mise a jour Supabase reussie." : text };
}

async function supabaseProductBySlugOrId({ slug, productId, stripePriceId }) {
  const select = "id,title,slug,short_description,description,product_type,delivery_type,price_cents,currency,stripe_product_id,stripe_price_id,stripe_price_amount,stripe_price_currency,stripe_price_active,stripe_last_sync_at,stripe_sync_error,pricing_model,billing_model,credit_cost,compatible_subscription_codes,problem_solved,solution_keywords,target_profile,solution_instructions,access_rights,availability,lifecycle_status,cta_mode,provider_type,status,checkout_url,form_url,current_version,delivery_config,email_config,commerce_config,presentation_config,social_proof_config,metadata";
  if (productId) {
    const result = await supabaseSelect("products", { select, id: `eq.${productId}`, limit: "1" });
    return result.ok && Array.isArray(result.data) ? result.data[0] || null : null;
  }
  if (stripePriceId) {
    const result = await supabaseSelect("products", { select, stripe_price_id: `eq.${stripePriceId}`, limit: "1" });
    return result.ok && Array.isArray(result.data) ? result.data[0] || null : null;
  }
  if (slug) {
    const result = await supabaseSelect("products", { select, slug: `eq.${slug}`, limit: "1" });
    return result.ok && Array.isArray(result.data) ? result.data[0] || null : null;
  }
  return null;
}

async function supabaseProductPlan({ planId, productId, slug }) {
  if (!planId && !slug) return null;
  const params = {
    select: "id,product_id,name,slug,pricing_model,billing_model,credit_cost,access_rights,price_cents,currency,interval,interval_count,trial_days,stripe_price_id,stripe_price_amount,stripe_price_currency,stripe_price_active,status,metadata"
  };
  if (planId) params.id = `eq.${planId}`;
  if (slug) params.slug = `eq.${slug}`;
  if (productId) params.product_id = `eq.${productId}`;
  params.limit = "1";
  const result = await supabaseSelect("product_plans", params);
  return result.ok && Array.isArray(result.data) ? result.data[0] || null : null;
}

const resolveRiskRules = [
  { status: "REJECTED_ILLEGAL", reason: "illegal_request", terms: ["faux document", "faux papiers", "fraude", "arnaque", "pirater", "hacker", "voler un compte", "carte bancaire volee", "blanchiment"] },
  { status: "REJECTED_UNSAFE", reason: "unsafe_request", terms: ["arme", "explosif", "violence", "doxxing", "harceler", "pornographie explicite", "atteinte a la vie privee"] }
];

const needAnalysisSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary", "primary_problem", "secondary_problems", "desired_outcome", "user_type", "industry",
    "category", "subcategory", "urgency", "budget_if_mentioned", "constraints", "solution_tags",
    "commercial_intent", "repeatability_score", "estimated_complexity", "confidence_score",
    "needs_clarification", "needs_human_review", "safe_to_process", "moderation_reason", "rejection_reason_if_any", "suggested_questions",
    "user_facing_suggestion"
  ],
  properties: {
    summary: { type: "string" },
    primary_problem: { type: "string" },
    secondary_problems: { type: "array", items: { type: "string" } },
    desired_outcome: { type: "string" },
    user_type: { type: "string" },
    industry: { type: "string" },
    category: { type: "string" },
    subcategory: { type: "string" },
    urgency: { type: "string", enum: ["low", "medium", "high", "unknown"] },
    budget_if_mentioned: { type: "string" },
    constraints: { type: "string" },
    solution_tags: { type: "array", items: { type: "string" } },
    commercial_intent: { type: "string", enum: ["low", "medium", "high", "unknown"] },
    repeatability_score: { type: "number" },
    estimated_complexity: { type: "string", enum: ["simple", "medium", "advanced", "complex", "unknown"] },
    confidence_score: { type: "number" },
    needs_clarification: { type: "boolean" },
    needs_human_review: { type: "boolean" },
    safe_to_process: { type: "boolean" },
    moderation_reason: { type: "string" },
    rejection_reason_if_any: { type: "string" },
    suggested_questions: { type: "array", items: { type: "string" } },
    user_facing_suggestion: { type: "string" }
  }
};

function detectResolveRiskServer(text) {
  const normalized = normalizeForScoring(text);
  return resolveRiskRules.find((rule) => rule.terms.some((term) => normalized.includes(normalizeForScoring(term)))) || null;
}

function clampScore(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function arrayOfCleanStrings(value, limit = 12) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanString).filter(Boolean).slice(0, limit);
}

async function activeNeedPrompt() {
  const fallback = {
    id: null,
    name: "need_analysis",
    version: "fallback",
    usage: "resolve_need_analysis",
    model: OPENAI_NEED_MODEL,
    prompt: "Analyse une demande ChronoTrade en donnees structurees utiles. Ne jamais inventer de solution disponible."
  };
  const result = await supabaseSelect("ai_prompt_versions", {
    select: "id,name,version,usage,model,prompt,active,metadata",
    usage: "eq.resolve_need_analysis",
    active: "eq.true",
    order: "created_at.desc",
    limit: "1"
  });
  return result.ok && Array.isArray(result.data) && result.data[0] ? result.data[0] : fallback;
}

function parseOpenAIJsonResponse(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return JSON.parse(payload.output_text);
  const texts = [];
  for (const item of payload?.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) texts.push(content.text);
      if (content.type === "text" && content.text) texts.push(content.text);
    }
  }
  if (!texts.length) throw new Error("Reponse IA vide.");
  return JSON.parse(texts.join("\n"));
}

async function callNeedAnalysisModel({ need, prompt }) {
  if (!OPENAI_API_KEY) return { skipped: true, reason: "OPENAI_API_KEY missing" };
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), AI_NEED_TIMEOUT_MS);
  const modelInputText = cleanString(need.raw_text).slice(0, MAX_NEED_TEXT_CHARS);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${OPENAI_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: prompt.model || OPENAI_NEED_MODEL,
        reasoning: { effort: OPENAI_NEED_REASONING_EFFORT },
        max_output_tokens: OPENAI_NEED_MAX_OUTPUT_TOKENS,
        input: [
          {
            role: "system",
            content: [
              prompt.prompt,
              "Tu ne dois pas afficher de raisonnement interne.",
              "Tu ne dois pas inventer de produit, service ou partenaire comme disponible.",
              "Si le besoin manque d'informations, propose une seule question prioritaire par defaut, uniquement si sa reponse peut changer la prochaine action. Tu peux proposer jusqu'a 3 questions seulement si elles sont vraiment critiques.",
              "Adapte le niveau de langage au profil d'interaction fourni sans changer le fond logique.",
              "Contextualise toujours l'analyse par rapport au probleme exact, aux precisions deja donnees, aux actions deja proposees et aux retours utilisateur.",
              "Le plan gratuit doit etre specifique au cas ecrit : utilise les montants, contraintes, objectifs, echecs precedents et faits explicites quand ils existent.",
              "Ne donne jamais une reponse pre-faite. Si une precision ajoutee change le diagnostic, le plan doit devenir plus precis et expliquer ce qui change.",
              "Distingue faits explicites, hypotheses et inconnus. N'affirme pas une cause que l'utilisateur n'a pas donnee.",
              "Retourne uniquement l'objet JSON conforme au schema."
            ].join("\n")
          },
          {
            role: "user",
            content: [
              `Besoin brut: ${modelInputText}`,
              `Profil: ${need.user_type || "non precise"}`,
              `Profil d'interaction: ${JSON.stringify(interactionProfileFromNeed(need))}`,
              `Secteur: ${need.industry || "non precise"}`,
              `Objectif detecte: ${need.objective || "non precise"}`,
              `Urgence/priorite: ${need.priority || need.urgency || "non precise"}`
            ].join("\n")
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "chronotrade_need_analysis",
            strict: true,
            schema: needAnalysisSchema
          }
        }
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error?.message || `OpenAI ${response.status}`);
    return { ok: true, payload, analysis: parseOpenAIJsonResponse(payload), durationMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timeout);
  }
}

function openAIUsageSummary(payload = {}, durationMs = null, model = OPENAI_NEED_MODEL) {
  const usage = payload.usage || {};
  const inputTokens = Number(usage.input_tokens || usage.prompt_tokens || 0);
  const outputTokens = Number(usage.output_tokens || usage.completion_tokens || 0);
  const totalTokens = Number(usage.total_tokens || inputTokens + outputTokens || 0);
  const estimatedCostUsd = model === "gpt-5.6-luna"
    ? (inputTokens / 1_000_000) * OPENAI_LUNA_INPUT_USD_PER_1M + (outputTokens / 1_000_000) * OPENAI_LUNA_OUTPUT_USD_PER_1M
    : null;
  return {
    input_tokens: inputTokens || null,
    output_tokens: outputTokens || null,
    total_tokens: totalTokens || null,
    duration_ms: Number.isFinite(durationMs) ? durationMs : null,
    estimated_cost_usd: estimatedCostUsd == null ? null : Number(estimatedCostUsd.toFixed(8)),
    raw: usage
  };
}

function isPromptHelpText(rawText = "") {
  const text = normalizeForScoring(rawText);
  return text.includes("sais pas quoi ecrire")
    || text.includes("ne sais pas quoi ecrire")
    || text.includes("quoi ecrire")
    || text.includes("je dois mettre quoi")
    || text.includes("comment demander");
}

function fallbackNeedAnalysis(need, risk = null) {
  const text = normalizeForScoring(need.raw_text);
  const tags = [];
  const add = (tag) => { if (!tags.includes(tag)) tags.push(tag); };
  const needsPromptHelp = isPromptHelpText(need.raw_text);
  if (text.includes("avis") || text.includes("google")) add("avis Google");
  if (text.includes("automatis") || text.includes("temps") || text.includes("repet")) add("automatisation");
  if (text.includes("site") || text.includes("landing")) add("site web");
  if (text.includes("logo") || text.includes("marque") || text.includes("branding")) add("branding");
  if (text.includes("application") || text.includes("app")) add("application");
  if (text.includes("partenaire") || text.includes("prestataire")) add("partenaire");
  if (["cv", "candidature", "candidatures", "entretien", "emploi", "recruteur", "recruteurs", "poste"].some((word) => text.includes(word))) {
    add("emploi");
    add("candidature");
  }
  if (["couple", "relation", "dispute", "conjoint", "copine", "copain", "partenaire amoureux"].some((word) => text.includes(word))) {
    add("relationnel");
  }
  if (["papier", "papiers", "administratif", "dossier", "facture", "factures", "document"].some((word) => text.includes(word))) {
    add("administratif");
  }
  if (["apprendre", "formation", "cours", "etude", "etudier", "competence"].some((word) => text.includes(word))) {
    add("apprentissage");
  }
  if (["choix", "choisir", "decision", "hesite", "prioriser"].some((word) => text.includes(word))) {
    add("decision");
  }
  if (["projet", "organiser", "organisation", "planning", "retard", "deadline"].some((word) => text.includes(word))) {
    add("organisation");
  }
  if (text.includes("client") || text.includes("clients") || text.includes("vente") || text.includes("vendre") || text.includes("prospect") || text.includes("activite") || text.includes("priorite") || text.includes("ameliorer") || text.includes("pourquoi")) {
    add("audit");
    add("diagnostic");
    add("priorites");
    add("clients");
  }
  if (needsPromptHelp) add("orientation");
  const category = needsPromptHelp ? "Orientation / clarification"
    : tags.includes("avis Google") ? "Reputation / fidelisation"
    : tags.includes("emploi") ? "Travail / recherche d'emploi"
    : tags.includes("relationnel") ? "Relationnel / communication"
    : tags.includes("administratif") ? "Administratif / organisation"
    : tags.includes("apprentissage") ? "Apprentissage / progression"
    : tags.includes("decision") ? "Choix / decision"
    : tags.includes("organisation") ? "Organisation / projets"
    : tags.includes("automatisation") ? "Automatisation / productivite"
    : tags.includes("site web") ? "Site / presence digitale"
    : tags.includes("branding") ? "Image / branding"
    : tags.includes("audit") ? "Diagnostic / priorites business"
    : tags.includes("partenaire") ? "Partenaires / business"
    : "Besoin a qualifier";
  const facingSuggestion = needsPromptHelp
    ? "Pas besoin de formuler une demande parfaite. Commencez simplement par ce qui vous bloque, ce qui revient souvent, ce que vous aimeriez ameliorer ou ce que vous voulez eviter. ChronoTrade peut partir d'une phrase tres simple."
    : tags.includes("emploi")
    ? "Premiere action utile : distinguer le probleme entre ciblage des offres, CV, message de candidature, suivi ou preparation d'entretien. Commencez par noter combien de candidatures ont ete envoyees, combien de retours ont ete obtenus et quel type de poste est vise."
    : tags.includes("relationnel")
    ? "Premiere action utile : clarifier le fait concret, l'emotion ressentie et la demande precise a formuler, sans chercher a gagner un conflit. Si la situation implique violence, emprise ou danger, privilegiez un soutien humain qualifie."
    : tags.includes("administratif")
    ? "Premiere action utile : regrouper les documents, choisir une seule categorie prioritaire et definir la prochaine action administrative la plus courte."
    : tags.includes("apprentissage")
    ? "Premiere action utile : choisir une competence cible, mesurer le niveau actuel et planifier une micro-session concrete cette semaine."
    : tags.includes("decision")
    ? "Premiere action utile : poser les options, les criteres non negociables et le cout de ne rien choisir."
    : tags.includes("organisation")
    ? "Premiere action utile : transformer le projet en trois prochaines actions visibles, puis supprimer ou reporter ce qui n'est pas prioritaire."
    : tags.includes("audit")
    ? "Premiere action utile : clarifier ce qui bloque vraiment avant de depenser plus. Analysez l'offre, la cible, la preuve de confiance, le canal d'acquisition et la priorite commerciale. ChronoTrade peut vous orienter vers une Analyse Express pour recevoir un plan clair et priorise."
    : "Votre besoin a ete compris dans ses grandes lignes. ChronoTrade va chercher la solution la plus adaptee.";
  return {
    summary: risk ? "Demande necessitant une revue avant traitement." : needsPromptHelp ? "Vous voulez etre guide pour formuler votre besoin." : (need.title || "Besoin ChronoTrade a qualifier"),
    primary_problem: needsPromptHelp ? "Le point de depart n'est pas encore clair, mais vous pouvez commencer simplement." : (need.title || need.raw_text.slice(0, 140)),
    secondary_problems: [],
    desired_outcome: need.objective || need.priority || "Trouver une solution adaptee",
    user_type: need.user_type || "unknown",
    industry: need.industry || "unknown",
    category,
    subcategory: tags[0] || "general",
    urgency: need.urgency || "unknown",
    budget_if_mentioned: need.budget_range || "",
    constraints: "",
    solution_tags: tags,
    commercial_intent: "unknown",
    repeatability_score: tags.length ? 0.55 : 0.25,
    estimated_complexity: "unknown",
    confidence_score: risk ? 0.2 : needsPromptHelp ? 0.7 : (tags.length ? 0.62 : 0.35),
    needs_clarification: needsPromptHelp ? true : tags.length === 0,
    needs_human_review: Boolean(risk) || (!needsPromptHelp && tags.length === 0),
    safe_to_process: !risk,
    moderation_reason: risk?.reason || "",
    rejection_reason_if_any: risk?.reason || "",
    suggested_questions: needsPromptHelp ? ["Qu'est-ce qui vous bloque ou revient souvent en ce moment, meme si c'est vague ?"] : tags.length ? [] : ["Quel resultat concret voulez-vous obtenir en priorite ?"],
    user_facing_suggestion: risk
      ? "Votre demande a ete recue et sera verifiee manuellement avant toute reponse."
      : facingSuggestion
  };
}

function boostAnalysisWithBusinessSignals(analysis, need) {
  const text = normalizeForScoring([need.raw_text, need.title, analysis.summary, analysis.primary_problem, analysis.desired_outcome].join(" "));
  const clientIssue = ["client", "clients", "prospect", "vente", "vendre", "acquisition", "visibilite", "conversion", "activite"].some((word) => text.includes(word));
  const priorityIssue = ["priorite", "priorites", "quoi ameliorer", "par ou commencer", "bloque", "blocage", "pourquoi", "diagnostic", "audit"].some((word) => text.includes(word));
  if (!clientIssue && !priorityIssue) return analysis;
  const tags = arrayOfCleanStrings(analysis.solution_tags, 16);
  for (const tag of ["audit", "analyse", "diagnostic", "priorites", "clients", "conversion", "plan clair"]) {
    if (!tags.includes(tag)) tags.push(tag);
  }
  return {
    ...analysis,
    category: analysis.category && analysis.category !== "Besoin a qualifier" ? analysis.category : "Diagnostic / priorites business",
    subcategory: analysis.subcategory || "analyse-express",
    solution_tags: tags,
    commercial_intent: analysis.commercial_intent === "low" ? "medium" : (analysis.commercial_intent || "medium"),
    confidence_score: Math.max(Number(analysis.confidence_score || 0), 0.68),
    needs_clarification: false,
    user_facing_suggestion: analysis.user_facing_suggestion || "Commencez par isoler le vrai blocage : offre, cible, visibilite, confiance, tunnel ou relance. La prochaine action la plus logique est un diagnostic court avec priorites claires, puis seulement ensuite une action commerciale ou technique."
  };
}

function interactionProfileFromNeed(need = {}) {
  const metadata = need.metadata && typeof need.metadata === "object" ? need.metadata : {};
  const profile = metadata.interaction_profile || need.interaction_profile || {};
  const signals = metadata.interaction_signals || need.interaction_signals || {};
  const value = (key, fallback = "") => cleanString(profile?.[key]?.value || profile?.[key] || signals?.[key] || fallback);
  const explicitSegment = cleanString(profile?.segment || signals?.segment || "");
  const guidance = value("guidance_need", "medium");
  const depth = value("preferred_explanation_depth", "balanced");
  const technical = value("technical_familiarity", "unknown");
  const control = value("control_preference", "normal");
  let segment = "balanced";
  if (["novice", "novice_control", "guided"].includes(explicitSegment)) segment = "novice_control";
  if (["advanced", "avance", "experienced", "expert", "direct"].includes(explicitSegment)) segment = "experienced";
  if (guidance === "high" || depth === "guided" || technical === "low") segment = "novice_control";
  if (depth === "direct" || technical === "medium_high") segment = "experienced";
  return {
    segment,
    guidance_need: guidance,
    preferred_explanation_depth: depth,
    technical_familiarity: technical,
    control_preference: control
  };
}

function publicHypothesesForNeed(analysis = {}, matches = [], need = {}) {
  const text = normalizeForScoring([
    need.raw_text,
    analysis.summary,
    analysis.primary_problem,
    analysis.desired_outcome,
    analysis.category,
    ...(analysis.solution_tags || [])
  ].join(" "));
  const rows = [];
  const push = (id, label, support, weakens, status, confidence = 0.5) => {
    rows.push({
      id,
      label,
      status,
      confidence: clampScore(confidence, 0.5),
      supports: arrayOfCleanStrings(Array.isArray(support) ? support : [support], 4),
      weakens: arrayOfCleanStrings(Array.isArray(weakens) ? weakens : [weakens], 4)
    });
  };
  if (["client", "clients", "prospect", "vente", "conversion", "visibilite", "acquisition"].some((word) => text.includes(word))) {
    push("H1", "Blocage d'acquisition ou de conversion", "La demande parle de clients, ventes, prospects ou visibilite.", need.raw_text?.includes("Precision utilisateur:") ? "La precision peut deplacer le blocage vers l'offre ou le message." : "Le canal et la cible ne sont pas encore confirms.", matches.length ? "strengthened" : "active", matches.length ? 0.78 : 0.64);
  }
  if (["offre", "message", "positionnement", "cible", "priorite", "diagnostic", "audit"].some((word) => text.includes(word))) {
    push("H2", "Offre ou priorite a clarifier", "Le besoin cherche quoi ameliorer ou par ou commencer.", matches.length ? "" : "Aucune preuve externe ne confirme encore le vrai point faible.", matches.length ? "strengthened" : "active", matches.length ? 0.82 : 0.66);
  }
  if (["cv", "candidature", "candidatures", "entretien", "emploi", "poste", "recruteur"].some((word) => text.includes(word))) {
    push("H1", "Blocage dans le parcours emploi", "La demande parle de candidature, CV, entretien ou reponse recruteur.", "Il manque le type de poste vise, le volume d'envois et le taux de retour.", "active", 0.66);
  }
  if (["couple", "relation", "dispute", "conjoint", "copine", "copain"].some((word) => text.includes(word))) {
    push("H1", "Tension relationnelle ou communication a clarifier", "La demande touche a une relation personnelle ou a une situation de communication sensible.", "ChronoTrade ne doit pas remplacer un soutien humain qualifie en cas de danger ou de detresse.", "active", 0.58);
  }
  if (["papier", "papiers", "administratif", "dossier", "facture", "document"].some((word) => text.includes(word))) {
    push("H2", "Charge administrative a organiser", "La demande contient des signaux de documents, dossiers ou taches administratives.", "La categorie exacte de document et l'echeance ne sont pas encore connues.", "active", 0.63);
  }
  if (["apprendre", "formation", "cours", "etude", "etudier", "competence"].some((word) => text.includes(word))) {
    push("H2", "Progression ou apprentissage a structurer", "La demande parle d'apprendre, progresser ou acquerir une competence.", "Le niveau actuel, le temps disponible et l'objectif mesurable restent a preciser.", "active", 0.6);
  }
  if (["choix", "choisir", "decision", "hesite", "prioriser"].some((word) => text.includes(word))) {
    push("H2", "Decision a cadrer", "La demande contient un choix ou une hesitation.", "Les criteres non negociables et le cout de l'inaction restent a clarifier.", "active", 0.6);
  }
  if (["temps", "manuel", "relance", "workflow", "automatisation", "ia"].some((word) => text.includes(word))) {
    push("H3", "Processus repetitif a simplifier", "La demande contient des signaux de perte de temps, relance ou automatisation.", "La frequence et les outils ne sont pas encore connus.", "active", 0.62);
  }
  if (["site", "landing", "logo", "marque", "branding", "image"].some((word) => text.includes(word))) {
    push("H3", "Confiance digitale a renforcer", "La demande touche au site, a l'image ou a la presence digitale.", "Le probleme peut aussi venir de l'offre ou de l'acquisition.", matches.length ? "active" : "uncertain", 0.58);
  }
  if (["stress", "mental", "sante", "fatigue", "motivation", "quotidien", "organisation"].some((word) => text.includes(word))) {
    push("H1", "Besoin personnel ou quotidien a traiter avec prudence", "La demande contient des signaux de bien-etre, energie ou organisation personnelle.", "ChronoTrade ne remplace pas un professionnel de sante ou un accompagnement humain.", "active", 0.6);
  }
  if (!rows.length) {
    push("H1", "Besoin encore large", "Le texte brut donne une direction generale.", "Il manque le resultat attendu et la contrainte principale.", "uncertain", 0.42);
    push("H2", "Clarification utile avant recommandation", "Une question peut eviter de proposer une solution trop vite.", "Une action gratuite reste possible meme avec cette incertitude.", "active", 0.55);
  }
  return rows.slice(0, 3);
}

function selectedQuestionForNeed(analysis = {}, hypotheses = [], matches = []) {
  const questions = arrayOfCleanStrings(analysis.suggested_questions, 3);
  const question = questions[0] || "";
  const confidence = Number(analysis.confidence_score || 0);
  const hasActionableMatch = Array.isArray(matches) && matches.some((match) => Number(match.score || 0) >= AI_MATCH_THRESHOLD_LOW);
  if (hasActionableMatch && confidence >= 0.6) {
    return {
      question: null,
      reason: "Une action utile est deja possible avec les informations actuelles ; ChronoTrade ne pose donc pas de question supplementaire.",
      should_ask: false
    };
  }
  if (!question) {
    return {
      question: null,
      reason: "Aucune question supplementaire n'est necessaire pour proposer une premiere action utile.",
      should_ask: false
    };
  }
  const uncertain = hypotheses.find((row) => ["uncertain", "active"].includes(row.status));
  return {
    question,
    reason: uncertain
      ? `Cette precision peut changer la prochaine action liee a l'hypothese ${uncertain.id}.`
      : "Cette precision peut confirmer la priorite avant de recommander une solution ChronoTrade.",
    should_ask: true
  };
}

function uniquePlanSteps(steps = []) {
  const seen = new Set();
  return steps
    .map(cleanString)
    .filter(Boolean)
    .filter((step) => {
      const key = normalizeForScoring(step).slice(0, 90);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function euroAmountsFromText(text = "") {
  const values = [];
  const source = String(text || "");
  const regex = /(\d[\d\s.,]{0,10})\s*(?:e|eur|euro|euros|€)/gi;
  let match = regex.exec(source);
  while (match) {
    const value = Number(String(match[1] || "").replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(value) && value > 0) values.push(value);
    match = regex.exec(source);
  }
  return values;
}

function contextualFreePlan(analysis = {}, need = {}) {
  const raw = cleanString(need.raw_text);
  if (isPromptHelpText(raw)) {
    return ["Ecrivez une phrase brute, meme mal formulee : ce qui vous bloque, ce qui revient souvent ou ce que vous aimeriez ameliorer.", "Ajoutez un exemple concret si vous en avez un : une situation recente, une tache penible, un objectif ou une frustration.", "Indiquez ce que vous voudriez obtenir a la place : gagner du temps, comprendre quoi faire, trouver des clients, mieux vous organiser.", "Envoyez cette version simple. ChronoTrade pourra ensuite poser une seule precision utile si elle change vraiment la prochaine action."];
  }
  const text = normalizeForScoring([
    raw,
    analysis.summary,
    analysis.primary_problem,
    analysis.desired_outcome,
    analysis.category,
    ...(analysis.solution_tags || [])
  ].join(" "));
  const steps = [];
  const add = (step) => steps.push(step);
  const has = (...words) => words.some((word) => text.includes(normalizeForScoring(word)));
  const amounts = euroAmountsFromText(raw);

  if (amounts.length >= 2 && has("depense", "econom", "budget", "charges", "salaire", "revenu", "tabac", "abonnement", "sortie", "etf")) {
    const income = amounts[0];
    const knownExpenses = amounts.slice(1).reduce((sum, value) => sum + value, 0);
    const remainder = Math.max(0, income - knownExpenses);
    add(`D'apres les montants donnes, vous avez environ ${income} euros de revenus et ${knownExpenses} euros deja identifies. Il reste donc environ ${remainder} euros a expliquer avant de couper au hasard.`);
    add("Classez chaque ligne en 3 colonnes : indispensable, utile mais ajustable, confort/plaisir.");
    add("Traitez d'abord les postes ajustables recurrents, car ils se repetent tous les mois et donnent un effet durable.");
    if (has("400")) add("Pour viser 400 euros d'epargne, calculez l'ecart exact entre votre reste actuel et ces 400 euros, puis choisissez 2 postes maximum a reduire.");
    add("Gardez une petite marge plaisir realiste : un plan trop brutal tient rarement plus de deux semaines.");
    return uniquePlanSteps(steps);
  }

  if (has("cv", "candidature", "candidatures", "entretien", "emploi", "poste", "recruteur")) {
    add("Notez le poste exact vise, le nombre de candidatures envoyees et le nombre de retours obtenus.");
    add("Prenez 3 annonces recentes et verifiez si les mots importants apparaissent clairement dans votre CV.");
    add("Separez le diagnostic : ciblage des offres, CV, message d'accompagnement, volume, relance.");
    add("Modifiez une seule variable sur les 10 prochaines candidatures pour savoir ce qui change vraiment.");
    if (has("personne repond", "aucun retour")) add("Si aucun recruteur ne repond, commencez par tester un CV plus cible avant de refaire tout votre parcours.");
    return uniquePlanSteps(steps);
  }

  if (has("client", "clients", "prospect", "vente", "conversion", "activite", "visibilite")) {
    add("Ecrivez votre offre en une phrase simple : pour qui, quel probleme, quel resultat concret.");
    add("Identifiez le blocage le plus probable parmi : cible, promesse, preuve, canal, prix, relance.");
    add("Regardez les 5 derniers prospects ou visiteurs : a quelle etape exacte disparaissent-ils ?");
    add("Choisissez un seul test cette semaine, par exemple refaire l'accroche, ajouter une preuve ou relancer proprement.");
    if (has("prix", "cher", "trop cher")) add("Si le prix bloque, ne baissez pas tout de suite : verifiez d'abord si la valeur et les preuves sont assez visibles.");
    return uniquePlanSteps(steps);
  }

  if (has("automatisation", "automatiser", "temps", "relance", "mail", "email", "devis", "workflow")) {
    add("Listez les taches qui reviennent chaque semaine, puis gardez uniquement celles qui se repetent au moins 3 fois.");
    add("Pour chaque tache, notez l'entree, l'action manuelle et la sortie attendue.");
    add("Choisissez la tache la plus simple et la plus frequente comme premier test, pas la plus impressionnante.");
    add("Gardez une validation humaine au debut pour eviter qu'une automatisation envoie une mauvaise information.");
    return uniquePlanSteps(steps);
  }

  if (has("site", "landing", "web", "logo", "marque", "branding", "image", "identite")) {
    add("Definissez ce que le visiteur doit comprendre en 5 secondes : activite, cible, resultat, prochaine action.");
    add("Retirez ou deplacez tout ce qui ne sert pas cette comprehension immediate.");
    add("Ajoutez 3 preuves de confiance : exemple, avis, resultat, process, avant/apres ou realisation.");
    add("Testez la page avec une personne qui ne vous connait pas : elle doit pouvoir reformuler votre offre sans aide.");
    return uniquePlanSteps(steps);
  }

  if (has("couple", "relation", "dispute", "conjoint", "copine", "copain", "collegue", "client mecontent")) {
    add("Ecrivez un fait observable, sans jugement ni interpretation.");
    add("Ajoutez ce que vous ressentez et ce que vous voulez eviter.");
    add("Formulez une demande courte, concrete et verifiable.");
    add("Si la situation implique danger, emprise ou violence, cherchez un soutien humain qualifie avant toute confrontation.");
    return uniquePlanSteps(steps);
  }

  if (has("mental", "stress", "sante", "fatigue", "motivation", "sport", "habitude")) {
    add("Choisissez une action tellement petite qu'elle est faisable aujourd'hui, meme avec peu d'energie.");
    add("Notez votre etat avant et apres pour verifier si l'action aide vraiment.");
    add("Repetez seulement 3 jours avant d'augmenter la difficulte.");
    add("Si le probleme est intense, durable ou dangereux, parlez-en a un proche ou a un professionnel qualifie.");
    return uniquePlanSteps(steps);
  }

  if (has("choix", "choisir", "decision", "hesite", "prioriser")) {
    add("Listez les options reelles, puis supprimez celles qui ne sont pas faisables maintenant.");
    add("Choisissez 3 criteres : impact, risque, cout, temps ou reversibilite.");
    add("Identifiez l'option la plus reversible et testez-la en premier.");
    add("Fixez une date de decision pour eviter de rester bloque dans la comparaison.");
    return uniquePlanSteps(steps);
  }

  if (has("papier", "papiers", "administratif", "dossier", "facture", "document")) {
    add("Regroupez tout au meme endroit avant de chercher une solution.");
    add("Classez en trois piles : urgent, a traiter, archive.");
    add("Choisissez le dossier qui bloque une consequence concrete : paiement, delai, obligation ou stress.");
    add("Faites une seule action courte : envoyer, scanner, relancer ou demander la piece manquante.");
    return uniquePlanSteps(steps);
  }

  if (has("apprendre", "formation", "cours", "etude", "etudier", "competence")) {
    add("Definissez la competence exacte a obtenir, pas seulement le theme general.");
    add("Faites un exercice test pour mesurer votre niveau actuel.");
    add("Planifiez 3 sessions courtes cette semaine avec un resultat visible a produire.");
    add("Mesurez ce que vous savez faire, pas seulement le temps passe.");
    return uniquePlanSteps(steps);
  }

  const suggestion = cleanString(analysis.user_facing_suggestion);
  if (suggestion && suggestion.length > 30 && !/clarifiez votre objectif|reformulez votre probleme/i.test(suggestion)) {
    add(suggestion);
  }
  add("Reformulez le probleme en une phrase avec le resultat attendu.");
  add("Ajoutez la contrainte principale : temps, argent, energie, outil, personne ou delai.");
  add("Choisissez une action testable en moins de 48 heures.");
  return uniquePlanSteps(steps);
}

function adaptStepToInteractionProfile(step = "", profile = {}, index = 0) {
  const clean = cleanString(step);
  if (!clean) return "";
  const segment = profile.segment || "balanced";
  if (segment === "novice_control") {
    if (index === 0 && !/^Commencez par|^D'abord|^Avant/.test(clean)) {
      return `Commencez par ${clean.charAt(0).toLowerCase()}${clean.slice(1)}`;
    }
    return clean.length > 180 ? `${clean.slice(0, 177).trim()}...` : clean;
  }
  if (segment === "experienced") {
    return clean
      .replace(/^Commencez par /i, "")
      .replace(/^Avant de /i, "Avant de ")
      .replace(/Cette base permet de /i, "")
      .slice(0, 220);
  }
  return clean;
}

function refinePlanWithConversationMemory(steps = [], need = {}, profile = {}) {
  const metadata = need.metadata && typeof need.metadata === "object" ? need.metadata : {};
  const priorState = metadata.narrative_state || metadata.reasoning_state || {};
  const tested = arrayOfCleanStrings([
    ...(Array.isArray(priorState.actions_tested) ? priorState.actions_tested : []),
    ...(Array.isArray(priorState.actions_already_tried) ? priorState.actions_already_tried : [])
  ], 6);
  const feedback = metadata.latest_feedback || priorState.result_feedback || null;
  const refined = [...steps];
  const negativeFeedback = feedback && ["no", "unresolved", "negative", "not_useful"].some((word) => normalizeForScoring(JSON.stringify(feedback)).includes(word));
  if ((tested.length || negativeFeedback) && refined.length) {
    refined[0] = tested.length
      ? `Ne repartez pas sur ce qui a deja ete teste (${tested.slice(0, 2).join(", ")}). Utilisez plutot ce retour pour ajuster la prochaine action.`
      : "Comme le dernier retour n'etait pas totalement utile, changez un seul parametre avant de retester.";
  }
  return uniquePlanSteps(refined)
    .map((step, index) => adaptStepToInteractionProfile(step, profile, index))
    .filter(Boolean);
}

function publicFreePlan(analysis = {}, matches = [], need = {}) {
  const profile = interactionProfileFromNeed(need);
  const contextual = refinePlanWithConversationMemory(contextualFreePlan(analysis, need), need, profile);
  if (contextual.length) return contextual;
  const text = normalizeForScoring([need.raw_text, analysis.summary, analysis.primary_problem, analysis.desired_outcome, analysis.category, ...(analysis.solution_tags || [])].join(" "));
  if (isPromptHelpText(need.raw_text)) {
    return refinePlanWithConversationMemory(["Ecrivez une phrase brute, meme mal formulee : ce qui vous bloque, ce qui revient souvent ou ce que vous aimeriez ameliorer.", "Ajoutez un exemple concret si vous en avez un : une situation recente, une tache penible, un objectif ou une frustration.", "Indiquez ce que vous voudriez obtenir a la place : gagner du temps, comprendre quoi faire, trouver des clients, mieux vous organiser.", "Envoyez cette version simple. ChronoTrade pourra ensuite poser une seule precision utile si elle change vraiment la prochaine action."], need, profile);
  }
  if (["cv", "candidature", "candidatures", "entretien", "emploi", "poste", "recruteur"].some((word) => text.includes(word))) {
    return ["Noter le poste exact vise et le nombre de candidatures envoyees.", "Comparer le CV et le message avec trois annonces ciblees.", "Identifier si le blocage vient du ciblage, du CV, du message ou du suivi.", "Modifier un seul element et mesurer les retours sur les 10 prochaines candidatures."];
  }
  if (["couple", "relation", "dispute", "conjoint", "copine", "copain"].some((word) => text.includes(word))) {
    return ["Decrire un fait concret sans accusation.", "Nommer ce que vous ressentez et ce que vous voulez eviter.", "Formuler une demande simple et verifiable.", "Si la situation implique danger, violence ou emprise, chercher un soutien humain qualifie avant toute discussion."];
  }
  if (["papier", "papiers", "administratif", "dossier", "facture", "document"].some((word) => text.includes(word))) {
    return ["Rassembler tous les documents au meme endroit.", "Classer en trois piles : urgent, a traiter, archive.", "Choisir le dossier qui bloque le plus aujourd'hui.", "Faire une seule action courte : envoyer, scanner, relancer ou demander une piece manquante."];
  }
  if (["choix", "choisir", "decision", "hesite", "prioriser"].some((word) => text.includes(word))) {
    return ["Lister les options possibles.", "Choisir trois criteres non negociables.", "Noter le cout de l'inaction pour chaque option.", "Prendre une decision reversible en premier si c'est possible."];
  }
  if (["apprendre", "formation", "cours", "etude", "etudier", "competence"].some((word) => text.includes(word))) {
    return ["Definir la competence exacte a apprendre.", "Tester votre niveau actuel avec un exercice simple.", "Planifier trois sessions courtes cette semaine.", "Mesurer un resultat visible plutot qu'un temps passe."];
  }
  if (["client", "prospect", "vente", "conversion", "activite", "priorite"].some((word) => text.includes(word))) {
    return ["Reformuler l'offre en une phrase claire.", "Identifier la cible prioritaire.", "Verifier le canal qui devrait amener les clients.", "Choisir un seul point a tester cette semaine : offre, preuve, visibilite, conversion ou relance."];
  }
  if (["mental", "stress", "sante", "fatigue", "motivation"].some((word) => text.includes(word))) {
    return ["Choisir une micro-action faisable aujourd'hui.", "La tester sur une duree courte.", "Noter l'effet observe.", "Demander un avis humain qualifie si la situation est sensible ou durable."];
  }
  if (["temps", "automatisation", "ia", "workflow", "relance"].some((word) => text.includes(word))) {
    return ["Lister les trois taches repetitives.", "Estimer le temps perdu par semaine.", "Choisir une seule tache a simplifier en premier.", "Verifier que la solution peut etre testee sans casser le processus actuel."];
  }
  if (["site", "marque", "logo", "branding", "image"].some((word) => text.includes(word))) {
    return ["Definir ce que le visiteur doit comprendre en 5 secondes.", "Lister les preuves de confiance disponibles.", "Choisir l'action principale attendue.", "Retirer ce qui distrait de cette action."];
  }
  return ["Reformuler le probleme en une phrase.", "Ajouter le resultat attendu.", "Identifier la contrainte principale.", "Tester une petite action en moins de 48 heures."];
}

function buildPublicReasoningState({ need = {}, analysis = {}, matches = [], status = "", clarification = null, feedback = null } = {}) {
  const hypotheses = publicHypothesesForNeed(analysis, matches, need);
  const selectedQuestion = selectedQuestionForNeed(analysis, hypotheses, matches);
  const profile = interactionProfileFromNeed(need);
  const metadata = need.metadata && typeof need.metadata === "object" ? need.metadata : {};
  const priorState = metadata.narrative_state && typeof metadata.narrative_state === "object" ? metadata.narrative_state : {};
  const plan = publicFreePlan(analysis, matches, need);
  const actionsProposed = arrayOfCleanStrings([
    ...(Array.isArray(priorState.actions_proposed) ? priorState.actions_proposed : []),
    selectedQuestion.should_ask ? `Question: ${selectedQuestion.question}` : plan[0],
    matches[0]?.solution?.name ? `Solution ChronoTrade: ${matches[0].solution.name}` : ""
  ], 8);
  const presentation = profile.segment === "novice_control"
    ? { mode: "guided", detail_level: "simple", guidance: "Utiliser des phrases courtes, rassurer l'utilisateur et expliquer pourquoi la prochaine action est proposee." }
    : profile.segment === "experienced"
      ? { mode: "direct", detail_level: "compact", guidance: "Aller droit au diagnostic, eviter les explications elementaires et donner la prochaine action rapidement." }
      : { mode: "balanced", detail_level: "standard", guidance: "Rester clair, concret et assez court, avec une explication utile mais non technique." };
  return {
    problem_id: cleanString(need.id),
    conversation_id: cleanString(need.conversation_id || need.session_id || need.id),
    session_id: cleanString(need.session_id),
    user_id_present: Boolean(need.user_id),
    raw_problem_text: cleanString(need.raw_text),
    detected_domain: cleanString(analysis.category || need.detected_category || "Besoin a qualifier"),
    detected_subdomain: cleanString(analysis.subcategory || need.detected_objective || "general"),
    objective: cleanString(analysis.desired_outcome || need.objective || need.detected_objective || "Trouver une prochaine action utile"),
    context: cleanString(analysis.primary_problem || need.title),
    intent: cleanString(analysis.commercial_intent || "unknown"),
    explicit_facts: arrayOfCleanStrings([
      ...(Array.isArray(priorState.explicit_facts) ? priorState.explicit_facts : []),
      cleanString(need.raw_text).slice(0, 240),
      clarification?.answer ? `Precision: ${clarification.answer}` : ""
    ], 6),
    known_facts: arrayOfCleanStrings([
      ...(Array.isArray(priorState.known_facts) ? priorState.known_facts : []),
      cleanString(analysis.primary_problem || analysis.summary || need.title)
    ], 8),
    user_interpretation: cleanString(analysis.summary || analysis.primary_problem || need.title),
    constraints: arrayOfCleanStrings([analysis.constraints, need.budget_range, need.urgency].filter(Boolean), 6),
    unknowns: selectedQuestion.should_ask ? arrayOfCleanStrings([selectedQuestion.question, ...(analysis.suggested_questions || []).slice(1)], 4) : [],
    hypotheses,
    rejected_hypotheses: arrayOfCleanStrings([
      ...(Array.isArray(priorState.rejected_hypotheses) ? priorState.rejected_hypotheses : []),
      ...hypotheses.filter((row) => row.status === "rejected").map((row) => row.label)
    ], 6),
    uncertainty_level: Number(analysis.confidence_score || 0) >= 0.75 ? "low" : Number(analysis.confidence_score || 0) >= 0.5 ? "medium" : "high",
    selected_question: selectedQuestion.question,
    selected_question_reason: selectedQuestion.reason,
    next_action: selectedQuestion.should_ask && Number(analysis.confidence_score || 0) < 0.55 ? "ask_clarification" : matches.length ? "show_relevant_solution_and_free_plan" : "show_free_plan_and_save_interest",
    next_useful_step: selectedQuestion.should_ask ? selectedQuestion.question : plan[0],
    action_proposed: plan[0],
    actions_proposed: actionsProposed,
    actions_tested: Array.isArray(priorState.actions_tested) ? priorState.actions_tested : [],
    known_results: arrayOfCleanStrings([
      ...(Array.isArray(priorState.known_results) ? priorState.known_results : []),
      feedback?.comment || feedback?.resolution_result || ""
    ], 6),
    plan,
    selected_solution: matches[0]?.solution?.name || null,
    alternatives: matches.slice(1, 4).map((match) => match.solution?.name || match.solution_slug || "").filter(Boolean),
    result_feedback: feedback || null,
    interaction_profile_used: profile,
    presentation,
    status,
    privacy_note: "Etat explicatif public : aucune chaine de pensee privee brute n'est exposee."
  };
}

function solutionSearchText(solution) {
  return normalizeForScoring([
    solution.name,
    solution.description,
    solution.type,
    solution.price_model,
    solution.billing_model,
    solution.target_profile,
    solution.solution_instructions,
    solution.internal_or_external,
    ...(solution.problems_solved || []),
    ...(solution.target_users || []),
    ...(solution.industries || []),
    ...(solution.solution_keywords || []),
    ...(solution.metadata?.tags || []),
    ...(solution.metadata?.intents || [])
  ].join(" "));
}

function scoreSolutionMatch(solution, analysis, need) {
  const haystack = solutionSearchText(solution);
  const tags = arrayOfCleanStrings(analysis.solution_tags, 16);
  let score = 0;
  let strongSignals = 0;
  const tagHits = tags.filter((tag) => haystack.includes(normalizeForScoring(tag))).slice(0, 4).length;
  score += Math.min(0.48, tagHits * 0.24);
  strongSignals += Math.min(2, tagHits);
  if (analysis.category && haystack.includes(normalizeForScoring(analysis.category))) { score += 0.18; strongSignals += 1; }
  if (analysis.subcategory && haystack.includes(normalizeForScoring(analysis.subcategory))) { score += 0.16; strongSignals += 1; }
  if (analysis.industry && haystack.includes(normalizeForScoring(analysis.industry))) score += 0.08;
  const rawWords = normalizeForScoring(need.raw_text).split(/\s+/).filter((word) => word.length > 4);
  const hits = rawWords.filter((word) => haystack.includes(word)).slice(0, 8).length;
  if (hits >= 3) strongSignals += 1;
  score += Math.min(0.18, hits * 0.025);
  const slug = normalizeForScoring(solution.slug || solution.name || "");
  const rawText = normalizeForScoring(need.raw_text || "");
  const wantsDiagnostic = ["client", "clients", "prospect", "vente", "priorite", "priorites", "ameliorer", "activite", "blocage", "pourquoi"].some((word) => rawText.includes(word));
  if (wantsDiagnostic && (slug.includes("analyse-express") || haystack.includes("analyse express") || haystack.includes("audit"))) { score += 0.42; strongSignals += 1; }
  if (solution.public && solution.active) score += 0.08;
  if (strongSignals < 2 && score < AI_MATCH_THRESHOLD_HIGH) return 0;
  return clampScore(score, 0);
}

async function matchNeedSolutions(need, analysis) {
  const result = await supabaseSelect("solutions", {
    select: "id,type,name,slug,description,problems_solved,target_users,industries,price_model,billing_model,credit_cost,compatible_subscription_codes,target_profile,solution_instructions,access_rights,price,recurring,internal_or_external,product_id,active,public,metadata",
    active: "eq.true",
    order: "updated_at.desc",
    limit: "80"
  });
  const solutions = result.ok && Array.isArray(result.data) ? result.data : [];
  const matches = solutions
    .map((solution) => ({ solution, score: scoreSolutionMatch(solution, analysis, need) }))
    .filter((row) => row.score >= AI_MATCH_THRESHOLD_LOW)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const payloads = [];
  for (let index = 0; index < matches.length; index += 1) {
    const row = matches[index];
    const confidenceBand = row.score >= AI_MATCH_THRESHOLD_HIGH ? "high" : row.score >= AI_MATCH_THRESHOLD_LOW ? "medium" : "low";
    const matchPayload = {
      need_id: need.id,
      solution_id: row.solution.id,
      product_id: row.solution.product_id || null,
      match_type: OPENAI_API_KEY ? "ai_assisted" : "fallback",
      rank: index + 1,
      score: Number(row.score.toFixed(3)),
      status: confidenceBand === "high" ? "suggested" : "suggested",
      rationale: `Correspondance basee sur les tags: ${arrayOfCleanStrings(analysis.solution_tags, 6).join(", ") || "besoin a qualifier"}.`,
      match_reason: `${row.solution.name} couvre une partie du besoin detecte (${analysis.category || "categorie a qualifier"}).`,
      user_facing_copy: `Cette piste peut aider sur: ${analysis.primary_problem || analysis.summary || "votre besoin"}.`,
      confidence_band: confidenceBand,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const inserted = await supabaseInsert("need_solution_matches", matchPayload);
    payloads.push({ ...matchPayload, solution: row.solution, insert: inserted.ok });
  }
  return payloads;
}

function productToResolveSolution(product) {
  const metadata = product?.metadata && typeof product.metadata === "object" ? product.metadata : {};
  const billingModel = productBillingModel(product);
  return {
    id: product.id,
    type: product.product_type === "app" ? "APP"
      : product.product_type === "automation" ? "AUTOMATION"
      : ["service", "sur_mesure", "personalise", "audit", "motion"].includes(product.product_type) ? "SERVICE"
      : product.product_type === "resource" ? "RESOURCE"
      : "PRODUCT",
    name: product.title,
    slug: product.slug,
    description: [product.problem_solved, product.short_description, product.description].filter(Boolean).join(" "),
    problems_solved: [
      product.problem_solved,
      ...(Array.isArray(metadata.intents) ? metadata.intents : []),
      ...(Array.isArray(metadata.catalogue_filters) ? metadata.catalogue_filters : []),
      ...(Array.isArray(metadata.solution_tags) ? metadata.solution_tags : []),
      ...(Array.isArray(product.solution_keywords) ? product.solution_keywords : []),
      ...(Array.isArray(product.tags) ? product.tags : [])
    ].filter(Boolean),
    target_users: arrayOfCleanStrings([product.target_profile, ...(Array.isArray(metadata.target_users) ? metadata.target_users : [])], 12),
    industries: Array.isArray(metadata.industries) ? metadata.industries : [],
    price_model: product.pricing_model || legacyPricingModelFromBilling(billingModel),
    billing_model: billingModel,
    credit_cost: Number(product.credit_cost || 0),
    compatible_subscription_codes: Array.isArray(product.compatible_subscription_codes) ? product.compatible_subscription_codes : [],
    target_profile: product.target_profile || "",
    solution_instructions: product.solution_instructions || "",
    access_rights: product.access_rights || {},
    price: product.price_cents == null ? null : Number(product.price_cents || 0) / 100,
    recurring: billingModel === "SUBSCRIPTION" || product.pricing_model === "subscription",
    internal_or_external: product.provider_type === "verified_partner" ? "partner" : "internal",
    product_id: product.id,
    active: product.status === "published",
    public: product.status === "published",
    metadata: { source: "product_publish_alert", product_type: product.product_type, billing_model: billingModel, ...(metadata || {}) }
  };
}

async function upsertSolutionFromProduct(product) {
  const solution = productToResolveSolution(product);
  const result = await supabaseUpsert("solutions", {
    type: solution.type,
    name: solution.name,
    slug: solution.slug,
    description: solution.description,
    problems_solved: solution.problems_solved,
    target_users: solution.target_users,
    industries: solution.industries,
    price_model: solution.price_model,
    billing_model: solution.billing_model,
    credit_cost: solution.credit_cost,
    compatible_subscription_codes: solution.compatible_subscription_codes,
    target_profile: solution.target_profile,
    solution_instructions: solution.solution_instructions,
    access_rights: solution.access_rights,
    price: solution.price,
    recurring: solution.recurring,
    internal_or_external: solution.internal_or_external,
    product_id: solution.product_id,
    active: solution.active,
    public: solution.public,
    metadata: solution.metadata,
    updated_at: new Date().toISOString()
  }, "slug");
  if (!result.ok) return { ok: false, error: result.message, solution: null };
  const lookup = await supabaseSelect("solutions", { select: "*", slug: `eq.${solution.slug}`, limit: "1" });
  const dbSolution = lookup.ok && Array.isArray(lookup.data) ? lookup.data[0] : null;
  return { ok: true, solution: dbSolution || solution, upsert: result };
}

function buildProductAlertEmail({ need, product, match, analysis }) {
  const originalDate = need.created_at ? new Date(need.created_at).toLocaleDateString("fr-FR") : "une date precedente";
  const productUrl = `${SITE_ORIGIN}/produit/?slug=${encodeURIComponent(product.slug)}`;
  const freeStep = analysis?.user_facing_suggestion || "Commencez par relire votre besoin initial, notez le resultat attendu et choisissez une seule prochaine action a tester.";
  return {
    to: need.contact_email || need.email,
    subject: `Une solution ChronoTrade peut correspondre a votre demande`,
    text: [
      "Bonjour,",
      "",
      `Vous aviez decrit un besoin sur ChronoTrade le ${originalDate} :`,
      `"${need.raw_text || need.title || "Demande ChronoTrade"}"`,
      "",
      `Une solution vient d'etre publiee ou mise a jour : ${product.title}.`,
      product.short_description || product.description || "",
      "",
      `Pourquoi elle peut correspondre : ${match.match_reason || "elle partage les memes signaux que votre demande initiale."}`,
      "",
      `Action gratuite avant de payer : ${freeStep}`,
      "",
      `Voir la solution : ${productUrl}`,
      "",
      "ChronoTrade"
    ].filter(Boolean).join("\n"),
    html: `<p>Bonjour,</p><p>Vous aviez decrit un besoin sur ChronoTrade le <strong>${escapeHtml(originalDate)}</strong> :</p><blockquote>${escapeHtml(need.raw_text || need.title || "Demande ChronoTrade")}</blockquote><p>Une solution vient d'etre publiee ou mise a jour : <strong>${escapeHtml(product.title)}</strong>.</p><p>${escapeHtml(product.short_description || product.description || "")}</p><p><strong>Pourquoi elle peut correspondre :</strong> ${escapeHtml(match.match_reason || "elle partage les memes signaux que votre demande initiale.")}</p><p><strong>Action gratuite avant de payer :</strong> ${escapeHtml(freeStep)}</p><p><a href="${escapeHtml(productUrl)}">Voir la solution ChronoTrade</a></p><p>ChronoTrade</p>`
  };
}

async function notifyMatchingNeedsForProduct(product, { dryRun = false, limit = 80 } = {}) {
  if (!product?.id || product.status !== "published") return { ok: false, skipped: true, reason: "product_not_published", matched: 0, emailed: 0 };
  const solutionSync = await upsertSolutionFromProduct(product);
  if (!solutionSync.ok || !solutionSync.solution) return { ok: false, error: solutionSync.error || "solution_sync_failed", matched: 0, emailed: 0 };
  const needsResult = await supabaseSelect("needs", {
    select: "id,user_id,session_id,title,raw_text,status,created_at,updated_at,contact_email,email,wants_contact,contact_permission,detected_category,detected_objective,recommended_services,metadata",
    limit: String(Math.min(Number(limit || 80), 200)),
    order: "created_at.desc"
  });
  const needs = needsResult.ok && Array.isArray(needsResult.data) ? needsResult.data : [];
  const alerts = [];
  const now = new Date().toISOString();
  for (const need of needs) {
    if (["REJECTED_UNSAFE", "REJECTED_ILLEGAL", "RESOLVED"].includes(String(need.status || ""))) continue;
    const email = cleanString(need.contact_email || need.email).toLowerCase();
    const canEmail = Boolean(email && need.wants_contact && need.contact_permission !== "none");
    if (!canEmail) continue;
    const analysisLookup = await supabaseSelect("need_analysis", { select: "*", need_id: `eq.${need.id}`, order: "created_at.desc", limit: "1" });
    const analysis = analysisLookup.ok && Array.isArray(analysisLookup.data) && analysisLookup.data[0]
      ? analysisLookup.data[0]
      : fallbackNeedAnalysis(need);
    const score = scoreSolutionMatch(solutionSync.solution, analysis, need);
    if (score < 0.36) continue;
    const existing = await supabaseSelect("need_solution_matches", {
      select: "id,status",
      need_id: `eq.${need.id}`,
      solution_id: `eq.${solutionSync.solution.id}`,
      limit: "1"
    });
    const alreadyMatched = existing.ok && Array.isArray(existing.data) && existing.data.length > 0;
    const matchPayload = {
      need_id: need.id,
      solution_id: solutionSync.solution.id,
      product_id: product.id,
      match_type: "product_publish_alert",
      rank: 1,
      score: Number(score.toFixed(3)),
      status: "suggested",
      rationale: `Produit publie compatible avec les signaux de la demande (${analysis.category || need.detected_category || "categorie a qualifier"}).`,
      match_reason: `${product.title} correspond a une demande conservee (${analysis.category || need.detected_category || "besoin a qualifier"}).`,
      user_facing_copy: `Cette solution peut maintenant aider sur : ${analysis.primary_problem || analysis.summary || need.title || "votre besoin"}.`,
      confidence_band: score >= AI_MATCH_THRESHOLD_HIGH ? "high" : "medium",
      updated_at: now
    };
    if (!dryRun && !alreadyMatched) await supabaseInsert("need_solution_matches", { ...matchPayload, created_at: now });
    const emailPayload = buildProductAlertEmail({ need, product, match: matchPayload, analysis });
    let sendResult = { skipped: true, reason: dryRun ? "dry_run" : "not_sent" };
    if (!dryRun) {
      sendResult = await sendViaGraph(emailPayload);
      await addOutbox([{ id: randomUUID(), needId: need.id, productId: product.id, type: "product_match_alert", status: sendResult.ok ? "sent" : "prepared", sendResult, createdAt: now, ...emailPayload }]);
      await supabaseInsert("scheduled_emails", {
        type: "product_match_alert",
        user_id: need.user_id || null,
        product_id: product.id,
        recipient_email: email,
        subject: emailPayload.subject,
        status: sendResult.ok ? "sent" : "failed",
        scheduled_at: now,
        sent_at: sendResult.ok ? now : null,
        payload: { source: "product_publish_alert", needId: need.id, score, productSlug: product.slug, emailPreview: emailPayload.text }
      });
      if (need.user_id) {
        await supabaseInsert("notifications", {
          user_id: need.user_id,
          type: "product_match",
          title: "Une solution correspond a votre demande",
          message: `${product.title} peut correspondre a un besoin que vous aviez decrit.`,
          action_url: `/produit/?slug=${product.slug}`,
          metadata: { need_id: need.id, product_id: product.id, score }
        });
      }
      await supabaseUpdate("needs", {
        status: "MATCHED",
        is_unmet: false,
        user_response_status: sendResult.ok ? "sent" : "prepared",
        user_response_sent_at: sendResult.ok ? now : null,
        updated_at: now
      }, { id: `eq.${need.id}` }, { returnRepresentation: false });
      await recordNeedEvent(need.id, need.user_id, "product_match_alert", {
        to_status: "MATCHED",
        note: `Produit propose automatiquement : ${product.title}.`,
        metadata: { product_id: product.id, product_slug: product.slug, score, emailSent: Boolean(sendResult.ok) }
      });
    }
    alerts.push({ needId: need.id, email, score, alreadyMatched, emailSent: Boolean(sendResult.ok), sendResult });
  }
  return { ok: true, product: { id: product.id, slug: product.slug, title: product.title }, solution: { id: solutionSync.solution.id, slug: solutionSync.solution.slug }, matched: alerts.length, emailed: alerts.filter((row) => row.emailSent).length, alerts };
}

async function recordNeedEvent(needId, userId, eventType, details = {}) {
  if (!needId) return null;
  return supabaseInsert("need_events", {
    need_id: needId,
    user_id: userId || null,
    event_type: eventType,
    from_status: details.from_status || null,
    to_status: details.to_status || null,
    note: details.note || null,
    metadata: details.metadata || {}
  });
}

function estimatedUsageCredits(usageSummary = {}) {
  const cost = Number(usageSummary.estimated_cost_usd || 0);
  if (!Number.isFinite(cost) || cost <= 0) return 0;
  const eurEstimate = cost * 1.1;
  return Math.max(1, Math.ceil(eurEstimate * CREDITS_PER_EUR));
}

const resolveRateBuckets = new Map();

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket?.remoteAddress || "unknown";
}

function hashedLogValue(value) {
  const clean = cleanString(value);
  if (!clean) return null;
  return createHmac("sha256", SECURITY_LOG_SALT).update(clean).digest("hex").slice(0, 24);
}

function pruneRateBuckets(now = Date.now()) {
  for (const [key, bucket] of resolveRateBuckets.entries()) {
    if (!bucket?.resetAt || bucket.resetAt < now) resolveRateBuckets.delete(key);
  }
}

function bumpRateBucket(key, limit, now = Date.now()) {
  const resetAt = now + 60 * 60 * 1000;
  const existing = resolveRateBuckets.get(key);
  const bucket = existing && existing.resetAt > now ? existing : { count: 0, resetAt };
  bucket.count += 1;
  resolveRateBuckets.set(key, bucket);
  return {
    allowed: bucket.count <= limit,
    count: bucket.count,
    limit,
    resetAt: new Date(bucket.resetAt).toISOString()
  };
}

async function recordSecurityEvent({
  eventType,
  severity = "info",
  userId = null,
  sessionId = "",
  ip = "",
  path = "",
  reason = "",
  metadata = {}
} = {}) {
  const safeMetadata = {
    ...metadata,
    session_hash: hashedLogValue(sessionId),
    ip_hash: hashedLogValue(ip),
    reason: cleanString(reason) || null
  };
  const payload = {
    event_type: cleanString(eventType).slice(0, 90),
    severity: cleanString(severity).slice(0, 40) || "info",
    user_id: userId || null,
    session_hash: safeMetadata.session_hash,
    ip_hash: safeMetadata.ip_hash,
    path: cleanString(path).slice(0, 240) || null,
    reason: cleanString(reason).slice(0, 300) || null,
    metadata: safeMetadata,
    created_at: new Date().toISOString()
  };
  const securityLog = await supabaseInsert("security_events", payload);
  const siteLog = await recordSiteEvent({
    userId,
    sessionId,
    eventType: `security_${cleanString(eventType).slice(0, 70)}`,
    entityType: "security",
    path,
    metadata: safeMetadata
  });
  return { securityLog, siteLog };
}

async function checkResolveRateLimit({ req, sessionId = "", userId = null } = {}) {
  pruneRateBuckets();
  const ip = clientIp(req);
  const now = Date.now();
  const checks = [];
  if (sessionId) checks.push({ scope: "session", key: `session:${sessionId}`, limit: RESOLVE_SESSION_LIMIT_PER_HOUR });
  checks.push({ scope: "ip", key: `ip:${ip}`, limit: RESOLVE_IP_LIMIT_PER_HOUR });
  for (const check of checks) {
    const result = bumpRateBucket(check.key, check.limit, now);
    if (!result.allowed) {
      await recordSecurityEvent({
        eventType: "resolve_rate_limited",
        severity: "warning",
        userId,
        sessionId,
        ip,
        path: "/api/resolve/needs",
        reason: `${check.scope}_limit_exceeded`,
        metadata: {
          scope: check.scope,
          count: result.count,
          limit: result.limit,
          reset_at: result.resetAt
        }
      });
      return {
        allowed: false,
        code: "rate_limited",
        scope: check.scope,
        retry_after_seconds: Math.max(1, Math.ceil((new Date(result.resetAt).getTime() - now) / 1000)),
        reset_at: result.resetAt
      };
    }
  }
  return { allowed: true, ip };
}

function costGuardState(spent, limit) {
  if (!limit) return { status: "disabled", ratio: 0 };
  const ratio = spent / limit;
  return {
    status: ratio >= 1 ? "blocked" : ratio >= 0.95 ? "critical" : ratio >= 0.85 ? "warning" : ratio >= 0.7 ? "watch" : "ok",
    ratio: Number(ratio.toFixed(4))
  };
}

function sumEstimatedCost(rows) {
  return rows.reduce((sum, row) => sum + Number(row.estimated_cost_usd || 0), 0);
}

async function aiCostGuardSnapshot({ userId = null, sessionId = "", estimatedRequestCostUsd = AI_ESTIMATED_NEED_ANALYSIS_COST_USD } = {}) {
  if (AI_KILL_SWITCH) {
    return { enabled: true, status: "blocked", reason: "kill_switch", kill_switch: true };
  }
  if (!AI_COST_GUARD_ENABLED || !AI_DAILY_COST_LIMIT_USD) {
    return { enabled: false, status: "disabled", daily_limit_usd: AI_DAILY_COST_LIMIT_USD };
  }
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const hourStart = new Date(Date.now() - 60 * 60 * 1000);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const result = await supabaseSelect("usage_events", {
    select: "id,user_id,session_id,estimated_cost_usd,operation,provider,status,created_at",
    created_at: `gte.${monthStart.toISOString()}`,
    order: "created_at.desc",
    limit: "5000"
  });
  const rows = result.ok && Array.isArray(result.data) ? result.data : [];
  const dayRows = rows.filter((row) => new Date(row.created_at).getTime() >= start.getTime());
  const hourRows = rows.filter((row) => new Date(row.created_at).getTime() >= hourStart.getTime());
  const userDayRows = userId ? dayRows.filter((row) => row.user_id === userId) : [];
  const userHourRows = userId ? hourRows.filter((row) => row.user_id === userId) : [];
  const recentFailures = hourRows.filter((row) => ["failed", "timeout", "error"].includes(String(row.status || "").toLowerCase())).length;
  const spentToday = sumEstimatedCost(dayRows);
  const spentMonth = sumEstimatedCost(rows);
  const spentUserToday = sumEstimatedCost(userDayRows);
  const spentUserHour = sumEstimatedCost(userHourRows);
  const dailyState = costGuardState(spentToday, AI_DAILY_COST_LIMIT_USD);
  const monthlyState = costGuardState(spentMonth, AI_MONTHLY_COST_LIMIT_USD);
  const globalState = costGuardState(spentMonth, AI_GLOBAL_COST_LIMIT_USD);
  const userDailyState = costGuardState(spentUserToday, userId ? AI_USER_DAILY_COST_LIMIT_USD : 0);
  const userHourlyState = costGuardState(spentUserHour, userId ? AI_USER_HOURLY_COST_LIMIT_USD : 0);
  const requestState = costGuardState(Number(estimatedRequestCostUsd || 0), AI_REQUEST_COST_LIMIT_USD);
  const circuitBreakerState = recentFailures >= AI_CIRCUIT_BREAKER_FAILURES ? "blocked" : recentFailures >= Math.ceil(AI_CIRCUIT_BREAKER_FAILURES * 0.7) ? "warning" : "ok";
  const states = [dailyState.status, monthlyState.status, globalState.status, userDailyState.status, userHourlyState.status, requestState.status, circuitBreakerState];
  const status = states.includes("blocked") ? "blocked" : states.includes("critical") ? "critical" : states.includes("warning") ? "warning" : states.includes("watch") ? "watch" : "ok";
  const blockedReason = requestState.status === "blocked" ? "request_cost_limit"
    : userHourlyState.status === "blocked" ? "user_hourly_limit"
      : userDailyState.status === "blocked" ? "user_daily_limit"
        : dailyState.status === "blocked" ? "daily_limit"
          : monthlyState.status === "blocked" ? "monthly_limit"
            : globalState.status === "blocked" ? "global_limit"
              : circuitBreakerState === "blocked" ? "circuit_breaker"
                : "";
  return {
    enabled: true,
    status,
    reason: blockedReason || null,
    kill_switch: false,
    daily_limit_usd: AI_DAILY_COST_LIMIT_USD,
    monthly_limit_usd: AI_MONTHLY_COST_LIMIT_USD,
    global_limit_usd: AI_GLOBAL_COST_LIMIT_USD,
    request_limit_usd: AI_REQUEST_COST_LIMIT_USD,
    user_hourly_limit_usd: AI_USER_HOURLY_COST_LIMIT_USD,
    user_daily_limit_usd: AI_USER_DAILY_COST_LIMIT_USD,
    estimated_request_cost_usd: Number(Number(estimatedRequestCostUsd || 0).toFixed(6)),
    spent_today_usd: Number(spentToday.toFixed(6)),
    spent_month_usd: Number(spentMonth.toFixed(6)),
    spent_user_hour_usd: Number(spentUserHour.toFixed(6)),
    spent_user_today_usd: Number(spentUserToday.toFixed(6)),
    ratio: dailyState.ratio,
    monthly_ratio: monthlyState.ratio,
    global_ratio: globalState.ratio,
    user_hourly_ratio: userHourlyState.ratio,
    user_daily_ratio: userDailyState.ratio,
    request_ratio: requestState.ratio,
    recent_failures: recentFailures,
    circuit_breaker_failures: AI_CIRCUIT_BREAKER_FAILURES,
    events_today: dayRows.length,
    events_month: rows.length,
    storage: result.ok ? { ok: true } : { ok: false, error: result.message }
  };
}

async function checkCostGuardBeforeAi({ needId = null, userId = null, sessionId = "", operation = "need_analysis" } = {}) {
  const snapshot = await aiCostGuardSnapshot({ userId, sessionId, estimatedRequestCostUsd: AI_ESTIMATED_NEED_ANALYSIS_COST_USD });
  if (!snapshot.enabled || snapshot.status !== "blocked") return { allowed: true, snapshot };
  await recordSecurityEvent({
    eventType: "ai_cost_guard_blocked",
    severity: "critical",
    userId,
    sessionId,
    path: "/api/resolve/needs",
    reason: snapshot.reason || "ai_budget_guard_blocked",
    metadata: { need_id: needId, operation, cost_guard: snapshot }
  });
  return {
    allowed: false,
    code: "cost_guard_blocked",
    error: "Le budget IA ChronoTrade est temporairement limite. Le besoin est conserve et une reponse gratuite de secours est fournie.",
    snapshot
  };
}

async function recordUsageEvent({
  userId = null,
  needId = null,
  sessionId = "",
  operation,
  provider = "openai",
  model = "",
  usageSummary = {},
  status = "recorded",
  chargedCredits = 0,
  metadata = {}
} = {}) {
  if (!operation) return { skipped: true, reason: "missing_operation" };
  return supabaseInsert("usage_events", {
    user_id: userId || null,
    need_id: needId || null,
    session_id: cleanString(sessionId) || null,
    operation,
    provider: cleanString(provider) || null,
    model: cleanString(model) || null,
    input_tokens: Number(usageSummary.input_tokens || 0),
    output_tokens: Number(usageSummary.output_tokens || 0),
    total_tokens: Number(usageSummary.total_tokens || 0),
    estimated_cost_usd: usageSummary.estimated_cost_usd == null ? null : Number(usageSummary.estimated_cost_usd),
    charged_credits: Number(chargedCredits || 0),
    status,
    metadata: {
      ...metadata,
      estimated_credits: estimatedUsageCredits(usageSummary),
      duration_ms: usageSummary.duration_ms || null,
      raw_usage: usageSummary.raw || {}
    },
    updated_at: new Date().toISOString()
  });
}

async function analyzeNeedAfterSubmission(need, payloadRisk = null, options = {}) {
  if (!need?.id) return { skipped: true, reason: "missing_need" };
  const operationName = cleanString(options.operation || "need_analysis") || "need_analysis";
  const chargeWallet = options.chargeWallet === true;
  const externalReferenceSuffix = cleanString(options.externalReferenceSuffix || "v1") || "v1";
  const prompt = await activeNeedPrompt();
  const startedRun = await supabaseInsert("ai_analysis_runs", {
    need_id: need.id,
    prompt_version_id: prompt.id || null,
    provider: "openai",
    model: prompt.model || OPENAI_NEED_MODEL,
    status: OPENAI_API_KEY ? "started" : "skipped",
    created_at: new Date().toISOString()
  });
  const runId = Array.isArray(startedRun.data) ? startedRun.data[0]?.id : startedRun.data?.id;
  await recordNeedEvent(need.id, need.user_id, "ai_analysis_started", { metadata: { model: prompt.model || OPENAI_NEED_MODEL, enabled: Boolean(OPENAI_API_KEY) } });
  await recordSiteEvent({
    userId: need.user_id || null,
    sessionId: need.session_id || null,
    eventType: "need_analysis_started",
    entityType: "need",
    entityId: need.id,
    metadata: { model: prompt.model || OPENAI_NEED_MODEL, enabled: Boolean(OPENAI_API_KEY) }
  });
  let analysis = null;
  let modelResult = null;
  let aiStatus = "completed";
  let errorMessage = "";
  let usageReservation = {
    skipped: true,
    reason: USAGE_GATE_ENFORCED
      ? (chargeWallet ? "no_authenticated_user" : "not_billable")
      : "usage_gate_dry_run"
  };
  const usageExternalReference = cleanString(options.externalReference)
    || `${operationName}:${need.id}:${runId || "run"}:${externalReferenceSuffix}`;
  try {
    if (USAGE_GATE_ENFORCED && need.user_id && chargeWallet) {
      usageReservation = await reserveUsageCredits({
        userId: need.user_id,
        operation: operationName,
        credits: USAGE_GATE_NEED_ANALYSIS_CREDITS,
        externalReference: usageExternalReference,
        metadata: {
          need_id: need.id,
          run_id: runId || null,
          mode: "enforced",
          ...(options.usageMetadata || {}),
          consumption_order: options.consumptionOrder || ["free_entitlement", "subscription_entitlement", "wallet_credits"]
        }
      });
      if (!usageReservation.ok) {
        aiStatus = "blocked_usage_gate";
        errorMessage = usageReservation.status === "insufficient_credits"
          ? "Credits insuffisants pour lancer cette analyse."
          : usageReservation.error || usageReservation.reason || "UsageGate a bloque l'analyse.";
        analysis = fallbackNeedAnalysis(need, null);
      }
    }
    const wantsPromptHelp = isPromptHelpText(need.raw_text);
    const risk = payloadRisk || detectResolveRiskServer(need.raw_text);
    const costGuard = await checkCostGuardBeforeAi({
      needId: need.id,
      userId: need.user_id || null,
      sessionId: need.session_id || "",
      operation: operationName
    });
    if (analysis) {
      // UsageGate blocked the paid path. Keep the raw need and return a safe free fallback.
    } else if (wantsPromptHelp) {
      analysis = fallbackNeedAnalysis(need, null);
      aiStatus = "skipped_prompt_help";
    } else if (risk) {
      analysis = fallbackNeedAnalysis(need, risk);
      aiStatus = "skipped";
    } else if (!costGuard.allowed) {
      analysis = fallbackNeedAnalysis(need, null);
      aiStatus = "blocked_cost_guard";
      errorMessage = costGuard.error || "Budget IA bloque par Cost Guard.";
    } else if (OPENAI_API_KEY) {
      modelResult = await callNeedAnalysisModel({ need, prompt });
      analysis = modelResult.analysis;
    } else {
      analysis = fallbackNeedAnalysis(need, null);
      aiStatus = "skipped";
    }
  } catch (error) {
    analysis = fallbackNeedAnalysis(need, null);
    aiStatus = error.name === "AbortError" ? "timeout" : "failed";
    errorMessage = error.message;
    if (usageReservation?.ok && usageReservation?.reservation?.id) {
      await releaseUsageReservation({
        reservationId: usageReservation.reservation.id,
        userId: need.user_id,
        reason: aiStatus,
        metadata: { need_id: need.id, run_id: runId || null, error: errorMessage }
      });
      usageReservation = { ...usageReservation, released_after_error: true };
    }
  }
  analysis = boostAnalysisWithBusinessSignals(analysis || fallbackNeedAnalysis(need, null), need);
  analysis.confidence_score = clampScore(analysis.confidence_score, 0);
  analysis.repeatability_score = clampScore(analysis.repeatability_score, 0);
  analysis.secondary_problems = arrayOfCleanStrings(analysis.secondary_problems, 8);
  analysis.solution_tags = arrayOfCleanStrings(analysis.solution_tags, 12);
  analysis.suggested_questions = arrayOfCleanStrings(analysis.suggested_questions, 3);
  analysis.needs_clarification = Boolean(analysis.needs_clarification || analysis.suggested_questions.length);
  analysis.moderation_reason = cleanString(analysis.moderation_reason || analysis.rejection_reason_if_any || "");
  const modelUsed = prompt.model || OPENAI_NEED_MODEL;
  const usageSummary = openAIUsageSummary(modelResult?.payload || {}, modelResult?.durationMs || null, modelUsed);

  const analysisInsert = await supabaseInsert("need_analysis", {
    need_id: need.id,
    summary: cleanString(analysis.summary),
    primary_problem: cleanString(analysis.primary_problem),
    secondary_problems: analysis.secondary_problems,
    category: cleanString(analysis.category),
    subcategory: cleanString(analysis.subcategory),
    desired_outcome: cleanString(analysis.desired_outcome),
    constraints: cleanString(analysis.constraints),
    estimated_complexity: cleanString(analysis.estimated_complexity),
    commercial_value_score: analysis.commercial_intent === "high" ? 0.85 : analysis.commercial_intent === "medium" ? 0.55 : 0.25,
    repeatability_score: analysis.repeatability_score,
    confidence: analysis.confidence_score,
    analysis_version: `${prompt.name || "need_analysis"}:${prompt.version || "v1"}`,
    original_ai_output_reference: runId || null,
    user_type: cleanString(analysis.user_type),
    urgency: cleanString(analysis.urgency),
    budget_if_mentioned: cleanString(analysis.budget_if_mentioned),
    solution_tags: analysis.solution_tags,
    commercial_intent: cleanString(analysis.commercial_intent),
    needs_clarification: Boolean(analysis.needs_clarification),
    needs_human_review: Boolean(analysis.needs_human_review),
    safe_to_process: Boolean(analysis.safe_to_process),
    moderation_reason: analysis.moderation_reason,
    rejection_reason_if_any: cleanString(analysis.rejection_reason_if_any),
    user_facing_suggestion: cleanString(analysis.user_facing_suggestion),
    suggested_questions: analysis.suggested_questions,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  for (const tag of analysis.solution_tags) {
    await supabaseInsert("need_tags", { need_id: need.id, tag, source: OPENAI_API_KEY ? "ai" : "fallback" });
  }
  const matches = analysis.safe_to_process ? await matchNeedSolutions(need, analysis) : [];
  const bestScore = matches[0]?.score || 0;
  const nextStatus = !analysis.safe_to_process
    ? (analysis.rejection_reason_if_any === "illegal_request" ? "REJECTED_ILLEGAL" : "REJECTED_UNSAFE")
    : matches.length === 0
      ? "UNRESOLVED"
      : analysis.needs_human_review || analysis.confidence_score < AI_MATCH_THRESHOLD_LOW
        ? "NEEDS_HUMAN_REVIEW"
        : bestScore >= AI_MATCH_THRESHOLD_HIGH && analysis.confidence_score >= AI_MATCH_THRESHOLD_HIGH
          ? "MATCHED"
          : "ANALYZING";
  const narrativeState = buildPublicReasoningState({
    need,
    analysis,
    matches,
    status: nextStatus,
    feedback: need.metadata?.latest_feedback || null
  });
  await supabaseUpdate("needs", {
    status: nextStatus,
    detected_category: analysis.category || need.detected_category,
    detected_objective: analysis.desired_outcome || need.detected_objective,
    recommended_services: matches.map((match) => match.solution?.slug || match.slug || match.solution_slug || match.solution?.name || match.name).filter(Boolean).slice(0, 5),
    urgency: analysis.urgency === "unknown" ? need.urgency || null : analysis.urgency,
    budget_range: analysis.budget_if_mentioned || need.budget_range || null,
    is_unmet: nextStatus === "UNRESOLVED",
    metadata: {
      ...(need.metadata && typeof need.metadata === "object" ? need.metadata : {}),
      narrative_state: narrativeState,
      reasoning_state: narrativeState,
      narrative_state_updated_at: new Date().toISOString()
    },
    updated_at: new Date().toISOString()
  }, { id: `eq.${need.id}` }, { returnRepresentation: false });
  await recordNeedEvent(need.id, need.user_id, aiStatus === "completed" ? "ai_analysis_completed" : "ai_analysis_failed", { to_status: nextStatus, note: errorMessage || null, metadata: { confidence: analysis.confidence_score, matches: matches.length } });
  await recordSiteEvent({
    userId: need.user_id || null,
    sessionId: need.session_id || null,
    eventType: aiStatus === "completed" ? "need_analysis_completed" : "need_analysis_failed",
    entityType: "need",
    entityId: need.id,
    metadata: { confidence: analysis.confidence_score, matches: matches.length, status: nextStatus, runStatus: aiStatus }
  });
  const estimatedCreditsForUsage = estimatedUsageCredits(usageSummary) || USAGE_GATE_NEED_ANALYSIS_CREDITS;
  const chargedUsageCredits = USAGE_GATE_ENFORCED && need.user_id && usageReservation?.ok && ["completed", "skipped"].includes(aiStatus)
    ? Math.min(estimatedCreditsForUsage, Number(usageReservation.reservation?.reserved_credits || estimatedCreditsForUsage))
    : 0;
  const usageEvent = await recordUsageEvent({
    userId: need.user_id || null,
    needId: need.id,
    sessionId: need.session_id || null,
    operation: operationName,
    provider: "openai",
    model: modelUsed,
    usageSummary,
    status: aiStatus === "failed" || aiStatus === "timeout" ? "failed" : "recorded",
    chargedCredits: chargedUsageCredits,
    metadata: {
      run_id: runId || null,
      run_status: aiStatus,
      source: OPENAI_API_KEY && modelResult?.payload ? "model" : "fallback",
      next_status: nextStatus,
      confidence: analysis.confidence_score,
      matches: matches.length,
      ...(options.usageMetadata || {}),
      usage_gate: {
        enforced: USAGE_GATE_ENFORCED,
        reservation_id: usageReservation?.reservation?.id || null,
        reservation_status: usageReservation?.reservation?.status || usageReservation?.status || null,
        dry_run: !USAGE_GATE_ENFORCED,
        estimated_or_reserved_credits: USAGE_GATE_ENFORCED ? Number(usageReservation?.reservation?.reserved_credits || 0) : estimatedCreditsForUsage,
        consumption_order: options.consumptionOrder || ["free_entitlement", "subscription_entitlement", "wallet_credits"]
      },
      note: USAGE_GATE_ENFORCED
        ? "UsageGate actif : debit uniquement apres resultat livre."
        : "UsageGate prepare en dry-run. Aucun debit credit reel sans CHRONOTRADE_USAGE_GATE_ENFORCED=true."
    }
  });
  const usageEventId = Array.isArray(usageEvent.data) ? usageEvent.data[0]?.id : usageEvent.data?.id;
  if (USAGE_GATE_ENFORCED && need.user_id && usageReservation?.ok && usageReservation?.reservation?.id) {
    if (["failed", "timeout", "blocked_usage_gate", "blocked_cost_guard"].includes(aiStatus)) {
      await releaseUsageReservation({
        reservationId: usageReservation.reservation.id,
        userId: need.user_id,
        reason: aiStatus,
        metadata: { need_id: need.id, run_id: runId || null, usage_event_id: usageEventId || null }
      });
    } else {
      const settlement = await settleUsageReservation({
        reservationId: usageReservation.reservation.id,
        userId: need.user_id,
        usageEventId,
        chargedCredits: chargedUsageCredits,
        metadata: { need_id: need.id, run_id: runId || null, delivered: true }
      });
      if (settlement?.ok && chargedUsageCredits > 0) {
        await recordSiteEvent({
          userId: need.user_id,
          sessionId: need.session_id || null,
          eventType: "credits_used",
          entityType: "need",
          entityId: need.id,
          metadata: {
            operation: operationName,
            charged_credits: chargedUsageCredits,
            reservation_id: usageReservation.reservation.id,
            usage_event_id: usageEventId || null
          }
        });
      }
    }
  }
  if (matches.length) await recordNeedEvent(need.id, need.user_id, "ai_match_generated", { metadata: { bestScore, matches: matches.map((match) => ({ solution_id: match.solution_id, score: match.score })) } });
  if (matches.length) {
    await recordNeedEvent(need.id, need.user_id, "solution_proposed", { metadata: { bestScore, matches: matches.map((match) => ({ solution_id: match.solution_id, score: match.score, rank: match.rank })) } });
    await recordSiteEvent({
      userId: need.user_id || null,
      sessionId: need.session_id || null,
      eventType: "solution_proposed",
      entityType: "need",
      entityId: need.id,
      metadata: { bestScore, matches: matches.length, status: nextStatus }
    });
  }
  if (!analysis.safe_to_process) {
    await recordNeedEvent(need.id, need.user_id, "need_rejected", { to_status: nextStatus, metadata: { reason: analysis.moderation_reason || analysis.rejection_reason_if_any || "unsafe" } });
    await recordSiteEvent({
      userId: need.user_id || null,
      sessionId: need.session_id || null,
      eventType: "need_rejected",
      entityType: "need",
      entityId: need.id,
      metadata: { reason: analysis.moderation_reason || analysis.rejection_reason_if_any || "unsafe", status: nextStatus }
    });
  }
  if (nextStatus === "UNRESOLVED") {
    await recordNeedEvent(need.id, need.user_id, "no_solution_found", { to_status: nextStatus, metadata: { category: analysis.category || null, tags: analysis.solution_tags || [] } });
    await recordSiteEvent({
      userId: need.user_id || null,
      sessionId: need.session_id || null,
      eventType: "no_solution_found",
      entityType: "need",
      entityId: need.id,
      metadata: { category: analysis.category || null, tags: analysis.solution_tags || [] }
    });
  }
  if (runId) {
    await supabaseUpdate("ai_analysis_runs", {
      status: aiStatus,
      confidence_score: analysis.confidence_score,
      needs_human_review: Boolean(analysis.needs_human_review),
      safe_to_process: Boolean(analysis.safe_to_process),
      error_message: errorMessage || null,
      duration_ms: usageSummary.duration_ms,
      input_tokens: usageSummary.input_tokens,
      output_tokens: usageSummary.output_tokens,
      total_tokens: usageSummary.total_tokens,
      estimated_cost_usd: usageSummary.estimated_cost_usd,
      call_count: OPENAI_API_KEY && modelResult?.payload ? 1 : 0,
      usage: usageSummary,
      result: { analysis, matches: matches.map((match) => ({ solution_id: match.solution_id, score: match.score, confidence_band: match.confidence_band })) },
      completed_at: new Date().toISOString()
    }, { id: `eq.${runId}` }, { returnRepresentation: false });
  }
  return { ok: true, status: nextStatus, analysis, matches, runStatus: aiStatus, analysisInsert, narrativeState, reasoningState: narrativeState };
}

async function supabaseAuthUser(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const token = String(header).startsWith("Bearer ") ? String(header).slice(7).trim() : "";
  if (!token || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${token}`,
      accept: "application/json"
    }
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function requireSupabaseAdmin(req, res) {
  const user = await supabaseAuthUser(req);
  if (!user?.id) {
    jsonResponse(res, 401, { ok: false, error: "Connexion admin requise." });
    return null;
  }
  const role = await supabaseSelect("users", { select: "id,email,role", id: `eq.${user.id}`, limit: "1" });
  const profile = role.ok && Array.isArray(role.data) ? role.data[0] : null;
  if (!["admin", "super_admin"].includes(profile?.role)) {
    jsonResponse(res, 403, { ok: false, error: "Acces super-admin requis." });
    return null;
  }
  return { user, profile };
}

async function requireSupabaseSuperAdmin(req, res) {
  const user = await supabaseAuthUser(req);
  if (!user?.id) {
    jsonResponse(res, 401, { ok: false, error: "Connexion super-admin requise." });
    return null;
  }
  const role = await supabaseSelect("users", { select: "id,email,role", id: `eq.${user.id}`, limit: "1" });
  const profile = role.ok && Array.isArray(role.data) ? role.data[0] : null;
  const email = String(profile?.email || user.email || "").trim().toLowerCase();
  const allowed = SUPER_ADMIN_EMAILS.has(email);
  const ownerProfile = allowed && !profile
    ? { id: user.id, email, role: "super_admin", inferred_owner: true }
    : profile;
  if (!allowed) {
    jsonResponse(res, 403, { ok: false, error: "Acces super-admin proprietaire requis." });
    return null;
  }
  return { user, profile: ownerProfile };
}

async function requireSupabaseUser(req, res) {
  const user = await supabaseAuthUser(req);
  if (!user?.id) {
    jsonResponse(res, 401, { ok: false, error: "Compte ChronoTrade requis avant paiement." });
    return null;
  }
  return user;
}

async function stripeRequest(path, { method = "GET", body } = {}) {
  if (!STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY absente dans Render.");
  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {})
    },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `Erreur Stripe ${response.status}`);
  return data;
}

function stripeParams(input = {}) {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return params;
}

function productAmountCents(product) {
  const amount = product?.price_cents ?? product?.stripe_price_amount;
  return Number.isFinite(Number(amount)) ? Number(amount) : null;
}

function normalizeBillingModel(value, legacyPricing = "") {
  const raw = cleanString(value || legacyPricing || "ONE_TIME").toUpperCase();
  const normalized = raw.replace(/[-\s]+/g, "_");
  if (["FREE", "ONE_TIME", "CREDITS", "SUBSCRIPTION", "HYBRID"].includes(normalized)) return normalized;
  const legacy = cleanString(value || legacyPricing || "").toLowerCase();
  if (legacy === "free") return "FREE";
  if (legacy === "subscription") return "SUBSCRIPTION";
  if (legacy === "credits") return "CREDITS";
  if (["pack", "team", "marketplace_commission"].includes(legacy)) return "HYBRID";
  return "ONE_TIME";
}

function legacyPricingModelFromBilling(billingModel, fallback = "one_time") {
  const model = normalizeBillingModel(billingModel, fallback);
  if (model === "FREE") return "free";
  if (model === "SUBSCRIPTION") return "subscription";
  if (model === "CREDITS") return "credits";
  if (model === "HYBRID") return "pack";
  return fallback || "one_time";
}

function productBillingModel(product = {}) {
  return normalizeBillingModel(product.billing_model, product.pricing_model || product.price_model);
}

function productEstimatedCostCents(product = {}, plan = null) {
  const productMetadata = product?.metadata && typeof product.metadata === "object" ? product.metadata : {};
  const planMetadata = plan?.metadata && typeof plan.metadata === "object" ? plan.metadata : {};
  const candidates = [
    plan?.estimated_cost_cents,
    planMetadata.estimated_cost_cents,
    planMetadata.cost_cents,
    product?.estimated_cost_cents,
    productMetadata.estimated_cost_cents,
    productMetadata.cost_cents,
    product?.commerce_config?.estimated_cost_cents,
    product?.commerce_config?.cost_cents
  ];
  const value = candidates.map(Number).find((amount) => Number.isFinite(amount) && amount > 0);
  return value ? Math.round(value) : 0;
}

function validateProfitGuard({ product = {}, plan = null, priceCents = null } = {}) {
  if (!PROFIT_GUARD_ENABLED) return { ok: true, skipped: true, reason: "disabled" };
  const amount = Number(priceCents ?? productAmountCents(plan || product));
  const estimatedCost = productEstimatedCostCents(product, plan);
  if (!estimatedCost || !Number.isFinite(amount)) return { ok: true, estimated_cost_cents: estimatedCost, price_cents: amount || 0 };
  const margin = Math.max(PROFIT_GUARD_MIN_MARGIN_CENTS, Math.ceil(estimatedCost * PROFIT_GUARD_MIN_MARGIN_RATE));
  const minimumPrice = estimatedCost + margin;
  if (amount < minimumPrice) {
    return {
      ok: false,
      price_cents: amount,
      estimated_cost_cents: estimatedCost,
      safety_margin_cents: margin,
      minimum_price_cents: minimumPrice,
      error: `Prix insuffisant : ${formatMoneyCents(amount)} < cout previsionnel + marge (${formatMoneyCents(minimumPrice)}).`
    };
  }
  return { ok: true, price_cents: amount, estimated_cost_cents: estimatedCost, safety_margin_cents: margin, minimum_price_cents: minimumPrice };
}

function unixToIso(value) {
  return value ? new Date(Number(value) * 1000).toISOString() : null;
}

function subscriptionAccessStatus(status) {
  return ["active", "trialing"].includes(String(status || "").toLowerCase()) ? "active" : "expired";
}

function configuredBillingPlans() {
  let plans = DEFAULT_BILLING_PLANS;
  if (process.env.CHRONOTRADE_BILLING_PLANS_JSON) {
    try {
      const parsed = JSON.parse(process.env.CHRONOTRADE_BILLING_PLANS_JSON);
      if (Array.isArray(parsed) && parsed.length) plans = parsed;
    } catch {}
  }
  return plans.map((plan) => {
    const code = cleanString(plan.code).toLowerCase();
    const envKey = code.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    return {
      code,
      name: cleanString(plan.name) || code,
      price_cents: Number(plan.price_cents || plan.priceCents || 0),
      currency: cleanString(plan.currency || "EUR").toUpperCase(),
      monthly_credits: Number(plan.monthly_credits || plan.monthlyCredits || 0),
      deep_dives: Number(plan.deep_dives || plan.deepDives || 0),
      stripe_price_id: cleanString(plan.stripe_price_id || plan.stripePriceId || process.env[`STRIPE_${envKey}_PRICE_ID`]),
      status: cleanString(plan.status || "active"),
      visible: plan.visible !== false,
      features: Array.isArray(plan.features) ? plan.features.map(cleanString).filter(Boolean) : []
    };
  }).filter((plan) => plan.code && plan.price_cents > 0);
}

function billingPlanByCode(code) {
  const cleanCode = cleanString(code).toLowerCase();
  return configuredBillingPlans().find((plan) => plan.code === cleanCode && plan.status !== "archived") || null;
}

function normalizeBillingPlan(row = {}) {
  const metadata = row.metadata || {};
  const code = cleanString(row.slug || row.code).toLowerCase();
  if (!code) return null;
  return {
    code,
    id: row.id || null,
    product_id: row.product_id || null,
    name: cleanString(row.name) || code,
    price_cents: Number(row.price_cents || row.priceCents || 0),
    currency: cleanString(row.currency || "EUR").toUpperCase(),
    monthly_credits: Number(metadata.monthly_credits || row.monthly_credits || 0),
    deep_dives: Number(metadata.deep_dives || row.deep_dives || 0),
    stripe_price_id: cleanString(row.stripe_price_id || metadata.stripe_price_id),
    status: cleanString(row.status || "active"),
    visible: metadata.visible !== false,
    features: Array.isArray(metadata.features) ? metadata.features.map(cleanString).filter(Boolean) : []
  };
}

async function configuredBillingPlansLive() {
  const defaults = configuredBillingPlans();
  const result = await supabaseSelect("product_plans", {
    select: "id,product_id,name,slug,pricing_model,price_cents,currency,interval,stripe_price_id,status,metadata",
    slug: "in.(essentiel,pro,max)",
    order: "sort_order.asc,created_at.asc"
  });
  if (!result.ok || !Array.isArray(result.data) || !result.data.length) return defaults;
  const live = result.data.map(normalizeBillingPlan).filter((plan) => plan && plan.status !== "archived" && plan.price_cents > 0);
  const merged = new Map(defaults.map((plan) => [plan.code, plan]));
  live.forEach((plan) => merged.set(plan.code, { ...(merged.get(plan.code) || {}), ...plan }));
  return [...merged.values()];
}

async function billingPlanByCodeLive(code) {
  const cleanCode = cleanString(code).toLowerCase();
  const plans = await configuredBillingPlansLive();
  return plans.find((plan) => plan.code === cleanCode && plan.status !== "archived") || null;
}

function creditsForEuroAmount(amountEur) {
  return Math.max(0, Math.round(Number(amountEur || 0) * CREDITS_PER_EUR));
}

function ledgerAmount(row) {
  return Number(row.amount_credits ?? row.credits ?? 0) || 0;
}

async function walletLedgerRows(userId, limit = 80) {
  if (!userId) return { rows: [], error: null };
  const result = await supabaseSelect("wallet_ledger", {
    select: "*",
    user_id: `eq.${userId}`,
    order: "created_at.desc",
    limit: String(limit)
  });
  return { rows: result.ok && Array.isArray(result.data) ? result.data : [], error: result.ok ? null : result.message };
}

async function walletBalance(userId) {
  const { rows } = await walletLedgerRows(userId, 500);
  return rows.reduce((total, row) => total + ledgerAmount(row), 0);
}

async function recordWalletLedgerEntry({
  userId,
  entryType,
  amountCredits,
  amountCents = null,
  currency = "EUR",
  externalReference,
  stripeSessionId = "",
  stripeInvoiceId = "",
  metadata = {}
}) {
  if (!userId || !externalReference) return { skipped: true, reason: "missing_user_or_reference" };
  const existing = await supabaseSelect("wallet_ledger", {
    select: "id,amount_credits,external_reference",
    external_reference: `eq.${externalReference}`,
    limit: "1"
  });
  if (existing.ok && Array.isArray(existing.data) && existing.data.length) {
    return { ok: true, duplicate: true, ledger: existing.data[0] };
  }
  const currentBalance = await walletBalance(userId);
  const nextBalance = currentBalance + Number(amountCredits || 0);
  const now = new Date().toISOString();
  const ledger = await supabaseInsert("wallet_ledger", {
    user_id: userId,
    entry_type: entryType,
    amount_credits: Number(amountCredits || 0),
    balance_after: nextBalance,
    amount_cents: amountCents,
    currency: cleanString(currency || "EUR").toUpperCase(),
    external_reference: externalReference,
    stripe_session_id: stripeSessionId || null,
    stripe_invoice_id: stripeInvoiceId || null,
    status: "posted",
    metadata,
    created_at: now
  });
  if (ledger.ok) {
    await supabaseUpsert("user_wallets", {
      user_id: userId,
      balance_credits: nextBalance,
      currency: "CREDIT",
      updated_at: now
    }, "user_id");
  }
  return { ...ledger, balance: nextBalance };
}

async function ensureWelcomeCredits(userId) {
  if (!userId || !WELCOME_CREDITS) return { skipped: true, reason: "missing_user_or_disabled" };
  return recordWalletLedgerEntry({
    userId,
    entryType: "welcome_bonus",
    amountCredits: WELCOME_CREDITS,
    amountCents: 0,
    currency: "CREDIT",
    externalReference: `welcome:${userId}:v1`,
    metadata: {
      source: "account_bootstrap",
      credit_bucket: "promotional",
      credit_origin: "welcome_bonus",
      label: `Bonus de bienvenue ChronoTrade - ${WELCOME_CREDITS} credits`,
      promotional: true,
      idempotent: true
    }
  });
}

async function activeUserSubscription(userId) {
  if (!userId) return null;
  const result = await supabaseSelect("subscriptions", {
    select: "*",
    user_id: `eq.${userId}`,
    status: "in.(active,trialing,past_due)",
    order: "current_period_end.desc",
    limit: "1"
  });
  return result.ok && Array.isArray(result.data) ? result.data[0] || null : null;
}

function subscriptionPlanFromMetadata(subscription) {
  const code = cleanString(subscription?.metadata?.planCode || subscription?.metadata?.plan_code || subscription?.metadata?.planSlug).toLowerCase();
  return billingPlanByCode(code);
}

function walletRecommendation({ ledgerRows = [], activePlan = null }) {
  if (activePlan) return null;
  const now = Date.now();
  const last30 = ledgerRows.filter((row) => {
    const created = row.created_at ? new Date(row.created_at).getTime() : 0;
    return created && now - created <= 30 * 24 * 60 * 60 * 1000 && row.entry_type === "credit_purchase";
  });
  const spentCents = last30.reduce((total, row) => total + Number(row.amount_cents || 0), 0);
  if (spentCents < 5000) return null;
  const plan = configuredBillingPlans().find((item) => item.code === "pro") || configuredBillingPlans()[1] || configuredBillingPlans()[0];
  if (!plan) return null;
  return {
    title: `${plan.name} pourrait devenir plus avantageux.`,
    text: `Sur les 30 derniers jours, vos achats ponctuels representent ${formatMoneyCents(spentCents, "EUR")}. Comparez avec ${formatMoneyCents(plan.price_cents, plan.currency)} / mois avant de racheter des credits.`,
    planCode: plan.code
  };
}

async function usageRowsForPeriod(userId, { start, end, limit = 200 } = {}) {
  if (!userId) return { rows: [], error: null };
  const filters = {
    select: "id,operation,provider,model,total_tokens,estimated_cost_usd,charged_credits,status,metadata,created_at",
    user_id: `eq.${userId}`,
    order: "created_at.desc",
    limit: String(limit)
  };
  if (start) filters.created_at = `gte.${start}`;
  const result = await supabaseSelect("usage_events", filters);
  const rows = result.ok && Array.isArray(result.data) ? result.data : [];
  const filtered = end ? rows.filter((row) => new Date(row.created_at).getTime() <= new Date(end).getTime()) : rows;
  return { rows: filtered, error: result.ok ? null : result.message };
}

function weeklyDeepDiveWindow(now = new Date()) {
  const start = new Date(now);
  const day = start.getUTCDay() || 7;
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - day + 1);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function freeDeepDiveStatus(userId, now = new Date()) {
  const window = weeklyDeepDiveWindow(now);
  if (!userId) {
    return {
      limit: FREE_WEEKLY_DEEP_DIVES,
      used: 0,
      remaining: 0,
      reset_at: window.end,
      requires_account: true,
      storage: { ok: false, reason: "account_required" }
    };
  }
  const usage = await usageRowsForPeriod(userId, { start: window.start, end: window.end, limit: 120 });
  const used = usage.rows.filter((row) => {
    const meta = row.metadata || {};
    return row.operation === "need_deep_dive"
      && row.status !== "failed"
      && row.status !== "released"
      && (meta.free_weekly_deep_dive === true || meta.freeDeepDive === true);
  }).length;
  return {
    limit: FREE_WEEKLY_DEEP_DIVES,
    used,
    remaining: Math.max(FREE_WEEKLY_DEEP_DIVES - used, 0),
    reset_at: window.end,
    period_start: window.start,
    period_end: window.end,
    storage: usage.error ? { ok: false, error: usage.error } : { ok: true }
  };
}

async function subscriptionDeepDiveStatus(userId, now = new Date()) {
  if (!userId) {
    return {
      limit: 0,
      used: 0,
      remaining: 0,
      reset_at: null,
      subscription: null,
      storage: { ok: false, reason: "account_required" }
    };
  }
  const subscription = await activeUserSubscription(userId);
  if (!subscription || subscriptionAccessStatus(subscription.status) !== "active") {
    return {
      limit: 0,
      used: 0,
      remaining: 0,
      reset_at: subscription?.current_period_end || null,
      subscription: subscription ? {
        id: subscription.id,
        status: subscription.status,
        plan_code: subscription.metadata?.planCode || subscription.metadata?.plan_code || null
      } : null,
      storage: { ok: true, reason: "no_active_subscription" }
    };
  }
  const plan = subscriptionPlanFromMetadata(subscription);
  const meta = subscription.metadata || {};
  const limit = Math.max(0, Number(meta.deep_dives || meta.deepDives || plan?.deep_dives || 0));
  const start = subscription.current_period_start || new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = subscription.current_period_end || null;
  const usage = await usageRowsForPeriod(userId, { start, end, limit: 200 });
  const used = usage.rows.filter((row) => {
    const metaRow = row.metadata || {};
    return row.operation === "need_deep_dive"
      && row.status !== "failed"
      && row.status !== "released"
      && (metaRow.subscription_deep_dive === true || metaRow.subscriptionDeepDive === true)
      && (!metaRow.subscription_id || metaRow.subscription_id === subscription.id);
  }).length;
  return {
    limit,
    used,
    remaining: Math.max(limit - used, 0),
    reset_at: end,
    period_start: start,
    period_end: end,
    subscription: {
      id: subscription.id,
      status: subscription.status,
      plan_code: plan?.code || meta.planCode || meta.plan_code || null,
      plan_name: plan?.name || meta.planName || meta.plan_name || "Abonnement ChronoTrade"
    },
    storage: usage.error ? { ok: false, error: usage.error } : { ok: true }
  };
}

async function deepDiveEntitlementStatus(userId) {
  const freeWeekly = await freeDeepDiveStatus(userId);
  const subscriptionDepth = await subscriptionDeepDiveStatus(userId);
  const nextSource = freeWeekly.remaining > 0
    ? "free_weekly"
    : subscriptionDepth.remaining > 0
      ? "subscription_depth"
      : "credits";
  return {
    next_source: nextSource,
    credit_cost: USAGE_GATE_NEED_ANALYSIS_CREDITS,
    free_weekly: freeWeekly,
    subscription_depth: subscriptionDepth,
    wallet_required: nextSource === "credits"
  };
}

function usageCredits(row) {
  const charged = Number(row?.charged_credits || 0);
  if (Number.isFinite(charged) && charged > 0) return charged;
  const estimated = Number(row?.metadata?.estimated_credits || 0);
  return Number.isFinite(estimated) && estimated > 0 ? estimated : 0;
}

function usageSummaryForWallet(rows = [], plan = null) {
  const usedCredits = rows.reduce((total, row) => total + usageCredits(row), 0);
  const freeLimit = FREE_MONTHLY_CREDITS;
  const subscriptionLimit = Number(plan?.monthly_credits || 0);
  const freeUsed = Math.min(usedCredits, freeLimit);
  const subscriptionUsed = Math.min(Math.max(usedCredits - freeLimit, 0), subscriptionLimit);
  const walletUsed = Math.max(usedCredits - freeLimit - subscriptionLimit, 0);
  return {
    period_used_credits: usedCredits,
    free_monthly_limit: freeLimit,
    free_remaining: Math.max(freeLimit - freeUsed, 0),
    subscription_monthly_limit: subscriptionLimit,
    subscription_remaining: Math.max(subscriptionLimit - subscriptionUsed, 0),
    wallet_estimated_used: walletUsed,
    total_events: rows.length,
    operations: rows.reduce((acc, row) => {
      const key = row.operation || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    recent: rows.slice(0, 8).map((row) => ({
      id: row.id,
      operation: row.operation,
      provider: row.provider || null,
      model: row.model || null,
      estimated_credits: usageCredits(row),
      charged_credits: Number(row.charged_credits || 0),
      status: row.status || "recorded",
      created_at: row.created_at
    }))
  };
}

async function reserveUsageCredits({ userId, operation, credits, externalReference, metadata = {} }) {
  const amount = Math.max(0, Math.ceil(Number(credits || 0)));
  if (!userId || !operation || !externalReference || amount < 1) {
    return { ok: false, skipped: true, reason: "missing_usage_reservation_input" };
  }
  const existing = await supabaseSelect("usage_reservations", {
    select: "id,status,reserved_credits,external_reference",
    external_reference: `eq.${externalReference}`,
    limit: "1"
  });
  if (existing.ok && Array.isArray(existing.data) && existing.data.length) {
    return { ok: true, duplicate: true, reservation: existing.data[0] };
  }
  const balance = await walletBalance(userId);
  if (balance < amount) {
    return { ok: false, status: "insufficient_credits", balance_credits: balance, required_credits: amount };
  }
  const reservation = await supabaseInsert("usage_reservations", {
    user_id: userId,
    operation: cleanString(operation).slice(0, 80),
    reserved_credits: amount,
    status: "reserved",
    external_reference: externalReference,
    metadata: {
      ...metadata,
      source: "usage_gate",
      balance_before: balance,
      consumption_order: ["free_entitlement", "subscription_entitlement", "wallet_credits"]
    }
  });
  if (!reservation.ok) return { ok: false, error: reservation.message };
  return { ok: true, reservation: Array.isArray(reservation.data) ? reservation.data[0] : reservation.data, balance_credits: balance };
}

async function settleUsageReservation({ reservationId, userId, usageEventId = null, chargedCredits = null, metadata = {} }) {
  if (!reservationId || !userId) return { ok: false, skipped: true, reason: "missing_settlement_input" };
  const lookup = await supabaseSelect("usage_reservations", {
    select: "*",
    id: `eq.${reservationId}`,
    user_id: `eq.${userId}`,
    limit: "1"
  });
  const reservation = lookup.ok && Array.isArray(lookup.data) ? lookup.data[0] : null;
  if (!reservation?.id) return { ok: false, error: lookup.message || "Reservation introuvable." };
  if (reservation.status === "settled") return { ok: true, duplicate: true, reservation };
  if (reservation.status !== "reserved") return { ok: false, error: `Reservation non payable (${reservation.status}).` };
  const amount = Math.max(0, Math.ceil(Number(chargedCredits ?? reservation.reserved_credits ?? 0)));
  if (amount > 0) {
    const ledger = await recordWalletLedgerEntry({
      userId,
      entryType: "usage_settle",
      amountCredits: -amount,
      currency: "CREDIT",
      externalReference: `usage_settle:${reservation.id}`,
      metadata: {
        ...metadata,
        reservationId: reservation.id,
        operation: reservation.operation,
        usageEventId,
        source: "usage_gate"
      }
    });
    if (!ledger.ok) return { ok: false, error: ledger.message || "Debit usage impossible." };
  }
  const updated = await supabaseUpdate("usage_reservations", {
    status: "settled",
    usage_event_id: usageEventId,
    updated_at: new Date().toISOString(),
    metadata: { ...(reservation.metadata || {}), ...metadata, charged_credits: amount }
  }, { id: `eq.${reservation.id}` }, { returnRepresentation: false });
  return { ok: updated.ok, reservation, charged_credits: amount, error: updated.ok ? null : updated.message };
}

async function releaseUsageReservation({ reservationId, userId, reason = "operation_failed", metadata = {} }) {
  if (!reservationId || !userId) return { ok: false, skipped: true, reason: "missing_release_input" };
  const lookup = await supabaseSelect("usage_reservations", {
    select: "*",
    id: `eq.${reservationId}`,
    user_id: `eq.${userId}`,
    limit: "1"
  });
  const reservation = lookup.ok && Array.isArray(lookup.data) ? lookup.data[0] : null;
  if (!reservation?.id) return { ok: false, error: lookup.message || "Reservation introuvable." };
  if (reservation.status === "released") return { ok: true, duplicate: true, reservation };
  if (reservation.status !== "reserved") return { ok: false, error: `Reservation non liberable (${reservation.status}).` };
  const updated = await supabaseUpdate("usage_reservations", {
    status: "released",
    updated_at: new Date().toISOString(),
    metadata: { ...(reservation.metadata || {}), ...metadata, release_reason: reason }
  }, { id: `eq.${reservation.id}` }, { returnRepresentation: false });
  return { ok: updated.ok, reservation, error: updated.ok ? null : updated.message };
}

function formatMoneyCents(amountCents, currency = "EUR") {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(Number(amountCents || 0) / 100);
}

function isPaidProduct(product) {
  const amount = productAmountCents(product);
  const billingModel = productBillingModel(product);
  if (billingModel === "FREE" || billingModel === "CREDITS") return false;
  return amount !== null && amount > 0;
}

function productAccessUrl(product, sessionId = "") {
  if (product?.delivery_type === "questionnaire" || product?.slug === "analyse-express") return analyseExpressQuestionnaireUrl(sessionId);
  if (product?.delivery_config?.access_url) return product.delivery_config.access_url;
  return `${SITE_ORIGIN}/dashboard/bibliotheque/`;
}

async function activeProductFile(productId) {
  if (!productId) return null;
  const result = await supabaseSelect("product_media", {
    select: "id,media_type,url,storage_bucket,storage_path,is_private,version,file_name,mime_type",
    product_id: `eq.${productId}`,
    is_private: "eq.true",
    order: "sort_order.asc,created_at.desc",
    limit: "1"
  });
  return result.ok && Array.isArray(result.data) ? result.data[0] || null : null;
}

async function productComponentsByBundle(productId) {
  if (!productId) return [];
  const result = await supabaseSelect("product_components", {
    select: "id,bundle_product_id,component_product_id,quantity,access_type,sort_order,metadata",
    bundle_product_id: `eq.${productId}`,
    order: "sort_order.asc,created_at.asc"
  });
  return result.ok && Array.isArray(result.data) ? result.data : [];
}

async function awardPackComponentEntitlements(order, userId, syncedOrderId) {
  if (!userId || !order?.productId) return [];
  const components = await productComponentsByBundle(order.productId);
  const results = [];
  for (const component of components) {
    const product = await supabaseProductBySlugOrId({ productId: component.component_product_id });
    if (!product?.id) {
      results.push({ skipped: true, reason: "component_product_missing", componentId: component.id });
      continue;
    }
    const privateFile = await activeProductFile(product.id);
    const accessUrl = productAccessUrl(product, order.stripeSessionId || "");
    const sync = await supabaseUpsert("entitlements", {
      user_id: userId,
      product_id: product.id,
      order_id: syncedOrderId || null,
      resource_type: product.slug || component.access_type || "product",
      status: "active",
      access_url: accessUrl,
      version: product.current_version || privateFile?.version || "1.0",
      metadata: {
        label: product.title,
        source: "pack_component",
        bundleProductId: order.productId,
        bundleProductSlug: order.productSlug || order.product || null,
        componentId: component.id,
        accessType: component.access_type || "included",
        quantity: component.quantity || 1,
        stripeSessionId: order.stripeSessionId || null,
        privateFile: privateFile ? {
          bucket: privateFile.storage_bucket,
          path: privateFile.storage_path,
          fileName: privateFile.file_name,
          version: privateFile.version
        } : null,
        ...(component.metadata || {})
      },
      created_at: order.createdAt,
      updated_at: order.updatedAt
    }, "user_id,resource_type,access_url");
    results.push({ componentId: component.id, productId: product.id, entitlement: sync });
  }
  return results;
}

async function syncProductWithStripe(product, reason = "manual_sync") {
  if (!product?.id) throw new Error("Produit introuvable.");
  if (!isPaidProduct(product)) {
    await supabaseUpdate("products", {
      stripe_price_active: false,
      stripe_sync_error: null,
      stripe_last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { id: `eq.${product.id}` });
    return { product, stripeProduct: null, stripePrice: null, skipped: "free_or_quote_product" };
  }
  if (product.status === "archived") throw new Error("Produit archive : achat impossible.");
  const amount = productAmountCents(product);
  const profitGuard = validateProfitGuard({ product, priceCents: amount });
  if (!profitGuard.ok) throw new Error(profitGuard.error);
  const currency = String(product.currency || "EUR").toLowerCase();
  let stripeProductId = product.stripe_product_id || "";
  try {
    if (!stripeProductId) {
      const stripeProduct = await stripeRequest("/v1/products", {
        method: "POST",
        body: stripeParams({
          name: product.title,
          description: product.short_description || product.description || "",
          "metadata[chronotrade_product_id]": product.id,
          "metadata[chronotrade_slug]": product.slug,
          "metadata[source]": "chronotrade_super_admin"
        })
      });
      stripeProductId = stripeProduct.id;
    } else {
      await stripeRequest(`/v1/products/${encodeURIComponent(stripeProductId)}`, {
        method: "POST",
        body: stripeParams({
          name: product.title,
          description: product.short_description || product.description || "",
          "metadata[chronotrade_product_id]": product.id,
          "metadata[chronotrade_slug]": product.slug
        })
      });
    }

    const priceMatches = product.stripe_price_id
      && Number(product.stripe_price_amount || product.price_cents) === amount
      && String(product.stripe_price_currency || product.currency || "EUR").toLowerCase() === currency;
    let stripePriceId = priceMatches ? product.stripe_price_id : "";
    let previousStripePriceId = priceMatches ? "" : product.stripe_price_id || "";
    if (!stripePriceId) {
      const price = await stripeRequest("/v1/prices", {
        method: "POST",
        body: stripeParams({
          unit_amount: amount,
          currency,
          product: stripeProductId,
          "metadata[chronotrade_product_id]": product.id,
          "metadata[chronotrade_slug]": product.slug,
          "metadata[chronotrade_price_cents]": amount,
          "metadata[source]": "chronotrade_super_admin"
        })
      });
      stripePriceId = price.id;
      if (previousStripePriceId) {
        await stripeRequest(`/v1/prices/${encodeURIComponent(previousStripePriceId)}`, {
          method: "POST",
          body: stripeParams({ active: "false" })
        }).catch(() => null);
      }
    }

    const syncAt = new Date().toISOString();
    await supabaseUpdate("products", {
      stripe_product_id: stripeProductId,
      stripe_price_id: stripePriceId,
      stripe_price_active: true,
      stripe_price_amount: amount,
      stripe_price_currency: String(product.currency || "EUR").toUpperCase(),
      stripe_last_sync_at: syncAt,
      stripe_sync_error: null,
      checkout_url: `/api/checkout/session?slug=${product.slug}`,
      updated_at: syncAt
    }, { id: `eq.${product.id}` });
    await supabaseInsert("product_price_history", {
      product_id: product.id,
      stripe_product_id: stripeProductId,
      stripe_price_id: stripePriceId,
      previous_stripe_price_id: previousStripePriceId || null,
      amount_cents: amount,
      currency: String(product.currency || "EUR").toUpperCase(),
      pricing_model: product.pricing_model || "one_time",
      reason,
      metadata: { slug: product.slug, title: product.title }
    });
    return {
      product: { ...product, stripe_product_id: stripeProductId, stripe_price_id: stripePriceId, stripe_price_amount: amount, stripe_price_currency: String(product.currency || "EUR").toUpperCase() },
      stripeProduct: stripeProductId,
      stripePrice: stripePriceId
    };
  } catch (error) {
    await supabaseUpdate("products", {
      stripe_sync_error: error.message,
      stripe_price_active: false,
      updated_at: new Date().toISOString()
    }, { id: `eq.${product.id}` }, { returnRepresentation: false });
    throw error;
  }
}

async function ensureStripeCustomerForUser(user) {
  if (!user?.id) throw new Error("Utilisateur ChronoTrade requis.");
  const profileResult = await supabaseSelect("users", { select: "id,email,stripe_customer_id", id: `eq.${user.id}`, limit: "1" });
  const profile = profileResult.ok && Array.isArray(profileResult.data) ? profileResult.data[0] : null;
  if (profile?.stripe_customer_id) return profile.stripe_customer_id;
  const email = profile?.email || user.email || "";
  const customer = await stripeRequest("/v1/customers", {
    method: "POST",
    body: stripeParams({
      email,
      "metadata[chronotrade_user_id]": user.id,
      "metadata[source]": "chronotrade_account"
    })
  });
  await supabaseUpdate("users", { stripe_customer_id: customer.id, updated_at: new Date().toISOString() }, { id: `eq.${user.id}` }, { returnRepresentation: false });
  return customer.id;
}

async function syncPlanWithStripe(product, plan, reason = "plan_sync") {
  if (!plan?.id) return syncProductWithStripe(product, reason);
  if (!isPaidProduct(plan)) {
    await supabaseUpdate("product_plans", {
      stripe_price_active: false,
      updated_at: new Date().toISOString()
    }, { id: `eq.${plan.id}` }, { returnRepresentation: false });
    return { product, plan, stripeProduct: product.stripe_product_id || null, stripePrice: null, skipped: "free_plan" };
  }
  const productSync = await syncProductWithStripe({ ...product, price_cents: product.price_cents || plan.price_cents }, `${reason}_product`);
  const stripeProductId = productSync.product.stripe_product_id;
  const amount = productAmountCents(plan);
  const profitGuard = validateProfitGuard({ product, plan, priceCents: amount });
  if (!profitGuard.ok) throw new Error(profitGuard.error);
  const currency = String(plan.currency || product.currency || "EUR").toLowerCase();
  const priceMatches = plan.stripe_price_id
    && Number(plan.stripe_price_amount || plan.price_cents) === amount
    && String(plan.stripe_price_currency || plan.currency || "EUR").toLowerCase() === currency;
  let stripePriceId = priceMatches ? plan.stripe_price_id : "";
  const previousStripePriceId = priceMatches ? "" : plan.stripe_price_id || "";
  if (!stripePriceId) {
    const params = {
      unit_amount: amount,
      currency,
      product: stripeProductId,
      "metadata[chronotrade_product_id]": product.id,
      "metadata[chronotrade_plan_id]": plan.id,
      "metadata[chronotrade_slug]": product.slug,
      "metadata[source]": "chronotrade_super_admin_plan"
    };
    if (productBillingModel(plan) === "SUBSCRIPTION" || plan.pricing_model === "subscription") {
      params["recurring[interval]"] = plan.interval || "month";
      params["recurring[interval_count]"] = Number(plan.interval_count || 1);
    }
    const price = await stripeRequest("/v1/prices", { method: "POST", body: stripeParams(params) });
    stripePriceId = price.id;
    if (previousStripePriceId) {
      await stripeRequest(`/v1/prices/${encodeURIComponent(previousStripePriceId)}`, {
        method: "POST",
        body: stripeParams({ active: "false" })
      }).catch(() => null);
    }
  }
  await supabaseUpdate("product_plans", {
    stripe_price_id: stripePriceId,
    stripe_price_amount: amount,
    stripe_price_currency: String(plan.currency || product.currency || "EUR").toUpperCase(),
    stripe_price_active: true,
    updated_at: new Date().toISOString()
  }, { id: `eq.${plan.id}` });
  await supabaseInsert("product_price_history", {
    product_id: product.id,
    stripe_product_id: stripeProductId,
    stripe_price_id: stripePriceId,
    previous_stripe_price_id: previousStripePriceId || null,
    amount_cents: amount,
    currency: String(plan.currency || product.currency || "EUR").toUpperCase(),
    pricing_model: plan.pricing_model || "one_time",
    reason,
    metadata: { slug: product.slug, title: product.title, planId: plan.id, planSlug: plan.slug }
  });
  return { product: productSync.product, plan: { ...plan, stripe_price_id: stripePriceId }, stripeProduct: stripeProductId, stripePrice: stripePriceId };
}

async function userProfileForPromotion(user) {
  if (!user?.id) return null;
  const result = await supabaseSelect("users", {
    select: "id,email,created_at",
    id: `eq.${user.id}`,
    limit: "1"
  });
  const profile = result.ok && Array.isArray(result.data) ? result.data[0] : null;
  return profile || { id: user.id, email: user.email || "", created_at: user.created_at || null };
}

function promotionDiscountCents(promo, product) {
  const amount = productAmountCents(product) || 0;
  const value = Number(promo.discount_value || 0);
  const discountCents = promo.discount_type === "fixed"
    ? Math.min(amount, Math.round(value * 100))
    : Math.min(amount, Math.round(amount * (value / 100)));
  return Math.max(0, discountCents);
}

async function promotionAppliesToProduct(promo, product, customerEmail = "", user = null) {
  if (!promo?.id || !product?.id) return null;
  const cleanCode = String(promo.code || "").trim().toUpperCase();
  const now = new Date().toISOString();
  if (promo.status && promo.status !== "active") return null;
  if (promo.stacking_policy === "disabled") return null;
  if (promo.product_id && promo.product_id !== product.id) return null;
  if (promo.user_id && promo.user_id !== user?.id) return null;
  if (promo.starts_at && promo.starts_at > now) return null;
  if (promo.ends_at && promo.ends_at < now) return null;
  const userProfile = await userProfileForPromotion(user);
  const isWelcomeOffer = cleanCode === "CHRONO10" || promo.metadata?.welcome_offer === true;
  if (isWelcomeOffer) {
    if (!userProfile?.id) return null;
    const createdAt = userProfile.created_at ? new Date(userProfile.created_at).getTime() : 0;
    const ageMs = Date.now() - createdAt;
    if (!createdAt || ageMs > 48 * 60 * 60 * 1000) return null;
  }
  const max = Number(promo.max_redemptions || 0);
  if (max > 0) {
    const redemptions = await supabaseSelect("promotion_redemptions", { select: "id", promotion_id: `eq.${promo.id}` });
    if (redemptions.ok && Array.isArray(redemptions.data) && redemptions.data.length >= max) return null;
  }
  const perUserLimit = Number(promo.per_user_limit || 0);
  if (perUserLimit > 0 && user?.id) {
    const redemptions = await supabaseSelect("promotion_redemptions", {
      select: "id",
      promotion_id: `eq.${promo.id}`,
      user_id: `eq.${user.id}`
    });
    if (redemptions.ok && Array.isArray(redemptions.data) && redemptions.data.length >= perUserLimit) return null;
  }
  return { ...promo, discount_cents: promotionDiscountCents(promo, product), customer_email: customerEmail };
}

async function validPromotionForProduct(code, product, customerEmail = "", user = null) {
  const cleanCode = String(code || "").trim().toUpperCase();
  if (!cleanCode) return null;
  const result = await supabaseSelect("promotions", {
    select: "*",
    code: `eq.${cleanCode}`,
    status: "eq.active",
    limit: "1"
  });
  const promo = result.ok && Array.isArray(result.data) ? result.data[0] : null;
  return promotionAppliesToProduct(promo, product, customerEmail, user);
}

async function bestPromotionForProduct(product, customerEmail = "", user = null) {
  if (!product?.id) return null;
  const result = await supabaseSelect("promotions", {
    select: "*",
    status: "eq.active",
    order: "created_at.desc",
    limit: "50"
  });
  const promotions = result.ok && Array.isArray(result.data) ? result.data : [];
  const applicable = [];
  for (const promo of promotions) {
    const code = String(promo.code || "").trim().toUpperCase();
    const autoApply = promo.product_id === product.id || code === "CHRONO10" || promo.metadata?.auto_apply === true;
    if (!autoApply) continue;
    const evaluated = await promotionAppliesToProduct(promo, product, customerEmail, user);
    if (evaluated?.discount_cents > 0) applicable.push(evaluated);
  }
  applicable.sort((a, b) => {
    if (b.discount_cents !== a.discount_cents) return b.discount_cents - a.discount_cents;
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });
  return applicable[0] || null;
}

async function syncPromotionWithStripe(promotion, product) {
  if (!promotion?.id) return null;
  if (promotion.stripe_promotion_code_id) return promotion;
  const currency = String(product.currency || "EUR").toLowerCase();
  const value = Number(promotion.discount_value || 0);
  const couponParams = {
    name: promotion.label || promotion.code,
    duration: "once",
    "metadata[chronotrade_promotion_id]": promotion.id,
    "metadata[chronotrade_code]": promotion.code || "",
    "metadata[chronotrade_product_id]": product.id || ""
  };
  if (promotion.discount_type === "fixed") {
    couponParams.amount_off = Math.round(value * 100);
    couponParams.currency = currency;
  } else {
    couponParams.percent_off = Math.max(1, Math.min(100, value));
  }
  const coupon = await stripeRequest("/v1/coupons", {
    method: "POST",
    body: stripeParams(couponParams)
  });
  const promoCode = await stripeRequest("/v1/promotion_codes", {
    method: "POST",
    body: stripeParams({
      coupon: coupon.id,
      code: promotion.code,
      active: "true",
      max_redemptions: promotion.max_redemptions || "",
      expires_at: promotion.ends_at ? Math.floor(new Date(promotion.ends_at).getTime() / 1000) : "",
      "metadata[chronotrade_promotion_id]": promotion.id,
      "metadata[chronotrade_product_id]": product.id || ""
    })
  });
  await supabaseUpdate("promotions", {
    stripe_coupon_id: coupon.id,
    stripe_promotion_code_id: promoCode.id,
    updated_at: new Date().toISOString()
  }, { id: `eq.${promotion.id}` });
  return { ...promotion, stripe_coupon_id: coupon.id, stripe_promotion_code_id: promoCode.id };
}

function fullNameFromLead(lead) {
  return `${lead.answers.firstName || ""} ${lead.answers.lastName || ""}`.trim() || "Prospect ChronoTrade";
}

function leadDescription(lead) {
  return [
    lead.answers.description,
    lead.answers.message,
    lead.answers.mainGoal,
    lead.answers.appGoal,
    lead.answers.processToAutomate,
    lead.answers.studioGoal
  ].filter(Boolean).join("\n\n").slice(0, 4000);
}

function isPartnerLead(lead) {
  return cleanString(lead.answers.requestTopic).toLowerCase().startsWith("candidature partenaire");
}

function isBusinessLead(lead) {
  return cleanString(lead.answers.requestTopic).toLowerCase().startsWith("chronotrade business");
}

function isStudioLead(lead) {
  return cleanString(lead.answers.requestTopic).toLowerCase().startsWith("chronotrade studio");
}

function projectUniverse(lead) {
  if (lead.service === "chronotrade_launch") return "launch";
  if (lead.service === "automatisation_ia") return "os";
  if (lead.service === "motion") return "motion";
  return "studio";
}

function slugify(value) {
  return cleanString(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || randomUUID().slice(0, 8);
}

async function syncSupabase(lead) {
  try {
    if (isPartnerLead(lead)) {
      return await supabaseInsert("partners", {
        first_name: lead.answers.firstName || "",
        last_name: lead.answers.lastName || "",
        company_name: lead.answers.company || "",
        email: lead.email,
        phone: lead.answers.phone || "",
        category: lead.answers.job || "",
        expertise: lead.answers.clientTypes || "",
        city: lead.answers.location || "",
        website: lead.answers.website || "",
        instagram: lead.answers.portfolio || "",
        linkedin: lead.answers.linkedin || "",
        description: leadDescription(lead),
        status: "pending"
      });
    }

    if (isBusinessLead(lead)) {
      return await supabaseInsert("business_requests", {
        full_name: fullNameFromLead(lead),
        email: lead.email,
        company: lead.answers.company || "",
        need_type: lead.answers.need || lead.answers.requestTopic || "",
        category_requested: lead.answers.sector || "",
        city: lead.answers.city || lead.answers.location || "",
        description: leadDescription(lead),
        budget: lead.answers.budget || "",
        urgency: lead.answers.urgency || lead.answers.deadline || "",
        status: "new"
      });
    }

    if (lead.service === "chronotrade_launch" || lead.service === "automatisation_ia" || lead.service === "motion" || isStudioLead(lead)) {
      return await supabaseInsert("projects", {
        title: lead.answers.requestTopic || lead.serviceLabel || "Projet ChronoTrade",
        slug: slugify(`${lead.serviceLabel || lead.service}-${lead.id}`),
        client_name: fullNameFromLead(lead),
        universe: projectUniverse(lead),
        category: lead.serviceLabel || lead.service,
        short_description: leadDescription(lead).slice(0, 260),
        problem: lead.answers.mainBlocker || lead.answers.currentPain || lead.answers.imageProblem || "",
        solution: lead.summary || "",
        result: "Projet cree automatiquement depuis un formulaire ChronoTrade.",
        status: "draft",
        featured: false
      });
    }

    return { enabled: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY), skipped: true, message: "Lead non mappe vers une table Supabase dediee." };
  } catch (error) {
    return { enabled: true, ok: false, message: error.message };
  }
}

function notionProperties(lead) {
  const label = serviceLabels[lead.service] || lead.service;
  return {
    Nom: { title: [{ text: { content: `${lead.answers.firstName} ${lead.answers.lastName}` } }] },
    Email: { email: lead.email },
    Telephone: { phone_number: lead.answers.phone || null },
    Entreprise: { rich_text: [{ text: { content: lead.answers.company || "" } }] },
    Service: { select: { name: label } },
    Statut: { select: { name: lead.status } },
    Budget: { rich_text: [{ text: { content: lead.answers.budget || "" } }] },
    Echeance: { rich_text: [{ text: { content: lead.answers.deadline || "" } }] },
    Resume: { rich_text: [{ text: { content: lead.summary.slice(0, 1900) } }] },
    Source: { rich_text: [{ text: { content: "Formulaire ChronoTrade" } }] }
  };
}

async function sendViaGraph(email) {
  const tokenResult = await getMicrosoftGraphToken();
  if (!tokenResult.enabled || !process.env.OUTLOOK_FROM_EMAIL) {
    return { enabled: false, message: "Variables Outlook Graph absentes." };
  }

  const sendPath = tokenResult.delegated
    ? "me"
    : `users/${encodeURIComponent(process.env.OUTLOOK_FROM_EMAIL)}`;

  const response = await fetch(`https://graph.microsoft.com/v1.0/${sendPath}/sendMail`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${tokenResult.token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      message: {
        subject: email.subject,
        body: {
          contentType: "Text",
          content: email.text
        },
        toRecipients: [
          {
            emailAddress: {
              address: email.to
            }
          }
        ]
      },
      saveToSentItems: true
    })
  });

  return {
    enabled: true,
    ok: response.ok,
    message: response.ok ? "Email envoye." : await response.text()
  };
}

async function getMicrosoftGraphToken() {
  if (process.env.MICROSOFT_GRAPH_TOKEN) {
    return { enabled: true, token: process.env.MICROSOFT_GRAPH_TOKEN };
  }

  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const refreshToken = process.env.MICROSOFT_REFRESH_TOKEN;
  if (clientId && refreshToken) {
    return getMicrosoftGraphTokenFromRefreshToken(clientId, clientSecret, refreshToken);
  }

  if (!tenantId || !clientId || !clientSecret) {
    return { enabled: false };
  }

  const now = Date.now();
  if (graphTokenCache && graphTokenCache.expiresAt > now + 60000) {
    return { enabled: true, token: graphTokenCache.token };
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials"
  });

  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    return { enabled: false, message: await response.text() };
  }

  const payload = await response.json();
  graphTokenCache = {
    token: payload.access_token,
    expiresAt: now + Number(payload.expires_in || 3600) * 1000
  };
  return { enabled: true, token: graphTokenCache.token, delegated: false };
}

async function getMicrosoftGraphTokenFromRefreshToken(clientId, clientSecret, refreshToken) {
  const now = Date.now();
  if (graphTokenCache && graphTokenCache.expiresAt > now + 60000) {
    return { enabled: true, token: graphTokenCache.token, delegated: true };
  }

  const tenant = process.env.MICROSOFT_TENANT_ID || "common";
  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    scope: "https://graph.microsoft.com/Mail.Send offline_access",
    grant_type: "refresh_token"
  });
  if (clientSecret) body.set("client_secret", clientSecret);

  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    return { enabled: false, message: await response.text() };
  }

  const payload = await response.json();
  graphTokenCache = {
    token: payload.access_token,
    expiresAt: now + Number(payload.expires_in || 3600) * 1000
  };
  return { enabled: true, token: graphTokenCache.token, delegated: true };
}

async function sendInternalNotification(lead) {
  const to = process.env.INTERNAL_NOTIFICATION_EMAIL;
  if (!to) return { enabled: false, message: "Email interne absent." };
  return sendViaGraph({
    to,
    subject: `Nouvelle demande ChronoTrade - ${serviceLabels[lead.service]}`,
    text: lead.summary
  });
}

async function sendClientEmails(lead) {
  const reply = await sendViaGraph(lead.replyEmail);
  const quote = await sendViaGraph(lead.quoteEmail);
  return { reply, quote };
}

async function sendDueFollowups() {
  const followups = await readJson(followupsPath, []);
  const now = new Date();
  const due = followups.filter((item) => item.status === "scheduled" && new Date(item.scheduledFor) <= now);
  const results = [];
  for (const item of due) {
    const result = await sendViaGraph(item);
    item.lastAttemptAt = new Date().toISOString();
    item.delivery = result;
    if (result.enabled && result.ok) item.status = "sent";
    results.push({ id: item.id, result });
  }
  await writeJson(followupsPath, followups);
  return results;
}

async function handleLead(req, res) {
  try {
    const body = await readRequestBody(req);
    return createLead(res, cleanString(body.service), normalizePayload(body.answers || {}));
  } catch (error) {
    jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

async function handleLiveForm(req, res, kind) {
  try {
    const fields = await readRequestBody(req);
    const mapped = mapLiveFormByKind(kind, fields);
    return createLead(res, mapped.service, normalizePayload(mapped.answers));
  } catch (error) {
    jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

async function createLead(res, service, answers) {
    const errors = validateLead(service, answers);
    if (Object.keys(errors).length > 0) {
      return jsonResponse(res, 422, { ok: false, errors });
    }

    const now = new Date().toISOString();
    const lead = {
      id: randomUUID(),
      service,
      serviceLabel: serviceLabels[service],
      status: "Nouveau",
      email: answers.email.toLowerCase(),
      answers,
      createdAt: now,
      updatedAt: now
    };
    lead.summary = buildSummary(lead);
    lead.quote = buildQuoteProposal(lead);
    lead.quoteUrl = PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}/api/leads/${lead.id}/quote` : "";
    lead.quoteHtmlPath = await writeQuoteHtml(lead);
    lead.replyEmail = buildReplyEmail(lead);
    lead.quoteEmail = buildQuoteEmail(lead);

    const savedLead = await upsertLocalLead(lead);
    const notion = await syncNotion(savedLead);
    const supabase = await syncSupabase(savedLead);
    const notification = await sendInternalNotification(savedLead);
    const clientEmails = await sendClientEmails(savedLead);

    await addOutbox([
      {
        id: randomUUID(),
        leadId: savedLead.id,
        type: "reply",
        status: clientEmails.reply.ok ? "sent" : "prepared",
        sendResult: clientEmails.reply,
        createdAt: now,
        ...savedLead.replyEmail
      },
      {
        id: randomUUID(),
        leadId: savedLead.id,
        type: "quote",
        status: clientEmails.quote.ok ? "sent" : "prepared",
        sendResult: clientEmails.quote,
        createdAt: now,
        attachmentFiles: [savedLead.quoteHtmlPath],
        quote: savedLead.quote,
        ...savedLead.quoteEmail
      }
    ]);

    jsonResponse(res, 201, {
      ok: true,
      lead: {
        id: savedLead.id,
        status: savedLead.status,
        service: savedLead.serviceLabel,
        summary: savedLead.summary,
        quote: savedLead.quote,
        quoteUrl: savedLead.quoteUrl,
        quoteHtmlPath: savedLead.quoteHtmlPath,
        replyEmail: savedLead.replyEmail,
        quoteEmail: savedLead.quoteEmail
      },
      integrations: { notion, supabase, notification, clientEmails }
    });
}

async function handleResolveNeed(req, res) {
  try {
    const body = await readRequestBody(req);
    const authUser = await supabaseAuthUser(req);
    const rawText = cleanString(body.raw_text || body.rawText);
    if (rawText.length < 12) {
      return jsonResponse(res, 422, { ok: false, error: "Besoin trop court." });
    }
    if (!body.consent_service) {
      return jsonResponse(res, 422, { ok: false, error: "Consentement de service requis." });
    }
    const incomingSessionId = cleanString(body.session_id);
    const rateLimit = await checkResolveRateLimit({ req, sessionId: incomingSessionId, userId: authUser?.id || null });
    if (!rateLimit.allowed) {
      return jsonResponse(res, 429, {
        ok: false,
        code: rateLimit.code || "rate_limited",
        error: "Trop de demandes envoyees en peu de temps. Reessayez dans quelques minutes.",
        scope: rateLimit.scope,
        retry_after_seconds: rateLimit.retry_after_seconds,
        reset_at: rateLimit.reset_at
      });
    }
    if (!authUser?.id && incomingSessionId) {
      const existingGuestNeeds = await supabaseSelect("needs", {
        select: "id,status,title,raw_text,created_at",
        session_id: `eq.${incomingSessionId}`,
        user_id: "is.null",
        order: "created_at.asc",
        limit: "1"
      });
      const existingNeed = existingGuestNeeds.ok && Array.isArray(existingGuestNeeds.data) ? existingGuestNeeds.data[0] : null;
      if (existingNeed?.id) {
        return jsonResponse(res, 429, {
          ok: false,
          code: "guest_trial_used",
          error: "Votre premiere analyse gratuite est deja disponible. Creez un compte pour sauvegarder ce probleme et continuer.",
          cta: "Sauvegarder mon probleme et continuer",
          existing_need: {
            id: existingNeed.id,
            status: existingNeed.status,
            title: existingNeed.title || String(existingNeed.raw_text || "").slice(0, 90),
            created_at: existingNeed.created_at
          }
        });
      }
    }
    const serverRisk = detectResolveRiskServer(rawText);
    const payload = {
      user_id: authUser?.id || null,
      session_id: incomingSessionId || randomUUID(),
      raw_text: rawText,
      title: cleanString(body.title) || (rawText.length > 82 ? `${rawText.slice(0, 79)}...` : rawText),
      status: serverRisk?.status || cleanString(body.status) || "NEW",
      user_type: cleanString(body.user_type) || null,
      industry: cleanString(body.industry) || null,
      objective: cleanString(body.objective) || null,
      priority: cleanString(body.priority) || null,
      budget_range: cleanString(body.budget_range) || null,
      urgency: cleanString(body.urgency) || null,
      contact_email: cleanString(body.contact_email) || authUser?.email || null,
      email: cleanString(body.contact_email) || authUser?.email || null,
      contact_name: cleanString(body.contact_name) || null,
      wants_contact: Boolean(body.wants_contact || body.contact_email || authUser?.email),
      contact_permission: body.consent_marketing ? "marketing" : (body.contact_email || authUser?.email) ? "service_only" : "none",
      consent_service: Boolean(body.consent_service),
      consent_marketing: Boolean(body.consent_marketing),
      source_channel: cleanString(body.source_channel) || "resolve_home",
      source_campaign: cleanString(body.source_campaign) || null,
      source_content: cleanString(body.source_content) || null,
      utm_source: cleanString(body.utm_source) || null,
      utm_medium: cleanString(body.utm_medium) || null,
      utm_campaign: cleanString(body.utm_campaign) || null,
      utm_content: cleanString(body.utm_content) || null,
      landing_page: cleanString(body.landing_page) || null,
      referrer: cleanString(body.referrer) || null,
      first_touch: body.first_touch && typeof body.first_touch === "object" ? body.first_touch : {},
      last_touch: body.last_touch && typeof body.last_touch === "object" ? body.last_touch : {},
      detected_category: cleanString(body.detected_category) || null,
      detected_objective: cleanString(body.detected_objective) || null,
      recommended_services: Array.isArray(body.recommended_services) ? body.recommended_services.map(cleanString).filter(Boolean).slice(0, 8) : [],
      is_unmet: Boolean(body.is_unmet || serverRisk),
      metadata: {
        ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
        interaction_profile: body.interaction_profile && typeof body.interaction_profile === "object" ? body.interaction_profile : null,
        interaction_signals: body.interaction_signals && typeof body.interaction_signals === "object" ? body.interaction_signals : null,
        serverRisk: serverRisk ? { status: serverRisk.status, reason: serverRisk.reason } : null
      }
    };
    const inserted = await supabaseInsert("needs", payload);
    if (!inserted.ok && canUseLocalJsonFallback()) {
      const localNeed = await saveLocalResolveNeed(payload);
      const analysis = boostAnalysisWithBusinessSignals(fallbackNeedAnalysis(localNeed, serverRisk), localNeed);
      const reasoningState = buildPublicReasoningState({
        need: localNeed,
        analysis,
        matches: [],
        status: serverRisk?.status || "UNRESOLVED"
      });
      return jsonResponse(res, 201, {
        ok: true,
        need: { id: localNeed.id, status: serverRisk?.status || "UNRESOLVED", ref: `LOCAL-${String(localNeed.id).slice(0, 8).toUpperCase()}` },
        understood: {
          summary: analysis.summary || null,
          primaryProblem: analysis.primary_problem || null,
          desiredOutcome: analysis.desired_outcome || null,
          category: analysis.category || payload.detected_category || null,
          confidence: analysis.confidence_score ?? null
        },
        nextAction: analysis.desired_outcome || analysis.user_facing_suggestion || reasoningState.next_action || null,
        suggestion: analysis.user_facing_suggestion || null,
        questions: reasoningState.selected_question ? [reasoningState.selected_question] : [],
        narrative_state: reasoningState,
        reasoning_state: reasoningState,
        question_selector: {
          selected_question: reasoningState.selected_question,
          reason: reasoningState.selected_question_reason,
          should_ask: Boolean(reasoningState.selected_question),
          next_recommended_step: reasoningState.next_action,
          asks_one_question_by_default: true
        },
        similarCount: 0,
        matches: [],
        noCurrentSolution: true,
        integrations: {
          supabase: { ...inserted, fallback: "local_json", localPath: "data/resolve-needs.json" },
          notification: { enabled: false, skipped: true, reason: "local_json_fallback" },
          clientEmail: { enabled: false, skipped: true, reason: "local_json_fallback" },
          ai: { ok: false, status: "fallback_no_supabase" }
        }
      });
    }
    if (!inserted.ok) return jsonResponse(res, 500, { ok: false, error: inserted.message, integrations: { supabase: inserted } });
    const need = Array.isArray(inserted.data) ? inserted.data[0] : inserted.data;
    if (need?.id) {
      await supabaseInsert("need_events", {
        need_id: need.id,
        user_id: payload.user_id,
        event_type: "submitted",
        to_status: payload.status,
        note: "Demande transmise via l'API Resolve ChronoTrade.",
        metadata: { source: "api_resolve_need" }
      });
    }
    const ai = need?.id ? await analyzeNeedAfterSubmission({ ...need, ...payload, id: need.id }, serverRisk) : { skipped: true, reason: "need_insert_missing" };
    if (need?.id && payload.contact_email) await recordNeedEvent(need.id, payload.user_id, "email_provided", { metadata: { permission: payload.contact_permission } });
    if (need?.id && ai?.matches?.length) await recordNeedEvent(need.id, payload.user_id, "solution_suggested", { metadata: { count: ai.matches.length, bestScore: ai.matches[0]?.score || 0 } });
    if (need?.id && (ai?.status || payload.status) === "UNRESOLVED") await recordNeedEvent(need.id, payload.user_id, "need_unresolved", { metadata: { reason: "no_current_solution" } });
    let similarCount = 0;
    const categoryForSimilarity = cleanString(ai?.analysis?.category || payload.detected_category);
    if (categoryForSimilarity) {
      const similar = await supabaseSelect("needs", {
        select: "id",
        detected_category: `eq.${categoryForSimilarity}`,
        limit: "100"
      });
      similarCount = similar.ok && Array.isArray(similar.data)
        ? Math.max(0, similar.data.filter((row) => row.id !== need?.id).length)
        : 0;
    }
    const clientEmail = { enabled: false, skipped: true, reason: "resolve_need_dashboard_only" };
    if (need?.id) {
      await supabaseUpdate("needs", {
        user_response_status: "not_applicable",
        user_response_sent_at: null,
        updated_at: new Date().toISOString()
      }, { id: `eq.${need.id}` }, { returnRepresentation: false });
    }
    const notification = { enabled: false, skipped: true, reason: "resolve_need_saved_dashboard_only" };
    const reasoningState = ai?.reasoningState || ai?.narrativeState || buildPublicReasoningState({
      need: { ...need, ...payload, id: need?.id },
      analysis: ai?.analysis || {},
      matches: ai?.matches || [],
      status: ai?.status || payload.status
    });
    return jsonResponse(res, 201, {
      ok: true,
      need: { id: need?.id || null, status: ai?.status || payload.status, ref: need?.id ? `REQ-${String(need.id).slice(0, 8).toUpperCase()}` : null },
      understood: {
        summary: ai?.analysis?.summary || null,
        primaryProblem: ai?.analysis?.primary_problem || null,
        desiredOutcome: ai?.analysis?.desired_outcome || null,
        category: ai?.analysis?.category || payload.detected_category || null,
        confidence: ai?.analysis?.confidence_score ?? null
      },
      nextAction: ai?.analysis?.desired_outcome || ai?.analysis?.user_facing_suggestion || null,
      suggestion: ai?.analysis?.user_facing_suggestion || null,
      questions: reasoningState.selected_question ? [reasoningState.selected_question] : [],
      narrative_state: reasoningState,
      reasoning_state: reasoningState,
      question_selector: {
        selected_question: reasoningState.selected_question,
        reason: reasoningState.selected_question_reason,
        should_ask: Boolean(reasoningState.selected_question),
        next_recommended_step: reasoningState.next_action,
        asks_one_question_by_default: true
      },
      similarCount,
      matches: (ai?.matches || []).map((match) => ({
        solutionId: match.solution_id,
        score: match.score,
        confidenceBand: match.confidence_band,
        name: match.solution?.name || "",
        slug: match.solution?.slug || "",
        type: match.solution?.type || "",
        productId: match.solution?.product_id || null,
        reason: match.user_facing_copy || match.match_reason || ""
      })),
      noCurrentSolution: (ai?.status || payload.status) === "UNRESOLVED",
      integrations: { supabase: inserted, notification, clientEmail, ai: { ok: Boolean(ai?.ok), status: ai?.runStatus || ai?.status || "skipped" } }
    });
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

async function sendResolveInternalNotification(need) {
  const to = process.env.INTERNAL_NOTIFICATION_EMAIL;
  if (!to) return { enabled: false, message: "Email interne absent." };
  return sendViaGraph({
    to,
    subject: `Nouveau besoin Resolve ChronoTrade - ${need.detected_category || "a qualifier"}`,
    text: [
      `Reference: ${need.id ? `REQ-${String(need.id).slice(0, 8).toUpperCase()}` : "non disponible"}`,
      `Statut: ${need.status || "NEW"}`,
      `Profil: ${need.user_type || "non precise"}`,
      `Secteur: ${need.industry || "non precise"}`,
      `Priorite: ${need.priority || "non precisee"}`,
      `Email: ${need.contact_email || "non fourni"}`,
      "",
      "Besoin exprime:",
      need.raw_text,
      "",
      `Recommandations: ${(need.recommended_services || []).join(", ") || "a qualifier"}`,
      `Source: ${need.utm_source || need.source_channel || "site"}`
    ].join("\n")
  });
}

async function sendResolveClientConfirmation(need, ai = {}) {
  if (!need.contact_email) return { enabled: false, message: "Email client absent." };
  const status = ai?.status || need.status || "NEW";
  const noSolution = status === "UNRESOLVED";
  const matches = ai?.matches || [];
  const text = [
    `Bonjour${need.contact_name ? ` ${need.contact_name}` : ""},`,
    "",
    "Votre demande ChronoTrade a bien ete recue.",
    "",
    ai?.analysis?.user_facing_suggestion || (noSolution
      ? "Pas encore de solution immediate : votre demande est conservee et pourra servir a creer ou vous proposer une solution adaptee plus tard."
      : "ChronoTrade va analyser votre besoin et vous proposer la suite la plus adaptee."),
    "",
    matches.length ? "Pistes trouvees :" : "",
    ...matches.slice(0, 3).map((match) => `- ${match.solution?.name || "Solution ChronoTrade"} : ${match.user_facing_copy || match.match_reason || "piste a verifier"}`),
    "",
    "Reference : " + (need.id ? `REQ-${String(need.id).slice(0, 8).toUpperCase()}` : "en cours"),
    "Vous pouvez creer un compte ChronoTrade pour sauvegarder et suivre vos demandes.",
    "",
    "Flo - ChronoTrade"
  ].filter((line) => line !== "").join("\n");
  const email = {
    to: need.contact_email,
    subject: "Votre demande ChronoTrade a bien ete recue",
    text
  };
  const result = await sendViaGraph(email);
  await addOutbox([{ id: randomUUID(), needId: need.id || null, type: "resolve_client_confirmation", status: result.ok ? "sent" : "prepared", sendResult: result, createdAt: new Date().toISOString(), ...email }]);
  return result;
}

async function handleResolveClarification(req, res, needId) {
  try {
    const body = await readRequestBody(req);
    const authUser = await supabaseAuthUser(req);
    const question = cleanString(body.question);
    const answer = cleanString(body.answer);
    if (!question || !answer) return jsonResponse(res, 422, { ok: false, error: "Question et reponse requises." });
    const lookup = await supabaseSelect("needs", { select: "*", id: `eq.${cleanString(needId)}`, limit: "1" });
    const need = lookup.ok && Array.isArray(lookup.data) ? lookup.data[0] : null;
    if (!need?.id) return jsonResponse(res, 404, { ok: false, error: "Demande introuvable." });
    const sameSession = cleanString(body.session_id) && cleanString(body.session_id) === cleanString(need.session_id);
    const ownsNeed = authUser?.id && authUser.id === need.user_id;
    if (!sameSession && !ownsNeed) return jsonResponse(res, 403, { ok: false, error: "Cette precision ne peut pas etre ajoutee depuis cette session." });
    const inserted = await supabaseInsert("need_clarifications", {
      need_id: cleanString(needId),
      user_id: authUser?.id || null,
      session_id: cleanString(body.session_id) || null,
      question,
      answer,
      source: "user"
    });
    if (!inserted.ok) return jsonResponse(res, 500, { ok: false, error: inserted.message });
    await recordNeedEvent(cleanString(needId), authUser?.id || null, "clarification_answered", { metadata: { question } });
    await supabaseUpdate("needs", {
      status: "ANALYZING",
      metadata: {
        ...(need.metadata || {}),
        latest_clarification: { question, answer, received_at: new Date().toISOString() }
      },
      updated_at: new Date().toISOString()
    }, { id: `eq.${need.id}` }, { returnRepresentation: false });
    const enrichedNeed = {
      ...need,
      raw_text: `${need.raw_text}\n\nPrecision utilisateur: ${question}\n${answer}`,
      status: "ANALYZING",
      metadata: {
        ...(need.metadata || {}),
        latest_clarification: { question, answer }
      }
    };
    const ai = await analyzeNeedAfterSubmission(enrichedNeed, detectResolveRiskServer(enrichedNeed.raw_text));
    const reasoningState = ai?.reasoningState || ai?.narrativeState || buildPublicReasoningState({
      need: enrichedNeed,
      analysis: ai?.analysis || {},
      matches: ai?.matches || [],
      status: ai?.status || "ANALYZING",
      clarification: { question, answer }
    });
    return jsonResponse(res, 201, {
      ok: true,
      status: ai?.status || "ANALYZING",
      understood: {
        summary: ai?.analysis?.summary || null,
        primaryProblem: ai?.analysis?.primary_problem || null,
        desiredOutcome: ai?.analysis?.desired_outcome || null,
        category: ai?.analysis?.category || null,
        confidence: ai?.analysis?.confidence_score ?? null
      },
      questions: reasoningState.selected_question ? [reasoningState.selected_question] : [],
      raw_text: enrichedNeed.raw_text,
      narrative_state: { ...reasoningState, updated_by: "clarification" },
      reasoning_state: { ...reasoningState, updated_by: "clarification" },
      question_selector: {
        selected_question: reasoningState.selected_question,
        reason: reasoningState.selected_question_reason,
        should_ask: Boolean(reasoningState.selected_question),
        next_recommended_step: reasoningState.next_action,
        asks_one_question_by_default: true
      },
      matches: (ai?.matches || []).map((match) => ({
        solutionId: match.solution_id,
        score: match.score,
        confidenceBand: match.confidence_band,
        name: match.solution?.name || "",
        slug: match.solution?.slug || "",
        type: match.solution?.type || "",
        productId: match.solution?.product_id || null,
        reason: match.user_facing_copy || match.match_reason || ""
      })),
      noCurrentSolution: (ai?.status || "") === "UNRESOLVED"
    });
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

async function handleResolveMessage(req, res, needId) {
  try {
    const body = await readRequestBody(req);
    const authUser = await supabaseAuthUser(req);
    const message = cleanString(body.message || body.answer || body.text);
    if (message.length < 2) return jsonResponse(res, 422, { ok: false, error: "Message trop court." });
    if (!authUser?.id) {
      return jsonResponse(res, 401, {
        ok: false,
        code: "account_required_for_deep_dive",
        error: "Connectez-vous pour continuer cette conversation sans perdre l'historique."
      });
    }
    const lookup = await supabaseSelect("needs", { select: "*", id: `eq.${cleanString(needId)}`, limit: "1" });
    const need = lookup.ok && Array.isArray(lookup.data) ? lookup.data[0] : null;
    if (!need?.id) return jsonResponse(res, 404, { ok: false, error: "Demande introuvable." });
    const sameSession = cleanString(body.session_id) && cleanString(body.session_id) === cleanString(need.session_id);
    const ownsNeed = authUser.id && authUser.id === need.user_id;
    if (need.user_id && !ownsNeed) return jsonResponse(res, 403, { ok: false, error: "Cette conversation appartient a un autre compte." });
    if (!need.user_id && !sameSession) return jsonResponse(res, 403, { ok: false, error: "Cette conversation ne peut pas etre reprise depuis cette session." });

    const beforeEntitlements = await deepDiveEntitlementStatus(authUser.id);
    const wantsCredits = Boolean(body.use_credits || body.useCredits || body.accept_credit_charge);
    if (beforeEntitlements.next_source === "credits" && !wantsCredits) {
      return jsonResponse(res, 402, {
        ok: false,
        code: "free_deep_dive_exhausted",
        error: "Vos approfondissements inclus sont utilises pour le moment. Votre probleme reste sauvegarde : vous pouvez continuer avec vos credits ou reprendre au prochain renouvellement.",
        free_deep_dives: beforeEntitlements.free_weekly,
        subscription_deep_dives: beforeEntitlements.subscription_depth,
        entitlements: beforeEntitlements,
        credit_cost: USAGE_GATE_NEED_ANALYSIS_CREDITS
      });
    }
    const entitlementSource = beforeEntitlements.next_source;
    const consumesFreeWeekly = entitlementSource === "free_weekly";
    const consumesSubscriptionDepth = entitlementSource === "subscription_depth";
    const consumesWalletCredits = entitlementSource === "credits";

    const now = new Date().toISOString();
    const clientMessageId = cleanString(body.client_message_id || body.idempotency_key) || randomUUID();
    await recordNeedEvent(need.id, authUser.id, "conversation_message", {
      note: message,
      metadata: {
        source: "resolve_mini_chat",
        client_message_id: clientMessageId,
        entitlement_source: entitlementSource,
        used_free_deep_dive: consumesFreeWeekly,
        used_subscription_deep_dive: consumesSubscriptionDepth,
        use_credits_requested: wantsCredits
      }
    });
    if (!need.user_id && sameSession) {
      await supabaseUpdate("needs", {
        user_id: authUser.id,
        contact_email: cleanString(need.contact_email || authUser.email || null),
        email: cleanString(need.email || authUser.email || null),
        updated_at: now
      }, { id: `eq.${need.id}` }, { returnRepresentation: false });
    }
    const priorState = need.metadata?.narrative_state || need.metadata?.reasoning_state || {};
    const contextLines = [
      "Probleme initial:",
      need.raw_text || need.title || "",
      "",
      "Etat connu avant ce message:",
      JSON.stringify({
        known_facts: priorState.known_facts || priorState.explicit_facts || [],
        unknowns: priorState.unknowns || [],
        hypotheses: priorState.hypotheses || [],
        actions_proposed: priorState.actions_proposed || [],
        actions_tested: priorState.actions_tested || [],
        selected_solution: priorState.selected_solution || null
      }).slice(0, 2400),
      "",
      "Nouveau message utilisateur:",
      message
    ].join("\n");
    const enrichedNeed = {
      ...need,
      user_id: need.user_id || authUser.id,
      raw_text: contextLines,
      title: need.title || message.slice(0, 90),
      metadata: {
        ...(need.metadata || {}),
        latest_conversation_message: {
          message,
          received_at: now,
          client_message_id: clientMessageId
        }
      }
    };
    const ai = await analyzeNeedAfterSubmission(enrichedNeed, detectResolveRiskServer(contextLines), {
      operation: "need_deep_dive",
      chargeWallet: consumesWalletCredits,
      externalReference: `need_deep_dive:${need.id}:${authUser.id}:${clientMessageId}:v1`,
      consumptionOrder: consumesFreeWeekly
        ? ["free_weekly"]
        : consumesSubscriptionDepth
          ? ["subscription_depth"]
          : ["wallet_credits"],
      usageMetadata: {
        entitlement_source: entitlementSource,
        free_weekly_deep_dive: consumesFreeWeekly,
        subscription_deep_dive: consumesSubscriptionDepth,
        subscription_id: consumesSubscriptionDepth ? beforeEntitlements.subscription_depth?.subscription?.id || null : null,
        plan_code: consumesSubscriptionDepth ? beforeEntitlements.subscription_depth?.subscription?.plan_code || null : null,
        free_deep_dive_remaining_before: beforeEntitlements.free_weekly?.remaining || 0,
        subscription_deep_dive_remaining_before: beforeEntitlements.subscription_depth?.remaining || 0,
        client_message_id: clientMessageId,
        conversation_turn: true
      }
    });
    const afterEntitlements = await deepDiveEntitlementStatus(authUser.id);
    const reasoningState = ai?.reasoningState || ai?.narrativeState || buildPublicReasoningState({
      need: enrichedNeed,
      analysis: ai?.analysis || {},
      matches: ai?.matches || [],
      status: ai?.status || "ANALYZING"
    });
    await recordNeedEvent(need.id, authUser.id, "conversation_response", {
      to_status: ai?.status || null,
      metadata: {
        client_message_id: clientMessageId,
        entitlements: afterEntitlements,
        free_deep_dives: afterEntitlements.free_weekly,
        subscription_deep_dives: afterEntitlements.subscription_depth,
        matches: ai?.matches?.length || 0
      }
    });
    return jsonResponse(res, 201, {
      ok: true,
      status: ai?.status || "ANALYZING",
      need: { id: need.id, status: ai?.status || need.status, ref: `REQ-${String(need.id).slice(0, 8).toUpperCase()}` },
      understood: {
        summary: ai?.analysis?.summary || null,
        primaryProblem: ai?.analysis?.primary_problem || null,
        desiredOutcome: ai?.analysis?.desired_outcome || null,
        category: ai?.analysis?.category || null,
        confidence: ai?.analysis?.confidence_score ?? null
      },
      nextAction: ai?.analysis?.desired_outcome || ai?.analysis?.user_facing_suggestion || null,
      suggestion: ai?.analysis?.user_facing_suggestion || null,
      questions: reasoningState.selected_question ? [reasoningState.selected_question] : [],
      raw_text: need.raw_text,
      narrative_state: { ...reasoningState, updated_by: "conversation_message" },
      reasoning_state: { ...reasoningState, updated_by: "conversation_message" },
      free_deep_dives: afterEntitlements.free_weekly,
      subscription_deep_dives: afterEntitlements.subscription_depth,
      entitlements: afterEntitlements,
      credits: {
        cost_if_paid: USAGE_GATE_NEED_ANALYSIS_CREDITS,
        charged: consumesWalletCredits && wantsCredits,
        source: entitlementSource
      },
      matches: (ai?.matches || []).map((match) => ({
        solutionId: match.solution_id,
        score: match.score,
        confidenceBand: match.confidence_band,
        name: match.solution?.name || "",
        slug: match.solution?.slug || "",
        type: match.solution?.type || "",
        productId: match.solution?.product_id || null,
        reason: match.user_facing_copy || match.match_reason || ""
      })),
      noCurrentSolution: (ai?.status || "") === "UNRESOLVED"
    });
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

async function handleResolveCorrection(req, res, needId) {
  try {
    const body = await readRequestBody(req);
    const authUser = await supabaseAuthUser(req);
    const correctedText = cleanString(body.corrected_text || body.correctedText || body.answer);
    if (correctedText.length < 8) return jsonResponse(res, 422, { ok: false, error: "Correction trop courte." });
    const lookup = await supabaseSelect("needs", { select: "id,user_id,session_id,status,title", id: `eq.${cleanString(needId)}`, limit: "1" });
    const need = lookup.ok && Array.isArray(lookup.data) ? lookup.data[0] : null;
    if (!need?.id) return jsonResponse(res, 404, { ok: false, error: "Demande introuvable." });
    const sameSession = cleanString(body.session_id) && cleanString(body.session_id) === cleanString(need.session_id);
    const ownsNeed = authUser?.id && authUser.id === need.user_id;
    if (!sameSession && !ownsNeed) return jsonResponse(res, 403, { ok: false, error: "Cette correction ne peut pas etre ajoutee depuis cette session." });
    const latestAnalysis = await supabaseSelect("need_analysis", { select: "summary", need_id: `eq.${need.id}`, order: "created_at.desc", limit: "1" });
    const originalSummary = latestAnalysis.ok && Array.isArray(latestAnalysis.data) ? latestAnalysis.data[0]?.summary || "" : "";
    const inserted = await supabaseInsert("need_analysis_corrections", {
      need_id: need.id,
      user_id: authUser?.id || null,
      session_id: cleanString(body.session_id) || null,
      correction_type: "user_understanding",
      original_summary: originalSummary,
      corrected_text: correctedText,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {}
    });
    if (!inserted.ok) return jsonResponse(res, 500, { ok: false, error: inserted.message });
    await supabaseUpdate("need_analysis", {
      human_correction: correctedText,
      human_validated: false,
      needs_human_review: true,
      updated_at: new Date().toISOString()
    }, { need_id: `eq.${need.id}` }, { returnRepresentation: false });
    await supabaseUpdate("needs", {
      status: "NEEDS_HUMAN_REVIEW",
      updated_at: new Date().toISOString()
    }, { id: `eq.${need.id}` }, { returnRepresentation: false });
    await recordNeedEvent(need.id, need.user_id || authUser?.id || null, "analysis_corrected", { to_status: "NEEDS_HUMAN_REVIEW", note: "Correction utilisateur sur ce que ChronoTrade a compris.", metadata: { correctionLength: correctedText.length } });
    await recordSiteEvent({
      userId: authUser?.id || null,
      sessionId: cleanString(body.session_id) || null,
      eventType: "analysis_corrected",
      entityType: "need",
      entityId: need.id,
      metadata: { source: "resolve_result" }
    });
    return jsonResponse(res, 201, { ok: true });
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

async function handleResolveContact(req, res, needId) {
  try {
    const body = await readRequestBody(req);
    const authUser = await supabaseAuthUser(req);
    const email = cleanString(body.email || body.contact_email || authUser?.email).toLowerCase();
    if (!isEmail(email)) return jsonResponse(res, 422, { ok: false, error: "Email invalide." });
    const lookup = await supabaseSelect("needs", { select: "id,user_id,session_id,status,raw_text,title,contact_name,contact_email,email", id: `eq.${cleanString(needId)}`, limit: "1" });
    const need = lookup.ok && Array.isArray(lookup.data) ? lookup.data[0] : null;
    if (!need?.id) return jsonResponse(res, 404, { ok: false, error: "Demande introuvable." });
    const sameSession = cleanString(body.session_id) && cleanString(body.session_id) === cleanString(need.session_id);
    const ownsNeed = authUser?.id && authUser.id === need.user_id;
    if (!sameSession && !ownsNeed) return jsonResponse(res, 403, { ok: false, error: "Cette demande ne peut pas etre modifiee depuis cette session." });
    const wantsAlert = Boolean(body.alert_requested || body.notify || body.wants_alert);
    const contactPermission = body.consent_marketing ? "marketing" : wantsAlert ? "solution_updates" : "service_only";
    const updated = await supabaseUpdate("needs", {
      contact_email: email,
      email,
      wants_contact: true,
      contact_permission: contactPermission,
      consent_marketing: Boolean(body.consent_marketing),
      alert_requested: wantsAlert,
      alert_requested_at: wantsAlert ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    }, { id: `eq.${need.id}` }, { returnRepresentation: false });
    if (!updated.ok) return jsonResponse(res, 500, { ok: false, error: updated.message || "Mise a jour impossible." });
    await recordNeedEvent(need.id, need.user_id || authUser?.id || null, "email_provided", { metadata: { permission: contactPermission, alertRequested: wantsAlert } });
    if (wantsAlert) await recordNeedEvent(need.id, need.user_id || authUser?.id || null, "solution_alert_requested", { metadata: { permission: contactPermission } });
    const clientEmail = await sendResolveClientConfirmation({ ...need, contact_email: email, email }, {});
    return jsonResponse(res, 200, { ok: true, clientEmail });
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

async function handleResolveSave(req, res, needId) {
  try {
    const body = await readRequestBody(req);
    const authUser = await supabaseAuthUser(req);
    if (!authUser?.id) return jsonResponse(res, 401, { ok: false, error: "Compte requis pour sauvegarder la demande." });
    const lookup = await supabaseSelect("needs", { select: "id,user_id,session_id,status,title", id: `eq.${cleanString(needId)}`, limit: "1" });
    const need = lookup.ok && Array.isArray(lookup.data) ? lookup.data[0] : null;
    if (!need?.id) return jsonResponse(res, 404, { ok: false, error: "Demande introuvable." });
    const sameSession = cleanString(body.session_id) && cleanString(body.session_id) === cleanString(need.session_id);
    const unclaimed = !need.user_id;
    const ownsNeed = need.user_id === authUser.id;
    if (!ownsNeed && !(unclaimed && sameSession)) return jsonResponse(res, 403, { ok: false, error: "Cette demande n'appartient pas a cette session." });
    const savePayload = {
      user_id: authUser.id,
      saved_to_account_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (!need.user_id) savePayload.account_attached_at = new Date().toISOString();
    const updated = await supabaseUpdate("needs", savePayload, { id: `eq.${need.id}` }, { returnRepresentation: false });
    if (!updated.ok) return jsonResponse(res, 500, { ok: false, error: updated.message || "Sauvegarde impossible." });
    await recordNeedEvent(need.id, authUser.id, "need_saved", { metadata: { source: "resolve_after_submit" } });
    if (!need.user_id) await recordSiteEvent({
      userId: authUser.id,
      sessionId: cleanString(body.session_id) || null,
      eventType: "account_created_from_need",
      entityType: "need",
      entityId: need.id,
      metadata: { source: "resolve_after_submit" }
    });
    return jsonResponse(res, 200, { ok: true });
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

async function recordSiteEvent({ userId = null, sessionId = null, eventType, entityType = null, entityId = null, path = null, referrer = null, metadata = {} } = {}) {
  if (!eventType) return { ok: false, message: "eventType absent." };
  return supabaseInsert("site_events", {
    user_id: userId || null,
    session_id: sessionId || null,
    event_type: cleanString(eventType).slice(0, 90),
    entity_type: entityType ? cleanString(entityType).slice(0, 80) : null,
    entity_id: entityId || null,
    path: path ? cleanString(path).slice(0, 400) : null,
    referrer: referrer ? cleanString(referrer).slice(0, 600) : null,
    metadata: metadata && typeof metadata === "object" ? metadata : {}
  });
}

function analyticsCountBy(rows = [], getter = () => "") {
  const map = new Map();
  for (const row of rows) {
    const key = cleanString(getter(row)) || "A qualifier";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function analyticsByDay(rows = [], days = 30) {
  const now = Date.now();
  const start = now - (days - 1) * 86400000;
  const map = new Map();
  for (let i = 0; i < days; i += 1) {
    const day = new Date(start + i * 86400000).toISOString().slice(0, 10);
    map.set(day, 0);
  }
  for (const row of rows) {
    const day = String(row.created_at || "").slice(0, 10);
    if (map.has(day)) map.set(day, (map.get(day) || 0) + 1);
  }
  return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
}

function semanticClusterForProblem(row = {}, analysis = {}) {
  const text = normalizeForScoring([row.raw_text, row.title, analysis.category, analysis.subcategory, ...(analysis.solution_tags || [])].join(" "));
  if (["cv", "candidature", "candidatures", "entretien", "emploi", "poste", "recruteur"].some((word) => text.includes(word))) return "Recherche d'emploi / obtenir des entretiens";
  if (["client", "clients", "prospect", "vente", "conversion", "acquisition", "visibilite"].some((word) => text.includes(word))) return "Acquisition clients / conversion";
  if (["temps", "relance", "manuel", "workflow", "automatisation", "paperasse"].some((word) => text.includes(word))) return "Temps perdu / automatisation";
  if (["papier", "papiers", "administratif", "dossier", "facture", "document"].some((word) => text.includes(word))) return "Charge administrative";
  if (["site", "landing", "logo", "marque", "branding", "image"].some((word) => text.includes(word))) return "Image digitale / confiance";
  if (["couple", "relation", "dispute", "conjoint", "copine", "copain"].some((word) => text.includes(word))) return "Relationnel / communication";
  if (["apprendre", "formation", "cours", "etude", "competence"].some((word) => text.includes(word))) return "Apprentissage / progression";
  if (["choix", "choisir", "decision", "hesite", "prioriser"].some((word) => text.includes(word))) return "Choix / decision";
  return cleanString(analysis.category || row.detected_category || row.detected_objective || "Autres problemes");
}

function anonymizedProblemExample(row = {}) {
  const text = cleanString(row.raw_text || row.title || "");
  return {
    problem_id: row.id ? `REQ-${String(row.id).slice(0, 8).toUpperCase()}` : null,
    created_at: row.created_at || null,
    status: row.status || null,
    excerpt: text.length > 180 ? `${text.slice(0, 177)}...` : text,
    has_account: Boolean(row.user_id),
    session_hint: row.session_id ? String(row.session_id).slice(0, 8) : null
  };
}

async function adminSelectRows(table, params = {}) {
  const result = await supabaseSelect(table, params);
  return {
    ok: Boolean(result.ok),
    rows: result.ok && Array.isArray(result.data) ? result.data : [],
    error: result.ok ? null : result.message || result.error || `Lecture ${table} indisponible.`
  };
}

async function handleAdminResolveAnalytics(req, res) {
  try {
    const admin = await requireSupabaseSuperAdmin(req, res);
    if (!admin) return;
    const [
      needsResult,
      analysisResult,
      eventsResult,
      feedbackResult,
      matchesResult,
      runsResult,
      usageResult,
      ordersResult,
      usersResult,
      securityResult
    ] = await Promise.all([
      adminSelectRows("needs", { select: "*", order: "created_at.desc", limit: "500" }),
      adminSelectRows("need_analysis", { select: "*", order: "created_at.desc", limit: "500" }),
      adminSelectRows("need_events", { select: "*", order: "created_at.desc", limit: "500" }),
      adminSelectRows("need_feedback", { select: "*", order: "created_at.desc", limit: "300" }),
      adminSelectRows("need_solution_matches", { select: "*,solutions(name,type,slug)", order: "created_at.desc", limit: "500" }),
      adminSelectRows("ai_analysis_runs", { select: "*", order: "created_at.desc", limit: "300" }),
      adminSelectRows("usage_events", { select: "*", order: "created_at.desc", limit: "500" }),
      adminSelectRows("orders_or_projects", { select: "*", order: "created_at.desc", limit: "300" }),
      adminSelectRows("users", { select: "id,email,role,created_at", order: "created_at.desc", limit: "300" }),
      adminSelectRows("security_events", { select: "*", order: "created_at.desc", limit: "300" })
    ]);
    const needs = needsResult.rows;
    const analyses = analysisResult.rows;
    const events = eventsResult.rows;
    const feedback = feedbackResult.rows;
    const matches = matchesResult.rows;
    const runs = runsResult.rows;
    const usage = usageResult.rows;
    const orders = ordersResult.rows;
    const users = usersResult.rows;
    const security = securityResult.rows;
    const costGuard = await aiCostGuardSnapshot();
    const analysisByNeed = Object.fromEntries(analyses.map((row) => [row.need_id, row]));
    const eventCounts = analyticsCountBy(events, (row) => row.event_type);
    const categoryRows = analyticsCountBy(needs, (need) => analysisByNeed[need.id]?.category || need.detected_category || need.detected_objective);
    const subcategoryRows = analyticsCountBy(needs, (need) => analysisByNeed[need.id]?.subcategory || "general");
    const sourceRows = analyticsCountBy(needs, (need) => need.utm_source || need.source_channel || need.referrer || "direct");
    const clusterMap = new Map();
    for (const need of needs) {
      const analysis = analysisByNeed[need.id] || {};
      const cluster = semanticClusterForProblem(need, analysis);
      const item = clusterMap.get(cluster) || { name: cluster, count: 0, unresolved: 0, matched: 0, examples: [], latest_at: null };
      item.count += 1;
      if (need.status === "UNRESOLVED" || need.is_unmet) item.unresolved += 1;
      if (matches.some((match) => match.need_id === need.id)) item.matched += 1;
      if (item.examples.length < 3) item.examples.push(anonymizedProblemExample(need));
      if (!item.latest_at || String(need.created_at || "") > item.latest_at) item.latest_at = need.created_at || null;
      clusterMap.set(cluster, item);
    }
    const clusters = Array.from(clusterMap.values()).sort((a, b) => b.count - a.count).slice(0, 20);
    const resolvedCount = feedback.filter((row) => ["yes", "resolved", "success"].includes(String(row.resolution_result || row.result || "").toLowerCase())).length;
    const partialCount = feedback.filter((row) => ["partial", "mixed"].includes(String(row.resolution_result || row.result || "").toLowerCase())).length;
    const negativeCount = feedback.filter((row) => ["no", "failed", "negative"].includes(String(row.resolution_result || row.result || "").toLowerCase())).length;
    const totalEstimatedCost = usage.reduce((sum, row) => sum + Number(row.estimated_cost_usd || 0), 0);
    const totalTokens = usage.reduce((sum, row) => sum + Number(row.total_tokens || 0), 0);
    const chargedCredits = usage.reduce((sum, row) => sum + Number(row.charged_credits || 0), 0);
    const revenueCents = orders
      .filter((order) => ["paid", "completed", "active"].includes(String(order.status || "").toLowerCase()))
      .reduce((sum, order) => sum + Number(order.amount || order.amount_cents || 0), 0);
    return jsonResponse(res, 200, {
      ok: true,
      generated_at: new Date().toISOString(),
      admin: { email: admin.profile?.email || admin.user?.email || null },
      overview: {
        total_problems: needs.length,
        anonymous_problems: needs.filter((need) => !need.user_id).length,
        account_problems: needs.filter((need) => need.user_id).length,
        unresolved: needs.filter((need) => need.status === "UNRESOLVED" || need.is_unmet).length,
        matched: new Set(matches.map((match) => match.need_id).filter(Boolean)).size,
        clarifications: events.filter((event) => event.event_type === "clarification_answered").length,
        users: users.length,
        feedback: feedback.length
      },
      charts: {
        problems_by_day_30: analyticsByDay(needs, 30),
        top_categories: categoryRows.slice(0, 12),
        top_subcategories: subcategoryRows.slice(0, 12),
        acquisition_sources: sourceRows.slice(0, 12),
        events: eventCounts.slice(0, 16),
        resolution: [
          { label: "resolu", count: resolvedCount },
          { label: "partiel", count: partialCount },
          { label: "non_resolu", count: negativeCount }
        ],
        economy: [
          { label: "revenus_suivis_eur", value: Number((revenueCents / 100).toFixed(2)) },
          { label: "cout_ia_estime_usd", value: Number(totalEstimatedCost.toFixed(6)) },
          { label: "tokens", value: totalTokens },
          { label: "credits_factures", value: chargedCredits }
        ],
        security: analyticsCountBy(security, (row) => row.event_type).slice(0, 12)
      },
      controls: {
        cost_guard: costGuard,
        rate_limits: {
          session_per_hour: RESOLVE_SESSION_LIMIT_PER_HOUR,
          ip_per_hour: RESOLVE_IP_LIMIT_PER_HOUR,
          active_buckets: resolveRateBuckets.size
        },
        security_monitor: {
          events: security.length,
          storage: securityResult.ok ? { ok: true } : { ok: false, error: securityResult.error },
          recent: security.slice(0, 15).map((row) => ({
            event_type: row.event_type,
            severity: row.severity || "info",
            reason: row.reason || row.metadata?.reason || null,
            created_at: row.created_at,
            session_hash: row.session_hash || row.metadata?.session_hash || null,
            ip_hash: row.ip_hash || row.metadata?.ip_hash || null
          }))
        }
      },
      clusters,
      opportunities: clusters
        .filter((cluster) => cluster.count >= 2 || cluster.unresolved > 0)
        .slice(0, 8)
        .map((cluster) => ({
          cluster: cluster.name,
          signal: cluster.unresolved > 0 ? "solution_insuffisante" : "besoin_recurrent",
          count: cluster.count,
          idea: cluster.unresolved > 0
            ? "Etudier une solution ChronoTrade dediee ou un produit simple pour ce cluster."
            : "Surveiller le cluster avant de creer une offre."
        })),
      recent_examples: needs.slice(0, 20).map(anonymizedProblemExample),
      diagnostics: {
        needs: needsResult.ok,
        analysis: analysisResult.ok,
        events: eventsResult.ok,
        feedback: feedbackResult.ok,
        matches: matchesResult.ok,
        runs: runsResult.ok,
        usage: usageResult.ok,
        orders: ordersResult.ok,
        users: usersResult.ok,
        security: securityResult.ok,
        cost_guard: costGuard.storage?.ok !== false,
        errors: [needsResult, analysisResult, eventsResult, feedbackResult, matchesResult, runsResult, usageResult, ordersResult, usersResult, securityResult]
          .filter((item) => !item.ok)
          .map((item) => item.error)
      }
    });
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

async function handleAdminSecuritySummary(req, res) {
  try {
    const admin = await requireSupabaseSuperAdmin(req, res);
    if (!admin) return;
    const [securityResult, usageResult] = await Promise.all([
      adminSelectRows("security_events", { select: "*", order: "created_at.desc", limit: "200" }),
      adminSelectRows("usage_events", { select: "id,operation,provider,model,total_tokens,estimated_cost_usd,charged_credits,status,created_at", order: "created_at.desc", limit: "500" })
    ]);
    const costGuard = await aiCostGuardSnapshot();
    return jsonResponse(res, 200, {
      ok: true,
      generated_at: new Date().toISOString(),
      admin: { email: admin.profile?.email || admin.user?.email || null },
      cost_guard: costGuard,
      rate_limits: {
        session_per_hour: RESOLVE_SESSION_LIMIT_PER_HOUR,
        ip_per_hour: RESOLVE_IP_LIMIT_PER_HOUR,
        active_buckets: resolveRateBuckets.size
      },
      security_monitor: {
        events: securityResult.rows.length,
        by_type: analyticsCountBy(securityResult.rows, (row) => row.event_type).slice(0, 20),
        by_severity: analyticsCountBy(securityResult.rows, (row) => row.severity || "info").slice(0, 10),
        recent: securityResult.rows.slice(0, 30).map((row) => ({
          event_type: row.event_type,
          severity: row.severity || "info",
          reason: row.reason || row.metadata?.reason || null,
          created_at: row.created_at,
          session_hash: row.session_hash || row.metadata?.session_hash || null,
          ip_hash: row.ip_hash || row.metadata?.ip_hash || null
        })),
        storage: securityResult.ok ? { ok: true } : { ok: false, error: securityResult.error }
      },
      usage_monitor: {
        events: usageResult.rows.length,
        by_operation: analyticsCountBy(usageResult.rows, (row) => row.operation).slice(0, 12),
        estimated_cost_usd: Number(usageResult.rows.reduce((sum, row) => sum + Number(row.estimated_cost_usd || 0), 0).toFixed(6)),
        charged_credits: usageResult.rows.reduce((sum, row) => sum + Number(row.charged_credits || 0), 0),
        storage: usageResult.ok ? { ok: true } : { ok: false, error: usageResult.error }
      }
    });
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

async function handleSiteEvent(req, res) {
  try {
    const body = await readRequestBody(req);
    const authUser = await supabaseAuthUser(req);
    const eventAliases = {
      home_viewed: "landing_view",
      page_view: "landing_view",
      need_input_focused: "problem_started",
      need_started: "problem_started",
      need_submitted: "problem_submitted",
      free_value_feedback: "feedback_positive",
      problem_resolved: "resolved",
      no_solution_found: "unresolved"
    };
    const allowed = new Set([
      "landing_view",
      "home_viewed",
      "need_input_focused",
      "need_started",
      "problem_started",
      "problem_submitted",
      "problem_understood",
      "clarification_requested",
      "free_plan_generated",
      "free_plan_viewed",
      "feedback_positive",
      "feedback_negative",
      "need_analysis_started",
      "need_analysis_completed",
      "need_analysis_failed",
      "need_saved",
      "need_submitted",
      "analysis_corrected",
      "clarification_answered",
      "free_value_feedback",
      "signup_started",
      "signup_completed",
      "return_visit",
      "second_problem",
      "solution_viewed",
      "topup_viewed",
      "credits_used",
      "repeat_purchase",
      "resolved",
      "partially_resolved",
      "unresolved",
      "solution_proposed",
      "solution_accepted",
      "solution_rejected",
      "problem_resolved",
      "page_view",
      "product_viewed",
      "account_created",
      "free_product_claimed",
      "checkout_started",
      "purchase_completed",
      "review_submitted",
      "no_solution_found",
      "need_rejected",
      "solution_impression",
      "solution_clicked",
      "solution_selected",
      "social_follow_clicked",
      "community_post_created",
      "same_need_clicked",
      "idea_followed",
      "comment_created",
      "account_created_from_need",
      "chronolab_viewed",
      "beta_joined",
      "update_viewed"
    ]);
    const rawEventType = cleanString(body.event_type || body.eventType);
    const eventType = eventAliases[rawEventType] || rawEventType;
    if (!allowed.has(rawEventType) && !allowed.has(eventType)) return jsonResponse(res, 422, { ok: false, error: "Evenement non autorise." });
    const metadata = body.metadata && typeof body.metadata === "object" ? { ...body.metadata } : {};
    if (rawEventType !== eventType) metadata.original_event_type = rawEventType;
    const event = await recordSiteEvent({
      userId: authUser?.id || null,
      sessionId: cleanString(body.session_id) || null,
      eventType,
      entityType: cleanString(body.entity_type || body.entityType) || null,
      entityId: cleanString(body.entity_id || body.entityId) || null,
      path: cleanString(body.path) || null,
      referrer: cleanString(body.referrer) || null,
      metadata
    });
    if (!event.ok && canUseLocalJsonFallback()) {
      const localEvent = await saveLocalSiteEvent({
        user_id: authUser?.id || null,
        session_id: cleanString(body.session_id) || null,
        event_type: eventType,
        entity_type: cleanString(body.entity_type || body.entityType) || null,
        entity_id: cleanString(body.entity_id || body.entityId) || null,
        path: cleanString(body.path) || null,
        referrer: cleanString(body.referrer) || null,
        metadata
      });
      return jsonResponse(res, 201, { ok: true, event: localEvent, integrations: { supabase: { ...event, fallback: "local_json", localPath: "data/site-events.json" } } });
    }
    return jsonResponse(res, event.ok ? 201 : 500, { ok: Boolean(event.ok), error: event.ok ? null : event.message });
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

async function grantFreeProductAccess(product, authUser) {
  const privateFile = await activeProductFile(product.id);
  const accessUrl = productAccessUrl(product);
  const entitlement = await supabaseUpsert("entitlements", {
    user_id: authUser.id,
    product_id: product.id,
    order_id: null,
    resource_type: product.slug || product.product_type || "product",
    status: "active",
    access_url: accessUrl,
    version: product.current_version || privateFile?.version || "1.0",
    metadata: {
      label: product.title,
      source: "free_product_claim",
      productId: product.id,
      productSlug: product.slug,
      deliveryType: product.delivery_type || null,
      privateFile: privateFile ? {
        bucket: privateFile.storage_bucket,
        path: privateFile.storage_path,
        fileName: privateFile.file_name,
        version: privateFile.version
      } : null
    },
    updated_at: new Date().toISOString()
  }, "user_id,resource_type,access_url");
  await recordSiteEvent({
    userId: authUser.id,
    sessionId: null,
    eventType: "free_product_claimed",
    entityType: "product",
    entityId: product.id,
    path: `/produit/?slug=${product.slug}`,
    metadata: { productSlug: product.slug, productTitle: product.title, entitlementOk: Boolean(entitlement.ok) }
  });
  return { entitlement, privateFile, accessUrl };
}

async function handleAdminAnalyzeNeed(req, res, needId) {
  const admin = await requireSupabaseAdmin(req, res);
  if (!admin) return;
  const result = await supabaseSelect("needs", { select: "*", id: `eq.${cleanString(needId)}`, limit: "1" });
  const need = result.ok && Array.isArray(result.data) ? result.data[0] : null;
  if (!need?.id) return jsonResponse(res, 404, { ok: false, error: "Besoin introuvable." });
  const ai = await analyzeNeedAfterSubmission(need, detectResolveRiskServer(need.raw_text));
  await recordNeedEvent(need.id, need.user_id, "human_correction", {
    note: `Analyse relancee par ${admin.profile?.email || admin.user?.email || "admin"}.`,
    metadata: { action: "admin_reanalyze_need", adminId: admin.user?.id || null }
  });
  return jsonResponse(res, 200, {
    ok: true,
    need: { id: need.id, status: ai.status || need.status },
    analysis: ai.analysis || null,
    matches: (ai.matches || []).map((match) => ({ solutionId: match.solution_id, score: match.score, confidenceBand: match.confidence_band }))
  });
}

async function handlePrivacyRequest(req, res) {
  try {
    const body = await readRequestBody(req);
    const authUser = await supabaseAuthUser(req);
    const requestType = cleanString(body.request_type || body.requestType || "other");
    const allowed = new Set(["access","export","rectification","delete_need","delete_account","marketing_opt_out","other"]);
    if (!allowed.has(requestType)) return jsonResponse(res, 422, { ok: false, error: "Type de demande invalide." });
    const email = cleanString(body.email || authUser?.email).toLowerCase();
    if (!email && !authUser?.id) return jsonResponse(res, 422, { ok: false, error: "Email requis pour traiter la demande." });
    const payload = {
      user_id: authUser?.id || null,
      email: email || null,
      request_type: requestType,
      target_type: cleanString(body.target_type || body.targetType) || null,
      target_id: cleanString(body.target_id || body.targetId) || null,
      message: cleanString(body.message) || null,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {}
    };
    const inserted = await supabaseInsert("privacy_requests", payload);
    const emailPayload = {
      to: process.env.INTERNAL_NOTIFICATION_EMAIL || companyProfile.email,
      subject: `Demande confidentialite ChronoTrade - ${requestType}`,
      text: [`Type: ${requestType}`, `Email: ${email || "compte connecte"}`, `Cible: ${payload.target_type || "-"} ${payload.target_id || ""}`, "", payload.message || ""].join("\n")
    };
    const notification = process.env.INTERNAL_NOTIFICATION_EMAIL ? await sendViaGraph(emailPayload) : { enabled: false, message: "Email interne absent." };
    await addOutbox([{ id: randomUUID(), type: "privacy_request", status: notification.ok ? "sent" : "prepared", sendResult: notification, createdAt: new Date().toISOString(), ...emailPayload }]);
    return jsonResponse(res, inserted.ok ? 201 : 500, { ok: Boolean(inserted.ok), request: inserted.data, notification, error: inserted.ok ? null : inserted.message });
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

async function handleListLeads(res) {
  const prospects = await readJson(prospectsPath, []);
  jsonResponse(res, 200, { ok: true, prospects });
}

async function handleQuote(res, id) {
  const prospects = await readJson(prospectsPath, []);
  const lead = prospects.find((item) => item.id === id);
  if (!lead || !lead.quoteHtmlPath) {
    res.writeHead(404);
    return res.end("Devis introuvable");
  }
  try {
    const content = await readFile(lead.quoteHtmlPath);
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `inline; filename="${lead.quote.number}.html"`,
      ...corsHeaders()
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Devis introuvable");
  }
}

async function handleDueFollowups(res) {
  const followups = await readJson(followupsPath, []);
  const now = new Date();
  jsonResponse(res, 200, {
    ok: true,
    followups: followups.filter((item) => item.status === "scheduled" && new Date(item.scheduledFor) <= now)
  });
}

async function handleRunFollowups(res) {
  const results = await sendDueFollowups();
  jsonResponse(res, 200, { ok: true, results });
}

async function dynamicCheckoutBody(fields = {}, options = {}) {
  if (!STRIPE_SECRET_KEY || !STRIPE_PUBLISHABLE_KEY) {
    return {
      errorStatus: 503,
      error: "Stripe n'est pas encore configure. Ajoute STRIPE_SECRET_KEY et STRIPE_PUBLISHABLE_KEY dans Render."
    };
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return {
      errorStatus: 503,
      error: "Supabase n'est pas encore relie a Render. Ajoute SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY."
    };
  }

  const authUser = options.user;
  if (!authUser?.id) {
    return { errorStatus: 401, error: "Compte ChronoTrade requis avant paiement." };
  }
  const product = await supabaseProductBySlugOrId({
    slug: cleanString(fields.slug || options.slug),
    productId: cleanString(fields.product_id || fields.productId || options.productId)
  });
  if (!product) return { errorStatus: 404, error: "Produit introuvable." };
  if (product.status !== "published") return { errorStatus: 409, error: "Ce produit n'est pas disponible a l'achat." };
  const lifecycleStatus = String(product.lifecycle_status || product.availability || "").toLowerCase();
  const blockedStates = ["archived", "unavailable", "coming_soon", "waitlist", "private_beta", "public_beta", "chronolab", "draft"];
  if (blockedStates.includes(lifecycleStatus) || ["archived", "unavailable"].includes(String(product.availability || "").toLowerCase())) {
    return { errorStatus: 409, error: "Ce produit est actuellement indisponible." };
  }
  const plan = await supabaseProductPlan({
    planId: cleanString(fields.plan_id || fields.planId || options.planId),
    productId: product.id,
    slug: cleanString(fields.plan_slug || fields.planSlug || options.planSlug)
  });
  const commerceItem = plan || product;
  if (!isPaidProduct(commerceItem)) {
    return {
      free: true,
      product,
      accessUrl: productAccessUrl(product)
    };
  }

  const sync = plan ? await syncPlanWithStripe(product, plan, "checkout") : await syncProductWithStripe(product, "checkout");
  const syncedProduct = sync.product;
  const syncedPlan = sync.plan || null;
  const checkoutPriceId = syncedPlan?.stripe_price_id || syncedProduct.stripe_price_id;
  const billingModel = productBillingModel(syncedPlan || syncedProduct);
  const pricingModel = syncedPlan?.pricing_model || syncedProduct.pricing_model || legacyPricingModelFromBilling(billingModel);
  const stripeCustomerId = await ensureStripeCustomerForUser(authUser);
  const requestedPromotionCode = fields.promotion_code || fields.promo || "";
  let promotion = requestedPromotionCode
    ? await validPromotionForProduct(requestedPromotionCode, syncedProduct, authUser.email || fields.email, authUser)
    : await bestPromotionForProduct(syncedProduct, authUser.email || fields.email, authUser);
  if (requestedPromotionCode && !promotion) {
    return { errorStatus: 409, error: "Code promo invalide, expire ou non applicable a ce produit." };
  }
  if (promotion) promotion = await syncPromotionWithStripe(promotion, syncedProduct);
  const returnPath = options.returnPath || (syncedProduct.slug === "analyse-express" ? "/analyse-express/" : "/dashboard/bibliotheque/");
  const returnUrl = new URL(returnPath, SITE_ORIGIN);
  returnUrl.searchParams.set("paiement", "success");
  returnUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");

  const body = new URLSearchParams({
    mode: billingModel === "SUBSCRIPTION" || pricingModel === "subscription" ? "subscription" : "payment",
    customer: stripeCustomerId,
    "line_items[0][price]": checkoutPriceId,
    "line_items[0][quantity]": "1",
    "metadata[product]": syncedProduct.slug,
    "metadata[product_id]": syncedProduct.id,
    "metadata[product_slug]": syncedProduct.slug,
    "metadata[plan_id]": syncedPlan?.id || "",
    "metadata[plan_slug]": syncedPlan?.slug || "",
    "metadata[user_id]": authUser.id,
    "metadata[delivery_type]": syncedProduct.delivery_type || "",
    "metadata[billing_model]": billingModel,
    "metadata[credit_cost]": String(syncedPlan?.credit_cost || syncedProduct.credit_cost || 0),
    "metadata[source]": "chronotrade_dynamic_checkout"
  });
  if (billingModel !== "SUBSCRIPTION" && pricingModel !== "subscription") body.set("submit_type", syncedProduct.delivery_type === "questionnaire" ? "book" : "pay");
  if (fields.checkout_mode === "redirect" || options.hosted) {
    body.set("success_url", returnUrl.toString());
    body.set("cancel_url", `${SITE_ORIGIN}/produit/?slug=${encodeURIComponent(syncedProduct.slug)}&paiement=cancel`);
  } else {
    body.set("ui_mode", "embedded");
    body.set("return_url", returnUrl.toString());
  }
  if ((billingModel === "SUBSCRIPTION" || pricingModel === "subscription") && Number(syncedPlan?.trial_days || syncedProduct.commerce_config?.trial_days || 0) > 0) {
    body.set("subscription_data[trial_period_days]", String(Number(syncedPlan?.trial_days || syncedProduct.commerce_config?.trial_days || 0)));
  }
  if (billingModel === "SUBSCRIPTION" || pricingModel === "subscription") {
    body.set("subscription_data[metadata][product_id]", syncedProduct.id);
    body.set("subscription_data[metadata][product_slug]", syncedProduct.slug);
    body.set("subscription_data[metadata][plan_id]", syncedPlan?.id || "");
    body.set("subscription_data[metadata][user_id]", authUser.id);
  }
  if (promotion?.stripe_promotion_code_id) {
    body.set("discounts[0][promotion_code]", promotion.stripe_promotion_code_id);
  }
  if (promotion?.id) {
    body.set("metadata[promotion_id]", promotion.id);
    body.set("metadata[promotion_code]", promotion.code || "");
    body.set("metadata[discount_cents]", String(promotion.discount_cents || 0));
  }

  const { stripeResponse, session } = await createStripeCheckoutSession(body);
  if (!stripeResponse.ok || (!session.client_secret && !session.url)) {
    return { errorStatus: 502, error: session.error?.message || "Impossible de creer le paiement Stripe integre." };
  }
  return { product: syncedProduct, plan: syncedPlan, promotion, session };
}

async function handleDynamicCheckoutSession(req, res, url) {
  try {
    const authUser = await requireSupabaseUser(req, res);
    if (!authUser) return;
    const fields = req.method === "GET" ? Object.fromEntries(url.searchParams.entries()) : await readRequestBody(req);
    const result = await dynamicCheckoutBody(fields, { user: authUser, hosted: fields.checkout_mode === "redirect" });
    if (result.error) return jsonResponse(res, result.errorStatus || 500, { ok: false, error: result.error });
    if (result.free) {
      const grant = await grantFreeProductAccess(result.product, authUser);
      if (!grant.entitlement.ok) {
        return jsonResponse(res, 500, { ok: false, error: grant.entitlement.message || "Acces gratuit impossible a enregistrer." });
      }
      return jsonResponse(res, 200, {
        ok: true,
        free: true,
        product: { id: result.product.id, slug: result.product.slug, title: result.product.title },
        accessUrl: grant.accessUrl,
        hasPrivateFile: Boolean(grant.privateFile)
      });
    }
    return jsonResponse(res, 200, {
      ok: true,
      id: result.session.id,
      clientSecret: result.session.client_secret,
      url: result.session.url || null,
      product: {
        id: result.product.id,
        slug: result.product.slug,
        title: result.product.title,
        price_cents: result.product.price_cents,
        currency: result.product.currency
      },
      plan: result.plan ? { id: result.plan.id, slug: result.plan.slug, name: result.plan.name } : null,
      promotion: result.promotion ? { code: result.promotion.code, discount_cents: result.promotion.discount_cents } : null
    });
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

async function handleDynamicCheckoutRedirect(res, url) {
  if (!STRIPE_SECRET_KEY) {
    return jsonResponse(res, 503, { ok: false, error: "Stripe n'est pas encore configure. Ajoute STRIPE_SECRET_KEY dans Render." });
  }
  try {
    return jsonResponse(res, 401, {
      ok: false,
      error: "Compte ChronoTrade requis. Lance le paiement depuis le site pour conserver la session."
    });
  } catch (error) {
    jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

async function handleAnalyseExpressCheckout(res) {
  return jsonResponse(res, 401, {
    ok: false,
    error: "Compte ChronoTrade requis. Lance l'achat depuis la page Analyse Express pour conserver la session."
  });
}

function applyAnalyseExpressLineItem(body) {
  if (STRIPE_ANALYSE_EXPRESS_PRICE_ID) {
    body.set("line_items[0][price]", STRIPE_ANALYSE_EXPRESS_PRICE_ID);
    body.set("line_items[0][quantity]", "1");
    return;
  }
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", "eur");
  body.set("line_items[0][price_data][unit_amount]", "2900");
  body.set("line_items[0][price_data][product_data][name]", "Analyse Express ChronoTrade");
  body.set("line_items[0][price_data][product_data][description]", "Audit express de votre projet, idee ou presence digitale avec plan d'action clair.");
}

async function createStripeCheckoutSession(body) {
  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });
  const session = await stripeResponse.json();
  return { stripeResponse, session };
}

function verifyStripeWebhookSignature(rawBody, signatureHeader) {
  if (!STRIPE_WEBHOOK_SECRET) {
    return { ok: false, message: "STRIPE_WEBHOOK_SECRET absent." };
  }
  const parts = Object.fromEntries(String(signatureHeader || "").split(",").map((part) => {
    const [key, value] = part.split("=");
    return [key, value];
  }));
  if (!parts.t || !parts.v1) return { ok: false, message: "Signature Stripe absente ou invalide." };
  const signedPayload = `${parts.t}.${rawBody.toString("utf8")}`;
  const expected = createHmac("sha256", STRIPE_WEBHOOK_SECRET).update(signedPayload).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(parts.v1, "hex");
  if (expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) {
    return { ok: false, message: "Signature Stripe refusee." };
  }
  return { ok: true };
}

function analyseExpressQuestionnaireUrl(sessionId = "") {
  const url = new URL("/analyse-express/", SITE_ORIGIN);
  url.searchParams.set("paiement", "success");
  if (sessionId) url.searchParams.set("session_id", sessionId);
  return url.toString();
}

async function fetchStripeSessionDetails(session) {
  if (!STRIPE_SECRET_KEY || !session?.id) return session || {};
  const params = new URLSearchParams();
  params.append("expand[]", "payment_intent.latest_charge");
  params.append("expand[]", "invoice");
  params.append("expand[]", "line_items.data.price.product");
  try {
    let response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(session.id)}?${params.toString()}`, {
      headers: { authorization: `Bearer ${STRIPE_SECRET_KEY}` }
    });
    if (!response.ok) {
      params.delete("expand[]");
      params.append("expand[]", "payment_intent.latest_charge");
      params.append("expand[]", "invoice");
      response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(session.id)}?${params.toString()}`, {
        headers: { authorization: `Bearer ${STRIPE_SECRET_KEY}` }
      });
    }
    if (!response.ok) return session;
    const detailedSession = await response.json();
    return { ...session, ...detailedSession };
  } catch {
    return session;
  }
}

async function fetchStripeSubscription(subscriptionId) {
  if (!STRIPE_SECRET_KEY || !subscriptionId) return null;
  const params = new URLSearchParams();
  params.append("expand[]", "latest_invoice.payment_intent");
  params.append("expand[]", "items.data.price.product");
  try {
    return await stripeRequest(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}?${params.toString()}`);
  } catch {
    return null;
  }
}

async function syncSubscriptionFromStripe(subscription, sourceEvent = "") {
  if (!subscription?.id) return { skipped: true, reason: "missing_subscription" };
  const item = subscription.items?.data?.[0] || {};
  const price = item.price || {};
  const metadata = subscription.metadata || {};
  const userId = metadata.user_id || null;
  const product = await supabaseProductBySlugOrId({
    productId: metadata.product_id,
    slug: metadata.product_slug,
    stripePriceId: price.id
  });
  const plan = await supabaseProductPlan({ planId: metadata.plan_id, productId: product?.id }) || await supabaseProductPlan({ productId: product?.id, slug: metadata.plan_slug });
  const payload = {
    user_id: userId,
    product_id: product?.id || null,
    plan_id: plan?.id || null,
    stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id || null,
    stripe_subscription_id: subscription.id,
    stripe_price_id: price.id || null,
    status: subscription.status || "unknown",
    current_period_start: unixToIso(subscription.current_period_start),
    current_period_end: unixToIso(subscription.current_period_end),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    canceled_at: unixToIso(subscription.canceled_at),
    trial_start: unixToIso(subscription.trial_start),
    trial_end: unixToIso(subscription.trial_end),
    metadata: {
      sourceEvent,
      productSlug: product?.slug || metadata.product_slug || null,
      planSlug: plan?.slug || metadata.plan_slug || null,
      planCode: metadata.plan_code || metadata.planCode || plan?.slug || null,
      planName: metadata.plan_name || metadata.planName || plan?.name || null,
      monthlyCredits: Number(metadata.monthly_credits || plan?.metadata?.monthly_credits || 0),
      deepDives: Number(metadata.deep_dives || plan?.metadata?.deep_dives || 0),
      priceId: price.id || null
    },
    updated_at: new Date().toISOString()
  };
  const subscriptionSync = await supabaseUpsert("subscriptions", payload, "stripe_subscription_id");
  if (userId && product?.id) {
    const status = subscriptionAccessStatus(subscription.status);
    const accessUrl = productAccessUrl(product, "");
    await supabaseUpsert("entitlements", {
      user_id: userId,
      product_id: product.id,
      resource_type: product.slug,
      status,
      access_url: accessUrl,
      version: product.current_version || "1.0",
      expires_at: status === "active" ? unixToIso(subscription.current_period_end) : new Date().toISOString(),
      metadata: {
        label: product.title,
        subscriptionId: subscription.id,
        planId: plan?.id || null,
        planSlug: plan?.slug || null,
        accessMode: "subscription"
      },
      updated_at: new Date().toISOString()
    }, "user_id,resource_type,access_url");
  }
  return subscriptionSync;
}

async function handleStripeSubscriptionEvent(event) {
  const subscription = event.data.object || {};
  return syncSubscriptionFromStripe(subscription, event.type);
}

async function handleStripeInvoiceEvent(event) {
  const invoice = event.data.object || {};
  const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
  const subscription = await fetchStripeSubscription(subscriptionId);
  if (!subscription) return { skipped: true, reason: "subscription_not_found" };
  return syncSubscriptionFromStripe(subscription, event.type);
}

async function orderFromStripeSession(session) {
  const now = new Date().toISOString();
  const firstLine = session.line_items?.data?.[0] || {};
  const stripePriceId = typeof firstLine.price === "string" ? firstLine.price : firstLine.price?.id || "";
  const dbProduct = await supabaseProductBySlugOrId({
    productId: session.metadata?.product_id,
    slug: session.metadata?.product_slug || session.metadata?.product,
    stripePriceId
  });
  const product = dbProduct?.slug || session.metadata?.product_slug || session.metadata?.product || "unknown";
  const paymentIntent = session.payment_intent || {};
  const latestCharge = paymentIntent.latest_charge || paymentIntent.charges?.data?.[0] || {};
  const status = session.payment_status === "paid" ? "paid" : session.payment_status || "pending";
  const accessUrl = productAccessUrl(dbProduct || { slug: product, delivery_type: session.metadata?.delivery_type }, session.id);
  const billingModel = normalizeBillingModel(session.metadata?.billing_model || dbProduct?.billing_model, dbProduct?.pricing_model);
  const billingSnapshot = {
    billing_model: billingModel,
    pricing_model: dbProduct?.pricing_model || session.metadata?.pricing_model || legacyPricingModelFromBilling(billingModel),
    price_cents: dbProduct?.price_cents ?? Number(session.amount_total || 0),
    credit_cost: Number(dbProduct?.credit_cost || session.metadata?.credit_cost || 0),
    compatible_subscription_codes: Array.isArray(dbProduct?.compatible_subscription_codes) ? dbProduct.compatible_subscription_codes : [],
    access_rights: dbProduct?.access_rights || {},
    delivery_type: dbProduct?.delivery_type || session.metadata?.delivery_type || "",
    product_version: dbProduct?.current_version || "1.0",
    stripe_price_id: stripePriceId,
    captured_at: now
  };
  return {
    id: session.id || randomUUID(),
    stripeSessionId: session.id || "",
    stripePaymentIntent: typeof paymentIntent === "string" ? paymentIntent : paymentIntent.id || "",
    product,
    productId: dbProduct?.id || session.metadata?.product_id || null,
    productSlug: dbProduct?.slug || product,
    productType: dbProduct?.product_type || "",
    productVersion: dbProduct?.current_version || "1.0",
    billingModel,
    billingSnapshot,
    userId: session.metadata?.user_id || "",
    productLabel: dbProduct?.title || (product === "analyse_express" || product === "analyse-express" ? "Analyse Express ChronoTrade" : product),
    deliveryType: dbProduct?.delivery_type || session.metadata?.delivery_type || "",
    status,
    amount: Number(session.amount_total || 0) / 100,
    amountCents: Number(session.amount_total || 0),
    discountCents: Number(session.metadata?.discount_cents || 0),
    currency: String(session.currency || "eur").toUpperCase(),
    stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id || "",
    customerEmail: session.customer_details?.email || session.customer_email || "",
    customerName: session.customer_details?.name || "",
    invoiceUrl: session.invoice?.hosted_invoice_url || "",
    receiptUrl: latestCharge.receipt_url || "",
    questionnaireUrl: (dbProduct?.delivery_type === "questionnaire" || product === "analyse_express" || product === "analyse-express") ? analyseExpressQuestionnaireUrl(session.id) : "",
    accessUrl,
    stripePriceId,
    promotionId: session.metadata?.promotion_id || null,
    promotionCode: session.metadata?.promotion_code || "",
    raw: {
      mode: session.mode || "",
      billingModel,
      source: session.metadata?.source || "",
      invoice: typeof session.invoice === "string" ? session.invoice : session.invoice?.id || "",
      created: session.created || null,
      lineItemDescription: firstLine.description || ""
    },
    createdAt: now,
    updatedAt: now
  };
}

async function upsertLocalOrder(order) {
  const orders = await readJson(ordersPath, []);
  const index = orders.findIndex((item) => item.stripeSessionId === order.stripeSessionId || item.id === order.id);
  if (index >= 0) {
    orders[index] = { ...orders[index], ...order, createdAt: orders[index].createdAt || order.createdAt, updatedAt: new Date().toISOString() };
    await writeJson(ordersPath, orders);
    return orders[index];
  }
  orders.unshift(order);
  await writeJson(ordersPath, orders);
  return order;
}

async function syncSupabaseOrder(order) {
  const userId = order.userId || await supabaseUserIdByEmail(order.customerEmail);
  const orderSync = await supabaseUpsert("orders_or_projects", {
    user_id: userId,
    product_id: order.productId || null,
    product_slug: order.productSlug || order.product || null,
    product_version: order.productVersion || "1.0",
    service_type: order.productLabel,
    title: order.productLabel,
    status: order.status,
    amount: order.amount,
    amount_cents: order.amountCents || Math.round(Number(order.amount || 0) * 100),
    discount_cents: order.discountCents || 0,
    currency: order.currency || "EUR",
    action_url: order.questionnaireUrl || order.accessUrl || null,
    stripe_customer_id: order.stripeCustomerId || null,
    stripe_session_id: order.stripeSessionId || null,
    stripe_payment_intent: typeof order.stripePaymentIntent === "string" ? order.stripePaymentIntent : order.stripePaymentIntent?.id || null,
    stripe_price_id: order.stripePriceId || null,
    promotion_id: order.promotionId || null,
    billing_model: order.billingModel || order.billingSnapshot?.billing_model || null,
    billing_snapshot: order.billingSnapshot || null,
    paid_at: order.status === "paid" ? new Date().toISOString() : null,
    invoice_url: order.invoiceUrl || null,
    receipt_url: order.receiptUrl || null,
    metadata: {
      customerEmail: order.customerEmail || null,
      customerName: order.customerName || null,
      productKey: order.product || null,
      productId: order.productId || null,
      productSlug: order.productSlug || null,
      deliveryType: order.deliveryType || null,
      productVersion: order.productVersion || null,
      billingModel: order.billingModel || order.billingSnapshot?.billing_model || null,
      billingSnapshot: order.billingSnapshot || null,
      userId: userId || null,
      paymentStatus: order.status || null,
      stripeSessionId: order.stripeSessionId || null,
      stripePaymentIntent: typeof order.stripePaymentIntent === "string" ? order.stripePaymentIntent : order.stripePaymentIntent?.id || null,
      stripePriceId: order.stripePriceId || null,
      promotionCode: order.promotionCode || null,
      discountCents: order.discountCents || 0,
      invoiceUrl: order.invoiceUrl || null,
      receiptUrl: order.receiptUrl || null
    },
    created_at: order.createdAt,
    updated_at: order.updatedAt
  }, "stripe_session_id");
  const syncedOrderId = Array.isArray(orderSync.data) ? orderSync.data[0]?.id : orderSync.data?.id;
  if (order.promotionId && order.stripeSessionId && order.status === "paid") {
    await supabaseUpsert("promotion_redemptions", {
      promotion_id: order.promotionId,
      product_id: order.productId || null,
      order_id: syncedOrderId || null,
      user_id: userId,
      customer_email: order.customerEmail || null,
      stripe_session_id: order.stripeSessionId,
      discount_cents: order.discountCents || 0
    }, "promotion_id,stripe_session_id");
  }
  if (userId && order.status === "paid") {
    const privateFile = await activeProductFile(order.productId);
    const entitlementKey = order.accessUrl || order.questionnaireUrl || order.stripeSessionId || order.product;
    const entitlementSync = await supabaseUpsert("entitlements", {
      user_id: userId,
      product_id: order.productId || null,
      order_id: syncedOrderId || null,
      resource_type: order.productSlug || order.product || "product",
      status: "active",
      access_url: order.accessUrl || order.questionnaireUrl || null,
      version: order.productVersion || privateFile?.version || "1.0",
      metadata: {
        label: order.productLabel,
        stripeSessionId: order.stripeSessionId || null,
        stripePaymentIntent: typeof order.stripePaymentIntent === "string" ? order.stripePaymentIntent : order.stripePaymentIntent?.id || null,
        productId: order.productId || null,
        productSlug: order.productSlug || null,
        deliveryType: order.deliveryType || null,
        privateFile: privateFile ? {
          bucket: privateFile.storage_bucket,
          path: privateFile.storage_path,
          fileName: privateFile.file_name,
          version: privateFile.version
        } : null,
        entitlementKey
      },
      created_at: order.createdAt,
      updated_at: order.updatedAt
    }, "user_id,resource_type,access_url");
    await scheduleProductFollowupEmail(order, userId, syncedOrderId);
    const firstPurchaseReward = await awardUserBadgeByCode(userId, "first_purchase", {
      sourceType: "stripe_order",
      sourceId: order.stripeSessionId || syncedOrderId || null,
      productId: order.productId || null,
      productSlug: order.productSlug || null,
      orderId: syncedOrderId || null
    });
    const firstPurchaseCosmetic = await unlockUserCosmetic(userId, "first-purchase-chronotrade-banner", {
      cosmeticType: "banner",
      label: "Banniere Premier achat ChronoTrade",
      sourceType: "stripe_order",
      sourceId: order.stripeSessionId || syncedOrderId || null,
      productId: order.productId || null,
      productSlug: order.productSlug || null,
      orderId: syncedOrderId || null,
      accent: "gold"
    });
    const packEntitlements = await awardPackComponentEntitlements(order, userId, syncedOrderId);
    return { order: orderSync, entitlement: entitlementSync, packEntitlements, firstPurchaseReward, firstPurchaseCosmetic };
  }
  return { order: orderSync, entitlement: { skipped: true, reason: userId ? "payment_not_paid" : "user_not_found" } };
}

async function scheduleProductFollowupEmail(order, userId, syncedOrderId) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !order.customerEmail || !order.productId) return { skipped: true };
  const product = await supabaseProductBySlugOrId({ productId: order.productId });
  const emailConfig = product?.email_config || {};
  const followupEnabled = emailConfig.followup_enabled !== false;
  if (!followupEnabled) return { skipped: true };
  const delayDays = Number(emailConfig.followup_delay_days ?? 4);
  const scheduledAt = new Date(Date.now() + Math.max(0, delayDays) * 24 * 60 * 60 * 1000).toISOString();
  return supabaseUpsert("scheduled_emails", {
    type: "product_review_request",
    user_id: userId,
    order_id: syncedOrderId || null,
    product_id: order.productId,
    recipient_email: order.customerEmail,
    subject: emailConfig.followup_subject || `Alors, qu'avez-vous pense de ${order.productLabel} ?`,
    payload: {
      productLabel: order.productLabel,
      productSlug: order.productSlug,
      googleReviewUrl: GOOGLE_BUSINESS_REVIEW_URL || null,
      reviewUrl: `${SITE_ORIGIN}/avis/?product=${encodeURIComponent(order.productSlug || order.product || "")}`
    },
    scheduled_at: scheduledAt,
    status: "scheduled",
    updated_at: new Date().toISOString()
  }, "order_id,type");
}

async function recordStripeEventStart(event) {
  if (!event?.id || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { enabled: false, duplicate: false };
  const existing = await supabaseSelect("stripe_events", {
    select: "id,status",
    stripe_event_id: `eq.${event.id}`,
    limit: "1"
  });
  if (existing.ok && Array.isArray(existing.data) && existing.data.length) {
    return { enabled: true, duplicate: true, event: existing.data[0] };
  }
  const object = event.data?.object || {};
  const inserted = await supabaseInsert("stripe_events", {
    stripe_event_id: event.id,
    event_type: event.type,
    livemode: Boolean(event.livemode),
    status: "processing",
    object_id: object.id || null,
    payload: event
  });
  if (!inserted.ok && String(inserted.message || "").includes("duplicate")) {
    return { enabled: true, duplicate: true, event: inserted.data };
  }
  return { enabled: true, duplicate: false, event: inserted.data, ok: inserted.ok, message: inserted.message };
}

async function recordStripeEventFinish(event, status = "processed", errorMessage = "") {
  if (!event?.id || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { enabled: false };
  return supabaseUpdate("stripe_events", {
    status,
    processed_at: status === "processed" || status === "ignored" ? new Date().toISOString() : null,
    error_message: errorMessage || null,
    updated_at: new Date().toISOString()
  }, { stripe_event_id: `eq.${event.id}` }, { returnRepresentation: false });
}

function buildOrderClientEmail(order) {
  const isAnalyse = order.productSlug === "analyse-express" || order.product === "analyse_express";
  const isSubscription = order.raw?.mode === "subscription";
  const isApp = ["app", "agent_ai", "automation"].includes(String(order.productType || order.deliveryType || "").toLowerCase());
  const accessLabel = isAnalyse ? "Questionnaire" : isApp ? "Ouvrir" : "Acces";
  const accessUrl = order.questionnaireUrl || order.accessUrl || `${SITE_ORIGIN}/dashboard/bibliotheque/`;
  const nextLine = isAnalyse
    ? "Prochaine etape : completez le questionnaire court pour que je puisse analyser votre projet correctement."
    : isSubscription
      ? "Votre formule est rattachee a votre compte. La gestion bancaire reste securisee dans Stripe."
      : isApp
        ? "Votre application ou automatisation est activee dans votre espace ChronoTrade."
        : "Votre achat est maintenant rattache a votre espace ChronoTrade.";
  return {
    to: order.customerEmail,
    subject: isAnalyse ? "Votre Analyse Express ChronoTrade est confirmee" : isSubscription ? `Votre abonnement ${order.productLabel} est actif` : `Votre ${order.productLabel} est disponible`,
    text: [
      `Bonjour ${order.customerName || ""}`.trim() + ",",
      "",
      `Votre paiement pour ${order.productLabel} a bien ete confirme.`,
      "",
      nextLine,
      accessUrl ? `${accessLabel} : ${accessUrl}` : "",
      !isAnalyse ? "Vous pourrez egalement le retrouver dans : Mon compte -> Bibliotheque." : "",
      "",
      "A tres vite,",
      `${companyProfile.owner} - ${companyProfile.name}`
    ].filter(Boolean).join("\n")
  };
}

function buildOrderInternalEmail(order) {
  return {
    to: process.env.INTERNAL_NOTIFICATION_EMAIL || companyProfile.email,
    subject: `Nouvelle commande ChronoTrade - ${order.productLabel}`,
    text: [
      `Produit : ${order.productLabel}`,
      `Statut : ${order.status}`,
      `Montant : ${order.amount} ${order.currency}`,
      `Client : ${order.customerName || "Non renseigne"}`,
      `Email : ${order.customerEmail || "Non renseigne"}`,
      order.questionnaireUrl ? `Questionnaire : ${order.questionnaireUrl}` : ""
    ].filter(Boolean).join("\n")
  };
}

async function handleStripeRefundEvent(event) {
  const object = event.data?.object || {};
  const paymentIntentId = typeof object.payment_intent === "string" ? object.payment_intent : object.payment_intent?.id || "";
  const chargeId = object.object === "charge" ? object.id : (typeof object.charge === "string" ? object.charge : object.charge?.id || "");
  if (!paymentIntentId) return { skipped: true, reason: "missing_payment_intent", chargeId };
  const filters = {
    select: "id,user_id,product_id,stripe_payment_intent,status,metadata",
    limit: "1"
  };
  if (paymentIntentId) filters.stripe_payment_intent = `eq.${paymentIntentId}`;
  const orderResult = await supabaseSelect("orders_or_projects", filters);
  const order = orderResult.ok && Array.isArray(orderResult.data) ? orderResult.data[0] : null;
  if (!order?.id) return { skipped: true, reason: "order_not_found" };
  const now = new Date().toISOString();
  const orderUpdate = await supabaseUpdate("orders_or_projects", {
    status: "refunded",
    delivery_status: "canceled",
    refunded_at: now,
    metadata: {
      ...(order.metadata || {}),
      refund: {
        stripeEventId: event.id,
        chargeId,
        paymentIntentId,
        amountRefunded: object.amount_refunded || object.amount || null,
        currency: object.currency || null,
        receivedAt: now
      }
    },
    updated_at: now
  }, { id: `eq.${order.id}` });
  const entitlementUpdate = await supabaseUpdate("entitlements", {
    status: "revoked",
    revoked_at: now,
    updated_at: now
  }, { order_id: `eq.${order.id}` }, { returnRepresentation: false });
  return { order: orderUpdate, entitlements: entitlementUpdate };
}

async function notifyOrder(order) {
  const results = { client: { enabled: false }, internal: { enabled: false } };
  if (order.customerEmail) results.client = await sendViaGraph(buildOrderClientEmail(order));
  if (process.env.INTERNAL_NOTIFICATION_EMAIL) results.internal = await sendViaGraph(buildOrderInternalEmail(order));
  await addOutbox([
    {
      id: randomUUID(),
      orderId: order.id,
      type: "order_client_confirmation",
      status: results.client.ok ? "sent" : "prepared",
      sendResult: results.client,
      createdAt: new Date().toISOString(),
      ...buildOrderClientEmail(order)
    },
    {
      id: randomUUID(),
      orderId: order.id,
      type: "order_internal_notification",
      status: results.internal.ok ? "sent" : "prepared",
      sendResult: results.internal,
      createdAt: new Date().toISOString(),
      ...buildOrderInternalEmail(order)
    }
  ]);
  return results;
}

async function applyCreditPurchaseFromStripeSession(session, eventType = "") {
  const metadata = session.metadata || {};
  const userId = metadata.user_id || "";
  if (!userId) return { skipped: true, reason: "missing_user_id" };
  const paid = session.payment_status === "paid" || eventType === "checkout.session.async_payment_succeeded";
  if (!paid) return { skipped: true, reason: `payment_${session.payment_status || "not_paid"}` };
  const amountCents = Number(metadata.amount_cents || session.amount_total || 0);
  const credits = Number(metadata.credits || creditsForEuroAmount(amountCents / 100));
  if (!credits || credits < 1) return { skipped: true, reason: "missing_credits" };
  const result = await recordWalletLedgerEntry({
    userId,
    entryType: "credit_purchase",
    amountCredits: credits,
    amountCents,
    currency: String(session.currency || "EUR").toUpperCase(),
    externalReference: `stripe_session:${session.id}:credits`,
    stripeSessionId: session.id,
    metadata: {
      source: "stripe_checkout",
      credit_bucket: "purchased",
      credit_origin: "stripe_credit_purchase",
      eventType,
      label: `Achat de ${credits} credits`,
      creditsPerEur: Number(metadata.credits_per_eur || CREDITS_PER_EUR),
      stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id || null
    }
  });
  if (result.enabled !== false && result.ok === false) throw new Error(result.message || "Credit wallet non enregistre.");
  if (result.ok && !result.duplicate) {
    await recordSiteEvent({
      userId,
      eventType: "purchase_completed",
      entityType: "wallet",
      entityId: result.data?.id || result.ledger?.id || null,
      metadata: {
        source: "stripe_credit_purchase",
        eventType,
        amount_cents: amountCents,
        credits,
        stripe_session_id: session.id
      }
    });
  }
  return result;
}

async function grantSubscriptionCredits(subscription, eventType = "", invoice = null) {
  if (!subscription?.id) return { skipped: true, reason: "missing_subscription" };
  const metadata = subscription.metadata || {};
  const userId = metadata.user_id || "";
  if (!userId) return { skipped: true, reason: "missing_user_id" };
  const status = String(subscription.status || "").toLowerCase();
  if (!["active", "trialing"].includes(status)) return { skipped: true, reason: `subscription_${status || "inactive"}` };
  const plan = subscriptionPlanFromMetadata(subscription);
  const credits = Number(metadata.monthly_credits || plan?.monthly_credits || 0);
  if (!credits) return { skipped: true, reason: "missing_monthly_credits" };
  const periodStart = subscription.current_period_start || invoice?.period_start || invoice?.lines?.data?.[0]?.period?.start || "";
  const invoiceId = invoice?.id || (typeof subscription.latest_invoice === "string" ? subscription.latest_invoice : subscription.latest_invoice?.id || "");
  const reference = invoiceId
    ? `stripe_invoice:${invoiceId}:subscription_credits`
    : `subscription:${subscription.id}:${periodStart || "current"}:credits`;
  const result = await recordWalletLedgerEntry({
    userId,
    entryType: "subscription_allowance",
    amountCredits: credits,
    amountCents: 0,
    currency: "EUR",
    externalReference: reference,
    stripeInvoiceId: invoiceId,
    metadata: {
      source: "stripe_subscription",
      credit_bucket: "subscription",
      credit_origin: "subscription_allowance",
      eventType,
      subscriptionId: subscription.id,
      planCode: plan?.code || metadata.plan_code || null,
      planName: plan?.name || metadata.plan_name || null,
      periodStart: unixToIso(periodStart),
      periodEnd: unixToIso(subscription.current_period_end)
    }
  });
  if (result.enabled !== false && result.ok === false) throw new Error(result.message || "Allocation abonnement non enregistree.");
  if (result.ok && !result.duplicate) {
    await recordSiteEvent({
      userId,
      eventType: "purchase_completed",
      entityType: "subscription",
      entityId: result.data?.id || result.ledger?.id || subscription.id,
      metadata: {
        source: "stripe_subscription",
        eventType,
        subscription_id: subscription.id,
        plan_code: plan?.code || metadata.plan_code || null,
        credits
      }
    });
  }
  return result;
}

async function handleStripeWebhook(req, res) {
  let rawBody = null;
  let event = null;
  try {
    rawBody = await readRawBody(req);
    const signature = req.headers["stripe-signature"];
    const verification = verifyStripeWebhookSignature(rawBody, signature);
    if (!verification.ok) return jsonResponse(res, 400, { ok: false, error: verification.message });
    event = JSON.parse(rawBody.toString("utf8"));
    const supportedEvents = new Set([
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
      "charge.refunded",
      "refund.updated",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "customer.subscription.trial_will_end",
      "invoice.payment_succeeded",
      "invoice.payment_failed"
    ]);
    if (!supportedEvents.has(event.type)) {
      await recordStripeEventFinish(event, "ignored");
      return jsonResponse(res, 200, { ok: true, ignored: event.type });
    }
    const eventRecord = await recordStripeEventStart(event);
    if (eventRecord.duplicate) return jsonResponse(res, 200, { ok: true, duplicate: true, event: event.type });
    if (event.type === "charge.refunded" || event.type === "refund.updated") {
      const refund = await handleStripeRefundEvent(event);
      await recordStripeEventFinish(event, "processed");
      return jsonResponse(res, 200, { ok: true, event: event.type, refund });
    }
    if (event.type.startsWith("customer.subscription.")) {
      const subscription = await handleStripeSubscriptionEvent(event);
      await recordStripeEventFinish(event, "processed");
      return jsonResponse(res, 200, { ok: true, event: event.type, subscription });
    }
    if (event.type.startsWith("invoice.")) {
      const subscription = await handleStripeInvoiceEvent(event);
      if (event.type === "invoice.payment_succeeded") {
        const subscriptionId = typeof event.data.object?.subscription === "string" ? event.data.object.subscription : event.data.object?.subscription?.id;
        const details = await fetchStripeSubscription(subscriptionId);
        if (details) await grantSubscriptionCredits(details, event.type, event.data.object);
      }
      await recordStripeEventFinish(event, "processed");
      return jsonResponse(res, 200, { ok: true, event: event.type, subscription });
    }
    const detailedSession = await fetchStripeSessionDetails(event.data.object || {});
    if (detailedSession.metadata?.source === "chronotrade_credit_purchase") {
      const credit = await applyCreditPurchaseFromStripeSession(detailedSession, event.type);
      await recordStripeEventFinish(event, "processed");
      return jsonResponse(res, 200, { ok: true, event: event.type, credit });
    }
    if (detailedSession.mode === "subscription" && detailedSession.subscription) {
      const subscriptionId = typeof detailedSession.subscription === "string" ? detailedSession.subscription : detailedSession.subscription.id;
      const subscriptionDetails = await fetchStripeSubscription(subscriptionId);
      if (subscriptionDetails) {
        await syncSubscriptionFromStripe(subscriptionDetails, event.type);
        if (detailedSession.payment_status === "paid") await grantSubscriptionCredits(subscriptionDetails, event.type, detailedSession.invoice || null);
      }
    }
    const normalizedOrder = await orderFromStripeSession(detailedSession);
    if (event.type === "checkout.session.async_payment_succeeded") normalizedOrder.status = "paid";
    if (event.type === "checkout.session.async_payment_failed") normalizedOrder.status = "failed";
    if (event.type === "checkout.session.expired") normalizedOrder.status = "expired";
    const order = await upsertLocalOrder(normalizedOrder);
    const supabase = await syncSupabaseOrder(order);
    const notification = order.status === "paid" ? await notifyOrder(order) : { skipped: true };
    await recordStripeEventFinish(event, "processed");
    return jsonResponse(res, 200, { ok: true, event: event.type, order, integrations: { supabase, notification } });
  } catch (error) {
    try {
      await recordStripeEventFinish(event, "failed", error.message);
    } catch {}
    return jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

async function handleAnalyseExpressIntake(req, res) {
  try {
    const fields = await readRequestBody(req);
    const now = new Date().toISOString();
    const intake = {
      id: randomUUID(),
      product: "analyse_express",
      stripeSessionId: cleanString(fields.session_id || fields.stripe_session_id),
      fullName: cleanString(fields.nom),
      email: cleanString(fields.email).toLowerCase(),
      projectUrl: cleanString(fields.url_projet),
      currentSituation: cleanString(fields.situation),
      goal: cleanString(fields.objectif),
      blockers: cleanString(fields.blocages),
      priority: cleanString(fields.priorite),
      createdAt: now,
      updatedAt: now
    };
    const errors = {};
    if (!intake.fullName) errors.nom = "Champ obligatoire.";
    if (!isEmail(intake.email)) errors.email = "Email invalide.";
    if (intake.currentSituation.length < 12) errors.situation = "Expliquez un peu plus votre situation.";
    if (intake.goal.length < 12) errors.objectif = "Expliquez un peu plus l'objectif.";
    if (!intake.priority) errors.priorite = "Champ obligatoire.";
    if (Object.keys(errors).length) return jsonResponse(res, 422, { ok: false, errors });
    const intakes = await readJson(productIntakesPath, []);
    intakes.unshift(intake);
    await writeJson(productIntakesPath, intakes);
    const email = {
      to: process.env.INTERNAL_NOTIFICATION_EMAIL || companyProfile.email,
      subject: "Questionnaire Analyse Express recu",
      text: [
        `Nom : ${intake.fullName}`,
        `Email : ${intake.email}`,
        `Session Stripe : ${intake.stripeSessionId || "Non renseignee"}`,
        `URL / contexte : ${intake.projectUrl || "Non renseigne"}`,
        "",
        `Situation : ${intake.currentSituation}`,
        "",
        `Objectif : ${intake.goal}`,
        "",
        `Blocages : ${intake.blockers}`,
        "",
        `Priorite : ${intake.priority}`
      ].join("\n")
    };
    const notification = process.env.INTERNAL_NOTIFICATION_EMAIL ? await sendViaGraph(email) : { enabled: false, message: "Email interne absent." };
    await addOutbox([{ id: randomUUID(), intakeId: intake.id, type: "analyse_express_intake", status: notification.ok ? "sent" : "prepared", sendResult: notification, createdAt: now, ...email }]);
    return jsonResponse(res, 201, { ok: true, intake: { id: intake.id }, notification });
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

function requireAdminApiKey(req, res) {
  if (!ADMIN_API_KEY) {
    jsonResponse(res, 503, { ok: false, error: "ADMIN_API_KEY absent dans Render." });
    return false;
  }
  const received = req.headers["x-admin-key"];
  if (!received || received !== ADMIN_API_KEY) {
    jsonResponse(res, 401, { ok: false, error: "Acces admin refuse." });
    return false;
  }
  return true;
}

async function handleListOrders(req, res) {
  if (!requireAdminApiKey(req, res)) return;
  const orders = await readJson(ordersPath, []);
  jsonResponse(res, 200, { ok: true, orders });
}

async function handleListProductIntakes(req, res) {
  if (!requireAdminApiKey(req, res)) return;
  const intakes = await readJson(productIntakesPath, []);
  jsonResponse(res, 200, { ok: true, intakes });
}

async function handleAdminProductSync(req, res) {
  const admin = await requireSupabaseSuperAdmin(req, res);
  if (!admin) return;
  try {
    const fields = await readRequestBody(req);
    if (fields.plan_id || fields.planId) {
      const plan = await supabaseProductPlan({ planId: cleanString(fields.plan_id || fields.planId) });
      if (!plan) return jsonResponse(res, 404, { ok: false, error: "Plan introuvable." });
      const product = await supabaseProductBySlugOrId({ productId: plan.product_id });
      if (!product) return jsonResponse(res, 404, { ok: false, error: "Produit du plan introuvable." });
      const sync = await syncPlanWithStripe(product, plan, "admin_plan_sync");
      return jsonResponse(res, 200, {
        ok: true,
        product: { id: product.id, slug: product.slug, title: product.title },
        plan: {
          id: sync.plan.id,
          slug: sync.plan.slug,
          name: sync.plan.name,
          stripe_price_id: sync.stripePrice,
          skipped: sync.skipped || null
        }
      });
    }
    const product = await supabaseProductBySlugOrId({
      productId: cleanString(fields.product_id || fields.productId),
      slug: cleanString(fields.slug)
    });
    if (!product) return jsonResponse(res, 404, { ok: false, error: "Produit introuvable." });
    const sync = await syncProductWithStripe(product, "admin_sync");
    jsonResponse(res, 200, {
      ok: true,
      product: {
        id: sync.product.id,
        slug: sync.product.slug,
        title: sync.product.title,
        stripe_product_id: sync.stripeProduct,
        stripe_price_id: sync.stripePrice,
        skipped: sync.skipped || null
      }
    });
  } catch (error) {
    jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

async function handleAdminProductResolveAlerts(req, res) {
  const admin = await requireSupabaseSuperAdmin(req, res);
  if (!admin) return;
  try {
    const fields = await readRequestBody(req);
    const product = await supabaseProductBySlugOrId({
      productId: cleanString(fields.product_id || fields.productId),
      slug: cleanString(fields.slug)
    });
    if (!product) return jsonResponse(res, 404, { ok: false, error: "Produit introuvable." });
    if (product.status !== "published") return jsonResponse(res, 409, { ok: false, error: "Le produit doit etre publie avant d'alerter les demandes." });
    const result = await notifyMatchingNeedsForProduct(product, {
      dryRun: Boolean(fields.dry_run),
      limit: Number(fields.limit || 80)
    });
    return jsonResponse(res, result.ok ? 200 : 500, result);
  } catch (error) {
    jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

async function handleLibrarySignedDownload(req, res, url) {
  const user = await supabaseAuthUser(req);
  if (!user?.id) return jsonResponse(res, 401, { ok: false, error: "Connexion requise." });
  const productId = cleanString(url.searchParams.get("product_id"));
  if (!productId) return jsonResponse(res, 400, { ok: false, error: "product_id requis." });
  const entitlement = await supabaseSelect("entitlements", {
    select: "id,product_id,status,metadata",
    user_id: `eq.${user.id}`,
    product_id: `eq.${productId}`,
    status: "eq.active",
    limit: "1"
  });
  const hasAccess = entitlement.ok && Array.isArray(entitlement.data) && entitlement.data.length > 0;
  if (!hasAccess) return jsonResponse(res, 403, { ok: false, error: "Achat verifie requis pour acceder a ce fichier." });
  const file = await activeProductFile(productId);
  if (!file?.storage_bucket || !file?.storage_path) {
    return jsonResponse(res, 404, { ok: false, error: "Aucun fichier prive configure pour ce produit." });
  }
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${encodeURIComponent(file.storage_bucket)}/${file.storage_path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ expiresIn: 300 })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.signedURL) {
    return jsonResponse(res, 502, { ok: false, error: payload.message || "Impossible de creer le lien securise." });
  }
  const signedUrl = payload.signedURL.startsWith("http")
    ? payload.signedURL
    : `${SUPABASE_URL}/storage/v1${payload.signedURL}`;
  return jsonResponse(res, 200, { ok: true, url: signedUrl, expiresIn: 300, fileName: file.file_name || null });
}

async function handleProjectDeliverableDownload(req, res, url) {
  const user = await supabaseAuthUser(req);
  if (!user?.id) return jsonResponse(res, 401, { ok: false, error: "Connexion requise." });
  const deliverableId = cleanString(url.searchParams.get("id"));
  if (!deliverableId) return jsonResponse(res, 400, { ok: false, error: "id livrable requis." });
  const result = await supabaseSelect("project_deliverables", {
    select: "id,user_id,title,status,file_url,storage_bucket,storage_path,metadata",
    id: `eq.${deliverableId}`,
    user_id: `eq.${user.id}`,
    status: "eq.available",
    limit: "1"
  });
  const deliverable = result.ok && Array.isArray(result.data) ? result.data[0] : null;
  if (!deliverable) return jsonResponse(res, 404, { ok: false, error: "Livrable indisponible pour ce compte." });
  if (!deliverable.storage_bucket || !deliverable.storage_path) {
    if (deliverable.file_url && !String(deliverable.file_url).startsWith("private://")) {
      return jsonResponse(res, 200, { ok: true, url: deliverable.file_url, expiresIn: null, fileName: deliverable.metadata?.fileName || deliverable.title || null });
    }
    return jsonResponse(res, 404, { ok: false, error: "Aucun fichier prive configure pour ce livrable." });
  }
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${encodeURIComponent(deliverable.storage_bucket)}/${deliverable.storage_path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ expiresIn: 300 })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.signedURL) {
    return jsonResponse(res, 502, { ok: false, error: payload.message || "Impossible de creer le lien securise." });
  }
  const signedUrl = payload.signedURL.startsWith("http")
    ? payload.signedURL
    : `${SUPABASE_URL}/storage/v1${payload.signedURL}`;
  return jsonResponse(res, 200, { ok: true, url: signedUrl, expiresIn: 300, fileName: deliverable.metadata?.fileName || deliverable.title || null });
}

async function handleBillingPortal(req, res) {
  const user = await requireSupabaseUser(req, res);
  if (!user) return;
  try {
    const customer = await ensureStripeCustomerForUser(user);
    const portal = await stripeRequest("/v1/billing_portal/sessions", {
      method: "POST",
      body: stripeParams({
        customer,
        return_url: `${SITE_ORIGIN}/dashboard/commandes/`
      })
    });
    return jsonResponse(res, 200, { ok: true, url: portal.url });
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

async function handleWalletSummary(req, res) {
  const user = await requireSupabaseUser(req, res);
  if (!user) return;
  try {
    const welcome = await ensureWelcomeCredits(user.id);
    const { rows, error } = await walletLedgerRows(user.id, 80);
    const balance = rows.reduce((total, row) => total + ledgerAmount(row), 0);
    const activeSubscription = await activeUserSubscription(user.id);
    const plan = subscriptionPlanFromMetadata(activeSubscription);
    const periodStart = activeSubscription?.current_period_start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const periodEnd = activeSubscription?.current_period_end || null;
    const usageRows = await usageRowsForPeriod(user.id, { start: periodStart, end: periodEnd, limit: 200 });
    const usageDetails = usageSummaryForWallet(usageRows.rows, plan);
    const deepDiveEntitlements = await deepDiveEntitlementStatus(user.id);
    const plans = (await configuredBillingPlansLive()).filter((item) => item.visible !== false && item.status === "active");
    const recommendation = walletRecommendation({ ledgerRows: rows, activePlan: activeSubscription });
    return jsonResponse(res, 200, {
      ok: true,
      wallet: {
        balance_credits: balance,
        free_monthly_credits: FREE_MONTHLY_CREDITS,
        free_weekly_deep_dives: FREE_WEEKLY_DEEP_DIVES,
        free_deep_dives: deepDiveEntitlements.free_weekly,
        subscription_deep_dives: deepDiveEntitlements.subscription_depth,
        deep_dive_entitlements: deepDiveEntitlements,
        welcome_credits: WELCOME_CREDITS,
        credits_per_eur: CREDITS_PER_EUR,
        min_purchase_eur: CREDIT_MIN_PURCHASE_EUR
      },
      usage: {
        quota_remaining: usageDetails.free_remaining + usageDetails.subscription_remaining + balance,
        next_reset_at: activeSubscription?.current_period_end || null,
        free_deep_dives: deepDiveEntitlements.free_weekly,
        subscription_deep_dives: deepDiveEntitlements.subscription_depth,
        deep_dive_entitlements: deepDiveEntitlements,
        period_start: periodStart,
        period_end: periodEnd,
        ...usageDetails,
        storage: usageRows.error ? { ok: false, error: usageRows.error } : { ok: true }
      },
      subscription: activeSubscription ? {
        id: activeSubscription.id,
        status: activeSubscription.status,
        plan_code: plan?.code || activeSubscription.metadata?.planCode || activeSubscription.metadata?.plan_code || null,
        plan_name: plan?.name || activeSubscription.metadata?.planName || "Abonnement ChronoTrade",
        current_period_end: activeSubscription.current_period_end,
        cancel_at_period_end: Boolean(activeSubscription.cancel_at_period_end)
      } : null,
      plans,
      recommendation,
      ledger: rows.slice(0, 20).map((row) => ({
        id: row.id,
        entry_type: row.entry_type,
        amount_credits: ledgerAmount(row),
        balance_after: Number(row.balance_after || 0),
        amount_cents: row.amount_cents,
        currency: row.currency || "EUR",
        status: row.status || "posted",
        credit_bucket: row.metadata?.credit_bucket || null,
        credit_origin: row.metadata?.credit_origin || row.metadata?.source || null,
        created_at: row.created_at,
        label: row.metadata?.label || row.metadata?.planName || row.metadata?.source || row.entry_type
      })),
      bootstrap: welcome,
      storage: error ? { ok: false, error } : { ok: true }
    });
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

async function handleCreditCheckoutSession(req, res) {
  const user = await requireSupabaseUser(req, res);
  if (!user) return;
  if (!STRIPE_SECRET_KEY) return jsonResponse(res, 503, { ok: false, error: "STRIPE_SECRET_KEY absente dans Render." });
  try {
    const fields = await readRequestBody(req);
    const requestedAmount = Number(fields.amount_eur || fields.amount || 0);
    const amountEur = Math.max(CREDIT_MIN_PURCHASE_EUR, Math.round(requestedAmount * 100) / 100);
    const amountCents = Math.round(amountEur * 100);
    const credits = creditsForEuroAmount(amountEur);
    const customer = await ensureStripeCustomerForUser(user);
    const returnUrl = new URL("/dashboard/commandes/", SITE_ORIGIN);
    returnUrl.searchParams.set("credits", "success");
    returnUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
    const body = new URLSearchParams({
      mode: "payment",
      customer,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "eur",
      "line_items[0][price_data][unit_amount]": String(amountCents),
      "line_items[0][price_data][product_data][name]": `Credits ChronoTrade - ${credits} credits`,
      "line_items[0][price_data][product_data][description]": "Credits utilisables pour continuer vos analyses et approfondissements ChronoTrade.",
      "metadata[source]": "chronotrade_credit_purchase",
      "metadata[user_id]": user.id,
      "metadata[amount_cents]": String(amountCents),
      "metadata[credits]": String(credits),
      "metadata[credits_per_eur]": String(CREDITS_PER_EUR),
      success_url: returnUrl.toString(),
      cancel_url: `${SITE_ORIGIN}/dashboard/commandes/?credits=cancel`
    });
    const { stripeResponse, session } = await createStripeCheckoutSession(body);
    if (!stripeResponse.ok || !session.url) return jsonResponse(res, 502, { ok: false, error: session.error?.message || "Paiement credits indisponible." });
    return jsonResponse(res, 200, { ok: true, url: session.url, id: session.id, amount_eur: amountEur, credits });
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

async function handleSubscriptionCheckoutSession(req, res) {
  const user = await requireSupabaseUser(req, res);
  if (!user) return;
  if (!STRIPE_SECRET_KEY) return jsonResponse(res, 503, { ok: false, error: "STRIPE_SECRET_KEY absente dans Render." });
  try {
    const fields = await readRequestBody(req);
    const plan = await billingPlanByCodeLive(fields.plan_code || fields.planCode || fields.plan);
    if (!plan || plan.status !== "active" || plan.visible === false) return jsonResponse(res, 404, { ok: false, error: "Formule ChronoTrade indisponible." });
    const customer = await ensureStripeCustomerForUser(user);
    const returnUrl = new URL("/dashboard/commandes/", SITE_ORIGIN);
    returnUrl.searchParams.set("subscription", plan.code);
    returnUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
    const body = new URLSearchParams({
      mode: "subscription",
      customer,
      "line_items[0][quantity]": "1",
      "metadata[source]": "chronotrade_subscription_plan",
      "metadata[user_id]": user.id,
      "metadata[plan_code]": plan.code,
      "metadata[plan_name]": plan.name,
      "metadata[monthly_credits]": String(plan.monthly_credits),
      "metadata[deep_dives]": String(plan.deep_dives),
      "subscription_data[metadata][source]": "chronotrade_subscription_plan",
      "subscription_data[metadata][user_id]": user.id,
      "subscription_data[metadata][plan_code]": plan.code,
      "subscription_data[metadata][plan_name]": plan.name,
      "subscription_data[metadata][monthly_credits]": String(plan.monthly_credits),
      "subscription_data[metadata][deep_dives]": String(plan.deep_dives),
      success_url: returnUrl.toString(),
      cancel_url: `${SITE_ORIGIN}/dashboard/commandes/?subscription=cancel`
    });
    if (plan.stripe_price_id) {
      body.set("line_items[0][price]", plan.stripe_price_id);
    } else {
      body.set("line_items[0][price_data][currency]", String(plan.currency || "EUR").toLowerCase());
      body.set("line_items[0][price_data][unit_amount]", String(plan.price_cents));
      body.set("line_items[0][price_data][recurring][interval]", "month");
      body.set("line_items[0][price_data][product_data][name]", `ChronoTrade ${plan.name}`);
      body.set("line_items[0][price_data][product_data][description]", `${plan.monthly_credits} credits mensuels et ${plan.deep_dives} approfondissements inclus.`);
    }
    const { stripeResponse, session } = await createStripeCheckoutSession(body);
    if (!stripeResponse.ok || !session.url) return jsonResponse(res, 502, { ok: false, error: session.error?.message || "Abonnement indisponible." });
    return jsonResponse(res, 200, { ok: true, url: session.url, id: session.id, plan });
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

async function handleProductReview(req, res) {
  const user = await requireSupabaseUser(req, res);
  if (!user) return;
  try {
    const fields = await readRequestBody(req);
    const product = await supabaseProductBySlugOrId({
      productId: cleanString(fields.product_id || fields.productId),
      slug: cleanString(fields.slug)
    });
    if (!product) return jsonResponse(res, 404, { ok: false, error: "Produit introuvable." });
    const policy = product.social_proof_config?.reviews || "buyers_only";
    if (policy === "disabled") return jsonResponse(res, 409, { ok: false, error: "Les avis sont desactives pour ce produit." });
    const orders = await supabaseSelect("orders_or_projects", {
      select: "id",
      user_id: `eq.${user.id}`,
      product_id: `eq.${product.id}`,
      status: "in.(paid,completed,delivered)",
      limit: "1"
    });
    const verified = orders.ok && Array.isArray(orders.data) && orders.data.length > 0;
    if (policy === "buyers_only" && !verified) {
      return jsonResponse(res, 403, { ok: false, error: "Achat verifie requis pour laisser un avis sur ce produit." });
    }
    const rating = Math.max(1, Math.min(5, Number(fields.rating || 0)));
    const review = await supabaseInsert("product_reviews", {
      product_id: product.id,
      user_id: user.id,
      order_id: verified ? orders.data[0].id : null,
      rating,
      title: cleanString(fields.title).slice(0, 120),
      body: cleanString(fields.body || fields.message).slice(0, 2000),
      verified_purchase: verified,
      status: "pending"
    });
    return jsonResponse(res, review.ok ? 201 : 500, { ok: Boolean(review.ok), review: review.data, error: review.ok ? null : review.message });
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

function publicSiteReview(row) {
  return {
    id: row.id,
    author: row.author_name,
    company: row.company || "",
    role: row.role_label || "",
    rating: Number(row.rating || 0),
    title: row.title || "",
    body: row.body || "",
    source: row.source || "site",
    verifiedClient: Boolean(row.verified_client),
    adminReply: row.admin_reply || "",
    createdAt: row.created_at
  };
}

async function handleSiteReviews(res, url) {
  const limit = Math.max(1, Math.min(12, Number(url.searchParams.get("limit") || 6)));
  const result = await supabaseSelect("site_reviews_public", {
    select: "id,author_name,company,role_label,rating,title,body,source,verified_client,admin_reply,created_at",
    order: "created_at.desc",
    limit: String(limit)
  });
  if (!result.ok) return jsonResponse(res, 200, { ok: false, reviews: [], error: result.message });
  const reviews = Array.isArray(result.data) ? result.data.map(publicSiteReview) : [];
  const averageRating = reviews.length
    ? reviews.reduce((total, review) => total + Number(review.rating || 0), 0) / reviews.length
    : null;
  return jsonResponse(res, 200, { ok: true, reviews, averageRating, total: reviews.length });
}

function buildSiteReviewInternalEmail(review) {
  return {
    to: process.env.INTERNAL_NOTIFICATION_EMAIL || companyProfile.email,
    subject: `Nouvel avis ChronoTrade a moderer - ${review.rating}/5`,
    text: [
      "Un nouvel avis a ete envoye depuis le site ChronoTrade.",
      "",
      `Nom : ${review.author_name}`,
      `Email : ${review.email || "Non renseigne"}`,
      `Entreprise : ${review.company || "Non renseignee"}`,
      `Note : ${review.rating}/5`,
      `Titre : ${review.title || "Sans titre"}`,
      "",
      review.body,
      "",
      "Statut : pending",
      "Action : connecte-toi au super-admin ChronoTrade pour publier, masquer ou repondre."
    ].join("\n"),
    html: `<p>Un nouvel avis a ete envoye depuis le site ChronoTrade.</p><ul><li><strong>Nom :</strong> ${escapeHtml(review.author_name)}</li><li><strong>Email :</strong> ${escapeHtml(review.email || "Non renseigne")}</li><li><strong>Entreprise :</strong> ${escapeHtml(review.company || "Non renseignee")}</li><li><strong>Note :</strong> ${Number(review.rating || 0)}/5</li><li><strong>Titre :</strong> ${escapeHtml(review.title || "Sans titre")}</li></ul><p>${escapeHtml(review.body)}</p><p><strong>Statut :</strong> pending. A moderer dans le super-admin ChronoTrade.</p>`
  };
}

async function handleSiteReviewSubmit(req, res) {
  try {
    const fields = await readRequestBody(req);
    if (cleanString(fields.website || fields.company_website_hidden)) {
      return jsonResponse(res, 202, { ok: true, pending: true });
    }
    const authorName = cleanString(fields.author_name || fields.author || fields.name).slice(0, 120);
    const email = cleanString(fields.email).toLowerCase().slice(0, 180);
    const company = cleanString(fields.company).slice(0, 140);
    const roleLabel = cleanString(fields.role_label || fields.role).slice(0, 140);
    const title = cleanString(fields.title).slice(0, 140);
    const body = cleanString(fields.body || fields.message).slice(0, 1600);
    const rating = Math.max(1, Math.min(5, Number(fields.rating || 0)));
    if (!authorName || !body || !rating) {
      return jsonResponse(res, 400, { ok: false, error: "Nom, note et avis sont obligatoires." });
    }
    if (body.length < 12) {
      return jsonResponse(res, 400, { ok: false, error: "L'avis est trop court pour etre utile." });
    }
    const authUser = await supabaseAuthUser(req);
    const userId = authUser?.id || (email ? await supabaseUserIdByEmail(email) : null);
    const payload = {
      user_id: userId,
      author_name: authorName,
      email: email || null,
      company: company || null,
      role_label: roleLabel || null,
      rating,
      title: title || null,
      body,
      source: "site",
      status: "pending",
      verified_client: false,
      metadata: {
        page: cleanString(fields.page || "avis"),
        userAgent: cleanString(req.headers["user-agent"]).slice(0, 240)
      }
    };
    const inserted = await supabaseInsert("site_reviews", payload);
    if (!inserted.ok) return jsonResponse(res, 500, { ok: false, error: inserted.message || "Avis indisponible." });
    const review = Array.isArray(inserted.data) ? inserted.data[0] : inserted.data;
    const emailPayload = buildSiteReviewInternalEmail(payload);
    const notification = process.env.INTERNAL_NOTIFICATION_EMAIL ? await sendViaGraph(emailPayload) : { enabled: false, message: "Email interne absent." };
    await addOutbox([{ id: randomUUID(), reviewId: review?.id || null, type: "site_review_pending", status: notification.ok ? "sent" : "prepared", sendResult: notification, createdAt: new Date().toISOString(), ...emailPayload }]);
    return jsonResponse(res, 201, { ok: true, pending: true, review: { id: review?.id || null } });
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

async function handleAnalyseExpressEmbeddedCheckout(req, res) {
  if (!STRIPE_SECRET_KEY || !STRIPE_PUBLISHABLE_KEY) {
    return jsonResponse(res, 503, {
      ok: false,
      error: "Stripe embedded checkout n'est pas encore configure. Ajoute STRIPE_SECRET_KEY et STRIPE_PUBLISHABLE_KEY dans Render."
    });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(res, 503, { ok: false, error: "Supabase doit etre relie a Render pour lancer un paiement avec compte ChronoTrade." });
  }
  try {
    const authUser = await requireSupabaseUser(req, res);
    if (!authUser) return;
    const fields = await readRequestBody(req);
    const result = await dynamicCheckoutBody({ ...fields, slug: "analyse-express" }, { user: authUser, slug: "analyse-express", returnPath: "/analyse-express/" });
    if (!result.error && result.session?.client_secret) {
      return jsonResponse(res, 200, { ok: true, id: result.session.id, clientSecret: result.session.client_secret });
    }
    return jsonResponse(res, result.errorStatus || 500, { ok: false, error: result.error || "Paiement indisponible." });
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

function handlePublicConfig(res) {
  jsonResponse(res, 200, {
    ok: true,
    stripePublishableKey: STRIPE_PUBLISHABLE_KEY,
    googleReviewUrl: GOOGLE_BUSINESS_REVIEW_URL,
    googleProfileUrl: GOOGLE_BUSINESS_PROFILE_URL
  });
}

function publicPromotionDiscountLabel(promo) {
  const value = Number(promo.discount_value || 0);
  if (!value) return "";
  if (promo.discount_type === "fixed") return `-${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} EUR`;
  return `-${Math.round(value)}%`;
}

async function publicPromotionPayload(promo) {
  const product = promo.product_id ? await supabaseProductBySlugOrId({ productId: promo.product_id }) : null;
  return {
    id: promo.id,
    code: promo.code || "",
    label: promo.label || promo.code || "Offre ChronoTrade",
    discountLabel: publicPromotionDiscountLabel(promo),
    startsAt: promo.starts_at || null,
    endsAt: promo.ends_at || null,
    banner: {
      enabled: Boolean(promo.banner_enabled),
      titleFr: promo.banner_title_fr || promo.label || "Offre ChronoTrade active",
      titleEn: promo.banner_title_en || promo.banner_title_fr || promo.label || "ChronoTrade offer",
      ctaLabelFr: promo.banner_cta_label_fr || "Voir l'offre",
      ctaLabelEn: promo.banner_cta_label_en || promo.banner_cta_label_fr || "View offer",
      ctaUrl: promo.banner_cta_url || (product?.slug ? `/produit/?slug=${encodeURIComponent(product.slug)}` : "/catalogue/"),
      style: promo.banner_style || "premium"
    },
    product: product ? {
      id: product.id,
      slug: product.slug,
      title: product.title,
      priceCents: productAmountCents(product),
      currency: product.currency || "EUR"
    } : null
  };
}

async function handlePublicPromotions(res) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(res, 200, { ok: true, promotions: [] });
  }
  const result = await supabaseSelect("promotions", {
    select: "*",
    status: "eq.active",
    order: "created_at.desc",
    limit: "20"
  });
  if (!result.ok || !Array.isArray(result.data)) {
    return jsonResponse(res, 200, { ok: true, promotions: [] });
  }
  const now = Date.now();
  const visible = result.data.filter((promo) => {
    if (!promo.banner_enabled) return false;
    if (promo.starts_at && new Date(promo.starts_at).getTime() > now) return false;
    if (promo.ends_at && new Date(promo.ends_at).getTime() < now) return false;
    return true;
  }).slice(0, 6);
  const promotions = [];
  for (const promo of visible) promotions.push(await publicPromotionPayload(promo));
  jsonResponse(res, 200, { ok: true, promotions });
}

function handleHealth(res) {
  const rawSupabaseUrl = cleanUrl(process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "");
  let supabaseHost = "";
  try {
    supabaseHost = SUPABASE_URL ? new URL(SUPABASE_URL).host : "";
  } catch {
    supabaseHost = "invalid-url";
  }
  jsonResponse(res, 200, {
    ok: true,
    service: "chronotrade-form-system",
    version: "phase-5-luna-need-analysis",
    checkedAt: new Date().toISOString(),
    integrations: {
      stripePublicKey: Boolean(STRIPE_PUBLISHABLE_KEY),
      stripeSecretKey: Boolean(STRIPE_SECRET_KEY),
      stripeWebhookSecret: Boolean(STRIPE_WEBHOOK_SECRET),
      googleReviewUrl: Boolean(GOOGLE_BUSINESS_REVIEW_URL),
      googleProfileUrl: Boolean(GOOGLE_BUSINESS_PROFILE_URL),
      supabaseUrl: Boolean(SUPABASE_URL),
      supabaseServiceRole: Boolean(SUPABASE_SERVICE_ROLE_KEY),
      openaiNeedAnalysis: Boolean(OPENAI_API_KEY),
      outlookGraph: Boolean(process.env.MICROSOFT_GRAPH_TOKEN || (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_REFRESH_TOKEN))
    },
    diagnostics: {
      supabaseHost,
      supabaseUrlNormalized: Boolean(rawSupabaseUrl && rawSupabaseUrl !== SUPABASE_URL),
      supabaseRestUrlReady: Boolean(SUPABASE_REST_URL && SUPABASE_REST_URL.endsWith("/rest/v1"))
    }
  });
}

async function fetchGoogleAccessToken() {
  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: GOOGLE_REFRESH_TOKEN,
    grant_type: "refresh_token"
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "Impossible d'obtenir le token Google Business.");
  }
  return payload.access_token;
}

function googleRating(value) {
  const map = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  if (typeof value === "number") return value;
  return map[String(value || "").toUpperCase()] || 0;
}

function normalizeGoogleReview(review) {
  return {
    id: review.reviewId || review.name || randomUUID(),
    author: review.reviewer?.displayName || "Client Google",
    rating: googleRating(review.starRating),
    text: cleanString(review.comment || ""),
    createdAt: review.createTime || "",
    updatedAt: review.updateTime || "",
    profilePhotoUrl: review.reviewer?.profilePhotoUrl || ""
  };
}

async function handleGoogleReviews(res) {
  const configured = Boolean(GOOGLE_BUSINESS_ACCOUNT_ID && GOOGLE_BUSINESS_LOCATION_ID && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REFRESH_TOKEN);
  if (!configured) {
    return jsonResponse(res, 200, {
      ok: true,
      configured: false,
      googleReviewUrl: GOOGLE_BUSINESS_REVIEW_URL,
      googleProfileUrl: GOOGLE_BUSINESS_PROFILE_URL,
      averageRating: null,
      totalReviewCount: null,
      reviews: []
    });
  }

  try {
    const accessToken = await fetchGoogleAccessToken();
    const parent = `accounts/${encodeURIComponent(GOOGLE_BUSINESS_ACCOUNT_ID)}/locations/${encodeURIComponent(GOOGLE_BUSINESS_LOCATION_ID)}`;
    const reviewsUrl = `https://mybusiness.googleapis.com/v4/${parent}/reviews?pageSize=6&orderBy=updateTime%20desc`;
    const response = await fetch(reviewsUrl, {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    const payload = await response.json();
    if (!response.ok) {
      return jsonResponse(res, 502, { ok: false, configured: true, error: payload.error?.message || "Impossible de recuperer les avis Google.", googleReviewUrl: GOOGLE_BUSINESS_REVIEW_URL, googleProfileUrl: GOOGLE_BUSINESS_PROFILE_URL, reviews: [] });
    }
    jsonResponse(res, 200, {
      ok: true,
      configured: true,
      googleReviewUrl: GOOGLE_BUSINESS_REVIEW_URL,
      googleProfileUrl: GOOGLE_BUSINESS_PROFILE_URL,
      averageRating: payload.averageRating || null,
      totalReviewCount: payload.totalReviewCount || null,
      reviews: (payload.reviews || []).map(normalizeGoogleReview)
    });
  } catch (error) {
    jsonResponse(res, 500, { ok: false, configured: true, error: error.message, googleReviewUrl: GOOGLE_BUSINESS_REVIEW_URL, googleProfileUrl: GOOGLE_BUSINESS_PROFILE_URL, reviews: [] });
  }
}

async function handleStatus(req, res, id) {
  try {
    const body = await readRequestBody(req);
    const status = cleanString(body.status);
    if (!statuses.includes(status)) {
      return jsonResponse(res, 422, { ok: false, error: "Statut invalide." });
    }

    const prospects = await readJson(prospectsPath, []);
    const lead = prospects.find((item) => item.id === id);
    if (!lead) return jsonResponse(res, 404, { ok: false, error: "Prospect introuvable." });

    lead.status = status;
    lead.updatedAt = new Date().toISOString();
    lead.summary = buildSummary(lead);
    if (!lead.quote) lead.quote = buildQuoteProposal(lead);
    if (!lead.quoteUrl && PUBLIC_BASE_URL) lead.quoteUrl = `${PUBLIC_BASE_URL}/api/leads/${lead.id}/quote`;
    if (!lead.quoteHtmlPath) lead.quoteHtmlPath = await writeQuoteHtml(lead);
    await writeJson(prospectsPath, prospects);
    const notion = await syncNotion(lead);
    const followups = status === "Devis envoye" ? await addFollowupsForLead(lead) : [];
    jsonResponse(res, 200, { ok: true, lead, followups, integrations: { notion } });
  } catch (error) {
    jsonResponse(res, 500, { ok: false, error: error.message });
  }
}

async function serveStatic(req, res) {
  const requested = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  try {
    const content = await readFile(filePath);
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml"
    };
    res.writeHead(200, { "content-type": types[extname(filePath)] || "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

async function ensureDataFiles() {
  await mkdir(dataDir, { recursive: true });
  await mkdir(quotesDir, { recursive: true });
  if (!existsSync(prospectsPath)) await writeJson(prospectsPath, []);
  if (!existsSync(outboxPath)) await writeJson(outboxPath, []);
  if (!existsSync(followupsPath)) await writeJson(followupsPath, []);
  if (!existsSync(ordersPath)) await writeJson(ordersPath, []);
  if (!existsSync(productIntakesPath)) await writeJson(productIntakesPath, []);
  if (!existsSync(resolveNeedsPath)) await writeJson(resolveNeedsPath, []);
  if (!existsSync(siteEventsPath)) await writeJson(siteEventsPath, []);
}

await ensureDataFiles();

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    return res.end();
  }
  if (req.method === "POST" && url.pathname === "/api/leads") return handleLead(req, res);
  if (req.method === "POST" && url.pathname === "/api/resolve/needs") return handleResolveNeed(req, res);
  if (req.method === "POST" && url.pathname.startsWith("/api/resolve/needs/") && url.pathname.endsWith("/clarification")) {
    return handleResolveClarification(req, res, url.pathname.replace("/api/resolve/needs/", "").replace("/clarification", ""));
  }
  if (req.method === "POST" && url.pathname.startsWith("/api/resolve/needs/") && url.pathname.endsWith("/message")) {
    return handleResolveMessage(req, res, url.pathname.replace("/api/resolve/needs/", "").replace("/message", ""));
  }
  if (req.method === "POST" && url.pathname.startsWith("/api/resolve/needs/") && url.pathname.endsWith("/correction")) {
    return handleResolveCorrection(req, res, url.pathname.replace("/api/resolve/needs/", "").replace("/correction", ""));
  }
  if (req.method === "POST" && url.pathname.startsWith("/api/resolve/needs/") && url.pathname.endsWith("/contact")) {
    return handleResolveContact(req, res, url.pathname.replace("/api/resolve/needs/", "").replace("/contact", ""));
  }
  if (req.method === "POST" && url.pathname.startsWith("/api/resolve/needs/") && url.pathname.endsWith("/save")) {
    return handleResolveSave(req, res, url.pathname.replace("/api/resolve/needs/", "").replace("/save", ""));
  }
  if (req.method === "POST" && url.pathname === "/api/events") return handleSiteEvent(req, res);
  if (req.method === "POST" && url.pathname === "/api/privacy/request") return handlePrivacyRequest(req, res);
  if (req.method === "POST" && url.pathname === "/api/forms/devis") return handleLiveForm(req, res, "devis");
  if (req.method === "POST" && url.pathname === "/api/forms/sur-mesure") return handleLiveForm(req, res, "sur-mesure");
  if (req.method === "POST" && url.pathname === "/api/forms/vision") return handleLiveForm(req, res, "vision");
  if (req.method === "POST" && url.pathname === "/api/forms/launch") return handleLiveForm(req, res, "launch");
  if (req.method === "POST" && url.pathname === "/api/forms/os") return handleLiveForm(req, res, "os");
  if (req.method === "POST" && url.pathname === "/api/forms/business") return handleLiveForm(req, res, "business");
  if (req.method === "POST" && url.pathname === "/api/forms/partner") return handleLiveForm(req, res, "partner");
  if (req.method === "POST" && url.pathname === "/api/forms/studio") return handleLiveForm(req, res, "studio");
  if (req.method === "POST" && url.pathname === "/api/forms/motion") return handleLiveForm(req, res, "motion");
  if (req.method === "GET" && url.pathname === "/api/health") return handleHealth(res);
  if (req.method === "GET" && url.pathname === "/api/leads") return handleListLeads(res);
  if (req.method === "GET" && url.pathname === "/api/config/public") return handlePublicConfig(res);
  if (req.method === "GET" && url.pathname === "/api/promotions/public") return handlePublicPromotions(res);
  if (req.method === "GET" && url.pathname === "/api/google-reviews") return handleGoogleReviews(res);
  if (req.method === "GET" && url.pathname === "/api/site-reviews") return handleSiteReviews(res, url);
  if (req.method === "POST" && url.pathname === "/api/site-reviews") return handleSiteReviewSubmit(req, res);
  if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/checkout/session") return handleDynamicCheckoutSession(req, res, url);
  if (req.method === "GET" && url.pathname === "/api/wallet/summary") return handleWalletSummary(req, res);
  if (req.method === "POST" && url.pathname === "/api/checkout/credits/session") return handleCreditCheckoutSession(req, res);
  if (req.method === "POST" && url.pathname === "/api/billing/subscription/session") return handleSubscriptionCheckoutSession(req, res);
  if (req.method === "GET" && url.pathname === "/api/checkout/product") return handleDynamicCheckoutRedirect(res, url);
  if (req.method === "GET" && url.pathname === "/api/checkout/analyse-express") return handleAnalyseExpressCheckout(res);
  if (req.method === "POST" && url.pathname === "/api/checkout/analyse-express/session") return handleAnalyseExpressEmbeddedCheckout(req, res);
  if (req.method === "POST" && url.pathname === "/api/stripe/webhook") return handleStripeWebhook(req, res);
  if (req.method === "POST" && url.pathname === "/api/admin/products/sync-stripe") return handleAdminProductSync(req, res);
  if (req.method === "POST" && url.pathname === "/api/admin/products/resolve-alerts") return handleAdminProductResolveAlerts(req, res);
  if (req.method === "GET" && url.pathname === "/api/admin/resolve/analytics") return handleAdminResolveAnalytics(req, res);
  if (req.method === "GET" && url.pathname === "/api/admin/security/summary") return handleAdminSecuritySummary(req, res);
  if (req.method === "POST" && url.pathname.startsWith("/api/admin/needs/") && url.pathname.endsWith("/analyze")) {
    return handleAdminAnalyzeNeed(req, res, url.pathname.replace("/api/admin/needs/", "").replace("/analyze", ""));
  }
  if (req.method === "GET" && url.pathname === "/api/library/download") return handleLibrarySignedDownload(req, res, url);
  if (req.method === "GET" && url.pathname === "/api/project-deliverables/download") return handleProjectDeliverableDownload(req, res, url);
  if (req.method === "POST" && url.pathname === "/api/billing/portal") return handleBillingPortal(req, res);
  if (req.method === "POST" && url.pathname === "/api/product-reviews") return handleProductReview(req, res);
  if (req.method === "POST" && url.pathname === "/api/orders/analyse-express/intake") return handleAnalyseExpressIntake(req, res);
  if (req.method === "GET" && url.pathname === "/api/orders") return handleListOrders(req, res);
  if (req.method === "GET" && url.pathname === "/api/product-intakes") return handleListProductIntakes(req, res);
  if (req.method === "GET" && url.pathname === "/api/followups/due") return handleDueFollowups(res);
  if (req.method === "POST" && url.pathname === "/api/followups/run") return handleRunFollowups(res);
  if (req.method === "GET" && url.pathname.startsWith("/api/leads/") && url.pathname.endsWith("/quote")) {
    return handleQuote(res, url.pathname.replace("/api/leads/", "").replace("/quote", ""));
  }
  if (req.method === "PATCH" && url.pathname.startsWith("/api/leads/")) {
    return handleStatus(req, res, url.pathname.replace("/api/leads/", ""));
  }
  return serveStatic(req, res);
}).listen(PORT, () => {
  console.log(`ChronoTrade forms running on http://localhost:${PORT}`);
});
