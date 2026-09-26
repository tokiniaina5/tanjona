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
//   paypal    automatique (PayPal Payouts) dès que les clefs sont posées ;
//   wise, payoneer, skrill   portefeuilles internationaux, envoyés par le
//             propriétaire depuis son propre compte sur ces services ;
//   mobile    MVola / Orange Money / Airtel Money, en ariary ;
//   card      virement vers un compte bancaire.
// Les anciennes sorties (« cash », « wallet », « merchant ») ne s'ouvrent
// plus : leurs lignes passées gardent leur nom à l'affichage.
const METHODS = new Set(["paypal", "wise", "payoneer", "skrill", "mobile", "card"]);
// Les portefeuilles internationaux ne connaissent pas l'ariary.
const METHODES_EN_DEVISE = new Set(["paypal", "wise", "payoneer", "skrill"]);
const PURCHASE_METHODS = new Set<string>();

// Frais de dépôt, retirés de ce qui est crédité — le même taux que Papi.
const DEPOSIT_FEE_PCT = Number(Deno.env.get("DEPOSIT_FEE_PCT") ?? "5");
function fraisDepot(brut: number): number {
  return DEPOSIT_FEE_PCT > 0 ? Math.ceil(brut * DEPOSIT_FEE_PCT / 100) : 0;
}

// Devises dans lesquelles on peut verser par PayPal. Toutes sont acceptées
// par PayPal Checkout ; l'ariary, lui, ne l'est pas.
const DEVISES_DEPOT = new Set(["USD", "EUR", "GBP", "CAD", "AUD", "CHF"]);
const DEPOT_MIN_AR = Number(Deno.env.get("DEPOT_MIN_AR") ?? "5000");
const DEPOT_MAX_AR = Number(Deno.env.get("DEPOT_MAX_AR") ?? "5000000");

