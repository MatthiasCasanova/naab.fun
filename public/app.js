"use strict";

(() => {
  const WAKE_RETRY_INTERVAL_MS = 3000;
  const WAKE_TIMEOUT_MS = 90000;
  const HEALTH_REQUEST_TIMEOUT_MS = 2500;
  const SERVER_URL = String(window.GAME_SERVER_URL || "").replace(/\/+$/, "");

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
    setConnectionState(Boolean(socket && socket.connected), "Connecte");
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
    setConnectionState(Boolean(socket && socket.connected), "Connecte");
  }

  function healthUrl() {
    return new URL("/health", SERVER_URL || window.location.origin).href;
  }

  function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  async function checkHealth() {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      HEALTH_REQUEST_TIMEOUT_MS
    );

    try {
      const response = await fetch(healthUrl(), {
        method: "GET",
        cache: "no-store",
        signal: controller.signal
      });

      if (!response.ok) {
        return false;
      }

      const body = await response.json();
      return body && body.status === "ok";
    } catch {
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function wakeServer() {
    const deadline = Date.now() + WAKE_TIMEOUT_MS;
    setMessage(elements.homeMessage, "Démarrage du serveur...");
    setHomeBusy(true);
    elements.retryButton.classList.add("hidden");

    while (Date.now() < deadline) {
      const attemptStartedAt = Date.now();

      if (await checkHealth()) {
        return true;
      }

      const remainingTime = deadline - Date.now();
      if (remainingTime > 0) {
        const attemptDuration = Date.now() - attemptStartedAt;
        const delayBeforeNextAttempt = Math.max(
          0,
          WAKE_RETRY_INTERVAL_MS - attemptDuration
        );
        await wait(Math.min(delayBeforeNextAttempt, remainingTime));
      }
    }

    return false;
  }

  function emitWithAcknowledgment(eventName, payload) {
    return new Promise((resolve, reject) => {
      socket.timeout(8000).emit(eventName, payload, (error, response) => {
        if (error) {
          reject(new Error("Le serveur ne répond pas. Réessayez."));
          return;
        }

        resolve(response);
      });
    });
  }

  function connectSocket() {
    if (socket) {
      if (!socket.connected) {
        socket.connect();
      }
      return;
    }

    socket = window.io(SERVER_URL || undefined, {
      autoConnect: false,
      transports: ["websocket", "polling"]
    });

    socket.on("connect", async () => {
      setConnectionState(true, "Connecte");

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
        showHome();
        setMessage(
          elements.homeMessage,
          `Reconnexion impossible : ${error.message}`,
          "error"
        );
      }
    });

    socket.on("disconnect", (reason) => {
      setConnectionState(false, "Reconnexion...");

      if (currentRoom && reason !== "io client disconnect") {
        shouldRejoin = true;
        setMessage(
          elements.roomMessage,
          "Connexion perdue. Reconnexion en cours..."
        );
      }
    });

    socket.on("connect_error", () => {
      setConnectionState(false, "Hors ligne");
    });

    socket.on("roomState", (room) => {
      if (currentRoom && room.code === currentRoom.code) {
        showRoom(room);
      }
    });

    socket.on("roomError", (payload) => {
      setMessage(
        currentRoom ? elements.roomMessage : elements.homeMessage,
        (payload && payload.message) || "Une erreur est survenue.",
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
        reject(new Error("Connexion au serveur impossible."));
      }, 10000);

      function cleanup() {
        window.clearTimeout(timeout);
        socket.off("connect", handleConnect);
        socket.off("connect_error", handleError);
      }

      function handleConnect() {
        cleanup();
        resolve();
      }

      function handleError() {
        cleanup();
        reject(new Error("Connexion au serveur impossible."));
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

    const serverIsReady = await wakeServer();
    if (!serverIsReady) {
      actionRunning = false;
      setHomeBusy(false);
      elements.retryButton.classList.remove("hidden");
      setMessage(
        elements.homeMessage,
        "Le serveur ne répond pas après 90 secondes. Vérifiez son URL puis réessayez.",
        "error"
      );
      return;
    }

    try {
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

  elements.createButton.addEventListener("click", () => prepareAction("create"));
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
    } catch {
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
    } catch {
      // La vue locale peut tout de même être fermée si le serveur est inaccessible.
    }

    showHome();
    setMessage(elements.homeMessage, `Vous avez quitté la partie ${roomCode}.`);
  });
})();
