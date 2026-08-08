-- =========================================================
-- GENERALI POS DATABASE
-- PostgreSQL
-- =========================================================

-- =========================================================
-- USERS
-- =========================================================

CREATE TABLE IF NOT EXISTS users (

    id BIGSERIAL PRIMARY KEY,

    username VARCHAR(50) NOT NULL UNIQUE,

    full_name VARCHAR(120) NOT NULL,

    password_hash TEXT NOT NULL,

    role VARCHAR(20) NOT NULL
        CHECK (role IN ('admin', 'cashier')),

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


CREATE INDEX IF NOT EXISTS
idx_users_role
ON users(role);


CREATE INDEX IF NOT EXISTS
idx_users_active
ON users(is_active);


-- =========================================================
-- LOGIN SESSIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS user_sessions (

    id BIGSERIAL PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    token_hash TEXT NOT NULL UNIQUE,

    login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    expires_at TIMESTAMPTZ NOT NULL,

    ip_address INET,

    user_agent TEXT

);


CREATE INDEX IF NOT EXISTS
idx_sessions_user
ON user_sessions(user_id);


CREATE INDEX IF NOT EXISTS
idx_sessions_expiry
ON user_sessions(expires_at);


-- =========================================================
-- PRODUCTS
-- =========================================================

CREATE TABLE IF NOT EXISTS products (

    id BIGSERIAL PRIMARY KEY,

    barcode VARCHAR(100) NOT NULL UNIQUE,

    name VARCHAR(200) NOT NULL,

    description TEXT,

    buying_price NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (buying_price >= 0),

    selling_price NUMERIC(12,2) NOT NULL
        CHECK (selling_price >= 0),

    quantity INTEGER NOT NULL DEFAULT 0
        CHECK (quantity >= 0),

    minimum_stock INTEGER NOT NULL DEFAULT 5
        CHECK (minimum_stock >= 0),

    category VARCHAR(100),

    unit VARCHAR(30) NOT NULL DEFAULT 'piece',

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_by BIGINT
        REFERENCES users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


CREATE INDEX IF NOT EXISTS
idx_products_barcode
ON products(barcode);


CREATE INDEX IF NOT EXISTS
idx_products_name
ON products(name);


CREATE INDEX IF NOT EXISTS
idx_products_category
ON products(category);


-- =========================================================
-- STOCK MOVEMENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS stock_movements (

    id BIGSERIAL PRIMARY KEY,

    product_id BIGINT NOT NULL
        REFERENCES products(id)
        ON DELETE CASCADE,

    user_id BIGINT
        REFERENCES users(id)
        ON DELETE SET NULL,

    movement_type VARCHAR(30) NOT NULL
        CHECK (
            movement_type IN (
                'opening',
                'purchase',
                'sale',
                'return',
                'adjustment',
                'damage'
            )
        ),

    quantity INTEGER NOT NULL,

    quantity_before INTEGER NOT NULL,

    quantity_after INTEGER NOT NULL,

    reference VARCHAR(100),

    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


CREATE INDEX IF NOT EXISTS
idx_stock_product
ON stock_movements(product_id);


CREATE INDEX IF NOT EXISTS
idx_stock_created
ON stock_movements(created_at);


-- =========================================================
-- SALES
-- =========================================================

CREATE TABLE IF NOT EXISTS sales (

    id BIGSERIAL PRIMARY KEY,

    receipt_number VARCHAR(50) NOT NULL UNIQUE,

    cashier_id BIGINT
        REFERENCES users(id)
        ON DELETE SET NULL,

    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (subtotal >= 0),

    discount NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (discount >= 0),

    tax NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (tax >= 0),

    total_amount NUMERIC(12,2) NOT NULL
        CHECK (total_amount >= 0),

    status VARCHAR(20) NOT NULL DEFAULT 'completed'
        CHECK (
            status IN (
                'pending',
                'completed',
                'cancelled',
                'refunded'
            )
        ),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    completed_at TIMESTAMPTZ

);


CREATE INDEX IF NOT EXISTS
idx_sales_cashier
ON sales(cashier_id);


CREATE INDEX IF NOT EXISTS
idx_sales_created
ON sales(created_at);


CREATE INDEX IF NOT EXISTS
idx_sales_status
ON sales(status);


-- =========================================================
-- SALE ITEMS
-- =========================================================

CREATE TABLE IF NOT EXISTS sale_items (

    id BIGSERIAL PRIMARY KEY,

    sale_id BIGINT NOT NULL
        REFERENCES sales(id)
        ON DELETE CASCADE,

    product_id BIGINT
        REFERENCES products(id)
        ON DELETE SET NULL,

    barcode VARCHAR(100),

    product_name VARCHAR(200) NOT NULL,

    quantity INTEGER NOT NULL
        CHECK (quantity > 0),

    unit_price NUMERIC(12,2) NOT NULL
        CHECK (unit_price >= 0),

    discount NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (discount >= 0),

    total_price NUMERIC(12,2) NOT NULL
        CHECK (total_price >= 0)

);


CREATE INDEX IF NOT EXISTS
idx_sale_items_sale
ON sale_items(sale_id);


CREATE INDEX IF NOT EXISTS
idx_sale_items_product
ON sale_items(product_id);


-- =========================================================
-- PAYMENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS payments (

    id BIGSERIAL PRIMARY KEY,

    sale_id BIGINT NOT NULL
        REFERENCES sales(id)
        ON DELETE CASCADE,

    payment_method VARCHAR(30) NOT NULL
        CHECK (
            payment_method IN (
                'cash',
                'mpesa',
                'card'
            )
        ),

    amount NUMERIC(12,2) NOT NULL
        CHECK (amount > 0),

    status VARCHAR(30) NOT NULL DEFAULT 'completed'
        CHECK (
            status IN (
                'pending',
                'completed',
                'failed',
                'cancelled',
                'refunded'
            )
        ),

    phone_number VARCHAR(20),

    mpesa_receipt_number VARCHAR(100),

    mpesa_checkout_request_id VARCHAR(150),

    mpesa_merchant_request_id VARCHAR(150),

    transaction_reference VARCHAR(150),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    completed_at TIMESTAMPTZ

);


CREATE INDEX IF NOT EXISTS
idx_payments_sale
ON payments(sale_id);


CREATE INDEX IF NOT EXISTS
idx_payments_method
ON payments(payment_method);


CREATE INDEX IF NOT EXISTS
idx_payments_mpesa_receipt
ON payments(mpesa_receipt_number);


CREATE INDEX IF NOT EXISTS
idx_payments_checkout
ON payments(mpesa_checkout_request_id);


-- =========================================================
-- CASHIER SHIFTS
-- =========================================================

CREATE TABLE IF NOT EXISTS cashier_shifts (

    id BIGSERIAL PRIMARY KEY,

    cashier_id BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    opening_cash NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (opening_cash >= 0),

    closing_cash NUMERIC(12,2)
        CHECK (
            closing_cash IS NULL
            OR closing_cash >= 0
        ),

    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    closed_at TIMESTAMPTZ,

    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (
            status IN (
                'open',
                'closed'
            )
        )

);


CREATE INDEX IF NOT EXISTS
idx_shifts_cashier
ON cashier_shifts(cashier_id);


CREATE INDEX IF NOT EXISTS
idx_shifts_status
ON cashier_shifts(status);


-- =========================================================
-- AUDIT LOG
-- =========================================================

CREATE TABLE IF NOT EXISTS audit_logs (

    id BIGSERIAL PRIMARY KEY,

    user_id BIGINT
        REFERENCES users(id)
        ON DELETE SET NULL,

    action VARCHAR(100) NOT NULL,

    entity_type VARCHAR(50),

    entity_id BIGINT,

    description TEXT,

    ip_address INET,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


CREATE INDEX IF NOT EXISTS
idx_audit_user
ON audit_logs(user_id);


CREATE INDEX IF NOT EXISTS
idx_audit_created
ON audit_logs(created_at);


-- =========================================================
-- UPDATED_AT FUNCTION
-- =========================================================

CREATE OR REPLACE FUNCTION
update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS
$$
BEGIN

    NEW.updated_at = NOW();

    RETURN NEW;

END;
$$;


-- =========================================================
-- UPDATED_AT TRIGGERS
-- =========================================================

DROP TRIGGER IF EXISTS
users_updated_at
ON users;


CREATE TRIGGER
users_updated_at

BEFORE UPDATE ON users

FOR EACH ROW

EXECUTE FUNCTION
update_updated_at_column();


DROP TRIGGER IF EXISTS
products_updated_at
ON products;


CREATE TRIGGER
products_updated_at

BEFORE UPDATE ON products

FOR EACH ROW

EXECUTE FUNCTION
update_updated_at_column();


-- =========================================================
-- REMOVE EXPIRED SESSIONS
-- =========================================================

CREATE OR REPLACE FUNCTION
remove_expired_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
AS
$$

DECLARE
    deleted_count INTEGER;

BEGIN

    DELETE FROM user_sessions

    WHERE expires_at < NOW();

    GET DIAGNOSTICS
        deleted_count = ROW_COUNT;

    RETURN deleted_count;

END;

$$;


-- =========================================================
-- BASIC DATABASE CHECK
-- =========================================================

SELECT
    'Generali POS database ready'
    AS status;
