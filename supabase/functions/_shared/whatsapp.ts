// WhatsApp, client par client, depuis le serveur : l'API officielle de Meta
// (WhatsApp Cloud API), la seule qui écrive à quelqu'un sans que personne
// n'appuie sur « Envoyer ».
//
// Ce que Meta impose, et qu'aucun code ne contourne :
//   — un numéro WhatsApp Business à soi (pas celui de l'application
//     ordinaire), enregistré dans une app developers.facebook.com ;
//   — un MODÈLE de message validé par Meta pour écrire à un client qui n'a
//     pas écrit dans les dernières 24 h. Le modèle attendu ici n'a qu'une
//     variable, {{1}}, qui reçoit le texte de l'annonce ;
//   — chaque message se paie (tarif « marketing » de Meta).
//   — pas de groupes ni de statuts : cela reste à la main.
//
// Secrets (Supabase > Edge Functions > Secrets) :
//   WA_TOKEN      jeton d'accès permanent (utilisateur système de Business Manager)
//   WA_PHONE_ID   « Phone number ID » du numéro Business
//   WA_TEMPLATE   nom du modèle validé (une variable {{1}} dans le corps)
//   WA_LANG       langue du modèle, « fr » si absent

const env = (k: string) => (Deno.env.get(k) ?? "").trim();

export function whatsappVonona(): boolean {
  return !!(env("WA_TOKEN") && env("WA_PHONE_ID") && env("WA_TEMPLATE"));
}

// « 0343705834 » devient « 261343705834 » (comme zara-rehetra.js).
export function numeroInternational(brut: unknown): string {
  let d = String(brut ?? "").replace(/[^\d]/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 && d.charAt(0) === "0") d = "261" + d.slice(1);
  return d.length >= 8 ? d : "";
}

// Une variable de modèle refuse les retours à la ligne, les tabulations et
// plus de quatre espaces d'affilée ; le corps entier tient en 1024 signes.
function enVariable(texte: string): string {
  const t = texte.replace(/\s*\n+\s*/g, " · ").replace(/\t/g, " ").replace(/ {4,}/g, "   ").trim();
  return t.length > 900 ? t.slice(0, 899) + "…" : t;
}

export type VokatraWhatsApp = { lasa: string[]; tsy: { numero: string; detail: string }[] };

export async function alefaWhatsApp(numeros: string[], texte: string, rohy = ""): Promise<VokatraWhatsApp> {
  const vokatra: VokatraWhatsApp = { lasa: [], tsy: [] };
  if (!whatsappVonona()) {
    numeros.forEach((n) => vokatra.tsy.push({ numero: n, detail: "WA_TOKEN / WA_PHONE_ID / WA_TEMPLATE tsy voafaritra" }));
    return vokatra;
  }
  const variable = enVariable(texte + (rohy ? " " + rohy : ""));
  const url = `https://graph.facebook.com/v21.0/${env("WA_PHONE_ID")}/messages`;
  const alefa = async (to: string) => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: "Bearer " + env("WA_TOKEN"), "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: env("WA_TEMPLATE"),
            language: { code: env("WA_LANG") || "fr" },
            components: [{ type: "body", parameters: [{ type: "text", text: variable }] }],
          },
        }),
      });
      let d: Record<string, unknown> | null = null;
      try { d = await res.json(); } catch { /* vide */ }
      if (res.ok) vokatra.lasa.push(to);
      else {
        const e = (d?.error ?? {}) as Record<string, unknown>;
        vokatra.tsy.push({ numero: to, detail: String(e.message ?? "HTTP " + res.status) });
      }
    } catch (e) {
      vokatra.tsy.push({ numero: to, detail: e instanceof Error ? e.message : String(e) });
    }
  };
  // Cinq à la fois : assez vite, sans heurter la limite de débit de Meta.
  for (let i = 0; i < numeros.length; i += 5) {
    await Promise.all(numeros.slice(i, i + 5).map(alefa));
  }
  return vokatra;
}

// Les numéros des clients inscrits, une fois chacun.
// deno-lint-ignore no-explicit-any
export async function numerosClients(admin: any): Promise<string[]> {
  const { data } = await admin.from("client_signups").select("phone").limit(5000);
  const vus = new Set<string>();
  for (const l of data ?? []) {
    const n = numeroInternational(l?.phone);
    if (n) vus.add(n);
  }
  return [...vus];
}
