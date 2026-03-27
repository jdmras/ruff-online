import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import http from "http";

import {
  makeDeck,
  shuffleForMode,
  sortHand,
  nextSeat,
  teamOfSeat,
  compareCards,
  calcCapturedPoints
} from "./game.js";

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

const app = express();

app.use(
  cors({
    origin: CLIENT_URL,
    methods: ["GET", "POST"],
    credentials: true
  })
);

app.get("/", (_, res) => res.send("ruff server ok"));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"],
    credentials: true
  }
});

const rooms = new Map();

function makeRoom(id) {
  return {
    id,
    phase: "LOBBY",

    hostSocketId: null,

    players: [null, null, null, null],

    dealerSeat: 0,
    nextGameDealerSeat: null,
    turnSeat: 0,

    hands: [[], [], [], []],

    bids: [],
    highBid: null,
    bidStartSeat: null,

    trump: null,
    declarerSeat: null,

    trick: {
      leadSuit: null,
      plays: []
    },

    lastTrick: null,
    trickHistory: [],

    captured: [[], []],

    gameScore: [0, 0],
    handScore: [0, 0],

    handSummary: null,
    winningTeam: null,

    gamesStarted: 0,
    completedGames: [],

    previousHandDeckOrder: null,
    currentShuffleMode: "classic"
  };
}

function roomPublicState(room) {
  return {
    id: room.id,
    phase: room.phase,
    hostSocketId: room.hostSocketId,

    players: room.players.map((p, i) =>
      p
        ? {
            seat: i,
            id: p.socketId,
            name: p.name,
            connected: p.connected
          }
        : null
    ),

    dealerSeat: room.dealerSeat,
    nextGameDealerSeat: room.nextGameDealerSeat,
    turnSeat: room.turnSeat,

    bids: room.bids,
    highBid: room.highBid,
    bidStartSeat: room.bidStartSeat,

    trump: room.trump,
    declarerSeat: room.declarerSeat,

    trick: {
      leadSuit: room.trick.leadSuit,
      plays: room.trick.plays.map((p) => ({
        seat: p.seat,
        card: { s: p.card.s, r: p.card.r, id: p.card.id }
      }))
    },

    lastTrick: room.lastTrick
      ? {
          leadSuit: room.lastTrick.leadSuit,
          winnerSeat: room.lastTrick.winnerSeat,
          plays: room.lastTrick.plays.map((p) => ({
            seat: p.seat,
            card: { s: p.card.s, r: p.card.r, id: p.card.id }
          }))
        }
      : null,

    trickHistoryCount: room.trickHistory.length,
    capturedPoints: room.handScore,
    gameScore: room.gameScore,
    handSummary: room.handSummary,
    winningTeam: room.winningTeam,
    completedGames: room.completedGames,
    currentShuffleMode: room.currentShuffleMode
  };
}

function sendState(room) {
  io.to(room.id).emit("state", roomPublicState(room));

  room.players.forEach((p, seat) => {
    if (!p?.connected) return;
    io.to(p.socketId).emit("your_hand", sortHand(room.hands[seat]));
  });
}

function roomHasFour(room) {
  return room.players.every(Boolean);
}

function seatOfSocket(room, socketId) {
  return room.players.findIndex((p) => p?.socketId === socketId);
}

function firstConnectedPlayerSocketId(room) {
  const p = room.players.find((x) => x?.connected);
  return p?.socketId ?? null;
}

function randomSeat() {
  return Math.floor(Math.random() * 4);
}

function nextSeatOnWinningTeam(startSeat, winningTeam) {
  let seat = nextSeat(startSeat);

  for (let i = 0; i < 4; i++) {
    if (teamOfSeat(seat) === winningTeam) {
      return seat;
    }
    seat = nextSeat(seat);
  }

  return 0;
}

function resetScoresForNewGame(room) {
  room.gameScore = [0, 0];
  room.handScore = [0, 0];
  room.handSummary = null;
  room.winningTeam = null;
}

