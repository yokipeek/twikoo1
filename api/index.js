const path = require('path')

// Load the built twikoo-vercel from local monorepo
const vercel = require(path.join(__dirname, '../packages/server-vercel/dist/index.js'))

module.exports = vercel.default ?? vercel
module.exports.default = module.exports