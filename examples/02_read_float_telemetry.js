/**
 * Example 02: IEEE-754 32-Bit Float Telemetry
 * Reads 32-bit single-precision floats stored across 2 consecutive registers.
 */

const { FinsClient } = require('../src/client');
const { wordsToFloatBE } = require('../src/decoder');

async function main() {
  const client = new FinsClient({ host: '127.0.0.1', port: 9600 });

  try {
    // Method A: Read using built-in client helper
    const centering = await client.readFloat('D100');
    console.log(`Centering (D100-D101): ${centering.toFixed(3)} mm`);

    // Method B: Manual discrete read of 2 words and decode
    const words = await client.readWords('D110', 2);
    const levelling = wordsToFloatBE(words[0], words[1]);
    console.log(`Levelling (D110-D111): ${levelling.toFixed(3)} mm (Raw words: [${words.join(', ')}])`);
  } catch (err) {
    console.error('Float read failed:', err.message);
  } finally {
    client.disconnect();
  }
}

main();
