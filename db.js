// SQLite persistence layer (Node's built-in node:sqlite, no native deps).
const fs = require('node:fs');
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
      price_cents INTEGER NOT NULL,
      temp_range TEXT NOT NULL,
      image TEXT NOT NULL,
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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Columns added after the first release; add them to databases created before then.
  const orderCols = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
  for (const col of ['paid_at', 'cart_session_id', 'stripe_session_id']) {
    if (!orderCols.includes(col)) db.exec(`ALTER TABLE orders ADD COLUMN ${col} TEXT`);
  }
  db.exec('CREATE INDEX IF NOT EXISTS orders_stripe_session ON orders (stripe_session_id)');

  const count = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  if (count === 0) {
    const insert = db.prepare(`INSERT INTO products
      (id, name, tagline, material, category, price_cents, temp_range, image, description, colors, sizes, stock, sort)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    seed.products.forEach((p, i) => insert.run(
      p.id, p.name, p.tagline, p.material, p.category, p.price_cents, p.temp_range, p.image,
      p.description, JSON.stringify(p.colors), JSON.stringify(p.sizes), p.stock, i,
    ));
  }
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
