"use strict";

require("dotenv").config();

const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const cors = require("cors");
const express = require("express");
const { Server } = require("socket.io");

const MAX_PLAYERS = 10;
const MIN_PLAYERS_TO_START = 2;
const ROUND_DURATION_MS = 60000;
const MAX_TEXT_LENGTH = 500;
const MAX_MEDIA_DATA_LENGTH = 1500000;
const ROOM_CODE_LENGTH = 6;
const DEFAULT_INPUT_TYPE_COUNT = 3;
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
  const isDevelopment = nodeEnv !== "production";
  const roundDurationMs =
    Number.isFinite(options.roundDurationMs) && options.roundDurationMs > 0
      ? options.roundDurationMs
      : ROUND_DURATION_MS;
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

  function createPlayer(socket, nickname, participantId = crypto.randomUUID()) {
    return {
      id: socket.id,
      participantId,
      nickname,
      joinedAt: Date.now(),
      joinOrder: joinSequence++
    };
  }

  function serializeRoom(room) {
    const automaticRoundCount = Math.max(
      1,
      Math.min(room.players.size, MAX_PLAYERS)
    );

    return {
      code: room.code,
      hostId: room.hostId,
      phase: room.game ? room.game.status : "lobby",
      playerCount: room.players.size,
      maxPlayers: MAX_PLAYERS,
      minPlayersToStart: MIN_PLAYERS_TO_START,
      settings: {
        roundCount: room.settings.roundCount,
        effectiveRoundCount:
          room.settings.roundCount === null
            ? automaticRoundCount
            : Math.min(room.settings.roundCount, automaticRoundCount),
        inputTypeCount: room.settings.inputTypeCount
      },
      players: Array.from(room.players.values())
        .sort((first, second) => first.joinOrder - second.joinOrder)
        .map((player) => ({
          id: player.id,
          nickname: player.nickname,
          isHost: player.id === room.hostId
        }))
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

    const chainIndex = getAssignedChainIndex(
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

    return {
      chain,
      previousContribution,
      expectedType
    };
  }

  function getPrompt(expectedType, previousType) {
    if (!expectedType) {
      return "Aucune contribution n'est attendue.";
    }

    if (expectedType === CONTRIBUTION_TYPES.AUDIO) {
      return previousType
        ? "Enregistre un son inspiré de ce que tu viens de recevoir."
        : "Commence cette chaîne par un son de dix secondes.";
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
      type: contribution.type,
      content: contribution.content,
      empty: contribution.empty
    };
  }

  function serializeResults(room, participantId) {
    const game = room.game;
    const player = Array.from(room.players.values()).find(
      (candidate) => candidate.participantId === participantId
    );

    return {
      phase: "results",
      roomCode: room.code,
      serverNow: Date.now(),
      currentChainIndex: game.resultChainIndex,
      canControlResults: Boolean(player && player.id === room.hostId),
      chains: game.chains.map((chain) => ({
        id: chain.id,
        ownerNickname: chain.ownerNickname,
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
      roundEndsAt: game.roundEndsAt,
      serverNow: Date.now(),
      submitted: game.roundSubmissions.has(participantId),
      submittedCount: game.roundSubmissions.size,
      participantCount: game.participants.length,
      assignment: {
        chainId: assignment.chain.id,
        expectedType: assignment.expectedType,
        allowedTypes: [assignment.expectedType],
        prompt: getPrompt(
          assignment.expectedType,
          assignment.previousContribution &&
            assignment.previousContribution.type
        ),
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
  }

  function createEmptyContribution(game, participantId) {
    const participant = getGameParticipant(game, participantId);
    const assignment = getAssignment(game, participantId);
    const type = assignment.expectedType || CONTRIBUTION_TYPES.TEXT;

    return {
      roundIndex: game.roundIndex,
      participantId,
      nickname: participant.nickname,
      chainId: assignment.chain.id,
      type,
      content: "",
      empty: true,
      submittedAt: Date.now()
    };
  }

  function addEmptySubmission(game, participantId) {
    if (game.roundSubmissions.has(participantId)) {
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
    game.roundStartedAt = Date.now();
    game.roundEndsAt = game.roundStartedAt + roundDurationMs;

    game.participants.forEach((participant) => {
      if (!participant.connected) {
        addEmptySubmission(game, participant.id);
      }
    });

    game.roundTimer = setTimeout(() => {
      finalizeRound(room, "timer");
    }, roundDurationMs);

    emitRoomState(room);
    emitGameStates(room);

    if (allPlayersSubmitted(game)) {
      finalizeRound(room, "disconnections");
    }
  }

  function finalizeRound(room, reason) {
    const game = room.game;
    if (!game || game.status !== "playing" || game.finalizing) {
      return;
    }

    game.finalizing = true;
    clearGameTimers(game);

    game.participantOrder.forEach((participantId) => {
      addEmptySubmission(game, participantId);
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

  function createGame(room) {
    const orderedPlayers = Array.from(room.players.values()).sort(
      (first, second) => first.joinOrder - second.joinOrder
    );
    const participants = orderedPlayers.map((player) => ({
      id: player.participantId,
      nickname: player.nickname,
      connected: true,
      socketId: player.id
    }));
    const chains = participants.map((participant) => ({
      id: crypto.randomUUID(),
      ownerId: participant.id,
      ownerNickname: participant.nickname,
      contributions: []
    }));
    const totalRounds = Math.max(
      1,
      Math.min(
        room.settings.roundCount === null
          ? participants.length
          : room.settings.roundCount,
        participants.length
      )
    );
    const activeTypes = selectActiveContributionTypes(
      room.settings.inputTypeCount,
      randomInt
    );
    const generatedPlans = createTypePlan(
      chains.length,
      totalRounds,
      activeTypes,
      randomInt
    );
    const typePlans = new Map(
      chains.map((chain, index) => [chain.id, generatedPlans[index]])
    );

    return {
      status: "playing",
      participants,
      participantOrder: participants.map((participant) => participant.id),
      chains,
      activeTypes,
      typePlans,
      roundIndex: 0,
      totalRounds,
      roundStartedAt: null,
      roundEndsAt: null,
      roundSubmissions: new Map(),
      roundTimer: null,
      finalizing: false,
      resultChainIndex: 0
    };
  }

  function normalizeGameSettings(payload, playerCount) {
    if (!payload || typeof payload !== "object") {
      return { error: "Paramètres de partie invalides." };
    }

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
        roundCount > Math.min(playerCount, MAX_PLAYERS)
      ) {
        return {
          error: `Le nombre de manches doit être compris entre 1 et ${Math.min(
            playerCount,
            MAX_PLAYERS
          )}.`
        };
      }
    }

    const inputTypeCount = Number(payload.inputTypeCount);
    if (
      !Number.isInteger(inputTypeCount) ||
      inputTypeCount < 1 ||
      inputTypeCount > CONTRIBUTION_TYPE_VALUES.length
    ) {
      return {
        error: "Le nombre de types disponibles doit être compris entre 1 et 3."
      };
    }

    return { roundCount, inputTypeCount };
  }

  function normalizeContribution(payload, expectedType, roundIndex) {
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

    if (type === CONTRIBUTION_TYPES.TEXT) {
      const content = payload.content.trim();
      const length = Array.from(content).length;
      if (length < 1 || length > MAX_TEXT_LENGTH) {
        return {
          error: `Le texte doit contenir entre 1 et ${MAX_TEXT_LENGTH} caractères.`
        };
      }
      return { type, content };
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
      !/^data:audio\/[a-z0-9.+-]+(?:;[^,]*)*;base64,[a-z0-9+/=]+$/i.test(
        payload.content
      )
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
    socket.data.participantId = null;

    if (shouldLeaveSocketRoom) {
      socket.leave(roomCode);
    }

    if (!room || !room.players.delete(socket.id)) {
      return false;
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
        addEmptySubmission(room.game, participantId);
      }
    }

    if (room.players.size === 0) {
      clearGameTimers(room.game);
      rooms.delete(roomCode);
      return true;
    }

    if (room.hostId === socket.id) {
      room.hostId = findLongestConnectedPlayer(room).id;
    }

    if (
      !room.game &&
      room.settings.roundCount !== null &&
      room.settings.roundCount > room.players.size
    ) {
      room.settings.roundCount = Math.max(1, room.players.size);
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

      const roomCode = generateRoomCode();
      const player = createPlayer(socket, nickname);
      const room = {
        code: roomCode,
        hostId: socket.id,
        players: new Map([[socket.id, player]]),
        settings: {
          roundCount: null,
          inputTypeCount: DEFAULT_INPUT_TYPE_COUNT
        },
        game: null
      };

      rooms.set(roomCode, room);
      socket.data.roomCode = roomCode;
      socket.data.nickname = nickname;
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

        player = createPlayer(socket, participant.nickname, participant.id);
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

        player = createPlayer(socket, nickname);
      }

      room.players.set(socket.id, player);
      socket.data.roomCode = roomCode;
      socket.data.nickname = player.nickname;
      socket.data.participantId = player.participantId;
      await socket.join(roomCode);

      const roomState = serializeRoom(room);
      answer(socket, acknowledgment, { ok: true, room: roomState });
      emitRoomState(room);
      emitGameStateToSocket(room, socket.id, player.participantId);
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

      const normalized = normalizeGameSettings(payload, room.players.size);
      if (normalized.error) {
        answer(socket, acknowledgment, {
          ok: false,
          error: normalized.error
        });
        return;
      }

      room.settings = normalized;
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

      room.game = createGame(room);
      answer(socket, acknowledgment, { ok: true });
      beginRound(room);
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
        game.roundIndex
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
        chainId: assignment.chain.id,
        type: normalized.type,
        content: normalized.content,
        empty: false,
        submittedAt: Date.now()
      });

      answer(socket, acknowledgment, { ok: true });
      emitGameStates(room);

      if (allPlayersSubmitted(game)) {
        finalizeRound(room, "all-submitted");
      }
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

      game.resultChainIndex = Math.max(
        0,
        Math.min(
          game.chains.length - 1,
          game.resultChainIndex + direction
        )
      );
      answer(socket, acknowledgment, {
        ok: true,
        currentChainIndex: game.resultChainIndex
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
      answer(socket, acknowledgment, { ok: true });
      emitRoomState(room);
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
  CONTRIBUTION_TYPES,
  MAX_PLAYERS,
  ROUND_DURATION_MS,
  ROOM_CODE_CHARACTERS,
  createTypePlan,
  createGameServer,
  getAssignedChainIndex,
  getExpectedContributionType,
  selectActiveContributionTypes
};
