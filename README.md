# Omron FINS Data Extractor in JavaScript

A production-grade guide, toolkit, and reference implementation for connecting to **Omron PLCs** over the **FINS (Factory Interface Network Service)** protocol via UDP/IP, extracting high-precision telemetry, and polling momentary rising-edge triggers in Node.js.

Includes zero-dependency mathematical data decoders (IEEE-754 32-bit Big Endian Floats, BCD, DINT), a resilient connection client, an event-driven poller, and a **built-in UDP Mock PLC simulator** so you can develop and test without physical hardware.

---

## Features

- **Robust FINS Protocol Client**: Promise-based wrapper around `omron-fins` with timeouts, targeted discrete reading, and typed accessors.
- **IEEE-754 32-Bit Float Reconstruction**: Decodes 32-bit single-precision floats stored across 2 consecutive 16-bit words (LSW + MSW).
- **Industrial Momentary Trigger Polling**: High-efficiency poller that reacts **only to rising edges (`0 -> 1`)**, suppressing redundant sustained high (`1 -> 1`) and falling (`1 -> 0`) states.
- **Targeted Discrete Reads**: Avoids wasteful 12-word block reads by reading only the exact registers designated for an inspection station.
- **Zero-Hardware Mock PLC Simulator**: Standalone UDP server emulating an Omron CJ2/CS1 PLC on port 9600.
- **Complete Test Suite**: Unit tests for all decoder conversions and integration tests against the mock server.

---

## Table of Contents

