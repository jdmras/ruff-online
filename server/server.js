const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();

function createRoom(code) {
  const room = {
    code,
    players: []
  };

  rooms.set(code, room);
  return room;
}

function getRoom(code) {
  return rooms.get(code);
}

function serializeRoom(room) {
  return {
    code: room.code,
    players: room.players
  };
}

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

io.on("connection", (socket) => {

  console.log("Socket connected:", socket.id);

  socket.on("createRoom", ({ roomCode, playerName }, callback) => {

    const code = roomCode.trim().toUpperCase();

    if (!code) {
      return callback({ ok: false, error: "Room code required" });
    }

    if (rooms.has(code)) {
      return callback({ ok: false, error: "Room already exists" });
    }

    const room = createRoom(code);

    const player = {
      id: socket.id,
      name: playerName || "Player",
      seat: 0
    };

    room.players.push(player);

    socket.join(code);

    socket.data.roomCode = code;

    io.to(code).emit("roomUpdated", serializeRoom(room));

    callback({
      ok: true,
      room: serializeRoom(room),
      player
    });

  });

  socket.on("joinRoom", ({ roomCode, playerName }, callback) => {

    const code = roomCode.trim().toUpperCase();

    const room = getRoom(code);

    if (!room) {
      return callback({ ok: false, error: "Room not found" });
    }

    if (room.players.length >= 4) {
      return callback({ ok: false, error: "Room full" });
    }

    const seat = room.players.length;

    const player = {
      id: socket.id,
      name: playerName || "Player",
      seat
    };

    room.players.push(player);

    socket.join(code);

    socket.data.roomCode = code;

    io.to(code).emit("roomUpdated", serializeRoom(room));

    callback({
      ok: true,
      room: serializeRoom(room),
      player
    });

  });

  socket.on("disconnect", () => {

    const roomCode = socket.data.roomCode;

    if (!roomCode) return;

    const room = rooms.get(roomCode);

    if (!room) return;

    room.players = room.players.filter(p => p.id !== socket.id);

    if (room.players.length === 0) {
      rooms.delete(roomCode);
    } else {
      io.to(roomCode).emit("roomUpdated", serializeRoom(room));
    }

    console.log("Socket disconnected:", socket.id);

  });

});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log("Server listening on port", PORT);
});