// Encaisser : l'argent qui vient du dehors entre par ici, et par nulle part
// ailleurs.
//
// Ce n'est pas le navigateur qui appelle cette fonction, c'est le fournisseur
// de paiement — MVola, PayPal, Orange, Airtel — quand il a encaissé. D'où les
// trois règles qui tiennent tout le reste :
//
//   1. On ne croit personne sur parole. La notification doit porter le secret
//      partagé, connu du seul fournisseur et de Supabase. Sans lui, rien
//      n'entre : autrement, une requête écrite à la main créditerait n'importe
//      quel compte de n'importe quelle somme.
//
//   2. Deux fois la même transaction ne vaut qu'une fois. Les fournisseurs
//      répètent leur notification dès qu'ils doutent d'avoir été entendus ;
//      c'est la référence de transaction qui sert de garde, et la base la
//      refuse en double.
//
//   3. Un versement sans destinataire connu n'est pas crédité. Il est
//      enregistré en attente, avec ce qui est arrivé, pour qu'on puisse le
//      rattacher à la main — plutôt que de le donner au hasard.
//
// Déploiement : cette fonction s'appelle SANS jeton d'utilisateur, puisque
// c'est une machine qui l'appelle. Elle doit donc être déployée avec
// --no-verify-jwt, et c'est le secret partagé qui tient la porte.
//
// Secrets à poser dans Supabase (Settings > Edge Functions > Secrets) :
//   WALLET_WEBHOOK_SECRET   le secret partagé avec le fournisseur
//
// Tant qu'aucun fournisseur n'est branché, la fonction est déjà utile : elle
// accepte la forme générique décrite plus bas, ce qui permet de tout vérifier
// — la base, le solde, l'affichage — avant d'avoir le moindre contrat.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-secret-encaisse",
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

// Comparaison à durée constante : comparer deux secrets avec === laisse fuir,
// par le temps de réponse, le nombre de caractères devinés juste.
function memeSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type Versement = {
  provider: string;
  ref: string;
  amountAr: number;
  email: string;
  status: "confirme" | "en_attente" | "refuse";
};

// Chaque fournisseur parle sa langue. On les traduit tous vers la même forme,
// une fois, ici — le reste de la fonction n'a alors plus à savoir d'où vient
// l'argent.
//
// La forme générique, celle qu'on peut essayer sans contrat :
//   { "provider": "essai", "ref": "T-1", "amountAr": 5000,
//     "email": "client@exemple.mg", "status": "confirme" }
function normaliser(brut: Record<string, unknown>): Versement | null {
  const provider = norm(brut.provider) || "inconnu";

  // ---- La forme générique ----
  const ref = String(brut.ref ?? brut.transactionId ?? brut.id ?? "").trim();
  const montant = Math.round(Number(brut.amountAr ?? brut.amount ?? 0));
  const email = norm(brut.email ?? brut.payerEmail);
  const etatBrut = norm(brut.status ?? "confirme");

  if (!ref || !Number.isFinite(montant) || montant <= 0) return null;

  // Les fournisseurs n'appellent pas « confirmé » de la même façon.
  const confirme = ["confirme", "confirmed", "completed", "success", "succeeded", "paid"];
  const refuse = ["refuse", "refused", "failed", "cancelled", "canceled", "reversed", "refunded"];
  const status: Versement["status"] = confirme.includes(etatBrut)
    ? "confirme"
    : refuse.includes(etatBrut)
    ? "refuse"
    : "en_attente";

  return { provider, ref, amountAr: montant, email, status };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode refusée" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const secret = Deno.env.get("WALLET_WEBHOOK_SECRET") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ error: "configuration incomplète" }, 500);
  // Pas de secret posé, pas de porte ouverte. Un secret vide accepterait tout.
  if (!secret) return json({ error: "secret absent : rien n'est encaissé" }, 503);

  const donne = req.headers.get("x-secret-encaisse") ?? "";
  if (!memeSecret(donne, secret)) return json({ error: "notification refusée" }, 401);

  let brut: Record<string, unknown> = {};
  try {
    brut = await req.json();
  } catch {
    return json({ error: "corps de requête illisible" }, 400);
  }

  const v = normaliser(brut);
  if (!v) return json({ error: "notification incomplète : référence ou montant manquant" }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  // Le destinataire doit exister. Un versement adressé à un compte inconnu
  // reste en attente : on le garde, on ne le donne pas.
  let destinataire = v.email;
  let note: string | null = null;
  let status = v.status;
  if (!destinataire) {
    note = "Versement sans email : à rattacher à la main.";
    status = "en_attente";
    destinataire = "";
  }

  // Déjà vu ? On ne crédite pas deux fois. On met seulement l'état à jour :
  // un versement peut être annoncé, puis confirmé, puis remboursé.
  const { data: connu } = await admin.from("wallet_deposits")
    .select("id,status").eq("provider", v.provider).eq("provider_ref", v.ref).maybeSingle();

  if (connu) {
    if (connu.status === status) return json({ ok: true, deja: true, id: connu.id });
    await admin.from("wallet_deposits").update({
      status,
      confirmed_at: status === "confirme" ? new Date().toISOString() : null,
      raw: brut,
    }).eq("id", connu.id);
    return json({ ok: true, misAJour: true, id: connu.id, status });
  }

  const { data: cree, error } = await admin.from("wallet_deposits").insert({
    email: destinataire,
    amount_ar: v.amountAr,
    provider: v.provider,
    provider_ref: v.ref,
    status,
    note,
    raw: brut,
    confirmed_at: status === "confirme" ? new Date().toISOString() : null,
  }).select("id").maybeSingle();

  // Deux notifications arrivées en même temps : l'index unique en refuse une.
  // Ce n'est pas une erreur, c'est exactement ce qu'on lui demande.
  if (error) {
    const { data: apres } = await admin.from("wallet_deposits")
      .select("id").eq("provider", v.provider).eq("provider_ref", v.ref).maybeSingle();
    if (apres) return json({ ok: true, deja: true, id: apres.id });
    return json({ error: "enregistrement impossible" }, 500);
  }

  return json({ ok: true, id: cree?.id ?? null, status });
});
