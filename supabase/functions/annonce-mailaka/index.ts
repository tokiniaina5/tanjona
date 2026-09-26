// L'annonce part vraiment chez les clients, par email.
//
// Le reste du partage ouvre des fenêtres : WhatsApp, Facebook, Telegram
// s'ouvrent avec le message écrit, et c'est le propriétaire qui appuie sur
// « Envoyer ». Aucune page web ne peut envoyer un message WhatsApp à sa
// place — ni pour un client, ni pour cent.
//
// L'email, lui, part d'ici : le serveur a la boîte du propriétaire (SMTP
// Gmail, les mêmes secrets que « commun-code »), et la liste des clients
// inscrits (client_signups). Une seule pression, et chacun le reçoit dans sa
// boîte, sans rien à ouvrir ni à recopier.
//
// Les adresses voyagent en copie cachée : un client ne doit pas apprendre
// qui sont les autres clients. Elles partent par paquets, parce qu'un serveur
// SMTP refuse une liste trop longue d'un coup.
//
// Réservé au propriétaire : c'est son carnet d'adresses, et une annonce
// envoyée à tout le monde ne se rattrape pas.
//
// Secrets attendus (Supabase > Edge Functions > Secrets) :
//   GMAIL_USER, GMAIL_APP_PASSWORD, OWNER_EMAIL, OWNER_NAME, APP_URL.
//
// Déploiement : supabase functions deploy annonce-mailaka
// (AVEC vérification du jeton : seul le propriétaire connecté peut appeler.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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

// Gmail ferme la porte quand on lui pousse des centaines d'adresses en une
// fois. Quarante par message passent sans peine, et une annonce dépasse
// rarement quelques centaines de clients.
const PAR_PAQUET = 40;

// Un envoi à tout le carnet ne se retire pas. Deux clics trop rapides, une
// page rechargée, et l'annonce partait deux fois : on attend une minute.
const REPOS_MS = 60 * 1000;
let dernierEnvoi = 0;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode refusée" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const ownerEmail = (Deno.env.get("OWNER_EMAIL") ?? "").trim().toLowerCase();
  const gmail = Deno.env.get("GMAIL_USER") ?? "";
  const motDePasse = (Deno.env.get("GMAIL_APP_PASSWORD") ?? "").replace(/\s+/g, "");
  const nom = Deno.env.get("OWNER_NAME") ?? "Ny asako";

  if (!supabaseUrl || !serviceKey || !ownerEmail) {
    return json({ error: "configuration incomplète (SUPABASE_SERVICE_ROLE_KEY / OWNER_EMAIL)" }, 500);
  }
  if (!gmail || !motDePasse) {
    return json({ error: "GMAIL_USER / GMAIL_APP_PASSWORD tsy voafaritra" }, 500);
  }

  // 1) l'appelant est-il le propriétaire ?
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return json({ error: "non authentifié" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: appelant, error: erreurAppelant } = await admin.auth.getUser(token);
  const emailAppelant = appelant?.user?.email?.trim().toLowerCase() ?? "";
  if (erreurAppelant || emailAppelant !== ownerEmail) {
    return json({ error: "réservé au propriétaire" }, 403);
  }

  let texte = "";
  let rohy = "";
  let sujet = "";
  try {
    const corps = await req.json();
    texte = String(corps?.texte ?? "").trim();
    rohy = String(corps?.rohy ?? "").trim();
    sujet = String(corps?.sujet ?? "").trim();
  } catch {
    return json({ error: "corps de requête illisible" }, 400);
  }
  if (!texte && !rohy) return json({ error: "hafatra foana" }, 400);

  if (Date.now() - dernierEnvoi < REPOS_MS) {
    return json({ error: "vao nandefa ianao : andraso iray minitra" }, 429);
  }

  // 2) les clients inscrits, une adresse chacun
  const { data: lignes, error: erreurListe } = await admin
    .from("client_signups").select("email").limit(5000);
  if (erreurListe) return json({ error: erreurListe.message }, 500);

  const vus = new Set<string>();
  const adresses: string[] = [];
  for (const l of lignes ?? []) {
    const e = String(l?.email ?? "").trim().toLowerCase();
    if (!e || e.indexOf("@") < 1 || vus.has(e)) continue;
    // Le propriétaire reçoit déjà la copie : il est en « to » de chaque envoi.
    if (e === ownerEmail) continue;
    vus.add(e);
    adresses.push(e);
  }
  if (!adresses.length) return json({ total: 0, sent: 0, error: "tsy misy client manana email" });

  const corpsTexte = [texte, rohy].filter(Boolean).join("\n\n");
  const titre = sujet || "Vaovao ao amin'ny Ny asako";

  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: gmail, password: motDePasse },
    },
  });

  let envoyes = 0;
  let erreur = "";
  try {
    for (let i = 0; i < adresses.length; i += PAR_PAQUET) {
      const paquet = adresses.slice(i, i + PAR_PAQUET);
      await client.send({
        from: `${nom} <${gmail}>`,
        // En « to », le propriétaire lui-même : un message doit avoir un
        // destinataire visible, et les clients restent en copie cachée.
        to: gmail,
        bcc: paquet,
        subject: titre,
        content: corpsTexte,
      });
      envoyes += paquet.length;
    }
  } catch (e) {
    erreur = `SMTP : ${e instanceof Error ? e.message : String(e)}`;
  }
  try { await client.close(); } catch { /* déjà fermé */ }

  if (envoyes > 0) dernierEnvoi = Date.now();
  return json({ total: adresses.length, sent: envoyes, error: erreur });
});
