const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');
const { openDb } = require('../db');
const { toSiteProduct, toSiteCart, shopifyFromEnv } = require('../shopify');

// A Shopify Storefront API product, as returned by the PRODUCT_FIELDS query.
const shopifyProduct = {
  id: 'gid://shopify/Product/1',
  handle: 'heavyweight-hoodie',
  title: 'Heavyweight Hoodie',
  description: 'Brushed fleece.',
  productType: 'Hoodie',
  tags: ['badge:Best Seller', 'material:14oz Cotton Fleece', 'printful'],
  availableForSale: true,
  featuredImage: { url: 'https://cdn.shopify.com/hoodie.jpg', altText: null },
  options: [
    { name: 'Color', optionValues: [{ name: 'Black' }, { name: 'Heather Grey' }] },
    { name: 'Size', optionValues: [{ name: 'S' }, { name: 'M' }] },
  ],
  priceRange: { minVariantPrice: { amount: '58.0', currencyCode: 'USD' } },
  variants: {
    nodes: [
      { id: 'gid://shopify/ProductVariant/11', availableForSale: true, price: { amount: '58.0' }, selectedOptions: [{ name: 'Color', value: 'Black' }, { name: 'Size', value: 'S' }] },
      { id: 'gid://shopify/ProductVariant/12', availableForSale: true, price: { amount: '58.0' }, selectedOptions: [{ name: 'Color', value: 'Black' }, { name: 'Size', value: 'M' }] },
      { id: 'gid://shopify/ProductVariant/13', availableForSale: false, price: { amount: '58.0' }, selectedOptions: [{ name: 'Color', value: 'Heather Grey' }, { name: 'Size', value: 'S' }] },
      { id: 'gid://shopify/ProductVariant/14', availableForSale: true, price: { amount: '58.0' }, selectedOptions: [{ name: 'Color', value: 'Heather Grey' }, { name: 'Size', value: 'M' }] },
    ],
  },
};

test('maps a Shopify product to the storefront shape', () => {
  const p = toSiteProduct(shopifyProduct);
  assert.equal(p.id, 'heavyweight-hoodie');
  assert.equal(p.category, 'layers');
  assert.equal(p.badge, 'Best Seller');
  assert.equal(p.material, '14oz Cotton Fleece');
  assert.equal(p.price, 58);
  assert.deepEqual(p.sizes, ['S', 'M']);
  assert.deepEqual(p.colors.map((c) => c.name), ['Black', 'Heather Grey']);
  assert.equal(p.colors[1].hex, '#9a9a98');
  assert.equal(p.variants.find((v) => v.color === 'Heather Grey' && v.size === 'S').available, false);
  // An explicit category tag wins over keyword matching.
  assert.equal(toSiteProduct({ ...shopifyProduct, tags: ['category:bottoms'] }).category, 'bottoms');
});

