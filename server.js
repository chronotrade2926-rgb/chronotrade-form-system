import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const dataDir = process.env.DATA_DIR ? normalize(process.env.DATA_DIR) : join(__dirname, "data");
const quotesDir = join(dataDir, "quotes");
const prospectsPath = join(dataDir, "prospects.json");
const outboxPath = join(dataDir, "email-outbox.json");
const followupsPath = join(dataDir, "followups.json");

const PORT = Number(process.env.PORT || 3030);
const PUBLIC_BASE_URL = cleanUrl(process.env.PUBLIC_BASE_URL || "");
const SITE_ORIGIN = process.env.SITE_ORIGIN || "https://chronotradehub.com";
let graphTokenCache = null;

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
  site_web: "Site web",
  automatisation_ia: "Automatisation IA",
  branding: "Branding",
  application_web: "Application web",
  demande_generale: "Demande generale"
};

const formSchemas = {
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

const quotePresets = {
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
    "access-control-allow-headers": "content-type,accept",
    "vary": "Origin"
  };
}

function cleanUrl(value) {
  return String(value || "").replace(/\/+$/, "");
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
  const target = alignTotalWithBudget(rawTotal, budget);
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
    pricingNote: budget.note,
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

function alignTotalWithBudget(rawTotal, budget) {
  const min = Math.max(350, budget.min || 0);
  const max = Math.max(min + 250, budget.max || rawTotal);
  if (rawTotal < min) return min;
  if (rawTotal > max) return Math.max(350, max * 0.92);
  return rawTotal;
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
  if (lead.service === "automatisation_ia") base.push("Le tarif inclut la construction d'un workflow pilote et ses tests.");
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
  if (clientId && clientSecret && refreshToken) {
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
    client_secret: clientSecret,
    refresh_token: refreshToken,
    scope: "https://graph.microsoft.com/Mail.Send offline_access",
    grant_type: "refresh_token"
  });

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
    const mapped = kind === "os" ? mapLiveOsForm(fields) : mapLiveDevisForm(fields);
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
    const notification = await sendInternalNotification(savedLead);

    await addOutbox([
      { id: randomUUID(), leadId: savedLead.id, type: "reply", createdAt: now, ...savedLead.replyEmail },
      {
        id: randomUUID(),
        leadId: savedLead.id,
        type: "quote",
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
      integrations: { notion, notification }
    });
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
}

await ensureDataFiles();

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    return res.end();
  }
  if (req.method === "POST" && url.pathname === "/api/leads") return handleLead(req, res);
  if (req.method === "POST" && url.pathname === "/api/forms/devis") return handleLiveForm(req, res, "devis");
  if (req.method === "POST" && url.pathname === "/api/forms/os") return handleLiveForm(req, res, "os");
  if (req.method === "GET" && url.pathname === "/api/leads") return handleListLeads(res);
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
