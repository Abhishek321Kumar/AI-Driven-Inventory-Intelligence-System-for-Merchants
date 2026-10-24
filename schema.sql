-- Mercura store book. Idempotent so the server can apply it on startup.

CREATE TABLE IF NOT EXISTS merchants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    store_name VARCHAR(200) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    city VARCHAR(100) DEFAULT 'Bengaluru',
    category VARCHAR(100) DEFAULT 'Apparel & Boutique',
    tier VARCHAR(20) DEFAULT 'pro',
    currency VARCHAR(10) DEFAULT 'INR',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS skus (
    id VARCHAR(50) NOT NULL,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    supplier_name VARCHAR(200) NOT NULL,
    supplier_phone VARCHAR(30),
    supplier_email VARCHAR(150),
    units INT NOT NULL DEFAULT 0,
    cost_price NUMERIC(10, 2) NOT NULL,
    selling_price NUMERIC(10, 2) NOT NULL,
    velocity NUMERIC(8, 2) DEFAULT 0.0,
    sold_last_30d INT DEFAULT 0,
    shelf_age_days INT DEFAULT 0,
    lead_time_days INT DEFAULT 7,
    moq INT DEFAULT 15,
    img_url TEXT,
    reorder_locked BOOLEAN DEFAULT FALSE,
    clearance_discount NUMERIC(5, 2) DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, merchant_id)
);

CREATE TABLE IF NOT EXISTS channel_allocations (
    sku_id VARCHAR(50) NOT NULL,
    merchant_id UUID NOT NULL,
    shopify_units INT DEFAULT 0,
    pos_units INT DEFAULT 0,
    warehouse_units INT DEFAULT 0,
    PRIMARY KEY (sku_id, merchant_id),
    FOREIGN KEY (sku_id, merchant_id) REFERENCES skus(id, merchant_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    sku_id VARCHAR(50) NOT NULL,
    alert_type VARCHAR(30) NOT NULL,
    days_left INT NOT NULL,
    units_left INT NOT NULL,
    reorder_qty INT NOT NULL,
    is_reviewed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    po_id VARCHAR(50) PRIMARY KEY,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    sku_id VARCHAR(50) NOT NULL,
    supplier_name VARCHAR(200) NOT NULL,
    supplier_phone VARCHAR(30) NOT NULL,
    units_requested INT NOT NULL,
    channel VARCHAR(30) DEFAULT 'whatsapp',
    status VARCHAR(50) DEFAULT 'AWAITING_SUPPLIER_INVOICE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS db_audit_logs (
    log_id BIGSERIAL PRIMARY KEY,
    merchant_id UUID,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    before_state JSONB,
    after_state JSONB,
    checksum VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash CHAR(64) PRIMARY KEY,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_merchant ON sessions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_skus_merchant ON skus(merchant_id);
CREATE INDEX IF NOT EXISTS idx_alerts_merchant ON stock_alerts(merchant_id, is_reviewed);
CREATE INDEX IF NOT EXISTS idx_audit_merchant ON db_audit_logs(merchant_id);

-- The Python server connects as the database owner. These block a hosted
-- public API (Supabase anon) from reading password hashes.
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE db_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
