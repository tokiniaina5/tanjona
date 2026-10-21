// Les vidéos du fil partent chez Cloudflare R2, et non plus dans Supabase.
//
// Supabase fait payer chaque octet servi (« Cached Egress », 5 Go par mois
// en gratuit) : en octobre 2026, les vidéos du fil en servaient 1,3 Go par
// jour, et le quota était dépassé du double. R2, lui, ne fait pas payer ce
// qu'il sert.
//
// La page ne tient aucune clé R2. Elle demande ici une adresse d'envoi signée
// (PUT, valable dix minutes, pour un nom tiré ici), y envoie le fichier tout
// droit, puis garde l'adresse publique dans le billet. La clé secrète ne
// quitte jamais cette fonction.
//
// Déploiement : comme le bucket « annonce-video » d'avant, quiconque écrit
// dans le fil peut joindre une vidéo, connecté ou non. Donc
//   supabase functions deploy video-r2 --no-verify-jwt
//
// Secrets attendus (supabase secrets set ...) :
//   R2_ACCOUNT_ID         identifiant du compte Cloudflare
//   R2_ACCESS_KEY_ID      clé d'API R2 (Object Read & Write sur le bucket)
//   R2_SECRET_ACCESS_KEY  sa partie secrète
//   R2_BUCKET             nom du bucket (ex. ny-asako-video)
//   R2_PUBLIC_URL         adresse publique du bucket (https://pub-….r2.dev)
//
// Le ménage des vieilles vidéos (trente jours, comme les billets) se règle
// dans R2 même : « Object lifecycle rules » du bucket.

import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Même plafond que la page (MAX_VIDEO_MO dans parametres.js).
const MAX_OCTETS = 25 * 1024 * 1024;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode refusée" }, 405);

  const compte = Deno.env.get("R2_ACCOUNT_ID") ?? "";
  const cle = Deno.env.get("R2_ACCESS_KEY_ID") ?? "";
  const secret = Deno.env.get("R2_SECRET_ACCESS_KEY") ?? "";
  const bucket = Deno.env.get("R2_BUCKET") ?? "";
  const publique = (Deno.env.get("R2_PUBLIC_URL") ?? "").replace(/\/+$/, "");
  if (!compte || !cle || !secret || !bucket || !publique) {
    return json({ error: "r2_tsy_vonona" }, 503);
  }

  let corps: { ext?: string; type?: string; taille?: number } = {};
  try { corps = await req.json(); } catch (_) { /* corps vide */ }
  const type = String(corps.type || "video/mp4");
  if (!/^video\/[a-z0-9.+-]+$/i.test(type)) return json({ error: "video ihany" }, 400);
  const taille = Number(corps.taille) || 0;
  if (taille <= 0 || taille > MAX_OCTETS) return json({ error: "lehibe loatra" }, 400);
  const ext = String(corps.ext || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "mp4";

  const nom = new Date().toISOString().slice(0, 7) + "/" + crypto.randomUUID() + "." + ext;
  const r2 = new AwsClient({ accessKeyId: cle, secretAccessKey: secret, service: "s3", region: "auto" });
  const cible = new URL("https://" + compte + ".r2.cloudflarestorage.com/" + bucket + "/" + nom);
  cible.searchParams.set("X-Amz-Expires", "600");
  const signe = await r2.sign(new Request(cible, { method: "PUT", headers: { "Content-Type": type } }), {
    aws: { signQuery: true },
  });

  return json({ envoi: signe.url, url: publique + "/" + nom, type: type });
});
