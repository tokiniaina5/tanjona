// L'aperçu d'un lien partagé : l'image, le titre, le nom du site.
//
// Un billet qui ne porte qu'une adresse ne dit rien de ce qu'il y a au bout.
// « https://www.alibaba.com/ » — et puis ? Personne ne touche une adresse
// nue ; on touche une image.
//
// Le navigateur ne peut pas aller voir de lui-même : une page d'un autre
// domaine ne se lit pas depuis le nôtre, le navigateur l'interdit (CORS).
// C'est donc le serveur qui va la chercher, et n'en rapporte que quatre
// lignes — celles que la page publie ELLE-MÊME pour être partagée, les
// balises « og: » que lisent WhatsApp et Facebook.
//
// Ce qui n'est pas ici, et ne peut pas y être : la liste des marchandises
// d'une boutique. Les grands sites ne la publient pas de cette façon, la
// construisent dans le navigateur de leur visiteur, et refusent qui n'est pas
// une personne. On rapporte ce que le site donne à qui partage son lien : une
// image, un titre, une phrase. C'est ce que montrent WhatsApp et Facebook, et
// c'est déjà tout autre chose qu'une adresse nue.
//
// Déploiement : voir LISEZ-MOI-SUPABASE.txt, section « Aperçu des liens ».

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

// Une page se laisse lire par un navigateur, et se referme devant un script
// qui s'annonce comme tel. On se présente donc comme un navigateur — c'est ce
// que fait tout ce qui affiche un aperçu de lien.
const AGENT = "Mozilla/5.0 (compatible; NyAsako/1.0; +https://ny-asako.netlify.app)";
// De quoi contenir l'en-tête d'une page. Au-delà, les balises « og: » sont
// passées depuis longtemps, et l'on ne va pas télécharger un site entier.
const MAX_OCTETS = 512 * 1024;
const DELAI_MS = 8000;

// Ce qui n'est pas sur l'internet public n'a rien à faire au bout d'un lien
// partagé : une adresse locale ferait visiter au serveur son propre réseau.
function adressePublique(u: URL): boolean {
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return false;
  if (h === "0.0.0.0" || h === "[::1]" || h === "::1") return false;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (/^169\.254\./.test(h)) return false;
  return true;
}

function decode(v: string): string {
  return v
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();
}

