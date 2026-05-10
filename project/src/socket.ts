import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

const SOCKET_URL = "http://localhost:3001";

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      console.log("SOCKET CONNECTED", socket?.id);
    });

    socket.on("disconnect", () => {
      console.log("SOCKET DISCONNECTED");
    });
  }

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}