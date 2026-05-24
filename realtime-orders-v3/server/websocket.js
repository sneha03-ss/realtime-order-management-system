const { WebSocketServer, WebSocket } = require('ws');

/**
 * Attaches a WebSocket server to the provided HTTP server.
 * Each connecting client immediately receives a welcome message
 * plus a ping every 30 s to keep the connection alive through
 * proxies / load balancers.
 */
function setupWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`🔗 WebSocket client connected: ${ip}  (total: ${wss.clients.size})`);

    ws.send(JSON.stringify({
      type: 'CONNECTED',
      message: 'Real-time orders stream connected',
      timestamp: new Date().toISOString(),
    }));

    // Heartbeat: keep-alive ping every 30 s
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'PING', timestamp: new Date().toISOString() }));
      }
    }, 30_000);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        // Clients may send a PONG — we just log it
        if (msg.type === 'PONG') return;
        console.log('⬆️  Client message:', msg);
      } catch (_) { /* ignore non-JSON */ }
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      console.log(`🔌 WebSocket client disconnected: ${ip}  (total: ${wss.clients.size})`);
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err.message);
    });
  });

  return wss;
}

/**
 * Sends a JSON message to every currently-open WebSocket client.
 */
function broadcast(wss, data) {
  const payload = JSON.stringify(data);
  let sent = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
      sent++;
    }
  });
  if (sent > 0) console.log(`📤 Broadcast to ${sent} client(s)`);
}

module.exports = { setupWebSocketServer, broadcast };
