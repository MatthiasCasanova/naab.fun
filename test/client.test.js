"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const {
  buildEndpointUrl,
  describeError,
  formatTime,
  getRoundIntro,
  getTimerLevel,
  normalizeVolume,
  normalizeServerUrl
} = require("../public/client-utils");

const publicPath = (...segments) =>
  path.join(__dirname, "..", "public", ...segments);

function readPublicFile(fileName) {
  return fs.readFileSync(publicPath(fileName), "utf8");
}

test("normalizeServerUrl utilise la configuration et supprime chemins et slashs", () => {
  assert.equal(
    normalizeServerUrl(
      " https://multiplayer-room-test.onrender.com/// ",
      "https://fallback.example"
    ),
    "https://multiplayer-room-test.onrender.com"
  );
});

test("normalizeServerUrl utilise window.location.origin si la configuration est vide", () => {
  assert.equal(
    normalizeServerUrl("", "https://mathiascasanova.com"),
    "https://mathiascasanova.com"
  );
});

test("buildEndpointUrl ne produit jamais de double slash dans le chemin", () => {
  assert.equal(
    buildEndpointUrl(
      "https://multiplayer-room-test.onrender.com",
      "/health"
    ),
    "https://multiplayer-room-test.onrender.com/health"
  );
});

test("describeError conserve le nom et le message exacts", () => {
  const error = new Error("Failed to fetch");
  error.name = "TypeError";
  assert.equal(describeError(error), "TypeError: Failed to fetch");
});

test("index.html charge Socket.IO et les utilitaires avant app.js", () => {
  const html = readPublicFile("index.html");
  const socketIndex = html.indexOf('src="./socket.io.min.js"');
  const configIndex = html.indexOf('src="./config.js"');
  const utilsIndex = html.indexOf('src="./client-utils.js"');
  const appIndex = html.indexOf('src="./app.js"');

  assert.ok(socketIndex >= 0);
  assert.ok(configIndex > socketIndex);
  assert.ok(utilsIndex > configIndex);
  assert.ok(appIndex > utilsIndex);
});

test("config.js cible le service Render attendu", () => {
  const config = readPublicFile("config.js");

  assert.match(
    config,
    /window\.GAME_SERVER_URL\s*=\s*"https:\/\/multiplayer-room-test\.onrender\.com"/
  );
});

test("app.js désactive le cache et journalise l'URL health", () => {
  const app = readPublicFile("app.js");

  assert.match(app, /cache:\s*"no-store"/);
  assert.match(app, /console\.info\(`\[health\] GET \$\{healthUrl\}`\)/);
  assert.match(app, /transports:\s*\["polling", "websocket"\]/);
});

test("l'interface contient le lobby, le canvas, l'audio et les résultats", () => {
  const html = readPublicFile("index.html");

  assert.match(html, /id="start-game-button"/);
  assert.match(html, /id="drawing-canvas"/);
  assert.match(html, /id="record-audio-button"/);
  assert.match(html, /id="play-audio-button"/);
  assert.match(html, /id="results-view"/);
  assert.match(html, /id="return-lobby-button"/);
});

test("normalizeVolume restaure la valeur par défaut et borne le volume", () => {
  assert.equal(normalizeVolume(null, 1), 1);
  assert.equal(normalizeVolume("", 0.6), 0.6);
  assert.equal(normalizeVolume("0.35", 1), 0.35);
  assert.equal(normalizeVolume(-2, 1), 0);
  assert.equal(normalizeVolume(4, 1), 1);
  assert.equal(normalizeVolume("invalide", 0.7), 0.7);
});

test("le timer est formaté et classé selon les seuils visuels", () => {
  assert.equal(formatTime(0), "00:00");
  assert.equal(formatTime(61.9), "01:01");
  assert.equal(getTimerLevel(45), "normal");
  assert.equal(getTimerLevel(20), "normal");
  assert.equal(getTimerLevel(19), "warning");
  assert.equal(getTimerLevel(10), "warning");
  assert.equal(getTimerLevel(9), "danger");
});

test("les introductions correspondent au type reçu", () => {
  assert.match(getRoundIntro("audio"), /produit ce son/);
  assert.match(getRoundIntro("drawing"), /dessin/);
  assert.match(getRoundIntro("text"), /Fais du bruit/);
  assert.match(getRoundIntro(null), /logique est facultative/);
});

