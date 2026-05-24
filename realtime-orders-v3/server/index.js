require('dotenv').config();
const express = require('express');
const http    = require('http');
const cors    = require('cors');

const { setupWebSocketServer }                          = require('./websocket');
const { setupDatabase, createOrder, updateOrderStatus,
        deleteOrder, getOrders, pool }                  = require('./db');
const { startListening }                               = require('./notifier');
const { verifyEmailConnection }                        = require('./emailService');
const { notifyOrderCreated, notifyOrderUpdated,
        notifyOrderDeleted }                            = require('./notifications');
const { claimEvent }                                   = require('./emailDedup');

// ── Email validation helper ───────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(v) { return typeof v === 'string' && EMAIL_RE.test(v.trim()); }

const app = express();
app.use(cors());
app.use(express.json());

// ── REST API ──────────────────────────────────────────────────────────────────

// GET /orders — fetch all orders
app.get('/orders', async (req, res) => {
  try {
    const orders = await getOrders();
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /orders — create a new order
app.post('/orders', async (req, res) => {
  const { customer_name, customer_email, product_name, status } = req.body;

  if (!customer_name || !product_name) {
    return res.status(400).json({ success: false, error: 'customer_name and product_name are required' });
  }
  if (!customer_email) {
    return res.status(400).json({ success: false, error: 'customer_email is required' });
  }
  if (!isValidEmail(customer_email)) {
    return res.status(400).json({ success: false, error: 'customer_email must be a valid email address' });
  }

  try {
    const order = await createOrder(
      customer_name.trim(),
      customer_email.trim().toLowerCase(),
      product_name.trim(),
      status
    );

    // Claim BEFORE the pg_notify arrives at notifier.js so dedup is in place
    claimEvent('INSERT', order.id);

    res.status(201).json({ success: true, data: order });

    console.log(`[index] POST /orders — order #${order.id} for ${order.customer_email} — triggering email`);
    notifyOrderCreated(order);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /orders/:id — update order status
app.patch('/orders/:id', async (req, res) => {
  const { id }     = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'shipped', 'delivered'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      error: `status must be one of: ${validStatuses.join(', ')}`,
    });
  }

  try {
    // Capture old status BEFORE update for the email diff row
    const { rows: pre } = await pool.query(
      'SELECT status FROM orders WHERE id = $1', [id]
    );
    const oldStatus = pre.length ? pre[0].status : null;

    // Claim BEFORE the pg_notify arrives at notifier.js
    claimEvent('UPDATE', id);

    const order = await updateOrderStatus(id, status);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    res.json({ success: true, data: order });

    console.log(`[index] PATCH /orders/${id} — ${oldStatus} → ${status} | email → ${order.customer_email}`);
    notifyOrderUpdated(order, oldStatus);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /orders/:id — delete an order
app.delete('/orders/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Claim BEFORE the pg_notify arrives at notifier.js
    claimEvent('DELETE', id);

    const order = await deleteOrder(id);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    res.json({ success: true, data: order });

    console.log(`[index] DELETE /orders/${id} — order #${order.id} | email → ${order.customer_email}`);
    notifyOrderDeleted(order);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const PORT   = process.env.PORT || 3000;
const server = http.createServer(app);
const wss    = setupWebSocketServer(server);

(async () => {
  await setupDatabase();
  await startListening(wss);
  await verifyEmailConnection();

  server.listen(PORT, () => {
    console.log(`\n🚀 Server running at http://localhost:${PORT}`);
    console.log(`🔌 WebSocket server ready at ws://localhost:${PORT}`);
    console.log(`📋 GET    /orders      — fetch all orders`);
    console.log(`📋 POST   /orders      — create an order`);
    console.log(`📋 PATCH  /orders/:id  — update order status`);
    console.log(`📋 DELETE /orders/:id  — delete an order`);
    console.log(`❤️  GET    /health      — server health\n`);
  });
})();