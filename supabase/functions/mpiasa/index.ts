// Ce que voit un employé, et ce qu'il fait dans l'équipe de son patron.
//
// Il n'a pas de compte : il n'a qu'un lien. Le jeton qu'il porte dit qui
// il est, et c'est la seule chose qui ouvre la porte — d'où sa longueur.
//
// Son lien lui donne l'application entière. Son stock vit dans son
// navigateur : la fonction ne lui en tend qu'une copie de départ, celle que
// le patron a déposée. L'équipe, elle, est celle du patron, et vit dans la
// base : il y inscrit des gens, fait des liens, pointe, confie des courses.
//
// Tout passe par ici plutôt que par la base directement. Une table ouverte
// à qui n'est pas connecté serait ouverte à tout le monde. Ici, la clé de
// service reste sur le serveur, et chaque demande est bornée :
//   - quelques tables seulement, et pour chacune les opérations permises ;
//   - toujours au nom du patron du porteur du jeton. L'email que la page
//     envoie n'est pas écouté : il ne pourrait que mentir.
//
// Déploiement : appelée sans jeton d'utilisateur, donc
//   supabase functions deploy mpiasa --no-verify-jwt

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

// ---------- Ce que la page de l'équipe a le droit de demander ----------
// Les tables d'equipe.js, et rien d'autre : ni les portefeuilles, ni les
// comptes, ni la copie du stock — il écraserait celle du patron.
const PERMIS: Record<string, string[]> = {
  // L'équipe se lit seulement. Inscrire, pauser, retirer quelqu'un ou lui
  // faire un lien revient au patron : un employé pouvait suspendre ses
  // collègues, et se suspendre lui-même sans pouvoir revenir.
  equipe: ["select"],
  // Les courses aussi : les créer, les faire avancer, les annuler ou les
  // effacer revient au patron.
  livraisons: ["select"],
  // Le pointage aussi : dire qui est arrivé ou reparti, et à quelle heure,
  // revient au patron. Un employé pouvait pointer pour les autres.
  pointages: ["select"],
  positions: ["select"],
  // La clé Google Maps se lit — la carte en a besoin — mais c'est le patron
  // qui la choisit : elle est à son nom, et c'est lui qui paie.
  reglages: ["select"],
  // Le tableau de bord d'un collègue se lit ; la copie ne s'écrit que par
  // l'action « stock », au nom du porteur du jeton.
  stock_mpiasa: ["select"],
};
const NOM = /^[a-z_]+$/;
const COLONNES = /^(\*|[a-z_]+(\s*,\s*[a-z_]+)*)$/;

function simple(v: unknown): boolean {
  return v === null || ["string", "number", "boolean"].includes(typeof v);
}

// Des champs à écrire : des noms de colonnes, des valeurs simples, et jamais
// le propriétaire — c'est la fonction qui le pose.
function champs(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const sortie: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (!NOM.test(k)) return null;
    if (k === "owner_email") continue;
    if (!simple(x)) return null;
    sortie[k] = x;
  }
  return sortie;
}

