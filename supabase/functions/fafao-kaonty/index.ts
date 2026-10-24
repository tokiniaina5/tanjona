// « Supprimer mon compte » : le compte connecté s'efface lui-même, avec ce
// qu'il possède (suppression-donnees.html le promet).
//
// Seul le jeton de la session décide qui est effacé : l'email que la page
// enverrait ne serait pas écouté. Le propriétaire (OWNER_EMAIL) ne passe
// pas par ici — son compte tient la ligne que voient tous les clients.
//
// Ce qui reste, exprès :
//   - les paiements déjà faits (wallet_deposits, wallet_payouts,
//     wallet_achats, wallet_transferts) : la trace qu'exige la loi ;
//   - blocked_accounts : sinon un compte bloqué s'effacerait pour revenir ;
//   - l'équipe d'un AUTRE patron où ce compte figure : elle est à lui.
// Les tables liées à auth.users « on delete cascade » partent avec le
// compte lui-même (deleteUser, à la fin).
//
// Déploiement :
//   supabase functions deploy fafao-kaonty
// Secrets utilisés : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_EMAIL.

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

// Les lignes rangées sous l'email du compte : table → colonnes.
const PAR_EMAIL: Record<string, string[]> = {
  adidy: ["owner_email"],
  adidy_fandoavana: ["owner_email"],
  app_logins: ["email"],
  client_news: ["author_email"],
  client_news_comments: ["author_email"],
  client_news_comment_reactions: ["author_email"],
  client_news_likes: ["author_email"],
  client_signups: ["email"],
  commun_alalana: ["email"],
  commun_fangatahana: ["email"],
  contact_messages: ["email"],
  fianakaviana: ["owner_email"],
  fianakaviana_mpikambana: ["owner_email"],
  fokontany_installation: ["email"],
  // Avant equipe : une course garde sinon son livreur à vide.
  livraisons: ["owner_email"],
  notifications_boutique: ["owner_email"],
  // pointages, positions et stock_mpiasa suivent equipe (cascade), mais
  // ils portent aussi l'email du patron : on ne laisse rien derrière.
  pointages: ["owner_email"],
  positions: ["owner_email"],
  stock_mpiasa: ["owner_email"],
  equipe: ["owner_email"],
  pieces_identite: ["owner_email"],
  profil_sary: ["email"],
  reglages: ["owner_email"],
  security_events: ["email"],
  site_visiteurs: ["email"],
  stock_partage: ["owner_email"],
  taratasy: ["owner_email"],
  unlock_requests: ["email"],
  wallet_cles: ["email"],
  wallet_owners: ["email"],
};

// Les fichiers : rangés sous l'identifiant du compte, sauf les médias des
// discussions, rangés sous l'email (« nom_gmail_com »).
const DOSSIERS_UID = ["pieces-identite", "pdf", "story-media", "hotelerie-sary"];
const DOSSIER_EMAIL = "resaka-media";

// ilike sans joker : « _ » et « % » d'une adresse restent des lettres.
function exact(v: string): string {
  return v.replace(/[\\%_]/g, (c) => "\\" + c);
}

// deno-lint-ignore no-explicit-any
async function viderDossier(admin: any, bucket: string, prefixe: string): Promise<number> {
  let n = 0;
  const { data } = await admin.storage.from(bucket).list(prefixe, { limit: 1000 });
  if (!data || !data.length) return 0;
  const fichiers: string[] = [];
  for (const o of data) {
    const chemin = prefixe + "/" + o.name;
    // Un dossier n'a pas d'id : on y descend.
    if (o.id === null) n += await viderDossier(admin, bucket, chemin);
    else fichiers.push(chemin);
  }
  if (fichiers.length) {
    const { error } = await admin.storage.from(bucket).remove(fichiers);
    if (!error) n += fichiers.length;
  }
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST uniquement" }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const owner = (Deno.env.get("OWNER_EMAIL") ?? "").trim().toLowerCase();
  if (!url || !cle || !owner) return json({ error: "configuration incomplète" }, 500);

  const jeton = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jeton) return json({ error: "non connecté" }, 401);

  let corps: Record<string, unknown> = {};
  try { corps = await req.json(); } catch (_) { /* corps vide */ }
  // La page fait taper « FAFAO » : un clic égaré n'efface rien.
  if (corps.confirmation !== "FAFAO") return json({ error: "confirmation manquante" }, 400);

  const admin = createClient(url, cle, { auth: { persistSession: false } });
  const { data: qui, error: errQui } = await admin.auth.getUser(jeton);
  const user = qui && qui.user;
  if (errQui || !user) return json({ error: "session expirée" }, 401);

  const email = String(user.email ?? "").trim().toLowerCase();
  if (email && email === owner) {
    return json({ error: "Le compte du propriétaire ne s'efface pas d'ici." }, 403);
  }

  const echecs: string[] = [];
  if (email) {
    for (const [table, colonnes] of Object.entries(PAR_EMAIL)) {
      for (const col of colonnes) {
        const { error } = await admin.from(table).delete().ilike(col, exact(email));
        // Une table absente (projet plus ancien) n'arrête pas l'effacement.
        if (error && error.code !== "42P01" && error.code !== "PGRST205") echecs.push(table + "." + col);
      }
    }
  }

  let fichiers = 0;
  for (const bucket of DOSSIERS_UID) {
    try { fichiers += await viderDossier(admin, bucket, user.id); } catch (_) { echecs.push(bucket); }
  }
  if (email) {
    // Même nom de dossier que live.js (envoi d'une photo dans la discussion).
    try { fichiers += await viderDossier(admin, DOSSIER_EMAIL, email.replace(/[^a-z0-9]/gi, "_").slice(0, 40)); }
    catch (_) { echecs.push(DOSSIER_EMAIL); }
  }

  // Une ligne restée en place ne doit pas survivre sans son compte : on
  // s'arrête, la personne peut réessayer.
  if (echecs.length) return json({ error: "effacement incomplet", echecs }, 500);

  const { error: errDel } = await admin.auth.admin.deleteUser(user.id);
  if (errDel) return json({ error: "compte non effacé : " + errDel.message }, 500);

  return json({ ok: true, fichiers });
});
