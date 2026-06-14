# Kamoulox 30000

Petit lobby multijoueur sans compte ni base de données. Les rooms et les joueurs
sont conservés uniquement en mémoire par le processus Node.js.

## Lancer en local

Prérequis : Node.js 20 ou plus récent.

```bash
npm install
npm run dev
```

Ouvrez ensuite `http://localhost:3000`. Pour tester à deux joueurs, ouvrez deux
fenêtres de navigation (ou une fenêtre normale et une fenêtre privée), créez une
partie dans la première, puis rejoignez son code dans la seconde.

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
   fichier `render.yaml` configure le Web Service Node.js gratuit.
2. Le fichier `render.yaml` définit déjà `ALLOWED_ORIGINS` avec les quatre
   origines prévues :

   ```text
   https://multiplayer-room-test.onrender.com,https://mathiascasanova.com,https://www.mathiascasanova.com,http://localhost:3000
   ```

   Une origine contient uniquement le protocole et le domaine, jamais `/game/`.
   N'utilisez pas `*` en production. Si le nom du service Render ou du domaine
   change, mettez cette variable à jour dans Render et dans `render.yaml`.
3. Attendez la fin du déploiement et vérifiez
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
