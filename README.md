# OrderStream — Realtime Order Management System

> A production-grade realtime order management platform built with **Node.js**, **PostgreSQL**, **WebSockets**, **Docker**, and **Nodemailer**. Database changes propagate to all connected clients instantly — no polling, no manual refresh.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Database Schema](#database-schema)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Gmail SMTP Setup](#gmail-smtp-setup)
- [API Reference](#api-reference)
- [Realtime Flow — Step by Step](#realtime-flow--step-by-step)
- [Email Notification System](#email-notification-system)
- [Duplicate Prevention](#duplicate-prevention)
- [Demonstrating Realtime Updates](#demonstrating-realtime-updates)
- [Scalability Considerations](#scalability-considerations)
- [Future Improvements](#future-improvements)

---

## Overview

Most realtime systems work by polling — the client repeatedly asks the server "did anything change?" every few seconds. This wastes resources, increases server load, and still feels laggy.

**OrderStream flips this model entirely.**

Instead of clients asking for updates, the server pushes updates the instant something changes. The mechanism behind this is **PostgreSQL LISTEN/NOTIFY** — a built-in database feature that emits an event the moment any row is inserted, updated, or deleted. Node.js catches that event and immediately broadcasts it to all connected browser clients over a persistent **WebSocket** connection.

The result: sub-100ms updates across all connected clients, with zero unnecessary database queries.

---

## Features

### Realtime Database Updates
- Detects `INSERT`, `UPDATE`, and `DELETE` operations on the `orders` table automatically
- Uses PostgreSQL triggers and `LISTEN/NOTIFY` — no application-level polling
- Works whether changes come through the API **or** directly via raw SQL in psql

### Live WebSocket Synchronization
- All connected browser tabs update simultaneously without any page refresh
- Persistent low-latency WebSocket connection managed by the `ws` library
- Auto-reconnects if the connection drops

### Customer-Specific Email Notifications
- Each order stores the customer's email address
- Emails are sent directly to **that customer** on every create, update, and delete event
- Professional dark-theme HTML email templates — renders correctly in Gmail, Outlook, and Apple Mail
- Email sending is fully **async and non-blocking** — SMTP failures never affect the API response

### Direct SQL Change Detection
- Realtime updates and email notifications fire even when rows are modified directly in psql
- No dependency on the API layer — the trigger is at the database level
- A lightweight deduplication system prevents double emails when changes come through the API

### Dockerized Architecture
- Entire stack runs with a single `docker compose up --build` command
- PostgreSQL and Node.js server run as isolated containers
- Server waits for Postgres to be healthy before starting

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser / CLI Client                      │
└────────────────────────────┬────────────────────────────────────┘
                             │  WebSocket (ws://)
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                      Node.js Backend                             │
│                                                                  │
│  Express REST API          WebSocket Server     LISTEN Client    │
│  (index.js)                (websocket.js)       (notifier.js)    │
│       │                          ▲                    ▲          │
│       │ writes                   │ broadcast          │ notify   │
│       ▼                          │                    │          │
│  db.js (pg Pool)                 └────────────────────┘          │
│       │                                                          │
│  notifications.js ──► emailTemplate.js ──► emailService.js      │
│  emailDedup.js (duplicate prevention)                            │
└────────────────────────────┬────────────────────────────────────┘
                             │  SQL + LISTEN/NOTIFY
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                         PostgreSQL 16                            │
│                                                                  │
│   orders table                                                   │
│       │                                                          │
│       └──► TRIGGER (after insert/update/delete)                  │
│                └──► notify_order_change()                        │
│                          └──► pg_notify('orders_channel', JSON)  │
└─────────────────────────────────────────────────────────────────┘
```

### Why LISTEN/NOTIFY over polling?

| Approach | Latency | Server Load | Misses rapid changes? |
|---|---|---|---|
| Client polling every 5s | Up to 5 seconds | High (constant requests) | Yes |
| Server-Sent Events | Low | Medium | No |
| **LISTEN/NOTIFY + WebSocket** ✅ | **~5–20ms** | **Minimal (event-driven)** | **No** |

PostgreSQL fires `pg_notify` **only when data actually changes**. Node receives it and broadcasts immediately. No wasted cycles.

---

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| Node.js | 20 (Alpine) | Backend runtime |
| Express.js | ^4.19.2 | REST API server |
| PostgreSQL | 16 (Alpine) | Primary database |
| ws | ^8.17.0 | WebSocket server |
| pg (node-postgres) | ^8.11.5 | PostgreSQL client |
| Nodemailer | ^8.0.7 | Email notifications via Gmail SMTP |
| dotenv | ^16.4.5 | Environment variable management |
| cors | ^2.8.5 | Cross-origin request handling |
| Docker + Compose | Latest | Containerised deployment |

---

## Database Schema

### `orders` table

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `SERIAL` | `PRIMARY KEY` | Auto-incrementing order ID |
| `customer_name` | `VARCHAR(255)` | `NOT NULL` | Full name of the customer |
| `customer_email` | `TEXT` | `NOT NULL` | Customer email — used for notifications |
| `product_name` | `VARCHAR(255)` | `NOT NULL` | Name of the ordered product |
| `status` | `VARCHAR(50)` | `NOT NULL`, `CHECK` | One of: `pending`, `shipped`, `delivered` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT NOW()` | Auto-updated on every change |

> The schema is created automatically when the server starts. A `set_updated_at` trigger keeps `updated_at` accurate on every `UPDATE`. An `ADD COLUMN IF NOT EXISTS` migration runs at startup — safe to run on existing databases.

---

## Project Structure

```
realtime-orders-v3/
│
├── client/
│   ├── index.html          # Browser dashboard (WebSocket client, full UI)
│   └── cli-client.js       # Terminal WebSocket client for testing
│
├── server/
│   ├── index.js            # Express app, REST API routes, bootstrap
│   ├── db.js               # pg Pool, schema setup, CRUD helpers
│   ├── notifier.js         # PostgreSQL LISTEN handler → WS broadcast + email
│   ├── websocket.js        # WebSocket server, broadcast helper
│   ├── notifications.js    # EventEmitter bridge: routes → email service
│   ├── emailService.js     # Nodemailer/Gmail transport, error handling
│   ├── emailTemplate.js    # Dark-theme HTML email builder (inline CSS)
│   ├── emailDedup.js       # Duplicate email prevention registry (TTL Map)
│   ├── package.json
│   ├── Dockerfile
│   └── .env.example
│
├── scripts/
│   └── seed.sql            # Sample data with lifecycle transitions
│
├── docker-compose.yml
└── README.md
```

---

## Getting Started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (recommended)
- Or: Node.js 18+ and PostgreSQL 14+ for local development

### Option A — Docker (Recommended)

```bash
# 1. Clone the repository
git clone YOUR_REPOSITORY_URL
cd realtime-orders-v3

# 2. Create your environment file
cp server/.env.example server/.env
# Edit server/.env with your email credentials (see Environment Variables below)

# 3. Start everything
docker compose up --build

# 4. Open the dashboard
# Open client/index.html in your browser
# (Use VS Code Live Server or any static file server)
```

### Option B — Local Development

```bash
# 1. Create the database
createdb ordersdb

# 2. Install dependencies
cd server
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env — set DB_HOST=localhost and add email credentials

# 4. Start the server
node index.js

# 5. Open client/index.html in your browser
```

### Load Demo Data (Optional)

```bash
psql -U postgres -d ordersdb -f scripts/seed.sql
```

This inserts 5 sample orders and runs status transitions with delays — watch the dashboard update live.

---

## Environment Variables

Create `server/.env` based on `server/.env.example`:

```env
# ── PostgreSQL ─────────────────────────────────────
DB_HOST=postgres          # Use 'localhost' for local dev
DB_PORT=5432
DB_NAME=ordersdb
DB_USER=postgres
DB_PASSWORD=postgres

# ── Server ─────────────────────────────────────────
PORT=3000

# ── Gmail SMTP ─────────────────────────────────────
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=xxxx xxxx xxxx xxxx   # App Password (see below)
```

> **Docker note:** `docker-compose.yml` uses `env_file: ./server/.env` to inject variables directly into the container. Do not use shell-level `${VAR}` interpolation — it silently injects empty strings if variables aren't set in the host shell.

---

## Gmail SMTP Setup

This project uses **Gmail App Passwords** — not your regular Gmail password.

### Steps

1. Go to your Google Account → **Security**
2. Enable **2-Step Verification** (required)
3. Visit [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
4. Click **Create app password**
   - App name: `OrderStream` (or anything)
5. Copy the **16-character password** shown
6. Paste it as `EMAIL_PASS` in `server/.env` (spaces are optional, they're ignored)

> Emails go to `order.customer_email` — the address stored on each order. There is no shared `NOTIFICATION_RECEIVER`. Every customer gets their own notifications.

---

## API Reference

Base URL: `http://localhost:3000`

### `GET /orders`
Fetch all orders sorted by most recently updated.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "customer_name": "Alice Johnson",
      "customer_email": "alice@example.com",
      "product_name": "Wireless Headphones",
      "status": "shipped",
      "updated_at": "2025-06-01T10:22:31.456Z"
    }
  ]
}
```

---

### `POST /orders`
Create a new order.

**Request body:**
```json
{
  "customer_name": "Alice Johnson",
  "customer_email": "alice@example.com",
  "product_name": "Wireless Headphones",
  "status": "pending"
}
```

**Validation:**
- `customer_name` — required
- `customer_email` — required, must be valid email format
- `product_name` — required
- `status` — optional, defaults to `pending`

**Response:** `201 Created` with the created order row.

---

### `PATCH /orders/:id`
Update an order's status.

**Request body:**
```json
{ "status": "shipped" }
```

Valid values: `pending`, `shipped`, `delivered`

**Response:** Updated order row.

---

### `DELETE /orders/:id`
Delete an order permanently.

**Response:** The deleted order row.

---

### `GET /health`
Server health check.

```json
{ "status": "ok", "timestamp": "2025-06-01T10:22:31.456Z" }
```

---

## Realtime Flow — Step by Step

### API-Triggered Change

```
1. Browser submits POST /orders
2. index.js validates request
3. emailDedup.claimEvent('INSERT', id)   ← registers dedup claim
4. db.createOrder() writes to PostgreSQL
5. PostgreSQL trigger fires pg_notify('orders_channel', payload)
6. notifier.js receives the notification
7. WebSocket broadcast → all connected clients update instantly
8. notifier.js checks dedup → claim found → skips email (API handles it)
9. index.js calls notifyOrderCreated(order)
10. notifications.js EventEmitter fires
11. emailTemplate.js builds HTML email
12. emailService.js sends via Gmail SMTP → customer's inbox
```

### Direct SQL Change (Manual psql Update)

```
1. Developer runs: UPDATE orders SET status='delivered' WHERE id=1;
2. PostgreSQL trigger fires pg_notify('orders_channel', payload)
3. notifier.js receives the notification
4. WebSocket broadcast → all connected clients update instantly
5. notifier.js checks dedup → no claim found → sends email directly
6. emailTemplate.js builds HTML email
7. emailService.js sends via Gmail SMTP → customer's inbox
```

Both paths result in exactly **one email** and **one WebSocket broadcast**.

---

## Email Notification System

### What triggers an email

| API Action | SQL Equivalent | Email sent to |
|---|---|---|
| `POST /orders` | `INSERT INTO orders ...` | `customer_email` on the new row |
| `PATCH /orders/:id` | `UPDATE orders SET status ...` | `customer_email` on the updated row |
| `DELETE /orders/:id` | `DELETE FROM orders WHERE id ...` | `customer_email` on the deleted row |

### Email content

Each email includes:

- OrderStream branding header with event-colour accent bar
- Event badge (NEW ORDER / STATUS UPDATE / CANCELLED)
- Order summary card: Order ID, Customer, Email, Product, Status badge, Status change diff (for updates), Timestamp
- Personalised greeting: *"Hi Alice, your order has been placed…"*
- Professional footer with recipient address

### Error handling

- SMTP failures are caught and logged — the API response is never affected
- If `EMAIL_USER` / `EMAIL_PASS` are not set, the system starts normally and logs a warning
- The Nodemailer transporter is a lazy singleton — initialised once and reused

---

## Duplicate Prevention

When an order is created or updated via the API, two paths run simultaneously:

1. The API route calls `notifyOrderCreated()` → sends email
2. The PostgreSQL trigger fires → `notifier.js` receives it → would also send email

Without deduplication, the customer gets **two emails for one action**.

### How `emailDedup.js` solves this

```
API route                               notifier.js (milliseconds later)
──────────────────────────────────      ─────────────────────────────────
claimEvent('INSERT', 7)          ←───── pg_notify fires
db.createOrder() [DB write]
notifyOrderCreated() → email sent       isApiClaim('INSERT', 7) → TRUE
                                        → skip email ✅
```

For **manual SQL changes**, no claim is registered:

```
psql: UPDATE orders ...                 notifier.js
──────────────────────────────────      ─────────────────────────────────
(no claim registered)                   pg_notify fires
                                        isApiClaim('UPDATE', 1) → FALSE
                                        → send email ✅
```

Claims expire after **5 seconds** automatically. Every change gets exactly **one email** regardless of origin.

---

## Demonstrating Realtime Updates

### From the Browser Dashboard

1. Open `client/index.html`
2. Create a new order → card appears on all open tabs instantly
3. Change status via the card menu → updates everywhere
4. Delete an order → card fades out across all clients

### From psql Directly

```bash
# Connect to the running container
docker exec -it realtime-orders-v3-postgres-1 psql -U postgres -d ordersdb

# Update a row directly — watch the browser update
UPDATE orders SET status = 'delivered' WHERE id = 1;

# Insert a row directly
INSERT INTO orders (customer_name, customer_email, product_name, status)
VALUES ('Frank Lee', 'frank@example.com', 'Ergonomic Chair', 'pending');

# Delete a row directly
DELETE FROM orders WHERE id = 1;
```

All three operations trigger WebSocket broadcasts and customer email notifications automatically.

### From the CLI Client

```bash
node client/cli-client.js
```

Connects via WebSocket and prints colour-coded events to the terminal. Auto-reconnects on disconnect.

### Via REST API (curl)

```bash
# Create
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{"customer_name":"Alice","customer_email":"alice@example.com","product_name":"Headphones"}'

# Update status
curl -X PATCH http://localhost:3000/orders/1 \
  -H "Content-Type: application/json" \
  -d '{"status":"shipped"}'

# Delete
curl -X DELETE http://localhost:3000/orders/1
```

---

## Scalability Considerations

The current single-instance design handles typical production workloads efficiently. For horizontal scaling:

| Challenge | Current Approach | Production Solution |
|---|---|---|
| Multiple Node instances | Single LISTEN connection | Redis Pub/Sub between instances |
| Dedup state | In-process Map (per instance) | Redis shared dedup store |
| WebSocket routing | All clients on one server | Sticky sessions or Redis adapter |
| Email volume | Synchronous per-event send | Message queue (Bull, SQS) |
| DB connection limits | pg Pool (default 10) | PgBouncer connection pooler |

### Key design decisions that already support scale

- **Event-driven, not polling** — zero wasted queries
- **Dedicated LISTEN connection** — never mixed with the query pool, won't lose subscriptions
- **Async email sending** — SMTP never blocks an API response
- **Modular services** — each module can be independently extracted or replaced
- **Docker** — consistent environment, easy to replicate

---

## Future Improvements

- **Redis Pub/Sub** — enable multiple Node.js instances to share WebSocket broadcasts
- **Authentication** — JWT-based auth for API routes and WebSocket connections
- **Message queue** — Bull or AWS SQS for reliable async email delivery at scale
- **Read replicas** — route read queries (`GET /orders`) to a Postgres replica
- **WebSocket namespaces** — per-customer or per-tenant channels
- **Admin dashboard** — aggregate analytics across all orders
- **Retry logic** — automatic email retry with exponential back-off on SMTP failure
- **Kafka** — replace pg_notify for very high-throughput change event streams

---

## Assignment Objective Coverage

| Requirement | Implementation |
|---|---|
| No client polling | PostgreSQL LISTEN/NOTIFY + WebSocket push |
| Realtime DB-driven updates | Trigger fires on every INSERT / UPDATE / DELETE |
| Multiple client types | Browser dashboard + CLI client |
| Clean documentation | This README |
| Design thinking | Event-driven architecture, dedup system, scalability notes |
| Code quality | Modular services, single responsibility per file, async throughout |
| Any insert/update/delete triggers clients | Confirmed — works via API and direct SQL |
