// VEYA front-end: connects the Stitch design to the /api backend.
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const state = {
    products: [],
    filter: 'all',
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

  function productCard(p) {
    const selected = state.cardColors[p.id] || p.colors[0].name;
    const swatches = p.colors.map((c) => `
      <button type="button" class="swatch w-3 h-3 rounded-full border border-outline-variant ${c.name === selected ? 'swatch-active' : ''}"
        style="background:${esc(c.hex)}" title="${esc(c.name)}" aria-label="${esc(c.name)}" data-swatch="${esc(c.name)}"></button>`).join('');
    return `
      <div class="product-card snap-start shrink-0 w-[82%] sm:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-4.5rem)/4)] group flex flex-col bg-surface-container-low rounded-xl border border-outline-variant/20 overflow-hidden hover:border-outline-variant/60 transition-all duration-300" data-product="${esc(p.id)}">
        <div class="relative aspect-[4/5] bg-surface-container-lowest overflow-hidden cursor-pointer" data-open-product>
          <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy"/>
          <div class="absolute top-3 left-3">
            <span class="font-label-sm px-2 py-0.5 rounded bg-surface-container-lowest/80 border border-outline-variant/30 text-on-surface-variant uppercase">${esc(p.tempRange)}</span>
          </div>
          <button type="button" data-quick-add aria-label="Add ${esc(p.name)} to bag" class="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-surface-container-lowest/90 border border-outline-variant/40 flex items-center justify-center text-primary hover:bg-secondary hover:text-surface-container-lowest transition-colors duration-200 ${p.inStock ? '' : 'hidden'}">
            <span class="material-symbols-outlined text-[18px]">add</span>
          </button>
        </div>
        <div class="p-5 flex flex-col justify-between flex-grow">
          <div class="cursor-pointer" data-open-product>
            <span class="font-label-sm text-secondary uppercase tracking-widest block mb-1">${esc(p.tagline)}</span>
            <h3 class="font-headline-sm text-headline-sm text-primary mb-1">${esc(p.name)}</h3>
            <p class="font-label-md text-on-surface-variant font-normal">${esc(p.material)}</p>
          </div>
          <div class="mt-4 pt-3 border-t border-outline-variant/20 flex items-center justify-between">
            <span class="font-label-md text-primary">${p.inStock ? `${money(p.price)} USD` : 'SOLD OUT'}</span>
            <div class="flex items-center gap-1.5">${swatches}</div>
          </div>
        </div>
      </div>`;
  }

  function renderProducts() {
    const track = $('#product-track');
    const list = state.filter === 'all' ? state.products : state.products.filter((p) => p.category === state.filter);
    track.innerHTML = list.length
      ? list.map(productCard).join('')
      : '<p class="font-label-md text-on-surface-variant">NO PIECES IN THIS SYSTEM YET.</p>';
    track.scrollLeft = 0;
    $$('#filter-chips .chip').forEach((c) => c.classList.toggle('chip-active', c.dataset.chip === state.filter));
    $$('.nav-link').forEach((a) => {
      const active = a.dataset.filter === state.filter;
      a.classList.toggle('text-primary', active);
      a.classList.toggle('border-secondary', active);
      a.classList.toggle('border-transparent', !active);
      a.classList.toggle('text-on-surface-variant', !active);
    });
  }

  function setFilter(filter, { scroll = true } = {}) {
    state.filter = filter;
    renderProducts();
    if (scroll) $('#collections').scrollIntoView({ behavior: 'smooth' });
  }

  async function loadProducts() {
    try {
      state.products = await api('/api/products');
      renderProducts();
    } catch (err) {
      $('#product-track').innerHTML = `<p class="font-label-md text-error">${esc(err.message)}</p>`;
    }
  }

  // Filter triggers: nav links, spectrum cards, hero CTA, chips.
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-filter]');
    if (trigger) {
      e.preventDefault();
      setFilter(trigger.dataset.filter);
    }
    const chip = e.target.closest('[data-chip]');
    if (chip) setFilter(chip.dataset.chip, { scroll: false });
  });
  $$('[data-filter][role=button]').forEach((el) => el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFilter(el.dataset.filter); }
  }));

  // Carousel arrows scroll the product track one card at a time.
  function scrollTrack(dir) {
    const track = $('#product-track');
    const card = $('.product-card', track);
    const step = card ? card.getBoundingClientRect().width + 24 : track.clientWidth;
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    const atStart = track.scrollLeft <= 4;
    if (dir > 0 && atEnd) track.scrollTo({ left: 0, behavior: 'smooth' });
    else if (dir < 0 && atStart) track.scrollTo({ left: track.scrollWidth, behavior: 'smooth' });
    else track.scrollBy({ left: dir * step, behavior: 'smooth' });
  }
  $('#prev-btn').addEventListener('click', () => scrollTrack(-1));
  $('#next-btn').addEventListener('click', () => scrollTrack(1));

  // Product card interactions.
  $('#product-track').addEventListener('click', async (e) => {
    const card = e.target.closest('[data-product]');
    if (!card) return;
    const product = state.products.find((p) => p.id === card.dataset.product);
    const swatch = e.target.closest('[data-swatch]');
    if (swatch) {
      state.cardColors[product.id] = swatch.dataset.swatch;
      $$('[data-swatch]', card).forEach((s) => s.classList.toggle('swatch-active', s === swatch));
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
    $('#pd-image').src = product.image;
    $('#pd-image').alt = product.name;
    $('#pd-temp').textContent = product.tempRange;
    $('#pd-tagline').textContent = product.tagline;
    $('#pd-name').textContent = product.name;
    $('#pd-material').textContent = product.material;
    $('#pd-price').textContent = product.inStock ? `${money(product.price)} USD` : 'SOLD OUT';
    $('#pd-description').textContent = product.description;
    $('#pd-error').textContent = '';
    $('#pd-add').disabled = !product.inStock;
    renderDetail();
    openOverlay('product-overlay');
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
    const c = e.target.closest('[data-pd-color]');
    const s = e.target.closest('[data-pd-size]');
    if (c) state.detail.color = c.dataset.pdColor;
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
    $('#bag-shipping').textContent = cart.count ? (cart.shipping ? money(cart.shipping) : 'Complimentary') : '—';
    $('#bag-total').textContent = money(cart.total);
    $('#checkout-total').textContent = money(cart.total);
    $('#checkout-btn').disabled = cart.count === 0;
    const remaining = cart.freeShippingThreshold - cart.subtotal;
    $('#bag-shipping-note').textContent = !cart.count ? ''
      : remaining > 0 ? `${money(remaining)} away from complimentary shipping` : 'Complimentary express shipping unlocked';

    $('#bag-items').innerHTML = cart.items.length ? cart.items.map((i) => `
      <div class="flex gap-4 p-3 rounded-lg border border-outline-variant/20 bg-surface-container-lowest/50" data-item="${i.id}">
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
          <button type="button" data-close data-filter="all" class="font-label-md text-secondary uppercase tracking-widest hover:underline">Explore the collection</button>
        </div>`;
  }

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
    const id = row.dataset.item;
    try {
      const qtyBtn = e.target.closest('[data-qty]');
      if (qtyBtn) state.cart = await api(`/api/cart/${id}`, { method: 'PATCH', body: { qty: Number(qtyBtn.dataset.qty) } });
      else if (e.target.closest('[data-remove]')) state.cart = await api(`/api/cart/${id}`, { method: 'DELETE' });
      else return;
      renderBag();
    } catch (err) { toast(err.message); }
  });

  // ---------- checkout ----------

  $('#checkout-btn').addEventListener('click', () => {
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
      form.reset();
      form.classList.add('hidden');
      $('#checkout-title').textContent = 'Thank You';
      $('#success-number').textContent = order.number;
      $('#success-email').textContent = order.email;
      $('#checkout-success').classList.remove('hidden');
      await Promise.all([loadCart(), loadProducts()]);
    } catch (err) {
      $('#checkout-error').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

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

  let searchTimer;
  $('#search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderSearch(e.target.value.trim()), 150);
  });

  async function renderSearch(q) {
    const box = $('#search-results');
    if (!q) {
      box.innerHTML = '<p class="px-3 py-2 font-label-sm text-on-surface-variant uppercase tracking-widest">Try “merino”, “shell” or “transit”</p>';
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

  // ---------- hero environment pills ----------

  $$('.env-pill').forEach((pill) => pill.addEventListener('click', async () => {
    $$('.env-pill').forEach((p) => p.classList.toggle('chip-active', p === pill));
    try {
      const env = await api(`/api/environments/${pill.dataset.env}`);
      $('#telemetry-label').textContent = env.label;
      $('#telemetry-reading').textContent = env.reading;
      setFilter(env.category, { scroll: false });
    } catch (err) { toast(err.message); }
  }));

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

  // ---------- VIP club ----------

  $('#vip-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const msg = $('#vip-message');
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const res = await api('/api/subscribe', { method: 'POST', body: { email: form.email.value } });
      msg.classList.replace('text-error', 'text-secondary');
      msg.textContent = res.message.toUpperCase();
      form.reset();
    } catch (err) {
      msg.classList.replace('text-secondary', 'text-error');
      msg.textContent = err.message.toUpperCase();
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- boot ----------

  loadProducts();
  loadCart();
  api('/api/auth/me').then(({ user }) => { state.user = user; renderAccount(); }).catch(() => {});
})();
