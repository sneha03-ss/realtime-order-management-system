'use strict';

/**
 * emailTemplate.js
 * Pure function — builds subject + dark-theme HTML email for any order event.
 * 100% inline CSS so every email client renders it correctly.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(ts) {
  return new Date(ts).toLocaleString('en-US', {
    weekday:      'short',
    year:         'numeric',
    month:        'long',
    day:          'numeric',
    hour:         '2-digit',
    minute:       '2-digit',
    second:       '2-digit',
    timeZoneName: 'short',
  });
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_MAP = {
  pending:   { bg: 'rgba(255,140,66,.18)',  border: '#ff8c42', color: '#ff8c42' },
  shipped:   { bg: 'rgba(77,184,255,.18)',  border: '#4db8ff', color: '#4db8ff' },
  delivered: { bg: 'rgba(61,255,160,.18)',  border: '#3dffa0', color: '#3dffa0' },
};

function statusBadge(status) {
  const s = STATUS_MAP[status] || { bg: 'rgba(255,255,255,.1)', border: '#888', color: '#ccc' };
  return `<span style="display:inline-block;padding:5px 14px;border-radius:4px;background:${s.bg};border:1px solid ${s.border};color:${s.color};font-family:'Courier New',Courier,monospace;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">${esc(String(status).toUpperCase())}</span>`;
}

// ── Per-event config ──────────────────────────────────────────────────────────

const EVENT_CONFIG = {
  INSERT: {
    accent:      '#3dffa0',
    icon:        '📦',
    headline:    'New Order Received',
    subline:     'Your order has been placed and is now in the system.',
    badgeLabel:  'NEW ORDER',
    badgeBg:     'rgba(61,255,160,.15)',
    badgeBorder: '#3dffa0',
    badgeColor:  '#3dffa0',
  },
  UPDATE: {
    accent:      '#4db8ff',
    icon:        '🔄',
    headline:    'Order Status Updated',
    subline:     'The status of your order has been changed.',
    badgeLabel:  'STATUS UPDATE',
    badgeBg:     'rgba(77,184,255,.15)',
    badgeBorder: '#4db8ff',
    badgeColor:  '#4db8ff',
  },
  DELETE: {
    accent:      '#ff4d6a',
    icon:        '🗑️',
    headline:    'Order Cancelled',
    subline:     'Your order has been removed from the system.',
    badgeLabel:  'CANCELLED',
    badgeBg:     'rgba(255,77,106,.15)',
    badgeBorder: '#ff4d6a',
    badgeColor:  '#ff4d6a',
  },
};

// ── Status-change diff row (UPDATE only) ──────────────────────────────────────

function statusChangeRow(oldStatus, newStatus) {
  if (!oldStatus || oldStatus === newStatus) return '';
  return `
          <tr>
            <td style="padding:14px 20px;border-bottom:1px solid #1c2333;color:#6b7a94;font-family:'Courier New',Courier,monospace;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;width:130px;vertical-align:middle;">Previous</td>
            <td style="padding:14px 20px;border-bottom:1px solid #1c2333;vertical-align:middle;">
              ${statusBadge(oldStatus)}
              <span style="display:inline-block;margin:0 10px;color:#6b7a94;font-size:14px;vertical-align:middle;">→</span>
              ${statusBadge(newStatus)}
            </td>
          </tr>`;
}

// ── Shared table-row builder ──────────────────────────────────────────────────

function row(label, valueHtml, last = false) {
  const border = last ? '' : 'border-bottom:1px solid #1c2333;';
  return `
          <tr>
            <td style="padding:14px 20px;${border}color:#6b7a94;font-family:'Courier New',Courier,monospace;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;width:130px;vertical-align:middle;">${label}</td>
            <td style="padding:14px 20px;${border}vertical-align:middle;">${valueHtml}</td>
          </tr>`;
}

function textCell(v, color = '#dde4f0', size = '14px', weight = 'normal') {
  return `<span style="color:${color};font-family:Arial,sans-serif;font-size:${size};font-weight:${weight};">${esc(v)}</span>`;
}

function monoCell(v, color = '#6b7a94') {
  return `<span style="color:${color};font-family:'Courier New',Courier,monospace;font-size:12px;">${esc(v)}</span>`;
}

// ── Main builder ──────────────────────────────────────────────────────────────

/**
 * @param {'INSERT'|'UPDATE'|'DELETE'} event
 * @param {object} order        current (or deleted) order row — includes customer_email
 * @param {object|null} oldOrder previous row (UPDATE only)
 * @returns {{ subject: string, html: string }}
 */
