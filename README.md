# VEYA — Everyday Essentials

Online clothing store for VEYA: heavyweight tees, hoodies and everyday layers, made to order.
It is built on the **VEYA Active Luxury UI** design from Google Stitch (project `11128318004927957051`).

It can run three ways:

- **Shopify theme (recommended):** upload `shopify/veya-shopify-theme.zip` as your Shopify theme and import
  `shopify/veya-products.csv`; the whole store then runs on Shopify. Step-by-step guide:
  [shopify/README.md](shopify/README.md).
- **Headless Shopify mode:** host this site yourself (e.g. Render), connect a Shopify store and it becomes the source of products,
  the bag and checkout. Install a print-on-demand app such as **Printful** or **Printify** in
  Shopify and every paid order is printed and shipped automatically. See
  [Shopify + print-on-demand](#shopify--print-on-demand).
- **Built-in mode:** with no Shopify store connected, a small Node/Express + SQLite backend runs
  the catalog, bag, checkout (demo or Stripe), accounts and an admin dashboard on its own.

## Run it

```bash
npm install
npm start            # http://localhost:3000
```

Requires **Node 22.13+**, which has SQLite built in (no database server to install).
Data is stored in `data/veya.db`, which is created and seeded with the catalog on first boot.

| Env var       | Default          | Purpose                                              |
| ------------- | ---------------- | ---------------------------------------------------- |
| `PORT`        | `3000`           | HTTP port                                            |
| `DB_FILE`     | `data/veya.db`   | SQLite file location (point at a persistent disk)    |
| `ADMIN_TOKEN` | _(unset)_        | Enables the admin dashboard at `/admin`              |
| `NODE_ENV`    | —                | Set to `production` for secure (HTTPS-only) cookies  |
| `STRIPE_SECRET_KEY` | _(unset)_  | Turns on real card payments via Stripe Checkout      |
| `STRIPE_WEBHOOK_SECRET` | _(unset)_ | Verifies Stripe webhook calls                     |
| `PUBLIC_URL`  | _(auto)_         | Site address used in Stripe return links (set automatically on Render) |
| `SHOPIFY_STORE_DOMAIN` | _(unset)_ | Your store, e.g. `veya.myshopify.com`. Turns on Shopify mode (`mock.shop` = Shopify's demo store) |
| `SHOPIFY_STOREFRONT_TOKEN` | _(unset)_ | Public Storefront API access token from Shopify's Headless channel |
| `SHOPIFY_API_VERSION` | `2026-10` | Storefront API version |
| `RESEND_API_KEY` | _(unset)_ | Turns on newsletter sending through [Resend](https://resend.com) |
| `EMAIL_FROM` | _(unset)_ | Sender, e.g. `VEYA <news@yourdomain.com>` (domain verified in Resend) |
| `MAILING_ADDRESS` | _(unset)_ | Your business postal address, printed in every newsletter (legally required) |
| `EMAIL_REPLY_TO` | _(unset)_ | Optional reply-to address for newsletters |

## Shopify + print-on-demand

How it fits together:

```
Printful / Printify  ──sync products──▶  Shopify  ◀──Storefront API──  this site
        ▲                                   │
        └──────── paid orders are sent ─────┘   (printed, packed and shipped for you)
```

1. **Create products with your POD app.** In Shopify, install Printful or Printify, design your
   tees, hoodies and so on, and publish them to Shopify. Give each product **Size** and **Color**
   options so the size and colour pickers on the site work.
2. **Get a Storefront API token.** In Shopify admin, install the **Headless** sales channel, create a
   storefront and copy its **public access token**. Make sure your products are published to the
   Headless channel.
3. **Connect the site.** Set `SHOPIFY_STORE_DOMAIN` (for example `veya.myshopify.com`) and
   `SHOPIFY_STOREFRONT_TOKEN`, then restart. Products, prices, sizes, colours, stock and photos now
   come from Shopify, refreshed every minute.
4. **Checkout.** The bag is a real Shopify cart, and the Checkout button sends customers to Shopify's
   checkout. Shopify handles payment, shipping rates, tax and discount codes, and emails the
   confirmation and tracking. Configure free-shipping rules and payment methods in Shopify; Stripe
   is not needed in this mode.

Optional product tags to control how products appear:

| Tag | Effect |
| --- | --- |
| `category:tops`, `category:layers`, `category:bottoms` | Puts the product in that category. Without one, it is matched from the product type or title (tee, shirt → Tops; hoodie, jacket → Layers; pants, shorts → Bottoms). |
| `gender:men`, `gender:women`, `gender:unisex` | Puts the product in the Men or Women section. Without one, "Men's" / "Women's" in the title, product type or tags is used; anything else is unisex and shows in both sections. |
| `badge:New`, `badge:Best Seller` (or the tags `new`, `best seller`) | Badge on the product photo |
| `material:6.5oz Combed Cotton` | Fabric line under the product name |

To try Shopify mode without a store, use Shopify's public demo store:

```bash
SHOPIFY_STORE_DOMAIN=mock.shop npm start
```

## What works

| Element                                       | Behaviour                                                        |
| --------------------------------------------- | ---------------------------------------------------------------- |
| Nav: Shop All / Tops / Layers / Bottoms       | Filters the product grid and scrolls to it                       |
| Nav: Fabrics, Help                            | Scrolls to the fabrics section / opens Shipping & Returns        |
| Search icon                                   | Live product search, opens the product on click                 |
| Account                                       | Sign in / create account, order history, sign out (Shopify mode links to the Shopify account page for orders) |
| Bag (n)                                       | Bag drawer: change quantity, remove items, see totals, check out |
| Shop New Arrivals / Find Your Size            | Scroll to the grid / open the size guide                         |
| Shop by category cards                        | Filter the grid; show live style counts and starting prices      |
| Filter chips / sort menu                      | Filter by category; sort by featured, price or name              |
| Fabric cards                                  | Select a fabric and update the detail panel                      |
| Footer links                                  | Category filters and Help pages (shipping & returns, size guide, fabrics & care, privacy) |
| Product “+”, colour swatches                  | Quick-add in the chosen colour                                   |
| Product image / name                          | Product detail: colour, size, quantity, size guide, Add to Bag   |
| Checkout                                      | Shopify mode: Shopify checkout. Built-in mode: shipping form → order saved (demo or Stripe) |
| Sign Up                                       | Joins the mailing list (no duplicate sign-ups)                   |
| Spin to win popup                             | New visitors spin a prize wheel; their email unlocks a discount code that goes on their bag |
| Bag → Have a discount code?                   | Apply or remove a code; the discount shows in the bag and checkout totals |
| Mobile menu (☰)                               | Nav for small screens                                            |

In built-in mode, prices, stock and totals are always calculated on the server. Shipping is $6, or
free over $75.

## Payments in built-in mode (Stripe)

This applies only when Shopify is not connected. Without `STRIPE_SECRET_KEY` the store runs in **demo mode**: orders are saved but no card is charged.

With a key set, checkout sends the customer to Stripe's hosted payment page. The order is saved
as `pending_payment`. Stock is only taken, and the bag only emptied, once Stripe confirms payment.
That confirmation arrives on the return redirect or via webhook, whichever comes first, and is
never applied twice. Abandoned payments are cancelled when Stripe expires the session, and the
customer keeps their bag.

1. In the [Stripe dashboard](https://dashboard.stripe.com/apikeys), copy the **secret key**
   (`sk_test_…` while testing, `sk_live_…` to take real money) into `STRIPE_SECRET_KEY`.
2. Under **Developers → Webhooks**, add the endpoint `https://YOUR-SITE/api/stripe/webhook` with events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed` and `checkout.session.expired`. Copy its signing secret
   (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`.
3. In test mode, pay with card `4242 4242 4242 4242`, any future expiry date and any CVC.

## Deploy

**Render (recommended):** in Render choose **New → Blueprint** and pick this repository. `render.yaml`
sets up the web service with a persistent disk for the database and generates an `ADMIN_TOKEN`. It
will ask for your Shopify and Stripe settings; leave them blank to launch the built-in store in demo mode. The admin token is
under the service's **Environment** tab.

**Anywhere with Docker:**

```bash
docker build -t veya .
docker run -p 3000:3000 -v veya-data:/data -e ADMIN_TOKEN=change-me veya
```

Keep the database (`DB_FILE`) on persistent storage, or orders and accounts are lost on redeploy.

## Spin to win

A few seconds after a new visitor arrives, a prize wheel pops up. Every slice is a real deal, from
10% off up to 25% off, $5 off, $10 off orders of $60 or more, and free shipping. The visitor spins, then
enters their email to unlock their code:

- **The server decides where the wheel lands**, using each slice's chance in `discounts.js`. Bigger deals
  come up less often (25% off is 4 spins in 100). Reloading the page can't re-spin.
- **Each winner gets their own code**, like `SPIN15-7KQ2M`. It works once, lasts 14 days, and each email
  gets one. It's added to their bag straight away, and the bag, checkout and Stripe all charge the
  discounted total.
- **Their email joins your list**, and the code is emailed to them when email sending is set up (see below).
- **Someone who closes it** gets a small "Spin to win" tab in the corner, and the popup stays away for a week.
- **`/admin` → Spin to win** shows every code, who won it and whether it's been used.

Change the deals, their odds or the wheel's labels in `discounts.js`. In Shopify mode, winners get
each deal's shared Shopify code instead (`SPIN10`, `SPIN15`, …). Create those in Shopify as described
in [shopify/README.md](shopify/README.md), step 11b.

## Admin

Set `ADMIN_TOKEN`, open `/admin` and enter the token. From there you can view orders and change
their status, edit stock levels, see spin-to-win codes, email your subscribers and download the
subscriber list.

## Emailing subscribers

Everyone who signs up with the newsletter form ("Join the list") is stored as a subscriber. In
`/admin` → **Email your subscribers**:

1. Write a subject and message (leave a blank line between paragraphs).
2. **Preview** shows the branded email. **Send test to me** sends one copy to you.
3. **Send to all subscribers** asks you to confirm, then sends in the background. Progress and
   results appear under **Sent emails**.

Every email includes a personal one-click **unsubscribe link** and your **mailing address**, which
US anti-spam law (CAN-SPAM) requires and which Gmail and Yahoo require of bulk senders.
Unsubscribed people are skipped automatically; if they sign up again they are resubscribed.
**Download CSV** exports the list if you'd rather use another email tool (Klaviyo, Mailchimp,
Shopify Email).

Setup:

1. Create a free account at [resend.com](https://resend.com) and **verify your domain** (add the DNS
   records it shows). Emails from an unverified domain land in spam or are refused.
2. Create an API key and set `RESEND_API_KEY`.
3. Set `EMAIL_FROM` (e.g. `VEYA <news@yourdomain.com>`, on the verified domain) and
   `MAILING_ADDRESS` (your business address or a P.O. box).

Until all three are set, the admin screen works in preview mode and nothing is sent.

## API

```
GET    /api/products?category=&q=     GET /api/products/:id
GET    /api/cart                      POST /api/cart {productId,size?,color?,qty?}
PATCH  /api/cart/:itemId {qty}        DELETE /api/cart/:itemId
POST   /api/cart/discount {code}      DELETE /api/cart/discount
GET    /api/spin   POST /api/spin   POST /api/spin/claim {email}
POST   /api/checkout {name,email,address,city,postalCode,country}
POST   /api/auth/register|login|logout   GET /api/auth/me   GET /api/orders
POST   /api/subscribe {email}         GET|POST /unsubscribe?token=
GET    /api/config  /api/fabrics  /api/pages/:slug
GET    /api/admin/summary   PATCH /api/admin/orders/:number   PATCH /api/admin/products/:id
POST   /api/admin/campaigns/preview|test   POST /api/admin/campaigns   GET /api/admin/subscribers.csv
```

## Development

```bash
npm run dev          # restart on change
npm test             # API, Shopify and Stripe flow tests (in-memory database, fake clients)
SHOPIFY_LIVE_TEST=1 npm test   # also runs the full flow against Shopify's demo store (mock.shop)
npm run build:css    # rebuild public/styles.css after changing classes
```

To check the Stripe integration against Stripe's API spec without a Stripe account, run Stripe's
official mock server:

```bash
go install github.com/stripe/stripe-mock@latest && stripe-mock -http-port 12111
STRIPE_MOCK_PORT=12111 npm test
```

Styling uses Tailwind, compiled from `tailwind.config.js` (the Stitch theme tokens) into
`public/styles.css`. Stitch's export loads the Tailwind Play CDN instead, which Tailwind doesn't
recommend for production.

## Project layout

```
server.js            Express app + API routes (built-in mode)
shopify.js           Shopify Storefront API client + Shopify-mode routes
email.js             Newsletter email template and Resend sending
db.js                SQLite schema and seeding
seed.js              Built-in catalog, fabrics and Help pages
public/index.html    Stitch design with interaction hooks
public/app.js        Front-end logic
public/admin.html    Admin dashboard
public/images/       Design imagery (downloaded from the Stitch project)
test/                API tests
```
