// Builds shopify/veya-products.csv: the VEYA catalog (seed.js) as a Shopify product import file.
//
//   node scripts/shopify-products-csv.js
//
// Shopify admin → Products → Import → choose the file. Each product gets Color + Size variants,
// its price, tags the VEYA theme reads (gender:, category:, badge:, material:), and a studio photo
// plus an on-model photo for every colour. Shopify downloads the photos from IMAGE_BASE during the
// import (the repo is public), so they keep working even if the branch changes later.

const fs = require('node:fs');
const path = require('node:path');
const { products } = require('../seed');

const IMAGE_BASE = process.env.IMAGE_BASE
  || 'https://raw.githubusercontent.com/bloomaico-lab/VEYA-2.0/claude/hopeful-maxwell-t8ycra/public';
const OUT = path.join(__dirname, '..', 'shopify', 'veya-products.csv');

// Approximate shipping weights in grams, used by Shopify for shipping rates.
const GRAMS = {
  tops: { Tees: 200, 'Long Sleeves': 250, Shirts: 250, 'Sports Bras': 120 },
  layers: 600,
  bottoms: { Leggings: 250, Shorts: 150 },
};
const gramsFor = (p) => {
  const g = GRAMS[p.category];
  if (typeof g === 'number') return g;
  return g[p.tagline] || (p.category === 'bottoms' ? 600 : 200);
};

const HEADERS = [
  'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published',
  'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
  'Variant SKU', 'Variant Grams', 'Variant Inventory Tracker', 'Variant Inventory Policy',
  'Variant Fulfillment Service', 'Variant Price', 'Variant Requires Shipping', 'Variant Taxable',
  'Image Src', 'Image Position', 'Image Alt Text', 'Gift Card', 'SEO Title', 'SEO Description',
  'Variant Image', 'Variant Weight Unit', 'Status',
];

const cell = (v) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const url = (p) => (p ? IMAGE_BASE + p : '');
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sku = (p, color, size) => ['VEYA', p.id.split('-').map((w) => w[0]).join('').toUpperCase(),
  color.replace(/\s+/g, '').toUpperCase().slice(0, 6), size].join('-');

function rowsFor(p) {
  const tags = [`gender:${p.gender}`, `category:${p.category}`, p.badge && `badge:${p.badge}`, `material:${p.material}`]
    .filter(Boolean).join(', ');
  // Photos: for each colour, the studio shot then the on-model photo. Alt text names the colour so
  // the theme can show the right photos when a colour is picked.
  const images = p.colors.flatMap((c) => [
    { src: url(c.image), alt: `${p.name} in ${c.name}` },
    { src: url(c.modelImage), alt: `${p.name} in ${c.name}, on model` },
  ]);
  const variants = p.colors.flatMap((c) => p.sizes.map((size) => ({ color: c, size })));
  const rows = [];
  const n = Math.max(variants.length, images.length);
  for (let i = 0; i < n; i += 1) {
    const v = variants[i];
    const img = images[i];
    const first = i === 0;
    rows.push({
      Handle: p.id,
      Title: first ? p.name : '',
      'Body (HTML)': first ? `<p>${escapeHtml(p.description)}</p>` : '',
      Vendor: first ? 'VEYA' : '',
      Type: first ? p.tagline : '',
      Tags: first ? tags : '',
      Published: first ? 'TRUE' : '',
      'Option1 Name': first ? 'Color' : '',
      'Option1 Value': v ? v.color.name : '',
      'Option2 Name': first ? 'Size' : '',
      'Option2 Value': v ? v.size : '',
      'Variant SKU': v ? sku(p, v.color.name, v.size) : '',
      'Variant Grams': v ? gramsFor(p) : '',
      // Made to order: no stock to track, the print-on-demand app fulfils every order.
      'Variant Inventory Tracker': '',
      'Variant Inventory Policy': v ? 'deny' : '',
      'Variant Fulfillment Service': v ? 'manual' : '',
      'Variant Price': v ? (p.price_cents / 100).toFixed(2) : '',
      'Variant Requires Shipping': v ? 'TRUE' : '',
      'Variant Taxable': v ? 'TRUE' : '',
      'Image Src': img ? img.src : '',
      'Image Position': img ? i + 1 : '',
      'Image Alt Text': img ? img.alt : '',
      'Gift Card': first ? 'FALSE' : '',
      'SEO Title': first ? `${p.name} | VEYA` : '',
      'SEO Description': first ? p.description.slice(0, 155) : '',
      'Variant Image': v ? url(v.color.image) : '',
      'Variant Weight Unit': v ? 'g' : '',
      Status: first ? 'active' : '',
    });
  }
  return rows;
}

const rows = products.flatMap(rowsFor);
const csv = [HEADERS.join(','), ...rows.map((r) => HEADERS.map((h) => cell(r[h])).join(','))].join('\n') + '\n';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, csv);
console.log(`Wrote ${OUT}: ${products.length} products, ${rows.length} rows`);
