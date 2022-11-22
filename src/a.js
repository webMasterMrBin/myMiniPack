const a1 = require('./a1.js');

const a2 = require('./a2.js');

console.log('this is a file', 'a1 & a2', a1, a2);

module.exports = {
  a1,
  a2,
};
