// Mamorona ny dossier dist/ : ny site manontolo, minify.
//
// Tsy miova na anarana na toerana ny fichiers : sw.js, _redirects, _headers,
// ny ?v= an'i versionner.mjs sy ny rohy rehetra dia mitoetra mandeha.
// Ny hany ovaina dia ny habeny :
//   .html  -> esorina ny espaces sy commentaires, minify ny <style>/<script> ao anatiny
//   .css   -> minify
//   .js    -> minify (tsy ovaina ny anaran'ny fonctions/variables globales,
//            noho izany mbola mandeha ny onclick="..." sy ny scripts mifampiantso)
//   hafa   -> adika toy izao ihany (sary, pdf, manifest, ...)
//
// Ampiasaina : npm run build

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { transformSync } from 'esbuild';
import { minify as minifyHtml } from 'html-minifier-terser';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(racine, 'dist');

// Tsy alefa an-tserasera mihitsy.
const TSY_ALEFA = new Set([
  'node_modules', 'dist', '.git', '.claude', '.netlify', '.vscode',
  'supabase', 'outils', 'netlify',
  'package.json', 'package-lock.json', 'vite.config.mjs', 'netlify.toml',
  'LISEZ-MOI-SUPABASE.txt', 'README.md', '.gitignore',
  '.env', '.env.secrets', 'test-alerte.json'
]);
const tsyAlefa = (anarana) => TSY_ALEFA.has(anarana) || /^deploy-.*\.zip$/.test(anarana);

const target = 'esnext';

function minifyJs(code, loader = 'js') {
  // Tsy misy "format" : esbuild tsy manova ny anarana globales (toplevel).
  return transformSync(code, { loader, minify: true, target, legalComments: 'none' }).code;
}
function minifyCss(code) {
  return transformSync(code, { loader: 'css', minify: true, target: 'esnext' }).code;
}

async function htmlMadio(code, fichier) {
  return minifyHtml(code, {
    collapseWhitespace: true,
    conservativeCollapse: true,
    removeComments: true,
    keepClosingSlash: true,
    minifyCSS: (css, type) => {
      try {
        // Style ao anaty attribut style="..." : avela tsy kitihina.
        return type === 'inline' ? css : minifyCss(css);
      } catch { return css; }
    },
    minifyJS: (js, inline) => {
      if (inline) return js; // onclick="..." : avela tsy kitihina
      try { return minifyJs(js); } catch (e) {
        console.warn('  ! script tsy voa-minify ao amin\'ny ' + fichier + ' : ' + e.message.split('\n')[0]);
        return js;
      }
    }
  });
}

let isa = 0, taloha = 0, vaovao = 0;

async function asao(loharano, tanjona, relatif) {
  const ext = path.extname(loharano).toLowerCase();
  const votoaty = fs.readFileSync(loharano);
  let vokatra = votoaty;
  try {
    if (ext === '.html') {
      vokatra = Buffer.from(await htmlMadio(votoaty.toString('utf8'), relatif));
    } else if ((ext === '.js' || ext === '.mjs') && !relatif.endsWith('.min.js')) {
      vokatra = Buffer.from(minifyJs(votoaty.toString('utf8')));
    } else if (ext === '.css' && !relatif.endsWith('.min.css')) {
      vokatra = Buffer.from(minifyCss(votoaty.toString('utf8')));
    }
  } catch (e) {
    console.warn('  ! ' + relatif + ' adika fotsiny (' + e.message.split('\n')[0] + ')');
    vokatra = votoaty;
  }
  fs.writeFileSync(tanjona, vokatra);
  isa++; taloha += votoaty.length; vaovao += vokatra.length;
}

async function dika(dir, rel = '') {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (rel === '' && tsyAlefa(f.name)) continue;
    const loharano = path.join(dir, f.name);
    const relatif = rel ? rel + '/' + f.name : f.name;
    const tanjona = path.join(dist, relatif);
    if (f.isDirectory()) {
      fs.mkdirSync(tanjona, { recursive: true });
      await dika(loharano, relatif);
    } else if (f.isFile()) {
      await asao(loharano, tanjona, relatif);
    }
  }
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
await dika(racine);

const ko = (n) => (n / 1024).toFixed(0) + ' Ko';
console.log('\nVita : ' + isa + ' fichiers ao amin\'ny dist/');
console.log('Habe : ' + ko(taloha) + '  ->  ' + ko(vaovao) +
  '  (-' + Math.round((1 - vaovao / taloha) * 100) + '%)');
