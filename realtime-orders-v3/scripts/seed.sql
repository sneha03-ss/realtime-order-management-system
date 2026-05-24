-- =============================================================
-- seed.sql  —  demo data + simulated order lifecycle changes
-- Run with:  psql -U postgres -d ordersdb -f scripts/seed.sql
-- =============================================================

-- Seed initial orders (all fields including customer_email)
INSERT INTO orders (customer_name, customer_email, product_name, status) VALUES
  ('Alice Johnson',  'alice@example.com',   'Wireless Headphones',  'pending'),
  ('Bob Martinez',   'bob@example.com',     'Standing Desk',        'shipped'),
  ('Carol Williams', 'carol@example.com',   'Mechanical Keyboard',  'delivered'),
  ('David Kim',      'david@example.com',   'Ultrawide Monitor',    'pending'),
  ('Eva Patel',      'eva@example.com',     'USB-C Hub',            'shipped');

-- Simulate lifecycle transitions (each triggers a pg_notify)
SELECT pg_sleep(1);
UPDATE orders SET status = 'shipped'   WHERE customer_name = 'Alice Johnson';
SELECT pg_sleep(1);
UPDATE orders SET status = 'delivered' WHERE customer_name = 'Bob Martinez';
SELECT pg_sleep(1);
INSERT INTO orders (customer_name, customer_email, product_name, status)
  VALUES ('Frank Lee', 'frank@example.com', 'Ergonomic Chair', 'pending');
SELECT pg_sleep(1);
DELETE FROM orders WHERE customer_name = 'Eva Patel';

SELECT 'Seed complete — check your WebSocket client for live updates!' AS info;
