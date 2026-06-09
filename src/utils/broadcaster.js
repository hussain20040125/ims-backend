var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
import { WebSocketServer, WebSocket } from "ws";
let wss;
const initBroadcaster = /* @__PURE__ */ __name((server) => {
  wss = new WebSocketServer({ server });
  wss.on("connection", (ws) => {
    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === "REGISTER_ROLE") ws.userRole = data.role;
      } catch {
      }
    });
  });
}, "initBroadcaster");
const broadcast = /* @__PURE__ */ __name((data) => {
  if (!wss) return;
  const payload = { ...data };
  if (payload.type === "NOTIFICATION" && !payload.id) {
    payload.id = `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  const targetRoles = payload.targetRoles || [];
  const message = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      if (targetRoles.length === 0 || client.userRole === "Super Admin" || client.userRole === "admin" || client.userRole && targetRoles.includes(client.userRole)) {
        client.send(message);
      }
    }
  });
}, "broadcast");
export {
  broadcast,
  initBroadcaster
};
