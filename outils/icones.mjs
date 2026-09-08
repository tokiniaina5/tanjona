// Fabrique les icônes de l'application installable.
//
// Écrit les PNG à la main : le dépôt n'a aucune dépendance, et en ajouter une
// pour trois carrés de couleur en demanderait l'installation à quiconque
// reprend le projet. zlib suffit — c'est tout ce qu'un PNG réclame.
//
// À relancer si la marque ou les couleurs changent :  node outils/icones.mjs

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FOND = [0x13, 0x1a, 0x20];   // --panel
const ENCRE = [0x4f, 0xd8, 0xe0];  // --cyan

function crc32(buf){
  let c, table = crc32.table;
  if(!table){
    table = crc32.table = new Int32Array(256);
    for(let n = 0; n < 256; n++){
      c = n;
      for(let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c;
    }
  }
  c = -1;
  for(let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function morceau(type, donnees){
  const nom = Buffer.from(type, 'ascii');
  const taille = Buffer.alloc(4);
  taille.writeUInt32BE(donnees.length, 0);
  const somme = Buffer.alloc(4);
  somme.writeUInt32BE(crc32(Buffer.concat([nom, donnees])), 0);
  return Buffer.concat([taille, nom, donnees, somme]);
}

// Un PNG en couleurs vraies avec transparence : chaque ligne est précédée d'un
// octet de filtre, laissé à zéro — les images sont petites, la compression n'a
// rien à y gagner.
function ecrirePng(fichier, largeur, hauteur, pixel){
  const lignes = Buffer.alloc(hauteur * (1 + largeur * 4));
  let i = 0;
  for(let y = 0; y < hauteur; y++){
    lignes[i++] = 0;
    for(let x = 0; x < largeur; x++){
      const [r, v, b, a] = pixel(x, y);
      lignes[i++] = r; lignes[i++] = v; lignes[i++] = b; lignes[i++] = a;
    }
  }
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(largeur, 0);
  entete.writeUInt32BE(hauteur, 4);
  entete[8] = 8;   // 8 bits par canal
  entete[9] = 6;   // couleurs vraies + alpha
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau('IHDR', entete),
    morceau('IDAT', zlib.deflateSync(lignes, { level: 9 })),
    morceau('IEND', Buffer.alloc(0))
  ]);
  fs.writeFileSync(path.join(racine, fichier), png);
  return png.length;
}

// La marque : un « N » bâton, lisible à quarante-huit pixels comme à cinq cents.
// Deux montants et une diagonale, décrits en proportions de l'icône.
function dansLeN(u, v, epaisseur){
  const gauche = 0.30, droite = 0.70, haut = 0.28, bas = 0.72;
  if(v < haut || v > bas) return false;
  if(u >= gauche && u <= gauche + epaisseur) return true;
  if(u >= droite - epaisseur && u <= droite) return true;
  // La diagonale : on mesure l'écart horizontal à la droite qui joint les deux
  // sommets, corrigé de sa pente pour garder une épaisseur constante à l'œil.
  const t = (v - haut) / (bas - haut);
  const centre = gauche + t * (droite - gauche);
  const pente = (droite - gauche) / (bas - haut);
  const large = epaisseur * Math.sqrt(1 + pente * pente);
  return Math.abs(u - centre) <= large / 2;
}

// Coin arrondi : la distance au rectangle intérieur, pour un bord net sans
// escalier — on lisse sur un pixel.
function couvertureRond(x, y, taille, rayon, marge){
  if(rayon <= 0) return 1;   // carré plein : rien à arrondir
  const min = marge, max = taille - marge;
  const cx = Math.min(Math.max(x + 0.5, min + rayon), max - rayon);
  const cy = Math.min(Math.max(y + 0.5, min + rayon), max - rayon);
  const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
  return Math.min(1, Math.max(0, rayon - d + 0.5));
}

function fabriquer(fichier, taille, { marge = 0, rayonRelatif = 0.22 } = {}){
  const rayon = taille * rayonRelatif;
  const epaisseur = 0.11;
  const poids = ecrirePng(fichier, taille, taille, (x, y) => {
    const dedans = couvertureRond(x, y, taille, rayon, marge);
    if(dedans <= 0) return [0, 0, 0, 0];
    const u = (x + 0.5) / taille, v = (y + 0.5) / taille;
    const encre = dansLeN(u, v, epaisseur);
    const c = encre ? ENCRE : FOND;
    return [c[0], c[1], c[2], Math.round(255 * dedans)];
  });
  console.log('  ' + fichier + ' — ' + taille + '×' + taille + ', ' + (poids / 1024).toFixed(1) + ' Ko');
}

console.log("Icônes de l'application :");
fabriquer('icone-192.png', 192);
fabriquer('icone-512.png', 512);
// « maskable » : Android rogne lui-même l'icône, en cercle ou en écusson. Elle
// doit donc remplir tout le carré — un coin arrondi de notre fait laisserait du
// vide dans le masque — et la marque tenir dans les 80 % du centre, où qu'on
// coupe. Le « N » occupe le tiers central : il passe partout.
fabriquer('icone-512-masquable.png', 512, { rayonRelatif: 0 });
