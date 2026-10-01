// Catalog + content seed data. Products are written to the database on first boot;
// fabrics, environments and pages are served straight from here.

const products = [
  {
    id: 'soho-coach-jacket',
    name: 'SoHo Coach Jacket',
    tagline: 'Everyday Outer Layer',
    material: 'Water-Resistant Nylon',
    category: 'commute',
    price_cents: 7800,
    temp_range: '45°F to 65°F',
    image: '/images/coach-jacket.jpg',
    description: 'A lightweight nylon coach jacket with snap buttons and a corduroy collar. Water-resistant for a rainy walk to the subway, and light enough to stuff in a bag when the sun comes out.',
    colors: [
      { name: 'Black', hex: '#111317' },
      { name: 'Olive', hex: '#4d5340' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    stock: 60,
  },
  {
    id: 'bowery-carpenter-pant',
    name: 'Bowery Carpenter Pant',
    tagline: 'Workwear Staple',
    material: '10oz Washed Cotton Canvas',
    category: 'commute',
    price_cents: 5800,
    temp_range: 'All Seasons',
    image: '/images/carpenter-pant.jpg',
    description: 'Relaxed straight-leg carpenter pants in washed cotton canvas, with a hammer loop and utility pocket. Tough enough for every day, soft from the first wear.',
    colors: [
      { name: 'Washed Black', hex: '#1c1d20' },
      { name: 'Khaki', hex: '#a69373' },
    ],
    sizes: ['28', '30', '32', '34', '36'],
    stock: 80,
  },
  {
    id: 'chelsea-cotton-crew',
    name: 'Chelsea Cotton Crew',
    tagline: 'Everyday Knit',
    material: 'Soft Cotton Knit',
    category: 'commute',
    price_cents: 4800,
    temp_range: '45°F to 68°F',
    image: '/images/cotton-crew.jpg',
    description: 'A soft cotton crew neck that works on its own or under the coach jacket. Easy to wash, no itch, and smart enough for the office.',
    colors: [
      { name: 'Oatmeal', hex: '#b9ab95' },
      { name: 'Charcoal', hex: '#37393d' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    stock: 70,
  },
  {
    id: 'hudson-track-pant',
    name: 'Hudson Track Pant',
    tagline: 'Move-Anywhere Pant',
    material: '4-Way Stretch Nylon',
    category: 'studio',
    price_cents: 4400,
    temp_range: 'All Seasons',
    image: '/images/track-pant.jpg',
    description: 'A slim track pant cut sharp enough for the street. Four-way stretch for the gym or a run along the Hudson, with a zip pocket for your phone and MetroCard.',
    colors: [
      { name: 'Black', hex: '#111317' },
      { name: 'Navy', hex: '#1d2433' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    stock: 90,
  },
  {
    id: 'williamsburg-half-zip',
    name: 'Williamsburg Half-Zip',
    tagline: 'Studio Layer',
    material: 'Brushed Technical Jersey',
    category: 'studio',
    price_cents: 5200,
    temp_range: '50°F to 72°F',
    image: '/images/half-zip.jpg',
    description: 'A brushed half-zip for the morning workout and the coffee after it. Breathable, quick-drying and clean enough to keep on all day.',
    colors: [
      { name: 'Black', hex: '#111317' },
      { name: 'Graphite', hex: '#37393d' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    stock: 75,
  },
  {
    id: 'wynwood-camp-shirt',
    name: 'Wynwood Camp Shirt',
    tagline: 'Short-Sleeve Shirt',
    material: 'Cotton-Linen Blend',
    category: 'weekend',
    price_cents: 4200,
    temp_range: '70°F to 95°F',
    image: '/images/camp-shirt.jpg',
    description: 'An airy camp-collar shirt in cotton-linen with a relaxed, boxy fit. Wear it open over a tee in the Miami heat or buttoned up for dinner.',
    colors: [
      { name: 'Cream', hex: '#ece5d3' },
      { name: 'Black', hex: '#111317' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    stock: 80,
  },
  {
    id: 'biscayne-linen-short',
    name: 'Biscayne Linen Short',
    tagline: '7" Drawstring Short',
    material: 'Washed Linen',
    category: 'weekend',
    price_cents: 3800,
    temp_range: '72°F to 95°F',
    image: '/images/linen-short.jpg',
    description: 'Washed linen shorts with a drawstring waist and a 7-inch inseam. Cool and breathable for a day on the beach or a walk down Collins Avenue.',
    colors: [
      { name: 'Sand', hex: '#cdbb98' },
      { name: 'Black', hex: '#111317' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    stock: 90,
  },
  {
    id: 'bed-stuy-heavyweight-hoodie',
    name: 'Bed-Stuy Heavyweight Hoodie',
    tagline: 'Heavyweight Fleece',
    material: '14oz Cotton Fleece',
    category: 'weekend',
    price_cents: 5800,
    temp_range: '40°F to 65°F',
    image: '/images/hoodie.jpg',
    description: 'A heavyweight cotton fleece hoodie that keeps its shape wash after wash. The one you will reach for every weekend.',
    colors: [
      { name: 'Heather Grey', hex: '#9a9a98' },
      { name: 'Black', hex: '#111317' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    stock: 100,
  },
  {
    id: 'ocean-drive-boxy-tee',
    name: 'Ocean Drive Boxy Tee',
    tagline: 'Everyday Tee',
    material: '6.5oz Heavyweight Cotton',
    category: 'weekend',
    price_cents: 2200,
    temp_range: '65°F to 95°F',
    image: '/images/tee.jpg',
    description: 'A boxy heavyweight tee that will not go see-through or lose its collar. Built for Miami heat and New York summers.',
    colors: [
      { name: 'Off-White', hex: '#ece8df' },
      { name: 'Black', hex: '#111317' },
      { name: 'Washed Grey', hex: '#4a4b4d' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    stock: 150,
  },
];

const fabrics = [
  {
    id: 'heavyweight-cotton',
    specimen: 'VEYA-TX-2201',
    metric: 'WEIGHT: 6.5 OZ / PRE-SHRUNK',
    focusTitle: 'Dense Combed Cotton',
    focusText: 'A tight knit that keeps tees and hoodies from twisting or shrinking in the wash.',
  },
  {
    id: 'city-shell',
    specimen: 'VEYA-TX-4417',
    metric: 'WATER RESISTANCE: LIGHT RAIN',
    focusTitle: 'Ripstop Nylon Weave',
    focusText: 'Light, packable and water-resistant enough for a downpour between subway stops.',
  },
  {
    id: 'washed-linen',
    specimen: 'VEYA-TX-7731',
    metric: 'AIRFLOW: 2X STANDARD COTTON',
    focusTitle: 'Open Linen Weave',
    focusText: 'Stone-washed so it starts soft and stays cool in Miami heat and humidity.',
  },
];

// Hero "city telemetry" readouts for each environment pill.
const environments = {
  commute: { label: 'CITY TELEMETRY: NEW YORK / CANAL ST STATION', reading: '58°F RAIN 40%', category: 'commute' },
  studio: { label: 'CITY TELEMETRY: BROOKLYN / WILLIAMSBURG ROOFTOP', reading: '66°F HUMIDITY 55%', category: 'studio' },
  weekend: { label: 'CITY TELEMETRY: MIAMI / WYNWOOD', reading: '86°F SUN UV 8', category: 'weekend' },
};

const pages = {
  editorial: {
    title: 'Editorial',
    kicker: 'FIELD NOTES',
    body: [
      'First Train, Last Train — Eighteen hours in New York, from a 7am L train to a late slice on the Lower East Side, in one outfit.',
      'Weekend in Wynwood — A camp shirt, linen shorts and a boxy tee: how to stay cool walking the murals in 90°F heat.',
      'The Five-Piece Week — How the coach jacket, carpenter pant, cotton crew, hoodie and tee cover every day of the week for $264.',
    ],
  },
  'lab-documentation': {
    title: 'Fabric Lab Whitepaper',
    kicker: 'TACTILE ENGINEERING LAB',
    body: [
      'Heavyweight Cotton: 6.5oz combed cotton, pre-shrunk and garment-dyed so it keeps its size and colour.',
      'City Shell: lightweight ripstop nylon with a water-resistant finish. Packs into a tote and dries fast.',
      'Washed Linen: open-weave linen, stone-washed for softness, with roughly twice the airflow of standard cotton.',
      'Every piece is wear-tested for 30 days of New York commuting and Miami summers before release.',
    ],
  },
  sustainability: {
    title: 'Sustainability Manifesto',
    kicker: 'ECOSYSTEM',
    body: [
      'We make small runs and restock what sells, so less ends up as deadstock.',
      'Our cotton is OEKO-TEX certified and our water-resistant finishes are fluorine-free.',
      'Bring any worn-out VEYA piece to one of our stores and get 15% off your next order. We recycle what we collect.',
    ],
  },
  care: {
    title: 'Care & Maintenance',
    kicker: 'SUPPORT & CARE',
    body: [
      'Tees, hoodies and crews: wash cold inside out and tumble dry low.',
      'Linen: wash cold and hang dry. A few wrinkles are part of the look.',
      'Coach jacket: machine wash cold on a gentle cycle and hang dry.',
      'Carpenter pants: wash cold inside out; they soften more with every wash.',
    ],
  },
  stores: {
    title: 'Store Locator',
    kicker: 'FLAGSHIP STORES',
    body: [
      'New York / SoHo — 112 Greene Street. Open daily 11:00–20:00.',
      'Brooklyn / Williamsburg — 84 N 6th Street. Open daily 11:00–20:00.',
      'Miami / Wynwood — 250 NW 25th Street. Open daily 11:00–21:00.',
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
