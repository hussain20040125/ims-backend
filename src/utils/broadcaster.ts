import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

let wss: WebSocketServer;

export const initBroadcaster = (server: Server) => {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket & { userRole?: string }) => {
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'REGISTER_ROLE') ws.userRole = data.role;
      } catch {
        // ignore malformed WS messages
      }
    });
  });
};

export const broadcast = (data: any) => {
  if (!wss) return;
  
  const payload = { ...data };
  if (payload.type === 'NOTIFICATION' && !payload.id) {
    payload.id = `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  const targetRoles = payload.targetRoles || [];
  const message = JSON.stringify(payload);
  
  wss.clients.forEach((client: WebSocket & { userRole?: string }) => {
    if (client.readyState === WebSocket.OPEN) {
      // If no targetRoles specified, broadcast to all
      // Super Admin and admin roles get all notifications
      if (
        targetRoles.length === 0 || 
        client.userRole === 'Super Admin' || 
        client.userRole === 'admin' ||
        (client.userRole && targetRoles.includes(client.userRole))
      ) {
        client.send(message);
      }
    }
  });
};
