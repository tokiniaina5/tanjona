// Ce que voit le client qui attend sa livraison.
//
// Il n'a pas de compte et n'en aura jamais : il a reçu un lien par SMS.
// Le jeton dedans désigne UNE course, et la fonction ne rend que ce qui
// concerne cette course-là.
//
// Elle ne sait que lire. Aucun chemin d'écriture n'existe ici : un client
// regarde arriver son colis, il ne touche à rien.
//
// Ce qu'elle ne dit pas, volontairement :
//   — le téléphone du livreur (le client appelle le commerçant, pas lui) ;
//   — les autres courses, les autres clients, le stock ;
//   — la position, une fois la course terminée ou annulée. Suivre quelqu'un
//     après la livraison ne sert plus le client : ce serait suivre un
//     travailleur pour rien.
//
// Déploiement : appelée sans jeton d'utilisateur, donc
//   supabase functions deploy suivi --no-verify-jwt

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

// Une course finie ou annulée ne montre plus personne sur la carte.
const TERMINEES = ["tonga", "foana"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode refusée" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ error: "configuration incomplète" }, 500);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "corps de requête illisible" }, 400);
  }

  const jeton = String(body.jeton ?? "").trim();
  // Un jeton court est un jeton qu'on devine. On refuse avant de chercher.
  if (jeton.length < 32) return json({ error: "lien invalide" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: course } = await admin.from("livraisons")
    .select("id,owner_email,designation,client,statut,livreur_id,livreur_nom,created_at,updated_at")
    .eq("jeton", jeton).maybeSingle();

  if (!course) return json({ error: "lien invalide" }, 401);

  const owner = course.owner_email;

  // La clé de la carte voyage avec la réponse : le téléphone du client ne
  // la connaît pas et n'a aucun moyen de la connaître autrement.
  const { data: reglages } = await admin.from("reglages")
    .select("cle_maps").eq("owner_email", owner).maybeSingle();

  let position = null;
  if (course.livreur_id && !TERMINEES.includes(String(course.statut))) {
    const { data: derniere } = await admin.from("positions")
      .select("lat,lng,precision_m,at")
      .eq("owner_email", owner).eq("equipe_id", course.livreur_id)
      .order("at", { ascending: false }).limit(1).maybeSingle();
    position = derniere ?? null;
  }

  return json({
    entana: course.designation,
    client: course.client,
    statut: course.statut,
    // Le prénom du livreur suffit à savoir qui frappe à la porte.
    livreur: course.livreur_nom ?? null,
    position,
    cle: reglages?.cle_maps ?? null,
    maj: course.updated_at ?? course.created_at,
  });
});
