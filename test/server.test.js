"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { io: createClient } = require("socket.io-client");
const {
  AVATAR_IDS,
  MAX_PLAYERS,
  ROOM_CODE_CHARACTERS,
  createGameServer
} = require("../server");

const REQUIRED_ORIGINS = [
  "https://multiplayer-room-test.onrender.com",
  "https://mathiascasanova.com",
  "https://www.mathiascasanova.com",
  "http://localhost:3000"
];

async function startTestServer() {
  const game = createGameServer({
    nodeEnv: "production",
    allowedOrigins: REQUIRED_ORIGINS.join(",")
  });
  const address = await game.start(0, "127.0.0.1");

  return {
    game,
    url: `http://127.0.0.1:${address.port}`
  };
}

function connectClient(url, origin) {
  return new Promise((resolve, reject) => {
    const socket = createClient(url, {
      forceNew: true,
      reconnection: false,
      transports: ["websocket"],
      extraHeaders: origin ? { Origin: origin } : undefined
    });
    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error("Délai de connexion dépassé."));
    }, 2000);

    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timeout);
      socket.disconnect();
      reject(error);
    });
  });
}

function emitAck(socket, eventName, payload) {
  return new Promise((resolve, reject) => {
    const callback = (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(response);
    };

    if (payload === undefined) {
      socket.timeout(2000).emit(eventName, callback);
    } else {
      socket.timeout(2000).emit(eventName, payload, callback);
    }
  });
}

function waitForEvent(socket, eventName, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(eventName, handler);
      reject(new Error(`Événement ${eventName} non reçu.`));
    }, 2000);

    function handler(payload) {
      if (!predicate(payload)) {
        return;
      }

      clearTimeout(timeout);
      socket.off(eventName, handler);
      resolve(payload);
    }

    socket.on(eventName, handler);
  });
}

async function waitUntil(predicate) {
  const deadline = Date.now() + 2000;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error("Condition non satisfaite dans le délai imparti.");
}

async function cleanup(game, clients) {
  clients.forEach((client) => {
    if (client.connected) {
      client.disconnect();
    }
  });
  await game.stop();
}

test("GET /health répond sans cache et applique toute la liste CORS", async () => {
  const { game, url } = await startTestServer();

  try {
    for (const origin of REQUIRED_ORIGINS) {
      const healthResponse = await fetch(`${url}/health`, {
        headers: { Origin: origin }
      });
      assert.equal(healthResponse.status, 200);
      assert.deepEqual(await healthResponse.json(), { status: "ok" });
      assert.equal(
        healthResponse.headers.get("access-control-allow-origin"),
        origin
      );
      assert.equal(healthResponse.headers.get("cache-control"), "no-store");
    }

    const blockedResponse = await fetch(`${url}/health`, {
      headers: { Origin: "https://malicious.example" }
    });
    assert.equal(blockedResponse.status, 200);
    assert.equal(
      blockedResponse.headers.get("access-control-allow-origin"),
      null
    );

    const sameOriginResponse = await fetch(`${url}/health`, {
      headers: { Origin: url }
    });
    assert.equal(
      sameOriginResponse.headers.get("access-control-allow-origin"),
      url
    );

    for (const origin of REQUIRED_ORIGINS) {
      const allowedSocket = await connectClient(url, origin);
      assert.equal(allowedSocket.connected, true);
      allowedSocket.disconnect();
    }

    const sameOriginSocket = await connectClient(url, url);
    assert.equal(sameOriginSocket.connected, true);
    sameOriginSocket.disconnect();

    await assert.rejects(
      connectClient(url, "https://malicious.example"),
      /websocket error|xhr poll error|server error/i
    );
  } finally {
    await cleanup(game, []);
  }
});

