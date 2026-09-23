/**
 * Example 04: Writing Handshake Words & Floats to PLC
 */

const { FinsClient } = require('../src/client');

async function main() {
  const client = new FinsClient({ host: '127.0.0.1', port: 9600 });

  try {
    // 1. Write single 16-bit handshake word
    console.log('Writing Handshake Acknowledgment: D5 = 1');
    await client.writeWords('D5', [1]);

    // 2. Write 32-bit Float across 2 words
    console.log('Writing Calibration Baseline Float: D200 = 12.345 mm');
    await client.writeFloat('D200', 12.345);

    // 3. Read back to verify
    const readVal = await client.readFloat('D200');
    console.log(`Verified D200 Readback: ${readVal.toFixed(3)} mm`);
  } catch (err) {
    console.error('Write failed:', err.message);
  } finally {
    client.disconnect();
  }
}

main();
