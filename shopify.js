// Shopify Storefront API integration (headless). When configured, Shopify is the source of truth
// for products, the bag and checkout; print-on-demand apps (Printful, Printify, …) installed on the
// Shopify store then receive and fulfil the orders automatically.
//
// Env: SHOPIFY_STORE_DOMAIN (e.g. veya.myshopify.com, or "mock.shop" for Shopify's public demo store),
//      SHOPIFY_STOREFRONT_TOKEN (public Storefront API access token), SHOPIFY_API_VERSION (optional).

const DEFAULT_API_VERSION = '2026-10';
const CACHE_MS = 60 * 1000;

// Shopify options don't carry swatch colours; map common names and fall back to a neutral grey.
const COLOR_HEX = {
  black: '#111317', white: '#f4f2ec', 'off-white': '#ece8df', cream: '#ece5d3', ivory: '#efe9da', natural: '#e8e0cc',
  grey: '#8e8f91', gray: '#8e8f91', 'heather grey': '#9a9a98', 'heather gray': '#9a9a98', charcoal: '#37393d',
  graphite: '#37393d', navy: '#1d2433', blue: '#2f4f86', 'light blue': '#9db7d5', indigo: '#1f2a44',
  green: '#3f6b46', olive: '#4d5340', 'military green': '#4b5320', forest: '#24402e', ocean: '#2f6f8f',
  red: '#a23b36', maroon: '#5c1f24', burgundy: '#5c1f24', pink: '#e2a9b4', purple: '#5d4a7a', yellow: '#e2c25a',
  orange: '#d9773b', brown: '#5e4331', sand: '#cdbb98', khaki: '#a69373', tan: '#b59a74', beige: '#d8c8a8', stone: '#c9c2b4',
};

// Site categories (navigation chips) and the Shopify product types / tags that map onto them.
const CATEGORY_KEYWORDS = {
  layers: ['hoodie', 'sweatshirt', 'jacket', 'coat', 'outerwear', 'half-zip', 'quarter-zip', 'zip', 'layer', 'fleece', 'crewneck sweatshirt'],
  bottoms: ['bottom', 'pant', 'trouser', 'jogger', 'short', 'sweatpant', 'legging', 'jean', 'denim', 'skirt'],
  tops: ['tee', 't-shirt', 'shirt', 'top', 'tank', 'polo', 'crew', 'knit', 'sweater', 'long sleeve'],
};

const PRODUCT_FIELDS = `
  id handle title description productType tags availableForSale
  featuredImage { url altText }
  options { name optionValues { name } }
  priceRange { minVariantPrice { amount currencyCode } }
  variants(first: 100) { nodes { id availableForSale price { amount } selectedOptions { name value } } }
`;

const CART_FIELDS = `
  id checkoutUrl totalQuantity
  cost { subtotalAmount { amount currencyCode } totalAmount { amount } }
  lines(first: 100) {
    nodes {
      id quantity
      cost { totalAmount { amount } }
      merchandise {
        ... on ProductVariant {
          id price { amount } selectedOptions { name value } image { url }
          product { handle title featuredImage { url } }
        }
      }
    }
  }
`;

class ShopifyError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

const money = (amount) => Math.round(Number(amount) * 100) / 100;
const optionValue = (selected, name) => selected.find((o) => o.name.toLowerCase() === name)?.value;

function categoryFor(product) {
  const tags = product.tags.map((t) => t.toLowerCase());
  const explicit = tags.find((t) => t.startsWith('category:'));
  if (explicit) return explicit.slice('category:'.length).trim();
  const haystack = [product.productType, product.title, ...tags].join(' ').toLowerCase();
  for (const [category, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((w) => haystack.includes(w))) return category;
  }
  return 'tops';
}

