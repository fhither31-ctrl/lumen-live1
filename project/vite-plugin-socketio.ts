import type { Plugin, ViteDevServer } from "vite";
import { Server as SocketIOServer } from "socket.io";

export function socketioPlugin(): Plugin {
  return {
    name: "vite-plugin-socketio",
    configureServer(server: ViteDevServer) {
      if (!server.httpServer) return;

      const io = new SocketIOServer(server.httpServer, {
        cors: { origin: "*", methods: ["GET", "POST"] },
        maxHttpBufferSize: 4 * 1024 * 1024,
        path: "/socket.io/",
      });

      const rooms = new Map<string, { hostSocketId: string; viewers: Set<string> }>();

      io.on("connection", (socket) => {
        socket.on("camera:register", ({ roomId }: { roomId: string }) => {
          socket.join(roomId);
          if (!rooms.has(roomId)) rooms.set(roomId, { hostSocketId: socket.id, viewers: new Set() });
          else rooms.get(roomId)!.hostSocketId = socket.id;
        });

        socket.on("camera:watch", ({ roomId }: { roomId: string }) => {
          socket.join(roomId);
          const room = rooms.get(roomId);
          if (room) room.viewers.add(socket.id);
        });

        socket.on("camera:frame", ({ roomId, frame }: { roomId: string; frame: string }) => {
          socket.to(roomId).emit("camera:frame", { roomId, frame });
        });

        socket.on("disconnect", () => {
          rooms.forEach((room, roomId) => {
            room.viewers.delete(socket.id);
            if (room.hostSocketId === socket.id) {
              io.to(roomId).emit("camera:offline", { roomId });
              rooms.delete(roomId);
            }
          });
        });
      });
    },
  };
}
