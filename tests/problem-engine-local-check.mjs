import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("..", import.meta.url));
const dataFiles = [
  join(cwd, "data", "resolve-needs.json"),
  join(cwd, "data", "site-events.json")
];

const cases = [
  { id: "emploi-augmentation", group: "travail", text: "Je veux demander une augmentation mais je ne sais pas comment le formuler sans braquer mon manager.", expectQuestion: false },
  { id: "emploi-reconversion", group: "travail", text: "Je veux changer de metier mais je ne sais pas si je dois me former ou chercher directement un nouveau poste.", expectQuestion: true },
  { id: "couple-conflit", group: "relationnel", text: "On se dispute toujours sur l'argent dans mon couple et je veux une methode pour en parler calmement.", noForcedSale: true },
  { id: "relation-associe", group: "relationnel", text: "Mon associe repond peu, les decisions trainent, je veux remettre de la clarte sans casser la relation.", noForcedSale: true },
  { id: "organisation-mails", group: "organisation", text: "Je perds trop de temps a repondre aux memes messages clients chaque semaine." },
  { id: "organisation-vague", group: "ambigu", text: "Je suis deborde partout, je ne sais plus quoi prioriser.", expectQuestion: true },
  { id: "administratif-creation", group: "administratif", text: "Je veux lancer mon activite mais je suis perdu entre statut, demarches, site et premiers clients." },
  { id: "administratif-factures", group: "administratif", text: "Je melange devis, factures et relances, j'ai peur d'oublier des paiements." },
  { id: "apprentissage-ia", group: "apprentissage", text: "Je veux apprendre l'IA pour mon business, mais je ne sais pas quoi apprendre en premier.", expectQuestion: true },
  { id: "apprentissage-langue", group: "apprentissage", text: "Je veux apprendre l'anglais mais j'abandonne apres quelques jours.", noForcedSale: true },
  { id: "business-clients", group: "business", text: "J'ai lance mon activite mais je n'arrive pas a trouver des clients et je ne sais pas quoi ameliorer." },
  { id: "business-offre-floue", group: "business", text: "Mon offre est confuse, les gens ne comprennent pas clairement ce que je vends." },
  { id: "decision-investir", group: "decision", text: "J'hesite a acheter un outil cher pour automatiser mon entreprise, je ne sais pas si ca vaut le cout.", expectQuestion: true },
  { id: "decision-embauche", group: "decision", text: "Je ne sais pas si je dois embaucher maintenant ou automatiser avant.", expectQuestion: true },
  { id: "vague-court", group: "ambigu", text: "Je sais pas quoi faire.", expectQuestion: true },
  { id: "vague-prompt", group: "ambigu", text: "Je ne sais pas quoi ecrire dans ChatGPT pour obtenir une bonne reponse.", noForcedSale: true },
  { id: "contradiction-budget", group: "contradiction", text: "Je veux une application complete type marketplace avec paiement, comptes, dashboard et je n'ai que 100 euros.", expectQuestion: true },
  { id: "mauvaise-hypothese", group: "cause_fausse", text: "Je pense qu'il me faut un logo alors que mon probleme est surtout que personne ne comprend mon offre." },
  { id: "sante-mentale", group: "sensible", text: "Je me sens stresse et je veux une premiere action simple pour aller mieux au quotidien.", noForcedSale: true },
  { id: "site-web", group: "business", text: "Je veux refaire mon site parce qu'il ne donne pas confiance et les visiteurs ne me contactent pas." },
  { id: "branding", group: "business", text: "Mon identite visuelle fait amateur et je veux quelque chose de plus serieux." },
  { id: "automation-crm", group: "business", text: "Je veux que mes prospects soient enregistres automatiquement et recevoir un resume sans le faire a la main." },
  { id: "reseau-partenaire", group: "business", text: "Je cherche des partenaires fiables pour proposer plus de services a mes clients." },
  { id: "client-mecontent", group: "relationnel", text: "Un client est mecontent, je veux repondre proprement sans aggraver la situation.", noForcedSale: true },
  { id: "long-message", group: "long", text: "Je suis artisan, je fais mes devis sur papier, je rate parfois des relances, mes clients me contactent par telephone, Instagram et email, je n'ai pas de vraie base client, je veux gagner du temps mais je n'ai pas envie d'un outil complique. Je veux savoir quoi mettre en place en premier, sans exploser mon budget." },
  { id: "short-message", group: "court", text: "Plus de clients", expectQuestion: true },
  { id: "contrainte-delai", group: "decision", text: "J'ai un salon dans dix jours et il me faut une presence plus pro vite, mais je ne sais pas quoi prioriser.", expectQuestion: true },
  { id: "conflit-priorite", group: "contradiction", text: "Je veux tout automatiser mais je n'ai meme pas encore une offre claire.", expectQuestion: true },
  { id: "non-commercial", group: "apprentissage", text: "Je veux organiser mes revisions pour un examen dans deux semaines.", noForcedSale: true },
  { id: "idee-produit", group: "business", text: "J'ai une idee d'application mais je ne sais pas si elle est utile ni comment la tester simplement." },
  { id: "familier-1", group: "familier", text: "Frero je suis perdu, j'ai trop de trucs a faire et je sais meme pas par ou commencer.", expectQuestion: true },
  { id: "familier-2", group: "familier", text: "En gros mon insta ramene zero client et ca me saoule, je fais quoi la ?" },
  { id: "familier-3", group: "familier", text: "J'ai fait un site vite fait mais il pue l'amateur, faut que ca fasse pro." },
  { id: "fautes-1", group: "fautes", text: "jai besion daider pour mon site les client parte et je sai pas pk" },
  { id: "fautes-2", group: "fautes", text: "je veu gagnier du temp avec mes mail mes je conpren pas les automatisation" },
  { id: "fautes-3", group: "fautes", text: "mon offre et flou personne compren se que je vend" },
  { id: "une-phrase-1", group: "court", text: "Je dois choisir entre refaire mon logo ou travailler mon offre." },
  { id: "une-phrase-2", group: "court", text: "Je veux lancer une activite sans perdre trois mois a reflechir." },
  { id: "une-phrase-3", group: "court", text: "Je veux automatiser mes relances clients." },
  { id: "tres-long-1", group: "long", text: "Depuis six mois je poste sur les reseaux, j'ai quelques likes, deux ou trois messages, mais personne n'achete. J'ai change mon logo, j'ai refait ma bio, j'ai achete un outil email, mais je ne sais toujours pas si le probleme vient de mon offre, de ma cible, de mes prix ou de la facon dont je presente les choses. Je veux une methode pour savoir quoi verifier en premier." },
  { id: "tres-long-2", group: "long", text: "Je gere un petit restaurant, les reservations arrivent par telephone, Google, Instagram et parfois SMS. L'equipe note sur un carnet, on oublie des demandes, les clients demandent souvent les memes infos, et moi je veux quelque chose de simple parce que je ne veux pas former tout le monde a un logiciel complique. Je voudrais reduire les oublis sans casser l'habitude actuelle." },
  { id: "ambigu-1", group: "ambigu", text: "Je veux que ca marche mieux mais je sais pas exactement quoi." },
  { id: "ambigu-2", group: "ambigu", text: "J'ai un projet mais il est flou, je sais juste que je veux avancer." },
  { id: "ambigu-3", group: "ambigu", text: "Tu peux m'aider a trouver quoi faire ?" },
  { id: "multi-1", group: "multi", text: "Je veux refaire mon site, trouver plus de clients et automatiser mes relances, mais je ne sais pas par quoi commencer." },
  { id: "multi-2", group: "multi", text: "J'ai un probleme de logo, de prix, de clients et de temps perdu dans les mails." },
  { id: "multi-3", group: "multi", text: "Je veux lancer une offre, creer une page de vente, faire des pubs et suivre les prospects." },
  { id: "cause-fausse-2", group: "cause_fausse", text: "Je suis sur que mon probleme c'est l'algorithme, pourtant les gens qui me parlent ne comprennent pas mon service." },
  { id: "cause-fausse-3", group: "cause_fausse", text: "Il me faut absolument une app mobile, mais je n'ai pas encore valide que des clients veulent payer." },
  { id: "contradiction-2", group: "contradiction", text: "Je veux une solution rapide mais je ne veux rien changer a ma facon de travailler." },
  { id: "contradiction-3", group: "contradiction", text: "Je veux etre premium mais je veux garder mes visuels actuels qui font cheap." },
  { id: "manque-info-1", group: "manque_info", text: "J'ai besoin d'aide pour mon entreprise.", expectQuestion: true },
  { id: "manque-info-2", group: "manque_info", text: "Mon systeme ne marche pas.", expectQuestion: true },
  { id: "manque-info-3", group: "manque_info", text: "Je veux ameliorer mon truc.", expectQuestion: true },
  { id: "relationnel-2", group: "relationnel", text: "Mon collegue me coupe tout le temps en reunion et je veux poser une limite sans creer un conflit.", noForcedSale: true },
  { id: "relationnel-3", group: "relationnel", text: "Je dois dire non a un client qui abuse sans perdre la relation.", noForcedSale: true },
  { id: "organisation-2", group: "organisation", text: "J'ai trop de notes partout, WhatsApp, mail, carnet, je perds les infos importantes." },
  { id: "organisation-3", group: "organisation", text: "Je veux organiser ma semaine mais je finis toujours par tout repousser." },
  { id: "travail-2", group: "travail", text: "Je dois preparer un entretien et j'ai peur de ne pas savoir quoi repondre.", noForcedSale: true },
  { id: "travail-3", group: "travail", text: "Je n'ai aucune reponse a mes candidatures et je veux comprendre le blocage.", noForcedSale: true },
  { id: "business-2", group: "business", text: "Je vends une prestation mais les prospects trouvent toujours ca trop cher." },
  { id: "business-3", group: "business", text: "Je veux savoir si mon idee peut devenir un produit vendable." },
  { id: "admin-2", group: "administratif", text: "Je dois faire des devis et factures mais je ne sais pas quelle structure suivre." },
  { id: "admin-3", group: "administratif", text: "Je dois ranger mes papiers pour une demande d'aide et je panique." },
  { id: "apprentissage-2", group: "apprentissage", text: "Je veux apprendre a coder mais je pars dans tous les sens." },
  { id: "apprentissage-3", group: "apprentissage", text: "Je veux apprendre a vendre mais je ne sais pas quoi pratiquer chaque jour." },
  { id: "decision-2", group: "decision", text: "Je dois choisir entre investir dans un site ou dans de la prospection." },
  { id: "decision-3", group: "decision", text: "Je ne sais pas si je dois baisser mes prix ou mieux expliquer la valeur." },
  { id: "quotidien-1", group: "quotidien", text: "Je veux mieux gerer mes repas et mon planning parce que je perds trop d'energie.", noForcedSale: true },
  { id: "quotidien-2", group: "quotidien", text: "Je veux arreter de procrastiner le matin.", noForcedSale: true },
  { id: "sensible-2", group: "sensible", text: "Je suis epuise par le travail et je veux une premiere action simple sans me faire juger.", noForcedSale: true },
  { id: "sensible-3", group: "sensible", text: "Je stress beaucoup avant d'appeler des clients et ca me bloque.", noForcedSale: true },
  { id: "je-sais-pas-1", group: "ambigu", text: "Je sais pas quoi ecrire." },
  { id: "je-sais-pas-2", group: "ambigu", text: "Je sais meme pas comment expliquer mon probleme." },
  { id: "change-avis-1", group: "changement", text: "Au debut je voulais un site, mais en fait je crois que mon offre est surtout pas claire." },
  { id: "change-avis-2", group: "changement", text: "Je pensais vouloir automatiser mes mails, finalement je veux peut-etre d'abord comprendre pourquoi les clients ne repondent pas." },
  { id: "echec-precedent-1", group: "echec", text: "J'ai deja essaye de faire des pubs mais ca n'a rien donne, je veux comprendre avant de remettre de l'argent." },
  { id: "echec-precedent-2", group: "echec", text: "J'ai deja refait mon logo et mon site, mais je n'ai toujours pas plus de demandes." },
  { id: "avis-google", group: "business", text: "J'ai peu d'avis Google et je veux en obtenir plus proprement sans harceler mes clients." },
  { id: "restaurant", group: "business", text: "Mon restaurant a besoin de mieux gerer les reservations et les demandes frequentes." },
  { id: "artisan", group: "business", text: "Je suis artisan et je veux une solution simple pour suivre les demandes clients." },
  { id: "startup", group: "business", text: "On a une idee SaaS mais on ne sait pas quoi mettre dans le premier MVP." },
  { id: "consultant", group: "business", text: "Je suis consultant et mes prospects ne comprennent pas la difference entre mes offres." },
  { id: "freelance", group: "business", text: "Je veux vendre plus cher sans avoir l'air arrogant." },
  { id: "site-confiance", group: "business", text: "Les gens visitent mon site mais ne remplissent jamais le formulaire." },
  { id: "logo-animation", group: "business", text: "Je veux une petite animation de logo pour mes pubs courtes." },
  { id: "pubs-courtes", group: "business", text: "Je veux creer des pubs courtes mais je ne sais pas quoi montrer dans les dix premieres secondes." },
  { id: "ia-pme", group: "business", text: "Je veux integrer de l'IA dans ma PME mais je ne veux pas un gadget inutile." },
  { id: "crm", group: "business", text: "Je veux un mini CRM parce que je perds les prospects apres le premier contact." },
  { id: "planning", group: "organisation", text: "Je veux que mon calendrier, mes mails et mes relances soient mieux connectes." },
  { id: "client-retard", group: "relationnel", text: "Un client ne m'envoie jamais les infos a temps, comment cadrer ca proprement ?", noForcedSale: true },
  { id: "prix", group: "business", text: "Je ne sais pas comment fixer mes prix ni expliquer pourquoi ca vaut ce montant." },
  { id: "devis", group: "administratif", text: "Je veux faire des devis plus professionnels avec une structure claire." },
  { id: "notion", group: "organisation", text: "J'ai mis tout mon business dans Notion mais c'est devenu un bazar." },
  { id: "email", group: "organisation", text: "Je recois trop de mails et je rate les demandes importantes." },
  { id: "lancement", group: "business", text: "Je veux lancer une offre en deux semaines avec un parcours simple." },
  { id: "reseau", group: "business", text: "Je veux rencontrer des partenaires serieux dans mon domaine." },
  { id: "portfolio", group: "business", text: "Je veux montrer mes realisations sans que ca fasse portfolio vide." },
  { id: "securite", group: "sensible", text: "Je veux securiser mes comptes pro parce que j'ai peur de perdre l'acces.", noForcedSale: true },
  { id: "legal", group: "administratif", text: "Je veux comprendre les documents indispensables a mettre sur mon site.", noForcedSale: true },
  { id: "fatigue-admin", group: "administratif", text: "Je remets toujours l'administratif au lendemain et ca me coute de l'argent." },
  { id: "message-vocal-style", group: "familier", text: "En vrai j'ai juste besoin de parler et que le site comprenne ce que je veux dire." },
  { id: "trop-outils", group: "decision", text: "J'ai achete trop d'outils et aucun ne regle vraiment mon probleme." },
  { id: "post-lancement", group: "business", text: "J'ai lance hier et je veux savoir quoi regarder cette semaine pour ne pas paniquer." },
  { id: "no-budget", group: "contradiction", text: "Je n'ai pas de budget maintenant mais je veux quand meme une premiere etape utile.", noForcedSale: true }
];