function badgeFor(product) {
  const badge = product.tags.find((t) => t.toLowerCase().startsWith('badge:'));
  if (badge) return badge.slice('badge:'.length).trim();
  const tags = product.tags.map((t) => t.toLowerCase());
  if (tags.includes('best seller') || tags.includes('bestseller')) return 'Best Seller';
  if (tags.includes('new')) return 'New';
  return '';
}

// Shopify product -> the shape the storefront front end already renders.
function toSiteProduct(p) {
  const option = (name) => p.options.find((o) => o.name.toLowerCase() === name);
  const colors = (option('color') || option('colour'))?.optionValues.map((v) => ({
    name: v.name, hex: COLOR_HEX[v.name.toLowerCase()] || '#8e8f91',
  })) || [{ name: 'Default', hex: '#8e8f91' }];
  const sizes = option('size')?.optionValues.map((v) => v.name) || ['One Size'];
  return {
    id: p.handle,
    name: p.title,
    tagline: p.productType || 'VEYA',
    material: p.tags.find((t) => t.toLowerCase().startsWith('material:'))?.slice('material:'.length).trim() || '',
    category: categoryFor(p),
    price: money(p.priceRange.minVariantPrice.amount),
    currency: p.priceRange.minVariantPrice.currencyCode,
    badge: badgeFor(p),
    image: p.featuredImage?.url || '',
    description: p.description,
    colors,
    sizes,
    inStock: p.availableForSale,
    variants: p.variants.nodes.map((v) => ({
      id: v.id,
      available: v.availableForSale,
      price: money(v.price.amount),
      size: optionValue(v.selectedOptions, 'size') || 'One Size',
      color: optionValue(v.selectedOptions, 'color') || optionValue(v.selectedOptions, 'colour') || 'Default',
    })),
  };
}

function toSiteCart(cart, freeShippingThreshold) {
  if (!cart) return emptyCart(freeShippingThreshold);
  const items = cart.lines.nodes.map((line) => {
    const m = line.merchandise;
    return {
      id: line.id,
      productId: m.product.handle,
      name: m.product.title,
      image: m.image?.url || m.product.featuredImage?.url || '',
      size: optionValue(m.selectedOptions, 'size') || 'One Size',
      color: optionValue(m.selectedOptions, 'color') || optionValue(m.selectedOptions, 'colour') || 'Default',
      qty: line.quantity,
      unitPrice: money(m.price.amount),
      lineTotal: money(line.cost.totalAmount.amount),
    };
  });
  const subtotal = money(cart.cost.subtotalAmount.amount);
  return {
    items,
    count: cart.totalQuantity,
    subtotal,
    // Shipping and tax are calculated by Shopify at checkout.
    shipping: 0,
    shippingAtCheckout: true,
    total: subtotal,
    currency: cart.cost.subtotalAmount.currencyCode,
    freeShippingThreshold,
    checkoutUrl: cart.checkoutUrl,
  };
}

function emptyCart(freeShippingThreshold) {
  return {
    items: [], count: 0, subtotal: 0, shipping: 0, shippingAtCheckout: true, total: 0, freeShippingThreshold,
  };
}

