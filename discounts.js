// Spin to win: the wheel's slices, how a spin is decided, and the discount maths the bag and
// checkout use. Every slice is a real deal; the bigger deals come up less often.
const crypto = require('node:crypto');

const CODE_DAYS = 14; // a code won on the wheel is valid for 14 days

// The deals. `code` is the shared code a Shopify store uses for the deal (create each one in
// Shopify admin → Discounts). The built-in store gives every winner their own single-use code
// that starts with it, e.g. SPIN15-7KQ2M.
const PRIZES = {
  pct10: { kind: 'percent', value: 10, title: '10% off your order', code: 'SPIN10' },
  pct15: { kind: 'percent', value: 15, title: '15% off your order', code: 'SPIN15' },
  pct20: { kind: 'percent', value: 20, title: '20% off your order', code: 'SPIN20' },
  pct25: { kind: 'percent', value: 25, title: '25% off your order', code: 'SPIN25' },
  usd5: { kind: 'amount', value: 500, title: '$5 off your order', code: 'TAKE5' },
  usd10: { kind: 'amount', value: 1000, min: 6000, title: '$10 off orders of $60 or more', code: 'TAKE10' },
  ship: { kind: 'free_shipping', value: 0, title: 'Free shipping on your order', code: 'SHIPFREE' },
};

// The wheel, clockwise from the pointer at the top. `weight` is the chance (out of 100) of
// landing on that slice; `style` is its colour (the two biggest deals stand out in blue and navy).
const SLICES = [
  { prize: 'pct10', big: '10%', small: 'OFF', weight: 15, style: 'cream' },
  { prize: 'ship', big: 'FREE', small: 'SHIPPING', weight: 18, style: 'sand' },
  { prize: 'pct15', big: '15%', small: 'OFF', weight: 16, style: 'cream' },
  { prize: 'usd5', big: '$5', small: 'OFF', weight: 14, style: 'sand' },
  { prize: 'pct20', big: '20%', small: 'OFF', weight: 8, style: 'blue' },
  { prize: 'pct10', big: '10%', small: 'OFF', weight: 15, style: 'sand' },
  { prize: 'usd10', big: '$10', small: 'OFF $60+', weight: 10, style: 'cream' },
  { prize: 'pct25', big: '25%', small: 'OFF', weight: 4, style: 'navy' },
];

// Index of the slice a spin lands on, chosen by weight. `random` returns a number in [0, 1).
function pickSlice(random = Math.random) {
  const total = SLICES.reduce((sum, s) => sum + s.weight, 0);
  let r = random() * total;
  for (let i = 0; i < SLICES.length; i += 1) {
    r -= SLICES[i].weight;
    if (r < 0) return i;
  }
  return SLICES.length - 1;
}

// A code nobody can guess: the deal's name plus five characters that can't be misread (no 0/O, 1/I/L).
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function uniqueCode(prizeId) {
  const suffix = [...crypto.randomBytes(5)].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
  return `${PRIZES[prizeId].code}-${suffix}`;
}

const normalizeCode = (code) => (typeof code === 'string' ? code.trim().toUpperCase().slice(0, 40) : '');
const dollars = (cents) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

// What a deal takes off a bag with this subtotal (cents). Codes with a minimum spend show what's
// still needed instead of a discount.
function evaluate(deal, subtotalCents) {
  const min = deal.min || 0;
  if (subtotalCents < min) {
    return { amount: 0, freeShipping: false, eligible: false, note: `Spend ${dollars(min)} or more to use this code.` };
  }
  if (deal.kind === 'percent') return { amount: Math.round((subtotalCents * deal.value) / 100), freeShipping: false, eligible: true };
  if (deal.kind === 'amount') return { amount: Math.min(deal.value, subtotalCents), freeShipping: false, eligible: true };
  return { amount: 0, freeShipping: true, eligible: true };
}

module.exports = {
  CODE_DAYS, PRIZES, SLICES, pickSlice, uniqueCode, normalizeCode, evaluate, dollars,
};
