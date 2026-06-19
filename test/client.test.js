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

function readProjectFile(fileName) {
  return fs.readFileSync(path.join(__dirname, "..", fileName), "utf8");
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

test("render.yaml déploie automatiquement la branche main", () => {
  const renderConfig = readProjectFile("render.yaml");

  assert.match(renderConfig, /name:\s+multiplayer-room-test/);
  assert.match(
    renderConfig,
    /repo:\s+https:\/\/github\.com\/MatthiasCasanova\/multiplayer-room-test/
  );
  assert.match(renderConfig, /branch:\s+main/);
  assert.match(renderConfig, /autoDeployTrigger:\s+commit/);
  assert.match(renderConfig, /healthCheckPath:\s+\/health/);
});

test("app.js désactive le cache et journalise l'URL health", () => {
  const app = readPublicFile("app.js");

  assert.match(app, /cache:\s*"no-store"/);
  assert.match(app, /console\.info\(`\[health\] GET \$\{healthUrl\}`\)/);
  assert.match(app, /transports:\s*\["polling", "websocket"\]/);
});

test("l'interface contient le lobby, le canvas, l'audio et les résultats", () => {
  const html = readPublicFile("index.html");
  const app = readPublicFile("app.js");
  const css = readPublicFile("styles.css");

  assert.match(html, /id="start-game-button"/);
  assert.match(html, /id="drawing-canvas"/);
  assert.match(html, /id="record-audio-button"/);
  assert.match(html, /id="play-audio-button"/);
  assert.match(html, /id="results-view"/);
  assert.match(html, /id="return-lobby-button"/);
  assert.match(html, /id="app-version"/);
  assert.match(app, /buildEndpointUrl\(serverUrl, "\/version"\)/);
  assert.match(app, /function loadAppVersion/);
  assert.match(css, /\.app-version\s*\{[\s\S]*right:\s*10px[\s\S]*bottom:\s*8px/);
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
  assert.match(getRoundIntro(null), /premier/);
});

test("l'interface audio est compacte et ne contient plus l'ancien bouton stop", () => {
  const html = readPublicFile("index.html");

  assert.match(html, /id="record-audio-button"/);
  assert.match(html, /id="play-audio-button"/);
  assert.match(html, /id="reset-audio-button"/);
  assert.match(html, /id="validate-audio-button"/);
  assert.match(html, /id="audio-progress"/);
  assert.match(html, /id="audio-waveform"/);
  assert.match(html, /id="audio-playhead"/);
  assert.match(html, /id="audio-duration"/);
  assert.doesNotMatch(html, /id="stop-audio-button"/);
});

test("les lecteurs audio utilisent une forme d'onde et aucun controle natif", () => {
  const html = readPublicFile("index.html");
  const app = readPublicFile("app.js");
  const css = readPublicFile("styles.css");

  assert.match(app, /decodeWaveformPeaks/);
  assert.match(app, /decodeAudioData/);
  assert.match(app, /createAudioPlayer/);
  assert.match(app, /canvas\.waveformPeaks/);
  assert.doesNotMatch(app, /\.controls\s*=\s*true/);
  assert.doesNotMatch(html, /<audio[^>]*\scontrols(?:\s|>)/);
  assert.match(css, /\.audio-waveform-shell/);
  assert.match(css, /\.audio-playhead/);
  assert.match(css, /\.audio-player-card\.is-playing/);
  assert.match(css, /--waveform-active-end/);
  assert.match(
    app,
    /function scheduleWaveformRedraw\(\)[\s\S]*redrawWaveforms\(\)/
  );
  assert.match(app, /requestAnimationFrame\(animateTimeline\)/);
});

test("le reveal conserve le ratio natif des dessins", () => {
  const app = readPublicFile("app.js");
  const css = readPublicFile("styles.css");

  assert.match(app, /result-type-\$\{contribution\.type\}/);
  assert.match(
    css,
    /\.result-item\.result-type-drawing > div:last-child\s*\{[\s\S]*aspect-ratio:\s*8\s*\/\s*5/
  );
  assert.match(
    css,
    /\.result-item\.result-type-drawing \.result-image\s*\{[\s\S]*max-height:\s*none/
  );
});

test("les sliders partagent le composant visuel du jeu", () => {
  const html = readPublicFile("index.html");
  const css = readPublicFile("styles.css");

  assert.match(html, /class="range-shell volume-range-shell"/);
  assert.match(html, /class="game-range volume-slider"/);
  assert.match(html, /id="effects-volume-slider"/);
  assert.match(html, /id="effects-volume-value"/);
  assert.match(html, /class="game-range audio-progress"/);
  assert.match(css, /\.game-range::-webkit-slider-runnable-track/);
  assert.match(css, /\.game-range::-moz-range-track/);
  assert.match(css, /--range-progress/);
  assert.doesNotMatch(css, /accent-color/);
});

test("le contenu reçu passe par un aperçu plein écran temporaire", () => {
  const html = readPublicFile("index.html");
  const app = readPublicFile("app.js");
  const css = readPublicFile("styles.css");

  assert.match(html, /id="round-preview"/);
  assert.match(html, /id="round-preview-countdown"/);
  assert.match(html, /id="replay-previous-button"/);
  assert.match(html, /id="close-round-preview-button"/);
  assert.match(
    app,
    /function showRoundPreview\(/
  );
  assert.match(app, /const hasAutomaticClose =/);
  assert.match(
    app,
    /closeRoundPreviewButton\.addEventListener\("click"/
  );
  assert.match(app, /\} else if \(!introRoundKey\) \{/);
  assert.doesNotMatch(app, /PREVIOUS_REPLAY_DURATION_MS/);
  assert.match(
    css,
    /\.round-preview \.previous-text\s*\{[\s\S]*font-size:\s*clamp/
  );
  assert.match(css, /\.game-stage\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(
    html,
    /<h2 id="game-title">[\s\S]*id="game-prompt"[\s\S]*<\/h2>/
  );
  assert.doesNotMatch(html, /class="prompt-panel"/);
});

test("l'outil de dessin expose la palette et tous les outils demandés", () => {
  const html = readPublicFile("index.html");
  const css = readPublicFile("styles.css");
  const swatches = html.match(/class="color-swatch(?: active)?"/g) || [];

  assert.equal(swatches.length, 10);
  ["pencil", "line", "circle", "fill", "eraser"].forEach((tool) => {
    assert.match(html, new RegExp(`data-tool="${tool}"`));
  });
  assert.match(html, /id="undo-drawing-button"/);
  assert.match(html, /id="redo-drawing-button"/);
  assert.match(html, /id="clear-drawing-button"/);
  assert.match(html, /id="drawing-color" type="color"/);
  assert.match(css, /\.brush-size span\s*\{[\s\S]*place-self:\s*center/);
  assert.match(css, /\.brush-size\s*\{[\s\S]*padding:\s*0/);
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
  assert.doesNotMatch(html, /id="game-settings-button"/);
  assert.match(html, /class="game-tile-settings hidden"/);
  assert.match(html, /data-game-settings-id="kamoulox3000"/);
  assert.match(html, /id="game-settings-modal"/);
  assert.match(html, /id="game-settings-panel"/);
  assert.match(html, /id="round-count-input"/);
  assert.match(html, /id="input-types-settings"/);
  assert.match(html, /id="party-settings"/);
});

test("l'accueil propose les avatars et la room conserve une liste laterale", () => {
  const html = readPublicFile("index.html");
  const avatars = html.match(/class="avatar-option[^"]*"/g) || [];

  assert.equal(avatars.length, 8);
  assert.match(html, /id="avatar-picker"/);
  assert.match(html, /data-avatar="comet"/);
  assert.match(html, /data-avatar="robot"/);
  assert.match(html, /data-avatar="frog"/);
  assert.match(html, /id="players-sidebar"/);
  assert.match(html, /id="player-list"/);
  assert.match(html, /id="player-count"/);
  assert.match(html, /id="join-button"[\s\S]*href="#icon-check"/);
  assert.match(html, /id="room-name"/);
  assert.match(html, /maxlength="30"/);
  assert.match(html, /class="home-features"/);
  assert.match(html, /id="sidebar-game-summary"/);
  assert.match(html, /id="game-selection-grid"/);
});

test("la création transmet un nom de room et le serveur le valide", () => {
  const app = readPublicFile("app.js");
  const server = readProjectFile("server.js");

  assert.match(app, /function validateRoomName/);
  assert.match(app, /\{ nickname, roomName, avatarId: currentAvatarId \}/);
  assert.match(server, /function normalizeRoomName/);
  assert.match(server, /customName: customRoomName/);
  assert.match(server, /room\.customName \|\|/);
});

test("la room expose le chat, la sélection de jeu et son nom d'hôte", () => {
  const html = readPublicFile("index.html");
  const app = readPublicFile("app.js");
  const css = readPublicFile("styles.css");
  const server = readProjectFile("server.js");

  assert.match(html, /<title>naab\.fun<\/title>/);
  assert.match(html, /<h1>naab\.fun<\/h1>/);
  assert.match(html, /id="chat-sidebar"/);
  assert.match(html, /id="chat-messages"/);
  assert.match(html, /id="chat-form"/);
  assert.match(html, /id="chat-toggle-button"/);
  assert.match(html, /id="players-sidebar-title">naab\.fun room</);
  assert.match(html, /id="game-selection-grid"/);
  assert.match(html, /data-game-id="party"/);
  assert.match(html, /data-game-id="kamoulox3000"/);
  assert.match(html, /data-game-id="leagueOfNaabs"/);
  assert.match(html, /Kamoulox 3000/);
  assert.match(html, /League Of Naabs/);
  assert.match(html, /id="round-count-input"[^>]*type="number"/);
  assert.match(html, /id="party-game-count-input"/);
  assert.equal((html.match(/data-input-type/g) || []).length, 3);
  assert.equal((html.match(/data-party-game/g) || []).length, 2);
  assert.doesNotMatch(html, /id="game-settings-summary"/);
  assert.doesNotMatch(html, /id="start-help"/);
  assert.match(html, /id="spell-kit-editor"/);
  assert.match(html, /id="spell-input-1"/);
  assert.match(html, /id="quote-audio-slots"/);
  assert.match(html, /data-quote-index="3"/);
  assert.match(html, /class="game-tile game-tile-empty"/);
  assert.match(html, /id="sidebar-game-summary"/);
  assert.doesNotMatch(html, new RegExp("emo" + "te-option"));
  assert.doesNotMatch(html, new RegExp("emo" + "te-picker"));
  assert.doesNotMatch(html, />La bande</);
  assert.match(app, /room\.name \|\| "naab\.fun room"/);
  assert.match(app, /socket\.on\("chatMessage"/);
  assert.match(app, /emitWithAcknowledgment\("sendChatMessage"/);
  assert.match(app, /emitWithAcknowledgment\("selectRoomGame"/);
  assert.match(app, /emitWithAcknowledgment\("voteRoomGame"/);
  assert.match(app, /pendingRoomGameId/);
  assert.match(app, /pendingRoomGameVoteId/);
  assert.match(app, /function createRoomGameSelection/);
  assert.match(app, /function createRoomGameVotesWithCurrentVote/);
  assert.match(app, /function renderGameVotes/);
  assert.match(app, /function handleRoomGameClick/);
  assert.match(app, /function renderRoomLobbyState/);
  assert.match(app, /badge\.textContent = "👑"/);
  assert.match(app, /self-voted-only/);
  assert.match(app, /CONTRIBUTION_STEP_LABELS/);
  assert.match(app, /function createSpellKitView/);
  assert.match(app, /function createQuotePackView/);
  assert.match(app, /function renderPlayerReferenceText/);
  assert.match(app, /function createLeagueOfNaabsResultStep/);
  assert.match(app, /function renderLeagueOfNaabsResultChain/);
  assert.match(app, /function applyEditorCopy/);
  assert.match(html, /id="text-editor-label"/);
  assert.match(html, /id="drawing-editor-label"/);
  assert.match(html, /id="result-owner-label"/);
  assert.match(app, /renderedPlayerListSignature/);
  assert.match(app, /function getPlayerListSignature/);
  assert.doesNotMatch(app, new RegExp("setPlayer" + "Emo" + "te"));
  assert.doesNotMatch(server, new RegExp("setPlayer" + "Emo" + "te"));
  assert.match(css, /grid-template-areas:\s*"players main chat"/);
  assert.match(css, /\.game-selection-grid/);
  assert.match(css, /\.game-vote-stack\s*\{[\s\S]*right:\s*10px/);
  assert.match(css, /\.game-vote-avatar/);
  assert.match(css, /\.game-tile\.self-voted-only/);
  assert.match(css, /\.game-tile-settings/);
  assert.match(css, /\.game-tile-settings\s*\{[\s\S]*right:\s*12px/);
  assert.match(css, /\.spell-kit-editor/);
  assert.match(css, /\.quote-audio-slots/);
  assert.match(css, /\.player-reference/);
  assert.match(css, /\.league-result-item/);
  assert.doesNotMatch(css, /\.game-tile\.has-self-vote/);
  assert.match(css, /\.sidebar-lobby-signal/);
  assert.match(css, /\.chat-sidebar\.mobile-open/);
  assert.match(css, /\.chat-messages\s*\{[\s\S]*overflow:\s*hidden/);
  assert.match(app, /function trimChatToFit/);
  assert.match(app, /appendChatMessage\(message\)/);
});

test("l'accueil retire l'ancien surtitre et exploite le viewport", () => {
  const html = readPublicFile("index.html");
  const css = readPublicFile("styles.css");

  assert.doesNotMatch(html, />Téléphone créatif multijoueur</);
  assert.match(css, /\.app-shell\s*\{[\s\S]*width:\s*100%/);
});

test("les trois éditeurs sauvegardent un brouillon avant validation", () => {
  const app = readPublicFile("app.js");

  assert.match(app, /socket\.emit\(\s*"saveDraft"/);
  assert.match(app, /elements\.textContribution\.value/);
  assert.match(app, /drawingCanvas\.toDataURL\("image\/png"\)/);
  assert.match(app, /scheduleAudioSessionDraft\(session\)/);
  assert.match(app, /sendDraft\("audio", dataUrl, session\.roundIndex\)/);
  assert.match(app, /scheduleDraftSave\(DRAWING_DRAFT_SAVE_DEBOUNCE_MS\)/);
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

  assert.match(app, /localStorage\.setItem\(\s*AUDIO_VOLUME_STORAGE_KEY/);
  assert.match(app, /localStorage\.setItem\(\s*EFFECTS_VOLUME_STORAGE_KEY/);
  assert.match(app, /AUDIO_OUTPUT_SCALE = 0\.5/);
  assert.match(
    app,
    /audioElement\.volume = audioVolume \* AUDIO_OUTPUT_SCALE/
  );
  assert.match(app, /THEME_STORAGE_KEY = "kamoulox-theme"/);
  assert.match(app, /AUDIO_RECORDING_DURATION_MS = 5000/);
  assert.match(app, /window\.setTimeout\([\s\S]*AUDIO_RECORDING_DURATION_MS/);
  assert.match(app, /gameState\.serverNow - Date\.now\(\)/);
  assert.match(app, /gameState\.roundEndsAt - serverTime/);
  assert.match(app, /gameState\.previewEndsAt/);
  assert.match(app, /gameState\.countdownEndsAt/);
  assert.match(app, /closeRoundPreviewButton/);
  assert.match(app, /emitWithAcknowledgment\("navigateResults"/);
  assert.match(app, /emitWithAcknowledgment\(\s*"updateGameSettings"/);
  assert.match(css, /#drawing-canvas[\s\S]*touch-action:\s*none/);
  assert.match(css, /@media \(max-width:\s*820px\)/);
  assert.match(css, /@media \(max-width:\s*560px\)/);
  assert.match(css, /\.game-clock\.warning/);
  assert.match(css, /\.game-clock\.danger/);
  assert.match(css, /html\[data-theme="dark"\]/);
});

test("les effets sonores et le chrono respectent leur volume separe", () => {
  const app = readPublicFile("app.js");

  assert.match(app, /function playSoundEffect/);
  assert.match(app, /effectsVolume/);
  assert.match(app, /playSoundEffect\("tick"/);
  assert.match(app, /remaining <= 2500 \? 250/);
  assert.match(app, /Math\.pow\(1 - remaining \/ 10000, 2\)/);
  assert.match(app, /frequency:\s*245 - strength \* 25/);
  assert.doesNotMatch(app, /frequency:\s*850 \+ strength \* 650/);
});

test("le resume revele verticalement, defile et lance les audios", () => {
  const app = readPublicFile("app.js");
  const css = readPublicFile("styles.css");

  assert.match(app, /currentContributionIndex/);
  assert.match(app, /visibleContributions = chain\.contributions\.slice/);
  assert.match(app, /autoplayRevealedAudio/);
  assert.match(app, /await audioPlayer\.audio\.play\(\)/);
  assert.match(app, /current-reveal/);
  assert.match(app, /function scrollToCurrentResult/);
  assert.match(app, /container\.scrollTo\(/);
  assert.match(app, /emitWithAcknowledgment\("restartGame"\)/);
  assert.match(app, /restartGameButton\.classList\.toggle/);
  assert.match(
    readPublicFile("index.html"),
    /id="restart-game-button"[\s\S]*href="#icon-refresh"/
  );
  assert.match(css, /\.result-contributions[\s\S]*flex-direction:\s*column/);
  assert.match(css, /\.result-contributions[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /#text-contribution::selection/);
});

test("la mise en page reste dans le viewport et stabilise le canvas", () => {
  const css = readPublicFile("styles.css");

  assert.match(css, /html,\s*body\s*\{[\s\S]*height:\s*100%/);
  assert.match(css, /body\s*\{[\s\S]*overflow:\s*hidden/);
  assert.match(css, /\.app-shell\s*\{[\s\S]*height:\s*100dvh/);
  assert.match(
    css,
    /\.play-layout\.with-sidebar\s*\{[\s\S]*grid-template-columns/
  );
  assert.match(
    css,
    /\.canvas-shell\s*\{[\s\S]*width:\s*100%[\s\S]*height:\s*100%/
  );
  assert.match(
    css,
    /\.audio-empty-state,\s*\.audio-ready-state\s*\{[\s\S]*width:\s*100%/
  );
  assert.doesNotMatch(css, /width:\s*min\(100%,\s*560px\)/);
  const scrollableAxes = [
    ...css.matchAll(/overflow-(?:x|y):\s*(?:auto|scroll)/g)
  ].map((match) => match[0]);
  assert.deepEqual(scrollableAxes, ["overflow-y: auto"]);
});

test("les commandes utilisent le sprite d'icones et des animations coherentes", () => {
  const html = readPublicFile("index.html");
  const css = readPublicFile("styles.css");

  assert.match(html, /id="icon-settings"/);
  assert.match(html, /id="icon-muted"/);
  assert.match(html, /id="icon-moon"/);
  assert.match(
    html,
    /class="game-tile-settings hidden"[\s\S]*href="#icon-settings"/
  );
  assert.match(css, /button,\s*\.button\s*\{[\s\S]*transition:/);
  assert.match(css, /\.icon-button:hover:not\(:disabled\)/);
  assert.match(css, /button:active:not\(:disabled\)/);
  assert.match(css, /@keyframes selected-glint/);
  assert.match(css, /button\[aria-checked="true"\]::after/);
  assert.match(css, /button\[aria-pressed="true"\]::after/);
  assert.doesNotMatch(css, /button-glint/);
  assert.doesNotMatch(css, /\.game-tile\.active::after/);
});
