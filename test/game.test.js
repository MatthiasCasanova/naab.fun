"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { io: createClient } = require("socket.io-client");
const {
  NEXT_CONTRIBUTION_TYPE,
  ROUND_DURATION_MS,
  createGameServer,
  getAssignedChainIndex,
  getExpectedContributionType
} = require("../server");

const DRAWING = "data:image/png;base64,iVBORw0KGgo=";
const AUDIO = "data:audio/webm;base64,AAAA";

async function startTestServer(options = {}) {
  const game = createGameServer({
    nodeEnv: "development",
    allowedOrigins: "http://localhost:3000",
    roundDurationMs: 5000,
    ...options
  });
  const address = await game.start(0, "127.0.0.1");

  return {
    game,
    url: `http://127.0.0.1:${address.port}`
  };
}

function connectClient(url) {
  return new Promise((resolve, reject) => {
    const socket = createClient(url, {
      forceNew: true,
      reconnection: false,
      transports: ["websocket"]
    });
    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error("Délai de connexion dépassé."));
    }, 3000);

    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timeout);
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
      socket.timeout(3000).emit(eventName, callback);
    } else {
      socket.timeout(3000).emit(eventName, payload, callback);
    }
  });
}

function waitForEvent(
  socket,
  eventName,
  predicate = () => true,
  timeoutMs = 3000
) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(eventName, handler);
      reject(new Error(`Événement ${eventName} non reçu.`));
    }, timeoutMs);

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

async function createRoomWithPlayers(url, nicknames) {
  const clients = [];
  const host = await connectClient(url);
  clients.push(host);
  const created = await emitAck(host, "createRoom", {
    nickname: nicknames[0]
  });

  for (const nickname of nicknames.slice(1)) {
    const client = await connectClient(url);
    clients.push(client);
    const joined = await emitAck(client, "joinRoom", {
      code: created.room.code,
      nickname
    });
    assert.equal(joined.ok, true);
  }

  return {
    clients,
    code: created.room.code
  };
}

async function cleanup(game, clients) {
  clients.forEach((client) => {
    if (client.connected) {
      client.disconnect();
    }
  });
  await game.stop();
}

async function submit(socket, roundIndex, type, content) {
  const response = await emitAck(socket, "submitContribution", {
    roundIndex,
    type,
    content
  });
  assert.equal(response.ok, true);
}

test("les rotations couvrent chaque chaîne une fois sans réattribuer sa chaîne", () => {
  const playerCount = 5;

  for (let playerIndex = 0; playerIndex < playerCount; playerIndex += 1) {
    const assignments = [];
    for (let roundIndex = 0; roundIndex < playerCount; roundIndex += 1) {
      assignments.push(
        getAssignedChainIndex(playerIndex, roundIndex, playerCount)
      );
    }

    assert.equal(assignments[0], playerIndex);
    assert.equal(new Set(assignments).size, playerCount);
    assert.equal(
      assignments.slice(1).includes(playerIndex),
      false
    );
  }
});

test("le cycle de types est Texte vers Audio vers Dessin vers Texte", () => {
  assert.equal(ROUND_DURATION_MS, 60000);
  assert.deepEqual(NEXT_CONTRIBUTION_TYPE, {
    text: "audio",
    audio: "drawing",
    drawing: "text"
  });
  assert.equal(getExpectedContributionType("text"), "audio");
  assert.equal(getExpectedContributionType("audio"), "drawing");
  assert.equal(getExpectedContributionType("drawing"), "text");
});

