// Pose le mot de passe d'application Gmail dans les secrets Supabase, sans
// avoir à le recopier dans une commande : il est demandé ici, au clavier.
//
// À lancer depuis le dossier du projet :  node outils/gmail-secret.mjs

import readline from 'readline';
import { spawnSync } from 'child_process';

const PROJET = 'ezpsapvthujkhttbfhlr';
const GMAIL = 'rasolofonirainytokiniaina@gmail.com';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Apetaho eto ilay mot de passe d\'application Google (litera 16), dia tsindrio Entrée :\n> ', (brut) => {
  rl.close();
  // Google l'affiche en quatre groupes : les espaces ne comptent pas.
  const mdp = String(brut || '').replace(/\s+/g, '').toLowerCase();
  if (!/^[a-z]{16}$/.test(mdp)) {
    console.log('\n✗ Tsy litera 16 izany. Tsy nisy niova. Avereno : node outils/gmail-secret.mjs');
    process.exit(1);
  }
  const r = spawnSync('supabase', ['secrets', 'set', 'GMAIL_USER=' + GMAIL, 'GMAIL_APP_PASSWORD=' + mdp, '--project-ref', PROJET],
    { stdio: ['inherit', 'pipe', 'pipe'], shell: true, encoding: 'utf8' });
  if (r.status === 0) {
    console.log('\n✓ Voapetraka. Tsy mila apetraka indray ny fonctions.');
  } else {
    console.log('\n✗ Tsy nety :\n' + (r.stderr || r.stdout || ''));
    process.exit(1);
  }
});
