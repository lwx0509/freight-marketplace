-- Users table (handles both shippers and companies)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    user_type TEXT NOT NULL CHECK (user_type IN ('shipper', 'company')),
    company_name TEXT,
    is_admin INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Carriers directory (pre-loaded from FMC/NVOCC data; masked until verified)
CREATE TABLE IF NOT EXISTS carriers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    country TEXT,
    lanes TEXT,
    fmc_id TEXT,
    trade_name TEXT,
    license_number TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    street TEXT,
    carrier_type TEXT,
    qi_title TEXT,
    renewal_date TEXT,
    fax TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified')),
    removed INTEGER DEFAULT 0,
    claim_token TEXT UNIQUE,
    user_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_carriers_email ON carriers(email);
CREATE INDEX IF NOT EXISTS idx_carriers_token ON carriers(claim_token);

-- Shipments (created by shippers)
CREATE TABLE IF NOT EXISTS shipments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipper_id INTEGER NOT NULL,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    cargo_type TEXT NOT NULL,
    weight_tons REAL,
    budget REAL,
    shipping_date TEXT,
    deadline TEXT,
    notes TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shipper_id) REFERENCES users(id)
);

-- Shipper access subscriptions ($10 for 15 days)
CREATE TABLE IF NOT EXISTS shipper_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipper_id INTEGER NOT NULL,
    access_until TIMESTAMP NOT NULL,
    stripe_charge_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shipper_id) REFERENCES users(id)
);

-- Company subscriptions ($50/month)
CREATE TABLE IF NOT EXISTS company_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    stripe_subscription_id TEXT UNIQUE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due')),
    renewal_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES users(id)
);

-- Contact inquiries (when companies contact shippers via contact form)
CREATE TABLE IF NOT EXISTS inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id INTEGER NOT NULL,
    company_id INTEGER NOT NULL,
    message TEXT,
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'viewed', 'replied')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shipment_id) REFERENCES shipments(id),
    FOREIGN KEY (company_id) REFERENCES users(id)
);

-- Sessions for auth
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
