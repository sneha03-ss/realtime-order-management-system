'use strict';

/**
 * emailDedup.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight in-process deduplication registry.
 *
 * Problem:
 *   Every DB change fires a pg_notify regardless of origin.
 *   API routes already call notifyOrder*() directly.
 *   If notifier.js also sends an email on every NOTIFY, API changes get two emails.
 *
 * Solution — a short-lived claim set:
 *   1. API route calls claimEvent(event, id) BEFORE writing to the DB.
 *   2. The pg_notify fires and arrives at notifier.js milliseconds later.
 *   3. notifier.js calls isApiClaim(event, id).
 *        → true  : API already handled it — notifier skips the email.
 *        → false : no claim found — this was a manual SQL change — notifier sends.
 *   4. Claims auto-expire after TTL_MS (default 5 s) so stale entries never
 *      block a legitimate future notification for the same order.
 *
 * Thread safety: Node.js is single-threaded so a plain Map is safe here.
 */

const TTL_MS = 5_000; // 5 seconds — well beyond any API round-trip

// key: `${event}:${id}`  →  value: expiry timestamp
const _claims = new Map();

/**
 * Called by API routes immediately before the DB write.
 * @param {'INSERT'|'UPDATE'|'DELETE'} event
 * @param {number|string} id
 */
function claimEvent(event, id) {
  const key    = `${event}:${id}`;
  const expiry = Date.now() + TTL_MS;
  _claims.set(key, expiry);
  console.log(`[Dedup] Claimed ${key} (expires in ${TTL_MS}ms)`);
}

/**
 * Called by notifier.js on every pg_notify.
 * Consumes the claim (removes it) and returns true if the API already handled it.
 * @param {'INSERT'|'UPDATE'|'DELETE'} event
 * @param {number|string} id
 * @returns {boolean}
 */
function isApiClaim(event, id) {
  const key    = `${event}:${id}`;
  const expiry = _claims.get(key);

  if (expiry === undefined) return false;         // no claim → manual SQL
  if (Date.now() > expiry)  { _claims.delete(key); return false; } // expired

  _claims.delete(key); // consume — one claim per event
  console.log(`[Dedup] Consumed claim for ${key} — skipping notifier email`);
  return true;
}

module.exports = { claimEvent, isApiClaim };