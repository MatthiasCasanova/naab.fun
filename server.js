"use strict";

require("dotenv").config();

const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const cors = require("cors");
const express = require("express");
const { Server } = require("socket.io");

const MAX_PLAYERS = 10;
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_CHARACTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ROOM_CODE_PATTERN = new RegExp(
  `^[${ROOM_CODE_CHARACTERS}]{${ROOM_CODE_LENGTH}}$`
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

function createGameServer(options = {}) {
  const nodeEnv = options.nodeEnv || process.env.NODE_ENV || "development";
  const isDevelopment = nodeEnv !== "production";
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

  function serializeRoom(room) {
    return {
      code: room.code,
      hostId: room.hostId,
      playerCount: room.players.size,
      maxPlayers: MAX_PLAYERS,
      players: Array.from(room.players.values()).map((player) => ({
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

  function findLongestConnectedPlayer(room) {
    return Array.from(room.players.values()).sort(
      (first, second) => first.joinOrder - second.joinOrder
    )[0];
  }

  function removePlayerFromRoom(socket, shouldLeaveSocketRoom) {
    const roomCode = socket.data.roomCode;

    if (!roomCode) {
      return false;
    }

    const room = rooms.get(roomCode);
    socket.data.roomCode = null;
    socket.data.nickname = null;

    if (shouldLeaveSocketRoom) {
      socket.leave(roomCode);
    }

    if (!room || !room.players.delete(socket.id)) {
      return false;
    }

    if (room.players.size === 0) {
      rooms.delete(roomCode);
      return true;
    }

    if (room.hostId === socket.id) {
      room.hostId = findLongestConnectedPlayer(room).id;
    }

    emitRoomState(room);
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
      const player = {
        id: socket.id,
        nickname,
        joinedAt: Date.now(),
        joinOrder: joinSequence++
      };
      const room = {
        code: roomCode,
        hostId: socket.id,
        players: new Map([[socket.id, player]])
      };

      rooms.set(roomCode, room);
      socket.data.roomCode = roomCode;
      socket.data.nickname = nickname;
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

      if (room.players.size >= MAX_PLAYERS) {
        answer(socket, acknowledgment, {
          ok: false,
          error: "Cette partie est pleine (10 joueurs maximum)."
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

      room.players.set(socket.id, {
        id: socket.id,
        nickname,
        joinedAt: Date.now(),
        joinOrder: joinSequence++
      });
      socket.data.roomCode = roomCode;
      socket.data.nickname = nickname;
      await socket.join(roomCode);

      const roomState = serializeRoom(room);
      answer(socket, acknowledgment, { ok: true, room: roomState });
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
  MAX_PLAYERS,
  ROOM_CODE_CHARACTERS,
  createGameServer
};
