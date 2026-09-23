/**
 * mock_plc.js - Standalone Omron FINS UDP Mock Server
 *
 * Emulates an Omron CJ2/CS1 PLC speaking FINS over UDP on port 9600.
 * Supports:
 *   - Command 0101 (Memory Area Read)
 *   - Command 0102 (Memory Area Write)
 *   - In-memory DM (Data Memory) register array
 *
 * Allows full local testing without physical PLC hardware.
 */

const dgram = require('dgram');

class MockFinsServer {
  constructor(port = 9600) {
    this.port = port;
    this.server = dgram.createSocket('udp4');
    this.dm = new Uint16Array(10000); // 10,000 DM registers (D0 to D9999)
  }

  start() {
    return new Promise((resolve) => {
      this.server.on('message', (msg, rinfo) => {
        this.handlePacket(msg, rinfo);
      });

      this.server.bind(this.port, () => {
        console.log(`[Mock PLC] Omron FINS Simulator listening on UDP port ${this.port}`);
        resolve();
      });
    });
  }

  handlePacket(msg, rinfo) {
    // Basic FINS Frame Header length is 10 bytes:
    // [0] ICF, [1] RSV, [2] GCT, [3] DNA, [4] DA1, [5] DA2, [6] SNA, [7] SA1, [8] SA2, [9] SID
    if (msg.length < 12) return;

    const icf = msg[0];
    const sid = msg[9];
    const cmdMain = msg[10];
    const cmdSub = msg[11];

    // Response header (invert SA and DA)
    const respHeader = Buffer.alloc(10);
    respHeader[0] = 0xC0; // Response ICF (bit 6 = 1)
    respHeader[1] = 0x00; // RSV
    respHeader[2] = msg[2]; // GCT
    respHeader[3] = msg[6]; // DNA (from SNA)
    respHeader[4] = msg[7]; // DA1 (from SA1)
    respHeader[5] = msg[8]; // DA2 (from SA2)
    respHeader[6] = msg[3]; // SNA (from DNA)
    respHeader[7] = msg[4]; // SA1 (from DA1)
    respHeader[8] = msg[5]; // SA2 (from DA2)
    respHeader[9] = sid;    // Matching SID

    // 0101: Memory Area Read
    if (cmdMain === 0x01 && cmdSub === 0x01) {
      const area = msg[12];
      const startAddr = msg.readUInt16BE(13);
      const count = msg.readUInt16BE(16);

      const resp = Buffer.alloc(14 + count * 2);
      respHeader.copy(resp, 0);
      resp[10] = 0x01; // Main Cmd
      resp[11] = 0x01; // Sub Cmd
      resp[12] = 0x00; // MRES (0x00 = Normal completion)
      resp[13] = 0x00; // SRES

      for (let i = 0; i < count; i++) {
        const val = this.dm[startAddr + i] || 0;
        resp.writeUInt16BE(val, 14 + i * 2);
      }

      this.server.send(resp, rinfo.port, rinfo.address);
      return;
    }

    // 0102: Memory Area Write
    if (cmdMain === 0x01 && cmdSub === 0x02) {
      const area = msg[12];
      const startAddr = msg.readUInt16BE(13);
      const count = msg.readUInt16BE(16);

      for (let i = 0; i < count; i++) {
        const val = msg.readUInt16BE(18 + i * 2);
        this.dm[startAddr + i] = val;
      }

      const resp = Buffer.alloc(14);
      respHeader.copy(resp, 0);
      resp[10] = 0x01;
      resp[11] = 0x02;
      resp[12] = 0x00; // Normal
      resp[13] = 0x00;

      this.server.send(resp, rinfo.port, rinfo.address);
      return;
    }
  }

  setDmWord(addr, val) {
    this.dm[addr] = val & 0xffff;
  }

  setDmFloat(addr, floatVal) {
    const buf = Buffer.alloc(4);
    buf.writeFloatBE(floatVal, 0);
    const msw = buf.readUInt16BE(0);
    const lsw = buf.readUInt16BE(2);
    this.dm[addr] = lsw;
    this.dm[addr + 1] = msw;
  }

  getDmWord(addr) {
    return this.dm[addr];
  }

  close() {
    return new Promise((resolve) => {
      this.server.close(resolve);
    });
  }
}

// Runnable directly via command line
if (require.main === module) {
  const server = new MockFinsServer(9600);
  server.start().then(() => {
    // Populate some default DM registers
    server.setDmWord(1, 1);        // D1 = 1 (Trigger active)
    server.setDmFloat(100, 14.25); // D100/D101 = 14.250 mm (Centering)
    server.setDmFloat(110, 25.50); // D110/D111 = 25.500 mm (Levelling)
    console.log('[Mock PLC] Initialized D1=1, D100=14.250mm, D110=25.500mm');
  });
}

module.exports = {
  MockFinsServer
};
