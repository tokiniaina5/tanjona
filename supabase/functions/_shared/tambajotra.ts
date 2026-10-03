// Publier sur les réseaux depuis le serveur, sans que personne n'appuie sur
// « Envoyer ».
//
// Quatre réseaux l'acceptent par leur API officielle, avec une clef que le
// propriétaire obtient une fois et pose en secret Supabase :
//
//   telegram   un bot, administrateur du canal ou du groupe
//              TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID  (@moncanal ou -100…)
//   facebook   une PAGE Facebook (pas un profil personnel : l'API ne publie
//              plus sur les profils depuis 2018)
//              FB_PAGE_ID, FB_PAGE_TOKEN  (jeton de page, longue durée)
//   threads    le compte Threads du propriétaire
//              THREADS_USER_ID, THREADS_TOKEN  (à renouveler tous les 60 jours)
//   x          X (Twitter), accès « Read and write »
//              X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET
//
// Un réseau sans ses clefs n'est pas tenté : il reste à la main, comme avant.
//
// WhatsApp, Instagram, TikTok et WeChat ne sont PAS ici, et ce n'est pas un
// oubli : WhatsApp n'a aucune API pour les groupes ni les statuts, et son
// API d'entreprise n'écrit à un client qu'avec un modèle validé ; Instagram
// exige une image et un compte professionnel ; TikTok n'accepte que des
// vidéos, après revue de l'application ; WeChat n'ouvre rien.

export type Resultat = { ok: boolean; detail: string };
export type Reseau = "telegram" | "facebook" | "threads" | "x";
export const RESEAUX_AUTO: Reseau[] = ["telegram", "facebook", "threads", "x"];

const env = (k: string) => (Deno.env.get(k) ?? "").trim();

export function configures(): Record<Reseau, boolean> {
  return {
    telegram: !!(env("TELEGRAM_BOT_TOKEN") && env("TELEGRAM_CHAT_ID")),
    facebook: !!(env("FB_PAGE_ID") && env("FB_PAGE_TOKEN")),
    threads: !!(env("THREADS_USER_ID") && env("THREADS_TOKEN")),
    x: !!(env("X_API_KEY") && env("X_API_SECRET") && env("X_ACCESS_TOKEN") && env("X_ACCESS_SECRET")),
  };
}

// Couper sans casser un mot, en gardant la place du lien.
function couper(texte: string, max: number): string {
  if (texte.length <= max) return texte;
  const coupe = texte.slice(0, max - 1);
  const espace = coupe.lastIndexOf(" ");
  return (espace > max * 0.6 ? coupe.slice(0, espace) : coupe) + "…";
}

async function lireJson(res: Response): Promise<Record<string, unknown> | null> {
  try { return await res.json(); } catch { return null; }
}

function raison(d: Record<string, unknown> | null, status: number): string {
  const e = (d?.error ?? {}) as Record<string, unknown>;
  return String(e.message ?? d?.description ?? d?.detail ?? d?.title ?? ("HTTP " + status));
}

// ---- Telegram ----
// Le jeton tel que @BotFather le donne (« 123456789:AA… »), même collé avec
// « bot » devant, entre guillemets ou dans une adresse api.telegram.org.
function jetonTelegram(): string {
  const brut = env("TELEGRAM_BOT_TOKEN");
  const m = /(\d{5,}:[A-Za-z0-9_-]{20,})/.exec(brut);
  return m ? m[1] : brut;
}

