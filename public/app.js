"use strict";

(() => {
  const WAKE_RETRY_INTERVAL_MS = 3000;
  const WAKE_TIMEOUT_MS = 90000;
  const WAKE_REQUEST_TIMEOUT_MS = 85000;
  const HEALTH_PROBE_TIMEOUT_MS = 10000;
  const SOCKET_CONNECTION_TIMEOUT_MS = 15000;
  const MAX_AUDIO_DATA_LENGTH = 1500000;
  const CONTRIBUTION_TYPES = ["text", "drawing", "audio"];
  const TYPE_LABELS = {
    text: "Texte",
    drawing: "Dessin",
    audio: "Audio"
  };
  const VOLUME_STORAGE_KEY = "kamoulox-volume";
  const MUTED_STORAGE_KEY = "kamoulox-muted";
  const THEME_STORAGE_KEY = "kamoulox-theme";
  const INTRO_DURATION_MS = 4500;
  const AUDIO_RECORDING_DURATION_MS = 10000;
  const MAX_DRAWING_HISTORY = 30;

  const elements = {
    homeView: document.querySelector("#home-view"),
    roomView: document.querySelector("#room-view"),
    gameView: document.querySelector("#game-view"),
    resultsView: document.querySelector("#results-view"),
    settingsButton: document.querySelector("#settings-button"),
    settingsModal: document.querySelector("#settings-modal"),
    closeSettingsButton: document.querySelector("#close-settings-button"),
    volumeSlider: document.querySelector("#volume-slider"),
    volumeValue: document.querySelector("#volume-value"),
    muteButton: document.querySelector("#mute-button"),
    themeToggle: document.querySelector("#theme-toggle"),
    nickname: document.querySelector("#nickname"),
    roomCodeInput: document.querySelector("#room-code"),
    createButton: document.querySelector("#create-button"),
    joinButton: document.querySelector("#join-button"),
    retryButton: document.querySelector("#retry-button"),
    homeMessage: document.querySelector("#home-message"),
    roomTitle: document.querySelector("#room-title"),
    playerCount: document.querySelector("#player-count"),
    playerList: document.querySelector("#player-list"),
    connectionStatus: document.querySelector("#connection-status"),
    connectionLabel: document.querySelector("#connection-label"),
    copyButton: document.querySelector("#copy-button"),
    toggleCodeButton: document.querySelector("#toggle-code-button"),
    gameSettingsPanel: document.querySelector("#game-settings-panel"),
    roundCountSelect: document.querySelector("#round-count-select"),
    inputTypeCountSelect: document.querySelector(
      "#input-type-count-select"
    ),
    gameSettingsSummary: document.querySelector("#game-settings-summary"),
    startGameButton: document.querySelector("#start-game-button"),
    startHelp: document.querySelector("#start-help"),
    leaveButton: document.querySelector("#leave-button"),
    roomMessage: document.querySelector("#room-message"),
    roundIntro: document.querySelector("#round-intro"),
    roundIntroText: document.querySelector("#round-intro-text"),
    introAudioPlayButton: document.querySelector(
      "#intro-audio-play-button"
    ),
    gameStage: document.querySelector("#game-stage"),
    roundLabel: document.querySelector("#round-label"),
    gameClock: document.querySelector("#game-clock"),
    timerLabel: document.querySelector("#timer-label"),
    previousPanel: document.querySelector("#previous-panel"),
    previousContent: document.querySelector("#previous-content"),
    gamePrompt: document.querySelector("#game-prompt"),
    typePicker: document.querySelector("#type-picker"),
    typeButtons: Array.from(document.querySelectorAll(".type-button")),
    editorPanel: document.querySelector("#editor-panel"),
    textEditor: document.querySelector("#text-editor"),
    drawingEditor: document.querySelector("#drawing-editor"),
    audioEditor: document.querySelector("#audio-editor"),
    textContribution: document.querySelector("#text-contribution"),
    textCounter: document.querySelector("#text-counter"),
    drawingCanvas: document.querySelector("#drawing-canvas"),
    drawingColor: document.querySelector("#drawing-color"),
    colorSwatches: Array.from(document.querySelectorAll(".color-swatch")),
    drawingTools: Array.from(document.querySelectorAll(".paint-tool")),
    brushSizes: Array.from(document.querySelectorAll(".brush-size")),
    undoDrawingButton: document.querySelector("#undo-drawing-button"),
    redoDrawingButton: document.querySelector("#redo-drawing-button"),
    clearDrawingButton: document.querySelector("#clear-drawing-button"),
    audioEmptyState: document.querySelector("#audio-empty-state"),
    audioReadyState: document.querySelector("#audio-ready-state"),
    audioStatus: document.querySelector("#audio-status"),
    recordAudioButton: document.querySelector("#record-audio-button"),
    recordButtonLabel: document.querySelector("#record-button-label"),
    playAudioButton: document.querySelector("#play-audio-button"),
    resetAudioButton: document.querySelector("#reset-audio-button"),
    validateAudioButton: document.querySelector("#validate-audio-button"),
    audioPreview: document.querySelector("#audio-preview"),
    audioProgress: document.querySelector("#audio-progress"),
    audioCurrentTime: document.querySelector("#audio-current-time"),
    audioDuration: document.querySelector("#audio-duration"),
    waitingPanel: document.querySelector("#waiting-panel"),
    waitingProgress: document.querySelector("#waiting-progress"),
    gameMessage: document.querySelector("#game-message"),
    submitContributionButton: document.querySelector(
      "#submit-contribution-button"
    ),
    gameLeaveButton: document.querySelector("#game-leave-button"),
    resultChainCount: document.querySelector("#result-chain-count"),
    resultOwner: document.querySelector("#result-owner"),
    resultContributions: document.querySelector("#result-contributions"),
    resultsMessage: document.querySelector("#results-message"),
    previousChainButton: document.querySelector("#previous-chain-button"),
    nextChainButton: document.querySelector("#next-chain-button"),
    resultNavigation: document.querySelector("#result-navigation"),
    resultsObserverMessage: document.querySelector(
      "#results-observer-message"
    ),
    returnLobbyButton: document.querySelector("#return-lobby-button")
  };

  let serverUrl;
  let healthUrl;
  let socket = null;
  let pendingAction = null;
  let actionRunning = false;
  let currentRoom = null;
  let currentGame = null;
  let currentNickname = "";
  let shouldRejoin = false;
  let timerInterval = null;
  let introTimeout = null;
  let introRoundKey = null;
  let introAudioElement = null;
  let selectedType = "text";
  let renderedRoundKey = null;
  let drawingContext = null;
  let drawingActive = false;
  let drawingDirty = false;
  let lastDrawingPoint = null;
  let drawingStartPoint = null;
  let drawingStartSnapshot = null;
  let drawingTool = "pencil";
  let drawingColor = "#182034";
  let drawingSize = 8;
  let drawingHistory = [];
  let drawingHistoryIndex = -1;
  let recordingSession = null;
  let audioStartRequestId = 0;
  let audioDataUrl = "";
  let resultChainIndex = 0;
  let siteVolume = 1;
  let siteMuted = false;
  let codeVisible = false;
  let siteTheme = "dark";

  function setMessage(element, message, type = "") {
    element.textContent = message;
    element.className = `message${type ? ` ${type}` : ""}`;
  }

  function applyVolumeToAudio(audioElement) {
    if (!audioElement) {
      return;
    }

    audioElement.volume = siteVolume;
    audioElement.muted = siteMuted;
  }

  function applyVolumeToAllAudio() {
    document.querySelectorAll("audio").forEach(applyVolumeToAudio);
  }

  function saveAudioSettings() {
    try {
      window.localStorage.setItem(VOLUME_STORAGE_KEY, String(siteVolume));
      window.localStorage.setItem(MUTED_STORAGE_KEY, String(siteMuted));
    } catch (error) {
      console.warn("[paramètres] Sauvegarde du volume impossible :", error);
    }
  }

  function updateAudioSettingsUi() {
    const percentage = Math.round(siteVolume * 100);
    elements.volumeSlider.value = String(percentage);
    elements.volumeValue.textContent = `${percentage} %`;
    elements.muteButton.textContent = siteMuted
      ? "Réactiver le son"
      : "Couper le son";
    elements.muteButton.classList.toggle("button-danger", siteMuted);
    applyVolumeToAllAudio();
  }

  function loadAudioSettings() {
    try {
      siteVolume = window.GameClientUtils.normalizeVolume(
        window.localStorage.getItem(VOLUME_STORAGE_KEY),
        1
      );
      siteMuted = window.localStorage.getItem(MUTED_STORAGE_KEY) === "true";
    } catch (error) {
      console.warn("[paramètres] Lecture du volume impossible :", error);
      siteVolume = 1;
      siteMuted = false;
    }

    updateAudioSettingsUi();
  }

  function setSiteVolume(volume) {
    siteVolume = window.GameClientUtils.normalizeVolume(volume, siteVolume);
    if (siteVolume > 0 && siteMuted) {
      siteMuted = false;
    }
    saveAudioSettings();
    updateAudioSettingsUi();
  }

  function applyTheme(theme) {
    siteTheme = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = siteTheme;
    const darkModeEnabled = siteTheme === "dark";
    elements.themeToggle.setAttribute(
      "aria-checked",
      String(darkModeEnabled)
    );
    elements.themeToggle.setAttribute(
      "aria-label",
      darkModeEnabled ? "Désactiver le mode sombre" : "Activer le mode sombre"
    );
  }

  function loadTheme() {
    try {
      applyTheme(window.localStorage.getItem(THEME_STORAGE_KEY) || "dark");
    } catch (error) {
      console.warn("[paramètres] Lecture du thème impossible :", error);
      applyTheme("dark");
    }
  }

  function toggleTheme() {
    applyTheme(siteTheme === "dark" ? "light" : "dark");
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, siteTheme);
    } catch (error) {
      console.warn("[paramètres] Sauvegarde du thème impossible :", error);
    }
  }

  function setSettingsOpen(isOpen) {
    elements.settingsModal.classList.toggle("hidden", !isOpen);
    if (isOpen) {
      elements.closeSettingsButton.focus();
    } else {
      elements.settingsButton.focus();
    }
  }

  function showOnly(view) {
    [
      elements.homeView,
      elements.roomView,
      elements.gameView,
      elements.resultsView
    ].forEach((candidate) => {
      candidate.classList.toggle("hidden", candidate !== view);
    });
  }

  function setHomeBusy(isBusy) {
    elements.createButton.disabled = isBusy;
    elements.joinButton.disabled = isBusy;
    elements.nickname.disabled = isBusy;
    elements.roomCodeInput.disabled = isBusy;
  }

  function setConnectionState(isConnected, label) {
    elements.connectionStatus.classList.toggle("offline", !isConnected);
    elements.connectionLabel.textContent = label;
  }

  function stopTimer() {
    if (timerInterval) {
      window.clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function stopRoundIntro() {
    if (introTimeout) {
      window.clearTimeout(introTimeout);
      introTimeout = null;
    }
    if (introAudioElement) {
      introAudioElement.pause();
    }
    elements.roundIntro.classList.add("hidden");
    elements.introAudioPlayButton.classList.add("hidden");
    introRoundKey = null;
    introAudioElement = null;
  }

  function showHome() {
    stopTimer();
    stopRoundIntro();
    stopAudioRecording(true);
    currentRoom = null;
    currentGame = null;
    shouldRejoin = false;
    renderedRoundKey = null;
    codeVisible = false;
    showOnly(elements.homeView);
    setConnectionState(Boolean(socket && socket.connected), "Connecté");
  }

  function renderPlayerList(room) {
    elements.playerList.replaceChildren();

    room.players.forEach((player) => {
      const item = document.createElement("li");
      const name = document.createElement("span");

      item.className = "player-row";
      name.className = "player-name";
      name.textContent = player.nickname;
      item.append(name);

      if (player.isHost) {
        const badge = document.createElement("span");
        badge.className = "host-badge";
        badge.textContent = "Hôte";
        item.append(badge);
      }

      elements.playerList.append(item);
    });
  }

  function renderRoomCode() {
    if (!currentRoom) {
      return;
    }

    elements.roomTitle.textContent = codeVisible
      ? currentRoom.code
      : "*".repeat(currentRoom.code.length);
    elements.toggleCodeButton.textContent = codeVisible
      ? "Masquer"
      : "Afficher";
    elements.toggleCodeButton.setAttribute(
      "aria-pressed",
      String(codeVisible)
    );
  }

  function populateRoundCountOptions(room) {
    const selectedValue =
      room.settings.roundCount === null
        ? "auto"
        : String(room.settings.roundCount);
    const options = [
      {
        value: "auto",
        label: `Automatique (${room.playerCount} manche${
          room.playerCount > 1 ? "s" : ""
        })`
      }
    ];

    for (let roundCount = 1; roundCount <= room.playerCount; roundCount += 1) {
      options.push({
        value: String(roundCount),
        label: `${roundCount} manche${roundCount > 1 ? "s" : ""}`
      });
    }

    elements.roundCountSelect.replaceChildren(
      ...options.map((option) => {
        const element = document.createElement("option");
        element.value = option.value;
        element.textContent = option.label;
        return element;
      })
    );
    elements.roundCountSelect.value = selectedValue;
  }

  function renderGameSettings(room, isHost) {
    populateRoundCountOptions(room);
    elements.inputTypeCountSelect.value = String(
      room.settings.inputTypeCount
    );
    elements.gameSettingsPanel.classList.toggle("hidden", !isHost);

    const rounds = room.settings.effectiveRoundCount;
    const typeCount = room.settings.inputTypeCount;
    elements.gameSettingsSummary.textContent =
      `${rounds} manche${rounds > 1 ? "s" : ""}, ` +
      `${typeCount} type${typeCount > 1 ? "s" : ""} possible${
        typeCount > 1 ? "s" : ""
      }.`;
  }

  function showRoom(room) {
    const roomChanged = !currentRoom || currentRoom.code !== room.code;
    currentRoom = room;
    currentGame = null;
    renderedRoundKey = null;
    stopTimer();
    stopRoundIntro();
    stopAudioRecording(true);

    if (roomChanged) {
      codeVisible = false;
    }
    renderRoomCode();
    elements.playerCount.textContent =
      `${room.playerCount} / ${room.maxPlayers} joueurs`;
    renderPlayerList(room);

    const isHost = Boolean(socket && room.hostId === socket.id);
    renderGameSettings(room, isHost);
    elements.startGameButton.classList.toggle("hidden", !isHost);
    elements.startGameButton.disabled =
      !isHost || room.playerCount < room.minPlayersToStart;
    elements.startHelp.textContent = isHost
      ? room.playerCount < room.minPlayersToStart
        ? "Il faut au moins 2 joueurs pour lancer la partie."
        : `${room.settings.effectiveRoundCount} manche${
            room.settings.effectiveRoundCount > 1 ? "s" : ""
          } ${
            room.settings.effectiveRoundCount > 1
              ? "seront jouées"
              : "sera jouée"
          }.`
      : "En attente du lancement par l'hôte.";

    showOnly(elements.roomView);
    setConnectionState(Boolean(socket && socket.connected), "Connecté");
  }

  function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function createHealthRequest(requestTimeoutMs) {
    const controller = new AbortController();
    let timedOut = false;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, requestTimeoutMs);

    const promise = (async () => {
      console.info(`[health] GET ${healthUrl}`);

      try {
        const response = await fetch(healthUrl, {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal
        });

        console.info(
          `[health] ${healthUrl} -> HTTP ${response.status} ${response.statusText}`
        );

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status} ${response.statusText || "sans libellé"}`
          );
        }

        const body = await response.json();
        if (!body || body.status !== "ok") {
          throw new Error(`Réponse JSON invalide : ${JSON.stringify(body)}`);
        }

        return { ok: true };
      } catch (error) {
        if (cancelled && error && error.name === "AbortError") {
          return { ok: false, cancelled: true };
        }

        let visibleError = error;
        if (timedOut && error && error.name === "AbortError") {
          visibleError = new Error(
            `Timeout après ${requestTimeoutMs / 1000} secondes.`
          );
          visibleError.name = "HealthTimeoutError";
        } else if (error instanceof TypeError) {
          visibleError = new Error(
            `Erreur réseau, CORS ou bloqueur de contenu pour ${healthUrl} : ` +
              error.message
          );
          visibleError.name = "HealthNetworkError";
        }

        console.error(`[health] Échec de ${healthUrl} :`, visibleError, error);
        return { ok: false, error: visibleError };
      } finally {
        window.clearTimeout(timeout);
      }
    })();

    return {
      abort() {
        cancelled = true;
        controller.abort();
      },
      promise
    };
  }

  async function wakeServer() {
    const deadline = Date.now() + WAKE_TIMEOUT_MS;
    const activeRequests = new Set();
    let attemptNumber = 0;
    let lastError = null;
    let resolved = false;

    setMessage(elements.homeMessage, "Démarrage du serveur...");
    setHomeBusy(true);
    elements.retryButton.classList.add("hidden");

    return new Promise((resolve) => {
      let retryTimer = null;
      let deadlineTimer = null;

      function finish(result) {
        if (resolved) {
          return;
        }

        resolved = true;
        window.clearTimeout(retryTimer);
        window.clearTimeout(deadlineTimer);
        activeRequests.forEach((request) => request.abort());
        activeRequests.clear();
        resolve(result);
      }

      function scheduleNextAttempt() {
        const remainingTime = deadline - Date.now();
        if (remainingTime <= 0) {
          finish({ ok: false, error: lastError });
          return;
        }

        retryTimer = window.setTimeout(
          launchAttempt,
          Math.min(WAKE_RETRY_INTERVAL_MS, remainingTime)
        );
      }

      function launchAttempt() {
        if (resolved) {
          return;
        }

        attemptNumber += 1;
        const requestTimeoutMs =
          attemptNumber === 1
            ? WAKE_REQUEST_TIMEOUT_MS
            : HEALTH_PROBE_TIMEOUT_MS;
        const request = createHealthRequest(requestTimeoutMs);
        activeRequests.add(request);

        request.promise
          .then((result) => {
            activeRequests.delete(request);
            if (resolved || result.cancelled) {
              return;
            }

            if (result.ok) {
              finish({ ok: true });
              return;
            }

            lastError = result.error;
            setMessage(
              elements.homeMessage,
              `Démarrage du serveur... Tentative ${attemptNumber}. ` +
                `Dernière erreur : ` +
                window.GameClientUtils.describeError(lastError)
            );
          })
          .catch((error) => {
            activeRequests.delete(request);
            lastError = error;
            console.error("[health] Erreur interne :", error);
          });

        scheduleNextAttempt();
      }

      deadlineTimer = window.setTimeout(() => {
        finish({ ok: false, error: lastError });
      }, WAKE_TIMEOUT_MS);
      launchAttempt();
    });
  }

  function describeSocketError(error) {
    const details = [
      error && error.message,
      error && error.description && error.description.message,
      error && error.context && error.context.status
        ? `HTTP ${error.context.status}`
        : null
    ].filter(Boolean);

    return details.length > 0 ? details.join(" - ") : "erreur inconnue";
  }

  function emitWithAcknowledgment(eventName, payload) {
    return new Promise((resolve, reject) => {
      const acknowledgment = (error, response) => {
        if (error) {
          reject(
            new Error(
              `Délai dépassé pour l'événement Socket.IO "${eventName}".`
            )
          );
          return;
        }
        resolve(response);
      };

      if (payload === undefined) {
        socket.timeout(10000).emit(eventName, acknowledgment);
      } else {
        socket.timeout(10000).emit(eventName, payload, acknowledgment);
      }
    });
  }

  function connectSocket() {
    if (typeof window.io !== "function") {
      throw new Error(
        "Le client Socket.IO n'est pas chargé. Vérifiez socket.io.min.js."
      );
    }

    if (socket) {
      if (!socket.connected) {
        socket.connect();
      }
      return;
    }

    socket = window.io(serverUrl, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: SOCKET_CONNECTION_TIMEOUT_MS,
      transports: ["polling", "websocket"],
      upgrade: true
    });

    socket.on("connect", async () => {
      console.info(`[socket.io] Connecté à ${serverUrl}.`);
      setConnectionState(true, "Connecté");

      if (!shouldRejoin || !currentRoom) {
        return;
      }

      shouldRejoin = false;
      const reconnectingRoom = currentRoom;
      setMessage(
        currentGame ? elements.gameMessage : elements.roomMessage,
        "Reconnexion à la partie..."
      );

      try {
        const response = await emitWithAcknowledgment("joinRoom", {
          code: reconnectingRoom.code,
          nickname: currentNickname
        });

        if (!response || !response.ok) {
          throw new Error(
            (response && response.error) || "Reconnexion impossible."
          );
        }

        currentRoom = response.room;
        if (response.room.phase === "lobby") {
          showRoom(response.room);
        }
      } catch (error) {
        console.error("[socket.io] Reconnexion impossible :", error);
        showHome();
        setMessage(
          elements.homeMessage,
          `Reconnexion impossible : ${error.message}`,
          "error"
        );
      }
    });

    socket.on("connect_error", (error) => {
      const detail = describeSocketError(error);
      console.error(`[socket.io] connect_error : ${detail}`, error);
      setConnectionState(false, "Connexion refusée");
      const messageTarget = currentGame
        ? elements.gameMessage
        : currentRoom
          ? elements.roomMessage
          : elements.homeMessage;
      setMessage(
        messageTarget,
        `Connexion Socket.IO impossible. Détail : ${detail}`,
        "error"
      );
    });

    socket.on("disconnect", (reason, details) => {
      console.warn(`[socket.io] Déconnexion : ${reason}`, details || "");
      setConnectionState(false, "Reconnexion...");

      if (currentRoom && reason !== "io client disconnect") {
        shouldRejoin = true;
        const target = currentGame
          ? elements.gameMessage
          : elements.roomMessage;
        setMessage(
          target,
          `Connexion perdue (${reason}). Reconnexion en cours...`
        );
      }
    });

    socket.on("roomState", (room) => {
      currentRoom = room;
      if (room.phase === "lobby") {
        showRoom(room);
      } else if (!currentGame) {
        setMessage(elements.roomMessage, "La partie démarre...");
      }
    });

    socket.on("gameState", (gameState) => {
      if (gameState.phase === "results") {
        showResults(gameState);
      } else {
        showGame(gameState);
      }
    });

    socket.on("roomError", (payload) => {
      const message =
        (payload && payload.message) || "Une erreur de room est survenue.";
      console.error("[socket.io] Erreur de room :", message);
      const target = currentGame
        ? elements.gameMessage
        : currentRoom
          ? elements.roomMessage
          : elements.homeMessage;
      setMessage(target, message, "error");
    });

    socket.connect();
  }

  async function waitForSocketConnection() {
    connectSocket();
    if (socket.connected) {
      return;
    }

    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error(`Connexion Socket.IO à ${serverUrl} impossible.`));
      }, SOCKET_CONNECTION_TIMEOUT_MS);

      function cleanup() {
        window.clearTimeout(timeout);
        socket.off("connect", handleConnect);
        socket.off("connect_error", handleError);
      }

      function handleConnect() {
        cleanup();
        resolve();
      }

      function handleError(error) {
        cleanup();
        reject(
          new Error(`Connexion refusée : ${describeSocketError(error)}`)
        );
      }

      socket.once("connect", handleConnect);
      socket.once("connect_error", handleError);
    });
  }

  function validateNickname(nickname) {
    const length = Array.from(nickname).length;
    return length >= 2 && length <= 20;
  }

  async function runPendingAction() {
    if (!pendingAction || actionRunning) {
      return;
    }

    actionRunning = true;
    setMessage(elements.homeMessage, "");

    const healthResult = await wakeServer();
    if (!healthResult.ok) {
      actionRunning = false;
      setHomeBusy(false);
      elements.retryButton.classList.remove("hidden");
      const detail = healthResult.error
        ? window.GameClientUtils.describeError(healthResult.error)
        : "aucune réponse exploitable";
      setMessage(
        elements.homeMessage,
        `Impossible de joindre ${healthUrl}. Dernière erreur : ${detail}`,
        "error"
      );
      return;
    }

    try {
      setMessage(elements.homeMessage, "Serveur disponible. Connexion...");
      await waitForSocketConnection();
      const action = pendingAction;
      const eventName = action.type === "create" ? "createRoom" : "joinRoom";
      const response = await emitWithAcknowledgment(eventName, action.payload);

      if (!response || !response.ok) {
        throw new Error(
          (response && response.error) || "La demande a été refusée."
        );
      }

      currentNickname = action.payload.nickname;
      currentRoom = response.room;
      shouldRejoin = false;
      pendingAction = null;

      if (response.room.phase === "lobby") {
        showRoom(response.room);
      } else {
        setMessage(elements.homeMessage, "Reconnexion à la partie...");
      }
    } catch (error) {
      console.error("[jeu] Action impossible :", error);
      setMessage(elements.homeMessage, error.message, "error");
    } finally {
      actionRunning = false;
      setHomeBusy(false);
    }
  }

  function prepareAction(type) {
    const nickname = elements.nickname.value.trim();
    const roomCode = elements.roomCodeInput.value.trim().toUpperCase();

    if (!validateNickname(nickname)) {
      setMessage(
        elements.homeMessage,
        "Le pseudonyme doit contenir entre 2 et 20 caractères.",
        "error"
      );
      elements.nickname.focus();
      return;
    }

    if (
      type === "join" &&
      !/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(roomCode)
    ) {
      setMessage(
        elements.homeMessage,
        "Le code de partie doit contenir 6 caractères valides.",
        "error"
      );
      elements.roomCodeInput.focus();
      return;
    }

    pendingAction = {
      type,
      payload:
        type === "create"
          ? { nickname }
          : { nickname, code: roomCode }
    };
    runPendingAction();
  }

  async function updateRoomSettings() {
    if (!currentRoom || !socket || currentRoom.hostId !== socket.id) {
      return;
    }

    const roundValue = elements.roundCountSelect.value;
    const payload = {
      roundCount: roundValue === "auto" ? null : Number(roundValue),
      inputTypeCount: Number(elements.inputTypeCountSelect.value)
    };

    elements.roundCountSelect.disabled = true;
    elements.inputTypeCountSelect.disabled = true;
    setMessage(elements.roomMessage, "Réglages envoyés au laboratoire...");

    try {
      const response = await emitWithAcknowledgment(
        "updateGameSettings",
        payload
      );
      if (!response || !response.ok) {
        throw new Error(
          (response && response.error) || "Réglages refusés."
        );
      }
      setMessage(elements.roomMessage, "");
    } catch (error) {
      setMessage(elements.roomMessage, error.message, "error");
      if (currentRoom) {
        renderGameSettings(currentRoom, true);
      }
    } finally {
      elements.roundCountSelect.disabled = false;
      elements.inputTypeCountSelect.disabled = false;
    }
  }

  function resetDrawing() {
    if (!drawingContext) {
      return;
    }

    drawingContext.save();
    drawingContext.fillStyle = "#ffffff";
    drawingContext.fillRect(
      0,
      0,
      elements.drawingCanvas.width,
      elements.drawingCanvas.height
    );
    drawingContext.restore();
    drawingDirty = false;
    drawingActive = false;
    lastDrawingPoint = null;
    drawingStartPoint = null;
    drawingStartSnapshot = null;
    drawingHistory = [
      {
        imageData: drawingContext.getImageData(
          0,
          0,
          elements.drawingCanvas.width,
          elements.drawingCanvas.height
        ),
        dirty: false
      }
    ];
    drawingHistoryIndex = 0;
    updateDrawingHistoryButtons();
  }

  function updateDrawingHistoryButtons() {
    elements.undoDrawingButton.disabled = drawingHistoryIndex <= 0;
    elements.redoDrawingButton.disabled =
      drawingHistoryIndex >= drawingHistory.length - 1;
  }

  function commitDrawingHistory(dirty = true) {
    const state = {
      imageData: drawingContext.getImageData(
        0,
        0,
        elements.drawingCanvas.width,
        elements.drawingCanvas.height
      ),
      dirty
    };

    drawingHistory = drawingHistory.slice(0, drawingHistoryIndex + 1);
    drawingHistory.push(state);
    if (drawingHistory.length > MAX_DRAWING_HISTORY) {
      drawingHistory.shift();
    }
    drawingHistoryIndex = drawingHistory.length - 1;
    drawingDirty = dirty;
    updateDrawingHistoryButtons();
  }

  function restoreDrawingHistory(index) {
    const state = drawingHistory[index];
    if (!state) {
      return;
    }

    drawingContext.putImageData(state.imageData, 0, 0);
    drawingHistoryIndex = index;
    drawingDirty = state.dirty;
    updateDrawingHistoryButtons();
  }

  function undoDrawing() {
    if (drawingHistoryIndex > 0) {
      restoreDrawingHistory(drawingHistoryIndex - 1);
    }
  }

  function redoDrawing() {
    if (drawingHistoryIndex < drawingHistory.length - 1) {
      restoreDrawingHistory(drawingHistoryIndex + 1);
    }
  }

  function clearDrawing() {
    drawingContext.save();
    drawingContext.fillStyle = "#ffffff";
    drawingContext.fillRect(
      0,
      0,
      elements.drawingCanvas.width,
      elements.drawingCanvas.height
    );
    drawingContext.restore();
    commitDrawingHistory(false);
  }

  function getCanvasPoint(event) {
    const bounds = elements.drawingCanvas.getBoundingClientRect();
    return {
      x:
        ((event.clientX - bounds.left) / bounds.width) *
        elements.drawingCanvas.width,
      y:
        ((event.clientY - bounds.top) / bounds.height) *
        elements.drawingCanvas.height
    };
  }

  function drawFreehandSegment(from, to) {
    const erasing = drawingTool === "eraser";
    drawingContext.beginPath();
    drawingContext.moveTo(from.x, from.y);
    drawingContext.lineTo(to.x, to.y);
    drawingContext.strokeStyle = erasing ? "#ffffff" : drawingColor;
    drawingContext.lineWidth = erasing ? drawingSize * 1.5 : drawingSize;
    drawingContext.lineCap = "round";
    drawingContext.lineJoin = "round";
    drawingContext.stroke();
  }

  function drawDot(point) {
    const erasing = drawingTool === "eraser";
    drawingContext.beginPath();
    drawingContext.arc(
      point.x,
      point.y,
      Math.max(1, (erasing ? drawingSize * 1.5 : drawingSize) / 2),
      0,
      Math.PI * 2
    );
    drawingContext.fillStyle = erasing ? "#ffffff" : drawingColor;
    drawingContext.fill();
  }

  function drawShapePreview(point) {
    if (!drawingStartSnapshot || !drawingStartPoint) {
      return;
    }

    drawingContext.putImageData(drawingStartSnapshot, 0, 0);
    drawingContext.beginPath();
    drawingContext.strokeStyle = drawingColor;
    drawingContext.lineWidth = drawingSize;
    drawingContext.lineCap = "round";
    drawingContext.lineJoin = "round";

    if (drawingTool === "line") {
      drawingContext.moveTo(drawingStartPoint.x, drawingStartPoint.y);
      drawingContext.lineTo(point.x, point.y);
    } else {
      const centerX = (drawingStartPoint.x + point.x) / 2;
      const centerY = (drawingStartPoint.y + point.y) / 2;
      const radiusX = Math.abs(point.x - drawingStartPoint.x) / 2;
      const radiusY = Math.abs(point.y - drawingStartPoint.y) / 2;
      drawingContext.ellipse(
        centerX,
        centerY,
        Math.max(1, radiusX),
        Math.max(1, radiusY),
        0,
        0,
        Math.PI * 2
      );
    }

    drawingContext.stroke();
  }

  function hexToRgb(hexColor) {
    const normalized = hexColor.replace("#", "");
    return [
      Number.parseInt(normalized.slice(0, 2), 16),
      Number.parseInt(normalized.slice(2, 4), 16),
      Number.parseInt(normalized.slice(4, 6), 16),
      255
    ];
  }

  function colorsMatch(data, offset, color) {
    return (
      data[offset] === color[0] &&
      data[offset + 1] === color[1] &&
      data[offset + 2] === color[2] &&
      data[offset + 3] === color[3]
    );
  }

  function floodFill(point) {
    const width = elements.drawingCanvas.width;
    const height = elements.drawingCanvas.height;
    const x = Math.max(0, Math.min(width - 1, Math.floor(point.x)));
    const y = Math.max(0, Math.min(height - 1, Math.floor(point.y)));
    const imageData = drawingContext.getImageData(0, 0, width, height);
    const data = imageData.data;
    const startOffset = (y * width + x) * 4;
    const targetColor = [
      data[startOffset],
      data[startOffset + 1],
      data[startOffset + 2],
      data[startOffset + 3]
    ];
    const replacement = hexToRgb(drawingColor);

    if (targetColor.every((channel, index) => channel === replacement[index])) {
      return false;
    }

    const stack = [y * width + x];
    while (stack.length > 0) {
      const pixelIndex = stack.pop();
      const currentX = pixelIndex % width;
      const currentY = Math.floor(pixelIndex / width);
      const offset = pixelIndex * 4;
      if (!colorsMatch(data, offset, targetColor)) {
        continue;
      }

      data[offset] = replacement[0];
      data[offset + 1] = replacement[1];
      data[offset + 2] = replacement[2];
      data[offset + 3] = replacement[3];
      if (currentX + 1 < width) {
        stack.push(pixelIndex + 1);
      }
      if (currentX > 0) {
        stack.push(pixelIndex - 1);
      }
      if (currentY + 1 < height) {
        stack.push(pixelIndex + width);
      }
      if (currentY > 0) {
        stack.push(pixelIndex - width);
      }
    }

    drawingContext.putImageData(imageData, 0, 0);
    return true;
  }

  function startDrawing(event) {
    if (currentGame && currentGame.submitted) {
      return;
    }

    event.preventDefault();
    const point = getCanvasPoint(event);

    if (drawingTool === "fill") {
      if (floodFill(point)) {
        commitDrawingHistory(true);
      }
      return;
    }

    drawingActive = true;
    lastDrawingPoint = point;
    drawingStartPoint = point;
    drawingStartSnapshot = drawingContext.getImageData(
      0,
      0,
      elements.drawingCanvas.width,
      elements.drawingCanvas.height
    );
    if (drawingTool === "pencil" || drawingTool === "eraser") {
      drawDot(point);
    }
    elements.drawingCanvas.setPointerCapture(event.pointerId);
  }

  function continueDrawing(event) {
    if (!drawingActive || !lastDrawingPoint) {
      return;
    }

    event.preventDefault();
    const point = getCanvasPoint(event);

    if (drawingTool === "pencil" || drawingTool === "eraser") {
      drawFreehandSegment(lastDrawingPoint, point);
    } else {
      drawShapePreview(point);
    }
    lastDrawingPoint = point;
  }

  function endDrawing(event) {
    if (!drawingActive) {
      return;
    }

    if (drawingTool === "line" || drawingTool === "circle") {
      drawShapePreview(lastDrawingPoint || drawingStartPoint);
    }

    drawingActive = false;
    commitDrawingHistory(true);
    lastDrawingPoint = null;
    drawingStartPoint = null;
    drawingStartSnapshot = null;
    if (
      event.pointerId !== undefined &&
      elements.drawingCanvas.hasPointerCapture(event.pointerId)
    ) {
      elements.drawingCanvas.releasePointerCapture(event.pointerId);
    }
  }

  function selectDrawingTool(tool) {
    drawingTool = tool;
    elements.drawingTools.forEach((button) => {
      button.classList.toggle("active", button.dataset.tool === tool);
    });
    elements.drawingCanvas.style.cursor =
      tool === "fill" ? "cell" : tool === "eraser" ? "grab" : "crosshair";
  }

  function selectDrawingColor(color) {
    drawingColor = color;
    elements.drawingColor.value = color;
    elements.colorSwatches.forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.color.toLowerCase() === color.toLowerCase()
      );
    });
  }

  function selectDrawingSize(size) {
    drawingSize = Number(size);
    elements.brushSizes.forEach((button) => {
      button.classList.toggle(
        "active",
        Number(button.dataset.size) === drawingSize
      );
    });
  }

  function stopStream(stream) {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  }

  function stopAudioRecording(discard) {
    if (!recordingSession) {
      return;
    }

    recordingSession.discard = recordingSession.discard || discard;
    if (recordingSession.timer) {
      window.clearInterval(recordingSession.timer);
      recordingSession.timer = null;
    }
    if (recordingSession.autoStopTimer) {
      window.clearTimeout(recordingSession.autoStopTimer);
      recordingSession.autoStopTimer = null;
    }
    if (recordingSession.recorder.state !== "inactive") {
      recordingSession.recorder.stop();
    } else {
      stopStream(recordingSession.stream);
      recordingSession = null;
    }
  }

  function resetAudio() {
    audioStartRequestId += 1;
    stopAudioRecording(true);
    audioDataUrl = "";
    elements.audioPreview.pause();
    elements.audioPreview.currentTime = 0;
    elements.audioPreview.removeAttribute("src");
    elements.audioPreview.load();
    elements.audioEmptyState.classList.remove("hidden");
    elements.audioReadyState.classList.add("hidden");
    elements.audioStatus.textContent = "";
    elements.recordAudioButton.classList.remove("recording");
    elements.recordAudioButton.disabled = false;
    elements.validateAudioButton.disabled = false;
    elements.recordButtonLabel.textContent =
      "Enregistrer pendant 10 secondes";
    elements.playAudioButton.textContent = "▶";
    elements.playAudioButton.setAttribute(
      "aria-label",
      "Lire l'enregistrement"
    );
    elements.audioProgress.value = "0";
    elements.audioCurrentTime.textContent = "00:00";
    elements.audioDuration.textContent = "00:00";
  }

  function showRecordedAudio() {
    elements.audioEmptyState.classList.add("hidden");
    elements.audioReadyState.classList.remove("hidden");
    elements.audioProgress.value = "0";
    elements.audioCurrentTime.textContent = "00:00";
    elements.playAudioButton.textContent = "▶";
    applyVolumeToAudio(elements.audioPreview);
  }

  function updateAudioTimeline() {
    const duration = Number.isFinite(elements.audioPreview.duration)
      ? elements.audioPreview.duration
      : 0;
    const currentTime = Number.isFinite(elements.audioPreview.currentTime)
      ? elements.audioPreview.currentTime
      : 0;
    elements.audioProgress.value = duration
      ? String(Math.round((currentTime / duration) * 1000))
      : "0";
    elements.audioCurrentTime.textContent =
      window.GameClientUtils.formatTime(currentTime);
    elements.audioDuration.textContent =
      window.GameClientUtils.formatTime(duration);
  }

  function updateAudioPlayButton() {
    const isPlaying = !elements.audioPreview.paused;
    elements.playAudioButton.textContent = isPlaying ? "Ⅱ" : "▶";
    elements.playAudioButton.setAttribute(
      "aria-label",
      isPlaying ? "Mettre en pause" : "Lire l'enregistrement"
    );
  }

  async function toggleRecordedAudioPlayback() {
    try {
      if (elements.audioPreview.paused) {
        applyVolumeToAudio(elements.audioPreview);
        await elements.audioPreview.play();
      } else {
        elements.audioPreview.pause();
      }
      updateAudioPlayButton();
    } catch (error) {
      setMessage(
        elements.gameMessage,
        `Le son fait sa diva : ${error.message}`,
        "error"
      );
    }
  }

  function updateRecordingDuration(session) {
    const elapsed = Math.min(
      AUDIO_RECORDING_DURATION_MS,
      Date.now() - session.startedAt
    );
    const remainingSeconds = Math.ceil(
      (AUDIO_RECORDING_DURATION_MS - elapsed) / 1000
    );
    elements.audioStatus.textContent =
      `Enregistrement automatique : ${Math.max(0, remainingSeconds)} s restantes`;
    elements.recordButtonLabel.textContent =
      `Fais du bruit... ${Math.max(0, remainingSeconds)} s`;
  }

  function readBlobAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Lecture audio impossible."));
      reader.readAsDataURL(blob);
    });
  }

  async function startAudioRecording() {
    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setMessage(
        elements.gameMessage,
        "L'enregistrement audio n'est pas disponible dans ce navigateur.",
        "error"
      );
      return;
    }

    let stream = null;
    let requestId = null;
    try {
      resetAudio();
      requestId = audioStartRequestId;
      const requestedRoundIndex = currentGame && currentGame.roundIndex;
      elements.recordAudioButton.disabled = true;
      elements.recordButtonLabel.textContent = "Ouverture du micro...";
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (
        requestId !== audioStartRequestId ||
        !currentGame ||
        currentGame.roundIndex !== requestedRoundIndex ||
        selectedType !== "audio"
      ) {
        stopStream(stream);
        if (requestId === audioStartRequestId) {
          resetAudio();
        }
        return;
      }

      const preferredType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus"
      ].find(
        (type) =>
          typeof MediaRecorder.isTypeSupported !== "function" ||
          MediaRecorder.isTypeSupported(type)
      );
      const options = preferredType
        ? { mimeType: preferredType, audioBitsPerSecond: 64000 }
        : { audioBitsPerSecond: 64000 };
      const recorder = new MediaRecorder(stream, options);
      const session = {
        recorder,
        stream,
        chunks: [],
        roundIndex: requestedRoundIndex,
        discard: false,
        startedAt: Date.now(),
        timer: null,
        autoStopTimer: null
      };
      recordingSession = session;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          session.chunks.push(event.data);
        }
      });

      recorder.addEventListener("stop", async () => {
        stopStream(session.stream);
        if (recordingSession === session) {
          recordingSession = null;
        }

        if (
          session.discard ||
          !currentGame ||
          currentGame.roundIndex !== session.roundIndex
        ) {
          return;
        }

        try {
          const blob = new Blob(session.chunks, {
            type: recorder.mimeType || "audio/webm"
          });
          const dataUrl = await readBlobAsDataUrl(blob);
          if (dataUrl.length > MAX_AUDIO_DATA_LENGTH) {
            throw new Error(
              "L'enregistrement est trop volumineux. Recommencez plus court."
            );
          }

          audioDataUrl = dataUrl;
          elements.audioPreview.src = dataUrl;
          applyVolumeToAudio(elements.audioPreview);
          showRecordedAudio();
          elements.audioPreview.load();
        } catch (error) {
          setMessage(elements.gameMessage, error.message, "error");
          resetAudio();
        }
      });

      recorder.start(250);
      session.startedAt = Date.now();
      session.timer = window.setInterval(
        () => updateRecordingDuration(session),
        250
      );
      session.autoStopTimer = window.setTimeout(() => {
        if (recordingSession !== session) {
          return;
        }
        elements.recordButtonLabel.textContent = "Préparation du bruit...";
        stopAudioRecording(false);
      }, AUDIO_RECORDING_DURATION_MS);
      updateRecordingDuration(session);
      elements.recordAudioButton.classList.add("recording");
      setMessage(elements.gameMessage, "");
    } catch (error) {
      stopStream(stream);
      if (requestId !== null && requestId !== audioStartRequestId) {
        return;
      }
      console.error("[audio] Accès au microphone impossible :", error);
      setMessage(
        elements.gameMessage,
        `Microphone inaccessible : ${error.message}`,
        "error"
      );
      resetAudio();
    }
  }

  function selectContributionType(type) {
    if (!CONTRIBUTION_TYPES.includes(type)) {
      return;
    }

    if (
      currentGame &&
      currentGame.assignment.expectedType &&
      type !== currentGame.assignment.expectedType
    ) {
      return;
    }

    if (selectedType === "audio" && type !== "audio") {
      stopAudioRecording(true);
    }

    selectedType = type;
    elements.typeButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.type === type);
    });
    elements.textEditor.classList.toggle("hidden", type !== "text");
    elements.drawingEditor.classList.toggle("hidden", type !== "drawing");
    elements.audioEditor.classList.toggle("hidden", type !== "audio");
    elements.submitContributionButton.classList.toggle(
      "hidden",
      type === "audio" || Boolean(currentGame && currentGame.submitted)
    );
  }

  function renderContribution(container, contribution) {
    container.replaceChildren();

    if (!contribution || contribution.empty) {
      const empty = document.createElement("p");
      empty.className = "empty-contribution";
      empty.textContent = "Aucune contribution n'a été envoyée.";
      container.append(empty);
      return null;
    }

    if (contribution.type === "text") {
      const text = document.createElement("p");
      text.className = "previous-text";
      text.textContent = contribution.content;
      container.append(text);
      return null;
    }

    if (contribution.type === "drawing") {
      const image = document.createElement("img");
      image.className = "previous-image";
      image.src = contribution.content;
      image.alt = `Dessin proposé par ${contribution.nickname}`;
      container.append(image);
      return null;
    }

    const audio = document.createElement("audio");
    audio.className = "audio-player";
    audio.src = contribution.content;
    audio.controls = true;
    audio.preload = "metadata";
    applyVolumeToAudio(audio);
    container.append(audio);
    return audio;
  }

  function resetRoundEditors() {
    stopAudioRecording(true);
    elements.textContribution.value = "";
    elements.textCounter.textContent = "0 / 500";
    resetDrawing();
    resetAudio();
    setMessage(elements.gameMessage, "");
  }

  function startRoundTimer(gameState) {
    stopTimer();
    const serverOffset = gameState.serverNow - Date.now();

    function updateTimer() {
      const serverTime = Date.now() + serverOffset;
      const remaining = Math.max(0, gameState.roundEndsAt - serverTime);
      const seconds = Math.ceil(remaining / 1000);
      const level = window.GameClientUtils.getTimerLevel(remaining / 1000);

      elements.timerLabel.textContent =
        window.GameClientUtils.formatTime(seconds);
      elements.gameClock.setAttribute(
        "aria-label",
        `Temps restant : ${elements.timerLabel.textContent}`
      );
      elements.gameClock.classList.toggle("warning", level === "warning");
      elements.gameClock.classList.toggle("danger", level === "danger");

      if (remaining <= 0) {
        stopTimer();
      }
    }

    updateTimer();
    timerInterval = window.setInterval(updateTimer, 250);
  }

  function getHumorousPrompt(gameState) {
    const expectedType = gameState.assignment.expectedType;
    const hasPrevious = Boolean(
      gameState.assignment.previousContribution
    );
    if (expectedType === "audio") {
      return hasPrevious
        ? "Transforme ce que tu as reçu en bruit. La dignité est optionnelle."
        : "Tu ouvres le bal avec dix secondes de bruit parfaitement assumé.";
    }
    if (expectedType === "drawing") {
      return hasPrevious
        ? "Dessine ce que ça t'inspire. Les lois de la physique patienteront."
        : "Commence par un dessin. Le bon goût n'est pas obligatoire.";
    }
    if (expectedType === "text") {
      return hasPrevious
        ? "Explique ce que tu as reçu avec des mots vaguement compréhensibles."
        : "Lance la chaîne avec une phrase que quelqu'un pourra massacrer.";
    }
    return "Le serveur réfléchit très fort au prochain problème.";
  }

  async function finishRoundIntro(roundKey, previousAudio) {
    if (introRoundKey !== roundKey) {
      return;
    }

    if (!previousAudio) {
      elements.roundIntro.classList.add("hidden");
      return;
    }

    try {
      applyVolumeToAudio(previousAudio);
      previousAudio.currentTime = 0;
      await previousAudio.play();
      elements.roundIntro.classList.add("hidden");
    } catch (error) {
      console.info("[audio] Autoplay bloqué, bouton affiché :", error);
      introAudioElement = previousAudio;
      elements.introAudioPlayButton.classList.remove("hidden");
    }
  }

  function startRoundIntro(roundKey, previousContribution, previousAudio) {
    stopRoundIntro();
    introRoundKey = roundKey;
    introAudioElement = previousAudio;
    elements.roundIntroText.textContent =
      window.GameClientUtils.getRoundIntro(
        previousContribution && previousContribution.type
      );
    elements.roundIntro.classList.remove("hidden");
    elements.introAudioPlayButton.classList.add("hidden");
    introTimeout = window.setTimeout(() => {
      introTimeout = null;
      finishRoundIntro(roundKey, previousAudio);
    }, INTRO_DURATION_MS);
  }

  function showGame(gameState) {
    const roundKey = `${gameState.roomCode}:${gameState.roundIndex}`;
    const isNewRound = renderedRoundKey !== roundKey;
    currentGame = gameState;

    if (isNewRound) {
      renderedRoundKey = roundKey;
      resetRoundEditors();
      selectedType = gameState.assignment.expectedType || "text";
    }

    showOnly(elements.gameView);
    elements.roundLabel.textContent =
      `Manche ${gameState.roundNumber} / ${gameState.totalRounds}`;
    elements.gamePrompt.textContent = getHumorousPrompt(gameState);

    const previous = gameState.assignment.previousContribution;
    elements.previousPanel.classList.toggle("hidden", !previous);
    let previousAudio = null;
    if (isNewRound) {
      if (previous) {
        previousAudio = renderContribution(elements.previousContent, previous);
      } else {
        elements.previousContent.replaceChildren();
      }
    }

    const freeChoice = !gameState.assignment.expectedType;
    elements.typePicker.classList.toggle("hidden", !freeChoice);
    selectContributionType(
      gameState.assignment.expectedType || selectedType || "text"
    );

    elements.editorPanel.classList.toggle("hidden", gameState.submitted);
    elements.waitingPanel.classList.toggle("hidden", !gameState.submitted);
    elements.submitContributionButton.classList.toggle(
      "hidden",
      gameState.submitted || selectedType === "audio"
    );
    elements.waitingProgress.textContent =
      `${gameState.submittedCount} / ${gameState.participantCount} joueurs ont validé.`;
    elements.submitContributionButton.disabled = false;
    startRoundTimer(gameState);

    if (isNewRound) {
      startRoundIntro(roundKey, previous, previousAudio);
    }
  }

  function buildContributionPayload() {
    if (!currentGame) {
      throw new Error("Aucune manche n'est en cours.");
    }

    if (selectedType === "text") {
      const content = elements.textContribution.value.trim();
      if (!content) {
        throw new Error("Écrivez un texte avant de valider.");
      }
      return { type: "text", content };
    }

    if (selectedType === "drawing") {
      if (!drawingDirty) {
        throw new Error("Dessinez quelque chose avant de valider.");
      }
      return {
        type: "drawing",
        content: elements.drawingCanvas.toDataURL("image/png")
      };
    }

    if (recordingSession) {
      throw new Error(
        "L'enregistrement de 10 secondes doit se terminer avant de valider."
      );
    }

    if (!audioDataUrl) {
      throw new Error("Enregistrez un son avant de valider.");
    }

    return { type: "audio", content: audioDataUrl };
  }

  async function submitContribution() {
    if (!currentGame || currentGame.submitted) {
      return;
    }

    try {
      const contribution = buildContributionPayload();
      elements.submitContributionButton.disabled = true;
      elements.validateAudioButton.disabled = true;
      setMessage(elements.gameMessage, "Envoi de la contribution...");
      const response = await emitWithAcknowledgment("submitContribution", {
        roundIndex: currentGame.roundIndex,
        ...contribution
      });

      if (!response || !response.ok) {
        throw new Error(
          (response && response.error) || "Contribution refusée."
        );
      }

      setMessage(elements.gameMessage, "");
    } catch (error) {
      console.error("[jeu] Contribution impossible :", error);
      setMessage(elements.gameMessage, error.message, "error");
      elements.submitContributionButton.disabled = false;
      elements.validateAudioButton.disabled = false;
    }
  }

  function renderResultContribution(contribution, index) {
    const item = document.createElement("li");
    const meta = document.createElement("div");
    const player = document.createElement("span");
    const badge = document.createElement("span");
    const content = document.createElement("div");

    item.className = "result-item";
    meta.className = "result-meta";
    player.className = "result-player";
    player.textContent = `${index + 1}. ${contribution.nickname}`;
    badge.className = "type-badge";
    badge.textContent = TYPE_LABELS[contribution.type] || contribution.type;
    meta.append(player, badge);
    item.append(meta);

    if (contribution.empty) {
      const empty = document.createElement("p");
      empty.className = "empty-contribution";
      empty.textContent = "Aucune contribution.";
      content.append(empty);
    } else if (contribution.type === "text") {
      const text = document.createElement("p");
      text.className = "result-text";
      text.textContent = contribution.content;
      content.append(text);
    } else if (contribution.type === "drawing") {
      const image = document.createElement("img");
      image.className = "result-image";
      image.src = contribution.content;
      image.alt = `Dessin de ${contribution.nickname}`;
      content.append(image);
    } else {
      const audio = document.createElement("audio");
      audio.className = "audio-player";
      audio.src = contribution.content;
      audio.controls = true;
      audio.preload = "metadata";
      applyVolumeToAudio(audio);
      content.append(audio);
    }

    item.append(content);
    return item;
  }

  function renderCurrentResultChain() {
    if (!currentGame || currentGame.phase !== "results") {
      return;
    }

    const chains = currentGame.chains;
    const chain = chains[resultChainIndex];
    elements.resultChainCount.textContent =
      `${resultChainIndex + 1} / ${chains.length}`;
    elements.resultOwner.textContent = chain.ownerNickname;
    elements.resultContributions.replaceChildren(
      ...chain.contributions.map(renderResultContribution)
    );
    elements.previousChainButton.disabled =
      !currentGame.canControlResults || resultChainIndex === 0;
    elements.nextChainButton.disabled =
      !currentGame.canControlResults ||
      resultChainIndex === chains.length - 1;
    elements.resultNavigation.classList.toggle(
      "hidden",
      !currentGame.canControlResults
    );
    elements.resultsObserverMessage.classList.toggle(
      "hidden",
      currentGame.canControlResults
    );
    elements.returnLobbyButton.classList.toggle(
      "hidden",
      !currentGame.canControlResults
    );
  }

  function showResults(resultsState) {
    stopTimer();
    stopRoundIntro();
    stopAudioRecording(true);
    currentGame = resultsState;
    renderedRoundKey = null;
    resultChainIndex = Math.max(
      0,
      Math.min(
        resultsState.chains.length - 1,
        resultsState.currentChainIndex || 0
      )
    );
    setMessage(elements.resultsMessage, "");
    showOnly(elements.resultsView);
    renderCurrentResultChain();
  }

  async function navigateResults(direction) {
    if (!currentGame || !currentGame.canControlResults) {
      return;
    }

    elements.previousChainButton.disabled = true;
    elements.nextChainButton.disabled = true;
    try {
      const response = await emitWithAcknowledgment("navigateResults", {
        direction
      });
      if (!response || !response.ok) {
        throw new Error(
          (response && response.error) || "Navigation impossible."
        );
      }
      setMessage(elements.resultsMessage, "");
    } catch (error) {
      setMessage(elements.resultsMessage, error.message, "error");
      renderCurrentResultChain();
    }
  }

  async function leaveCurrentRoom() {
    if (!currentRoom || !socket) {
      showHome();
      return;
    }

    const roomCode = currentRoom.code;
    currentRoom = null;
    currentGame = null;
    shouldRejoin = false;
    stopTimer();
    stopRoundIntro();
    stopAudioRecording(true);

    try {
      await emitWithAcknowledgment("leaveRoom");
    } catch (error) {
      console.error("[socket.io] Départ non confirmé :", error);
    }

    showHome();
    setMessage(elements.homeMessage, `Vous avez quitté la partie ${roomCode}.`);
  }

  function initializeDrawing() {
    drawingContext = elements.drawingCanvas.getContext("2d");
    resetDrawing();
    selectDrawingTool("pencil");
    selectDrawingColor("#182034");
    selectDrawingSize(8);
    elements.drawingCanvas.addEventListener("pointerdown", startDrawing);
    elements.drawingCanvas.addEventListener("pointermove", continueDrawing);
    elements.drawingCanvas.addEventListener("pointerup", endDrawing);
    elements.drawingCanvas.addEventListener("pointercancel", endDrawing);
    elements.drawingCanvas.addEventListener("pointerleave", endDrawing);

    elements.drawingTools.forEach((button) => {
      button.addEventListener("click", () => {
        selectDrawingTool(button.dataset.tool);
      });
    });
    elements.colorSwatches.forEach((button) => {
      button.addEventListener("click", () => {
        selectDrawingColor(button.dataset.color);
      });
    });
    elements.drawingColor.addEventListener("input", () => {
      selectDrawingColor(elements.drawingColor.value);
    });
    elements.brushSizes.forEach((button) => {
      button.addEventListener("click", () => {
        selectDrawingSize(button.dataset.size);
      });
    });
    elements.undoDrawingButton.addEventListener("click", undoDrawing);
    elements.redoDrawingButton.addEventListener("click", redoDrawing);
    elements.clearDrawingButton.addEventListener("click", clearDrawing);
  }

  function initialize() {
    if (!window.GameClientUtils) {
      throw new Error("client-utils.js doit être chargé avant app.js.");
    }
    if (typeof window.io !== "function") {
      throw new Error("socket.io.min.js doit être chargé avant app.js.");
    }

    serverUrl = window.GameClientUtils.normalizeServerUrl(
      window.GAME_SERVER_URL,
      window.location.origin
    );
    healthUrl = window.GameClientUtils.buildEndpointUrl(serverUrl, "/health");
    console.info(`[config] Serveur utilisé : ${serverUrl}`);
    console.info(`[config] Health check : ${healthUrl}`);

    initializeDrawing();
    loadAudioSettings();
    loadTheme();

    elements.createButton.addEventListener("click", () =>
      prepareAction("create")
    );
    elements.joinButton.addEventListener("click", () => prepareAction("join"));
    elements.retryButton.addEventListener("click", runPendingAction);
    elements.leaveButton.addEventListener("click", leaveCurrentRoom);
    elements.gameLeaveButton.addEventListener("click", leaveCurrentRoom);

    elements.startGameButton.addEventListener("click", async () => {
      elements.startGameButton.disabled = true;
      setMessage(elements.roomMessage, "Lancement de la partie...");
      try {
        const response = await emitWithAcknowledgment("startGame");
        if (!response || !response.ok) {
          throw new Error(
            (response && response.error) || "Lancement impossible."
          );
        }
      } catch (error) {
        setMessage(elements.roomMessage, error.message, "error");
        if (currentRoom) {
          showRoom(currentRoom);
        }
      }
    });

    elements.roomCodeInput.addEventListener("input", () => {
      elements.roomCodeInput.value = elements.roomCodeInput.value
        .toUpperCase()
        .replace(/[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]/g, "")
        .slice(0, 6);
    });

    elements.roomCodeInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        prepareAction("join");
      }
    });

    elements.nickname.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        prepareAction(elements.roomCodeInput.value.trim() ? "join" : "create");
      }
    });

    elements.copyButton.addEventListener("click", async () => {
      if (!currentRoom) {
        return;
      }

      try {
        await navigator.clipboard.writeText(currentRoom.code);
        setMessage(elements.roomMessage, "Code copié.", "success");
      } catch {
        setMessage(
          elements.roomMessage,
          `Copiez ce code : ${currentRoom.code}`,
          "error"
        );
      }
    });
    elements.toggleCodeButton.addEventListener("click", () => {
      codeVisible = !codeVisible;
      renderRoomCode();
    });
    elements.roundCountSelect.addEventListener(
      "change",
      updateRoomSettings
    );
    elements.inputTypeCountSelect.addEventListener(
      "change",
      updateRoomSettings
    );

    elements.typeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        selectContributionType(button.dataset.type);
      });
    });

    elements.textContribution.addEventListener("input", () => {
      elements.textCounter.textContent =
        `${Array.from(elements.textContribution.value).length} / 500`;
    });

    elements.settingsButton.addEventListener("click", () => {
      setSettingsOpen(true);
    });
    elements.closeSettingsButton.addEventListener("click", () => {
      setSettingsOpen(false);
    });
    elements.settingsModal.addEventListener("click", (event) => {
      if (event.target === elements.settingsModal) {
        setSettingsOpen(false);
      }
    });
    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        !elements.settingsModal.classList.contains("hidden")
      ) {
        setSettingsOpen(false);
      }
    });
    elements.volumeSlider.addEventListener("input", () => {
      setSiteVolume(Number(elements.volumeSlider.value) / 100);
    });
    elements.muteButton.addEventListener("click", () => {
      siteMuted = !siteMuted;
      saveAudioSettings();
      updateAudioSettingsUi();
    });
    elements.themeToggle.addEventListener("click", toggleTheme);

    elements.recordAudioButton.addEventListener(
      "click",
      startAudioRecording
    );
    elements.playAudioButton.addEventListener(
      "click",
      toggleRecordedAudioPlayback
    );
    elements.resetAudioButton.addEventListener("click", resetAudio);
    elements.validateAudioButton.addEventListener(
      "click",
      submitContribution
    );
    elements.audioPreview.addEventListener(
      "loadedmetadata",
      updateAudioTimeline
    );
    elements.audioPreview.addEventListener("timeupdate", updateAudioTimeline);
    elements.audioPreview.addEventListener("play", updateAudioPlayButton);
    elements.audioPreview.addEventListener("pause", updateAudioPlayButton);
    elements.audioPreview.addEventListener("ended", () => {
      elements.audioPreview.currentTime = 0;
      updateAudioTimeline();
      updateAudioPlayButton();
    });
    elements.audioProgress.addEventListener("input", () => {
      const duration = elements.audioPreview.duration;
      if (Number.isFinite(duration) && duration > 0) {
        elements.audioPreview.currentTime =
          (Number(elements.audioProgress.value) / 1000) * duration;
      }
    });
    elements.introAudioPlayButton.addEventListener("click", async () => {
      if (!introAudioElement) {
        stopRoundIntro();
        return;
      }

      try {
        applyVolumeToAudio(introAudioElement);
        introAudioElement.currentTime = 0;
        await introAudioElement.play();
        elements.roundIntro.classList.add("hidden");
        elements.introAudioPlayButton.classList.add("hidden");
      } catch (error) {
        console.error("[audio] Lecture manuelle impossible :", error);
        setMessage(
          elements.gameMessage,
          `Lecture audio impossible : ${error.message}`,
          "error"
        );
      }
    });
    elements.submitContributionButton.addEventListener(
      "click",
      submitContribution
    );

    elements.previousChainButton.addEventListener("click", () =>
      navigateResults(-1)
    );
    elements.nextChainButton.addEventListener("click", () =>
      navigateResults(1)
    );
    elements.returnLobbyButton.addEventListener("click", async () => {
      elements.returnLobbyButton.disabled = true;
      try {
        const response = await emitWithAcknowledgment("returnToLobby");
        if (!response || !response.ok) {
          throw new Error(
            (response && response.error) || "Retour au lobby impossible."
          );
        }
      } catch (error) {
        setMessage(elements.resultsMessage, error.message, "error");
      } finally {
        elements.returnLobbyButton.disabled = false;
      }
    });
  }

  try {
    initialize();
  } catch (error) {
    console.error("[initialisation] Échec du frontend :", error);
    setHomeBusy(true);
    setMessage(elements.homeMessage, error.message, "error");
  }
})();
