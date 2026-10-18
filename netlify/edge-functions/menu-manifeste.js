// Le manifeste du menu sakafo, propre à chaque latabatra.
//
// menu-sakafo.html?id=<hôtel>&latabatra=3 demande
// /menu-sakafo.webmanifest?id=<hôtel>&latabatra=3 : il reçoit ici un
// manifeste à lui — son identité, son nom (« Table 3 »), son adresse de
// départ. Chaque latabatra devient ainsi son application, installée à côté
// des autres au lieu de les remplacer, et qui s'ouvre toujours sur sa table.
//
// Sans ces deux paramètres (ou s'ils ne tiennent pas debout), on laisse
// passer : c'est le fichier menu-sakafo.webmanifest, le manifeste commun.

const ID_VALIDE = /^[0-9a-f-]{36}$/i;

export default async (requete, contexte) => {
  const p = new URL(requete.url).searchParams;
  const id = p.get('id') || '';
  const n = Number(p.get('latabatra'));
  if (!ID_VALIDE.test(id) || !Number.isInteger(n) || n < 1 || n > 500) return contexte.next();

  const adresse = '/menu-sakafo.html?id=' + id.toLowerCase() + '&latabatra=' + n;
  const manifeste = {
    id: adresse,
    name: 'Table ' + n + ' — Hasina Hôtellerie',
    short_name: 'Table ' + n,
    description: "Ny menu sakafo an'i Hasina Hôtellerie sy ny commande ho an'ny Table " + n + '.',
    lang: 'mg',
    dir: 'ltr',
    start_url: adresse,
    scope: '/menu-sakafo.html',
    display: 'standalone',
    background_color: '#0f171b',
    theme_color: '#0f171b',
    categories: ['food'],
    icons: [
      { src: '/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icone-512-masquable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
  return new Response(JSON.stringify(manifeste), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate'
    }
  });
};

export const config = { path: '/menu-sakafo.webmanifest' };
