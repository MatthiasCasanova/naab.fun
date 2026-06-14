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
2. Dans les variables d'environnement du service, définissez
   `ALLOWED_ORIGINS` avec les origines autorisées, séparées par des virgules :

   ```text
   https://mathiascasanova.com,https://www.mathiascasanova.com
   ```

   Une origine contient uniquement le protocole et le domaine, jamais `/game/`.
   N'utilisez pas `*` en production. Les adresses localhost sont autorisées
   automatiquement hors production.
3. Attendez la fin du déploiement et vérifiez
   `https://VOTRE-SERVICE.onrender.com/health`.

Render peut suspendre un Web Service gratuit inactif. L'interface appelle
`/health` et retente automatiquement pendant 90 secondes avant chaque création
ou connexion à une partie.

## Utiliser le frontend sur mathiascasanova.com/game/

Dans `public/config.js`, remplacez la valeur vide par l'URL Render, sans slash
final :

```js
window.GAME_SERVER_URL = "https://VOTRE-SERVICE.onrender.com";
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
