// Les publications du jour, chez tous les clients, chaque soir à 18 h.
//
// Le partage ouvre des fenêtres (WhatsApp, Facebook…) et c'est le
// propriétaire qui appuie sur « Envoyer » : aucune page ne peut le faire à sa
// place. L'email, lui, part du serveur. Chaque soir, tout ce qui a paru dans
// le fil depuis vingt-quatre heures part donc d'un seul message, chez chaque
// client inscrit — sans que personne n'ait rien à toucher.
//
// Deux façons de l'appeler :
//   — la tâche du soir (pg_cron, supabase-fandefasana-hariva.sql), avec le
//     secret partagé dans « x-secret-hariva » ;
//   — le bouton « 📧 Alefa izao » de la page, avec le jeton du propriétaire
//     connecté, et lui seul.
//
// Les adresses voyagent en copie cachée, par paquets de quarante (voir
// « annonce-mailaka », qui fait la même chose pour une seule annonce).
//
// Secrets attendus (Supabase > Edge Functions > Secrets) :
//   GMAIL_USER, GMAIL_APP_PASSWORD, OWNER_EMAIL, OWNER_NAME, APP_URL
//   VAOVAO_SECRET   (déjà posé pour « vaovao-boutique ») : le mot de passe
//                   de la tâche du soir. HARIVA_SECRET le remplace s'il existe.
//
// Déploiement — c'est une machine qui l'appelle le soir, pas une personne
// connectée, et la fonction vérifie elle-même le jeton du bouton :
//   supabase functions deploy fandefasana-hariva --no-verify-jwt
//
// « essai: true » dans le corps : elle dit ce qu'elle enverrait, sans rien
// envoyer.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-secret-hariva",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function memeSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const PAR_PAQUET = 40;
const FENETRE_MS = 24 * 60 * 60 * 1000;

type Billet = {
  client_name?: string; message?: string; link?: string; price?: number | null;
  type?: string; created_at?: string;
};

function formatAr(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " Ar";
}

// Un billet, quelques lignes : qui, quoi, combien, et son lien s'il en a un.
function leBillet(b: Billet): string {
  const lignes: string[] = [];
  const qui = String(b.client_name ?? "").trim();
  const quoi = String(b.message ?? "").trim();
  lignes.push("• " + (qui ? qui + " : " : "") + (quoi || "(sary / video)"));
  if (b.price) lignes.push("  Vidiny : " + formatAr(Number(b.price)));
  const lien = String(b.link ?? "").trim();
  if (lien && b.type !== "live") lignes.push("  " + lien);
  return lignes.join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode refusée" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const ownerEmail = (Deno.env.get("OWNER_EMAIL") ?? "").trim().toLowerCase();
  const gmail = Deno.env.get("GMAIL_USER") ?? "";
  const motDePasse = (Deno.env.get("GMAIL_APP_PASSWORD") ?? "").replace(/\s+/g, "");
  const nom = Deno.env.get("OWNER_NAME") ?? "Ny asako";
  const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/+$/, "");
  // Le secret de la tâche du soir est celui déjà posé pour les billets des
  // boutiques (VAOVAO_SECRET) : un secret de plus, c'était un de plus à
  // retenir. HARIVA_SECRET, s'il est posé un jour, l'emporte.
  const secret = Deno.env.get("HARIVA_SECRET") || Deno.env.get("VAOVAO_SECRET") || "";

  if (!supabaseUrl || !serviceKey || !ownerEmail) {
    return json({ error: "configuration incomplète (SUPABASE_SERVICE_ROLE_KEY / OWNER_EMAIL)" }, 500);
  }
  if (!gmail || !motDePasse) return json({ error: "GMAIL_USER / GMAIL_APP_PASSWORD tsy voafaritra" }, 500);

  const admin = createClient(supabaseUrl, serviceKey);

  // 1) La porte : le secret de la tâche du soir, ou le propriétaire connecté.
  const secretRecu = req.headers.get("x-secret-hariva") ?? "";
  let autorise = !!secret && !!secretRecu && memeSecret(secretRecu, secret);
  if (!autorise) {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (token) {
      const { data } = await admin.auth.getUser(token);
      autorise = (data?.user?.email ?? "").trim().toLowerCase() === ownerEmail;
    }
  }
  if (!autorise) return json({ error: "refusé" }, 401);

  let essai = false;
  try { essai = (await req.json())?.essai === true; } catch { /* corps vide */ }

  // 2) Ce qui a paru depuis vingt-quatre heures, et qui est encore en ligne.
  const depuis = new Date(Date.now() - FENETRE_MS).toISOString();
  let lecture = await admin.from("client_news")
    .select("client_name,message,link,price,type,created_at")
    .gte("created_at", depuis).is("deleted_at", null)
    .order("created_at", { ascending: true }).limit(200);
  // Sans la colonne deleted_at (supabase-corbeille.sql pas encore passé).
  if (lecture.error) {
    lecture = await admin.from("client_news")
      .select("client_name,message,link,price,type,created_at")
      .gte("created_at", depuis)
      .order("created_at", { ascending: true }).limit(200);
  }
  if (lecture.error) return json({ error: lecture.error.message }, 500);
  const billets = (lecture.data ?? []) as Billet[];
  if (!billets.length) return json({ billets: 0, sent: 0, error: "tsy nisy publication androany" });

  // 3) Les clients, une adresse chacun.
  const { data: lignes, error: erreurListe } = await admin
    .from("client_signups").select("email").limit(5000);
  if (erreurListe) return json({ error: erreurListe.message }, 500);
  const vus = new Set<string>();
  const adresses: string[] = [];
  for (const l of lignes ?? []) {
    const e = String(l?.email ?? "").trim().toLowerCase();
    if (!e || e.indexOf("@") < 1 || vus.has(e) || e === ownerEmail) continue;
    vus.add(e);
    adresses.push(e);
  }

  const corps = [
    "Ireto ny vaovao rehetra tao amin'ny Botika androany :",
    "",
    billets.map(leBillet).join("\n\n"),
    "",
    appUrl ? "Jereo ao amin'ny Botika : " + appUrl + "/botika/" : "",
  ].join("\n").trim();
  const sujet = "Vaovao " + billets.length + " ao amin'ny Botika androany";

  if (essai) return json({ essai: true, billets: billets.length, clients: adresses.length, sujet, corps });
  if (!adresses.length) return json({ billets: billets.length, sent: 0, error: "tsy misy client manana email" });

  const client = new SMTPClient({
    connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: gmail, password: motDePasse } },
  });
  let envoyes = 0;
  let erreur = "";
  try {
    for (let i = 0; i < adresses.length; i += PAR_PAQUET) {
      const paquet = adresses.slice(i, i + PAR_PAQUET);
      await client.send({ from: `${nom} <${gmail}>`, to: gmail, bcc: paquet, subject: sujet, content: corps });
      envoyes += paquet.length;
    }
  } catch (e) {
    erreur = `SMTP : ${e instanceof Error ? e.message : String(e)}`;
  }
  try { await client.close(); } catch { /* déjà fermé */ }

  return json({ billets: billets.length, total: adresses.length, sent: envoyes, error: erreur });
});
