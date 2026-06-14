"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const {
  buildEndpointUrl,
  describeError,
  normalizeServerUrl
} = require("../public/client-utils");

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
  const html = fs.readFileSync(
    path.join(__dirname, "..", "public", "index.html"),
    "utf8"
  );
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
  const config = fs.readFileSync(
    path.join(__dirname, "..", "public", "config.js"),
    "utf8"
  );

  assert.match(
    config,
    /window\.GAME_SERVER_URL\s*=\s*"https:\/\/multiplayer-room-test\.onrender\.com"/
  );
});

test("app.js désactive le cache et journalise l'URL health", () => {
  const app = fs.readFileSync(
    path.join(__dirname, "..", "public", "app.js"),
    "utf8"
  );

  assert.match(app, /cache:\s*"no-store"/);
  assert.match(app, /console\.info\(`\[health\] GET \$\{healthUrl\}`\)/);
  assert.match(app, /transports:\s*\["polling", "websocket"\]/);
});

test("l'interface contient le lobby, le canvas, l'audio et les résultats", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "..", "public", "index.html"),
    "utf8"
  );

  assert.match(html, /id="start-game-button"/);
  assert.match(html, /id="drawing-canvas"/);
  assert.match(html, /id="record-audio-button"/);
  assert.match(html, /id="play-audio-button"/);
  assert.match(html, /id="results-view"/);
  assert.match(html, /id="return-lobby-button"/);
});
