import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },

  maxHttpBufferSize: 4 * 1024 * 1024,
});

app.use(cors());

app.get("/", (_req, res) => {
  res.json({
    status: "Lumen Camera Server Running",
    port: process.env.PORT || 3001,
  });
});

/*
  rooms = {
    roomId: {
      hostSocketId,
      viewers:Set
    }
  }
*/
const rooms = new Map();

io.on("connection", (socket) => {
  console.log("CONNECT", socket.id);

  // PHONE REGISTER
  socket.on("camera:register", ({ roomId }) => {
    console.log("PHONE REGISTERED:", roomId);

    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        hostSocketId: socket.id,
        viewers: new Set(),
      });
    } else {
      rooms.get(roomId).hostSocketId = socket.id;
    }

    console.log("ROOM ACTIVE:", roomId);
  });

  // DESKTOP WATCH
  socket.on("camera:watch", ({ roomId }) => {
    console.log("VIEWER JOIN:", roomId);

    socket.join(roomId);

    const room = rooms.get(roomId);

    if (room) {
      room.viewers.add(socket.id);
    }
  });

  // VIDEO FRAME
  socket.on("camera:frame", ({ roomId, frame }) => {
    console.log("FRAME:", roomId);

    socket.to(roomId).emit("camera:frame", {
      roomId,
      frame,
    });
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    console.log("DISCONNECT:", socket.id);

    rooms.forEach((room, roomId) => {
      room.viewers.delete(socket.id);

      if (room.hostSocketId === socket.id) {
        io.to(roomId).emit("camera:offline", {
          roomId,
        });

        rooms.delete(roomId);

        console.log("ROOM CLOSED:", roomId);
      }
    });
  });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`Lumen Camera Server running on port ${PORT}`);
});