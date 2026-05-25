const { loadBinding } = require('@node-rs/helper')
const path = require('path')

const binding = loadBinding(__dirname, 'hermes-core', '@hermes/core')

module.exports = binding
