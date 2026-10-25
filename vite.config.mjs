// Vite eto dia ampiasaina ho an'ny :
//   npm run dev      -> serveur local miaraka amin'ny rechargement ho azy
//   npm run preview  -> mijery ny dossier dist/ (vokatry ny npm run build)
//
// Ny "build" kosa tsy ataon'ny Vite (jereo outils/build.mjs) : ny scripts
// rehetra dia scripts classiques mizara variables globales, ary ny
// service worker sy outils/versionner.mjs dia miankina amin'ny anaran'ny
// fichiers. Tsy maintsy mitoetra tsy miova ireo anarana ireo.

import { defineConfig } from 'vite';

export default defineConfig({
  // Tsy mitady dépendances npm ao anaty pejy : CDN no ampiasaina.
  optimizeDeps: { noDiscovery: true, include: [] },
  server: {
    open: '/header.html'
  },
  preview: {
    open: '/header.html'
  },
  build: {
    outDir: 'dist'
  }
});
