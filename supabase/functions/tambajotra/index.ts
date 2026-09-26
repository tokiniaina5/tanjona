// Publier une annonce sur les réseaux depuis le serveur : Telegram, Facebook
// (Page), Threads et X. Voir _shared/tambajotra.ts pour les clefs.
//
//   { action: "canaux" }                          quels réseaux sont prêts
//   { action: "alefa", texte, rohy, reseaux: [] } publier maintenant
//
// Réservé au propriétaire connecté : c'est sa page et son compte qui parlent.
// Déploiement (le jeton est vérifié ici même) :
//   supabase functions deploy tambajotra --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { configures, publier } from "../_shared/tambajotra.ts";

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
  const ownerEmail = (Deno.env.get("OWNER_EMAIL") ?? "").trim().toLowerCase();
  if (!supabaseUrl || !serviceKey || !ownerEmail) return json({ error: "configuration incomplète" }, 500);

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return json({ error: "refusé" }, 401);
  const admin = createClient(supabaseUrl, serviceKey);
  const { data } = await admin.auth.getUser(token);
  if ((data?.user?.email ?? "").trim().toLowerCase() !== ownerEmail) return json({ error: "refusé" }, 401);

  let corps: Record<string, unknown> = {};
  try { corps = await req.json(); } catch { /* vide */ }
  const action = String(corps.action ?? "");

  if (action === "canaux") return json({ canaux: configures() });

  if (action === "alefa") {
    const texte = String(corps.texte ?? "").trim();
    const rohy = String(corps.rohy ?? "").trim();
    const reseaux = Array.isArray(corps.reseaux) ? corps.reseaux.map(String) : [];
    if (!texte && !rohy) return json({ error: "tsy misy hafatra" }, 400);
    return json({ vokatra: await publier(texte, rohy, reseaux) });
  }

  return json({ error: "action inconnue" }, 400);
});