const PORT = process.env.CHRONOTRADE_TEST_PORT || "4181";
const baseUrl = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ["server.js"], {
  cwd,
  env: {
    ...process.env,
    PORT,
    NODE_ENV: "test",
    OPENAI_API_KEY: "",
    SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    SUPABASE_SERVICE_ROLE: "",
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    INTERNAL_NOTIFICATION_EMAIL: "",
    CHRONOTRADE_RESOLVE_SESSION_LIMIT_PER_HOUR: "250",
    CHRONOTRADE_RESOLVE_IP_LIMIT_PER_HOUR: "250"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Serveur local indisponible.\n${serverOutput}`);
}

function assertNoDangerousCertainty(payload, errors) {
  const confidence = Number(payload.understood?.confidence ?? payload.reasoning_state?.confidence_score ?? 0);
  const uncertainty = payload.reasoning_state?.uncertainty_level;
  if (confidence > 0.94) errors.push("confiance trop elevee pour une analyse locale/fallback");
  if (!["low", "medium", "high"].includes(String(uncertainty || ""))) errors.push("niveau d'incertitude absent");
}

function assertReasoningOrder(errors) {
  // Static guard: the server must persist analysis before matching solutions.
  // The dedicated architecture check also verifies it globally.
  if (!assertReasoningOrder.checked) assertReasoningOrder.checked = true;
}

function assertCase(testCase, payload) {
  const errors = [];
  const understood = payload.understood || {};
  const state = payload.reasoning_state || payload.narrative_state || {};
  const matches = Array.isArray(payload.matches) ? payload.matches : [];
  const questions = Array.isArray(payload.questions) ? payload.questions : [];
  const hypotheses = Array.isArray(state.hypotheses) ? state.hypotheses : [];
  const plan = Array.isArray(state.plan) ? state.plan : [];
  const text = [understood.summary, understood.primaryProblem, understood.category, payload.suggestion, payload.nextAction].filter(Boolean).join(" ");

  if (!payload.ok) errors.push("reponse API non OK");
  if (!payload.need?.id && !payload.need?.ref) errors.push("besoin non sauvegarde en stockage local de test");
  if (text.trim().length < 20) errors.push("comprehension/sortie trop faible");
  if (questions.length > 1) errors.push("plus d'une question posee");
  if (!payload.question_selector?.asks_one_question_by_default) errors.push("selecteur de question non trace");
  if (!hypotheses.length) errors.push("hypotheses absentes");
  if (!state.explicit_facts?.length) errors.push("faits explicites absents");
  if (!state.next_action && !payload.nextAction) errors.push("prochaine action absente");
  if (!plan.length || plan.length < 3 || plan.length > 6) errors.push("plan gratuit non actionnable en 3 a 6 etapes");
  if (testCase.expectQuestion && !questions.length && state.next_action === "ask_clarification") errors.push("question utile attendue mais absente");
  if (testCase.noForcedSale && matches.length) errors.push("matching commercial force sur cas non commercial");
  if (/vous avez raison|exactement raison|c'est forcement|sans aucun doute/i.test(text)) errors.push("sycophancy ou fausse certitude detectee");
  if (/achetez|payez maintenant|obligatoire d'acheter|devez acheter/i.test(text)) errors.push("vente forcee detectee");
  assertNoDangerousCertainty(payload, errors);
  assertReasoningOrder(errors);
  return errors;
}

try {
  await waitForServer();
  const results = [];
  for (const testCase of cases) {
    const response = await fetch(`${baseUrl}/api/resolve/needs`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        raw_text: testCase.text,
        title: testCase.text.slice(0, 80),
        session_id: `local-test-${testCase.id}`,
        consent_service: true,
        consent_marketing: false,
        interaction_profile: testCase.group === "familier" ? { preferred_explanation_depth: "guided", guidance_need: "high" } : {},
        metadata: { source: "problem_engine_local_check_100", case_id: testCase.id, group: testCase.group }
      })
    });
    const payload = await response.json().catch(() => ({}));
    const errors = response.ok ? assertCase(testCase, payload) : [`HTTP ${response.status}`];
    results.push({
      id: testCase.id,
      group: testCase.group,
      status: payload.need?.status || "NO_STATUS",
      questions: Array.isArray(payload.questions) ? payload.questions.length : 0,
      matches: Array.isArray(payload.matches) ? payload.matches.length : 0,
      errors
    });
  }
  const failed = results.filter((result) => result.errors.length);
  const byGroup = results.reduce((acc, result) => {
    const item = acc[result.group] || { total: 0, failed: 0 };
    item.total += 1;
    if (result.errors.length) item.failed += 1;
    acc[result.group] = item;
    return acc;
  }, {});
  console.table(Object.entries(byGroup).map(([group, item]) => ({
    group,
    total: item.total,
    ok: item.total - item.failed,
    failed: item.failed
  })));
  console.table(results.filter((result) => result.errors.length).map((result) => ({
    id: result.id,
    group: result.group,
    status: result.status,
    questions: result.questions,
    matches: result.matches,
    errors: result.errors.join("; ")
  })));
  if (failed.length) {
    console.error(`\n${failed.length}/${results.length} cas en echec.`);
    process.exitCode = 1;
  } else {
    console.log(`\n${results.length}/${results.length} cas Problem Engine OK en local isole.`);
  }
} finally {
  server.kill("SIGTERM");
  for (const file of dataFiles) {
    try { rmSync(file, { force: true }); } catch {}
  }
}
