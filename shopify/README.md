# VEYA on Shopify

Everything you need to run VEYA as a Shopify store. The whole store, including design, products,
checkout and orders, runs on Shopify. No separate hosting is needed.

| File | What it is |
|---|---|
| `veya-shopify-theme.zip` | The VEYA design as a Shopify theme. Upload it in **Online Store → Themes**. |
| `veya-products.csv` | All 16 products: colours, sizes, prices, tags and photos. Import it in **Products → Import**. |
| `brand/` | VEYA logo files for the checkout page, order emails and favicon (see step 7). |
| `theme/` | The theme's source files (rebuild the zip with `npm run build:theme`). |

## Setup (about an hour)

### 1. Create the store
1. Go to **shopify.com** and start a free trial. Name the store **VEYA**.
2. Skip the theme picker and the setup questions. You're uploading your own theme next.

### 2. Upload the VEYA theme
1. Shopify admin → **Online Store → Themes**.
2. Scroll to **Theme library** → **Add theme** → **Upload zip file** → choose `veya-shopify-theme.zip`.
3. When it finishes, click **⋯ → Publish** on the VEYA theme.

### 3. Import the products
1. Shopify admin → **Products → Import**.
2. Choose `veya-products.csv` and tick **Publish new products to all sales channels**.
3. Click **Upload and preview**, then **Import products**. Shopify downloads all the photos (90 of them),
   which takes a few minutes. You'll get an email when it's done.

Each product arrives with its **Color** and **Size** options, the price, a studio photo and an
on-model photo for every colour, and these tags, which the theme uses:

| Tag | What it does |
|---|---|
| `gender:men` / `gender:women` | Men or Women section (no tag = shows in both) |
| `category:tops` / `layers` / `bottoms` | Category filters |
| `badge:New` / `badge:Best Seller` / `badge:Matching Set` | Label on the photo |
| `material:…` | Fabric line under the name |

To add a product later, give it the same tags. For colour photos, set each colour's variant image
and give its on-model photo alt text like `Flare Legging in Black, on model`.

### 4. Add the help pages
Shopify admin → **Online Store → Pages → Add page**. Create these three pages. The title sets the web address the footer links to.

**Size Guide**
> Tops and layers are a relaxed fit. Size down for a closer fit, or stay true to size for the intended boxy look.
>
> Chest (body width × 2): XS 38" · S 40" · M 44" · L 48" · XL 52" · 2XL 56".
>
> Body length: XS 27" · S 28" · M 29" · L 30" · XL 31" · 2XL 32".
>
> Men's tops and layers are an oversized, relaxed fit. Women's baby tees, tanks and long sleeves are fitted; sweatshirts are oversized.
>
> Sweatpants and track pants have elastic drawcord waists and run true to size. Leggings are compressive: size up if you are between sizes.

**Fabrics & Care** (check the address is `/pages/fabrics-care`; edit it under "Search engine listing" if Shopify made it `fabrics-and-care`)
> Heavyweight Cotton: 7oz combed cotton, pre-shrunk and garment-dyed so it keeps its size and colour. Wash cold inside out, tumble dry low.
>
> Brushed Fleece: 12–14oz cotton fleece, brushed inside for warmth. Wash cold inside out with similar colours and tumble dry low to keep it soft.
>
> Sculpt Knit: four-way-stretch performance knit for our flare leggings. Wash cold, skip fabric softener and hang dry to keep its shape.
>
> Printed pieces: wash inside out and avoid ironing directly on the print.

**Our Approach**
> Everything is made to order. Nothing is produced until you buy it, so there is no overstock to burn or bin.
>
> We keep our colours to a small, earthy palette that mixes and matches.
>
> Fewer, better basics: a small range of everyday pieces we keep improving instead of chasing trends.

### 5. Policies
Shopify admin → **Settings → Policies**. Fill in **Shipping** (text below), **Refund** (use the
exchange text below), and use **Create from template** for Privacy and Terms of Service.

> Every piece is made to order just for you, then shipped. Most orders are made in 2–4 business days and arrive 3–7 business days after that. Shipping is $6, and free on orders over $75. You will get a tracking link by email as soon as your order ships.

> Wrong size? We offer free exchanges within 30 days of delivery. Because items are made to order, we can only refund items that arrive damaged or with a printing or manufacturing fault. Contact us within 30 days with a photo and we will make it right.

### 6. Payments: Shopify processes them for you
Payment processing, the checkout page, order records, receipts, refunds and fraud checks are all
built into Shopify. There's nothing to install. You just switch it on with your details.

1. **Settings → Payments → Shopify Payments → Activate** (or "Complete account setup"). Have ready:
   your legal name and address, date of birth, SSN or EIN (for a business), and the bank account
   your money should go to.
2. **Settings → Payments → Shopify Payments → Manage**:
   - **Wallets**: make sure **Shop Pay, Apple Pay and Google Pay** are on. These power the express
     checkout buttons on the VEYA product page and bag page.
   - **Statement descriptor**: `VEYA`, so customers recognise the charge on their bank statement.
   - **Payout schedule**: sales are paid into your bank account automatically.
3. Optional: **Settings → Payments → PayPal → Activate** to offer PayPal too.

