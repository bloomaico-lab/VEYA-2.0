# VEYA — Technical Luxury Apparel

Working storefront for VEYA, affordable everyday clothing for New York and Miami, built from the **VEYA Active Luxury UI** design from Google Stitch
(project `11128318004927957051`). The front end keeps the Stitch markup and theme. A small
Node/Express + SQLite backend makes every button work.

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

## What works

| Design element                                | Behaviour                                                        |
| --------------------------------------------- | ---------------------------------------------------------------- |
| Nav: Collections / Commute / Studio / Weekend | Filters the collection and scrolls to it                         |
| Nav: Fabric Lab, Editorial                    | Scrolls to the lab / opens the Editorial page                    |
| Search icon                                   | Live product search, opens the product on click                 |
| Account                                       | Sign in / create account, order history, sign out                |
| Bag (n)                                       | Bag drawer: change quantity, remove items, see totals, check out |
| Hero environment pills                        | Switch the telemetry readout and filter the collection           |
| Explore Collection / Fabric Innovation Lab    | Scroll to the section                                            |
| “Fluid Spectrum” cards                        | Filter the collection by system                                  |
| Fabric lab cards                              | Select a textile and update the specimen HUD                     |
| View Full Lab Whitepaper, footer links        | Open content pages (sustainability, care, stores, privacy)       |
| Collection arrows / filter chips              | Scroll the product carousel / filter                             |
| Product “+”, colour swatches                  | Quick-add in the chosen colour                                   |
| Product image / name                          | Product detail: colour, size, quantity, Add to Bag               |
| Checkout                                      | Validated shipping form → order saved, stock decremented         |
| Request Access                                | Joins the VIP club list (no duplicate signups)                   |
| Mobile menu (☰)                               | Nav for small screens (the design hides the nav on phones)       |

Prices, stock and totals are always calculated on the server. Shipping is $6, or free over $75.

## Payments (Stripe)

Without `STRIPE_SECRET_KEY` the store runs in **demo mode**: orders are saved but no card is charged.

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
will ask for your Stripe keys, which you can leave blank to launch in demo mode. The admin token is
under the service's **Environment** tab.

**Anywhere with Docker:**

```bash
docker build -t veya .
docker run -p 3000:3000 -v veya-data:/data -e ADMIN_TOKEN=change-me veya
```

Keep the database (`DB_FILE`) on persistent storage, or orders and accounts are lost on redeploy.

## Admin

Set `ADMIN_TOKEN`, open `/admin` and enter the token. From there you can view orders and change
their status, edit stock levels and see VIP subscribers.

## API

```
GET    /api/products?category=&q=     GET /api/products/:id
GET    /api/cart                      POST /api/cart {productId,size?,color?,qty?}
PATCH  /api/cart/:itemId {qty}        DELETE /api/cart/:itemId
POST   /api/checkout {name,email,address,city,postalCode,country}
POST   /api/auth/register|login|logout   GET /api/auth/me   GET /api/orders
POST   /api/subscribe {email}
GET    /api/fabrics  /api/environments/:id  /api/pages/:slug
GET    /api/admin/summary   PATCH /api/admin/orders/:number   PATCH /api/admin/products/:id
```

## Development

```bash
npm run dev          # restart on change
npm test             # API + Stripe flow tests (in-memory database, fake Stripe client)
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
server.js            Express app + API routes
db.js                SQLite schema and seeding
seed.js              Catalog, fabric lab, telemetry and content-page data
public/index.html    Stitch design with interaction hooks
public/app.js        Front-end logic
public/admin.html    Admin dashboard
public/images/       Design imagery (downloaded from the Stitch project)
test/                API tests
```
