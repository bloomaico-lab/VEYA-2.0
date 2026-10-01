# VEYA — Technical Luxury Apparel

Working storefront for the **VEYA Active Luxury UI** design from Google Stitch
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

## What works

| Design element                                | Behaviour                                                        |
| --------------------------------------------- | ---------------------------------------------------------------- |
| Nav: Collections / Transit / Performance / Expedition | Filters the collection and scrolls to it                 |
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

Prices, stock and totals are always calculated on the server. Shipping is $25, or free over $500.
**Payments run in demo mode**: orders are recorded but no card is charged. To take real money,
connect a provider such as Stripe Checkout in `POST /api/checkout`.

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
npm test             # API tests (in-memory database)
npm run build:css    # rebuild public/styles.css after changing classes
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