// Les balises se présentent dans les deux sens — « property » avant
// « content » ou l'inverse — et avec les guillemets qu'elles veulent.
function meta(html: string, noms: string[]): string {
  for (const nom of noms) {
    const n = nom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const motifs = [
      new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${n}["'][^>]*content\\s*=\\s*["']([^"']*)["']`, "i"),
      new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${n}["']`, "i"),
    ];
    for (const m of motifs) {
      const trouve = html.match(m);
      if (trouve && trouve[1] && decode(trouve[1])) return decode(trouve[1]);
    }
  }
  return "";
}

// Ce qui n'est pas une marchandise : le logo du site, les icônes de son menu,
// la bannière de sa promotion du mois, le squelette gris qu'il affiche en
// attendant ses propres images, le bouton qui ferme sa fenêtre. Tout cela
// porte son nom sur l'adresse — « desk-skeleton.png », « bandeau_alcool.jpg »,
// « btn-close.png », « picto? » — et n'a rien à faire sur la carte d'une
// boutique, qui doit montrer ce qu'on y achète.
const REJET = new RegExp([
  "logo", "sprite", "icon", "picto", "avatar", "blank", "placeholder", "pixel",
  "spacer", "loading", "transparent", "skeleton", "bandeau", "banniere",
  "banner", "btn[-_.]", "button", "header", "footer", "menu", "flag", "badge",
  "hero", "cover", "close", "arrow", "fleche", "etoile", "star[-_.]",
].join("|"), "i");
const TAILLE = /(?:^|[^0-9])([0-9]{1,4})[x_-]([0-9]{1,4})(?:[^0-9]|$)/;
// Une photo d'article est à peu près carrée. Ce qui est quatre fois plus
// large que haut est une bannière, et ce qui est quatre fois plus haut
// qu'large une colonne de mise en page.
const RATIO_MAX = 2.5;

function imageAcceptable(u: string): boolean {
  if (!u || /^data:/i.test(u)) return false;
  if (/\.(svg|gif|ico)(\?|$)/i.test(u)) return false;
  if (REJET.test(u)) return false;
  const nom = u.split("/").pop() || "";
  const m = nom.match(TAILLE);
  if (m) {
    const l = Number(m[1]), h = Number(m[2]);
    if (l <= 150 && h <= 150) return false;
    if (l && h && (l / h > RATIO_MAX || h / l > RATIO_MAX)) return false;
  }
  return true;
}

// Les images de la page, dans l'ordre où elles comptent : celle que le site
// désigne lui-même pour le partage d'abord, puis celles qu'il affiche, puis
// celles que son code porte en réserve (les grandes boutiques déposent leur
// catalogue dans un JSON au milieu de la page).
//
// Ce ne sont pas « les articles en vente » — rien ne dit qu'une image est un
// article, et aucun de ces sites ne publie son catalogue. Ce sont les images
// de la page, celles qu'on verrait en l'ouvrant.
function imagesDeLaPage(html: string, base: URL, max: number): string[] {
  const vus = new Set<string>();
  const sortie: string[] = [];
  const sources = [
    /<meta[^>]+(?:property|name)\s*=\s*["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*content\s*=\s*["']([^"']+)["']/gi,
    /<img[^>]+\b(?:data-(?:src|lazy-src|original)|src)\s*=\s*["']([^"']+)["']/gi,
    /"(?:image|imageUrl|imgUrl|picUrl|mainImage|thumbUrl)"\s*:\s*"((?:https?:)?[^"]+?\.(?:jpg|jpeg|png|webp)[^"]*)"/gi,
  ];
  for (const motif of sources) {
    for (const m of html.matchAll(motif)) {
      const u = adresseEntiere(m[1], base);
      if (!imageAcceptable(u)) continue;
      const clef = u.split("?")[0];
      if (vus.has(clef)) continue;
      vus.add(clef);
      sortie.push(u);
      if (sortie.length >= max) return sortie;
    }
  }
  return sortie;
}

function titreDeLaPage(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decode(m[1].replace(/<[^>]*>/g, "")) : "";
}

// Une image annoncée « /img/x.jpg » ne s'affiche nulle part ailleurs que chez
// elle : on la ramène à son adresse entière. « //cdn.site/x.jpg » vaut pour
// les deux protocoles, et les adresses tirées d'un JSON portent des barres
// obliques échappées.
function adresseEntiere(valeur: string, base: URL): string {
  if (!valeur) return "";
  let u = String(valeur).trim().replace(/\\\//g, "/");
  if (u.startsWith("//")) u = "https:" + u;
  try { return new URL(u, base).href; } catch { return ""; }
}

async function lireLeDebut(res: Response): Promise<string> {
  const lecteur = res.body?.getReader();
  if (!lecteur) return await res.text();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_OCTETS) {
    const { done, value } = await lecteur.read();
    if (done) break;
    if (value) { morceaux.push(value); total += value.length; }
  }
  try { await lecteur.cancel(); } catch { /* déjà close */ }
  const tout = new Uint8Array(total);
  let i = 0;
  for (const m of morceaux) { tout.set(m.subarray(0, Math.min(m.length, total - i)), i); i += m.length; }
  return new TextDecoder("utf-8", { fatal: false }).decode(tout);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let brut = "";
  try {
    const body = await req.json();
    brut = String(body.url ?? "").trim().slice(0, 2048);
  } catch {
    return json({ error: "corps de requête illisible" }, 400);
  }
  if (!brut) return json({ error: "adresse manquante" }, 400);

  let cible: URL;
  try { cible = new URL(/^https?:\/\//i.test(brut) ? brut : "https://" + brut); }
  catch { return json({ error: "adresse illisible" }, 400); }
  if (!adressePublique(cible)) return json({ error: "adresse non publique" }, 400);

  const minuteur = AbortSignal.timeout ? AbortSignal.timeout(DELAI_MS) : undefined;
  let html = "";
  let finale = cible;
  try {
    const res = await fetch(cible.href, {
      headers: {
        "User-Agent": AGENT,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "fr,mg,en;q=0.8",
      },
      redirect: "follow",
      signal: minuteur,
    });
    // Le site a répondu autre chose qu'une page : on rend ce qu'on sait déjà
    // de l'adresse plutôt que rien.
    try { finale = new URL(res.url || cible.href); } catch { finale = cible; }
    const type = res.headers.get("content-type") || "";
    if (res.ok && /html/i.test(type)) html = await lireLeDebut(res);
  } catch {
    html = "";
  }

  const titre = meta(html, ["og:title", "twitter:title"]) || titreDeLaPage(html);
  const description = meta(html, ["og:description", "twitter:description", "description"]);
  const site = meta(html, ["og:site_name"]) || finale.hostname.replace(/^www\./, "");
  // Douze, parce que les trois de la carte tournent : chacune des trois places
  // a sa file, et l'on ne repasse pas sur la même image au bout de vingt
  // secondes. C'est aussi de quoi tenir si l'une ou l'autre ne s'affiche pas
  // chez celui qui regarde — un site peut refuser ses images à qui vient
  // d'ailleurs.
  // Dix-huit et non douze : le navigateur en écartera encore — c'est lui, et
  // lui seul, qui connaît les vraies dimensions d'une image — et il faut de
  // quoi remplacer sans se retrouver à court.
  const images = imagesDeLaPage(html, finale, 18);

  return json({
    url: finale.href,
    site,
    titre: titre.slice(0, 200),
    description: description.slice(0, 300),
    // « image » reste : c'est celle du partage, et les pages qui n'en ont
    // qu'une ne changent pas de forme.
    image: images[0] || "",
    images,
    // Rien n'a été trouvé : la page s'est refusée, ou ne publie pas d'aperçu.
    // Le client le saura et s'en tiendra au nom du site.
    vide: !titre && !images.length,
  });
});
