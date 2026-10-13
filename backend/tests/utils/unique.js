// Utility to generate a unique suffix for test data
// Returns a short random string based on timestamp and random number
let counter = 0;
module.exports = function uniqueSuffix() {
  const now = Date.now();
  const rand = Math.floor(Math.random() * 1000000);
  counter++;
  return `${now}-${rand}-${counter}`;
};
