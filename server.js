"use strict";

require("dotenv").config();

const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const cors = require("cors");
const express = require("express");
const { Server } = require("socket.io");
const { version: APP_VERSION } = require("./package.json");

const MAX_PLAYERS = 10;
const MIN_PLAYERS_TO_START = 2;
const ROUND_DURATION_MS = 60000;
const GAME_COUNTDOWN_MS = 3000;
const ROUND_PREVIEW_MS = 10000;
const MAX_TEXT_LENGTH = 500;
const MAX_MEDIA_DATA_LENGTH = 1500000;
const MAX_CHAT_MESSAGE_LENGTH = 200;
const MAX_CHAT_MESSAGES = 20;
const MAX_ROOM_NAME_LENGTH = 30;
const MIN_ROOM_NAME_LENGTH = 2;
const ROOM_CODE_LENGTH = 6;
const DEFAULT_INPUT_TYPE_COUNT = 3;
const DEFAULT_PARTY_GAME_COUNT = 3;
const MAX_PARTY_GAME_COUNT = 10;
const DEFAULT_AVATAR_ID = "comet";
const PARTY_GAME_ID = "party";
const DEFAULT_ROOM_GAME_ID = PARTY_GAME_ID;
const KAMOULOX_GAME_ID = "kamoulox3000";
const LEAGUE_OF_NAABS_GAME_ID = "leagueOfNaabs";
const PLAYABLE_GAME_IDS = Object.freeze([
  KAMOULOX_GAME_ID,
  LEAGUE_OF_NAABS_GAME_ID
]);
const ROOM_GAMES = Object.freeze([
  {
    id: PARTY_GAME_ID,
    name: "Party",
    resolvedId: null,
    available: true
  },
  {
    id: KAMOULOX_GAME_ID,
    name: "Kamoulox 3000",
    resolvedId: KAMOULOX_GAME_ID,
    available: true
  },
  {
    id: LEAGUE_OF_NAABS_GAME_ID,
    name: "League Of Naabs",
    resolvedId: LEAGUE_OF_NAABS_GAME_ID,
    available: true
  }
]);
const AVATAR_IDS = Object.freeze([
  "comet",
  "robot",
  "wizard",
  "alien",
  "ninja",
  "ghost",
  "cat",
  "frog"
]);
const ROOM_CODE_CHARACTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ROOM_CODE_PATTERN = new RegExp(
  `^[${ROOM_CODE_CHARACTERS}]{${ROOM_CODE_LENGTH}}$`
);
const CONTRIBUTION_TYPES = Object.freeze({
  TEXT: "text",
  DRAWING: "drawing",
  AUDIO: "audio"
});
const CONTRIBUTION_TYPE_VALUES = Object.freeze(
  Object.values(CONTRIBUTION_TYPES)
);
const LEAGUE_OF_NAABS_STEPS = Object.freeze([
  {
    key: "champion-sketch",
    label: "Croquis du champion",
    type: CONTRIBUTION_TYPES.DRAWING
  },
  {
    key: "champion-name",
    label: "Nom du champion",
    type: CONTRIBUTION_TYPES.TEXT,
    inputLabel: "Nom du champion",
    placeholder: "Ex: Jean-Michel Flash Inting, gardien du buisson..."
  },
  {
    key: "spell-kit",
    label: "3 sorts + ulti",
    type: CONTRIBUTION_TYPES.TEXT,
    inputLabel: "Kit de sorts",
    placeholder:
      "Donne 3 sorts et un ulti. Format conseillé : Q, W, E, R."
  },
  {
    key: "quote-pack",
    label: "4 répliques audio",
    type: CONTRIBUTION_TYPES.AUDIO
  },
  {
    key: "champion-lore",
    label: "Lore",
    type: CONTRIBUTION_TYPES.TEXT,
    inputLabel: "Lore du champion",
    placeholder:
      "Raconte son origine dramatique, son passif social et sa dette morale."
  }
]);
const LEAGUE_OF_NAABS_OPTIMAL_PLAYER_COUNT =
  LEAGUE_OF_NAABS_STEPS.length + 1;
const LEAGUE_OF_NAABS_REVEAL_STEPS_PER_CHAMPION = 11;

function createDefaultGameSettings(gameId = DEFAULT_ROOM_GAME_ID) {
  return {
    roundCount: null,
    inputTypes: [...CONTRIBUTION_TYPE_VALUES],
    inputTypeCount: DEFAULT_INPUT_TYPE_COUNT,
    partyGameCount: DEFAULT_PARTY_GAME_COUNT,
    enabledGameIds:
      gameId === PARTY_GAME_ID ? [...PLAYABLE_GAME_IDS] : []
  };
}

function normalizeRevision(value) {
  const revision = String(value || "").trim();
  return /^[a-f0-9]{7,40}$/i.test(revision)
    ? revision.slice(0, 7).toLowerCase()
    : "local";
}

function normalizeConfiguredOrigin(value) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  if (trimmedValue === "*") {
    throw new Error(
      "ALLOWED_ORIGINS ne doit pas contenir '*'. Indiquez les domaines autorisés."
    );
  }

  try {
    return new URL(trimmedValue).origin;
  } catch {
    throw new Error(
      `Origine invalide dans ALLOWED_ORIGINS : "${trimmedValue}".`
    );
  }
}

function parseAllowedOrigins(rawValue) {
  return new Set(
    String(rawValue || "")
      .split(",")
      .map(normalizeConfiguredOrigin)
      .filter(Boolean)
  );
}

function isLocalOrigin(origin) {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

function getRequestOrigin(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] || "")
    .split(",")[0]
    .trim();
  const protocol =
    forwardedProto || (req.socket && req.socket.encrypted ? "https" : "http");
  const host = forwardedHost || req.headers.host;

  if (!host) {
    return null;
  }

  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return null;
  }
}

function getAssignedChainIndex(playerIndex, roundIndex, playerCount) {
  return (playerIndex - roundIndex + playerCount) % playerCount;
}

function getLeagueOfNaabsAssignedChainIndex(
  playerIndex,
  roundIndex,
  playerCount
) {
  return (playerIndex + roundIndex + 1) % playerCount;
}

function getAssignedChainIndexForGame(
  gameId,
  playerIndex,
  roundIndex,
  playerCount
) {
  if (gameId === LEAGUE_OF_NAABS_GAME_ID && playerCount > 1) {
    return getLeagueOfNaabsAssignedChainIndex(
      playerIndex,
      roundIndex,
      playerCount
    );
  }

  return getAssignedChainIndex(playerIndex, roundIndex, playerCount);
}

function getExpectedContributionType(
  previousType,
  allowedTypes = CONTRIBUTION_TYPE_VALUES,
  randomInt = crypto.randomInt
) {
  const validTypes = allowedTypes.filter((type) =>
    CONTRIBUTION_TYPE_VALUES.includes(type)
  );
  const candidates = validTypes.filter((type) => type !== previousType);
  const availableTypes = candidates.length > 0 ? candidates : validTypes;

  if (availableTypes.length === 0) {
    return null;
  }

  return availableTypes[randomInt(availableTypes.length)];
}

function selectActiveContributionTypes(
  typeCount,
  randomInt = crypto.randomInt
) {
  const availableTypes = [...CONTRIBUTION_TYPE_VALUES];
  const selectedTypes = [];
  const safeTypeCount = Math.min(
    CONTRIBUTION_TYPE_VALUES.length,
    Math.max(1, Number(typeCount) || DEFAULT_INPUT_TYPE_COUNT)
  );

  while (selectedTypes.length < safeTypeCount) {
    const selectedIndex = randomInt(availableTypes.length);
    selectedTypes.push(availableTypes.splice(selectedIndex, 1)[0]);
  }

  return selectedTypes;
}

function createTypePlan(
  chainCount,
  totalRounds,
  activeTypes,
  randomInt = crypto.randomInt
) {
  return Array.from({ length: chainCount }, () => {
    const plan = [];

    for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
      plan.push(
        getExpectedContributionType(
          roundIndex > 0 ? plan[roundIndex - 1] : null,
          activeTypes,
          randomInt
        )
      );
    }

    return plan;
  });
}