1. [Understanding the FINS Protocol](#understanding-the-fins-protocol)
2. [Omron Memory Addressing & Data Types](#omron-memory-addressing--data-types)
3. [IEEE-754 Float Encoding in Omron Registers](#ieee-754-float-encoding-in-omron-registers)
4. [Installation & Quick Start](#installation--quick-start)
5. [Code Examples](#code-examples)
6. [Using the Built-In Mock PLC Simulator](#using-the-built-in-mock-plc-simulator)
7. [API Reference](#api-reference)
8. [Industrial Deployment & Troubleshooting](#industrial-deployment--troubleshooting)

---

## Understanding the FINS Protocol

FINS (Factory Interface Network Service) is Omron's proprietary command/response protocol used by CS, CJ, CP, and NX/NJ series PLCs over Ethernet (UDP port **9600** or TCP port **9600**).

### FINS Packet Structure (UDP)

```
+-----------------------------------------------------------------------+
| FINS Header (10 bytes)                                               |
+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+           |
| ICF | RSV | GCT | DNA | DA1 | DA2 | SNA | SA1 | SA2 | SID |           |
+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+           |
| Command Code (2 bytes): 0x0101 (Read) / 0x0102 (Write)                |
+-----------------------------------------------------------------------+
| Parameters: Memory Area Code | Start Address | Bit | Number of Items  |
+-----------------------------------------------------------------------+
```

- **ICF (Information Control Field)**: Defines command vs. response. `0x80` for command, `0xC0` for response.
- **DNA / DA1 / DA2**: Destination Network, Node, and Unit Address.
- **SNA / SA1 / SA2**: Source Network, Node, and Unit Address.
- **SID (Service ID)**: Transaction tracking byte matched in response frames.
- **Command Codes**:
  - `0101`: Memory Area Read
  - `0102`: Memory Area Write

---

## Omron Memory Addressing & Data Types

| Memory Area | Prefix | FINS Code | Description | Typical Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **Data Memory** | `D` | `0x82` | General non-volatile register storage | Sensor data, floats, recipes |
| **Core I/O** | `CIO` | `0xB0` | Physical inputs, outputs, internal flags | Sensors, solenoids, status |
| **Work Area** | `W` | `0xB1` | Internal work bits | Logic flags, step sequencers |
| **Holding Area**| `H` | `0xB2` | Retentive memory surviving power loss | Machine states, cycle counts |

---

## IEEE-754 Float Encoding in Omron Registers

In Omron PLCs, a 32-bit single-precision Float requires **2 consecutive 16-bit words**.

```
Register Dn     (Word 0) = Least Significant Word (LSW) -> Bits 0 to 15
Register Dn+1   (Word 1) = Most Significant Word (MSW)  -> Bits 16 to 31 (Sign, Exponent, Mantissa)
```

### Decoding in JavaScript

```javascript
const { wordsToFloatBE } = require('omron-fins-data-extractor').Decoder;

// Example: D100 = 0x6784, D101 = 0x3E74
const centering = wordsToFloatBE(0x6784, 0x3E74);
console.log(centering); // 0.238 mm
```

---

## Installation & Quick Start

```bash
# Clone the repository
git clone https://github.com/Jonathanchristianto/omron-fins-data-extractor.git
cd omron-fins-data-extractor

# Install dependencies
npm install

# Run automated tests
npm test
```

---

## Code Examples

### 1. Reading Raw 16-bit Words (`examples/01_read_words.js`)

```javascript
const { FinsClient } = require('omron-fins-data-extractor');

const client = new FinsClient({ host: '192.168.2.21', port: 9600 });

async function run() {
  // Read 4 words starting at D1
  const words = await client.readWords('D1', 4);
  console.log('D1-D4 values:', words);
  client.disconnect();
}
run();
```

### 2. Reading 32-bit Float Telemetry (`examples/02_read_float_telemetry.js`)

```javascript
const { FinsClient, Decoder } = require('omron-fins-data-extractor');

const client = new FinsClient({ host: '192.168.2.21', port: 9600 });

async function run() {
  // Option A: Direct helper
  const centering = await client.readFloat('D100');

  // Option B: Manual discrete read
  const [lsw, msw] = await client.readWords('D110', 2);
  const levelling = Decoder.wordsToFloatBE(lsw, msw);

  console.log(`Centering: ${centering.toFixed(3)} mm`);
  console.log(`Levelling: ${levelling.toFixed(3)} mm`);
  client.disconnect();
}
run();
```

### 3. Industrial Momentary Rising Edge Poller (`examples/03_rising_edge_trigger.js`)

```javascript
const { FinsClient, FinsPoller, Decoder } = require('omron-fins-data-extractor');

const client = new FinsClient({ host: '192.168.2.21', port: 9600 });
const poller = new FinsPoller(client, {
  triggerRegister: 'D1',
  triggerCount: 4,
  interval: 500
});

poller.on('rising-edge', async ({ registerOffset }) => {
  const station = registerOffset + 1;
  console.log(`[RISING EDGE 0 -> 1] Station ${station} Trigger!`);

  // Target read only the 2 specific registers for this station
  const baseReg = 100 + (station - 1) * 20; // S1=100, S2=120, S3=140, S4=160
  const [cenLsw, cenMsw] = await client.readWords(baseReg, 2);
  const [levLsw, levMsw] = await client.readWords(baseReg + 10, 2);

  const centering = Decoder.wordsToFloatBE(cenLsw, cenMsw);
  const levelling = Decoder.wordsToFloatBE(levLsw, levMsw);

  console.log(`Station ${station} Telemetry: Centering=${centering.toFixed(3)}mm, Levelling=${levelling.toFixed(3)}mm`);
});

poller.start();
```

---

## Using the Built-In Mock PLC Simulator

If you don't have physical Omron PLC hardware connected, run the built-in UDP mock simulator:

```bash
# In one terminal, start the mock PLC simulator:
npm run simulator

# In another terminal, run any example:
npm run example:float
npm run example:mock
```

---

## API Reference

### `FinsClient(options)`
- `options.host` *(string)*: PLC IP address.
- `options.port` *(number)*: FINS UDP port (default: 9600).
- `options.timeout` *(number)*: Read/write timeout in ms (default: 2000).
- `readWords(address, count, area)`: Returns `Promise<number[]>`.
- `writeWords(address, values, area)`: Returns `Promise<void>`.
- `readFloat(address, area)`: Returns `Promise<number>`.
- `writeFloat(address, value, area)`: Returns `Promise<void>`.
- `disconnect()`: Closes socket.

### `Decoder`
- `wordsToFloatBE(lsw, msw)`: 32-bit Float from 2 words.
- `floatToWordsBE(val)`: Encodes float to `[lsw, msw]`.
- `wordsToInt16(word)` / `int16ToWord(val)`: Signed 16-bit integer conversions.
- `wordsToBcd(word)` / `bcdToWord(val)`: 4-digit BCD conversions.
- `wordsToAscii(words)` / `asciiToWords(str)`: ASCII string conversions.

### `FinsPoller(client, options)`
- `options.triggerRegister` *(string|number)*: Start register to poll.
- `options.triggerCount` *(number)*: Number of consecutive registers to poll.
- `options.interval` *(number)*: Polling frequency in ms.
- Events: `'rising-edge'`, `'falling-edge'`, `'change'`, `'error'`.

---

## Industrial Deployment & Troubleshooting

1. **Subnet & IP Configuration**:
   - Ensure the machine running Node.js has an IP on the same physical subnet as the Omron PLC Ethernet module (e.g. PC: `192.168.2.100`, PLC: `192.168.2.21`).
2. **UDP Port 9600 Firewall**:
   - Omron FINS uses UDP port 9600. Ensure local firewalls (`ufw`, `iptables`, Windows Defender) allow outbound UDP to port 9600 and inbound UDP replies.
3. **FINS Node Address Alignment**:
   - By default, Omron Ethernet modules assign their FINS node address to match the last octet of the PLC's IP address (e.g., IP `192.168.2.21` -> Node `21`).

---

## License

MIT © [Jonathanchristianto](https://github.com/Jonathanchristianto)
