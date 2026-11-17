// Local MQTT broker for development: TCP :1883 + WebSockets :8083/mqtt.
// Mirrors the EMQX layout (TLS 8883 / WSS 8084) without TLS. Do not expose publicly.
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { Aedes } from "aedes";
import { WebSocketServer, createWebSocketStream } from "ws";

const TCP_PORT = Number(process.env.BROKER_TCP_PORT ?? 1883);
const WS_PORT = Number(process.env.BROKER_WS_PORT ?? 8083);

const aedes = await Aedes.createBroker();

createServer(aedes.handle).listen(TCP_PORT, () => console.log(`MQTT  tcp://localhost:${TCP_PORT}`));

const http = createHttpServer();
const wss = new WebSocketServer({ server: http, path: "/mqtt" });
wss.on("connection", (socket, req) => {
  const stream = createWebSocketStream(socket);
  aedes.handle(stream as never, req as never);
});
http.listen(WS_PORT, () => console.log(`MQTT  ws://localhost:${WS_PORT}/mqtt`));

aedes.on("client", (c) => console.log(`+ ${c?.id}`));
aedes.on("clientDisconnect", (c) => console.log(`- ${c?.id}`));
aedes.on("publish", (packet, client) => {
  if (client && !packet.topic.endsWith("/state")) console.log(`> ${packet.topic} ${packet.payload.toString().slice(0, 120)}`);
});
