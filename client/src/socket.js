import { io } from "socket.io-client";

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

export const socket = io(SERVER_URL, {
  autoConnect: false
});

export function connectSocket() {

  if (!socket.connected) {
    socket.connect();
  }

  return socket;
}