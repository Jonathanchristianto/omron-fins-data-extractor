/**
 * Example 05: Complete End-to-End Demo with Mock PLC Simulator
 *
 * Runs fully standalone with ZERO physical hardware:
 * 1. Starts mock UDP FINS server on port 9600
 * 2. Injects telemetry values
 * 3. Connects client & poller
 * 4. Simulates physical PLC rising-edge trigger (0 -> 1)
 * 5. Extracts and decodes measurements
 */

const { MockFinsServer } = require('../simulator/mock_plc');
const { FinsClient } = require('../src/client');
const { FinsPoller } = require('../src/poller');
const { wordsToFloatBE } = require('../src/decoder');

async function main() {
  // 1. Start Mock PLC Server
  const plc = new MockFinsServer(9600);
  await plc.start();

  // Seed Station 1 initial telemetry in DM memory:
  // D1 = 0 (Trigger Idle)
  // D100-D101 = 0.284 mm (Centering)
  // D110-D111 = 0.214 mm (Levelling)
  plc.setDmWord(1, 0);
  plc.setDmFloat(100, 0.284);
  plc.setDmFloat(110, 0.214);
  console.log('[Demo] Mock PLC memory initialized.');

  // 2. Setup Client & Poller
  const client = new FinsClient({ host: '127.0.0.1', port: 9600 });
  const poller = new FinsPoller(client, { triggerRegister: 'D1', triggerCount: 1, interval: 300 });

  poller.on('rising-edge', async () => {
    console.log('\n>>> [EVENT] Station 1 Rising Edge (0 -> 1) Detected! <<<');
    const cenWords = await client.readWords('D100', 2);
    const levWords = await client.readWords('D110', 2);

    const cen = wordsToFloatBE(cenWords[0], cenWords[1]);
    const lev = wordsToFloatBE(levWords[0], levWords[1]);

    console.log(`[Extracted Telemetry] Station 1 Inspection Results:`);
    console.log(`  Centering: ${cen.toFixed(3)} mm`);
    console.log(`  Levelling: ${lev.toFixed(3)} mm`);

    // Clean shutdown of demo
    setTimeout(async () => {
      poller.stop();
      client.disconnect();
      await plc.close();
      console.log('\n[Demo] Completed successfully.');
    }, 500);
  });

  poller.start();
  console.log('[Demo] Poller active. Waiting 1 second before simulating trigger...');

  // 3. Simulate physical machine cycle triggering D1 (0 -> 1) after 1 second
  setTimeout(() => {
    console.log('[Demo] Simulating machine trigger: Setting D1 = 1');
    plc.setDmWord(1, 1);
  }, 1000);
}

main();
