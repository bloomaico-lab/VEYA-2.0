const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');
const { openDb } = require('../db');

let server;
let base;
process.env.ADMIN_TOKEN = 'test-admin-token';

before(async () => {
  server = createApp(openDb(':memory:'), { stripe: null }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

// Minimal cookie-keeping client so each "browser" has its own session.
function client() {
  let cookie = '';
  return async (path, { method = 'GET', body, headers = {} } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.getSetCookie().find((c) => c.startsWith('veya_sid='));
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => null) };
  };
}

test('serves the storefront page', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /EVERYDAY ESSENTIALS/);
  assert.match(html, /\/app\.js/);
});

test('lists, filters and searches products', async () => {
  const api = client();
  const all = await api('/api/products');
  assert.equal(all.status, 200);
  assert.equal(all.body.length, 16);
  assert.ok(all.body.every((p) => p.modelImage.startsWith('/images/model-')), 'every product has an on-model photo');
  const exp = await api('/api/products?category=bottoms');
  assert.ok(exp.body.every((p) => p.category === 'bottoms'));
  const search = await api('/api/products?q=sweatpants');
  assert.deepEqual(search.body.map((p) => p.id), ['heavyweight-sweatpants', 'relaxed-sweatpant']);
  const men = await api('/api/products?gender=men');
  const women = await api('/api/products?gender=women');
  assert.equal(men.body.length, 8);
  assert.equal(women.body.length, 8);
  assert.ok(men.body.every((p) => p.gender === 'men') && women.body.every((p) => p.gender === 'women'));
  for (const list of [men.body, women.body]) {
    assert.deepEqual([...new Set(list.map((p) => p.category))].sort(), ['bottoms', 'layers', 'tops'], 'each section has tops, layers and bottoms');
  }
  const womensBottoms = await api('/api/products?gender=women&category=bottoms');
  assert.deepEqual(womensBottoms.body.map((p) => p.id), ['heavyweight-sweatpants', 'everyday-jogger', 'linen-short']);
  assert.equal((await api('/api/products/nope')).status, 404);
});

test('bag: add, merge, update, remove', async () => {
  const api = client();
  let r = await api('/api/cart', { method: 'POST', body: { productId: 'coach-jacket', size: 'M', color: 'Black' } });
  assert.equal(r.status, 201);
  r = await api('/api/cart', { method: 'POST', body: { productId: 'coach-jacket', size: 'M', color: 'Black', qty: 2 } });
  assert.equal(r.body.items.length, 1);
  assert.equal(r.body.count, 3);
  assert.equal(r.body.subtotal, 234);
  assert.equal(r.body.shipping, 0);
  const id = r.body.items[0].id;
  r = await api(`/api/cart/${id}`, { method: 'PATCH', body: { qty: 1 } });
  assert.equal(r.body.count, 1);
  r = await api(`/api/cart/${id}`, { method: 'DELETE' });
  assert.equal(r.body.count, 0);

  assert.equal((await api('/api/cart', { method: 'POST', body: { productId: 'coach-jacket', size: 'XXXL' } })).status, 400);
  // Another visitor cannot touch this bag.
  const other = client();
  r = await api('/api/cart', { method: 'POST', body: { productId: 'everyday-crew' } });
  assert.equal((await other(`/api/cart/${r.body.items[0].id}`, { method: 'PATCH', body: { qty: 2 } })).status, 404);
});

