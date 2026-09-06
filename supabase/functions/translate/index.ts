// Traduction des paroles échangées pendant un appel.
//
// L'appareil de chacun reconnaît ce que son propriétaire dit, envoie le texte
// à l'autre par le canal de l'appel, et c'est ici qu'il est traduit avant
// d'être affiché — et lu à voix haute — dans la langue de celui qui écoute.
//
// Deux fournisseurs, dans cet ordre :
//   1. DeepL, si DEEPL_API_KEY est renseigné (meilleure qualité) ;
//   2. MyMemory, sans clé ni compte, comme secours.
//
// Déploiement : voir LISEZ-MOI-SUPABASE.txt, section "Traduction des appels".

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

// "fr-FR" -> "FR" ; DeepL veut le code court en majuscules.
function shortLang(code: string): string {
  return (code || "").split("-")[0].toUpperCase();
}

async function withDeepl(text: string, from: string, to: string, key: string) {
  const params = new URLSearchParams();
  params.set("text", text);
  params.set("target_lang", shortLang(to));
  if (from) params.set("source_lang", shortLang(from));

  const host = key.endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";
  const res = await fetch(`https://${host}/v2/translate`, {
    method: "POST",
    headers: {
      "Authorization": `DeepL-Auth-Key ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.translations?.[0]?.text ?? null;
}

async function withMyMemory(text: string, from: string, to: string) {
  const pair = `${(from || "en").split("-")[0]}|${(to || "en").split("-")[0]}`;
  const url = "https://api.mymemory.translated.net/get?q=" +
    encodeURIComponent(text) + "&langpair=" + encodeURIComponent(pair);
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const translated = data?.responseData?.translatedText;
  if (!translated || /MYMEMORY WARNING/i.test(translated)) return null;
  return translated as string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let text = "", from = "", to = "";
  try {
    const body = await req.json();
    text = String(body.text ?? "").slice(0, 1000);   // une réplique, pas un roman
    from = String(body.from ?? "");
    to = String(body.to ?? "");
  } catch {
    return json({ error: "corps de requête illisible" }, 400);
  }
  if (!text.trim() || !to) return json({ error: "texte ou langue manquants" }, 400);
  if (shortLang(from) === shortLang(to)) return json({ text, provider: "aucune" });

  const deeplKey = Deno.env.get("DEEPL_API_KEY");
  if (deeplKey) {
    const translated = await withDeepl(text, from, to, deeplKey);
    if (translated) return json({ text: translated, provider: "deepl" });
  }

  const fallback = await withMyMemory(text, from, to);
  if (fallback) return json({ text: fallback, provider: "mymemory" });

  // Rien n'a abouti : on rend le texte d'origine plutôt que rien du tout.
  return json({ text, provider: "aucune", failed: true });
});
