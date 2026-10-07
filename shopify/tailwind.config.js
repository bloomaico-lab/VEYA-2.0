// Tailwind build for the Shopify theme: same tokens as the site, scanning the theme's files.
//   npm run build:theme   →   shopify/theme/assets/veya.css
const base = require('../tailwind.config.js');

module.exports = {
  ...base,
  content: [`${__dirname}/theme/**/*.liquid`, `${__dirname}/theme/assets/veya.js`],
};