function createGameServer(options = {}) {
  const nodeEnv = options.nodeEnv || process.env.NODE_ENV || "development";
  const appRevision = normalizeRevision(
    options.revision !== undefined
      ? options.revision
      : process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT
  );
  const displayVersion = `v${APP_VERSION}+${appRevision}`;
  const isDevelopment = nodeEnv !== "production";
  const roundDurationMs =
    Number.isFinite(options.roundDurationMs) && options.roundDurationMs > 0
      ? options.roundDurationMs
      : ROUND_DURATION_MS;
  const gameCountdownMs =
    Number.isFinite(options.gameCountdownMs) && options.gameCountdownMs >= 0
      ? options.gameCountdownMs
      : GAME_COUNTDOWN_MS;
  const roundPreviewMs =
    Number.isFinite(options.roundPreviewMs) && options.roundPreviewMs >= 0
      ? options.roundPreviewMs
      : ROUND_PREVIEW_MS;
  const randomInt =
    typeof options.randomInt === "function"
      ? options.randomInt
      : crypto.randomInt;
  const allowedOrigins = parseAllowedOrigins(
    options.allowedOrigins !== undefined
      ? options.allowedOrigins
      : process.env.ALLOWED_ORIGINS
  );
  const rooms = new Map();
  let joinSequence = 0;

  function normalizeRequestOrigin(origin) {
    if (!origin) {
      return null;
    }

    try {
      return new URL(origin).origin;
    } catch {
      return null;
    }
  }

  function isOriginAllowed(origin, req) {
    if (!origin) {
      return true;
    }

    const normalizedOrigin = normalizeRequestOrigin(origin);
    if (!normalizedOrigin) {
      return false;
    }

    if (allowedOrigins.has(normalizedOrigin)) {
      return true;
    }

    if (isDevelopment && isLocalOrigin(normalizedOrigin)) {
      return true;
    }

    return normalizedOrigin === getRequestOrigin(req);
  }

  const app = express();
  const httpServer = http.createServer(app);

  app.disable("x-powered-by");
  app.use(
    cors((req, callback) => {
      const origin = req.headers.origin;
      const originAllowed = isOriginAllowed(origin, req);

      callback(null, {
        origin: origin && originAllowed ? origin : false,
        methods: ["GET", "POST"],
        optionsSuccessStatus: 204
      });
    })
  );

  app.get("/health", (req, res) => {
    res
      .status(200)
      .set("Cache-Control", "no-store")
      .json({ status: "ok" });
  });

  app.get("/version", (req, res) => {
    res
      .status(200)
      .set("Cache-Control", "no-store")
      .json({
        version: APP_VERSION,
        revision: appRevision,
        display: displayVersion
      });
  });

  app.use(express.static(path.join(__dirname, "public")));

  const io = new Server(httpServer, {
    maxHttpBufferSize: 2000000,
    cors: {
      origin(origin, callback) {
        const normalizedOrigin = normalizeRequestOrigin(origin);

        if (
          !origin ||
          (normalizedOrigin && allowedOrigins.has(normalizedOrigin)) ||
          (isDevelopment &&
            normalizedOrigin &&
            isLocalOrigin(normalizedOrigin))
        ) {
          callback(null, true);
          return;
        }

        callback(null, false);
      },
      methods: ["GET", "POST"]
    },
    allowRequest(req, callback) {
      const origin = req.headers.origin;
      const originAllowed = isOriginAllowed(origin, req);

      if (!originAllowed) {
        console.warn(`Connexion Socket.IO refusée pour l'origine : ${origin}`);
      }

      callback(null, originAllowed);
    }
  });

  function normalizeNickname(value) {
    if (typeof value !== "string") {
      return null;
    }

    const nickname = value.trim();
    const length = Array.from(nickname).length;

    if (length < 2 || length > 20) {
      return null;
    }

    return nickname;
  }

  function normalizeRoomName(value) {
    if (typeof value !== "string") {
      return null;
    }

    const roomName = value.trim().replace(/\s+/g, " ");
    const length = Array.from(roomName).length;

    if (length < MIN_ROOM_NAME_LENGTH || length > MAX_ROOM_NAME_LENGTH) {
      return null;
    }

    return roomName;
  }

  function normalizeAvatarId(value, allowDefault = true) {
    if ((value === undefined || value === null || value === "") && allowDefault) {
      return DEFAULT_AVATAR_ID;
    }

    return typeof value === "string" && AVATAR_IDS.includes(value)
      ? value
      : null;
  }

  function findRoomGame(gameId) {
    return ROOM_GAMES.find((game) => game.id === gameId) || null;
  }

  function normalizeRoomGameId(value) {
    const game = typeof value === "string" ? findRoomGame(value) : null;
    return game && game.available ? game.id : null;
  }

  function getResolvedRoomGame(room) {
    const selectedGame =
      findRoomGame(room.selectedGameId) || findRoomGame(DEFAULT_ROOM_GAME_ID);
    if (selectedGame.id === PARTY_GAME_ID) {
      const currentPartyGameId =
        room.partySession &&
        room.partySession.gameIds[room.partySession.currentIndex];
      return findRoomGame(currentPartyGameId) || findRoomGame(KAMOULOX_GAME_ID);
    }
    return findRoomGame(selectedGame.resolvedId) || selectedGame;
  }

  function getResolvedRoomGameForId(gameId) {
    const selectedGame =
      findRoomGame(gameId) || findRoomGame(DEFAULT_ROOM_GAME_ID);
    if (selectedGame.id === PARTY_GAME_ID) {
      return selectedGame;
    }
    return findRoomGame(selectedGame.resolvedId) || selectedGame;
  }

  function getMaxRoundsForGame(gameId, playerCount) {
    if (gameId === LEAGUE_OF_NAABS_GAME_ID) {
      return Math.max(
        1,
        Math.min(LEAGUE_OF_NAABS_STEPS.length, playerCount - 1)
      );
    }

    return Math.max(1, Math.min(playerCount, MAX_PLAYERS));
  }

  function getRoomGameSettings(room, gameId = room.selectedGameId) {
    const normalizedGameId =
      normalizeRoomGameId(gameId) || DEFAULT_ROOM_GAME_ID;
    if (!room.gameSettings) {
      room.gameSettings = new Map();
    }
    if (!room.gameSettings.has(normalizedGameId)) {
      room.gameSettings.set(
        normalizedGameId,
        createDefaultGameSettings(normalizedGameId)
      );
    }

    return room.gameSettings.get(normalizedGameId);
  }

  function serializeSettings(room, gameId = room.selectedGameId) {
    const selectedGame =
      findRoomGame(gameId) || findRoomGame(DEFAULT_ROOM_GAME_ID);
    const settings = getRoomGameSettings(room, selectedGame.id);
    const maxRounds = getMaxRoundsForGame(selectedGame.id, room.players.size);
    const effectiveRoundCount =
      settings.roundCount === null
        ? maxRounds
        : Math.min(settings.roundCount, maxRounds);

    return {
      gameId: selectedGame.id,
      roundCount: settings.roundCount,
      effectiveRoundCount,
      inputTypes: [...settings.inputTypes],
      inputTypeCount: settings.inputTypes.length,
      partyGameCount: settings.partyGameCount,
      enabledGameIds: [...settings.enabledGameIds]
    };
  }

  function getEffectiveRoundCount(room) {
    const resolvedGame = getResolvedRoomGame(room);
    const settings = getRoomGameSettings(room);
    const maxRounds = getMaxRoundsForGame(
      resolvedGame.id,
      room.players.size
    );

    return settings.roundCount === null
      ? maxRounds
      : Math.min(settings.roundCount, maxRounds);
  }

  function serializeGameSelection(room) {
    const selectedGame =
      findRoomGame(room.selectedGameId) || findRoomGame(DEFAULT_ROOM_GAME_ID);
    const resolvedGame = selectedGame.resolvedId
      ? findRoomGame(selectedGame.resolvedId) || selectedGame
      : null;

    return {
      selectedGameId: selectedGame.id,
      selectedGameName: selectedGame.name,
      resolvedGameId: resolvedGame ? resolvedGame.id : null,
      resolvedGameName: resolvedGame ? resolvedGame.name : null
    };
  }

  function serializeGameVotes(room) {
    const votes = {};

    Array.from(room.players.values())
      .sort((first, second) => first.joinOrder - second.joinOrder)
      .forEach((player) => {
        if (player.id === room.hostId || !room.gameVotes) {
          return;
        }

        const gameId = room.gameVotes.get(player.participantId);
        if (!normalizeRoomGameId(gameId)) {
          return;
        }

        if (!votes[gameId]) {
          votes[gameId] = [];
        }

        votes[gameId].push({
          playerId: player.id,
          nickname: player.nickname,
          avatarId: player.avatarId
        });
      });

    return votes;
  }

  function normalizeRoomCode(value) {
    if (typeof value !== "string") {
      return null;
    }

    const roomCode = value.trim().toUpperCase();
    return ROOM_CODE_PATTERN.test(roomCode) ? roomCode : null;
  }

  function generateRoomCode() {
    let roomCode;

    do {
      roomCode = Array.from({ length: ROOM_CODE_LENGTH }, () => {
        const index = crypto.randomInt(ROOM_CODE_CHARACTERS.length);
        return ROOM_CODE_CHARACTERS[index];
      }).join("");
    } while (rooms.has(roomCode));

    return roomCode;
  }

  function createPlayer(
    socket,
    nickname,
    avatarId,
    participantId = crypto.randomUUID()
  ) {
    return {
      id: socket.id,
      participantId,
      nickname,
      avatarId,
      joinedAt: Date.now(),
      joinOrder: joinSequence++
    };
  }

  function getPlayerStatus(room, player) {
    if (!room.game) {
      return "ready";
    }

    if (room.game.status === "results") {
      return "summary";
    }

    return room.game.roundSubmissions.has(player.participantId)
      ? "done"
      : "playing";
  }

  function serializeRoom(room) {
    const host = room.players.get(room.hostId);

    return {
      code: room.code,
      name:
        room.customName ||
        `${host ? host.nickname : "naab.fun"}'s Room`,
      hostId: room.hostId,
      phase: room.game ? room.game.status : "lobby",
      playerCount: room.players.size,
      maxPlayers: MAX_PLAYERS,
      minPlayersToStart: MIN_PLAYERS_TO_START,
      gameSelection: serializeGameSelection(room),
      gameVotes: serializeGameVotes(room),
      settings: serializeSettings(room),
      players: Array.from(room.players.values())
        .sort((first, second) => first.joinOrder - second.joinOrder)
        .map((player) => ({
          id: player.id,
          nickname: player.nickname,
          avatarId: player.avatarId,
          isHost: player.id === room.hostId,
          status: getPlayerStatus(room, player)
        })),
      chatMessages: room.chatMessages.map((message) => ({ ...message }))
    };
  }

  function emitRoomState(room) {
    io.to(room.code).emit("roomState", serializeRoom(room));
  }

  function nicknameExists(room, nickname) {
    const normalizedNickname = nickname.toLocaleLowerCase("fr-FR");
    return Array.from(room.players.values()).some(
      (player) =>
        player.nickname.toLocaleLowerCase("fr-FR") === normalizedNickname
    );
  }

  function findGameParticipantByNickname(game, nickname) {
    const normalizedNickname = nickname.toLocaleLowerCase("fr-FR");
    return game.participants.find(
      (participant) =>
        participant.nickname.toLocaleLowerCase("fr-FR") === normalizedNickname
    );
  }

  function findLongestConnectedPlayer(room) {
    return Array.from(room.players.values()).sort(
      (first, second) => first.joinOrder - second.joinOrder
    )[0];
  }

  function getGameParticipant(game, participantId) {
    return game.participants.find(
      (participant) => participant.id === participantId
    );
  }

  function getAssignment(game, participantId) {
    const playerIndex = game.participantOrder.indexOf(participantId);
    if (playerIndex < 0) {
      return null;
    }

    const chainIndex = getAssignedChainIndexForGame(
      game.gameId,
      playerIndex,
      game.roundIndex,
      game.participantOrder.length
    );
    const chain = game.chains[chainIndex];
    const previousContribution =
      game.roundIndex > 0
        ? chain.contributions[game.roundIndex - 1] || null
        : null;
    const expectedType =
      game.typePlans.get(chain.id)[game.roundIndex] || null;
    const roundSpec =
      Array.isArray(game.roundSpecs) && game.roundSpecs[game.roundIndex]
        ? game.roundSpecs[game.roundIndex]
        : null;

    return {
      chain,
      previousContribution,
      expectedType,
      roundSpec
    };
  }

  function getLeagueOfNaabsPrompt(roundSpec, targetNickname) {
    if (!roundSpec) {
      return `Crée un champion douteux pour ${targetNickname}.`;
    }

    if (roundSpec.key === "champion-sketch") {
      return `Dessine le champion League Of Legends que ${targetNickname} pourrait incarner. Ne respecte aucune anatomie inutile.`;
    }
    if (roundSpec.key === "champion-name") {
      return `Trouve le nom du champion League Of Legends que ${targetNickname} pourrait incarner. Fais sérieux, donc ridicule.`;
    }
    if (roundSpec.key === "spell-kit") {
      return `Donne 3 sorts et un ulti au champion de ${targetNickname}. Quatre boutons, zéro équilibrage.`;
    }
    if (roundSpec.key === "quote-pack") {
      return `Enregistre les 4 répliques audio du champion de ${targetNickname}. Une personne, quatre moments gênants.`;
    }
    if (roundSpec.key === "champion-lore") {
      return `Écris le lore du champion de ${targetNickname}. Tragédie, mauvaise foi, et un soupçon de ranked.`;
    }

    return `Ajoute une idée dangereuse au champion de ${targetNickname}.`;
  }

  function getPrompt(game, assignment) {
    const expectedType = assignment.expectedType;
    if (game.gameId === LEAGUE_OF_NAABS_GAME_ID) {
      return getLeagueOfNaabsPrompt(
        assignment.roundSpec,
        assignment.chain.ownerNickname
      );
    }

    const previousType =
      assignment.previousContribution && assignment.previousContribution.type;
    if (!expectedType) {
      return "Aucune contribution n'est attendue.";
    }

    if (expectedType === CONTRIBUTION_TYPES.AUDIO) {
      return previousType
        ? "Enregistre un son inspiré de ce que tu viens de recevoir."
        : "Commence cette chaîne par un son de cinq secondes.";
    }

    if (expectedType === CONTRIBUTION_TYPES.DRAWING) {
      return previousType
        ? "Dessine ce que cette contribution t'inspire."
        : "Commence cette chaîne par un dessin.";
    }

    return previousType
      ? "Décris ce que tu viens de recevoir."
      : "Commence cette chaîne par un texte.";
  }

  function serializeContribution(contribution) {
    if (!contribution) {
      return null;
    }

    return {
      roundIndex: contribution.roundIndex,
      nickname: contribution.nickname,
      avatarId: contribution.avatarId,
      type: contribution.type,
      content: contribution.content,
      stepKey: contribution.stepKey || null,
      stepLabel: contribution.stepLabel || null,
      empty: contribution.empty
    };
  }

  function getResultStepCountForChain(game, chain) {
    if (game.gameId === LEAGUE_OF_NAABS_GAME_ID) {
      return LEAGUE_OF_NAABS_REVEAL_STEPS_PER_CHAMPION;
    }

    return chain.contributions.length;
  }

  function serializeResults(room, participantId) {
    const game = room.game;
    const player = Array.from(room.players.values()).find(
      (candidate) => candidate.participantId === participantId
    );
    const resultStepCount = game.chains.reduce(
      (total, chain) => total + getResultStepCountForChain(game, chain),
      0
    );
    const resultStepNumber =
      game.chains
        .slice(0, game.resultChainIndex)
        .reduce(
          (total, chain) => total + getResultStepCountForChain(game, chain),
          0
        ) +
      game.resultContributionIndex +
      1;
    const hasNextPartyGame = Boolean(
      room.partySession &&
        room.partySession.currentIndex < room.partySession.gameIds.length - 1
    );

    return {
      phase: "results",
      roomCode: room.code,
      serverNow: Date.now(),
      currentChainIndex: game.resultChainIndex,
      currentContributionIndex: game.resultContributionIndex,
      resultStepNumber,
      resultStepCount,
      canGoPrevious: resultStepNumber > 1,
      canGoNext: resultStepNumber < resultStepCount || hasNextPartyGame,
      canControlResults: Boolean(player && player.id === room.hostId),
      canRestartGame: Boolean(
        player &&
          player.id === room.hostId &&
          room.players.size >= MIN_PLAYERS_TO_START
      ),
      gameId: game.gameId,
      gameName: game.gameName,
      party: room.partySession
        ? {
            gameNumber: room.partySession.currentIndex + 1,
            gameCount: room.partySession.gameIds.length,
            hasNextGame: hasNextPartyGame
          }
        : null,
      resultTitle:
        game.gameId === LEAGUE_OF_NAABS_GAME_ID
          ? "Le vestiaire des champions douteux"
          : "Voici comment tout a dérapé",
      resultOwnerLabel:
        game.gameId === LEAGUE_OF_NAABS_GAME_ID
          ? "Champion créé pour"
          : "Catastrophe initiée par",
      chains: game.chains.map((chain) => ({
        id: chain.id,
        ownerNickname: chain.ownerNickname,
        ownerAvatarId: chain.ownerAvatarId,
        contributions: chain.contributions.map(serializeContribution)
      }))
    };
  }

  function serializeGameForPlayer(room, participantId) {
    const game = room.game;

    if (!game) {
      return null;
    }

    if (game.status === "results") {
      return serializeResults(room, participantId);
    }

    if (game.status === "countdown") {
      return {
        phase: "countdown",
        roomCode: room.code,
        countdownEndsAt: game.countdownEndsAt,
        serverNow: Date.now()
      };
    }

    const assignment = getAssignment(game, participantId);
    if (!assignment) {
      return null;
    }

    return {
      phase: "playing",
      roomCode: room.code,
      roundIndex: game.roundIndex,
      roundNumber: game.roundIndex + 1,
      totalRounds: game.totalRounds,
      roundStartedAt: game.roundStartedAt,
      previewEndsAt: game.roundStartedAt,
      roundEndsAt: game.roundEndsAt,
      serverNow: Date.now(),
      submitted: game.roundSubmissions.has(participantId),
      submittedCount: game.roundSubmissions.size,
      participantCount: game.participants.length,
      gameId: game.gameId,
      gameName: game.gameName,
      party:
        game.partyCount !== null
          ? {
              gameNumber: game.partyIndex + 1,
              gameCount: game.partyCount,
              hasNextGame: game.partyIndex < game.partyCount - 1
            }
          : null,
      optimalPlayerCount:
        game.gameId === LEAGUE_OF_NAABS_GAME_ID
          ? LEAGUE_OF_NAABS_OPTIMAL_PLAYER_COUNT
          : null,
      assignment: {
        chainId: assignment.chain.id,
        targetNickname: assignment.chain.ownerNickname,
        targetAvatarId: assignment.chain.ownerAvatarId,
        expectedType: assignment.expectedType,
        allowedTypes: [assignment.expectedType],
        prompt: getPrompt(game, assignment),
        step: assignment.roundSpec
          ? {
              key: assignment.roundSpec.key,
              label: assignment.roundSpec.label,
              inputLabel: assignment.roundSpec.inputLabel || null,
              placeholder: assignment.roundSpec.placeholder || null
            }
          : null,
        previousContribution: serializeContribution(
          assignment.previousContribution
        )
      }
    };
  }

  function emitGameStateToSocket(room, socketId, participantId) {
    const gameState = serializeGameForPlayer(room, participantId);
    if (gameState) {
      io.to(socketId).emit("gameState", gameState);
    }
  }

  function emitGameStates(room) {
    if (!room.game) {
      return;
    }

    room.players.forEach((player) => {
      emitGameStateToSocket(room, player.id, player.participantId);
    });
  }

  function clearGameTimers(game) {
    if (!game) {
      return;
    }

    if (game.roundTimer) {
      clearTimeout(game.roundTimer);
      game.roundTimer = null;
    }
    if (game.countdownTimer) {
      clearTimeout(game.countdownTimer);
      game.countdownTimer = null;
    }
  }

  function createEmptyContribution(game, participantId) {
    const participant = getGameParticipant(game, participantId);
    const assignment = getAssignment(game, participantId);
    const type = assignment.expectedType || CONTRIBUTION_TYPES.TEXT;

    return {
      roundIndex: game.roundIndex,
      participantId,
      nickname: participant.nickname,
      avatarId: participant.avatarId,
      chainId: assignment.chain.id,
      type,
      content: "",
      stepKey: assignment.roundSpec && assignment.roundSpec.key,
      stepLabel: assignment.roundSpec && assignment.roundSpec.label,
      empty: true,
      submittedAt: Date.now()
    };
  }

  function addFallbackSubmission(game, participantId) {
    if (game.roundSubmissions.has(participantId)) {
      return;
    }

    const draft = game.roundDrafts.get(participantId);
    if (draft && draft.content) {
      game.roundSubmissions.set(participantId, {
        ...draft,
        empty: false,
        autoSubmitted: true,
        submittedAt: Date.now()
      });
      return;
    }

    game.roundSubmissions.set(
      participantId,
      createEmptyContribution(game, participantId)
    );
  }

  function allPlayersSubmitted(game) {
    return game.roundSubmissions.size >= game.participantOrder.length;
  }

  function beginRound(room) {
    const game = room.game;
    if (!game || game.status === "results") {
      return;
    }

    clearGameTimers(game);
    game.status = "playing";
    game.finalizing = false;
    game.roundSubmissions = new Map();
    game.roundDrafts = new Map();
    game.countdownEndsAt = null;
    game.roundStartedAt = Date.now() + roundPreviewMs;
    game.roundEndsAt = game.roundStartedAt + roundDurationMs;

    game.participants.forEach((participant) => {
      if (!participant.connected) {
        addFallbackSubmission(game, participant.id);
      }
    });

    game.roundTimer = setTimeout(() => {
      finalizeRound(room, "timer");
    }, roundPreviewMs + roundDurationMs);

    emitRoomState(room);
    emitGameStates(room);

    if (allPlayersSubmitted(game)) {
      finalizeRound(room, "disconnections");
    }
  }

  function beginGameCountdown(room) {
    const game = room.game;
    if (!game) {
      return;
    }

    clearGameTimers(game);
    game.status = "countdown";
    game.countdownEndsAt = Date.now() + gameCountdownMs;
    game.countdownTimer = setTimeout(() => {
      beginRound(room);
    }, gameCountdownMs);
    emitRoomState(room);
    emitGameStates(room);
  }

  function finalizeRound(room, reason) {
    const game = room.game;
    if (!game || game.status !== "playing" || game.finalizing) {
      return;
    }

    game.finalizing = true;
    clearGameTimers(game);

    game.participantOrder.forEach((participantId) => {
      addFallbackSubmission(game, participantId);
    });

    game.roundSubmissions.forEach((contribution) => {
      const chain = game.chains.find(
        (candidate) => candidate.id === contribution.chainId
      );
      if (chain) {
        chain.contributions.push(contribution);
      }
    });

    game.lastRoundEndReason = reason;

    if (game.roundIndex + 1 >= game.totalRounds) {
      game.status = "results";
      game.finishedAt = Date.now();
      game.roundStartedAt = null;
      game.roundEndsAt = null;
      emitRoomState(room);
      emitGameStates(room);
      return;
    }

    game.roundIndex += 1;
    beginRound(room);
  }

  function createPartySequence(settings) {
    const enabledGameIds = settings.enabledGameIds.filter((gameId) =>
      PLAYABLE_GAME_IDS.includes(gameId)
    );
    const gameIds = [];

    for (let index = 0; index < settings.partyGameCount; index += 1) {
      const previousGameId = gameIds[index - 1] || null;
      const candidates =
        enabledGameIds.length > 1
          ? enabledGameIds.filter((gameId) => gameId !== previousGameId)
          : enabledGameIds;
      gameIds.push(candidates[randomInt(candidates.length)]);
    }

    return { gameIds, currentIndex: 0 };
  }

  function prepareRoomGame(room) {
    const settings = getRoomGameSettings(room, room.selectedGameId);
    if (room.selectedGameId === PARTY_GAME_ID) {
      room.partySession = createPartySequence(settings);
      return createGame(
        room,
        room.partySession.gameIds[0],
        settings
      );
    }

    room.partySession = null;
    return createGame(room, room.selectedGameId, settings);
  }

  function createGame(
    room,
    requestedGameId = room.selectedGameId,
    requestedSettings = null
  ) {
    const orderedPlayers = Array.from(room.players.values()).sort(
      (first, second) => first.joinOrder - second.joinOrder
    );
    const resolvedGame =
      findRoomGame(requestedGameId) || getResolvedRoomGame(room);
    const gameId = resolvedGame.id;
    const settings =
      requestedSettings || getRoomGameSettings(room, requestedGameId);
    const participants = orderedPlayers.map((player) => ({
      id: player.participantId,
      nickname: player.nickname,
      avatarId: player.avatarId,
      connected: true,
      socketId: player.id
    }));
    const chains = participants.map((participant) => ({
      id: crypto.randomUUID(),
      ownerId: participant.id,
      ownerNickname: participant.nickname,
      ownerAvatarId: participant.avatarId,
      contributions: []
    }));
    const maxRounds = getMaxRoundsForGame(gameId, participants.length);
    const totalRounds = Math.max(
      1,
      Math.min(
        settings.roundCount === null ? maxRounds : settings.roundCount,
        maxRounds
      )
    );
    const roundSpecs =
      gameId === LEAGUE_OF_NAABS_GAME_ID
        ? LEAGUE_OF_NAABS_STEPS.slice(0, totalRounds)
        : [];
    const activeTypes =
      gameId === LEAGUE_OF_NAABS_GAME_ID
        ? [...new Set(roundSpecs.map((step) => step.type))]
        : [...settings.inputTypes];
    const generatedPlans =
      gameId === LEAGUE_OF_NAABS_GAME_ID
        ? chains.map(() => roundSpecs.map((step) => step.type))
        : createTypePlan(
            chains.length,
            totalRounds,
            activeTypes,
            randomInt
          );
    const typePlans = new Map(
      chains.map((chain, index) => [chain.id, generatedPlans[index]])
    );

    return {
      status: "countdown",
      gameId,
      gameName: resolvedGame.name,
      participants,
      participantOrder: participants.map((participant) => participant.id),
      chains,
      activeTypes,
      roundSpecs,
      typePlans,
      roundIndex: 0,
      totalRounds,
      roundStartedAt: null,
      roundEndsAt: null,
      roundSubmissions: new Map(),
      roundDrafts: new Map(),
      roundTimer: null,
      countdownTimer: null,
      countdownEndsAt: null,
      finalizing: false,
      resultChainIndex: 0,
      resultContributionIndex: 0,
      partyIndex: room.partySession ? room.partySession.currentIndex : null,
      partyCount: room.partySession ? room.partySession.gameIds.length : null
    };
  }

  function normalizeGameSettings(payload, playerCount, gameId) {
    if (!payload || typeof payload !== "object") {
      return { error: "Paramètres de partie invalides." };
    }

    const maxRounds = getMaxRoundsForGame(gameId, playerCount);
    let roundCount = null;
    if (
      payload.roundCount !== null &&
      payload.roundCount !== undefined &&
      payload.roundCount !== "auto"
    ) {
      roundCount = Number(payload.roundCount);
      if (
        !Number.isInteger(roundCount) ||
        roundCount < 1 ||
        roundCount > maxRounds
      ) {
        return {
          error: `Le nombre de manches doit être compris entre 1 et ${maxRounds}.`
        };
      }
    }

    const requestedInputTypes = Array.isArray(payload.inputTypes)
      ? payload.inputTypes
      : selectActiveContributionTypes(
          Number(payload.inputTypeCount) || DEFAULT_INPUT_TYPE_COUNT,
          randomInt
        );
    const inputTypes = [
      ...new Set(
        requestedInputTypes.filter((type) =>
          CONTRIBUTION_TYPE_VALUES.includes(type)
        )
      )
    ];
    if (inputTypes.length < 1) {
      return {
        error: "Au moins un type de contribution doit rester activé."
      };
    }

    const partyGameCount = Number(
      payload.partyGameCount || DEFAULT_PARTY_GAME_COUNT
    );
    if (
      !Number.isInteger(partyGameCount) ||
      partyGameCount < 1 ||
      partyGameCount > MAX_PARTY_GAME_COUNT
    ) {
      return {
        error: `Le nombre de jeux de la Party doit être compris entre 1 et ${MAX_PARTY_GAME_COUNT}.`
      };
    }

    const requestedEnabledGameIds = Array.isArray(payload.enabledGameIds)
      ? payload.enabledGameIds
      : PLAYABLE_GAME_IDS;
    const enabledGameIds = [
      ...new Set(
        requestedEnabledGameIds.filter((id) => PLAYABLE_GAME_IDS.includes(id))
      )
    ];
    if (gameId === PARTY_GAME_ID && enabledGameIds.length < 1) {
      return { error: "La Party doit contenir au moins un jeu." };
    }

    return {
      roundCount,
      inputTypes,
      inputTypeCount: inputTypes.length,
      partyGameCount,
      enabledGameIds: gameId === PARTY_GAME_ID ? enabledGameIds : []
    };
  }

  function parseJsonObject(value) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function isValidAudioDataUrl(value) {
    return (
      typeof value === "string" &&
      /^data:audio\/[a-z0-9.+-]+(?:;[^,]*)*;base64,[a-z0-9+/=]+$/i.test(
        value
      )
    );
  }

  function normalizeLeagueSpellKitContent(content, allowEmpty) {
    if (allowEmpty && content === "") {
      return { type: CONTRIBUTION_TYPES.TEXT, content: "" };
    }

    const parsed = parseJsonObject(content);
    const spells = parsed && Array.isArray(parsed.spells)
      ? parsed.spells
      : null;

    if (!spells || spells.length !== 4) {
      return { error: "Le kit doit contenir exactement 4 sorts." };
    }

    const normalizedSpells = spells.map((spell) =>
      typeof spell === "string" ? spell.trim() : ""
    );
    if (!allowEmpty && normalizedSpells.some((spell) => !spell)) {
      return { error: "Renseignez les 3 sorts et l'ulti avant de valider." };
    }

    const totalLength = normalizedSpells.join("").length;
    if (totalLength > MAX_TEXT_LENGTH) {
      return {
        error: `Le kit de sorts doit rester sous ${MAX_TEXT_LENGTH} caractères.`
      };
    }

    return {
      type: CONTRIBUTION_TYPES.TEXT,
      content: JSON.stringify({ spells: normalizedSpells })
    };
  }

  function normalizeLeagueQuotePackContent(content, allowEmpty) {
    if (allowEmpty && content === "") {
      return { type: CONTRIBUTION_TYPES.AUDIO, content: "" };
    }

    const parsed = parseJsonObject(content);
    const quotes = parsed && Array.isArray(parsed.quotes)
      ? parsed.quotes
      : null;

    if (!quotes || quotes.length !== 4) {
      return { error: "Les répliques doivent contenir exactement 4 audios." };
    }

    const normalizedQuotes = quotes.map((quote) =>
      typeof quote === "string" ? quote : ""
    );
    if (!allowEmpty && normalizedQuotes.some((quote) => !quote)) {
      return { error: "Enregistrez les 4 répliques avant de valider." };
    }

    const totalLength = normalizedQuotes.join("").length;
    if (totalLength > MAX_MEDIA_DATA_LENGTH) {
      return { error: "Les enregistrements envoyés sont trop volumineux." };
    }

    if (
      normalizedQuotes.some(
        (quote) => quote && !isValidAudioDataUrl(quote)
      )
    ) {
      return { error: "Une des répliques audio est invalide." };
    }

    return {
      type: CONTRIBUTION_TYPES.AUDIO,
      content: JSON.stringify({ quotes: normalizedQuotes })
    };
  }

  function normalizeContribution(
    payload,
    expectedType,
    roundIndex,
    roundSpec = null,
    allowEmpty = false
  ) {
    if (!payload || typeof payload !== "object") {
      return { error: "Contribution invalide." };
    }

    if (payload.roundIndex !== roundIndex) {
      return { error: "Cette contribution appartient à une autre manche." };
    }

    const type =
      typeof payload.type === "string" ? payload.type.toLowerCase() : "";
    if (!Object.values(CONTRIBUTION_TYPES).includes(type)) {
      return { error: "Type de contribution invalide." };
    }

    if (expectedType && type !== expectedType) {
      return {
        error: `Cette manche attend une contribution de type ${expectedType}.`
      };
    }

    if (typeof payload.content !== "string") {
      return { error: "Le contenu de la contribution est invalide." };
    }

    if (
      roundSpec &&
      roundSpec.key === "spell-kit" &&
      type === CONTRIBUTION_TYPES.TEXT
    ) {
      return normalizeLeagueSpellKitContent(payload.content, allowEmpty);
    }

    if (
      roundSpec &&
      roundSpec.key === "quote-pack" &&
      type === CONTRIBUTION_TYPES.AUDIO
    ) {
      return normalizeLeagueQuotePackContent(payload.content, allowEmpty);
    }

    if (type === CONTRIBUTION_TYPES.TEXT) {
      const content = payload.content.trim();
      const length = Array.from(content).length;
      if ((!allowEmpty && length < 1) || length > MAX_TEXT_LENGTH) {
        return {
          error: `Le texte doit contenir entre 1 et ${MAX_TEXT_LENGTH} caractères.`
        };
      }
      return { type, content };
    }

    if (allowEmpty && payload.content === "") {
      return { type, content: "" };
    }

    if (payload.content.length > MAX_MEDIA_DATA_LENGTH) {
      return { error: "Le fichier envoyé est trop volumineux." };
    }

    if (
      type === CONTRIBUTION_TYPES.DRAWING &&
      !/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(payload.content)
    ) {
      return { error: "Le dessin doit être une image PNG valide." };
    }

    if (
      type === CONTRIBUTION_TYPES.AUDIO &&
      !isValidAudioDataUrl(payload.content)
    ) {
      return { error: "L'enregistrement audio est invalide." };
    }

    return { type, content: payload.content };
  }

  function removePlayerFromRoom(socket, shouldLeaveSocketRoom) {
    const roomCode = socket.data.roomCode;

    if (!roomCode) {
      return false;
    }

    const room = rooms.get(roomCode);
    const participantId = socket.data.participantId;
    socket.data.roomCode = null;
    socket.data.nickname = null;
    socket.data.avatarId = null;
    socket.data.participantId = null;

    if (shouldLeaveSocketRoom) {
      socket.leave(roomCode);
    }

    if (!room || !room.players.delete(socket.id)) {
      return false;
    }

    if (room.gameVotes && participantId) {
      room.gameVotes.delete(participantId);
    }

    if (room.game && participantId) {
      const participant = getGameParticipant(room.game, participantId);
      if (participant && participant.socketId === socket.id) {
        participant.connected = false;
        participant.socketId = null;
      }

      if (
        room.game.status === "playing" &&
        !room.game.roundSubmissions.has(participantId)
      ) {
        addFallbackSubmission(room.game, participantId);
      }
    }

    if (room.players.size === 0) {
      clearGameTimers(room.game);
      rooms.delete(roomCode);
      return true;
    }

    if (room.hostId === socket.id) {
      room.hostId = findLongestConnectedPlayer(room).id;
      const newHost = room.players.get(room.hostId);
      if (room.gameVotes && newHost) {
        room.gameVotes.delete(newHost.participantId);
      }
    }

    if (!room.game && room.gameSettings) {
      room.gameSettings.forEach((settings, gameId) => {
        const resolvedGame = getResolvedRoomGameForId(gameId);
        const maxRounds = getMaxRoundsForGame(
          resolvedGame.id,
          room.players.size
        );
        if (
          settings.roundCount !== null &&
          settings.roundCount > maxRounds
        ) {
          settings.roundCount = maxRounds;
        }
      });
      room.settings = getRoomGameSettings(room);
    }

    emitRoomState(room);
    emitGameStates(room);

    if (
      room.game &&
      room.game.status === "playing" &&
      allPlayersSubmitted(room.game)
    ) {
      finalizeRound(room, "all-submitted");
    }

    return true;
  }

  function answer(socket, acknowledgment, result) {
    if (typeof acknowledgment === "function") {
      acknowledgment(result);
      return;
    }

    if (!result.ok) {
      socket.emit("roomError", { message: result.error });
    }
  }

  io.on("connection", (socket) => {
    socket.data.roomCode = null;
    socket.data.nickname = null;
    socket.data.avatarId = null;
    socket.data.participantId = null;

    socket.on("createRoom", async (payload, acknowledgment) => {
      if (socket.data.roomCode) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Vous êtes déjà dans une partie."
        });
        return;
      }

      const nickname = normalizeNickname(payload && payload.nickname);
      if (!nickname) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Le pseudonyme doit contenir entre 2 et 20 caractères."
        });
        return;
      }
      const avatarId = normalizeAvatarId(payload && payload.avatarId);
      if (!avatarId) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Cet avatar n'est pas disponible."
        });
        return;
      }
      const hasCustomRoomName = Boolean(
        payload &&
          Object.prototype.hasOwnProperty.call(payload, "roomName")
      );
      const customRoomName = hasCustomRoomName
        ? normalizeRoomName(payload.roomName)
        : null;
      if (hasCustomRoomName && !customRoomName) {
        answer(socket, acknowledgment, {
          ok: false,
          error: `Le nom de la room doit contenir entre ${MIN_ROOM_NAME_LENGTH} et ${MAX_ROOM_NAME_LENGTH} caractères.`
        });
        return;
      }

      const roomCode = generateRoomCode();
      const player = createPlayer(socket, nickname, avatarId);
      const room = {
        code: roomCode,
        customName: customRoomName,
        hostId: socket.id,
        selectedGameId: DEFAULT_ROOM_GAME_ID,
        gameVotes: new Map(),
        players: new Map([[socket.id, player]]),
        settings: createDefaultGameSettings(DEFAULT_ROOM_GAME_ID),
        gameSettings: new Map([
          [
            DEFAULT_ROOM_GAME_ID,
            createDefaultGameSettings(DEFAULT_ROOM_GAME_ID)
          ]
        ]),
        partySession: null,
        game: null,
        chatMessages: []
      };

      rooms.set(roomCode, room);
      socket.data.roomCode = roomCode;
      socket.data.nickname = nickname;
      socket.data.avatarId = player.avatarId;
      socket.data.participantId = player.participantId;
      await socket.join(roomCode);

      const roomState = serializeRoom(room);
      answer(socket, acknowledgment, { ok: true, room: roomState });
      emitRoomState(room);
    });

    socket.on("joinRoom", async (payload, acknowledgment) => {
      if (socket.data.roomCode) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Vous êtes déjà dans une partie."
        });
        return;
      }

      const nickname = normalizeNickname(payload && payload.nickname);
      if (!nickname) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Le pseudonyme doit contenir entre 2 et 20 caractères."
        });
        return;
      }
      const requestedAvatarId = normalizeAvatarId(
        payload && payload.avatarId
      );
      if (!requestedAvatarId) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Cet avatar n'est pas disponible."
        });
        return;
      }

      const roomCode = normalizeRoomCode(payload && payload.code);
      if (!roomCode) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Le code de partie doit contenir 6 caractères valides."
        });
        return;
      }

      const room = rooms.get(roomCode);
      if (!room) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Cette partie n'existe pas ou n'est plus disponible."
        });
        return;
      }

      if (nicknameExists(room, nickname)) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Ce pseudonyme est déjà utilisé dans cette partie."
        });
        return;
      }

      let player;
      if (room.game) {
        const participant = findGameParticipantByNickname(room.game, nickname);
        if (!participant) {
          answer(socket, acknowledgment, {
            ok: false,
            error: "La partie a déjà commencé."
          });
          return;
        }

        if (participant.connected) {
          answer(socket, acknowledgment, {
            ok: false,
            error: "Ce joueur est déjà connecté."
          });
          return;
        }

        player = createPlayer(
          socket,
          participant.nickname,
          participant.avatarId,
          participant.id
        );
        participant.connected = true;
        participant.socketId = socket.id;
      } else {
        if (room.players.size >= MAX_PLAYERS) {
          answer(socket, acknowledgment, {
            ok: false,
            error: "Cette partie est pleine (10 joueurs maximum)."
          });
          return;
        }

        player = createPlayer(socket, nickname, requestedAvatarId);
      }

      room.players.set(socket.id, player);
      socket.data.roomCode = roomCode;
      socket.data.nickname = player.nickname;
      socket.data.avatarId = player.avatarId;
      socket.data.participantId = player.participantId;
      await socket.join(roomCode);

      const roomState = serializeRoom(room);
      answer(socket, acknowledgment, { ok: true, room: roomState });
      emitRoomState(room);
      emitGameStateToSocket(room, socket.id, player.participantId);
    });

    socket.on("selectRoomGame", (payload, acknowledgment) => {
      const room = rooms.get(socket.data.roomCode);
      const player = room && room.players.get(socket.id);
      const selectedGameId = normalizeRoomGameId(payload && payload.gameId);

      if (!room || !player) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "La room n'existe plus."
        });
        return;
      }

      if (room.game) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Le jeu est déjà lancé, rangez le menu Smash."
        });
        return;
      }

      if (!selectedGameId) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Ce jeu n'est pas encore disponible."
        });
        return;
      }

      if (room.hostId !== socket.id) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Seul l'hôte choisit le jeu officiel. Vous pouvez voter."
        });
        return;
      }

      room.selectedGameId = selectedGameId;
      room.settings = getRoomGameSettings(room, selectedGameId);
      answer(socket, acknowledgment, {
        ok: true,
        gameSelection: serializeGameSelection(room),
        settings: serializeSettings(room)
      });
      emitRoomState(room);
    });

    socket.on("voteRoomGame", (payload, acknowledgment) => {
      const room = rooms.get(socket.data.roomCode);
      const player = room && room.players.get(socket.id);
      const gameId = normalizeRoomGameId(payload && payload.gameId);

      if (!room || !player) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "La room n'existe plus."
        });
        return;
      }

      if (room.game) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Le jeu est déjà lancé, le vote part à la poubelle cosmique."
        });
        return;
      }

      if (room.hostId === socket.id) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "L'hôte choisit le jeu officiel au lieu de voter."
        });
        return;
      }

      if (!gameId) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Ce jeu n'est pas encore disponible."
        });
        return;
      }

      room.gameVotes.set(player.participantId, gameId);
      answer(socket, acknowledgment, {
        ok: true,
        gameVotes: serializeGameVotes(room)
      });
      emitRoomState(room);
    });

    socket.on("updateGameSettings", (payload, acknowledgment) => {
      const room = rooms.get(socket.data.roomCode);
      if (!room) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "La room n'existe plus."
        });
        return;
      }

      if (room.hostId !== socket.id) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Seul l'hôte peut modifier les paramètres de la partie."
        });
        return;
      }

      if (room.game) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Les paramètres ne peuvent plus changer après le lancement."
        });
        return;
      }

      const targetGameId =
        normalizeRoomGameId(payload && payload.gameId) ||
        room.selectedGameId;
      if (targetGameId !== room.selectedGameId) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Ces paramètres ne correspondent pas au jeu sélectionné."
        });
        return;
      }

      const normalized = normalizeGameSettings(
        payload,
        room.players.size,
        targetGameId
      );
      if (normalized.error) {
        answer(socket, acknowledgment, {
          ok: false,
          error: normalized.error
        });
        return;
      }

      room.gameSettings.set(targetGameId, normalized);
      room.settings = getRoomGameSettings(room, targetGameId);
      answer(socket, acknowledgment, {
        ok: true,
        settings: serializeRoom(room).settings
      });
      emitRoomState(room);
    });

    socket.on("startGame", (acknowledgment) => {
      const room = rooms.get(socket.data.roomCode);
      if (!room) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "La room n'existe plus."
        });
        return;
      }

      if (room.hostId !== socket.id) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Seul l'hôte peut lancer la partie."
        });
        return;
      }

      if (room.game) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Une partie est déjà en cours."
        });
        return;
      }

      if (room.players.size < MIN_PLAYERS_TO_START) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Il faut au moins 2 joueurs pour lancer la partie."
        });
        return;
      }

      room.gameVotes.clear();
      room.game = prepareRoomGame(room);
      answer(socket, acknowledgment, { ok: true });
      beginGameCountdown(room);
    });

    socket.on("submitContribution", (payload, acknowledgment) => {
      const room = rooms.get(socket.data.roomCode);
      const game = room && room.game;
      const participantId = socket.data.participantId;

      if (!room || !game || game.status !== "playing") {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Aucune manche n'est en cours."
        });
        return;
      }

      if (Date.now() < game.roundStartedAt) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "La manche commence après l'aperçu."
        });
        return;
      }

      if (!game.participantOrder.includes(participantId)) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Vous ne participez pas à cette partie."
        });
        return;
      }

      if (game.roundSubmissions.has(participantId)) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Votre contribution pour cette manche est déjà validée."
        });
        return;
      }

      const assignment = getAssignment(game, participantId);
      const normalized = normalizeContribution(
        payload,
        assignment.expectedType,
        game.roundIndex,
        assignment.roundSpec
      );

      if (normalized.error) {
        answer(socket, acknowledgment, {
          ok: false,
          error: normalized.error
        });
        return;
      }

      const participant = getGameParticipant(game, participantId);
      game.roundSubmissions.set(participantId, {
        roundIndex: game.roundIndex,
        participantId,
        nickname: participant.nickname,
        avatarId: participant.avatarId,
        chainId: assignment.chain.id,
        type: normalized.type,
        content: normalized.content,
        stepKey: assignment.roundSpec && assignment.roundSpec.key,
        stepLabel: assignment.roundSpec && assignment.roundSpec.label,
        empty: false,
        submittedAt: Date.now()
      });
      game.roundDrafts.delete(participantId);

      answer(socket, acknowledgment, { ok: true });
      emitRoomState(room);
      emitGameStates(room);

      if (allPlayersSubmitted(game)) {
        finalizeRound(room, "all-submitted");
      }
    });

    socket.on("saveDraft", (payload, acknowledgment) => {
      const room = rooms.get(socket.data.roomCode);
      const game = room && room.game;
      const participantId = socket.data.participantId;

      if (!room || !game || game.status !== "playing") {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Aucune manche n'est en cours."
        });
        return;
      }

      if (Date.now() < game.roundStartedAt) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Le brouillon sera enregistré après l'aperçu."
        });
        return;
      }

      if (
        !game.participantOrder.includes(participantId) ||
        game.roundSubmissions.has(participantId)
      ) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Ce brouillon ne peut plus être enregistré."
        });
        return;
      }

      const assignment = getAssignment(game, participantId);
      const normalized = normalizeContribution(
        payload,
        assignment.expectedType,
        game.roundIndex,
        assignment.roundSpec,
        true
      );

      if (normalized.error) {
        answer(socket, acknowledgment, {
          ok: false,
          error: normalized.error
        });
        return;
      }

      if (!normalized.content) {
        game.roundDrafts.delete(participantId);
      } else {
        const participant = getGameParticipant(game, participantId);
        game.roundDrafts.set(participantId, {
          roundIndex: game.roundIndex,
          participantId,
          nickname: participant.nickname,
          avatarId: participant.avatarId,
          chainId: assignment.chain.id,
          type: normalized.type,
          content: normalized.content,
          stepKey: assignment.roundSpec && assignment.roundSpec.key,
          stepLabel: assignment.roundSpec && assignment.roundSpec.label,
          empty: false,
          savedAt: Date.now()
        });
      }

      answer(socket, acknowledgment, { ok: true });
    });

    socket.on("sendChatMessage", (payload, acknowledgment) => {
      const room = rooms.get(socket.data.roomCode);
      const player = room && room.players.get(socket.id);
      const content =
        payload && typeof payload.content === "string"
          ? payload.content.trim()
          : "";
      const length = Array.from(content).length;

      if (!room || !player) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "La room n'existe plus."
        });
        return;
      }

      if (length < 1 || length > MAX_CHAT_MESSAGE_LENGTH) {
        answer(socket, acknowledgment, {
          ok: false,
          error: `Le message doit contenir entre 1 et ${MAX_CHAT_MESSAGE_LENGTH} caractères.`
        });
        return;
      }

      const message = {
        id: crypto.randomUUID(),
        nickname: player.nickname,
        avatarId: player.avatarId,
        content,
        sentAt: Date.now()
      };
      room.chatMessages.push(message);
      if (room.chatMessages.length > MAX_CHAT_MESSAGES) {
        room.chatMessages.splice(
          0,
          room.chatMessages.length - MAX_CHAT_MESSAGES
        );
      }

      answer(socket, acknowledgment, { ok: true, message });
      io.to(room.code).emit("chatMessage", message);
    });

    socket.on("navigateResults", (payload, acknowledgment) => {
      const room = rooms.get(socket.data.roomCode);
      const game = room && room.game;

      if (!room || !game || game.status !== "results") {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Les résultats ne sont pas disponibles."
        });
        return;
      }

      if (room.hostId !== socket.id) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Seul l'hôte peut faire défiler le résumé."
        });
        return;
      }

      const direction = Number(payload && payload.direction);
      if (![1, -1].includes(direction)) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Direction de navigation invalide."
        });
        return;
      }

      if (direction === 1) {
        const currentChain = game.chains[game.resultChainIndex];
        if (
          game.resultContributionIndex <
          getResultStepCountForChain(game, currentChain) - 1
        ) {
          game.resultContributionIndex += 1;
        } else if (game.resultChainIndex < game.chains.length - 1) {
          game.resultChainIndex += 1;
          game.resultContributionIndex = 0;
        } else if (
          room.partySession &&
          room.partySession.currentIndex <
            room.partySession.gameIds.length - 1
        ) {
          clearGameTimers(game);
          room.partySession.currentIndex += 1;
          const partySettings = getRoomGameSettings(room, PARTY_GAME_ID);
          room.game = createGame(
            room,
            room.partySession.gameIds[room.partySession.currentIndex],
            partySettings
          );
          answer(socket, acknowledgment, {
            ok: true,
            advancedParty: true
          });
          beginGameCountdown(room);
          return;
        }
      } else if (game.resultContributionIndex > 0) {
        game.resultContributionIndex -= 1;
      } else if (game.resultChainIndex > 0) {
        game.resultChainIndex -= 1;
        game.resultContributionIndex =
          getResultStepCountForChain(
            game,
            game.chains[game.resultChainIndex]
          ) - 1;
      }
      answer(socket, acknowledgment, {
        ok: true,
        currentChainIndex: game.resultChainIndex,
        currentContributionIndex: game.resultContributionIndex
      });
      emitGameStates(room);
    });

    socket.on("returnToLobby", (acknowledgment) => {
      const room = rooms.get(socket.data.roomCode);
      if (!room || !room.game || room.game.status !== "results") {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Les résultats ne sont pas disponibles."
        });
        return;
      }

      if (room.hostId !== socket.id) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Seul l'hôte peut terminer le résumé."
        });
        return;
      }

      clearGameTimers(room.game);
      room.game = null;
      room.partySession = null;
      answer(socket, acknowledgment, { ok: true });
      emitRoomState(room);
    });

    socket.on("restartGame", (acknowledgment) => {
      const room = rooms.get(socket.data.roomCode);
      if (!room || !room.game || room.game.status !== "results") {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Les résultats ne sont pas disponibles."
        });
        return;
      }

      if (room.hostId !== socket.id) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Seul l'hôte peut relancer une partie."
        });
        return;
      }

      if (room.players.size < MIN_PLAYERS_TO_START) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Il faut au moins 2 joueurs pour relancer une partie."
        });
        return;
      }

      clearGameTimers(room.game);
      room.game = prepareRoomGame(room);
      answer(socket, acknowledgment, { ok: true });
      beginGameCountdown(room);
    });

    socket.on("leaveRoom", (acknowledgment) => {
      const removed = removePlayerFromRoom(socket, true);
      answer(socket, acknowledgment, {
        ok: removed,
        error: removed ? undefined : "Vous n'êtes dans aucune partie."
      });
    });

    socket.on("disconnect", () => {
      removePlayerFromRoom(socket, false);
    });
  });

  function start(port = 3000, host = "0.0.0.0") {
    return new Promise((resolve, reject) => {
      const handleError = (error) => {
        httpServer.off("listening", handleListening);
        reject(error);
      };
      const handleListening = () => {
        httpServer.off("error", handleError);
        resolve(httpServer.address());
      };

      httpServer.once("error", handleError);
      httpServer.once("listening", handleListening);
      httpServer.listen(port, host);
    });
  }

  function stop() {
    rooms.forEach((room) => clearGameTimers(room.game));

    return new Promise((resolve) => {
      io.close(() => {
        if (!httpServer.listening) {
          resolve();
          return;
        }

        httpServer.close(() => resolve());
      });
    });
  }

  return {
    app,
    httpServer,
    io,
    rooms,
    start,
    stop
  };
}

