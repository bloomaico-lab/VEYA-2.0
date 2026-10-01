// VEYA storefront server: serves the Stitch-designed site and its JSON API.
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const Stripe = require('stripe');
const { openDb, transaction } = require('./db');
const seed = require('./seed');

const SESSION_COOKIE = 'veya_sid';
const FREE_SHIPPING_CENTS = 20000;
const SHIPPING_CENTS = 1200;
const MAX_QTY = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- helpers ----------

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cleanString(value, field, { max = 200, required = true } = {}) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (required && !s) throw new HttpError(400, `${field} is required.`);
  if (s.length > max) throw new HttpError(400, `${field} is too long.`);
  return s;
}

function cleanEmail(value) {
  const email = cleanString(value, 'Email', { max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
  return email;
}

function toProduct(row) {
  return {
    id: row.id,
    name: row.name,
    tagline: row.tagline,
    material: row.material,
    category: row.category,
    price: row.price_cents / 100,
    tempRange: row.temp_range,
    image: row.image,
    description: row.description,
    colors: JSON.parse(row.colors),
    sizes: JSON.parse(row.sizes),
    inStock: row.stock > 0,
  };
}

function orderNumber() {
  return `VEYA-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

// ---------- app ----------

function defaultStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
}

function createApp(db = openDb(), { stripe = defaultStripe() } = {}) {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';
  app.disable('x-powered-by');
  if (isProd) app.set('trust proxy', 1);

  // Stripe webhook: needs the raw body for signature checks, so it is registered before express.json().
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), (req, res) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripe || !secret) return res.status(400).json({ error: 'Webhooks are not configured.' });
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
    } catch (err) {
      return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
    }
    const session = event.data.object;
    const number = session.metadata?.order_number;
    if (number) {
      if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)
        && session.payment_status === 'paid') {
        app.locals.finalizeOrder(number);
      } else if (['checkout.session.expired', 'checkout.session.async_payment_failed'].includes(event.type)) {
        app.locals.cancelPendingOrder(number);
      }
    }
    res.json({ received: true });
  });

  app.use(express.json({ limit: '20kb' }));

  // Every API visitor gets an anonymous session (holds their bag); logging in attaches a user to it.
  app.use('/api', (req, res, next) => {
    const sid = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    let session = sid && db.prepare('SELECT * FROM sessions WHERE id = ?').get(sid);
    if (!session) {
      const id = crypto.randomBytes(32).toString('hex');
      db.prepare('INSERT INTO sessions (id) VALUES (?)').run(id);
      session = { id, user_id: null };
      res.cookie(SESSION_COOKIE, id, {
        httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 1000 * 60 * 60 * 24 * 30,
      });
    }
    req.session = session;
    req.user = session.user_id
      ? db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(session.user_id)
      : null;
    next();
  });

  function getCart(sessionId) {
    const rows = db.prepare(`
      SELECT c.id, c.product_id, c.size, c.color, c.qty, p.name, p.image, p.price_cents, p.stock
      FROM cart_items c JOIN products p ON p.id = c.product_id
      WHERE c.session_id = ? ORDER BY c.id`).all(sessionId);
    const subtotal = rows.reduce((sum, r) => sum + r.price_cents * r.qty, 0);
    const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_CENTS ? 0 : SHIPPING_CENTS;
    return {
      items: rows.map((r) => ({
        id: r.id,
        productId: r.product_id,
        name: r.name,
        image: r.image,
        size: r.size,
        color: r.color,
        qty: r.qty,
        unitPrice: r.price_cents / 100,
        lineTotal: (r.price_cents * r.qty) / 100,
      })),
      count: rows.reduce((n, r) => n + r.qty, 0),
      subtotal: subtotal / 100,
      shipping: shipping / 100,
      total: (subtotal + shipping) / 100,
      freeShippingThreshold: FREE_SHIPPING_CENTS / 100,
    };
  }

  function requireUser(req) {
    if (!req.user) throw new HttpError(401, 'Please sign in first.');
    return req.user;
  }

  // ----- catalog & content -----

  app.get('/api/products', (req, res) => {
    const { category, q } = req.query;
    let rows = db.prepare('SELECT * FROM products ORDER BY sort').all();
    if (category && category !== 'all') rows = rows.filter((r) => r.category === category);
    if (q) {
      const needle = String(q).toLowerCase().slice(0, 100);
      rows = rows.filter((r) => [r.name, r.tagline, r.material, r.category, r.description]
        .some((f) => f.toLowerCase().includes(needle)));
    }
    res.json(rows.map(toProduct));
  });

  app.get('/api/products/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!row) throw new HttpError(404, 'Product not found.');
    res.json(toProduct(row));
  });

  app.get('/api/fabrics', (req, res) => res.json(seed.fabrics));

  app.get('/api/environments/:id', (req, res) => {
    const env = seed.environments[req.params.id];
    if (!env) throw new HttpError(404, 'Unknown environment.');
    res.json(env);
  });

  app.get('/api/pages/:slug', (req, res) => {
    const page = Object.hasOwn(seed.pages, req.params.slug) && seed.pages[req.params.slug];
    if (!page) throw new HttpError(404, 'Page not found.');
    res.json(page);
  });

  // ----- bag -----

  app.get('/api/cart', (req, res) => res.json(getCart(req.session.id)));

  app.post('/api/cart', (req, res) => {
    const { productId, size, color } = req.body || {};
    const qty = Number.isInteger(req.body?.qty) ? req.body.qty : 1;
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(String(productId || ''));
    if (!row) throw new HttpError(404, 'Product not found.');
    const product = toProduct(row);
    const chosenSize = size ?? product.sizes[Math.floor(product.sizes.length / 2)];
    const chosenColor = color ?? product.colors[0].name;
    if (!product.sizes.includes(chosenSize)) throw new HttpError(400, 'Please choose a valid size.');
    if (!product.colors.some((c) => c.name === chosenColor)) throw new HttpError(400, 'Please choose a valid color.');
    if (qty < 1 || qty > MAX_QTY) throw new HttpError(400, `Quantity must be between 1 and ${MAX_QTY}.`);

    const existing = db.prepare(`SELECT id, qty FROM cart_items
      WHERE session_id = ? AND product_id = ? AND size = ? AND color = ?`)
      .get(req.session.id, product.id, chosenSize, chosenColor);
    const newQty = Math.min((existing?.qty || 0) + qty, MAX_QTY);
    if (newQty > row.stock) throw new HttpError(409, `Only ${row.stock} left in stock.`);
    if (existing) {
      db.prepare('UPDATE cart_items SET qty = ? WHERE id = ?').run(newQty, existing.id);
    } else {
      db.prepare(`INSERT INTO cart_items (session_id, product_id, size, color, qty)
        VALUES (?, ?, ?, ?, ?)`).run(req.session.id, product.id, chosenSize, chosenColor, newQty);
    }
    res.status(201).json(getCart(req.session.id));
  });

  app.patch('/api/cart/:itemId', (req, res) => {
    const qty = req.body?.qty;
    if (!Number.isInteger(qty) || qty < 0 || qty > MAX_QTY) {
      throw new HttpError(400, `Quantity must be between 0 and ${MAX_QTY}.`);
    }
    const item = db.prepare(`SELECT c.id, p.stock FROM cart_items c JOIN products p ON p.id = c.product_id
      WHERE c.id = ? AND c.session_id = ?`).get(Number(req.params.itemId), req.session.id);
    if (!item) throw new HttpError(404, 'Item not in bag.');
    if (qty > item.stock) throw new HttpError(409, `Only ${item.stock} left in stock.`);
    if (qty === 0) db.prepare('DELETE FROM cart_items WHERE id = ?').run(item.id);
    else db.prepare('UPDATE cart_items SET qty = ? WHERE id = ?').run(qty, item.id);
    res.json(getCart(req.session.id));
  });

  app.delete('/api/cart/:itemId', (req, res) => {
    db.prepare('DELETE FROM cart_items WHERE id = ? AND session_id = ?')
      .run(Number(req.params.itemId), req.session.id);
    res.json(getCart(req.session.id));
  });

  // ----- checkout -----
  // Orders are created as `pending_payment`, then finalized (stock taken, bag cleared) once paid:
  // immediately in demo mode, or after Stripe confirms payment (redirect or webhook).

  function checkoutDetails(req) {
    const body = req.body || {};
    return {
      email: cleanEmail(body.email ?? req.user?.email),
      name: cleanString(body.name, 'Name', { max: 120 }),
      address: cleanString(body.address, 'Address'),
      city: cleanString(body.city, 'City', { max: 100 }),
      postalCode: cleanString(body.postalCode, 'Postal code', { max: 20 }),
      country: cleanString(body.country, 'Country', { max: 60 }),
    };
  }

  function createPendingOrder(req, details) {
    return transaction(db, () => {
      const lines = db.prepare(`
        SELECT c.product_id, c.size, c.color, c.qty, p.name, p.image, p.price_cents, p.stock
        FROM cart_items c JOIN products p ON p.id = c.product_id WHERE c.session_id = ?`).all(req.session.id);
      if (lines.length === 0) throw new HttpError(400, 'Your bag is empty.');

      // Prices and stock always come from the database, never the client.
      const needed = {};
      for (const l of lines) needed[l.product_id] = (needed[l.product_id] || 0) + l.qty;
      for (const l of lines) {
        if (needed[l.product_id] > l.stock) throw new HttpError(409, `${l.name}: only ${l.stock} left in stock.`);
      }
      const subtotal = lines.reduce((s, l) => s + l.price_cents * l.qty, 0);
      const shipping = subtotal >= FREE_SHIPPING_CENTS ? 0 : SHIPPING_CENTS;
      const number = orderNumber();

      const { lastInsertRowid: id } = db.prepare(`INSERT INTO orders
        (number, user_id, email, name, address, city, postal_code, country, subtotal_cents, shipping_cents,
         total_cents, status, cart_session_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?)`).run(
        number, req.user?.id ?? null, details.email, details.name, details.address, details.city,
        details.postalCode, details.country, subtotal, shipping, subtotal + shipping, req.session.id,
      );
      const addItem = db.prepare(`INSERT INTO order_items
        (order_id, product_id, name, size, color, qty, unit_price_cents) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      for (const l of lines) addItem.run(id, l.product_id, l.name, l.size, l.color, l.qty, l.price_cents);
      return { id: Number(id), number, lines, shipping, total: subtotal + shipping, email: details.email };
    });
  }

  // Idempotent: only a pending order is finalized, so redirect + webhook can both call it.
  function finalizeOrder(number) {
    transaction(db, () => {
      const order = db.prepare('SELECT * FROM orders WHERE number = ?').get(number);
      if (!order || order.status !== 'pending_payment') return;
      db.prepare("UPDATE orders SET status = 'confirmed', paid_at = datetime('now') WHERE id = ?").run(order.id);
      const items = db.prepare('SELECT product_id, qty FROM order_items WHERE order_id = ?').all(order.id);
      for (const i of items) {
        db.prepare('UPDATE products SET stock = MAX(stock - ?, 0) WHERE id = ?').run(i.qty, i.product_id);
      }
      if (order.cart_session_id) db.prepare('DELETE FROM cart_items WHERE session_id = ?').run(order.cart_session_id);
    });
  }

  function cancelPendingOrder(number) {
    db.prepare("UPDATE orders SET status = 'cancelled' WHERE number = ? AND status = 'pending_payment'").run(number);
  }

  function orderSummary(number) {
    const o = db.prepare('SELECT number, email, total_cents, status FROM orders WHERE number = ?').get(number);
    return o && { number: o.number, email: o.email, total: o.total_cents / 100, status: o.status };
  }

  function publicUrl(req) {
    return (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`)
      .replace(/\/$/, '');
  }

  app.locals.finalizeOrder = finalizeOrder;
  app.locals.cancelPendingOrder = cancelPendingOrder;

  app.get('/api/config', (req, res) => res.json({ payments: stripe ? 'stripe' : 'demo' }));

  app.post('/api/checkout', async (req, res, next) => {
    try {
      const order = createPendingOrder(req, checkoutDetails(req));
      if (!stripe) {
        finalizeOrder(order.number);
        return res.status(201).json(orderSummary(order.number));
      }

      const base = publicUrl(req);
      let session;
      try {
        session = await stripe.checkout.sessions.create({
          mode: 'payment',
          customer_email: order.email,
          client_reference_id: order.number,
          metadata: { order_number: order.number },
          line_items: order.lines.map((l) => ({
            quantity: l.qty,
            price_data: {
              currency: 'usd',
              unit_amount: l.price_cents,
              product_data: {
                name: l.name,
                description: `${l.color} · Size ${l.size}`,
                // Stripe can only show images it can fetch from a public https URL.
                ...(base.startsWith('https://') ? { images: [base + l.image] } : {}),
              },
            },
          })),
          shipping_options: [{
            shipping_rate_data: {
              type: 'fixed_amount',
              display_name: order.shipping ? 'Express shipping' : 'Complimentary express shipping',
              fixed_amount: { amount: order.shipping, currency: 'usd' },
            },
          }],
          success_url: `${base}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${base}/?checkout=cancelled`,
        });
      } catch (err) {
        cancelPendingOrder(order.number);
        console.error('Stripe checkout error:', err.message);
        throw new HttpError(502, 'Payment provider is unavailable. Please try again.');
      }
      db.prepare('UPDATE orders SET stripe_session_id = ? WHERE id = ?').run(session.id, order.id);
      res.status(201).json({ number: order.number, redirectUrl: session.url });
    } catch (err) {
      next(err);
    }
  });

  // Customer lands here after paying on Stripe; confirms with Stripe directly rather than trusting the URL.
  app.get('/api/checkout/confirm', async (req, res, next) => {
    try {
      if (!stripe) throw new HttpError(400, 'Online payments are not enabled.');
      const sessionId = String(req.query.session_id || '');
      const order = sessionId && db.prepare('SELECT number FROM orders WHERE stripe_session_id = ?').get(sessionId);
      if (!order) throw new HttpError(404, 'Order not found.');
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status === 'paid') finalizeOrder(order.number);
      res.json(orderSummary(order.number));
    } catch (err) {
      next(err);
    }
  });

  // ----- accounts -----

  function startUserSession(req, res, userId) {
    // Rotate the session id on login but keep the bag.
    const id = crypto.randomBytes(32).toString('hex');
    db.prepare('UPDATE sessions SET id = ?, user_id = ? WHERE id = ?').run(id, userId, req.session.id);
    // Drop the cookie set earlier in this request for a brand-new anonymous session.
    const existing = [].concat(res.getHeader('Set-Cookie') || []);
    res.setHeader('Set-Cookie', existing.filter((c) => !c.startsWith(`${SESSION_COOKIE}=`)));
    res.cookie(SESSION_COOKIE, id, {
      httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 1000 * 60 * 60 * 24 * 30,
    });
  }

  app.get('/api/auth/me', (req, res) => res.json({ user: req.user }));

  app.post('/api/auth/register', (req, res) => {
    const email = cleanEmail(req.body?.email);
    const name = cleanString(req.body?.name, 'Name', { max: 120 });
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
    if (password.length > 200) throw new HttpError(400, 'Password is too long.');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      throw new HttpError(409, 'An account with that email already exists.');
    }
    const { lastInsertRowid } = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)')
      .run(email, name, hashPassword(password));
    startUserSession(req, res, lastInsertRowid);
    res.status(201).json({ user: { id: Number(lastInsertRowid), email, name } });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = cleanEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new HttpError(401, 'Incorrect email or password.');
    }
    startUserSession(req, res, user.id);
    res.json({ user: { id: user.id, email: user.email, name: user.name } });
  });

  app.post('/api/auth/logout', (req, res) => {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(req.session.id);
    res.clearCookie(SESSION_COOKIE);
    res.json({ user: null });
  });

  app.get('/api/orders', (req, res) => {
    const user = requireUser(req);
    const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? AND paid_at IS NOT NULL ORDER BY id DESC').all(user.id);
    const itemsFor = db.prepare('SELECT name, size, color, qty, unit_price_cents FROM order_items WHERE order_id = ?');
    res.json(orders.map((o) => ({
      number: o.number,
      status: o.status,
      createdAt: o.created_at,
      total: o.total_cents / 100,
      items: itemsFor.all(o.id).map((i) => ({ ...i, unitPrice: i.unit_price_cents / 100, unit_price_cents: undefined })),
    })));
  });

  // ----- VIP club -----

  app.post('/api/subscribe', (req, res) => {
    const email = cleanEmail(req.body?.email);
    const result = db.prepare('INSERT OR IGNORE INTO subscribers (email) VALUES (?)').run(email);
    res.status(result.changes ? 201 : 200).json({
      alreadySubscribed: !result.changes,
      message: result.changes
        ? 'Access requested. You are on the list for the next drop.'
        : 'You are already on the list.',
    });
  });

  // ----- admin (requires ADMIN_TOKEN) -----

  function requireAdmin(req) {
    const token = process.env.ADMIN_TOKEN;
    const given = String(req.headers['x-admin-token'] || '');
    const ok = token && given.length === token.length
      && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(token));
    if (!ok) throw new HttpError(401, 'Admin token required.');
  }

  app.get('/api/admin/summary', (req, res) => {
    requireAdmin(req);
    const itemsFor = db.prepare('SELECT name, size, color, qty FROM order_items WHERE order_id = ?');
    res.json({
      orders: db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 200').all()
        .map((o) => ({ ...o, total: o.total_cents / 100, items: itemsFor.all(o.id) })),
      subscribers: db.prepare('SELECT email, created_at FROM subscribers ORDER BY id DESC').all(),
      users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
      inventory: db.prepare('SELECT id, name, stock, price_cents FROM products ORDER BY sort').all(),
    });
  });

  app.patch('/api/admin/orders/:number', (req, res) => {
    requireAdmin(req);
    const status = req.body?.status;
    if (!['confirmed', 'shipped', 'delivered', 'cancelled'].includes(status)) {
      throw new HttpError(400, 'Invalid status.');
    }
    const r = db.prepare('UPDATE orders SET status = ? WHERE number = ?').run(status, req.params.number);
    if (!r.changes) throw new HttpError(404, 'Order not found.');
    res.json({ number: req.params.number, status });
  });

  app.patch('/api/admin/products/:id', (req, res) => {
    requireAdmin(req);
    const stock = req.body?.stock;
    if (!Number.isInteger(stock) || stock < 0) throw new HttpError(400, 'Stock must be a whole number ≥ 0.');
    const r = db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(stock, req.params.id);
    if (!r.changes) throw new HttpError(404, 'Product not found.');
    res.json({ id: req.params.id, stock });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // ----- static site -----
  app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => console.log(`VEYA running at http://localhost:${port}`));
}

module.exports = { createApp };
