// Déblocage d'un client par le propriétaire : nouveau code envoyé par mail.
//
// Le propriétaire clique sur « Débloquer et envoyer un nouveau code » dans son
// espace admin. Cette fonction, elle seule, a le droit de changer le mot de
// passe d'un compte (clé de service, jamais exposée au navigateur) :
//   1. elle vérifie que l'appelant est bien le propriétaire ;
//   2. elle tire un code au hasard et le pose comme nouveau mot de passe ;
//   3. elle lève le blocage du compte ;
//   4. elle envoie le code au client par email.
// Le client se connecte avec ce code, puis choisit le sien dans Paramètres.
//
// Déploiement : voir LISEZ-MOI-SUPABASE.txt, section "Déblocage par le
// propriétaire". À déployer AVEC vérification du jeton (pas de
// --no-verify-jwt) : c'est ce qui empêche n'importe qui de l'appeler.

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

function newCode(): string {
  // 8 caractères sans lettres ambiguës (ni O/0, ni I/1)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => alphabet[b % alphabet.length]).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const ownerEmail = (Deno.env.get("OWNER_EMAIL") ?? "").trim().toLowerCase();
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const from = Deno.env.get("ALERT_FROM") ?? "onboarding@resend.dev";

  if (!supabaseUrl || !serviceKey || !ownerEmail) {
    return json({ error: "configuration incomplète (SUPABASE_SERVICE_ROLE_KEY / OWNER_EMAIL)" }, 500);
  }

  // 1) l'appelant est-il le propriétaire ?
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return json({ error: "non authentifié" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  const callerEmail = caller?.user?.email?.trim().toLowerCase() ?? "";
  if (callerError || callerEmail !== ownerEmail) {
    return json({ error: "réservé au propriétaire" }, 403);
  }

  let target = "";
  try {
    const body = await req.json();
    target = (body.email ?? "").trim().toLowerCase();
  } catch {
    return json({ error: "corps de requête illisible" }, 400);
  }
  if (!target) return json({ error: "email du client manquant" }, 400);

  // 2) retrouver le compte du client
  let userId = "";
  for (let page = 1; page <= 20 && !userId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return json({ error: error.message }, 502);
    const found = data.users.find((u) => (u.email ?? "").trim().toLowerCase() === target);
    if (found) userId = found.id;
    if (data.users.length < 200) break;
  }
  if (!userId) return json({ error: "aucun compte avec cet email" }, 404);

  // 3) nouveau code = nouveau mot de passe
  const code = newCode();
  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    password: code,
    email_confirm: true,
  });
  if (updateError) return json({ error: updateError.message }, 502);

  // 4) lever le blocage
  await admin.from("blocked_accounts")
    .update({ active: false, released_at: new Date().toISOString() })
    .eq("email", target);

  // 5) envoyer le code au client
  let mailSent = false;
  let mailError = "";
  if (resendKey) {
    const text = [
      "Bonjour,",
      "",
      "Votre accès à Gestion de Stockage a été rétabli.",
      "",
      "Votre nouveau code de connexion : " + code,
      "",
      "Connectez-vous avec votre email et ce code, puis choisissez votre",
      "propre code dans Paramètres > Mon profil > « Nouveau mot de passe ».",
      "",
      Deno.env.get("OWNER_NAME") ?? "",
    ].join("\n");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [target],
        subject: "Votre nouveau code — Gestion de Stockage",
        text,
      }),
    });
    mailSent = res.ok;
    if (!res.ok) mailError = await res.text();
  } else {
    mailError = "RESEND_API_KEY manquant";
  }

  // Le code est renvoyé au propriétaire : si le mail n'est pas parti, il peut
  // le transmettre lui-même plutôt que de laisser le client dehors.
  return json({ released: true, mailSent, mailError, code });
});
