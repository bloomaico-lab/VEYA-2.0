// SQLite persistence layer (Node's built-in node:sqlite, no native deps).
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const seed = require('./seed');

function openDb(file = process.env.DB_FILE || path.join(__dirname, 'data', 'veya.db')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tagline TEXT NOT NULL,
      material TEXT NOT NULL,
      category TEXT NOT NULL,
      gender TEXT NOT NULL DEFAULT '',
      price_cents INTEGER NOT NULL,
      badge TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL,
      model_image TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL,
      colors TEXT NOT NULL,
      sizes TEXT NOT NULL,
      stock INTEGER NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      shopify_cart_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE ON UPDATE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      size TEXT NOT NULL,
      color TEXT NOT NULL,
      qty INTEGER NOT NULL,
      UNIQUE (session_id, product_id, size, color)
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL UNIQUE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      postal_code TEXT NOT NULL,
      country TEXT NOT NULL,
      subtotal_cents INTEGER NOT NULL,
      shipping_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      paid_at TEXT,
      cart_session_id TEXT,
      stripe_session_id TEXT
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      size TEXT NOT NULL,
      color TEXT NOT NULL,
      qty INTEGER NOT NULL,
      unit_price_cents INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      unsubscribe_token TEXT,
      unsubscribed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL,
      recipients INTEGER NOT NULL DEFAULT 0,
      sent_count INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT
    );
    -- Codes won on the spin-to-win wheel: one per email, single use, valid for a limited time.
    CREATE TABLE IF NOT EXISTS discount_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      prize TEXT NOT NULL,
      kind TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 0,
      min_subtotal_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      used_at TEXT,
      order_number TEXT
    );
    CREATE INDEX IF NOT EXISTS discount_codes_email ON discount_codes (email);
  `);
  const addColumn = (table, name, type) => {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === name)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
    }
  };

  // Columns added after the first release; add them to databases created before then.
  const orderCols = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
  for (const col of ['paid_at', 'cart_session_id', 'stripe_session_id']) {
    if (!orderCols.includes(col)) db.exec(`ALTER TABLE orders ADD COLUMN ${col} TEXT`);
  }
  db.exec('CREATE INDEX IF NOT EXISTS orders_stripe_session ON orders (stripe_session_id)');
  if (!db.prepare('PRAGMA table_info(sessions)').all().some((c) => c.name === 'shopify_cart_id')) {
    db.exec('ALTER TABLE sessions ADD COLUMN shopify_cart_id TEXT');
  }
  if (db.prepare('PRAGMA table_info(products)').all().some((c) => c.name === 'temp_range')) {
    db.exec('ALTER TABLE products RENAME COLUMN temp_range TO badge');
  }
  if (!db.prepare('PRAGMA table_info(products)').all().some((c) => c.name === 'model_image')) {
    db.exec("ALTER TABLE products ADD COLUMN model_image TEXT NOT NULL DEFAULT ''");
  }
  if (!db.prepare('PRAGMA table_info(products)').all().some((c) => c.name === 'gender')) {
    db.exec("ALTER TABLE products ADD COLUMN gender TEXT NOT NULL DEFAULT ''");
  }
  // Spin to win: the slice a visitor landed on, the code they claimed, and the code on their bag.
  addColumn('sessions', 'spin_slice', 'INTEGER');
  addColumn('sessions', 'spin_code', 'TEXT');
  addColumn('sessions', 'discount_code', 'TEXT');
  addColumn('orders', 'discount_code', 'TEXT');
  addColumn('orders', 'discount_cents', 'INTEGER NOT NULL DEFAULT 0');

  // Products taken out of the range: remove them (and any bags holding them) from older databases.
  // Past orders keep their own copy of the name and price, so order history is unaffected.
  for (const id of seed.retiredProductIds) {
    db.prepare('DELETE FROM cart_items WHERE product_id = ?').run(id);
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
  }

  // Seed the catalog. Products added to seed.js later (e.g. the men's and women's lines) are
  // inserted into existing databases too; products already there are left alone.
  const insert = db.prepare(`INSERT OR IGNORE INTO products
    (id, name, tagline, material, category, gender, price_cents, badge, image, model_image, description, colors, sizes, stock, sort)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  seed.products.forEach((p, i) => insert.run(
    p.id, p.name, p.tagline, p.material, p.category, p.gender, p.price_cents, p.badge, p.image, p.model_image || '',
    p.description, JSON.stringify(p.colors), JSON.stringify(p.sizes), p.stock, i,
  ));
  // Newsletter: every subscriber needs a private token for their unsubscribe link.
  const subCols = db.prepare('PRAGMA table_info(subscribers)').all().map((c) => c.name);
  for (const col of ['unsubscribe_token', 'unsubscribed_at']) {
    if (!subCols.includes(col)) db.exec(`ALTER TABLE subscribers ADD COLUMN ${col} TEXT`);
  }
  const setToken = db.prepare('UPDATE subscribers SET unsubscribe_token = ? WHERE id = ?');
  for (const { id } of db.prepare('SELECT id FROM subscribers WHERE unsubscribe_token IS NULL').all()) {
    setToken.run(crypto.randomBytes(24).toString('hex'), id);
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS subscribers_token ON subscribers (unsubscribe_token)');

  // Fill in on-model photos for catalogs seeded before they existed.
  const setModel = db.prepare("UPDATE products SET model_image = ? WHERE id = ? AND model_image = ''");
  for (const p of seed.products) if (p.model_image) setModel.run(p.model_image, p.id);
  const setGender = db.prepare("UPDATE products SET gender = ? WHERE id = ? AND gender = ''");
  for (const p of seed.products) setGender.run(p.gender, p.id);
  // Fill in per-colour photos for catalogs seeded before colours had their own images.
  const setColors = db.prepare("UPDATE products SET colors = ? WHERE id = ? AND colors NOT LIKE '%\"image\"%'");
  for (const p of seed.products) setColors.run(JSON.stringify(p.colors), p.id);
  return db;
}

// Runs fn inside a transaction; rolls back if it throws.
function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { openDb, transaction };
