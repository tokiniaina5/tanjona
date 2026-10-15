// Kaonty vaovao tsy misy email : s'inscrire au Fokontany avec son nom seul.
//
// Supabase veut un email pour chaque compte : on lui en donne un, interne,
// que personne ne voit ni ne reçoit (fk-xxxx@fokontany.invalid), et le compte
// naît déjà confirmé — il n'y a aucune boîte où cliquer un lien. La personne
// entre ensuite avec son nom et son mot de passe (fonction fiditra-anarana).
//
// Le nom doit être libre : deux comptes du même nom ne se distingueraient plus
// qu'au mot de passe. Sans email, « Adino ny mot de passe » ne peut rien pour
// ces comptes : c'est le propriétaire qui le refait.
//
// Déploiement : supabase functions deploy fokontany-hisoratra --no-verify-jwt
// (SANS vérification du jeton : on n'a pas encore de compte.)

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode refusée" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ error: "configuration incomplète" }, 500);
  }

  let anarana = "";
  let voalohany = "";
  let farany = "";
  let finday = "";
  let mdp = "";
  try {
    const corps = await req.json();
    anarana = String(corps?.anarana ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
    // Le nom de famille à part : on entre ensuite avec lui seul (fiditra-anarana).
    voalohany = String(corps?.voalohany ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
    farany = String(corps?.farany ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
    finday = String(corps?.finday ?? "").trim().slice(0, 40);
    mdp = String(corps?.mdp ?? "");
  } catch {
    return json({ error: "corps de requête illisible" }, 400);
  }
  if (anarana.length < 2) return json({ ok: false, antony: "anarana" });
  if (mdp.length < 6) return json({ ok: false, antony: "mdp" });

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: efaMisy, error: e1 } = await admin.rpc("emails_avy_anarana", { p_anarana: anarana });
  if (e1) return json({ error: e1.message }, 502);
  if ((efaMisy ?? []).length > 0) return json({ ok: false, antony: "efa_misy" });

  const email = "fk-" + crypto.randomUUID().replace(/-/g, "").slice(0, 16) + "@fokontany.invalid";
  const { error: e2 } = await admin.auth.admin.createUser({
    email,
    password: mdp,
    email_confirm: true,
    user_metadata: {
      name: anarana, first_name: voalohany || null, last_name: farany || null,
      phone: finday, tsy_misy_email: true,
    },
  });
  if (e2) return json({ ok: false, error: e2.message }, 502);

  // La même trace qu'une inscription dans Ny asako : le propriétaire la voit.
  await admin.from("client_signups").insert({ name: anarana, email, phone: finday || null });

  const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data, error: e3 } = await client.auth.signInWithPassword({ email, password: mdp });
  if (e3 || !data?.session) return json({ ok: true, session: false });
  return json({
    ok: true,
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
});
