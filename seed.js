// Catalog + content seed data. Products are written to the database on first boot;
// fabrics, environments and pages are served straight from here.

const products = [
  {
    id: 'shibuya-commuter-coat',
    name: 'Shibuya Commuter Coat',
    tagline: 'Everyday Outer Layer',
    material: 'Water-Repellent Cotton-Nylon',
    category: 'commute',
    price_cents: 29800,
    temp_range: '6°C to 16°C',
    image: '/images/commuter-coat.jpg',
    description: 'A knee-length mac coat that goes over everything you own. Water-repellent Japanese cotton-nylon shrugs off a sudden shower on the walk to the station, and a hidden placket keeps the line clean over a suit or a hoodie.',
    colors: [
      { name: 'Ink Black', hex: '#111317' },
      { name: 'Stone', hex: '#c9c2b4' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    stock: 40,
  },
  {
    id: 'shimokita-pleated-trouser',
    name: 'Shimokita Pleated Trouser',
    tagline: 'Office to Izakaya',
    material: 'Stretch Wool-Feel Twill',
    category: 'commute',
    price_cents: 14800,
    temp_range: 'All Seasons',
    image: '/images/pleated-trouser.jpg',
    description: 'Wide, tapered trousers with front pleats and a pressed crease that holds all day. A quiet two-way stretch means they sit through a long meeting and keep moving after work.',
    colors: [
      { name: 'Black', hex: '#111317' },
      { name: 'Charcoal', hex: '#37393d' },
    ],
    sizes: ['28', '30', '32', '34', '36'],
    stock: 60,
  },
  {
    id: 'kanda-merino-crew',
    name: 'Kanda Merino Crew',
    tagline: 'Fine-Gauge Knit',
    material: '18.5-Micron Merino Wool',
    category: 'commute',
    price_cents: 14800,
    temp_range: '8°C to 20°C',
    image: '/images/merino-knit.jpg',
    description: 'A fine-gauge merino crew neck soft enough to wear on its own and thin enough to layer under the commuter coat. Temperature-regulating and naturally odour-resistant from first train to last.',
    colors: [
      { name: 'Oatmeal', hex: '#b9ab95' },
      { name: 'Charcoal', hex: '#37393d' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    stock: 50,
  },
  {
    id: 'yoyogi-track-pant',
    name: 'Yoyogi Track Pant',
    tagline: 'Move-Anywhere Pant',
    material: '4-Way Stretch Nylon',
    category: 'studio',
    price_cents: 11800,
    temp_range: 'All Seasons',
    image: '/images/track-pant.jpg',
    description: 'A slim track pant cut sharp enough for the street. Four-way stretch for the studio or a run through Yoyogi Park, with matte side zips and a zip pocket for your Suica card.',
    colors: [
      { name: 'Black', hex: '#111317' },
      { name: 'Navy', hex: '#1d2433' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    stock: 70,
  },
  {
    id: 'ebisu-half-zip',
    name: 'Ebisu Half-Zip',
    tagline: 'Studio Layer',
    material: 'Brushed Technical Jersey',
    category: 'studio',
    price_cents: 12800,
    temp_range: '10°C to 22°C',
    image: '/images/half-zip.jpg',
    description: 'A brushed technical half-zip for the morning class and the coffee after it. Breathable, quick-drying and clean enough to keep on for the rest of the day.',
    colors: [
      { name: 'Black', hex: '#111317' },
      { name: 'Graphite', hex: '#37393d' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    stock: 55,
  },
  {
    id: 'daikanyama-overshirt',
    name: 'Daikanyama Overshirt',
    tagline: 'Shirt-Jacket',
    material: 'Brushed Cotton Twill',
    category: 'weekend',
    price_cents: 16800,
    temp_range: '12°C to 22°C',
    image: '/images/overshirt.jpg',
    description: 'A heavyweight brushed-twill overshirt that works as a shirt or a light jacket. Two chest pockets, horn buttons and a soft hand that gets better with every wash.',
    colors: [
      { name: 'Charcoal', hex: '#37393d' },
      { name: 'Olive Grey', hex: '#5d6150' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    stock: 45,
  },
  {
    id: 'nakameguro-loopwheel-hoodie',
    name: 'Nakameguro Loopwheel Hoodie',
    tagline: 'Heavyweight Fleece',
    material: 'Loopwheel Cotton, Wakayama',
    category: 'weekend',
    price_cents: 13800,
    temp_range: '8°C to 20°C',
    image: '/images/hoodie.jpg',
    description: 'Knitted slowly on vintage loopwheel machines in Wakayama, so the fleece stays soft and keeps its shape for years. The hoodie you will reach for every weekend.',
    colors: [
      { name: 'Heather Grey', hex: '#9a9a98' },
      { name: 'Black', hex: '#111317' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    stock: 65,
  },
  {
    id: 'kissa-heavyweight-tee',
    name: 'Kissa Heavyweight Tee',
    tagline: 'Everyday Tee',
    material: '7.5oz Japanese Cotton',
    category: 'weekend',
    price_cents: 5800,
    temp_range: '18°C to 32°C',
    image: '/images/tee.jpg',
    description: 'A boxy heavyweight tee in dense Japanese cotton that will not go see-through or lose its collar. Named for the kissaten coffee shops where it was worn in.',
    colors: [
      { name: 'Off-White', hex: '#ece8df' },
      { name: 'Black', hex: '#111317' },
      { name: 'Sumi Grey', hex: '#4a4b4d' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    stock: 120,
  },
  {
    id: 'okayama-selvedge-denim',
    name: 'Okayama Selvedge Denim',
    tagline: 'Straight Leg',
    material: '13.5oz Raw Selvedge, Okayama',
    category: 'weekend',
    price_cents: 18800,
    temp_range: 'All Seasons',
    image: '/images/selvedge-denim.jpg',
    description: 'Raw indigo selvedge woven on shuttle looms in Okayama, Japan\'s denim capital. A straight leg that fades to fit you, finished with a clean selvedge cuff.',
    colors: [
      { name: 'Raw Indigo', hex: '#1f2a44' },
      { name: 'Black', hex: '#111317' },
    ],
    sizes: ['28', '30', '32', '34', '36'],
    stock: 50,
  },
];

const fabrics = [
  {
    id: 'aero-merino-240',
    specimen: 'VEYA-TX-9902',
    metric: 'VAPOR PERMEABILITY: 28,000 G/M²/24H',
    focusTitle: 'Micro-filament Cross-section',
    focusText: 'Breathes on a packed rush-hour train and stays fresh into the evening.',
  },
  {
    id: 'city-shell',
    specimen: 'VEYA-TX-4417',
    metric: 'WATER REPELLENCY: 6 HR LIGHT RAIN',
    focusTitle: 'Dense Cotton-Nylon Weave',
    focusText: 'Fluorine-free water repellency woven into a fabric that still looks like a classic mac.',
  },
  {
    id: 'loopwheel-fleece',
    specimen: 'VEYA-TX-7731',
    metric: 'KNIT SPEED: 1 M PER HOUR',
    focusTitle: 'Tension-Free Loopwheel Knit',
    focusText: 'Knitted slowly in Wakayama so the fleece stays soft and holds its shape wash after wash.',
  },
];

// Hero "city telemetry" readouts for each environment pill.
const environments = {
  commute: { label: 'CITY TELEMETRY: TOKYO / SHIBUYA STATION', reading: '14°C PRECIP 60%', category: 'commute' },
  studio: { label: 'CITY TELEMETRY: TOKYO / EBISU STUDIO', reading: '21°C HUMIDITY 48%', category: 'studio' },
  weekend: { label: 'CITY TELEMETRY: TOKYO / NAKAMEGURO CANAL', reading: '19°C CLOUD 70%', category: 'weekend' },
};

const pages = {
  editorial: {
    title: 'Editorial',
    kicker: 'FIELD NOTES',
    body: [
      'First Train, Last Train — Eighteen hours in Tokyo, from a 6:40 Yamanote line commute to a late counter seat in Shimokitazawa, in one outfit.',
      'Made in Japan — Visiting the loopwheel knitters of Wakayama and the shuttle-loom denim mills of Okayama.',
      'The Five-Piece Week — How the commuter coat, pleated trouser, merino crew, overshirt and tee cover every day of a Tokyo week.',
    ],
  },
  'lab-documentation': {
    title: 'Fabric Lab Whitepaper',
    kicker: 'TACTILE ENGINEERING LAB',
    body: [
      'Aero-Merino 240: 17.5-micron merino wrapped around a micro-filament nylon core. Tensile strength +42% over standard wool. Vapor permeability 28,000 g/m²/24h.',
      'City Shell: dense Japanese cotton-nylon with a fluorine-free water-repellent finish. Holds off light rain for up to 6 hours and stays quiet when you move.',
      'Loopwheel Fleece: knitted on tension-free loopwheel machines in Wakayama at about one metre per hour, so it keeps its softness and shape for years.',
      'Every fabric is wear-tested for 30 days of daily commuting in Tokyo before release.',
    ],
  },
  sustainability: {
    title: 'Sustainability Manifesto',
    kicker: 'ECOSYSTEM',
    body: [
      'We produce in small batches with mills across Japan to avoid deadstock.',
      'Every water-repellent finish we use is fluorine-free, and 100% of our merino is mulesing-free and traceable to the farm.',
      'Garments carry a lifetime repair guarantee. Bring any VEYA piece to one of our stores and we will repair it at no cost.',
    ],
  },
  care: {
    title: 'Care & Maintenance',
    kicker: 'SUPPORT & CARE',
    body: [
      'Coat: machine wash cold on a gentle cycle. Tumble dry low for 20 minutes to refresh the water repellency.',
      'Merino: wash cold, lay flat to dry. Air it between wears; merino rarely needs washing.',
      'Loopwheel and tees: wash cold inside out and hang dry to keep their shape.',
      'Selvedge denim: wait as long as you can before the first wash, then wash cold inside out and hang dry.',
    ],
  },
  stores: {
    title: 'Store Locator',
    kicker: 'FLAGSHIP STORES',
    body: [
      'Tokyo / Shibuya Atelier — 1-2-3 Jinnan, Shibuya-ku. Open daily 11:00–20:00.',
      'Tokyo / Nakameguro Store — 1-10-23 Aobadai, Meguro-ku. Open daily 11:00–20:00.',
      'Osaka / Nakazakicho Studio — 1-6-18 Nakazakinishi, Kita-ku. Thu–Tue 12:00–19:00.',
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