// « @moncanal », « -100… », ou une adresse t.me/moncanal.
function chatTelegram(): string {
  let c = env("TELEGRAM_CHAT_ID").replace(/^["']|["']$/g, "");
  const lien = /t(?:elegram)?\.me\/([A-Za-z0-9_]{4,})/i.exec(c);
  if (lien) c = lien[1];
  if (!/^-?\d+$/.test(c) && !c.startsWith("@")) c = "@" + c;
  return c;
}

// Ce que Telegram répond, dit avec ce qu'il faut faire.
function raisonTelegram(d: Record<string, unknown> | null, status: number): string {
  const desc = String(d?.description ?? "");
  if (status === 404 || status === 401) {
    return "TELEGRAM_BOT_TOKEN diso (" + (desc || status) + ") : adikao indray ny token avy amin'ny @BotFather";
  }
  if (/chat not found/i.test(desc)) {
    return "TELEGRAM_CHAT_ID tsy hita (" + desc + ") : @anaran'ny canal na -100…, ary ampidiro ao ilay bot";
  }
  if (status === 403 || /not enough rights|not a member|kicked/i.test(desc)) {
    return "Tsy afaka manoratra ao ilay bot (" + desc + ") : ataovy administrateur ao amin'ny canal/groupe";
  }
  return desc || "HTTP " + status;
}

async function telegram(texte: string, rohy: string): Promise<Resultat> {
  const corps = couper(texte, 4000 - rohy.length) + (rohy ? "\n" + rohy : "");
  const res = await fetch(`https://api.telegram.org/bot${jetonTelegram()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatTelegram(), text: corps }),
  });
  const d = await lireJson(res);
  return res.ok && d?.ok ? { ok: true, detail: "lasa" } : { ok: false, detail: raisonTelegram(d, res.status) };
}

// Vérifie le jeton (getMe) puis le canal (getChat), sans rien publier.
export async function hamarinoTelegram(): Promise<Resultat> {
  if (!configures().telegram) return { ok: false, detail: "tsy voarindra" };
  const base = `https://api.telegram.org/bot${jetonTelegram()}`;
  const moi = await fetch(base + "/getMe");
  const dm = await lireJson(moi);
  if (!moi.ok || !dm?.ok) return { ok: false, detail: raisonTelegram(dm, moi.status) };
  const bot = "@" + String((dm.result as Record<string, unknown>)?.username ?? "");
  const chat = await fetch(base + "/getChat?chat_id=" + encodeURIComponent(chatTelegram()));
  const dc = await lireJson(chat);
  if (!chat.ok || !dc?.ok) return { ok: false, detail: bot + " — " + raisonTelegram(dc, chat.status) };
  const r = (dc.result ?? {}) as Record<string, unknown>;
  return { ok: true, detail: bot + " → " + String(r.title ?? r.username ?? chatTelegram()) };
}

// ---- Facebook (Page) ----
async function facebook(texte: string, rohy: string): Promise<Resultat> {
  const params = new URLSearchParams({ message: texte, access_token: env("FB_PAGE_TOKEN") });
  if (rohy) params.set("link", rohy);
  const res = await fetch(`https://graph.facebook.com/v21.0/${env("FB_PAGE_ID")}/feed`, {
    method: "POST",
    body: params,
  });
  const d = await lireJson(res);
  return res.ok && d?.id ? { ok: true, detail: "lasa" } : { ok: false, detail: raison(d, res.status) };
}

// ---- Threads : un conteneur, puis sa publication ----
async function threads(texte: string, rohy: string): Promise<Resultat> {
  const base = `https://graph.threads.net/v1.0/${env("THREADS_USER_ID")}`;
  const jeton = env("THREADS_TOKEN");
  const corps = couper(texte, 500 - (rohy ? rohy.length + 1 : 0)) + (rohy ? "\n" + rohy : "");
  const cree = await fetch(`${base}/threads`, {
    method: "POST",
    body: new URLSearchParams({ media_type: "TEXT", text: corps, access_token: jeton }),
  });
  const dc = await lireJson(cree);
  const conteneur = String(dc?.id ?? "");
  if (!cree.ok || !conteneur) return { ok: false, detail: raison(dc, cree.status) };

  // Threads prépare le conteneur avant de le laisser paraître : on réessaie
  // quelques secondes plutôt que de conclure trop tôt.
  let derniere = "";
  for (let essai = 0; essai < 4; essai++) {
    if (essai) await new Promise((r) => setTimeout(r, 3000));
    const pub = await fetch(`${base}/threads_publish`, {
      method: "POST",
      body: new URLSearchParams({ creation_id: conteneur, access_token: jeton }),
    });
    const dp = await lireJson(pub);
    if (pub.ok && dp?.id) return { ok: true, detail: "lasa" };
    derniere = raison(dp, pub.status);
  }
  return { ok: false, detail: derniere };
}

// ---- X : OAuth 1.0a, signé HMAC-SHA1 ----
function pct(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

export async function signatureX(methode: string, url: string, params: Record<string, string>): Promise<string> {
  const chaine = Object.keys(params).sort().map((k) => pct(k) + "=" + pct(params[k])).join("&");
  const base = [methode.toUpperCase(), pct(url), pct(chaine)].join("&");
  const clef = pct(env("X_API_SECRET")) + "&" + pct(env("X_ACCESS_SECRET"));
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(clef),
    { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(base));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function x(texte: string, rohy: string): Promise<Resultat> {
  const url = "https://api.twitter.com/2/tweets";
  // X compte tout lien pour 23 caractères.
  const corps = couper(texte, 280 - (rohy ? 24 : 0)) + (rohy ? "\n" + rohy : "");
  const oauth: Record<string, string> = {
    oauth_consumer_key: env("X_API_KEY"),
    oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: env("X_ACCESS_TOKEN"),
    oauth_version: "1.0",
  };
  // Le corps JSON n'entre pas dans la signature : seuls les paramètres oauth.
  oauth.oauth_signature = await signatureX("POST", url, oauth);
  const entete = "OAuth " + Object.keys(oauth).sort()
    .map((k) => `${pct(k)}="${pct(oauth[k])}"`).join(", ");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": entete, "Content-Type": "application/json" },
    body: JSON.stringify({ text: corps }),
  });
  const d = await lireJson(res);
  const data = (d?.data ?? {}) as Record<string, unknown>;
  return res.ok && data.id ? { ok: true, detail: "lasa" } : { ok: false, detail: raison(d, res.status) };
}

const PUBLIER: Record<Reseau, (t: string, l: string) => Promise<Resultat>> = { telegram, facebook, threads, x };

// Publie sur chaque réseau demandé ET configuré. Un réseau qui échoue ne
// retient pas les autres ; chacun rend son propre verdict.
export async function publier(
  texte: string,
  rohy: string,
  demandes: string[] = RESEAUX_AUTO,
): Promise<Partial<Record<Reseau, Resultat>>> {
  const ok = configures();
  const cibles = RESEAUX_AUTO.filter((r) => demandes.includes(r) && ok[r]);
  const sortie: Partial<Record<Reseau, Resultat>> = {};
  await Promise.all(cibles.map(async (r) => {
    try {
      sortie[r] = await PUBLIER[r](texte.trim(), rohy.trim());
    } catch (e) {
      sortie[r] = { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  }));
  return sortie;
}
