// Catalog + content seed data. Products are written to the database on first boot;
// fabrics, environments and pages are served straight from here.

const products = [
  {
    id: 'aero-shield-field-parka',
    name: 'Aero-Shield Field Parka',
    tagline: 'All-Weather Shell',
    material: '3-Layer Bi-Stretch Membrane',
    category: 'expedition',
    price_cents: 68000,
    temp_range: '-5°C to 14°C',
    image: '/images/parka.jpg',
    description: 'A minimalist field parka with a taped storm flap, high ergonomic collar, matte YKK dual-direction hardware and bonded cuff tabs. 20K/20K waterproof-breathable shell built to move between city and summit.',
    colors: [
      { name: 'Volcanic Black', hex: '#111317' },
      { name: 'Basalt Grey', hex: '#37393d' },
      { name: 'Signal Amber', hex: '#f9bb72' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    stock: 40,
  },
  {
    id: 'kinetic-merino-longsleeve',
    name: 'Kinetic Merino Longsleeve',
    tagline: 'Thermal Regulator',
    material: 'Aero-Merino 240g Blend',
    category: 'performance',
    price_cents: 24000,
    temp_range: '8°C to 24°C',
    image: '/images/longsleeve.jpg',
    description: 'Engineered ribbing across the trapezius and underarms with seamless collar bonding. Superfine 17.5-micron merino wrapped around a nylon core for odor control and fast vapor expulsion.',
    colors: [
      { name: 'Obsidian', hex: '#111317' },
      { name: 'Slate', hex: '#656461' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    stock: 80,
  },
  {
    id: 'apex-articulated-pant',
    name: 'Apex Articulated Pant',
    tagline: 'Transit Chassis',
    material: 'Japanese Schoeller Bi-Stretch',
    category: 'transit',
    price_cents: 36000,
    temp_range: '4°C to 22°C',
    image: '/images/pant.jpg',
    description: 'Relaxed-tapered technical trousers with architectural slash pockets, articulated knee darts and concealed zip hem adjustment. Matte water-resistant finish that reads as tailoring.',
    colors: [
      { name: 'Midnight', hex: '#0c0e11' },
      { name: 'Graphite', hex: '#282a2d' },
    ],
    sizes: ['28', '30', '32', '34', '36'],
    stock: 60,
  },
  {
    id: 'strata-loft-hybrid-vest',
    name: 'Strata Loft Hybrid Vest',
    tagline: 'Core Insulation',
    material: 'Aerogel Thermal Fill 80g',
    category: 'expedition',
    price_cents: 31000,
    temp_range: '0°C to 18°C',
    image: '/images/vest.jpg',
    description: 'Ultralight insulated vest with baffle stitching mapped to natural body heat, a low-profile collar and laser-cut chest zip pocket. Packs into its own pocket.',
    colors: [
      { name: 'Signal Amber', hex: '#f9bb72' },
      { name: 'Carbon', hex: '#111317' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    stock: 35,
  },
  {
    id: 'meridian-technical-overcoat',
    name: 'Meridian Technical Overcoat',
    tagline: 'Metropolitan Commute',
    material: '340 GSM DWR Wool Blend',
    category: 'transit',
    price_cents: 89000,
    temp_range: '-2°C to 12°C',
    image: '/images/transit.jpg',
    description: 'Structured overcoat cut from water-shedding Australian wool. Internal laser-cut passport vault, headphone routing and discreet magnetic flaps for the daily commute.',
    colors: [
      { name: 'Obsidian', hex: '#111317' },
      { name: 'Graphite', hex: '#282a2d' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    stock: 25,
  },
  {
    id: 'vector-compression-set',
    name: 'Vector Compression Set',
    tagline: 'High-Output Performance',
    material: '4-Way Mechanical Stretch',
    category: 'performance',
    price_cents: 29000,
    temp_range: '12°C to 30°C',
    image: '/images/performance.jpg',
    description: 'Sculpted compression top and tight with laser-cut micro-ventilation along the spine and ribs. Thermal-mapped cooling channels open as body temperature rises.',
    colors: [
      { name: 'Graphite', hex: '#37393d' },
      { name: 'Obsidian', hex: '#111317' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    stock: 70,
  },
  {
    id: 'summit-20k-storm-shell',
    name: 'Summit 20K Storm Shell',
    tagline: 'Alpine Ascent',
    material: 'V-Shell Multi-Layer Membrane',
    category: 'expedition',
    price_cents: 74000,
    temp_range: '-15°C to 8°C',
    image: '/images/expedition.jpg',
    description: 'Multi-layer membrane rated to 20,000mm hydrostatic head with taped seams and an integrated helmet-compatible storm hood. Packable thermal core without the bulk of down.',
    colors: [
      { name: 'Slate', hex: '#384955' },
      { name: 'Signal Amber', hex: '#f9bb72' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    stock: 30,
  },
];

const fabrics = [
  {
    id: 'aero-merino-240',
    specimen: 'VEYA-TX-9902',
    metric: 'VAPOR PERMEABILITY: 28,000 G/M²/24H',
    focusTitle: 'Micro-filament Cross-section',
    focusText: 'Zero-wicking yarn geometry prevents saturation under 6hr downpours.',
  },
  {
    id: 'v-shell-bi-stretch',
    specimen: 'VEYA-TX-4417',
    metric: 'WIND RESISTANCE: 70 MPH / 0.5 CFM',
    focusTitle: 'Membrane Lamination Layer',
    focusText: 'Fluorine-free eco-DWR bonded to a high-gauge weave with zero-rustle acoustics.',
  },
  {
    id: 'kinetic-matrix',
    specimen: 'VEYA-TX-7731',
    metric: 'ARTICULATION: 180° OVERHEAD REACH',
    focusTitle: 'Radial Gusset Geometry',
    focusText: 'Patterned from 3D anatomical scans so hems stay put through full extension.',
  },
];

// Hero "atmospheric telemetry" readouts for each environment pill.
const environments = {
  urban: { label: 'ATMOSPHERIC TELEMETRY: TOKYO / SHIBUYA 40M', reading: '11°C PRECIP 62%', category: 'transit' },
  studio: { label: 'ATMOSPHERIC TELEMETRY: ZÜRICH TRAINING LAB', reading: '19°C HUMIDITY 48%', category: 'performance' },
  alpine: { label: 'ATMOSPHERIC TELEMETRY: 2,420M MASSIF', reading: '-4°C PRECIP 85%', category: 'expedition' },
};

const pages = {
  editorial: {
    title: 'Editorial',
    kicker: 'FIELD NOTES',
    body: [
      'Transit Log 09 — Forty-eight hours from a Shibuya boardroom to a hut on the Haute Route, in one wardrobe and one carry-on.',
      'Lab Dispatch — How our Kyoto weavers reached 28,000 g/m² vapor permeability without sacrificing drape.',
      'The Quiet Garment — Why we removed 60% of the hardware from the Aero-Shield and what it taught us about weatherproofing.',
    ],
  },
  'lab-documentation': {
    title: 'Fabric Lab Whitepaper',
    kicker: 'TACTILE ENGINEERING LAB',
    body: [
      'Aero-Merino 240: 17.5-micron merino helically wrapped around a micro-filament nylon core. Tensile strength +42% over standard wool. Vapor permeability 28,000 g/m²/24h.',
      'V-Shell Bi-Stretch: high-gauge woven membrane with fluorine-free eco-DWR. Wind resistance to 70mph, hydrostatic head 20,000mm.',
      'Kinetic Matrix: radial gusset patterning derived from 3D anatomical scans for full overhead reach without hem elevation.',
      'All textiles are tested for 500 hours in alpine weather chambers before release.',
    ],
  },
  sustainability: {
    title: 'Sustainability Manifesto',
    kicker: 'ECOSYSTEM',
    body: [
      'We produce in serialized micro-batches to eliminate deadstock.',
      'Every DWR finish we use is fluorine-free, and 100% of our merino is mulesing-free and traceable to the farm.',
      'Garments carry a lifetime repair guarantee. Send any VEYA piece to a Flagship Node and we will repair it at no cost.',
    ],
  },
  care: {
    title: 'Care & Maintenance',
    kicker: 'SUPPORT & CARE',
    body: [
      'Shells: machine wash cold on a gentle cycle with a technical detergent. Tumble dry low for 20 minutes to reactivate the DWR.',
      'Merino: wash cold, lay flat to dry. Air between wears — merino rarely needs washing.',
      'Insulation: wash alone, cold, with two clean tennis balls in the dryer on low heat to restore loft.',
    ],
  },
  stores: {
    title: 'Store Locator',
    kicker: 'FLAGSHIP NODES',
    body: [
      'Tokyo / Shibuya Atelier — 1-2-3 Jinnan, Shibuya-ku. Open daily 11:00–20:00.',
      'Zürich / Bahnhofstrasse Lab — Bahnhofstrasse 42. Mon–Sat 10:00–19:00.',
      'Vancouver / Gastown Terminal — 18 Water Street. Open daily 10:00–19:00.',
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    kicker: 'SUPPORT & CARE',
    body: [
      'We collect only what we need to fulfil orders and run your account: your name, email, shipping address and order history.',
      'Passwords are stored as salted scrypt hashes. Payment details are never stored on our servers.',
      'Club emails are sent at most four times a year. Email us to have your data exported or deleted at any time.',
    ],
  },
};

module.exports = { products, fabrics, environments, pages };
