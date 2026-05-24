# OrderStream — Real-Time Orders + Email Notifications

Real-time PostgreSQL → WebSocket order updates, now with automatic email notifications on every INSERT / UPDATE / DELETE.

---

## What's New in v2 (Email Layer)

Three new files added on top of the existing project — nothing existing was modified except `index.js` (3 lines added) and `docker-compose.yml` / `.env` files (email vars added).

```
server/
├── emailTemplate.js   ← NEW  Pure HTML email builder (inline CSS, dark theme)
├── emailService.js    ← NEW  Nodemailer/Gmail transport, graceful error handling
├── notifications.js   ← NEW  EventEmitter bridge: routes → email service
└── index.js           ← MODIFIED  3 notify* calls + verifyEmailConnection()
```

---

## Architecture

```
POST /orders
PATCH /orders/:id          ──► notifyOrder*()         [index.js — 1 line each]
DELETE /orders/:id                  │
                                    ▼
                           EventEmitter.emit()         [notifications.js]
                                    │
                                    ▼
                           buildEmail()                [emailTemplate.js]
                                    │
                                    ▼
                           sendOrderEmail()            [emailService.js]
                                    │
                                    ▼
                           Nodemailer → Gmail SMTP
```

The WebSocket / PostgreSQL LISTEN-NOTIFY flow is **completely unchanged**.

---

## Gmail App Password Setup

> You MUST use an App Password — your regular Gmail password will NOT work.

1. Go to your Google Account → **Security**
2. Enable **2-Step Verification** (required)
3. Go to **Security → App passwords** (or visit https://myaccount.google.com/apppasswords)
4. Select app: **Mail** / Select device: **Other** → type `OrderStream`
5. Click **Generate** — copy the 16-character password shown
6. Use that password as `EMAIL_PASS` (spaces optional, they are ignored)

---

## Environment Variables

Add to `server/.env`:

```env
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=abcd efgh ijkl mnop        # 16-char App Password
NOTIFICATION_RECEIVER=notify@example.com
```

For Docker, these can also be set in a root-level `.env` file next to `docker-compose.yml`:

```env
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=abcdEFGHijklMNOP
NOTIFICATION_RECEIVER=notify@example.com
```

---

## Quick Start

### Docker (recommended)

```bash
# 1. Create a .env in the project root (next to docker-compose.yml)
cat > .env << EOF
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=your-app-password
NOTIFICATION_RECEIVER=you@example.com
EOF

# 2. Start everything
docker compose up --build

# 3. Open the dashboard
open client/index.html
```

### Manual

```bash
# Install dependencies (includes nodemailer)
cd server
npm install

# Edit .env with your real email credentials
cp .env.example .env && nano .env

# Start
node index.js
```

---

## npm Install Command

```bash
npm install nodemailer
```

---

## Email Trigger Events

| Action | Event | Email sent |
|---|---|---|
| `POST /orders` | ORDER_CREATED | ✅ Yes |
| `PATCH /orders/:id` | ORDER_UPDATED | ✅ Yes |
| `DELETE /orders/:id` | ORDER_DELETED | ✅ Yes |

---

## Email Template Features

- Dark background (`#080b10`) matching the dashboard aesthetic
- Glowing top + bottom accent bars (green / blue / red per event type)
- Company branding header (OrderStream logo)
- Event type badge (NEW ORDER / STATUS UPDATE / DELETED)
- Order summary card with: Order ID, Customer, Product, Status badge, Status diff (UPDATE), Event type, Timestamp
- Professional footer
- 100% inline CSS — works in Gmail, Outlook, Apple Mail, etc.

---

## Testing Email Notifications

```bash
# 1. Make sure server is running and .env has email credentials

# 2. Create an order
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{"customer_name":"Alice","product_name":"Wireless Keyboard"}'

# 3. Update its status (replace 1 with actual order ID)
curl -X PATCH http://localhost:3000/orders/1 \
  -H "Content-Type: application/json" \
  -d '{"status":"shipped"}'

# 4. Delete it
curl -X DELETE http://localhost:3000/orders/1
```

Check server logs — you'll see:
```
✉️  [Email] Sent OK → "[OrderStream] New Order Received — Order #1" | to: ...
```

---

## What Was NOT Changed

- `db.js` — untouched
- `notifier.js` — untouched
- `websocket.js` — untouched
- `client/index.html` — untouched
- `client/cli-client.js` — untouched
- `scripts/seed.sql` — untouched
- `server/Dockerfile` — untouched
- All WebSocket / PostgreSQL LISTEN-NOTIFY logic — untouched

---

## Original Architecture (unchanged)

```
PostgreSQL → TRIGGER → pg_notify('orders_channel')
                              ↓
                       Node.js LISTEN client (notifier.js)
                              ↓
                       broadcast() → WebSocket → Browser / CLI
```
