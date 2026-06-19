"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { io: createClient } = require("socket.io-client");
const {
  GAME_COUNTDOWN_MS,
  LEAGUE_OF_NAABS_GAME_ID,
  LEAGUE_OF_NAABS_OPTIMAL_PLAYER_COUNT,
  LEAGUE_OF_NAABS_REVEAL_STEPS_PER_CHAMPION,
  LEAGUE_OF_NAABS_STEPS,
  ROUND_DURATION_MS,
  ROUND_PREVIEW_MS,
  createGameServer,
  createTypePlan,
  getAssignedChainIndex,
  getLeagueOfNaabsAssignedChainIndex,
  getExpectedContributionType,
  selectActiveContributionTypes
} = require("../server");

const DRAWING = "data:image/png;base64,iVBORw0KGgo=";
const AUDIO = "data:audio/webm;base64,AAAA";

async function startTestServer(options = {}) {
  const game = createGameServer({
    nodeEnv: "development",
    allowedOrigins: "http://localhost:3000",
    roundDurationMs: 5000,
    gameCountdownMs: 0,
    roundPreviewMs: 0,
    randomInt: () => 0,
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

function contentForType(type, label = "Une idée étrange") {
  if (type === "audio") {
    return AUDIO;
  }
  if (type === "drawing") {
    return DRAWING;
  }
  return label;
}

function contentForGameState(gameState, label = "Une idée étrange") {
  const stepKey =
    gameState.assignment &&
    gameState.assignment.step &&
    gameState.assignment.step.key;

  if (stepKey === "spell-kit") {
    return JSON.stringify({
      spells: [
        `${label} Q`,
        `${label} W`,
        `${label} E`,
        `${label} R`
      ]
    });
  }

  if (stepKey === "quote-pack") {
    return JSON.stringify({ quotes: [AUDIO, AUDIO, AUDIO, AUDIO] });
  }

  return contentForType(gameState.assignment.expectedType, label);
}

async function submitExpected(socket, gameState, label) {
  const type = gameState.assignment.expectedType;
  const response = await emitAck(socket, "submitContribution", {
    roundIndex: gameState.roundIndex,
    type,
    content: contentForGameState(gameState, label)
  });
  assert.equal(response.ok, true);
}

test("les rotations couvrent chaque chaîne sans réattribuer sa chaîne", () => {
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
    assert.equal(assignments.slice(1).includes(playerIndex), false);
  }
});

test("les types sont imposés aléatoirement sans répétition immédiate", () => {
  assert.equal(ROUND_DURATION_MS, 60000);
  assert.equal(GAME_COUNTDOWN_MS, 3000);
  assert.equal(ROUND_PREVIEW_MS, 10000);
  const activeTypes = selectActiveContributionTypes(3, () => 0);
  assert.deepEqual(activeTypes, ["text", "drawing", "audio"]);

  const plans = createTypePlan(4, 8, activeTypes, () => 0);
  plans.forEach((plan) => {
    assert.equal(plan.length, 8);
    plan.forEach((type) => assert.ok(activeTypes.includes(type)));
    for (let index = 1; index < plan.length; index += 1) {
      assert.notEqual(plan[index], plan[index - 1]);
    }
  });

  assert.equal(
    getExpectedContributionType("text", activeTypes, () => 0),
    "drawing"
  );
  assert.deepEqual(createTypePlan(1, 3, ["audio"], () => 0)[0], [
    "audio",
    "audio",
    "audio"
  ]);
});

test("League Of Naabs est optimal à 6 joueurs sans auto-attribution", () => {
  assert.equal(LEAGUE_OF_NAABS_STEPS.length, 5);
  assert.equal(LEAGUE_OF_NAABS_OPTIMAL_PLAYER_COUNT, 6);
  assert.deepEqual(
    LEAGUE_OF_NAABS_STEPS.map((step) => step.key),
    [
      "champion-sketch",
      "champion-name",
      "spell-kit",
      "quote-pack",
      "champion-lore"
    ]
  );

  const playerCount = LEAGUE_OF_NAABS_OPTIMAL_PLAYER_COUNT;
  for (let playerIndex = 0; playerIndex < playerCount; playerIndex += 1) {
    const assignments = [];
    for (let roundIndex = 0; roundIndex < LEAGUE_OF_NAABS_STEPS.length; roundIndex += 1) {
      const chainIndex = getLeagueOfNaabsAssignedChainIndex(
        playerIndex,
        roundIndex,
        playerCount
      );
      assignments.push(chainIndex);
      assert.notEqual(chainIndex, playerIndex);
    }
    assert.equal(new Set(assignments).size, LEAGUE_OF_NAABS_STEPS.length);
  }
});

test("seul l'hôte configure et lance la partie", async () => {
  const { game, url } = await startTestServer();
  let clients = [];

  try {
    const setup = await createRoomWithPlayers(url, ["Alice", "Bob"]);
    clients = setup.clients;
    const [host, guest] = clients;

    const denied = await emitAck(guest, "updateGameSettings", {
      roundCount: 1,
      inputTypeCount: 2
    });
    assert.equal(denied.ok, false);
    assert.match(denied.error, /Seul l'hôte/);

    const invalid = await emitAck(host, "updateGameSettings", {
      roundCount: 3,
      inputTypeCount: 2
    });
    assert.equal(invalid.ok, false);
    assert.match(invalid.error, /entre 1 et 2/);

    const guestRoomState = waitForEvent(
      guest,
      "roomState",
      (room) =>
        room.settings.roundCount === 1 &&
        room.settings.inputTypeCount === 2
    );
    const updated = await emitAck(host, "updateGameSettings", {
      roundCount: 1,
      inputTypeCount: 2
    });
    assert.equal(updated.ok, true);
    await guestRoomState;

    const guestStart = await emitAck(guest, "startGame");
    assert.equal(guestStart.ok, false);
    assert.match(guestStart.error, /Seul l'hôte/);

    const statePromise = waitForEvent(
      host,
      "gameState",
      (state) => state.phase === "playing"
    );
    const started = await emitAck(host, "startGame");
    assert.equal(started.ok, true);
    const state = await statePromise;
    assert.equal(state.totalRounds, 1);
    assert.ok(state.assignment.expectedType);

    const room = game.rooms.get(setup.code);
    assert.equal(room.game.activeTypes.length, 2);
  } finally {
    await cleanup(game, clients);
  }
});

test("le lancement compte 3 secondes puis réserve 10 secondes d'aperçu", async () => {
  const { game, url } = await startTestServer({
    gameCountdownMs: 80,
    roundPreviewMs: 120,
    roundDurationMs: 180
  });
  let clients = [];

  try {
    const setup = await createRoomWithPlayers(url, ["Alice", "Bob"]);
    clients = setup.clients;
    const [alice, bob] = clients;

    const countdownPromise = waitForEvent(
      alice,
      "gameState",
      (state) => state.phase === "countdown"
    );
    const roundPromise = waitForEvent(
      alice,
      "gameState",
      (state) => state.phase === "playing"
    );
    const bobRoundPromise = waitForEvent(
      bob,
      "gameState",
      (state) => state.phase === "playing"
    );
    await emitAck(alice, "startGame");
    const countdown = await countdownPromise;
    assert.ok(countdown.countdownEndsAt > countdown.serverNow);

    const round = await roundPromise;
    const bobRound = await bobRoundPromise;
    assert.equal(round.previewEndsAt, round.roundStartedAt);
    assert.equal(round.roundEndsAt - round.roundStartedAt, 180);
    assert.ok(round.roundStartedAt > round.serverNow);

    const tooEarly = await emitAck(alice, "submitContribution", {
      roundIndex: round.roundIndex,
      type: round.assignment.expectedType,
      content: contentForType(round.assignment.expectedType, "Trop tôt")
    });
    assert.equal(tooEarly.ok, false);
    assert.match(tooEarly.error, /aperçu/);

    await new Promise((resolve) => setTimeout(resolve, 130));
    await submitExpected(alice, round, "Après aperçu Alice");
    await submitExpected(bob, bobRound, "Après aperçu Bob");
  } finally {
    await cleanup(game, clients);
  }
});

test("une partie complète respecte rotations et types aléatoires imposés", async () => {
  const { game, url } = await startTestServer();
  let clients = [];

  try {
    const setup = await createRoomWithPlayers(url, [
      "Alice",
      "Bob",
      "Claire"
    ]);
    clients = setup.clients;
    const [alice] = clients;

    await emitAck(alice, "updateGameSettings", {
      roundCount: 3,
      inputTypeCount: 3
    });

    const firstRoundPromises = clients.map((client) =>
      waitForEvent(
        client,
        "gameState",
        (state) => state.phase === "playing" && state.roundIndex === 0
      )
    );
    await emitAck(alice, "startGame");
    let states = await Promise.all(firstRoundPromises);
    const originalChains = states.map((state) => state.assignment.chainId);
    assert.equal(new Set(originalChains).size, 3);
    states.forEach((state) => assert.ok(state.assignment.expectedType));

    for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
      let nextPromises = null;
      if (roundIndex < 2) {
        nextPromises = clients.map((client) =>
          waitForEvent(
            client,
            "gameState",
            (state) =>
              state.phase === "playing" &&
              state.roundIndex === roundIndex + 1
          )
        );
      }

      let resultPromises = null;
      if (roundIndex === 2) {
        resultPromises = clients.map((client) =>
          waitForEvent(
            client,
            "gameState",
            (state) => state.phase === "results"
          )
        );
      }

      if (roundIndex === 1) {
        const expectedType = states[0].assignment.expectedType;
        const wrongType = ["text", "drawing", "audio"].find(
          (type) => type !== expectedType
        );
        const rejected = await emitAck(clients[0], "submitContribution", {
          roundIndex,
          type: wrongType,
          content: contentForType(wrongType)
        });
        assert.equal(rejected.ok, false);
        assert.match(rejected.error, /attend une contribution/);
      }

      await Promise.all(
        clients.map((client, index) =>
          submitExpected(client, states[index], `Texte ${roundIndex}-${index}`)
        )
      );

      if (nextPromises) {
        const previousStates = states;
        states = await Promise.all(nextPromises);
        states.forEach((state, index) => {
          assert.notEqual(
            state.assignment.expectedType,
            state.assignment.previousContribution.type
          );
          assert.equal(
            state.assignment.chainId,
            originalChains[
              getAssignedChainIndex(index, roundIndex + 1, clients.length)
            ]
          );
          assert.equal(previousStates[index].roundIndex, roundIndex);
        });
      } else {
        states = await Promise.all(resultPromises);
      }
    }

    const [hostResults, guestResults] = states;
    assert.equal(hostResults.canControlResults, true);
    assert.equal(guestResults.canControlResults, false);
    assert.equal(hostResults.currentChainIndex, 0);
    assert.equal(hostResults.currentContributionIndex, 0);
    assert.equal(hostResults.resultStepNumber, 1);
    assert.equal(hostResults.resultStepCount, 9);
    assert.equal(hostResults.canGoPrevious, false);
    assert.equal(hostResults.canGoNext, true);
    hostResults.chains.forEach((chain) => {
      assert.equal(chain.contributions.length, 3);
      for (let index = 1; index < chain.contributions.length; index += 1) {
        assert.notEqual(
          chain.contributions[index].type,
          chain.contributions[index - 1].type
        );
      }
    });

    const guestNavigation = await emitAck(
      clients[1],
      "navigateResults",
      { direction: 1 }
    );
    assert.equal(guestNavigation.ok, false);
    assert.match(guestNavigation.error, /Seul l'hôte/);

    const synchronizedResults = clients.map((client) =>
      waitForEvent(
        client,
        "gameState",
        (state) =>
          state.phase === "results" &&
          state.currentChainIndex === 0 &&
          state.currentContributionIndex === 1
      )
    );
    const navigated = await emitAck(alice, "navigateResults", {
      direction: 1
    });
    assert.equal(navigated.ok, true);
    const secondStepStates = await Promise.all(synchronizedResults);
    assert.equal(secondStepStates[0].resultStepNumber, 2);

    const thirdStep = waitForEvent(
      alice,
      "gameState",
      (state) =>
        state.phase === "results" &&
        state.currentChainIndex === 0 &&
        state.currentContributionIndex === 2
    );
    await emitAck(alice, "navigateResults", { direction: 1 });
    await thirdStep;

    const nextChain = waitForEvent(
      alice,
      "gameState",
      (state) =>
        state.phase === "results" &&
        state.currentChainIndex === 1 &&
        state.currentContributionIndex === 0
    );
    await emitAck(alice, "navigateResults", { direction: 1 });
    const nextChainState = await nextChain;
    assert.equal(nextChainState.resultStepNumber, 4);

    const previousStep = waitForEvent(
      alice,
      "gameState",
      (state) =>
        state.phase === "results" &&
        state.currentChainIndex === 0 &&
        state.currentContributionIndex === 2
    );
    await emitAck(alice, "navigateResults", { direction: -1 });
    await previousStep;

    const guestReturn = await emitAck(clients[1], "returnToLobby");
    assert.equal(guestReturn.ok, false);
    assert.match(guestReturn.error, /Seul l'hôte/);
  } finally {
    await cleanup(game, clients);
  }
});

test("League Of Naabs construit un champion complet pour chaque joueur", async () => {
  const { game, url } = await startTestServer({
    gameCountdownMs: 0,
    roundPreviewMs: 0,
    roundDurationMs: 5000
  });
  let clients = [];

  try {
    const names = [
      "Alice",
      "Bob",
      "Claire",
      "David",
      "Emma",
      "Farid"
    ];
    const setup = await createRoomWithPlayers(url, names);
    clients = setup.clients;
    const [host] = clients;

    const selected = await emitAck(host, "selectRoomGame", {
      gameId: LEAGUE_OF_NAABS_GAME_ID
    });
    assert.equal(selected.ok, true);

    const firstRoundPromises = clients.map((client) =>
      waitForEvent(
        client,
        "gameState",
        (state) => state.phase === "playing" && state.roundIndex === 0
      )
    );
    await emitAck(host, "startGame");
    let states = await Promise.all(firstRoundPromises);

    assert.equal(states[0].gameId, LEAGUE_OF_NAABS_GAME_ID);
    assert.equal(states[0].totalRounds, LEAGUE_OF_NAABS_STEPS.length);
    assert.equal(states[0].optimalPlayerCount, 6);

    for (let roundIndex = 0; roundIndex < LEAGUE_OF_NAABS_STEPS.length; roundIndex += 1) {
      const step = LEAGUE_OF_NAABS_STEPS[roundIndex];
      states.forEach((state, playerIndex) => {
        assert.equal(state.assignment.step.key, step.key);
        assert.equal(state.assignment.expectedType, step.type);
        assert.notEqual(state.assignment.targetNickname, names[playerIndex]);
        assert.equal(
          state.assignment.targetNickname,
          names[(playerIndex + roundIndex + 1) % names.length]
        );
      });

      const nextPromises =
        roundIndex < LEAGUE_OF_NAABS_STEPS.length - 1
          ? clients.map((client) =>
              waitForEvent(
                client,
                "gameState",
                (state) =>
                  state.phase === "playing" &&
                  state.roundIndex === roundIndex + 1
              )
            )
          : clients.map((client) =>
              waitForEvent(
                client,
                "gameState",
                (state) => state.phase === "results"
              )
            );

      await Promise.all(
        clients.map((client, index) =>
          submitExpected(
            client,
            states[index],
            `Champion ${roundIndex}-${index}`
          )
        )
      );
      states = await Promise.all(nextPromises);
    }

    const results = states[0];
    assert.equal(results.resultTitle, "Le vestiaire des champions douteux");
    assert.equal(results.resultOwnerLabel, "Champion créé pour");
    assert.equal(
      results.resultStepCount,
      names.length * LEAGUE_OF_NAABS_REVEAL_STEPS_PER_CHAMPION
    );
    results.chains.forEach((chain) => {
      assert.equal(chain.contributions.length, LEAGUE_OF_NAABS_STEPS.length);
      assert.deepEqual(
        chain.contributions.map((contribution) => contribution.stepKey),
        LEAGUE_OF_NAABS_STEPS.map((step) => step.key)
      );
      const spellKit = chain.contributions.find(
        (contribution) => contribution.stepKey === "spell-kit"
      );
      const quotePack = chain.contributions.find(
        (contribution) => contribution.stepKey === "quote-pack"
      );
      assert.equal(JSON.parse(spellKit.content).spells.length, 4);
      assert.equal(JSON.parse(quotePack.content).quotes.length, 4);
    });

    const room = game.rooms.get(setup.code);
    assert.equal(room.game.gameId, LEAGUE_OF_NAABS_GAME_ID);
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
    const [alice] = clients;

    const firstRound = waitForEvent(
      alice,
      "gameState",
      (state) => state.phase === "playing" && state.roundIndex === 0
    );
    await emitAck(alice, "startGame");
    const aliceRoundZero = await firstRound;

    const secondRound = waitForEvent(
      alice,
      "gameState",
      (state) => state.phase === "playing" && state.roundIndex === 1,
      2000
    );
    await submitExpected(alice, aliceRoundZero, "Une horloge");
    const aliceRoundOne = await secondRound;

    assert.equal(aliceRoundOne.assignment.previousContribution.empty, true);
    assert.equal(aliceRoundOne.assignment.previousContribution.nickname, "Bob");
    assert.notEqual(
      aliceRoundOne.assignment.expectedType,
      aliceRoundOne.assignment.previousContribution.type
    );
  } finally {
    await cleanup(game, clients);
  }
});

test("le timer valide les brouillons en temps réel", async () => {
  const { game, url } = await startTestServer({ roundDurationMs: 180 });
  let clients = [];

  try {
    const setup = await createRoomWithPlayers(url, ["Alice", "Bob"]);
    clients = setup.clients;
    const [alice, bob] = clients;
    await emitAck(alice, "updateGameSettings", {
      roundCount: 1,
      inputTypeCount: 3
    });

    const firstStatesPromise = Promise.all(
      clients.map((client) =>
        waitForEvent(
          client,
          "gameState",
          (state) => state.phase === "playing" && state.roundIndex === 0
        )
      )
    );
    await emitAck(alice, "startGame");
    const states = await firstStatesPromise;
    assert.equal(states[0].assignment.expectedType, "text");
    assert.equal(states[1].assignment.expectedType, "text");

    const resultsPromise = waitForEvent(
      alice,
      "gameState",
      (state) => state.phase === "results",
      2000
    );
    const aliceDraft = await emitAck(alice, "saveDraft", {
      roundIndex: 0,
      type: "text",
      content: "Phrase Alice encore en cours"
    });
    const bobDraft = await emitAck(bob, "saveDraft", {
      roundIndex: 0,
      type: "text",
      content: "Phrase Bob pas encore validée"
    });
    assert.equal(aliceDraft.ok, true);
    assert.equal(bobDraft.ok, true);

    const results = await resultsPromise;
    const contributions = results.chains.flatMap(
      (chain) => chain.contributions
    );
    assert.deepEqual(
      contributions.map((contribution) => contribution.content).sort(),
      [
        "Phrase Alice encore en cours",
        "Phrase Bob pas encore validée"
      ].sort()
    );
    assert.ok(contributions.every((contribution) => !contribution.empty));
  } finally {
    await cleanup(game, clients);
  }
});

test("les brouillons de dessin et d'audio survivent aussi au timeout", async () => {
  const scenarios = [
    {
      type: "drawing",
      randomInt: (maximum) => (maximum > 1 ? 1 : 0),
      content: DRAWING
    },
    {
      type: "audio",
      randomInt: (maximum) => maximum - 1,
      content: AUDIO
    }
  ];

  for (const scenario of scenarios) {
    const { game, url } = await startTestServer({
      roundDurationMs: 180,
      randomInt: scenario.randomInt
    });
    let clients = [];

    try {
      const setup = await createRoomWithPlayers(url, ["Alice", "Bob"]);
      clients = setup.clients;
      const [alice, bob] = clients;
      await emitAck(alice, "updateGameSettings", {
        roundCount: 1,
        inputTypeCount: 1
      });

      const statesPromise = Promise.all(
        clients.map((client) =>
          waitForEvent(
            client,
            "gameState",
            (state) => state.phase === "playing" && state.roundIndex === 0
          )
        )
      );
      await emitAck(alice, "startGame");
      const states = await statesPromise;
      assert.ok(
        states.every(
          (state) => state.assignment.expectedType === scenario.type
        )
      );

      const resultsPromise = waitForEvent(
        alice,
        "gameState",
        (state) => state.phase === "results",
        2000
      );
      await emitAck(alice, "saveDraft", {
        roundIndex: 0,
        type: scenario.type,
        content: scenario.content
      });
      await emitAck(bob, "saveDraft", {
        roundIndex: 0,
        type: scenario.type,
        content: scenario.content
      });

      const results = await resultsPromise;
      const contributions = results.chains.flatMap(
        (chain) => chain.contributions
      );
      assert.ok(
        contributions.every(
          (contribution) =>
            contribution.type === scenario.type &&
            contribution.content === scenario.content &&
            !contribution.empty
        )
      );
    } finally {
      await cleanup(game, clients);
    }
  }
});

test("une déconnexion est enregistrée vide et ne bloque pas la manche", async () => {
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

    const firstStatesPromise = Promise.all(
      clients.map((client) =>
        waitForEvent(
          client,
          "gameState",
          (state) => state.phase === "playing" && state.roundIndex === 0
        )
      )
    );
    await emitAck(alice, "startGame");
    const firstStates = await firstStatesPromise;

    const secondRound = waitForEvent(
      alice,
      "gameState",
      (state) => state.phase === "playing" && state.roundIndex === 1
    );
    claire.disconnect();
    await submitExpected(alice, firstStates[0], "Texte Alice");
    await submitExpected(bob, firstStates[1], "Texte Bob");
    await secondRound;

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
  const { game, url } = await startTestServer();
  let clients = [];

  try {
    const setup = await createRoomWithPlayers(url, ["Alice", "Bob"]);
    clients = setup.clients;
    const [alice, bob] = clients;

    const firstRound = waitForEvent(
      alice,
      "gameState",
      (state) => state.phase === "playing" && state.roundIndex === 0
    );
    await emitAck(alice, "startGame");
    const aliceState = await firstRound;

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
    const resumedState = await resumedStatePromise;
    assert.equal(resumedState.submitted, true);

    const nextRoundPromise = waitForEvent(
      replacementBob,
      "gameState",
      (state) => state.phase === "playing" && state.roundIndex === 1
    );
    await submitExpected(alice, aliceState, "Reconnexion");
    const nextRound = await nextRoundPromise;
    assert.equal(nextRound.submitted, false);
  } finally {
    await cleanup(game, clients);
  }
});

test("le contrôle du résumé suit le transfert d'hôte", async () => {
  const { game, url } = await startTestServer();
  let clients = [];

  try {
    const setup = await createRoomWithPlayers(url, ["Alice", "Bob"]);
    clients = setup.clients;
    const [alice, bob] = clients;
    await emitAck(alice, "updateGameSettings", {
      roundCount: 1,
      inputTypeCount: 3
    });

    const firstStatesPromise = Promise.all(
      clients.map((client) =>
        waitForEvent(
          client,
          "gameState",
          (state) => state.phase === "playing"
        )
      )
    );
    await emitAck(alice, "startGame");
    const firstStates = await firstStatesPromise;

    const resultsPromise = Promise.all(
      clients.map((client) =>
        waitForEvent(
          client,
          "gameState",
          (state) => state.phase === "results"
        )
      )
    );
    await submitExpected(alice, firstStates[0], "Alice");
    await submitExpected(bob, firstStates[1], "Bob");
    await resultsPromise;

    const promotedStatePromise = waitForEvent(
      bob,
      "gameState",
      (state) => state.phase === "results" && state.canControlResults
    );
    alice.disconnect();
    const promotedState = await promotedStatePromise;
    assert.equal(promotedState.currentChainIndex, 0);
    assert.equal(promotedState.currentContributionIndex, 0);

    const nextResultPromise = waitForEvent(
      bob,
      "gameState",
      (state) =>
        state.phase === "results" && state.currentChainIndex === 1
    );
    const navigated = await emitAck(bob, "navigateResults", {
      direction: 1
    });
    assert.equal(navigated.ok, true);
    await nextResultPromise;

    const lobbyPromise = waitForEvent(
      bob,
      "roomState",
      (room) => room.phase === "lobby"
    );
    const returned = await emitAck(bob, "returnToLobby");
    assert.equal(returned.ok, true);
    await lobbyPromise;
  } finally {
    await cleanup(game, clients);
  }
});

test("seul l'hôte peut relancer immédiatement une partie terminée", async () => {
  const { game, url } = await startTestServer();
  let clients = [];

  try {
    const setup = await createRoomWithPlayers(url, ["Alice", "Bob"]);
    clients = setup.clients;
    const [alice, bob] = clients;
    await emitAck(alice, "updateGameSettings", {
      roundCount: 1,
      inputTypeCount: 2
    });

    const firstStatesPromise = Promise.all(
      clients.map((client) =>
        waitForEvent(
          client,
          "gameState",
          (state) => state.phase === "playing"
        )
      )
    );
    await emitAck(alice, "startGame");
    const firstStates = await firstStatesPromise;
    const firstChainIds = firstStates.map(
      (state) => state.assignment.chainId
    );

    const resultsPromise = Promise.all(
      clients.map((client) =>
        waitForEvent(
          client,
          "gameState",
          (state) => state.phase === "results"
        )
      )
    );
    await submitExpected(alice, firstStates[0], "Premier Alice");
    await submitExpected(bob, firstStates[1], "Premier Bob");
    const results = await resultsPromise;
    assert.equal(results[0].canRestartGame, true);
    assert.equal(results[1].canRestartGame, false);

    const guestRestart = await emitAck(bob, "restartGame");
    assert.equal(guestRestart.ok, false);
    assert.match(guestRestart.error, /Seul l'hôte/);

    const restartedStatesPromise = Promise.all(
      clients.map((client) =>
        waitForEvent(
          client,
          "gameState",
          (state) => state.phase === "playing" && state.roundIndex === 0
        )
      )
    );
    const restarted = await emitAck(alice, "restartGame");
    assert.equal(restarted.ok, true);
    const restartedStates = await restartedStatesPromise;

    restartedStates.forEach((state, index) => {
      assert.equal(state.totalRounds, 1);
      assert.notEqual(state.assignment.chainId, firstChainIds[index]);
      assert.ok(state.assignment.expectedType);
    });
    const room = game.rooms.get(setup.code);
    assert.equal(room.settings.roundCount, 1);
    assert.equal(room.settings.inputTypeCount, 2);
    assert.ok(room.game.chains.every((chain) => chain.contributions.length === 0));
  } finally {
    await cleanup(game, clients);
  }
});

test("une contribution reste unique par manche", async () => {
  const { game, url } = await startTestServer();
  let clients = [];

  try {
    const setup = await createRoomWithPlayers(url, ["Alice", "Bob"]);
    clients = setup.clients;
    const [alice] = clients;

    const firstRound = waitForEvent(
      alice,
      "gameState",
      (state) => state.phase === "playing" && state.roundIndex === 0
    );
    await emitAck(alice, "startGame");
    const state = await firstRound;
    await submitExpected(alice, state, "Premier envoi");

    const duplicate = await emitAck(alice, "submitContribution", {
      roundIndex: 0,
      type: state.assignment.expectedType,
      content: contentForType(state.assignment.expectedType, "Doublon")
    });
    assert.equal(duplicate.ok, false);
    assert.match(duplicate.error, /déjà validée/);
  } finally {
    await cleanup(game, clients);
  }
});

test("la liste laterale recoit les etats de validation en direct", async () => {
  const { game, url } = await startTestServer();
  let clients = [];

  try {
    const setup = await createRoomWithPlayers(url, ["Alice", "Bob"]);
    clients = setup.clients;
    const [alice, bob] = clients;

    const firstStatesPromise = Promise.all(
      clients.map((client) =>
        waitForEvent(
          client,
          "gameState",
          (state) => state.phase === "playing" && state.roundIndex === 0
        )
      )
    );
    await emitAck(alice, "startGame");
    const firstStates = await firstStatesPromise;

    const statusUpdate = waitForEvent(
      bob,
      "roomState",
      (room) =>
        room.phase === "playing" &&
        room.players.some(
          (player) => player.nickname === "Alice" && player.status === "done"
        )
    );
    await submitExpected(alice, firstStates[0], "Alice a termine");
    const roomState = await statusUpdate;

    assert.equal(
      roomState.players.find((player) => player.nickname === "Alice").status,
      "done"
    );
    assert.equal(
      roomState.players.find((player) => player.nickname === "Bob").status,
      "playing"
    );
  } finally {
    await cleanup(game, clients);
  }
});
