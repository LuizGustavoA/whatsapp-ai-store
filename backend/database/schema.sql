CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  phone_number VARCHAR(100) NOT NULL UNIQUE,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  whatsapp_message_id VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_whatsapp_message_id_unique
ON messages (whatsapp_message_id)
WHERE whatsapp_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  category VARCHAR(100),
  is_promotion BOOLEAN NOT NULL DEFAULT false,
  promotion_price DECIMAL(10, 2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_promotion BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS promotion_price DECIMAL(10, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(10, 2);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  phone_number VARCHAR(100) NOT NULL UNIQUE,
  cashback_balance DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS name VARCHAR(255);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  subtotal_amount DECIMAL(10, 2),
  discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  cashback_used DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  pix_code TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'paid', 'preparing', 'ready', 'out_for_delivery', 'delivered'));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal_amount DECIMAL(10, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cashback_used DECIMAL(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type VARCHAR(20) NOT NULL DEFAULT 'whatsapp';
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IN ('delivery', 'local', 'whatsapp'));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_number VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS was_modified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS modified_at TIMESTAMP;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS daily_order_number INTEGER;

UPDATE orders
SET order_date = created_at::date
WHERE order_date IS NULL;

WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(order_date, created_at::date)
      ORDER BY created_at ASC
    ) AS daily_num
  FROM orders
)
UPDATE orders o
SET daily_order_number = numbered.daily_num
FROM numbered
WHERE o.id = numbered.id
  AND o.daily_order_number IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_daily_order_number ON orders(daily_order_number);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('debito', 'dinheiro', 'pix', 'credito', 'ifood', 'outros'));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_confirmed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(10, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS change_amount DECIMAL(10, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON orders(payment_method);
CREATE INDEX IF NOT EXISTS idx_orders_payment_confirmed ON orders(payment_confirmed);

CREATE TABLE IF NOT EXISTS financial_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO financial_config (id, config)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE conversations ALTER COLUMN phone_number TYPE VARCHAR(100);
ALTER TABLE customers ALTER COLUMN phone_number TYPE VARCHAR(100);

CREATE TABLE IF NOT EXISTS deliveries (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  courier_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'in_transit', 'delivered')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price DECIMAL(10, 2) NOT NULL
);

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_conversation_id ON orders(conversation_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_order_id ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone_number ON customers(phone_number);

CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'admin',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE admins ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'admin';
ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_role_check;
ALTER TABLE admins ADD CONSTRAINT admins_role_check
  CHECK (role IN ('admin', 'attendant'));

CREATE TABLE IF NOT EXISTS system_logs (
  id SERIAL PRIMARY KEY,
  level VARCHAR(20) NOT NULL DEFAULT 'error'
    CHECK (level IN ('info', 'warn', 'error')),
  message TEXT NOT NULL,
  context JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(120) NOT NULL,
  salary DECIMAL(10, 2) NOT NULL DEFAULT 0,
  labor_charges DECIMAL(10, 2) NOT NULL DEFAULT 0,
  extra_costs JSONB NOT NULL DEFAULT '[]'::jsonb,
  username VARCHAR(100) UNIQUE,
  password_hash VARCHAR(255),
  panel_access_enabled BOOLEAN NOT NULL DEFAULT false,
  panel_permissions JSONB NOT NULL DEFAULT '{"create_order":false,"receive_payment":false,"set_preparing":false,"set_out_for_delivery":false}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'terminated')),
  hired_at DATE NOT NULL DEFAULT CURRENT_DATE,
  terminated_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE employees ADD COLUMN IF NOT EXISTS username VARCHAR(100) UNIQUE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS panel_access_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS panel_permissions JSONB NOT NULL DEFAULT '{"create_order":false,"receive_payment":false,"set_preparing":false,"set_out_for_delivery":false}'::jsonb;

CREATE TABLE IF NOT EXISTS employee_attendance (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  is_present BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (employee_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employee_attendance_employee_date ON employee_attendance(employee_id, attendance_date);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS attendant_employee_id INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS kitchen_employee_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_attendant_employee_id_fkey'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_attendant_employee_id_fkey
      FOREIGN KEY (attendant_employee_id) REFERENCES employees(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_kitchen_employee_id_fkey'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_kitchen_employee_id_fkey
      FOREIGN KEY (kitchen_employee_id) REFERENCES employees(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_attendant_employee ON orders(attendant_employee_id);
CREATE INDEX IF NOT EXISTS idx_orders_kitchen_employee ON orders(kitchen_employee_id);

-- Chatbot humanizado: transbordo humano, endereço e status cancelado
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS bot_paused BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS handoff_at TIMESTAMP;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'paid', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mercado_pago_payment_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_conversations_bot_paused ON conversations(bot_paused);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
