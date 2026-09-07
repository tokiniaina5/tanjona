// Déblocage automatique quand l'argent arrive réellement sur le PayPal du
// propriétaire.
//
// PayPal appelle cette adresse dès qu'un encaissement est terminé. C'est le
// seul endroit qui peut le savoir : une page ouverte dans le navigateur d'un
// client ne voit jamais le solde du propriétaire, et lui confier la clé de
// l'API PayPal reviendrait à la donner à tout le monde.
//
// Règle appliquée, sans exception :
//   - le solde monte de la somme attendue  -> la demande passe en "confirmed",
//     le client retrouve son accès et les deux côtés sont prévenus ;
//   - le solde ne bouge pas, ou pas assez  -> rien. Pas de déblocage, pas de
//     notification. La demande reste "en attente" et le propriétaire garde la
//     main pour la confirmer lui-même s'il le veut.
//
// PayPal n'encaisse pas en ariary : la somme reçue est convertie ici (taux du
// jour, ou taux fixé par le propriétaire) avant d'être comparée aux 20 000 Ar.
//
// Un événement non signé par PayPal est refusé : sans cette vérification,
// n'importe qui pourrait annoncer un faux paiement et se débloquer gratis.
//
// Déploiement : voir LISEZ-MOI-SUPABASE.txt, section "Déblocage automatique".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYPAL_API = Deno.env.get("PAYPAL_API") ?? "https://api-m.paypal.com";