function createShopifyClient({
  domain, token, apiVersion = DEFAULT_API_VERSION, fetchImpl = fetch, freeShippingThreshold = 75,
}) {
  const endpoint = domain === 'mock.shop'
    ? 'https://mock.shop/api'
    : `https://${domain.replace(/^https?:\/\//, '').replace(/\/$/, '')}/api/${apiVersion}/graphql.json`;
  let productCache = null;

  async function gql(query, variables = {}) {
    let res;
    try {
      res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Shopify-Storefront-Access-Token': token } : {}),
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (err) {
      throw new ShopifyError(`Could not reach Shopify: ${err.message}`);
    }
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) throw new ShopifyError(`Shopify returned HTTP ${res.status}.`);
    if (body.errors?.length) throw new ShopifyError(`Shopify error: ${body.errors[0].message}`);
    return body.data;
  }

  function checkUserErrors(payload) {
    const err = payload.userErrors?.[0];
    if (err) throw new ShopifyError(err.message, 400);
    return payload.cart;
  }

  async function products() {
    if (productCache && Date.now() - productCache.at < CACHE_MS) return productCache.list;
    const list = [];
    let after = null;
    do {
      const data = await gql(`query Products($after: String) {
        products(first: 100, after: $after, sortKey: BEST_SELLING) {
          nodes { ${PRODUCT_FIELDS} }
          pageInfo { hasNextPage endCursor }
        }
      }`, { after });
      list.push(...data.products.nodes.map(toSiteProduct));
      after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
    } while (after && list.length < 500);
    productCache = { at: Date.now(), list };
    return list;
  }

  async function product(handle) {
    const cached = productCache?.list.find((p) => p.id === handle);
    if (cached) return cached;
    const data = await gql(`query Product($handle: String!) { product(handle: $handle) { ${PRODUCT_FIELDS} } }`, { handle });
    return data.product ? toSiteProduct(data.product) : null;
  }

  async function getCart(cartId) {
    if (!cartId) return null;
    const data = await gql(`query Cart($id: ID!) { cart(id: $id) { ${CART_FIELDS} } }`, { id: cartId });
    return data.cart; // null once the cart has been checked out or has expired
  }

  async function createCart(lines) {
    const data = await gql(`mutation Create($input: CartInput!) {
      cartCreate(input: $input) { cart { ${CART_FIELDS} } userErrors { field message } }
    }`, { input: { lines } });
    return checkUserErrors(data.cartCreate);
  }

  async function addLines(cartId, lines) {
    const data = await gql(`mutation Add($cartId: ID!, $lines: [CartLineInput!]!) {
      cartLinesAdd(cartId: $cartId, lines: $lines) { cart { ${CART_FIELDS} } userErrors { field message } }
    }`, { cartId, lines });
    return checkUserErrors(data.cartLinesAdd);
  }

  async function updateLine(cartId, lineId, quantity) {
    const data = await gql(`mutation Update($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
      cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { ${CART_FIELDS} } userErrors { field message } }
    }`, { cartId, lines: [{ id: lineId, quantity }] });
    return checkUserErrors(data.cartLinesUpdate);
  }

  async function removeLine(cartId, lineId) {
    const data = await gql(`mutation Remove($cartId: ID!, $lineIds: [ID!]!) {
      cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { ${CART_FIELDS} } userErrors { field message } }
    }`, { cartId, lineIds: [lineId] });
    return checkUserErrors(data.cartLinesRemove);
  }

  return {
    domain,
    accountUrl: domain === 'mock.shop' ? null : `https://${domain}/account`,
    products,
    product,
    getCart,
    createCart,
    addLines,
    updateLine,
    removeLine,
    toSiteCart: (cart) => toSiteCart(cart, freeShippingThreshold),
  };
}

function shopifyFromEnv(env = process.env) {
  if (!env.SHOPIFY_STORE_DOMAIN) return null;
  return createShopifyClient({
    domain: env.SHOPIFY_STORE_DOMAIN,
    token: env.SHOPIFY_STOREFRONT_TOKEN,
    apiVersion: env.SHOPIFY_API_VERSION || DEFAULT_API_VERSION,
  });
}

module.exports = {
  createShopifyClient, shopifyFromEnv, toSiteProduct, toSiteCart, ShopifyError,
};

