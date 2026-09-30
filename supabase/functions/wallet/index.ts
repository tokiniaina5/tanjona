// Portefeuille en ariary : solde, conversion internationale, retraits.
//
// Tout ce qui touche à de l'argent passe par ici, jamais par le navigateur.
// Une page peut être modifiée par celui qui la regarde ; un solde qu'elle
// calculerait elle-même serait un solde qu'elle pourrait s'inventer.
//
// Le solde n'est pas stocké : il se déduit de ce qui est déjà en base —
// parrainages gagnés, moins les retraits (demandés ou envoyés), moins les
// déblocages payés avec le portefeuille. Rien à tenir à jour, rien à
// désynchroniser, et aucun chiffre à falsifier.
//
// Déploiement : voir LISEZ-MOI-SUPABASE.txt, section "Portefeuille".
// À déployer AVEC vérification du jeton (pas de --no-verify-jwt) : c'est ce
// qui garantit que la personne qui retire est bien celle qu'elle prétend.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Ce que rapporte un parrainage. Une seule définition, côté serveur : si
// elle vivait dans la page, chacun pourrait décider de sa propre valeur.
//
// Deux tarifs. Le propriétaire invite pour faire venir des clients à
// l'application entière, pas pour se faire un pécule : ses invitations
// valent davantage. Celles d'un client valent le tarif ordinaire.
//
// Ce chiffre-là ne sert QU'À CE QUE LES INVITATIONS RAPPORTENT. Il ne doit
// jamais servir à chiffrer une dépense — voir « spent » plus bas, qui garde
// exprès le tarif de base.
const AR_PER_REFERRAL = Number(Deno.env.get("AR_PER_REFERRAL") ?? "1000");
const AR_PER_REFERRAL_OWNER = Number(Deno.env.get("AR_PER_REFERRAL_OWNER") ?? "5000");

function tarifParrainage(email: string): number {
  const proprio = (Deno.env.get("OWNER_EMAIL") ?? "").trim().toLowerCase();
  return proprio && email === proprio ? AR_PER_REFERRAL_OWNER : AR_PER_REFERRAL;
}
const MIN_PAYOUT_AR = Number(Deno.env.get("MIN_PAYOUT_AR") ?? "10000");
// Frais de retrait, en pourcentage, ajoutés à la somme demandée : la personne
// reçoit ce qu'elle a demandé, et son solde baisse de la somme + les frais.
const PAYOUT_FEE_PCT = Number(Deno.env.get("PAYOUT_FEE_PCT") ?? "5");
function fraisRetrait(montant: number): number {
  return PAYOUT_FEE_PCT > 0 ? Math.ceil(montant * PAYOUT_FEE_PCT / 100) : 0;
}

// L'argent sort vers un vrai compte, et seulement vers ceux-là :
//   wise, payoneer, skrill   portefeuilles internationaux, envoyés par le
//             propriétaire depuis son propre compte sur ces services ;
//   mobile    MVola / Orange Money / Airtel Money, en ariary ;
//   card      virement vers un compte bancaire.
// PayPal est retiré (26/09/2026 : il ne fonctionnait pas), comme les
// anciennes sorties « cash », « wallet », « merchant » : leurs lignes
// passées gardent leur nom à l'affichage, rien de neuf ne s'y ouvre.
// Depuis le 26/09/2026 au soir, seul le Mobile Money reste ouvert : c'est
// là que partent les dépôts et les parrainages (Papi n'envoie pas d'argent,
// le propriétaire exécute). Wise, Payoneer, Skrill et banque sont fermés.
const METHODS = new Set(["mobile"]);
// Les portefeuilles internationaux ne connaissent pas l'ariary.
const METHODES_EN_DEVISE = new Set(["wise", "payoneer", "skrill"]);
const PURCHASE_METHODS = new Set<string>();

// Frais de dépôt, retirés de ce qui est crédité — le même taux que Papi.
const DEPOSIT_FEE_PCT = Number(Deno.env.get("DEPOSIT_FEE_PCT") ?? "5");
function fraisDepot(brut: number): number {
  return DEPOSIT_FEE_PCT > 0 ? Math.ceil(brut * DEPOSIT_FEE_PCT / 100) : 0;
}

