// Les publications du jour, chez tous les clients, chaque jour à l'heure
// choisie par le propriétaire (18 h par défaut), entre deux dates s'il en
// a posé (table « fandefasana_fikirana », supabase-fandefasana-fotoana.sql).
// « action: "fikirana" » la lit, « action: "tehirizo" » l'enregistre.
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
//
// Chaque envoi s'inscrit dans « fandefasana_tantara »
// (supabase-fandefasana-tantara.sql) avec la liste des clients servis.
// « action: "tantara" » rend les derniers envois au propriétaire connecté.
//
// Les réseaux dont les clefs sont posées (Telegram, Facebook Page, Threads,
// X — voir _shared/tambajotra.ts) reçoivent aussi le résumé du jour.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { publier } from "../_shared/tambajotra.ts";

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
  const loharano = autorise ? "hariva" : "bokotra";
  if (!autorise) {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (token) {
      const { data } = await admin.auth.getUser(token);
      autorise = (data?.user?.email ?? "").trim().toLowerCase() === ownerEmail;
    }
  }
  if (!autorise) return json({ error: "refusé" }, 401);

  let essai = false;
  let action = "";
  let texteCorps = "";
  try {
    texteCorps = await req.text();
    const corpsRecu = JSON.parse(texteCorps || "{}");
    essai = corpsRecu?.essai === true;
    action = String(corpsRecu?.action ?? "");
  } catch { /* corps vide */ }

  // ---- Le carnet : à qui sont partis les derniers envois ----
  if (action === "tantara") {
    const { data, error } = await admin.from("fandefasana_tantara")
      .select("*")
      .order("created_at", { ascending: false }).limit(15);
    if (error) {
      return json({ error: "Tsy hita ny tantara : alefaso ao amin'ny SQL Editor ny supabase-fandefasana-tantara.sql. (" + error.message + ")" }, 500);
    }
    return json({ tantara: data ?? [] });
  }

  // ---- Effacer une ligne du carnet (glissée à gauche ou à droite) ----
  if (action === "fafao") {
    if (loharano === "hariva") return json({ error: "refusé" }, 401);
    let id = "";
    try { id = String(JSON.parse(texteCorps || "{}").id ?? ""); } catch { /* vide */ }
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "id tsy mety" }, 400);
    const { error } = await admin.from("fandefasana_tantara").delete().eq("id", id);
    if (error) return json({ error: error.message }, 500);
    return json({ voafafa: id });
  }

  // ---- L'heure et les dates, choisies par le propriétaire ----
  const TSY_MISY_FIKIRANA = "Tsy hita ny fikirana : alefaso ao amin'ny SQL Editor ny supabase-fandefasana-fotoana.sql.";
  const lireFikirana = () =>
    admin.from("fandefasana_fikirana").select("ora,manomboka,hatramin,farany_nalefa").eq("id", 1).maybeSingle();

  if (action === "fikirana" || action === "tehirizo") {
    if (loharano === "hariva") return json({ error: "refusé" }, 401);
    if (action === "tehirizo") {
      let recu: Record<string, unknown> = {};
      try { recu = JSON.parse(texteCorps || "{}"); } catch { /* vide */ }
      const ora = String(recu.ora ?? "");
      const daty = (v: unknown) => {
        const s = String(v ?? "");
        return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
      };
      const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(ora);
      if (!m) return json({ error: "ora tsy mety (HH:MM)" }, 400);
      const manomboka = daty(recu.manomboka);
      const hatramin = daty(recu.hatramin);
      if (manomboka && hatramin && hatramin < manomboka) {
        return json({ error: "« Hatramin'ny » tsy maintsy aorian'ny « Manomboka »" }, 400);
      }
      const { error } = await admin.from("fandefasana_fikirana")
        .upsert({ id: 1, ora, manomboka, hatramin, updated_at: new Date().toISOString() });
      if (error) return json({ error: TSY_MISY_FIKIRANA + " (" + error.message + ")" }, 500);
    }
    const { data, error } = await lireFikirana();
    if (error) return json({ error: TSY_MISY_FIKIRANA + " (" + error.message + ")" }, 500);
    return json({ fikirana: data ?? { ora: "18:00", manomboka: null, hatramin: null, farany_nalefa: null } });
  }

  // ---- La tâche passe chaque minute : elle ne part qu'une fois par jour,
  //      à l'heure choisie (heure de Madagascar, UTC+3, sans heure d'été),
  //      et seulement entre les deux dates s'il y en a. ----
  if (loharano === "hariva") {
    const { data: f, error } = await lireFikirana();
    if (error) return json({ error: TSY_MISY_FIKIRANA + " (" + error.message + ")" }, 500);
    const mada = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const androany = mada.toISOString().slice(0, 10);
    const minitraIzao = mada.getUTCHours() * 60 + mada.getUTCMinutes();
    const [h, mn] = String(f?.ora ?? "18:00").split(":").map(Number);
    const minitraVoafidy = h * 60 + mn;
    if (f?.manomboka && androany < f.manomboka) return json({ miandry: "mbola tsy tonga ny daty" });
    if (f?.hatramin && androany > f.hatramin) return json({ miandry: "lany ny daty" });
    if (f?.farany_nalefa === androany) return json({ miandry: "efa lasa androany" });
    // Une heure de marge : une minute manquée par la tâche ne fait pas
    // sauter la journée, mais une heure choisie après coup ne part pas le
    // soir même à minuit passé.
    if (minitraIzao < minitraVoafidy || minitraIzao >= minitraVoafidy + 60) {
      return json({ miandry: "mbola tsy ora" });
    }
    // On prend la journée avant d'envoyer : deux passages rapprochés ne
    // peuvent pas partir tous les deux.
    const { data: pris } = await admin.from("fandefasana_fikirana")
      .update({ farany_nalefa: androany }).eq("id", 1)
      .or(`farany_nalefa.is.null,farany_nalefa.lt.${androany}`)
      .select("id");
    if (!pris?.length) return json({ miandry: "efa lasa androany" });
  }

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
    .from("client_signups").select("email,name").limit(5000);
  if (erreurListe) return json({ error: erreurListe.message }, 500);
  const vus = new Set<string>();
  const adresses: string[] = [];
  const noms = new Map<string, string>();
  for (const l of lignes ?? []) {
    const e = String(l?.email ?? "").trim().toLowerCase();
    if (!e || e.indexOf("@") < 1 || vus.has(e) || e === ownerEmail) continue;
    vus.add(e);
    adresses.push(e);
    noms.set(e, String(l?.name ?? "").trim());
  }
  const qui = (e: string) => ({ email: e, name: noms.get(e) ?? "" });

  const corps = [
    "Ireto ny vaovao rehetra tao amin'ny Botika androany :",
    "",
    billets.map(leBillet).join("\n\n"),
    "",
    appUrl ? "Jereo ao amin'ny Botika : " + appUrl + "/botika/" : "",
  ].join("\n").trim();
  const sujet = "Vaovao " + billets.length + " ao amin'ny Botika androany";

  if (essai) return json({ essai: true, billets: billets.length, clients: adresses.length, sujet, corps });

  // Les réseaux d'abord : ils ne dépendent pas des adresses email.
  const resume = sujet + " :\n\n" + billets.map(leBillet).join("\n");
  const tambajotra = await publier(resume, appUrl ? appUrl + "/botika/" : "");

  // Le carnet ne doit jamais empêcher l'envoi : une table ou une colonne
  // absente se tait (la colonne « tambajotra » vient d'un second passage du SQL).
  const noter = async (ligne: Record<string, unknown>) => {
    const r = await admin.from("fandefasana_tantara").insert({ ...ligne, tambajotra });
    if (r.error) await admin.from("fandefasana_tantara").insert(ligne);
  };

  if (!adresses.length) {
    await noter({ loharano, billets: billets.length, sujet, voaray: [], tsy_lasa: [], fahadisoana: "tsy misy client manana email" });
    return json({ billets: billets.length, sent: 0, error: "tsy misy client manana email", tambajotra });
  }

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

  // Les paquets partent dans l'ordre : les « envoyes » premiers sont servis.
  const voaray = adresses.slice(0, envoyes).map(qui);
  const tsyLasa = adresses.slice(envoyes).map(qui);
  try {
    await noter({ loharano, billets: billets.length, sujet, voaray, tsy_lasa: tsyLasa, fahadisoana: erreur || null });
  } catch { /* supabase-fandefasana-tantara.sql pas encore passé */ }

  return json({ billets: billets.length, total: adresses.length, sent: envoyes, error: erreur, voaray, tsyLasa, tambajotra });
});