if (require.main === module) {
  const port = Number.parseInt(process.env.PORT, 10) || 3000;
  const gameServer = createGameServer();

  gameServer
    .start(port, "0.0.0.0")
    .then(() => {
      console.log(`Serveur démarré sur le port ${port}.`);
    })
    .catch((error) => {
      console.error("Impossible de démarrer le serveur :", error);
      process.exitCode = 1;
    });
}

module.exports = {
  AVATAR_IDS,
  CONTRIBUTION_TYPES,
  GAME_COUNTDOWN_MS,
  KAMOULOX_GAME_ID,
  LEAGUE_OF_NAABS_GAME_ID,
  LEAGUE_OF_NAABS_OPTIMAL_PLAYER_COUNT,
  LEAGUE_OF_NAABS_REVEAL_STEPS_PER_CHAMPION,
  LEAGUE_OF_NAABS_STEPS,
  MAX_PLAYERS,
  PARTY_GAME_ID,
  PLAYABLE_GAME_IDS,
  ROUND_DURATION_MS,
  ROUND_PREVIEW_MS,
  ROOM_GAMES,
  ROOM_CODE_CHARACTERS,
  createTypePlan,
  createGameServer,
  getAssignedChainIndex,
  getAssignedChainIndexForGame,
  getLeagueOfNaabsAssignedChainIndex,
  getExpectedContributionType,
  selectActiveContributionTypes
};