Every card payment goes through Shopify's own checkout, so card details never touch the theme and
the store is PCI compliant without any extra work.

### 7. Checkout page and order emails
1. **Settings → Checkout**:
   - Customer contact method: **Email**.
   - Marketing options: tick **Show a sign-up option at checkout** (sign-ups go to your email list).
   - Tipping: off.
   - Order processing: leave **Don't fulfill any of the order's line items automatically**. Printful
     marks orders as fulfilled when it ships them (step 10).
2. **Settings → Checkout → Customize** (the checkout editor), then the **gear / Settings** panel:
   - Logo: upload `brand/veya-logo.png`, width about 140px.
   - Colours: background **#F5EFE4** (cream), buttons and accents **#1B2A41** (navy).
   - Typography: pick a serif for headings (e.g. Bodoni Moda or Playfair Display, whichever is listed)
     and a clean sans for body text.
3. **Settings → Notifications → Customize email templates**: upload `brand/veya-logo.png` and set the
   accent colour to **#1B2A41**. That brands every email Shopify sends: order confirmation,
   shipping confirmation with tracking, refunds and account emails.
4. **Online Store → Themes → Customize → Theme settings → Store → Favicon**: upload `brand/veya-icon.png`.

### 8. Shipping and taxes
1. **Settings → Shipping and delivery → General shipping rates → Manage**, then add two rates to your zone:
   - "Standard", **$6.00**, condition: order price **$0 – $74.99**
   - "Free shipping", **$0.00**, condition: order price **$75.00 and up**
2. **Settings → Taxes and duties → United States**: turn on collecting sales tax for your home state.
   Shopify works out the right rate for every order, and tells you if you need to register in
   another state as sales grow.

The free-shipping amount shown on the site is set in **Online Store → Themes → Customize → Theme settings → Store**.

### 9. Refunds, exchanges and fraud
- **Refund**: Orders → open the order → **Refund**. The money goes back to the customer's card or wallet.
- **Exchange**: Orders → open the order → **Return** → choose the item and the new size. Then
  place the replacement in Printful (Orders → New order) or let Printful reprint it if it was faulty.
- **Fraud**: Shopify checks every order and shows a risk level on it. If an order is marked
  **high risk**, cancel and refund it, and cancel it in Printful before it goes into production.

### 10. Connect Printful, so orders fulfil themselves
1. Shopify admin → **Apps → App Store** → install **Printful** and sign in or create an account.
2. In Printful go to **Stores → your Shopify store**. The 16 imported products show as **not synced**.
   For each one, click **Edit** (or "Sync"), pick the blank from the VEYA supplier spreadsheet, upload
   your VEYA logo, and match each Shopify colour to the Printful colour. Save.
3. Printful → **Settings → Stores → Order import** → turn on **automatic order confirmation**
   (do this after your test order in step 12, so the test doesn't get printed).
4. Printful → **Billing** → add a card. Printful charges you the cost + shipping for each order.

After that, a paid order goes straight to Printful, which prints it, ships it under your brand
and sends the tracking back to Shopify. Shopify then emails your customer.

### 11. Email sign-ups and abandoned checkouts
The "Join the list" form adds people to **Customers** with email marketing turned on. Send
campaigns from **Marketing → Campaigns → Shopify Email**. To bring over people who signed up on the
old site, download the CSV from the old admin page (Subscribers → Download CSV), rename the `email`
column to `Email`, add an `Accepts Email Marketing` column set to `yes`, and import it in **Customers → Import**.

Turn on **Marketing → Automations → Recover abandoned checkout**. Shopify then emails people who
reached checkout but didn't pay, with a link straight back to their bag.

### 12. Place a test order
1. **Settings → Payments → Shopify Payments → Manage → Test mode** → turn it on.
2. On your store, add something to the bag and check out with card **4242 4242 4242 4242**, any
   future expiry date, any 3-digit CVC and any name.
3. Check: the order appears in **Orders** (marked as a test), the confirmation email arrives with
   the VEYA logo, and the express checkout buttons show on a product page once a size is chosen.
4. Turn **Test mode off** again, then switch on Printful's automatic order confirmation (step 10).

### 13. Go live
1. **Settings → Plan** → choose a plan. A paid plan is needed to open the store to the public.
2. **Online Store → Preferences → Password protection** → untick to open the store.
3. Optional: **Settings → Domains** → connect your own domain.

After you go live, place one real order for a cheap item and check it reaches Printful. Cancel it
in Printful before it prints, and refund it in Shopify, if you don't want it.

## Editing the look
**Online Store → Themes → Customize** lets you change the hero photo and text, the banner
messages (Header → add or edit "Banner message" blocks), the Men/Women and category photos,
the fabric cards, and the email sign-up text, all without code.

## For developers
- `npm run build:theme` compiles `shopify/src/veya.css` with Tailwind (same tokens as the site)
  into `theme/assets/veya.css` and writes `veya-shopify-theme.zip`.
- `npm run build:shopify-csv` regenerates `veya-products.csv` from `seed.js`.
- Product photos are loaded from the public GitHub repo during import. Set `IMAGE_BASE` to use
  another host.