// ----- Express routes used in Shopify mode -----
// They answer the same /api endpoints as the built-in store, so the front end works unchanged.
// The Shopify cart id is kept on the visitor's session.
function registerShopifyRoutes(app, shopify, db) {
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  const publicProduct = ({ variants, ...p }) => p;
  const setCartId = (req, cartId) => {
    db.prepare('UPDATE sessions SET shopify_cart_id = ? WHERE id = ?').run(cartId, req.session.id);
    req.session.shopify_cart_id = cartId;
  };
  async function currentCart(req) {
    const cart = await shopify.getCart(req.session.shopify_cart_id);
    if (!cart && req.session.shopify_cart_id) setCartId(req, null); // checked out or expired
    return cart;
  }

  app.get('/api/config', (req, res) => res.json({ payments: 'shopify', accountUrl: shopify.accountUrl }));

  app.get('/api/products', wrap(async (req, res) => {
    const { category, q } = req.query;
    let list = await shopify.products();
    if (category && category !== 'all') list = list.filter((p) => p.category === category);
    if (q) {
      const needle = String(q).toLowerCase().slice(0, 100);
      list = list.filter((p) => [p.name, p.tagline, p.material, p.category, p.description]
        .some((f) => f.toLowerCase().includes(needle)));
    }
    res.json(list.map(publicProduct));
  }));

  app.get('/api/products/:id', wrap(async (req, res) => {
    const p = await shopify.product(req.params.id);
    if (!p) throw new ShopifyError('Product not found.', 404);
    res.json(publicProduct(p));
  }));

  app.get('/api/cart', wrap(async (req, res) => res.json(shopify.toSiteCart(await currentCart(req)))));

  app.post('/api/cart', wrap(async (req, res) => {
    const { productId, size, color } = req.body || {};
    const qty = Number.isInteger(req.body?.qty) ? req.body.qty : 1;
    if (qty < 1 || qty > 10) throw new ShopifyError('Quantity must be between 1 and 10.', 400);
    const p = await shopify.product(String(productId || ''));
    if (!p) throw new ShopifyError('Product not found.', 404);
    const chosenSize = size ?? p.sizes[Math.floor(p.sizes.length / 2)];
    const chosenColor = color ?? p.colors[0].name;
    const variant = p.variants.find((v) => v.size === chosenSize && v.color === chosenColor)
      || (p.variants.length === 1 ? p.variants[0] : null);
    if (!variant) throw new ShopifyError('Please choose a valid size and colour.', 400);
    if (!variant.available) throw new ShopifyError(`${p.name} in ${chosenColor} / ${chosenSize} is sold out.`, 409);

    const lines = [{ merchandiseId: variant.id, quantity: qty }];
    const existing = await currentCart(req);
    const cart = existing ? await shopify.addLines(existing.id, lines) : await shopify.createCart(lines);
    if (!existing) setCartId(req, cart.id);
    res.status(201).json(shopify.toSiteCart(cart));
  }));

  app.patch('/api/cart/:itemId', wrap(async (req, res) => {
    const qty = req.body?.qty;
    if (!Number.isInteger(qty) || qty < 0 || qty > 10) throw new ShopifyError('Quantity must be between 0 and 10.', 400);
    const cart = await currentCart(req);
    if (!cart || !cart.lines.nodes.some((l) => l.id === req.params.itemId)) throw new ShopifyError('Item not in bag.', 404);
    const updated = qty === 0
      ? await shopify.removeLine(cart.id, req.params.itemId)
      : await shopify.updateLine(cart.id, req.params.itemId, qty);
    res.json(shopify.toSiteCart(updated));
  }));

  app.delete('/api/cart/:itemId', wrap(async (req, res) => {
    const cart = await currentCart(req);
    if (!cart || !cart.lines.nodes.some((l) => l.id === req.params.itemId)) return res.json(shopify.toSiteCart(cart));
    res.json(shopify.toSiteCart(await shopify.removeLine(cart.id, req.params.itemId)));
  }));

  // Shopify hosts checkout (payments, shipping, tax); the customer is sent there with their bag.
  app.post('/api/checkout', wrap(async (req, res) => {
    const cart = await currentCart(req);
    if (!cart || cart.totalQuantity === 0) throw new ShopifyError('Your bag is empty.', 400);
    res.status(201).json({ redirectUrl: cart.checkoutUrl });
  }));
}

module.exports.registerShopifyRoutes = registerShopifyRoutes;