function buildEmail(event, order, oldOrder = null) {
  const cfg     = EVENT_CONFIG[event] || EVENT_CONFIG.INSERT;
  const ac      = cfg.accent;
  const ts      = fmtDate(order.updated_at || new Date());
  const subject = `[OrderStream] ${cfg.headline} — Order #${order.id}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#080b10;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#080b10;min-height:100vh;">
<tr><td align="center" style="padding:40px 16px;">

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;">

    <!-- TOP ACCENT BAR -->
    <tr>
      <td style="height:3px;background:linear-gradient(90deg,transparent 0%,${ac} 40%,${ac} 60%,transparent 100%);border-radius:2px 2px 0 0;"></td>
    </tr>

    <!-- HEADER -->
    <tr>
      <td style="background:linear-gradient(135deg,#0e1219 0%,#141923 100%);padding:32px 36px 28px;border-left:1px solid #1c2333;border-right:1px solid #1c2333;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="background:${ac};border-radius:6px;width:34px;height:34px;text-align:center;vertical-align:middle;font-size:18px;line-height:34px;">⬡</td>
                  <td style="padding-left:10px;">
                    <span style="font-family:Arial,sans-serif;font-size:19px;font-weight:700;color:${ac};">Order<span style="color:#dde4f0;font-weight:600;">Stream</span></span>
                  </td>
                </tr>
              </table>
            </td>
            <td align="right" style="vertical-align:top;">
              <span style="display:inline-block;padding:5px 12px;border-radius:99px;background:${cfg.badgeBg};border:1px solid ${cfg.badgeBorder};color:${cfg.badgeColor};font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">${esc(cfg.badgeLabel)}</span>
            </td>
          </tr>
        </table>

        <div style="margin-top:28px;">
          <div style="font-size:30px;margin-bottom:4px;">${cfg.icon}</div>
          <h1 style="margin:8px 0 6px;color:#dde4f0;font-family:Arial,sans-serif;font-size:22px;font-weight:700;line-height:1.3;">${cfg.headline}</h1>
          <p style="margin:0;color:#6b7a94;font-size:13px;line-height:1.6;">Hi <strong style="color:#dde4f0;">${esc(order.customer_name)}</strong>, ${cfg.subline}</p>
        </div>
      </td>
    </tr>

    <!-- ORDER SUMMARY CARD -->
    <tr>
      <td style="background:#0e1219;padding:0 36px;border-left:1px solid #1c2333;border-right:1px solid #1c2333;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:24px 0;background:#141923;border:1px solid #253044;border-radius:8px;overflow:hidden;">

          <!-- Card header -->
          <tr>
            <td colspan="2" style="padding:14px 20px 12px;border-bottom:1px solid #1c2333;background:rgba(255,255,255,.018);border-left:3px solid ${ac};">
              <span style="font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#6b7a94;">ORDER SUMMARY</span>
              <span style="float:right;font-family:'Courier New',Courier,monospace;font-size:12px;color:${ac};font-weight:700;">#${esc(String(order.id))}</span>
            </td>
          </tr>

          ${row('Order ID',   `<span style="color:${ac};font-family:'Courier New',Courier,monospace;font-size:14px;font-weight:700;">#${esc(String(order.id))}</span>`)}
          ${row('Customer',   textCell(order.customer_name, '#dde4f0', '14px', '600'))}
          ${row('Email',      `<a href="mailto:${esc(order.customer_email)}" style="color:#4db8ff;font-family:'Courier New',Courier,monospace;font-size:12px;text-decoration:none;">${esc(order.customer_email)}</a>`)}
          ${row('Product',    textCell(order.product_name))}
          ${row('Status',     statusBadge(order.status))}
          ${statusChangeRow(oldOrder?.status, order.status)}
          ${row('Event',      `<span style="display:inline-block;padding:4px 12px;border-radius:4px;background:${cfg.badgeBg};border:1px solid ${cfg.badgeBorder};color:${cfg.badgeColor};font-family:'Courier New',Courier,monospace;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${esc(event)}</span>`)}
          ${row('Timestamp',  monoCell(ts), true)}

        </table>
      </td>
    </tr>

    <!-- DIVIDER -->
    <tr>
      <td style="background:#0e1219;padding:0 36px;border-left:1px solid #1c2333;border-right:1px solid #1c2333;">
        <div style="height:1px;background:linear-gradient(90deg,transparent,#253044,transparent);"></div>
      </td>
    </tr>

    <!-- FOOTER -->
    <tr>
      <td style="background:#090c12;padding:24px 36px 28px;border-left:1px solid #1c2333;border-right:1px solid #1c2333;border-bottom:1px solid #1c2333;border-radius:0 0 8px 8px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td>
              <p style="margin:0 0 4px;color:#4a5568;font-size:11px;font-family:'Courier New',Courier,monospace;letter-spacing:.06em;">ORDERSTREAM NOTIFICATION SERVICE</p>
              <p style="margin:0;color:#2d3748;font-size:11px;font-family:Arial,sans-serif;line-height:1.5;">This notification was sent to ${esc(order.customer_email)}. Do not reply to this email.</p>
            </td>
            <td align="right" style="vertical-align:bottom;">
              <span style="font-family:'Courier New',Courier,monospace;font-size:10px;color:#253044;letter-spacing:.05em;">EVENT: ${esc(event)}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- BOTTOM GLOW -->
    <tr>
      <td style="height:1px;background:linear-gradient(90deg,transparent 0%,${ac} 40%,${ac} 60%,transparent 100%);opacity:.35;"></td>
    </tr>

  </table>

</td></tr>
</table>
</body>
</html>`;

  return { subject, html };
}

module.exports = { buildEmail };