// Ce qui s'achète à l'intérieur de l'application, et à quel prix. Les prix
// vivent ici et nulle part ailleurs : dans la page, chacun pourrait décider
// de payer son abonnement un ariary.
const SITE_ITEMS: Record<string, { label: string; priceAr: number; days?: number; grant?: string }> = {
  sub_month: { label: "Abonnement mensuel", priceAr: 15000, days: 30 },
  sub_year: { label: "Abonnement annuel", priceAr: 150000, days: 365 },
  trial_day: { label: "Un jour d'essai en plus", priceAr: 10000, grant: "trial_day" },
  booster: { label: "Booster — direct Facebook 24 h", priceAr: 5000, grant: "booster" },
  sub_days: { label: "7 jours mis de côté pour l'abonnement", priceAr: 20000, grant: "sub_days" },
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

// ============================================================
// L'ENVOI AUTOMATIQUE
//
// Un retrait était une demande : la ligne entrait en « pending », le
// propriétaire allait envoyer l'argent lui-même, puis la marquait « sent ».
// Un canal dont les clefs sont posées en secrets s'exécute maintenant tout
// seul, à la seconde où la demande est faite.
//
// Un canal sans clefs ne change pas d'un iota : il reste une demande que
// quelqu'un exécute. C'est le défaut, et il le reste.
//
// Trois règles, et elles ne se négocient pas :
//
//   1. On n'invente jamais un succès. Si la réponse du fournisseur ne dit
//      pas clairement que l'argent est parti, la ligne reste « pending » et
//      un humain tranche. Marquer « sent » à tort, c'est perdre la somme ;
//      marquer « refused » à tort, c'est la rendre deux fois.
//
//   2. L'identifiant de la ligne sert de clef au fournisseur. Rejouer le
//      même retrait lui présente la même clef, et c'est LUI qui refuse le
//      doublon — une garantie qui ne dépend pas de notre code.
//
//   3. La ligne existe en base AVANT qu'on tente quoi que ce soit. Si
//      l'envoi part et que notre réponse se perd, la trace est déjà là :
//      c'est ce qui permet de retrouver l'argent plutôt que de le chercher.
// ============================================================

type Envoi =
  | { etat: "accepte"; ref: string; brut: unknown }
  | { etat: "refuse"; raison: string; brut: unknown }
  | { etat: "incertain"; raison: string; brut: unknown };

// ---- PayPal Payouts ----
// Secrets attendus, et rien dans le code :
//   PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_ENV ("sandbox" ou "live").
// Sans les deux premiers, le canal reste manuel.
function paypalConfigure(): boolean {
  return !!(Deno.env.get("PAYPAL_CLIENT_ID") && Deno.env.get("PAYPAL_SECRET"));
}

function paypalBase(): string {
  return (Deno.env.get("PAYPAL_ENV") ?? "sandbox").toLowerCase() === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function paypalJeton(): Promise<string | null> {
  const cle = btoa(
    (Deno.env.get("PAYPAL_CLIENT_ID") ?? "") + ":" + (Deno.env.get("PAYPAL_SECRET") ?? ""),
  );
  try {
    const res = await fetch(paypalBase() + "/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + cle,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.access_token ?? null;
  } catch {
    return null;
  }
}

// Déposer l'ordre. « accepte » ne veut pas dire « arrivé » : PayPal prend
// l'ordre et le traite ensuite. C'est paypalEtat() qui dira s'il a abouti.
async function paypalEnvoyer(
  idLigne: string,
  destination: string,
  montant: number,
  devise: string,
): Promise<Envoi> {
  // PayPal ne connaît pas l'ariary. Partir dans une devise qu'il refuse,
  // c'est un retrait qui échoue à l'arrivée sans qu'on sache pourquoi.
  if (!devise || devise === "MGA") {
    return {
      etat: "refuse",
      raison: "PayPal n'accepte pas l'ariary : choisissez une devise d'arrivée (EUR, USD…).",
      brut: null,
    };
  }
  if (!(montant > 0)) {
    return {
      etat: "refuse",
      raison: "conversion indisponible : le taux du jour n'a pas été trouvé.",
      brut: null,
    };
  }

  const jeton = await paypalJeton();
  if (!jeton) {
    return { etat: "incertain", raison: "PayPal n'a pas rendu de jeton.", brut: null };
  }

  // « sender_batch_id » est la clef : PayPal refuse deux fois la même. C'est
  // ce qui empêche un même retrait de partir deux fois, même si notre appel
  // est rejoué — et c'est ce qui rend le bouton « Envoyer » sans danger.
  const corps = {
    sender_batch_header: {
      sender_batch_id: idLigne,
      email_subject: "Ny asako — retrait",
      email_message: "Votre retrait depuis Ny asako.",
    },
    items: [{
      recipient_type: "EMAIL",
      amount: { value: montant.toFixed(2), currency: devise },
      receiver: destination,
      sender_item_id: idLigne,
    }],
  };

  let res: Response;
  try {
    res = await fetch(paypalBase() + "/v1/payments/payouts", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + jeton,
        "Content-Type": "application/json",
        "PayPal-Request-Id": idLigne,
      },
      body: JSON.stringify(corps),
    });
  } catch (e) {
    // Le réseau a lâché : on ne sait pas si PayPal a reçu l'ordre. C'est
    // exactement le cas où l'on ne décide rien.
    return { etat: "incertain", raison: "réseau : " + String(e), brut: null };
  }

  let brut: unknown = null;
  try { brut = await res.json(); } catch { brut = null; }
  const rep = brut as Record<string, unknown> | null;

  if (res.status === 201 || res.status === 200) {
    const entete = (rep?.batch_header ?? {}) as Record<string, unknown>;
    const ref = String(entete.payout_batch_id ?? "");
    if (!ref) return { etat: "incertain", raison: "PayPal a répondu sans référence.", brut };
    return { etat: "accepte", ref, brut };
  }

  // Clef déjà vue : l'ordre est DÉJÀ déposé. Ce n'est pas un échec — c'est la
  // preuve que la clef a joué, et il ne faut surtout pas redéposer. On ne
  // connaît pas sa référence ici : la ligne garde celle qu'elle avait.
  const nom = String(rep?.name ?? "");
  if (res.status === 400 && nom.indexOf("DUPLICATE") >= 0) {
    return { etat: "accepte", ref: "", brut };
  }

  // 4xx : PayPal a compris et refuse (adresse invalide, solde marchand
  // insuffisant…). 5xx : c'est chez lui que ça cloche, on ne conclut pas.
  const raison = String(rep?.message ?? rep?.name ?? ("HTTP " + res.status));
  if (res.status >= 500) return { etat: "incertain", raison, brut };
  return { etat: "refuse", raison, brut };
}

// Où en est un ordre déposé. C'est ici, et seulement ici, qu'on apprend que
// l'argent est ARRIVÉ — le dépôt de l'ordre ne le disait pas.
type EtatLot =
  | { etat: "arrive"; detail: string; brut: unknown }
  | { etat: "echoue"; detail: string; brut: unknown }
  | { etat: "en_cours"; detail: string; brut: unknown };

// Ce que PayPal dit d'un versement, et ce qu'on en conclut.
//   SUCCESS                      il est arrivé.
//   FAILED RETURNED BLOCKED      il ne partira pas : la somme est rendue.
//   REFUNDED REVERSED
//   UNCLAIMED                    déposé, mais le destinataire n'a pas encore
//                                de compte PayPal. Il a trente jours ; on
//                                attend, on ne rend rien.
//   PENDING ONHOLD NEW           en cours.
const PAYPAL_ECHECS = ["FAILED", "RETURNED", "BLOCKED", "REFUNDED", "REVERSED", "DENIED", "CANCELED"];

async function paypalEtat(refLot: string): Promise<EtatLot> {
  const jeton = await paypalJeton();
  if (!jeton) return { etat: "en_cours", detail: "PayPal n'a pas rendu de jeton.", brut: null };

  let res: Response;
  try {
    res = await fetch(paypalBase() + "/v1/payments/payouts/" + encodeURIComponent(refLot), {
      headers: { "Authorization": "Bearer " + jeton },
    });
  } catch (e) {
    return { etat: "en_cours", detail: "réseau : " + String(e), brut: null };
  }

  let brut: unknown = null;
  try { brut = await res.json(); } catch { brut = null; }
  const rep = brut as Record<string, unknown> | null;

  if (!res.ok) {
    // On ne conclut pas sur une réponse qu'on n'a pas comprise : la ligne
    // reste où elle est, et l'on redemandera.
    return { etat: "en_cours", detail: "HTTP " + res.status, brut };
  }

  const entete = (rep?.batch_header ?? {}) as Record<string, unknown>;
  const etatLot = String(entete.batch_status ?? "").toUpperCase();
  const items = (rep?.items ?? []) as Array<Record<string, unknown>>;
  const premier = (items[0] ?? {}) as Record<string, unknown>;
  const etatItem = String(premier.transaction_status ?? "").toUpperCase();

  if (etatItem === "SUCCESS") {
    return { etat: "arrive", detail: "SUCCESS", brut };
  }
  if (PAYPAL_ECHECS.indexOf(etatItem) >= 0 || PAYPAL_ECHECS.indexOf(etatLot) >= 0) {
    const pourquoi = String(premier.errors ? JSON.stringify(premier.errors) : (etatItem || etatLot));
    return { etat: "echoue", detail: pourquoi, brut };
  }
  return { etat: "en_cours", detail: etatItem || etatLot || "sans état", brut };
}

// ============================================================
// LE DÉPÔT INTERNATIONAL — PayPal Checkout
//
// La personne paie chez PayPal, avec son compte ou une carte Visa /
// Mastercard sans compte. Rien n'est crédité sur la foi du retour dans la
// page : c'est la CAPTURE, faite ici avec nos clefs, qui encaisse, et l'on
// ne crédite que si PayPal dit COMPLETED pour exactement la somme et la
// devise commandées.
//
// La commande porte l'identifiant de notre ligne (custom_id) : une commande
// ne peut créditer que la ligne qui l'a créée, et la ligne ne se confirme
// qu'une fois (filtre sur « en_attente »).
// ============================================================

type Ligne = { id: string; email: string; amount_ar: number; status: string; raw: unknown };

async function paypalAppel(
  methode: "GET" | "POST",
  chemin: string,
  corps?: unknown,
  clef?: string,
): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const jeton = await paypalJeton();
  if (!jeton) return { status: 0, data: null };
  try {
    const res = await fetch(paypalBase() + chemin, {
      method: methode,
      headers: {
        "Authorization": "Bearer " + jeton,
        "Content-Type": "application/json",
        ...(clef ? { "PayPal-Request-Id": clef } : {}),
      },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
    let data: Record<string, unknown> | null = null;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

// Lit une commande PayPal et en tire ce qui compte : est-elle encaissée,
// pour combien, et dans quelle devise.
function lireCommande(cmd: Record<string, unknown> | null) {
  const unite = ((cmd?.purchase_units ?? []) as Array<Record<string, unknown>>)[0] ?? {};
  const captures = (((unite.payments ?? {}) as Record<string, unknown>).captures ?? []) as Array<Record<string, unknown>>;
  const capture = captures[0] ?? {};
  const montant = (capture.amount ?? unite.amount ?? {}) as Record<string, unknown>;
  return {
    etatCommande: String(cmd?.status ?? "").toUpperCase(),
    etatCapture: String(capture.status ?? "").toUpperCase(),
    captureId: String(capture.id ?? ""),
    valeur: String(montant.value ?? ""),
    devise: String(montant.currency_code ?? "").toUpperCase(),
    customId: String(unite.custom_id ?? ""),
  };
}

// Encaisse la commande si elle est approuvée, puis tranche. Sans danger à
// rejouer : la capture porte une clef tirée de notre ligne, et une commande
// déjà encaissée est relue au lieu d'être encaissée deux fois.
async function paypalConfirmerDepot(admin: Admin, ligne: Ligne): Promise<string> {
  if (ligne.status === "confirme") return "confirme";
  const raw = (ligne.raw ?? {}) as Record<string, unknown>;
  const orderId = String(raw.orderId ?? "");
  if (!orderId) return ligne.status;

  let cmd = (await paypalAppel("GET", "/v2/checkout/orders/" + encodeURIComponent(orderId))).data;
  let lu = lireCommande(cmd);

  if (lu.etatCommande === "APPROVED") {
    const cap = await paypalAppel("POST", "/v2/checkout/orders/" + encodeURIComponent(orderId) + "/capture",
      {}, "cap-" + ligne.id);
    if (cap.data) cmd = cap.data;
    else cmd = (await paypalAppel("GET", "/v2/checkout/orders/" + encodeURIComponent(orderId))).data;
    lu = lireCommande(cmd);
  }

  const attendu = String(raw.valeur ?? "");
  const deviseAttendue = String(raw.devise ?? "");
  const bonneSomme = lu.valeur === attendu && lu.devise === deviseAttendue;
  const bonneLigne = !lu.customId || lu.customId === ligne.id;
  const nouveauRaw = { ...raw, dernierEtat: cmd };

  if (lu.etatCapture === "COMPLETED" && bonneSomme && bonneLigne) {
    // Le filtre sur « en_attente » : deux confirmations simultanées ne
    // créditent qu'une fois.
    await admin.from("wallet_deposits").update({
      status: "confirme",
      confirmed_at: new Date().toISOString(),
      note: "PayPal — payé " + lu.valeur + " " + lu.devise + ", crédité " +
        Number(ligne.amount_ar).toLocaleString("fr-FR") + " Ar — capture " + lu.captureId,
      raw: nouveauRaw,
    }).eq("id", ligne.id).eq("status", "en_attente");
    return "confirme";
  }

  if (lu.etatCapture === "COMPLETED" && !(bonneSomme && bonneLigne)) {
    // Encaissé, mais pas ce qui était commandé : on ne crédite rien au
    // hasard, le propriétaire regarde.
    await admin.from("wallet_deposits").update({
      raw: nouveauRaw,
      note: "Encaissé chez PayPal (" + lu.valeur + " " + lu.devise + ") mais différent de la commande : à vérifier",
    }).eq("id", ligne.id);
    return "a_verifier";
  }

  if (lu.etatCapture === "PENDING") {
    await admin.from("wallet_deposits").update({
      raw: nouveauRaw, note: "PayPal retient le paiement (vérification de son côté) : crédité dès qu'il le libère",
    }).eq("id", ligne.id);
    return "en_attente";
  }

  if (["DECLINED", "FAILED", "REFUNDED", "REVERSED"].indexOf(lu.etatCapture) >= 0 ||
      lu.etatCommande === "VOIDED") {
    await admin.from("wallet_deposits").update({
      status: "refuse", raw: nouveauRaw, note: "PayPal : paiement " + (lu.etatCapture || lu.etatCommande),
    }).eq("id", ligne.id).eq("status", "en_attente");
    return "refuse";
  }

  // CREATED / PAYER_ACTION_REQUIRED : la personne n'a pas encore payé.
  return "en_attente";
}

// ---- L'aiguillage ----
// Rendre null, c'est dire « ce canal n'est pas automatique » : la demande
// suit alors l'ancien chemin, sans rien tenter.
async function executerLeRetrait(
  methode: string,
  idLigne: string,
  destination: string,
  montantSortie: number | null,
  devise: string,
): Promise<{ fournisseur: string; envoi: Envoi } | null> {
  if (methode === "paypal" && paypalConfigure()) {
    return {
      fournisseur: "paypal",
      envoi: await paypalEnvoyer(idLigne, destination, Number(montantSortie ?? 0), devise),
    };
  }
  // MVola, Orange Money, Airtel Money : leurs interfaces existent, mais
  // elles répondent « reçu » et se concluent plus tard, par une seconde
  // question. Les écrire sans pouvoir les éprouver sur un compte marchand
  // réel reviendrait à confier de l'argent à du code que personne n'a jamais
  // vu fonctionner. Elles restent manuelles jusque-là.
  return null;
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

  return Math.max(0, earned + deposited - withdrawn - spent);
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
  return Math.max(0, Math.min(balance, entre - sorti));
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

    const retirable = await retirableFor(admin, email, balance);
    return json({
      balanceAr: balance, retirableAr: retirable, arPerReferral: tarifParrainage(email), minPayoutAr: MIN_PAYOUT_AR, payoutFeePct: PAYOUT_FEE_PCT,
      depositFeePct: DEPOSIT_FEE_PCT, depotMinAr: DEPOT_MIN_AR,
      // Ce qui marche vraiment sur ce serveur, pour que la page ne propose
      // pas un canal dont les clefs manquent.
      canaux: {
        depotPapi: !!Deno.env.get("PAPI_TOKEN"),
        depotPaypal: paypalConfigure(),
        retraitPaypalAuto: paypalConfigure(),
        paypalTest: paypalConfigure() && paypalBase().indexOf("sandbox") >= 0,
      },
      payouts: mine ?? [], deposits: depots ?? [], queue, isOwner, items: SITE_ITEMS,
    });
  }

  // ---- Déposer depuis l'étranger, par PayPal ----
  // Crée la commande chez PayPal et rend le lien où payer. Rien n'est encore
  // crédité : la ligne naît « en_attente », et c'est « depot_paypal_check »
  // (au retour de PayPal, ou à la prochaine ouverture) qui encaisse.
  if (action === "depot_paypal") {
    if (!paypalConfigure()) {
      return json({ error: "Le dépôt PayPal n'est pas encore ouvert : clefs PAYPAL_CLIENT_ID / PAYPAL_SECRET absentes." }, 503);
    }
    const devise = String(body.currency ?? "").toUpperCase();
    const montant = Math.round(Number(body.amount ?? 0) * 100) / 100;
    const retour = String(body.returnUrl ?? "").trim();
    if (!DEVISES_DEPOT.has(devise)) return json({ error: "devise non acceptée par PayPal" }, 400);
    if (!(montant > 0)) return json({ error: "montant invalide" }, 400);
    if (!/^https?:\/\//i.test(retour)) return json({ error: "adresse de retour invalide" }, 400);

    const taux = await rateFromAr(devise);
    if (!(taux > 0)) return json({ error: "Taux du jour indisponible pour " + devise + ", réessayez plus tard." }, 503);
    const brutAr = Math.floor(montant / taux);
    if (brutAr < DEPOT_MIN_AR) {
      return json({ error: "Dépôt minimum : " + DEPOT_MIN_AR.toLocaleString("fr-FR") + " Ar (≈ " +
        (DEPOT_MIN_AR * taux).toFixed(2) + " " + devise + ")." }, 400);
    }
    if (brutAr > DEPOT_MAX_AR) {
      return json({ error: "Dépôt maximum : " + DEPOT_MAX_AR.toLocaleString("fr-FR") + " Ar." }, 400);
    }
    const frais = fraisDepot(brutAr);
    const net = brutAr - frais;
    const valeur = montant.toFixed(2);

    // La ligne d'abord : si PayPal répond et que notre réponse se perd, la
    // trace existe déjà. La référence définitive (l'id de commande) la
    // remplace juste après.
    const { data: ligne, error } = await admin.from("wallet_deposits").insert({
      email, amount_ar: net, provider: "paypal", provider_ref: "PP-" + crypto.randomUUID(),
      status: "en_attente", note: "Commande PayPal en cours de création",
      raw: { valeur, devise, taux, brutAr, frais, fraisPct: DEPOSIT_FEE_PCT },
    }).select("id").single();
    if (error) return json({ error: error.message }, 500);

    const sep = retour.includes("?") ? "&" : "?";
    const cmd = await paypalAppel("POST", "/v2/checkout/orders", {
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: ligne.id,
        custom_id: ligne.id,
        description: "Rechargement portefeuille Ny asako",
        amount: { currency_code: devise, value: valeur },
      }],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Ny asako",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            return_url: retour + sep + "paypal=ok&depot=" + ligne.id,
            cancel_url: retour + sep + "paypal=annule&depot=" + ligne.id,
          },
        },
      },
    }, "ord-" + ligne.id);

    const orderId = String(cmd.data?.id ?? "");
    const liens = (cmd.data?.links ?? []) as Array<{ rel: string; href: string }>;
    const lien = (liens.find((l) => l.rel === "payer-action") ?? liens.find((l) => l.rel === "approve"))?.href;
    if (!orderId || !lien) {
      const msg = String(cmd.data?.message ?? cmd.data?.name ?? ("PayPal HTTP " + cmd.status));
      await admin.from("wallet_deposits").update({ status: "refuse", note: "PayPal : " + msg })
        .eq("id", ligne.id);
      return json({ error: "PayPal a refusé la commande : " + msg }, 502);
    }

    await admin.from("wallet_deposits").update({
      provider_ref: orderId,
      note: "En attente du paiement PayPal",
      raw: { valeur, devise, taux, brutAr, frais, fraisPct: DEPOSIT_FEE_PCT, orderId },
    }).eq("id", ligne.id);

    return json({ depot: ligne.id, orderId, paymentLink: lien, montant: valeur, devise, brutAr, frais, creditAr: net });
  }

  // ---- Le dépôt PayPal est-il payé ? On encaisse. ----
  if (action === "depot_paypal_check") {
    const id = String(body.id ?? "").trim();
    if (!id) return json({ error: "dépôt manquant" }, 400);
    const { data: ligne } = await admin.from("wallet_deposits")
      .select("id,email,amount_ar,status,raw").eq("id", id).eq("provider", "paypal").maybeSingle();
    if (!ligne || norm(ligne.email) !== email) return json({ error: "dépôt introuvable" }, 404);
    const etat = await paypalConfirmerDepot(admin, ligne as Ligne);
    return json({ etat, creditAr: ligne.amount_ar, balanceAr: await balanceFor(admin, email) });
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
    if (item.priceAr > balance) {
      return json({
        error: `Votre solde est de ${balance.toLocaleString("fr-FR")} Ar, il en faut ` +
          `${item.priceAr.toLocaleString("fr-FR")} Ar.`,
      }, 400);
    }

    const { data, error } = await admin.from("wallet_payouts").insert({
      email: email, name: String(body.name ?? "").trim(),
      amount_ar: item.priceAr, method: "site", kind: "insite",
      destination: item.label, currency: "MGA", amount_out: item.priceAr, rate: 1,
      status: "sent", settled_at: new Date().toISOString(),
    }).select("id").single();

    if (error) return json({ error: error.message }, 500);
    return json({
      bought: itemId, label: item.label, priceAr: item.priceAr, days: item.days ?? 0,
      grant: item.grant ?? null,
      balanceAr: balance - item.priceAr, receipt: data.id,
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
    // PayPal, Wise, Payoneer et Skrill ne tiennent pas de compte en ariary :
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

    // La ligne existe avant qu'on tente quoi que ce soit : si l'envoi part et
    // que notre réponse se perd, la trace est déjà en base.
    const tentative = await executerLeRetrait(
      method,
      String(data.id),
      destination,
      amountOut,
      currency,
    );

    let etatFinal = "pending";
    let motAuClient = "";

    if (tentative) {
      const e = tentative.envoi;
      const commun = {
        auto_provider: tentative.fournisseur,
        auto_attempts: 1,
        auto_raw: e.brut ?? null,
      };
      const maintenant = new Date().toISOString();

      if (e.etat === "accepte") {
        // Déposé, pas arrivé : la ligne reste en attente, et c'est
        // « verifier » qui la fera passer à « envoyé » le moment venu.
        await admin.from("wallet_payouts").update({
          ...commun,
          ...(e.ref ? { auto_ref: e.ref } : {}),
          note: "Ordre déposé chez " + tentative.fournisseur + " — en cours d'acheminement",
        }).eq("id", data.id).eq("status", "pending");
        motAuClient = "Lasa any amin'ny " + tentative.fournisseur +
          " ny baiko. Hampandrenesina ianao rehefa tonga ny vola.";
      } else if (e.etat === "refuse") {
        // Refusé pour une raison comprise : le solde revient, et on dit
        // laquelle — un refus sans motif ne se corrige pas.
        etatFinal = "refused";
        await admin.from("wallet_payouts").update({
          ...commun,
          status: "refused",
          note: "Refusé par " + tentative.fournisseur + " : " + e.raison,
          settled_at: maintenant,
        }).eq("id", data.id).eq("status", "pending");
        motAuClient = "Tsy lasa : " + e.raison;
      } else {
        // On ne sait pas. On ne décide donc rien : la ligne reste en attente,
        // avec ce qu'on sait écrit dessus, et le propriétaire tranche.
        await admin.from("wallet_payouts").update({
          ...commun,
          note: "À vérifier chez " + tentative.fournisseur + " : " + e.raison,
        }).eq("id", data.id).eq("status", "pending");
        motAuClient = "Mbola tsy voamarina : hojeren'ny tompon'ny appli.";
      }
    }

    // Le solde est déjà amputé : un retrait en attente compte comme parti,
    // sinon la même somme pourrait être demandée deux fois. Un refus, lui,
    // la rend — « balanceFor » ne compte que 'pending' et 'sent'.
    const soldeApres = etatFinal === "refused" ? balance : balance - amount - frais;
    return json({
      payout: data,
      balanceAr: soldeApres,
      etat: etatFinal,
      message: motAuClient,
      auto: tentative ? { fournisseur: tentative.fournisseur, etat: tentative.envoi.etat } : null,
    });
  }

  // ---- Déposer l'ordre chez le fournisseur, maintenant ----
  // Le dépôt se tente déjà au moment de la demande. Ce bouton le rejoue :
  // quand les clefs n'étaient pas encore posées, quand le réseau avait lâché,
  // quand on veut simplement s'y remettre.
  //
  // Le rejouer est sans danger : la clef présentée au fournisseur est
  // l'identifiant de la ligne, et c'est LUI qui refuse le doublon. Un ordre
  // déjà déposé revient en « déjà vu », jamais en second versement.
  if (action === "envoyer") {
    const id = String(body.id ?? "").trim();
    if (!id) return json({ error: "la page n'a pas dit quelle demande envoyer" }, 400);

    const { data: ligne, error: erreurLecture } = await admin.from("wallet_payouts")
      .select("id,email,name,status,method,destination,currency,amount_out,auto_provider,auto_ref,auto_attempts")
      .eq("id", id).maybeSingle();

    if (erreurLecture) return json({ error: "La demande n'a pas pu être lue : " + erreurLecture.message }, 500);
    if (!ligne) return json({ error: "demande introuvable (" + id + ")" }, 404);

    // Envoyer de l'argent est l'acte du propriétaire : c'est son compte
    // marchand qui se vide. Personne d'autre ne déclenche cela à la main.
    if (!isOwner) return json({ error: "réservé au propriétaire" }, 403);
    if (ligne.status !== "pending") return json({ error: "Cette demande est déjà tranchée." }, 409);

    const tentative = await executerLeRetrait(
      String(ligne.method ?? ""),
      String(ligne.id),
      String(ligne.destination ?? ""),
      ligne.amount_out === null || ligne.amount_out === undefined ? null : Number(ligne.amount_out),
      String(ligne.currency ?? ""),
    );

    if (!tentative) {
      return json({
        error: "Ce canal ne s'envoie pas tout seul : " +
          (String(ligne.method ?? "") === "paypal"
            ? "les clefs PayPal ne sont pas posées (PAYPAL_CLIENT_ID, PAYPAL_SECRET)."
            : "seul PayPal est automatique pour l'instant ; celui-ci s'envoie à la main."),
      }, 409);
    }

    const e = tentative.envoi;
    const maintenant = new Date().toISOString();
    const essais = Number(ligne.auto_attempts ?? 0) + 1;

    if (e.etat === "accepte") {
      // Déposé, PAS arrivé. La ligne reste en attente : c'est « verifier »
      // qui la fera passer à « envoyé », quand PayPal dira que c'est fait.
      await admin.from("wallet_payouts").update({
        auto_provider: tentative.fournisseur,
        auto_attempts: essais,
        auto_raw: e.brut ?? null,
        ...(e.ref ? { auto_ref: e.ref } : {}),
        note: "Ordre déposé chez " + tentative.fournisseur + " — en cours d'acheminement",
      }).eq("id", id).eq("status", "pending");
      return json({ etat: "depose", ref: e.ref || ligne.auto_ref || null,
        message: "Lasa any amin'ny PayPal ny baiko. Hampandrenesina ianao rehefa tonga ny vola." });
    }

    if (e.etat === "refuse") {
      await admin.from("wallet_payouts").update({
        auto_provider: tentative.fournisseur,
        auto_attempts: essais,
        auto_raw: e.brut ?? null,
        status: "refused",
        note: "Refusé par " + tentative.fournisseur + " : " + e.raison,
        settled_at: maintenant,
      }).eq("id", id).eq("status", "pending");
      return json({ etat: "refuse", message: e.raison });
    }

    // On ne sait pas. On ne décide rien.
    await admin.from("wallet_payouts").update({
      auto_provider: tentative.fournisseur,
      auto_attempts: essais,
      auto_raw: e.brut ?? null,
      note: "À vérifier chez " + tentative.fournisseur + " : " + e.raison,
    }).eq("id", id).eq("status", "pending");
    return json({ etat: "incertain", message: e.raison });
  }

  // ---- L'argent est-il arrivé ? ----
  // Le dépôt de l'ordre ne le disait pas : PayPal le traite ensuite. On le
  // lui redemande pour chaque ligne déposée et encore en attente.
  //
  // Appelée à l'ouverture de l'application. Chacun demande pour ses propres
  // lignes ; le propriétaire, pour toutes.
  if (action === "verifier") {
    let requete = admin.from("wallet_payouts")
      .select("id,email,amount_ar,auto_provider,auto_ref")
      .eq("status", "pending").not("auto_ref", "is", null).limit(25);
    if (!isOwner) requete = requete.eq("email", email);

    const { data: lignes, error: erreurLecture } = await requete;
    if (erreurLecture) return json({ error: erreurLecture.message }, 500);

    const arrivees: string[] = [];
    const echecs: string[] = [];
    for (const l of lignes ?? []) {
      if (String(l.auto_provider ?? "") !== "paypal") continue;
      const etat = await paypalEtat(String(l.auto_ref));
      if (etat.etat === "arrive") {
        await admin.from("wallet_payouts").update({
          status: "sent",
          note: "Arrivé chez le destinataire (paypal) — réf. " + l.auto_ref,
          settled_at: new Date().toISOString(),
          auto_raw: etat.brut ?? null,
        }).eq("id", l.id).eq("status", "pending");
        arrivees.push(String(l.id));
      } else if (etat.etat === "echoue") {
        // Il ne partira pas : la somme revient au solde, et l'on dit pourquoi.
        await admin.from("wallet_payouts").update({
          status: "refused",
          note: "Non abouti chez paypal : " + etat.detail + " — solde rendu",
          settled_at: new Date().toISOString(),
          auto_raw: etat.brut ?? null,
        }).eq("id", l.id).eq("status", "pending");
        echecs.push(String(l.id));
      }
      // « en_cours » : on ne touche à rien, on redemandera.
    }

    // Les dépôts PayPal payés dont la page n'est jamais revenue (onglet
    // fermé, réseau coupé) s'encaissent ici, à la prochaine ouverture.
    let depotsConfirmes = 0;
    if (paypalConfigure()) {
      const depuis = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
      const { data: depots } = await admin.from("wallet_deposits")
        .select("id,email,amount_ar,status,raw").eq("provider", "paypal").eq("status", "en_attente")
        .eq("email", email).gte("created_at", depuis).limit(10);
      for (const d of depots ?? []) {
        if ((await paypalConfirmerDepot(admin, d as Ligne)) === "confirme") depotsConfirmes++;
      }
    }

    return json({ verifies: (lignes ?? []).length, arrivees: arrivees.length, echecs: echecs.length, depotsConfirmes });
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
