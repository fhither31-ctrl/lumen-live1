import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.use(cors());

app.get("/", (_req, res) => {
  res.json({ status: "Lumen WebRTC Server Running" });
});

const rooms = new Map();

io.on("connection", (socket) => {
  console.log("connect", socket.id);

  socket.on("camera:register", ({ roomId }) => {
    if (!roomId) return;

    socket.join(roomId);

    const oldRoom = rooms.get(roomId);
    if (oldRoom?.hostId && oldRoom.hostId !== socket.id) {
      io.to(oldRoom.hostId).emit("camera:replaced", { roomId });
    }

    rooms.set(roomId, {
      hostId: socket.id,
      viewers: oldRoom?.viewers || new Set(),
    });

    io.to(roomId).emit("camera:online", { roomId });

    const room = rooms.get(roomId);
    room.viewers.forEach((viewerId) => {
      io.to(socket.id).emit("viewer:ready", {
        roomId,
        viewerId,
      });
    });

    console.log("camera registered", roomId, socket.id);
  });

  socket.on("camera:watch", ({ roomId }) => {
    if (!roomId) return;

    socket.join(roomId);

    let room = rooms.get(roomId);

    if (!room) {
      room = {
        hostId: null,
        viewers: new Set(),
      };
      rooms.set(roomId, room);
    }

    room.viewers.add(socket.id);

    if (room.hostId) {
      socket.emit("camera:online", { roomId });

      io.to(room.hostId).emit("viewer:ready", {
        roomId,
        viewerId: socket.id,
      });
    }

    console.log("viewer watching", roomId, socket.id);
  });

  socket.on("webrtc:offer", ({ to, roomId, sdp }) => {
    if (!to || !sdp) return;

    io.to(to).emit("webrtc:offer", {
      from: socket.id,
      roomId,
      sdp,
    });
  });

  socket.on("webrtc:answer", ({ to, roomId, sdp }) => {
    if (!to || !sdp) return;

    io.to(to).emit("webrtc:answer", {
      from: socket.id,
      roomId,
      sdp,
    });
  });

  socket.on("webrtc:ice", ({ to, roomId, candidate }) => {
    if (!to || !candidate) return;

    io.to(to).emit("webrtc:ice", {
      from: socket.id,
      roomId,
      candidate,
    });
  });

  socket.on("disconnect", () => {
    rooms.forEach((room, roomId) => {
      if (room.hostId === socket.id) {
        room.hostId = null;
        io.to(roomId).emit("camera:offline", { roomId });
      }

      room.viewers.delete(socket.id);

      if (!room.hostId && room.viewers.size === 0) {
        rooms.delete(roomId);
      }
    });

    console.log("disconnect", socket.id);
  });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`Lumen WebRTC Server running on port ${PORT}`);
});
