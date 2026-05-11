import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 5 * 1024 * 1024,
});

app.use(cors());

app.get("/", (_req, res) => {
  res.json({ status: "Lumen Frame Camera Server Running" });
});

io.on("connection", (socket) => {
  console.log("connect", socket.id);

  socket.on("camera:register", ({ roomId }) => {
    socket.join(roomId);
    io.to(roomId).emit("camera:online", { roomId });
    console.log("camera online", roomId);
  });

  socket.on("camera:watch", ({ roomId }) => {
    socket.join(roomId);
    console.log("viewer watching", roomId);
  });

  socket.on("camera:frame", ({ roomId, frame }) => {
    socket.to(roomId).emit("camera:frame", { roomId, frame });
  });

  socket.on("disconnect", () => {
    console.log("disconnect", socket.id);
  });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`Lumen Frame Camera Server running on port ${PORT}`);
});
