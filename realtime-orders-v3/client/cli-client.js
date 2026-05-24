#!/usr/bin/env node
/**
 * cli-client.js — Terminal WebSocket client for real-time order updates
 * Usage:  node client/cli-client.js [ws://localhost:3000]
 */

const WebSocket = require('ws');

const WS_URL = process.argv[2] || 'ws://localhost:3000';

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const GREEN  = '\x1b[32m';
const CYAN   = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const BLUE   = '\x1b[34m';
const GRAY   = '\x1b[90m';

function ts() {
  return GRAY + new Date().toISOString() + RESET;
}

function statusColor(s) {
  if (s === 'pending')   return YELLOW + s + RESET;
  if (s === 'shipped')   return BLUE   + s + RESET;
  if (s === 'delivered') return GREEN  + s + RESET;
  return s;
}

function printOrder(label, color, order) {
  console.log(
    `\n${ts()} ${color}${BOLD}[${label}]${RESET}` +
    `\n  ID       : ${BOLD}#${order.id}${RESET}` +
    `\n  Customer : ${order.customer_name}` +
    `\n  Product  : ${order.product_name}` +
    `\n  Status   : ${statusColor(order.status)}` +
    `\n  Updated  : ${DIM}${order.updated_at}${RESET}`
  );
}

function connect() {
  console.log(`\n${CYAN}${BOLD}OrderStream CLI${RESET}`);
  console.log(`${DIM}Connecting to ${WS_URL} …${RESET}\n`);

  const ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log(`${GREEN}${BOLD}✔ Connected${RESET} — listening for order changes…\n`);
  });

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (msg.type === 'PING') {
      ws.send(JSON.stringify({ type: 'PONG' }));
      return;
    }

    if (msg.type === 'CONNECTED') {
      console.log(`${ts()} ${GREEN}[CONNECTED]${RESET} ${msg.message}`);
      return;
    }

    if (msg.type !== 'ORDER_CHANGE') return;

    const { event, new: newRow, old: oldRow } = msg;

    switch (event) {
      case 'INSERT':
        printOrder('INSERT', GREEN, newRow);
        break;

      case 'UPDATE':
        console.log(`\n${ts()} ${CYAN}${BOLD}[UPDATE]${RESET}`);
        if (oldRow && newRow && oldRow.status !== newRow.status) {
          console.log(`  ID       : ${BOLD}#${newRow.id}${RESET}`);
          console.log(`  Customer : ${newRow.customer_name}`);
          console.log(`  Status   : ${statusColor(oldRow.status)} ${GRAY}→${RESET} ${statusColor(newRow.status)}`);
          console.log(`  Updated  : ${DIM}${newRow.updated_at}${RESET}`);
        } else if (newRow) {
          printOrder('UPDATE', CYAN, newRow);
        }
        break;

      case 'DELETE':
        console.log(`\n${ts()} ${RED}${BOLD}[DELETE]${RESET}`);
        if (oldRow) {
          console.log(`  ID       : ${BOLD}#${oldRow.id}${RESET}`);
          console.log(`  Customer : ${oldRow.customer_name}`);
          console.log(`  Product  : ${oldRow.product_name}`);
          console.log(`  ${RED}Order removed from database${RESET}`);
        }
        break;

      default:
        console.log(`${ts()} ${GRAY}[${event}]${RESET}`, JSON.stringify(msg));
    }
  });

  ws.on('close', () => {
    console.log(`\n${YELLOW}[DISCONNECTED]${RESET} Reconnecting in 4 s…`);
    setTimeout(connect, 4000);
  });

  ws.on('error', (err) => {
    console.error(`${RED}[ERROR]${RESET} ${err.message}`);
  });
}

connect();
