// Accorder l'entrée de « Administratif Fokontany », et l'envoyer par email.
//
// Le propriétaire presse « Omeo code » ; cette fonction, elle seule, écrit
// l'accès (clé de service, jamais exposée au navigateur) :
//   1. elle vérifie que l'appelant est bien le propriétaire ;
//   2. elle tire un code au hasard et le pose comme accès de la personne ;
//   3. elle marque la demande comme acceptée ;
//   4. elle envoie à la personne le code ET un lien qui ouvre la page sans
//      qu'elle ait rien à recopier.
//
// L'envoi passe par le SMTP du propriétaire (Gmail), parce que le service par
// défaut de Resend ne parle qu'à la boîte de son titulaire : un code qui
// n'arrive pas chez le client ne sert à rien. Resend reste le recours quand
// le SMTP n'est pas renseigné.
//
// Secrets attendus (Supabase > Edge Functions > Secrets) :
//   GMAIL_USER, GMAIL_APP_PASSWORD  — l'adresse et le mot de passe
//                                     d'application Google ;
//   APP_URL                         — l'adresse du site ;
//   OWNER_EMAIL, OWNER_NAME.
//
// Déploiement : supabase functions deploy commun-code
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

function nouveauCode(): string {
  // 8 caractères sans lettres ambiguës (ni O/0, ni I/1) : il sera lu à l'écran
  // et parfois recopié à la main.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const octets = new Uint8Array(8);
  crypto.getRandomValues(octets);
  return Array.from(octets).map((b) => alphabet[b % alphabet.length]).join("");
}

async function envoyer(dest: string, sujet: string, texte: string): Promise<{ sent: boolean; error: string }> {
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

  // Le recours : il ne parle qu'à la boîte du titulaire du compte Resend.
  const resend = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!resend) return { sent: false, error: "GMAIL_USER / GMAIL_APP_PASSWORD tsy voafaritra" };
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode refusée" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const ownerEmail = (Deno.env.get("OWNER_EMAIL") ?? "").trim().toLowerCase();
  const appUrl = (Deno.env.get("APP_URL") ?? "https://ny-asako.netlify.app/").replace(/\/*$/, "/");

  if (!supabaseUrl || !serviceKey || !ownerEmail) {
    return json({ error: "configuration incomplète (SUPABASE_SERVICE_ROLE_KEY / OWNER_EMAIL)" }, 500);
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

  let cible = "";
  let anarana = "";
  // La lettre de demande, écrite par le propriétaire pour un fokontany
  // nouveau : le message part alors chez LUI, et non chez le fokontany —
  // c'est lui qui transmettra le code. Le reste ne bouge pas.
  let pourLeProprietaire = false;
  let lettre = "";
  try {
    const corps = await req.json();
    cible = String(corps?.email ?? "").trim().toLowerCase();
    anarana = String(corps?.anarana ?? "").trim();
    pourLeProprietaire = corps?.pour_le_proprietaire === true;
    lettre = String(corps?.lettre ?? "").trim();
  } catch {
    return json({ error: "corps de requête illisible" }, 400);
  }
  if (!cible || cible.indexOf("@") < 0) return json({ error: "email manquant" }, 400);

  // 2) le code, posé comme accès de la personne
  const code = nouveauCode();
  const { data: dejaLa } = await admin.from("commun_alalana").select("id").ilike("email", cible).limit(1);
  const ligne = (dejaLa ?? [])[0];

  const ecrit = ligne
    ? await admin.from("commun_alalana")
      .update({ code, active: true, anarana: anarana || null, updated_at: new Date().toISOString() })
      .eq("id", ligne.id)
    : await admin.from("commun_alalana").insert({ email: cible, anarana: anarana || null, code });

  if (ecrit.error) return json({ error: ecrit.error.message }, 502);

  // Un fokontany nouveau — un email qu'on n'avait pas — vaut 500 000 Ar au
  // portefeuille du propriétaire. Le solde n'est pas une colonne qu'on
  // incrémente : il se déduit des versements (wallet_deposits), et seule
  // cette fonction, qui tient la clé de service, peut en écrire un.
  // « provider_ref » est l'email : l'index unique empêche de créditer deux
  // fois le même fokontany, même si l'on redemande un code.
  const VALEUR_FOKONTANY = 500000;
  let credite = false;
  if (pourLeProprietaire && !ligne) {
    const versement = await admin.from("wallet_deposits").insert({
      email: ownerEmail,
      amount_ar: VALEUR_FOKONTANY,
      provider: "fokontany",
      provider_ref: cible,
      status: "confirme",
      confirmed_at: new Date().toISOString(),
      note: "Fokontany vaovao : " + (anarana || cible),
    });
    credite = !versement.error;
  }

  // 3) la demande, marquée acceptée
  await admin.from("commun_fangatahana")
    .update({ statut: "ekena", updated_at: new Date().toISOString() })
    .ilike("email", cible);

  // 4) le message : le lien d'abord, le code ensuite pour qui préfère le
  // recopier — ou pour qui ouvre le site sur un autre appareil.
  // Il ouvre l'application du Fokontany (fokontany/), et non le stock.
  const lien = appUrl + "fokontany/?commun=" + encodeURIComponent(code);
  const texte = [
    "Bonjour,",
    "",
    "Votre accès à la page « Administratif Fokontany » est ouvert.",
    "",
    "Ouvrez ce lien : la page s'ouvre sans rien à recopier.",
    lien,
    "",
    "Votre code, si vous préférez le saisir vous-même : " + code,
    "",
    "Ce code ne vaut que pour votre compte, et vous seul pouvez vous en servir.",
    "",
    Deno.env.get("OWNER_NAME") ?? "",
  ].join("\n");

  const texteProprietaire = [
    "Bonjour,",
    "",
    "Demande d'accès à « Administratif Fokontany » :",
    "",
    lettre || anarana || cible,
    "",
    "Email qui ouvrira le site : " + cible,
    "",
    "Code à lui transmettre : " + code,
    "",
    "Son lien, à lui donner une fois l'accès confirmé :",
    lien,
    "",
    "Il reste à confirmer l'accès (« ✅ Hamafiso » ou « 🔓 Sokafy ny pejy »).",
    credite ? "" : null,
    credite ? "Fokontany nouveau : " + VALEUR_FOKONTANY.toLocaleString("fr-FR") +
      " Ar sont entrés dans votre portefeuille." : null,
  ].filter((l) => l !== null).join("\n");

  const envoi = pourLeProprietaire
    ? await envoyer(ownerEmail, "Demande d'accès à « Administratif Fokontany » — " + (anarana || cible), texteProprietaire)
    : await envoyer(cible, "Votre accès à « Administratif Fokontany » — Ny asako", texte);

  // Le code revient au propriétaire : si le mail n'est pas parti, il peut le
  // dire lui-même plutôt que de laisser la personne dehors.
  return json({ ok: true, code, sent: envoi.sent, error: envoi.error, lien, credite, montant: credite ? VALEUR_FOKONTANY : 0 });
});
