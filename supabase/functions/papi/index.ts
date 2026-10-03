// Versement dans le portefeuille via Papi (MVola, Orange Money, Airtel Money, carte BRED).
//
// Trois entrées :
//   { action: "create", amountAr, provider?, phone?, returnUrl }  (jeton de session requis)
//       -> crée la ligne wallet_deposits "en_attente", demande un lien à Papi,
//          renvoie { paymentLink, reference, montantCredite, frais }
//   { action: "check", reference }                               (jeton de session requis)
//       -> relit l'état chez Papi et confirme si payé
//   notification Papi (corps avec merchantPaymentReference, sans action)
//       -> on NE croit PAS le corps : on relit l'état chez Papi avec notre clef.
//
// Frais : le client paie la somme saisie ; son solde reçoit cette somme moins
// DEPOSIT_FEE_PCT % (0 % par défaut). La somme payée chez Papi est gardée
// dans raw.brut, c'est elle qu'on compare à ce que Papi dit avoir encaissé.
//
// verify_jwt est désactivé parce que Papi appelle sans jeton Supabase ;
// "create" et "check" vérifient eux-mêmes la session.
//
// Secrets : PAPI_TOKEN (clef API de la boutique, onglet Développeur).
// Optionnels : DEPOSIT_FEE_PCT (défaut 0), PAPI_MAX_AR,
// PAPI_ALLOW_TEST="true" pour créditer les paiements de test (essais seulement).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAPI = "https://app.papi.mg/engine/api/payment-links";
const PROVIDERS = new Set(["MVOLA", "AIRTEL_MONEY", "ORANGE_MONEY", "BRED"]);
const MIN_AR = 300;
const MAX_AR = Number(Deno.env.get("PAPI_MAX_AR") ?? "2000000");
const DEPOSIT_FEE_PCT = Number(Deno.env.get("DEPOSIT_FEE_PCT") ?? "0");

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

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function fraisDepot(brut: number): number {
  return DEPOSIT_FEE_PCT > 0 ? Math.ceil(brut * DEPOSIT_FEE_PCT / 100) : 0;
}

type Admin = ReturnType<typeof createClient>;

async function lireChezPapi(token: string, reference: string) {
  const res = await fetch(PAPI + "/" + encodeURIComponent(reference), {
    headers: { "Token": token },
  });
  let body: any = null;
  try { body = await res.json(); } catch { body = null; }
  return { ok: res.ok, status: res.status, data: body?.data ?? null, raw: body };
}

