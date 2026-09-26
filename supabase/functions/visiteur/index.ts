// Qui a ouvert le site, et ce que chacun rapporte au propriétaire.
//
// Deux choses, dans la même fonction parce qu'elles parlent de la même
// table :
//
//   "vu"    — appelée à chaque ouverture de l'application, par n'importe
//             qui, connecté ou non. Elle inscrit la personne si c'est la
//             première fois, et verse alors VALEUR_VISITEUR au
//             portefeuille du propriétaire. Une personne, une fois : la
//             clé primaire de la table et l'index unique des versements
//             s'en chargent, même si deux onglets appellent en même
//             temps.
//
//   "liste" — la liste complète, pour l'espace admin. Réservée au
//             propriétaire : elle contient les noms et les emails de
//             tous les clients, et personne d'autre que lui n'a à les
//             lire. Le jeton dit qui appelle, pas le corps de la requête.
//
// Ce versement ne retire rien à personne. L'argent qu'une invitation
// rapporte à celui qui a invité reste le sien : ce sont deux écritures
// distinctes, et une personne arrivée par un lien en produit les deux.
//
// Déploiement : appelée sans jeton d'utilisateur (un visiteur du premier
// jour n'a pas de compte), donc
//   supabase functions deploy visiteur --no-verify-jwt
// L'action "liste" vérifie le jeton elle-même : c'est ce qui garde la
// liste des clients pour le seul propriétaire.
//
// Secrets attendus : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_EMAIL.

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

// Ce que vaut une personne qui ouvre le site. Comme AR_PER_REFERRAL dans
// la fonction « wallet » : le chiffre vit ici, sur le serveur, parce
// qu'une page peut être modifiée par celui qui la regarde.
const VALEUR_VISITEUR = Number(Deno.env.get("AR_PER_VISITEUR") ?? "1000");

const APPAREILS = new Set(["Mobile", "Tablette", "Ordinateur"]);

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}
function texte(value: unknown, max: number): string | null {
  const t = String(value ?? "").trim().slice(0, max);
  return t || null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode refusée" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const ownerEmail = norm(Deno.env.get("OWNER_EMAIL"));
  if (!supabaseUrl || !serviceKey || !ownerEmail) {
    return json({ error: "configuration incomplète (SUPABASE_SERVICE_ROLE_KEY / OWNER_EMAIL)" }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "corps de requête illisible" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const action = String(body.action ?? "");

  // ---- La personne vient d'ouvrir l'application ----
  if (action === "vu") {
    const installId = String(body.installId ?? "").trim();
    // Un identifiant court est un identifiant qu'on invente : on refuse
    // avant d'écrire, sinon il suffirait d'une boucle pour se créditer.
    if (installId.length < 16 || installId.length > 64) {
      return json({ error: "installation inconnue" }, 400);
    }

    const nom = texte(body.nom, 120);
    const email = texte(body.email, 200);
    const invitePar = texte(body.invitePar, 64);
    const appareilBrut = String(body.appareil ?? "").trim();
    const appareil = APPAREILS.has(appareilBrut) ? appareilBrut : null;
    const maintenant = new Date().toISOString();

    // On tente l'inscription. Si elle passe, c'est la première fois qu'on
    // voit cette personne — et c'est le seul moment où le portefeuille du
    // propriétaire bouge. Si elle échoue sur la clé primaire, la personne
    // était déjà là : on met sa ligne à jour, sans rien créditer.
    const { error: erreurInsertion } = await admin.from("site_visiteurs").insert({
      install_id: installId,
      nom, email, invite_par: invitePar, appareil,
      premiere_visite: maintenant,
      derniere_visite: maintenant,
      visites: 1,
    });

    const nouveau = !erreurInsertion;

    if (!nouveau) {
      // Déjà connue. On note le passage, et on complète ce qu'on ignorait :
      // la personne a pu créer son compte depuis la dernière fois. On
      // n'efface jamais un nom par un vide — une visite déconnectée ne
      // doit pas faire oublier qui c'était.
      const { data: avant } = await admin.from("site_visiteurs")
        .select("visites,nom,email,appareil,invite_par")
        .eq("install_id", installId).maybeSingle();

      await admin.from("site_visiteurs").update({
        derniere_visite: maintenant,
        visites: (Number(avant?.visites) || 0) + 1,
        nom: nom ?? avant?.nom ?? null,
        email: email ?? avant?.email ?? null,
        appareil: appareil ?? avant?.appareil ?? null,
        invite_par: avant?.invite_par ?? invitePar ?? null,
      }).eq("install_id", installId);
    }

    // Le versement au propriétaire. L'index unique sur
    // (provider, provider_ref) est la vraie garantie : même si deux
    // appels se croisaient et se croyaient tous deux les premiers, une
    // seule ligne entrerait.
    let credite = false;
    if (nouveau) {
      const versement = await admin.from("wallet_deposits").insert({
        email: ownerEmail,
        amount_ar: VALEUR_VISITEUR,
        provider: "visiteur",
        provider_ref: installId,
        status: "confirme",
        confirmed_at: maintenant,
        note: "Personne nouvelle sur le site" + (nom ? " : " + nom : ""),
      });
      credite = !versement.error;
    }

    return json({ nouveau, credite, montant: credite ? VALEUR_VISITEUR : 0 });
  }

  // ---- La liste, pour l'espace admin ----
  if (action === "liste") {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "non authentifié" }, 401);
    const { data: caller, error: erreurJeton } = await admin.auth.getUser(token);
    const appelant = norm(caller?.user?.email);
    if (erreurJeton || !appelant) return json({ error: "session invalide" }, 401);
    if (appelant !== ownerEmail) return json({ error: "réservé au propriétaire" }, 403);

    const limite = Math.min(Math.max(Number(body.limite) || 200, 1), 500);
    const { data, error } = await admin.from("site_visiteurs")
      .select("install_id,nom,email,invite_par,appareil,premiere_visite,derniere_visite,visites")
      .order("derniere_visite", { ascending: false })
      .limit(limite);
    if (error) return json({ error: error.message }, 500);

    const { count } = await admin.from("site_visiteurs")
      .select("install_id", { count: "exact", head: true });

    return json({
      visiteurs: data ?? [],
      total: count ?? (data ?? []).length,
      valeurVisiteur: VALEUR_VISITEUR,
    });
  }

  return json({ error: "action inconnue" }, 400);
});