// Ce qui s'achète à l'intérieur de l'application, et à quel prix. Les prix
// vivent ici et nulle part ailleurs : dans la page, chacun pourrait décider
// de payer son abonnement un ariary.
const SITE_ITEMS: Record<string, { label: string; priceAr: number; days?: number; grant?: string }> = {
  sub_month: { label: "Abonnement mensuel", priceAr: 15000, days: 30 },
  sub_year: { label: "Abonnement annuel", priceAr: 150000, days: 365 },
  trial_day: { label: "Un jour d'essai en plus", priceAr: 10000, grant: "trial_day" },
  booster: { label: "Booster — direct Facebook 24 h", priceAr: 5000, grant: "booster" },
  sub_days: { label: "7 jours mis de côté pour l'abonnement", priceAr: 20000, grant: "sub_days" },
  // Le déblocage payé par carte Visa (via Papi) : même prix que les 20 crédits.
  unlock: { label: "Déblocage du compte", priceAr: 20000, grant: "unlock" },
};

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

// Combien d'unités de la devise demandée vaut 1 ariary.
async function rateFromAr(currency: string): Promise<number> {
  if (!currency || currency === "MGA") return 1;
  const fixed = Number(Deno.env.get(`RATE_${currency}_MGA`) ?? "0");
  if (fixed > 0) return 1 / fixed;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/MGA");
    if (!res.ok) return 0;
    const data = await res.json();
    const rate = Number(data?.rates?.[currency] ?? 0);
    return rate > 0 ? rate : 0;
  } catch {
    return 0;
  }
}

type Admin = ReturnType<typeof createClient>;

// Ce que les parrainages ont rapporté, sur toutes les installations
// rattachées à ce compte.
async function gainsParrainage(admin: Admin, email: string, installs?: string[]): Promise<number> {
  let ids = installs;
  if (!ids) {
    const { data: owners } = await admin.from("wallet_owners").select("install_id").eq("email", email);
    ids = (owners ?? []).map((o: { install_id: string }) => o.install_id);
  }
  if (!ids.length) return 0;
  const { count } = await admin.from("referrals")
    .select("id", { count: "exact", head: true })
    .in("inviter_id", ids);
  return (count ?? 0) * tarifParrainage(email);
}

// ---- Les achats du fil (supabase-wallet-achats.sql) ----
// Comme acheteur : ce qui est tenu (« tazonina ») ou déjà passé au vendeur
// (« voaray ») a quitté le solde ; ce qui a été rendu (« naverina ») y revient.
// Comme vendeur : seul ce que l'acheteur a reçu (« voaray ») entre, et c'est
// de l'argent vraiment payé — il se retire comme un dépôt.
async function achatsFor(admin: Admin, email: string): Promise<{ depense: number; recu: number }> {
  const { data: achats } = await admin.from("wallet_achats")
    .select("amount_ar,status").eq("buyer_email", email).in("status", ["tazonina", "voaray"]);
  const depense = (achats ?? []).reduce(
    (sum: number, a: { amount_ar: number }) => sum + (Number(a.amount_ar) || 0), 0);
  const { data: ventes } = await admin.from("wallet_achats")
    .select("amount_ar").eq("seller_email", email).eq("status", "voaray");
  const recu = (ventes ?? []).reduce(
    (sum: number, a: { amount_ar: number }) => sum + (Number(a.amount_ar) || 0), 0);
  return { depense, recu };
}

