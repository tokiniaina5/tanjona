// Le code a été saisi : prévenir le propriétaire, et attendre son accord.
//
// Le code ne suffit plus à entrer. Quand quelqu'un le saisit, cette fonction
// (clé de service) marque sa ligne — l'heure, l'appareil — et prévient le
// propriétaire par email. La page ne s'ouvrira que lorsqu'il aura confirmé,
// depuis son onglet « Fangatahana ».
//
// Ainsi, un code lu par-dessus l'épaule ou reçu dans une boîte ouverte par un
// autre n'ouvre rien tout seul : il faut encore que quelqu'un dise oui.
//
// Déploiement : supabase functions deploy commun-fiditra
// (AVEC vérification du jeton : on agit au nom de la personne connectée.)

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

async function prevenir(dest: string, sujet: string, texte: string): Promise<boolean> {
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
      return true;
    } catch {
      try { await client.close(); } catch { /* déjà fermé */ }
    }
  }

  // Le service par défaut de Resend ne parle qu'à la boîte de son titulaire —
  // ici, c'est justement le propriétaire qu'on prévient.
  const resend = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!resend) return false;
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
  return res.ok;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode refusée" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const ownerEmail = (Deno.env.get("OWNER_EMAIL") ?? "").trim().toLowerCase();
  if (!supabaseUrl || !serviceKey || !ownerEmail) {
    return json({ error: "configuration incomplète" }, 500);
  }

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return json({ error: "non authentifié" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: appelant, error: erreurAppelant } = await admin.auth.getUser(token);
  const email = appelant?.user?.email?.trim().toLowerCase() ?? "";
  if (erreurAppelant || !email) return json({ error: "non authentifié" }, 401);

  let code = "";
  let appareil = "";
  try {
    const corps = await req.json();
    code = String(corps?.code ?? "").trim().toUpperCase();
    appareil = String(corps?.appareil ?? "").slice(0, 200);
  } catch {
    return json({ error: "corps de requête illisible" }, 400);
  }
  if (!code) return json({ error: "code manquant" }, 400);

  const { data: lignes, error } = await admin.from("commun_alalana")
    .select("id,code,active,voamarina,anarana").ilike("email", email).limit(1);
  if (error) return json({ error: error.message }, 502);

  const ligne = (lignes ?? [])[0];
  // Un code faux ne dit pas lequel est juste, et ne prévient personne : la
  // boîte du propriétaire ne doit pas se remplir des essais d'un curieux.
  if (!ligne || !ligne.active || String(ligne.code).trim().toUpperCase() !== code) {
    return json({ ok: false, voamarina: false });
  }

  // Déjà confirmée : rien à redemander, on ouvre.
  if (ligne.voamarina) return json({ ok: true, voamarina: true });

  await admin.from("commun_alalana")
    .update({ nampiasaina_at: new Date().toISOString(), appareil: appareil || null, updated_at: new Date().toISOString() })
    .eq("id", ligne.id);

  const texte = [
    "Bonjour,",
    "",
    (ligne.anarana ? ligne.anarana + " (" + email + ")" : email) + " vient de saisir son code pour « Administratif Fokontany ».",
    "",
    "Appareil : " + (appareil || "—"),
    "Heure : " + new Date().toLocaleString("fr-FR"),
    "",
    "La page reste fermée tant que vous n'avez pas confirmé : ouvrez",
    "« Administratif Fokontany » puis l'onglet « Fangatahana », et pressez « Hamafiso ».",
    "",
    "Si ce n'est pas la personne attendue, retirez son accès depuis ce même onglet.",
    "",
    Deno.env.get("OWNER_NAME") ?? "",
  ].join("\n");

  const prevenu = await prevenir(ownerEmail, "Code saisi pour « Administratif Fokontany » — à confirmer", texte);

  return json({ ok: true, voamarina: false, prevenu: prevenu });
});
