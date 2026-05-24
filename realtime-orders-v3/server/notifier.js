'use strict';

const { getListenerClient } = require('./db');
const { broadcast }         = require('./websocket');
const { isApiClaim }        = require('./emailDedup');
const { buildEmail }        = require('./emailTemplate');
const { sendOrderEmail }    = require('./emailService');

/**
 * Starts a persistent LISTEN connection to PostgreSQL.
 *
 * On every pg_notify from orders_channel:
 *   1. Broadcast to all WebSocket clients (unchanged behaviour).
 *   2. Check dedup registry:
 *        – API-originated change → claim exists → skip email (API already sent it).
 *        – Manual SQL change     → no claim     → send customer email here.
 */
async function startListening(wss) {
  let listenerClient;

  async function connect() {
    try {
      listenerClient = await getListenerClient();
      await listenerClient.query('LISTEN orders_channel');

      listenerClient.on('notification', async (msg) => {
        try {
          const payload = JSON.parse(msg.payload);
          const { event, new: nr, old: or } = payload;

          console.log(`📡 DB event [${event}] on table [${payload.table}]`);

          // ── 1. WebSocket broadcast (always, unchanged) ────────────────────
          broadcast(wss, {
            type: 'ORDER_CHANGE',
            ...payload,
            receivedAt: new Date().toISOString(),
          });

          // ── 2. Email — only for manual SQL changes ────────────────────────
          const order     = nr || or;   // nr is null on DELETE, or on INSERT
          const eventId   = order?.id;

          if (!eventId) {
            console.warn('[Notifier] Could not determine order ID — skipping email check.');
            return;
          }

          if (isApiClaim(event, eventId)) {
            // API route already called notifyOrder*() — no duplicate needed
            return;
          }

          // No claim → manual SQL update → send email via the same service
          console.log(`[Notifier] Manual SQL ${event} detected for order #${eventId} — sending email`);
          await sendManualEmail(event, nr, or);

        } catch (err) {
          console.error('[Notifier] Failed to handle notification:', err.message);
        }
      });

      listenerClient.on('error', async (err) => {
        console.error('Listener connection error — reconnecting in 3s:', err.message);
        listenerClient.release(true);
        setTimeout(connect, 3000);
      });

      console.log('👂 Listening on PostgreSQL channel: orders_channel');
    } catch (err) {
      console.error('Could not connect listener — retrying in 3s:', err.message);
      setTimeout(connect, 3000);
    }
  }

  await connect();
}

/**
 * Builds and sends an email for a manual SQL change.
 * Uses the same buildEmail/sendOrderEmail pipeline as the API route path.
 *
 * @param {'INSERT'|'UPDATE'|'DELETE'} event
 * @param {object|null} nr  new row  (INSERT / UPDATE)
 * @param {object|null} or  old row  (UPDATE / DELETE)
 */
async function sendManualEmail(event, nr, or) {
  try {
    const order = nr || or; // the row we have data for

    if (!order) {
      console.warn('[Notifier] No row data in payload — cannot send email.');
      return;
    }
    if (!order.customer_email) {
      console.warn(`[Notifier] Order #${order.id} has no customer_email — skipping email.`);
      return;
    }

    const oldOrder              = (event === 'UPDATE' && or) ? or : null;
    const { subject, html }     = buildEmail(event, order, oldOrder);
    await sendOrderEmail({ to: order.customer_email, subject, html });

  } catch (err) {
    console.error('[Notifier] sendManualEmail error:', err.message);
  }
}

module.exports = { startListening };