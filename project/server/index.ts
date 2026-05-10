import { WebSocketServer } from "ws";

const wss = new WebSocketServer({
  port: 8081,
});

let clients: any[] = [];

wss.on("connection", (ws) => {
  clients.push(ws);

  console.log("camera connected");

  ws.on("message", (msg) => {
    clients.forEach((c) => {
      if (c.readyState === 1) {
        c.send(msg.toString());
      }
    });
  });

  ws.on("close", () => {
    clients = clients.filter((c) => c !== ws);
  });
});

console.log("camera server running on 8081");