test('checkout creates an order, charges shipping under threshold, decrements stock', async () => {
  const api = client();
  assert.equal((await api('/api/checkout', { method: 'POST', body: {} })).status, 400);
  await api('/api/cart', { method: 'POST', body: { productId: 'everyday-crew', size: 'S', color: 'Charcoal' } });
  const details = { name: 'Ada Lovelace', email: 'ada@example.com', address: '1 Main St', city: 'London', postalCode: 'N1', country: 'UK' };
  assert.equal((await api('/api/checkout', { method: 'POST', body: { ...details, email: 'bad' } })).status, 400);
  const order = await api('/api/checkout', { method: 'POST', body: details });
  assert.equal(order.status, 201);
  assert.match(order.body.number, /^VEYA-[0-9A-F]{8}$/);
  assert.equal(order.body.total, 54); // 48 + 6 shipping (under the $75 free-shipping threshold)
  assert.equal((await api('/api/cart')).body.count, 0);

  const admin = await api('/api/admin/summary', { headers: { 'x-admin-token': 'test-admin-token' } });
  assert.equal(admin.status, 200);
  assert.equal(admin.body.inventory.find((p) => p.id === 'everyday-crew').stock, 69);
  assert.equal(admin.body.orders[0].number, order.body.number);
});

test('stock limits are enforced', async () => {
  const api = client();
  const r = await api('/api/cart', { method: 'POST', body: { productId: 'linen-short', qty: 11 } });
  assert.equal(r.status, 400);
  await fetch(`${base}/api/admin/products/linen-short`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-admin-token': 'test-admin-token' }, body: JSON.stringify({ stock: 1 }),
  });
  assert.equal((await api('/api/cart', { method: 'POST', body: { productId: 'linen-short', qty: 2 } })).status, 409);
});

test('accounts: register, me, orders, logout, login keeps the bag', async () => {
  const api = client();
  const reg = await api('/api/auth/register', { method: 'POST', body: { name: 'Quinn', email: 'Quinn@Example.com', password: 'supersecret' } });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.user.email, 'quinn@example.com');
  assert.equal((await api('/api/auth/register', { method: 'POST', body: { name: 'Q', email: 'quinn@example.com', password: 'supersecret' } })).status, 409);
  assert.equal((await api('/api/auth/me')).body.user.name, 'Quinn');

  await api('/api/cart', { method: 'POST', body: { productId: 'heavyweight-sweatpants', size: 'M', color: 'Black' } });
  await api('/api/checkout', { method: 'POST', body: { name: 'Quinn', address: '2 Road', city: 'Oslo', postalCode: '0150', country: 'NO' } });
  const orders = await api('/api/orders');
  assert.equal(orders.body.length, 1);
  assert.equal(orders.body[0].items[0].name, 'Heavyweight Sweatpants');

  await api('/api/auth/logout', { method: 'POST' });
  assert.equal((await api('/api/auth/me')).body.user, null);
  assert.equal((await api('/api/orders')).status, 401);
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { email: 'quinn@example.com', password: 'wrongpass' } })).status, 401);

  await api('/api/cart', { method: 'POST', body: { productId: 'heavyweight-hoodie' } });
  const login = await api('/api/auth/login', { method: 'POST', body: { email: 'quinn@example.com', password: 'supersecret' } });
  assert.equal(login.status, 200);
  assert.equal((await api('/api/cart')).body.count, 1);
});

test('VIP subscribe is idempotent and validates email', async () => {
  const api = client();
  assert.equal((await api('/api/subscribe', { method: 'POST', body: { email: 'vip@example.com' } })).status, 201);
  const again = await api('/api/subscribe', { method: 'POST', body: { email: 'VIP@example.com' } });
  assert.equal(again.status, 200);
  assert.equal(again.body.alreadySubscribed, true);
  assert.equal((await api('/api/subscribe', { method: 'POST', body: { email: 'nope' } })).status, 400);
});

test('content endpoints and admin auth', async () => {
  const api = client();
  assert.equal((await api('/api/pages/privacy')).body.title, 'Privacy Policy');
  assert.equal((await api('/api/pages/constructor')).status, 404);
  assert.equal((await api('/api/pages/size-guide')).body.title, 'Size Guide');
  assert.equal((await api('/api/fabrics')).body.length, 3);
  assert.equal((await api('/api/admin/summary')).status, 401);
  assert.equal((await api('/api/admin/summary', { headers: { 'x-admin-token': 'wrong' } })).status, 401);
});
