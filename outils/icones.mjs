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
function ecrirePng(fichier, largeur, hauteur, pixel, niveau){
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
    // Les icônes se compressent au mieux, une fois pour toutes. Les écrans de
    // démarrage sont cent fois plus grands et presque unis : le niveau 6 les
    // réduit autant, en une fraction du temps.
    morceau('IDAT', zlib.deflateSync(lignes, { level: niveau === undefined ? 9 : niveau })),
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

// ---------------------------------------------------------------------------
// LES ÉCRANS DE DÉMARRAGE D'iOS
// ---------------------------------------------------------------------------
// Android fabrique le sien tout seul : le manifeste lui donne le nom, l'icône
// et la couleur de fond, il en fait un écran de lancement. iOS ne lit pas le
// manifeste et n'invente rien — sans image à sa taille exacte, il ouvre
// l'application sur un rectangle vide.
//
// « À sa taille exacte » est à prendre au mot : la balise ne vaut que si sa
// media-query décrit l'appareil au pixel près, largeur, hauteur et densité.
// D'où cette table, et une image par ligne. Un appareil absent n'a pas d'écran
// de démarrage — il retrouve le vide d'avant, rien de pire.
const APPAREILS = [
  // iPhone — en portrait seulement : on ne lance pas une application de
  // gestion en tenant son téléphone en travers, et l'écran manquant ne coûte
  // que le vide qu'on avait déjà.
  { l: 320, h: 568, d: 2, nom: 'iPhone SE (1re génération)' },
  { l: 375, h: 667, d: 2, nom: 'iPhone 8, SE 2/3' },
  { l: 414, h: 736, d: 3, nom: 'iPhone 8 Plus' },
  { l: 375, h: 812, d: 3, nom: 'iPhone X, XS, 11 Pro, 12/13 mini' },
  { l: 414, h: 896, d: 2, nom: 'iPhone XR, 11' },
  { l: 414, h: 896, d: 3, nom: 'iPhone XS Max, 11 Pro Max' },
  { l: 390, h: 844, d: 3, nom: 'iPhone 12, 13, 14' },
  { l: 428, h: 926, d: 3, nom: 'iPhone 12/13 Pro Max, 14 Plus' },
  { l: 393, h: 852, d: 3, nom: 'iPhone 14 Pro, 15, 15 Pro, 16' },
  { l: 430, h: 932, d: 3, nom: 'iPhone 14 Pro Max, 15 Plus/Pro Max, 16 Plus' },
  { l: 402, h: 874, d: 3, nom: 'iPhone 16 Pro' },
  { l: 440, h: 956, d: 3, nom: 'iPhone 16 Pro Max' },
  // iPad — dans les deux sens : une tablette se pose sur un bureau en largeur
  // aussi souvent qu'on la tient en hauteur.
  { l: 744, h: 1133, d: 2, nom: 'iPad mini 6', paysage: true },
  { l: 768, h: 1024, d: 2, nom: 'iPad 9,7", mini 4/5', paysage: true },
  { l: 810, h: 1080, d: 2, nom: 'iPad 10,2"', paysage: true },
  { l: 820, h: 1180, d: 2, nom: 'iPad 10,9" (10e génération)', paysage: true },
  { l: 834, h: 1112, d: 2, nom: 'iPad Air 10,5"', paysage: true },
  { l: 834, h: 1194, d: 2, nom: 'iPad Pro 11", Air 11"', paysage: true },
  { l: 1024, h: 1366, d: 2, nom: 'iPad Pro 12,9"', paysage: true }
];

const DOSSIER = 'demarrage';
// Le fond du manifeste, et non celui de l'icône : l'écran de démarrage prolonge
// la page qui va s'ouvrir, pas la vignette de l'écran d'accueil.
const FOND_ECRAN = [0x0a, 0x0d, 0x10];

// L'icône, posée au milieu — c'est ce que fait Android de son côté, et deux
// lancements qui ne se ressemblent pas donneraient l'impression de deux
// applications différentes.
function fabriquerDemarrage(fichier, largeur, hauteur){
  const cote = Math.round(Math.min(largeur, hauteur) * 0.28);
  const x0 = Math.round((largeur - cote) / 2);
  const y0 = Math.round((hauteur - cote) / 2);
  const rayon = cote * 0.22;
  const epaisseur = 0.11;

  const poids = ecrirePng(fichier, largeur, hauteur, (x, y) => {
    const lx = x - x0, ly = y - y0;
    if(lx < 0 || ly < 0 || lx >= cote || ly >= cote) return [FOND_ECRAN[0], FOND_ECRAN[1], FOND_ECRAN[2], 255];
    const dedans = couvertureRond(lx, ly, cote, rayon, 0);
    if(dedans <= 0) return [FOND_ECRAN[0], FOND_ECRAN[1], FOND_ECRAN[2], 255];
    const u = (lx + 0.5) / cote, v = (ly + 0.5) / cote;
    const c = dansLeN(u, v, epaisseur) ? ENCRE : FOND;
    // L'image est opaque : le bord arrondi se fond dans le fond de l'écran
    // plutôt que dans la transparence, qu'iOS ne saurait de toute façon pas
    // sur quoi poser.
    return [
      Math.round(FOND_ECRAN[0] + (c[0] - FOND_ECRAN[0]) * dedans),
      Math.round(FOND_ECRAN[1] + (c[1] - FOND_ECRAN[1]) * dedans),
      Math.round(FOND_ECRAN[2] + (c[2] - FOND_ECRAN[2]) * dedans),
      255
    ];
  }, 6);
  return poids;
}

function requete(a, orientation){
  return '(device-width: ' + a.l + 'px) and (device-height: ' + a.h + 'px)' +
         ' and (-webkit-device-pixel-ratio: ' + a.d + ')' +
         ' and (orientation: ' + orientation + ')';
}

console.log("\nÉcrans de démarrage d'iOS :");
fs.mkdirSync(path.join(racine, DOSSIER), { recursive: true });
const balises = [];
let total = 0;
for(const a of APPAREILS){
  const sens = a.paysage ? ['portrait', 'paysage'] : ['portrait'];
  for(const s of sens){
    const paysage = s === 'paysage';
    const largeur = (paysage ? a.h : a.l) * a.d;
    const hauteur = (paysage ? a.l : a.h) * a.d;
    const fichier = DOSSIER + '/' + largeur + 'x' + hauteur + '.png';
    const poids = fabriquerDemarrage(fichier, largeur, hauteur);
    total += poids;
    balises.push('<link rel="apple-touch-startup-image" media="' +
                 requete(a, paysage ? 'landscape' : 'portrait') +
                 '" href="/' + fichier + '">');
    console.log('  ' + fichier + ' — ' + a.nom + (paysage ? ' (paysage)' : '') +
                ', ' + (poids / 1024).toFixed(1) + ' Ko');
  }
}
console.log('  — ' + balises.length + ' images, ' + (total / 1024).toFixed(0) + ' Ko en tout');

// Les balises vivent dans cette table, pas dans la page : une taille d'iPhone
// ajoutée à la main d'un côté et oubliée de l'autre donnerait une image que
// personne ne demande, ou une demande sans image. On les réécrit donc ici,
// entre deux repères, comme versionner.mjs réécrit les empreintes.
const PAGE = 'gestion-stockage.html';
const DEBUT = '<!-- écrans de démarrage iOS : écrits par outils/icones.mjs -->';
const FIN_REPERE = '<!-- fin des écrans de démarrage iOS -->';
const cheminPage = path.join(racine, PAGE);
let page = fs.readFileSync(cheminPage, 'utf8');
const crlfPage = page.includes('\r\n');
if(crlfPage) page = page.replace(/\r\n/g, '\n');
const i = page.indexOf(DEBUT), j = page.indexOf(FIN_REPERE);
if(i < 0 || j < 0) throw new Error('repères introuvables dans ' + PAGE);
page = page.slice(0, i) + DEBUT + '\n' + balises.join('\n') + '\n' + page.slice(j);
fs.writeFileSync(cheminPage, crlfPage ? page.replace(/\n/g, '\r\n') : page, 'utf8');
console.log('  — balises réécrites dans ' + PAGE);
