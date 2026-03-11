/*import { io } from "socket.io-client";

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

export const socket = io(SERVER_URL, {
  autoConnect: false,
  transports: ["websocket", "polling"]
});

export function connectSocket() {
  if (!socket.connected) {
    socket.connect();
  }

  return socket;
}*/
/*
import { io } from "socket.io-client";

export const socket = io("http://localhost:3001", {
  transports: ["websocket"]
});*/

import { io } from "socket.io-client";

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

export const socket = io(SERVER_URL, {
  transports: ["websocket"]
});

export function connectSocket() {
  return socket;
}