// deno-lint-ignore no-explicit-any
async function executer(admin: any, owner: string, r: Record<string, unknown>) {
  const refus = { data: null, error: "requête illisible" };
  const table = String(r.table ?? "");
  const op = String(r.op ?? "");
  if (!PERMIS[table] || !PERMIS[table].includes(op)) return { data: null, error: "table refusée" };

  const filtres = Array.isArray(r.filtres) ? r.filtres : [];
  // Une modification ou un effacement sans filtre toucherait toute l'équipe
  // d'un coup. equipe.js vise toujours une ligne : on l'exige.
  if ((op === "update" || op === "delete") &&
      !filtres.some((f) => Array.isArray(f) && f[0] !== "owner_email")) {
    return refus;
  }

  // deno-lint-ignore no-explicit-any
  let q: any;
  if (op === "select") {
    const colonnes = String(r.colonnes ?? "*");
    if (!COLONNES.test(colonnes)) return refus;
    q = admin.from(table).select(colonnes);
  } else if (op === "insert") {
    const v = champs(r.valeurs);
    if (!v) return refus;
    q = admin.from(table).insert({ ...v, owner_email: owner });
  } else if (op === "update") {
    const v = champs(r.valeurs);
    if (!v || !Object.keys(v).length) return refus;
    q = admin.from(table).update(v);
  } else if (op === "delete") {
    q = admin.from(table).delete();
  } else {
    const v = champs(r.valeurs);
    if (!v) return refus;
    q = admin.from(table).upsert({ ...v, owner_email: owner }, { onConflict: "owner_email" });
  }

  if (op === "select" || op === "update" || op === "delete") {
    q = q.eq("owner_email", owner);
    // De l'équipe, l'employé ne reçoit que les livreurs : la page « Livreur »
    // en a besoin. Ses collègues du magasin — noms, téléphones, emails — ne
    // le regardent pas, et la page « Mpiasa » lui est cachée.
    if (table === "equipe") q = q.eq("role", "livreur");
    for (const f of filtres) {
      if (!Array.isArray(f) || f.length !== 3) return refus;
      const [colonne, comparaison, valeur] = f;
      if (typeof colonne !== "string" || !NOM.test(colonne)) return refus;
      if (colonne === "owner_email") continue;
      if (comparaison === "eq" && simple(valeur)) q = q.eq(colonne, valeur);
      else if (comparaison === "is" && (valeur === null || typeof valeur === "boolean")) q = q.is(colonne, valeur);
      else if (comparaison === "in" && Array.isArray(valeur) && valeur.length <= 500 &&
               valeur.every((x) => typeof x === "string" || typeof x === "number")) q = q.in(colonne, valeur);
      else return refus;
    }
  }

  if (op === "select") {
    const ordre = r.ordre as { colonne?: unknown; croissant?: unknown } | null;
    if (ordre && typeof ordre.colonne === "string" && NOM.test(ordre.colonne)) {
      q = q.order(ordre.colonne, { ascending: ordre.croissant !== false });
    }
    q = q.limit(Math.min(Math.max(Number(r.limite) || 500, 1), 500));
    if (r.unique) q = q.maybeSingle();
  }

  const { data, error } = await q;
  if (error) return { data: null, error: error.message };
  // Le jeton de chacun est la clé de son lien : le lire, c'est entrer à sa
  // place — ou suivre la course d'un client. Il ne quitte jamais le serveur,
  // quelles que soient les colonnes demandées.
  if ((table === "equipe" || table === "livraisons") && data) {
    for (const ligne of Array.isArray(data) ? data : [data]) {
      if (ligne && typeof ligne === "object") delete (ligne as Record<string, unknown>).jeton;
    }
  }
  return { data: data ?? null, error: null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode refusée" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ error: "configuration incomplète" }, 500);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "corps de requête illisible" }, 400);
  }

  const jeton = String(body.jeton ?? "").trim();
  // Un jeton court serait un jeton qu'on essaie. On refuse avant même de
  // chercher : inutile d'interroger la base pour une clé qui n'en est pas une.
  if (jeton.length < 32) return json({ error: "lien invalide" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: personne } = await admin.from("equipe")
    .select("id,nom,role,telephone,actif,owner_email")
    .eq("jeton", jeton).maybeSingle();

  // Le même message dans les deux cas : dire « ce lien a existé » en
  // apprendrait plus que nécessaire à qui essaie des jetons au hasard.
  if (!personne) return json({ error: "lien invalide" }, 401);
  // Mise en pause : le lien cesse de répondre, sans qu'on ait à le reprendre.
  if (!personne.actif) return json({ error: "lien suspendu" }, 403);

  const owner = personne.owner_email;
  const action = String(body.action ?? "");

  // ---- « Je suis ici » ----
  // Le téléphone du livreur envoie sa position ; on l'inscrit sous SON
  // identifiant, celui que le jeton désigne. Le corps de la requête ne dit
  // pas de qui il s'agit : il ne pourrait que mentir.
  if (action === "position") {
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    // Des coordonnées hors du monde ne sont pas des coordonnées.
    if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return json({ error: "position illisible" }, 400);
    }
    const precision = Number(body.precision);
    await admin.from("positions").insert({
      owner_email: owner,
      equipe_id: personne.id,
      lat, lng,
      precision_m: Number.isFinite(precision) ? precision : null,
    });
    return json({ ok: true });
  }

  // ---- « Est-ce qu'on me cherche ? » ----
  // La page d'un livreur pose la question toutes les quinze secondes. La
  // réponse est l'heure de la dernière demande « Tadiavo » ; plus récente que
  // sa dernière position envoyée, il en envoie une sur-le-champ. Lue à part
  // plutôt qu'avec la personne : sans supabase-livreur-tadiavo.sql, la
  // colonne manque, et c'est cette question-là seule qui doit échouer — pas
  // le lien entier.
  if (action === "attente") {
    const { data, error } = await admin.from("equipe")
      .select("position_demandee_at").eq("id", personne.id).maybeSingle();
    return json({ demande: error ? null : (data?.position_demandee_at ?? null) });
  }

  // ---- « Voici mon stock » ----
  // Le stock de l'employé vit dans son navigateur. Il en envoie une copie
  // pour que son patron la suive — la sienne, et celle de personne d'autre :
  // la ligne est rangée sous l'identifiant que le jeton désigne.
  if (action === "stock") {
    const articles = body.articles;
    const mouvements = body.mouvements;
    if (!Array.isArray(articles) || !Array.isArray(mouvements) ||
        articles.length > 5000 || mouvements.length > 1000) {
      return json({ error: "stock illisible" }, 400);
    }
    // Une boutique n'a pas besoin de plus : au-delà, ce n'est plus un stock.
    if (JSON.stringify(articles).length + JSON.stringify(mouvements).length > 2_000_000) {
      return json({ error: "stock trop gros" }, 413);
    }
    const { error } = await admin.from("stock_mpiasa").upsert({
      equipe_id: personne.id,
      owner_email: owner,
      articles,
      mouvements,
      maj: new Date().toISOString(),
    }, { onConflict: "equipe_id" });
    // Presque toujours : supabase-mpiasa-tableau.sql n'a pas été passé.
    if (error) return json({ error: "stock refusé" }, 500);
    return json({ ok: true });
  }

  // ---- Les notifications de la boutique ----
  // Ce qui se passe chez l'un se sait chez les autres : une sortie de stock,
  // un article épuisé, l'argent du portefeuille, un direct. Le patron écrit et
  // lit la table avec son compte ; l'employé passe par ici, et c'est le jeton
  // qui signe — la page ne dit ni de qui elle vient, ni pour quelle boutique.
  if (action === "notifier") {
    const type = String(body.type ?? "");
    const message = String(body.message ?? "").trim();
    if (!["sortie", "rupture", "parrainage", "live"].includes(type) || !message || message.length > 500) {
      return json({ error: "notification illisible" }, 400);
    }
    const { error } = await admin.from("notifications_boutique").insert({
      owner_email: owner,
      auteur_id: personne.id,
      auteur_nom: personne.nom,
      type,
      message,
    });
    // Presque toujours : supabase-notifications.sql n'a pas été passé.
    if (error) return json({ error: "notification refusée" }, 500);
    return json({ ok: true });
  }

  if (action === "notifications") {
    const depuis = new Date(String(body.depuis ?? ""));
    if (isNaN(depuis.getTime())) return json({ error: "date illisible" }, 400);
    const { data, error } = await admin.from("notifications_boutique")
      .select("id,type,message,auteur_id,auteur_nom,created_at")
      .eq("owner_email", owner).gt("created_at", depuis.toISOString())
      .order("created_at", { ascending: true }).limit(50);
    if (error) return json({ error: "notifications refusées" }, 500);
    return json({ notifications: data ?? [] });
  }

  // ---- « Au nom de quelle boutique » ----
  // La facture qu'un employé édite sort au nom de la boutique, pas au sien :
  // société, logo, NIF, STAT, email et téléphone du patron. Ils vivent dans
  // les informations de son compte, que seule la clé de service lit. Demandé
  // une fois à l'ouverture : le logo pèse, il n'a pas à voyager toutes les
  // cinq minutes avec la page.
  if (action === "boutique") {
    const cible = String(owner).trim().toLowerCase();
    // deno-lint-ignore no-explicit-any
    let compte: any = null;
    for (let page = 1; page <= 20 && !compte; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) break;
      const comptes = data?.users ?? [];
      compte = comptes.find((u: { email?: string }) => (u.email ?? "").toLowerCase() === cible) ?? null;
      if (comptes.length < 1000) break;
    }
    const meta = (compte?.user_metadata ?? {}) as Record<string, unknown>;
    const texte = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const logo = texte(meta.logo);
    return json({
      boutique: {
        nom: texte(meta.name),
        societe: texte(meta.company),
        telephone: texte(meta.phone),
        email: owner,
        nif: texte(meta.nif),
        stat: texte(meta.stat),
        // Une image, et rien d'autre : elle finit dans un PDF.
        logo: logo.startsWith("data:image/") ? logo : null,
      },
    });
  }

  // ---- La page de l'équipe ----
  if (action === "table") {
    const requete = body.requete;
    if (!requete || typeof requete !== "object") return json({ data: null, error: "requête illisible" });
    return json(await executer(admin, owner, requete as Record<string, unknown>));
  }

  // « mouvements » vient de supabase-mpiasa-copie.sql. Tant qu'il n'a pas été
  // passé, on rend au moins les articles plutôt que rien.
  const lireLeStock = async () => {
    const avec = await admin.from("stock_partage")
      .select("articles,mouvements,maj").eq("owner_email", owner).maybeSingle();
    if (!avec.error) return avec;
    return await admin.from("stock_partage")
      .select("articles,maj").eq("owner_email", owner).maybeSingle();
  };

  const [stock, livraisons, pointages] = await Promise.all([
    lireLeStock(),
    admin.from("livraisons")
      .select("id,designation,client,adresse,telephone,statut,created_at")
      .eq("owner_email", owner).eq("livreur_id", personne.id)
      .order("created_at", { ascending: false }).limit(50),
    admin.from("pointages")
      .select("arrivee,depart")
      .eq("owner_email", owner).eq("equipe_id", personne.id)
      .order("arrivee", { ascending: false }).limit(30),
  ]);

  const copie = (stock?.data ?? {}) as Record<string, unknown>;

  return json({
    personne: {
      id: personne.id,
      nom: personne.nom,
      role: personne.role,
      telephone: personne.telephone,
    },
    // Le stock tel que le patron l'a laissé à sa dernière ouverture : le
    // point de départ de celui de l'employé, pas un stock partagé.
    articles: copie.articles ?? [],
    mouvements: copie.mouvements ?? [],
    stockMaj: copie.maj ?? null,
    livraisons: livraisons?.data ?? [],
    pointages: pointages?.data ?? [],
  });
});
