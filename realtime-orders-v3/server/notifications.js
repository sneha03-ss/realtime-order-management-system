'use strict';

/**
 * notifications.js
 * ─────────────────────────────────────────────────────────────────────────────
 * EventEmitter bridge: route controllers → email service.
 *
 * Each order carries its own customer_email.
 * Notifications are sent directly to that address — no shared recipient.
 *
 * Flow:
 *   index.js calls notifyOrder*()
 *     → emitter.emit(event, data)
 *       → listener builds email + passes order.customer_email as `to`
 *         → sendOrderEmail() dispatches via Nodemailer
 */

const { EventEmitter } = require('events');
const { buildEmail }     = require('./emailTemplate');
const { sendOrderEmail } = require('./emailService');

const emitter = new EventEmitter();
emitter.setMaxListeners(20);

// ── Listeners ─────────────────────────────────────────────────────────────────

emitter.on('ORDER_CREATED', async ({ order }) => {
  console.log(`[Notifications] ORDER_CREATED — order #${order.id} | to: ${order.customer_email}`);
  try {
    const { subject, html } = buildEmail('INSERT', order, null);
    await sendOrderEmail({ to: order.customer_email, subject, html });
  } catch (err) {
    console.error('[Notifications] ORDER_CREATED handler error:', err.message);
  }
});

emitter.on('ORDER_UPDATED', async ({ order, oldStatus }) => {
  console.log(`[Notifications] ORDER_UPDATED — order #${order.id} | ${oldStatus} → ${order.status} | to: ${order.customer_email}`);
  try {
    const oldOrder          = oldStatus ? { status: oldStatus } : null;
    const { subject, html } = buildEmail('UPDATE', order, oldOrder);
    await sendOrderEmail({ to: order.customer_email, subject, html });
  } catch (err) {
    console.error('[Notifications] ORDER_UPDATED handler error:', err.message);
  }
});

emitter.on('ORDER_DELETED', async ({ order }) => {
  console.log(`[Notifications] ORDER_DELETED — order #${order.id} | to: ${order.customer_email}`);
  try {
    const { subject, html } = buildEmail('DELETE', order, null);
    await sendOrderEmail({ to: order.customer_email, subject, html });
  } catch (err) {
    console.error('[Notifications] ORDER_DELETED handler error:', err.message);
  }
});

// ── Public helpers ────────────────────────────────────────────────────────────

function notifyOrderCreated(order) {
  console.log(`[Notifications] notifyOrderCreated() — order #${order.id}`);
  emitter.emit('ORDER_CREATED', { order });
}

function notifyOrderUpdated(order, oldStatus) {
  console.log(`[Notifications] notifyOrderUpdated() — order #${order.id}`);
  emitter.emit('ORDER_UPDATED', { order, oldStatus });
}

function notifyOrderDeleted(order) {
  console.log(`[Notifications] notifyOrderDeleted() — order #${order.id}`);
  emitter.emit('ORDER_DELETED', { order });
}

module.exports = { notifyOrderCreated, notifyOrderUpdated, notifyOrderDeleted };