function clearHandState(room) {
  room.hands = [[], [], [], []];
  room.bids = [];
  room.highBid = null;
  room.bidStartSeat = null;
  room.trump = null;
  room.declarerSeat = null;
  room.trick = { leadSuit: null, plays: [] };
  room.lastTrick = null;
  room.trickHistory = [];
  room.captured = [[], []];
  room.handScore = [0, 0];
  room.handSummary = null;
  room.winningTeam = null;
  room.turnSeat = 0;
  room.currentShuffleMode = "classic";
}

function moveToLobbyForNextGame(room) {
  room.phase = "LOBBY";
  clearHandState(room);
}

function abortCurrentHand(room) {
  room.dealerSeat = nextSeat(room.dealerSeat);
  room.nextGameDealerSeat = null;
  clearHandState(room);
  startHand(room, { shuffleMode: "classic", freshGame: false });
}

function abortCurrentGame(room) {
  room.phase = "LOBBY";
  room.nextGameDealerSeat = null;
  room.gamesStarted = 0;
  room.previousHandDeckOrder = null;
  room.gameScore = [0, 0];
  room.handScore = [0, 0];
  room.handSummary = null;
  room.winningTeam = null;
  room.completedGames = [];
  clearHandState(room);
}

function startHand(room, { shuffleMode = "classic", freshGame = false } = {}) {
  room.phase = "BID";

  room.hands = [[], [], [], []];

  room.bids = [];
  room.highBid = null;
  room.bidStartSeat = nextSeat(room.dealerSeat);

  room.trump = null;
  room.declarerSeat = null;

  room.trick = { leadSuit: null, plays: [] };
  room.lastTrick = null;
  room.trickHistory = [];

  room.captured = [[], []];
  room.handScore = [0, 0];

  room.handSummary = null;
  room.winningTeam = null;

  let deck;
  let appliedShuffle = shuffleMode;

  if (!freshGame && room.previousHandDeckOrder && room.previousHandDeckOrder.length === 36) {
    deck = shuffleForMode(room.previousHandDeckOrder, shuffleMode);
  } else {
    deck = shuffleForMode(makeDeck(), "classic");
    appliedShuffle = "classic";
  }

  room.currentShuffleMode = appliedShuffle;

  let deckIndex = 0;
  let seat = nextSeat(room.dealerSeat);

  while (deckIndex < deck.length) {
    for (let k = 0; k < 3; k++) {
      room.hands[seat].push(deck[deckIndex++]);
    }
    seat = nextSeat(seat);
  }

  room.turnSeat = room.bidStartSeat;
}

function legalBid(room, bidAmount) {
  if (!Number.isFinite(bidAmount)) return false;
  if (bidAmount < 50) return false;
  if (bidAmount % 5 !== 0) return false;

  if (!room.highBid) return true;

  return bidAmount > room.highBid.amount;
}

function beginPlay(room) {
  room.phase = "PLAY";
  room.turnSeat = room.declarerSeat;
  room.trick = { leadSuit: null, plays: [] };
}

function resolveTrick(room) {
  const { leadSuit, plays } = room.trick;
  const trumpSuit = room.trump === "NO_TRUMP" ? null : room.trump;

  let winner = plays[0];

  for (let i = 1; i < plays.length; i++) {
    const candidate = plays[i];
    const cmp = compareCards(
      candidate.card,
      winner.card,
      leadSuit,
      trumpSuit
    );

    if (cmp === 1) {
      winner = candidate;
    }
  }

  const team = teamOfSeat(winner.seat);
  room.captured[team].push(...plays.map((p) => p.card));

  room.lastTrick = {
    leadSuit,
    plays: [...plays],
    winnerSeat: winner.seat
  };

  room.trickHistory.push(room.lastTrick);

  room.trick = { leadSuit: null, plays: [] };

  room.handScore = [
    calcCapturedPoints(room.captured[0]),
    calcCapturedPoints(room.captured[1])
  ];

  room.turnSeat = winner.seat;

  if (room.trickHistory.length === 9) {
    scoreHand(room);
  }
}

