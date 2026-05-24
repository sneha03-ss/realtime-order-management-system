'use strict';

/**
 * emailService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Nodemailer / Gmail SMTP transport.
 * Emails are sent to the individual customer address stored on the order.
 * SMTP failures are always caught and logged — never crash the server.
 */

const nodemailer = require('nodemailer');

// ── Tri-state singleton ───────────────────────────────────────────────────────
//   undefined  → not yet initialised
//   null       → disabled (missing credentials)
//   Transporter → ready

let _transporter = undefined;

function getTransporter() {
  if (_transporter !== undefined) return _transporter;

  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  console.log('[Email] Initialising transporter...');
  console.log(`[Email]   EMAIL_USER = ${user ? user           : '(NOT SET)'}`);
  console.log(`[Email]   EMAIL_PASS = ${pass ? '(set, hidden)' : '(NOT SET)'}`);

  if (!user || !pass) {
    console.warn('[Email] ⚠️  EMAIL_USER / EMAIL_PASS missing — email disabled.');
    _transporter = null;
    return null;
  }

  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  console.log(`[Email] ✅  Transporter created for: ${user}`);
  return _transporter;
}

// ── Public: send ──────────────────────────────────────────────────────────────

/**
 * Send an HTML order notification email to a specific recipient.
 * `to` is the customer_email stored on the order — not a fixed env variable.
 * Never throws.
 *
 * @param {{ to: string, subject: string, html: string }} param0
 */
async function sendOrderEmail({ to, subject, html }) {
  console.log(`[Email] sendOrderEmail() called — to: ${to} | subject: "${subject}"`);

  if (!to) {
    console.warn('[Email] ⚠️  No recipient (to) supplied — skipping send.');
    return;
  }

  const transporter = getTransporter();
  if (!transporter) {
    console.warn('[Email] ⚠️  No transporter available — skipping send.');
    return;
  }

  const from = process.env.EMAIL_USER;
  console.log(`[Email] Sending → from: ${from}  to: ${to}`);

  try {
    const info = await transporter.sendMail({ from, to, subject, html });
    console.log(`[Email] ✉️  Sent OK — to: ${to} | subject: "${subject}" | msgId: ${info.messageId}`);
  } catch (err) {
    console.error(`[Email] ❌  Send FAILED — to: ${to} | subject: "${subject}" | error: ${err.message}`);
  }
}

// ── Public: verify ────────────────────────────────────────────────────────────

/**
 * Verify SMTP credentials at startup. Non-fatal.
 */
async function verifyEmailConnection() {
  console.log('[Email] Verifying SMTP connection...');

  const transporter = getTransporter();
  if (!transporter) {
    console.warn('[Email] ⚠️  Skipping SMTP verify — transporter not configured.');
    return;
  }

  try {
    await transporter.verify();
    console.log(`[Email] ✅  SMTP verified — ready to send as ${process.env.EMAIL_USER}`);
  } catch (err) {
    console.warn(`[Email] ⚠️  SMTP verify failed — error: ${err.message}`);
    _transporter = undefined; // reset so next call retries
  }
}

module.exports = { sendOrderEmail, verifyEmailConnection };