describe('Shopify mode routes (fake Storefront client)', () => {
  // In-memory stand-in for the Shopify Storefront API client.
  const carts = new Map();
  let nextLine = 1;
  const variantInfo = Object.fromEntries(shopifyProduct.variants.nodes.map((v) => [v.id, v]));
  function shape(cart) {
    const lines = cart.lines.map((l) => ({
      id: l.id,
      quantity: l.quantity,
      cost: { totalAmount: { amount: String(58 * l.quantity) } },
      merchandise: {
        id: l.merchandiseId,
        price: { amount: '58.0' },
        selectedOptions: variantInfo[l.merchandiseId].selectedOptions,
        image: null,
        product: { handle: 'heavyweight-hoodie', title: 'Heavyweight Hoodie', featuredImage: { url: 'https://cdn.shopify.com/hoodie.jpg' } },
      },
    }));
    const qty = lines.reduce((n, l) => n + l.quantity, 0);
    return {
      id: cart.id,
      checkoutUrl: `https://veya.example/checkouts/${cart.id}`,
      totalQuantity: qty,
      cost: { subtotalAmount: { amount: String(58 * qty), currencyCode: 'USD' }, totalAmount: { amount: String(58 * qty) } },
      lines: { nodes: lines },
    };
  }
  const product = toSiteProduct(shopifyProduct);
  const fake = {
    accountUrl: 'https://veya.example/account',
    products: async () => [product],
    product: async (handle) => (handle === product.id ? product : null),
    getCart: async (id) => (carts.has(id) ? shape(carts.get(id)) : null),
    createCart: async (lines) => {
      const cart = { id: `cart-${carts.size + 1}`, lines: lines.map((l) => ({ ...l, id: `gid://shopify/CartLine/${nextLine++}` })) };
      carts.set(cart.id, cart);
      return shape(cart);
    },
    addLines: async (id, lines) => {
      const cart = carts.get(id);
      for (const l of lines) {
        const existing = cart.lines.find((x) => x.merchandiseId === l.merchandiseId);
        if (existing) existing.quantity += l.quantity;
        else cart.lines.push({ ...l, id: `gid://shopify/CartLine/${nextLine++}` });
      }
      return shape(cart);
    },
    updateLine: async (id, lineId, quantity) => {
      carts.get(id).lines.find((l) => l.id === lineId).quantity = quantity;
      return shape(carts.get(id));
    },
    removeLine: async (id, lineId) => {
      const cart = carts.get(id);
      cart.lines = cart.lines.filter((l) => l.id !== lineId);
      return shape(cart);
    },
    toSiteCart: (cart) => toSiteCart(cart, 75),
  };

  let server;
  let base;
  before(async () => {
    server = createApp(openDb(':memory:'), { stripe: null, shopify: fake }).listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => server.close());

  function client() {
    let cookie = '';
    return async (path, { method = 'GET', body } = {}) => {
      const res = await fetch(base + path, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const set = res.headers.getSetCookie().find((c) => c.startsWith('veya_sid='));
      if (set) cookie = set.split(';')[0];
      return { status: res.status, body: await res.json().catch(() => null) };
    };
  }

  test('config, catalog and search come from Shopify', async () => {
    const api = client();
    assert.deepEqual((await api('/api/config')).body, { payments: 'shopify', accountUrl: 'https://veya.example/account' });
    const list = (await api('/api/products')).body;
    assert.deepEqual(list.map((p) => p.id), ['heavyweight-hoodie']);
    assert.equal(list[0].variants, undefined, 'variant ids stay on the server');
    assert.equal((await api('/api/products?category=bottoms')).body.length, 0);
    assert.equal((await api('/api/products?q=fleece')).body.length, 1);
    assert.equal((await api('/api/products/nope')).status, 404);
  });

  test('bag is a Shopify cart; checkout returns the Shopify checkout URL', async () => {
    const api = client();
    assert.equal((await api('/api/checkout', { method: 'POST' })).status, 400);
    let r = await api('/api/cart', { method: 'POST', body: { productId: 'heavyweight-hoodie', size: 'M', color: 'Black' } });
    assert.equal(r.status, 201);
    assert.equal(r.body.count, 1);
    assert.equal(r.body.shippingAtCheckout, true);
    r = await api('/api/cart', { method: 'POST', body: { productId: 'heavyweight-hoodie', size: 'M', color: 'Black', qty: 2 } });
    assert.equal(r.body.count, 3);
    assert.equal(r.body.subtotal, 174);
    assert.equal(r.body.items[0].color, 'Black');

    const lineId = encodeURIComponent(r.body.items[0].id);
    r = await api(`/api/cart/${lineId}`, { method: 'PATCH', body: { qty: 1 } });
    assert.equal(r.body.count, 1);

    // Sold-out variant and unknown size are rejected before reaching Shopify.
    assert.equal((await api('/api/cart', { method: 'POST', body: { productId: 'heavyweight-hoodie', size: 'S', color: 'Heather Grey' } })).status, 409);
    assert.equal((await api('/api/cart', { method: 'POST', body: { productId: 'heavyweight-hoodie', size: 'XXL', color: 'Black' } })).status, 400);

    const checkout = await api('/api/checkout', { method: 'POST' });
    assert.equal(checkout.status, 201);
    assert.match(checkout.body.redirectUrl, /^https:\/\/veya\.example\/checkouts\//);

    r = await api(`/api/cart/${lineId}`, { method: 'DELETE' });
    assert.equal(r.body.count, 0);
  });

  test('a cart that Shopify no longer returns (checked out) resets to empty', async () => {
    const api = client();
    await api('/api/cart', { method: 'POST', body: { productId: 'heavyweight-hoodie', size: 'S', color: 'Black' } });
    carts.clear();
    const r = await api('/api/cart');
    assert.equal(r.body.count, 0);
    const again = await api('/api/cart', { method: 'POST', body: { productId: 'heavyweight-hoodie', size: 'S', color: 'Black' } });
    assert.equal(again.body.count, 1);
  });
});

// Live check against Shopify's public demo store (https://mock.shop), which serves the real
// Storefront API schema. Opt in with SHOPIFY_LIVE_TEST=1 (needs internet access).
test('works end to end against mock.shop', { skip: !process.env.SHOPIFY_LIVE_TEST && 'set SHOPIFY_LIVE_TEST=1 to run' }, async () => {
  const shopify = shopifyFromEnv({ SHOPIFY_STORE_DOMAIN: 'mock.shop' });
  const server = createApp(openDb(':memory:'), { stripe: null, shopify }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.getSetCookie().find((c) => c.startsWith('veya_sid='));
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json() };
  };
  try {
    const products = (await call('/api/products')).body;
    assert.ok(products.length > 0);
    const p = products.find((x) => x.inStock && x.sizes.length > 1) || products[0];
    let r = await call('/api/cart', { method: 'POST', body: { productId: p.id, size: p.sizes[0], color: p.colors[0].name, qty: 2 } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.count, 2);
    r = await call(`/api/cart/${encodeURIComponent(r.body.items[0].id)}`, { method: 'PATCH', body: { qty: 1 } });
    assert.equal(r.body.count, 1);
    const checkout = await call('/api/checkout', { method: 'POST' });
    assert.equal(checkout.status, 201);
    assert.match(checkout.body.redirectUrl, /^https:\/\//);
  } finally {
    server.close();
  }
});