test("l'interface audio est compacte et ne contient plus l'ancien bouton stop", () => {
  const html = readPublicFile("index.html");

  assert.match(html, /id="record-audio-button"/);
  assert.match(html, /id="play-audio-button"/);
  assert.match(html, /id="reset-audio-button"/);
  assert.match(html, /id="validate-audio-button"/);
  assert.match(html, /id="audio-progress"/);
  assert.match(html, /id="audio-duration"/);
  assert.doesNotMatch(html, /id="stop-audio-button"/);
});

test("l'outil de dessin expose la palette et tous les outils demandés", () => {
  const html = readPublicFile("index.html");
  const swatches = html.match(/class="color-swatch(?: active)?"/g) || [];

  assert.equal(swatches.length, 10);
  ["pencil", "line", "circle", "fill", "eraser"].forEach((tool) => {
    assert.match(html, new RegExp(`data-tool="${tool}"`));
  });
  assert.match(html, /id="undo-drawing-button"/);
  assert.match(html, /id="redo-drawing-button"/);
  assert.match(html, /id="clear-drawing-button"/);
  assert.match(html, /id="drawing-color" type="color"/);
});

test("les paramètres, l'introduction et l'horloge sont présents", () => {
  const html = readPublicFile("index.html");

  assert.match(html, /id="settings-button"/);
  assert.match(html, /id="volume-slider"/);
  assert.match(html, /id="mute-button"/);
  assert.match(html, /id="theme-toggle"/);
  assert.match(html, /id="round-intro"/);
  assert.match(html, /id="intro-audio-play-button"/);
  assert.match(html, /id="game-clock"/);
  assert.doesNotMatch(html, /id="timer-progress"/);
});

test("le lobby masque le code et expose les réglages de l'hôte", () => {
  const html = readPublicFile("index.html");

  assert.match(html, /id="room-title" class="room-code">\*{6}</);
  assert.match(html, /id="toggle-code-button"/);
  assert.match(html, /id="game-settings-panel"/);
  assert.match(html, /id="round-count-select"/);
  assert.match(html, /id="input-type-count-select"/);
});

test("les sélecteurs d'identifiants de app.js existent dans index.html", () => {
  const html = readPublicFile("index.html");
  const app = readPublicFile("app.js");
  const ids = [
    ...app.matchAll(/document\.querySelector\("#([^"]+)"\)/g)
  ].map((match) => match[1]);

  assert.ok(ids.length > 0);
  ids.forEach((id) => {
    assert.match(html, new RegExp(`id="${id}"`), `Identifiant absent : ${id}`);
  });
});

test("index.html ne contient aucun identifiant dupliqué", () => {
  const html = readPublicFile("index.html");
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const uniqueIds = new Set(ids);

  assert.equal(ids.length, uniqueIds.size);
});

test("le frontend conserve le volume et utilise le timer du serveur", () => {
  const app = readPublicFile("app.js");
  const css = readPublicFile("styles.css");

  assert.match(app, /localStorage\.setItem\(VOLUME_STORAGE_KEY/);
  assert.match(app, /audioElement\.volume = siteVolume/);
  assert.match(app, /THEME_STORAGE_KEY = "kamoulox-theme"/);
  assert.match(app, /AUDIO_RECORDING_DURATION_MS = 10000/);
  assert.match(app, /window\.setTimeout\([\s\S]*AUDIO_RECORDING_DURATION_MS/);
  assert.match(app, /gameState\.serverNow - Date\.now\(\)/);
  assert.match(app, /gameState\.roundEndsAt - serverTime/);
  assert.match(app, /INTRO_DURATION_MS = 4500/);
  assert.match(app, /emitWithAcknowledgment\("navigateResults"/);
  assert.match(app, /emitWithAcknowledgment\(\s*"updateGameSettings"/);
  assert.match(css, /#drawing-canvas[\s\S]*touch-action:\s*none/);
  assert.match(css, /@media \(max-width:\s*640px\)/);
  assert.match(css, /\.game-clock\.warning/);
  assert.match(css, /\.game-clock\.danger/);
  assert.match(css, /html\[data-theme="dark"\]/);
});