// ---- Le solde, déduit de la base ----
async function balanceFor(admin: Admin, email: string): Promise<number> {
  // 1) ce que les parrainages ont rapporté, sur toutes les installations
  //    rattachées à ce compte
  const { data: owners } = await admin.from("wallet_owners")
    .select("install_id").eq("email", email);
  const installs = (owners ?? []).map((o: { install_id: string }) => o.install_id);

  const earned = await gainsParrainage(admin, email, installs);

  // 2) ce qui est parti ou est réservé pour partir
  const { data: payouts } = await admin.from("wallet_payouts")
    .select("amount_ar,fee_ar,status").eq("email", email).in("status", ["pending", "sent"]);
  const withdrawn = (payouts ?? []).reduce(
    (sum: number, p: { amount_ar: number; fee_ar: number }) =>
      sum + (Number(p.amount_ar) || 0) + (Number(p.fee_ar) || 0), 0);

  // 3) ce qui a servi à rouvrir un accès. « amount » y est compté en
  //    crédits, et un crédit vaut AR_PER_REFERRAL — le tarif de BASE, pas
  //    celui de celui qui regarde. Un déblocage coûte vingt mille ariary à
  //    tout le monde ; le passer au tarif du propriétaire le ferait coûter
  //    cent mille au seul qui n'en paie jamais.
  const { data: unlocks } = await admin.from("unlock_requests")
    .select("amount").eq("email", email).eq("payment_method", "wallet");
  const spent = (unlocks ?? []).reduce(
    (sum: number, u: { amount: number }) => sum + (Number(u.amount) || 0) * AR_PER_REFERRAL, 0);

  // 4) ce qui est entré du dehors. Les versements confirmés seulement :
  //    un versement annoncé et pas encore vérifié ne vaut rien, sans quoi
  //    l'annonce suffirait à dépenser.
  const { data: depots } = await admin.from("wallet_deposits")
    .select("amount_ar").eq("email", email).eq("status", "confirme");
  const deposited = (depots ?? []).reduce(
    (sum: number, d: { amount_ar: number }) => sum + (Number(d.amount_ar) || 0), 0);

  // 5) les achats du fil : payés comme acheteur, reçus comme vendeur.
  const achats = await achatsFor(admin, email);

  return Math.max(0, earned + deposited + achats.recu - withdrawn - spent - achats.depense);
}

// ---- Ce qui peut sortir en vrai argent ----
// Le solde mêle deux choses. Les sommes que l'application inscrit d'elle-même
// (« fokontany », « visiteur », « essai ») ne sont que des chiffres :
// personne n'a rien payé, et il n'y a rien derrière. Elles se dépensent DANS
// l'application (abonnement, déblocage…), jamais au dehors.
//
// Peut sortir : ce qui est vraiment entré (versements payés chez Papi ou reçus
// en Mobile Money / PayPal) et les parrainages — ceux-là, le propriétaire a
// décidé (26/09/2026) de les payer en vrai argent, de sa poche. Moins ce qui
// est déjà sorti vers le dehors, et jamais plus que le solde lui-même.
const PROVIDERS_REELS = ["papi", "mvola", "orange", "airtel", "paypal"];

async function retirableFor(admin: Admin, email: string, balance: number): Promise<number> {
  const { data: depots } = await admin.from("wallet_deposits")
    .select("amount_ar").eq("email", email).eq("status", "confirme").in("provider", PROVIDERS_REELS);
  const entre = (depots ?? []).reduce(
    (sum: number, d: { amount_ar: number }) => sum + (Number(d.amount_ar) || 0), 0) +
    await gainsParrainage(admin, email);
  // Les achats dans l'application (« insite ») ne sortent rien au dehors.
  const { data: sorties } = await admin.from("wallet_payouts")
    .select("amount_ar,fee_ar,kind").eq("email", email).in("status", ["pending", "sent"]);
  const sorti = (sorties ?? [])
    .filter((p: { kind: string }) => p.kind !== "insite")
    .reduce((sum: number, p: { amount_ar: number; fee_ar: number }) =>
      sum + (Number(p.amount_ar) || 0) + (Number(p.fee_ar) || 0), 0);
  // Les ventes reçues sont de l'argent payé ; les achats en sont sortis.
  const achats = await achatsFor(admin, email);
  return Math.max(0, Math.min(balance, entre + achats.recu - sorti - achats.depense));
}

