# omron-fins-data-extractor

Node.js utilities for reading, writing, and polling Omron PLCs over FINS (UDP).

The underlying `omron-fins` package only handles raw 16-bit words. This library adds:
- **32-bit float decoding** that accounts for Omron's LSW/MSW register layout.
- **Rising-edge trigger polling** (`0 -> 1` edge detection for inspection stations and handshakes).
- **Promise-based client** with timeouts and typed read/write helpers.
- **Built-in UDP mock PLC** for running tests and examples without physical hardware.

## The Omron Float Gotcha

In Omron PLCs (CJ, CS, CP series), 32-bit IEEE-754 floats occupy two consecutive 16-bit words, but the word order is swapped:

- **Word 0 (`Dn`):** Least Significant Word (LSW) - bits 0 to 15
- **Word 1 (`Dn+1`):** Most Significant Word (MSW) - bits 16 to 31

If you decode them as standard big-endian 32-bit data without swapping the words first, the values will be corrupted.

```javascript
const { Decoder } = require('omron-fins-data-extractor');

// D100 = 0x6784 (LSW), D101 = 0x3E74 (MSW) -> 0.238
const val = Decoder.wordsToFloatBE(0x6784, 0x3E74);
```

## Installation

```bash
npm install omron-fins-data-extractor
```

## Usage

### 1. Read Words and Floats

```javascript
const { FinsClient } = require('omron-fins-data-extractor');

const client = new FinsClient({ host: '192.168.2.21', port: 9600 });

async function run() {
  await client.connect();

  // Read 4 raw words starting at D1
  const words = await client.readWords('D1', 4);
  console.log('D1-D4:', words);

  // Read 32-bit float at D100 + D101
  const floatVal = await client.readFloat('D100');
  console.log('Float:', floatVal);

  client.disconnect();
}

run();
```

### 2. Poll for Rising-Edge Triggers

Polls trigger words (e.g. `D1`-`D4`) and emits events only when bits transition from `0 -> 1`. Sustained high values and falling edges are ignored.

```javascript
const { FinsClient, FinsPoller, Decoder } = require('omron-fins-data-extractor');

const client = new FinsClient({ host: '192.168.2.21' });
const poller = new FinsPoller(client, {
  triggerRegister: 'D1',
  triggerCount: 4,
  interval: 500 // ms
});

poller.on('rising-edge', async ({ registerOffset, address }) => {
  const station = registerOffset + 1;
  console.log(`Station ${station} triggered (register ${address})`);

  // Read only the registers needed for this station
  const baseReg = 100 + (station - 1) * 20;
  const [lsw, msw] = await client.readWords(baseReg, 2);
  const measurement = Decoder.wordsToFloatBE(lsw, msw);

  console.log(`Station ${station} value: ${measurement.toFixed(3)} mm`);
});

poller.start();
```

### 3. Standalone Decoders

```javascript
const { Decoder } = require('omron-fins-data-extractor');

// Float decoding / encoding
const val = Decoder.wordsToFloatBE(0x6784, 0x3E74); // 0.238
const [lsw, msw] = Decoder.floatToWordsBE(0.238);   // [0x6784, 0x3E74]

// Signed 16-bit integers
const signed = Decoder.wordsToInt16(0xFFFF);         // -1
const raw = Decoder.int16ToWord(-1);                 // 65535

// BCD and ASCII
const bcd = Decoder.wordsToBcd(0x1234);              // 1234
const str = Decoder.wordsToAscii([0x4142, 0x4344]);  // "ABCD"
```

## Testing Locally (No Hardware)

The repo includes a mock UDP server emulating an Omron CJ/CS PLC on port 9600:

```bash
# Terminal 1: run mock PLC
npm run simulator

# Terminal 2: run tests or examples
npm test
npm run example:float
npm run example:mock
```

## API Reference

### `new FinsClient(options)`
- `options.host` *(string)*: PLC IP address (default: `'127.0.0.1'`).
- `options.port` *(number)*: FINS UDP port (default: `9600`).
- `options.timeout` *(number)*: Timeout in ms (default: `2000`).
- `options.dna`, `options.da1`, `options.sa1` *(number)*: Network/node routing addresses.

**Methods:**
- `connect()`: Opens the UDP socket. Returns `Promise<FinsClient>`.
- `readWords(address, count, area?)`: Returns `Promise<number[]>`.
- `writeWords(address, values, area?)`: Returns `Promise<void>`.
- `readFloat(address, area?)`: Reads 2 words and decodes 32-bit float. Returns `Promise<number>`.
- `writeFloat(address, value, area?)`: Encodes float to 2 words and writes them. Returns `Promise<void>`.
- `disconnect()`: Closes socket.

### `Decoder`
- `wordsToFloatBE(lsw, msw)` / `floatToWordsBE(val)`: 32-bit float conversions.
- `wordsToInt16(word)` / `int16ToWord(val)`: Signed 16-bit integer conversions.
- `wordsToBcd(word)` / `bcdToWord(val)`: 4-digit BCD conversions.
- `wordsToAscii(words)` / `asciiToWords(str)`: ASCII string conversions.

### `new FinsPoller(client, options)`
- `options.triggerRegister` *(string|number)*: Starting register (default: `'D1'`).
- `options.triggerCount` *(number)*: Number of consecutive registers (default: `1`).
- `options.interval` *(number)*: Polling interval in ms (default: `500`).

**Events:**
- `'rising-edge'`: Emitted on `0 -> 1` transitions (`{ registerOffset, address, previousValue, currentValue }`).
- `'falling-edge'`: Emitted on `1 -> 0` transitions.
- `'change'`: Emitted on any value change.
- `'error'`: Emitted on network or read timeout errors.

## Network Notes

- **Port 9600 UDP:** FINS uses UDP 9600. Ensure local and OS firewalls allow outbound UDP 9600 and inbound responses.
- **FINS Node Address:** On Omron Ethernet units, the default FINS node address usually equals the last octet of the PLC's IP address (e.g. `192.168.2.21` -> Node `21`).
- **Subnet:** The host running Node.js must have an interface on the same physical subnet or a configured route to the PLC.

## License

MIT
