// Quelqu'un demande à entrer dans « Administratif Fokontany » : l'inscrire, et le dire.
//
// La demande s'écrivait jusqu'ici directement depuis le navigateur : elle
// attendait sagement dans la table, et le propriétaire ne l'apprenait qu'en
// ouvrant l'onglet. Une demande qu'on n'apprend pas est une demande qui
// n'aboutit pas.
//
// Cette fonction pose la demande (clé de service) et prévient le
// propriétaire par email. Elle n'accepte que l'adresse de la personne
// connectée : on ne demande pas au nom d'un autre.
//
// Déploiement : supabase functions deploy commun-angataka

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function nouveauCode(): string {
  // Même alphabet que commun-code : ni O/0, ni I/1.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const octets = new Uint8Array(8);
  crypto.getRandomValues(octets);
  return Array.from(octets).map((b) => alphabet[b % alphabet.length]).join("");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function prevenir(dest: string, sujet: string, texte: string): Promise<{ sent: boolean; error: string }> {
  const gmail = Deno.env.get("GMAIL_USER") ?? "";
  const motDePasse = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
  const nom = Deno.env.get("OWNER_NAME") ?? "Ny asako";

  if (gmail && motDePasse) {
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: { username: gmail, password: motDePasse.replace(/\s+/g, "") },
      },
    });
    try {
      await client.send({ from: `${nom} <${gmail}>`, to: dest, subject: sujet, content: texte });
      await client.close();
      return { sent: true, error: "" };
    } catch (e) {
      try { await client.close(); } catch { /* déjà fermé */ }
      return { sent: false, error: `SMTP : ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  // Le service par défaut de Resend ne parle qu'à la boîte de son titulaire —
  // ici, c'est justement le propriétaire qu'on prévient.
  const resend = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!resend) return { sent: false, error: "GMAIL_USER / GMAIL_APP_PASSWORD na RESEND_API_KEY tsy voafaritra" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${resend}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("ALERT_FROM") ?? "onboarding@resend.dev",
      to: [dest],
      subject: sujet,
      text: texte,
    }),
  });
  return res.ok ? { sent: true, error: "" } : { sent: false, error: await res.text() };
}

// Une exception non rattrapée rendait une réponse sans en-têtes CORS : le
// navigateur n'en voyait qu'un « Failed to fetch », la page se rabattait sur
// l'écriture directe, et personne ne savait ce qui avait cassé.
Deno.serve(async (req: Request) => {
  try {
    return await traiter(req);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("commun-angataka", message);
    return json({ error: "erreur interne : " + message }, 500);
  }
});

async function traiter(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode refusée" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const ownerEmail = (Deno.env.get("OWNER_EMAIL") ?? "").trim().toLowerCase();
  if (!supabaseUrl || !serviceKey || !ownerEmail) return json({ error: "configuration incomplète" }, 500);

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return json({ error: "non authentifié" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: appelant, error: erreurAppelant } = await admin.auth.getUser(token);
  const email = appelant?.user?.email?.trim().toLowerCase() ?? "";
  if (erreurAppelant || !email) return json({ error: "non authentifié" }, 401);

  let hafatra = "";
  let anarana = "";
  try {
    const corps = await req.json();
    hafatra = String(corps?.hafatra ?? "").slice(0, 500);
    anarana = String(corps?.anarana ?? "").slice(0, 120);
  } catch {
    return json({ error: "corps de requête illisible" }, 400);
  }

  // Une demande par personne : la relancer ne fait pas une seconde file, elle
  // remet la première en attente.
  const { data: dejaLa } = await admin.from("commun_fangatahana").select("id,statut").ilike("email", email).limit(1);
  const ligne = (dejaLa ?? [])[0];

  const ecrit = ligne
    ? await admin.from("commun_fangatahana").update({
      anarana: anarana || null,
      hafatra: hafatra || null,
      statut: "miandry",
      updated_at: new Date().toISOString(),
    }).eq("id", ligne.id)
    : await admin.from("commun_fangatahana").insert({
      email,
      anarana: anarana || null,
      hafatra: hafatra || null,
    });

  if (ecrit.error) return json({ error: ecrit.error.message }, 502);

  // Le code se tire avec la demande : le propriétaire n'a plus qu'à valider.
  // L'accès est posé actif mais NON confirmé — rien ne s'ouvre tant qu'il n'a
  // pas dit oui. Une personne déjà confirmée garde son accès tel quel.
  const { data: acces } = await admin.from("commun_alalana")
    .select("id,code,active,voamarina").ilike("email", email).limit(1);
  const dejaAcces = (acces ?? [])[0];
  let code = "";
  // Un code déjà tiré et toujours actif se garde, confirmé ou non : redemander
  // en tirait un nouveau, et celui que le propriétaire avait déjà transmis ne
  // correspondait plus — la personne tapait un code juste, refusé.
  if (dejaAcces && dejaAcces.active && dejaAcces.code) {
    code = dejaAcces.code;
  } else {
    code = nouveauCode();
    const pose = dejaAcces
      ? await admin.from("commun_alalana").update({
        code, active: true, voamarina: false, anarana: anarana || null,
        updated_at: new Date().toISOString(),
      }).eq("id", dejaAcces.id)
      : await admin.from("commun_alalana").insert({ email, anarana: anarana || null, code, active: true, voamarina: false });
    if (pose.error) return json({ error: pose.error.message }, 502);
  }

  // Le lien ouvre le site, où le propriétaire doit être connecté : c'est son
  // compte, et non la possession du lien, qui valide. Un lien qui validerait
  // à lui seul serait déclenché par le premier antivirus qui l'ouvre.
  const appUrl = (Deno.env.get("APP_URL") ?? "https://ny-asako.netlify.app/").replace(/\/*$/, "/");
  // Sur l'application du Fokontany (fokontany/), et non sur le stock.
  const lienValider = appUrl + "fokontany/?commun_valider=" + encodeURIComponent(email) + "&c=" + encodeURIComponent(code);

  const texte = [
    "Bonjour,",
    "",
    (anarana ? anarana + " (" + email + ")" : email) + " demande l'accès à « Administratif Fokontany ».",
    "",
    hafatra ? "Message : " + hafatra : "Sans message.",
    "Heure : " + new Date().toLocaleString("fr-FR"),
    "",
    "Code de la demande : " + code,
    "",
    "Pour valider, ouvrez ce lien (connecté à votre compte) puis confirmez :",
    lienValider,
    "",
    "Sinon : « Administratif Fokontany » > onglet « Fangatahana » > « ✅ Hamafiso » ou « Lavina ».",
    "",
    Deno.env.get("OWNER_NAME") ?? "",
  ].join("\n");

  const envoi = await prevenir(ownerEmail, "Demande d'accès à « Administratif Fokontany »", texte);

  if (!envoi.sent) console.error("commun-angataka : mail non parti", envoi.error);
  // Le code ne revient pas à la personne : c'est la validation qui ouvre.
  return json({ ok: true, sent: envoi.sent, error: envoi.error, enAttente: !(dejaAcces && dejaAcces.active && dejaAcces.voamarina) });
}
