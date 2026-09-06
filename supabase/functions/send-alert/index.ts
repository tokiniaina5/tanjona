// Envoi automatique des alertes de sécurité au propriétaire.
//
// L'application appelle cette fonction (supabase.functions.invoke('send-alert'))
// dès qu'une tentative suspecte est détectée sur un compte client. Le mail
// contient le compte visé et la pièce d'identité que le client a renseignée à
// l'étape 2 de sa connexion — informations qui ne sont écrites dans aucune
// table publique et ne transitent que par ici.
//
// Déploiement : voir LISEZ-MOI-SUPABASE.txt, section "Alerte par email".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface AlertPayload {
  to?: string;
  ownerName?: string;
  target?: string;
  kind?: string;
  detail?: string;
  date?: string;
  account?: { name?: string; email?: string; phone?: string };
  identity?: { idNumber?: string; idDate?: string; birthDate?: string; birthPlace?: string };
}

function newCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => alphabet[b % alphabet.length]).join("");
}

// Alerte visant le compte du propriétaire : on lui pose un nouveau code et on
// le lui envoie. Il ne peut donc jamais rester dehors, même si quelqu'un a
// martelé sa page de connexion. Une remise à zéro n'est refaite qu'après un
// quart d'heure, pour qu'un acharné ne puisse pas la déclencher en boucle.
const RESET_COOLDOWN_MS = 15 * 60 * 1000;
let lastOwnerReset = 0;

async function resetOwnerCode(ownerEmail: string): Promise<string | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return null;
  if (Date.now() - lastOwnerReset < RESET_COOLDOWN_MS) return null;

  const admin = createClient(supabaseUrl, serviceKey);
  let userId = "";
  for (let page = 1; page <= 20 && !userId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const found = data.users.find(
      (u) => (u.email ?? "").trim().toLowerCase() === ownerEmail,
    );
    if (found) userId = found.id;
    if (data.users.length < 200) break;
  }
  if (!userId) return null;

  const code = newCode();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: code,
    email_confirm: true,
  });
  if (error) return null;
  lastOwnerReset = Date.now();
  return code;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function line(label: string, value?: string): string {
  return `${label} : ${value && value.trim() ? value : "—"}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("ALERT_FROM") ?? "onboarding@resend.dev";
  const fallbackTo = Deno.env.get("OWNER_EMAIL") ?? "";

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY manquant" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let payload: AlertPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "corps de requête illisible" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Le destinataire n'est jamais choisi par l'appelant s'il est configuré côté
  // serveur : une alerte ne peut pas être détournée vers une autre adresse.
  const to = fallbackTo || payload.to;
  if (!to) {
    return new Response(JSON.stringify({ error: "destinataire inconnu" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const account = payload.account ?? {};
  const identity = payload.identity ?? {};

  // Si l'alerte vise le compte du propriétaire, le mail lui apporte aussi un
  // code neuf : c'est avec lui qu'il rouvrira le site à la page de connexion.
  const ownerCode = payload.target === "admin" ? await resetOwnerCode(to.trim().toLowerCase()) : null;
  const ownerBlock = ownerCode
    ? [
      "",
      "VOTRE NOUVEAU CODE DE CONNEXION : " + ownerCode,
      "Saisissez-le sur la page de connexion avec votre email. Vous pourrez",
      "ensuite le remplacer par le vôtre dans Paramètres > Mon profil >",
      "« Nouveau mot de passe » : le changement est actif immédiatement.",
    ]
    : [];

  const text = [
    "Bonjour,",
    "",
    "Une tentative suspecte vient d'être détectée sur Gestion de Stockage.",
    "",
    line("Type", payload.kind),
    line("Détail", payload.detail),
    line("Date", payload.date),
    "",
    "COMPTE CONCERNÉ",
    line("Nom", account.name),
    line("Email", account.email),
    line("Téléphone", account.phone),
    "",
    "PIÈCE D'IDENTITÉ DÉCLARÉE PAR LE TITULAIRE",
    line("Numéro CIN / passeport", identity.idNumber),
    line("Date de la CIN / du passeport", identity.idDate),
    line("Date de naissance", identity.birthDate),
    line("Lieu de naissance", identity.birthPlace),
    "",
    ...(payload.target === "admin"
      ? ["Votre compte n'est pas bloqué : vous ne devez jamais rester dehors."]
      : [
        "Le compte a été bloqué automatiquement. Dès que vous aurez vérifié que",
        "cette pièce d'identité correspond bien au titulaire, le déblocage et",
        "l'envoi d'un nouveau code prennent effet immédiatement.",
      ]),
    ...ownerBlock,
    "",
    payload.ownerName ?? "",
  ].join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Alerte sécurité — ${account.email ?? "compte inconnu"}`,
      text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return new Response(JSON.stringify({ error: "envoi refusé", detail }), {
      status: 502,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ sent: true }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