test("seul l'hôte peut lancer une partie avec au moins deux joueurs", async () => {
  const { game, url } = await startTestServer();
  const clients = [];

  try {
    const host = await connectClient(url);
    clients.push(host);
    const created = await emitAck(host, "createRoom", { nickname: "Alice" });

    const tooFew = await emitAck(host, "startGame");
    assert.equal(tooFew.ok, false);
    assert.match(tooFew.error, /au moins 2 joueurs/);

    const guest = await connectClient(url);
    clients.push(guest);
    await emitAck(guest, "joinRoom", {
      code: created.room.code,
      nickname: "Bob"
    });

    const notHost = await emitAck(guest, "startGame");
    assert.equal(notHost.ok, false);
    assert.match(notHost.error, /Seul l'hôte/);

    const hostStatePromise = waitForEvent(
      host,
      "gameState",
      (state) => state.phase === "playing" && state.roundIndex === 0
    );
    const started = await emitAck(host, "startGame");
    assert.equal(started.ok, true);
    const hostState = await hostStatePromise;
    assert.equal(hostState.totalRounds, 2);
    assert.equal(
      hostState.roundEndsAt - hostState.roundStartedAt,
      5000
    );
  } finally {
    await cleanup(game, clients);
  }
});

test("une partie complète à trois joueurs respecte rotations et types", async () => {
  const { game, url } = await startTestServer();
  let clients = [];

  try {
    const setup = await createRoomWithPlayers(url, [
      "Alice",
      "Bob",
      "Claire"
    ]);
    clients = setup.clients;
    const [alice, bob, claire] = clients;

    const roundZeroPromises = clients.map((client) =>
      waitForEvent(
        client,
        "gameState",
        (state) => state.phase === "playing" && state.roundIndex === 0
      )
    );
    await emitAck(alice, "startGame");
    const [aliceRound0, bobRound0, claireRound0] =
      await Promise.all(roundZeroPromises);

    assert.equal(aliceRound0.assignment.expectedType, null);
    assert.equal(bobRound0.assignment.expectedType, null);
    assert.equal(claireRound0.assignment.expectedType, null);
    const originalChains = [
      aliceRound0.assignment.chainId,
      bobRound0.assignment.chainId,
      claireRound0.assignment.chainId
    ];
    assert.equal(new Set(originalChains).size, 3);

    const roundOnePromises = clients.map((client) =>
      waitForEvent(
        client,
        "gameState",
        (state) => state.phase === "playing" && state.roundIndex === 1
      )
    );
    await submit(alice, 0, "text", "Une cloche dans la nuit");
    await submit(bob, 0, "audio", AUDIO);
    await submit(claire, 0, "drawing", DRAWING);
    const [aliceRound1, bobRound1, claireRound1] =
      await Promise.all(roundOnePromises);

    assert.equal(aliceRound1.assignment.chainId, originalChains[2]);
    assert.equal(bobRound1.assignment.chainId, originalChains[0]);
    assert.equal(claireRound1.assignment.chainId, originalChains[1]);
    assert.equal(aliceRound1.assignment.expectedType, "text");
    assert.equal(bobRound1.assignment.expectedType, "audio");
    assert.equal(claireRound1.assignment.expectedType, "drawing");
    assert.equal(
      aliceRound1.assignment.previousContribution.nickname,
      "Claire"
    );

    const wrongType = await emitAck(alice, "submitContribution", {
      roundIndex: 1,
      type: "audio",
      content: AUDIO
    });
    assert.equal(wrongType.ok, false);
    assert.match(wrongType.error, /attend une contribution de type text/);

    const roundTwoPromises = clients.map((client) =>
      waitForEvent(
        client,
        "gameState",
        (state) => state.phase === "playing" && state.roundIndex === 2
      )
    );
    await submit(alice, 1, "text", "Une spirale colorée");
    await submit(bob, 1, "audio", AUDIO);
    await submit(claire, 1, "drawing", DRAWING);
    const [aliceRound2, bobRound2, claireRound2] =
      await Promise.all(roundTwoPromises);

    assert.equal(aliceRound2.assignment.chainId, originalChains[1]);
    assert.equal(bobRound2.assignment.chainId, originalChains[2]);
    assert.equal(claireRound2.assignment.chainId, originalChains[0]);
    assert.equal(aliceRound2.assignment.expectedType, "text");
    assert.equal(bobRound2.assignment.expectedType, "audio");
    assert.equal(claireRound2.assignment.expectedType, "drawing");

    const resultsPromise = waitForEvent(
      alice,
      "gameState",
      (state) => state.phase === "results"
    );
    await submit(alice, 2, "text", "Un moteur imaginaire");
    await submit(bob, 2, "audio", AUDIO);
    await submit(claire, 2, "drawing", DRAWING);
    const results = await resultsPromise;

    assert.equal(results.chains.length, 3);
    results.chains.forEach((chain) => {
      assert.equal(chain.contributions.length, 3);
      assert.equal(
        new Set(chain.contributions.map((item) => item.nickname)).size,
        3
      );
      assert.equal(chain.contributions[0].nickname, chain.ownerNickname);

      for (let index = 1; index < chain.contributions.length; index += 1) {
        assert.equal(
          chain.contributions[index].type,
          getExpectedContributionType(
            chain.contributions[index - 1].type
          )
        );
      }
    });
  } finally {
    await cleanup(game, clients);
  }
});

test("le timer ajoute une réponse vide puis change de manche", async () => {
  const { game, url } = await startTestServer({ roundDurationMs: 120 });
  let clients = [];

  try {
    const setup = await createRoomWithPlayers(url, ["Alice", "Bob"]);
    clients = setup.clients;
    const [alice, bob] = clients;

    const roundZero = waitForEvent(
      alice,
      "gameState",
      (state) => state.phase === "playing" && state.roundIndex === 0
    );
    await emitAck(alice, "startGame");
    await roundZero;

    const roundOne = waitForEvent(
      alice,
      "gameState",
      (state) => state.phase === "playing" && state.roundIndex === 1,
      2000
    );
    await submit(alice, 0, "text", "Une horloge");
    const aliceRoundOne = await roundOne;

    assert.equal(aliceRoundOne.assignment.previousContribution.empty, true);
    assert.equal(aliceRoundOne.assignment.previousContribution.nickname, "Bob");
    assert.equal(aliceRoundOne.assignment.expectedType, "audio");

    const room = game.rooms.get(setup.code);
    const bobChain = room.game.chains.find(
      (chain) => chain.ownerNickname === "Bob"
    );
    assert.equal(bobChain.contributions[0].empty, true);
  } finally {
    await cleanup(game, clients);
  }
});

test("une déconnexion est enregistrée vide et ne bloque pas la manche", async () => {
  const { game, url } = await startTestServer({ roundDurationMs: 5000 });
  let clients = [];

  try {
    const setup = await createRoomWithPlayers(url, [
      "Alice",
      "Bob",
      "Claire"
    ]);
    clients = setup.clients;
    const [alice, bob, claire] = clients;

    const roundZero = waitForEvent(
      alice,
      "gameState",
      (state) => state.phase === "playing" && state.roundIndex === 0
    );
    await emitAck(alice, "startGame");
    await roundZero;

    const roundOne = waitForEvent(
      alice,
      "gameState",
      (state) => state.phase === "playing" && state.roundIndex === 1,
      2000
    );
    claire.disconnect();
    await submit(alice, 0, "text", "Texte Alice");
    await submit(bob, 0, "audio", AUDIO);
    const nextRound = await roundOne;

    assert.equal(nextRound.roundIndex, 1);
    const room = game.rooms.get(setup.code);
    const claireChain = room.game.chains.find(
      (chain) => chain.ownerNickname === "Claire"
    );
    assert.equal(claireChain.contributions[0].empty, true);
  } finally {
    await cleanup(game, clients);
  }
});

test("un joueur peut reprendre sa place après une déconnexion", async () => {
  const { game, url } = await startTestServer({ roundDurationMs: 5000 });
  let clients = [];

  try {
    const setup = await createRoomWithPlayers(url, ["Alice", "Bob"]);
    clients = setup.clients;
    const [alice, bob] = clients;

    const roundZero = waitForEvent(
      alice,
      "gameState",
      (state) => state.phase === "playing" && state.roundIndex === 0
    );
    await emitAck(alice, "startGame");
    await roundZero;

    bob.disconnect();
    const replacementBob = await connectClient(url);
    clients.push(replacementBob);
    const resumedStatePromise = waitForEvent(
      replacementBob,
      "gameState",
      (state) => state.phase === "playing" && state.roundIndex === 0
    );
    const resumed = await emitAck(replacementBob, "joinRoom", {
      code: setup.code,
      nickname: "Bob"
    });
    assert.equal(resumed.ok, true);
    assert.equal(resumed.room.phase, "playing");
    const resumedState = await resumedStatePromise;
    assert.equal(resumedState.submitted, true);

    const nextRoundPromise = waitForEvent(
      replacementBob,
      "gameState",
      (state) => state.phase === "playing" && state.roundIndex === 1
    );
    await submit(alice, 0, "text", "Reconnexion");
    const nextRound = await nextRoundPromise;
    assert.equal(nextRound.submitted, false);
  } finally {
    await cleanup(game, clients);
  }
});

test("une contribution est unique par manche et les résultats reviennent au lobby", async () => {
  const { game, url } = await startTestServer({ roundDurationMs: 5000 });
  let clients = [];

  try {
    const setup = await createRoomWithPlayers(url, ["Alice", "Bob"]);
    clients = setup.clients;
    const [alice, bob] = clients;

    const roundZeroPromises = clients.map((client) =>
      waitForEvent(
        client,
        "gameState",
        (state) => state.phase === "playing" && state.roundIndex === 0
      )
    );
    await emitAck(alice, "startGame");
    await Promise.all(roundZeroPromises);

    await submit(alice, 0, "text", "Premier texte");
    const duplicate = await emitAck(alice, "submitContribution", {
      roundIndex: 0,
      type: "drawing",
      content: DRAWING
    });
    assert.equal(duplicate.ok, false);
    assert.match(duplicate.error, /déjà validée/);

    const roundOnePromises = clients.map((client) =>
      waitForEvent(
        client,
        "gameState",
        (state) => state.phase === "playing" && state.roundIndex === 1
      )
    );
    await submit(bob, 0, "drawing", DRAWING);
    await Promise.all(roundOnePromises);

    const resultsPromise = waitForEvent(
      alice,
      "gameState",
      (state) => state.phase === "results"
    );
    await submit(alice, 1, "text", "Description du dessin");
    await submit(bob, 1, "audio", AUDIO);
    await resultsPromise;

    const lobbyStatePromise = waitForEvent(
      bob,
      "roomState",
      (room) => room.phase === "lobby"
    );
    const returned = await emitAck(alice, "returnToLobby");
    assert.equal(returned.ok, true);
    const lobbyState = await lobbyStatePromise;
    assert.equal(lobbyState.playerCount, 2);
    assert.equal(game.rooms.get(setup.code).game, null);
  } finally {
    await cleanup(game, clients);
  }
});
