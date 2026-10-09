// VEYA front-end: connects the Stitch design to the /api backend.
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const state = {
    products: [],
    filter: 'all',
    gender: 'all', // all | men | women
    sort: 'featured',
    config: { payments: 'demo' },
    cart: null,
    user: null,
    authMode: 'login',
    fabrics: [],
    detail: null, // { product, color, size, qty }
    cardColors: {}, // productId -> selected colour name on the card
  };

  // ---------- utilities ----------

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  const money = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  // Prices show their currency only when it isn't USD (a Shopify store can sell in any currency).
  const price = (n, currency) => (currency && currency !== 'USD' ? `${money(n)} ${currency}` : money(n));
  const CATEGORY_NAMES = { all: 'Shop All', tops: 'Tops', layers: 'Layers', bottoms: 'Bottoms' };
  const GENDER_NAMES = { men: "Men's", women: "Women's" };
  // Unisex pieces show in both the men's and the women's section.
  const matchesGender = (p, gender) => gender === 'all' || !p.gender || p.gender === gender || p.gender === 'unisex';

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  let toastTimer;
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.remove('opacity-0', 'translate-y-2');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('opacity-0', 'translate-y-2'), 2600);
  }

  // ---------- overlays ----------

  let lastFocus = null;
  function openOverlay(id) {
    $$('.overlay.open').forEach((o) => closeOverlay(o.id, false));
    const el = document.getElementById(id);
    lastFocus = document.activeElement;
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    const focusable = el.querySelector('input:not([type=hidden]), button:not([data-close]), [data-close]');
    setTimeout(() => focusable && focusable.focus(), 50);
  }

  function closeOverlay(id, restoreFocus = true) {
    const el = document.getElementById(id);
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
    if (!$('.overlay.open')) document.body.style.overflow = '';
    if (restoreFocus && lastFocus) lastFocus.focus();
    if (id === 'spin-overlay') spinClosed();
  }

  document.addEventListener('click', (e) => {
    const closer = e.target.closest('[data-close]');
    if (closer) closeOverlay(closer.closest('.overlay').id);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const open = $('.overlay.open');
      if (open) closeOverlay(open.id);
    }
  });

  // ---------- catalog ----------

  // Photos for one colour of a product. Each colour has its own studio shot and on-model photo;
  // anything missing falls back to the product's main photos.
  function colorPhotos(product, colorName) {
    const c = product.colors.find((x) => x.name === colorName) || {};
    return { image: c.image || product.image, modelImage: c.modelImage || product.modelImage };
  }

  function productCard(p) {
    const selected = state.cardColors[p.id] || p.colors[0].name;
    const photos = colorPhotos(p, selected);
    const swatches = p.colors.map((c) => `
      <button type="button" class="swatch w-3 h-3 rounded-full border border-outline-variant ${c.name === selected ? 'swatch-active' : ''}"
        style="background:${esc(c.hex)}" title="${esc(c.name)}" aria-label="${esc(c.name)}" data-swatch="${esc(c.name)}"></button>`).join('');
    return `
      <div class="product-card group flex flex-col min-w-0 bg-surface-container-low rounded-xl border border-outline-variant/20 overflow-hidden hover:border-outline-variant/60 transition-all duration-300" data-product="${esc(p.id)}">
        <div class="relative aspect-[4/5] bg-surface-container-lowest overflow-hidden cursor-pointer" data-open-product>
          <img data-card-image class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src="${esc(photos.image)}" alt="${esc(p.name)} in ${esc(selected)}" loading="lazy"/>
          ${photos.modelImage ? `<img data-card-model class="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-500" src="${esc(photos.modelImage)}" alt="${esc(p.name)} in ${esc(selected)} being worn" loading="lazy"/>` : ''}
          ${p.badge ? `<div class="absolute top-3 left-3">
            <span class="font-label-sm text-label-sm md:text-label-md px-2 py-0.5 rounded bg-surface-container-lowest/80 border border-outline-variant/30 text-secondary uppercase tracking-widest">${esc(p.badge)}</span>
          </div>` : ''}
          <button type="button" data-quick-add aria-label="Add ${esc(p.name)} to bag" class="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-surface-container-lowest/90 border border-outline-variant/40 flex items-center justify-center text-primary hover:bg-secondary hover:text-surface-container-lowest transition-colors duration-200 ${p.inStock ? '' : 'hidden'}">
            <span class="material-symbols-outlined text-[18px]">add</span>
          </button>
        </div>
        <div class="p-3 md:p-5 flex flex-col justify-between flex-grow">
          <div class="cursor-pointer" data-open-product>
            <span class="font-label-sm text-label-sm md:text-label-md text-secondary uppercase tracking-widest block mb-1">${GENDER_NAMES[p.gender] ? `${GENDER_NAMES[p.gender]} · ` : ''}${esc(p.tagline)}</span>
            <h3 class="font-headline-sm text-[15px] md:text-headline-sm text-primary mb-1">${esc(p.name)}</h3>
            ${p.material ? `<p class="hidden md:block font-label-md text-on-surface-variant font-normal">${esc(p.material)}</p>` : ''}
          </div>
          <div class="mt-3 md:mt-4 pt-3 border-t border-outline-variant/20 flex flex-wrap gap-2 items-center justify-between">
            <span class="font-label-md text-primary">${p.inStock ? price(p.price, p.currency) : 'SOLD OUT'}</span>
            <div class="flex items-center gap-1.5">${swatches}</div>
          </div>
        </div>
      </div>`;
  }

  function sortedProducts(list) {
    const sorted = [...list];
    if (state.sort === 'price-asc') sorted.sort((x, y) => x.price - y.price);
    else if (state.sort === 'price-desc') sorted.sort((x, y) => y.price - x.price);
    else if (state.sort === 'name') sorted.sort((x, y) => x.name.localeCompare(y.name));
    // Sold-out pieces always go last (stable sort keeps the chosen order otherwise).
    return sorted.sort((x, y) => Number(y.inStock) - Number(x.inStock));
  }

  function renderProducts() {
    const track = $('#product-track');
    const list = sortedProducts(state.products.filter((p) => matchesGender(p, state.gender)
      && (state.filter === 'all' || p.category === state.filter)));
    track.innerHTML = list.length
      ? list.map(productCard).join('')
      : '<p class="col-span-full font-label-md text-on-surface-variant">NOTHING HERE YET. CHECK BACK SOON.</p>';
    const genderName = GENDER_NAMES[state.gender];
    $('#collection-title').textContent = genderName
      ? `${genderName} ${state.filter === 'all' ? 'Collection' : CATEGORY_NAMES[state.filter]}`
      : CATEGORY_NAMES[state.filter] || 'Shop All';
    $('#result-count').textContent = `${list.length} ${list.length === 1 ? 'item' : 'items'}`;
    $$('#filter-chips .chip').forEach((c) => c.classList.toggle('chip-active', c.dataset.chip === state.filter));
    $$('#gender-tabs [data-gender-tab]').forEach((t) => {
      const active = t.dataset.genderTab === state.gender;
      t.classList.toggle('chip-active', active);
      t.setAttribute('aria-selected', String(active));
    });
    $$('.nav-link').forEach((a) => {
      // Men / Women links light up for their section; Shop All and category links only when no section is picked.
      const active = a.dataset.filter === state.filter && (a.dataset.gender || 'all') === state.gender;
      a.classList.toggle('text-primary', active);
      a.classList.toggle('border-secondary', active);
      a.classList.toggle('border-transparent', !active);
      a.classList.toggle('text-on-surface-variant', !active);
    });
  }

  // "Shop by category" cards show live style counts and starting prices.
  function renderCategoryStats() {
    $$('[data-cat-count]').forEach((el) => {
      const items = state.products.filter((p) => p.category === el.dataset.catCount);
      el.textContent = `${items.length} ${items.length === 1 ? 'style' : 'styles'}`;
      const from = items.length ? Math.min(...items.map((p) => p.price)) : null;
      const fromEl = $(`[data-cat-from="${el.dataset.catCount}"]`);
      if (fromEl) fromEl.textContent = from === null ? '' : `From ${price(from, items[0].currency)}`;
    });
    // Men / Women cards: style count and starting price for each section.
    $$('[data-gender-count]').forEach((el) => {
      const items = state.products.filter((p) => matchesGender(p, el.dataset.genderCount));
      const from = items.length ? Math.min(...items.map((p) => p.price)) : null;
      el.textContent = `${items.length} ${items.length === 1 ? 'style' : 'styles'}${from === null ? '' : ` · From ${price(from, items[0].currency)}`}`;
    });
  }

  function setFilter(filter, { scroll = true, gender } = {}) {
    state.filter = filter;
    if (gender) state.gender = gender;
    renderProducts();
    if (scroll) $('#collections').scrollIntoView({ behavior: 'smooth' });
  }

  async function loadProducts() {
    try {
      state.products = await api('/api/products');
      renderProducts();
      renderCategoryStats();
    } catch (err) {
      $('#product-track').innerHTML = `<p class="col-span-full font-label-md text-error">${esc(err.message)}</p>`;
    }
  }

  $('#sort-select').addEventListener('change', (e) => { state.sort = e.target.value; renderProducts(); });

  // Filter triggers: nav links, category cards, hero CTA, chips.
  document.addEventListener('click', (e) => {
    // Links pick a category and a section: Men / Women links carry data-gender, everything else means both.
    const trigger = e.target.closest('[data-filter]');
    if (trigger) {
      e.preventDefault();
      setFilter(trigger.dataset.filter, { gender: trigger.dataset.gender || 'all' });
    }
    // Chips and the Men / Women tabs above the grid change one thing and keep the other.
    const chip = e.target.closest('[data-chip]');
    if (chip) setFilter(chip.dataset.chip, { scroll: false });
    const tab = e.target.closest('[data-gender-tab]');
    if (tab) setFilter(state.filter, { scroll: false, gender: tab.dataset.genderTab });
  });
  $$('[data-filter][role=button]').forEach((el) => el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setFilter(el.dataset.filter, { gender: el.dataset.gender || 'all' });
    }
  }));

  // Product card interactions.
  $('#product-track').addEventListener('click', async (e) => {
    const card = e.target.closest('[data-product]');
    if (!card) return;
    const product = state.products.find((p) => p.id === card.dataset.product);
    const swatch = e.target.closest('[data-swatch]');
    if (swatch) {
      const color = swatch.dataset.swatch;
      state.cardColors[product.id] = color;
      $$('[data-swatch]', card).forEach((s) => s.classList.toggle('swatch-active', s === swatch));
      // Show that colour's photos on the card.
      const photos = colorPhotos(product, color);
      const img = $('[data-card-image]', card);
      img.src = photos.image;
      img.alt = `${product.name} in ${color}`;
      const model = $('[data-card-model]', card);
      if (model && photos.modelImage) { model.src = photos.modelImage; model.alt = `${product.name} in ${color} being worn`; }
      return;
    }
    if (e.target.closest('[data-quick-add]')) {
      await addToBag({ productId: product.id, color: state.cardColors[product.id] || product.colors[0].name });
      return;
    }
    if (e.target.closest('[data-open-product]')) openProduct(product);
  });

  // ---------- product detail ----------

  function openProduct(product) {
    const color = state.cardColors[product.id] || product.colors[0].name;
    state.detail = { product, color, size: null, qty: 1 };
    renderPhotos(product, product.modelImage ? 1 : 0);
    $('#pd-temp').textContent = product.badge || '';
    $('#pd-temp').classList.toggle('hidden', !product.badge);
    $('#pd-tagline').textContent = product.tagline;
    $('#pd-name').textContent = product.name;
    $('#pd-material').textContent = product.material;
    $('#pd-price').textContent = product.inStock ? price(product.price, product.currency) : 'SOLD OUT';
    $('#pd-description').textContent = product.description;
    $('#pd-error').textContent = '';
    $('#pd-add').disabled = !product.inStock;
    renderDetail();
    openOverlay('product-overlay');
  }

  // Product popup photos: the studio shot and, when there is one, the on-model photo (shown first).
  // Uses the colour picked in the popup, so switching colour switches the photos.
  function renderPhotos(product, index) {
    const color = state.detail?.color || product.colors[0].name;
    const shots = colorPhotos(product, color);
    const photos = [{ src: shots.image, alt: `${product.name} in ${color}`, label: 'Product' }];
    if (shots.modelImage) photos.push({ src: shots.modelImage, alt: `${product.name} in ${color} being worn`, label: 'On model' });
    const current = photos[index] || photos[0];
    if (state.detail) state.detail.photo = photos.indexOf(current);
    $('#pd-image').src = current.src;
    $('#pd-image').alt = current.alt;
    $('#pd-thumbs').innerHTML = photos.length < 2 ? '' : photos.map((ph, i) => `
      <button type="button" data-pd-photo="${i}" aria-label="Show ${esc(ph.label.toLowerCase())} photo" aria-pressed="${ph === current}"
        class="w-12 h-14 rounded-md overflow-hidden border-2 ${ph === current ? 'border-secondary' : 'border-outline-variant/40 opacity-70 hover:opacity-100'} transition">
        <img src="${esc(ph.src)}" alt="" class="w-full h-full object-cover"/>
      </button>`).join('');
  }

  function renderDetail() {
    const { product, color, size, qty } = state.detail;
    $('#pd-color-name').textContent = color;
    $('#pd-colors').innerHTML = product.colors.map((c) => `
      <button type="button" data-pd-color="${esc(c.name)}" title="${esc(c.name)}" aria-label="${esc(c.name)}"
        class="w-7 h-7 rounded-full border border-outline-variant ${c.name === color ? 'swatch-active' : ''}" style="background:${esc(c.hex)}"></button>`).join('');
    $('#pd-sizes').innerHTML = product.sizes.map((s) => `
      <button type="button" data-pd-size="${esc(s)}" aria-pressed="${s === size}"
        class="min-w-[48px] h-10 px-3 rounded-lg border font-label-md transition-colors ${s === size ? 'border-secondary text-secondary bg-surface-container' : 'border-outline-variant/40 text-primary hover:border-outline'}">${esc(s)}</button>`).join('');
    $('#pd-qty').textContent = qty;
  }

  $('#product-overlay').addEventListener('click', (e) => {
    if (!state.detail) return;
    const photo = e.target.closest('[data-pd-photo]');
    if (photo) { renderPhotos(state.detail.product, Number(photo.dataset.pdPhoto)); return; }
    const c = e.target.closest('[data-pd-color]');
    const s = e.target.closest('[data-pd-size]');
    if (c) {
      state.detail.color = c.dataset.pdColor;
      renderPhotos(state.detail.product, state.detail.photo); // same view (product / on model), new colour
      state.cardColors[state.detail.product.id] = state.detail.color; // keep the card in the grid in step
      renderProducts();
    }
    if (s) { state.detail.size = s.dataset.pdSize; $('#pd-error').textContent = ''; }
    if (c || s) renderDetail();
  });
  $('#pd-minus').addEventListener('click', () => { state.detail.qty = Math.max(1, state.detail.qty - 1); renderDetail(); });
  $('#pd-plus').addEventListener('click', () => { state.detail.qty = Math.min(10, state.detail.qty + 1); renderDetail(); });
  $('#pd-add').addEventListener('click', async () => {
    const { product, color, size, qty } = state.detail;
    if (!size) { $('#pd-error').textContent = 'Please choose a size.'; return; }
    const ok = await addToBag({ productId: product.id, color, size, qty }, $('#pd-error'));
    if (ok) { closeOverlay('product-overlay', false); openBag(); }
  });

  // ---------- bag ----------

  function renderBag() {
    const cart = state.cart;
    if (!cart) return;
    $('#bag-count').textContent = `Bag (${cart.count})`;
    $('#bag-subtotal').textContent = money(cart.subtotal);
    $('#bag-shipping').textContent = !cart.count ? '—'
      : cart.shippingAtCheckout ? 'Calculated at checkout' : cart.shipping ? money(cart.shipping) : 'Free';
    $('#bag-total').textContent = money(cart.total);
    $('#checkout-total').textContent = money(cart.total);
    $('#checkout-btn').disabled = cart.count === 0;
    const remaining = cart.freeShippingThreshold - cart.subtotal;
    $('#bag-shipping-note').textContent = !cart.count || cart.shippingAtCheckout ? ''
      : remaining > 0 && !cart.discount?.freeShipping ? `${money(remaining)} away from free shipping` : 'You get free shipping';
    renderBagDiscount(cart.discount);

    $('#bag-items').innerHTML = cart.items.length ? cart.items.map((i) => `
      <div class="flex gap-4 p-3 rounded-lg border border-outline-variant/20 bg-surface-container-lowest/50" data-item="${esc(i.id)}">
        <img src="${esc(i.image)}" alt="" class="w-20 h-24 object-cover rounded"/>
        <div class="flex-grow flex flex-col justify-between min-w-0">
          <div>
            <p class="font-headline-sm text-[15px] text-primary truncate">${esc(i.name)}</p>
            <p class="font-label-sm text-on-surface-variant uppercase tracking-widest mt-1">${esc(i.color)} · ${esc(i.size)}</p>
          </div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <button type="button" data-qty="${i.qty - 1}" aria-label="Decrease quantity" class="w-7 h-7 rounded-full border border-outline-variant/40 flex items-center justify-center text-primary hover:border-secondary"><span class="material-symbols-outlined text-[14px]">remove</span></button>
              <span class="font-label-md text-primary w-4 text-center">${i.qty}</span>
              <button type="button" data-qty="${i.qty + 1}" aria-label="Increase quantity" class="w-7 h-7 rounded-full border border-outline-variant/40 flex items-center justify-center text-primary hover:border-secondary"><span class="material-symbols-outlined text-[14px]">add</span></button>
            </div>
            <span class="font-label-md text-primary">${money(i.lineTotal)}</span>
          </div>
        </div>
        <button type="button" data-remove aria-label="Remove ${esc(i.name)}" class="self-start text-on-surface-variant hover:text-error"><span class="material-symbols-outlined text-[18px]">close</span></button>
      </div>`).join('')
      : `<div class="text-center py-16 space-y-4">
          <span class="material-symbols-outlined text-[36px] text-outline">shopping_bag</span>
          <p class="font-body-md text-on-surface-variant">Your bag is empty.</p>
          <button type="button" data-close data-filter="all" class="font-label-md text-secondary uppercase tracking-widest hover:underline">Start shopping</button>
        </div>`;
  }

  // The discount code on the bag (from the wheel or typed in), or the "Have a code?" field when there isn't one.
  function renderBagDiscount(d) {
    $('#bag-discount-row').classList.toggle('hidden', !d);
    $('#bag-code').classList.toggle('hidden', Boolean(d));
    $('#checkout-discount').classList.toggle('hidden', !d?.applied);
    if (!d) return;
    $('#bag-discount-code').textContent = d.code;
    $('#bag-discount').textContent = !d.applied ? '' : d.amount ? `−${money(d.amount)}` : d.freeShipping ? 'Free shipping' : 'At checkout';
    const note = $('#bag-discount-note');
    note.textContent = d.note || d.title;
    note.classList.toggle('text-error', !d.applied);
    note.classList.toggle('text-on-surface-variant', d.applied);
    $('#checkout-discount').textContent = d.amount ? `Includes ${money(d.amount)} off with ${d.code}` : `Code ${d.code} applied`;
  }

  $('#bag-code-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#bag-code-input');
    const err = $('#bag-code-error');
    if (!input.value.trim()) { err.textContent = 'Please enter a code.'; return; }
    try {
      state.cart = await api('/api/cart/discount', { method: 'POST', body: { code: input.value } });
      input.value = '';
      err.textContent = '';
      renderBag();
    } catch (error) { err.textContent = error.message; }
  });

  $('#bag-discount-remove').addEventListener('click', async () => {
    try {
      state.cart = await api('/api/cart/discount', { method: 'DELETE' });
      renderBag();
    } catch (err) { toast(err.message); }
  });

  async function loadCart() {
    try { state.cart = await api('/api/cart'); renderBag(); } catch { /* bag stays at 0 */ }
  }

  async function addToBag(payload, errorEl) {
    try {
      state.cart = await api('/api/cart', { method: 'POST', body: payload });
      renderBag();
      const product = state.products.find((p) => p.id === payload.productId);
      toast(`${product ? product.name : 'Item'} added to bag`);
      return true;
    } catch (err) {
      if (errorEl) errorEl.textContent = err.message; else toast(err.message);
      return false;
    }
  }

  function openBag() { renderBag(); openOverlay('bag-overlay'); }
  $('#bag-btn').addEventListener('click', openBag);

  $('#bag-items').addEventListener('click', async (e) => {
    const row = e.target.closest('[data-item]');
    if (!row) return;
    const id = encodeURIComponent(row.dataset.item);
    try {
      const qtyBtn = e.target.closest('[data-qty]');
      if (qtyBtn) state.cart = await api(`/api/cart/${id}`, { method: 'PATCH', body: { qty: Number(qtyBtn.dataset.qty) } });
      else if (e.target.closest('[data-remove]')) state.cart = await api(`/api/cart/${id}`, { method: 'DELETE' });
      else return;
      renderBag();
    } catch (err) { toast(err.message); }
  });

  // ---------- checkout ----------

  $('#checkout-btn').addEventListener('click', async () => {
    if (state.config.payments === 'shopify') {
      // Shopify hosts checkout (payment, shipping, tax); send the customer there with their bag.
      const btn = $('#checkout-btn');
      btn.disabled = true;
      try {
        const { redirectUrl } = await api('/api/checkout', { method: 'POST' });
        window.location.assign(redirectUrl);
      } catch (err) {
        toast(err.message);
        btn.disabled = false;
      }
      return;
    }
    const form = $('#checkout-form');
    form.classList.remove('hidden');
    $('#checkout-success').classList.add('hidden');
    $('#checkout-title').textContent = 'Shipping Details';
    $('#checkout-error').textContent = '';
    if (state.user) {
      if (!form.name.value) form.name.value = state.user.name;
      if (!form.email.value) form.email.value = state.user.email;
    }
    openOverlay('checkout-overlay');
  });

  $('#checkout-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    const missing = Object.entries(data).find(([, v]) => !v.trim());
    if (missing) { $('#checkout-error').textContent = 'Please complete every field.'; return; }
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const order = await api('/api/checkout', { method: 'POST', body: data });
      if (order.redirectUrl) {
        // Stripe-hosted payment page; we come back to ?checkout=success|cancelled.
        window.location.assign(order.redirectUrl);
        return;
      }
      form.reset();
      await showOrderConfirmed(order);
    } catch (err) {
      $('#checkout-error').textContent = err.message;
      loadCart(); // e.g. a code that expired was taken off: show the new total
    }
    btn.disabled = false;
  });

  async function showOrderConfirmed(order) {
    $('#checkout-form').classList.add('hidden');
    $('#checkout-title').textContent = 'Thank You';
    $('#success-number').textContent = order.number;
    $('#success-email').textContent = order.email;
    $('#checkout-success').classList.remove('hidden');
    if (!$('#checkout-overlay').classList.contains('open')) openOverlay('checkout-overlay');
    await Promise.all([loadCart(), loadProducts()]);
  }

  // Returning from the Stripe payment page.
  async function handleCheckoutReturn() {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('checkout');
    if (!outcome) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    if (outcome === 'cancelled') { toast('Payment cancelled. Your bag is saved.'); return; }
    try {
      const order = await api(`/api/checkout/confirm?session_id=${encodeURIComponent(params.get('session_id') || '')}`);
      if (order.status === 'pending_payment') toast('Payment is processing. We will email you once it clears.');
      else await showOrderConfirmed(order);
    } catch (err) { toast(err.message); }
  }

  async function loadConfig() {
    try {
      state.config = await api('/api/config');
      const { payments } = state.config;
      if (payments === 'shopify') $('#checkout-btn span').textContent = 'Checkout securely';
      if (payments === 'stripe') {
        $('#checkout-mode-note').textContent = 'You will complete payment securely on Stripe.';
        $('#checkout-submit-label').textContent = 'Continue to Payment';
      }
    } catch { /* keep demo copy */ }
  }

  // ---------- account ----------

  function setAuthMode(mode) {
    state.authMode = mode;
    $$('.auth-tab').forEach((t) => t.classList.toggle('chip-active', t.dataset.authTab === mode));
    $('#auth-name-row').classList.toggle('hidden', mode !== 'register');
    $('#auth-submit').textContent = mode === 'register' ? 'Create Account' : 'Sign In';
    $('#account-title').textContent = mode === 'register' ? 'Join VEYA' : 'Sign In';
    $('#auth-form').password.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    $('#auth-error').textContent = '';
  }
  $$('.auth-tab').forEach((t) => t.addEventListener('click', () => setAuthMode(t.dataset.authTab)));

  async function renderAccount() {
    const signedIn = Boolean(state.user);
    $('#auth-view').classList.toggle('hidden', signedIn);
    $('#profile-view').classList.toggle('hidden', !signedIn);
    $('#account-btn').textContent = signedIn ? state.user.name.split(' ')[0] : 'Account';
    $('#menu-account-btn').textContent = signedIn ? `Account · ${state.user.name.split(' ')[0]}` : 'Account';
    if (!signedIn) { setAuthMode(state.authMode); return; }
    $('#account-title').textContent = 'Your Account';
    $('#profile-name').textContent = state.user.name;
    $('#profile-email').textContent = state.user.email;
    const list = $('#order-list');
    if (state.config.payments === 'shopify') {
      list.innerHTML = state.config.accountUrl
        ? `<a href="${esc(state.config.accountUrl)}" target="_blank" rel="noopener" class="font-label-md text-secondary uppercase tracking-widest hover:underline">View your orders and tracking</a>`
        : '<p class="font-body-sm text-on-surface-variant">Your orders and tracking links are emailed to you after checkout.</p>';
      return;
    }
    list.innerHTML = '<p class="font-label-md text-on-surface-variant">Loading…</p>';
    try {
      const orders = await api('/api/orders');
      list.innerHTML = orders.length ? orders.map((o) => `
        <div class="p-4 rounded-lg border border-outline-variant/30 bg-surface-container-lowest/60">
          <div class="flex items-center justify-between mb-2">
            <span class="font-label-lg text-primary">${esc(o.number)}</span>
            <span class="font-label-sm text-secondary uppercase tracking-widest">${esc(o.status)}</span>
          </div>
          <p class="font-body-sm text-on-surface-variant">${o.items.map((i) => `${esc(i.qty)}× ${esc(i.name)} (${esc(i.size)})`).join(', ')}</p>
          <div class="flex items-center justify-between mt-2 font-label-sm text-outline uppercase tracking-widest">
            <span>${esc(new Date(`${o.createdAt.replace(' ', 'T')}Z`).toLocaleDateString())}</span><span class="text-primary">${money(o.total)}</span>
          </div>
        </div>`).join('')
        : '<p class="font-body-sm text-on-surface-variant">No orders yet.</p>';
    } catch (err) {
      list.innerHTML = `<p class="font-label-md text-error">${esc(err.message)}</p>`;
    }
  }

  $('#account-btn').addEventListener('click', () => { renderAccount(); openOverlay('account-overlay'); });
  $('#menu-btn').addEventListener('click', () => openOverlay('menu-overlay'));
  $('#menu-account-btn').addEventListener('click', () => { renderAccount(); openOverlay('account-overlay'); });

  $('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const body = { email: form.email.value, password: form.password.value };
    if (state.authMode === 'register') body.name = form.name.value;
    const btn = $('#auth-submit');
    btn.disabled = true;
    try {
      const { user } = await api(`/api/auth/${state.authMode}`, { method: 'POST', body });
      state.user = user;
      form.reset();
      await renderAccount();
      await loadCart();
      toast(`Welcome, ${user.name.split(' ')[0]}`);
    } catch (err) {
      $('#auth-error').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  $('#logout-btn').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    state.user = null;
    closeOverlay('account-overlay');
    renderAccount();
    await loadCart();
    toast('Signed out');
  });

  // ---------- search ----------

  $('#search-btn').addEventListener('click', () => {
    $('#search-input').value = '';
    renderSearch('');
    openOverlay('search-overlay');
  });
  // Links like the "matching sets" banner message open search with a query filled in.
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-search]');
    if (!link) return;
    e.preventDefault();
    $('#search-input').value = link.dataset.search;
    renderSearch(link.dataset.search);
    openOverlay('search-overlay');
  });

  let searchTimer;
  $('#search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderSearch(e.target.value.trim()), 150);
  });

  async function renderSearch(q) {
    const box = $('#search-results');
    if (!q) {
      box.innerHTML = '<p class="px-3 py-2 font-label-sm text-on-surface-variant uppercase tracking-widest">Try “quarter-zip”, “leggings” or “matching set”</p>';
      return;
    }
    try {
      const results = await api(`/api/products?q=${encodeURIComponent(q)}`);
      box.innerHTML = results.length ? results.map((p) => `
        <button type="button" data-search-result="${esc(p.id)}" class="w-full flex items-center gap-4 p-2 rounded-lg hover:bg-surface-container text-left">
          <img src="${esc(p.image)}" alt="" class="w-12 h-14 object-cover rounded"/>
          <span class="flex-grow">
            <span class="block font-label-sm text-secondary uppercase tracking-widest">${esc(p.tagline)}</span>
            <span class="block font-headline-sm text-[15px] text-primary">${esc(p.name)}</span>
          </span>
          <span class="font-label-md text-primary">${money(p.price)}</span>
        </button>`).join('')
        : `<p class="px-3 py-2 font-body-md text-on-surface-variant">No pieces match “${esc(q)}”.</p>`;
    } catch (err) {
      box.innerHTML = `<p class="px-3 py-2 font-label-md text-error">${esc(err.message)}</p>`;
    }
  }

  $('#search-results').addEventListener('click', async (e) => {
    const hit = e.target.closest('[data-search-result]');
    if (!hit) return;
    const product = state.products.find((p) => p.id === hit.dataset.searchResult)
      || await api(`/api/products/${encodeURIComponent(hit.dataset.searchResult)}`);
    closeOverlay('search-overlay', false);
    openProduct(product);
  });

  // ---------- fabric lab ----------

  function selectFabric(card) {
    $$('.fabric-card').forEach((c) => {
      const active = c === card;
      c.classList.toggle('border-secondary/40', active);
      c.classList.toggle('bg-surface-container/60', active);
      c.classList.toggle('border-outline-variant/30', !active);
      c.classList.toggle('bg-surface-container-low/40', !active);
      c.setAttribute('aria-pressed', String(active));
    });
    const fabric = state.fabrics.find((f) => f.id === card.dataset.fabric);
    if (!fabric) return;
    $('#hud-specimen').textContent = `SPECIMEN: ${fabric.specimen}`;
    $('#hud-metric').textContent = fabric.metric;
    $('#hud-focus-title').textContent = fabric.focusTitle;
    $('#hud-focus-text').textContent = fabric.focusText;
  }
  $$('.fabric-card').forEach((card) => {
    card.addEventListener('click', () => selectFabric(card));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectFabric(card); }
    });
  });
  api('/api/fabrics').then((f) => { state.fabrics = f; }).catch(() => {});

  // ---------- content pages ----------

  async function openPage(slug) {
    try {
      const page = await api(`/api/pages/${encodeURIComponent(slug)}`);
      $('#page-kicker').textContent = page.kicker;
      $('#page-title').textContent = page.title;
      $('#page-body').innerHTML = page.body
        .map((p) => `<p class="font-body-md text-body-md text-on-surface-variant leading-relaxed">${esc(p)}</p>`).join('');
      openOverlay('page-overlay');
    } catch (err) { toast(err.message); }
  }
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-page]');
    if (link) { e.preventDefault(); openPage(link.dataset.page); }
  });
  $$('[data-page][role=button]').forEach((el) => el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') openPage(el.dataset.page);
  }));

  // ---------- the VEYA Collective ----------
  // Everyone on the list is a member, with a member number for good and a vote on what VEYA makes
  // next. The member card is a placeholder until you join; the server remembers which member this
  // browser joined as, so the card and the vote recognise you when you come back.

  const collective = { member: null, foundingOpen: true, foundingMembers: 1000, poll: null, welcome: 'back' };
  const foundingCount = () => collective.foundingMembers.toLocaleString('en-US');
  const memberSince = (since) => new Date(`${String(since).replace(' ', 'T')}Z`)
    .toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  function renderMemberCard(reveal) {
    const m = collective.member;
    const number = $('#member-card-number');
    $('#member-card').classList.toggle('is-member', Boolean(m));
    number.textContent = m ? m.number : '••••';
    $('#member-card-status').textContent = m ? `Member since ${memberSince(m.since)}` : 'Join to claim your number';
    const badge = m ? (m.founding ? 'Founding member' : '') : (collective.foundingOpen ? 'Founding spots open' : '');
    $('#member-card-badge').textContent = badge;
    $('#member-card-badge').classList.toggle('hidden', !badge);
    if (reveal) {
      number.classList.remove('member-reveal');
      void number.offsetWidth; // restart the animation
      number.classList.add('member-reveal');
    }
  }

  function renderCollective(reveal = false) {
    const m = collective.member;
    $$('[data-founding-count]').forEach((el) => { el.textContent = `The first ${foundingCount()} members`; });
    $('#collective-join').classList.toggle('hidden', Boolean(m));
    $('#collective-welcome').classList.toggle('hidden', !m);
    if (m) {
      const founding = m.founding ? ` You're one of our first ${foundingCount()} members, which makes you a Founding Member.` : '';
      const vote = collective.poll?.yourVote ? 'See how the members’ vote is going below.' : 'Your vote on what we make next is waiting below.';
      $('#collective-welcome-title').textContent = collective.welcome === 'joined'
        ? `Welcome to the Collective, member No. ${m.number}.` : `You're in, member No. ${m.number}.`;
      $('#collective-welcome-text').textContent = `Your number is yours for good.${founding} New drops reach you first. ${vote}`;
      $('#collective-vote-link').textContent = collective.poll?.yourVote ? 'See the vote' : 'Cast your vote';
    }
    renderMemberCard(reveal);
    renderVote();
    renderSpinMember();
  }

  $('#collective-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const msg = $('#collective-message');
    const email = form.email.value.trim();
    if (!EMAIL_RE.test(email)) { msg.textContent = 'PLEASE ENTER A VALID EMAIL ADDRESS.'; return; }
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const res = await api('/api/subscribe', { method: 'POST', body: { email } });
      msg.textContent = '';
      form.reset();
      collective.member = res.member;
      collective.welcome = res.alreadySubscribed ? 'back' : 'joined';
      renderCollective(true);
    } catch (err) {
      msg.textContent = err.message.toUpperCase();
    } finally {
      btn.disabled = false;
    }
  });

  // ----- the members' vote -----

  const voteError = (text) => { $('#vote-message').textContent = text; };

  function renderVote() {
    const { poll, member } = collective;
    $('#vote').hidden = !poll;
    if (!poll) return;
    const { results } = poll;
    const picked = $('#vote-options input[name=option]:checked')?.value; // keep a pick made before joining
    $('#vote-question').textContent = poll.question;
    $('#vote-options').innerHTML = poll.options.map((o, i) => {
      const num = String(i + 1).padStart(2, '0');
      if (results) {
        const { percent } = results.options.find((r) => r.id === o.id) || { percent: 0 };
        const mine = poll.yourVote === o.id;
        return `<div class="rounded-xl border ${mine ? 'border-secondary bg-surface-container-lowest' : 'border-outline-variant/40 bg-surface-container-low/60'} p-5 md:p-6 flex flex-col gap-2 sm:min-h-[196px]">
          <div class="h-6 flex items-center justify-between gap-2">
            <span class="font-label-sm text-label-sm tracking-[0.2em] text-on-surface-variant">${num}</span>
            ${mine ? '<span class="inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-secondary text-on-secondary font-label-sm text-label-sm uppercase tracking-widest"><span class="material-symbols-outlined text-[13px]" aria-hidden="true">check</span>Your vote</span>' : ''}
          </div>
          <h3 class="font-headline-sm text-headline-sm text-primary">${esc(o.name)}</h3>
          <p class="font-body-sm text-body-sm text-on-surface-variant">${esc(o.note)}</p>
          <div class="mt-auto pt-4">
            <p class="font-display text-[30px] leading-none text-primary mb-3">${percent}<span class="text-[18px]">%</span><span class="sr-only"> of votes</span></p>
            <div class="h-1.5 rounded-full bg-surface-container-high overflow-hidden"><div class="vote-bar h-full rounded-full ${mine ? 'bg-secondary' : 'bg-primary/60'}" style="width:0" data-width="${percent}"></div></div>
          </div>
        </div>`;
      }
      return `<label class="group rounded-xl border border-outline-variant/40 bg-surface-container-low/60 p-5 md:p-6 flex flex-col gap-2 sm:min-h-[196px] cursor-pointer transition-colors duration-200 hover:border-secondary/50 has-[:checked]:border-secondary has-[:checked]:bg-surface-container-lowest has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-secondary">
          <input type="radio" name="option" value="${esc(o.id)}" class="sr-only"${o.id === picked ? ' checked' : ''}/>
          <div class="h-6 flex items-center justify-between gap-2">
            <span class="font-label-sm text-label-sm tracking-[0.2em] text-on-surface-variant">${num}</span>
            <span class="w-5 h-5 rounded-full border border-outline-variant flex items-center justify-center transition-colors group-has-[:checked]:border-secondary group-has-[:checked]:bg-secondary" aria-hidden="true"><span class="material-symbols-outlined text-[13px] text-on-secondary opacity-0 group-has-[:checked]:opacity-100">check</span></span>
          </div>
          <h3 class="font-headline-sm text-headline-sm text-primary">${esc(o.name)}</h3>
          <p class="font-body-sm text-body-sm text-on-surface-variant">${esc(o.note)}</p>
          <span class="mt-auto pt-4 font-label-sm text-label-sm uppercase tracking-widest text-secondary">
            <span class="opacity-0 transition-opacity group-hover:opacity-100 group-has-[:checked]:hidden">Pick this</span>
            <span class="hidden group-has-[:checked]:inline">Your pick</span>
          </span>
        </label>`;
    }).join('');
    $('#vote-actions').classList.toggle('hidden', Boolean(results));
    $('#vote-email-row').classList.toggle('hidden', Boolean(member));
    $('#vote-note').textContent = member
      ? `Voting as member No. ${member.number}. One vote per member.`
      : 'Voting makes you a member of the VEYA Collective. Leave anytime.';
    const summary = $('#vote-summary');
    summary.classList.toggle('hidden', !results);
    if (results) {
      const standing = results.total >= 20
        ? `${results.total.toLocaleString('en-US')} members have voted so far.` : 'Early results: every vote moves the needle.';
      summary.textContent = `${collective.voteNote || ''} ${standing} Results update as votes come in.`.trim();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        $$('#vote-options .vote-bar').forEach((bar) => { bar.style.width = `${bar.dataset.width}%`; });
      }));
    }
  }

  $('#vote-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const option = $('#vote-options input[name=option]:checked')?.value;
    if (!option) { voteError('Pick one of the options first.'); return; }
    const email = $('#vote-email').value.trim();
    if (!collective.member && !EMAIL_RE.test(email)) { voteError('Enter your email to vote.'); $('#vote-email').focus(); return; }
    const btn = $('#vote-submit');
    btn.disabled = true;
    try {
      const res = await api('/api/vote', { method: 'POST', body: collective.member ? { option } : { option, email } });
      const joined = !collective.member;
      collective.member = res.member;
      collective.poll = res.poll;
      if (joined) collective.welcome = 'joined';
      collective.voteNote = res.counted ? 'Thanks, your vote is in.' : 'That email has already voted, so here’s where it stands.';
      voteError('');
      renderCollective(joined);
    } catch (err) {
      voteError(err.message);
      // They may have left the list since this page loaded: ask for their email again.
      if (collective.member) api('/api/collective').then((data) => { Object.assign(collective, data); renderCollective(); }).catch(() => {});
    } finally {
      btn.disabled = false;
    }
  });

  async function initCollective() {
    try {
      Object.assign(collective, await api('/api/collective'));
    } catch {
      collective.poll = null; // no vote if it can't load; the sign-up still works
    }
    renderCollective();
  }

  // ---------- spin to win ----------
  // New visitors see the wheel after a few seconds. The server decides where it lands (discounts.js;
  // currently always 25% off). Entering an email unlocks the code, which goes straight on the bag, and
  // makes them a Collective member. Closing it leaves a small tab in the corner to come back to it.

  const SPIN_KEY = 'veya-spin';
  const SPIN_DELAY_MS = 4000;
  const SPIN_SNOOZE_DAYS = 7;
  const spin = { slices: [], result: null, spinning: false, note: '' };
  const spinMemory = () => { try { return JSON.parse(localStorage.getItem(SPIN_KEY)) || {}; } catch { return {}; } };
  const rememberSpin = (patch) => {
    try { localStorage.setItem(SPIN_KEY, JSON.stringify({ ...spinMemory(), ...patch })); } catch { /* private browsing */ }
  };

  const WHEEL_COLORS = { cream: ['#F5EFE4', '#1B2A41'], sand: ['#E6DCCB', '#1B2A41'], blue: ['#34507A', '#F5EFE4'], navy: ['#1B2A41', '#F5EFE4'] };

  function wheelSvg(slices) {
    const step = 360 / slices.length;
    const R = 90;
    const at = (deg, r) => {
      const a = (deg * Math.PI) / 180;
      return `${(Math.sin(a) * r).toFixed(2)} ${(-Math.cos(a) * r).toFixed(2)}`;
    };
    const wedges = slices.map((s, i) => {
      const [fill, ink] = WHEEL_COLORS[s.style] || WHEEL_COLORS.cream;
      const a0 = i * step;
      return `<path d="M0 0 L${at(a0, R)} A${R} ${R} 0 0 1 ${at(a0 + step, R)}Z" fill="${fill}"/>
        <g transform="rotate(${a0 + step / 2})" fill="${ink}" text-anchor="middle">
          <text y="-58" font-family="'Bodoni Moda', Georgia, serif" font-size="15" font-weight="500">${esc(s.big)}</text>
          <text y="-45" font-family="'JetBrains Mono', monospace" font-size="5.8" letter-spacing=".7">${esc(s.small)}</text>
        </g>`;
    }).join('');
    const lines = slices.map((_, i) => `<path d="M0 0 L${at(i * step, R)}" stroke="#1B2A41" stroke-opacity=".18" stroke-width=".6"/>`).join('');
    const bulbs = Array.from({ length: slices.length * 2 }, (_, i) => {
      const [x, y] = at(i * (step / 2), 96).split(' ');
      return `<circle cx="${x}" cy="${y}" r="1.7" fill="${i % 2 ? '#34507A' : '#1B2A41'}"/>`;
    }).join('');
    return `<svg viewBox="-102 -102 204 204" class="w-full h-full block" aria-hidden="true">
      <circle r="101" fill="#F5EFE4"/><circle r="92.5" fill="#1B2A41"/>${wedges}${lines}${bulbs}
      <circle r="18" fill="#1B2A41" stroke="#F5EFE4" stroke-width="1.6"/>
      <text y="2.6" text-anchor="middle" font-family="'Bodoni Moda', Georgia, serif" font-size="7.4" fill="#F5EFE4" letter-spacing=".6">VEYA</text>
      <circle cx="0" cy="8.2" r="1.2" fill="#34507A"/>
    </svg>`;
  }

  // Turns the wheel so slice `index` stops under the pointer at the top.
  function turnWheel(index, animate) {
    const wheel = $('#spin-wheel');
    const step = 360 / spin.slices.length;
    const land = 360 - (index * step + step / 2);
    if (!animate) {
      wheel.style.transition = 'none';
      wheel.style.transform = `rotate(${land}deg)`;
      void wheel.offsetWidth; // apply now, then restore the transition
      wheel.style.transition = '';
      return Promise.resolve();
    }
    $('.spin-sway')?.classList.remove('spin-sway');
    const target = 360 * 6 + land + (Math.random() - 0.5) * step * 0.6; // six turns, then stop inside the slice
    return new Promise((resolve) => {
      let timer;
      const done = () => { clearTimeout(timer); wheel.removeEventListener('transitionend', done); resolve(); };
      timer = setTimeout(done, 6500); // in case transitionend never fires
      wheel.addEventListener('transitionend', done);
      requestAnimationFrame(() => { wheel.style.transform = `rotate(${target}deg)`; });
    });
  }

  // Their member number, under the code (spinning and claiming joins the Collective).
  function renderSpinMember() {
    const m = spin.result?.claimed && collective.member;
    $('#spin-member-text').textContent = m ? `Collective member No. ${m.number}${m.founding ? ' · Founding' : ''}` : '';
    $('#spin-member').classList.toggle('hidden', !m);
    $('#spin-member').classList.toggle('flex', Boolean(m));
  }

  function showSpinStep(step) {
    $$('[data-spin-step]').forEach((el) => { el.hidden = el.dataset.spinStep !== step; });
  }

  function renderSpin() {
    const r = spin.result;
    if (r?.claimed) {
      $('#spin-claimed-title').textContent = r.title;
      $('#spin-code').textContent = r.claimed.code;
      const until = r.claimed.expiresAt
        ? ` Valid until ${new Date(`${r.claimed.expiresAt.replace(' ', 'T')}Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.` : '';
      $('#spin-claimed-note').textContent = `It's in your bag and comes off at checkout.${until} ${spin.note}`.trim();
      renderSpinMember();
      showSpinStep('claimed');
    } else if (r) {
      $('#spin-won-title').textContent = `${r.title.charAt(0).toUpperCase()}${r.title.slice(1)}!`;
      showSpinStep('won');
    } else {
      showSpinStep('intro');
    }
    renderSpinTeaser();
  }

  // The corner tab: shown once the popup has been seen, until a code is claimed.
  function renderSpinTeaser() {
    const r = spin.result;
    const show = spin.slices.length > 0 && !r?.claimed && Boolean(spinMemory().seen) && !$('#spin-overlay').classList.contains('open');
    $('#spin-teaser').hidden = !show;
    const slice = r && spin.slices[r.slice];
    $('#spin-teaser-label').textContent = slice ? `Claim ${slice.big} ${slice.small.split(' ')[0]}` : 'Spin to win';
  }

  function openSpin() {
    rememberSpin({ seen: true });
    renderSpin();
    openOverlay('spin-overlay');
    $('#spin-teaser').hidden = true;
    // Focus the step's main action (Spin, the email field or Copy) for keyboard users; on touch
    // screens that would only pop up the keyboard or draw a focus ring.
    if (!window.matchMedia('(pointer: coarse)').matches) {
      setTimeout(() => $('[data-spin-step]:not([hidden]) #spin-btn, [data-spin-step]:not([hidden]) input, [data-spin-step]:not([hidden]) #spin-copy')?.focus(), 80);
    }
  }

  function spinClosed() {
    if (!spin.result?.claimed) rememberSpin({ dismissedAt: Date.now() });
    renderSpinTeaser();
  }

  $('#spin-teaser').addEventListener('click', openSpin);

  $('#spin-btn').addEventListener('click', async () => {
    if (spin.spinning) return;
    spin.spinning = true;
    const btn = $('#spin-btn');
    btn.disabled = true;
    $('#spin-btn-label').textContent = 'Spinning…';
    try {
      const result = await api('/api/spin', { method: 'POST' });
      await turnWheel(result.slice, true);
      spin.result = result;
      renderSpin();
      if (!window.matchMedia('(pointer: coarse)').matches) $('#spin-form').email.focus();
    } catch (err) {
      toast(err.message);
    } finally {
      spin.spinning = false;
      btn.disabled = false;
      $('#spin-btn-label').textContent = 'Spin the wheel';
    }
  });

  $('#spin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const email = form.email.value.trim();
    const error = $('#spin-error');
    if (!EMAIL_RE.test(email)) { error.textContent = 'Please enter a valid email address.'; return; }
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const claim = await api('/api/spin/claim', { method: 'POST', body: { email } });
      spin.result = { ...spin.result, title: claim.title, claimed: { code: claim.code, expiresAt: claim.expiresAt } };
      spin.note = claim.existing ? 'You already had a code with this email, so here it is again.'
        : claim.emailed ? `We've emailed it to ${email} too.` : 'Copy it somewhere safe in case you shop on another device.';
      error.textContent = '';
      rememberSpin({ claimedAt: Date.now() });
      if (claim.member) {
        const joined = !collective.member;
        collective.member = claim.member;
        if (joined) collective.welcome = 'joined';
        renderCollective(joined);
      }
      renderSpin();
      loadCart();
    } catch (err) {
      error.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  $('#spin-copy').addEventListener('click', async () => {
    const btn = $('#spin-copy');
    try {
      await navigator.clipboard.writeText($('#spin-code').textContent);
      btn.textContent = 'Copied';
    } catch {
      const range = document.createRange();
      range.selectNodeContents($('#spin-code'));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      btn.textContent = 'Selected';
    }
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  });

  async function initSpin() {
    try {
      const data = await api('/api/spin');
      spin.slices = data.slices;
      spin.result = data.result;
    } catch { return; } // no wheel if it can't load
    $('#spin-wheel').innerHTML = wheelSvg(spin.slices);
    $('#spin-wheel').setAttribute('aria-label', `Prize wheel with ${spin.slices.length} deals: ${[...new Set(spin.slices.map((s) => s.title))].join(', ')}`);
    if (spin.result) {
      $('.spin-sway')?.classList.remove('spin-sway');
      turnWheel(spin.result.slice, false);
    }
    renderSpin();
    // Pop up for visitors who haven't claimed a code, unless they closed it in the last week or are
    // just back from paying. If something else is open, wait for it to close.
    const memory = spinMemory();
    const snoozed = memory.dismissedAt && Date.now() - memory.dismissedAt < SPIN_SNOOZE_DAYS * 864e5;
    if (spin.result?.claimed || snoozed || new URLSearchParams(window.location.search).has('checkout')) return;
    let waited = 0;
    const tryOpen = () => {
      if ($('.overlay.open')) {
        waited += 2000;
        if (waited < 60000) setTimeout(tryOpen, 2000);
        return;
      }
      openSpin();
    };
    setTimeout(tryOpen, SPIN_DELAY_MS);
  }

  // ---------- boot ----------

  loadProducts();
  loadCart();
  loadConfig();
  handleCheckoutReturn();
  initSpin();
  initCollective();
  api('/api/auth/me').then(({ user }) => { state.user = user; renderAccount(); }).catch(() => {});
})();