// Relit l'état chez Papi et met la ligne à jour. Ne crédite QUE si Papi dit
// PAID + SUCCESS et que la somme payée correspond exactement.
async function synchroniser(admin: Admin, token: string, reference: string) {
  const { data: ligne } = await admin.from("wallet_deposits")
    .select("id,email,amount_ar,status,raw")
    .eq("provider", "papi").eq("provider_ref", reference).maybeSingle();
  if (!ligne) return { etat: "inconnu" as const };
  if (ligne.status === "confirme") return { etat: "confirme" as const, ligne };

  const lu = await lireChezPapi(token, reference);
  if (!lu.ok || !lu.data) return { etat: ligne.status, ligne, erreur: lu.raw };

  const d = lu.data;
  const raw = { ...(ligne.raw ?? {}), dernierEtat: d };
  const brutAttendu = Number((ligne.raw as any)?.brut ?? ligne.amount_ar);
  const paye = d.linkStatus === "PAID" && d.paymentStatus === "SUCCESS";
  const montantOk = Number(d.amount) === brutAttendu;
  const testAutorise = (Deno.env.get("PAPI_ALLOW_TEST") ?? "").toLowerCase() === "true";

  if (paye && montantOk && (!d.isTestMode || testAutorise)) {
    await admin.from("wallet_deposits").update({
      status: "confirme",
      confirmed_at: new Date().toISOString(),
      note: "Papi " + (d.paymentMethod ?? "") + (d.isTestMode ? " (TEST)" : "") +
        " — payé " + brutAttendu + " Ar, crédité " + ligne.amount_ar + " Ar" +
        " — réf. " + (d.papiPaymentReference ?? ""),
      raw,
    }).eq("id", ligne.id).eq("status", "en_attente");
    return { etat: "confirme" as const, ligne };
  }

  if (paye && !montantOk) {
    await admin.from("wallet_deposits").update({
      raw, note: "Montant différent chez Papi (" + d.amount + ") : à vérifier",
    }).eq("id", ligne.id);
    return { etat: "a_verifier" as const, ligne };
  }

  if (paye && d.isTestMode) {
    await admin.from("wallet_deposits").update({
      status: "test", raw, note: "Paiement de test Papi : non crédité",
    }).eq("id", ligne.id).eq("status", "en_attente");
    return { etat: "test" as const, ligne };
  }

  if (d.linkStatus === "EXPIRED" || d.linkStatus === "DISABLED") {
    await admin.from("wallet_deposits").update({
      status: "echoue", raw, note: "Lien Papi " + d.linkStatus,
    }).eq("id", ligne.id).eq("status", "en_attente");
    return { etat: "echoue" as const, ligne };
  }

  await admin.from("wallet_deposits").update({
    raw, note: d.message ? "Papi : " + d.message : null,
  }).eq("id", ligne.id);
  return { etat: "en_attente" as const, ligne, paymentStatus: d.paymentStatus };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode refusée" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const papiToken = Deno.env.get("PAPI_TOKEN") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ error: "configuration incomplète" }, 500);
  if (!papiToken) return json({ error: "PAPI_TOKEN manquant dans les secrets Supabase" }, 500);
  const admin = createClient(supabaseUrl, serviceKey);

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { body = {}; }

  // ---- Notification envoyée par Papi ----
  if (!body.action && body.merchantPaymentReference) {
    const ref = String(body.merchantPaymentReference);
    try {
      await synchroniser(admin, papiToken, ref);
    } catch (e) {
      console.error("notification papi", ref, e);
    }
    // Toujours 200 : l'état réel est relu chez Papi, pas pris dans ce corps.
    return json({ ok: true });
  }

  // ---- Le reste exige une session ----
  const jeton = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!jeton) return json({ error: "non authentifié" }, 401);
  const { data: caller, error: callerError } = await admin.auth.getUser(jeton);
  const email = norm(caller?.user?.email);
  if (callerError || !email) return json({ error: "session invalide" }, 401);

  if (body.action === "create") {
    const brut = Math.floor(Number(body.amountAr ?? 0));
    if (!(brut >= MIN_AR)) return json({ error: `Montant minimum : ${MIN_AR} Ar` }, 400);
    if (brut > MAX_AR) return json({ error: `Montant maximum : ${MAX_AR.toLocaleString("fr-FR")} Ar` }, 400);
    const frais = fraisDepot(brut);
    const net = brut - frais;

    const provider = String(body.provider ?? "").toUpperCase();
    const returnUrl = String(body.returnUrl ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const name = String(body.name ?? "").trim() || email;

    const reference = "SM-" + crypto.randomUUID();
    const { data: ligne, error } = await admin.from("wallet_deposits").insert({
      email, amount_ar: net, provider: "papi", provider_ref: reference,
      status: "en_attente", note: "Lien Papi en cours de création",
      raw: { brut, frais, fraisPct: DEPOSIT_FEE_PCT },
    }).select("id").single();
    if (error) return json({ error: error.message }, 500);

    const notificationUrl = supabaseUrl.replace(/\/$/, "") + "/functions/v1/papi";
    const demande: Record<string, unknown> = {
      amount: brut,
      reference,
      clientName: name.slice(0, 100),
      description: "Rechargement portefeuille Ny asako — " + brut + " Ar",
      notificationUrl,
      validDuration: 2,
      payerEmail: email,
    };
    if (PROVIDERS.has(provider)) demande.provider = provider;
    if (phone) demande.payerPhone = phone;
    if (/^https?:\/\//i.test(returnUrl)) {
      const sep = returnUrl.includes("?") ? "&" : "?";
      demande.successUrl = returnUrl + sep + "papi=ok&ref=" + encodeURIComponent(reference);
      demande.failureUrl = returnUrl + sep + "papi=echec&ref=" + encodeURIComponent(reference);
    }

    let rep: any = null;
    let status = 0;
    try {
      const res = await fetch(PAPI, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Token": papiToken },
        body: JSON.stringify(demande),
      });
      status = res.status;
      try { rep = await res.json(); } catch { rep = null; }
    } catch (_e) {
      await admin.from("wallet_deposits").update({ status: "echoue", note: "Papi injoignable" })
        .eq("id", ligne.id);
      return json({ error: "Papi injoignable, réessayez." }, 502);
    }

    const lien = rep?.data?.paymentLink;
    if (status !== 200 || !lien) {
      const msg = rep?.error?.message ?? ("Erreur Papi HTTP " + status);
      await admin.from("wallet_deposits").update({
        status: "echoue", note: msg, raw: { brut, frais, erreur: rep },
      }).eq("id", ligne.id);
      return json({ error: msg }, 400);
    }

    await admin.from("wallet_deposits").update({
      note: "En attente du paiement Papi",
      raw: { brut, frais, fraisPct: DEPOSIT_FEE_PCT, creation: rep.data },
    }).eq("id", ligne.id);

    return json({
      reference, paymentLink: lien, shortLink: rep.data.shortLink ?? null,
      isTestMode: !!rep.data.isTestMode, expiresAt: rep.data.linkExpirationDateTime,
      montantPaye: brut, frais, montantCredite: net,
    });
  }

  if (body.action === "check") {
    const reference = String(body.reference ?? "").trim();
    if (!reference) return json({ error: "référence manquante" }, 400);
    const { data: ligne } = await admin.from("wallet_deposits")
      .select("email").eq("provider", "papi").eq("provider_ref", reference).maybeSingle();
    if (!ligne || norm(ligne.email) !== email) return json({ error: "versement introuvable" }, 404);
    const r = await synchroniser(admin, papiToken, reference);
    return json({ reference, etat: r.etat });
  }

  return json({ error: "action inconnue" }, 400);
});
