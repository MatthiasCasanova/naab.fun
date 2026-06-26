# naab.fun

Mini-site de jeux multijoueurs absurdes. Le premier jeu disponible,
**Garticphone+**, reprend des chaînes créatives inspirées du téléphone arabe dessiné. Le
serveur impose à chaque joueur un texte, un audio ou un dessin selon les
paramètres choisis par l'hôte. Les rooms, contributions et enregistrements
restent uniquement en mémoire dans le processus Node.js.

## Lancer en local

Prérequis : Node.js 20 ou plus récent.

```bash
npm install
npm run dev
```

Ouvrez ensuite `http://localhost:3000`. Pour tester à plusieurs joueurs, ouvrez
plusieurs fenêtres de navigation, créez une partie dans la première, rejoignez
son code dans les autres, puis utilisez le bouton **Lancer la partie** de l'hôte.
Le navigateur demande l'autorisation d'utiliser le microphone lors d'une
contribution audio. Le microphone fonctionne sur `localhost` et en HTTPS.

## Règles du jeu

- L'hôte peut lancer la partie dès que 2 joueurs sont connectés.
- Chaque jeu permet de saisir son nombre de manches, dans la limite adaptée aux
  joueurs présents.
- Garticphone+ permet d'activer ou désactiver séparément le texte, le dessin et
  l'audio, avec au moins un type conservé.
- Le mode **Party** enchaîne de 1 à 10 jeux tirés parmi ceux activés par l'hôte,
  sans répétition immédiate lorsqu'au moins deux jeux sont disponibles.
- Chaque manche dure 60 secondes et se termine plus tôt si tout le monde valide.
- Le premier type de chaque chaîne est imposé aléatoirement par le serveur.
- Le type suivant est choisi aléatoirement parmi les types actifs autres que le
  précédent, lorsqu'il existe plusieurs choix.
- Un enregistrement audio dure automatiquement 5 secondes.
- Les chaînes tournent entre les joueurs sans rendre sa propre chaîne après la
  première manche. En mode automatique, chacun participe une fois à chaque
  chaîne.
- Les absences et déconnexions deviennent des contributions vides afin de ne
  jamais bloquer la partie.
- À la fin, seul l'hôte révèle le résumé contribution par contribution, de
  façon synchronisée pour tous.

Les tests automatisés se lancent avec :

```bash
npm test
```

## Publier sur GitHub

Depuis ce dossier :

```bash
git init
git add .
git commit -m "Initial multiplayer game"
git branch -M main
git remote add origin https://github.com/VOTRE-COMPTE/VOTRE-DEPOT.git
git push -u origin main
```

## Déployer le serveur sur Render

1. Créez un nouveau **Blueprint** Render et sélectionnez le dépôt GitHub. Le
   fichier `render.yaml` configure le Web Service Node.js gratuit, la branche
   `main` et un déploiement automatique à chaque commit.
   Si le service existe déjà, synchronisez le Blueprint ou vérifiez dans
   **Settings > Build & Deploy** que **Auto-Deploy** est activé sur `main`.
2. Le fichier `render.yaml` définit déjà `ALLOWED_ORIGINS` avec les quatre
   origines prévues :

   ```text
   https://multiplayer-room-test.onrender.com,https://mathiascasanova.com,https://www.mathiascasanova.com,http://localhost:3000
   ```

   Une origine contient uniquement le protocole et le domaine, jamais `/game/`.
   N'utilisez pas `*` en production. Si le nom du service Render ou du domaine
   change, mettez cette variable à jour dans Render et dans `render.yaml`.
3. Pour mettre à jour un service qui servait encore une ancienne version,
   utilisez une fois **Manual Deploy > Deploy latest commit**. Les prochains
   pushes sur `main` seront ensuite déployés automatiquement.
4. Attendez la fin du déploiement et vérifiez
   `https://VOTRE-SERVICE.onrender.com/health`.

Render peut suspendre un Web Service gratuit inactif. L'interface garde une
requête `/health` longue ouverte pour déclencher le réveil et lance une sonde
supplémentaire toutes les 3 secondes pendant 90 secondes. L'URL, les statuts
HTTP et les erreurs réseau ou CORS sont visibles dans la console du navigateur.

## Utiliser le frontend sur mathiascasanova.com/game/

`public/config.js` contient actuellement l'URL Render, sans slash final :

```js
window.GAME_SERVER_URL = "https://multiplayer-room-test.onrender.com";
```

Envoyez ensuite **uniquement le contenu du dossier `public`** dans le dossier
`/game` de l'hébergement actuel. Les liens CSS et JavaScript sont relatifs et
fonctionnent donc sous `/game/`.

Pour servir frontend et serveur depuis le même domaine, laissez
`window.GAME_SERVER_URL = "";`. Le navigateur utilisera automatiquement
l'origine courante.

## Variables d'environnement

- `PORT` : port HTTP local. Render le fournit automatiquement.
- `NODE_ENV` : utilisez `production` sur Render.
- `ALLOWED_ORIGINS` : liste d'origines frontend séparées par des virgules.

Le service expose `GET /health`, qui renvoie `{"status":"ok"}`.

Le badge en bas à droite affiche `v1.0.0+<commit>`. Le suffixe vient de
`RENDER_GIT_COMMIT`, fourni automatiquement par Render : il change donc à
chaque push déployé. `GET /version` expose la même information en JSON.