interface PaypalEvent {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    custom_id?: string;
    invoice_id?: string;
    amount?: { value?: string; currency_code?: string };
    payer?: { email_address?: string };
    payee?: { email_address?: string };
    supplementary_data?: Record<string, unknown>;
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Jeton d'accès PayPal, obtenu avec les identifiants de l'application PayPal
// du propriétaire. Ils ne vivent que dans les secrets Supabase.
async function paypalToken(): Promise<string> {
  const id = Deno.env.get("PAYPAL_CLIENT_ID") ?? "";
  const secret = Deno.env.get("PAYPAL_CLIENT_SECRET") ?? "";
  if (!id || !secret) return "";
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(`${id}:${secret}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) return "";
  const data = await res.json();
  return data.access_token ?? "";
}

// PayPal signe chaque événement : on le lui fait confirmer avant d'y toucher.
async function eventIsGenuine(req: Request, rawBody: string, token: string): Promise<boolean> {
  const webhookId = Deno.env.get("PAYPAL_WEBHOOK_ID") ?? "";
  if (!webhookId || !token) return false;
  const h = req.headers;
  const res = await fetch(`${PAYPAL_API}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth_algo: h.get("paypal-auth-algo"),
      cert_url: h.get("paypal-cert-url"),
      transmission_id: h.get("paypal-transmission-id"),
      transmission_sig: h.get("paypal-transmission-sig"),
      transmission_time: h.get("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: JSON.parse(rawBody),
    }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  return data.verification_status === "SUCCESS";
}

function normEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

// Combien d'ariary vaut 1 unité de la devise encaissée.
//   0 = inconnu, et dans ce cas on ne débloque rien : mieux vaut laisser le
//   propriétaire trancher que d'ouvrir un accès sur une conversion inventée.
async function rateToAr(currency: string): Promise<number> {
  if (!currency) return 0;
  if (currency === "MGA") return 1;

  // Un taux fixé par le propriétaire (secret RATE_EUR_MGA, RATE_USD_MGA…)
  // l'emporte : c'est le sien, il sait ce que sa banque lui donne.
  const fixed = Number(Deno.env.get(`RATE_${currency}_MGA`) ?? "0");
  if (fixed > 0) return fixed;

  // Sinon, le taux du jour. Si le service ne répond pas, on renvoie 0 plutôt
  // qu'un chiffre approximatif.
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${currency}`);
    if (!res.ok) return 0;
    const data = await res.json();
    const rate = Number(data?.rates?.MGA ?? 0);
    return rate > 0 ? rate : 0;
  } catch {
    return 0;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "méthode refusée" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Supabase non configuré" }, 500);

  const rawBody = await req.text();

  const token = await paypalToken();
  if (!token) return json({ error: "identifiants PayPal manquants" }, 500);
  if (!await eventIsGenuine(req, rawBody, token)) {
    // Signature absente ou fausse : on n'a aucune preuve qu'un paiement existe.
    return json({ error: "événement non vérifié" }, 401);
  }

  let event: PaypalEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "corps de requête illisible" }, 400);
  }

  // Seul un encaissement terminé prouve que l'argent est arrivé. Une commande
  // approuvée ou en attente ne fait pas monter le solde : on l'ignore.
  if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
    return json({ ignored: event.event_type ?? "inconnu" });
  }

  const resource = event.resource ?? {};
  const captureId = resource.id ?? "";
  const amount = Number(resource.amount?.value ?? 0);
  const currency = (resource.amount?.currency_code ?? "").toUpperCase();

  // PayPal n'encaisse pas en ariary : on convertit ce qui est arrivé pour le
  // comparer aux 20 000 Ar, plutôt que de demander au propriétaire d'entretenir
  // lui-même une contrepartie en euros qui vieillit.
  const feeAr = Number(Deno.env.get("UNLOCK_FEE_AR") ?? "20000");
  const rate = await rateToAr(currency);
  const amountAr = rate > 0 ? Math.round(amount * rate) : 0;

  const admin = createClient(supabaseUrl, serviceKey);

  // À quelle demande ce paiement correspond-il ? Le lien de paiement peut
  // porter la référence (custom_id / invoice_id) ; sinon on retrouve la
  // personne par l'email de son compte PayPal.
  const reference = (resource.custom_id ?? resource.invoice_id ?? "").trim();
  const payerEmail = normEmail(resource.payer?.email_address);
  // La référence n'est utilisable que si c'est bien un identifiant de demande :
  // une note libre tapée par le payeur ferait échouer la requête.
  const isRequestId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference);
  if (!isRequestId && !payerEmail) {
    return json({ matched: false, reason: "ni référence ni email de payeur", capture: captureId });
  }

  let query = admin.from("unlock_requests")
    .select("id,name,email,amount,status")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);
  query = isRequestId ? query.eq("id", reference) : query.eq("email", payerEmail);

  const { data: rows, error: findError } = await query;
  if (findError) return json({ error: "lecture impossible", detail: findError.message }, 500);

  const request = rows && rows[0];
  if (!request) {
    // Encaissement bien réel, mais rattaché à personne : le propriétaire le
    // verra sur son PayPal et pourra confirmer à la main. Réponse 200 pour que
    // PayPal cesse de réessayer.
    return json({ matched: false, capture: captureId });
  }

  // Le solde n'a pas monté de la somme attendue : ce n'est pas le paiement du
  // déblocage. On note ce qui est arrivé, et on ne débloque rien.
  // 5 % de marge : un taux de change bouge d'un jour à l'autre, on n'écarte
  // pas quelqu'un qui a bien payé pour un écart de conversion.
  const enough = amountAr > 0 && amountAr >= feeAr * 0.95;

  if (!enough) {
    await admin.from("unlock_requests").update({
      paid_amount: amount,
      paid_currency: currency,
      paid_amount_ar: amountAr || null,
      paypal_capture_id: captureId,
    }).eq("id", request.id);
    return json({
      matched: true, confirmed: false, received: amount, currency,
      convertedAr: amountAr, expectedAr: feeAr,
      reason: rate > 0 ? "somme insuffisante" : "taux de change indisponible",
    });
  }

  const { error: updateError } = await admin.from("unlock_requests").update({
    status: "confirmed",
    confirmed_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    paid_amount: amount,
    paid_currency: currency,
    paid_amount_ar: amountAr,
    paypal_capture_id: captureId,
    auto_confirmed: true,
  }).eq("id", request.id).eq("status", "pending");

  if (updateError) return json({ error: "confirmation impossible", detail: updateError.message }, 500);

  // À partir d'ici, les deux côtés apprennent la nouvelle tout seuls : la page
  // du client interroge sa demande et rouvre son accès, et l'application du
  // propriétaire signale l'encaissement à son ouverture.
  return json({
    matched: true, confirmed: true, request: request.id,
    received: amount, currency, convertedAr: amountAr,
  });
});
