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

// Les messages, eux, ne vivent que sept jours (27/10/2026) : les messages
// du formulaire de contact (contact_messages). Les photos, vidéos et notes
// vocales des discussions (bucket « resaka-media », un dossier par adresse)
// trois jours seulement. Le même passage quotidien s'en charge.
const RESAKA_BUCKET = "resaka-media";
const RESAKA_JOURS = Number(Deno.env.get("RESAKA_JOURS") ?? "7");
const RESAKA_MEDIA_JOURS = Number(Deno.env.get("RESAKA_MEDIA_JOURS") ?? "3");

type Admin = ReturnType<typeof createClient>;

// Un niveau de dossiers : « nom_gmail_com/1730000000-abc.webm ». Une entrée
// sans id est un dossier.
async function vieuxResaka(admin: Admin, limite: number): Promise<{ noms: string[]; vus: number; erreur?: string }> {
  const noms: string[] = [];
  let vus = 0;
  const lire = async (dossier: string) => {
    for (let page = 0; page < 50; page++) {
      const { data, error } = await admin.storage.from(RESAKA_BUCKET).list(dossier, {
        limit: 1000, offset: page * 1000, sortBy: { column: "name", order: "asc" },
      });
      if (error) throw error;
      const lot = data ?? [];
      for (const f of lot) {
        const chemin = dossier ? dossier + "/" + f.name : f.name;
        if (!f.id) { if (!dossier) await lire(chemin); continue; }
        vus++;
        const d = f.created_at ? Date.parse(f.created_at) : NaN;
        if (Number.isFinite(d) && d < limite) noms.push(chemin);
      }
      if (lot.length < 1000) break;
    }
  };
  try { await lire(""); } catch (e) { return { noms, vus, erreur: (e as Error).message }; }
  return { noms, vus };
}

async function menageResaka(admin: Admin, essai: boolean) {
  const limite = Date.now() - RESAKA_JOURS * 24 * 60 * 60 * 1000;
  const fichiers = await vieuxResaka(admin, Date.now() - RESAKA_MEDIA_JOURS * 24 * 60 * 60 * 1000);
  const depuis = new Date(limite).toISOString();
  if (essai) {
    const { count } = await admin.from("contact_messages").select("id", { count: "exact", head: true }).lt("created_at", depuis);
    return { jours: RESAKA_JOURS, joursMedia: RESAKA_MEDIA_JOURS, fichiersVus: fichiers.vus, fichiersRetenus: fichiers.noms.length,
      contactRetenus: count ?? 0, erreur: fichiers.erreur };
  }
  let fichiersEffaces = 0;
  const soucis: string[] = fichiers.erreur ? [fichiers.erreur] : [];
  for (let i = 0; i < fichiers.noms.length; i += 100) {
    const { data, error } = await admin.storage.from(RESAKA_BUCKET).remove(fichiers.noms.slice(i, i + 100));
    if (error) { soucis.push(error.message); continue; }
    fichiersEffaces += (data ?? []).length;
  }
  const { count, error } = await admin.from("contact_messages").delete({ count: "exact" }).lt("created_at", depuis);
  if (error) soucis.push(error.message);
  return { jours: RESAKA_JOURS, joursMedia: RESAKA_MEDIA_JOURS, fichiersVus: fichiers.vus, fichiersEffaces, contactEffaces: count ?? 0, soucis };
}

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

  const resaka = await menageResaka(admin, essai);

  if (essai) {
    return json({ essai: true, vus, retenus: aEffacer.length, retentionJours: RETENTION_JOURS, noms: aEffacer.slice(0, 50), resaka });
  }
  if (!aEffacer.length) {
    return json({ vus, effaces: 0, retentionJours: RETENTION_JOURS, resaka });
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

  return json({ vus, effaces, retentionJours: RETENTION_JOURS, soucis, resaka });
});
