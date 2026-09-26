// Estampille chaque feuille de style et chaque script des pages du site
// d'un « ?v=<empreinte du contenu> ».
//
// Les fichiers gardent leur nom d'un envoi à l'autre. Un téléphone qui a déjà
// ouvert le site ne redemande donc rien : il ressert sa copie, et la
// modification n'apparaît jamais — c'est exactement ce qui vient d'arriver.
// L'empreinte change avec le contenu : l'adresse devient neuve, le navigateur
// est obligé d'aller la chercher. Un fichier inchangé garde la sienne et reste
// en cache, ce qui est le comportement voulu.
//
// À lancer avant chaque envoi :  node outils/versionner.mjs

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// Ny asako, puis l'Administratif Fokontany : installable à part, mais fait
// des mêmes fichiers — un script changé doit changer d'adresse dans les deux.
// Et la boutique publique, qui emprunte les mêmes feuilles de style.
const PAGES = ['ny-asako.html', 'fokontany/index.html', 'botika/index.html'];
// fileURLToPath et non l'URL brute : le chemin du projet contient une espace,
// que l'URL code en « %20 » et qui ne désigne alors aucun dossier réel.
const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const empreintes = new Map();
function empreinte(relatif) {
  if (!empreintes.has(relatif)) {
    const contenu = fs.readFileSync(path.join(racine, relatif));
    empreintes.set(relatif, crypto.createHash('md5').update(contenu).digest('hex').slice(0, 8));
  }
  return empreintes.get(relatif);
}

// « / » devant ou non : la page du Fokontany, dans son dossier, appelle les
// fichiers depuis la racine.
const motif = /((?:href|src)="\/?)(gestion-stockage-(?:css|js)\/[^"?]+)(?:\?v=[^"]*)?(")/g;
const META = /(<meta name="ny-asako-version" content=")[^"]*(")/;
const marques = [];

for (const PAGE of PAGES) {
  let page = fs.readFileSync(path.join(racine, PAGE), 'utf8');
  const crlf = page.includes('\r\n');
  if (crlf) page = page.replace(/\r\n/g, '\n');

  let touches = 0;
  page = page.replace(motif, (tout, avant, relatif, apres) => {
    if (!fs.existsSync(path.join(racine, relatif))) {
      throw new Error('fichier introuvable : ' + relatif);
    }
    touches += 1;
    return avant + relatif + '?v=' + empreinte(relatif) + apres;
  });

  // La version de la page, estampilles comprises. Elle change dès que change
  // un fichier, ou la page elle-même. Elle s'écrit dans la page (meta
  // « ny-asako-version »), où la veille de version de common.js la compare à
  // celle du serveur — comparer seulement common.js laissait passer un
  // changement de style ou d'un autre script. On la calcule sur la page où
  // cette meta est vide : sinon elle se contiendrait elle-même, et changerait
  // à chaque passage. Le Fokontany n'a pas de veille : pas de meta.
  const marque = crypto.createHash('md5').update(page.replace(META, '$1$2')).digest('hex').slice(0, 8);
  if (META.test(page)) page = page.replace(META, '$1' + marque + '$2');
  else if (PAGE === 'ny-asako.html') console.log('meta ny-asako-version introuvable dans ' + PAGE + ' : la veille de version ne verra que common.js');
  marques.push(marque);

  fs.writeFileSync(path.join(racine, PAGE), crlf ? page.replace(/\n/g, '\r\n') : page);
  console.log(touches + ' fichiers estampilles dans ' + PAGE);
}
for (const [f, h] of empreintes) console.log('  ' + h + '  ' + f);

// Le service worker sert les deux pages : le nom de son cache suit les deux.
const marque = crypto.createHash('md5').update(marques.join(':')).digest('hex').slice(0, 8);
console.log('version du site : ' + marque);

// Le service worker garde les fichiers dans un cache nommé. On y écrit la
// version du site : chaque envoi repart d'un cache neuf, et l'ancien est
// effacé à l'activation — sans quoi les fichiers de toutes les versions passées
// s'y empileraient sans jamais resservir.
const SW = 'sw.js';
const cheminSw = path.join(racine, SW);
if (fs.existsSync(cheminSw)) {
  let sw = fs.readFileSync(cheminSw, 'utf8');
  const crlfSw = sw.includes('\r\n');
  if (crlfSw) sw = sw.replace(/\r\n/g, '\n');
  // On vérifie que la ligne existe, et non qu'elle change : deux passages sur
  // une page identique donnent la même empreinte, et le second criait à tort.
  const motif = /const CACHE = '[^']*';/;
  if (!motif.test(sw)) throw new Error('ligne CACHE introuvable dans ' + SW);
  sw = sw.replace(motif, "const CACHE = 'nyasako-" + marque + "';");
  fs.writeFileSync(cheminSw, crlfSw ? sw.replace(/\n/g, '\r\n') : sw);
  console.log('cache du service worker : nyasako-' + marque);
}