test("la création valide les pseudonymes et génère un code non ambigu", async () => {
  const { game, url } = await startTestServer();
  const clients = [];

  try {
    const host = await connectClient(url);
    clients.push(host);

    const tooShort = await emitAck(host, "createRoom", { nickname: "A" });
    assert.equal(tooShort.ok, false);

    const tooLong = await emitAck(host, "createRoom", {
      nickname: "abcdefghijklmnopqrstu"
    });
    assert.equal(tooLong.ok, false);

    const invalidAvatar = await emitAck(host, "createRoom", {
      nickname: "Alice",
      avatarId: "dragon"
    });
    assert.equal(invalidAvatar.ok, false);
    assert.match(invalidAvatar.error, /avatar/);

    const created = await emitAck(host, "createRoom", {
      nickname: "Alice",
      avatarId: "robot"
    });
    assert.equal(created.ok, true);
    assert.match(
      created.room.code,
      new RegExp(`^[${ROOM_CODE_CHARACTERS}]{6}$`)
    );
    assert.equal(created.room.playerCount, 1);
    assert.equal(created.room.players[0].isHost, true);
    assert.equal(created.room.players[0].avatarId, "robot");
    assert.equal(created.room.players[0].status, "ready");
    assert.equal(created.room.name, "Alice's Room");
    assert.deepEqual(created.room.chatMessages, []);
    assert.deepEqual(AVATAR_IDS, [
      "comet",
      "robot",
      "wizard",
      "alien",
      "ninja",
      "ghost",
      "cat",
      "frog"
    ]);
    assert.equal(game.rooms.size, 1);
  } finally {
    await cleanup(game, clients);
  }
});