function scoreHand(room) {
  const contract = room.highBid;
  const declarerTeam = teamOfSeat(contract.seat);
  const otherTeam = 1 - declarerTeam;

  const declarerPoints = room.handScore[declarerTeam];
  const otherPoints = room.handScore[otherTeam];

  const bidAmount = contract.amount;
  const noTrump = room.trump === "NO_TRUMP";
  const madeBid = declarerPoints >= bidAmount;

  const gameScoreBefore = [...room.gameScore];

  if (!noTrump) {
    if (madeBid) {
      room.gameScore[declarerTeam] += declarerPoints;
    } else {
      room.gameScore[declarerTeam] -= bidAmount;
    }

    room.gameScore[otherTeam] += otherPoints;
  } else {
    if (madeBid) {
      room.gameScore[declarerTeam] += declarerPoints * 2;
    } else {
      room.gameScore[declarerTeam] -= bidAmount * 2;
    }

    room.gameScore[otherTeam] += otherPoints;
  }

  room.previousHandDeckOrder = [
    ...room.captured[0].map((c) => ({ ...c })),
    ...room.captured[1].map((c) => ({ ...c }))
  ];

  room.handSummary = {
    bidAmount,
    declarerSeat: contract.seat,
    trump: room.trump,
    madeBid,
    capturedPoints: [...room.handScore],
    gameScoreBefore,
    gameScoreAfter: [...room.gameScore],
    capturedCards: [
      room.captured[0].map((c) => ({ s: c.s, r: c.r, id: c.id })),
      room.captured[1].map((c) => ({ s: c.s, r: c.r, id: c.id }))
    ]
  };

  const a = room.gameScore[0];
  const b = room.gameScore[1];

  if (a >= 300 || b >= 300) {
    if (a >= 300 && b >= 300) {
      room.winningTeam = madeBid ? declarerTeam : otherTeam;
    } else if (a >= 300) {
      room.winningTeam = 0;
    } else {
      room.winningTeam = 1;
    }

    room.nextGameDealerSeat = nextSeatOnWinningTeam(
      room.dealerSeat,
      room.winningTeam
    );

    room.completedGames.push({
      gameNumber: room.completedGames.length + 1,
      team1Score: room.gameScore[0],
      team2Score: room.gameScore[1],
      winningTeam: room.winningTeam,
      nextDealerSeat: room.nextGameDealerSeat
    });

    room.phase = "GAME_OVER";
  } else {
    room.phase = "HAND_COMPLETE";
    room.dealerSeat = nextSeat(room.dealerSeat);
    room.turnSeat = room.dealerSeat;
  }
}

