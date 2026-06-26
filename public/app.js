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
  const CONTRIBUTION_STEP_LABELS = {
    "champion-name": "Nom",
    "spell-kit": "Sorts",
    "quote-pack": "Répliques",
    "champion-sketch": "Croquis",
    "champion-lore": "Lore"
  };
  const AVATARS = Object.freeze({
    comet: "C1",
    robot: "R2",
    wizard: "P3",
    alien: "A4",
    ninja: "N5",
    ghost: "S6",
    cat: "V7",
    frog: "G8"
  });
  const ROOM_GAMES = Object.freeze({
    party: {
      id: "party",
      name: "Party",
      resolvedId: null,
      resolvedName: null
    },
    kamoulox3000: {
      id: "kamoulox3000",
      name: "Kamoulox 3000",
      resolvedId: "kamoulox3000",
      resolvedName: "Kamoulox 3000"
    },
    leagueOfNaabs: {
      id: "leagueOfNaabs",
      name: "League Of Naabs",
      resolvedId: "leagueOfNaabs",
      resolvedName: "League Of Naabs"
    }
  });
  const DEFAULT_ROOM_GAME_ID = "party";
  const PLAYER_STATUS_LABELS = Object.freeze({
    ready: "Prêt",
    playing: "En création",
    done: "Validé",
    summary: "Résumé",
    watching: "Spectateur"
  });
  const AUDIO_VOLUME_STORAGE_KEY = "kamoulox-audio-volume";
  const LEGACY_VOLUME_STORAGE_KEY = "kamoulox-volume";
  const EFFECTS_VOLUME_STORAGE_KEY = "kamoulox-effects-volume";
  const MUTED_STORAGE_KEY = "kamoulox-muted";
  const THEME_STORAGE_KEY = "kamoulox-theme";
  const AUDIO_RECORDING_DURATION_MS = 5000;
  const AUDIO_OUTPUT_SCALE = 0.5;
  const MAX_DRAWING_HISTORY = 30;
  const WAVEFORM_BAR_COUNT = 72;
  const DRAFT_SAVE_DEBOUNCE_MS = 450;
  const DRAWING_DRAFT_SAVE_DEBOUNCE_MS = 650;
  const AUDIO_DRAFT_SAVE_INTERVAL_MS = 800;
  const VERSION_REQUEST_TIMEOUT_MS = 5000;
  const DEFAULT_ROOM_NAME = "Room naab.fun";

  const elements = {
    playLayout: document.querySelector("#play-layout"),
    playersSidebar: document.querySelector("#players-sidebar"),
    playersSidebarTitle: document.querySelector("#players-sidebar-title"),
    chatSidebar: document.querySelector("#chat-sidebar"),
    chatToggleButton: document.querySelector("#chat-toggle-button"),
    chatCloseButton: document.querySelector("#chat-close-button"),
    chatMessages: document.querySelector("#chat-messages"),
    chatForm: document.querySelector("#chat-form"),
    chatInput: document.querySelector("#chat-input"),
    chatSendButton: document.querySelector("#chat-send-button"),
    chatMessage: document.querySelector("#chat-message"),
    homeView: document.querySelector("#home-view"),
    roomView: document.querySelector("#room-view"),
    gameView: document.querySelector("#game-view"),
    resultsView: document.querySelector("#results-view"),
    appVersion: document.querySelector("#app-version"),
    settingsButton: document.querySelector("#settings-button"),
    settingsModal: document.querySelector("#settings-modal"),
    closeSettingsButton: document.querySelector("#close-settings-button"),
    volumeSlider: document.querySelector("#volume-slider"),
    volumeValue: document.querySelector("#volume-value"),
    effectsVolumeSlider: document.querySelector("#effects-volume-slider"),
    effectsVolumeValue: document.querySelector("#effects-volume-value"),
    muteButton: document.querySelector("#mute-button"),
    muteIconUse: document.querySelector("#mute-icon-use"),
    themeToggle: document.querySelector("#theme-toggle"),
    themeIconUse: document.querySelector("#theme-icon-use"),
    gameSettingsModal: document.querySelector("#game-settings-modal"),
    closeGameSettingsButton: document.querySelector(
      "#close-game-settings-button"
    ),
    doneGameSettingsButton: document.querySelector(
      "#done-game-settings-button"
    ),
    nickname: document.querySelector("#nickname"),
    roomName: document.querySelector("#room-name"),
    avatarButtons: Array.from(document.querySelectorAll(".avatar-option")),
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
    codeIconUse: document.querySelector("#code-icon-use"),
    gameSettingsButtons: Array.from(
      document.querySelectorAll(".game-tile-settings")
    ),
    gameSettingsPanel: document.querySelector("#game-settings-panel"),
    gameSettingsTitle: document.querySelector("#game-settings-title"),
    roundCountInput: document.querySelector("#round-count-input"),
    roundCountHelp: document.querySelector("#round-count-help"),
    numberStepperButtons: Array.from(
      document.querySelectorAll("[data-stepper-target]")
    ),
    inputTypesSettings: document.querySelector("#input-types-settings"),
    inputTypeCheckboxes: Array.from(
      document.querySelectorAll("[data-input-type]")
    ),
    partySettings: document.querySelector("#party-settings"),
    partyGameCountInput: document.querySelector(
      "#party-game-count-input"
    ),
    partyGameCheckboxes: Array.from(
      document.querySelectorAll("[data-party-game]")
    ),
    selectedGameName: document.querySelector("#selected-game-name"),
    gameSelectionButtons: Array.from(
      document.querySelectorAll("[data-game-id]")
    ),
    startGameButton: document.querySelector("#start-game-button"),
    leaveButton: document.querySelector("#leave-button"),
    roomMessage: document.querySelector("#room-message"),
    roundIntro: document.querySelector("#round-intro"),
    gameStartCountdown: document.querySelector("#game-start-countdown"),
    gameStartCountdownValue: document.querySelector(
      "#game-start-countdown-value"
    ),
    roundPreview: document.querySelector("#round-preview"),
    roundPreviewCountdown: document.querySelector(
      "#round-preview-countdown"
    ),
    closeRoundPreviewButton: document.querySelector(
      "#close-round-preview-button"
    ),
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
    replayPreviousButton: document.querySelector(
      "#replay-previous-button"
    ),
    gamePrompt: document.querySelector("#game-prompt"),
    typePicker: document.querySelector("#type-picker"),
    typeButtons: Array.from(document.querySelectorAll(".type-button")),
    editorPanel: document.querySelector("#editor-panel"),
    textEditor: document.querySelector("#text-editor"),
    textEditorLabel: document.querySelector("#text-editor-label"),
    spellKitEditor: document.querySelector("#spell-kit-editor"),
    spellInputs: Array.from(
      document.querySelectorAll("[id^='spell-input-']")
    ),
    drawingEditor: document.querySelector("#drawing-editor"),
    drawingEditorLabel: document.querySelector("#drawing-editor-label"),
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
    quoteAudioSlots: document.querySelector("#quote-audio-slots"),
    quoteAudioSlotButtons: Array.from(
      document.querySelectorAll(".quote-audio-slot")
    ),
    audioReadyState: document.querySelector("#audio-ready-state"),
    audioStatus: document.querySelector("#audio-status"),
    recordAudioButton: document.querySelector("#record-audio-button"),
    recordButtonLabel: document.querySelector("#record-button-label"),
    audioRecordingSpectrum: document.querySelector(
      "#audio-recording-spectrum"
    ),
    playAudioButton: document.querySelector("#play-audio-button"),
    resetAudioButton: document.querySelector("#reset-audio-button"),
    validateAudioButton: document.querySelector("#validate-audio-button"),
    audioPreview: document.querySelector("#audio-preview"),
    audioPlayIconUse: document.querySelector("#audio-play-icon-use"),
    audioWaveform: document.querySelector("#audio-waveform"),
    audioPlayhead: document.querySelector("#audio-playhead"),
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
    resultsTitle: document.querySelector("#results-title"),
    resultOwnerLabel: document.querySelector("#result-owner-label"),
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
    restartGameButton: document.querySelector("#restart-game-button"),
    returnLobbyButton: document.querySelector("#return-lobby-button")
  };

  let serverUrl;
  let healthUrl;
  let versionUrl;
  let socket = null;
  let pendingAction = null;
  let actionRunning = false;
  let currentRoom = null;
  let currentGame = null;
  let currentNickname = "";
  let currentAvatarId = "comet";
  let pendingRoomGameId = null;
  let pendingRoomGameVoteId = null;
  let roomGameSelectionRequestId = 0;
  let roomGameVoteRequestId = 0;
  let renderedPlayerListSignature = "";
  let shouldRejoin = false;
  let timerInterval = null;
  let introTimeout = null;
  let introInterval = null;
  let introRoundKey = null;
  let introAudioElement = null;
  let roundPreviousAudio = null;
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
  let audioQuoteDataUrls = ["", "", "", ""];
  let activeAudioQuoteIndex = 0;
  let recordedAudioTimelineFrame = null;
  let resultChainIndex = 0;
  let resultContributionIndex = 0;
  let lastResultRevealKey = null;
  let audioVolume = 1;
  let effectsVolume = 0.7;
  let siteMuted = false;
  let codeVisible = false;
  let siteTheme = "dark";
  const waveformCache = new Map();
  let waveformResizeFrame = null;
  let effectsAudioContext = null;
  let effectsUnlocked = false;
  let lastTimerSoundSlot = null;
  let draftSaveTimer = null;
  let draftSaveGeneration = 0;
  let lastDraftSaveAt = 0;
  let chatOpen = false;

  function normalizeRoomCodeInput(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]/g, "")
      .slice(0, 6);
  }

  function isValidRoomCode(value) {
    return /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(value);
  }

  function createDefaultNickname() {
    return `Joueur ${Math.floor(1000 + Math.random() * 9000)}`;
  }

  function getRoomCodeFromUrl() {
    const parameters = new URLSearchParams(window.location.search);
    const roomCode = normalizeRoomCodeInput(
      parameters.get("room") || parameters.get("code")
    );
    return isValidRoomCode(roomCode) ? roomCode : "";
  }

  function buildRoomInviteUrl(roomCode) {
    const url = new URL(window.location.pathname || "/", window.location.origin);
    url.searchParams.set("room", roomCode);
    return url.toString();
  }

  function updateRoomCodeInUrl(roomCode) {
    if (!window.history || typeof window.history.replaceState !== "function") {
      return;
    }

    const url = new URL(window.location.href);
    if (roomCode) {
      url.searchParams.set("room", roomCode);
      url.searchParams.delete("code");
    } else {
      url.searchParams.delete("room");
      url.searchParams.delete("code");
    }
    window.history.replaceState(null, "", url);
  }

  function applyRoomCodeFromUrl() {
    const roomCode = getRoomCodeFromUrl();
    if (!roomCode) {
      return;
    }

    elements.roomCodeInput.value = roomCode;
    setMessage(
      elements.homeMessage,
      "Code de room détecté dans le lien. Choisissez un pseudo puis rejoignez."
    );
    elements.nickname.focus();
  }

  function setMessage(element, message, type = "") {
    element.textContent = message;
    element.className = `message${type ? ` ${type}` : ""}`;
    if (message && type === "error") {
      playSoundEffect("danger");
    } else if (message && type === "success") {
      playSoundEffect("confirm");
    }
  }

  function resolveAvatarId(avatarId) {
    return AVATARS[avatarId] ? avatarId : "comet";
  }

  function renderAvatarVisual(element, avatarId) {
    const resolvedAvatarId = resolveAvatarId(avatarId);
    element.replaceChildren();
    element.classList.add(`avatar-${resolvedAvatarId}`);

    const image = document.createElement("span");
    image.className = "avatar-image";
    image.setAttribute("aria-hidden", "true");
    element.append(image);
  }

  function applyVolumeToAudio(audioElement) {
    if (!audioElement) {
      return;
    }

    audioElement.volume = audioVolume * AUDIO_OUTPUT_SCALE;
    audioElement.muted = siteMuted;
  }

  function applyVolumeToAllAudio() {
    document.querySelectorAll("audio").forEach(applyVolumeToAudio);
  }

  function pauseOtherAudio(activeAudio) {
    document.querySelectorAll("audio").forEach((audio) => {
      if (audio !== activeAudio && !audio.paused) {
        audio.pause();
      }
    });
  }

  function syncRangeProgress(range) {
    const minimum = Number(range.min) || 0;
    const maximum = Number(range.max) || 100;
    const value = Number(range.value) || minimum;
    const progress =
      maximum > minimum
        ? ((value - minimum) / (maximum - minimum)) * 100
        : 0;
    range.style.setProperty(
      "--range-progress",
      `${Math.max(0, Math.min(100, progress))}%`
    );
  }

  function getFallbackWaveformPeaks() {
    return Array.from({ length: WAVEFORM_BAR_COUNT }, (_, index) => {
      const position = index / WAVEFORM_BAR_COUNT;
      return Math.max(
        0.16,
        Math.min(
          1,
          0.28 +
            Math.abs(Math.sin(position * Math.PI * 7.4)) * 0.42 +
            Math.abs(Math.cos(position * Math.PI * 13.7)) * 0.24
        )
      );
    });
  }

  function getWaveformCacheKey(source) {
    return `${source.length}:${source.slice(0, 48)}:${source.slice(-48)}`;
  }

  async function decodeWaveformPeaks(source) {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;
    if (!source || !AudioContextClass) {
      return getFallbackWaveformPeaks();
    }

    const cacheKey = getWaveformCacheKey(source);
    if (waveformCache.has(cacheKey)) {
      return waveformCache.get(cacheKey);
    }

    const waveformPromise = (async () => {
      let audioContext;
      try {
        const response = await fetch(source);
        const arrayBuffer = await response.arrayBuffer();
        audioContext = new AudioContextClass();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const channel = audioBuffer.getChannelData(0);
        const sampleSize = Math.max(
          1,
          Math.floor(channel.length / WAVEFORM_BAR_COUNT)
        );
        const peaks = Array.from(
          { length: WAVEFORM_BAR_COUNT },
          (_, index) => {
            const start = index * sampleSize;
            const end = Math.min(channel.length, start + sampleSize);
            let peak = 0;
            for (let sample = start; sample < end; sample += 1) {
              peak = Math.max(peak, Math.abs(channel[sample]));
            }
            return peak;
          }
        );
        const maximumPeak = Math.max(...peaks, 0.01);
        return peaks.map((peak) =>
          Math.max(0.08, Math.min(1, peak / maximumPeak))
        );
      } catch (error) {
        console.info(
          "[audio] Forme d'onde de secours utilisée :",
          error
        );
        return getFallbackWaveformPeaks();
      } finally {
        if (audioContext && typeof audioContext.close === "function") {
          audioContext.close().catch(() => {});
        }
      }
    })();

    waveformCache.set(cacheKey, waveformPromise);
    if (waveformCache.size > 30) {
      waveformCache.delete(waveformCache.keys().next().value);
    }
    return waveformPromise;
  }

  function drawWaveform(canvas) {
    if (!canvas || !canvas.isConnected) {
      return;
    }

    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width * pixelRatio));
    const height = Math.max(1, Math.round(bounds.height * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const context = canvas.getContext("2d");
    const peaks = canvas.waveformPeaks || getFallbackWaveformPeaks();
    const progress = Math.max(
      0,
      Math.min(1, Number(canvas.waveformProgress) || 0)
    );
    const styles = window.getComputedStyle(canvas);
    const idleColor =
      styles.getPropertyValue("--waveform-idle").trim() || "#77718f";
    const activeColor =
      styles.getPropertyValue("--waveform-active").trim() || "#a997ff";
    const activeEndColor =
      styles.getPropertyValue("--waveform-active-end").trim() || "#55d6be";
    const activeGradient = context.createLinearGradient(0, 0, width, 0);
    activeGradient.addColorStop(0, activeColor);
    activeGradient.addColorStop(1, activeEndColor);
    const gap = Math.max(1, Math.round(2 * pixelRatio));
    const barWidth = Math.max(
      1,
      (width - gap * (peaks.length - 1)) / peaks.length
    );

    context.clearRect(0, 0, width, height);
    peaks.forEach((peak, index) => {
      const x = index * (barWidth + gap);
      const barHeight = Math.max(
        3 * pixelRatio,
        peak * height * 0.78
      );
      const y = (height - barHeight) / 2;
      const barProgress = (index + 0.5) / peaks.length;
      context.fillStyle =
        barProgress <= progress ? activeGradient : idleColor;
      if (typeof context.roundRect === "function") {
        context.beginPath();
        context.roundRect(
          x,
          y,
          barWidth,
          barHeight,
          Math.min(barWidth / 2, 2 * pixelRatio)
        );
        context.fill();
      } else {
        context.fillRect(x, y, barWidth, barHeight);
      }
    });
  }

  function updateWaveformProgress(canvas, progress) {
    if (!canvas) {
      return;
    }
    canvas.waveformProgress = progress;
    drawWaveform(canvas);
  }

  function updateAudioProgressUi(range, waveform, playhead, progress) {
    const normalizedProgress = Math.max(
      0,
      Math.min(1, Number(progress) || 0)
    );
    range.value = String(Math.round(normalizedProgress * 1000));
    syncRangeProgress(range);
    updateWaveformProgress(waveform, normalizedProgress);
    if (playhead) {
      playhead.style.setProperty(
        "--audio-playhead-position",
        `${normalizedProgress * 100}%`
      );
    }
  }

  function clearWaveform(canvas) {
    if (!canvas) {
      return;
    }
    canvas.waveformRequestKey = null;
    canvas.waveformPeaks = getFallbackWaveformPeaks();
    canvas.waveformProgress = 0;
    drawWaveform(canvas);
  }

  function drawRecordingSpectrum(session) {
    const spectrum = session && session.spectrum;
    const canvas = elements.audioRecordingSpectrum;
    if (!spectrum || !canvas || !canvas.isConnected) {
      return;
    }

    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width * pixelRatio));
    const height = Math.max(1, Math.round(bounds.height * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    spectrum.analyser.getByteFrequencyData(spectrum.data);

    const context = canvas.getContext("2d");
    const styles = window.getComputedStyle(canvas);
    const idleColor =
      styles.getPropertyValue("--waveform-idle").trim() || "#77718f";
    const activeColor =
      styles.getPropertyValue("--waveform-active").trim() || "#f8f8f2";
    const activeEndColor =
      styles.getPropertyValue("--waveform-active-end").trim() || "#34ff6d";
    const barCount = Math.min(48, spectrum.data.length);
    const gap = Math.max(1, Math.round(2 * pixelRatio));
    const barWidth = Math.max(
      2 * pixelRatio,
      (width - gap * (barCount - 1)) / barCount
    );
    const gradient = context.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, idleColor);
    gradient.addColorStop(0.55, activeColor);
    gradient.addColorStop(1, activeEndColor);

    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(248, 248, 242, 0.08)";
    context.fillRect(0, Math.round(height * 0.5), width, 1 * pixelRatio);

    for (let index = 0; index < barCount; index += 1) {
      const binStart = Math.floor((index / barCount) * spectrum.data.length);
      const binEnd = Math.max(
        binStart + 1,
        Math.floor(((index + 1) / barCount) * spectrum.data.length)
      );
      let level = 0;
      for (let bin = binStart; bin < binEnd; bin += 1) {
        level = Math.max(level, spectrum.data[bin]);
      }
      const normalizedLevel = Math.max(0.04, level / 255);
      const barHeight = Math.max(
        3 * pixelRatio,
        normalizedLevel * height * 0.9
      );
      const x = index * (barWidth + gap);
      const y = height - barHeight;
      context.fillStyle = gradient;
      if (typeof context.roundRect === "function") {
        context.beginPath();
        context.roundRect(
          x,
          y,
          barWidth,
          barHeight,
          Math.min(barWidth / 2, 3 * pixelRatio)
        );
        context.fill();
      } else {
        context.fillRect(x, y, barWidth, barHeight);
      }
    }
  }

  function startRecordingSpectrum(session) {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;
    if (!session || !session.stream || !AudioContextClass) {
      return;
    }

    try {
      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      const source = audioContext.createMediaStreamSource(session.stream);
      source.connect(analyser);
      session.spectrum = {
        audioContext,
        analyser,
        source,
        data: new Uint8Array(analyser.frequencyBinCount),
        frame: null
      };
      elements.audioRecordingSpectrum.classList.remove("hidden");

      const animateSpectrum = () => {
        if (recordingSession !== session || !session.spectrum) {
          return;
        }
        drawRecordingSpectrum(session);
        session.spectrum.frame =
          window.requestAnimationFrame(animateSpectrum);
      };
      animateSpectrum();
    } catch (error) {
      console.info("[audio] Spectre live indisponible :", error);
    }
  }

  function stopRecordingSpectrum(session) {
    const spectrum = session && session.spectrum;
    if (spectrum) {
      if (spectrum.frame !== null) {
        window.cancelAnimationFrame(spectrum.frame);
      }
      try {
        spectrum.source.disconnect();
      } catch {}
      if (
        spectrum.audioContext &&
        typeof spectrum.audioContext.close === "function"
      ) {
        spectrum.audioContext.close().catch(() => {});
      }
      session.spectrum = null;
    }

    const canvas = elements.audioRecordingSpectrum;
    if (canvas) {
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, canvas.width, canvas.height);
      canvas.classList.add("hidden");
    }
  }

  function prepareWaveform(canvas, source) {
    if (!canvas) {
      return;
    }

    const requestKey = getWaveformCacheKey(source || "");
    canvas.waveformRequestKey = requestKey;
    canvas.waveformPeaks = getFallbackWaveformPeaks();
    canvas.waveformProgress = 0;
    window.requestAnimationFrame(() => drawWaveform(canvas));

    decodeWaveformPeaks(source).then((peaks) => {
      if (
        canvas.isConnected &&
        canvas.waveformRequestKey === requestKey
      ) {
        canvas.waveformPeaks = peaks;
        drawWaveform(canvas);
      }
    });
  }

  function redrawWaveforms() {
    document.querySelectorAll(".audio-waveform").forEach(drawWaveform);
  }

  function scheduleWaveformRedraw() {
    if (waveformResizeFrame) {
      window.cancelAnimationFrame(waveformResizeFrame);
    }
    waveformResizeFrame = window.requestAnimationFrame(() => {
      waveformResizeFrame = null;
      redrawWaveforms();
    });
  }

  function saveAudioSettings() {
    try {
      window.localStorage.setItem(
        AUDIO_VOLUME_STORAGE_KEY,
        String(audioVolume)
      );
      window.localStorage.setItem(
        EFFECTS_VOLUME_STORAGE_KEY,
        String(effectsVolume)
      );
      window.localStorage.setItem(MUTED_STORAGE_KEY, String(siteMuted));
    } catch (error) {
      console.warn("[paramètres] Sauvegarde du volume impossible :", error);
    }
  }

  function updateAudioSettingsUi() {
    const audioPercentage = Math.round(audioVolume * 100);
    const effectsPercentage = Math.round(effectsVolume * 100);
    elements.volumeSlider.value = String(audioPercentage);
    syncRangeProgress(elements.volumeSlider);
    elements.volumeValue.textContent = `${audioPercentage} %`;
    elements.effectsVolumeSlider.value = String(effectsPercentage);
    syncRangeProgress(elements.effectsVolumeSlider);
    elements.effectsVolumeValue.textContent = `${effectsPercentage} %`;
    elements.muteButton.setAttribute("aria-pressed", String(siteMuted));
    elements.muteButton.setAttribute(
      "aria-label",
      siteMuted ? "Réactiver le son" : "Couper le son"
    );
    elements.muteIconUse.setAttribute(
      "href",
      siteMuted ? "#icon-muted" : "#icon-volume"
    );
    elements.muteButton.classList.toggle("danger-control", siteMuted);
    applyVolumeToAllAudio();
  }

  function loadAudioSettings() {
    try {
      const storedAudioVolume =
        window.localStorage.getItem(AUDIO_VOLUME_STORAGE_KEY) ??
        window.localStorage.getItem(LEGACY_VOLUME_STORAGE_KEY);
      audioVolume = window.GameClientUtils.normalizeVolume(
        storedAudioVolume,
        1
      );
      effectsVolume = window.GameClientUtils.normalizeVolume(
        window.localStorage.getItem(EFFECTS_VOLUME_STORAGE_KEY),
        0.85
      );
      siteMuted = window.localStorage.getItem(MUTED_STORAGE_KEY) === "true";
    } catch (error) {
      console.warn("[paramètres] Lecture du volume impossible :", error);
      audioVolume = 1;
      effectsVolume = 0.85;
      siteMuted = false;
    }

    updateAudioSettingsUi();
  }

  function setSiteVolume(volume) {
    audioVolume = window.GameClientUtils.normalizeVolume(volume, audioVolume);
    if (audioVolume > 0 && siteMuted) {
      siteMuted = false;
    }
    saveAudioSettings();
    updateAudioSettingsUi();
  }

  function setEffectsVolume(volume) {
    effectsVolume = window.GameClientUtils.normalizeVolume(
      volume,
      effectsVolume
    );
    if (effectsVolume > 0 && siteMuted) {
      siteMuted = false;
    }
    saveAudioSettings();
    updateAudioSettingsUi();
  }

  function getEffectsAudioContext() {
    if (!effectsUnlocked) {
      return null;
    }
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }

    if (!effectsAudioContext) {
      effectsAudioContext = new AudioContextClass();
    }
    if (effectsAudioContext.state === "suspended") {
      effectsAudioContext.resume().catch(() => {});
    }
    return effectsAudioContext;
  }

  function playSynthTone({
    frequency,
    endFrequency = frequency,
    duration = 0.08,
    gain = 0.08,
    type = "sine",
    delay = 0
  }) {
    if (siteMuted || effectsVolume <= 0) {
      return;
    }

    const context = getEffectsAudioContext();
    if (!context) {
      return;
    }

    const startAt = context.currentTime + delay;
    const endAt = startAt + duration;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const outputGain = Math.max(0.0001, gain * effectsVolume);
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(20, endFrequency),
      endAt
    );
    envelope.gain.setValueAtTime(0.0001, startAt);
    envelope.gain.linearRampToValueAtTime(
      outputGain,
      startAt + Math.min(0.014, duration / 4)
    );
    envelope.gain.setValueAtTime(outputGain, Math.max(startAt, endAt - 0.025));
    envelope.gain.exponentialRampToValueAtTime(0.0001, endAt);
    oscillator.connect(envelope);
    envelope.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(endAt + 0.02);
  }

  function playSoundEffect(name, intensity = 1) {
    const strength = Math.max(0.05, Math.min(1, intensity));
    const effects = {
      click: () =>
        playSynthTone({
          frequency: 520,
          endFrequency: 660,
          duration: 0.055,
          gain: 0.07,
          type: "sine"
        }),
      soft: () =>
        playSynthTone({
          frequency: 360,
          endFrequency: 430,
          duration: 0.08,
          gain: 0.06,
          type: "triangle"
        }),
      select: () => {
        playSynthTone({
          frequency: 460,
          endFrequency: 620,
          duration: 0.07,
          gain: 0.07,
          type: "triangle"
        });
        playSynthTone({
          frequency: 920,
          endFrequency: 760,
          duration: 0.08,
          gain: 0.045,
          type: "sine",
          delay: 0.045
        });
      },
      open: () => {
        playSynthTone({
          frequency: 280,
          endFrequency: 520,
          duration: 0.09,
          gain: 0.06,
          type: "triangle"
        });
        playSynthTone({
          frequency: 560,
          endFrequency: 700,
          duration: 0.08,
          gain: 0.045,
          type: "sine",
          delay: 0.05
        });
      },
      confirm: () => {
        playSynthTone({
          frequency: 520,
          endFrequency: 680,
          duration: 0.09,
          gain: 0.08,
          type: "triangle"
        });
        playSynthTone({
          frequency: 720,
          endFrequency: 920,
          duration: 0.12,
          gain: 0.065,
          type: "sine",
          delay: 0.055
        });
      },
      navigate: () =>
        playSynthTone({
          frequency: 420,
          endFrequency: 760,
          duration: 0.11,
          gain: 0.075,
          type: "triangle"
        }),
      danger: () =>
        playSynthTone({
          frequency: 220,
          endFrequency: 120,
          duration: 0.16,
          gain: 0.09,
          type: "sawtooth"
        }),
      reveal: () => {
        playSynthTone({
          frequency: 330,
          endFrequency: 660,
          duration: 0.16,
          gain: 0.07,
          type: "triangle"
        });
        playSynthTone({
          frequency: 660,
          endFrequency: 990,
          duration: 0.18,
          gain: 0.06,
          type: "sine",
          delay: 0.09
        });
      },
      round: () => {
        playSynthTone({
          frequency: 260,
          endFrequency: 520,
          duration: 0.22,
          gain: 0.08,
          type: "triangle"
        });
        playSynthTone({
          frequency: 520,
          endFrequency: 780,
          duration: 0.2,
          gain: 0.06,
          type: "sine",
          delay: 0.12
        });
      },
      tick: () => {
        playSynthTone({
          frequency: 245 - strength * 25,
          endFrequency: 175 - strength * 15,
          duration: 0.055,
          gain: 0.014 + Math.pow(strength, 2) * 0.026,
          type: "triangle"
        });
        playSynthTone({
          frequency: 130 - strength * 10,
          endFrequency: 95,
          duration: 0.045,
          gain: 0.006 + strength * 0.01,
          type: "sine",
          delay: 0.026
        });
      }
    };

    (effects[name] || effects.click)();
  }

  function getInteractionSound(element) {
    if (!element) {
      return "click";
    }
    if (element.classList.contains("game-tile")) {
      return element.classList.contains("active") ? "soft" : "select";
    }
    if (element.classList.contains("settings-choice")) {
      const input = element.querySelector("input");
      return input && input.checked ? "confirm" : "select";
    }
    if (
      element instanceof HTMLInputElement &&
      (element.type === "range" || element.type === "checkbox")
    ) {
      return "soft";
    }
    if (
      element.classList.contains("danger-control") ||
      element.classList.contains("audio-delete-button") ||
      element.classList.contains("paint-action-danger")
    ) {
      return "danger";
    }
    if (
      element.id === "previous-chain-button" ||
      element.id === "next-chain-button" ||
      element.id === "toggle-code-button"
    ) {
      return "navigate";
    }
    if (
      element.classList.contains("button-primary") ||
      element.id === "join-button" ||
      element.id === "copy-button" ||
      element.id === "chat-send-button"
    ) {
      return "confirm";
    }
    if (
      element.id === "settings-button" ||
      element.id === "chat-toggle-button" ||
      element.classList.contains("game-tile-settings") ||
      element.id === "close-settings-button" ||
      element.id === "close-game-settings-button" ||
      element.id === "chat-close-button"
    ) {
      return "open";
    }
    return "click";
  }

  function applyTheme(theme) {
    siteTheme = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = siteTheme;
    const darkModeEnabled = siteTheme === "dark";
    elements.themeToggle.setAttribute(
      "aria-pressed",
      String(darkModeEnabled)
    );
    elements.themeToggle.setAttribute(
      "aria-label",
      darkModeEnabled ? "Désactiver le mode sombre" : "Activer le mode sombre"
    );
    elements.themeIconUse.setAttribute(
      "href",
      darkModeEnabled ? "#icon-moon" : "#icon-sun"
    );
    window.requestAnimationFrame(redrawWaveforms);
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

  function getSelectedGameSettingsButton() {
    const selectedGameId = getSelectedRoomGameId(currentRoom);
    return elements.gameSettingsButtons.find(
      (button) => button.dataset.gameSettingsId === selectedGameId
    ) || null;
  }

  function setGameSettingsOpen(isOpen) {
    const wasOpen = !elements.gameSettingsModal.classList.contains("hidden");
    const canOpen =
      Boolean(
        currentRoom &&
          socket &&
          currentRoom.hostId === socket.id &&
          currentRoom.phase === "lobby"
      );
    elements.gameSettingsModal.classList.toggle(
      "hidden",
      !isOpen || !canOpen
    );
    if (isOpen && canOpen) {
      elements.closeGameSettingsButton.focus();
    } else if (wasOpen && canOpen) {
      const button = getSelectedGameSettingsButton();
      if (button) {
        button.focus();
      }
    }
  }

  function setSidebarVisible(isVisible) {
    elements.playersSidebar.classList.toggle("hidden", !isVisible);
    elements.chatSidebar.classList.toggle("hidden", !isVisible);
    elements.chatToggleButton.classList.toggle("hidden", !isVisible);
    elements.playLayout.classList.toggle("with-sidebar", isVisible);
    if (!isVisible) {
      setChatOpen(false);
    }
  }

  function setChatOpen(isOpen) {
    chatOpen = Boolean(isOpen);
    elements.chatSidebar.classList.toggle("mobile-open", chatOpen);
    elements.chatToggleButton.setAttribute(
      "aria-expanded",
      String(chatOpen)
    );
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
    setSidebarVisible(view !== elements.homeView);
  }

  function setHomeBusy(isBusy) {
    elements.createButton.disabled = isBusy;
    elements.joinButton.disabled = isBusy;
    elements.nickname.disabled = isBusy;
    elements.roomName.disabled = isBusy;
    elements.roomCodeInput.disabled = isBusy;
    elements.avatarButtons.forEach((button) => {
      button.disabled = isBusy;
    });
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
    lastTimerSoundSlot = null;
  }

  function stopRoundIntro() {
    if (introTimeout) {
      window.clearTimeout(introTimeout);
      introTimeout = null;
    }
    if (introInterval) {
      window.clearInterval(introInterval);
      introInterval = null;
    }
    if (introAudioElement) {
      introAudioElement.pause();
    }
    elements.roundIntro.classList.add("hidden");
    elements.gameStartCountdown.classList.add("hidden");
    elements.roundPreview.classList.add("hidden");
    elements.closeRoundPreviewButton.classList.add("hidden");
    elements.introAudioPlayButton.classList.add("hidden");
    introRoundKey = null;
    introAudioElement = null;
  }

  function showHome() {
    stopTimer();
    stopRoundIntro();
    cancelDraftSave();
    stopAudioRecording(true);
    currentRoom = null;
    currentGame = null;
    shouldRejoin = false;
    renderedRoundKey = null;
    roundPreviousAudio = null;
    codeVisible = false;
    renderedPlayerListSignature = "";
    setGameSettingsOpen(false);
    updateRoomCodeInUrl("");
    showOnly(elements.homeView);
    setConnectionState(Boolean(socket && socket.connected), "Connecté");
  }

  function getPlayerListSignature(room) {
    if (!room || !Array.isArray(room.players)) {
      return "";
    }

    return [
      room.code,
      room.name,
      ...room.players.map((player) =>
        [
          player.id,
          player.nickname,
          player.avatarId,
          player.isHost ? "host" : "guest",
          player.status || "ready"
        ].join(":")
      )
    ].join("|");
  }

  function renderPlayerList(room) {
    const signature = getPlayerListSignature(room);
    if (signature && signature === renderedPlayerListSignature) {
      return;
    }
    renderedPlayerListSignature = signature;

    elements.playerList.replaceChildren();
    elements.playersSidebarTitle.textContent =
      room.name || "naab.fun room";

    room.players.forEach((player) => {
      const item = document.createElement("li");
      const avatar = document.createElement("div");
      const copy = document.createElement("div");
      const nameLine = document.createElement("div");
      const name = document.createElement("span");
      const status = document.createElement("span");

      item.className = "player-row";
      item.classList.toggle(
        "is-self",
        Boolean(socket && player.id === socket.id)
      );
      avatar.className = "player-avatar";
      renderAvatarVisual(avatar, player.avatarId);
      avatar.setAttribute("aria-hidden", "true");
      copy.className = "player-copy";
      nameLine.className = "player-name-line";
      name.className = "player-name";
      name.textContent = player.nickname;
      nameLine.append(name);
      status.className =
        `player-state status-${player.status || "ready"}`;
      status.textContent =
        PLAYER_STATUS_LABELS[player.status] || PLAYER_STATUS_LABELS.ready;
      copy.append(nameLine, status);
      item.append(avatar, copy);

      if (player.isHost) {
        const badge = document.createElement("span");
        badge.className = "host-badge";
        badge.textContent = "H";
        badge.title = "Hôte";
        item.append(badge);
      }

      elements.playerList.append(item);
    });
  }

  function createChatMessageElement(message) {
    const item = document.createElement("li");
    const author = document.createElement("div");
    const avatar = document.createElement("span");
    const nickname = document.createElement("span");
    const content = document.createElement("p");

    item.className = "chat-item";
    item.dataset.messageId = message.id;
    item.classList.toggle("is-self", message.nickname === currentNickname);
    author.className = "chat-author";
    avatar.className = "chat-author-avatar";
    renderAvatarVisual(avatar, message.avatarId);
    nickname.textContent = message.nickname;
    content.className = "chat-content";
    content.textContent = message.content;
    author.append(avatar, nickname);
    item.append(author, content);
    return item;
  }

  function trimChatToFit() {
    const empty = elements.chatMessages.querySelector(".chat-empty");
    if (empty) {
      return;
    }

    while (
      elements.chatMessages.children.length > 1 &&
      elements.chatMessages.scrollHeight >
        elements.chatMessages.clientHeight
    ) {
      elements.chatMessages.firstElementChild.remove();
    }
  }

  function renderChatMessages(messages) {
    const visibleIds = Array.from(
      elements.chatMessages.querySelectorAll(".chat-item")
    ).map((item) => item.dataset.messageId);
    const incomingIds = (messages || []).map((message) => message.id);
    if (
      visibleIds.length > 0 &&
      visibleIds.every(
        (id, index) =>
          id === incomingIds[incomingIds.length - visibleIds.length + index]
      )
    ) {
      return;
    }

    elements.chatMessages.replaceChildren();
    if (!messages || messages.length === 0) {
      const empty = document.createElement("li");
      empty.className = "chat-empty";
      empty.textContent =
        "Le chat est vide. Quelqu'un doit prendre une mauvaise décision.";
      elements.chatMessages.append(empty);
      return;
    }

    messages.forEach((message) => {
      elements.chatMessages.append(createChatMessageElement(message));
    });
    window.requestAnimationFrame(trimChatToFit);
  }

  function appendChatMessage(message) {
    const empty = elements.chatMessages.querySelector(".chat-empty");
    if (empty) {
      empty.remove();
    }
    if (
      elements.chatMessages.querySelector(
        `[data-message-id="${CSS.escape(message.id)}"]`
      )
    ) {
      return;
    }
    elements.chatMessages.append(createChatMessageElement(message));
    window.requestAnimationFrame(trimChatToFit);
  }

  function renderRoomCode() {
    if (!currentRoom) {
      return;
    }

    elements.roomTitle.textContent = codeVisible
      ? currentRoom.code
      : "*".repeat(currentRoom.code.length);
    elements.toggleCodeButton.setAttribute(
      "aria-pressed",
      String(codeVisible)
    );
    elements.toggleCodeButton.setAttribute(
      "aria-label",
      codeVisible ? "Masquer le code" : "Afficher le code"
    );
    elements.codeIconUse.setAttribute(
      "href",
      codeVisible ? "#icon-eye-off" : "#icon-eye"
    );
  }

  function getRoomGameRoundLimit(room) {
    if (!room) {
      return 1;
    }

    if (getSelectedRoomGameId(room) === "leagueOfNaabs") {
      return Math.max(1, Math.min(5, room.playerCount - 1));
    }

    return Math.max(1, room.playerCount);
  }

  function populateRoundCountInput(room) {
    const roundLimit = getRoomGameRoundLimit(room);
    const effectiveRoundCount = Math.min(
      room.settings.effectiveRoundCount || roundLimit,
      roundLimit
    );
    elements.roundCountInput.max = String(roundLimit);
    elements.roundCountInput.value = String(effectiveRoundCount);
    elements.roundCountHelp.textContent =
      room.settings.roundCount === null
        ? `Automatique : ${effectiveRoundCount} manche${effectiveRoundCount > 1 ? "s" : ""}.`
        : `Maximum actuel : ${roundLimit}.`;
  }

  function getSelectedRoomGameId(room) {
    return (
      room &&
      room.gameSelection &&
      ROOM_GAMES[room.gameSelection.selectedGameId]
        ? room.gameSelection.selectedGameId
        : DEFAULT_ROOM_GAME_ID
    );
  }

  function getRoomGameLabel(room) {
    const selection = room && room.gameSelection;
    if (selection && selection.selectedGameName) {
      return selection.selectedGameName;
    }
    return ROOM_GAMES[getSelectedRoomGameId(room)].name;
  }

  function getResolvedRoomGameLabel(room) {
    const selection = room && room.gameSelection;
    if (selection && selection.resolvedGameName) {
      return selection.resolvedGameName;
    }
    return ROOM_GAMES[getSelectedRoomGameId(room)].resolvedName;
  }

  function createRoomGameSelection(gameId) {
    const selectedGame = ROOM_GAMES[gameId] || ROOM_GAMES[DEFAULT_ROOM_GAME_ID];
    const resolvedGame = selectedGame.resolvedId
      ? ROOM_GAMES[selectedGame.resolvedId] || selectedGame
      : null;

    return {
      selectedGameId: selectedGame.id,
      selectedGameName: selectedGame.name,
      resolvedGameId: resolvedGame ? resolvedGame.id : null,
      resolvedGameName: resolvedGame ? resolvedGame.name : null
    };
  }

  function getCurrentRoomPlayer(room) {
    if (!socket || !room || !Array.isArray(room.players)) {
      return null;
    }

    return room.players.find((player) => player.id === socket.id) || null;
  }

  function isCurrentUserRoomHost() {
    return Boolean(socket && currentRoom && currentRoom.hostId === socket.id);
  }

  function getGameVotes(room, gameId) {
    const votes = room && room.gameVotes && room.gameVotes[gameId];
    return Array.isArray(votes) ? votes : [];
  }

  function getCurrentGameVoteId(room) {
    if (!socket || !room || !room.gameVotes) {
      return null;
    }

    return Object.entries(room.gameVotes).reduce(
      (currentVoteId, [gameId, votes]) => {
        if (currentVoteId || !Array.isArray(votes)) {
          return currentVoteId;
        }

        return votes.some((vote) => vote.playerId === socket.id)
          ? gameId
          : null;
      },
      null
    );
  }

  function createRoomGameVotesWithCurrentVote(room, gameId) {
    const player = getCurrentRoomPlayer(room);
    const nextVotes = {};

    Object.entries((room && room.gameVotes) || {}).forEach(
      ([voteGameId, votes]) => {
        const filteredVotes = Array.isArray(votes)
          ? votes.filter((vote) => !player || vote.playerId !== player.id)
          : [];
        if (filteredVotes.length > 0) {
          nextVotes[voteGameId] = filteredVotes;
        }
      }
    );

    if (player && !player.isHost && ROOM_GAMES[gameId]) {
      nextVotes[gameId] = [
        ...(nextVotes[gameId] || []),
        {
          playerId: player.id,
          nickname: player.nickname,
          avatarId: player.avatarId || currentAvatarId
        }
      ];
    }

    return nextVotes;
  }

  function renderGameVotes(button, votes) {
    const previousStack = button.querySelector(".game-vote-stack");
    if (previousStack) {
      previousStack.remove();
    }

    button.classList.toggle("has-votes", votes.length > 0);
    button.classList.toggle(
      "has-self-vote",
      Boolean(socket && votes.some((vote) => vote.playerId === socket.id))
    );

    if (votes.length === 0) {
      return;
    }

    const stack = document.createElement("span");
    const visibleVotes = votes.slice(0, 5);
    stack.className = "game-vote-stack";
    stack.title =
      `Votes : ${votes.map((vote) => vote.nickname).join(", ")}`;
    stack.setAttribute(
      "aria-label",
      `${votes.length} vote${votes.length > 1 ? "s" : ""}`
    );

    visibleVotes.forEach((vote) => {
      const avatar = document.createElement("span");
      avatar.className = "game-vote-avatar";
      renderAvatarVisual(avatar, vote.avatarId);
      avatar.title = vote.nickname;
      stack.append(avatar);
    });

    if (votes.length > visibleVotes.length) {
      const extra = document.createElement("span");
      extra.className = "game-vote-avatar game-vote-extra";
      extra.textContent = `+${votes.length - visibleVotes.length}`;
      stack.append(extra);
    }

    button.append(stack);
  }

  function renderGameSelection(room) {
    const selectedGameId = getSelectedRoomGameId(room);
    const selectedLabel = getRoomGameLabel(room);

    elements.selectedGameName.textContent = selectedLabel;

    elements.gameSelectionButtons.forEach((button) => {
      const isSelected = button.dataset.gameId === selectedGameId;
      const votes = getGameVotes(room, button.dataset.gameId);
      const settingsButton = button.querySelector(".game-tile-settings");
      const settingsVisible = Boolean(
        socket && room.hostId === socket.id && room.phase === "lobby" && isSelected
      );
      const hasSelfVote = Boolean(
        socket && votes.some((vote) => vote.playerId === socket.id)
      );
      button.classList.toggle("active", isSelected);
      button.classList.toggle("settings-visible", settingsVisible);
      button.classList.toggle(
        "self-voted-only",
        Boolean(socket && room.hostId !== socket.id && hasSelfVote && !isSelected)
      );
      button.setAttribute("aria-pressed", String(isSelected));
      button.setAttribute(
        "aria-disabled",
        String(!room || room.phase !== "lobby")
      );
      button.tabIndex = room && room.phase === "lobby" ? 0 : -1;
      if (settingsButton) {
        settingsButton.classList.toggle("hidden", !settingsVisible);
      }
      renderGameVotes(button, votes);
    });
  }

  function renderRoomLobbyState(room, options = {}) {
    const preserveSelectionBackdrop = Boolean(
      options.preserveSelectionBackdrop
    );
    if (!preserveSelectionBackdrop) {
      renderGameSelection(room);
    }
    const isHost = Boolean(socket && room.hostId === socket.id);
    renderGameSettings(room, isHost);
    elements.startGameButton.classList.toggle("hidden", !isHost);
    elements.startGameButton.disabled =
      !isHost || room.playerCount < room.minPlayersToStart;
  }

  function renderGameSettings(room, isHost) {
    const selectedGameId = getSelectedRoomGameId(room);
    const selectedInputTypes = Array.isArray(room.settings.inputTypes)
      ? room.settings.inputTypes
      : CONTRIBUTION_TYPES.slice(0, room.settings.inputTypeCount || 3);
    populateRoundCountInput(room);
    elements.inputTypeCheckboxes.forEach((checkbox) => {
      checkbox.checked = selectedInputTypes.includes(checkbox.value);
    });
    elements.partyGameCountInput.value = String(
      room.settings.partyGameCount || 3
    );
    const enabledGameIds = Array.isArray(room.settings.enabledGameIds)
      ? room.settings.enabledGameIds
      : ["kamoulox3000", "leagueOfNaabs"];
    elements.partyGameCheckboxes.forEach((checkbox) => {
      checkbox.checked = enabledGameIds.includes(checkbox.value);
    });
    elements.inputTypesSettings.classList.toggle(
      "hidden",
      selectedGameId === "leagueOfNaabs"
    );
    elements.partySettings.classList.toggle(
      "hidden",
      selectedGameId !== "party"
    );
    if (!isHost) {
      setGameSettingsOpen(false);
    }
    elements.gameSettingsTitle.textContent =
      `Réglages de ${getRoomGameLabel(room)}`;
  }

  function showRoom(room) {
    const roomChanged = !currentRoom || currentRoom.code !== room.code;
    const shouldKeepGameSettingsOpen =
      !elements.gameSettingsModal.classList.contains("hidden") &&
      socket &&
      room.hostId === socket.id &&
      room.phase === "lobby";
    currentRoom = room;
    currentGame = null;
    renderedRoundKey = null;
    stopTimer();
    stopRoundIntro();
    cancelDraftSave();
    stopAudioRecording(true);
    if (!shouldKeepGameSettingsOpen) {
      setGameSettingsOpen(false);
    }

    if (roomChanged) {
      codeVisible = false;
    }
    updateRoomCodeInUrl(room.code);
    renderRoomCode();
    elements.playerCount.textContent =
      `${room.playerCount} / ${room.maxPlayers}`;
    renderPlayerList(room);
    renderChatMessages(room.chatMessages);
    renderRoomLobbyState(room, {
      preserveSelectionBackdrop: shouldKeepGameSettingsOpen
    });

    showOnly(elements.roomView);
    setConnectionState(Boolean(socket && socket.connected), "Connecté");
  }

  function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  async function loadAppVersion() {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      VERSION_REQUEST_TIMEOUT_MS
    );

    try {
      console.info(`[version] GET ${versionUrl}`);
      const response = await fetch(versionUrl, {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = await response.json();
      if (!body || typeof body.display !== "string") {
        throw new Error("Réponse de version invalide.");
      }

      elements.appVersion.textContent = body.display;
      elements.appVersion.title = `Version déployée : ${body.display}`;
    } catch (error) {
      console.info("[version] Version distante indisponible :", error);
    } finally {
      window.clearTimeout(timeout);
    }
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

  function isHealthNetworkError(error) {
    return Boolean(error && error.name === "HealthNetworkError");
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
            if (isHealthNetworkError(lastError)) {
              finish({
                ok: false,
                error: lastError,
                healthProbeBlocked: true
              });
              return;
            }

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
          nickname: currentNickname,
          avatarId: currentAvatarId
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
      let displayedRoom = room;
      if (room.phase === "lobby") {
        if (pendingRoomGameId) {
          displayedRoom = {
            ...displayedRoom,
            gameSelection: createRoomGameSelection(pendingRoomGameId)
          };
        }
        if (pendingRoomGameVoteId) {
          displayedRoom = {
            ...displayedRoom,
            gameVotes: createRoomGameVotesWithCurrentVote(
              displayedRoom,
              pendingRoomGameVoteId
            )
          };
        }
      }
      currentRoom = displayedRoom;
      if (displayedRoom.phase === "lobby") {
        showRoom(displayedRoom);
      } else {
        elements.playerCount.textContent =
          `${displayedRoom.playerCount} / ${displayedRoom.maxPlayers}`;
        renderPlayerList(displayedRoom);
        renderChatMessages(displayedRoom.chatMessages);
        setSidebarVisible(true);
        if (!currentGame) {
          setMessage(elements.roomMessage, "La partie démarre...");
        }
      }
    });

    socket.on("gameState", (gameState) => {
      if (gameState.phase === "results") {
        showResults(gameState);
      } else {
        showGame(gameState);
      }
    });

    socket.on("chatMessage", (message) => {
      if (!currentRoom || !message) {
        return;
      }

      const messages = Array.isArray(currentRoom.chatMessages)
        ? currentRoom.chatMessages
        : [];
      if (!messages.some((candidate) => candidate.id === message.id)) {
        messages.push(message);
      }
      currentRoom.chatMessages = messages.slice(-20);
      appendChatMessage(message);
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

  function validateRoomName(roomName) {
    const length = Array.from(roomName).length;
    return length >= 2 && length <= 30;
  }

  async function runPendingAction() {
    if (!pendingAction || actionRunning) {
      return;
    }

    actionRunning = true;
    setMessage(elements.homeMessage, "");

    const healthResult = await wakeServer();
    const healthProbeBlocked = Boolean(healthResult.healthProbeBlocked);
    if (!healthResult.ok && !healthProbeBlocked) {
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

    loadAppVersion();

    try {
      if (healthProbeBlocked) {
        console.warn(
          "[health] Health check bloqué, tentative Socket.IO directe.",
          healthResult.error
        );
        setMessage(
          elements.homeMessage,
          "Le health check semble bloqué. Connexion directe à la room..."
        );
      } else {
        setMessage(elements.homeMessage, "Serveur disponible. Connexion...");
      }
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
      const ownPlayer = response.room.players.find(
        (player) => socket && player.id === socket.id
      );
      currentAvatarId =
        (ownPlayer && ownPlayer.avatarId) || action.payload.avatarId;
      shouldRejoin = false;
      pendingAction = null;

      if (response.room.phase === "lobby") {
        showRoom(response.room);
      } else {
        setMessage(elements.homeMessage, "Reconnexion à la partie...");
      }
    } catch (error) {
      console.error("[jeu] Action impossible :", error);
      const detail =
        healthProbeBlocked && healthResult.error
          ? `${error.message} Le navigateur ou une extension bloque aussi peut-être ${serverUrl}.`
          : error.message;
      setMessage(elements.homeMessage, detail, "error");
    } finally {
      actionRunning = false;
      setHomeBusy(false);
    }
  }

  function prepareAction(type) {
    const requestedNickname = elements.nickname.value.trim();
    const nickname = requestedNickname || createDefaultNickname();
    let roomName = elements.roomName.value.trim().replace(/\s+/g, " ");
    const roomCode = normalizeRoomCodeInput(elements.roomCodeInput.value);

    if (!requestedNickname) {
      elements.nickname.value = nickname;
    }
    if (type === "create" && !roomName) {
      roomName = DEFAULT_ROOM_NAME;
      elements.roomName.value = roomName;
    }

    if (!validateNickname(nickname)) {
      setMessage(
        elements.homeMessage,
        "Le pseudonyme doit contenir entre 2 et 20 caractères.",
        "error"
      );
      elements.nickname.focus();
      return;
    }

    if (type === "create" && !validateRoomName(roomName)) {
      setMessage(
        elements.homeMessage,
        "Le nom de la room doit contenir entre 2 et 30 caractères.",
        "error"
      );
      elements.roomName.focus();
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
          ? { nickname, roomName, avatarId: currentAvatarId }
          : { nickname, code: roomCode, avatarId: currentAvatarId }
    };
    runPendingAction();
  }

  function selectAvatar(avatarId) {
    if (!AVATARS[avatarId]) {
      return;
    }

    currentAvatarId = avatarId;
    elements.avatarButtons.forEach((button) => {
      const selected = button.dataset.avatar === avatarId;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-checked", String(selected));
    });
  }

  async function sendChatMessage() {
    const content = elements.chatInput.value.trim();
    if (!content || !currentRoom || !socket) {
      return;
    }

    elements.chatInput.disabled = true;
    elements.chatSendButton.disabled = true;
    setMessage(elements.chatMessage, "");
    try {
      const response = await emitWithAcknowledgment("sendChatMessage", {
        content
      });
      if (!response || !response.ok) {
        throw new Error(
          (response && response.error) || "Message refusé."
        );
      }
      elements.chatInput.value = "";
    } catch (error) {
      setMessage(elements.chatMessage, error.message, "error");
    } finally {
      elements.chatInput.disabled = false;
      elements.chatSendButton.disabled = false;
      elements.chatInput.focus();
    }
  }

  async function selectRoomGame(gameId) {
    if (!currentRoom || !socket || !ROOM_GAMES[gameId]) {
      return;
    }
    if (getSelectedRoomGameId(currentRoom) === gameId) {
      return;
    }

    const requestId = roomGameSelectionRequestId + 1;
    roomGameSelectionRequestId = requestId;
    pendingRoomGameId = gameId;
    const previousSelection = currentRoom.gameSelection;
    currentRoom.gameSelection = createRoomGameSelection(gameId);
    renderRoomLobbyState(currentRoom);
    setMessage(elements.roomMessage, "");

    try {
      const response = await emitWithAcknowledgment("selectRoomGame", {
        gameId
      });
      if (!response || !response.ok) {
        throw new Error(
          (response && response.error) || "Sélection refusée."
        );
      }
      if (requestId !== roomGameSelectionRequestId) {
        return;
      }
      pendingRoomGameId = null;
      currentRoom.gameSelection = response.gameSelection;
      if (response.settings) {
        currentRoom.settings = response.settings;
      }
      renderRoomLobbyState(currentRoom);
      setMessage(elements.roomMessage, "");
    } catch (error) {
      if (requestId !== roomGameSelectionRequestId) {
        return;
      }
      pendingRoomGameId = null;
      setMessage(elements.roomMessage, error.message, "error");
      if (currentRoom) {
        currentRoom.gameSelection = previousSelection;
        renderRoomLobbyState(currentRoom);
      }
    }
  }

  async function voteRoomGame(gameId) {
    if (!currentRoom || !socket || !ROOM_GAMES[gameId]) {
      return;
    }
    if (currentRoom.hostId === socket.id) {
      await selectRoomGame(gameId);
      return;
    }
    if (getCurrentGameVoteId(currentRoom) === gameId) {
      return;
    }

    const requestId = roomGameVoteRequestId + 1;
    roomGameVoteRequestId = requestId;
    pendingRoomGameVoteId = gameId;
    const previousVotes = currentRoom.gameVotes;
    currentRoom.gameVotes = createRoomGameVotesWithCurrentVote(
      currentRoom,
      gameId
    );
    renderRoomLobbyState(currentRoom);
    setMessage(elements.roomMessage, "");

    try {
      const response = await emitWithAcknowledgment("voteRoomGame", {
        gameId
      });
      if (!response || !response.ok) {
        throw new Error(
          (response && response.error) || "Vote refusé par le grand conseil."
        );
      }
      if (requestId !== roomGameVoteRequestId) {
        return;
      }
      pendingRoomGameVoteId = null;
      currentRoom.gameVotes = response.gameVotes;
      renderRoomLobbyState(currentRoom);
      setMessage(elements.roomMessage, "");
    } catch (error) {
      if (requestId !== roomGameVoteRequestId) {
        return;
      }
      pendingRoomGameVoteId = null;
      setMessage(elements.roomMessage, error.message, "error");
      if (currentRoom) {
        currentRoom.gameVotes = previousVotes;
        renderRoomLobbyState(currentRoom);
      }
    }
  }

  function handleRoomGameClick(gameId) {
    if (!currentRoom || !socket) {
      return;
    }

    if (currentRoom.hostId === socket.id) {
      selectRoomGame(gameId);
      return;
    }

    voteRoomGame(gameId);
  }

  function handleNumberStepperClick(button) {
    const input = document.getElementById(button.dataset.stepperTarget);
    if (!(input instanceof HTMLInputElement) || input.disabled) {
      return;
    }

    const rawDelta = Number(button.dataset.stepperDelta);
    const delta = Number.isFinite(rawDelta) ? rawDelta : 0;
    const step = Number(input.step) || 1;
    const min = input.min === "" ? -Infinity : Number(input.min);
    const max = input.max === "" ? Infinity : Number(input.max);
    const currentValue = Number(input.value);
    const fallbackValue = Number.isFinite(min) ? min : 0;
    const nextValue = Math.min(
      max,
      Math.max(
        min,
        (Number.isFinite(currentValue) ? currentValue : fallbackValue) +
          delta * step
      )
    );

    input.value = String(nextValue);
    input.focus();
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function updateRoomSettings() {
    if (!currentRoom || !socket || currentRoom.hostId !== socket.id) {
      return;
    }

    const inputTypes = elements.inputTypeCheckboxes
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => checkbox.value);
    const enabledGameIds = elements.partyGameCheckboxes
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => checkbox.value);
    const payload = {
      gameId: getSelectedRoomGameId(currentRoom),
      roundCount: Number(elements.roundCountInput.value),
      inputTypes,
      partyGameCount: Number(elements.partyGameCountInput.value),
      enabledGameIds
    };

    const settingControls = [
      elements.roundCountInput,
      elements.partyGameCountInput,
      ...elements.inputTypeCheckboxes,
      ...elements.partyGameCheckboxes
    ];
    const settingsModalOpen =
      !elements.gameSettingsModal.classList.contains("hidden");
    settingControls.forEach((control) => {
      control.disabled = true;
    });
    if (!settingsModalOpen) {
      setMessage(elements.roomMessage, "Réglages envoyés au laboratoire...");
    }

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
      if (currentRoom && response.settings) {
        currentRoom.settings = response.settings;
        renderRoomLobbyState(currentRoom, {
          preserveSelectionBackdrop:
            !elements.gameSettingsModal.classList.contains("hidden")
        });
      }
      if (!settingsModalOpen) {
        setMessage(elements.roomMessage, "");
      }
    } catch (error) {
      setMessage(elements.roomMessage, error.message, "error");
      if (currentRoom) {
        renderGameSettings(currentRoom, true);
      }
    } finally {
      settingControls.forEach((control) => {
        control.disabled = false;
      });
    }
  }

  function cancelDraftSave() {
    draftSaveGeneration += 1;
    lastDraftSaveAt = 0;
    if (draftSaveTimer) {
      window.clearTimeout(draftSaveTimer);
      draftSaveTimer = null;
    }
  }

  function sendDraft(type, content, roundIndex) {
    if (
      !socket ||
      !socket.connected ||
      !currentGame ||
      currentGame.submitted ||
      currentGame.roundIndex !== roundIndex
    ) {
      return;
    }

    socket.emit(
      "saveDraft",
      { roundIndex, type, content },
      (response) => {
        if (
          response &&
          !response.ok &&
          currentGame &&
          currentGame.roundIndex === roundIndex
        ) {
          console.warn("[draft] Brouillon refusé :", response.error);
        }
      }
    );
  }

  function buildCurrentDraft() {
    if (!currentGame || currentGame.submitted) {
      return null;
    }

    if (selectedType === "text") {
      if (isSpellKitStep()) {
        const spells = elements.spellInputs.map((input) => input.value.trim());
        return {
          type: "text",
          content: spells.some(Boolean) ? JSON.stringify({ spells }) : ""
        };
      }

      return {
        type: "text",
        content: elements.textContribution.value
      };
    }

    if (selectedType === "drawing") {
      return {
        type: "drawing",
        content: drawingDirty
          ? elements.drawingCanvas.toDataURL("image/png")
          : ""
      };
    }

    if (isQuotePackStep()) {
      return {
        type: "audio",
        content: hasAnyQuoteAudio() ? buildQuotePackContent() : ""
      };
    }

    return { type: "audio", content: audioDataUrl };
  }

  function flushDraftSave() {
    if (draftSaveTimer) {
      window.clearTimeout(draftSaveTimer);
      draftSaveTimer = null;
    }

    const draft = buildCurrentDraft();
    if (draft && currentGame) {
      lastDraftSaveAt = Date.now();
      sendDraft(draft.type, draft.content, currentGame.roundIndex);
    }
  }

  function scheduleDraftSave(delay = DRAFT_SAVE_DEBOUNCE_MS) {
    if (!currentGame || currentGame.submitted) {
      return;
    }

    const generation = draftSaveGeneration;
    const remainingDelay = Math.max(
      0,
      delay - (Date.now() - lastDraftSaveAt)
    );
    if (remainingDelay === 0) {
      flushDraftSave();
      return;
    }
    if (draftSaveTimer) {
      return;
    }
    draftSaveTimer = window.setTimeout(() => {
      draftSaveTimer = null;
      if (generation === draftSaveGeneration) {
        flushDraftSave();
      }
    }, remainingDelay);
  }

  async function saveAudioSessionDraft(session) {
    if (
      !session ||
      session.discard ||
      session.draftEncoding ||
      session.chunks.length === 0 ||
      !currentGame ||
      currentGame.roundIndex !== session.roundIndex
    ) {
      return;
    }

    session.draftEncoding = true;
    try {
      const blob = new Blob(session.chunks, {
        type: session.recorder.mimeType || "audio/webm"
      });
      const dataUrl = await readBlobAsDataUrl(blob);
      if (dataUrl.length <= MAX_AUDIO_DATA_LENGTH) {
        sendDraft("audio", dataUrl, session.roundIndex);
      }
    } catch (error) {
      console.info("[draft] Fragment audio non sauvegardé :", error);
    } finally {
      session.draftEncoding = false;
    }
  }

  function scheduleAudioSessionDraft(session) {
    if (!session || session.draftTimer) {
      return;
    }

    session.draftTimer = window.setTimeout(() => {
      session.draftTimer = null;
      saveAudioSessionDraft(session);
    }, AUDIO_DRAFT_SAVE_INTERVAL_MS);
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
    scheduleDraftSave(DRAWING_DRAFT_SAVE_DEBOUNCE_MS);
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
    scheduleDraftSave(DRAWING_DRAFT_SAVE_DEBOUNCE_MS);
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
      drawingDirty = true;
      scheduleDraftSave(DRAWING_DRAFT_SAVE_DEBOUNCE_MS);
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
    drawingDirty = true;
    scheduleDraftSave(DRAWING_DRAFT_SAVE_DEBOUNCE_MS);
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

  function isLeagueOfNaabsGame(value) {
    return value && value.gameId === "leagueOfNaabs";
  }

  function getCurrentStepKey() {
    return (
      currentGame &&
      currentGame.assignment &&
      currentGame.assignment.step &&
      currentGame.assignment.step.key
    );
  }

  function isSpellKitStep() {
    return isLeagueOfNaabsGame(currentGame) && getCurrentStepKey() === "spell-kit";
  }

  function isQuotePackStep() {
    return isLeagueOfNaabsGame(currentGame) && getCurrentStepKey() === "quote-pack";
  }

  function parseJsonPayload(content, fallback) {
    try {
      const parsed = JSON.parse(content);
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function parseSpellKit(content) {
    const parsed = parseJsonPayload(content, null);
    const spells =
      parsed && Array.isArray(parsed.spells)
        ? parsed.spells.map((spell) =>
            typeof spell === "string" ? spell : ""
          )
        : [];
    while (spells.length < 4) {
      spells.push("");
    }
    return spells.slice(0, 4);
  }

  function parseQuotePack(content) {
    const parsed = parseJsonPayload(content, null);
    const quotes =
      parsed && Array.isArray(parsed.quotes)
        ? parsed.quotes.map((quote) =>
            typeof quote === "string" ? quote : ""
          )
        : [];
    while (quotes.length < 4) {
      quotes.push("");
    }
    return quotes.slice(0, 4);
  }

  function buildQuotePackContent() {
    return JSON.stringify({ quotes: audioQuoteDataUrls });
  }

  function hasAnyQuoteAudio() {
    return audioQuoteDataUrls.some(Boolean);
  }

  function hasAllQuoteAudios() {
    return audioQuoteDataUrls.every(Boolean);
  }

  function renderPlayerReferenceText(element, text, playerName) {
    element.replaceChildren();
    if (!playerName || !text.includes(playerName)) {
      element.textContent = text;
      return;
    }

    const parts = text.split(playerName);
    parts.forEach((part, index) => {
      if (part) {
        element.append(document.createTextNode(part));
      }
      if (index < parts.length - 1) {
        const highlight = document.createElement("span");
        highlight.className = "player-reference";
        highlight.textContent = playerName;
        element.append(highlight);
      }
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
    if (recordingSession.draftTimer) {
      window.clearTimeout(recordingSession.draftTimer);
      recordingSession.draftTimer = null;
    }
    stopRecordingSpectrum(recordingSession);
    if (recordingSession.recorder.state !== "inactive") {
      recordingSession.recorder.stop();
    } else {
      stopStream(recordingSession.stream);
      recordingSession = null;
    }
  }

  function updateQuoteAudioSlots() {
    const quotePack = isQuotePackStep();
    elements.quoteAudioSlots.classList.toggle("hidden", !quotePack);
    elements.quoteAudioSlotButtons.forEach((button, index) => {
      const recorded = Boolean(audioQuoteDataUrls[index]);
      button.classList.toggle("active", index === activeAudioQuoteIndex);
      button.classList.toggle("recorded", recorded);
      button.setAttribute("aria-pressed", String(index === activeAudioQuoteIndex));
      button.title = recorded
        ? `Réplique ${index + 1} enregistrée`
        : `Réplique ${index + 1} à enregistrer`;
    });

    if (quotePack) {
      elements.validateAudioButton.disabled = !hasAllQuoteAudios();
    }
  }

  function showAudioSlotPreview(dataUrl) {
    audioDataUrl = dataUrl || "";
    stopRecordedAudioTimelineAnimation();
    elements.audioPreview.pause();
    elements.audioPreview.currentTime = 0;
    elements.audioPreview.removeAttribute("src");

    if (!audioDataUrl) {
      elements.audioPreview.load();
      elements.audioEmptyState.classList.remove("hidden");
      elements.audioReadyState.classList.add("hidden");
      updateAudioProgressUi(
        elements.audioProgress,
        elements.audioWaveform,
        elements.audioPlayhead,
        0
      );
      clearWaveform(elements.audioWaveform);
      elements.audioCurrentTime.textContent = "00:00";
      elements.audioDuration.textContent = "00:00";
      return;
    }

    elements.audioPreview.src = audioDataUrl;
    applyVolumeToAudio(elements.audioPreview);
    showRecordedAudio();
    elements.audioPreview.load();
  }

  function selectAudioQuoteSlot(index) {
    activeAudioQuoteIndex = Math.max(0, Math.min(3, Number(index) || 0));
    showAudioSlotPreview(audioQuoteDataUrls[activeAudioQuoteIndex]);
    updateQuoteAudioSlots();
  }

  function resetAudio(clearQuotePack = true) {
    audioStartRequestId += 1;
    stopAudioRecording(true);
    stopRecordingSpectrum(recordingSession);
    stopRecordedAudioTimelineAnimation();
    if (isQuotePackStep()) {
      if (clearQuotePack) {
        audioQuoteDataUrls = ["", "", "", ""];
        activeAudioQuoteIndex = 0;
      } else {
        audioQuoteDataUrls[activeAudioQuoteIndex] = "";
      }
    }
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
      isQuotePackStep()
        ? `Réplique ${activeAudioQuoteIndex + 1} de 5 secondes`
        : "Enregistrer pendant 5 secondes";
    elements.audioPlayIconUse.setAttribute("href", "#icon-play");
    elements.playAudioButton.setAttribute(
      "aria-label",
      "Lire l'enregistrement"
    );
    updateAudioProgressUi(
      elements.audioProgress,
      elements.audioWaveform,
      elements.audioPlayhead,
      0
    );
    clearWaveform(elements.audioWaveform);
    elements.audioCurrentTime.textContent = "00:00";
    elements.audioDuration.textContent = "00:00";
    updateQuoteAudioSlots();
  }

  function showRecordedAudio() {
    elements.audioEmptyState.classList.add("hidden");
    elements.audioReadyState.classList.remove("hidden");
    updateAudioProgressUi(
      elements.audioProgress,
      elements.audioWaveform,
      elements.audioPlayhead,
      0
    );
    elements.audioCurrentTime.textContent = "00:00";
    elements.audioPlayIconUse.setAttribute("href", "#icon-play");
    applyVolumeToAudio(elements.audioPreview);
    prepareWaveform(elements.audioWaveform, audioDataUrl);
  }

  function updateAudioTimeline() {
    const duration = Number.isFinite(elements.audioPreview.duration)
      ? elements.audioPreview.duration
      : 0;
    const currentTime = Number.isFinite(elements.audioPreview.currentTime)
      ? elements.audioPreview.currentTime
      : 0;
    updateAudioProgressUi(
      elements.audioProgress,
      elements.audioWaveform,
      elements.audioPlayhead,
      duration ? currentTime / duration : 0
    );
    elements.audioCurrentTime.textContent =
      window.GameClientUtils.formatTime(currentTime);
    elements.audioDuration.textContent =
      window.GameClientUtils.formatTime(duration);
  }

  function stopRecordedAudioTimelineAnimation() {
    if (recordedAudioTimelineFrame !== null) {
      window.cancelAnimationFrame(recordedAudioTimelineFrame);
      recordedAudioTimelineFrame = null;
    }
  }

  function startRecordedAudioTimelineAnimation() {
    stopRecordedAudioTimelineAnimation();

    function animateTimeline() {
      updateAudioTimeline();
      if (!elements.audioPreview.paused && !elements.audioPreview.ended) {
        recordedAudioTimelineFrame =
          window.requestAnimationFrame(animateTimeline);
      } else {
        recordedAudioTimelineFrame = null;
      }
    }

    recordedAudioTimelineFrame =
      window.requestAnimationFrame(animateTimeline);
  }

  function updateAudioPlayButton() {
    const isPlaying = !elements.audioPreview.paused;
    elements.audioPlayIconUse.setAttribute(
      "href",
      isPlaying ? "#icon-pause" : "#icon-play"
    );
    elements.playAudioButton.setAttribute(
      "aria-label",
      isPlaying ? "Mettre en pause" : "Lire l'enregistrement"
    );
    elements.playAudioButton
      .closest(".audio-player-card")
      .classList.toggle("is-playing", isPlaying);
  }

  async function toggleRecordedAudioPlayback() {
    try {
      if (elements.audioPreview.paused) {
        applyVolumeToAudio(elements.audioPreview);
        pauseOtherAudio(elements.audioPreview);
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
      isQuotePackStep()
        ? `Réplique ${activeAudioQuoteIndex + 1}... ${Math.max(0, remainingSeconds)} s`
        : `Fais du bruit... ${Math.max(0, remainingSeconds)} s`;
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
      resetAudio(!isQuotePackStep());
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
        autoStopTimer: null,
        draftTimer: null,
        draftEncoding: false,
        spectrum: null
      };
      recordingSession = session;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          session.chunks.push(event.data);
          scheduleAudioSessionDraft(session);
        }
      });

      recorder.addEventListener("stop", async () => {
        if (session.draftTimer) {
          window.clearTimeout(session.draftTimer);
          session.draftTimer = null;
        }
        stopRecordingSpectrum(session);
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

          if (isQuotePackStep()) {
            audioQuoteDataUrls[activeAudioQuoteIndex] = dataUrl;
            audioDataUrl = dataUrl;
            sendDraft("audio", buildQuotePackContent(), session.roundIndex);
            updateQuoteAudioSlots();
          } else {
            audioDataUrl = dataUrl;
            sendDraft("audio", dataUrl, session.roundIndex);
          }
          showAudioSlotPreview(dataUrl);
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
      startRecordingSpectrum(session);
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
    updateQuoteAudioSlots();
  }

  function createSvgIcon(symbolId) {
    const namespace = "http://www.w3.org/2000/svg";
    const icon = document.createElementNS(namespace, "svg");
    const use = document.createElementNS(namespace, "use");
    icon.classList.add("icon");
    use.setAttribute("href", `#${symbolId}`);
    icon.append(use);
    return { icon, use };
  }

  function createAudioPlayer(source, compact = false) {
    const player = document.createElement("div");
    const playButton = document.createElement("button");
    const playIcon = createSvgIcon("icon-play");
    const timeline = document.createElement("div");
    const waveformShell = document.createElement("div");
    const waveform = document.createElement("canvas");
    const playhead = document.createElement("span");
    const progress = document.createElement("input");
    const timeRow = document.createElement("div");
    const currentTime = document.createElement("span");
    const duration = document.createElement("span");
    const audio = document.createElement("audio");

    player.className =
      `audio-player-card custom-audio-player${compact ? " compact" : ""}`;
    playButton.className = "audio-play-button";
    playButton.type = "button";
    playButton.setAttribute("aria-label", "Lire le son");
    playButton.append(playIcon.icon);

    timeline.className = "audio-timeline";
    waveformShell.className = "audio-waveform-shell";
    waveform.className = "audio-waveform";
    waveform.setAttribute("aria-hidden", "true");
    playhead.className = "audio-playhead";
    playhead.setAttribute("aria-hidden", "true");
    progress.className = "game-range audio-progress";
    progress.type = "range";
    progress.min = "0";
    progress.max = "1000";
    progress.value = "0";
    progress.setAttribute("aria-label", "Progression audio");
    waveformShell.append(waveform, playhead, progress);

    timeRow.className = "audio-time-row";
    currentTime.textContent = "00:00";
    duration.textContent = "00:00";
    timeRow.append(currentTime, duration);
    timeline.append(waveformShell, timeRow);

    audio.className = "hidden";
    audio.src = source;
    audio.preload = "metadata";
    applyVolumeToAudio(audio);
    player.append(playButton, timeline, audio);
    syncRangeProgress(progress);
    prepareWaveform(waveform, source);
    updateAudioProgressUi(progress, waveform, playhead, 0);
    let timelineAnimationFrame = null;

    function updatePlayerTimeline() {
      const totalDuration = Number.isFinite(audio.duration)
        ? audio.duration
        : 0;
      const elapsed = Number.isFinite(audio.currentTime)
        ? audio.currentTime
        : 0;
      const ratio = totalDuration ? elapsed / totalDuration : 0;
      updateAudioProgressUi(progress, waveform, playhead, ratio);
      currentTime.textContent =
        window.GameClientUtils.formatTime(elapsed);
      duration.textContent =
        window.GameClientUtils.formatTime(totalDuration);
    }

    function stopTimelineAnimation() {
      if (timelineAnimationFrame !== null) {
        window.cancelAnimationFrame(timelineAnimationFrame);
        timelineAnimationFrame = null;
      }
    }

    function startTimelineAnimation() {
      stopTimelineAnimation();

      function animateTimeline() {
        updatePlayerTimeline();
        if (
          audio.isConnected &&
          !audio.paused &&
          !audio.ended
        ) {
          timelineAnimationFrame =
            window.requestAnimationFrame(animateTimeline);
        } else {
          timelineAnimationFrame = null;
        }
      }

      timelineAnimationFrame =
        window.requestAnimationFrame(animateTimeline);
    }

    function updatePlayerButton() {
      const isPlaying = !audio.paused;
      playIcon.use.setAttribute(
        "href",
        isPlaying ? "#icon-pause" : "#icon-play"
      );
      playButton.setAttribute(
        "aria-label",
        isPlaying ? "Mettre le son en pause" : "Lire le son"
      );
      player.classList.toggle("is-playing", isPlaying);
    }

    playButton.addEventListener("click", async () => {
      try {
        if (audio.paused) {
          applyVolumeToAudio(audio);
          pauseOtherAudio(audio);
          await audio.play();
        } else {
          audio.pause();
        }
      } catch (error) {
        console.error("[audio] Lecture impossible :", error);
        setMessage(
          elements.gameMessage,
          `Lecture audio impossible : ${error.message}`,
          "error"
        );
      }
    });
    progress.addEventListener("input", () => {
      const totalDuration = audio.duration;
      if (Number.isFinite(totalDuration) && totalDuration > 0) {
        audio.currentTime =
          (Number(progress.value) / 1000) * totalDuration;
      }
      syncRangeProgress(progress);
      updatePlayerTimeline();
    });
    audio.addEventListener("loadedmetadata", updatePlayerTimeline);
    audio.addEventListener("timeupdate", updatePlayerTimeline);
    audio.addEventListener("play", () => {
      updatePlayerButton();
      startTimelineAnimation();
    });
    audio.addEventListener("pause", () => {
      stopTimelineAnimation();
      updatePlayerTimeline();
      updatePlayerButton();
    });
    audio.addEventListener("ended", () => {
      stopTimelineAnimation();
      audio.currentTime = 0;
      updatePlayerTimeline();
      updatePlayerButton();
    });

    return { element: player, audio, playButton };
  }

  function createSpellKitView(content) {
    const spellLabels = ["01", "02", "03", "04"];
    const spellNames = ["Sort 1", "Sort 2", "Sort 3", "Ulti"];
    const spells = parseSpellKit(content);
    const list = document.createElement("div");
    list.className = "spell-kit-view";

    spells.forEach((spell, index) => {
      const item = document.createElement("article");
      const badge = document.createElement("span");
      const body = document.createElement("div");
      const title = document.createElement("strong");
      const text = document.createElement("p");

      item.className = "spell-kit-view-item";
      if (index === 3) {
        item.classList.add("ultimate");
      }
      badge.className = "spell-kit-view-badge";
      badge.textContent = spellLabels[index];
      title.textContent = spellNames[index];
      text.textContent = spell || "Sort avalé par le brouillard.";
      body.append(title, text);
      item.append(badge, body);
      list.append(item);
    });

    return list;
  }

  function createQuotePackView(content, compact = true) {
    const quotes = parseQuotePack(content);
    const wrapper = document.createElement("div");
    const audioPlayers = [];
    wrapper.className = "quote-pack-view";

    quotes.forEach((source, index) => {
      const row = document.createElement("article");
      const badge = document.createElement("span");
      row.className = "quote-pack-row";
      badge.className = "quote-pack-badge";
      badge.textContent = String(index + 1).padStart(2, "0");
      row.append(badge);

      if (source) {
        const audioPlayer = createAudioPlayer(source, compact);
        audioPlayers.push(audioPlayer);
        row.append(audioPlayer.element);
      } else {
        const empty = document.createElement("p");
        empty.className = "empty-contribution";
        empty.textContent = "Réplique perdue dans le lobby.";
        row.append(empty);
      }

      wrapper.append(row);
    });

    return { element: wrapper, audioPlayers };
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
      if (contribution.stepKey === "spell-kit") {
        container.append(createSpellKitView(contribution.content));
        return null;
      }

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

    if (contribution.stepKey === "quote-pack") {
      const quotePack = createQuotePackView(contribution.content);
      container.append(quotePack.element);
      return quotePack.audioPlayers[0] && quotePack.audioPlayers[0].audio;
    }

    const audioPlayer = createAudioPlayer(contribution.content);
    container.append(audioPlayer.element);
    return audioPlayer.audio;
  }

  function resetRoundEditors() {
    cancelDraftSave();
    stopAudioRecording(true);
    elements.textContribution.value = "";
    elements.spellInputs.forEach((input) => {
      input.value = "";
    });
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
      if (remaining > 0 && remaining <= 10000) {
        const tickInterval =
          remaining <= 2500 ? 250 : remaining <= 5000 ? 500 : 1000;
        const tickSlot = `${tickInterval}:${Math.floor(
          serverTime / tickInterval
        )}`;
        if (tickSlot !== lastTimerSoundSlot) {
          lastTimerSoundSlot = tickSlot;
          const urgency = Math.pow(1 - remaining / 10000, 2);
          playSoundEffect("tick", 0.12 + urgency * 0.88);
        }
      }

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
    if (
      gameState.gameId === "leagueOfNaabs" &&
      gameState.assignment &&
      gameState.assignment.prompt
    ) {
      return gameState.assignment.prompt;
    }

    const expectedType = gameState.assignment.expectedType;
    const hasPrevious = Boolean(
      gameState.assignment.previousContribution
    );
    if (expectedType === "audio") {
      return hasPrevious
        ? "Transforme ce que tu as reçu en bruit. La dignité est optionnelle."
        : "Tu ouvres le bal avec cinq secondes de bruit parfaitement assumé.";
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

  function getAssignmentStep(gameState) {
    return gameState && gameState.assignment && gameState.assignment.step
      ? gameState.assignment.step
      : null;
  }

  function applyEditorCopy(gameState) {
    const step = getAssignmentStep(gameState);
    const isLeagueOfNaabs = gameState.gameId === "leagueOfNaabs";
    const spellKit = step && step.key === "spell-kit";
    const quotePack = step && step.key === "quote-pack";

    elements.textEditorLabel.textContent =
      (step && step.inputLabel) ||
      (isLeagueOfNaabs ? "Fiche de champion" : "Votre prose immortelle");
    elements.textContribution.classList.toggle("hidden", spellKit);
    elements.spellKitEditor.classList.toggle("hidden", !spellKit);
    elements.textCounter.classList.toggle("hidden", spellKit);
    elements.textContribution.placeholder =
      (step && step.placeholder) ||
      (isLeagueOfNaabs
        ? "Écris une idée qui passera difficilement l'équilibrage..."
        : "Écrivez quelque chose que les autres pourront mal comprendre...");
    elements.drawingEditorLabel.textContent =
      isLeagueOfNaabs ? "Croquis du champion" : "Votre œuvre assumée";
    elements.recordButtonLabel.textContent =
      quotePack
        ? `Réplique ${activeAudioQuoteIndex + 1} de 5 secondes`
        : isLeagueOfNaabs
          ? "Réplique de 5 secondes"
          : "5 secondes de bruit";
    updateQuoteAudioSlots();
  }

  async function autoplayPreviewAudio(previousAudio) {
    if (!previousAudio) {
      return;
    }

    try {
      applyVolumeToAudio(previousAudio);
      previousAudio.currentTime = 0;
      pauseOtherAudio(previousAudio);
      await previousAudio.play();
    } catch (error) {
      console.info("[audio] Autoplay bloqué, bouton affiché :", error);
      introAudioElement = previousAudio;
      elements.introAudioPlayButton.classList.remove("hidden");
    }
  }

  function setGameWorkspaceVisible(isVisible) {
    elements.gameView.classList.toggle("intro-active", !isVisible);
    elements.gameStage.setAttribute("aria-hidden", String(!isVisible));
  }

  function showGameCountdown(gameState) {
    currentGame = gameState;
    renderedRoundKey = null;
    stopTimer();
    stopRoundIntro();
    showOnly(elements.gameView);
    setGameWorkspaceVisible(false);
    elements.roundIntro.classList.remove("hidden");
    elements.gameStartCountdown.classList.remove("hidden");
    const serverOffset = gameState.serverNow - Date.now();

    function updateCountdown() {
      const remaining =
        gameState.countdownEndsAt - (Date.now() + serverOffset);
      const seconds = Math.max(1, Math.ceil(remaining / 1000));
      elements.gameStartCountdownValue.textContent =
        remaining <= 0 ? "GO !" : String(seconds);
    }

    updateCountdown();
    introInterval = window.setInterval(updateCountdown, 100);
  }

  function finishRoundPreview(roundKey) {
    if (introRoundKey !== roundKey) {
      return;
    }

    stopRoundIntro();
    setGameWorkspaceVisible(true);
    if (currentGame && currentGame.phase === "playing") {
      startRoundTimer(currentGame);
    }
  }

  function showRoundPreview(
    roundKey,
    gameState,
    previousContribution,
    previousAudio,
    durationMs = null
  ) {
    const hasAutomaticClose =
      Number.isFinite(durationMs) && durationMs > 0;
    stopRoundIntro();
    introRoundKey = roundKey;
    introAudioElement = previousAudio;
    renderPlayerReferenceText(
      elements.roundIntroText,
      getHumorousPrompt(gameState),
      gameState.assignment && gameState.assignment.targetNickname
    );
    elements.previousPanel.classList.toggle(
      "hidden",
      !previousContribution
    );
    elements.roundPreview.classList.toggle(
      "no-previous",
      !previousContribution
    );
    elements.roundIntro.classList.remove("hidden");
    elements.roundPreview.classList.remove("hidden");
    elements.roundPreviewCountdown.classList.toggle(
      "hidden",
      !hasAutomaticClose
    );
    elements.closeRoundPreviewButton.classList.toggle(
      "hidden",
      hasAutomaticClose
    );
    elements.introAudioPlayButton.classList.add("hidden");
    setGameWorkspaceVisible(false);

    if (hasAutomaticClose) {
      const previewStartedAt = Date.now();
      function updatePreviewCountdown() {
        const remaining = Math.max(
          0,
          durationMs - (Date.now() - previewStartedAt)
        );
        elements.roundPreviewCountdown.textContent =
          `Mémorise bien : ${Math.max(1, Math.ceil(remaining / 1000))} s`;
      }

      updatePreviewCountdown();
      introInterval = window.setInterval(updatePreviewCountdown, 200);
      introTimeout = window.setTimeout(() => {
        introTimeout = null;
        finishRoundPreview(roundKey);
      }, durationMs);
    }
    autoplayPreviewAudio(previousAudio);
  }

  function showGame(gameState) {
    if (gameState.phase === "countdown") {
      showGameCountdown(gameState);
      return;
    }

    const roundKey = `${gameState.roomCode}:${gameState.roundIndex}`;
    const isNewRound = renderedRoundKey !== roundKey;
    currentGame = gameState;

    if (isNewRound) {
      renderedRoundKey = roundKey;
      resetRoundEditors();
      selectedType = gameState.assignment.expectedType || "text";
      playSoundEffect("round");
    }

    showOnly(elements.gameView);
    elements.roundLabel.textContent =
      `Manche ${gameState.roundNumber} / ${gameState.totalRounds}`;
    applyEditorCopy(gameState);
    renderPlayerReferenceText(
      elements.gamePrompt,
      getHumorousPrompt(gameState),
      gameState.assignment && gameState.assignment.targetNickname
    );

    const previous = gameState.assignment.previousContribution;
    const hasPrevious = Boolean(previous);
    elements.replayPreviousButton.classList.toggle("hidden", !hasPrevious);
    let previousAudio = null;
    if (isNewRound) {
      if (hasPrevious) {
        previousAudio = renderContribution(elements.previousContent, previous);
      } else {
        elements.previousContent.replaceChildren();
      }
      roundPreviousAudio = previousAudio;
    }

    elements.typePicker.classList.add("hidden");
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
    const serverTime = Date.now() + (gameState.serverNow - Date.now());
    const previewRemaining = Math.max(
      0,
      gameState.previewEndsAt - serverTime
    );

    if (isNewRound && previewRemaining > 0) {
      showRoundPreview(
        roundKey,
        gameState,
        previous,
        previousAudio,
        previewRemaining
      );
    } else if (!introRoundKey) {
      stopRoundIntro();
      setGameWorkspaceVisible(true);
      startRoundTimer(gameState);
    }
  }

  function buildContributionPayload() {
    if (!currentGame) {
      throw new Error("Aucune manche n'est en cours.");
    }

    if (selectedType === "text") {
      if (isSpellKitStep()) {
        const spells = elements.spellInputs.map((input) => input.value.trim());
        if (spells.some((spell) => !spell)) {
          throw new Error("Remplis les 3 sorts et l'ulti avant de valider.");
        }
        return {
          type: "text",
          content: JSON.stringify({ spells })
        };
      }

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
        "L'enregistrement de 5 secondes doit se terminer avant de valider."
      );
    }

    if (isQuotePackStep()) {
      if (!hasAllQuoteAudios()) {
        throw new Error("Enregistrez les 4 répliques avant de valider.");
      }
      return { type: "audio", content: buildQuotePackContent() };
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

      cancelDraftSave();
      setMessage(elements.gameMessage, "");
    } catch (error) {
      console.error("[jeu] Contribution impossible :", error);
      setMessage(elements.gameMessage, error.message, "error");
      elements.submitContributionButton.disabled = false;
      elements.validateAudioButton.disabled = false;
    }
  }

  function renderResultContribution(contribution, index, isCurrent) {
    const item = document.createElement("li");
    const meta = document.createElement("div");
    const player = document.createElement("span");
    const badge = document.createElement("span");
    const content = document.createElement("div");

    item.className = "result-item";
    if (!contribution.empty && contribution.type) {
      item.classList.add(`result-type-${contribution.type}`);
    }
    item.classList.toggle("current-reveal", isCurrent);
    meta.className = "result-meta";
    player.className = "result-player";
    player.textContent = `${index + 1}. ${contribution.nickname}`;
    badge.className = "type-badge";
    badge.textContent =
      contribution.stepLabel ||
      CONTRIBUTION_STEP_LABELS[contribution.stepKey] ||
      TYPE_LABELS[contribution.type] ||
      contribution.type;
    meta.append(player, badge);
    item.append(meta);

    let audioPlayer = null;
    if (contribution.empty) {
      const empty = document.createElement("p");
      empty.className = "empty-contribution";
      empty.textContent = "Aucune contribution.";
      content.append(empty);
    } else if (contribution.type === "text") {
      if (contribution.stepKey === "spell-kit") {
        content.append(createSpellKitView(contribution.content));
      } else {
        const text = document.createElement("p");
        text.className = "result-text";
        text.textContent = contribution.content;
        content.append(text);
      }
    } else if (contribution.type === "drawing") {
      const image = document.createElement("img");
      image.className = "result-image";
      image.src = contribution.content;
      image.alt = `Dessin de ${contribution.nickname}`;
      content.append(image);
    } else if (contribution.stepKey === "quote-pack") {
      const quotePack = createQuotePackView(contribution.content, true);
      audioPlayer = quotePack.audioPlayers[0] || null;
      content.append(quotePack.element);
    } else {
      audioPlayer = createAudioPlayer(contribution.content, true);
      content.append(audioPlayer.element);
    }

    item.append(content);
    return { element: item, audioPlayer };
  }

  async function autoplayRevealedAudio(audioPlayer) {
    if (!audioPlayer) {
      return;
    }

    try {
      applyVolumeToAudio(audioPlayer.audio);
      audioPlayer.audio.currentTime = 0;
      pauseOtherAudio(audioPlayer.audio);
      await audioPlayer.audio.play();
      audioPlayer.element.classList.remove("autoplay-blocked");
    } catch (error) {
      console.info("[résumé] Autoplay audio bloqué :", error);
      audioPlayer.element.classList.add("autoplay-blocked");
      audioPlayer.playButton.setAttribute(
        "aria-label",
        "Lire le son révélé"
      );
    }
  }

  function scrollToCurrentResult(resultElement) {
    if (!resultElement) {
      return;
    }

    window.requestAnimationFrame(() => {
      const container = elements.resultContributions;
      const maximumScroll = Math.max(
        0,
        container.scrollHeight - container.clientHeight
      );
      const centeredPosition =
        resultElement.offsetTop -
        Math.max(12, (container.clientHeight - resultElement.offsetHeight) / 2);
      const targetTop = Math.max(
        0,
        Math.min(maximumScroll, centeredPosition)
      );
      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

      container.scrollTo({
        top: targetTop,
        behavior: prefersReducedMotion ? "auto" : "smooth"
      });
    });
  }

  function getResultStepCountForChain(chain) {
    if (currentGame && currentGame.gameId === "leagueOfNaabs") {
      return 11;
    }

    return chain ? chain.contributions.length : 0;
  }

  function findContributionByStep(chain, stepKey) {
    return chain.contributions.find(
      (contribution) => contribution.stepKey === stepKey
    ) || null;
  }

  function appendRevealParagraph(parent, text, playerName, className = "") {
    const paragraph = document.createElement("p");
    paragraph.className = className || "league-reveal-text";
    renderPlayerReferenceText(paragraph, text, playerName);
    parent.append(paragraph);
    return paragraph;
  }

  function appendEmptyReveal(parent, text = "Rien. Même le serveur juge.") {
    const empty = document.createElement("p");
    empty.className = "empty-contribution";
    empty.textContent = text;
    parent.append(empty);
  }

  function createLeagueOfNaabsResultStep(chain, stepIndex) {
    const item = document.createElement("li");
    const content = document.createElement("div");
    const title = document.createElement("h3");
    const ownerName = chain.ownerNickname;
    const sketch = findContributionByStep(chain, "champion-sketch");
    const championName = findContributionByStep(chain, "champion-name");
    const spellKit = findContributionByStep(chain, "spell-kit");
    const quotePack = findContributionByStep(chain, "quote-pack");
    const lore = findContributionByStep(chain, "champion-lore");
    const spells = parseSpellKit(spellKit && spellKit.content);
    const quotes = parseQuotePack(quotePack && quotePack.content);
    let audioPlayer = null;

    item.className = "result-item league-result-item current-reveal";
    content.className = "league-reveal-content";
    title.className = "league-reveal-title";

    if (stepIndex === 0) {
      item.classList.add("result-type-drawing", "league-result-drawing");
      renderPlayerReferenceText(
        title,
        `Et pour le champion de ${ownerName}, voici ce que vous avez concocté :`,
        ownerName
      );
      content.append(title);
      if (sketch && !sketch.empty && sketch.content) {
        const image = document.createElement("img");
        image.className = "result-image league-result-image";
        image.src = sketch.content;
        image.alt = `Croquis du champion de ${ownerName}`;
        content.append(image);
      } else {
        appendEmptyReveal(content, "Le croquis a fui la Faille.");
      }
    } else if (stepIndex === 1) {
      title.textContent = "Le champion s'appelle...";
      content.append(title);
      appendRevealParagraph(content, "Suspense. Roulement de clavier.", ownerName);
      const name = document.createElement("p");
      name.className = "league-champion-name";
      name.textContent =
        championName && !championName.empty && championName.content
          ? championName.content
          : "Nom manquant, probablement nerfé.";
      content.append(name);
    } else if (stepIndex === 2) {
      title.textContent = "Le lore";
      content.append(title);
      appendRevealParagraph(
        content,
        lore && !lore.empty && lore.content
          ? lore.content
          : "Aucun lore. Même Riot n'a pas osé.",
        ownerName,
        "result-text league-lore-text"
      );
    } else if (stepIndex >= 3 && stepIndex <= 6) {
      const spellIndex = stepIndex - 3;
      title.textContent =
        spellIndex === 3
          ? "Et maintenant son ulti :"
          : `Voici son sort ${spellIndex + 1} :`;
      content.append(title);
      const spell = document.createElement("article");
      const badge = document.createElement("span");
      const text = document.createElement("p");
      spell.className = "spell-kit-view-item league-single-spell";
      if (spellIndex === 3) {
        spell.classList.add("ultimate");
      }
      badge.className = "spell-kit-view-badge";
      badge.textContent = String(spellIndex + 1).padStart(2, "0");
      text.textContent = spells[spellIndex] || "Sort perdu dans un patch note.";
      spell.append(badge, text);
      content.append(spell);
    } else {
      const quoteIndex = stepIndex - 7;
      title.textContent = `Sa réplique ${quoteIndex + 1} :`;
      content.append(title);
      if (quotes[quoteIndex]) {
        audioPlayer = createAudioPlayer(quotes[quoteIndex], true);
        content.append(audioPlayer.element);
      } else {
        appendEmptyReveal(content, "Silence gênant, mais réglementaire.");
      }
    }

    item.append(content);
    return { element: item, audioPlayer };
  }

  function updateResultsControls() {
    const canControlResults =
      Boolean(currentGame && currentGame.canControlResults) &&
      isCurrentUserRoomHost();
    elements.previousChainButton.disabled =
      !canControlResults || !currentGame.canGoPrevious;
    elements.nextChainButton.disabled =
      !canControlResults || !currentGame.canGoNext;
    elements.resultNavigation.classList.toggle(
      "hidden",
      !canControlResults
    );
    elements.resultsObserverMessage.classList.toggle(
      "hidden",
      canControlResults
    );
    elements.returnLobbyButton.classList.toggle(
      "hidden",
      !canControlResults
    );
    elements.restartGameButton.classList.toggle(
      "hidden",
      !canControlResults
    );
    elements.restartGameButton.disabled =
      !canControlResults || !currentGame.canRestartGame;
    elements.restartGameButton.title =
      canControlResults && currentGame.canRestartGame
      ? "Relancer immédiatement avec les mêmes joueurs et réglages"
      : "Il faut au moins 2 joueurs connectés pour relancer";
    elements.nextChainButton.title =
      currentGame.party && currentGame.party.hasNextGame &&
      currentGame.resultStepNumber === currentGame.resultStepCount
        ? "Lancer le jeu suivant de la Party"
        : "Étape suivante";
  }

  function getResultProgressLabel() {
    const stepLabel =
      `Étape ${currentGame.resultStepNumber} / ${currentGame.resultStepCount}`;
    return currentGame.party
      ? `Jeu ${currentGame.party.gameNumber} / ${currentGame.party.gameCount} · ${stepLabel}`
      : stepLabel;
  }

  function renderLeagueOfNaabsResultChain(chain) {
    elements.resultsTitle.textContent =
      currentGame.resultTitle || "Le vestiaire des champions douteux";
    elements.resultOwnerLabel.textContent =
      currentGame.resultOwnerLabel || "Champion créé pour";
    elements.resultChainCount.textContent = getResultProgressLabel();
    renderPlayerReferenceText(
      elements.resultOwner,
      chain.ownerNickname,
      chain.ownerNickname
    );

    const rendered = createLeagueOfNaabsResultStep(
      chain,
      resultContributionIndex
    );
    elements.resultContributions.replaceChildren(rendered.element);
    updateResultsControls();

    const revealKey =
      `${currentGame.gameId}:${chain.id}:${resultContributionIndex}`;
    if (lastResultRevealKey !== revealKey) {
      lastResultRevealKey = revealKey;
      playSoundEffect("reveal");
      scrollToCurrentResult(rendered.element);
      if (rendered.audioPlayer) {
        window.requestAnimationFrame(() => {
          autoplayRevealedAudio(rendered.audioPlayer);
        });
      }
    }
  }

  function renderCurrentResultChain() {
    if (!currentGame || currentGame.phase !== "results") {
      return;
    }

    const chains = currentGame.chains;
    const chain = chains[resultChainIndex];
    if (currentGame.gameId === "leagueOfNaabs") {
      renderLeagueOfNaabsResultChain(chain);
      return;
    }

    elements.resultsTitle.textContent =
      currentGame.resultTitle || "Voici comment tout a dérapé";
    elements.resultOwnerLabel.textContent =
      currentGame.resultOwnerLabel || "Catastrophe initiée par";
    elements.resultChainCount.textContent = getResultProgressLabel();
    elements.resultOwner.textContent = chain.ownerNickname;
    const visibleContributions = chain.contributions.slice(
      0,
      resultContributionIndex + 1
    );
    const renderedContributions = visibleContributions.map(
      (contribution, index) =>
        renderResultContribution(
          contribution,
          index,
          index === resultContributionIndex
        )
    );
    elements.resultContributions.replaceChildren(
      ...renderedContributions.map((rendered) => rendered.element)
    );
    updateResultsControls();

    const revealKey = `${chain.id}:${resultContributionIndex}`;
    if (lastResultRevealKey !== revealKey) {
      lastResultRevealKey = revealKey;
      playSoundEffect("reveal");
      const currentRendered =
        renderedContributions[renderedContributions.length - 1];
      scrollToCurrentResult(currentRendered && currentRendered.element);
      if (currentRendered && currentRendered.audioPlayer) {
        window.requestAnimationFrame(() => {
          autoplayRevealedAudio(currentRendered.audioPlayer);
        });
      }
    }
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
    const chain = resultsState.chains[resultChainIndex];
    resultContributionIndex = Math.max(
      0,
      Math.min(
        getResultStepCountForChain(chain) - 1,
        resultsState.currentContributionIndex || 0
      )
    );
    setMessage(elements.resultsMessage, "");
    showOnly(elements.resultsView);
    renderCurrentResultChain();
  }

  async function navigateResults(direction) {
    if (
      !currentGame ||
      !currentGame.canControlResults ||
      !isCurrentUserRoomHost()
    ) {
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
    versionUrl = window.GameClientUtils.buildEndpointUrl(serverUrl, "/version");
    console.info(`[config] Serveur utilisé : ${serverUrl}`);
    console.info(`[config] Health check : ${healthUrl}`);
    console.info(`[config] Version : ${versionUrl}`);

    initializeDrawing();
    loadAudioSettings();
    loadTheme();
    loadAppVersion();
    applyRoomCodeFromUrl();

    elements.createButton.addEventListener("click", () =>
      prepareAction("create")
    );
    elements.joinButton.addEventListener("click", () => prepareAction("join"));
    elements.retryButton.addEventListener("click", runPendingAction);
    elements.leaveButton.addEventListener("click", leaveCurrentRoom);
    elements.gameLeaveButton.addEventListener("click", leaveCurrentRoom);
    elements.replayPreviousButton.addEventListener("click", () => {
      if (
        !currentGame ||
        currentGame.phase !== "playing" ||
        !currentGame.assignment.previousContribution
      ) {
        return;
      }

      showRoundPreview(
        `${currentGame.roomCode}:${currentGame.roundIndex}:replay:${Date.now()}`,
        currentGame,
        currentGame.assignment.previousContribution,
        roundPreviousAudio
      );
    });
    elements.closeRoundPreviewButton.addEventListener("click", () => {
      if (introRoundKey) {
        finishRoundPreview(introRoundKey);
      }
    });
    elements.chatToggleButton.addEventListener("click", () => {
      setChatOpen(!chatOpen);
      if (chatOpen) {
        elements.chatInput.focus();
      }
    });
    elements.chatCloseButton.addEventListener("click", () => {
      setChatOpen(false);
    });
    elements.chatForm.addEventListener("submit", (event) => {
      event.preventDefault();
      sendChatMessage();
    });
    elements.gameSelectionButtons.forEach((button) => {
      button.addEventListener("click", () => {
        if (button.getAttribute("aria-disabled") === "true") {
          return;
        }
        handleRoomGameClick(button.dataset.gameId);
      });
      button.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        if (button.getAttribute("aria-disabled") === "true") {
          return;
        }
        handleRoomGameClick(button.dataset.gameId);
      });
    });
    elements.gameSettingsButtons.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (button.classList.contains("hidden")) {
          return;
        }
        setGameSettingsOpen(true);
      });
    });

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
      elements.roomCodeInput.value = normalizeRoomCodeInput(
        elements.roomCodeInput.value
      );
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
    elements.roomName.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        prepareAction("create");
      }
    });

    elements.copyButton.addEventListener("click", async () => {
      if (!currentRoom) {
        return;
      }

      const inviteUrl = buildRoomInviteUrl(currentRoom.code);
      try {
        await navigator.clipboard.writeText(inviteUrl);
        setMessage(elements.roomMessage, "Lien d'invitation copié.", "success");
      } catch {
        setMessage(
          elements.roomMessage,
          `Copiez ce lien : ${inviteUrl}`,
          "error"
        );
      }
    });
    elements.toggleCodeButton.addEventListener("click", () => {
      codeVisible = !codeVisible;
      renderRoomCode();
    });
    elements.closeGameSettingsButton.addEventListener("click", () => {
      setGameSettingsOpen(false);
    });
    elements.doneGameSettingsButton.addEventListener("click", () => {
      setGameSettingsOpen(false);
    });
    elements.gameSettingsModal.addEventListener("click", (event) => {
      if (event.target === elements.gameSettingsModal) {
        setGameSettingsOpen(false);
      }
    });
    elements.roundCountInput.addEventListener("change", updateRoomSettings);
    elements.partyGameCountInput.addEventListener(
      "change",
      updateRoomSettings
    );
    elements.numberStepperButtons.forEach((button) => {
      button.addEventListener("click", () => {
        handleNumberStepperClick(button);
      });
    });
    elements.inputTypeCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", updateRoomSettings);
    });
    elements.partyGameCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", updateRoomSettings);
    });

    elements.typeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        selectContributionType(button.dataset.type);
      });
    });
    elements.avatarButtons.forEach((button) => {
      button.addEventListener("click", () => {
        selectAvatar(button.dataset.avatar);
      });
    });

    elements.textContribution.addEventListener("input", () => {
      elements.textCounter.textContent =
        `${Array.from(elements.textContribution.value).length} / 500`;
      scheduleDraftSave();
    });
    elements.spellInputs.forEach((input) => {
      input.addEventListener("input", scheduleDraftSave);
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
      if (
        event.key === "Escape" &&
        !elements.gameSettingsModal.classList.contains("hidden")
      ) {
        setGameSettingsOpen(false);
      }
      if (event.key === "Escape" && chatOpen) {
        setChatOpen(false);
      }
    });
    elements.volumeSlider.addEventListener("input", () => {
      setSiteVolume(Number(elements.volumeSlider.value) / 100);
    });
    elements.effectsVolumeSlider.addEventListener("input", () => {
      setEffectsVolume(
        Number(elements.effectsVolumeSlider.value) / 100
      );
    });
    elements.volumeSlider.addEventListener("change", () => {
      playSoundEffect("soft");
    });
    elements.effectsVolumeSlider.addEventListener("change", () => {
      playSoundEffect("soft");
    });
    window.addEventListener("resize", () => {
      scheduleWaveformRedraw();
      trimChatToFit();
    });
    elements.muteButton.addEventListener("click", () => {
      siteMuted = !siteMuted;
      saveAudioSettings();
      updateAudioSettingsUi();
    });
    elements.themeToggle.addEventListener("click", toggleTheme);
    document.addEventListener(
      "pointerdown",
      () => {
        effectsUnlocked = true;
        getEffectsAudioContext();
      },
      { once: true }
    );
    document.addEventListener(
      "keydown",
      () => {
        effectsUnlocked = true;
        getEffectsAudioContext();
      },
      { once: true }
    );
    document.addEventListener("click", (event) => {
      const target =
        event.target instanceof Element
          ? event.target.closest(
              "button, [role='button'], .settings-choice, input[type='checkbox'], input[type='range']"
            )
          : null;
      if (
        !target ||
        (
          target.classList.contains("game-tile") &&
          event.target.closest(".game-tile-settings")
        ) ||
        target.disabled ||
        target.getAttribute("aria-disabled") === "true"
      ) {
        return;
      }
      playSoundEffect(getInteractionSound(target));
    });

    elements.recordAudioButton.addEventListener(
      "click",
      startAudioRecording
    );
    elements.playAudioButton.addEventListener(
      "click",
      toggleRecordedAudioPlayback
    );
    elements.resetAudioButton.addEventListener("click", () => {
      const quotePack = isQuotePackStep();
      resetAudio(!quotePack);
      if (currentGame) {
        sendDraft(
          "audio",
          quotePack && hasAnyQuoteAudio() ? buildQuotePackContent() : "",
          currentGame.roundIndex
        );
      }
    });
    elements.quoteAudioSlotButtons.forEach((button) => {
      button.addEventListener("click", () => {
        selectAudioQuoteSlot(button.dataset.quoteIndex);
      });
    });
    elements.validateAudioButton.addEventListener(
      "click",
      submitContribution
    );
    elements.audioPreview.addEventListener(
      "loadedmetadata",
      updateAudioTimeline
    );
    elements.audioPreview.addEventListener("timeupdate", updateAudioTimeline);
    elements.audioPreview.addEventListener("play", () => {
      updateAudioPlayButton();
      startRecordedAudioTimelineAnimation();
    });
    elements.audioPreview.addEventListener("pause", () => {
      stopRecordedAudioTimelineAnimation();
      updateAudioTimeline();
      updateAudioPlayButton();
    });
    elements.audioPreview.addEventListener("ended", () => {
      stopRecordedAudioTimelineAnimation();
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
      updateAudioTimeline();
    });
    elements.introAudioPlayButton.addEventListener("click", async () => {
      if (!introAudioElement) {
        stopRoundIntro();
        return;
      }

      try {
        applyVolumeToAudio(introAudioElement);
        introAudioElement.currentTime = 0;
        pauseOtherAudio(introAudioElement);
        await introAudioElement.play();
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
    elements.restartGameButton.addEventListener("click", async () => {
      elements.restartGameButton.disabled = true;
      elements.returnLobbyButton.disabled = true;
      setMessage(elements.resultsMessage, "On remélange les catastrophes...");
      try {
        const response = await emitWithAcknowledgment("restartGame");
        if (!response || !response.ok) {
          throw new Error(
            (response && response.error) || "Relance impossible."
          );
        }
      } catch (error) {
        setMessage(elements.resultsMessage, error.message, "error");
        if (currentGame && currentGame.phase === "results") {
          renderCurrentResultChain();
        }
      } finally {
        elements.returnLobbyButton.disabled = false;
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
