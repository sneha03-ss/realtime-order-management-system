'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'postgres',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'ordersdb',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

/**
 * Sets up the orders table (with customer_email), migration for existing
 * deployments, and all PostgreSQL triggers.
 */
async function setupDatabase() {
  const client = await pool.connect();
  try {
    // ── Create table (includes customer_email) ────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id             SERIAL PRIMARY KEY,
        customer_name  VARCHAR(255) NOT NULL,
        customer_email TEXT         NOT NULL,
        product_name   VARCHAR(255) NOT NULL,
        status         VARCHAR(50)  NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'shipped', 'delivered')),
        updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);

    // ── Migration: add customer_email to pre-existing tables ──────────────────
    // Uses ADD COLUMN IF NOT EXISTS (Postgres 9.6+) so it's idempotent.
    await client.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS customer_email TEXT NOT NULL DEFAULT 'unknown@example.com';
    `);

    // ── Trigger: NOTIFY on any row change ─────────────────────────────────────
    await client.query(`
      CREATE OR REPLACE FUNCTION notify_order_change()
      RETURNS TRIGGER AS $$
      DECLARE
        payload JSON;
      BEGIN
        IF TG_OP = 'DELETE' THEN
          payload = json_build_object(
            'event', TG_OP,
            'table', TG_TABLE_NAME,
            'old',   row_to_json(OLD)
          );
        ELSE
          payload = json_build_object(
            'event', TG_OP,
            'table', TG_TABLE_NAME,
            'new',   row_to_json(NEW),
            'old',   CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END
          );
        END IF;

        PERFORM pg_notify('orders_channel', payload::text);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS orders_change_trigger ON orders;
      CREATE TRIGGER orders_change_trigger
      AFTER INSERT OR UPDATE OR DELETE ON orders
      FOR EACH ROW EXECUTE FUNCTION notify_order_change();
    `);

    // ── Trigger: auto-update updated_at ──────────────────────────────────────
    await client.query(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS set_updated_at_trigger ON orders;
      CREATE TRIGGER set_updated_at_trigger
      BEFORE UPDATE ON orders
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);

    console.log('✅ Database schema and triggers are ready');
  } finally {
    client.release();
  }
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

async function getOrders() {
  const result = await pool.query(
    'SELECT * FROM orders ORDER BY updated_at DESC'
  );
  return result.rows;
}

/**
 * @param {string} customer_name
 * @param {string} customer_email
 * @param {string} product_name
 * @param {string} [status='pending']
 */
async function createOrder(customer_name, customer_email, product_name, status = 'pending') {
  const result = await pool.query(
    `INSERT INTO orders (customer_name, customer_email, product_name, status)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [customer_name, customer_email, product_name, status]
  );
  return result.rows[0];
}

async function updateOrderStatus(id, status) {
  const result = await pool.query(
    `UPDATE orders SET status = $1 WHERE id = $2 RETURNING *`,
    [status, id]
  );
  return result.rows[0];
}

async function deleteOrder(id) {
  const result = await pool.query(
    `DELETE FROM orders WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0];
}

// Dedicated client kept alive just for LISTEN (never returned to pool)
async function getListenerClient() {
  return pool.connect();
}

module.exports = {
  pool,
  setupDatabase,
  getOrders,
  createOrder,
  updateOrderStatus,
  deleteOrder,
  getListenerClient,
};
