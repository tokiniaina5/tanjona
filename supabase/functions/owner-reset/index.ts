// Le propriétaire ne doit jamais rester dehors : renvoi de son lien de
// connexion par son propre service d'envoi.
//
// L'envoi intégré de Supabase est très limité (quelques messages par heure sur
// le service par défaut) et finit souvent dans les indésirables : le lien ne
// venait pas, et le propriétaire n'avait aucun moyen de rentrer. Ici le lien
// part par Resend — le même service qui porte déjà les alertes de sécurité, et
// qui, lui, arrive.
//
// Cette fonction n'accepte QUE l'adresse du propriétaire. Elle ne peut donc pas
// servir à inonder la boîte de quelqu'un d'autre, et l'adresse de retour n'est
// jamais celle que l'appelant réclame : un lien de connexion envoyé vers un
// site choisi par un inconnu serait une clé remise à cet inconnu.
//
// Déploiement : voir LISEZ-MOI-SUPABASE.txt, section "Mot de passe oublié du
// propriétaire". À déployer avec --no-verify-jwt : quelqu'un qui a perdu son
// mot de passe n'a, par définition, pas de jeton à présenter.

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

// Deux minutes entre deux envois : de quoi réessayer si le premier message
// tarde, sans laisser personne remplir la boîte du propriétaire.
const SEND_COOLDOWN_MS = 2 * 60 * 1000;
let lastSent = 0;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode refusée" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const ownerEmail = (Deno.env.get("OWNER_EMAIL") ?? "").trim().toLowerCase();
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const from = Deno.env.get("ALERT_FROM") ?? "onboarding@resend.dev";
  // L'adresse de retour est fixée ici, jamais demandée par l'appelant.
  const appUrl = Deno.env.get("APP_URL") ??
    "https://tokiniaina-tanjona.netlify.app/gestion-stockage.html";

  if (!supabaseUrl || !serviceKey || !ownerEmail) {
    return json({ error: "configuration incomplète (SUPABASE_SERVICE_ROLE_KEY / OWNER_EMAIL)" }, 500);
  }
  if (!resendKey) return json({ error: "RESEND_API_KEY manquant" }, 500);

  let asked = "";
  try {
    const body = await req.json();
    asked = String(body?.email ?? "").trim().toLowerCase();
  } catch {
    return json({ error: "corps de requête illisible" }, 400);
  }

  // Une adresse qui n'est pas celle du propriétaire repart avec la même
  // réponse qu'un envoi réussi : personne ne peut se servir de cette fonction
  // pour deviner quelle adresse est celle du propriétaire.
  if (asked !== ownerEmail) return json({ sent: true });

  if (Date.now() - lastSent < SEND_COOLDOWN_MS) {
    return json({ sent: false, error: "Un lien vient d'être envoyé. Regardez vos emails, puis réessayez dans deux minutes." }, 429);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: ownerEmail,
    options: { redirectTo: appUrl },
  });

  const link = data?.properties?.action_link ?? "";
  if (error || !link) {
    return json({ sent: false, error: error?.message ?? "lien non généré" }, 500);
  }

  const text = [
    "Bonjour,",
    "",
    "Voici votre lien pour choisir un nouveau mot de passe sur Gestion de Stockage :",
    "",
    link,
    "",
    "Ce lien ne vaut qu'une heure et ne sert qu'une fois. Si vous en avez demandé",
    "plusieurs, seul le dernier reçu fonctionne.",
    "",
    "Vous n'avez rien demandé ? Ne cliquez pas : votre mot de passe actuel reste",
    "valable tant que ce lien n'est pas ouvert.",
    "",
    Deno.env.get("OWNER_NAME") ?? "",
  ].join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [ownerEmail],
      subject: "Votre lien de connexion — Gestion de Stockage",
      text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return json({ sent: false, error: "envoi refusé", detail }, 502);
  }

  lastSent = Date.now();
  return json({ sent: true });
});
