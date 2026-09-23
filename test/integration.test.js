/**
 * integration.test.js - Integration Tests against Mock FINS Server
 */

const assert = require('assert');
const { MockFinsServer } = require('../simulator/mock_plc');
const { FinsClient } = require('../src/client');
const { FinsPoller } = require('../src/poller');

(async () => {
  console.log('--- Running FINS Mock Server Integration Tests ---');

  const testPort = 9605;
  const plc = new MockFinsServer(testPort);
  await plc.start();

  const client = new FinsClient({
    host: '127.0.0.1',
    port: testPort,
    timeout: 1000
  });

  try {
    // 1. Word Write and Read
    await client.writeWords(50, [111, 222, 333]);
    const words = await client.readWords(50, 3);
    assert.deepStrictEqual(words, [111, 222, 333]);
    console.log('✓ Memory Area Read (0101) & Write (0102) verified.');

    // 2. Float Write and Read
    await client.writeFloat(100, 24.891);
    const floatVal = await client.readFloat(100);
    assert(Math.abs(floatVal - 24.891) < 0.001, `Float mismatch: ${floatVal}`);
    console.log('✓ 32-bit Float write and readback verified.');

    // 3. Poller Rising-Edge Detection
    plc.setDmWord(1, 0); // Start at 0
    const poller = new FinsPoller(client, { triggerRegister: 1, triggerCount: 1, interval: 100 });

    let triggered = false;
    poller.on('rising-edge', () => {
      triggered = true;
    });

    poller.start();

    // Transition 0 -> 1 after 150ms
    setTimeout(() => {
      plc.setDmWord(1, 1);
    }, 150);

    // Wait 400ms for poller to catch transition
    await new Promise(r => setTimeout(r, 400));
    poller.stop();

    assert.strictEqual(triggered, true, 'Poller should have detected rising edge');
    console.log('✓ Momentary rising-edge polling verified.');

  } finally {
    client.disconnect();
    await plc.close();
  }

  console.log('\nAll Integration tests passed successfully!');
  process.exit(0);
})();
