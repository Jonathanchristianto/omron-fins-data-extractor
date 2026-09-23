/**
 * Example 01: Basic Word Reading
 * Reads raw 16-bit words from Omron Data Memory (DM).
 */

const { FinsClient } = require('../src/client');

async function main() {
  const client = new FinsClient({
    host: '127.0.0.1', // Change to physical PLC IP (e.g. 192.168.2.21)
    port: 9600,
    timeout: 2000
  });

  console.log('Connecting to Omron PLC at 127.0.0.1:9600...');

  try {
    // Read 5 consecutive 16-bit words starting at D10
    const words = await client.readWords('D10', 5);
    console.log('Successfully read D10 - D14:', words);

    words.forEach((val, i) => {
      console.log(`  D${10 + i}: ${val} (0x${val.toString(16).padStart(4, '0')})`);
    });
  } catch (err) {
    console.error('Read failed:', err.message);
  } finally {
    client.disconnect();
  }
}

main();