io.on("connection", (socket) => {
  socket.on("join", ({ roomId, name }) => {
    const rid = String(roomId || "").trim() || "default";
    const playerName = String(name || "Player").slice(0, 20);

    let room = rooms.get(rid);
    if (!room) {
      room = makeRoom(rid);
      rooms.set(rid, room);
    }

    if (!room.hostSocketId) {
      room.hostSocketId = socket.id;
    }

    const seat = room.players.findIndex((p) => p === null);
    if (seat === -1) {
      socket.emit("error_msg", "Room is full.");
      return;
    }

    room.players[seat] = {
      socketId: socket.id,
      name: playerName,
      connected: true
    };

    socket.join(rid);
    sendState(room);
  });

  socket.on("set_lobby_seats", ({ roomId, seatAssignments }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    if (room.phase !== "LOBBY") {
      socket.emit("error_msg", "Seat assignment is only allowed in the lobby.");
      return;
    }

    if (socket.id !== room.hostSocketId) {
      socket.emit("error_msg", "Only the setup host can assign seats.");
      return;
    }

    if (!Array.isArray(seatAssignments) || seatAssignments.length !== 4) {
      socket.emit("error_msg", "Invalid seat assignment payload.");
      return;
    }

    const currentPlayers = room.players.filter(Boolean);
    const currentIds = currentPlayers.map((p) => p.socketId).sort();
    const requestedIds = seatAssignments.filter(Boolean).slice().sort();

    if (requestedIds.length !== currentPlayers.length) {
      socket.emit("error_msg", "All seated players must be assigned exactly once.");
      return;
    }

    if (JSON.stringify(currentIds) !== JSON.stringify(requestedIds)) {
      socket.emit("error_msg", "Seat assignment must contain exactly the current players.");
      return;
    }

    const byId = new Map(currentPlayers.map((p) => [p.socketId, p]));
    room.players = seatAssignments.map((id) => byId.get(id) || null);

    sendState(room);
  });

  socket.on("start_game", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    if (!(room.phase === "LOBBY" || room.phase === "GAME_OVER")) {
      socket.emit("error_msg", "Game can only be started from the lobby or after game over.");
      return;
    }

    if (socket.id !== room.hostSocketId) {
      socket.emit("error_msg", "Only the setup host can start the game.");
      return;
    }

    if (!roomHasFour(room)) {
      socket.emit("error_msg", "All 4 seats must be filled before starting.");
      return;
    }

    resetScoresForNewGame(room);

    if (room.phase === "LOBBY" && room.gamesStarted === 0) {
      room.dealerSeat = randomSeat();
    } else if (room.nextGameDealerSeat !== null) {
      room.dealerSeat = room.nextGameDealerSeat;
    } else {
      room.dealerSeat = randomSeat();
    }

    room.nextGameDealerSeat = null;
    room.gamesStarted += 1;

    startHand(room, { shuffleMode: "classic", freshGame: true });
    sendState(room);
  });

  socket.on("prepare_next_game", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    if (room.phase !== "GAME_OVER") {
      socket.emit("error_msg", "Next game setup is only available after game over.");
      return;
    }

    if (socket.id !== room.hostSocketId) {
      socket.emit("error_msg", "Only the setup host can prepare the next game.");
      return;
    }

    moveToLobbyForNextGame(room);
    sendState(room);
  });

  socket.on("stop_hand", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    if (socket.id !== room.hostSocketId) {
      socket.emit("error_msg", "Only the host can stop the hand.");
      return;
    }

    if (!["BID", "DECLARE", "PLAY", "HAND_COMPLETE"].includes(room.phase)) {
      socket.emit("error_msg", "A hand is not currently in progress.");
      return;
    }

    abortCurrentHand(room);
    sendState(room);
  });

  socket.on("stop_game", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    if (socket.id !== room.hostSocketId) {
      socket.emit("error_msg", "Only the host can stop the game.");
      return;
    }

    if (room.phase === "LOBBY") {
      socket.emit("error_msg", "Game is already at the lobby.");
      return;
    }

    abortCurrentGame(room);
    sendState(room);
  });

  socket.on("bid", ({ roomId, amount }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const seat = seatOfSocket(room, socket.id);
    if (seat < 0) return;

    if (room.phase !== "BID") {
      socket.emit("error_msg", "Not in bidding phase.");
      return;
    }

    if (room.turnSeat !== seat) {
      socket.emit("error_msg", "Not your turn to bid.");
      return;
    }

    const bidAmount = Number(amount);

    if (!legalBid(room, bidAmount)) {
      socket.emit("error_msg", "Illegal bid.");
      return;
    }

    room.bids.push({ seat, type: "BID", amount: bidAmount });
    room.highBid = { seat, amount: bidAmount };

    room.turnSeat = nextSeat(room.turnSeat);

    if (room.turnSeat === room.bidStartSeat) {
      room.declarerSeat = room.highBid.seat;
      room.phase = "DECLARE";
      room.turnSeat = room.declarerSeat;
    }

    sendState(room);
  });

  socket.on("pass_bid", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const seat = seatOfSocket(room, socket.id);
    if (seat < 0) return;

    if (room.phase !== "BID") {
      socket.emit("error_msg", "Not in bidding phase.");
      return;
    }

    if (room.turnSeat !== seat) {
      socket.emit("error_msg", "Not your turn to bid.");
      return;
    }

    room.bids.push({ seat, type: "PASS" });

    room.turnSeat = nextSeat(room.turnSeat);

    if (room.turnSeat === room.bidStartSeat) {
      if (!room.highBid) {
        room.highBid = { seat: room.dealerSeat, amount: 50 };
        room.declarerSeat = room.dealerSeat;
      } else {
        room.declarerSeat = room.highBid.seat;
      }

      room.phase = "DECLARE";
      room.turnSeat = room.declarerSeat;
    }

    sendState(room);
  });

  socket.on("dealer_take", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const seat = seatOfSocket(room, socket.id);
    if (seat < 0) return;

    if (room.phase !== "BID") {
      socket.emit("error_msg", "Dealer can only take during bidding.");
      return;
    }

    if (seat !== room.dealerSeat) {
      socket.emit("error_msg", "Only dealer can take.");
      return;
    }

    if (room.turnSeat !== seat) {
      socket.emit("error_msg", "Not your turn to bid.");
      return;
    }

    if (!room.highBid) {
      socket.emit("error_msg", "No high bid to take.");
      return;
    }

    const amount = room.highBid.amount;

    room.bids.push({
      seat,
      type: "TAKE",
      amount
    });

    room.highBid = {
      seat,
      amount
    };

    room.declarerSeat = seat;
    room.phase = "DECLARE";
    room.turnSeat = seat;

    sendState(room);
  });

  socket.on("declare_trump", ({ roomId, trump }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const seat = seatOfSocket(room, socket.id);
    if (seat < 0) return;

    if (room.phase !== "DECLARE") {
      socket.emit("error_msg", "Not in declare phase.");
      return;
    }

    if (seat !== room.declarerSeat) {
      socket.emit("error_msg", "Not your turn to declare.");
      return;
    }

    const t = String(trump);
    if (!["S", "H", "D", "C", "NO_TRUMP"].includes(t)) {
      socket.emit("error_msg", "Invalid trump.");
      return;
    }

    room.trump = t;
    beginPlay(room);

    sendState(room);
  });

  socket.on("play_card", ({ roomId, cardId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const seat = seatOfSocket(room, socket.id);
    if (seat < 0) return;

    if (room.phase !== "PLAY") {
      socket.emit("error_msg", "Not in play phase.");
      return;
    }

    if (room.turnSeat !== seat) {
      socket.emit("error_msg", "Not your turn.");
      return;
    }

    const hand = room.hands[seat];
    const idx = hand.findIndex((c) => c.id === cardId);

    if (idx < 0) {
      socket.emit("error_msg", "You do not have that card.");
      return;
    }

    const card = hand[idx];
    const leadSuit = room.trick.leadSuit;

    if (leadSuit) {
      const hasLeadSuit = hand.some((c) => c.s === leadSuit);
      if (hasLeadSuit && card.s !== leadSuit) {
        socket.emit("error_msg", "Must follow suit.");
        return;
      }
    }

    hand.splice(idx, 1);

    if (room.trick.plays.length === 0) {
      room.trick.leadSuit = card.s;
      room.lastTrick = null;
    }

    room.trick.plays.push({ seat, card });

    if (room.trick.plays.length === 4) {
      resolveTrick(room);
    } else {
      room.turnSeat = nextSeat(room.turnSeat);
    }

    sendState(room);
  });

  socket.on("start_next_hand", ({ roomId, shuffleMode }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const seat = seatOfSocket(room, socket.id);
    if (seat < 0) return;

    if (room.phase !== "HAND_COMPLETE") {
      socket.emit("error_msg", "Hand is not complete.");
      return;
    }

    if (seat !== room.dealerSeat) {
      socket.emit("error_msg", "Only the next dealer can start the next hand.");
      return;
    }

    const allowed = ["light", "medium", "heavy", "classic"];
    const mode = allowed.includes(shuffleMode) ? shuffleMode : "classic";

    startHand(room, { shuffleMode: mode, freshGame: false });
    sendState(room);
  });

  socket.on("chat_message", ({ roomId, name, text }) => {
    const rid = String(roomId || "").trim();
    const chatName = String(name || "Player").slice(0, 20);
    const chatText = String(text || "").trim();

    if (!rid || !chatText) return;

    io.to(rid).emit("chat_message", {
      name: chatName,
      text: chatText,
      ts: Date.now()
    });
  });

  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
      const seat = seatOfSocket(room, socket.id);
      if (seat >= 0) {
        room.players[seat].connected = false;

        if (room.hostSocketId === socket.id) {
          room.hostSocketId = firstConnectedPlayerSocketId(room);
        }

        sendState(room);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});