// ---- L'argent vraiment payé qui reste, pour l'abonnement ----
// Depuis le 26/09/2026, l'abonnement ne se paie plus avec les parrainages :
// seulement avec de l'argent vraiment entré (dépôts Papi confirmés).
//
//   dépôts réels
//   − abonnements déjà payés AVEC cet argent (method « papi » ; les achats
//     d'avant, réglés avec n'importe quel solde, ne comptent pas contre lui)
//   − les retraits, pour la part que les parrainages n'ont pas couverte
//     (un retrait puise d'abord dans les parrainages, qui ne servent qu'à ça)
// Jamais plus que le solde lui-même.
async function argentPapiFor(admin: Admin, email: string, balance: number): Promise<number> {
  const { data: depots } = await admin.from("wallet_deposits")
    .select("amount_ar").eq("email", email).eq("status", "confirme").in("provider", PROVIDERS_REELS);
  const entre = (depots ?? []).reduce(
    (sum: number, d: { amount_ar: number }) => sum + (Number(d.amount_ar) || 0), 0);

  const { data: sorties } = await admin.from("wallet_payouts")
    .select("amount_ar,fee_ar,kind,method").eq("email", email).in("status", ["pending", "sent"]);
  let abonnements = 0;
  let retraits = 0;
  for (const p of (sorties ?? []) as Array<{ amount_ar: number; fee_ar: number; kind: string; method: string }>) {
    const somme = (Number(p.amount_ar) || 0) + (Number(p.fee_ar) || 0);
    if (p.kind === "insite") {
      if (p.method === "papi") abonnements += somme;
    } else {
      retraits += somme;
    }
  }
  // Les ventes reçues entrent comme de l'argent payé ; les achats sortent
  // comme un retrait (d'abord sur les parrainages, comme lui).
  const achats = await achatsFor(admin, email);
  retraits += achats.depense;
  const parrainage = await gainsParrainage(admin, email);
  const reste = entre + achats.recu - abonnements - Math.max(0, retraits - parrainage);
  return Math.max(0, Math.min(balance, reste));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode refusée" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const ownerEmail = norm(Deno.env.get("OWNER_EMAIL"));
  if (!supabaseUrl || !serviceKey) return json({ error: "configuration incomplète" }, 500);

  // Qui appelle ? C'est le jeton qui le dit, pas le corps de la requête :
  // sinon n'importe qui retirerait au nom de n'importe qui.
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return json({ error: "non authentifié" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  const email = norm(caller?.user?.email);
  if (callerError || !email) return json({ error: "session invalide" }, 401);
  const isOwner = !!ownerEmail && email === ownerEmail;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "corps de requête illisible" }, 400);
  }
  const action = String(body.action ?? "");

  // ---- Rattacher cette installation au compte, puis rendre l'état ----
  if (action === "state") {
    const installId = String(body.installId ?? "").trim();
    if (installId) {
      // Le premier qui rattache garde : on n'écrase jamais un rattachement
      // existant, sinon il suffirait de connaître l'identifiant d'un
      // appareil pour s'en approprier les gains.
      const { data: existing } = await admin.from("wallet_owners")
        .select("email").eq("install_id", installId).maybeSingle();
      if (!existing) {
        await admin.from("wallet_owners").insert({ install_id: installId, email: email });
      }
    }

    const balance = await balanceFor(admin, email);
    const { data: mine } = await admin.from("wallet_payouts")
      .select("id,amount_ar,fee_ar,method,kind,destination,link,instructions,currency,amount_out,status,note,created_at,settled_at,auto_provider,auto_ref")
      .eq("email", email).order("created_at", { ascending: false }).limit(20);

    let queue = null;
    if (isOwner) {
      const { data: pending } = await admin.from("wallet_payouts")
        .select("id,email,name,amount_ar,method,kind,destination,link,instructions,currency,amount_out,rate,status,created_at")
        .eq("status", "pending").order("created_at", { ascending: true }).limit(50);
      queue = pending ?? [];
    }

    // Ce qui est entré, avec son état : un versement en attente doit se voir,
    // sinon la personne qui vient de payer croit que rien n'est arrivé.
    const { data: depots } = await admin.from("wallet_deposits")
      .select("id,amount_ar,provider,provider_ref,status,note,created_at,confirmed_at")
      .eq("email", email).order("created_at", { ascending: false }).limit(20);

    // Les achats du fil, comme acheteur et comme vendeur. Le propriétaire
    // voit aussi ceux qui attendent, pour trancher s'il le faut.
    const { data: achats } = await admin.from("wallet_achats")
      .select("id,buyer_email,buyer_name,seller_email,seller_name,news_id,titre,isa,prix_ar,amount_ar,status,note,created_at,settled_at")
      .or(`buyer_email.eq.${email},seller_email.eq.${email}`)
      .order("created_at", { ascending: false }).limit(30);
    let achatsEnAttente = null;
    if (isOwner) {
      const { data: attente } = await admin.from("wallet_achats")
        .select("id,buyer_email,buyer_name,seller_email,seller_name,news_id,titre,isa,prix_ar,amount_ar,status,created_at")
        .eq("status", "tazonina").order("created_at", { ascending: true }).limit(50);
      achatsEnAttente = attente ?? [];
    }

    const retirable = await retirableFor(admin, email, balance);
    return json({
      balanceAr: balance, retirableAr: retirable, papiAr: await argentPapiFor(admin, email, balance), arPerReferral: tarifParrainage(email), minPayoutAr: MIN_PAYOUT_AR, payoutFeePct: PAYOUT_FEE_PCT,
      depositFeePct: DEPOSIT_FEE_PCT,
      // Ce qui marche vraiment sur ce serveur, pour que la page ne propose
      // pas un canal dont les clefs manquent.
      canaux: { depotPapi: !!Deno.env.get("PAPI_TOKEN") },
      payouts: mine ?? [], deposits: depots ?? [], queue, isOwner, items: SITE_ITEMS,
      achats: achats ?? [], achatsEnAttente, email,
    });
  }

  // ---- Acheter un entana du fil, l'argent tenu ----
  // Le prix vient de la base, jamais de la page : la page ne dit que QUOI
  // (le billet) et COMBIEN (la quantité). L'argent doit être de l'argent
  // vraiment payé — le même que celui qui se retire. Il quitte l'acheteur
  // tout de suite, mais n'arrive chez le vendeur que quand l'acheteur a reçu
  // l'entana (« achat_voaray ») ; rendu sinon (« achat_averina »).
  if (action === "achat") {
    const newsId = Number(body.newsId);
    const isa = Math.floor(Number(body.isa ?? 1));
    if (!Number.isFinite(newsId) || newsId <= 0) return json({ error: "entana tsy fantatra" }, 400);
    if (!(isa >= 1 && isa <= 99)) return json({ error: "isa tsy mety (1 hatramin'ny 99)" }, 400);

    const { data: billet, error: errBillet } = await admin.from("client_news")
      .select("id,type,price,message,author_email,client_name,deleted_at").eq("id", newsId).maybeSingle();
    if (errBillet) return json({ error: errBillet.message }, 500);
    if (!billet || billet.deleted_at) return json({ error: "Tsy hita intsony io entana io." }, 404);
    if (billet.type !== "entana") return json({ error: "Tsy entana amidy io publication io." }, 400);
    const prix = Math.floor(Number(String(billet.price ?? "").replace(/[^\d.]/g, "")) || 0);
    if (!(prix > 0)) return json({ error: "Tsy misy vidiny io entana io : resaho mivantana ny mpivarotra." }, 400);

    // Le vendeur : l'auteur du billet ; les billets de la maison, sans
    // adresse, sont au propriétaire.
    const vendeur = norm(billet.author_email) || ownerEmail;
    if (!vendeur) return json({ error: "Tsy fantatra ny mpivarotra." }, 400);
    if (vendeur === email) return json({ error: "Tsy afaka mividy ny entanao ianao." }, 400);

    const montant = prix * isa;
    const balance = await balanceFor(admin, email);
    const reel = await retirableFor(admin, email, balance);
    if (montant > reel) {
      return json({
        error: `Tsy ampy ny vola ao amin'ny portefeuille : ${reel.toLocaleString("fr-FR")} Ar ` +
          `(vola tena naloa sy parrainage), ilaina ${montant.toLocaleString("fr-FR")} Ar. ` +
          `Ampidiro vola amin'ny Papi na Mobile Money aloha.`,
        disponibleAr: reel, manque: montant - reel,
      }, 400);
    }

    const titre = String(billet.message ?? "").split("\n")[0].trim().slice(0, 80) || "Entana";
    const { data, error } = await admin.from("wallet_achats").insert({
      buyer_email: email, buyer_name: String(body.name ?? "").trim().slice(0, 80) || null,
      seller_email: vendeur, seller_name: String(billet.client_name ?? "").trim().slice(0, 80) || null,
      news_id: newsId, titre, isa, prix_ar: prix, amount_ar: montant, status: "tazonina",
    }).select("id,titre,isa,prix_ar,amount_ar,status,created_at").single();
    if (error) return json({ error: error.message }, 500);

    return json({ achat: data, balanceAr: balance - montant });
  }

  // ---- L'acheteur a reçu l'entana : l'argent passe au vendeur ----
  if (action === "achat_voaray") {
    const id = String(body.id ?? "").trim();
    if (!id) return json({ error: "fividianana tsy fantatra" }, 400);
    // Seul l'acheteur le dit, et une seule fois : le filtre sur
    // « tazonina » rend un second clic sans effet.
    const { data, error } = await admin.from("wallet_achats")
      .update({ status: "voaray", settled_at: new Date().toISOString() })
      .eq("id", id).eq("buyer_email", email).eq("status", "tazonina")
      .select("id,status,amount_ar").maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: "Efa voavaha na tsy anao io fividianana io." }, 409);
    return json({ achat: data });
  }

  // ---- Rendre l'argent à l'acheteur ----
  // Le vendeur (il ne peut pas livrer) ou le propriétaire (litige). Jamais
  // l'acheteur seul : il pourrait reprendre son argent après avoir reçu.
  if (action === "achat_averina") {
    const id = String(body.id ?? "").trim();
    if (!id) return json({ error: "fividianana tsy fantatra" }, 400);
    const { data: ligne } = await admin.from("wallet_achats")
      .select("id,seller_email,status").eq("id", id).maybeSingle();
    if (!ligne) return json({ error: "Tsy hita io fividianana io." }, 404);
    if (norm(ligne.seller_email) !== email && !isOwner) {
      return json({ error: "Ny mpivarotra na ny tompon'ny Ny asako ihany no afaka mamerina ny vola." }, 403);
    }
    const note = String(body.note ?? "").trim().slice(0, 300);
    const { data, error } = await admin.from("wallet_achats")
      .update({ status: "naverina", note: note || (isOwner ? "Naverin'ny tompony" : "Naverin'ny mpivarotra"),
        settled_at: new Date().toISOString() })
      .eq("id", id).eq("status", "tazonina")
      .select("id,status,amount_ar").maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: "Efa voavaha io fividianana io." }, 409);
    return json({ achat: data });
  }

  // ---- Acheter à l'intérieur de l'application ----
  // Rien ne part au dehors : la somme quitte le solde et le droit est acquis
  // sur-le-champ. La demande est enregistrée comme déjà réglée, pour que le
  // solde en tienne compte et que l'achat laisse une trace.
  if (action === "spend") {
    const itemId = String(body.item ?? "");
    const item = SITE_ITEMS[itemId];
    if (!item) return json({ error: "article inconnu" }, 400);

    const balance = await balanceFor(admin, email);
    // Seulement l'argent vraiment payé par Papi : les parrainages ne paient
    // plus l'abonnement (ils se retirent en Mobile Money).
    const papi = await argentPapiFor(admin, email, balance);
    if (item.priceAr > papi) {
      return json({
        error: `Vola avy amin'ny Papi : ${papi.toLocaleString("fr-FR")} Ar, ilaina ` +
          `${item.priceAr.toLocaleString("fr-FR")} Ar. Tsy aloa amin'ny parrainage intsony ny abonnement : ` +
          `mandoava amin'ny Papi.`,
        papiAr: papi, manque: item.priceAr - papi,
      }, 400);
    }

    const { data, error } = await admin.from("wallet_payouts").insert({
      email: email, name: String(body.name ?? "").trim(),
      amount_ar: item.priceAr, method: "papi", kind: "insite",
      destination: item.label, currency: "MGA", amount_out: item.priceAr, rate: 1,
      status: "sent", settled_at: new Date().toISOString(),
    }).select("id").single();

    if (error) return json({ error: error.message }, 500);
    return json({
      bought: itemId, label: item.label, priceAr: item.priceAr, days: item.days ?? 0,
      grant: item.grant ?? null,
      balanceAr: balance - item.priceAr, papiAr: papi - item.priceAr, receipt: data.id,
    });
  }

  // ---- Conversion, pour afficher le solde dans une autre devise ----
  if (action === "rate") {
    const currency = String(body.currency ?? "").toUpperCase();
    const rate = await rateFromAr(currency);
    return json({ currency, rate });
  }

  // ---- Demander un retrait ----
  if (action === "payout") {
    const amount = Math.floor(Number(body.amountAr ?? 0));
    const method = String(body.method ?? "");
    const destination = String(body.destination ?? "").trim();
    const currency = String(body.currency ?? "MGA").toUpperCase();
    const name = String(body.name ?? "").trim();
    const link = String(body.link ?? "").trim().slice(0, 500);
    const instructions = String(body.instructions ?? "").trim().slice(0, 2000);
    const kind = PURCHASE_METHODS.has(method) ? "purchase" : "payout";

    if (!METHODS.has(method)) return json({ error: "moyen de retrait inconnu" }, 400);
    if (!destination) return json({ error: "indiquez où envoyer l'argent" }, 400);
    // Wise, Payoneer et Skrill ne tiennent pas de compte en ariary :
    // une somme annoncée en MGA n'y arriverait jamais telle quelle.
    if (METHODES_EN_DEVISE.has(method) && (currency === "MGA" || !currency)) {
      return json({ error: "Ce portefeuille ne reçoit pas d'ariary : choisissez EUR, USD…" }, 400);
    }
    if (METHODES_EN_DEVISE.has(method) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination)) {
      return json({ error: "Indiquez l'email du compte " + method + "." }, 400);
    }
    if (method === "mobile" && currency !== "MGA") {
      return json({ error: "Le Mobile Money reçoit en ariary (MGA)." }, 400);
    }
    if (!(amount > 0)) return json({ error: "montant invalide" }, 400);
    if (amount < MIN_PAYOUT_AR) {
      return json({ error: `Le retrait minimum est de ${MIN_PAYOUT_AR.toLocaleString("fr-FR")} Ar.` }, 400);
    }

    const balance = await balanceFor(admin, email);
    const frais = fraisRetrait(amount);
    // Ce qui sort doit être du vrai argent : pas les parrainages ni les
    // sommes inscrites par l'application (voir retirableFor).
    const retirable = await retirableFor(admin, email, balance);
    if (amount + frais > retirable) {
      return json({
        error: `Vola azo alaina : ${retirable.toLocaleString("fr-FR")} Ar (ny vola tena naloa sy ny parrainage — ` +
          `ny vola nampidirin'ny appli ho azy dia ampiasaina ato anatiny ihany). Il faut ` +
          `${(amount + frais).toLocaleString("fr-FR")} Ar (${amount.toLocaleString("fr-FR")} Ar + ` +
          `${frais.toLocaleString("fr-FR")} Ar de frais, ${PAYOUT_FEE_PCT} %).`,
      }, 400);
    }

    const rate = await rateFromAr(currency);
    const amountOut = rate > 0 ? Number((amount * rate).toFixed(2)) : null;

    const { data, error } = await admin.from("wallet_payouts").insert({
      email: email, name: name, amount_ar: amount, method: method, kind: kind,
      destination: destination, link: link || null, instructions: instructions || null,
      currency: currency, amount_out: amountOut, rate: rate || null,
      status: "pending", fee_ar: frais,
    }).select("id,amount_ar,fee_ar,currency,amount_out").single();

    if (error) return json({ error: error.message }, 500);

    // Aucun canal ne part tout seul : la demande attend le propriétaire.
    // Le solde est déjà amputé : un retrait en attente compte comme parti,
    // sinon la même somme pourrait être demandée deux fois. Un refus, lui,
    // la rend — « balanceFor » ne compte que 'pending' et 'sent'.
    return json({
      payout: data,
      balanceAr: balance - amount - frais,
      etat: "pending",
      message: "",
      auto: null,
    });
  }

  // ---- Reprendre une demande qui n'est jamais partie ----
  // Une demande en attente est déjà retirée du solde : c'est ce qui empêche
  // de demander deux fois la même somme. Mais si elle ne part jamais — canal
  // manuel qu'on a laissé dormir, destination fautive, envie changée — la
  // somme reste dehors sans être arrivée nulle part. Elle est perdue pour
  // celui qui la possède.
  //
  // L'annulation la rend : la ligne passe en « refused », et « balanceFor »
  // ne compte que 'pending' et 'sent'.
  //
  // UNE SEULE RÈGLE, ET ELLE EST ABSOLUE : on ne rend une somme que si l'on
  // est SÛR qu'elle n'est pas partie. Une ligne qu'un canal automatique a
  // touchée a pu partir sans que la réponse nous parvienne — la rendre
  // reviendrait à la payer deux fois. Celle-là ne s'annule pas d'un bouton :
  // on va voir chez le fournisseur, et c'est le propriétaire qui tranche.
  if (action === "annuler") {
    const id = String(body.id ?? "").trim();
    if (!id) return json({ error: "la page n'a pas dit quelle demande annuler" }, 400);

    // L'erreur de la requête ne se jette pas : une colonne absente, une base
    // injoignable, et la ligne serait « introuvable » alors qu'elle existe.
    // Trois causes, trois mots — sans quoi on cherche la mauvaise.
    const { data: ligne, error: erreurLecture } = await admin.from("wallet_payouts")
      .select("id,email,status,auto_provider,auto_attempts,amount_ar")
      .eq("id", id).maybeSingle();

    if (erreurLecture) {
      return json({
        error: "La demande n'a pas pu être lue : " + erreurLecture.message +
          " — si une colonne manque, c'est que « supabase-retrait-automatique.sql » n'a pas été passé.",
      }, 500);
    }
    if (!ligne) return json({ error: "demande introuvable (" + id + ")" }, 404);

    // La sienne, ou n'importe laquelle si l'on est le propriétaire.
    const aLui = norm(ligne.email) === email;
    if (!aLui && !isOwner) return json({ error: "ce retrait n'est pas le vôtre" }, 403);

    if (ligne.status !== "pending") {
      return json({ error: "Cette demande est déjà tranchée." }, 409);
    }

    if (ligne.auto_provider || Number(ligne.auto_attempts ?? 0) > 0) {
      return json({
        error: "Un envoi a déjà été tenté chez " + String(ligne.auto_provider ?? "le fournisseur") +
          ". Vérifiez là-bas si la somme est partie avant d'annuler : sans cela, elle serait rendue " +
          "alors qu'elle est déjà arrivée.",
      }, 409);
    }

    // Le filtre sur 'pending' rend l'opération sans effet si elle vient
    // d'être tranchée ailleurs : deux clics ne rendent pas la somme deux fois.
    const { data, error } = await admin.from("wallet_payouts")
      .update({
        status: "refused",
        note: aLui ? "Annulé par son auteur — somme rendue" : "Annulé par le propriétaire — somme rendue",
        settled_at: new Date().toISOString(),
      })
      .eq("id", id).eq("status", "pending")
      .select("id,amount_ar").maybeSingle();

    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: "Cette demande vient d'être tranchée." }, 409);

    return json({ annule: data, balanceAr: await balanceFor(admin, email) });
  }

  // ---- Le propriétaire a envoyé l'argent, ou refuse ----
  if (action === "settle") {
    if (!isOwner) return json({ error: "réservé au propriétaire" }, 403);
    const id = String(body.id ?? "");
    const decision = String(body.decision ?? "");
    const note = String(body.note ?? "").trim();
    if (!id || (decision !== "sent" && decision !== "refused")) {
      return json({ error: "décision invalide" }, 400);
    }
    // Le filtre sur 'pending' rend l'opération sans effet si elle a déjà été
    // tranchée : deux clics ne valent pas deux envois.
    const { data, error } = await admin.from("wallet_payouts")
      .update({ status: decision, note: note || null, settled_at: new Date().toISOString() })
      .eq("id", id).eq("status", "pending")
      .select("id,email,amount_ar,status").maybeSingle();

    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: "demande déjà traitée" }, 409);
    return json({ payout: data });
  }

  return json({ error: "action inconnue" }, 400);
});
