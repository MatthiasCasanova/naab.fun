"use strict";

(() => {
  const WAKE_RETRY_INTERVAL_MS = 3000;
  const WAKE_TIMEOUT_MS = 90000;
  const WAKE_REQUEST_TIMEOUT_MS = 85000;
  const HEALTH_PROBE_TIMEOUT_MS = 10000;
  const SOCKET_CONNECTION_TIMEOUT_MS = 15000;

  const elements = {
    homeView: document.querySelector("#home-view"),
    roomView: document.querySelector("#room-view"),
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
    leaveButton: document.querySelector("#leave-button"),
    roomMessage: document.querySelector("#room-message")
  };

  let serverUrl;
  let healthUrl;
  let socket = null;
  let pendingAction = null;
  let actionRunning = false;
  let currentRoom = null;
  let currentNickname = "";
  let shouldRejoin = false;

  function setMessage(element, message, type = "") {
    element.textContent = message;
    element.className = `message${type ? ` ${type}` : ""}`;
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

  function showHome() {
    currentRoom = null;
    shouldRejoin = false;
    elements.roomView.classList.add("hidden");
    elements.homeView.classList.remove("hidden");
    setConnectionState(Boolean(socket && socket.connected), "Connecté");
  }

  function showRoom(room) {
    currentRoom = room;
    elements.roomTitle.textContent = room.code;
    elements.playerCount.textContent =
      `${room.playerCount} / ${room.maxPlayers} joueurs`;
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

    elements.homeView.classList.add("hidden");
    elements.roomView.classList.remove("hidden");
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
          headers: {
            Accept: "application/json"
          },
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

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.toLowerCase().includes("application/json")) {
          throw new Error(
            `Réponse inattendue (${contentType || "type de contenu absent"}).`
          );
        }

        const body = await response.json();
        if (!body || body.status !== "ok") {
          throw new Error(
            `Réponse JSON invalide : ${JSON.stringify(body)}`
          );
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
            `Erreur réseau ou CORS pour ${healthUrl} : ${error.message}`
          );
          visibleError.name = "HealthNetworkError";
        }

        console.error(
          `[health] Échec de ${healthUrl} :`,
          visibleError,
          error
        );
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

            if (resolved) {
              return;
            }

            if (result.cancelled) {
              return;
            }

            if (result.ok) {
              console.info(
                `[health] Serveur disponible après ${attemptNumber} tentative(s).`
              );
              finish({ ok: true });
              return;
            }

            lastError = result.error;
            const detail = window.GameClientUtils.describeError(lastError);
            setMessage(
              elements.homeMessage,
              `Démarrage du serveur... Tentative ${attemptNumber}. ` +
                `Dernière erreur : ${detail}`
            );
          })
          .catch((error) => {
            activeRequests.delete(request);
            lastError = error;
            console.error("[health] Erreur interne de la sonde :", error);
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
        socket.timeout(8000).emit(eventName, acknowledgment);
        return;
      }

      socket.timeout(8000).emit(eventName, payload, acknowledgment);
    });
  }

  function connectSocket() {
    if (typeof window.io !== "function") {
      throw new Error(
        "Le client Socket.IO n'est pas chargé. Vérifiez socket.io.min.js et l'ordre des scripts."
      );
    }

    if (socket) {
      if (!socket.connected) {
        console.info(`[socket.io] Reconnexion à ${serverUrl}`);
        socket.connect();
      }
      return;
    }

    console.info(`[socket.io] Connexion à ${serverUrl}`);
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
      console.info(
        `[socket.io] Connecté à ${serverUrl} avec le transport ${socket.io.engine.transport.name}.`
      );
      setConnectionState(true, "Connecté");

      if (!shouldRejoin || !currentRoom) {
        return;
      }

      shouldRejoin = false;
      setMessage(elements.roomMessage, "Reconnexion à la partie...");

      try {
        const response = await emitWithAcknowledgment("joinRoom", {
          code: currentRoom.code,
          nickname: currentNickname
        });

        if (!response || !response.ok) {
          throw new Error(
            (response && response.error) ||
              "Impossible de rejoindre de nouveau la partie."
          );
        }

        showRoom(response.room);
        setMessage(elements.roomMessage, "");
      } catch (error) {
        console.error("[socket.io] Échec de la reconnexion à la room :", error);
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
      console.error(
        `[socket.io] connect_error sur ${serverUrl} : ${detail}`,
        error
      );
      setConnectionState(false, "Connexion refusée");
      setMessage(
        currentRoom ? elements.roomMessage : elements.homeMessage,
        `Connexion Socket.IO impossible vers ${serverUrl}. ` +
          `Vérifiez le réseau et ALLOWED_ORIGINS. Détail : ${detail}`,
        "error"
      );
    });

    socket.on("disconnect", (reason, details) => {
      console.warn(
        `[socket.io] Déconnecté de ${serverUrl}. Raison : ${reason}`,
        details || ""
      );
      setConnectionState(false, "Reconnexion...");

      if (currentRoom && reason !== "io client disconnect") {
        shouldRejoin = true;
        setMessage(
          elements.roomMessage,
          `Connexion perdue (${reason}). Reconnexion en cours...`
        );
      }
    });

    socket.on("roomState", (room) => {
      if (currentRoom && room.code === currentRoom.code) {
        showRoom(room);
      }
    });

    socket.on("roomError", (payload) => {
      const message =
        (payload && payload.message) || "Une erreur de room est survenue.";
      console.error("[socket.io] Erreur de room :", message);
      setMessage(
        currentRoom ? elements.roomMessage : elements.homeMessage,
        message,
        "error"
      );
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
        reject(
          new Error(
            `Connexion Socket.IO à ${serverUrl} impossible après ` +
              `${SOCKET_CONNECTION_TIMEOUT_MS / 1000} secondes.`
          )
        );
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
          new Error(
            `Connexion Socket.IO refusée : ${describeSocketError(error)}`
          )
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
        `Impossible de joindre ${healthUrl} après 90 secondes. ` +
          `Dernière erreur : ${detail}`,
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
      shouldRejoin = false;
      showRoom(response.room);
      setMessage(elements.roomMessage, "");
      setMessage(elements.homeMessage, "");
      pendingAction = null;
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

  function initialize() {
    if (!window.GameClientUtils) {
      throw new Error(
        "client-utils.js doit être chargé avant app.js."
      );
    }

    if (typeof window.io !== "function") {
      throw new Error(
        "socket.io.min.js doit être chargé avant app.js."
      );
    }

    serverUrl = window.GameClientUtils.normalizeServerUrl(
      window.GAME_SERVER_URL,
      window.location.origin
    );
    healthUrl = window.GameClientUtils.buildEndpointUrl(serverUrl, "/health");

    console.info(`[config] GAME_SERVER_URL=${window.GAME_SERVER_URL || "(vide)"}`);
    console.info(`[config] Serveur utilisé : ${serverUrl}`);
    console.info(`[config] Health check : ${healthUrl}`);

    elements.createButton.addEventListener("click", () =>
      prepareAction("create")
    );
    elements.joinButton.addEventListener("click", () => prepareAction("join"));
    elements.retryButton.addEventListener("click", runPendingAction);

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
      } catch (error) {
        console.error("[interface] Copie impossible :", error);
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(elements.roomTitle);
        selection.removeAllRanges();
        selection.addRange(range);
        setMessage(
          elements.roomMessage,
          "Sélectionnez puis copiez le code affiché.",
          "error"
        );
      }
    });

    elements.leaveButton.addEventListener("click", async () => {
      if (!socket || !currentRoom) {
        showHome();
        return;
      }

      const roomCode = currentRoom.code;
      currentRoom = null;
      shouldRejoin = false;

      try {
        await emitWithAcknowledgment("leaveRoom");
      } catch (error) {
        console.error("[socket.io] Départ non confirmé :", error);
      }

      showHome();
      setMessage(
        elements.homeMessage,
        `Vous avez quitté la partie ${roomCode}.`
      );
    });
  }

  try {
    initialize();
  } catch (error) {
    console.error("[initialisation] Échec du frontend :", error);
    setHomeBusy(true);
    elements.retryButton.classList.add("hidden");
    setMessage(elements.homeMessage, error.message, "error");
  }
})();
