// Estampille chaque feuille de style et chaque script de gestion-stockage.html
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

const PAGE = 'gestion-stockage.html';
// fileURLToPath et non l'URL brute : le chemin du projet contient une espace,
// que l'URL code en « %20 » et qui ne désigne alors aucun dossier réel.
const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let page = fs.readFileSync(path.join(racine, PAGE), 'utf8');
const crlf = page.includes('\r\n');
if (crlf) page = page.replace(/\r\n/g, '\n');

const empreintes = new Map();
function empreinte(relatif) {
  if (!empreintes.has(relatif)) {
    const contenu = fs.readFileSync(path.join(racine, relatif));
    empreintes.set(relatif, crypto.createHash('md5').update(contenu).digest('hex').slice(0, 8));
  }
  return empreintes.get(relatif);
}

let touches = 0;
const motif = /((?:href|src)=")(gestion-stockage-(?:css|js)\/[^"?]+)(?:\?v=[^"]*)?(")/g;
page = page.replace(motif, (tout, avant, relatif, apres) => {
  if (!fs.existsSync(path.join(racine, relatif))) {
    throw new Error('fichier introuvable : ' + relatif);
  }
  touches += 1;
  return avant + relatif + '?v=' + empreinte(relatif) + apres;
});

fs.writeFileSync(path.join(racine, PAGE), crlf ? page.replace(/\n/g, '\r\n') : page);
console.log(touches + ' fichiers estampilles dans ' + PAGE);
for (const [f, h] of empreintes) console.log('  ' + h + '  ' + f);

// Le service worker garde les fichiers dans un cache nommé. On y écrit
// l'empreinte de la page : chaque envoi repart d'un cache neuf, et l'ancien est
// effacé à l'activation — sans quoi les fichiers de toutes les versions passées
// s'y empileraient sans jamais resservir.
const SW = 'sw.js';
const cheminSw = path.join(racine, SW);
if (fs.existsSync(cheminSw)) {
  let sw = fs.readFileSync(cheminSw, 'utf8');
  const crlfSw = sw.includes('\r\n');
  if (crlfSw) sw = sw.replace(/\r\n/g, '\n');
  const marque = crypto.createHash('md5').update(page).digest('hex').slice(0, 8);
  // On vérifie que la ligne existe, et non qu'elle change : deux passages sur
  // une page identique donnent la même empreinte, et le second criait à tort.
  const motif = /const CACHE = '[^']*';/;
  if (!motif.test(sw)) throw new Error('ligne CACHE introuvable dans ' + SW);
  sw = sw.replace(motif, "const CACHE = 'nyasako-" + marque + "';");
  fs.writeFileSync(cheminSw, crlfSw ? sw.replace(/\n/g, '\r\n') : sw);
  console.log('cache du service worker : nyasako-' + marque);
}
