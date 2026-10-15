// Fidirana amin'ny anarana : entrer dans le Fokontany avec son nom.
//
// La page n'envoie que le nom et le mot de passe. Ici (clé de service), on
// retrouve les emails portant ce nom (supabase-fiditra-anarana.sql), puis on
// essaie le mot de passe sur chacun : le premier qui ouvre rend sa session.
// Deux personnes du même nom ne se gênent donc pas, et aucun email ne sort
// d'ici tant que le mot de passe n'est pas juste.
//
// Déploiement : supabase functions deploy fiditra-anarana --no-verify-jwt
// (SANS vérification du jeton : on n'est pas encore connecté.)

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

  // Le nom complet (anarana), ou le nom de famille seul (farany) : la page
  // du Fokontany ne demande plus que celui-ci.
  let anarana = "";
  let farany = "";
  let mdp = "";
  try {
    const corps = await req.json();
    anarana = String(corps?.anarana ?? "").trim().slice(0, 120);
    farany = String(corps?.farany ?? "").trim().slice(0, 120);
    mdp = String(corps?.mdp ?? "");
  } catch {
    return json({ error: "corps de requête illisible" }, 400);
  }
  if ((!anarana && !farany) || !mdp) return json({ ok: false });

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: emails, error } = farany
    ? await admin.rpc("emails_avy_farany", { p_farany: farany })
    : await admin.rpc("emails_avy_anarana", { p_anarana: anarana });
  if (error) return json({ error: error.message }, 502);

  // Un nom inconnu et un mot de passe faux répondent pareil : rien ne dit
  // au curieux si le nom existe.
  for (const email of (emails ?? []) as string[]) {
    const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data, error: e } = await client.auth.signInWithPassword({ email, password: mdp });
    if (!e && data?.session) {
      return json({
        ok: true,
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
    }
    if (e && /email not confirmed/i.test(e.message)) {
      return json({ ok: false, antony: "tsy_voamarina" });
    }
  }
  return json({ ok: false });
});
