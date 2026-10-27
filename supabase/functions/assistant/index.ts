// L'Assistant Ny asako, quand la question sort de l'application.
//
// Le bot du navigateur (live.js, BOT_FAQ) répond seul à tout ce qui touche
// Ny asako. Ce qu'il ne connaît pas arrive ici : Claude y répond, mais
// choisit d'abord s'il faut répondre. Trois issues, que live.js distingue :
//   { valiana: true,  valiny: "…" }   une réponse courte, montrée au client ;
//   { valiana: false, antony: "app" } c'est une question sur Ny asako que le
//                                     bot n'a pas su lire : l'admin répondra ;
//   { valiana: false, antony: "tsy" } une question à laquelle on ne répond
//                                     pas (dangereuse, intime, haineuse…).
//
// Secret à poser une fois (le propriétaire, pas le code) :
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Sans lui, la fonction répond { valiana: false } et rien ne change pour
// le client : le message part à l'admin comme avant.
//
// Déploiement : supabase functions deploy assistant --no-verify-jwt
// (un visiteur sans compte peut écrire au bot pendant l'essai).

import Anthropic from "npm:@anthropic-ai/sdk@0.137.0";

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

const SYSTEM = `You are "Assistant Ny asako", the chat assistant inside Ny asako, a Malagasy business app (stock, invoices, online shop, wallet, hotel menu, staff). The app's own questions are already handled elsewhere; the messages you receive are the ones that did not match a known app topic.

First decide whether to answer.

Reply with exactly the single word NY_ASAKO (nothing else) when the message is about the Ny asako app itself, its prices, an account, a payment, an order, or anything only the business owner can know. Do not guess app features.

Reply with exactly the single word TSY_VALIANA (nothing else) when the message should not be answered: anything illegal or dangerous, sexual content, hate or harassment, requests for someone's private information, scams, gambling or trading strategies, personalised medical, legal or investment advice, or partisan politics.

Otherwise answer it: general knowledge, everyday life, school help, cooking, small-business and selling tips, writing help, simple maths, and similar.

How to answer:
- Answer in the language of the message. Most people write in Malagasy; answer in natural, simple Malagasy then. French or English messages get French or English answers.
- Keep it short: at most about 120 words, plain text, no markdown, no headings, no bullet symbols other than "•".
- Be warm and polite, like a helpful shop assistant. You may say "tompoko".
- You cannot see the internet or today's news, prices or exchange rates. If the question needs live information, say so briefly instead of inventing numbers.
- If you are not sure of a fact, say you are not sure.
- Finish with one fitting emoji.`;

// Une limite modeste par adresse : la fonction est ouverte sans compte.
// En mémoire seulement — elle repart à zéro quand l'instance redémarre, ce
// qui suffit à freiner un robot sans gêner un client.
const FETRA_ISAN_ORA = 20;
const antso = new Map<string, number[]>();
function mihoatra(ip: string): boolean {
  const izao = Date.now();
  const lisitra = (antso.get(ip) ?? []).filter((t) => izao - t < 3600_000);
  lisitra.push(izao);
  antso.set(ip, lisitra);
  return lisitra.length > FETRA_ISAN_ORA;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let fanontaniana = "";
  try {
    const body = await req.json();
    fanontaniana = String(body.fanontaniana ?? "").trim().slice(0, 600);
  } catch {
    return json({ error: "corps de requête illisible" }, 400);
  }
  if (!fanontaniana) return json({ error: "fanontaniana foana" }, 400);

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "?";
  if (mihoatra(ip)) return json({ valiana: false, antony: "fetra" });

  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ valiana: false, antony: "tsy-misy-clef" });

  const client = new Anthropic();
  try {
    // Réponse courte de discussion : effort bas, et la reprise côté serveur
    // si le modèle décline par prudence.
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      system: SYSTEM,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: fanontaniana }],
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);

    if (response.stop_reason === "refusal") return json({ valiana: false, antony: "tsy" });

    const soratra = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (!soratra) return json({ valiana: false, antony: "tsy" });
    if (/^NY_ASAKO\b/.test(soratra)) return json({ valiana: false, antony: "app" });
    if (/^TSY_VALIANA\b/.test(soratra)) return json({ valiana: false, antony: "tsy" });
    return json({ valiana: true, valiny: soratra });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return json({ valiana: false, antony: "fetra" });
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("ANTHROPIC_API_KEY tsy mety");
      return json({ valiana: false, antony: "tsy-misy-clef" });
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`Claude ${error.status}:`, error.message);
      return json({ valiana: false, antony: "hadisoana" });
    }
    console.error(error);
    return json({ valiana: false, antony: "hadisoana" });
  }
});
