// Ce que voit un employé, et rien de plus.
//
// Il n'a pas de compte : il n'a qu'un lien. Le jeton qu'il porte dit qui
// regarde, et c'est la seule chose qui ouvre la porte — d'où sa longueur.
//
// Tout passe par ici plutôt que par la base directement. Une table ouverte
// en lecture à qui n'est pas connecté serait ouverte à tout le monde : le
// stock d'un commerçant se lirait depuis n'importe où. Ici, la clé de
// service reste sur le serveur, et la fonction ne rend que ce qui revient
// au porteur du jeton.
//
// Elle ne sait presque que lire. La seule écriture qu'elle accepte, c'est la
// position du porteur du jeton, et uniquement la sienne : un livreur dit où
// il est, il ne dit rien d'autre et ne parle pour personne. Tout le reste —
// le stock, les courses, les heures — se lit et ne s'écrit pas.
//
// Déploiement : appelée sans jeton d'utilisateur, donc
//   supabase functions deploy mpiasa --no-verify-jwt

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
  if (!supabaseUrl || !serviceKey) return json({ error: "configuration incomplète" }, 500);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "corps de requête illisible" }, 400);
  }

  const jeton = String(body.jeton ?? "").trim();
  // Un jeton court serait un jeton qu'on essaie. On refuse avant même de
  // chercher : inutile d'interroger la base pour une clé qui n'en est pas une.
  if (jeton.length < 32) return json({ error: "lien invalide" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: personne } = await admin.from("equipe")
    .select("id,nom,role,telephone,actif,owner_email")
    .eq("jeton", jeton).maybeSingle();

  // Le même message dans les deux cas : dire « ce lien a existé » en
  // apprendrait plus que nécessaire à qui essaie des jetons au hasard.
  if (!personne) return json({ error: "lien invalide" }, 401);
  // Mise en pause : le lien cesse de répondre, sans qu'on ait à le reprendre.
  if (!personne.actif) return json({ error: "lien suspendu" }, 403);

  const owner = personne.owner_email;

  // ---- « Je suis ici » ----
  // Le téléphone du livreur envoie sa position ; on l'inscrit sous SON
  // identifiant, celui que le jeton désigne. Le corps de la requête ne dit
  // pas de qui il s'agit : il ne pourrait que mentir.
  if (String(body.action ?? "") === "position") {
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    // Des coordonnées hors du monde ne sont pas des coordonnées.
    if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return json({ error: "position illisible" }, 400);
    }
    const precision = Number(body.precision);
    await admin.from("positions").insert({
      owner_email: owner,
      equipe_id: personne.id,
      lat, lng,
      precision_m: Number.isFinite(precision) ? precision : null,
    });
    return json({ ok: true });
  }

  const [stock, livraisons, pointages] = await Promise.all([
    admin.from("stock_partage").select("articles,maj").eq("owner_email", owner).maybeSingle(),
    admin.from("livraisons")
      .select("id,designation,client,adresse,telephone,statut,created_at")
      .eq("owner_email", owner).eq("livreur_id", personne.id)
      .order("created_at", { ascending: false }).limit(50),
    admin.from("pointages")
      .select("arrivee,depart")
      .eq("owner_email", owner).eq("equipe_id", personne.id)
      .order("arrivee", { ascending: false }).limit(30),
  ]);

  return json({
    personne: {
      nom: personne.nom,
      role: personne.role,
      telephone: personne.telephone,
    },
    // Les articles tels que le patron les a laissés à sa dernière ouverture.
    // La date compte autant que la liste : elle dit de quand date ce qu'on
    // regarde, et donc ce qu'on peut en conclure.
    articles: (stock?.data?.articles ?? []),
    stockMaj: stock?.data?.maj ?? null,
    livraisons: livraisons?.data ?? [],
    pointages: pointages?.data ?? [],
  });
});
