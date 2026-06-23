const resetDatabase = require('./dbReset');

module.exports = async (config) => {
  await resetDatabase();
};
