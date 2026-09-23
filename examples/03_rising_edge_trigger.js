/**
 * Example 03: Momentary Rising Edge Poller (0 -> 1)
 * Polls small trigger registers (D1-D4) and triggers reads only on 0 -> 1 transition.
 */

const { FinsClient } = require('../src/client');
const { FinsPoller } = require('../src/poller');

const client = new FinsClient({ host: '127.0.0.1', port: 9600 });

// Poll registers D1 to D4 every 500ms
const poller = new FinsPoller(client, {
  triggerRegister: 'D1',
  triggerCount: 4,
  interval: 500
});

poller.on('rising-edge', async ({ registerOffset }) => {
  const stationNum = registerOffset + 1;
  console.log(`[RISING EDGE 0 -> 1] Station ${stationNum} Triggered!`);

  // Target register maps
  const baseRegs = { 1: 100, 2: 120, 3: 140, 4: 160 };
  const base = baseRegs[stationNum];

  try {
    // Read only the specific 2 registers for this station (4 words total)
    const cenWords = await client.readWords(base, 2);
    const levWords = await client.readWords(base + 10, 2);

    const { wordsToFloatBE } = require('../src/decoder');
    const centering = wordsToFloatBE(cenWords[0], cenWords[1]);
    const levelling = wordsToFloatBE(levWords[0], levWords[1]);

    console.log(`Station ${stationNum} Inspection Telemetry:`);
    console.log(`  Centering: ${centering.toFixed(3)} mm`);
    console.log(`  Levelling: ${levelling.toFixed(3)} mm`);
  } catch (err) {
    console.error('Targeted discrete read failed:', err.message);
  }
});

poller.on('falling-edge', ({ registerOffset }) => {
  console.log(`[FALLING EDGE 1 -> 0] Station ${registerOffset + 1} trigger reset to idle.`);
});

console.log('Starting rising-edge trigger poller on D1-D4 (500ms cycle)...');
poller.start();

// Stop after 15 seconds
setTimeout(() => {
  poller.stop();
  client.disconnect();
  console.log('Poller stopped.');
}, 15000);
