// Les notifications qui arrivent même quand Ny asako est fermé (Web Push).
//
// Les hafatra et les antso de live.js passent par le direct (broadcast) :
// seul celui dont la page est ouverte les reçoit. Ici, l'expéditeur demande
// en plus qu'une notification parte vers les appareils du destinataire,
// abonnés dans push_abonnement (supabase/sql/supabase-push.sql).
//
// Qui demande se prouve : un compte par sa session, un mpiasa par le jeton
// de son lien. Le titre est écrit ici avec le nom de l'expéditeur, jamais
// pris dans la demande : personne ne signe au nom d'un autre. Un mpiasa
// n'écrit qu'à son patron ; un compte n'écrit qu'aux mpiasa de son équipe,
// et aux autres comptes.
//
// Déploiement : appelée aussi sans session (la page d'un lien mpiasa), donc
//   supabase functions deploy push --no-verify-jwt
// Secrets : VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

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

const EMAIL = /^[^@\s]{1,120}@[^@\s]{1,120}$/;
const MPIASA = /^mpiasa-([0-9a-f-]{36})@ny-asako\.invalid$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode refusée" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const vapidPublic = Deno.env.get("VAPID_PUBLIC") ?? "";
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE") ?? "";
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@ny-asako.mg";
  if (!supabaseUrl || !serviceKey || !vapidPublic || !vapidPrivate) {
    return json({ error: "configuration incomplète" }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "corps de requête illisible" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // ---- Qui demande ----
  let me = "";
  let anarana = "";
  let patron = ""; // pour un mpiasa : l'email de son patron
  const jeton = String(body.jeton ?? "").trim();
  if (jeton) {
    if (jeton.length < 32) return json({ error: "lien invalide" }, 401);
    const { data: p } = await admin.from("equipe")
      .select("id,nom,actif,owner_email").eq("jeton", jeton).maybeSingle();
    if (!p || !p.actif) return json({ error: "lien invalide" }, 401);
    me = `mpiasa-${p.id}@ny-asako.invalid`;
    anarana = p.nom || "Mpiasa";
    patron = String(p.owner_email || "").trim().toLowerCase();
  } else {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data } = token ? await admin.auth.getUser(token) : { data: { user: null } };
    const u = data && data.user;
    if (!u || !u.email) return json({ error: "tsy fantatra hoe iza" }, 401);
    me = u.email.trim().toLowerCase();
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    anarana = String(meta.name || meta.full_name || me.split("@")[0]);
  }

  const action = String(body.action ?? "");

  // ---- S'abonner : cet appareil veut les notifications de « me » ----
  if (action === "misoratra" || action === "miala") {
    const endpoint = String(body.endpoint ?? "");
    if (!/^https:\/\/[^\s]{10,1000}$/.test(endpoint)) return json({ error: "abonnement illisible" }, 400);
    if (action === "miala") {
      await admin.from("push_abonnement").delete().eq("endpoint", endpoint).eq("adiresy", me);
      return json({ ok: true });
    }
    const p256dh = String(body.p256dh ?? "");
    const auth = String(body.auth ?? "");
    if (!/^[A-Za-z0-9_-]{20,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{8,100}$/.test(auth)) {
      return json({ error: "abonnement illisible" }, 400);
    }
    const pejy = String(body.pejy ?? "");
    const { error } = await admin.from("push_abonnement").upsert({
      endpoint, adiresy: me, p256dh, auth,
      pejy: /^\/[^\s]{0,300}$/.test(pejy) ? pejy : null,
      created_at: new Date().toISOString(),
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ---- Envoyer : un hafatra ou un antso vers « to » ----
  if (action === "alefa") {
    const to = String(body.to ?? "").trim().toLowerCase();
    if (!EMAIL.test(to) || to === me) return json({ error: "adiresy diso" }, 400);
    if (patron) {
      // Un mpiasa n'écrit qu'à son patron.
      if (to !== patron) return json({ error: "tsy azo" }, 403);
    } else {
      const m = to.match(MPIASA);
      if (m) {
        const { data: p } = await admin.from("equipe").select("owner_email").eq("id", m[1]).maybeSingle();
        if (!p || String(p.owner_email || "").trim().toLowerCase() !== me) return json({ error: "tsy azo" }, 403);
      } else if (to.endsWith(".invalid")) {
        return json({ error: "adiresy diso" }, 400);
      }
    }

    const kind = String(body.kind ?? "");
    let title: string, text: string, tag: string;
    if (kind === "antso") {
      const video = body.callType === "video";
      title = (video ? "📹 Antso video" : "📞 Antso") + " avy amin'i " + anarana;
      text = "Tsindrio mba hamaly.";
      tag = "antso-" + me;
    } else if (kind === "hafatra") {
      title = "💬 " + anarana;
      text = String(body.text ?? "").slice(0, 160) || "Hafatra vaovao";
      tag = "hafatra-" + me;
    } else {
      return json({ error: "karazana diso" }, 400);
    }

    const { data: abonnes } = await admin.from("push_abonnement")
      .select("endpoint,p256dh,auth,pejy").eq("adiresy", to).limit(20);
    if (!abonnes || !abonnes.length) return json({ ok: true, lasa: 0 });

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    let lasa = 0;
    const maty: string[] = [];
    await Promise.all(abonnes.map(async (a) => {
      const payload = JSON.stringify({ title, body: text, tag, kind, url: a.pejy || "/ny-asako.html" });
      try {
        await webpush.sendNotification(
          { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
          payload,
          { TTL: kind === "antso" ? 60 : 24 * 3600, urgency: "high" },
        );
        lasa++;
      } catch (e) {
        // 404 / 410 : l'abonnement n'existe plus (désinstallé, refusé).
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) maty.push(a.endpoint);
      }
    }));
    if (maty.length) await admin.from("push_abonnement").delete().in("endpoint", maty);
    return json({ ok: true, lasa });
  }

  return json({ error: "action inconnue" }, 400);
});
