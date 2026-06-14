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

  const elements = {
    homeView: document.querySelector("#home-view"),
    roomView: document.querySelector("#room-view"),
    gameView: document.querySelector("#game-view"),
    resultsView: document.querySelector("#results-view"),
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
    startGameButton: document.querySelector("#start-game-button"),
    startHelp: document.querySelector("#start-help"),
    leaveButton: document.querySelector("#leave-button"),
    roomMessage: document.querySelector("#room-message"),
    roundLabel: document.querySelector("#round-label"),
    timerLabel: document.querySelector("#timer-label"),
    timerProgress: document.querySelector("#timer-progress"),
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
    drawingSize: document.querySelector("#drawing-size"),
    clearDrawingButton: document.querySelector("#clear-drawing-button"),
    audioStatus: document.querySelector("#audio-status"),
    recordAudioButton: document.querySelector("#record-audio-button"),
    stopAudioButton: document.querySelector("#stop-audio-button"),
    playAudioButton: document.querySelector("#play-audio-button"),
    resetAudioButton: document.querySelector("#reset-audio-button"),
    audioPreview: document.querySelector("#audio-preview"),
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
  let selectedType = "text";
  let renderedRoundKey = null;
  let drawingContext = null;
  let drawingActive = false;
  let drawingDirty = false;
  let lastDrawingPoint = null;
  let recordingSession = null;
  let audioDataUrl = "";
  let resultChainIndex = 0;

  function setMessage(element, message, type = "") {
    element.textContent = message;
    element.className = `message${type ? ` ${type}` : ""}`;
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

  function showHome() {
    stopTimer();
    stopAudioRecording(true);
    currentRoom = null;
    currentGame = null;
    shouldRejoin = false;
    renderedRoundKey = null;
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

  function showRoom(room) {
    currentRoom = room;
    currentGame = null;
    renderedRoundKey = null;
    stopTimer();
    stopAudioRecording(true);

    elements.roomTitle.textContent = room.code;
    elements.playerCount.textContent =
      `${room.playerCount} / ${room.maxPlayers} joueurs`;
    renderPlayerList(room);

    const isHost = Boolean(socket && room.hostId === socket.id);
    elements.startGameButton.classList.toggle("hidden", !isHost);
    elements.startGameButton.disabled =
      !isHost || room.playerCount < room.minPlayersToStart;
    elements.startHelp.textContent = isHost
      ? room.playerCount < room.minPlayersToStart
        ? "Il faut au moins 2 joueurs pour lancer la partie."
        : `${room.playerCount} manches seront jouées.`
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

  function startDrawing(event) {
    if (currentGame && currentGame.submitted) {
      return;
    }

    event.preventDefault();
    drawingActive = true;
    lastDrawingPoint = getCanvasPoint(event);
    drawingContext.beginPath();
    drawingContext.arc(
      lastDrawingPoint.x,
      lastDrawingPoint.y,
      Math.max(1, Number(elements.drawingSize.value) / 2),
      0,
      Math.PI * 2
    );
    drawingContext.fillStyle = elements.drawingColor.value;
    drawingContext.fill();
    drawingDirty = true;
    elements.drawingCanvas.setPointerCapture(event.pointerId);
  }

  function continueDrawing(event) {
    if (!drawingActive || !lastDrawingPoint) {
      return;
    }

    event.preventDefault();
    const point = getCanvasPoint(event);
    drawingContext.beginPath();
    drawingContext.moveTo(lastDrawingPoint.x, lastDrawingPoint.y);
    drawingContext.lineTo(point.x, point.y);
    drawingContext.strokeStyle = elements.drawingColor.value;
    drawingContext.lineWidth = Number(elements.drawingSize.value);
    drawingContext.lineCap = "round";
    drawingContext.lineJoin = "round";
    drawingContext.stroke();
    drawingDirty = true;
    lastDrawingPoint = point;
  }

  function endDrawing(event) {
    if (!drawingActive) {
      return;
    }

    drawingActive = false;
    lastDrawingPoint = null;
    if (
      event.pointerId !== undefined &&
      elements.drawingCanvas.hasPointerCapture(event.pointerId)
    ) {
      elements.drawingCanvas.releasePointerCapture(event.pointerId);
    }
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
    if (recordingSession.recorder.state !== "inactive") {
      recordingSession.recorder.stop();
    } else {
      stopStream(recordingSession.stream);
      recordingSession = null;
    }
  }

  function resetAudio() {
    stopAudioRecording(true);
    audioDataUrl = "";
    elements.audioPreview.removeAttribute("src");
    elements.audioPreview.classList.add("hidden");
    elements.audioStatus.textContent = "Aucun enregistrement.";
    elements.recordAudioButton.disabled = false;
    elements.stopAudioButton.disabled = true;
    elements.playAudioButton.disabled = true;
    elements.resetAudioButton.disabled = true;
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

    try {
      resetAudio();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        roundIndex: currentGame.roundIndex,
        discard: false
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
          elements.audioPreview.classList.remove("hidden");
          elements.audioStatus.textContent = "Enregistrement prêt à écouter.";
          elements.playAudioButton.disabled = false;
          elements.resetAudioButton.disabled = false;
        } catch (error) {
          setMessage(elements.gameMessage, error.message, "error");
          resetAudio();
        }
      });

      recorder.start(250);
      elements.audioStatus.textContent = "Enregistrement en cours...";
      elements.recordAudioButton.disabled = true;
      elements.stopAudioButton.disabled = false;
      elements.playAudioButton.disabled = true;
      elements.resetAudioButton.disabled = true;
      setMessage(elements.gameMessage, "");
    } catch (error) {
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
  }

  function renderContribution(container, contribution) {
    container.replaceChildren();

    if (!contribution || contribution.empty) {
      const empty = document.createElement("p");
      empty.className = "empty-contribution";
      empty.textContent = "Aucune contribution n'a été envoyée.";
      container.append(empty);
      return;
    }

    if (contribution.type === "text") {
      const text = document.createElement("p");
      text.className = "previous-text";
      text.textContent = contribution.content;
      container.append(text);
      return;
    }

    if (contribution.type === "drawing") {
      const image = document.createElement("img");
      image.className = "previous-image";
      image.src = contribution.content;
      image.alt = `Dessin proposé par ${contribution.nickname}`;
      container.append(image);
      return;
    }

    const audio = document.createElement("audio");
    audio.className = "audio-player";
    audio.src = contribution.content;
    audio.controls = true;
    container.append(audio);
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
    const duration = gameState.roundEndsAt - gameState.roundStartedAt;

    function updateTimer() {
      const serverTime = Date.now() + serverOffset;
      const remaining = Math.max(0, gameState.roundEndsAt - serverTime);
      const seconds = Math.ceil(remaining / 1000);
      const ratio = duration > 0 ? remaining / duration : 0;

      elements.timerLabel.textContent = String(seconds);
      elements.timerProgress.style.width = `${Math.max(0, ratio * 100)}%`;
      elements.timerProgress.classList.toggle("urgent", seconds <= 10);

      if (remaining <= 0) {
        stopTimer();
      }
    }

    updateTimer();
    timerInterval = window.setInterval(updateTimer, 250);
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
    elements.gamePrompt.textContent = gameState.assignment.prompt;

    const previous = gameState.assignment.previousContribution;
    elements.previousPanel.classList.toggle("hidden", !previous);
    if (previous) {
      renderContribution(elements.previousContent, previous);
    } else {
      elements.previousContent.replaceChildren();
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
      gameState.submitted
    );
    elements.waitingProgress.textContent =
      `${gameState.submittedCount} / ${gameState.participantCount} joueurs ont validé.`;
    elements.submitContributionButton.disabled = false;
    startRoundTimer(gameState);
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
      throw new Error("Arrêtez l'enregistrement avant de valider.");
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
    elements.previousChainButton.disabled = resultChainIndex === 0;
    elements.nextChainButton.disabled =
      resultChainIndex === chains.length - 1;
  }

  function showResults(resultsState) {
    stopTimer();
    stopAudioRecording(true);
    currentGame = resultsState;
    renderedRoundKey = null;
    resultChainIndex = 0;
    setMessage(elements.resultsMessage, "");
    showOnly(elements.resultsView);
    renderCurrentResultChain();
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
    elements.drawingCanvas.addEventListener("pointerdown", startDrawing);
    elements.drawingCanvas.addEventListener("pointermove", continueDrawing);
    elements.drawingCanvas.addEventListener("pointerup", endDrawing);
    elements.drawingCanvas.addEventListener("pointercancel", endDrawing);
    elements.drawingCanvas.addEventListener("pointerleave", endDrawing);
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

    elements.typeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        selectContributionType(button.dataset.type);
      });
    });

    elements.textContribution.addEventListener("input", () => {
      elements.textCounter.textContent =
        `${Array.from(elements.textContribution.value).length} / 500`;
    });
    elements.clearDrawingButton.addEventListener("click", resetDrawing);
    elements.recordAudioButton.addEventListener("click", startAudioRecording);
    elements.stopAudioButton.addEventListener("click", () => {
      stopAudioRecording(false);
      elements.stopAudioButton.disabled = true;
      elements.audioStatus.textContent = "Préparation de l'enregistrement...";
    });
    elements.playAudioButton.addEventListener("click", async () => {
      try {
        elements.audioPreview.currentTime = 0;
        await elements.audioPreview.play();
      } catch (error) {
        setMessage(
          elements.gameMessage,
          `Lecture audio impossible : ${error.message}`,
          "error"
        );
      }
    });
    elements.resetAudioButton.addEventListener("click", resetAudio);
    elements.submitContributionButton.addEventListener(
      "click",
      submitContribution
    );

    elements.previousChainButton.addEventListener("click", () => {
      if (resultChainIndex > 0) {
        resultChainIndex -= 1;
        renderCurrentResultChain();
      }
    });
    elements.nextChainButton.addEventListener("click", () => {
      if (
        currentGame &&
        resultChainIndex < currentGame.chains.length - 1
      ) {
        resultChainIndex += 1;
        renderCurrentResultChain();
      }
    });
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
