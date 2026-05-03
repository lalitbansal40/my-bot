import { WebSocket } from "ws";

// accountId → connected WebSocket clients
const connections = new Map<string, Set<WebSocket>>();

export const addLocalConnection = (accountId: string, ws: WebSocket) => {
  if (!connections.has(accountId)) {
    connections.set(accountId, new Set());
  }
  connections.get(accountId)!.add(ws);
};

export const removeLocalConnection = (accountId: string, ws: WebSocket) => {
  connections.get(accountId)?.delete(ws);
};

export const pushToAccountLocal = (accountId: string, data: any) => {
  const conns = connections.get(accountId);
  console.log(`[WS] pushToAccountLocal — accountId: ${accountId}, connections found: ${conns?.size ?? 0}`);
  if (!conns?.size) return;

  const payload = JSON.stringify(data);
  let sentCount = 0;
  conns.forEach((ws) => {
    console.log(`[WS] Connection state: ${ws.readyState} (1=OPEN)`);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
      sentCount++;
    } else {
      // stale connection — remove it
      conns.delete(ws);
    }
  });
  console.log(`[WS] Sent to ${sentCount} client(s)`);
};
