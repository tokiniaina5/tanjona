// Le ménage des vidéos d'annonces.
//
// Le billet qui porte une vidéo vit trente jours, puis s'efface. Une vidéo
// plus vieille que cela n'est plus affichée nulle part : elle occupe de la
// place et ne sert plus à personne. Personne ne l'efface pour autant — le
// navigateur n'a pas le droit de supprimer dans ce bucket, et c'est voulu :
// connaître une adresse ne doit pas donner le droit d'effacer la vidéo d'un
// autre.
//
// Cette fonction-ci l'a, ce droit, parce qu'elle tient la clef de service et
// qu'elle ne s'appelle pas depuis une page.
//
// LE CHIFFRE EST CELUI DE LA VIE DU BILLET, et non celui du fil. Trente
// jours ici, trente jours dans "supabase-menage-publications.sql" : si la
// vidéo part avant le billet, l'annonce reste affichée avec une vidéo qui ne
// charge plus ; si elle part après, on garde pour rien.
//
// Sept jours, c'était la fenêtre de l'Accueil. Mais la page « botika », elle,
// montre le mois entier : une vidéo de dix jours y était encore réclamée, et
// n'existait déjà plus.
//
// RETENTION_JOURS le tient d'un seul endroit, et se règle par secret.
//
// Déploiement : c'est une machine qui l'appelle, jamais une personne
// connectée. Donc
//   supabase functions deploy menage-video --no-verify-jwt
// et c'est le secret partagé qui tient la porte.
//
// Secrets attendus :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (déjà posés)
//   MENAGE_SECRET        le mot de passe de la porte
//   RETENTION_JOURS      facultatif, 30 par défaut
//
// « essai: true » dans le corps : elle dit ce qu'elle effacerait, sans rien
// effacer. À essayer avant de la laisser courir toute seule.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-secret-menage",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Comparaison à durée constante : comparer deux secrets avec === laisse
// fuir, par le temps de réponse, le nombre de caractères devinés juste.
function memeSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const BUCKET = "annonce-video";
const RETENTION_JOURS = Number(Deno.env.get("RETENTION_JOURS") ?? "30");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode refusée" }, 405);

  const secret = Deno.env.get("MENAGE_SECRET") ?? "";
  // Pas de secret posé, pas de porte ouverte. Un secret vide accepterait
  // tout le monde — et cette fonction-ci efface.
  if (!secret) return json({ error: "secret absent : rien n'est effacé" }, 503);
  if (!memeSecret(req.headers.get("x-secret-menage") ?? "", secret)) {
    return json({ error: "refusé" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ error: "configuration incomplète" }, 500);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }
  const essai = body.essai === true;

  const admin = createClient(supabaseUrl, serviceKey);
  const limite = Date.now() - RETENTION_JOURS * 24 * 60 * 60 * 1000;

  // Le bucket se lit par pages : mille fichiers d'un coup au plus, et l'on
  // recommence tant qu'il en vient autant. Sans cela, le ménage s'arrêterait
  // au millième et le reste dormirait pour toujours.
  const aEffacer: string[] = [];
  let vus = 0;
  let page = 0;
  while (page < 50) {
    const { data, error } = await admin.storage.from(BUCKET).list("", {
      limit: 1000,
      offset: page * 1000,
      sortBy: { column: "created_at", order: "asc" },
    });
    if (error) return json({ error: error.message }, 500);
    const lot = data ?? [];
    if (!lot.length) break;
    vus += lot.length;
    for (const f of lot) {
      // Sans date, on ne touche pas : on n'efface pas ce qu'on ne sait pas
      // dater. Un fichier douteux se regarde à la main.
      const d = f.created_at ? Date.parse(f.created_at) : NaN;
      if (!Number.isFinite(d)) continue;
      if (d < limite) aEffacer.push(f.name);
    }
    if (lot.length < 1000) break;
    page++;
  }

  if (essai) {
    return json({ essai: true, vus, retenus: aEffacer.length, retentionJours: RETENTION_JOURS, noms: aEffacer.slice(0, 50) });
  }
  if (!aEffacer.length) {
    return json({ vus, effaces: 0, retentionJours: RETENTION_JOURS });
  }

  // Par paquets de cent : une liste trop longue se fait refuser en entier, et
  // l'on n'effacerait rien du tout.
  let effaces = 0;
  const soucis: string[] = [];
  for (let i = 0; i < aEffacer.length; i += 100) {
    const paquet = aEffacer.slice(i, i + 100);
    const { data, error } = await admin.storage.from(BUCKET).remove(paquet);
    if (error) { soucis.push(error.message); continue; }
    effaces += (data ?? []).length;
  }

  return json({ vus, effaces, retentionJours: RETENTION_JOURS, soucis });
});