test("les arrivées sont diffusées et les erreurs de room sont refusées", async () => {
  const { game, url } = await startTestServer();
  const clients = [];

  try {
    const host = await connectClient(url);
    const guest = await connectClient(url);
    const duplicate = await connectClient(url);
    clients.push(host, guest, duplicate);

    const created = await emitAck(host, "createRoom", { nickname: "Alice" });
    const updateForHost = waitForEvent(
      host,
      "roomState",
      (room) => room.playerCount === 2
    );
    const joined = await emitAck(guest, "joinRoom", {
      code: created.room.code.toLowerCase(),
      nickname: "Bob",
      avatarId: "frog"
    });
    const hostState = await updateForHost;

    assert.equal(joined.ok, true);
    assert.deepEqual(
      hostState.players.map((player) => player.nickname),
      ["Alice", "Bob"]
    );
    assert.equal(hostState.settings.roundCount, null);
    assert.equal(hostState.settings.effectiveRoundCount, 2);
    assert.equal(
      hostState.players.find((player) => player.nickname === "Bob").avatarId,
      "frog"
    );

    const duplicatedName = await emitAck(duplicate, "joinRoom", {
      code: created.room.code,
      nickname: "alice"
    });
    assert.equal(duplicatedName.ok, false);
    assert.match(duplicatedName.error, /déjà utilisé/);

    const missingRoom = await emitAck(duplicate, "joinRoom", {
      code: "AAAAAA",
      nickname: "Claire"
    });
    assert.equal(missingRoom.ok, false);
    assert.match(missingRoom.error, /n'existe pas/);

    const invalidCode = await emitAck(duplicate, "joinRoom", {
      code: "O0I1",
      nickname: "Claire"
    });
    assert.equal(invalidCode.ok, false);
    assert.match(invalidCode.error, /6 caractères valides/);
  } finally {
    await cleanup(game, clients);
  }
});

test("une room refuse le onzième joueur", async () => {
  const { game, url } = await startTestServer();
  const clients = [];

  try {
    const host = await connectClient(url);
    clients.push(host);
    const created = await emitAck(host, "createRoom", { nickname: "Player0" });

    for (let index = 1; index < MAX_PLAYERS; index += 1) {
      const client = await connectClient(url);
      clients.push(client);
      const joined = await emitAck(client, "joinRoom", {
        code: created.room.code,
        nickname: `Player${index}`
      });
      assert.equal(joined.ok, true);
    }

    const extraClient = await connectClient(url);
    clients.push(extraClient);
    const roomFull = await emitAck(extraClient, "joinRoom", {
      code: created.room.code,
      nickname: "Player10"
    });

    assert.equal(roomFull.ok, false);
    assert.match(roomFull.error, /pleine/);
    assert.equal(game.rooms.get(created.room.code).players.size, MAX_PLAYERS);
  } finally {
    await cleanup(game, clients);
  }
});

test("le rôle d'hôte est transféré et une room vide est supprimée", async () => {
  const { game, url } = await startTestServer();
  const clients = [];

  try {
    const host = await connectClient(url);
    const firstGuest = await connectClient(url);
    const secondGuest = await connectClient(url);
    clients.push(host, firstGuest, secondGuest);

    const created = await emitAck(host, "createRoom", { nickname: "Host" });
    await emitAck(firstGuest, "joinRoom", {
      code: created.room.code,
      nickname: "First"
    });
    await emitAck(secondGuest, "joinRoom", {
      code: created.room.code,
      nickname: "Second"
    });

    const firstTransfer = waitForEvent(
      firstGuest,
      "roomState",
      (room) => room.hostId === firstGuest.id
    );
    host.disconnect();
    const stateAfterDisconnect = await firstTransfer;
    assert.equal(
      stateAfterDisconnect.players.find((player) => player.isHost).nickname,
      "First"
    );
    assert.equal(stateAfterDisconnect.name, "First's Room");

    const secondTransfer = waitForEvent(
      secondGuest,
      "roomState",
      (room) => room.hostId === secondGuest.id
    );
    const leaveResponse = await emitAck(firstGuest, "leaveRoom");
    assert.equal(leaveResponse.ok, true);
    const stateAfterLeave = await secondTransfer;
    assert.equal(
      stateAfterLeave.players.find((player) => player.isHost).nickname,
      "Second"
    );
    assert.equal(stateAfterLeave.name, "Second's Room");

    secondGuest.disconnect();
    await waitUntil(() => game.rooms.size === 0);
    assert.equal(game.rooms.size, 0);
  } finally {
    await cleanup(game, clients);
  }
});

test("le chat et les emotes sont synchronisés dans toute la room", async () => {
  const { game, url } = await startTestServer();
  const clients = [];

  try {
    const host = await connectClient(url);
    const guest = await connectClient(url);
    const lateGuest = await connectClient(url);
    clients.push(host, guest, lateGuest);

    const created = await emitAck(host, "createRoom", {
      nickname: "Alice",
      avatarId: "wizard"
    });
    await emitAck(guest, "joinRoom", {
      code: created.room.code,
      nickname: "Bob"
    });

    const receivedMessage = waitForEvent(
      guest,
      "chatMessage",
      (message) => message.content === "Salut la room"
    );
    const sent = await emitAck(host, "sendChatMessage", {
      content: "  Salut la room  "
    });
    assert.equal(sent.ok, true);
    const message = await receivedMessage;
    assert.equal(message.nickname, "Alice");
    assert.equal(message.avatarId, "wizard");
    assert.equal(message.content, "Salut la room");

    const joinedLate = await emitAck(lateGuest, "joinRoom", {
      code: created.room.code,
      nickname: "Claire"
    });
    assert.equal(joinedLate.ok, true);
    assert.equal(joinedLate.room.chatMessages.length, 1);
    assert.equal(joinedLate.room.chatMessages[0].content, "Salut la room");

    const emoteUpdate = waitForEvent(
      guest,
      "roomState",
      (room) =>
        room.players.some(
          (player) => player.nickname === "Alice" && player.emote === "🔥"
        )
    );
    const emote = await emitAck(host, "setPlayerEmote", { emote: "🔥" });
    assert.equal(emote.ok, true);
    await emoteUpdate;

    const invalidEmote = await emitAck(host, "setPlayerEmote", {
      emote: "🐉"
    });
    assert.equal(invalidEmote.ok, false);
    assert.match(invalidEmote.error, /emote/);

    const tooLong = await emitAck(host, "sendChatMessage", {
      content: "x".repeat(201)
    });
    assert.equal(tooLong.ok, false);
    assert.match(tooLong.error, /200/);
  } finally {
    await cleanup(game, clients);
  }
});
