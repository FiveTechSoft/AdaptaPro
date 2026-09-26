-- AdaptaPro: esquema SQLite WASM/sql.js. Ejecutar PRAGMA foreign_keys=ON en cada conexión.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, country TEXT NOT NULL,
  contact_email TEXT, lead_days INTEGER NOT NULL CHECK (lead_days >= 0), active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);
CREATE TABLE IF NOT EXISTS products (
  sku TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
  unit TEXT NOT NULL, sale_price_cents INTEGER NOT NULL CHECK (sale_price_cents >= 0),
  reorder_point INTEGER NOT NULL CHECK (reorder_point >= 0), target_stock INTEGER NOT NULL CHECK (target_stock >= reorder_point),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);
CREATE TABLE IF NOT EXISTS supplier_products (
  supplier_id TEXT NOT NULL REFERENCES suppliers(id), sku TEXT NOT NULL REFERENCES products(sku),
  unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0), min_order_qty INTEGER NOT NULL DEFAULT 1 CHECK (min_order_qty > 0),
  PRIMARY KEY (supplier_id, sku)
);
CREATE TABLE IF NOT EXISTS inventory (
  sku TEXT PRIMARY KEY REFERENCES products(sku), on_hand INTEGER NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= on_hand),
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sales_orders (
  id TEXT PRIMARY KEY, customer_name TEXT NOT NULL, region TEXT NOT NULL,
  placed_at TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('pendiente','confirmado','enviado','cancelado'))
);
CREATE TABLE IF NOT EXISTS sales_order_lines (
  order_id TEXT NOT NULL REFERENCES sales_orders(id), line_no INTEGER NOT NULL CHECK (line_no > 0),
  sku TEXT NOT NULL REFERENCES products(sku), quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0), PRIMARY KEY (order_id, line_no)
);
CREATE TABLE IF NOT EXISTS purchase_proposals (
  id TEXT PRIMARY KEY, sku TEXT NOT NULL, supplier_id TEXT NOT NULL,
  proposed_qty INTEGER NOT NULL CHECK (proposed_qty > 0), unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (length(currency) = 3),
  agent_id TEXT NOT NULL, rationale TEXT NOT NULL, created_at TEXT NOT NULL,
  FOREIGN KEY (supplier_id, sku) REFERENCES supplier_products(supplier_id, sku)
);
-- Una decisión por propuesta. Las propuestas pendientes aún no tienen decidido_por/decidido_at.
CREATE TABLE IF NOT EXISTS approval_queue (
  proposal_id TEXT PRIMARY KEY REFERENCES purchase_proposals(id),
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','aprobada','rechazada')),
  decided_by TEXT, decided_at TEXT, decision_reason TEXT,
  CHECK ((status = 'pendiente' AND decided_by IS NULL AND decided_at IS NULL)
      OR (status <> 'pendiente' AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY, sku TEXT NOT NULL REFERENCES products(sku),
  delta INTEGER NOT NULL CHECK (delta <> 0), reason TEXT NOT NULL, proposal_id TEXT REFERENCES purchase_proposals(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
  entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, details_json TEXT NOT NULL CHECK (json_valid(details_json))
);
CREATE INDEX IF NOT EXISTS idx_orders_placed ON sales_orders(placed_at);
CREATE INDEX IF NOT EXISTS idx_lines_sku ON sales_order_lines(sku);
CREATE INDEX IF NOT EXISTS idx_approval_status ON approval_queue(status);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(occurred_at);
CREATE VIEW IF NOT EXISTS stock_status AS
  SELECT p.sku, p.name, i.on_hand, i.reserved, i.on_hand - i.reserved AS available,
         p.reorder_point, p.target_stock,
         CASE WHEN i.on_hand - i.reserved <= p.reorder_point THEN 1 ELSE 0 END AS needs_restock
  FROM products p JOIN inventory i ON i.sku = p.sku;
CREATE TABLE IF NOT EXISTS workforce (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, team TEXT NOT NULL,
  capacity_hours INTEGER NOT NULL CHECK(capacity_hours >= 0), assigned_hours INTEGER NOT NULL CHECK(assigned_hours >= 0),
  status TEXT NOT NULL CHECK(status IN ('disponible','ocupado','ausente'))
);
CREATE TABLE IF NOT EXISTS production_jobs (
  id TEXT PRIMARY KEY, sku TEXT NOT NULL REFERENCES products(sku), quantity INTEGER NOT NULL CHECK(quantity > 0),
  stage TEXT NOT NULL, due_at TEXT NOT NULL, owner TEXT NOT NULL, order_id TEXT REFERENCES sales_orders(id)
);
CREATE TABLE IF NOT EXISTS planning_tasks (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, due_at TEXT NOT NULL, team TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pendiente','en_curso','hecho')), linked_order_id TEXT REFERENCES sales_orders(id)
);
