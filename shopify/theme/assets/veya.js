/* VEYA Shopify theme: bag drawer, colour photos, quick add, home grid filters, product page, search. */
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const cfg = window.veya || { routes: {}, moneyFormat: '${{amount}}', freeShippingCents: 7500 };
  const routes = {
    root: '/', cart: '/cart', cartAdd: '/cart/add', cartChange: '/cart/change', search: '/search',
    predictiveSearch: '/search/suggest', allProducts: '/collections/all', ...cfg.routes,
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- money (Shopify money formats) ----------
  function formatMoney(cents, format = cfg.moneyFormat) {
    const value = Number(cents) / 100;
    const fmt = (n, decimals, thousands = ',', decimal = '.') => {
      const [whole, frac] = n.toFixed(decimals).split('.');
      return whole.replace(/\B(?=(\d{3})+(?!\d))/g, thousands) + (frac ? decimal + frac : '');
    };
    return String(format || '${{amount}}').replace(/\{\{\s*(\w+)\s*\}\}/, (_, kind) => ({
      amount: fmt(value, 2),
      amount_no_decimals: fmt(value, 0),
      amount_with_comma_separator: fmt(value, 2, '.', ','),
      amount_no_decimals_with_comma_separator: fmt(value, 0, '.', ','),
      amount_with_apostrophe_separator: fmt(value, 2, "'", '.'),
      amount_with_space_separator: fmt(value, 2, ' ', ','),
    }[kind] ?? fmt(value, 2)));
  }
  const moneyShort = (cents) => formatMoney(cents).replace(/[.,]00(?=\D*$)/, '');

  // ---------- toast ----------
  let toastTimer;
  function toast(message) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('opacity-0', 'translate-y-4');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('opacity-0', 'translate-y-4'), 2600);
  }

  // ---------- overlays (bag, search, menu) ----------
  let lastFocus = null;
  function openOverlay(id) {
    const el = document.getElementById(id);
    if (!el) return false;
    lastFocus = document.activeElement;
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    const focusable = el.querySelector('input:not([type=hidden]), button:not([data-close]), a[href], [data-close]');
    setTimeout(() => focusable && focusable.focus(), 50);
    if (id === 'bag-overlay') refreshCart();
    return true;
  }
  function closeOverlay(id, restoreFocus = true) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
    if (!$('.overlay.open')) document.body.style.overflow = '';
    if (restoreFocus && lastFocus) lastFocus.focus();
  }
  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-open]');
    if (opener && document.getElementById(opener.dataset.open)) {
      e.preventDefault();
      openOverlay(opener.dataset.open);
      return;
    }
    const closer = e.target.closest('[data-close]');
    const overlay = closer && closer.closest('.overlay');
    if (overlay) closeOverlay(overlay.id, !closer.matches('a'));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = $('.overlay.open');
    if (open) closeOverlay(open.id);
    $$('[data-quick-sizes].open').forEach((p) => closeQuick(p.closest('[data-product-card]')));
  });

  // The announcement bar shows its messages twice for a seamless loop; the copy isn't focusable.
  $$('[data-ticker-copy] a').forEach((a) => a.setAttribute('tabindex', '-1'));

  // ---------- bag (Shopify AJAX cart) ----------
  async function cartFetch(url, body) {
    const res = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.description || data.message || 'Something went wrong. Please try again.');
    return data;
  }

  function renderCart(cart) {
    $$('#bag-count').forEach((el) => { el.textContent = `Bag (${cart.item_count})`; });
    const list = $('#bag-items');
    if (!list) return;
    list.innerHTML = cart.items.length ? cart.items.map((item) => `
      <div class="flex gap-4" data-line="${esc(item.key)}">
        <a href="${esc(item.url)}" class="shrink-0">
          ${item.image ? `<img src="${esc(item.image)}" alt="" class="w-20 h-24 object-cover rounded" width="80" height="96" loading="lazy">` : '<div class="w-20 h-24 rounded bg-surface-container"></div>'}
        </a>
        <div class="flex-grow min-w-0">
          <div class="flex justify-between gap-2">
            <a href="${esc(item.url)}" class="font-headline-sm text-[15px] text-primary truncate">${esc(item.product_title)}</a>
            <span class="font-label-md text-primary whitespace-nowrap">${formatMoney(item.final_line_price)}</span>
          </div>
          ${item.product_has_only_default_variant ? '' : `<p class="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest mt-1">${esc(item.variant_title || '')}</p>`}
          <div class="flex items-center justify-between mt-3">
            <div class="flex items-center rounded-full border border-outline-variant/40 h-9">
              <button type="button" data-qty="${item.quantity - 1}" aria-label="Decrease quantity" class="w-8 h-full flex items-center justify-center text-primary hover:text-secondary"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">remove</span></button>
              <span class="w-6 text-center font-label-md text-primary">${item.quantity}</span>
              <button type="button" data-qty="${item.quantity + 1}" aria-label="Increase quantity" class="w-8 h-full flex items-center justify-center text-primary hover:text-secondary" ${item.quantity >= 10 ? 'disabled' : ''}><span class="material-symbols-outlined text-[16px]" aria-hidden="true">add</span></button>
            </div>
            <button type="button" data-qty="0" class="font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant hover:text-error">Remove</button>
          </div>
        </div>
      </div>`).join('') : `
      <div class="h-full flex flex-col items-center justify-center text-center gap-4 py-16">
        <span class="material-symbols-outlined text-[40px] text-outline" aria-hidden="true">shopping_bag</span>
        <p class="font-body-md text-on-surface-variant">Your bag is empty.</p>
        <a href="${esc(routes.allProducts)}" data-close class="font-label-md text-secondary uppercase tracking-widest hover:underline">Start shopping</a>
      </div>`;
    const subtotal = $('#bag-subtotal');
    if (subtotal) subtotal.textContent = formatMoney(cart.total_price);
    const checkout = $('#checkout-btn');
    if (checkout) checkout.disabled = cart.item_count === 0;
    const note = $('#bag-shipping-note');
    const bar = $('#bag-shipping-bar');
    const threshold = Number(cfg.freeShippingCents) || 0;
    if (note && threshold > 0) {
      const left = threshold - cart.total_price;
      note.textContent = cart.item_count === 0 ? `Free shipping on orders over ${moneyShort(threshold)}`
        : left > 0 ? `You're ${formatMoney(left)} away from free shipping` : 'You have free shipping';
      if (bar) bar.style.width = `${Math.min(100, Math.round((cart.total_price / threshold) * 100))}%`;
    }
  }

  async function refreshCart() {
    try { renderCart(await cartFetch(`${routes.cart}.js`)); } catch (err) { /* keep server-rendered state */ }
  }

  async function addToBag(variantId, quantity = 1, errorEl) {
    try {
      await cartFetch(`${routes.cartAdd}.js`, { items: [{ id: Number(variantId), quantity: Number(quantity) || 1 }] });
      await refreshCart();
      openOverlay('bag-overlay');
      return true;
    } catch (err) {
      if (errorEl) errorEl.textContent = err.message; else toast(err.message);
      return false;
    }
  }

  $('#bag-items')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-qty]');
    if (!btn) return;
    const line = btn.closest('[data-line]');
    btn.disabled = true;
    try {
      renderCart(await cartFetch(`${routes.cartChange}.js`, { id: line.dataset.line, quantity: Number(btn.dataset.qty) }));
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
    }
  });

  // ---------- product data (colours, photos, variants) ----------
  const productData = (root) => {
    const el = root && root.querySelector('[data-product-json]');
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (err) { return null; }
  };
  const colorInfo = (data, name) => (data.colors || []).find((c) => c.name === name) || {};
  const variantFor = (data, color, size) => (data.variants || []).find((v) =>
    (data.colors.length === 0 || v.color === color) && (size === undefined || v.size === size));
  function setImage(img, url) {
    if (!img || !url) return;
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    img.src = url;
  }

  // ---------- product cards: colour swatches + quick add ----------
  function cardColor(card, data) {
    return card.dataset.color || (data.colors[0] && data.colors[0].name);
  }
  function closeQuick(card) {
    if (!card) return;
    $('[data-quick-sizes]', card)?.classList.remove('open');
    $('[data-quick-open]', card)?.setAttribute('aria-expanded', 'false');
  }
  function openQuick(card, data) {
    const color = cardColor(card, data);
    $$('[data-quick-size]', card).forEach((b) => {
      const v = variantFor(data, color, b.dataset.quickSize || undefined);
      b.disabled = !v || !v.available;
    });
    $('[data-quick-sizes]', card)?.classList.add('open');
    $('[data-quick-open]', card)?.setAttribute('aria-expanded', 'true');
  }

  document.addEventListener('click', async (e) => {
    const card = e.target.closest('[data-product-card]');
    if (!card) return;
    const swatch = e.target.closest('[data-swatch]');
    const quickOpen = e.target.closest('[data-quick-open]');
    const quickClose = e.target.closest('[data-quick-close]');
    const quickSize = e.target.closest('[data-quick-size]');
    if (!swatch && !quickOpen && !quickClose && !quickSize) return;
    e.preventDefault();
    const data = productData(card);
    if (!data) return;
    if (swatch) {
      const color = swatch.dataset.swatch;
      card.dataset.color = color;
      $$('[data-swatch]', card).forEach((s) => {
        s.classList.toggle('swatch-active', s === swatch);
        s.setAttribute('aria-pressed', String(s === swatch));
      });
      const info = colorInfo(data, color);
      setImage($('.js-card-image', card), info.image);
      setImage($('.js-card-model', card), info.model);
      const v = variantFor(data, color);
      card.querySelectorAll('a[href]').forEach((a) => {
        if (v && a.getAttribute('href').split('?')[0] === data.url) a.setAttribute('href', `${data.url}?variant=${v.id}`);
      });
      if ($('[data-quick-sizes]', card)?.classList.contains('open')) openQuick(card, data);
      return;
    }
    if (quickOpen) { openQuick(card, data); return; }
    if (quickClose) { closeQuick(card); return; }
    if (quickSize) {
      const v = variantFor(data, cardColor(card, data), quickSize.dataset.quickSize || undefined);
      if (!v || !v.available) return;
      quickSize.disabled = true;
      const ok = await addToBag(v.id, 1);
      quickSize.disabled = false;
      if (ok) closeQuick(card);
    }
  });

  // ---------- home page grid: Men / Women tabs, category chips, sorting ----------
  const grid = $('[data-product-grid]');
  if (grid) {
    const track = $('#product-track', grid);
    const cards = $$('[data-product-card]', track);
    const state = { gender: 'all', filter: 'all', sort: 'featured' };
    const CATEGORY = { all: 'Shop All', tops: 'Tops', layers: 'Layers', bottoms: 'Bottoms' };
    const GENDER = { men: "Men's", women: "Women's" };
    const matches = (card) => (state.gender === 'all' || card.dataset.gender === state.gender || card.dataset.gender === 'unisex')
      && (state.filter === 'all' || card.dataset.category === state.filter);

    function render() {
      const visible = cards.filter(matches);
      const sorted = [...visible].sort((a, b) => {
        if (state.sort === 'price-asc') return a.dataset.price - b.dataset.price;
        if (state.sort === 'price-desc') return b.dataset.price - a.dataset.price;
        if (state.sort === 'name') return a.dataset.title.localeCompare(b.dataset.title);
        return a.dataset.index - b.dataset.index;
      }).sort((a, b) => Number(b.dataset.available === 'true') - Number(a.dataset.available === 'true'));
      cards.forEach((c) => c.classList.toggle('hidden', !visible.includes(c)));
      sorted.forEach((c) => track.appendChild(c));
      $('#grid-empty', grid)?.classList.toggle('hidden', visible.length > 0);
      const g = GENDER[state.gender];
      $('#collection-title', grid).textContent = g
        ? `${g} ${state.filter === 'all' ? 'Collection' : CATEGORY[state.filter]}`
        : CATEGORY[state.filter];
      $('#result-count', grid).textContent = `${visible.length} ${visible.length === 1 ? 'item' : 'items'}`;
      $$('[data-chip]', grid).forEach((c) => c.classList.toggle('chip-active', c.dataset.chip === state.filter));
      $$('[data-gender-tab]', grid).forEach((t) => {
        const on = t.dataset.genderTab === state.gender;
        t.classList.toggle('chip-active', on);
        t.setAttribute('aria-selected', String(on));
      });
      $$('header .nav-link').forEach((a) => {
        const on = a.dataset.navGender === state.gender && a.dataset.navFilter === state.filter;
        a.classList.toggle('text-primary', on);
        a.classList.toggle('border-secondary', on);
        a.classList.toggle('border-transparent', !on);
      });
    }
    function setFilter({ gender = state.gender, filter = state.filter } = {}, scroll = false) {
      state.gender = gender;
      state.filter = filter;
      render();
      if (scroll) grid.scrollIntoView({ behavior: 'smooth' });
    }

    grid.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-gender-tab]');
      if (tab) setFilter({ gender: tab.dataset.genderTab });
      const chip = e.target.closest('[data-chip]');
      if (chip) setFilter({ filter: chip.dataset.chip });
    });
    $('#sort-select', grid)?.addEventListener('change', (e) => { state.sort = e.target.value; render(); });
    // On the home page, Men / Women / category links filter this grid instead of leaving the page.
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-nav-gender]');
      if (!link || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      const overlay = link.closest('.overlay');
      if (overlay) closeOverlay(overlay.id, false);
      setFilter({ gender: link.dataset.navGender, filter: link.dataset.navFilter || 'all' }, true);
    });
    const params = new URLSearchParams(location.search);
    setFilter({
      gender: ['men', 'women'].includes(params.get('gender')) ? params.get('gender') : 'all',
      filter: ['tops', 'layers', 'bottoms'].includes(params.get('category')) ? params.get('category') : 'all',
    });
  }

  // ---------- collection page sorting ----------
  $('[data-collection-sort]')?.addEventListener('change', (e) => {
    const url = new URL(location.href);
    url.searchParams.set('sort_by', e.target.value);
    url.searchParams.delete('page');
    location.href = url.toString();
  });

  // ---------- product page ----------
  const page = $('[data-product-page]');
  if (page) {
    const data = productData(page);
    const form = $('#product-form', page);
    const idInput = $('#pd-variant-id', page);
    const errorEl = $('#pd-error', page);
    const qtyInput = $('#pd-qty', page);
    const initial = (data.variants || []).find((v) => String(v.id) === idInput.value) || data.variants[0];
    const sizeButtons = $$('[data-pd-size]', page);
    const state = {
      color: initial ? initial.color : null,
      // Only preselect a size when there is a single one (e.g. one-size items).
      size: sizeButtons.length <= 1 ? (initial ? initial.size : undefined) : (new URLSearchParams(location.search).get('variant') ? initial.size : null),
      photo: 0,
    };

    function renderPhotos() {
      const info = colorInfo(data, state.color);
      const shots = [info.image, info.model].filter(Boolean);
      const main = $('.js-pd-image', page);
      if (shots.length) setImage(main, shots[Math.min(state.photo, shots.length - 1)]);
      if (main) main.alt = `${data.title}${state.color ? ` in ${state.color}` : ''}`;
      $$('[data-pd-photo]', page).forEach((b) => {
        const i = Number(b.dataset.pdPhoto);
        b.hidden = !shots[i];
        setImage($('img', b), shots[i]);
        const on = i === Math.min(state.photo, shots.length - 1);
        b.setAttribute('aria-pressed', String(on));
        b.classList.toggle('border-secondary', on);
        b.classList.toggle('border-outline-variant/40', !on);
        b.classList.toggle('opacity-70', !on);
      });
    }

    function render() {
      const nameEl = $('#pd-color-name', page);
      if (nameEl) nameEl.textContent = state.color || '';
      $$('[data-pd-color]', page).forEach((b) => {
        const on = b.dataset.pdColor === state.color;
        b.classList.toggle('swatch-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      sizeButtons.forEach((b) => {
        const v = variantFor(data, state.color, b.dataset.pdSize);
        const on = b.dataset.pdSize === state.size;
        b.disabled = !v || !v.available;
        b.setAttribute('aria-pressed', String(on));
        b.classList.toggle('border-secondary', on);
        b.classList.toggle('text-secondary', on);
        b.classList.toggle('bg-surface-container', on);
        b.classList.toggle('border-outline-variant/40', !on);
      });
      const variant = state.size != null ? variantFor(data, state.color, state.size) : variantFor(data, state.color);
      if (variant) {
        idInput.value = variant.id;
        $('#pd-price', page).textContent = variant.available ? formatMoney(variant.price) : 'SOLD OUT';
        if (state.size != null) {
          const url = new URL(location.href);
          url.searchParams.set('variant', variant.id);
          history.replaceState(null, '', url.toString());
        }
      }
      const add = $('#pd-add', page);
      if (add) add.disabled = !!variant && !variant.available && state.size != null;
      // Express checkout buys whatever is in the form, so it stays locked until a real size is picked.
      const express = $('[data-express-checkout]', page);
      if (express) {
        const locked = needsSize() || (!!variant && !variant.available);
        express.classList.toggle('opacity-40', locked);
        $('[data-express-guard]', express).hidden = !locked;
      }
      renderPhotos();
    }
    const needsSize = () => sizeButtons.length > 1 && state.size == null;

    page.addEventListener('click', (e) => {
      const color = e.target.closest('[data-pd-color]');
      const size = e.target.closest('[data-pd-size]');
      const photo = e.target.closest('[data-pd-photo]');
      if (color) { state.color = color.dataset.pdColor; render(); }
      if (size && !size.disabled) { state.size = size.dataset.pdSize; errorEl.textContent = ''; render(); }
      if (photo) { state.photo = Number(photo.dataset.pdPhoto); renderPhotos(); }
      if (e.target.closest('[data-express-guard]')) {
        errorEl.textContent = needsSize() ? 'Please choose a size.' : 'That size is sold out in this colour.';
      }
    });
    $('#pd-minus', page)?.addEventListener('click', () => { qtyInput.value = Math.max(1, Number(qtyInput.value) - 1); });
    $('#pd-plus', page)?.addEventListener('click', () => { qtyInput.value = Math.min(10, Number(qtyInput.value) + 1); });
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (sizeButtons.length > 1 && state.size == null) { errorEl.textContent = 'Please choose a size.'; return; }
      const add = $('#pd-add', page);
      add.disabled = true;
      await addToBag(idInput.value, qtyInput.value, errorEl);
      add.disabled = false;
    });
    render();
  }

  // ---------- "Complete the look" recommendations ----------
  const recs = $('[data-recommendations]');
  if (recs && recs.dataset.url && !recs.children.length) {
    fetch(recs.dataset.url).then((r) => r.text()).then((html) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const fresh = doc.querySelector('[data-recommendations]');
      if (fresh && fresh.innerHTML.trim()) recs.innerHTML = fresh.innerHTML;
    }).catch(() => {});
  }

  // ---------- predictive search ----------
  const searchInput = $('#search-input');
  const searchBox = $('#search-results');
  let searchTimer;
  let searchSeq = 0;
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const q = searchInput.value.trim();
      const seq = ++searchSeq;
      if (!q) {
        searchBox.innerHTML = '<p class="px-3 py-2 font-label-sm text-on-surface-variant uppercase tracking-widest">Try “quarter-zip”, “leggings” or “matching set”</p>';
        return;
      }
      try {
        const res = await fetch(`${routes.predictiveSearch}.json?q=${encodeURIComponent(q)}&resources[type]=product&resources[limit]=6`);
        const data = await res.json();
        if (seq !== searchSeq) return;
        const products = data.resources?.results?.products || [];
        searchBox.innerHTML = products.length ? products.map((p) => `
          <a href="${esc(p.url)}" class="w-full flex items-center gap-4 p-2 rounded-lg hover:bg-surface-container text-left">
            ${p.image ? `<img src="${esc(p.image)}" alt="" class="w-12 h-14 object-cover rounded" loading="lazy">` : ''}
            <span class="flex-grow">
              <span class="block font-label-sm text-secondary uppercase tracking-widest">${esc(p.type || '')}</span>
              <span class="block font-headline-sm text-[15px] text-primary">${esc(p.title)}</span>
            </span>
            <span class="font-label-md text-primary">${p.price ? formatMoney(Math.round(parseFloat(p.price) * 100)) : ''}</span>
          </a>`).join('') + `<a href="${esc(routes.search)}?q=${encodeURIComponent(q)}&type=product" class="block px-3 py-3 font-label-md text-secondary uppercase tracking-widest hover:underline">See all results</a>`
          : `<p class="px-3 py-2 font-body-md text-on-surface-variant">No pieces match “${esc(q)}”.</p>`;
      } catch (err) {
        searchBox.innerHTML = '<p class="px-3 py-2 font-body-md text-on-surface-variant">Press Enter to search.</p>';
      }
    }, 180);
  });

  // ---------- fabrics ----------
  $$('[data-fabrics]').forEach((section) => {
    section.addEventListener('click', (e) => {
      const card = e.target.closest('[data-fabric]');
      if (!card) return;
      $$('[data-fabric]', section).forEach((c) => {
        const on = c === card;
        c.setAttribute('aria-pressed', String(on));
        c.classList.toggle('border-secondary/40', on);
        c.classList.toggle('bg-surface-container/60', on);
        c.classList.toggle('border-outline-variant/30', !on);
        c.classList.toggle('bg-surface-container-low/40', !on);
      });
      $('#hud-specimen', section).textContent = `SPECIMEN: ${card.dataset.specimen}`;
      $('#hud-metric', section).textContent = card.dataset.metric;
      $('#hud-focus-title', section).textContent = card.dataset.focusTitle;
      $('#hud-focus-text', section).textContent = card.dataset.focusText;
    });
  });

  // Keep the bag count right when coming back with the browser's back button.
  window.addEventListener('pageshow', (e) => { if (e.persisted) refreshCart(); });
  window.VEYA = { refreshCart, addToBag, formatMoney, openOverlay, closeOverlay };
})();
