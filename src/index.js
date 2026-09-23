/**
 * omron-fins-data-extractor
 *
 * Full-featured toolkit and reference for extracting and decoding Omron PLC telemetry in JavaScript.
 */

const { FinsClient, MemoryAreas } = require('./client');
const Decoder = require('./decoder');
const { FinsPoller } = require('./poller');

module.exports = {
  FinsClient,
  MemoryAreas,
  Decoder,
  FinsPoller
};
